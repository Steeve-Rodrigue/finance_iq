from datetime import date

import pytest
from httpx import AsyncClient

from tests.helpers import auth_header, signup_and_login


def _shift_months(d: date, months: int) -> date:
    total = d.year * 12 + (d.month - 1) + months
    year, month = divmod(total, 12)
    return date(year, month + 1, 1)


async def _create_category(client: AsyncClient, token: str, name: str, slug: str):
    resp = await client.post(
        "/categories/", json={"name": name, "slug": slug}, headers=auth_header(token)
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_bill(client: AsyncClient, token: str, name: str, **extra):
    body = {
        "name": name,
        "storage_key": f"s3://bucket/{name}.pdf",
        "file_hash": f"hash-{name}",
        **extra,
    }
    resp = await client.post("/bills/", json=body, headers=auth_header(token))
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _seed(client: AsyncClient, token: str) -> dict:
    current_month_start = date.today().replace(day=1)
    previous_month_start = _shift_months(current_month_start, -1)

    groceries = await _create_category(client, token, "Groceries", "groceries")
    autre = await _create_category(client, token, "Autre", "autre")
    unused = await _create_category(client, token, "Unused", "unused")

    await _create_bill(
        client,
        token,
        "groceries-current",
        total_amount="100.00",
        issue_date=current_month_start.isoformat(),
        category_id=groceries["id"],
    )
    await _create_bill(
        client,
        token,
        "groceries-previous",
        total_amount="50.00",
        issue_date=previous_month_start.isoformat(),
        category_id=groceries["id"],
    )
    await _create_bill(
        client,
        token,
        "autre-current",
        total_amount="30.00",
        issue_date=current_month_start.isoformat(),
        category_id=autre["id"],
    )
    await _create_bill(
        client,
        token,
        "uncategorized-current",
        total_amount="20.00",
        issue_date=current_month_start.isoformat(),
    )

    return {
        "groceries": groceries,
        "autre": autre,
        "unused": unused,
        "current_month_start": current_month_start,
        "previous_month_start": previous_month_start,
    }


async def test_categories_analytics_empty_state(client: AsyncClient) -> None:
    token = await signup_and_login(client, "cat-empty@example.com", "cat_empty")

    response = await client.get("/analytics/categories", headers=auth_header(token))
    assert response.status_code == 200
    body = response.json()

    assert body["kpis"]["total_categories"] == 0
    assert body["kpis"]["most_expensive_category_name"] is None
    assert body["kpis"]["uncategorized_bills_count"] == 0
    assert body["kpis"]["other_rate"] == "0"
    assert body["spend_by_category"] == []
    assert body["category_table"] == []


async def test_categories_kpis(client: AsyncClient) -> None:
    token = await signup_and_login(client, "cat-kpi@example.com", "cat_kpi")
    await _seed(client, token)

    body = (await client.get("/analytics/categories", headers=auth_header(token))).json()
    kpis = body["kpis"]

    assert kpis["total_categories"] == 3
    assert kpis["most_expensive_category_name"] == "Groceries"
    assert kpis["most_expensive_category_total"] == "150.00"
    assert kpis["uncategorized_bills_count"] == 1
    assert float(kpis["other_rate"]) == 25.0  # 1 "autre" bill of 4 total


async def test_categories_breakdowns_and_table(client: AsyncClient) -> None:
    token = await signup_and_login(client, "cat-breakdown@example.com", "cat_breakdown")
    data = await _seed(client, token)

    body = (await client.get("/analytics/categories", headers=auth_header(token))).json()

    spend = {c["category_name"]: c["total"] for c in body["spend_by_category"]}
    assert spend == {"Groceries": "150.00", "Autre": "30.00", "Uncategorized": "20.00"}

    counts = {c["category_name"]: c["bill_count"] for c in body["bill_count_by_category"]}
    assert counts == {"Groceries": 2, "Autre": 1, "Uncategorized": 1}

    table = {row["name"]: row for row in body["category_table"]}
    assert set(table.keys()) == {"Groceries", "Autre", "Unused"}

    groceries_row = table["Groceries"]
    assert groceries_row["category_id"] == data["groceries"]["id"]
    assert groceries_row["bill_count"] == 2
    assert groceries_row["total_spent"] == "150.00"
    assert float(groceries_row["avg_bill_amount"]) == 75.0  # Postgres AVG() isn't scale-limited
    assert float(groceries_row["pct_of_total_spend"]) == 75.0  # 150 / 200

    # A category with zero bills must still appear (LEFT JOIN), not be silently dropped.
    unused_row = table["Unused"]
    assert unused_row["bill_count"] == 0
    assert unused_row["total_spent"] == "0"
    assert float(unused_row["pct_of_total_spend"]) == 0.0


async def test_categories_trends_and_date_filter(client: AsyncClient) -> None:
    token = await signup_and_login(client, "cat-trend@example.com", "cat_trend")
    data = await _seed(client, token)

    body = (await client.get("/analytics/categories", headers=auth_header(token))).json()

    assert len(body["uncategorized_trend"]) == 1
    assert body["uncategorized_trend"][0]["count"] == 1
    assert body["uncategorized_trend"][0]["total"] == "20.00"

    by_period = {row["period"]: row for row in body["other_rate_trend"]}
    current_period = data["current_month_start"].isoformat()
    assert float(by_period[current_period]["other_rate"]) == pytest.approx(33.333, rel=1e-2)

    filtered = (
        await client.get(
            "/analytics/categories",
            params={"start_date": data["current_month_start"].isoformat()},
            headers=auth_header(token),
        )
    ).json()
    assert filtered["kpis"]["most_expensive_category_total"] == "100.00"  # groceries-current only
    assert filtered["kpis"]["uncategorized_bills_count"] == 1


async def test_categories_cross_user_isolation(client: AsyncClient) -> None:
    owner_token = await signup_and_login(client, "cat-a@example.com", "cat_a")
    other_token = await signup_and_login(client, "cat-b@example.com", "cat_b")

    await _create_category(client, owner_token, "Owner Only", "owner-only")

    other_body = (
        await client.get("/analytics/categories", headers=auth_header(other_token))
    ).json()
    assert other_body["kpis"]["total_categories"] == 0
    assert other_body["category_table"] == []

import uuid
from datetime import date

import pytest
from httpx import AsyncClient

from tests.helpers import auth_header, signup_and_login


def _shift_months(d: date, months: int) -> date:
    total = d.year * 12 + (d.month - 1) + months
    year, month = divmod(total, 12)
    return date(year, month + 1, 1)


async def _create_vendor(client: AsyncClient, token: str, name: str, key: str):
    resp = await client.post(
        "/vendors/", json={"name": name, "key": key}, headers=auth_header(token)
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


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
    month_before_previous_start = _shift_months(current_month_start, -2)

    landlord = await _create_vendor(client, token, "Landlord", "landlord")
    edf = await _create_vendor(client, token, "EDF", "edf")
    netflix = await _create_vendor(client, token, "Netflix", "netflix")
    misc = await _create_vendor(client, token, "Misc", "misc")
    empty = await _create_vendor(client, token, "Empty", "empty")
    utilities = await _create_category(client, token, "Utilities", "utilities")

    for label, issue_date in (
        ("current", current_month_start),
        ("previous", previous_month_start),
        ("before-previous", month_before_previous_start),
    ):
        await _create_bill(
            client,
            token,
            f"landlord-{label}",
            total_amount="1000.00",
            issue_date=issue_date.isoformat(),
            vendor_id=landlord["id"],
        )

    await _create_bill(
        client,
        token,
        "edf-current",
        total_amount="150.00",
        issue_date=current_month_start.isoformat(),
        vendor_id=edf["id"],
        category_id=utilities["id"],
    )
    await _create_bill(
        client,
        token,
        "edf-previous",
        total_amount="100.00",
        issue_date=previous_month_start.isoformat(),
        vendor_id=edf["id"],
        category_id=utilities["id"],
    )
    await _create_bill(
        client,
        token,
        "netflix-current",
        total_amount="20.00",
        issue_date=current_month_start.isoformat(),
        vendor_id=netflix["id"],
    )
    await _create_bill(
        client,
        token,
        "misc-current",
        total_amount="10.00",
        issue_date=current_month_start.isoformat(),
        vendor_id=misc["id"],
    )

    return {
        "landlord": landlord,
        "edf": edf,
        "netflix": netflix,
        "misc": misc,
        "empty": empty,
        "category": utilities,
        "current_month_start": current_month_start,
    }


async def test_vendors_analytics_empty_state(client: AsyncClient) -> None:
    token = await signup_and_login(client, "vendors-empty@example.com", "vendors_empty")

    response = await client.get("/analytics/vendors", headers=auth_header(token))
    assert response.status_code == 200
    body = response.json()

    assert body["kpis"]["total_vendors"] == 0
    assert body["kpis"]["top_vendor_name"] is None
    assert float(body["kpis"]["vendor_concentration_pct"]) == 0.0
    assert body["top_vendors_by_spend"] == []
    assert body["vendor_table"] == []
    assert body["recurring_vendors"] == []


async def test_vendors_kpis(client: AsyncClient) -> None:
    token = await signup_and_login(client, "vendors-kpi@example.com", "vendors_kpi")
    await _seed(client, token)

    body = (await client.get("/analytics/vendors", headers=auth_header(token))).json()
    kpis = body["kpis"]

    assert kpis["total_vendors"] == 5
    assert kpis["top_vendor_name"] == "Landlord"
    assert kpis["top_vendor_total"] == "3000.00"
    assert kpis["new_vendors_this_month"] == 5
    # top3 (3000 + 250 + 20) / grand total (3280) * 100
    assert float(kpis["vendor_concentration_pct"]) == pytest.approx(99.695, abs=0.01)


async def test_vendors_charts_and_table(client: AsyncClient) -> None:
    token = await signup_and_login(client, "vendors-charts@example.com", "vendors_charts")
    data = await _seed(client, token)

    body = (await client.get("/analytics/vendors", headers=auth_header(token))).json()

    by_spend = {v["vendor_name"]: v["total"] for v in body["top_vendors_by_spend"]}
    assert by_spend == {
        "Landlord": "3000.00",
        "EDF": "250.00",
        "Netflix": "20.00",
        "Misc": "10.00",
    }
    assert "Empty" not in by_spend  # zero bills, excluded from a "top" ranking

    by_frequency = {v["vendor_name"]: v["bill_count"] for v in body["top_vendors_by_frequency"]}
    assert by_frequency == {"Landlord": 3, "EDF": 2, "Netflix": 1, "Misc": 1}

    assert len(body["new_vendors_over_time"]) == 1
    assert body["new_vendors_over_time"][0]["count"] == 5
    assert body["new_vendors_over_time"][0]["period"] == data["current_month_start"].isoformat()

    table = {row["name"]: row for row in body["vendor_table"]}
    assert set(table.keys()) == {"Landlord", "EDF", "Netflix", "Misc", "Empty"}

    edf_row = table["EDF"]
    assert edf_row["bill_count"] == 2
    assert edf_row["total_spent"] == "250.00"
    assert edf_row["most_frequent_category"] == "Utilities"

    empty_row = table["Empty"]
    assert empty_row["bill_count"] == 0
    assert empty_row["total_spent"] == "0"
    assert empty_row["last_bill_date"] is None
    assert empty_row["most_frequent_category"] is None


async def test_vendors_table_filtered_excludes_unconcerned_vendors(client: AsyncClient) -> None:
    token = await signup_and_login(client, "vendors-table-filter@example.com", "vendors_filter")
    data = await _seed(client, token)

    # category_id filter: only EDF has bills in "Utilities" - Landlord/Netflix/Misc/Empty all
    # have zero bills matching the filter and must drop out of the table entirely, not show up
    # as zero-count rows the way the unfiltered table does (see test_vendors_charts_and_table).
    response = await client.get(
        "/analytics/vendors",
        params={"category_id": data["category"]["id"]},
        headers=auth_header(token),
    )
    assert response.status_code == 200
    table = {row["name"]: row for row in response.json()["vendor_table"]}
    assert set(table.keys()) == {"EDF"}
    assert table["EDF"]["bill_count"] == 2

    # date range filter: only bills from the current month are in range - EDF still qualifies
    # (edf-current), but Landlord/Netflix/Misc/Empty's other-month or zero bills don't.
    response = await client.get(
        "/analytics/vendors",
        params={
            "start_date": data["current_month_start"].isoformat(),
            "end_date": data["current_month_start"].isoformat(),
        },
        headers=auth_header(token),
    )
    assert response.status_code == 200
    table = {row["name"]: row for row in response.json()["vendor_table"]}
    assert set(table.keys()) == {"Landlord", "EDF", "Netflix", "Misc"}
    assert "Empty" not in table


async def test_vendors_recurring_detection(client: AsyncClient) -> None:
    token = await signup_and_login(client, "vendors-recurring@example.com", "vendors_recurring")
    await _seed(client, token)

    body = (await client.get("/analytics/vendors", headers=auth_header(token))).json()

    recurring_names = {r["vendor_name"] for r in body["recurring_vendors"]}
    assert "Landlord" in recurring_names
    assert "EDF" not in recurring_names  # only 2 distinct months, needs >= 3

    landlord_row = next(r for r in body["recurring_vendors"] if r["vendor_name"] == "Landlord")
    assert landlord_row["frequency"] == 3
    assert float(landlord_row["avg_amount"]) == 1000.0


async def test_vendor_detail(client: AsyncClient) -> None:
    token = await signup_and_login(client, "vendor-detail@example.com", "vendor_detail")
    vendor = await _create_vendor(client, token, "Detail Corp", "detail-corp")

    current_month_start = date.today().replace(day=1)
    previous_month_start = _shift_months(current_month_start, -1)

    bill_a = await _create_bill(
        client,
        token,
        "detail-a",
        total_amount="40.00",
        issue_date=current_month_start.isoformat(),
        vendor_id=vendor["id"],
    )
    bill_b = await _create_bill(
        client,
        token,
        "detail-b",
        total_amount="60.00",
        issue_date=previous_month_start.isoformat(),
        vendor_id=vendor["id"],
    )

    response = await client.get(f"/analytics/vendors/{vendor['id']}", headers=auth_header(token))
    assert response.status_code == 200
    body = response.json()

    assert body["name"] == "Detail Corp"
    assert body["total_spent"] == "100.00"
    assert body["bill_count"] == 2
    assert len(body["spending_trend"]) == 2

    bill_ids = {row["bill_id"] for row in body["bills_history"]}
    assert bill_ids == {bill_a["id"], bill_b["id"]}


async def test_vendor_detail_not_found(client: AsyncClient) -> None:
    token = await signup_and_login(client, "vendor-404@example.com", "vendor_404")

    response = await client.get(f"/analytics/vendors/{uuid.uuid4()}", headers=auth_header(token))
    assert response.status_code == 404


async def test_vendor_detail_cross_user_isolation(client: AsyncClient) -> None:
    owner_token = await signup_and_login(client, "vendor-a@example.com", "vendor_a")
    other_token = await signup_and_login(client, "vendor-b@example.com", "vendor_b")

    vendor = await _create_vendor(client, owner_token, "Owner Vendor", "owner-vendor")

    response = await client.get(
        f"/analytics/vendors/{vendor['id']}", headers=auth_header(other_token)
    )
    assert response.status_code == 404

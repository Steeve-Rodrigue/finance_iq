from datetime import date

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


async def _create_line_item(client: AsyncClient, token: str, bill_id: str, **extra):
    resp = await client.post(
        f"/bills/{bill_id}/line-items/", json=extra, headers=auth_header(token)
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _seed(client: AsyncClient, token: str) -> dict:
    current_month_start = date.today().replace(day=1)
    previous_month_start = _shift_months(current_month_start, -1)

    grocer = await _create_vendor(client, token, "Grocer", "grocer")
    snacks = await _create_category(client, token, "Snacks", "snacks")

    bill1 = await _create_bill(
        client, token, "bill1", vendor_id=grocer["id"], issue_date=current_month_start.isoformat()
    )
    bill2 = await _create_bill(
        client, token, "bill2", vendor_id=grocer["id"], issue_date=previous_month_start.isoformat()
    )
    bill3 = await _create_bill(client, token, "bill3", issue_date=current_month_start.isoformat())

    rice_1 = await _create_line_item(
        client,
        token,
        bill1["id"],
        description="ST ELOI RIZ",
        common_name="Rice",
        quantity="2",
        unit_price="3.00",
        line_total="6.00",
        category_id=snacks["id"],
    )
    milk = await _create_line_item(
        client,
        token,
        bill1["id"],
        description="LAIT 1L",
        common_name="Milk",
        quantity="1",
        unit_price="2.00",
        line_total="2.00",
    )
    rice_2 = await _create_line_item(
        client,
        token,
        bill2["id"],
        description="ST ELOI RIZ",
        common_name="Rice",
        quantity="1",
        unit_price="3.50",
        line_total="3.50",
        category_id=snacks["id"],
    )
    bread = await _create_line_item(
        client,
        token,
        bill3["id"],
        description="PAIN",
        common_name="Bread",
        quantity="1",
        unit_price="1.50",
        line_total="1.50",
    )

    return {
        "grocer": grocer,
        "snacks": snacks,
        "bill1": bill1,
        "bill2": bill2,
        "bill3": bill3,
        "rice_1": rice_1,
        "milk": milk,
        "rice_2": rice_2,
        "bread": bread,
        "current_month_start": current_month_start,
        "previous_month_start": previous_month_start,
    }


async def test_line_items_analytics_empty_state(client: AsyncClient) -> None:
    token = await signup_and_login(client, "li-empty@example.com", "li_empty")

    response = await client.get("/analytics/line-items", headers=auth_header(token))
    assert response.status_code == 200
    body = response.json()

    assert body["kpis"]["total_line_items"] == 0
    assert body["kpis"]["most_purchased_item_name"] is None
    assert body["kpis"]["categorization_gap_pct"] == "0"
    assert body["most_frequent_items"] == []
    assert body["line_item_table"] == []


async def test_line_items_kpis(client: AsyncClient) -> None:
    token = await signup_and_login(client, "li-kpi@example.com", "li_kpi")
    await _seed(client, token)

    body = (await client.get("/analytics/line-items", headers=auth_header(token))).json()
    kpis = body["kpis"]

    assert kpis["total_line_items"] == 4
    assert kpis["most_purchased_item_name"] == "Rice"
    assert kpis["most_purchased_item_count"] == 2
    assert float(kpis["categorization_gap_pct"]) == 50.0  # milk + bread have no category


async def test_line_items_charts(client: AsyncClient) -> None:
    token = await signup_and_login(client, "li-charts@example.com", "li_charts")
    data = await _seed(client, token)

    body = (await client.get("/analytics/line-items", headers=auth_header(token))).json()

    frequent = {i["common_name"]: i["count"] for i in body["most_frequent_items"]}
    assert frequent == {"Rice": 2, "Milk": 1, "Bread": 1}

    by_spend = {i["common_name"]: i["total"] for i in body["top_items_by_spend"]}
    assert by_spend == {"Rice": "9.50", "Milk": "2.00", "Bread": "1.50"}

    rice_trend = [p for p in body["unit_price_trend"] if p["common_name"] == "Rice"]
    assert len(rice_trend) == 2
    prices = {p["period"]: float(p["avg_unit_price"]) for p in rice_trend}
    assert prices == {
        data["current_month_start"].isoformat(): 3.00,
        data["previous_month_start"].isoformat(): 3.50,
    }


async def test_line_items_table_and_filters(client: AsyncClient) -> None:
    token = await signup_and_login(client, "li-table@example.com", "li_table")
    data = await _seed(client, token)

    unfiltered = (await client.get("/analytics/line-items", headers=auth_header(token))).json()
    assert len(unfiltered["line_item_table"]) == 4

    by_vendor = (
        await client.get(
            "/analytics/line-items",
            params={"vendor_id": data["grocer"]["id"]},
            headers=auth_header(token),
        )
    ).json()
    vendor_names = {row["description"] for row in by_vendor["line_item_table"]}
    assert vendor_names == {"ST ELOI RIZ", "LAIT 1L"}  # bill1 + bill2's items, not bill3's

    by_category = (
        await client.get(
            "/analytics/line-items",
            params={"category_id": data["snacks"]["id"]},
            headers=auth_header(token),
        )
    ).json()
    assert len(by_category["line_item_table"]) == 2
    assert all(row["category_name"] == "Snacks" for row in by_category["line_item_table"])

    row_by_id = {row["line_item_id"]: row for row in unfiltered["line_item_table"]}
    rice_row = row_by_id[data["rice_1"]["id"]]
    assert rice_row["bill_name"] == "bill1"
    assert rice_row["vendor_name"] == "Grocer"
    assert rice_row["common_name"] == "Rice"
    assert rice_row["line_total"] == "6.00"


async def test_line_items_cross_user_isolation(client: AsyncClient) -> None:
    owner_token = await signup_and_login(client, "li-a@example.com", "li_a")
    other_token = await signup_and_login(client, "li-b@example.com", "li_b")

    bill = await _create_bill(client, owner_token, "owner-bill")
    await _create_line_item(
        client, owner_token, bill["id"], description="Owner item", line_total="10.00"
    )

    other_body = (
        await client.get("/analytics/line-items", headers=auth_header(other_token))
    ).json()
    assert other_body["kpis"]["total_line_items"] == 0
    assert other_body["line_item_table"] == []

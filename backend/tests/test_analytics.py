from datetime import date

from httpx import AsyncClient

from tests.helpers import auth_header, signup_and_login


def _shift_months(d: date, months: int) -> date:
    total = d.year * 12 + (d.month - 1) + months
    year, month = divmod(total, 12)
    return date(year, month + 1, 1)


async def _create_bill(client: AsyncClient, token: str, name: str, **extra):
    body = {
        "name": name,
        "storage_key": f"s3://bucket/{name}.pdf",
        "file_hash": f"hash-{name}",
        **extra,
    }
    response = await client.post("/bills/", json=body, headers=auth_header(token))
    assert response.status_code == 201, response.text
    return response.json()


async def test_overview_empty_state(client: AsyncClient) -> None:
    token = await signup_and_login(client, "analytics-empty@example.com", "analytics_empty")

    response = await client.get("/analytics/overview", headers=auth_header(token))
    assert response.status_code == 200
    body = response.json()

    assert body["kpis"]["total_spent_current_month"] == "0"
    assert body["kpis"]["total_spent_previous_month"] == "0"
    assert body["kpis"]["spend_delta_pct"] is None
    assert body["kpis"]["bills_processed_current_month"] == 0
    assert body["kpis"]["pending_elicitations"] == 0
    assert body["kpis"]["auto_resolved_rate"] == "0"
    assert body["spending_trend"] == []
    assert body["top_vendors"] == []
    assert body["spending_by_category"] == []
    assert body["recent_uploads"] == []
    assert body["pending_questions"] == []


async def test_overview_kpis_and_charts(client: AsyncClient) -> None:
    token = await signup_and_login(client, "analytics-owner@example.com", "analytics_owner")

    current_month_start = date.today().replace(day=1)
    previous_month_start = _shift_months(current_month_start, -1)
    month_before_previous_start = _shift_months(current_month_start, -2)

    vendor_acme = (
        await client.post(
            "/vendors/", json={"name": "Acme", "key": "acme"}, headers=auth_header(token)
        )
    ).json()
    vendor_bravo = (
        await client.post(
            "/vendors/", json={"name": "Bravo", "key": "bravo"}, headers=auth_header(token)
        )
    ).json()
    category_groceries = (
        await client.post(
            "/categories/",
            json={"name": "Courses", "slug": "courses"},
            headers=auth_header(token),
        )
    ).json()

    await _create_bill(
        client,
        token,
        "current-1",
        total_amount="100.00",
        issue_date=current_month_start.isoformat(),
        vendor_id=vendor_acme["id"],
        category_id=category_groceries["id"],
    )
    current_2 = await _create_bill(
        client,
        token,
        "current-2",
        total_amount="50.00",
        issue_date=current_month_start.isoformat(),
        vendor_id=vendor_acme["id"],
    )
    await _create_bill(
        client,
        token,
        "previous-1",
        total_amount="80.00",
        issue_date=previous_month_start.isoformat(),
        vendor_id=vendor_bravo["id"],
    )
    await _create_bill(
        client,
        token,
        "before-previous-1",
        total_amount="40.00",
        issue_date=month_before_previous_start.isoformat(),
    )

    elicitation_resp = await client.post(
        f"/bills/{current_2['id']}/elicitations/",
        json={"stage": "parsing", "question": "Is this a subscription?"},
        headers=auth_header(token),
    )
    assert elicitation_resp.status_code == 201

    response = await client.get("/analytics/overview", headers=auth_header(token))
    assert response.status_code == 200
    body = response.json()

    kpis = body["kpis"]
    assert kpis["total_spent_current_month"] == "150.00"
    assert kpis["total_spent_previous_month"] == "80.00"
    assert float(kpis["spend_delta_pct"]) == 100.0  # (80 - 40) / 40 * 100
    # Only current-1 and current-2 have an issue_date in the current month - previous-1 and
    # before-previous-1 were all created "now" (created_at) but issue-dated in earlier
    # months, so they must not count here.
    assert kpis["bills_processed_current_month"] == 2
    assert kpis["pending_elicitations"] == 1
    assert float(kpis["auto_resolved_rate"]) == 75.0  # 3 of 4 bills have no elicitation

    # top_vendors is scoped to the "courses" (groceries) category - only current-1 (Acme,
    # category=courses) qualifies. current-2 (also Acme) has no category and previous-1
    # (Bravo) has no category either, so neither counts despite having real spend.
    top_vendors = {v["vendor_name"]: v["total"] for v in body["top_vendors"]}
    assert top_vendors == {"Acme": "100.00"}

    by_category = {c["category_name"]: c["total"] for c in body["spending_by_category"]}
    assert by_category["Groceries"] == "100.00"
    assert by_category["Uncategorized"] == "170.00"

    recent_names = {u["name"] for u in body["recent_uploads"]}
    assert recent_names == {"current-1", "current-2", "previous-1", "before-previous-1"}

    assert len(body["pending_questions"]) == 1
    pending = body["pending_questions"][0]
    assert pending["bill_id"] == current_2["id"]
    assert pending["bill_name"] == "current-2"
    assert pending["vendor_name"] == "Acme"
    assert pending["question"] == "Is this a subscription?"


async def test_overview_cross_user_isolation(client: AsyncClient) -> None:
    owner_token = await signup_and_login(client, "analytics-a@example.com", "analytics_a")
    other_token = await signup_and_login(client, "analytics-b@example.com", "analytics_b")

    await _create_bill(client, owner_token, "owner-bill", total_amount="500.00")

    other_response = await client.get("/analytics/overview", headers=auth_header(other_token))
    assert other_response.status_code == 200
    other_body = other_response.json()
    assert other_body["kpis"]["total_spent_current_month"] == "0"
    assert other_body["recent_uploads"] == []


async def test_overview_rejects_invalid_granularity(client: AsyncClient) -> None:
    token = await signup_and_login(client, "analytics-gran@example.com", "analytics_gran")

    response = await client.get(
        "/analytics/overview", params={"granularity": "fortnight"}, headers=auth_header(token)
    )
    assert response.status_code == 422

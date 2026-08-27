from datetime import date, timedelta
from decimal import Decimal

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


async def _seed_rich_dataset(client: AsyncClient, token: str) -> dict:
    current_month_start = date.today().replace(day=1)
    previous_month_start = _shift_months(current_month_start, -1)
    month_before_previous_start = _shift_months(current_month_start, -2)

    edf = await _create_vendor(client, token, "EDF", "edf")
    netflix = await _create_vendor(client, token, "Netflix", "netflix")
    oneoff = await _create_vendor(client, token, "OneOff", "oneoff")
    utilities = await _create_category(client, token, "Utilities", "utilities")

    edf_current = await _create_bill(
        client,
        token,
        "edf-current",
        total_amount="100.00",
        issue_date=current_month_start.isoformat(),
        vendor_id=edf["id"],
        category_id=utilities["id"],
        payment_status="unpaid",
    )
    await _create_bill(
        client,
        token,
        "edf-previous",
        total_amount="100.00",
        issue_date=previous_month_start.isoformat(),
        vendor_id=edf["id"],
        category_id=utilities["id"],
        payment_status="unpaid",
    )
    edf_spike = await _create_bill(
        client,
        token,
        "edf-spike",
        total_amount="400.00",
        issue_date=month_before_previous_start.isoformat(),
        vendor_id=edf["id"],
        category_id=utilities["id"],
        payment_status="unpaid",
    )

    await _create_bill(
        client,
        token,
        "netflix-current",
        total_amount="15.00",
        issue_date=current_month_start.isoformat(),
        vendor_id=netflix["id"],
        payment_status="unpaid",
    )
    await _create_bill(
        client,
        token,
        "netflix-previous",
        total_amount="15.00",
        issue_date=previous_month_start.isoformat(),
        vendor_id=netflix["id"],
        payment_status="unpaid",
    )
    await _create_bill(
        client,
        token,
        "netflix-before-previous",
        total_amount="14.00",
        issue_date=month_before_previous_start.isoformat(),
        vendor_id=netflix["id"],
        payment_status="unpaid",
    )

    oneoff_bill = await _create_bill(
        client,
        token,
        "oneoff-current",
        total_amount="500.00",
        issue_date=current_month_start.isoformat(),
        vendor_id=oneoff["id"],
        payment_status="paid",
    )

    return {
        "vendors": {"edf": edf, "netflix": netflix, "oneoff": oneoff},
        "category": utilities,
        "edf_current": edf_current,
        "edf_spike": edf_spike,
        "oneoff_bill": oneoff_bill,
        "current_month_start": current_month_start,
        "previous_month_start": previous_month_start,
        "month_before_previous_start": month_before_previous_start,
    }


async def test_spend_analytics_empty_state(client: AsyncClient) -> None:
    token = await signup_and_login(client, "spend-empty@example.com", "spend_empty")

    response = await client.get("/analytics/spend", headers=auth_header(token))
    assert response.status_code == 200
    body = response.json()

    assert body["kpis"]["total_spent"] == "0"
    assert body["kpis"]["bills_count"] == 0
    assert body["kpis"]["highest_bill_amount"] is None
    assert body["kpis"]["highest_bill_vendor_name"] is None
    assert body["spending_trend"] == []
    assert body["recurring_bills"] == []
    assert body["outliers"] == []
    assert body["bill_size_distribution"] == []


async def test_spend_kpis_and_filters(client: AsyncClient) -> None:
    token = await signup_and_login(client, "spend-kpi@example.com", "spend_kpi")
    data = await _seed_rich_dataset(client, token)

    unfiltered = (await client.get("/analytics/spend", headers=auth_header(token))).json()
    assert unfiltered["kpis"]["total_spent"] == "1144.00"
    assert unfiltered["kpis"]["bills_count"] == 7
    assert unfiltered["kpis"]["highest_bill_amount"] == "500.00"
    assert unfiltered["kpis"]["highest_bill_vendor_name"] == "OneOff"

    by_category = (
        await client.get(
            "/analytics/spend",
            params={"category_id": data["category"]["id"]},
            headers=auth_header(token),
        )
    ).json()
    assert by_category["kpis"]["total_spent"] == "600.00"
    assert by_category["kpis"]["bills_count"] == 3
    assert by_category["kpis"]["highest_bill_amount"] == "400.00"

    by_vendor = (
        await client.get(
            "/analytics/spend",
            params={"vendor_id": data["vendors"]["netflix"]["id"]},
            headers=auth_header(token),
        )
    ).json()
    assert by_vendor["kpis"]["total_spent"] == "44.00"
    assert by_vendor["kpis"]["bills_count"] == 3

    by_date = (
        await client.get(
            "/analytics/spend",
            params={"start_date": data["current_month_start"].isoformat()},
            headers=auth_header(token),
        )
    ).json()
    assert by_date["kpis"]["total_spent"] == "615.00"
    assert by_date["kpis"]["bills_count"] == 3


async def test_vendor_evolution_respects_granularity(client: AsyncClient) -> None:
    token = await signup_and_login(client, "spend-vendor-evo@example.com", "spend_vendor_evo")
    edf = await _create_vendor(client, token, "EDF", "edf")
    today = date.today()
    yesterday = today - timedelta(days=1)

    await _create_bill(
        client,
        token,
        "edf-today",
        total_amount="30.00",
        issue_date=today.isoformat(),
        vendor_id=edf["id"],
    )
    await _create_bill(
        client,
        token,
        "edf-yesterday",
        total_amount="20.00",
        issue_date=yesterday.isoformat(),
        vendor_id=edf["id"],
    )

    monthly = (
        await client.get(
            "/analytics/spend", params={"granularity": "month"}, headers=auth_header(token)
        )
    ).json()
    edf_monthly = [p for p in monthly["vendor_evolution"] if p["vendor_name"] == "EDF"]
    assert {p["period"] for p in edf_monthly} == {today.replace(day=1).isoformat()}
    assert sum(Decimal(p["total"]) for p in edf_monthly) == Decimal("50.00")

    daily = (
        await client.get(
            "/analytics/spend", params={"granularity": "day"}, headers=auth_header(token)
        )
    ).json()
    edf_daily = {
        p["period"]: p["total"] for p in daily["vendor_evolution"] if p["vendor_name"] == "EDF"
    }
    assert edf_daily == {today.isoformat(): "30.00", yesterday.isoformat(): "20.00"}


async def test_spend_breakdowns(client: AsyncClient) -> None:
    token = await signup_and_login(client, "spend-breakdown@example.com", "spend_breakdown")
    await _seed_rich_dataset(client, token)

    body = (await client.get("/analytics/spend", headers=auth_header(token))).json()

    by_category = {c["category_name"]: c["total"] for c in body["spending_by_category"]}
    assert by_category["Utilities"] == "600.00"
    assert by_category["Uncategorized"] == "544.00"

    top_vendors = {v["vendor_name"]: v["total"] for v in body["top_vendors"]}
    assert top_vendors == {"EDF": "600.00", "OneOff": "500.00", "Netflix": "44.00"}

    payment_status = {p["payment_status"]: p["total"] for p in body["payment_status_breakdown"]}
    assert payment_status["unpaid"] == "644.00"
    assert payment_status["paid"] == "500.00"


async def test_spend_recurring_bills(client: AsyncClient) -> None:
    token = await signup_and_login(client, "spend-recurring@example.com", "spend_recurring")
    await _seed_rich_dataset(client, token)

    body = (await client.get("/analytics/spend", headers=auth_header(token))).json()

    recurring_names = {r["vendor_name"] for r in body["recurring_bills"]}
    assert "Netflix" in recurring_names
    assert "OneOff" not in recurring_names  # only 1 occurrence, not recurring
    assert "EDF" not in recurring_names  # 100/100/400 varies more than 10%

    netflix_row = next(r for r in body["recurring_bills"] if r["vendor_name"] == "Netflix")
    assert netflix_row["frequency"] == 3


async def test_spend_outliers(client: AsyncClient) -> None:
    token = await signup_and_login(client, "spend-outliers@example.com", "spend_outliers")
    data = await _seed_rich_dataset(client, token)

    body = (await client.get("/analytics/spend", headers=auth_header(token))).json()

    assert len(body["outliers"]) > 0
    top_outlier = body["outliers"][0]
    assert top_outlier["bill_id"] == data["edf_spike"]["id"]
    assert top_outlier["total_amount"] == "400.00"
    assert float(top_outlier["deviation_ratio"]) > 1.0


async def test_spend_month_over_month(client: AsyncClient) -> None:
    token = await signup_and_login(client, "spend-mom@example.com", "spend_mom")
    await _seed_rich_dataset(client, token)

    body = (await client.get("/analytics/spend", headers=auth_header(token))).json()

    by_vendor = {row["name"]: row for row in body["month_over_month_by_vendor"]}
    edf_row = by_vendor["EDF"]
    assert edf_row["current_month"] == "100.00"
    assert edf_row["previous_month"] == "100.00"
    assert float(edf_row["delta_pct"]) == 0.0

    by_category = {row["name"]: row for row in body["month_over_month_by_category"]}
    utilities_row = by_category["Utilities"]
    assert utilities_row["current_month"] == "100.00"
    assert utilities_row["previous_month"] == "100.00"


async def test_category_momentum_month_granularity(client: AsyncClient) -> None:
    token = await signup_and_login(client, "spend-momentum-month@example.com", "spend_momentum_m")
    data = await _seed_rich_dataset(client, token)

    body = (
        await client.get(
            "/analytics/spend/category-momentum",
            params={"granularity": "month"},
            headers=auth_header(token),
        )
    ).json()

    # Every distinct month present, not just the last two - Utilities has bills in all three
    # months seeded by _seed_rich_dataset (current, previous, month-before-previous).
    utilities_points = {
        p["period"]: p["total"] for p in body["points"] if p["category_name"] == "Utilities"
    }
    assert utilities_points == {
        data["current_month_start"].isoformat(): "100.00",
        data["previous_month_start"].isoformat(): "100.00",
        data["month_before_previous_start"].isoformat(): "400.00",
    }

    filtered = (
        await client.get(
            "/analytics/spend/category-momentum",
            params={"granularity": "month", "vendor_id": data["vendors"]["netflix"]["id"]},
            headers=auth_header(token),
        )
    ).json()
    filtered_names = {p["category_name"] for p in filtered["points"]}
    assert filtered_names == {"Uncategorized"}


async def test_category_momentum_day_granularity(client: AsyncClient) -> None:
    token = await signup_and_login(client, "spend-momentum-day@example.com", "spend_momentum_d")
    groceries = await _create_category(client, token, "Groceries", "groceries")
    today = date.today()
    two_days_ago = today - timedelta(days=2)

    await _create_bill(
        client,
        token,
        "groceries-today",
        total_amount="30.00",
        issue_date=today.isoformat(),
        category_id=groceries["id"],
    )
    await _create_bill(
        client,
        token,
        "groceries-two-days-ago",
        total_amount="20.00",
        issue_date=two_days_ago.isoformat(),
        category_id=groceries["id"],
    )

    body = (
        await client.get(
            "/analytics/spend/category-momentum",
            params={"granularity": "day"},
            headers=auth_header(token),
        )
    ).json()

    # Every distinct day present, including the gap day in between with no spend simply absent
    # (not zero-filled) - group_by naturally excludes empty combos.
    groceries_points = {
        p["period"]: p["total"] for p in body["points"] if p["category_name"] == "Groceries"
    }
    assert groceries_points == {
        today.isoformat(): "30.00",
        two_days_ago.isoformat(): "20.00",
    }


async def test_category_momentum_year_granularity(client: AsyncClient) -> None:
    token = await signup_and_login(client, "spend-momentum-year@example.com", "spend_momentum_y")
    groceries = await _create_category(client, token, "Groceries", "groceries")
    current_year_start = date(date.today().year, 1, 1)
    previous_year_start = date(date.today().year - 1, 1, 1)

    await _create_bill(
        client,
        token,
        "groceries-this-year",
        total_amount="120.00",
        issue_date=current_year_start.isoformat(),
        category_id=groceries["id"],
    )
    await _create_bill(
        client,
        token,
        "groceries-last-year",
        total_amount="80.00",
        issue_date=previous_year_start.isoformat(),
        category_id=groceries["id"],
    )

    body = (
        await client.get(
            "/analytics/spend/category-momentum",
            params={"granularity": "year"},
            headers=auth_header(token),
        )
    ).json()

    groceries_points = {
        p["period"]: p["total"] for p in body["points"] if p["category_name"] == "Groceries"
    }
    assert groceries_points == {
        current_year_start.isoformat(): "120.00",
        previous_year_start.isoformat(): "80.00",
    }


async def test_category_momentum_respects_date_range(client: AsyncClient) -> None:
    token = await signup_and_login(client, "spend-momentum-range@example.com", "spend_momentum_r")
    data = await _seed_rich_dataset(client, token)

    body = (
        await client.get(
            "/analytics/spend/category-momentum",
            params={
                "granularity": "month",
                "start_date": data["current_month_start"].isoformat(),
            },
            headers=auth_header(token),
        )
    ).json()

    periods = {p["period"] for p in body["points"]}
    assert periods == {data["current_month_start"].isoformat()}


async def test_category_momentum_rejects_invalid_granularity(client: AsyncClient) -> None:
    token = await signup_and_login(client, "spend-momentum-gran@example.com", "spend_momentum_g")

    response = await client.get(
        "/analytics/spend/category-momentum",
        params={"granularity": "fortnight"},
        headers=auth_header(token),
    )
    assert response.status_code == 422


async def test_category_momentum_cross_user_isolation(client: AsyncClient) -> None:
    owner_token = await signup_and_login(client, "spend-momentum-a@example.com", "spend_mom_a")
    other_token = await signup_and_login(client, "spend-momentum-b@example.com", "spend_mom_b")

    await _create_bill(client, owner_token, "owner-bill", total_amount="900.00")

    other_body = (
        await client.get("/analytics/spend/category-momentum", headers=auth_header(other_token))
    ).json()
    assert other_body["points"] == []


async def test_spend_heatmap_histogram_and_velocity_shape(client: AsyncClient) -> None:
    token = await signup_and_login(client, "spend-shapes@example.com", "spend_shapes")
    await _seed_rich_dataset(client, token)

    body = (await client.get("/analytics/spend", headers=auth_header(token))).json()

    assert len(body["spending_heatmap"]) > 0
    current_year = date.today().year
    for cell in body["spending_heatmap"]:
        assert date.fromisoformat(cell["date"]).year == current_year
        assert Decimal(cell["total"]) > 0

    assert len(body["bill_size_distribution"]) > 0
    total_bucketed = sum(b["count"] for b in body["bill_size_distribution"])
    assert total_bucketed == 7  # every bill with a total_amount lands in exactly one bucket

    assert len(body["spending_velocity"]) > 0
    assert all(p["day_of_month"] >= 1 for p in body["spending_velocity"])


async def test_spend_boxplot_five_number_summary(client: AsyncClient) -> None:
    token = await signup_and_login(client, "spend-boxplot@example.com", "spend_boxplot")
    month_start = date.today().replace(day=1)

    for amount in ["10.00", "20.00", "30.00", "40.00", "50.00"]:
        await _create_bill(
            client,
            token,
            f"boxplot-{amount}",
            total_amount=amount,
            issue_date=month_start.isoformat(),
        )

    body = (await client.get("/analytics/spend", headers=auth_header(token))).json()

    assert len(body["spending_boxplot"]) == 1
    stats = body["spending_boxplot"][0]
    assert stats["month"] == month_start.isoformat()
    assert stats["min"] == "10.00"
    assert stats["q1"] == "15.00"
    assert stats["median"] == "30.00"
    assert stats["q3"] == "45.00"
    assert stats["max"] == "50.00"


async def test_spend_analytics_cross_user_isolation(client: AsyncClient) -> None:
    owner_token = await signup_and_login(client, "spend-a@example.com", "spend_a")
    other_token = await signup_and_login(client, "spend-b@example.com", "spend_b")

    await _create_bill(client, owner_token, "owner-bill", total_amount="900.00")

    other_body = (await client.get("/analytics/spend", headers=auth_header(other_token))).json()
    assert other_body["kpis"]["total_spent"] == "0"
    assert other_body["outliers"] == []


async def test_spend_analytics_rejects_invalid_granularity(client: AsyncClient) -> None:
    token = await signup_and_login(client, "spend-gran@example.com", "spend_gran")

    response = await client.get(
        "/analytics/spend", params={"granularity": "fortnight"}, headers=auth_header(token)
    )
    assert response.status_code == 422

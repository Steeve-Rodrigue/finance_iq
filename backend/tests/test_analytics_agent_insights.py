import pytest
from httpx import AsyncClient

from tests.helpers import auth_header, signup_and_login


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
    groceries = await _create_category(client, token, "Groceries", "groceries")

    bill_a = await _create_bill(
        client,
        token,
        "bill-a",
        confidence="0.90",
        extraction_strategy="direct",
        current_stage="complete",
        category_id=groceries["id"],
    )
    bill_b = await _create_bill(
        client,
        token,
        "bill-b",
        confidence="0.60",
        extraction_strategy="ocr",
        current_stage="complete",
        category_id=groceries["id"],
    )
    bill_c = await _create_bill(
        client,
        token,
        "bill-c",
        confidence="0.30",
        extraction_strategy="ocr",
        current_stage="categorizing",
    )
    bill_d = await _create_bill(client, token, "bill-d", current_stage="uploaded")

    elicitation_resp = await client.post(
        f"/bills/{bill_b['id']}/elicitations/",
        json={"stage": "parsing", "question": "Is this correct?"},
        headers=auth_header(token),
    )
    assert elicitation_resp.status_code == 201

    return {"groceries": groceries, "a": bill_a, "b": bill_b, "c": bill_c, "d": bill_d}


async def test_agent_insights_empty_state(client: AsyncClient) -> None:
    token = await signup_and_login(client, "agent-empty@example.com", "agent_empty")

    response = await client.get("/analytics/agent-insights", headers=auth_header(token))
    assert response.status_code == 200
    body = response.json()

    assert body["kpis"]["avg_confidence"] is None
    assert body["kpis"]["auto_resolved_rate"] == "0"
    assert body["kpis"]["ocr_rate"] is None
    assert body["kpis"]["bills_in_backlog"] == 0
    # Fixed 10 buckets always render (like the stage funnel below), just all empty.
    assert len(body["confidence_distribution"]) == 10
    assert all(b["count"] == 0 for b in body["confidence_distribution"])
    assert all(step["count"] == 0 for step in body["current_stage_funnel"])


async def test_agent_insights_kpis(client: AsyncClient) -> None:
    token = await signup_and_login(client, "agent-kpi@example.com", "agent_kpi")
    await _seed(client, token)

    body = (await client.get("/analytics/agent-insights", headers=auth_header(token))).json()
    kpis = body["kpis"]

    assert float(kpis["avg_confidence"]) == pytest.approx(0.60)
    assert float(kpis["auto_resolved_rate"]) == 75.0  # 3 of 4 bills have no elicitation
    assert float(kpis["ocr_rate"]) == pytest.approx(66.667, abs=0.01)  # 2 of 3 parsed used ocr
    assert kpis["bills_in_backlog"] == 2  # categorizing + uploaded


async def test_agent_insights_confidence_by_category_and_strategy(client: AsyncClient) -> None:
    token = await signup_and_login(client, "agent-breakdown@example.com", "agent_breakdown")
    await _seed(client, token)

    body = (await client.get("/analytics/agent-insights", headers=auth_header(token))).json()

    by_category = {row["category_name"]: row for row in body["confidence_by_category"]}
    assert float(by_category["Groceries"]["avg_confidence"]) == 0.75
    assert by_category["Groceries"]["bill_count"] == 2
    assert float(by_category["Uncategorized"]["avg_confidence"]) == 0.30
    assert by_category["Uncategorized"]["bill_count"] == 2

    by_strategy = {
        row["extraction_strategy"]: row for row in body["extraction_strategy_effectiveness"]
    }
    assert float(by_strategy["direct"]["avg_confidence"]) == 0.90
    assert by_strategy["direct"]["bill_count"] == 1
    assert float(by_strategy["ocr"]["avg_confidence"]) == 0.45
    assert by_strategy["ocr"]["bill_count"] == 2
    assert by_strategy["unknown"]["avg_confidence"] is None
    assert by_strategy["unknown"]["bill_count"] == 1


async def test_agent_insights_stage_funnel_and_histogram(client: AsyncClient) -> None:
    token = await signup_and_login(client, "agent-funnel@example.com", "agent_funnel")
    await _seed(client, token)

    body = (await client.get("/analytics/agent-insights", headers=auth_header(token))).json()

    funnel = {step["stage"]: step["count"] for step in body["current_stage_funnel"]}
    assert funnel == {
        "uploaded": 1,
        "parsing": 0,
        "categorizing": 1,
        "auditing": 0,
        "complete": 2,
    }
    # Every stage must appear even with zero bills - it's a funnel, not a sparse breakdown.
    assert [s["stage"] for s in body["current_stage_funnel"]] == [
        "uploaded",
        "parsing",
        "categorizing",
        "auditing",
        "complete",
    ]

    total_bucketed = sum(b["count"] for b in body["confidence_distribution"])
    assert total_bucketed == 3  # bill-d has no confidence, excluded


async def test_agent_insights_cross_user_isolation(client: AsyncClient) -> None:
    owner_token = await signup_and_login(client, "agent-a@example.com", "agent_a")
    other_token = await signup_and_login(client, "agent-b@example.com", "agent_b")

    await _create_bill(client, owner_token, "owner-bill", confidence="0.99")

    other_body = (
        await client.get("/analytics/agent-insights", headers=auth_header(other_token))
    ).json()
    assert other_body["kpis"]["avg_confidence"] is None
    assert all(b["count"] == 0 for b in other_body["confidence_distribution"])

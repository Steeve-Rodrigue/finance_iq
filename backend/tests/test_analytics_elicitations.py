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


async def _create_elicitation(client: AsyncClient, token: str, bill_id: str, **extra):
    body = {"stage": "parsing", "question": "Is this correct?", **extra}
    resp = await client.post(
        f"/bills/{bill_id}/elicitations/", json=body, headers=auth_header(token)
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _seed(client: AsyncClient, token: str) -> dict:
    groceries = await _create_category(client, token, "Groceries", "groceries")

    bill_a = await _create_bill(
        client,
        token,
        "bill-a",
        total_amount="50.00",
        confidence="0.80",
        category_id=groceries["id"],
    )
    bill_b = await _create_bill(client, token, "bill-b", total_amount="20.00", confidence="0.40")
    bill_c = await _create_bill(client, token, "bill-c")

    pending = await _create_elicitation(
        client, token, bill_b["id"], stage="parsing", question="Which vendor is this?"
    )
    await _create_elicitation(client, token, bill_a["id"], stage="categorizing", status="answered")
    await _create_elicitation(client, token, bill_c["id"], stage="auditing", status="expired")

    return {"a": bill_a, "b": bill_b, "c": bill_c, "pending": pending}


async def test_elicitations_analytics_empty_state(client: AsyncClient) -> None:
    token = await signup_and_login(client, "elic-empty@example.com", "elic_empty")

    response = await client.get("/analytics/elicitations", headers=auth_header(token))
    assert response.status_code == 200
    body = response.json()

    assert body["kpis"]["pending_count"] == 0
    assert body["kpis"]["expiration_rate"] == "0"
    assert body["kpis"]["avg_confidence"] is None
    assert body["kpis"]["uncategorized_bills_count"] == 0
    assert body["pending_questions"] == []
    assert [s["stage"] for s in body["elicitations_by_stage"]] == [
        "parsing",
        "categorizing",
        "auditing",
    ]
    assert all(s["count"] == 0 for s in body["elicitations_by_stage"])


async def test_elicitations_kpis(client: AsyncClient) -> None:
    token = await signup_and_login(client, "elic-kpi@example.com", "elic_kpi")
    await _seed(client, token)

    body = (await client.get("/analytics/elicitations", headers=auth_header(token))).json()
    kpis = body["kpis"]

    assert kpis["pending_count"] == 1
    assert kpis["answered_count"] == 1
    assert kpis["expired_count"] == 1
    assert float(kpis["expiration_rate"]) == pytest.approx(33.333, abs=0.01)
    assert float(kpis["avg_confidence"]) == pytest.approx(0.60)  # avg(0.80, 0.40)
    assert kpis["uncategorized_bills_count"] == 2  # bill-b and bill-c


async def test_elicitations_by_stage_and_rate(client: AsyncClient) -> None:
    token = await signup_and_login(client, "elic-stage@example.com", "elic_stage")
    await _seed(client, token)

    body = (await client.get("/analytics/elicitations", headers=auth_header(token))).json()

    by_stage = {s["stage"]: s["count"] for s in body["elicitations_by_stage"]}
    assert by_stage == {"parsing": 1, "categorizing": 1, "auditing": 1}

    assert len(body["elicitation_rate_over_time"]) == 1
    assert body["elicitation_rate_over_time"][0]["count"] == 3


async def test_elicitations_pending_questions(client: AsyncClient) -> None:
    token = await signup_and_login(client, "elic-pending@example.com", "elic_pending")
    data = await _seed(client, token)

    body = (await client.get("/analytics/elicitations", headers=auth_header(token))).json()

    assert len(body["pending_questions"]) == 1
    pending = body["pending_questions"][0]
    assert pending["elicitation_id"] == data["pending"]["id"]
    assert pending["bill_id"] == data["b"]["id"]
    assert pending["bill_name"] == "bill-b"
    assert pending["amount"] == "20.00"
    assert pending["question"] == "Which vendor is this?"


async def test_elicitations_cross_user_isolation(client: AsyncClient) -> None:
    owner_token = await signup_and_login(client, "elic-a@example.com", "elic_a")
    other_token = await signup_and_login(client, "elic-b@example.com", "elic_b")

    bill = await _create_bill(client, owner_token, "owner-bill")
    await _create_elicitation(client, owner_token, bill["id"])

    other_body = (
        await client.get("/analytics/elicitations", headers=auth_header(other_token))
    ).json()
    assert other_body["kpis"]["pending_count"] == 0
    assert other_body["pending_questions"] == []

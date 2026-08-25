from httpx import AsyncClient

from tests.helpers import auth_header, signup_and_login


async def _create_bill(client: AsyncClient, token: str, name: str = "Phone bill"):
    return await client.post(
        "/bills/",
        json={"name": name, "storage_key": "s3://bucket/phone.pdf", "file_hash": "hash-phone-1"},
        headers=auth_header(token),
    )


async def _create_elicitation(
    client: AsyncClient,
    token: str,
    bill_id: str,
    stage: str = "parsing",
    question: str = "What is the due date?",
):
    return await client.post(
        f"/bills/{bill_id}/elicitations/",
        json={"stage": stage, "question": question},
        headers=auth_header(token),
    )


async def test_elicitation_crud_happy_path(client: AsyncClient) -> None:
    token = await signup_and_login(client, "elic-owner@example.com", "elic_owner")
    bill_id = (await _create_bill(client, token)).json()["id"]

    create_resp = await _create_elicitation(client, token, bill_id)
    assert create_resp.status_code == 201
    elicitation = create_resp.json()
    elicitation_id = elicitation["id"]
    assert elicitation["stage"] == "parsing"
    assert elicitation["status"] == "pending"

    get_resp = await client.get(
        f"/bills/{bill_id}/elicitations/{elicitation_id}", headers=auth_header(token)
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == elicitation_id

    list_resp = await client.get(f"/bills/{bill_id}/elicitations/", headers=auth_header(token))
    assert list_resp.status_code == 200
    assert any(e["id"] == elicitation_id for e in list_resp.json())

    update_resp = await client.patch(
        f"/bills/{bill_id}/elicitations/{elicitation_id}",
        json={"status": "answered", "answer": {"due_date": "2026-09-01"}},
        headers=auth_header(token),
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["status"] == "answered"

    delete_resp = await client.delete(
        f"/bills/{bill_id}/elicitations/{elicitation_id}", headers=auth_header(token)
    )
    assert delete_resp.status_code == 204

    missing_resp = await client.get(
        f"/bills/{bill_id}/elicitations/{elicitation_id}", headers=auth_header(token)
    )
    assert missing_resp.status_code == 404


async def test_elicitation_cross_user_isolation(client: AsyncClient) -> None:
    owner_token = await signup_and_login(client, "elic-a@example.com", "elic_a")
    other_token = await signup_and_login(client, "elic-b@example.com", "elic_b")

    bill_id = (await _create_bill(client, owner_token)).json()["id"]
    elicitation_id = (await _create_elicitation(client, owner_token, bill_id)).json()["id"]

    get_resp = await client.get(
        f"/bills/{bill_id}/elicitations/{elicitation_id}", headers=auth_header(other_token)
    )
    assert get_resp.status_code == 404

    update_resp = await client.patch(
        f"/bills/{bill_id}/elicitations/{elicitation_id}",
        json={"status": "expired"},
        headers=auth_header(other_token),
    )
    assert update_resp.status_code == 404

    delete_resp = await client.delete(
        f"/bills/{bill_id}/elicitations/{elicitation_id}", headers=auth_header(other_token)
    )
    assert delete_resp.status_code == 404


# --- Regression: blocker #1 --------------------------------------------------------------
# POST /bills/{bill_id}/elicitations with only the required fields used to 500 because
# `status` was dumped as explicit `None`, overriding the model's default for the NOT NULL
# column.
async def test_create_elicitation_with_only_required_fields_succeeds(client: AsyncClient) -> None:
    token = await signup_and_login(client, "elic-minimal@example.com", "elic_minimal")
    bill_id = (await _create_bill(client, token)).json()["id"]

    response = await _create_elicitation(client, token, bill_id)
    assert response.status_code == 201
    assert response.json()["status"] == "pending"


# --- Regression: blocker #3 --------------------------------------------------------------
# POST /bills/{bill_id}/elicitations used to succeed for a bill_id the caller doesn't own,
# as long as the bill existed for *someone*.
async def test_create_elicitation_on_other_users_bill_is_not_found(client: AsyncClient) -> None:
    owner_token = await signup_and_login(client, "elic-cross-a@example.com", "elic_cross_a")
    other_token = await signup_and_login(client, "elic-cross-b@example.com", "elic_cross_b")

    bill_id = (await _create_bill(client, owner_token)).json()["id"]

    response = await _create_elicitation(client, other_token, bill_id)
    assert response.status_code == 404

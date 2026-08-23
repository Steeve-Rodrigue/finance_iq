from httpx import AsyncClient

from tests.helpers import auth_header, signup_and_login


async def _create_bill(
    client: AsyncClient,
    token: str,
    name: str = "Electric bill",
    storage_key: str = "s3://bucket/electric.pdf",
    file_hash: str = "hash-electric-1",
    **extra,
):
    body = {"name": name, "storage_key": storage_key, "file_hash": file_hash, **extra}
    return await client.post("/bills/", json=body, headers=auth_header(token))


async def test_bill_crud_happy_path(client: AsyncClient) -> None:
    token = await signup_and_login(client, "bill-owner@example.com", "bill_owner")

    create_resp = await _create_bill(client, token)
    assert create_resp.status_code == 201
    bill = create_resp.json()
    bill_id = bill["id"]
    assert bill["name"] == "Electric bill"

    get_resp = await client.get(f"/bills/{bill_id}", headers=auth_header(token))
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == bill_id

    list_resp = await client.get("/bills/", headers=auth_header(token))
    assert list_resp.status_code == 200
    assert any(b["id"] == bill_id for b in list_resp.json())

    update_resp = await client.patch(
        f"/bills/{bill_id}", json={"name": "Electric bill (updated)"}, headers=auth_header(token)
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "Electric bill (updated)"

    delete_resp = await client.delete(f"/bills/{bill_id}", headers=auth_header(token))
    assert delete_resp.status_code == 204

    missing_resp = await client.get(f"/bills/{bill_id}", headers=auth_header(token))
    assert missing_resp.status_code == 404


async def test_bill_cross_user_isolation(client: AsyncClient) -> None:
    owner_token = await signup_and_login(client, "bill-a@example.com", "bill_a")
    other_token = await signup_and_login(client, "bill-b@example.com", "bill_b")

    create_resp = await _create_bill(client, owner_token)
    bill_id = create_resp.json()["id"]

    get_resp = await client.get(f"/bills/{bill_id}", headers=auth_header(other_token))
    assert get_resp.status_code == 404

    list_resp = await client.get("/bills/", headers=auth_header(other_token))
    assert all(b["id"] != bill_id for b in list_resp.json())

    update_resp = await client.patch(
        f"/bills/{bill_id}", json={"name": "Hijacked"}, headers=auth_header(other_token)
    )
    assert update_resp.status_code == 404

    delete_resp = await client.delete(f"/bills/{bill_id}", headers=auth_header(other_token))
    assert delete_resp.status_code == 404


# --- Regression: blocker #1 -------------------------------------------------------------
# POST /bills/ with only the required fields used to 500 (IntegrityError) because the
# optional status/current_stage/payment_status/verified_by_user fields were dumped as
# explicit `None`, overriding the model's Python-side defaults for those NOT NULL columns.
async def test_create_bill_with_only_required_fields_succeeds(client: AsyncClient) -> None:
    token = await signup_and_login(client, "bill-minimal@example.com", "bill_minimal")

    response = await _create_bill(client, token)
    assert response.status_code == 201
    body = response.json()

    assert body["status"] == "pending"
    assert body["current_stage"] == "uploaded"
    assert body["payment_status"] == "unpaid"
    assert body["verified_by_user"] is False


# --- Regression: blocker #2 -------------------------------------------------------------
# DELETE /bills/{bill_id} used to raise MissingGreenlet when the bill had line items or
# elicitations, because the cascading delete needed to lazy-load those collections outside
# a greenlet.
async def test_delete_bill_with_children_succeeds(client: AsyncClient) -> None:
    token = await signup_and_login(client, "bill-children@example.com", "bill_children")

    bill_id = (await _create_bill(client, token)).json()["id"]

    line_item_resp = await client.post(
        f"/bills/{bill_id}/line-items/",
        json={"description": "Usage charge", "line_total": "42.50"},
        headers=auth_header(token),
    )
    assert line_item_resp.status_code == 201

    elicitation_resp = await client.post(
        f"/bills/{bill_id}/elicitations/",
        json={"stage": "parsing", "question": "What is the due date?"},
        headers=auth_header(token),
    )
    assert elicitation_resp.status_code == 201

    delete_resp = await client.delete(f"/bills/{bill_id}", headers=auth_header(token))
    assert delete_resp.status_code == 204

    assert (await client.get(f"/bills/{bill_id}", headers=auth_header(token))).status_code == 404

    # The parent bill (and thus its FK-scoped rows) is gone - listing by the now-nonexistent
    # bill_id should come back empty rather than erroring, confirming the children were
    # actually cascade-deleted rather than left orphaned.
    line_items_resp = await client.get(f"/bills/{bill_id}/line-items/", headers=auth_header(token))
    assert line_items_resp.status_code == 200
    assert line_items_resp.json() == []

    elicitations_resp = await client.get(
        f"/bills/{bill_id}/elicitations/", headers=auth_header(token)
    )
    assert elicitations_resp.status_code == 200
    assert elicitations_resp.json() == []


# --- Major #4: category_id/vendor_id ownership check on bills ---------------------------
async def test_create_bill_with_other_users_category_id_is_not_found(client: AsyncClient) -> None:
    owner_token = await signup_and_login(client, "bill-cat-a@example.com", "bill_cat_a")
    other_token = await signup_and_login(client, "bill-cat-b@example.com", "bill_cat_b")

    category_resp = await client.post(
        "/categories/",
        json={"name": "Groceries", "slug": "groceries"},
        headers=auth_header(owner_token),
    )
    category_id = category_resp.json()["id"]

    response = await _create_bill(client, other_token, category_id=category_id)
    assert response.status_code == 404


async def test_create_bill_with_other_users_vendor_id_is_not_found(client: AsyncClient) -> None:
    owner_token = await signup_and_login(client, "bill-vendor-a@example.com", "bill_vendor_a")
    other_token = await signup_and_login(client, "bill-vendor-b@example.com", "bill_vendor_b")

    vendor_resp = await client.post(
        "/vendors/", json={"name": "Water Co", "key": "water-co"}, headers=auth_header(owner_token)
    )
    vendor_id = vendor_resp.json()["id"]

    response = await _create_bill(client, other_token, vendor_id=vendor_id)
    assert response.status_code == 404

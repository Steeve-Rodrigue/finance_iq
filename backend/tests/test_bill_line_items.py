from httpx import AsyncClient

from tests.helpers import auth_header, signup_and_login


async def _create_bill(client: AsyncClient, token: str, name: str = "Gas bill"):
    return await client.post(
        "/bills/",
        json={"name": name, "storage_key": "s3://bucket/gas.pdf", "file_hash": "hash-gas-1"},
        headers=auth_header(token),
    )


async def _create_line_item(
    client: AsyncClient,
    token: str,
    bill_id: str,
    description: str = "Usage charge",
    line_total: str = "12.34",
    **extra,
):
    body = {"description": description, "line_total": line_total, **extra}
    return await client.post(f"/bills/{bill_id}/line-items/", json=body, headers=auth_header(token))


async def test_bill_line_item_crud_happy_path(client: AsyncClient) -> None:
    token = await signup_and_login(client, "li-owner@example.com", "li_owner")
    bill_id = (await _create_bill(client, token)).json()["id"]

    create_resp = await _create_line_item(client, token, bill_id)
    assert create_resp.status_code == 201
    line_item = create_resp.json()
    line_item_id = line_item["id"]
    assert line_item["description"] == "Usage charge"

    get_resp = await client.get(
        f"/bills/{bill_id}/line-items/{line_item_id}", headers=auth_header(token)
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == line_item_id

    list_resp = await client.get(f"/bills/{bill_id}/line-items/", headers=auth_header(token))
    assert list_resp.status_code == 200
    assert any(item["id"] == line_item_id for item in list_resp.json())

    update_resp = await client.patch(
        f"/bills/{bill_id}/line-items/{line_item_id}",
        json={"description": "Usage charge (corrected)"},
        headers=auth_header(token),
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["description"] == "Usage charge (corrected)"

    delete_resp = await client.delete(
        f"/bills/{bill_id}/line-items/{line_item_id}", headers=auth_header(token)
    )
    assert delete_resp.status_code == 204

    missing_resp = await client.get(
        f"/bills/{bill_id}/line-items/{line_item_id}", headers=auth_header(token)
    )
    assert missing_resp.status_code == 404


async def test_bill_line_item_cross_user_isolation(client: AsyncClient) -> None:
    owner_token = await signup_and_login(client, "li-a@example.com", "li_a")
    other_token = await signup_and_login(client, "li-b@example.com", "li_b")

    bill_id = (await _create_bill(client, owner_token)).json()["id"]
    line_item_id = (await _create_line_item(client, owner_token, bill_id)).json()["id"]

    get_resp = await client.get(
        f"/bills/{bill_id}/line-items/{line_item_id}", headers=auth_header(other_token)
    )
    assert get_resp.status_code == 404

    update_resp = await client.patch(
        f"/bills/{bill_id}/line-items/{line_item_id}",
        json={"description": "Hijacked"},
        headers=auth_header(other_token),
    )
    assert update_resp.status_code == 404

    delete_resp = await client.delete(
        f"/bills/{bill_id}/line-items/{line_item_id}", headers=auth_header(other_token)
    )
    assert delete_resp.status_code == 404


# --- Regression: blocker #3 --------------------------------------------------------------
# POST /bills/{bill_id}/line-items used to succeed for a bill_id the caller doesn't own, as
# long as the bill existed for *someone*.
async def test_create_line_item_on_other_users_bill_is_not_found(client: AsyncClient) -> None:
    owner_token = await signup_and_login(client, "li-cross-a@example.com", "li_cross_a")
    other_token = await signup_and_login(client, "li-cross-b@example.com", "li_cross_b")

    bill_id = (await _create_bill(client, owner_token)).json()["id"]

    response = await _create_line_item(client, other_token, bill_id)
    assert response.status_code == 404


# --- Major #4: category_id ownership check on line items ---------------------------------
async def test_create_line_item_with_other_users_category_id_is_not_found(
    client: AsyncClient,
) -> None:
    owner_token = await signup_and_login(client, "li-cat-a@example.com", "li_cat_a")
    other_token = await signup_and_login(client, "li-cat-b@example.com", "li_cat_b")

    category_resp = await client.post(
        "/categories/",
        json={"name": "Fuel", "slug": "fuel"},
        headers=auth_header(owner_token),
    )
    category_id = category_resp.json()["id"]

    bill_id = (await _create_bill(client, other_token)).json()["id"]

    response = await _create_line_item(client, other_token, bill_id, category_id=category_id)
    assert response.status_code == 404

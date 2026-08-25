from httpx import AsyncClient

from tests.helpers import auth_header, signup_and_login


async def _create_category(
    client: AsyncClient, token: str, name: str = "Utilities", slug: str = "utilities"
):
    return await client.post(
        "/categories/", json={"name": name, "slug": slug}, headers=auth_header(token)
    )


async def test_category_crud_happy_path(client: AsyncClient) -> None:
    token = await signup_and_login(client, "cat-owner@example.com", "cat_owner")

    create_resp = await _create_category(client, token)
    assert create_resp.status_code == 201
    category = create_resp.json()
    category_id = category["id"]
    assert category["name"] == "Utilities"
    assert category["slug"] == "utilities"

    get_resp = await client.get(f"/categories/{category_id}", headers=auth_header(token))
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == category_id

    list_resp = await client.get("/categories/", headers=auth_header(token))
    assert list_resp.status_code == 200
    assert any(c["id"] == category_id for c in list_resp.json())

    update_resp = await client.patch(
        f"/categories/{category_id}",
        json={"name": "Utilities Updated"},
        headers=auth_header(token),
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "Utilities Updated"

    delete_resp = await client.delete(f"/categories/{category_id}", headers=auth_header(token))
    assert delete_resp.status_code == 204

    missing_resp = await client.get(f"/categories/{category_id}", headers=auth_header(token))
    assert missing_resp.status_code == 404


async def test_category_cross_user_isolation(client: AsyncClient) -> None:
    owner_token = await signup_and_login(client, "cat-a@example.com", "cat_a")
    other_token = await signup_and_login(client, "cat-b@example.com", "cat_b")

    create_resp = await _create_category(client, owner_token)
    category_id = create_resp.json()["id"]

    get_resp = await client.get(f"/categories/{category_id}", headers=auth_header(other_token))
    assert get_resp.status_code == 404

    list_resp = await client.get("/categories/", headers=auth_header(other_token))
    assert all(c["id"] != category_id for c in list_resp.json())

    update_resp = await client.patch(
        f"/categories/{category_id}",
        json={"name": "Hijacked"},
        headers=auth_header(other_token),
    )
    assert update_resp.status_code == 404

    delete_resp = await client.delete(
        f"/categories/{category_id}", headers=auth_header(other_token)
    )
    assert delete_resp.status_code == 404


async def test_delete_category_still_referenced_by_bill_is_conflict(client: AsyncClient) -> None:
    token = await signup_and_login(client, "cat-inuse@example.com", "cat_inuse")

    category_id = (await _create_category(client, token, name="Rent", slug="rent")).json()["id"]

    bill_resp = await client.post(
        "/bills/",
        json={
            "name": "Rent bill",
            "storage_key": "s3://bucket/rent.pdf",
            "file_hash": "hash-rent-1",
            "category_id": category_id,
        },
        headers=auth_header(token),
    )
    assert bill_resp.status_code == 201

    delete_resp = await client.delete(f"/categories/{category_id}", headers=auth_header(token))
    assert delete_resp.status_code == 409

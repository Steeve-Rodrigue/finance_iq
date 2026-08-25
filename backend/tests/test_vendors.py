from httpx import AsyncClient

from tests.helpers import auth_header, signup_and_login


async def _create_vendor(
    client: AsyncClient, token: str, name: str = "Acme Utilities", key: str = "acme-utilities"
):
    return await client.post(
        "/vendors/", json={"name": name, "key": key}, headers=auth_header(token)
    )


async def test_vendor_crud_happy_path(client: AsyncClient) -> None:
    token = await signup_and_login(client, "vendor-owner@example.com", "vendor_owner")

    create_resp = await _create_vendor(client, token)
    assert create_resp.status_code == 201
    vendor = create_resp.json()
    vendor_id = vendor["id"]
    assert vendor["name"] == "Acme Utilities"
    assert vendor["key"] == "acme-utilities"

    get_resp = await client.get(f"/vendors/{vendor_id}", headers=auth_header(token))
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == vendor_id

    list_resp = await client.get("/vendors/", headers=auth_header(token))
    assert list_resp.status_code == 200
    assert any(v["id"] == vendor_id for v in list_resp.json())

    update_resp = await client.patch(
        f"/vendors/{vendor_id}", json={"name": "Acme Utilities Inc"}, headers=auth_header(token)
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "Acme Utilities Inc"

    delete_resp = await client.delete(f"/vendors/{vendor_id}", headers=auth_header(token))
    assert delete_resp.status_code == 204

    missing_resp = await client.get(f"/vendors/{vendor_id}", headers=auth_header(token))
    assert missing_resp.status_code == 404


async def test_vendor_cross_user_isolation(client: AsyncClient) -> None:
    owner_token = await signup_and_login(client, "vendor-a@example.com", "vendor_a")
    other_token = await signup_and_login(client, "vendor-b@example.com", "vendor_b")

    create_resp = await _create_vendor(client, owner_token)
    vendor_id = create_resp.json()["id"]

    get_resp = await client.get(f"/vendors/{vendor_id}", headers=auth_header(other_token))
    assert get_resp.status_code == 404

    list_resp = await client.get("/vendors/", headers=auth_header(other_token))
    assert all(v["id"] != vendor_id for v in list_resp.json())

    update_resp = await client.patch(
        f"/vendors/{vendor_id}", json={"name": "Hijacked"}, headers=auth_header(other_token)
    )
    assert update_resp.status_code == 404

    delete_resp = await client.delete(f"/vendors/{vendor_id}", headers=auth_header(other_token))
    assert delete_resp.status_code == 404


async def test_delete_vendor_still_referenced_by_bill_is_conflict(client: AsyncClient) -> None:
    token = await signup_and_login(client, "vendor-inuse@example.com", "vendor_inuse")

    vendor_id = (await _create_vendor(client, token, name="Power Co", key="power-co")).json()["id"]

    bill_resp = await client.post(
        "/bills/",
        json={
            "name": "Power bill",
            "storage_key": "s3://bucket/power.pdf",
            "file_hash": "hash-power-1",
            "vendor_id": vendor_id,
        },
        headers=auth_header(token),
    )
    assert bill_resp.status_code == 201

    delete_resp = await client.delete(f"/vendors/{vendor_id}", headers=auth_header(token))
    assert delete_resp.status_code == 409

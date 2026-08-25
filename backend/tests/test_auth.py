from httpx import AsyncClient


async def _signup(
    client: AsyncClient, email: str, username: str, password: str = "correct-horse-1"
):
    return await client.post(
        "/auth/signup", json={"email": email, "username": username, "password": password}
    )


async def _login(client: AsyncClient, email: str, password: str = "correct-horse-1"):
    return await client.post("/auth/login", json={"email": email, "password": password})


async def test_signup_returns_no_password_field(client: AsyncClient) -> None:
    response = await _signup(client, "alice@example.com", "alice")
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "alice@example.com"
    assert body["username"] == "alice"
    assert "password" not in body
    assert "hashed_password" not in body


async def test_signup_duplicate_email_is_conflict(client: AsyncClient) -> None:
    await _signup(client, "bob@example.com", "bob")
    response = await _signup(client, "bob@example.com", "bob2")
    assert response.status_code == 409


async def test_signup_duplicate_username_is_conflict(client: AsyncClient) -> None:
    await _signup(client, "gina@example.com", "gina")
    response = await _signup(client, "gina2@example.com", "gina")
    assert response.status_code == 409


async def test_login_with_correct_credentials_returns_usable_token(client: AsyncClient) -> None:
    await _signup(client, "carol@example.com", "carol")
    response = await _login(client, "carol@example.com")
    assert response.status_code == 200
    token = response.json()["access_token"]

    me = await client.get("/users/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "carol@example.com"


async def test_login_with_wrong_password_is_unauthorized(client: AsyncClient) -> None:
    await _signup(client, "dave@example.com", "dave")
    response = await _login(client, "dave@example.com", password="wrong-password")
    assert response.status_code == 401


async def test_protected_route_without_token_is_unauthorized(client: AsyncClient) -> None:
    response = await client.get("/users/me")
    assert response.status_code == 401


async def test_users_only_see_their_own_profile(client: AsyncClient) -> None:
    await _signup(client, "erin@example.com", "erin")
    await _signup(client, "frank@example.com", "frank")

    erin_token = (await _login(client, "erin@example.com")).json()["access_token"]
    frank_token = (await _login(client, "frank@example.com")).json()["access_token"]

    erin_me = await client.get("/users/me", headers={"Authorization": f"Bearer {erin_token}"})
    frank_me = await client.get("/users/me", headers={"Authorization": f"Bearer {frank_token}"})

    assert erin_me.json()["email"] == "erin@example.com"
    assert frank_me.json()["email"] == "frank@example.com"

"""Shared auth helpers for router-level tests.

Mirrors the signup/login pattern already established in `tests/test_auth.py`
(`test_users_only_see_their_own_profile`) so every entity's test file can obtain one or two
authenticated users without duplicating the signup/login boilerplate.
"""

from httpx import AsyncClient

DEFAULT_PASSWORD = "correct-horse-1"


async def signup(client: AsyncClient, email: str, username: str, password: str = DEFAULT_PASSWORD):
    return await client.post(
        "/auth/signup", json={"email": email, "username": username, "password": password}
    )


async def login(client: AsyncClient, email: str, password: str = DEFAULT_PASSWORD):
    return await client.post("/auth/login", json={"email": email, "password": password})


async def signup_and_login(
    client: AsyncClient, email: str, username: str, password: str = DEFAULT_PASSWORD
) -> str:
    """Sign up a new user and return a usable access token."""
    await signup(client, email, username, password)
    response = await login(client, email, password)
    return response.json()["access_token"]


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}

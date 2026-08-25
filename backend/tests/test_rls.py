"""Proves isolation is enforced by Postgres itself, not just by app-level WHERE clauses.

Every other cross-user test in this project (e.g. tests/test_categories.py) goes through the
real repo functions, which already filter by user_id correctly — so those tests only prove
the app code is correct today. This file instead issues a raw, deliberately unfiltered query
directly against the database connection the app itself uses, simulating what happens if a
future repo function forgets its user_id filter. If row-level security is actually enforced,
that query still can't see another user's data.
"""

from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import signup_and_login


async def _set_current_user(db_session: AsyncSession, user_id: str) -> None:
    await db_session.execute(
        text("SELECT set_config('app.current_user_id', :user_id, true)"), {"user_id": user_id}
    )


async def test_unfiltered_query_cannot_see_another_users_row(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    token_a = await signup_and_login(client, "rls-a@example.com", "rls_a")
    me_a = await client.get("/users/me", headers={"Authorization": f"Bearer {token_a}"})
    user_a_id = me_a.json()["id"]

    token_b = await signup_and_login(client, "rls-b@example.com", "rls_b")
    me_b = await client.get("/users/me", headers={"Authorization": f"Bearer {token_b}"})
    user_b_id = me_b.json()["id"]

    create = await client.post(
        "/categories/",
        json={"name": "A's secret category", "slug": "a-secret"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert create.status_code == 201
    category_id = create.json()["id"]

    # Switch the raw DB session to "be" user B, then run a query with NO user_id filter at
    # all - exactly what a buggy repo function forgetting its scoping would do.
    await _set_current_user(db_session, user_b_id)

    unfiltered = await db_session.execute(text("SELECT id FROM categories"))
    visible_ids = {str(row[0]) for row in unfiltered.fetchall()}
    assert category_id not in visible_ids

    by_known_id = await db_session.execute(
        text("SELECT id FROM categories WHERE id = :id"), {"id": category_id}
    )
    assert by_known_id.first() is None

    update = await db_session.execute(
        text("UPDATE categories SET name = 'hacked' WHERE id = :id"), {"id": category_id}
    )
    assert update.rowcount == 0

    # Switch back to A and confirm the row is untouched.
    await _set_current_user(db_session, user_a_id)
    still_there = await db_session.execute(
        text("SELECT name FROM categories WHERE id = :id"), {"id": category_id}
    )
    assert still_there.scalar_one() == "A's secret category"


async def test_no_session_user_sees_nothing(client: AsyncClient, db_session: AsyncSession) -> None:
    token = await signup_and_login(client, "rls-c@example.com", "rls_c")
    create = await client.post(
        "/categories/",
        json={"name": "C's category", "slug": "c-cat"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert create.status_code == 201

    # A session var that doesn't match any real user - same deny-by-default outcome as an
    # unset one, without relying on RESET's exact semantics for a custom GUC.
    await _set_current_user(db_session, "00000000-0000-0000-0000-000000000000")
    result = await db_session.execute(text("SELECT id FROM categories"))
    assert result.fetchall() == []

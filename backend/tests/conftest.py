from collections.abc import AsyncGenerator
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.database import engine, get_db
from app.main import app
from app.services import categorizer_service, rate_limiter


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """One outer transaction per test, rolled back at teardown.

    Opens a connection, begins an outer transaction on it, and binds a session to that
    connection so anything the app does during the test (including nested commits) stays
    inside the outer transaction. `app.dependency_overrides[get_db]` is pointed at this
    session for the duration of the test so the real `get_db` dependency (and its own
    session/engine) is never touched.
    """
    async with engine.connect() as connection:
        outer_transaction = await connection.begin()
        session_factory = async_sessionmaker(
            bind=connection,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )
        session = session_factory()

        async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
            yield session

        app.dependency_overrides[get_db] = _override_get_db
        try:
            yield session
        finally:
            app.dependency_overrides.pop(get_db, None)
            await session.close()
            await outer_transaction.rollback()


@pytest.fixture(autouse=True)
def _mock_categorizer_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    """A resolved parse now automatically chains into categorization
    (bill_parser_service.parse_and_persist_bill) - most tests don't care about categorization
    specifics and shouldn't need to know it exists, so default it to a fast, deterministic,
    unconditional high-confidence result. Same principle as call_parser being mocked: no test
    here should ever make a real, paid API call. Tests that DO care about categorizer behavior
    override this with their own monkeypatch.setattr, which simply wins since it runs later."""

    async def _fake_call_categorizer(**kwargs: Any) -> dict[str, Any]:
        return {
            "category_slug": "autre",
            "category_name": "Autre",
            "confidence": 0.95,
            "reasoning": "default test category",
        }

    monkeypatch.setattr(categorizer_service, "call_categorizer", _fake_call_categorizer)


@pytest.fixture(autouse=True)
def _reset_rate_limiter() -> None:
    """app/services/rate_limiter.py's state is a process-global dict, not DB state - it
    doesn't get the automatic per-test rollback db_session gives everything else. Every test
    hitting the same rate-limited endpoint would otherwise share one rate-limit window (test
    clients typically report no/the same client IP), making test order affect results."""
    rate_limiter.reset()


@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

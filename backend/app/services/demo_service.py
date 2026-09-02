"""Business logic for the public, unauthenticated /demo endpoints (app/routers/demo.py) - a
single shared, real backend account (users.is_demo) that lets a portfolio visitor see the
actual vision parser (bill_parser_service.py) run on a real bill, instead of
frontend/lib/demo/demo-upload.ts's client-side-fabricated result. Bounded and self-cleaning
since it's public and spends real OpenRouter calls per upload: a hard cap on how many bills
the account can hold at once (oldest evicted first, see enforce_bill_cap) plus a time-based
cleanup endpoint (cleanup_stale_bills) - see roadmap.md/CLAUDE.md non-negotiables, this is
additive safety around the same real decision-loop pipeline, not a special-cased one."""

import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.repos import bills_repo, users_repo
from app.security import hash_password

DEMO_USER_EMAIL = "demo@financeiq.internal"
DEMO_USER_USERNAME = "demo"

# Keeps the shared account small and the OpenRouter cost/storage bounded - a visitor only ever
# needs to see their own upload land, not accumulate everyone else's indefinitely between
# cleanup runs.
DEMO_MAX_BILLS = 10
DEMO_BILL_MAX_AGE = timedelta(hours=1)


async def get_or_create_demo_user(db: AsyncSession) -> uuid.UUID:
    user = await users_repo.get_demo_user(db)
    if user is not None:
        return user.id
    # Password is unusable by design - the demo account is never reached through the normal
    # /auth/token login flow, only through these public /demo endpoints, which don't
    # authenticate at all.
    user = await users_repo.create(
        db,
        email=DEMO_USER_EMAIL,
        hashed_password=hash_password(secrets.token_urlsafe(32)),
        username=DEMO_USER_USERNAME,
        is_demo=True,
    )
    await db.commit()
    return user.id


async def get_demo_user_id_if_exists(db: AsyncSession) -> uuid.UUID | None:
    """Cleanup (app/routers/demo.py's /demo/cleanup) has nothing to do if no one has ever
    uploaded a demo bill yet - unlike the upload path, it must not create the account just to
    immediately find it empty."""
    user = await users_repo.get_demo_user(db)
    return user.id if user is not None else None


async def enforce_bill_cap(
    db: AsyncSession, user_id: uuid.UUID, *, max_bills: int = DEMO_MAX_BILLS
) -> None:
    """Evict the oldest demo bills before a new one is inserted, so the shared account never
    grows past `max_bills` regardless of how often /demo/bills/upload is called between
    cleanup runs."""
    bills = await bills_repo.list_by_user(db, user_id)
    if len(bills) < max_bills:
        return
    oldest_first = sorted(bills, key=lambda b: b.created_at)
    to_evict = len(bills) - max_bills + 1
    for bill in oldest_first[:to_evict]:
        await bills_repo.delete(db, user_id, bill.id)
    await db.commit()


async def cleanup_stale_bills(
    db: AsyncSession, user_id: uuid.UUID, *, max_age: timedelta = DEMO_BILL_MAX_AGE
) -> int:
    """Deletes every demo bill older than `max_age`. Called periodically by a GitHub Actions
    cron (.github/workflows/demo_cleanup.yaml) - the same ping-an-endpoint pattern
    keep_alive.yaml already uses for Render's cold-start prevention. Safe to call anytime,
    including concurrently or with nothing to clean: it only ever removes rows already past
    the age cutoff, so it can't interfere with a visitor's in-flight or freshly-finished
    upload. Returns the number of bills deleted."""
    cutoff = datetime.now(UTC) - max_age
    bills = await bills_repo.list_by_user(db, user_id)
    stale = [bill for bill in bills if bill.created_at < cutoff]
    for bill in stale:
        await bills_repo.delete(db, user_id, bill.id)
    await db.commit()
    return len(stale)

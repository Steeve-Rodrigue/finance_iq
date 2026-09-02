import uuid
from contextvars import ContextVar

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import event, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session, SessionTransaction

from app.database import get_db
from app.models.users import User
from app.repos import users_repo
from app.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

# Per-request (per-asyncio-Task) current user id, mirrored into Postgres' RLS session
# variable below. Task-scoped, not global, so concurrent requests never see each other's value.
_current_rls_user_id: ContextVar[str | None] = ContextVar("_current_rls_user_id", default=None)


@event.listens_for(Session, "after_begin")
def _reapply_rls_user_on_new_transaction(
    session: Session, transaction: SessionTransaction, connection: Connection
) -> None:
    # `set_config(..., is_local=false)` is scoped to the *physical* Postgres connection, not
    # to this AsyncSession. Several services call db.commit() mid-request (see the comment on
    # get_current_user below) - a commit ends the current transaction and releases the
    # connection back to the pool, so the *next* transaction on this Session (even on the same
    # request) may be handed a different physical connection that never had the GUC set,
    # silently reverting it to "" and breaking every RLS policy's ::uuid cast. This event fires
    # on every new transaction, on whatever connection SQLAlchemy actually hands it, so it
    # re-asserts the value regardless of pooling. Not needed for get_current_user's own first
    # query (users_repo.get_by_id) - `users` has no RLS policy (it's the root table) and the
    # user id isn't known yet at that point anyway; get_current_user still sets it once
    # explicitly for its own transaction below, this only covers every transaction after it.
    user_id = _current_rls_user_id.get()
    if user_id is not None:
        connection.execute(
            text("SELECT set_config('app.current_user_id', :user_id, false)"),
            {"user_id": user_id},
        )


async def apply_rls_user(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Shared by every path that establishes "who this request is acting as" -
    get_current_user's real-JWT path below, and app/routers/demo.py's no-auth demo path (the
    public demo endpoint has no token to decode, but still needs every query it makes to be
    RLS-scoped to the fixed demo account, exactly like a real authenticated request).

    is_local=false (session-scoped), not true (transaction-scoped): several services in this
    app call db.commit() mid-request (e.g. bills_service.create_bill, then
    bill_parser_service.parse_and_persist_bill's own queries afterward). A COMMIT ends the
    transaction that a `true`-scoped set_config lives in, silently reverting this to an empty
    string for every query after the first commit in the same request - confirmed via a live
    end-to-end test (Phase 2's upload endpoint), which failed with
    `invalid input syntax for type uuid: ""` on its second query.

    Session-scoped alone still isn't enough under connection pooling: a commit also releases
    the physical connection back to the pool, so the *next* transaction can land on a
    different connection that never had this GUC set - same empty-string failure, just on a
    later query (reproduced live on the /bills upload endpoint). Setting the contextvar here
    lets `_reapply_rls_user_on_new_transaction` above re-assert the value on every subsequent
    transaction regardless of which physical connection it lands on; this explicit call only
    has to cover the current transaction, which already began before the contextvar was set.
    """
    _current_rls_user_id.set(str(user_id))
    await db.execute(
        text("SELECT set_config('app.current_user_id', :user_id, false)"),
        {"user_id": str(user_id)},
    )


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        user_id = decode_access_token(token)
    except (jwt.PyJWTError, ValueError, KeyError) as exc:
        raise credentials_error from exc

    user = await users_repo.get_by_id(db, user_id)
    if user is None:
        raise credentials_error

    await apply_rls_user(db, user.id)

    return user

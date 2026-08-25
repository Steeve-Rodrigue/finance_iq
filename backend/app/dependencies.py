import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.users import User
from app.repos import users_repo
from app.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")


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

    # is_local=false (session-scoped), not true (transaction-scoped): several services in
    # this app call db.commit() mid-request (e.g. bills_service.create_bill, then
    # bill_parser_service.parse_and_persist_bill's own queries afterward). A COMMIT ends the
    # transaction that a `true`-scoped set_config lives in, silently reverting this to an
    # empty string for every query after the first commit in the same request - confirmed via
    # a live end-to-end test (Phase 2's upload endpoint), which failed with
    # `invalid input syntax for type uuid: ""` on its second query. Session-scoped is safe
    # here because every RLS-touching route depends on get_current_user first, so a pooled
    # connection always gets this reset before anything reads it.
    await db.execute(
        text("SELECT set_config('app.current_user_id', :user_id, false)"),
        {"user_id": str(user.id)},
    )

    return user

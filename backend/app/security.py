from datetime import UTC, datetime, timedelta
from uuid import UUID

import bcrypt
import jwt

from app.config import settings


def hash_password(password: str) -> str:
    try:
        return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    except ValueError as exc:
        raise ValueError("password exceeds bcrypt's 72-byte limit") from exc


def verify_password(password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8"))
    except ValueError:
        # Defensive fallback: schema validators should already reject passwords over
        # bcrypt's 72-byte limit before this is ever called, but never let a raw
        # ValueError from bcrypt surface as an unhandled 500 here.
        return False


def create_access_token(user_id: UUID) -> str:
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": str(user_id), "exp": expires_at}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> UUID:
    payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    return UUID(payload["sub"])

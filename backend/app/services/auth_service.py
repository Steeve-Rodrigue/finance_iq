import structlog
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ConflictError
from app.models.users import User
from app.repos import users_repo
from app.security import hash_password, verify_password

logger = structlog.get_logger()


async def signup(db: AsyncSession, email: str, username: str, password: str) -> User:
    email = email.lower()
    if await users_repo.get_by_email(db, email) is not None:
        raise ConflictError(f"a user with email {email!r} already exists")
    try:
        user = await users_repo.create(
            db, email=email, hashed_password=hash_password(password), username=username
        )
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError("a user with this email or username already exists") from exc
    await db.commit()
    logger.info("auth.signup.success", email=email, username=username)
    return user


async def authenticate(db: AsyncSession, email: str, password: str) -> User | None:
    email = email.lower()
    user = await users_repo.get_by_email(db, email)
    if user is None or not verify_password(password, user.hashed_password):
        logger.info("auth.login.failure", email=email)
        return None
    logger.info("auth.login.success", email=email)
    return user

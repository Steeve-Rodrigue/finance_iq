import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.users import User

# Exempt from the "user_id first param" rule (see app/repos/CLAUDE.md): users is the root
# table, there is no tenant above it to scope by.


async def get_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_demo_user(db: AsyncSession) -> User | None:
    """There's only ever one `is_demo` row (app/services/demo_service.py's
    get_or_create_demo_user is the only writer of this flag) - the public /demo endpoints all
    act as this one shared account, never a per-visitor account."""
    result = await db.execute(select(User).where(User.is_demo.is_(True)))
    return result.scalar_one_or_none()


async def create(
    db: AsyncSession,
    email: str,
    hashed_password: str,
    username: str,
    is_demo: bool = False,
) -> User:
    user = User(email=email, hashed_password=hashed_password, username=username, is_demo=is_demo)
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user

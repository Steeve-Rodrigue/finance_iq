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


async def create(db: AsyncSession, email: str, hashed_password: str, username: str) -> User:
    user = User(email=email, hashed_password=hashed_password, username=username)
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user

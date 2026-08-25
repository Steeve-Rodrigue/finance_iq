import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.categories import Category


async def list_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[Category]:
    result = await db.execute(select(Category).where(Category.user_id == user_id))
    return list(result.scalars().all())


async def get_by_id(
    db: AsyncSession, user_id: uuid.UUID, category_id: uuid.UUID
) -> Category | None:
    result = await db.execute(
        select(Category).where(Category.user_id == user_id, Category.id == category_id)
    )
    return result.scalar_one_or_none()


async def get_by_slug(db: AsyncSession, user_id: uuid.UUID, slug: str) -> Category | None:
    result = await db.execute(
        select(Category).where(Category.user_id == user_id, Category.slug == slug)
    )
    return result.scalar_one_or_none()


async def create(db: AsyncSession, user_id: uuid.UUID, name: str, slug: str) -> Category:
    category = Category(user_id=user_id, name=name, slug=slug)
    db.add(category)
    await db.flush()
    await db.refresh(category)
    return category


async def update(
    db: AsyncSession,
    user_id: uuid.UUID,
    category_id: uuid.UUID,
    name: str | None = None,
    slug: str | None = None,
) -> Category | None:
    category = await get_by_id(db, user_id, category_id)
    if category is None:
        return None
    if name is not None:
        category.name = name
    if slug is not None:
        category.slug = slug
    await db.flush()
    await db.refresh(category)
    return category


async def delete(db: AsyncSession, user_id: uuid.UUID, category_id: uuid.UUID) -> bool:
    category = await get_by_id(db, user_id, category_id)
    if category is None:
        return False
    await db.delete(category)
    await db.flush()
    return True

import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ConflictError, NotFoundError
from app.models.categories import Category
from app.repos import categories_repo


async def list_categories(db: AsyncSession, user_id: uuid.UUID) -> list[Category]:
    return await categories_repo.list_by_user(db, user_id)


async def get_category(db: AsyncSession, user_id: uuid.UUID, category_id: uuid.UUID) -> Category:
    category = await categories_repo.get_by_id(db, user_id, category_id)
    if category is None:
        raise NotFoundError(f"category {category_id} not found")
    return category


async def create_category(db: AsyncSession, user_id: uuid.UUID, name: str, slug: str) -> Category:
    try:
        category = await categories_repo.create(db, user_id, name=name, slug=slug)
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError(f"a category with slug {slug!r} already exists") from exc
    await db.commit()
    return category


async def update_category(
    db: AsyncSession,
    user_id: uuid.UUID,
    category_id: uuid.UUID,
    name: str | None = None,
    slug: str | None = None,
) -> Category:
    try:
        category = await categories_repo.update(db, user_id, category_id, name=name, slug=slug)
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError(f"a category with slug {slug!r} already exists") from exc
    if category is None:
        raise NotFoundError(f"category {category_id} not found")
    await db.commit()
    return category


async def delete_category(db: AsyncSession, user_id: uuid.UUID, category_id: uuid.UUID) -> None:
    try:
        deleted = await categories_repo.delete(db, user_id, category_id)
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError(f"category {category_id} is still referenced by other records") from exc
    if not deleted:
        raise NotFoundError(f"category {category_id} not found")
    await db.commit()

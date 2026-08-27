import uuid

from sqlalchemy import delete as sa_delete
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.subcategories import Subcategory


async def list_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[Subcategory]:
    result = await db.execute(select(Subcategory).where(Subcategory.user_id == user_id))
    return list(result.scalars().all())


async def list_by_category(
    db: AsyncSession, user_id: uuid.UUID, category_id: uuid.UUID
) -> list[Subcategory]:
    result = await db.execute(
        select(Subcategory).where(
            Subcategory.user_id == user_id, Subcategory.category_id == category_id
        )
    )
    return list(result.scalars().all())


async def get_by_id(
    db: AsyncSession, user_id: uuid.UUID, subcategory_id: uuid.UUID
) -> Subcategory | None:
    result = await db.execute(
        select(Subcategory).where(Subcategory.user_id == user_id, Subcategory.id == subcategory_id)
    )
    return result.scalar_one_or_none()


async def get_by_slug(
    db: AsyncSession,
    user_id: uuid.UUID,
    category_id: uuid.UUID,
    parent_subcategory_id: uuid.UUID | None,
    slug: str,
) -> Subcategory | None:
    """Scoped lookup mirroring categories_repo.get_by_slug, but the uniqueness scope is
    (category_id, parent_subcategory_id, slug) - parent_subcategory_id=None finds a level-1
    node, a real id finds a level-2 node under it."""
    result = await db.execute(
        select(Subcategory).where(
            Subcategory.user_id == user_id,
            Subcategory.category_id == category_id,
            Subcategory.parent_subcategory_id == parent_subcategory_id,
            Subcategory.slug == slug,
        )
    )
    return result.scalar_one_or_none()


async def create(
    db: AsyncSession,
    user_id: uuid.UUID,
    category_id: uuid.UUID,
    name: str,
    slug: str,
    parent_subcategory_id: uuid.UUID | None = None,
) -> Subcategory:
    subcategory = Subcategory(
        user_id=user_id,
        category_id=category_id,
        parent_subcategory_id=parent_subcategory_id,
        name=name,
        slug=slug,
    )
    db.add(subcategory)
    await db.flush()
    await db.refresh(subcategory)
    return subcategory


async def get_or_create(
    db: AsyncSession,
    user_id: uuid.UUID,
    category_id: uuid.UUID,
    name: str,
    slug: str,
    parent_subcategory_id: uuid.UUID | None = None,
) -> Subcategory:
    """Mirrors categorizer_service._get_or_create_category_id's get-then-create shape, at
    whichever tier (level-1 or level-2) parent_subcategory_id selects."""
    subcategory = await get_by_slug(db, user_id, category_id, parent_subcategory_id, slug)
    if subcategory is None:
        subcategory = await create(
            db,
            user_id,
            category_id,
            name=name,
            slug=slug,
            parent_subcategory_id=parent_subcategory_id,
        )
    return subcategory


async def delete_all_for_user(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Full-overwrite recompute (the sub-categorizer never diffs/upserts) - bulk DELETE FROM
    subcategories WHERE user_id=. Must run AFTER bill_line_items_repo.clear_subcategory_for_user
    or the FK from bill_line_items.subcategory_id rejects the delete."""
    await db.execute(sa_delete(Subcategory).where(Subcategory.user_id == user_id))
    await db.flush()

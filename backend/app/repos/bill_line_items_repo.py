import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bill_line_items import BillLineItem


async def list_by_bill(
    db: AsyncSession, user_id: uuid.UUID, bill_id: uuid.UUID
) -> list[BillLineItem]:
    result = await db.execute(
        select(BillLineItem).where(BillLineItem.user_id == user_id, BillLineItem.bill_id == bill_id)
    )
    return list(result.scalars().all())


async def get_by_id(
    db: AsyncSession, user_id: uuid.UUID, line_item_id: uuid.UUID
) -> BillLineItem | None:
    result = await db.execute(
        select(BillLineItem).where(BillLineItem.user_id == user_id, BillLineItem.id == line_item_id)
    )
    return result.scalar_one_or_none()


async def create(
    db: AsyncSession,
    user_id: uuid.UUID,
    bill_id: uuid.UUID,
    description: str,
    line_total: float,
    **fields: Any,
) -> BillLineItem:
    line_item = BillLineItem(
        user_id=user_id,
        bill_id=bill_id,
        description=description,
        line_total=line_total,
        **fields,
    )
    db.add(line_item)
    await db.flush()
    await db.refresh(line_item)
    return line_item


async def update(
    db: AsyncSession, user_id: uuid.UUID, line_item_id: uuid.UUID, **fields: Any
) -> BillLineItem | None:
    line_item = await get_by_id(db, user_id, line_item_id)
    if line_item is None:
        return None
    for key, value in fields.items():
        setattr(line_item, key, value)
    await db.flush()
    await db.refresh(line_item)
    return line_item


async def set_category_for_bill(
    db: AsyncSession, user_id: uuid.UUID, bill_id: uuid.UUID, category_id: uuid.UUID | None
) -> None:
    """Bulk-propagate the bill-level category down to all of its line items (one UPDATE, not
    a fetch-then-loop) - the categorizer decides at the bill level, not per line item, so
    every line item on the bill inherits the same category once one is assigned."""
    await db.execute(
        sa_update(BillLineItem)
        .where(BillLineItem.user_id == user_id, BillLineItem.bill_id == bill_id)
        .values(category_id=category_id)
    )
    await db.flush()


async def list_by_category(
    db: AsyncSession, user_id: uuid.UUID, category_id: uuid.UUID
) -> list[BillLineItem]:
    """All line items across every bill that share this category_id - the sub-categorizer
    agent's input set for one category (app/services/subcategorizer_service.py), unlike
    list_by_bill which is scoped to a single bill. Ordered by created_at (id as a stable
    tiebreaker) so the numbered list the agent sees - and the item_indices it replies with -
    are reproducible across runs rather than depending on whatever order an unordered scan
    happens to return."""
    result = await db.execute(
        select(BillLineItem)
        .where(BillLineItem.user_id == user_id, BillLineItem.category_id == category_id)
        .order_by(BillLineItem.created_at, BillLineItem.id)
    )
    return list(result.scalars().all())


async def set_subcategory_for_line_items(
    db: AsyncSession,
    user_id: uuid.UUID,
    line_item_ids: list[uuid.UUID],
    subcategory_id: uuid.UUID | None,
) -> None:
    """Bulk-assign a leaf subcategory to a batch of line items in one UPDATE, matching
    set_category_for_bill's bulk-UPDATE style - called once per (subcategory, its member line
    items) group, not once per row."""
    if not line_item_ids:
        return
    await db.execute(
        sa_update(BillLineItem)
        .where(BillLineItem.user_id == user_id, BillLineItem.id.in_(line_item_ids))
        .values(subcategory_id=subcategory_id)
    )
    await db.flush()


async def clear_subcategory_for_user(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Nulls every line item's subcategory_id for this user in one UPDATE - the first step of
    a full-overwrite subcategorize run, must run before subcategories_repo.delete_all_for_user
    so that table's FK doesn't block the delete."""
    await db.execute(
        sa_update(BillLineItem).where(BillLineItem.user_id == user_id).values(subcategory_id=None)
    )
    await db.flush()


async def delete(db: AsyncSession, user_id: uuid.UUID, line_item_id: uuid.UUID) -> bool:
    line_item = await get_by_id(db, user_id, line_item_id)
    if line_item is None:
        return False
    await db.delete(line_item)
    await db.flush()
    return True

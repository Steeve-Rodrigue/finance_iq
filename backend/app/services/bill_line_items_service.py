import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import NotFoundError
from app.models.bill_line_items import BillLineItem
from app.repos import bill_line_items_repo, bills_repo, categories_repo


async def list_line_items(
    db: AsyncSession, user_id: uuid.UUID, bill_id: uuid.UUID
) -> list[BillLineItem]:
    return await bill_line_items_repo.list_by_bill(db, user_id, bill_id)


async def get_line_item(
    db: AsyncSession, user_id: uuid.UUID, bill_id: uuid.UUID, line_item_id: uuid.UUID
) -> BillLineItem:
    line_item = await bill_line_items_repo.get_by_id(db, user_id, line_item_id)
    if line_item is None or line_item.bill_id != bill_id:
        raise NotFoundError(f"bill line item {line_item_id} not found")
    return line_item


async def create_line_item(
    db: AsyncSession,
    user_id: uuid.UUID,
    bill_id: uuid.UUID,
    description: str,
    line_total: float,
    **fields: Any,
) -> BillLineItem:
    bill = await bills_repo.get_by_id(db, user_id, bill_id)
    if bill is None:
        raise NotFoundError(f"bill {bill_id} not found")
    category_id = fields.get("category_id")
    if category_id is not None:
        category = await categories_repo.get_by_id(db, user_id, category_id)
        if category is None:
            raise NotFoundError(f"category {category_id} not found")
    line_item = await bill_line_items_repo.create(
        db, user_id, bill_id, description=description, line_total=line_total, **fields
    )
    await db.commit()
    return line_item


async def update_line_item(
    db: AsyncSession,
    user_id: uuid.UUID,
    bill_id: uuid.UUID,
    line_item_id: uuid.UUID,
    **fields: Any,
) -> BillLineItem:
    await get_line_item(db, user_id, bill_id, line_item_id)
    category_id = fields.get("category_id")
    if category_id is not None:
        category = await categories_repo.get_by_id(db, user_id, category_id)
        if category is None:
            raise NotFoundError(f"category {category_id} not found")
    line_item = await bill_line_items_repo.update(db, user_id, line_item_id, **fields)
    if line_item is None:
        raise NotFoundError(f"bill line item {line_item_id} not found")
    await db.commit()
    return line_item


async def delete_line_item(
    db: AsyncSession, user_id: uuid.UUID, bill_id: uuid.UUID, line_item_id: uuid.UUID
) -> None:
    await get_line_item(db, user_id, bill_id, line_item_id)
    deleted = await bill_line_items_repo.delete(db, user_id, line_item_id)
    if not deleted:
        raise NotFoundError(f"bill line item {line_item_id} not found")
    await db.commit()

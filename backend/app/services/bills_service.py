import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import NotFoundError
from app.models.bills import Bill
from app.repos import bills_repo, categories_repo, vendors_repo

# CRUD baseline only. The confidence/retry/elicitation decision loop described in /CLAUDE.md
# (parsing, categorizing, auditing agents; retry-on-low-confidence; ask-the-user elicitation)
# is deliberately not implemented here - it belongs to a separate, hand-designed pass
# (roadmap phases 3-6), not this mechanical CRUD scaffold.


async def _validate_category_and_vendor(
    db: AsyncSession, user_id: uuid.UUID, fields: dict[str, Any]
) -> None:
    category_id = fields.get("category_id")
    if category_id is not None:
        category = await categories_repo.get_by_id(db, user_id, category_id)
        if category is None:
            raise NotFoundError(f"category {category_id} not found")
    vendor_id = fields.get("vendor_id")
    if vendor_id is not None:
        vendor = await vendors_repo.get_by_id(db, user_id, vendor_id)
        if vendor is None:
            raise NotFoundError(f"vendor {vendor_id} not found")


async def list_bills(db: AsyncSession, user_id: uuid.UUID) -> list[Bill]:
    return await bills_repo.list_by_user(db, user_id)


async def get_bill(db: AsyncSession, user_id: uuid.UUID, bill_id: uuid.UUID) -> Bill:
    bill = await bills_repo.get_by_id(db, user_id, bill_id)
    if bill is None:
        raise NotFoundError(f"bill {bill_id} not found")
    return bill


async def create_bill(
    db: AsyncSession,
    user_id: uuid.UUID,
    name: str,
    storage_key: str,
    file_hash: str,
    **fields: Any,
) -> Bill:
    await _validate_category_and_vendor(db, user_id, fields)
    bill = await bills_repo.create(
        db, user_id, name=name, storage_key=storage_key, file_hash=file_hash, **fields
    )
    await db.commit()
    return bill


async def update_bill(
    db: AsyncSession, user_id: uuid.UUID, bill_id: uuid.UUID, **fields: Any
) -> Bill:
    await _validate_category_and_vendor(db, user_id, fields)
    bill = await bills_repo.update(db, user_id, bill_id, **fields)
    if bill is None:
        raise NotFoundError(f"bill {bill_id} not found")
    await db.commit()
    return bill


async def delete_bill(db: AsyncSession, user_id: uuid.UUID, bill_id: uuid.UUID) -> None:
    deleted = await bills_repo.delete(db, user_id, bill_id)
    if not deleted:
        raise NotFoundError(f"bill {bill_id} not found")
    await db.commit()

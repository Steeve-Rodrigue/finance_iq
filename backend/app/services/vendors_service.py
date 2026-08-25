import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ConflictError, NotFoundError
from app.models.vendors import Vendor
from app.repos import vendors_repo


async def list_vendors(db: AsyncSession, user_id: uuid.UUID) -> list[Vendor]:
    return await vendors_repo.list_by_user(db, user_id)


async def get_vendor(db: AsyncSession, user_id: uuid.UUID, vendor_id: uuid.UUID) -> Vendor:
    vendor = await vendors_repo.get_by_id(db, user_id, vendor_id)
    if vendor is None:
        raise NotFoundError(f"vendor {vendor_id} not found")
    return vendor


async def create_vendor(
    db: AsyncSession, user_id: uuid.UUID, name: str, key: str, address: str | None = None
) -> Vendor:
    try:
        vendor = await vendors_repo.create(db, user_id, name=name, key=key, address=address)
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError(f"a vendor with key {key!r} already exists") from exc
    await db.commit()
    return vendor


async def update_vendor(
    db: AsyncSession,
    user_id: uuid.UUID,
    vendor_id: uuid.UUID,
    name: str | None = None,
    address: str | None = None,
    key: str | None = None,
) -> Vendor:
    try:
        vendor = await vendors_repo.update(
            db, user_id, vendor_id, name=name, address=address, key=key
        )
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError(f"a vendor with key {key!r} already exists") from exc
    if vendor is None:
        raise NotFoundError(f"vendor {vendor_id} not found")
    await db.commit()
    return vendor


async def delete_vendor(db: AsyncSession, user_id: uuid.UUID, vendor_id: uuid.UUID) -> None:
    try:
        deleted = await vendors_repo.delete(db, user_id, vendor_id)
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError(f"vendor {vendor_id} is still referenced by other records") from exc
    if not deleted:
        raise NotFoundError(f"vendor {vendor_id} not found")
    await db.commit()

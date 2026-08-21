import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.vendors import Vendor


async def list_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[Vendor]:
    result = await db.execute(select(Vendor).where(Vendor.user_id == user_id))
    return list(result.scalars().all())


async def get_by_id(db: AsyncSession, user_id: uuid.UUID, vendor_id: uuid.UUID) -> Vendor | None:
    result = await db.execute(
        select(Vendor).where(Vendor.user_id == user_id, Vendor.id == vendor_id)
    )
    return result.scalar_one_or_none()


async def get_by_key(db: AsyncSession, user_id: uuid.UUID, key: str) -> Vendor | None:
    result = await db.execute(select(Vendor).where(Vendor.user_id == user_id, Vendor.key == key))
    return result.scalar_one_or_none()


async def create(
    db: AsyncSession, user_id: uuid.UUID, name: str, key: str, address: str | None = None
) -> Vendor:
    vendor = Vendor(user_id=user_id, name=name, key=key, address=address)
    db.add(vendor)
    await db.flush()
    await db.refresh(vendor)
    return vendor


async def update(
    db: AsyncSession,
    user_id: uuid.UUID,
    vendor_id: uuid.UUID,
    name: str | None = None,
    address: str | None = None,
    key: str | None = None,
) -> Vendor | None:
    vendor = await get_by_id(db, user_id, vendor_id)
    if vendor is None:
        return None
    if name is not None:
        vendor.name = name
    if address is not None:
        vendor.address = address
    if key is not None:
        vendor.key = key
    await db.flush()
    await db.refresh(vendor)
    return vendor


async def delete(db: AsyncSession, user_id: uuid.UUID, vendor_id: uuid.UUID) -> bool:
    vendor = await get_by_id(db, user_id, vendor_id)
    if vendor is None:
        return False
    await db.delete(vendor)
    await db.flush()
    return True

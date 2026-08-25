import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bill_line_items import BillLineItem
from app.models.bills import Bill
from app.models.categories import Category
from app.models.vendors import Vendor


@dataclass(frozen=True)
class LineItemFilters:
    vendor_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None


async def get_total_line_items(db: AsyncSession, user_id: uuid.UUID) -> int:
    stmt = select(func.count(BillLineItem.id)).where(BillLineItem.user_id == user_id)
    return (await db.execute(stmt)).scalar_one()


async def get_categorization_gap_inputs(db: AsyncSession, user_id: uuid.UUID) -> tuple[int, int]:
    total = (
        await db.execute(select(func.count(BillLineItem.id)).where(BillLineItem.user_id == user_id))
    ).scalar_one()
    without = (
        await db.execute(
            select(func.count(BillLineItem.id)).where(
                BillLineItem.user_id == user_id, BillLineItem.category_id.is_(None)
            )
        )
    ).scalar_one()
    return without, total


async def get_most_frequent_items(
    db: AsyncSession, user_id: uuid.UUID, limit: int = 10
) -> list[tuple[str, int]]:
    stmt = (
        select(BillLineItem.common_name, func.count(BillLineItem.id).label("count"))
        .where(BillLineItem.user_id == user_id, BillLineItem.common_name.is_not(None))
        .group_by(BillLineItem.common_name)
        .order_by(func.count(BillLineItem.id).desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return [(row.common_name, row.count) for row in result]


async def get_top_items_by_spend(
    db: AsyncSession, user_id: uuid.UUID, limit: int = 10
) -> list[tuple[str, Decimal]]:
    stmt = (
        select(
            BillLineItem.common_name,
            func.coalesce(func.sum(BillLineItem.line_total), 0).label("total"),
        )
        .where(BillLineItem.user_id == user_id, BillLineItem.common_name.is_not(None))
        .group_by(BillLineItem.common_name)
        .order_by(func.sum(BillLineItem.line_total).desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return [(row.common_name, row.total) for row in result]


async def get_unit_price_trend(
    db: AsyncSession, user_id: uuid.UUID, common_names: list[str]
) -> list[tuple[str, date, Decimal]]:
    if not common_names:
        return []
    period = func.date_trunc("month", Bill.issue_date)
    stmt = (
        select(
            BillLineItem.common_name,
            period.label("period"),
            func.avg(BillLineItem.unit_price).label("avg_unit_price"),
        )
        .join(Bill, BillLineItem.bill_id == Bill.id)
        .where(
            BillLineItem.user_id == user_id,
            BillLineItem.common_name.in_(common_names),
            BillLineItem.unit_price.is_not(None),
            Bill.issue_date.is_not(None),
        )
        .group_by(BillLineItem.common_name, period)
        .order_by(BillLineItem.common_name, period)
    )
    result = await db.execute(stmt)
    return [(row.common_name, row.period.date(), row.avg_unit_price) for row in result]


async def get_line_item_table(
    db: AsyncSession, user_id: uuid.UUID, filters: LineItemFilters, limit: int = 200
) -> list[Row]:
    conditions = [BillLineItem.user_id == user_id]
    if filters.vendor_id is not None:
        conditions.append(Bill.vendor_id == filters.vendor_id)
    if filters.category_id is not None:
        conditions.append(BillLineItem.category_id == filters.category_id)

    stmt = (
        select(
            BillLineItem.id,
            BillLineItem.bill_id,
            Bill.name.label("bill_name"),
            BillLineItem.description,
            BillLineItem.common_name,
            BillLineItem.quantity,
            BillLineItem.unit_price,
            BillLineItem.line_total,
            Vendor.name.label("vendor_name"),
            Category.name.label("category_name"),
        )
        .select_from(BillLineItem)
        .join(Bill, BillLineItem.bill_id == Bill.id)
        .outerjoin(Vendor, Bill.vendor_id == Vendor.id)
        .outerjoin(Category, BillLineItem.category_id == Category.id)
        .where(*conditions)
        .order_by(Bill.issue_date.desc().nullslast())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result)

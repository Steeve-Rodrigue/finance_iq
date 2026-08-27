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
from app.models.subcategories import Subcategory
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


async def get_category_totals(
    db: AsyncSession, user_id: uuid.UUID
) -> list[tuple[uuid.UUID, str, Decimal]]:
    """Total spend per category, across ALL of its line items regardless of whether they've
    been sub-categorized - the authoritative category-level total the category tree chart's
    top level reconciles against (see line_items_service.get_category_tree)."""
    stmt = (
        select(Category.id, Category.name, func.coalesce(func.sum(BillLineItem.line_total), 0))
        .select_from(BillLineItem)
        .join(Category, BillLineItem.category_id == Category.id)
        .where(BillLineItem.user_id == user_id, BillLineItem.category_id.is_not(None))
        .group_by(Category.id, Category.name)
    )
    result = await db.execute(stmt)
    return [(row[0], row[1], row[2]) for row in result]


async def get_subcategory_direct_totals(
    db: AsyncSession, user_id: uuid.UUID
) -> list[tuple[uuid.UUID, str, uuid.UUID, uuid.UUID | None, Decimal]]:
    """Every Subcategory row belonging to the user - (id, name, category_id,
    parent_subcategory_id, direct_total) - driven FROM Subcategory (not from BillLineItem), so
    a parent that only has children and no line items assigned to it directly (direct_total=0)
    still appears in the result instead of being invisible. The service rolls a parent's total
    up from its children's totals (line_items_service.get_category_tree) rather than trusting
    this direct_total alone for a non-leaf node."""
    stmt = (
        select(
            Subcategory.id,
            Subcategory.name,
            Subcategory.category_id,
            Subcategory.parent_subcategory_id,
            func.coalesce(func.sum(BillLineItem.line_total), 0),
        )
        .select_from(Subcategory)
        .outerjoin(BillLineItem, BillLineItem.subcategory_id == Subcategory.id)
        .where(Subcategory.user_id == user_id)
        .group_by(
            Subcategory.id,
            Subcategory.name,
            Subcategory.category_id,
            Subcategory.parent_subcategory_id,
        )
    )
    result = await db.execute(stmt)
    return [(row[0], row[1], row[2], row[3], row[4]) for row in result]


async def get_line_items_by_subcategory_ids(
    db: AsyncSession, user_id: uuid.UUID, subcategory_ids: list[uuid.UUID]
) -> list[Row]:
    """Same row shape as get_line_item_table plus subcategory_name - the line items backing one
    node's total in the category tree chart (line_items_service.get_line_items_for_subcategory
    passes in that node's id plus every descendant id, so a parent-with-children node's items
    come back too, not just its own direct assignments)."""
    if not subcategory_ids:
        return []
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
            Subcategory.name.label("subcategory_name"),
        )
        .select_from(BillLineItem)
        .join(Bill, BillLineItem.bill_id == Bill.id)
        .join(Subcategory, BillLineItem.subcategory_id == Subcategory.id)
        .outerjoin(Vendor, Bill.vendor_id == Vendor.id)
        .outerjoin(Category, BillLineItem.category_id == Category.id)
        .where(BillLineItem.user_id == user_id, BillLineItem.subcategory_id.in_(subcategory_ids))
        .order_by(Bill.issue_date.desc().nullslast())
    )
    result = await db.execute(stmt)
    return list(result)


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

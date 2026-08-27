import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import and_, func, select
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bills import Bill
from app.models.categories import Category
from app.models.vendors import Vendor


@dataclass(frozen=True)
class VendorFilters:
    start_date: date | None = None
    end_date: date | None = None
    category_id: uuid.UUID | None = None


def _bill_conditions(user_id: uuid.UUID, filters: VendorFilters) -> list:
    conditions = [Bill.user_id == user_id]
    if filters.start_date is not None:
        conditions.append(Bill.issue_date >= filters.start_date)
    if filters.end_date is not None:
        conditions.append(Bill.issue_date <= filters.end_date)
    if filters.category_id is not None:
        conditions.append(Bill.category_id == filters.category_id)
    return conditions


async def get_total_vendors(db: AsyncSession, user_id: uuid.UUID) -> int:
    stmt = select(func.count(Vendor.id)).where(Vendor.user_id == user_id)
    return (await db.execute(stmt)).scalar_one()


async def get_total_spend(db: AsyncSession, user_id: uuid.UUID, filters: VendorFilters) -> Decimal:
    stmt = select(func.coalesce(func.sum(Bill.total_amount), 0)).where(
        *_bill_conditions(user_id, filters)
    )
    return (await db.execute(stmt)).scalar_one()


async def get_top_vendors_by_spend(
    db: AsyncSession, user_id: uuid.UUID, filters: VendorFilters, limit: int = 10
) -> list[tuple[str, Decimal]]:
    stmt = (
        select(Vendor.name, func.coalesce(func.sum(Bill.total_amount), 0).label("total"))
        .join(Bill, Bill.vendor_id == Vendor.id)
        .where(*_bill_conditions(user_id, filters))
        .group_by(Vendor.id, Vendor.name)
        .order_by(func.sum(Bill.total_amount).desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return [(row.name, row.total) for row in result]


async def get_top_vendors_by_frequency(
    db: AsyncSession, user_id: uuid.UUID, filters: VendorFilters, limit: int = 10
) -> list[tuple[str, int]]:
    stmt = (
        select(Vendor.name, func.count(Bill.id).label("count"))
        .join(Bill, Bill.vendor_id == Vendor.id)
        .where(*_bill_conditions(user_id, filters))
        .group_by(Vendor.id, Vendor.name)
        .order_by(func.count(Bill.id).desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return [(row.name, row.count) for row in result]


async def get_new_vendors_this_month_count(
    db: AsyncSession, user_id: uuid.UUID, month_start: date
) -> int:
    stmt = select(func.count(Vendor.id)).where(
        Vendor.user_id == user_id, Vendor.created_at >= month_start
    )
    return (await db.execute(stmt)).scalar_one()


async def get_new_vendors_over_time(db: AsyncSession, user_id: uuid.UUID) -> list[tuple[date, int]]:
    period = func.date_trunc("month", Vendor.created_at)
    stmt = (
        select(period.label("period"), func.count(Vendor.id).label("count"))
        .where(Vendor.user_id == user_id)
        .group_by(period)
        .order_by(period)
    )
    result = await db.execute(stmt)
    return [(row.period.date(), row.count) for row in result]


async def get_vendor_table(
    db: AsyncSession, user_id: uuid.UUID, filters: VendorFilters
) -> list[Row]:
    # Filters live in the join's ON clause, not WHERE, so a vendor with zero bills in the
    # filtered range still joins (bill_count=0) rather than dropping out of the GROUP BY
    # entirely (see categories_repo's get_category_table for the same reasoning). With no
    # filters active that zero-bill-count row is correct - it's just "this vendor exists,
    # nothing billed yet". But once a filter narrows the table, a zero-count row means "not
    # concerned by this filter", not "belongs in this filtered view" - so those rows are
    # dropped via HAVING, only when a filter is actually set.
    has_filters = (
        filters.start_date is not None
        or filters.end_date is not None
        or filters.category_id is not None
    )
    bill_join_conditions = [Bill.vendor_id == Vendor.id, Bill.user_id == user_id]
    if filters.start_date is not None:
        bill_join_conditions.append(Bill.issue_date >= filters.start_date)
    if filters.end_date is not None:
        bill_join_conditions.append(Bill.issue_date <= filters.end_date)
    if filters.category_id is not None:
        bill_join_conditions.append(Bill.category_id == filters.category_id)

    stmt = (
        select(
            Vendor.id,
            Vendor.name,
            Vendor.key,
            func.count(Bill.id).label("bill_count"),
            func.coalesce(func.sum(Bill.total_amount), 0).label("total_spent"),
            func.coalesce(func.avg(Bill.total_amount), 0).label("avg_bill_amount"),
            func.max(Bill.issue_date).label("last_bill_date"),
        )
        .select_from(Vendor)
        .outerjoin(Bill, and_(*bill_join_conditions))
        .where(Vendor.user_id == user_id)
        .group_by(Vendor.id, Vendor.name, Vendor.key)
        .order_by(func.coalesce(func.sum(Bill.total_amount), 0).desc())
    )
    if has_filters:
        stmt = stmt.having(func.count(Bill.id) > 0)
    result = await db.execute(stmt)
    return list(result)


async def get_vendor_category_counts(
    db: AsyncSession, user_id: uuid.UUID, filters: VendorFilters
) -> list[tuple[uuid.UUID, str, int]]:
    stmt = (
        select(Bill.vendor_id, Category.name, func.count(Bill.id).label("count"))
        .join(Category, Bill.category_id == Category.id)
        .where(*_bill_conditions(user_id, filters), Bill.vendor_id.is_not(None))
        .group_by(Bill.vendor_id, Category.name)
    )
    result = await db.execute(stmt)
    return [(row.vendor_id, row.name, row.count) for row in result]


async def get_vendor(db: AsyncSession, user_id: uuid.UUID, vendor_id: uuid.UUID) -> Vendor | None:
    stmt = select(Vendor).where(Vendor.user_id == user_id, Vendor.id == vendor_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def get_vendor_summary(db: AsyncSession, user_id: uuid.UUID, vendor_id: uuid.UUID) -> dict:
    stmt = select(
        func.count(Bill.id).label("bill_count"),
        func.coalesce(func.sum(Bill.total_amount), 0).label("total_spent"),
        func.coalesce(func.avg(Bill.total_amount), 0).label("avg_bill_amount"),
    ).where(Bill.user_id == user_id, Bill.vendor_id == vendor_id)
    row = (await db.execute(stmt)).one()
    return {
        "bill_count": row.bill_count,
        "total_spent": row.total_spent,
        "avg_bill_amount": row.avg_bill_amount,
    }


async def get_vendor_spending_trend(
    db: AsyncSession, user_id: uuid.UUID, vendor_id: uuid.UUID, granularity: str = "month"
) -> list[tuple[date, Decimal]]:
    period = func.date_trunc(granularity, Bill.issue_date)
    stmt = (
        select(period.label("period"), func.coalesce(func.sum(Bill.total_amount), 0).label("total"))
        .where(Bill.user_id == user_id, Bill.vendor_id == vendor_id, Bill.issue_date.is_not(None))
        .group_by(period)
        .order_by(period)
    )
    result = await db.execute(stmt)
    return [(row.period.date(), row.total) for row in result]


async def get_vendor_bills_history(
    db: AsyncSession, user_id: uuid.UUID, vendor_id: uuid.UUID
) -> list[Bill]:
    stmt = (
        select(Bill)
        .where(Bill.user_id == user_id, Bill.vendor_id == vendor_id)
        .order_by(Bill.issue_date.desc().nullslast(), Bill.created_at.desc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())

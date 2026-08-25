import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import Integer, String, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bills import Bill
from app.models.categories import Category
from app.models.vendors import Vendor


def _shift_months(d: date, months: int) -> date:
    total = d.year * 12 + (d.month - 1) + months
    year, month = divmod(total, 12)
    return date(year, month + 1, 1)


@dataclass(frozen=True)
class SpendFilters:
    start_date: date | None = None
    end_date: date | None = None
    vendor_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None


def _filter_conditions(user_id: uuid.UUID, filters: SpendFilters) -> list:
    conditions = [Bill.user_id == user_id]
    if filters.start_date is not None:
        conditions.append(Bill.issue_date >= filters.start_date)
    if filters.end_date is not None:
        conditions.append(Bill.issue_date <= filters.end_date)
    if filters.vendor_id is not None:
        conditions.append(Bill.vendor_id == filters.vendor_id)
    if filters.category_id is not None:
        conditions.append(Bill.category_id == filters.category_id)
    return conditions


async def get_kpis(db: AsyncSession, user_id: uuid.UUID, filters: SpendFilters) -> dict:
    conditions = _filter_conditions(user_id, filters)

    totals = (
        await db.execute(
            select(
                func.coalesce(func.sum(Bill.total_amount), 0).label("total"),
                func.count(Bill.id).label("count"),
                func.coalesce(func.avg(Bill.total_amount), 0).label("average"),
            ).where(*conditions)
        )
    ).one()

    highest = (
        await db.execute(
            select(Bill.total_amount, Vendor.name)
            .outerjoin(Vendor, Bill.vendor_id == Vendor.id)
            .where(*conditions, Bill.total_amount.is_not(None))
            .order_by(Bill.total_amount.desc())
            .limit(1)
        )
    ).first()

    return {
        "total_spent": totals.total,
        "bills_count": totals.count,
        "average_bill_amount": totals.average,
        "highest_bill_amount": highest[0] if highest else None,
        "highest_bill_vendor_name": highest[1] if highest else None,
    }


async def get_spending_trend(
    db: AsyncSession, user_id: uuid.UUID, filters: SpendFilters, granularity: str
) -> list[tuple[date, Decimal]]:
    period = func.date_trunc(granularity, Bill.issue_date)
    stmt = (
        select(period.label("period"), func.coalesce(func.sum(Bill.total_amount), 0).label("total"))
        .where(*_filter_conditions(user_id, filters), Bill.issue_date.is_not(None))
        .group_by(period)
        .order_by(period)
    )
    result = await db.execute(stmt)
    return [(row.period.date(), row.total) for row in result]


async def get_category_evolution(
    db: AsyncSession, user_id: uuid.UUID, filters: SpendFilters
) -> list[tuple[date, str, Decimal]]:
    period = func.date_trunc("month", Bill.issue_date)
    category_name = func.coalesce(Category.name, "Uncategorized")
    stmt = (
        select(
            period.label("period"),
            category_name.label("category_name"),
            func.coalesce(func.sum(Bill.total_amount), 0).label("total"),
        )
        .select_from(Bill)
        .outerjoin(Category, Bill.category_id == Category.id)
        .where(*_filter_conditions(user_id, filters), Bill.issue_date.is_not(None))
        .group_by(period, category_name)
        .order_by(period)
    )
    result = await db.execute(stmt)
    return [(row.period.date(), row.category_name, row.total) for row in result]


async def get_vendor_evolution(
    db: AsyncSession, user_id: uuid.UUID, filters: SpendFilters, top_n: int = 5
) -> list[tuple[date, str, Decimal]]:
    top_vendor_ids = (
        (
            await db.execute(
                select(Bill.vendor_id)
                .where(*_filter_conditions(user_id, filters), Bill.vendor_id.is_not(None))
                .group_by(Bill.vendor_id)
                .order_by(func.sum(Bill.total_amount).desc())
                .limit(top_n)
            )
        )
        .scalars()
        .all()
    )
    if not top_vendor_ids:
        return []

    period = func.date_trunc("month", Bill.issue_date)
    stmt = (
        select(
            period.label("period"),
            Vendor.name.label("vendor_name"),
            func.coalesce(func.sum(Bill.total_amount), 0).label("total"),
        )
        .join(Vendor, Bill.vendor_id == Vendor.id)
        .where(*_filter_conditions(user_id, filters), Bill.vendor_id.in_(top_vendor_ids))
        .group_by(period, Vendor.name)
        .order_by(period)
    )
    result = await db.execute(stmt)
    return [(row.period.date(), row.vendor_name, row.total) for row in result]


async def get_spending_heatmap(
    db: AsyncSession, user_id: uuid.UUID, filters: SpendFilters
) -> list[tuple[int, int, Decimal]]:
    day_of_week = cast(func.extract("dow", Bill.issue_date), Integer)
    # CAST(... AS integer) in Postgres rounds to nearest, not truncates - an explicit floor()
    # is required here or e.g. day 13 ((13-1)/7 = 1.714) would round up to week 3 instead of
    # flooring into week 2.
    week_of_month = cast(func.floor((func.extract("day", Bill.issue_date) - 1) / 7), Integer) + 1
    stmt = (
        select(
            day_of_week.label("day_of_week"),
            week_of_month.label("week_of_month"),
            func.coalesce(func.sum(Bill.total_amount), 0).label("total"),
        )
        .where(*_filter_conditions(user_id, filters), Bill.issue_date.is_not(None))
        .group_by(day_of_week, week_of_month)
    )
    result = await db.execute(stmt)
    return [(row.day_of_week, row.week_of_month, row.total) for row in result]


async def get_bill_amounts(
    db: AsyncSession, user_id: uuid.UUID, filters: SpendFilters
) -> list[Decimal]:
    stmt = select(Bill.total_amount).where(
        *_filter_conditions(user_id, filters), Bill.total_amount.is_not(None)
    )
    result = await db.execute(stmt)
    return [row[0] for row in result]


async def get_daily_totals(
    db: AsyncSession, user_id: uuid.UUID, filters: SpendFilters, month_start: date
) -> list[tuple[int, Decimal]]:
    month_end = _shift_months(month_start, 1)
    conditions = [
        Bill.user_id == user_id,
        Bill.issue_date >= month_start,
        Bill.issue_date < month_end,
    ]
    if filters.vendor_id is not None:
        conditions.append(Bill.vendor_id == filters.vendor_id)
    if filters.category_id is not None:
        conditions.append(Bill.category_id == filters.category_id)

    day = cast(func.extract("day", Bill.issue_date), Integer)
    stmt = (
        select(day.label("day"), func.coalesce(func.sum(Bill.total_amount), 0).label("total"))
        .where(*conditions)
        .group_by(day)
        .order_by(day)
    )
    result = await db.execute(stmt)
    return [(row.day, row.total) for row in result]


async def get_spending_by_category(
    db: AsyncSession, user_id: uuid.UUID, filters: SpendFilters
) -> list[tuple[str, Decimal]]:
    category_name = func.coalesce(Category.name, "Uncategorized")
    stmt = (
        select(
            category_name.label("category_name"),
            func.coalesce(func.sum(Bill.total_amount), 0).label("total"),
        )
        .select_from(Bill)
        .outerjoin(Category, Bill.category_id == Category.id)
        .where(*_filter_conditions(user_id, filters))
        .group_by(category_name)
        .order_by(func.sum(Bill.total_amount).desc())
    )
    result = await db.execute(stmt)
    return [(row.category_name, row.total) for row in result]


async def get_top_vendors(
    db: AsyncSession, user_id: uuid.UUID, filters: SpendFilters, limit: int = 10
) -> list[tuple[str, Decimal]]:
    stmt = (
        select(Vendor.name, func.coalesce(func.sum(Bill.total_amount), 0).label("total"))
        .join(Bill, Bill.vendor_id == Vendor.id)
        .where(*_filter_conditions(user_id, filters))
        .group_by(Vendor.id, Vendor.name)
        .order_by(func.sum(Bill.total_amount).desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return [(row.name, row.total) for row in result]


async def get_payment_status_breakdown(
    db: AsyncSession, user_id: uuid.UUID, filters: SpendFilters
) -> list[tuple[str, Decimal, int]]:
    stmt = (
        select(
            Bill.payment_status,
            func.coalesce(func.sum(Bill.total_amount), 0).label("total"),
            func.count(Bill.id).label("count"),
        )
        .where(*_filter_conditions(user_id, filters))
        .group_by(Bill.payment_status)
    )
    result = await db.execute(stmt)
    return [(row.payment_status.value, row.total, row.count) for row in result]


async def get_spend_by_document_type(
    db: AsyncSession, user_id: uuid.UUID, filters: SpendFilters
) -> list[tuple[str, Decimal]]:
    # document_type is a strict Postgres enum column - coalescing it directly against a plain
    # string literal would make Postgres try to cast that literal to the enum type and fail, so
    # the column is cast to text first.
    document_type = func.coalesce(cast(Bill.document_type, String), "unknown")
    stmt = (
        select(
            document_type.label("document_type"),
            func.coalesce(func.sum(Bill.total_amount), 0).label("total"),
        )
        .where(*_filter_conditions(user_id, filters))
        .group_by(document_type)
        .order_by(func.sum(Bill.total_amount).desc())
    )
    result = await db.execute(stmt)
    return [(row.document_type, row.total) for row in result]


async def get_recurring_candidates(
    db: AsyncSession, user_id: uuid.UUID, since: date
) -> list[tuple[str, int, Decimal, Decimal | None, date]]:
    month = func.date_trunc("month", Bill.issue_date)
    stmt = (
        select(
            Vendor.name.label("vendor_name"),
            func.count(func.distinct(month)).label("distinct_months"),
            func.avg(Bill.total_amount).label("avg_amount"),
            func.stddev_pop(Bill.total_amount).label("stddev_amount"),
            func.max(Bill.issue_date).label("last_bill_date"),
        )
        .join(Bill, Bill.vendor_id == Vendor.id)
        .where(
            Bill.user_id == user_id,
            Bill.issue_date >= since,
            Bill.issue_date.is_not(None),
            Bill.total_amount.is_not(None),
        )
        .group_by(Vendor.id, Vendor.name)
    )
    result = await db.execute(stmt)
    return [
        (
            row.vendor_name,
            row.distinct_months,
            row.avg_amount,
            row.stddev_amount,
            row.last_bill_date,
        )
        for row in result
    ]


async def get_bills_with_vendor_average(
    db: AsyncSession, user_id: uuid.UUID
) -> list[tuple[uuid.UUID, str, str, Decimal, Decimal]]:
    vendor_average = func.avg(Bill.total_amount).over(partition_by=Bill.vendor_id)
    stmt = (
        select(
            Bill.id,
            Bill.name,
            Vendor.name.label("vendor_name"),
            Bill.total_amount,
            vendor_average.label("vendor_average"),
        )
        .join(Vendor, Bill.vendor_id == Vendor.id)
        .where(Bill.user_id == user_id, Bill.total_amount.is_not(None))
    )
    result = await db.execute(stmt)
    return [
        (row.id, row.name, row.vendor_name, row.total_amount, row.vendor_average) for row in result
    ]


async def get_month_over_month_by_category(
    db: AsyncSession, user_id: uuid.UUID, previous_month_start: date, current_month_end: date
) -> list[tuple[date, str, Decimal]]:
    month = func.date_trunc("month", Bill.issue_date)
    category_name = func.coalesce(Category.name, "Uncategorized")
    stmt = (
        select(
            month.label("period"),
            category_name.label("name"),
            func.coalesce(func.sum(Bill.total_amount), 0).label("total"),
        )
        .select_from(Bill)
        .outerjoin(Category, Bill.category_id == Category.id)
        .where(
            Bill.user_id == user_id,
            Bill.issue_date >= previous_month_start,
            Bill.issue_date < current_month_end,
        )
        .group_by(month, category_name)
    )
    result = await db.execute(stmt)
    return [(row.period.date(), row.name, row.total) for row in result]


async def get_month_over_month_by_vendor(
    db: AsyncSession, user_id: uuid.UUID, previous_month_start: date, current_month_end: date
) -> list[tuple[date, str, Decimal]]:
    month = func.date_trunc("month", Bill.issue_date)
    stmt = (
        select(
            month.label("period"),
            Vendor.name.label("name"),
            func.coalesce(func.sum(Bill.total_amount), 0).label("total"),
        )
        .join(Vendor, Bill.vendor_id == Vendor.id)
        .where(
            Bill.user_id == user_id,
            Bill.issue_date >= previous_month_start,
            Bill.issue_date < current_month_end,
        )
        .group_by(month, Vendor.name)
    )
    result = await db.execute(stmt)
    return [(row.period.date(), row.name, row.total) for row in result]

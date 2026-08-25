import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bills import Bill
from app.models.categories import Category

# The categorizer's suggested taxonomy's catch-all slug (.claude/skills/bill-categories) - a
# user-owned Category row happens to use this slug when it's the "genuine misfits only" bucket.
_CATCH_ALL_SLUGS = ("autre", "other")


@dataclass(frozen=True)
class CategoryFilters:
    start_date: date | None = None
    end_date: date | None = None


def _bill_conditions(user_id: uuid.UUID, filters: CategoryFilters) -> list:
    conditions = [Bill.user_id == user_id]
    if filters.start_date is not None:
        conditions.append(Bill.issue_date >= filters.start_date)
    if filters.end_date is not None:
        conditions.append(Bill.issue_date <= filters.end_date)
    return conditions


async def get_total_categories(db: AsyncSession, user_id: uuid.UUID) -> int:
    stmt = select(func.count(Category.id)).where(Category.user_id == user_id)
    return (await db.execute(stmt)).scalar_one()


async def get_spend_by_category(
    db: AsyncSession, user_id: uuid.UUID, filters: CategoryFilters
) -> list[tuple[str, Decimal]]:
    category_name = func.coalesce(Category.name, "Uncategorized")
    stmt = (
        select(
            category_name.label("category_name"),
            func.coalesce(func.sum(Bill.total_amount), 0).label("total"),
        )
        .select_from(Bill)
        .outerjoin(Category, Bill.category_id == Category.id)
        .where(*_bill_conditions(user_id, filters))
        .group_by(category_name)
        .order_by(func.sum(Bill.total_amount).desc())
    )
    result = await db.execute(stmt)
    return [(row.category_name, row.total) for row in result]


async def get_most_expensive_category(
    db: AsyncSession, user_id: uuid.UUID, filters: CategoryFilters
) -> tuple[str, Decimal] | None:
    stmt = (
        select(Category.name, func.coalesce(func.sum(Bill.total_amount), 0).label("total"))
        .join(Bill, Bill.category_id == Category.id)
        .where(*_bill_conditions(user_id, filters))
        .group_by(Category.id, Category.name)
        .order_by(func.sum(Bill.total_amount).desc())
        .limit(1)
    )
    row = (await db.execute(stmt)).first()
    return (row.name, row.total) if row else None


async def get_uncategorized_bills_count(
    db: AsyncSession, user_id: uuid.UUID, filters: CategoryFilters
) -> int:
    stmt = select(func.count(Bill.id)).where(
        *_bill_conditions(user_id, filters), Bill.category_id.is_(None)
    )
    return (await db.execute(stmt)).scalar_one()


async def get_other_rate(
    db: AsyncSession, user_id: uuid.UUID, filters: CategoryFilters
) -> tuple[int, int]:
    conditions = _bill_conditions(user_id, filters)
    total = (await db.execute(select(func.count(Bill.id)).where(*conditions))).scalar_one()
    other = (
        await db.execute(
            select(func.count(Bill.id))
            .select_from(Bill)
            .join(Category, Bill.category_id == Category.id)
            .where(*conditions, Category.slug.in_(_CATCH_ALL_SLUGS))
        )
    ).scalar_one()
    return other, total


async def get_bill_count_by_category(
    db: AsyncSession, user_id: uuid.UUID, filters: CategoryFilters
) -> list[tuple[str, int]]:
    category_name = func.coalesce(Category.name, "Uncategorized")
    stmt = (
        select(category_name.label("category_name"), func.count(Bill.id).label("count"))
        .select_from(Bill)
        .outerjoin(Category, Bill.category_id == Category.id)
        .where(*_bill_conditions(user_id, filters))
        .group_by(category_name)
        .order_by(func.count(Bill.id).desc())
    )
    result = await db.execute(stmt)
    return [(row.category_name, row.count) for row in result]


async def get_category_evolution(
    db: AsyncSession, user_id: uuid.UUID, filters: CategoryFilters
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
        .where(*_bill_conditions(user_id, filters), Bill.issue_date.is_not(None))
        .group_by(period, category_name)
        .order_by(period)
    )
    result = await db.execute(stmt)
    return [(row.period.date(), row.category_name, row.total) for row in result]


async def get_uncategorized_trend(
    db: AsyncSession, user_id: uuid.UUID, filters: CategoryFilters
) -> list[tuple[date, int, Decimal]]:
    period = func.date_trunc("month", Bill.issue_date)
    stmt = (
        select(
            period.label("period"),
            func.count(Bill.id).label("count"),
            func.coalesce(func.sum(Bill.total_amount), 0).label("total"),
        )
        .where(
            *_bill_conditions(user_id, filters),
            Bill.issue_date.is_not(None),
            Bill.category_id.is_(None),
        )
        .group_by(period)
        .order_by(period)
    )
    result = await db.execute(stmt)
    return [(row.period.date(), row.count, row.total) for row in result]


async def get_other_rate_trend(
    db: AsyncSession, user_id: uuid.UUID, filters: CategoryFilters
) -> list[tuple[date, int, int]]:
    period = func.date_trunc("month", Bill.issue_date)
    is_other = case((Category.slug.in_(_CATCH_ALL_SLUGS), 1), else_=0)
    stmt = (
        select(
            period.label("period"),
            func.sum(is_other).label("other_count"),
            func.count(Bill.id).label("total_count"),
        )
        .select_from(Bill)
        .outerjoin(Category, Bill.category_id == Category.id)
        .where(*_bill_conditions(user_id, filters), Bill.issue_date.is_not(None))
        .group_by(period)
        .order_by(period)
    )
    result = await db.execute(stmt)
    return [(row.period.date(), int(row.other_count), row.total_count) for row in result]


async def get_category_table(
    db: AsyncSession, user_id: uuid.UUID, filters: CategoryFilters
) -> list[tuple[uuid.UUID, str, int, Decimal, Decimal]]:
    # Date-range filters must live in the join's ON clause, not a WHERE clause: this is a LEFT
    # JOIN so categories with zero bills in the filtered range still appear (bill_count=0), and
    # a WHERE-clause filter on Bill.issue_date would incorrectly drop those rows entirely, since
    # NULL >= <date> is NULL (falsy) for the outer-joined non-matching side.
    bill_join_conditions = [Bill.category_id == Category.id, Bill.user_id == user_id]
    if filters.start_date is not None:
        bill_join_conditions.append(Bill.issue_date >= filters.start_date)
    if filters.end_date is not None:
        bill_join_conditions.append(Bill.issue_date <= filters.end_date)

    stmt = (
        select(
            Category.id,
            Category.name,
            func.count(Bill.id).label("bill_count"),
            func.coalesce(func.sum(Bill.total_amount), 0).label("total_spent"),
            func.coalesce(func.avg(Bill.total_amount), 0).label("avg_bill_amount"),
        )
        .select_from(Category)
        .outerjoin(Bill, and_(*bill_join_conditions))
        .where(Category.user_id == user_id)
        .group_by(Category.id, Category.name)
        .order_by(func.coalesce(func.sum(Bill.total_amount), 0).desc())
    )
    result = await db.execute(stmt)
    return [
        (row.id, row.name, row.bill_count, row.total_spent, row.avg_bill_amount) for row in result
    ]

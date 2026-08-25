import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.bills import Bill
from app.models.categories import Category
from app.models.elicitations import Elicitation, ElicitationStatus
from app.models.vendors import Vendor


def _shift_months(d: date, months: int) -> date:
    total = d.year * 12 + (d.month - 1) + months
    year, month = divmod(total, 12)
    return date(year, month + 1, 1)


async def get_spending_trend(
    db: AsyncSession, user_id: uuid.UUID, granularity: str, since: date
) -> list[tuple[date, Decimal]]:
    period = func.date_trunc(granularity, Bill.issue_date)
    stmt = (
        select(period.label("period"), func.coalesce(func.sum(Bill.total_amount), 0).label("total"))
        .where(Bill.user_id == user_id, Bill.issue_date.is_not(None), Bill.issue_date >= since)
        .group_by(period)
        .order_by(period)
    )
    result = await db.execute(stmt)
    return [(row.period.date(), row.total) for row in result]


async def get_kpis(db: AsyncSession, user_id: uuid.UUID, today: date | None = None) -> dict:
    today = today or date.today()
    current_month_start = today.replace(day=1)
    previous_month_start = _shift_months(current_month_start, -1)
    month_before_previous_start = _shift_months(current_month_start, -2)

    trend = await get_spending_trend(db, user_id, "month", month_before_previous_start)
    totals_by_month = dict(trend)

    current_total = totals_by_month.get(current_month_start, Decimal("0"))
    previous_total = totals_by_month.get(previous_month_start, Decimal("0"))
    month_before_previous_total = totals_by_month.get(month_before_previous_start, Decimal("0"))

    delta_pct = None
    if month_before_previous_total:
        delta_pct = (
            (previous_total - month_before_previous_total) / month_before_previous_total * 100
        )

    next_month_start = _shift_months(current_month_start, 1)
    bills_processed = (
        await db.execute(
            select(func.count(Bill.id)).where(
                Bill.user_id == user_id,
                Bill.issue_date.is_not(None),
                Bill.issue_date >= current_month_start,
                Bill.issue_date < next_month_start,
            )
        )
    ).scalar_one()

    pending_elicitations = (
        await db.execute(
            select(func.count(Elicitation.id)).where(
                Elicitation.user_id == user_id, Elicitation.status == ElicitationStatus.PENDING
            )
        )
    ).scalar_one()

    total_bills = (
        await db.execute(select(func.count(Bill.id)).where(Bill.user_id == user_id))
    ).scalar_one()

    has_elicitation = exists(select(Elicitation.id).where(Elicitation.bill_id == Bill.id))
    bills_without_elicitation = (
        await db.execute(
            select(func.count(Bill.id)).where(Bill.user_id == user_id, ~has_elicitation)
        )
    ).scalar_one()

    auto_resolved_rate = (
        Decimal(bills_without_elicitation) / Decimal(total_bills) * 100
        if total_bills
        else Decimal("0")
    )

    return {
        "total_spent_current_month": current_total,
        "total_spent_previous_month": previous_total,
        "spend_delta_pct": delta_pct,
        "bills_processed_current_month": bills_processed,
        "pending_elicitations": pending_elicitations,
        "auto_resolved_rate": auto_resolved_rate,
    }


async def get_top_vendors(
    db: AsyncSession, user_id: uuid.UUID, limit: int = 5
) -> list[tuple[str, Decimal]]:
    # Scoped to the "courses" (groceries) category - see .claude/skills/bill-categories: it's
    # the categorizer's canonical slug for supermarkets/grocery delivery, not a one-off label,
    # so every user ends up with a category matching it. A cross-category vendor ranking mixes
    # a recurring weekly grocery run with e.g. rent, which isn't a meaningful comparison -
    # groceries-only is the one vendor breakdown that is.
    stmt = (
        select(Vendor.name, func.coalesce(func.sum(Bill.total_amount), 0).label("total"))
        .join(Bill, Bill.vendor_id == Vendor.id)
        .join(Category, Bill.category_id == Category.id)
        .where(Bill.user_id == user_id, Category.slug == "courses")
        .group_by(Vendor.id, Vendor.name)
        .order_by(func.sum(Bill.total_amount).desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return [(row.name, row.total) for row in result]


async def get_spending_by_category(
    db: AsyncSession, user_id: uuid.UUID
) -> list[tuple[str, Decimal]]:
    category_name = func.coalesce(Category.name, "Uncategorized")
    stmt = (
        select(
            category_name.label("category_name"),
            func.coalesce(func.sum(Bill.total_amount), 0).label("total"),
        )
        .select_from(Bill)
        .outerjoin(Category, Bill.category_id == Category.id)
        .where(Bill.user_id == user_id)
        .group_by(category_name)
        .order_by(func.sum(Bill.total_amount).desc())
    )
    result = await db.execute(stmt)
    return [(row.category_name, row.total) for row in result]


async def get_recent_uploads(db: AsyncSession, user_id: uuid.UUID, limit: int = 10) -> list[Bill]:
    stmt = (
        select(Bill)
        .where(Bill.user_id == user_id)
        .options(selectinload(Bill.vendor))
        .order_by(Bill.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_pending_questions(
    db: AsyncSession, user_id: uuid.UUID, limit: int = 5
) -> list[Elicitation]:
    stmt = (
        select(Elicitation)
        .where(Elicitation.user_id == user_id, Elicitation.status == ElicitationStatus.PENDING)
        .options(selectinload(Elicitation.bill).selectinload(Bill.vendor))
        .order_by(Elicitation.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())

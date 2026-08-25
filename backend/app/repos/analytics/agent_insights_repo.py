import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bills import Bill, BillStage
from app.models.categories import Category
from app.models.elicitations import Elicitation


async def get_avg_confidence(db: AsyncSession, user_id: uuid.UUID) -> Decimal | None:
    stmt = select(func.avg(Bill.confidence)).where(Bill.user_id == user_id)
    return (await db.execute(stmt)).scalar_one()


async def get_auto_resolved_rate_inputs(db: AsyncSession, user_id: uuid.UUID) -> tuple[int, int]:
    total = (
        await db.execute(select(func.count(Bill.id)).where(Bill.user_id == user_id))
    ).scalar_one()
    has_elicitation = exists(select(Elicitation.id).where(Elicitation.bill_id == Bill.id))
    without = (
        await db.execute(
            select(func.count(Bill.id)).where(Bill.user_id == user_id, ~has_elicitation)
        )
    ).scalar_one()
    return without, total


async def get_ocr_rate_inputs(db: AsyncSession, user_id: uuid.UUID) -> tuple[int, int]:
    stmt = select(
        func.count(Bill.id).filter(Bill.extraction_strategy == "ocr"),
        func.count(Bill.id).filter(Bill.extraction_strategy.is_not(None)),
    ).where(Bill.user_id == user_id)
    row = (await db.execute(stmt)).one()
    return row[0], row[1]


async def get_bills_in_backlog_count(db: AsyncSession, user_id: uuid.UUID) -> int:
    stmt = select(func.count(Bill.id)).where(
        Bill.user_id == user_id, Bill.current_stage != BillStage.COMPLETE
    )
    return (await db.execute(stmt)).scalar_one()


async def get_confidence_trend(
    db: AsyncSession, user_id: uuid.UUID
) -> list[tuple[date, Decimal | None]]:
    period = func.date_trunc("month", Bill.issue_date)
    stmt = (
        select(period.label("period"), func.avg(Bill.confidence).label("avg_confidence"))
        .where(Bill.user_id == user_id, Bill.issue_date.is_not(None))
        .group_by(period)
        .order_by(period)
    )
    result = await db.execute(stmt)
    return [(row.period.date(), row.avg_confidence) for row in result]


async def get_confidence_by_category(
    db: AsyncSession, user_id: uuid.UUID
) -> list[tuple[str, Decimal | None, int]]:
    category_name = func.coalesce(Category.name, "Uncategorized")
    stmt = (
        select(
            category_name.label("category_name"),
            func.avg(Bill.confidence).label("avg_confidence"),
            func.count(Bill.id).label("count"),
        )
        .select_from(Bill)
        .outerjoin(Category, Bill.category_id == Category.id)
        .where(Bill.user_id == user_id)
        .group_by(category_name)
        .order_by(func.avg(Bill.confidence).asc().nullslast())
    )
    result = await db.execute(stmt)
    return [(row.category_name, row.avg_confidence, row.count) for row in result]


async def get_extraction_strategy_effectiveness(
    db: AsyncSession, user_id: uuid.UUID
) -> list[tuple[str, Decimal | None, int]]:
    strategy = func.coalesce(Bill.extraction_strategy, "unknown")
    stmt = (
        select(
            strategy.label("strategy"),
            func.avg(Bill.confidence).label("avg_confidence"),
            func.count(Bill.id).label("count"),
        )
        .where(Bill.user_id == user_id)
        .group_by(strategy)
    )
    result = await db.execute(stmt)
    return [(row.strategy, row.avg_confidence, row.count) for row in result]


async def get_confidence_values(db: AsyncSession, user_id: uuid.UUID) -> list[Decimal]:
    stmt = select(Bill.confidence).where(Bill.user_id == user_id, Bill.confidence.is_not(None))
    result = await db.execute(stmt)
    return [row[0] for row in result]


async def get_stage_counts(db: AsyncSession, user_id: uuid.UUID) -> list[tuple[str, int]]:
    stmt = (
        select(Bill.current_stage, func.count(Bill.id).label("count"))
        .where(Bill.user_id == user_id)
        .group_by(Bill.current_stage)
    )
    result = await db.execute(stmt)
    return [(row.current_stage.value, row.count) for row in result]

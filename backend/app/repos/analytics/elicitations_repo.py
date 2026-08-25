import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.elicitations import Elicitation


async def get_status_counts(db: AsyncSession, user_id: uuid.UUID) -> list[tuple[str, int]]:
    stmt = (
        select(Elicitation.status, func.count(Elicitation.id).label("count"))
        .where(Elicitation.user_id == user_id)
        .group_by(Elicitation.status)
    )
    result = await db.execute(stmt)
    return [(row.status.value, row.count) for row in result]


async def get_elicitation_rate_over_time(
    db: AsyncSession, user_id: uuid.UUID
) -> list[tuple[date, int]]:
    period = func.date_trunc("month", Elicitation.created_at)
    stmt = (
        select(period.label("period"), func.count(Elicitation.id).label("count"))
        .where(Elicitation.user_id == user_id)
        .group_by(period)
        .order_by(period)
    )
    result = await db.execute(stmt)
    return [(row.period.date(), row.count) for row in result]


async def get_elicitations_by_stage(db: AsyncSession, user_id: uuid.UUID) -> list[tuple[str, int]]:
    stmt = (
        select(Elicitation.stage, func.count(Elicitation.id).label("count"))
        .where(Elicitation.user_id == user_id)
        .group_by(Elicitation.stage)
    )
    result = await db.execute(stmt)
    return [(row.stage.value, row.count) for row in result]

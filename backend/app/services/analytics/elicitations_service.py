import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.elicitations import ElicitationStage
from app.repos.analytics import (
    agent_insights_repo,
    categories_repo,
    elicitations_repo,
    overview_repo,
)
from app.repos.analytics.categories_repo import CategoryFilters
from app.schemas.analytics.elicitations import (
    ElicitationRatePoint,
    ElicitationsAnalyticsResponse,
    ElicitationsByStage,
    ElicitationsKPIs,
)
from app.schemas.analytics.overview import PendingQuestion

_STAGE_ORDER = [stage.value for stage in ElicitationStage]


def _fill_stages(stage_counts: list[tuple[str, int]]) -> list[ElicitationsByStage]:
    counts_by_stage = dict(stage_counts)
    return [
        ElicitationsByStage(stage=stage, count=counts_by_stage.get(stage, 0))
        for stage in _STAGE_ORDER
    ]


async def get_elicitations_analytics(
    db: AsyncSession, user_id: uuid.UUID
) -> ElicitationsAnalyticsResponse:
    status_counts = dict(await elicitations_repo.get_status_counts(db, user_id))
    pending_count = status_counts.get("pending", 0)
    answered_count = status_counts.get("answered", 0)
    expired_count = status_counts.get("expired", 0)
    total = pending_count + answered_count + expired_count
    expiration_rate = Decimal(expired_count) / Decimal(total) * 100 if total else Decimal("0")

    # Reused from other sections rather than recomputed - same "Avg confidence"/"Uncategorized
    # bills count" the proposal explicitly carries over from Overview.
    avg_confidence = await agent_insights_repo.get_avg_confidence(db, user_id)
    uncategorized_count = await categories_repo.get_uncategorized_bills_count(
        db, user_id, CategoryFilters()
    )

    rate_rows = await elicitations_repo.get_elicitation_rate_over_time(db, user_id)
    stage_rows = await elicitations_repo.get_elicitations_by_stage(db, user_id)
    pending_rows = await overview_repo.get_pending_questions(db, user_id, limit=5)

    return ElicitationsAnalyticsResponse(
        kpis=ElicitationsKPIs(
            pending_count=pending_count,
            answered_count=answered_count,
            expired_count=expired_count,
            expiration_rate=expiration_rate,
            avg_confidence=avg_confidence,
            uncategorized_bills_count=uncategorized_count,
        ),
        elicitation_rate_over_time=[
            ElicitationRatePoint(period=period, count=count) for period, count in rate_rows
        ],
        elicitations_by_stage=_fill_stages(stage_rows),
        pending_questions=[
            PendingQuestion(
                elicitation_id=elicitation.id,
                bill_id=elicitation.bill_id,
                bill_name=elicitation.bill.name,
                vendor_name=elicitation.bill.vendor.name if elicitation.bill.vendor else None,
                amount=elicitation.bill.total_amount,
                question=elicitation.question,
            )
            for elicitation in pending_rows
        ],
    )

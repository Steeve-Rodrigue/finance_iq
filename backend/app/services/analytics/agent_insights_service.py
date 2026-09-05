import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bills import BillStage
from app.repos.analytics import agent_insights_repo
from app.schemas.analytics.agent_insights import (
    AgentInsightsKPIs,
    AgentInsightsResponse,
    ConfidenceByCategory,
    ConfidenceHistogramBucket,
    ConfidenceTrendPoint,
    ExtractionStrategyConfidence,
    StageFunnelStep,
)

_CONFIDENCE_BUCKET_COUNT = 10
_STAGE_ORDER = [stage.value for stage in BillStage]


def _build_confidence_histogram(values: list[Decimal]) -> list[ConfidenceHistogramBucket]:
    # A fixed [0, 1] range, unlike Spend Analytics' min/max-based histogram: confidence has a
    # known, meaningful domain, so buckets stay comparable across time instead of rescaling to
    # whatever range this user's bills happen to span.
    width = Decimal(1) / _CONFIDENCE_BUCKET_COUNT
    counts = [0] * _CONFIDENCE_BUCKET_COUNT
    for value in values:
        index = min(int(value / width), _CONFIDENCE_BUCKET_COUNT - 1)
        counts[index] += 1
    return [
        ConfidenceHistogramBucket(range_start=width * i, range_end=width * (i + 1), count=count)
        for i, count in enumerate(counts)
    ]


def _build_stage_funnel(stage_counts: list[tuple[str, int]]) -> list[StageFunnelStep]:
    counts_by_stage = dict(stage_counts)
    return [
        StageFunnelStep(stage=stage, count=counts_by_stage.get(stage, 0)) for stage in _STAGE_ORDER
    ]


async def get_agent_insights(db: AsyncSession, user_id: uuid.UUID) -> AgentInsightsResponse:
    avg_confidence = await agent_insights_repo.get_avg_confidence(db, user_id)
    without_elicitation, total_bills = await agent_insights_repo.get_auto_resolved_rate_inputs(
        db, user_id
    )
    backlog_count = await agent_insights_repo.get_bills_in_backlog_count(db, user_id)

    trend_rows = await agent_insights_repo.get_confidence_trend(db, user_id)
    category_rows = await agent_insights_repo.get_confidence_by_category(db, user_id)
    strategy_rows = await agent_insights_repo.get_extraction_strategy_effectiveness(db, user_id)
    confidence_values = await agent_insights_repo.get_confidence_values(db, user_id)
    stage_counts = await agent_insights_repo.get_stage_counts(db, user_id)

    auto_resolved_rate = (
        Decimal(without_elicitation) / Decimal(total_bills) * 100 if total_bills else Decimal("0")
    )

    return AgentInsightsResponse(
        kpis=AgentInsightsKPIs(
            avg_confidence=avg_confidence,
            auto_resolved_rate=auto_resolved_rate,
            bills_in_backlog=backlog_count,
        ),
        confidence_trend=[
            ConfidenceTrendPoint(period=period, avg_confidence=avg) for period, avg in trend_rows
        ],
        confidence_by_category=[
            ConfidenceByCategory(category_name=name, avg_confidence=avg, bill_count=count)
            for name, avg, count in category_rows
        ],
        extraction_strategy_effectiveness=[
            ExtractionStrategyConfidence(
                extraction_strategy=strategy, avg_confidence=avg, bill_count=count
            )
            for strategy, avg, count in strategy_rows
        ],
        confidence_distribution=_build_confidence_histogram(confidence_values),
        current_stage_funnel=_build_stage_funnel(stage_counts),
    )

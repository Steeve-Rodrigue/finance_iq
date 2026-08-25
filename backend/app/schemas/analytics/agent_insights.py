from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class AgentInsightsKPIs(BaseModel):
    avg_confidence: Decimal | None
    auto_resolved_rate: Decimal
    ocr_rate: Decimal | None
    bills_in_backlog: int


class ConfidenceTrendPoint(BaseModel):
    period: date
    avg_confidence: Decimal | None


class ConfidenceByCategory(BaseModel):
    category_name: str
    avg_confidence: Decimal | None
    bill_count: int


class ExtractionStrategyConfidence(BaseModel):
    extraction_strategy: str
    avg_confidence: Decimal | None
    bill_count: int


class ConfidenceHistogramBucket(BaseModel):
    range_start: Decimal
    range_end: Decimal
    count: int


class StageFunnelStep(BaseModel):
    stage: str
    count: int


class AgentInsightsResponse(BaseModel):
    kpis: AgentInsightsKPIs
    confidence_trend: list[ConfidenceTrendPoint]
    confidence_by_category: list[ConfidenceByCategory]
    extraction_strategy_effectiveness: list[ExtractionStrategyConfidence]
    confidence_distribution: list[ConfidenceHistogramBucket]
    current_stage_funnel: list[StageFunnelStep]

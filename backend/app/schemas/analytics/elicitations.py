from datetime import date
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.analytics.overview import PendingQuestion


class ElicitationsKPIs(BaseModel):
    pending_count: int
    answered_count: int
    expired_count: int
    expiration_rate: Decimal
    avg_confidence: Decimal | None
    uncategorized_bills_count: int


class ElicitationRatePoint(BaseModel):
    period: date
    count: int


class ElicitationsByStage(BaseModel):
    stage: str
    count: int


class ElicitationsAnalyticsResponse(BaseModel):
    kpis: ElicitationsKPIs
    elicitation_rate_over_time: list[ElicitationRatePoint]
    elicitations_by_stage: list[ElicitationsByStage]
    pending_questions: list[PendingQuestion]

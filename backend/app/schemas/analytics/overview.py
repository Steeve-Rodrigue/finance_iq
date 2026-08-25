import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class OverviewKPIs(BaseModel):
    total_spent_current_month: Decimal
    total_spent_previous_month: Decimal
    # None when there's no month-before-previous data to compare against (e.g. new account).
    spend_delta_pct: Decimal | None
    bills_processed_current_month: int
    pending_elicitations: int
    auto_resolved_rate: Decimal


class TrendPoint(BaseModel):
    period: date
    total: Decimal


class VendorSpend(BaseModel):
    vendor_name: str
    total: Decimal


class CategorySpend(BaseModel):
    category_name: str
    total: Decimal


class RecentUpload(BaseModel):
    bill_id: uuid.UUID
    name: str
    vendor_name: str | None
    total_amount: Decimal | None
    confidence: Decimal | None
    current_stage: str


class PendingQuestion(BaseModel):
    elicitation_id: uuid.UUID
    bill_id: uuid.UUID
    bill_name: str
    vendor_name: str | None
    amount: Decimal | None
    question: str


class OverviewResponse(BaseModel):
    kpis: OverviewKPIs
    spending_trend: list[TrendPoint]
    top_vendors: list[VendorSpend]
    spending_by_category: list[CategorySpend]
    recent_uploads: list[RecentUpload]
    pending_questions: list[PendingQuestion]

import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.analytics.overview import CategorySpend, TrendPoint, VendorSpend


class SpendKPIs(BaseModel):
    total_spent: Decimal
    bills_count: int
    average_bill_amount: Decimal
    highest_bill_amount: Decimal | None
    highest_bill_vendor_name: str | None


class CategoryEvolutionPoint(BaseModel):
    period: date
    category_name: str
    total: Decimal


class VendorEvolutionPoint(BaseModel):
    period: date
    vendor_name: str
    total: Decimal


class HeatmapCell(BaseModel):
    day_of_week: int
    week_of_month: int
    total: Decimal


class HistogramBucket(BaseModel):
    range_start: Decimal
    range_end: Decimal
    count: int


class VelocityPoint(BaseModel):
    day_of_month: int
    cumulative_current_month: Decimal
    cumulative_previous_month: Decimal


class PaymentStatusBreakdown(BaseModel):
    payment_status: str
    total: Decimal
    count: int


class DocumentTypeSpend(BaseModel):
    document_type: str
    total: Decimal


class RecurringBill(BaseModel):
    vendor_name: str
    avg_amount: Decimal
    frequency: int
    last_bill_date: date


class Outlier(BaseModel):
    bill_id: uuid.UUID
    bill_name: str
    vendor_name: str
    total_amount: Decimal
    vendor_average: Decimal
    deviation_ratio: Decimal


class MonthOverMonthRow(BaseModel):
    name: str
    current_month: Decimal
    previous_month: Decimal
    delta_pct: Decimal | None


class SpendAnalyticsResponse(BaseModel):
    kpis: SpendKPIs
    spending_trend: list[TrendPoint]
    category_evolution: list[CategoryEvolutionPoint]
    vendor_evolution: list[VendorEvolutionPoint]
    spending_heatmap: list[HeatmapCell]
    bill_size_distribution: list[HistogramBucket]
    spending_velocity: list[VelocityPoint]
    spending_by_category: list[CategorySpend]
    top_vendors: list[VendorSpend]
    payment_status_breakdown: list[PaymentStatusBreakdown]
    spend_by_document_type: list[DocumentTypeSpend]
    recurring_bills: list[RecurringBill]
    outliers: list[Outlier]
    month_over_month_by_category: list[MonthOverMonthRow]
    month_over_month_by_vendor: list[MonthOverMonthRow]

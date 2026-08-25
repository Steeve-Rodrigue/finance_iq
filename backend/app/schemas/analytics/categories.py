import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class CategoriesKPIs(BaseModel):
    total_categories: int
    most_expensive_category_name: str | None
    most_expensive_category_total: Decimal | None
    uncategorized_bills_count: int
    other_rate: Decimal


class CategorySpendBar(BaseModel):
    category_name: str
    total: Decimal


class CategoryCount(BaseModel):
    category_name: str
    bill_count: int


class CategoryEvolutionPoint(BaseModel):
    period: date
    category_name: str
    total: Decimal


class UncategorizedTrendPoint(BaseModel):
    period: date
    count: int
    total: Decimal


class OtherRateTrendPoint(BaseModel):
    period: date
    other_rate: Decimal


class CategoryTableRow(BaseModel):
    category_id: uuid.UUID
    name: str
    bill_count: int
    total_spent: Decimal
    avg_bill_amount: Decimal
    pct_of_total_spend: Decimal


class CategoriesAnalyticsResponse(BaseModel):
    kpis: CategoriesKPIs
    spend_by_category: list[CategorySpendBar]
    bill_count_by_category: list[CategoryCount]
    category_evolution: list[CategoryEvolutionPoint]
    uncategorized_trend: list[UncategorizedTrendPoint]
    other_rate_trend: list[OtherRateTrendPoint]
    category_table: list[CategoryTableRow]

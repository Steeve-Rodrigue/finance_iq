import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class LineItemsKPIs(BaseModel):
    total_line_items: int
    most_purchased_item_name: str | None
    most_purchased_item_count: int | None
    categorization_gap_pct: Decimal


class ItemFrequency(BaseModel):
    common_name: str
    count: int


class ItemSpend(BaseModel):
    common_name: str
    total: Decimal


class UnitPriceTrendPoint(BaseModel):
    common_name: str
    period: date
    avg_unit_price: Decimal


class LineItemTableRow(BaseModel):
    line_item_id: uuid.UUID
    bill_id: uuid.UUID
    bill_name: str
    description: str
    common_name: str | None
    quantity: Decimal | None
    unit_price: Decimal | None
    line_total: Decimal
    vendor_name: str | None
    category_name: str | None


class LineItemsAnalyticsResponse(BaseModel):
    kpis: LineItemsKPIs
    most_frequent_items: list[ItemFrequency]
    top_items_by_spend: list[ItemSpend]
    unit_price_trend: list[UnitPriceTrendPoint]
    line_item_table: list[LineItemTableRow]

import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class VendorsKPIs(BaseModel):
    total_vendors: int
    top_vendor_name: str | None
    top_vendor_total: Decimal | None
    new_vendors_this_month: int
    vendor_concentration_pct: Decimal


class VendorSpendBar(BaseModel):
    vendor_name: str
    total: Decimal


class VendorFrequencyBar(BaseModel):
    vendor_name: str
    bill_count: int


class NewVendorsPoint(BaseModel):
    period: date
    count: int


class RecurringVendor(BaseModel):
    vendor_name: str
    avg_amount: Decimal
    frequency: int
    last_bill_date: date


class VendorTableRow(BaseModel):
    vendor_id: uuid.UUID
    name: str
    key: str
    bill_count: int
    total_spent: Decimal
    avg_bill_amount: Decimal
    last_bill_date: date | None
    most_frequent_category: str | None


class VendorsAnalyticsResponse(BaseModel):
    kpis: VendorsKPIs
    top_vendors_by_spend: list[VendorSpendBar]
    top_vendors_by_frequency: list[VendorFrequencyBar]
    new_vendors_over_time: list[NewVendorsPoint]
    recurring_vendors: list[RecurringVendor]
    vendor_table: list[VendorTableRow]


class VendorSpendingTrendPoint(BaseModel):
    period: date
    total: Decimal


class VendorBillHistoryRow(BaseModel):
    bill_id: uuid.UUID
    name: str
    total_amount: Decimal | None
    issue_date: date | None
    status: str
    confidence: Decimal | None


class VendorDetailResponse(BaseModel):
    vendor_id: uuid.UUID
    name: str
    address: str | None
    total_spent: Decimal
    bill_count: int
    avg_bill_amount: Decimal
    spending_trend: list[VendorSpendingTrendPoint]
    bills_history: list[VendorBillHistoryRow]

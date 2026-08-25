import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import NotFoundError
from app.repos.analytics import spend_repo, vendors_repo
from app.repos.analytics.vendors_repo import VendorFilters
from app.schemas.analytics.vendors import (
    NewVendorsPoint,
    RecurringVendor,
    VendorBillHistoryRow,
    VendorDetailResponse,
    VendorFrequencyBar,
    VendorsAnalyticsResponse,
    VendorsKPIs,
    VendorSpendBar,
    VendorSpendingTrendPoint,
    VendorTableRow,
)
from app.services.analytics.spend_service import build_recurring_bills

_RECURRING_LOOKBACK_MONTHS = 6


def _shift_months(d: date, months: int) -> date:
    total = d.year * 12 + (d.month - 1) + months
    year, month = divmod(total, 12)
    return date(year, month + 1, 1)


async def get_vendors_analytics(
    db: AsyncSession, user_id: uuid.UUID, filters: VendorFilters
) -> VendorsAnalyticsResponse:
    current_month_start = date.today().replace(day=1)
    recurring_since = _shift_months(current_month_start, -(_RECURRING_LOOKBACK_MONTHS - 1))

    total_vendors = await vendors_repo.get_total_vendors(db, user_id)
    top_spend_rows = await vendors_repo.get_top_vendors_by_spend(db, user_id, filters, limit=10)
    top_frequency_rows = await vendors_repo.get_top_vendors_by_frequency(
        db, user_id, filters, limit=10
    )
    new_vendors_this_month = await vendors_repo.get_new_vendors_this_month_count(
        db, user_id, current_month_start
    )
    new_vendors_over_time_rows = await vendors_repo.get_new_vendors_over_time(db, user_id)
    total_spend = await vendors_repo.get_total_spend(db, user_id, filters)
    table_rows = await vendors_repo.get_vendor_table(db, user_id, filters)
    category_count_rows = await vendors_repo.get_vendor_category_counts(db, user_id, filters)
    # Same detection heuristic already built for Spend Analytics - "recurring" isn't a
    # section-specific concept, just reused via its repo query + classification helper.
    recurring_candidates = await spend_repo.get_recurring_candidates(db, user_id, recurring_since)

    top3_total = sum((total for _, total in top_spend_rows[:3]), Decimal("0"))
    concentration = top3_total / total_spend * 100 if total_spend else Decimal("0")

    most_frequent_category: dict[uuid.UUID, tuple[str, int]] = {}
    for vendor_id, category_name, count in category_count_rows:
        current = most_frequent_category.get(vendor_id)
        if current is None or count > current[1]:
            most_frequent_category[vendor_id] = (category_name, count)

    return VendorsAnalyticsResponse(
        kpis=VendorsKPIs(
            total_vendors=total_vendors,
            top_vendor_name=top_spend_rows[0][0] if top_spend_rows else None,
            top_vendor_total=top_spend_rows[0][1] if top_spend_rows else None,
            new_vendors_this_month=new_vendors_this_month,
            vendor_concentration_pct=concentration,
        ),
        top_vendors_by_spend=[VendorSpendBar(vendor_name=n, total=t) for n, t in top_spend_rows],
        top_vendors_by_frequency=[
            VendorFrequencyBar(vendor_name=n, bill_count=c) for n, c in top_frequency_rows
        ],
        new_vendors_over_time=[
            NewVendorsPoint(period=p, count=c) for p, c in new_vendors_over_time_rows
        ],
        recurring_vendors=[
            RecurringVendor(
                vendor_name=r.vendor_name,
                avg_amount=r.avg_amount,
                frequency=r.frequency,
                last_bill_date=r.last_bill_date,
            )
            for r in build_recurring_bills(recurring_candidates)
        ],
        vendor_table=[
            VendorTableRow(
                vendor_id=row.id,
                name=row.name,
                key=row.key,
                bill_count=row.bill_count,
                total_spent=row.total_spent,
                avg_bill_amount=row.avg_bill_amount,
                last_bill_date=row.last_bill_date,
                most_frequent_category=most_frequent_category.get(row.id, (None, 0))[0],
            )
            for row in table_rows
        ],
    )


async def get_vendor_detail(
    db: AsyncSession, user_id: uuid.UUID, vendor_id: uuid.UUID
) -> VendorDetailResponse:
    vendor = await vendors_repo.get_vendor(db, user_id, vendor_id)
    if vendor is None:
        raise NotFoundError(f"vendor {vendor_id} not found")

    summary = await vendors_repo.get_vendor_summary(db, user_id, vendor_id)
    trend_rows = await vendors_repo.get_vendor_spending_trend(db, user_id, vendor_id)
    bills = await vendors_repo.get_vendor_bills_history(db, user_id, vendor_id)

    return VendorDetailResponse(
        vendor_id=vendor.id,
        name=vendor.name,
        address=vendor.address,
        total_spent=summary["total_spent"],
        bill_count=summary["bill_count"],
        avg_bill_amount=summary["avg_bill_amount"],
        spending_trend=[VendorSpendingTrendPoint(period=p, total=t) for p, t in trend_rows],
        bills_history=[
            VendorBillHistoryRow(
                bill_id=bill.id,
                name=bill.name,
                total_amount=bill.total_amount,
                issue_date=bill.issue_date,
                status=bill.status.value,
                confidence=bill.confidence,
            )
            for bill in bills
        ],
    )

import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.repos.analytics import overview_repo
from app.schemas.analytics.overview import (
    CategorySpend,
    OverviewKPIs,
    OverviewResponse,
    PendingQuestion,
    RecentUpload,
    TrendPoint,
    VendorSpend,
)


def _shift_months(d: date, months: int) -> date:
    total = d.year * 12 + (d.month - 1) + months
    year, month = divmod(total, 12)
    return date(year, month + 1, 1)


async def get_overview(
    db: AsyncSession,
    user_id: uuid.UUID,
    granularity: str = "day ",
    months: int = 24,
) -> OverviewResponse:
    since = _shift_months(date.today().replace(day=1), -(months - 1))

    kpi_data = await overview_repo.get_kpis(db, user_id)
    trend_rows = await overview_repo.get_spending_trend(db, user_id, granularity, since)
    top_vendor_rows = await overview_repo.get_top_vendors(db, user_id)
    category_rows = await overview_repo.get_spending_by_category(db, user_id)
    recent_bills = await overview_repo.get_recent_uploads(db, user_id)
    pending = await overview_repo.get_pending_questions(db, user_id)

    return OverviewResponse(
        kpis=OverviewKPIs(**kpi_data),
        spending_trend=[TrendPoint(period=period, total=total) for period, total in trend_rows],
        top_vendors=[VendorSpend(vendor_name=name, total=total) for name, total in top_vendor_rows],
        spending_by_category=[
            CategorySpend(category_name=name, total=total) for name, total in category_rows
        ],
        recent_uploads=[
            RecentUpload(
                bill_id=bill.id,
                name=bill.name,
                vendor_name=bill.vendor.name if bill.vendor else None,
                total_amount=bill.total_amount,
                confidence=bill.confidence,
                current_stage=bill.current_stage.value,
            )
            for bill in recent_bills
        ],
        pending_questions=[
            PendingQuestion(
                elicitation_id=elicitation.id,
                bill_id=elicitation.bill_id,
                bill_name=elicitation.bill.name,
                vendor_name=elicitation.bill.vendor.name if elicitation.bill.vendor else None,
                amount=elicitation.bill.total_amount,
                question=elicitation.question,
            )
            for elicitation in pending
        ],
    )

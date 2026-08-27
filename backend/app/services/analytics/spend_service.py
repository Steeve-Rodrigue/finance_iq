import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.repos.analytics import spend_repo
from app.repos.analytics.spend_repo import SpendFilters
from app.schemas.analytics.overview import CategorySpend, TrendPoint, VendorSpend
from app.schemas.analytics.spend import (
    BoxplotStats,
    CalendarHeatmapCell,
    CategoryEvolutionPoint,
    CategoryMomentumResponse,
    DocumentTypeSpend,
    HistogramBucket,
    MonthOverMonthRow,
    Outlier,
    PaymentStatusBreakdown,
    RecurringBill,
    SpendAnalyticsResponse,
    SpendKPIs,
    VelocityPoint,
    VendorEvolutionPoint,
)

_HISTOGRAM_BUCKET_COUNT = 10
_RECURRING_LOOKBACK_MONTHS = 6
_RECURRING_MIN_MONTHS = 3
_RECURRING_MAX_COEFFICIENT_OF_VARIATION = Decimal("0.10")
_OUTLIER_LIMIT = 5


def _shift_months(d: date, months: int) -> date:
    total = d.year * 12 + (d.month - 1) + months
    year, month = divmod(total, 12)
    return date(year, month + 1, 1)


def _build_histogram(amounts: list[Decimal]) -> list[HistogramBucket]:
    if not amounts:
        return []
    low, high = min(amounts), max(amounts)
    if low == high:
        return [HistogramBucket(range_start=low, range_end=high, count=len(amounts))]

    width = (high - low) / _HISTOGRAM_BUCKET_COUNT
    counts = [0] * _HISTOGRAM_BUCKET_COUNT
    for amount in amounts:
        index = min(int((amount - low) / width), _HISTOGRAM_BUCKET_COUNT - 1)
        counts[index] += 1

    return [
        HistogramBucket(
            range_start=low + width * i,
            range_end=low + width * (i + 1),
            count=count,
        )
        for i, count in enumerate(counts)
    ]


def _median(values: list[Decimal]) -> Decimal:
    n = len(values)
    mid = n // 2
    if n % 2 == 0:
        return (values[mid - 1] + values[mid]) / 2
    return values[mid]


def _build_boxplot(rows: list[tuple[date, Decimal]]) -> list[BoxplotStats]:
    # Five-number summary per month (min/Q1/median/Q3/max) for the spending distribution
    # boxplot - Q1/Q3 are the median of the lower/upper half (Tukey's method), not a linear-
    # interpolation percentile, to keep this dependency-free (no numpy in this backend).
    by_month: dict[date, list[Decimal]] = {}
    for month, amount in rows:
        by_month.setdefault(month, []).append(amount)

    result = []
    for month in sorted(by_month):
        amounts = sorted(by_month[month])
        n = len(amounts)
        mid = n // 2
        lower_half = amounts[:mid]
        upper_half = amounts[mid:] if n % 2 == 0 else amounts[mid + 1 :]
        median = _median(amounts)
        result.append(
            BoxplotStats(
                month=month,
                min=amounts[0],
                q1=_median(lower_half) if lower_half else median,
                median=median,
                q3=_median(upper_half) if upper_half else median,
                max=amounts[-1],
            )
        )
    return result


def _build_velocity(
    current_daily: list[tuple[int, Decimal]], previous_daily: list[tuple[int, Decimal]]
) -> list[VelocityPoint]:
    current_by_day = dict(current_daily)
    previous_by_day = dict(previous_daily)

    points = []
    current_cumulative = Decimal("0")
    previous_cumulative = Decimal("0")
    for day in range(1, 32):
        current_cumulative += current_by_day.get(day, Decimal("0"))
        previous_cumulative += previous_by_day.get(day, Decimal("0"))
        if day in current_by_day or day in previous_by_day or day == 1:
            points.append(
                VelocityPoint(
                    day_of_month=day,
                    cumulative_current_month=current_cumulative,
                    cumulative_previous_month=previous_cumulative,
                )
            )
    return points


def build_recurring_bills(
    candidates: list[tuple[str, int, Decimal, Decimal | None, date]],
) -> list[RecurringBill]:
    recurring = []
    for vendor_name, distinct_months, avg_amount, stddev_amount, last_bill_date in candidates:
        if distinct_months < _RECURRING_MIN_MONTHS or not avg_amount:
            continue
        coefficient_of_variation = (stddev_amount or Decimal("0")) / avg_amount
        if coefficient_of_variation <= _RECURRING_MAX_COEFFICIENT_OF_VARIATION:
            recurring.append(
                RecurringBill(
                    vendor_name=vendor_name,
                    avg_amount=avg_amount,
                    frequency=distinct_months,
                    last_bill_date=last_bill_date,
                )
            )
    recurring.sort(key=lambda r: r.frequency, reverse=True)
    return recurring


def _build_outliers(
    rows: list[tuple[uuid.UUID, str, str, Decimal, Decimal]],
) -> list[Outlier]:
    scored = []
    for bill_id, bill_name, vendor_name, total_amount, vendor_average in rows:
        if not vendor_average:
            continue
        deviation_ratio = total_amount / vendor_average
        scored.append(
            (
                abs(deviation_ratio - 1),
                Outlier(
                    bill_id=bill_id,
                    bill_name=bill_name,
                    vendor_name=vendor_name,
                    total_amount=total_amount,
                    vendor_average=vendor_average,
                    deviation_ratio=deviation_ratio,
                ),
            )
        )
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [outlier for _, outlier in scored[:_OUTLIER_LIMIT]]


def _build_month_over_month(rows: list[tuple[date, str, Decimal]]) -> list[MonthOverMonthRow]:
    by_name: dict[str, dict[date, Decimal]] = {}
    periods = sorted({period for period, _, _ in rows})
    if len(periods) < 2:
        previous_period, current_period = None, periods[0] if periods else None
    else:
        previous_period, current_period = periods[-2], periods[-1]

    for period, name, total in rows:
        by_name.setdefault(name, {})[period] = total

    result = []
    for name, totals in by_name.items():
        current_total = totals.get(current_period, Decimal("0")) if current_period else Decimal("0")
        previous_total = (
            totals.get(previous_period, Decimal("0")) if previous_period else Decimal("0")
        )
        delta_pct = (
            (current_total - previous_total) / previous_total * 100 if previous_total else None
        )
        result.append(
            MonthOverMonthRow(
                name=name,
                current_month=current_total,
                previous_month=previous_total,
                delta_pct=delta_pct,
            )
        )
    return result


async def get_category_momentum(
    db: AsyncSession, user_id: uuid.UUID, filters: SpendFilters, granularity: str
) -> CategoryMomentumResponse:
    # Every period in range, not just the last two - one point per (period, category), same
    # filters (date range, vendor, category) as the rest of the page. get_category_evolution
    # already returns exactly this shape; only the granularity varies (this chart follows the
    # page-top SpendFilters selector, unlike SpendAnalyticsResponse.category_evolution which
    # stays fixed at month for that now-unused field).
    rows = await spend_repo.get_category_evolution(db, user_id, filters, granularity)
    return CategoryMomentumResponse(
        points=[
            CategoryEvolutionPoint(period=period, category_name=name, total=total)
            for period, name, total in rows
        ]
    )


async def get_spend_analytics(
    db: AsyncSession,
    user_id: uuid.UUID,
    filters: SpendFilters,
    granularity: str = "month",
) -> SpendAnalyticsResponse:
    current_month_start = date.today().replace(day=1)
    previous_month_start = _shift_months(current_month_start, -1)
    month_before_previous_start = _shift_months(current_month_start, -2)
    current_month_end = _shift_months(current_month_start, 1)
    recurring_since = _shift_months(current_month_start, -(_RECURRING_LOOKBACK_MONTHS - 1))
    current_year_start = date(date.today().year, 1, 1)
    current_year_end = date(date.today().year, 12, 31)

    kpi_data = await spend_repo.get_kpis(db, user_id, filters)
    trend_rows = await spend_repo.get_spending_trend(db, user_id, filters, granularity)
    category_evolution_rows = await spend_repo.get_category_evolution(db, user_id, filters)
    vendor_evolution_rows = await spend_repo.get_vendor_evolution(db, user_id, filters, granularity)
    calendar_rows = await spend_repo.get_spending_calendar(
        db, user_id, filters, current_year_start, current_year_end
    )
    amounts = await spend_repo.get_bill_amounts(db, user_id, filters)
    bill_amounts_by_month_rows = await spend_repo.get_bill_amounts_by_month(db, user_id, filters)
    current_daily = await spend_repo.get_daily_totals(db, user_id, filters, current_month_start)
    previous_daily = await spend_repo.get_daily_totals(db, user_id, filters, previous_month_start)
    category_rows = await spend_repo.get_spending_by_category(db, user_id, filters)
    vendor_rows = await spend_repo.get_top_vendors(db, user_id, filters)
    payment_status_rows = await spend_repo.get_payment_status_breakdown(db, user_id, filters)
    document_type_rows = await spend_repo.get_spend_by_document_type(db, user_id, filters)
    recurring_candidates = await spend_repo.get_recurring_candidates(db, user_id, recurring_since)
    outlier_rows = await spend_repo.get_bills_with_vendor_average(db, user_id)
    mom_category_rows = await spend_repo.get_month_over_month_by_category(
        db, user_id, month_before_previous_start, current_month_end
    )
    mom_vendor_rows = await spend_repo.get_month_over_month_by_vendor(
        db, user_id, month_before_previous_start, current_month_end
    )

    return SpendAnalyticsResponse(
        kpis=SpendKPIs(**kpi_data),
        spending_trend=[TrendPoint(period=period, total=total) for period, total in trend_rows],
        category_evolution=[
            CategoryEvolutionPoint(period=period, category_name=name, total=total)
            for period, name, total in category_evolution_rows
        ],
        vendor_evolution=[
            VendorEvolutionPoint(period=period, vendor_name=name, total=total)
            for period, name, total in vendor_evolution_rows
        ],
        spending_heatmap=[
            CalendarHeatmapCell(date=day, total=total) for day, total in calendar_rows
        ],
        bill_size_distribution=_build_histogram(amounts),
        spending_velocity=_build_velocity(current_daily, previous_daily),
        spending_boxplot=_build_boxplot(bill_amounts_by_month_rows),
        spending_by_category=[
            CategorySpend(category_name=name, total=total) for name, total in category_rows
        ],
        top_vendors=[VendorSpend(vendor_name=name, total=total) for name, total in vendor_rows],
        payment_status_breakdown=[
            PaymentStatusBreakdown(payment_status=status, total=total, count=count)
            for status, total, count in payment_status_rows
        ],
        spend_by_document_type=[
            DocumentTypeSpend(document_type=doc_type, total=total)
            for doc_type, total in document_type_rows
        ],
        recurring_bills=build_recurring_bills(recurring_candidates),
        outliers=_build_outliers(outlier_rows),
        month_over_month_by_category=_build_month_over_month(mom_category_rows),
        month_over_month_by_vendor=_build_month_over_month(mom_vendor_rows),
    )

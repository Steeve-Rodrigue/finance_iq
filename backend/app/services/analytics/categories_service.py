import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.repos.analytics import categories_repo
from app.repos.analytics.categories_repo import CategoryFilters
from app.schemas.analytics.categories import (
    CategoriesAnalyticsResponse,
    CategoriesKPIs,
    CategoryCount,
    CategoryEvolutionPoint,
    CategorySpendBar,
    CategoryTableRow,
    OtherRateTrendPoint,
    UncategorizedTrendPoint,
)


async def get_categories_analytics(
    db: AsyncSession, user_id: uuid.UUID, filters: CategoryFilters
) -> CategoriesAnalyticsResponse:
    total_categories = await categories_repo.get_total_categories(db, user_id)
    most_expensive = await categories_repo.get_most_expensive_category(db, user_id, filters)
    uncategorized_count = await categories_repo.get_uncategorized_bills_count(db, user_id, filters)
    other_count, total_count = await categories_repo.get_other_rate(db, user_id, filters)
    other_rate = Decimal(other_count) / Decimal(total_count) * 100 if total_count else Decimal("0")

    spend_by_category_rows = await categories_repo.get_spend_by_category(db, user_id, filters)
    bill_count_rows = await categories_repo.get_bill_count_by_category(db, user_id, filters)
    evolution_rows = await categories_repo.get_category_evolution(db, user_id, filters)
    uncategorized_trend_rows = await categories_repo.get_uncategorized_trend(db, user_id, filters)
    other_rate_trend_rows = await categories_repo.get_other_rate_trend(db, user_id, filters)
    table_rows = await categories_repo.get_category_table(db, user_id, filters)

    # Same grand total that spend_by_category already sums over (every bill, including the
    # Uncategorized bucket) - reused here instead of an extra query.
    grand_total = sum((total for _, total in spend_by_category_rows), Decimal("0"))

    kpis = CategoriesKPIs(
        total_categories=total_categories,
        most_expensive_category_name=most_expensive[0] if most_expensive else None,
        most_expensive_category_total=most_expensive[1] if most_expensive else None,
        uncategorized_bills_count=uncategorized_count,
        other_rate=other_rate,
    )

    return CategoriesAnalyticsResponse(
        kpis=kpis,
        spend_by_category=[
            CategorySpendBar(category_name=name, total=total)
            for name, total in spend_by_category_rows
        ],
        bill_count_by_category=[
            CategoryCount(category_name=name, bill_count=count) for name, count in bill_count_rows
        ],
        category_evolution=[
            CategoryEvolutionPoint(period=period, category_name=name, total=total)
            for period, name, total in evolution_rows
        ],
        uncategorized_trend=[
            UncategorizedTrendPoint(period=period, count=count, total=total)
            for period, count, total in uncategorized_trend_rows
        ],
        other_rate_trend=[
            OtherRateTrendPoint(
                period=period,
                other_rate=Decimal(other_count) / Decimal(total_count) * 100
                if total_count
                else Decimal("0"),
            )
            for period, other_count, total_count in other_rate_trend_rows
        ],
        category_table=[
            CategoryTableRow(
                category_id=category_id,
                name=name,
                bill_count=bill_count,
                total_spent=total_spent,
                avg_bill_amount=avg_bill_amount,
                pct_of_total_spend=total_spent / grand_total * 100 if grand_total else Decimal("0"),
            )
            for category_id, name, bill_count, total_spent, avg_bill_amount in table_rows
        ],
    )

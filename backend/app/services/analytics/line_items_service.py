import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.repos.analytics import line_items_repo
from app.repos.analytics.line_items_repo import LineItemFilters
from app.schemas.analytics.line_items import (
    ItemFrequency,
    ItemSpend,
    LineItemsAnalyticsResponse,
    LineItemsKPIs,
    LineItemTableRow,
    UnitPriceTrendPoint,
)

_TOP_ITEMS_LIMIT = 10


async def get_line_items_analytics(
    db: AsyncSession, user_id: uuid.UUID, filters: LineItemFilters
) -> LineItemsAnalyticsResponse:
    total_line_items = await line_items_repo.get_total_line_items(db, user_id)
    without_category, total_for_gap = await line_items_repo.get_categorization_gap_inputs(
        db, user_id
    )
    categorization_gap = (
        Decimal(without_category) / Decimal(total_for_gap) * 100 if total_for_gap else Decimal("0")
    )

    frequent_rows = await line_items_repo.get_most_frequent_items(
        db, user_id, limit=_TOP_ITEMS_LIMIT
    )
    spend_rows = await line_items_repo.get_top_items_by_spend(db, user_id, limit=_TOP_ITEMS_LIMIT)
    # Unit-price trend is scoped to the same items already surfaced as "most frequent" - a
    # bounded, meaningful set rather than one line per distinct common_name ever seen.
    trend_names = list({name for name, _ in frequent_rows})
    trend_rows = await line_items_repo.get_unit_price_trend(db, user_id, trend_names)
    table_rows = await line_items_repo.get_line_item_table(db, user_id, filters)

    return LineItemsAnalyticsResponse(
        kpis=LineItemsKPIs(
            total_line_items=total_line_items,
            most_purchased_item_name=frequent_rows[0][0] if frequent_rows else None,
            most_purchased_item_count=frequent_rows[0][1] if frequent_rows else None,
            categorization_gap_pct=categorization_gap,
        ),
        most_frequent_items=[
            ItemFrequency(common_name=name, count=count) for name, count in frequent_rows
        ],
        top_items_by_spend=[ItemSpend(common_name=name, total=total) for name, total in spend_rows],
        unit_price_trend=[
            UnitPriceTrendPoint(common_name=name, period=period, avg_unit_price=avg)
            for name, period, avg in trend_rows
        ],
        line_item_table=[
            LineItemTableRow(
                line_item_id=row.id,
                bill_id=row.bill_id,
                bill_name=row.bill_name,
                description=row.description,
                common_name=row.common_name,
                quantity=row.quantity,
                unit_price=row.unit_price,
                line_total=row.line_total,
                vendor_name=row.vendor_name,
                category_name=row.category_name,
            )
            for row in table_rows
        ],
    )

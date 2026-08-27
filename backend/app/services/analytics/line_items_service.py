import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import NotFoundError
from app.repos import subcategories_repo
from app.repos.analytics import line_items_repo
from app.repos.analytics.line_items_repo import LineItemFilters
from app.schemas.analytics.line_items import (
    CategoryTreeNode,
    CategoryTreeResponse,
    ItemFrequency,
    ItemSpend,
    LineItemsAnalyticsResponse,
    LineItemsKPIs,
    LineItemTableRow,
    SubcategoryLineItemRow,
    UnitPriceTrendPoint,
)

_TOP_ITEMS_LIMIT = 10
_UNCLASSIFIED_NAME = "Non classé"


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


class _SubcategoryNode:
    """Mutable intermediate node used only while assembling the tree in Python - never exposed
    outside this module (the public shape is the recursive CategoryTreeNode Pydantic model)."""

    __slots__ = ("category_id", "children", "direct_total", "id", "name")

    def __init__(
        self, id: uuid.UUID, name: str, category_id: uuid.UUID, direct_total: Decimal
    ) -> None:
        self.id = id
        self.name = name
        self.category_id = category_id
        self.direct_total = direct_total
        self.children: list[_SubcategoryNode] = []


def _rolled_up_total(node: _SubcategoryNode) -> Decimal:
    # A non-leaf node's own direct_total is always 0 by construction (an item covered by a
    # child group is never also assigned to its parent - see
    # subcategorizer_service._persist_group_tree), but summing both here is still correct and
    # doesn't rely on that invariant holding forever.
    return node.direct_total + sum(
        (_rolled_up_total(child) for child in node.children), Decimal("0")
    )


def _to_tree_node(node: _SubcategoryNode, parent_total: Decimal) -> CategoryTreeNode:
    total = _rolled_up_total(node)
    pct = (total / parent_total * 100) if parent_total else Decimal("0")
    return CategoryTreeNode(
        id=node.id,
        name=node.name,
        total=total,
        pct_of_parent=pct,
        children=[_to_tree_node(child, total) for child in node.children],
    )


async def get_category_tree(db: AsyncSession, user_id: uuid.UUID) -> CategoryTreeResponse:
    """Category -> sub-category -> sub-sub-category, with each node's % of its immediate
    parent, for the radial tree chart on the Line Items page. Assembled in Python from two
    flat queries (category totals + every Subcategory row's own direct total) rather than a
    recursive CTE - depth is capped at 3 by construction, so this is simpler and easier to
    test than SQL recursion for a shape this shallow."""
    category_rows = await line_items_repo.get_category_totals(db, user_id)
    subcategory_rows = await line_items_repo.get_subcategory_direct_totals(db, user_id)

    nodes: dict[uuid.UUID, _SubcategoryNode] = {
        sub_id: _SubcategoryNode(sub_id, name, category_id, direct_total)
        for sub_id, name, category_id, _parent_id, direct_total in subcategory_rows
    }
    level1_by_category: dict[uuid.UUID, list[_SubcategoryNode]] = {}
    for sub_id, _name, category_id, parent_id, _direct_total in subcategory_rows:
        node = nodes[sub_id]
        parent = nodes.get(parent_id) if parent_id is not None else None
        if parent is not None:
            parent.children.append(node)
        else:
            # Also covers a parent_id that doesn't resolve to a known row (shouldn't happen
            # given FK integrity) - treated as level-1 rather than dropped silently.
            level1_by_category.setdefault(category_id, []).append(node)

    grand_total = sum((total for _id, _name, total in category_rows), Decimal("0"))

    category_nodes = []
    for category_id, category_name, category_total in category_rows:
        level1_nodes = level1_by_category.get(category_id, [])
        children = [_to_tree_node(node, category_total) for node in level1_nodes]

        subcategorized_total = sum((_rolled_up_total(n) for n in level1_nodes), Decimal("0"))
        unclassified_total = category_total - subcategorized_total
        if unclassified_total > 0:
            pct = (unclassified_total / category_total * 100) if category_total else Decimal("0")
            children.append(
                CategoryTreeNode(
                    id=None,
                    name=_UNCLASSIFIED_NAME,
                    total=unclassified_total,
                    pct_of_parent=pct,
                    children=[],
                )
            )

        pct_of_grand = (category_total / grand_total * 100) if grand_total else Decimal("0")
        category_nodes.append(
            CategoryTreeNode(
                id=category_id,
                name=category_name,
                total=category_total,
                pct_of_parent=pct_of_grand,
                children=children,
            )
        )

    return CategoryTreeResponse(
        root=CategoryTreeNode(
            id=None,
            name="Total",
            total=grand_total,
            pct_of_parent=Decimal("100") if grand_total else Decimal("0"),
            children=category_nodes,
        )
    )


async def get_line_items_for_subcategory(
    db: AsyncSession, user_id: uuid.UUID, subcategory_id: uuid.UUID
) -> list[SubcategoryLineItemRow]:
    """The line items behind one category-tree node's total - for a node with children, that's
    its own direct items plus every descendant's (a BFS from subcategory_id down, not assuming
    a fixed depth - the sub-categorizer agent only ever produces 2 levels today, but nothing
    here depends on that staying true)."""
    target = await subcategories_repo.get_by_id(db, user_id, subcategory_id)
    if target is None:
        raise NotFoundError(f"subcategory {subcategory_id} not found")

    siblings = await subcategories_repo.list_by_category(db, user_id, target.category_id)
    children_by_parent: dict[uuid.UUID | None, list[uuid.UUID]] = {}
    for sub in siblings:
        children_by_parent.setdefault(sub.parent_subcategory_id, []).append(sub.id)

    descendant_ids = [subcategory_id]
    frontier = [subcategory_id]
    while frontier:
        next_frontier = [
            child_id for sub_id in frontier for child_id in children_by_parent.get(sub_id, [])
        ]
        descendant_ids.extend(next_frontier)
        frontier = next_frontier

    rows = await line_items_repo.get_line_items_by_subcategory_ids(db, user_id, descendant_ids)
    return [
        SubcategoryLineItemRow(
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
            subcategory_name=row.subcategory_name,
        )
        for row in rows
    ]

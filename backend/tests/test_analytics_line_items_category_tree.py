"""GET /analytics/line-items/category-tree - the tree assembly itself
(app/services/analytics/line_items_service.py's get_category_tree) is exercised directly here
by constructing Subcategory rows via the repo layer (db_session, shared with the `client`
fixture's session per conftest.py), rather than through the full sub-categorizer agent flow
(see test_subcategorizer_flow.py for that end-to-end path)."""

import uuid
from decimal import Decimal

import httpx
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.repos import bill_line_items_repo, subcategories_repo
from tests.helpers import auth_header, signup_and_login


async def _create_category(client: AsyncClient, token: str, name: str, slug: str) -> dict:
    resp = await client.post(
        "/categories/", json={"name": name, "slug": slug}, headers=auth_header(token)
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_bill(client: AsyncClient, token: str, name: str) -> dict:
    resp = await client.post(
        "/bills/",
        json={"name": name, "storage_key": f"s3://bucket/{name}.pdf", "file_hash": f"hash-{name}"},
        headers=auth_header(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_line_item(
    client: AsyncClient,
    token: str,
    bill_id: str,
    description: str,
    line_total: str,
    category_id: str,
) -> dict:
    resp = await client.post(
        f"/bills/{bill_id}/line-items/",
        json={"description": description, "line_total": line_total, "category_id": category_id},
        headers=auth_header(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _get_user_id(client: AsyncClient, token: str) -> uuid.UUID:
    resp = await client.get("/users/me", headers=auth_header(token))
    assert resp.status_code == 200, resp.text
    return uuid.UUID(resp.json()["id"])


async def _get_category_tree(client: AsyncClient, token: str) -> dict:
    resp = await client.get("/analytics/line-items/category-tree", headers=auth_header(token))
    assert resp.status_code == 200, resp.text
    return resp.json()


def _find_node(nodes: list[dict], name: str) -> dict | None:
    return next((n for n in nodes if n["name"] == name), None)


async def _get_line_items_for_subcategory(
    client: AsyncClient, token: str, subcategory_id: uuid.UUID
) -> httpx.Response:
    return await client.get(
        f"/analytics/line-items/by-subcategory/{subcategory_id}", headers=auth_header(token)
    )


async def test_category_tree_empty_state(client: AsyncClient) -> None:
    token = await signup_and_login(client, "tree-empty@example.com", "tree_empty")
    tree = await _get_category_tree(client, token)
    assert tree == {
        "root": {"id": None, "name": "Total", "total": "0", "pct_of_parent": "0", "children": []}
    }


async def test_category_tree_two_level_hierarchy_with_percentages(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    token = await signup_and_login(client, "tree-hierarchy@example.com", "tree_hierarchy")
    user_id = await _get_user_id(client, token)
    category = await _create_category(client, token, "Courses", "courses")
    bill = await _create_bill(client, token, "bill")
    item_a = await _create_line_item(client, token, bill["id"], "Item A", "10.00", category["id"])
    item_b = await _create_line_item(client, token, bill["id"], "Item B", "20.00", category["id"])
    item_c = await _create_line_item(client, token, bill["id"], "Item C", "30.00", category["id"])

    category_id = uuid.UUID(category["id"])
    sub1 = await subcategories_repo.create(
        db_session, user_id, category_id, name="Sub1", slug="sub1"
    )
    sub2 = await subcategories_repo.create(
        db_session,
        user_id,
        category_id,
        name="Sub2",
        slug="sub2",
        parent_subcategory_id=sub1.id,
    )
    await bill_line_items_repo.set_subcategory_for_line_items(
        db_session, user_id, [uuid.UUID(item_a["id"])], sub1.id
    )
    await bill_line_items_repo.set_subcategory_for_line_items(
        db_session,
        user_id,
        [uuid.UUID(item_b["id"]), uuid.UUID(item_c["id"])],
        sub2.id,
    )

    tree = await _get_category_tree(client, token)
    courses = _find_node(tree["root"]["children"], "Courses")
    assert courses is not None
    assert courses["total"] == "60.00"
    assert courses["pct_of_parent"] == "100"

    sub1_node = _find_node(courses["children"], "Sub1")
    assert sub1_node is not None
    # Rolled up: Sub1's own direct item (10.00) + Sub2's total (50.00), not just its own 10.00.
    assert sub1_node["total"] == "60.00"
    assert sub1_node["pct_of_parent"] == "100"

    sub2_node = _find_node(sub1_node["children"], "Sub2")
    assert sub2_node is not None
    assert sub2_node["total"] == "50.00"
    assert Decimal(sub2_node["pct_of_parent"]).quantize(Decimal("0.01")) == Decimal("83.33")


async def test_category_tree_parent_with_only_children_is_not_invisible(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Regression test: a subcategory with children but zero directly-assigned line items used
    to be absent from get_category_tree_totals entirely (a line-item-driven query can't surface
    a subcategory no line item points at directly) - fixed by driving the query from
    Subcategory instead of BillLineItem."""
    token = await signup_and_login(client, "tree-parent-only@example.com", "tree_parent_only")
    user_id = await _get_user_id(client, token)
    category = await _create_category(client, token, "Logement", "logement")
    bill = await _create_bill(client, token, "bill")
    item = await _create_line_item(client, token, bill["id"], "Loyer", "800.00", category["id"])

    category_id = uuid.UUID(category["id"])
    parent = await subcategories_repo.create(
        db_session, user_id, category_id, name="Parent", slug="parent"
    )
    child = await subcategories_repo.create(
        db_session,
        user_id,
        category_id,
        name="Child",
        slug="child",
        parent_subcategory_id=parent.id,
    )
    await bill_line_items_repo.set_subcategory_for_line_items(
        db_session, user_id, [uuid.UUID(item["id"])], child.id
    )

    tree = await _get_category_tree(client, token)
    logement = _find_node(tree["root"]["children"], "Logement")
    assert logement is not None
    assert len(logement["children"]) == 1

    parent_node = logement["children"][0]
    assert parent_node["name"] == "Parent"
    assert parent_node["total"] == "800.00"  # rolled up from its child despite 0 direct items

    child_node = _find_node(parent_node["children"], "Child")
    assert child_node is not None
    assert child_node["total"] == "800.00"


async def test_category_tree_unassigned_items_become_non_classe_leaf(
    client: AsyncClient,
) -> None:
    token = await signup_and_login(client, "tree-unassigned@example.com", "tree_unassigned")
    category = await _create_category(client, token, "Abonnements", "abonnements")
    bill = await _create_bill(client, token, "bill")
    await _create_line_item(client, token, bill["id"], "Netflix", "15.00", category["id"])
    await _create_line_item(client, token, bill["id"], "Spotify", "10.00", category["id"])

    tree = await _get_category_tree(client, token)
    abonnements = _find_node(tree["root"]["children"], "Abonnements")
    assert abonnements is not None
    assert abonnements["total"] == "25.00"
    assert len(abonnements["children"]) == 1
    assert abonnements["children"][0]["id"] is None
    assert abonnements["children"][0]["name"] == "Non classé"
    assert abonnements["children"][0]["total"] == "25.00"
    assert abonnements["children"][0]["pct_of_parent"] == "100"


async def test_category_tree_cross_user_isolation(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner_token = await signup_and_login(client, "tree-owner@example.com", "tree_owner")
    other_token = await signup_and_login(client, "tree-other@example.com", "tree_other")
    owner_id = await _get_user_id(client, owner_token)

    category = await _create_category(client, owner_token, "Owned", "owned")
    bill = await _create_bill(client, owner_token, "bill")
    item = await _create_line_item(client, owner_token, bill["id"], "Item", "10.00", category["id"])
    sub = await subcategories_repo.create(
        db_session, owner_id, uuid.UUID(category["id"]), name="Sub", slug="sub"
    )
    await bill_line_items_repo.set_subcategory_for_line_items(
        db_session, owner_id, [uuid.UUID(item["id"])], sub.id
    )

    other_tree = await _get_category_tree(client, other_token)
    assert other_tree["root"]["children"] == []


async def test_line_items_for_subcategory_leaf_returns_only_its_own_items(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    token = await signup_and_login(client, "subitems-leaf@example.com", "subitems_leaf")
    user_id = await _get_user_id(client, token)
    category = await _create_category(client, token, "Courses", "courses")
    bill = await _create_bill(client, token, "bill")
    item_a = await _create_line_item(client, token, bill["id"], "Item A", "10.00", category["id"])
    item_b = await _create_line_item(client, token, bill["id"], "Item B", "20.00", category["id"])

    category_id = uuid.UUID(category["id"])
    sub1 = await subcategories_repo.create(
        db_session, user_id, category_id, name="Sub1", slug="sub1"
    )
    sub2 = await subcategories_repo.create(
        db_session, user_id, category_id, name="Sub2", slug="sub2", parent_subcategory_id=sub1.id
    )
    await bill_line_items_repo.set_subcategory_for_line_items(
        db_session, user_id, [uuid.UUID(item_a["id"])], sub1.id
    )
    await bill_line_items_repo.set_subcategory_for_line_items(
        db_session, user_id, [uuid.UUID(item_b["id"])], sub2.id
    )

    resp = await _get_line_items_for_subcategory(client, token, sub2.id)
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["line_item_id"] == item_b["id"]
    assert rows[0]["subcategory_name"] == "Sub2"


async def test_line_items_for_subcategory_parent_includes_descendants(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    token = await signup_and_login(client, "subitems-parent@example.com", "subitems_parent")
    user_id = await _get_user_id(client, token)
    category = await _create_category(client, token, "Courses", "courses")
    bill = await _create_bill(client, token, "bill")
    item_a = await _create_line_item(client, token, bill["id"], "Item A", "10.00", category["id"])
    item_b = await _create_line_item(client, token, bill["id"], "Item B", "20.00", category["id"])

    category_id = uuid.UUID(category["id"])
    sub1 = await subcategories_repo.create(
        db_session, user_id, category_id, name="Sub1", slug="sub1"
    )
    sub2 = await subcategories_repo.create(
        db_session, user_id, category_id, name="Sub2", slug="sub2", parent_subcategory_id=sub1.id
    )
    await bill_line_items_repo.set_subcategory_for_line_items(
        db_session, user_id, [uuid.UUID(item_a["id"])], sub1.id
    )
    await bill_line_items_repo.set_subcategory_for_line_items(
        db_session, user_id, [uuid.UUID(item_b["id"])], sub2.id
    )

    resp = await _get_line_items_for_subcategory(client, token, sub1.id)
    assert resp.status_code == 200
    rows = resp.json()
    assert {row["line_item_id"] for row in rows} == {item_a["id"], item_b["id"]}
    names_by_item = {row["line_item_id"]: row["subcategory_name"] for row in rows}
    assert names_by_item[item_a["id"]] == "Sub1"
    assert names_by_item[item_b["id"]] == "Sub2"


async def test_line_items_for_subcategory_not_found(client: AsyncClient) -> None:
    token = await signup_and_login(client, "subitems-404@example.com", "subitems_404")
    resp = await _get_line_items_for_subcategory(client, token, uuid.uuid4())
    assert resp.status_code == 404


async def test_line_items_for_subcategory_cross_user_isolation(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner_token = await signup_and_login(client, "subitems-owner@example.com", "subitems_owner")
    other_token = await signup_and_login(client, "subitems-other@example.com", "subitems_other")
    owner_id = await _get_user_id(client, owner_token)

    category = await _create_category(client, owner_token, "Owned", "owned")
    bill = await _create_bill(client, owner_token, "bill")
    item = await _create_line_item(client, owner_token, bill["id"], "Item", "10.00", category["id"])
    sub = await subcategories_repo.create(
        db_session, owner_id, uuid.UUID(category["id"]), name="Sub", slug="sub"
    )
    await bill_line_items_repo.set_subcategory_for_line_items(
        db_session, owner_id, [uuid.UUID(item["id"])], sub.id
    )

    resp = await _get_line_items_for_subcategory(client, other_token, sub.id)
    assert resp.status_code == 404

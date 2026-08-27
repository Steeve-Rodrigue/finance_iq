"""The sub-categorizer agent: a batch job over already-categorized line items (not one of the
per-bill parsing/categorizing/auditing agents), exercised entirely through
POST /line-items/subcategorize and GET /analytics/line-items/category-tree - call_subcategorizer
is mocked per test, same pattern as test_categorizer_flow.py's call_categorizer mocking."""

from typing import Any

import pytest
from httpx import AsyncClient

from app.services import subcategorizer_service
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
    common_name: str | None = None,
) -> dict:
    resp = await client.post(
        f"/bills/{bill_id}/line-items/",
        json={
            "description": description,
            "common_name": common_name or description,
            "line_total": line_total,
            "category_id": category_id,
        },
        headers=auth_header(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _find_node(nodes: list[dict], name: str) -> dict | None:
    return next((n for n in nodes if n["name"] == name), None)


async def _get_category_tree(client: AsyncClient, token: str) -> dict:
    resp = await client.get("/analytics/line-items/category-tree", headers=auth_header(token))
    assert resp.status_code == 200, resp.text
    return resp.json()


async def test_subcategorize_resolves_and_persists_two_level_hierarchy(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = await signup_and_login(client, "subcat-a@example.com", "subcat_a")
    category = await _create_category(client, token, "Courses", "courses")
    bill = await _create_bill(client, token, "courses-bill")
    await _create_line_item(
        client, token, bill["id"], "Pommes", "2.00", category["id"], common_name="pommes"
    )
    await _create_line_item(
        client, token, bill["id"], "Lait", "3.00", category["id"], common_name="lait"
    )
    await _create_line_item(
        client, token, bill["id"], "Yaourt", "1.50", category["id"], common_name="yaourt"
    )

    async def _fake_call(**kwargs: Any) -> dict[str, Any]:
        # Resolves indices from the actual line_items the service passes in, rather than
        # assuming a fixed creation order - list_by_category has no ordering guarantee within
        # a single test transaction (Postgres's now() is transaction-start time, so created_at
        # ties for every row inserted in this test).
        items = kwargs["line_items"]
        by_desc = {li.description: i for i, li in enumerate(items)}
        return {
            "groups": [
                {
                    "name": "Frais",
                    "slug": "frais",
                    "item_indices": [by_desc["Pommes"], by_desc["Lait"], by_desc["Yaourt"]],
                    "children": [
                        {
                            "name": "Produits laitiers",
                            "slug": "produits-laitiers",
                            "item_indices": [by_desc["Lait"], by_desc["Yaourt"]],
                        }
                    ],
                }
            ],
            "confidence": 0.9,
            "reasoning": "clair",
        }

    monkeypatch.setattr(subcategorizer_service, "call_subcategorizer", _fake_call)

    resp = await client.post("/line-items/subcategorize", headers=auth_header(token))
    assert resp.status_code == 200
    assert resp.json() == {"categories_processed": 1, "subcategories_created": 2}

    tree = await _get_category_tree(client, token)
    courses = _find_node(tree["root"]["children"], "Courses")
    assert courses is not None
    assert courses["total"] == "6.50"

    frais = _find_node(courses["children"], "Frais")
    assert frais is not None
    assert frais["total"] == "6.50"

    laitiers = _find_node(frais["children"], "Produits laitiers")
    assert laitiers is not None
    assert laitiers["total"] == "4.50"


async def test_subcategorize_carries_established_names_across_categories(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = await signup_and_login(client, "subcat-b@example.com", "subcat_b")
    cat_a = await _create_category(client, token, "Alpha", "alpha")
    cat_b = await _create_category(client, token, "Beta", "beta")
    bill_a = await _create_bill(client, token, "bill-a")
    bill_b = await _create_bill(client, token, "bill-b")
    await _create_line_item(client, token, bill_a["id"], "Item A", "10.00", cat_a["id"])
    await _create_line_item(client, token, bill_b["id"], "Item B", "10.00", cat_b["id"])

    calls: list[dict[str, Any]] = []
    retry_calls: list[dict[str, Any]] = []
    seen_categories: set[str] = set()

    async def _fake_call(**kwargs: Any) -> dict[str, Any]:
        # Distinguishes first-attempt vs. retry by call order per category rather than by
        # comparing `model` to SUBCATEGORIZER_MODEL/RETRY_MODEL - those two constants can be
        # configured to the same value (they are, in this local .env), so that comparison
        # isn't a reliable way to tell the two calls apart.
        calls.append(kwargs)
        name = kwargs["category_name"]
        if name not in seen_categories:
            seen_categories.add(name)
            # Every category's first attempt is low-confidence, forcing a retry - this is what
            # lets us observe established_subcategory_names on the retry call below.
            return {"confidence": 0.3, "reasoning": "pas sûr"}
        retry_calls.append(kwargs)
        return {
            "groups": [
                {
                    "name": f"Sub-{name}",
                    "slug": f"sub-{name.lower()}",
                    "item_indices": [0],
                }
            ],
            "confidence": 0.9,
            "reasoning": "ok",
        }

    monkeypatch.setattr(subcategorizer_service, "call_subcategorizer", _fake_call)

    resp = await client.post("/line-items/subcategorize", headers=auth_header(token))
    assert resp.status_code == 200
    assert resp.json()["categories_processed"] == 2

    assert len(calls) == 4
    assert len(retry_calls) == 2
    # Whichever category the batch happened to process second (DB scan order isn't asserted -
    # only that the naming-consistency signal threads across categories at all) should have
    # received the other category's just-created sub-category name on its retry.
    with_established = [c for c in retry_calls if c.get("established_subcategory_names")]
    assert len(with_established) == 1
    call = with_established[0]
    other_name = "Alpha" if call["category_name"] == "Beta" else "Beta"
    assert f"Sub-{other_name}" in call["established_subcategory_names"]


async def test_subcategorize_unresolved_routes_to_catch_all_and_creates_no_elicitation(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = await signup_and_login(client, "subcat-c@example.com", "subcat_c")
    category = await _create_category(client, token, "Divers", "divers")
    bill = await _create_bill(client, token, "divers-bill")
    await _create_line_item(client, token, bill["id"], "Item 1", "10.00", category["id"])
    await _create_line_item(client, token, bill["id"], "Item 2", "5.00", category["id"])

    async def _fake_call(**kwargs: Any) -> dict[str, Any]:
        return {"confidence": 0.2, "reasoning": "aucune idée"}

    monkeypatch.setattr(subcategorizer_service, "call_subcategorizer", _fake_call)

    resp = await client.post("/line-items/subcategorize", headers=auth_header(token))
    assert resp.status_code == 200

    tree = await _get_category_tree(client, token)
    divers = _find_node(tree["root"]["children"], "Divers")
    assert divers is not None
    assert divers["total"] == "15.00"
    assert len(divers["children"]) == 1
    assert divers["children"][0]["name"] == subcategorizer_service.CATCH_ALL_NAME
    assert divers["children"][0]["total"] == "15.00"
    assert divers["children"][0]["pct_of_parent"] == "100"

    elicitations = (
        await client.get(f"/bills/{bill['id']}/elicitations/", headers=auth_header(token))
    ).json()
    assert elicitations == []


async def test_subcategorize_partial_coverage_gets_defensive_catch_all(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = await signup_and_login(client, "subcat-d@example.com", "subcat_d")
    category = await _create_category(client, token, "Test", "test")
    bill = await _create_bill(client, token, "test-bill")
    await _create_line_item(client, token, bill["id"], "Covered A", "1.00", category["id"])
    await _create_line_item(client, token, bill["id"], "Covered B", "2.00", category["id"])
    await _create_line_item(client, token, bill["id"], "Left Out", "5.00", category["id"])

    async def _fake_call(**kwargs: Any) -> dict[str, Any]:
        # Covers only "Covered A"/"Covered B" - "Left Out" is a model omission the service
        # must still catch defensively even though this response is high-confidence/"resolved".
        items = kwargs["line_items"]
        by_desc = {li.description: i for i, li in enumerate(items)}
        return {
            "groups": [
                {
                    "name": "Groupe",
                    "slug": "groupe",
                    "item_indices": [by_desc["Covered A"], by_desc["Covered B"]],
                }
            ],
            "confidence": 0.9,
            "reasoning": "ok",
        }

    monkeypatch.setattr(subcategorizer_service, "call_subcategorizer", _fake_call)

    resp = await client.post("/line-items/subcategorize", headers=auth_header(token))
    assert resp.status_code == 200

    tree = await _get_category_tree(client, token)
    test_node = _find_node(tree["root"]["children"], "Test")
    assert test_node is not None
    groupe = _find_node(test_node["children"], "Groupe")
    assert groupe is not None
    assert groupe["total"] == "3.00"
    autre = _find_node(test_node["children"], subcategorizer_service.CATCH_ALL_NAME)
    assert autre is not None
    assert autre["total"] == "5.00"


async def test_subcategorize_is_a_full_overwrite(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = await signup_and_login(client, "subcat-e@example.com", "subcat_e")
    category = await _create_category(client, token, "Repeat", "repeat")
    bill = await _create_bill(client, token, "repeat-bill")
    await _create_line_item(client, token, bill["id"], "Item", "10.00", category["id"])

    async def _first_run(**kwargs: Any) -> dict[str, Any]:
        return {
            "groups": [{"name": "GroupOne", "slug": "group-one", "item_indices": [0]}],
            "confidence": 0.9,
            "reasoning": "ok",
        }

    monkeypatch.setattr(subcategorizer_service, "call_subcategorizer", _first_run)
    resp = await client.post("/line-items/subcategorize", headers=auth_header(token))
    assert resp.status_code == 200
    tree = await _get_category_tree(client, token)
    repeat = _find_node(tree["root"]["children"], "Repeat")
    assert repeat is not None
    assert _find_node(repeat["children"], "GroupOne") is not None

    async def _second_run(**kwargs: Any) -> dict[str, Any]:
        return {
            "groups": [{"name": "GroupTwo", "slug": "group-two", "item_indices": [0]}],
            "confidence": 0.9,
            "reasoning": "ok",
        }

    monkeypatch.setattr(subcategorizer_service, "call_subcategorizer", _second_run)
    resp = await client.post("/line-items/subcategorize", headers=auth_header(token))
    assert resp.status_code == 200

    tree = await _get_category_tree(client, token)
    repeat = _find_node(tree["root"]["children"], "Repeat")
    assert repeat is not None
    assert len(repeat["children"]) == 1
    assert repeat["children"][0]["name"] == "GroupTwo"
    assert _find_node(repeat["children"], "GroupOne") is None


async def test_subcategorize_cross_user_isolation(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    owner_token = await signup_and_login(client, "subcat-f-owner@example.com", "subcat_f_owner")
    other_token = await signup_and_login(client, "subcat-f-other@example.com", "subcat_f_other")

    category = await _create_category(client, owner_token, "Owned", "owned")
    bill = await _create_bill(client, owner_token, "owned-bill")
    await _create_line_item(client, owner_token, bill["id"], "Item", "10.00", category["id"])

    async def _fake_call(**kwargs: Any) -> dict[str, Any]:
        return {
            "groups": [{"name": "Group", "slug": "group", "item_indices": [0]}],
            "confidence": 0.9,
            "reasoning": "ok",
        }

    monkeypatch.setattr(subcategorizer_service, "call_subcategorizer", _fake_call)
    resp = await client.post("/line-items/subcategorize", headers=auth_header(owner_token))
    assert resp.status_code == 200
    assert resp.json()["categories_processed"] == 1

    other_resp = await client.post("/line-items/subcategorize", headers=auth_header(other_token))
    assert other_resp.status_code == 200
    assert other_resp.json() == {"categories_processed": 0, "subcategories_created": 0}

    other_tree = await _get_category_tree(client, other_token)
    assert other_tree["root"]["children"] == []

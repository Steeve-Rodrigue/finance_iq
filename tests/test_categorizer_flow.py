"""Phase 4 (categorizer): a resolved parse chains automatically into categorization. call_parser
is mocked as usual; call_categorizer is mocked here too (overriding conftest.py's default
"autre" stub) to exercise specific categorizer scenarios."""

from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient

from app.services import bill_parser_service, categorizer_service
from tests.helpers import auth_header, signup_and_login


def _mock_call_parser(monkeypatch: pytest.MonkeyPatch, result: dict[str, Any]) -> None:
    async def _fake_call_parser(pdf_path: Path, model: str) -> dict[str, Any]:
        return result

    monkeypatch.setattr(bill_parser_service, "call_parser", _fake_call_parser)


def _mock_call_categorizer(
    monkeypatch: pytest.MonkeyPatch, responses: list[dict[str, Any]]
) -> list[str]:
    calls_made: list[str] = []
    responses_iter = iter(responses)

    async def _fake_call_categorizer(**kwargs: Any) -> dict[str, Any]:
        calls_made.append(kwargs.get("model", ""))
        return next(responses_iter)

    monkeypatch.setattr(categorizer_service, "call_categorizer", _fake_call_categorizer)
    return calls_made


def _resolved_parser_result(**overrides: Any) -> dict[str, Any]:
    result = {
        "document_type": "receipt",
        "vendor_name_raw": "Green Grocer",
        "vendor_key": "green-grocer",
        "address": None,
        "invoice_number": None,
        "issue_date": "2026-01-15",
        "due_date": None,
        "service_period_start": None,
        "service_period_end": None,
        "currency": "EUR",
        "subtotal": 9.0,
        "tax_amount": 0.5,
        "total_amount": 9.5,
        "amount_due": 9.5,
        "payment_method": "carte",
        "line_items": [
            {
                "description": "Pommes",
                "common_name": "pommes",
                "quantity": 1,
                "unit_price": 3.0,
                "line_total": 3.0,
            }
        ],
        "confidence": 0.95,
        "reasoning": "Tout est lisible.",
    }
    result.update(overrides)
    return result


async def _upload(client: AsyncClient, token: str) -> dict[str, Any]:
    response = await client.post(
        "/bills/upload",
        files=[("files", ("bill.pdf", b"%PDF-1.4 fake", "application/pdf"))],
        headers=auth_header(token),
    )
    assert response.status_code == 201
    return response.json()[0]["bill"]


async def test_resolved_parse_auto_categorizes_with_a_new_category(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = await signup_and_login(client, "cat-a@example.com", "cat_a")
    _mock_call_parser(monkeypatch, _resolved_parser_result())
    _mock_call_categorizer(
        monkeypatch,
        [{"category_slug": "courses", "category_name": "Courses", "confidence": 0.9}],
    )

    bill = await _upload(client, token)
    assert bill["current_stage"] == "auditing"
    assert bill["category_id"] is not None

    categories = (await client.get("/categories/", headers=auth_header(token))).json()
    assert any(c["slug"] == "courses" for c in categories)

    # Regression: bill_line_items.category_id used to stay permanently null - the categorizer
    # decides at the bill level, but every line item should inherit that same category.
    line_items = (
        await client.get(f"/bills/{bill['id']}/line-items/", headers=auth_header(token))
    ).json()
    assert len(line_items) > 0
    assert all(li["category_id"] == bill["category_id"] for li in line_items)


async def test_categorizer_prefers_an_existing_category_over_creating_a_duplicate(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = await signup_and_login(client, "cat-b@example.com", "cat_b")
    create_resp = await client.post(
        "/categories/",
        json={"name": "Courses", "slug": "courses"},
        headers=auth_header(token),
    )
    assert create_resp.status_code == 201
    existing_category_id = create_resp.json()["id"]

    _mock_call_parser(monkeypatch, _resolved_parser_result())
    _mock_call_categorizer(
        monkeypatch,
        [{"category_slug": "courses", "category_name": "Courses", "confidence": 0.9}],
    )

    bill = await _upload(client, token)
    assert bill["category_id"] == existing_category_id

    categories = (await client.get("/categories/", headers=auth_header(token))).json()
    assert len([c for c in categories if c["slug"] == "courses"]) == 1


async def test_categorizer_retries_with_vendor_history_then_succeeds(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = await signup_and_login(client, "cat-c@example.com", "cat_c")
    _mock_call_parser(monkeypatch, _resolved_parser_result())
    calls = _mock_call_categorizer(
        monkeypatch,
        [
            {"category_slug": "courses", "category_name": "Courses", "confidence": 0.6},
            {"category_slug": "courses", "category_name": "Courses", "confidence": 0.85},
        ],
    )

    bill = await _upload(client, token)
    assert bill["current_stage"] == "auditing"
    assert calls == [categorizer_service.CATEGORIZER_MODEL, categorizer_service.RETRY_MODEL]


async def test_categorizer_unresolved_flags_bill_and_creates_elicitation(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = await signup_and_login(client, "cat-d@example.com", "cat_d")
    _mock_call_parser(monkeypatch, _resolved_parser_result())
    _mock_call_categorizer(
        monkeypatch,
        [
            {"category_slug": None, "category_name": None, "confidence": 0.2},
            {"category_slug": None, "category_name": None, "confidence": 0.3},
        ],
    )

    bill = await _upload(client, token)
    assert bill["status"] == "flagged"
    # Parsing already resolved and advanced the stage before categorization ran and got
    # stuck - current_stage reflects "categorization is where it's waiting", not parsing.
    assert bill["current_stage"] == "categorizing"

    elicitations = (
        await client.get(f"/bills/{bill['id']}/elicitations/", headers=auth_header(token))
    ).json()
    assert len(elicitations) == 1
    assert elicitations[0]["stage"] == "categorizing"
    assert elicitations[0]["status"] == "pending"


async def test_answering_a_categorization_elicitation_resumes_it(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = await signup_and_login(client, "cat-e@example.com", "cat_e")
    _mock_call_parser(monkeypatch, _resolved_parser_result())
    _mock_call_categorizer(
        monkeypatch,
        [
            {"category_slug": None, "category_name": None, "confidence": 0.2},
            {"category_slug": None, "category_name": None, "confidence": 0.3},
        ],
    )
    bill = await _upload(client, token)
    elicitation = (
        await client.get(f"/bills/{bill['id']}/elicitations/", headers=auth_header(token))
    ).json()[0]

    async def _fake_extract(question: str, partial_result: dict[str, Any], answer_text: str):
        return {"category_slug": "courses", "category_name": "Courses"}

    from app.services import elicitation_answers

    monkeypatch.setattr(elicitation_answers, "parse_elicitation_answer", _fake_extract)

    answer_resp = await client.post(
        f"/bills/{bill['id']}/elicitations/{elicitation['id']}/answer",
        json={"answer_text": "ce sont des courses"},
        headers=auth_header(token),
    )
    assert answer_resp.status_code == 200
    assert answer_resp.json()["status"] == "answered"

    resumed_bill = (await client.get(f"/bills/{bill['id']}", headers=auth_header(token))).json()
    assert resumed_bill["status"] == "pending"
    assert resumed_bill["current_stage"] == "auditing"
    assert resumed_bill["category_id"] is not None

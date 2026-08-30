"""Phase 3: the pause/resume elicitation flow. call_parser and parse_elicitation_answer are
both mocked (same principle as tests/test_bill_upload.py - no real, paid API call here)."""

import uuid
from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ConflictError
from app.services import bill_parser_service, elicitation_answers, elicitations_service
from tests.helpers import auth_header, signup_and_login


def _mock_call_parser(monkeypatch: pytest.MonkeyPatch, responses: list[dict[str, Any]]) -> None:
    responses_iter = iter(responses)

    async def _fake_call_parser(pdf_path: Path, model: str) -> dict[str, Any]:
        return next(responses_iter)

    monkeypatch.setattr(bill_parser_service, "call_parser", _fake_call_parser)


def _mock_parse_elicitation_answer(
    monkeypatch: pytest.MonkeyPatch, extracted: dict[str, Any] | Exception
) -> None:
    """Stub the OpenRouter call that turns the user's plain-text answer into structured
    corrections - tests only need to prove the flow wires the result through correctly, not
    that the model extracts well."""

    async def _fake_extract(question: str, partial_result: dict[str, Any], answer_text: str):
        if isinstance(extracted, Exception):
            raise extracted
        return extracted

    monkeypatch.setattr(elicitation_answers, "parse_elicitation_answer", _fake_extract)


def _low_confidence_result(**overrides: Any) -> dict[str, Any]:
    result = {
        "document_type": "receipt",
        "vendor_name_raw": "Blurry Mart",
        "vendor_key": "blurry-mart",
        "address": None,
        "invoice_number": None,
        "issue_date": "2026-01-15",
        "due_date": None,
        "service_period_start": None,
        "service_period_end": None,
        "currency": "EUR",
        "subtotal": None,
        "tax_amount": None,
        "total_amount": 12.0,
        "amount_due": 12.0,
        "payment_method": None,
        "line_items": [],
        "confidence": 0.30,
        "reasoning": "The total is legible but the vendor name and date are smudged.",
    }
    result.update(overrides)
    return result


async def _upload_unresolved(client: AsyncClient, token: str) -> dict[str, Any]:
    response = await client.post(
        "/bills/upload",
        files=[("files", ("blurry.pdf", b"%PDF-1.4 fake", "application/pdf"))],
        headers=auth_header(token),
    )
    assert response.status_code == 201
    return response.json()[0]["bill"]


async def test_unresolved_parse_creates_a_pending_elicitation(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = await signup_and_login(client, "elicit-a@example.com", "elicit_a")
    _mock_call_parser(monkeypatch, [_low_confidence_result(), _low_confidence_result()])

    bill = await _upload_unresolved(client, token)
    assert bill["status"] == "flagged"

    elicitations = (
        await client.get(f"/bills/{bill['id']}/elicitations/", headers=auth_header(token))
    ).json()
    assert len(elicitations) == 1
    elicitation = elicitations[0]
    assert elicitation["status"] == "pending"
    assert elicitation["stage"] == "parsing"
    assert "Blurry Mart" in elicitation["question"]
    assert elicitation["context"]["partial_result"]["vendor_key"] == "blurry-mart"


async def test_answering_an_elicitation_resumes_and_completes_the_bill(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = await signup_and_login(client, "elicit-b@example.com", "elicit_b")
    _mock_call_parser(monkeypatch, [_low_confidence_result(), _low_confidence_result()])
    _mock_parse_elicitation_answer(
        monkeypatch, {"vendor_name_raw": "Corner Mart", "vendor_key": "corner-mart"}
    )
    bill = await _upload_unresolved(client, token)
    elicitation = (
        await client.get(f"/bills/{bill['id']}/elicitations/", headers=auth_header(token))
    ).json()[0]

    answer_response = await client.post(
        f"/bills/{bill['id']}/elicitations/{elicitation['id']}/answer",
        json={"answer_text": "it's from Corner Mart"},
        headers=auth_header(token),
    )
    assert answer_response.status_code == 200
    answered = answer_response.json()
    assert answered["status"] == "answered"
    assert answered["answer"]["text"] == "it's from Corner Mart"
    assert answered["answer"]["extracted"] == {
        "vendor_name_raw": "Corner Mart",
        "vendor_key": "corner-mart",
    }
    assert answered["answered_at"] is not None

    resumed_bill = (await client.get(f"/bills/{bill['id']}", headers=auth_header(token))).json()
    assert resumed_bill["status"] == "resolved"
    assert resumed_bill["current_stage"] == "complete"
    assert resumed_bill["vendor_name_raw"] == "Corner Mart"
    # merged: fields the parser did read correctly (total_amount) survive alongside the
    # human's correction (vendor_name_raw) - the answer doesn't wipe out everything else.
    assert resumed_bill["total_amount"] == "12.00"

    vendors = (await client.get("/vendors/", headers=auth_header(token))).json()
    assert any(v["key"] == "corner-mart" for v in vendors)


async def test_answering_preserves_line_item_amounts_when_answer_only_mentions_some_items(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Regression: the user's plain-text answer mentioned an item only by name (no amount),
    which used to wholesale-replace the parser's original line_items array (with its real
    line_total values) instead of patching just that one item - dropping every item's amount
    and, since persist_bill_result skips items without a line_total, creating none at all."""
    token = await signup_and_login(client, "elicit-g@example.com", "elicit_g")
    original_line_items = [
        {
            "description": "BANANE PIECE X,5",
            "common_name": "banane",
            "quantity": 1,
            "unit_price": 2.45,
            "line_total": 2.45,
        },
        {
            "description": "ELOI BIG RIZ BASN",
            "common_name": "riz basmati",
            "quantity": 1,
            "unit_price": 1.49,
            "line_total": 1.49,
        },
    ]
    _mock_call_parser(
        monkeypatch,
        [
            _low_confidence_result(line_items=original_line_items),
            _low_confidence_result(line_items=original_line_items),
        ],
    )
    _mock_parse_elicitation_answer(
        monkeypatch,
        {
            "address": "12 place du vert buisson",
            "line_items": [{"common_name": "banane", "description": "banane"}],
        },
    )
    bill = await _upload_unresolved(client, token)
    elicitation = (
        await client.get(f"/bills/{bill['id']}/elicitations/", headers=auth_header(token))
    ).json()[0]

    answer_response = await client.post(
        f"/bills/{bill['id']}/elicitations/{elicitation['id']}/answer",
        json={"answer_text": "lieu : 12 place du vert buisson, items 1 : banane"},
        headers=auth_header(token),
    )
    assert answer_response.status_code == 200

    line_items = (
        await client.get(f"/bills/{bill['id']}/line-items/", headers=auth_header(token))
    ).json()
    assert len(line_items) == 2
    by_common_name = {li["common_name"]: li for li in line_items}
    assert by_common_name["banane"]["line_total"] == "2.45"
    assert by_common_name["riz basmati"]["line_total"] == "1.49"


async def test_answering_applies_line_item_correction_by_index_when_names_dont_match(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Regression: the user's correction for a garbled item ("TOP BUOGET FOURRE CH" ->
    "biscuit fourré") shares no common_name/description substring with the original at all, so
    a name-based match can never find it - ANSWER_EXTRACTION_PROMPT is told to reference the
    item by its 0-based position in the original array instead, and _merge_line_items must
    honor that "index" field rather than silently dropping the correction (and the item)
    because no name matched."""
    token = await signup_and_login(client, "elicit-h@example.com", "elicit_h")
    original_line_items = [
        {
            "description": "BANANE PIECE X,5",
            "common_name": "banane",
            "quantity": 1,
            "unit_price": 2.45,
            "line_total": 2.45,
        },
        {
            "description": "TOP BUOGET FOURRE CH",
            "common_name": "article inconnu",
            "quantity": 1,
            "unit_price": 1.37,
            "line_total": 1.37,
        },
    ]
    _mock_call_parser(
        monkeypatch,
        [
            _low_confidence_result(line_items=original_line_items),
            _low_confidence_result(line_items=original_line_items),
        ],
    )
    _mock_parse_elicitation_answer(
        monkeypatch,
        {
            "line_items": [
                {"index": 1, "common_name": "biscuit fourré", "description": "biscuit fourré"}
            ]
        },
    )
    bill = await _upload_unresolved(client, token)
    elicitation = (
        await client.get(f"/bills/{bill['id']}/elicitations/", headers=auth_header(token))
    ).json()[0]

    answer_response = await client.post(
        f"/bills/{bill['id']}/elicitations/{elicitation['id']}/answer",
        json={"answer_text": "items 2 : top budjet fourré, c'est un biscuit fourré"},
        headers=auth_header(token),
    )
    assert answer_response.status_code == 200

    line_items = (
        await client.get(f"/bills/{bill['id']}/line-items/", headers=auth_header(token))
    ).json()
    assert len(line_items) == 2
    by_common_name = {li["common_name"]: li for li in line_items}
    assert by_common_name["banane"]["line_total"] == "2.45"
    # The corrected item kept its original amount even though the correction didn't mention
    # one - only its name/description changed.
    assert by_common_name["biscuit fourré"]["line_total"] == "1.37"


async def test_answering_an_already_answered_elicitation_is_conflict(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = await signup_and_login(client, "elicit-c@example.com", "elicit_c")
    _mock_call_parser(monkeypatch, [_low_confidence_result(), _low_confidence_result()])
    _mock_parse_elicitation_answer(monkeypatch, {"vendor_key": "corner-mart"})
    bill = await _upload_unresolved(client, token)
    elicitation = (
        await client.get(f"/bills/{bill['id']}/elicitations/", headers=auth_header(token))
    ).json()[0]

    await client.post(
        f"/bills/{bill['id']}/elicitations/{elicitation['id']}/answer",
        json={"answer_text": "it's Corner Mart"},
        headers=auth_header(token),
    )
    second = await client.post(
        f"/bills/{bill['id']}/elicitations/{elicitation['id']}/answer",
        json={"answer_text": "actually it's someone else"},
        headers=auth_header(token),
    )
    assert second.status_code == 409


async def test_answering_a_nonexistent_elicitation_is_not_found(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = await signup_and_login(client, "elicit-d@example.com", "elicit_d")
    _mock_call_parser(monkeypatch, [_low_confidence_result(), _low_confidence_result()])
    bill = await _upload_unresolved(client, token)

    response = await client.post(
        f"/bills/{bill['id']}/elicitations/{uuid.uuid4()}/answer",
        json={"answer_text": "x"},
        headers=auth_header(token),
    )
    assert response.status_code == 404


async def test_answering_another_users_elicitation_is_not_found(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    owner_token = await signup_and_login(client, "elicit-e@example.com", "elicit_e")
    other_token = await signup_and_login(client, "elicit-f@example.com", "elicit_f")
    _mock_call_parser(monkeypatch, [_low_confidence_result(), _low_confidence_result()])
    bill = await _upload_unresolved(client, owner_token)
    elicitation = (
        await client.get(f"/bills/{bill['id']}/elicitations/", headers=auth_header(owner_token))
    ).json()[0]

    response = await client.post(
        f"/bills/{bill['id']}/elicitations/{elicitation['id']}/answer",
        json={"answer_text": "hijacked"},
        headers=auth_header(other_token),
    )
    assert response.status_code == 404


async def test_claiming_a_pending_elicitation_twice_only_succeeds_once(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The actual concurrency guard, not the higher-level fast-path status check a plain
    read-then-write couldn't prevent: two calls racing to claim the same PENDING elicitation
    (e.g. a client retry after a slow/dropped response) must not both win. This is what stops
    resume_from_elicitation_answer from persisting (and duplicating line items) twice."""
    token = await signup_and_login(client, "elicit-g@example.com", "elicit_g")
    _mock_call_parser(monkeypatch, [_low_confidence_result(), _low_confidence_result()])
    bill = await _upload_unresolved(client, token)
    elicitation = (
        await client.get(f"/bills/{bill['id']}/elicitations/", headers=auth_header(token))
    ).json()[0]

    user_id = uuid.UUID(bill["user_id"])
    bill_id = uuid.UUID(bill["id"])
    elicitation_id = uuid.UUID(elicitation["id"])

    first = await elicitations_service.claim_pending_elicitation(
        db_session, user_id, bill_id, elicitation_id
    )
    assert first.status == "answered"

    with pytest.raises(ConflictError):
        await elicitations_service.claim_pending_elicitation(
            db_session, user_id, bill_id, elicitation_id
        )


async def test_answer_that_cant_be_understood_is_unprocessable(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = await signup_and_login(client, "elicit-g@example.com", "elicit_g")
    _mock_call_parser(monkeypatch, [_low_confidence_result(), _low_confidence_result()])
    _mock_parse_elicitation_answer(monkeypatch, RuntimeError("invalid JSON from model: boom"))
    bill = await _upload_unresolved(client, token)
    elicitation = (
        await client.get(f"/bills/{bill['id']}/elicitations/", headers=auth_header(token))
    ).json()[0]

    response = await client.post(
        f"/bills/{bill['id']}/elicitations/{elicitation['id']}/answer",
        json={"answer_text": "???"},
        headers=auth_header(token),
    )
    assert response.status_code == 422

    # Still pending, not silently marked answered with garbage.
    still_pending = (
        await client.get(f"/bills/{bill['id']}/elicitations/", headers=auth_header(token))
    ).json()[0]
    assert still_pending["status"] == "pending"

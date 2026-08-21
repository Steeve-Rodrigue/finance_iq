"""Phase 3: the pause/resume elicitation flow. call_parser is mocked (same principle as
tests/test_bill_upload.py - no real, paid API call here), and mcp_client.save_bill is mocked
via the autouse fixture in tests/conftest.py for the same reason a real subprocess/DB
connection shouldn't run inside the transaction-rollback test harness - that connection
would commit for real, escaping the rollback these tests otherwise get for free. The actual
MCP server subprocess is verified separately, live, not as part of this automated suite (a
real subprocess round-trip can't honor this fixture's rollback-based isolation either)."""

import uuid
from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient

from app.services import bill_parser_service
from tests.helpers import auth_header, signup_and_login


def _mock_call_parser(monkeypatch: pytest.MonkeyPatch, responses: list[dict[str, Any]]) -> None:
    responses_iter = iter(responses)

    async def _fake_call_parser(pdf_path: Path, model: str) -> dict[str, Any]:
        return next(responses_iter)

    monkeypatch.setattr(bill_parser_service, "call_parser", _fake_call_parser)


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
    bill = await _upload_unresolved(client, token)
    elicitation = (
        await client.get(f"/bills/{bill['id']}/elicitations/", headers=auth_header(token))
    ).json()[0]

    answer_response = await client.post(
        f"/bills/{bill['id']}/elicitations/{elicitation['id']}/answer",
        json={"answer": {"vendor_name_raw": "Corner Mart", "vendor_key": "corner-mart"}},
        headers=auth_header(token),
    )
    assert answer_response.status_code == 200
    answered = answer_response.json()
    assert answered["status"] == "answered"
    assert answered["answer"] == {"vendor_name_raw": "Corner Mart", "vendor_key": "corner-mart"}
    assert answered["answered_at"] is not None

    resumed_bill = (await client.get(f"/bills/{bill['id']}", headers=auth_header(token))).json()
    assert resumed_bill["status"] == "pending"
    assert resumed_bill["current_stage"] == "categorizing"
    assert resumed_bill["vendor_name_raw"] == "Corner Mart"
    # merged: fields the parser did read correctly (total_amount) survive alongside the
    # human's correction (vendor_name_raw) - the answer doesn't wipe out everything else.
    assert resumed_bill["total_amount"] == "12.00"

    vendors = (await client.get("/vendors/", headers=auth_header(token))).json()
    assert any(v["key"] == "corner-mart" for v in vendors)


async def test_answering_an_already_answered_elicitation_is_conflict(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = await signup_and_login(client, "elicit-c@example.com", "elicit_c")
    _mock_call_parser(monkeypatch, [_low_confidence_result(), _low_confidence_result()])
    bill = await _upload_unresolved(client, token)
    elicitation = (
        await client.get(f"/bills/{bill['id']}/elicitations/", headers=auth_header(token))
    ).json()[0]

    await client.post(
        f"/bills/{bill['id']}/elicitations/{elicitation['id']}/answer",
        json={"answer": {"vendor_key": "corner-mart"}},
        headers=auth_header(token),
    )
    second = await client.post(
        f"/bills/{bill['id']}/elicitations/{elicitation['id']}/answer",
        json={"answer": {"vendor_key": "someone-else"}},
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
        json={"answer": {"vendor_key": "x"}},
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
        json={"answer": {"vendor_key": "hijacked"}},
        headers=auth_header(other_token),
    )
    assert response.status_code == 404

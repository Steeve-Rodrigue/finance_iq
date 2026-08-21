"""Upload + parser decision loop, with the real Claude Agent SDK call mocked out - no test
here should ever make a real, paid API call."""

import shutil
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient

from app.config import settings
from app.services import bill_parser_service
from tests.helpers import auth_header, signup_and_login


@pytest.fixture(autouse=True)
def _clean_upload_dir() -> AsyncIterator[None]:
    yield
    shutil.rmtree(settings.upload_dir, ignore_errors=True)


def _mock_call_parser(
    monkeypatch: pytest.MonkeyPatch, responses: list[dict[str, Any]]
) -> list[str]:
    """Replace bill_parser_service.call_parser with a stub that returns `responses` in
    order (one per call) and records which model each call used."""
    calls_made: list[str] = []
    responses_iter = iter(responses)

    async def _fake_call_parser(pdf_path: Path, model: str) -> dict[str, Any]:
        calls_made.append(model)
        return next(responses_iter)

    monkeypatch.setattr(bill_parser_service, "call_parser", _fake_call_parser)
    return calls_made


def _high_confidence_result(**overrides: Any) -> dict[str, Any]:
    result = {
        "document_type": "receipt",
        "vendor_name_raw": "Corner Store",
        "vendor_key": "corner-store",
        "address": "1 Main St",
        "invoice_number": "R-001",
        "issue_date": "2026-01-15",
        "due_date": None,
        "service_period_start": None,
        "service_period_end": None,
        "currency": "EUR",
        "subtotal": 10.00,
        "tax_amount": 0.50,
        "total_amount": 10.50,
        "amount_due": 10.50,
        "payment_method": "card",
        "line_items": [
            {
                "description": "Bread",
                "common_name": "bread",
                "quantity": 1,
                "unit_price": 3.50,
                "line_total": 3.50,
            },
            {
                "description": "Milk",
                "common_name": "milk",
                "quantity": 1,
                "unit_price": 7.00,
                "line_total": 7.00,
            },
        ],
        "confidence": 0.95,
        "reasoning": "Everything is legible and the totals reconcile.",
    }
    result.update(overrides)
    return result


async def _upload(
    client: AsyncClient,
    token: str,
    filename: str = "bill.pdf",
    content: bytes = b"%PDF-1.4 fake",
):
    return await client.post(
        "/bills/upload",
        files=[("files", (filename, content, "application/pdf"))],
        headers=auth_header(token),
    )


async def test_upload_high_confidence_succeeds_on_first_attempt(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = await signup_and_login(client, "upload-a@example.com", "upload_a")
    calls = _mock_call_parser(monkeypatch, [_high_confidence_result()])

    response = await _upload(client, token)
    assert response.status_code == 201
    results = response.json()
    assert len(results) == 1
    assert results[0]["error"] is None
    bill = results[0]["bill"]
    assert bill["vendor_name_raw"] == "Corner Store"
    assert bill["total_amount"] == "10.50"
    assert bill["current_stage"] == "categorizing"
    assert bill["status"] == "pending"
    assert calls == [bill_parser_service.PARSER_MODEL]

    line_items = await client.get(f"/bills/{bill['id']}/line-items/", headers=auth_header(token))
    assert len(line_items.json()) == 2

    vendors = await client.get("/vendors/", headers=auth_header(token))
    assert any(v["key"] == "corner-store" for v in vendors.json())


async def test_upload_retries_on_medium_confidence_then_succeeds(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = await signup_and_login(client, "upload-b@example.com", "upload_b")
    calls = _mock_call_parser(
        monkeypatch,
        [_high_confidence_result(confidence=0.65), _high_confidence_result(confidence=0.90)],
    )

    response = await _upload(client, token)
    assert response.status_code == 201
    bill = response.json()[0]["bill"]
    assert bill["current_stage"] == "categorizing"
    assert calls == [bill_parser_service.PARSER_MODEL, bill_parser_service.RETRY_MODEL]


async def test_upload_still_low_confidence_after_retry_is_flagged_not_guessed(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = await signup_and_login(client, "upload-c@example.com", "upload_c")
    calls = _mock_call_parser(
        monkeypatch,
        [_high_confidence_result(confidence=0.30), _high_confidence_result(confidence=0.35)],
    )

    response = await _upload(client, token)
    assert response.status_code == 201
    result = response.json()[0]
    assert result["error"] is None
    bill = result["bill"]
    # Non-negotiable #4: never guess silently. Still resolves the request (no elicitation
    # flow yet - Phase 3), but surfaces the bill for human attention instead of pretending
    # the low-confidence extraction succeeded.
    assert bill["status"] == "flagged"
    assert bill["current_stage"] == "parsing"
    assert len(calls) == 2


async def test_upload_batch_isolates_per_file_failures(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = await signup_and_login(client, "upload-d@example.com", "upload_d")
    _mock_call_parser(monkeypatch, [_high_confidence_result()])

    response = await client.post(
        "/bills/upload",
        files=[
            ("files", ("good.pdf", b"%PDF-1.4 fake", "application/pdf")),
            ("files", ("notes.txt", b"not a pdf", "text/plain")),
        ],
        headers=auth_header(token),
    )
    assert response.status_code == 201
    results = {r["filename"]: r for r in response.json()}
    assert results["good.pdf"]["error"] is None
    assert results["good.pdf"]["bill"] is not None
    assert results["notes.txt"]["bill"] is None
    assert "PDF" in results["notes.txt"]["error"]


async def test_upload_batch_recovers_from_a_flush_failure_mid_batch(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A parsed result with a document_type outside the DocumentType enum fails at flush()
    inside bills_repo.update, aborting the shared session's transaction. Without a rollback
    in the router's per-file except block, every file *after* the bad one in the same batch
    would fail too - this proves the rollback actually recovers the session."""
    token = await signup_and_login(client, "upload-g@example.com", "upload_g")
    _mock_call_parser(
        monkeypatch,
        [
            _high_confidence_result(),
            _high_confidence_result(document_type="bank_statement"),
            _high_confidence_result(),
        ],
    )

    response = await client.post(
        "/bills/upload",
        files=[
            ("files", ("first.pdf", b"%PDF-1.4 fake", "application/pdf")),
            ("files", ("bad.pdf", b"%PDF-1.4 fake", "application/pdf")),
            ("files", ("third.pdf", b"%PDF-1.4 fake", "application/pdf")),
        ],
        headers=auth_header(token),
    )
    assert response.status_code == 201
    results = {r["filename"]: r for r in response.json()}
    assert results["first.pdf"]["error"] is None
    assert results["bad.pdf"]["error"] is not None
    assert results["third.pdf"]["error"] is None
    assert results["third.pdf"]["bill"] is not None


async def test_uploaded_bill_is_cross_user_isolated(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    owner_token = await signup_and_login(client, "upload-e@example.com", "upload_e")
    other_token = await signup_and_login(client, "upload-f@example.com", "upload_f")
    _mock_call_parser(monkeypatch, [_high_confidence_result()])

    response = await _upload(client, owner_token)
    bill_id = response.json()[0]["bill"]["id"]

    get_resp = await client.get(f"/bills/{bill_id}", headers=auth_header(other_token))
    assert get_resp.status_code == 404

"""Upload + parser decision loop, with the real Claude Agent SDK call mocked out - no test
here should ever make a real, paid API call."""

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from httpx import AsyncClient

from app.services import bill_parser_service, llm_client
from tests.helpers import auth_header, signup_and_login

_TEXT_LAYER_PDF = Path("data/Invoice3.pdf")
_SCANNED_PDF = Path("data/Invoice2.pdf")
# data/ is gitignored (real sample bills aren't committed) - CI checkouts don't have these,
# so this test only runs where they happen to be present locally.
_skip_without_sample_pdfs = pytest.mark.skipif(
    not (_TEXT_LAYER_PDF.exists() and _SCANNED_PDF.exists()),
    reason="Invoice2.pdf and Invoice3.pdf are gitignored, not present in this checkout",
)


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
        "payment_status": "paid",
        "extraction_strategy": "vision",
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
    assert bill["current_stage"] == "complete"
    assert bill["status"] == "resolved"
    # Regression: these two used to be silently dropped - never in _BILL_FIELDS at all.
    assert bill["payment_status"] == "paid"
    assert bill["extraction_strategy"] == "vision"
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
    assert bill["current_stage"] == "complete"
    assert calls == [bill_parser_service.PARSER_MODEL, bill_parser_service.RETRY_MODEL]


async def test_upload_recovers_from_malformed_json_on_first_attempt(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A parser response that fails to parse as JSON (e.g. an unescaped quote from garbled
    OCR text) must not crash run_decision_loop before the retry model ever runs - it should
    degrade to confidence=0 and retry, same as any other low-confidence first attempt."""
    calls_made: list[str] = []
    responses = iter([RuntimeError("invalid JSON from parser: boom"), _high_confidence_result()])

    async def _fake_call_parser(pdf_path: Path, model: str) -> dict[str, Any]:
        calls_made.append(model)
        response = next(responses)
        if isinstance(response, Exception):
            raise response
        return response

    monkeypatch.setattr(bill_parser_service, "call_parser", _fake_call_parser)

    token = await signup_and_login(client, "upload-h@example.com", "upload_h")
    response = await _upload(client, token)
    assert response.status_code == 201
    result = response.json()[0]
    assert result["error"] is None
    assert result["bill"]["current_stage"] == "complete"
    assert calls_made == [bill_parser_service.PARSER_MODEL, bill_parser_service.RETRY_MODEL]


async def test_upload_creates_elicitation_when_both_attempts_fail_to_parse(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """If even the retry model's response fails to parse, the bill must still resolve the
    request as an elicitation (non-negotiable #4: never fail silently) - not a raw 500 from
    an unhandled exception."""

    async def _fake_call_parser(pdf_path: Path, model: str) -> dict[str, Any]:
        raise RuntimeError("invalid JSON from parser: boom")

    monkeypatch.setattr(bill_parser_service, "call_parser", _fake_call_parser)

    token = await signup_and_login(client, "upload-i@example.com", "upload_i")
    response = await _upload(client, token)
    assert response.status_code == 201
    result = response.json()[0]
    assert result["error"] is None
    bill = result["bill"]
    assert bill["status"] == "flagged"

    elicitations = (
        await client.get(f"/bills/{bill['id']}/elicitations/", headers=auth_header(token))
    ).json()
    assert len(elicitations) == 1
    assert elicitations[0]["status"] == "pending"


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


@_skip_without_sample_pdfs
async def test_call_parser_sets_extraction_strategy_to_vision_regardless_of_text_layer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Every bill goes through the same render-pages-to-images path now, whether or not it has
    a real text layer - no more direct-vs-OCR branching. Only the model call is mocked here;
    pdf_extraction.render_pages runs for real against both real sample PDFs, so this proves
    call_parser actually renders and sends images for both, not just that persistence maps a
    pre-supplied value."""

    async def _fake_create(**kwargs: Any) -> SimpleNamespace:
        content = json.dumps({"confidence": 0.9, "reasoning": "test"})
        message = SimpleNamespace(content=content)
        choice = SimpleNamespace(message=message, finish_reason="stop")
        return SimpleNamespace(choices=[choice], usage=None)

    monkeypatch.setattr(llm_client.client.chat.completions, "create", _fake_create)

    text_layer_result = await bill_parser_service.call_parser(_TEXT_LAYER_PDF, "any-model")
    assert text_layer_result["extraction_strategy"] == "vision"

    scanned_result = await bill_parser_service.call_parser(_SCANNED_PDF, "any-model")
    assert scanned_result["extraction_strategy"] == "vision"

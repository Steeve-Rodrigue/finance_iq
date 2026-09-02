"""Public /demo/bills/upload + /demo/cleanup - the real vision pipeline behind a no-auth,
shared-account endpoint (app/routers/demo.py). Same call_parser mocking as
tests/test_bill_upload.py to avoid a real, paid API call - only the auth/scoping/rate-limit/
cleanup mechanics here are demo-specific, the actual decision loop itself is identical and
already covered by test_bill_upload.py."""

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.repos import bills_repo
from app.routers import demo as demo_router
from app.services import bill_parser_service, demo_service


def _mock_call_parser(monkeypatch: pytest.MonkeyPatch, result: dict[str, Any]) -> None:
    async def _fake_call_parser(pdf_path: Any, model: str) -> dict[str, Any]:
        return result

    monkeypatch.setattr(bill_parser_service, "call_parser", _fake_call_parser)


def _high_confidence_result(**overrides: Any) -> dict[str, Any]:
    result = {
        "document_type": "receipt",
        "vendor_name_raw": "Demo Vendor",
        "vendor_key": "demo-vendor",
        "address": "1 Demo St",
        "invoice_number": "D-001",
        "issue_date": "2026-01-15",
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
                "description": "Item",
                "common_name": "item",
                "quantity": 1,
                "unit_price": 10.50,
                "line_total": 10.50,
            },
        ],
        "confidence": 0.95,
        "reasoning": "Clear and legible.",
    }
    result.update(overrides)
    return result


async def _upload(client: AsyncClient, filename: str = "bill.pdf") -> Response:
    return await client.post(
        "/demo/bills/upload",
        files=[("files", (filename, b"%PDF-1.4 fake", "application/pdf"))],
    )


async def test_demo_upload_creates_a_real_bill_with_no_auth(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_call_parser(monkeypatch, _high_confidence_result())

    response = await _upload(client)
    assert response.status_code == 201
    results = response.json()
    assert len(results) == 1
    assert results[0]["error"] is None
    bill = results[0]["bill"]
    assert bill["vendor_name_raw"] == "Demo Vendor"
    assert bill["status"] == "resolved"
    assert len(results[0]["line_items"]) == 1
    assert results[0]["line_items"][0]["description"] == "Item"


async def test_demo_upload_low_confidence_creates_an_elicitation(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_call_parser(
        monkeypatch,
        _high_confidence_result(confidence=0.3, reasoning="Illisible."),
    )

    response = await _upload(client)
    assert response.status_code == 201
    result = response.json()[0]
    assert result["error"] is None
    assert result["bill"]["status"] == "flagged"
    assert len(result["elicitations"]) == 1
    assert result["elicitations"][0]["status"] == "pending"


async def test_demo_upload_only_accepts_one_file_per_request(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_call_parser(monkeypatch, _high_confidence_result())

    response = await client.post(
        "/demo/bills/upload",
        files=[
            ("files", ("first.pdf", b"%PDF-1.4 fake", "application/pdf")),
            ("files", ("second.pdf", b"%PDF-1.4 fake", "application/pdf")),
        ],
    )
    assert response.status_code == 201
    assert len(response.json()) == 1


async def test_demo_upload_rejects_non_pdf(client: AsyncClient) -> None:
    response = await client.post(
        "/demo/bills/upload",
        files=[("files", ("notes.txt", b"not a pdf", "text/plain"))],
    )
    assert response.status_code == 201
    result = response.json()[0]
    assert result["bill"] is None
    assert "PDF" in result["error"]


async def test_demo_upload_is_rate_limited_per_client(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_call_parser(monkeypatch, _high_confidence_result())
    monkeypatch.setattr(demo_router, "RATE_LIMIT_MAX_REQUESTS", 2)

    for _ in range(2):
        response = await _upload(client)
        assert response.status_code == 201

    response = await _upload(client)
    assert response.status_code == 429


async def test_demo_cleanup_with_no_demo_user_yet_is_a_noop(client: AsyncClient) -> None:
    response = await client.post("/demo/cleanup")
    assert response.status_code == 200
    assert response.json() == {"deleted": 0}


async def test_demo_cleanup_deletes_only_stale_bills(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, db_session: AsyncSession
) -> None:
    _mock_call_parser(monkeypatch, _high_confidence_result())
    await _upload(client)

    user_id = await demo_service.get_or_create_demo_user(db_session)
    bills = await bills_repo.list_by_user(db_session, user_id)
    assert len(bills) == 1
    # Backdate it past the cleanup threshold directly rather than mocking time - simplest way
    # to prove the age filter itself works.
    bills[0].created_at = datetime.now(UTC) - timedelta(hours=2)
    await db_session.flush()

    response = await client.post("/demo/cleanup")
    assert response.status_code == 200
    assert response.json() == {"deleted": 1}

    remaining = await bills_repo.list_by_user(db_session, user_id)
    assert remaining == []

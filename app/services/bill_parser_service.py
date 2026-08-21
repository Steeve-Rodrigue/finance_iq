import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import structlog
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.exceptions import ConflictError
from app.models.bills import BillStage, BillStatus
from app.models.elicitations import ElicitationStage, ElicitationStatus
from app.repos import bill_line_items_repo, bills_repo, vendors_repo
from app.services import elicitations_service, pdf_extraction

logger = structlog.get_logger()

_client = AsyncOpenAI(
    api_key=settings.openrouter_api_key, base_url=settings.openrouter_base_url, timeout=60
)

PARSER_MODEL = settings.parser_model
RETRY_MODEL = settings.parser_retry_model
HIGH_CONFIDENCE_THRESHOLD = 0.80
LOW_CONFIDENCE_FLOOR = 0.50

PARSER_PROMPT = """You extract information from an invoice or receipt, given the text \
extracted from the original PDF below - usually clean, but it may contain OCR recognition \
errors (misread characters, garbled words) if the source was a scanned document. Account for \
that possibility when judging your confidence.

Respond ONLY in JSON, no markdown, no preamble, with exactly this shape:

{
  "document_type": "invoice or receipt",
  "vendor_name_raw": "name exactly as printed",
  "vendor_key": "vendor name normalized to lowercase",
  "address": "vendor's full address, or null",
  "invoice_number": "invoice or receipt reference number, or null",
  "issue_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "service_period_start": "YYYY-MM-DD or null",
  "service_period_end": "YYYY-MM-DD or null",
  "currency": "EUR",
  "subtotal": 0.00,
  "tax_amount": 0.00,
  "total_amount": 0.00,
  "amount_due": 0.00,
  "payment_method": "card, direct debit, cash, transfer, or null",
  "line_items": [
    {
      "description": "...", "common_name": "...",
      "quantity": 1, "unit_price": 0.00, "line_total": 0.00
    }
  ],
  "confidence": 0.0,
  "reasoning": "why this confidence level"
}

Field-by-field notes:
- document_type: "invoice" for a supplier invoice (itemized tax, billing period), "receipt" for a
  point-of-sale/card receipt with a single amount.
- vendor_name_raw: the merchant/vendor's name exactly as printed on this specific document.
- vendor_key: the same name normalized (lowercase, no punctuation or legal-entity suffix) - used
  to look up or create the matching vendor, so it must stay stable even if vendor_name_raw varies
  slightly between documents for the same merchant.
- address : complete address, make sure the parse text looks like a real addres, otherwise,
  make research
- invoice_number: as printed, or null if there isn't one.
- issue_date / due_date: YYYY-MM-DD, or null if absent or not applicable.
- service_period_start / service_period_end: the period the invoice covers (e.g. a subscription
  or utility bill), or null for a one-off receipt with no period.
- subtotal: amount before tax.
- tax_amount: the sum of all applicable taxes (e.g. several VAT rates) as one single amount -
  don't try to break out each rate separately.
- total_amount: total amount including tax.
- amount_due: same as total_amount, unless the document explicitly shows a different remaining
  balance still owed (e.g. a partial payment already made) - in that case use that balance.
- currency: the ISO-4217 code inferred from the document's actual currency symbol or text
  (e.g. "€" or "EUR" -> EUR, "$" -> USD, "£" -> GBP). Do not default to EUR - only use it if
  the document is genuinely in euros or the currency truly can't be determined.
- payment_method: "card", "direct debit", "cash", "transfer", or null if not shown.
- line_items: one entry per line on the document.
  - description: the exact label as printed.
  - common_name: a short, normalized name derived from description (e.g. "premium wheat bread"
    -> "bread").
  - quantity, unit_price, line_total: as printed, or inferred from context if only one of the
    three is missing (line_total = quantity * unit_price).
- confidence: your overall confidence in this extraction, between 0 and 1.
  - >= 0.80 (high): every key field is legible and the amounts reconcile (line_items +
    tax_amount = total_amount, etc.).
  - 0.50 to 0.80 (medium): plausible but one or two fields are ambiguous or partly illegible.
  - < 0.50 (low): key fields are missing, illegible, or the amounts don't reconcile at all.
- reasoning: one short sentence explaining that confidence level (e.g. which field is the
  problem).
"""


async def call_parser(pdf_path: Path, model: str) -> dict[str, Any]:
    """Extract text from the PDF locally (direct extraction, OCR fallback for scans), then
    send it to `model` via OpenRouter. Raises RuntimeError if the response can't be parsed as
    the expected JSON object."""
    text, extraction_method = await pdf_extraction.extract_text(pdf_path)
    logger.debug("bill_parser.extracted_text", method=extraction_method, chars=len(text))

    response = await _client.chat.completions.create(
        model=model,
        max_tokens=4096,
        messages=[
            {"role": "system", "content": PARSER_PROMPT},
            {"role": "user", "content": f"Extracted text:\n\n{text}"},
        ],
        temperature=0.3,
        extra_body={"reasoning": {"effort": "low"}},
    )

    choice = response.choices[0]
    raw = (choice.message.content or "").strip()
    logger.debug("bill_parser.raw_response", raw=raw[:500])

    if not raw:
        raise RuntimeError(
            f"parser returned no text response (finish_reason={choice.finish_reason!r}, "
            f"usage={response.usage})"
        )

    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise RuntimeError(f"no JSON object found in parser response:\n{raw}")

    try:
        return json.loads(raw[start : end + 1])
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"invalid JSON from parser: {exc}\n\nraw response:\n{raw}") from exc


async def run_decision_loop(pdf_path: Path) -> tuple[dict[str, Any], bool]:
    """High confidence on the first (cheap) pass -> accept it. Medium -> retry once on a
    stronger model, a genuinely different approach per /CLAUDE.md non-negotiable #3, not the
    same call again. Still low after that -> give up and say so, don't guess (non-negotiable
    #4) - real elicitation is Phase 3, this just returns resolved=False.

    Returns (result, resolved).
    """
    result = await call_parser(pdf_path, PARSER_MODEL)
    logger.info("bill_parser.attempt", model=PARSER_MODEL, confidence=result.get("confidence"))
    if result.get("confidence", 0) >= HIGH_CONFIDENCE_THRESHOLD:
        return result, True

    result = await call_parser(pdf_path, RETRY_MODEL)
    logger.info("bill_parser.retry", model=RETRY_MODEL, confidence=result.get("confidence"))
    if result.get("confidence", 0) >= LOW_CONFIDENCE_FLOOR:
        return result, True

    return result, False


async def _get_or_create_vendor_id(
    db: AsyncSession, user_id: uuid.UUID, result: dict[str, Any]
) -> uuid.UUID | None:
    vendor_key = result.get("vendor_key")
    if not vendor_key:
        return None
    vendor = await vendors_repo.get_by_key(db, user_id, vendor_key)
    if vendor is None:
        vendor = await vendors_repo.create(
            db,
            user_id,
            name=result.get("vendor_name_raw") or vendor_key,
            key=vendor_key,
            address=result.get("address"),
        )
    return vendor.id


_BILL_FIELDS = (
    "document_type",
    "invoice_number",
    "vendor_name_raw",
    "issue_date",
    "due_date",
    "service_period_start",
    "service_period_end",
    "subtotal",
    "tax_amount",
    "total_amount",
    "amount_due",
    "currency",
    "payment_method",
)


def build_elicitation_question(result: dict[str, Any]) -> str:
    """A human-readable question from the parser's own reasoning, grounded in whatever it did
    manage to read - not a generic "something's wrong" message."""
    vendor = result.get("vendor_name_raw") or result.get("vendor_key")
    total = result.get("total_amount")
    currency = result.get("currency") or ""
    known = f" from {vendor}" if vendor else ""
    amount = f" ({total} {currency})".rstrip() if total is not None else ""
    reasoning = (
        result.get("reasoning") or "the extraction wasn't confident enough to trust automatically."
    )
    return (
        f"I read a bill{known}{amount}, but I'm not confident in the result: {reasoning} "
        "Can you confirm the correct details, or tell me what's wrong?"
    )


async def persist_bill_result(
    db: AsyncSession, user_id: uuid.UUID, bill_id: uuid.UUID, result: dict[str, Any]
) -> None:
    """The one place a finalized (resolved) parse result actually gets written - called both
    for a bill resolved on the first pass/retry, and for one resumed after an elicitation
    answer merges the user's input into a previously-uncertain result."""
    updates: dict[str, Any] = {
        key: result[key] for key in _BILL_FIELDS if result.get(key) is not None
    }
    updates["confidence"] = result.get("confidence")
    updates["reasoning"] = result.get("reasoning")
    updates["vendor_id"] = await _get_or_create_vendor_id(db, user_id, result)
    updates["current_stage"] = BillStage.CATEGORIZING

    await bills_repo.update(db, user_id, bill_id, **updates)

    for line_item in result.get("line_items", []) or []:
        if "description" not in line_item or "line_total" not in line_item:
            logger.warning(
                "bill_parser.line_item_skipped", bill_id=str(bill_id), line_item=line_item
            )
            continue
        await bill_line_items_repo.create(
            db,
            user_id,
            bill_id,
            description=line_item["description"],
            line_total=line_item["line_total"],
            common_name=line_item.get("common_name"),
            quantity=line_item.get("quantity"),
            unit_price=line_item.get("unit_price"),
        )

    await db.commit()


async def parse_and_persist_bill(
    db: AsyncSession, user_id: uuid.UUID, bill_id: uuid.UUID, pdf_path: Path
) -> None:
    result, resolved = await run_decision_loop(pdf_path)

    if resolved:
        await persist_bill_result(db, user_id, bill_id, result)
        return

    # Not confident enough to trust - persist a real Elicitation (Phase 3) instead of just
    # flagging and stopping, per /CLAUDE.md non-negotiable #4 ("never guess silently, never
    # fail silently"). bills.status stays FLAGGED / current_stage=PARSING; the Elicitation's
    # own PENDING status is the actual "awaiting an answer" signal - /CLAUDE.md distinguishes
    # *flagged* from *pending* for exactly this reason.
    await bills_repo.update(
        db,
        user_id,
        bill_id,
        current_stage=BillStage.PARSING,
        status=BillStatus.FLAGGED,
        confidence=result.get("confidence"),
        reasoning=result.get("reasoning"),
    )
    await elicitations_service.create_elicitation(
        db,
        user_id,
        bill_id,
        stage=ElicitationStage.PARSING,
        question=build_elicitation_question(result),
        context={"partial_result": result},
    )


async def resume_from_elicitation_answer(
    db: AsyncSession,
    user_id: uuid.UUID,
    bill_id: uuid.UUID,
    elicitation_id: uuid.UUID,
    answer: dict[str, Any],
) -> None:
    """The other half of the pause built in parse_and_persist_bill's unresolved branch - a
    human's answer merges into the parser's own partial result (the human's values win) and
    the bill completes through the same persist_bill_result path a first-pass resolve would
    have used. Real pause/resume: this can run in a completely separate request, hours or
    days later, after a server restart - nothing here depends on the original upload request
    still being alive, since the state it needs lives in Postgres (the Elicitation row), not
    in-process."""
    elicitation = await elicitations_service.get_elicitation(db, user_id, bill_id, elicitation_id)
    if elicitation.status != ElicitationStatus.PENDING:
        raise ConflictError(f"elicitation {elicitation_id} is already {elicitation.status.value}")

    partial_result = (elicitation.context or {}).get("partial_result", {})
    merged_result = {**partial_result, **answer, "confidence": 1.0}

    await persist_bill_result(db, user_id, bill_id, merged_result)
    await bills_repo.update(db, user_id, bill_id, status=BillStatus.PENDING)
    await elicitations_service.update_elicitation(
        db,
        user_id,
        bill_id,
        elicitation_id,
        status=ElicitationStatus.ANSWERED,
        answer=answer,
        answered_at=datetime.now(UTC),
    )

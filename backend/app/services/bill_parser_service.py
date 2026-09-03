import re
import uuid
from pathlib import Path
from typing import Any

import openai
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.exceptions import ConflictError, NotFoundError
from app.models.bills import BillStage, BillStatus
from app.models.elicitations import ElicitationStage, ElicitationStatus
from app.repos import bill_line_items_repo, bills_repo, vendors_repo
from app.services import (
    categorizer_service,
    decision_loop,
    elicitation_answers,
    elicitations_service,
    llm_client,
    pdf_extraction,
)

logger = structlog.get_logger()

PARSER_MODEL = settings.parser_model
RETRY_MODEL = settings.parser_retry_model
HIGH_CONFIDENCE_THRESHOLD = 0.85
LOW_CONFIDENCE_FLOOR = 0.70

PARSER_PROMPT = """You extract information from an invoice or receipt, given the page image(s) \
of the original document below. The scan itself may be low quality (skewed, blurry, faint \
print, low resolution) - account for that possibility when judging your confidence, the same \
way you would reading a physical document handed to you in poor lighting.

The document can be in any language. Write your own generated/interpretive text - \
"common_name" and "reasoning" - in French, regardless of what language the document itself \
is in. Do NOT translate "vendor_name_raw", "address", "invoice_number", or each line item's \
"description" - copy those exactly as printed in the document's own language/script, since \
they're used to match records against the original and must stay faithful to the source, not \
localized.

Sanity-check every field, not just whether something was technically extracted. This is the \
single most common way this extraction goes subtly wrong, so take it seriously: characters can \
be perfectly legible - every letter clearly there, nothing you'd call "illegible" - while the \
words they spell still don't mean anything real. An address is the classic case: a low-quality \
scan can read as a crisp, readable string that is nonetheless not a real street address \
(wrong word order, a "street name" that isn't a real word, a postal code that doesn't match \
the town, fragments stitched from two different lines of the source). A product name has the \
same trap: \
the raw description can be an abbreviated or truncated label that reads fine as text but \
doesn't actually identify what was bought. Don't accept a field just because it's legible - \
actively ask yourself "does this, as a whole, correspond to a real address / a real product / \
a real name", not just "are these characters readable". If anything doesn't make sense - \
legible or not - don't silently keep it or silently drop it - lower your confidence to match, \
and say exactly which field and why in "reasoning", so the user can be asked to confirm it \
rather than the bad value being trusted automatically.

Your output must be syntactically valid JSON above everything else. If a value you transcribe \
contains quotation marks, curly/smart quotes ("like this", 'like this'), or other unusual \
punctuation, either escape them properly \
(\\" for a literal double quote) or paraphrase around them - never place a raw, unescaped \
quote character inside a JSON string value, since that alone breaks parsing.

Respond ONLY in JSON, no markdown, no preamble, with exactly this shape:

{
  "document_type": "invoice or receipt",
  "vendor_name_raw": "name exactly as printed",
  "vendor_key": "vendor name normalized to lowercase without punctuation or accents, used to \
    look up or create the matching vendor",
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
  "payment_method": "carte, prélèvement, espèces, virement, ou null",
  "payment_status": "unpaid, partial, ou paid",
  "line_items": [
    {
      "description": "...", "common_name": "...",
      "quantity": 1, "unit_price": 0.00, "line_total": 0.00
    }
  ],
  "confidence": 0.0,
  "reasoning": "pourquoi ce niveau de confiance, en français",
  "uncertain_fields": [
    {"field": "nom_du_champ", "reason": "raison courte et précise, en français"}
  ]
}

Field-by-field notes:
- document_type: always the literal English value "invoice" for a supplier invoice (itemized
  tax, billing period) or "receipt" for a point-of-sale/card receipt with a single amount -
  this is a fixed database category, not translated, regardless of the document's language or
  the French instruction above.
- vendor_name_raw: the merchant/vendor's name exactly as printed on this specific document, in
  its original language. Don't just copy whatever text sits near the vendor name - actually
  evaluate it as an enterprise: does it have a plausible structure (a real company name)?
   - Is it a recognizable business name? (Intermarché, Lidl, EDF, Amazon, Carrefour, etc.)
   - Is the structure plausible and coherent?
   - Or does it read as garbled/misread (fragmented words, misaligned, incoherent)
   - French franchise receipts routinely print a legal-entity disclaimer line directly under
     the brand logo (e.g. "ENTREPRISE INDEPENDANTE", "SOCIETE INDEPENDANTE") - that disclaimer
     is not the vendor name, even though it sits right next to it. The vendor is the brand name
     in the logo/header itself.
- vendor_key: the same name normalized (lowercase, no punctuation or legal-entity suffix) - used
  to look up or create the matching vendor, so it must stay stable even if vendor_name_raw varies
  slightly between documents for the same merchant.
- address: complete address, exactly as printed in its original language - never translated.
  Don't just copy whatever text sits near the vendor name - actually evaluate it as an address:
  does it have a plausible structure (a real street name, a number, a postal code that's the
  right shape for the country, a real town)? A string that's legible but doesn't hang together
  as a real address (garbled word order, a postal code that doesn't belong to the named
  town, fragments from unrelated lines run together) is not a good extraction even though every
  character in it is readable - treat it the same as an illegible field for confidence purposes,
  don't silently pass it through.
- invoice_number: as printed, or null if there isn't one.
- issue_date / due_date: YYYY-MM-DD, or null if absent or not applicable.
- service_period_start / service_period_end: the period the invoice covers (e.g. a subscription
  or utility bill), or null for a one-off receipt with no period.
- subtotal: amount before tax. Many French receipts print a "RECAPITULATIF TVA" (or similar)
  table with columns like "MT. HT" (subtotal before tax) and "MT. TVA" (tax amount) - when
  that table is present, it's the authoritative source for subtotal/tax_amount, not a
  cash-tendered ("ESPECES", amount handed over) or change-due ("A RENDRE") line elsewhere on
  the receipt - those are payment-mechanics amounts, not the subtotal.
- tax_amount: the sum of all applicable taxes (e.g. several VAT rates) as one single amount -
  don't try to break out each rate separately. See the subtotal note above for where to find it
  on a receipt with a VAT recap table.
- total_amount: total amount including tax.
- amount_due: same as total_amount, unless the document explicitly shows a different remaining
  balance still owed (e.g. a partial payment already made) - in that case use that balance.
- currency: the ISO-4217 code inferred from the document's actual currency symbol or text
  (e.g. "€" or "EUR" -> EUR, "$" -> USD, "£" -> GBP). Do not default to EUR - only use it if
  the document is genuinely in euros or the currency truly can't be determined.
- payment_method: "carte", "prélèvement", "espèces", "virement", or null if not shown - your
  own generated label in French, not a transcription, so translate it even if the document
  itself says e.g. "cash" or "credit card".
- payment_status: always the literal English value "unpaid", "partial", or "paid" - a fixed
  database category like document_type, never translated. Infer it, don't leave it as a
  default:
  - "receipt" documents are proof a transaction already completed - default "paid" unless the
    document explicitly shows a remaining balance still owed (then "partial") or explicitly
    indicates nothing was paid (rare for a receipt, but possible - then "unpaid"). A
    cash-tendered amount paired with a change-given amount (e.g. "ESPECES 2,50" tendered,
    "A RENDRE 0,07" change) is itself direct, reconciled proof of a completed sale - "paid",
    not "uncertain".
  - "invoice" documents are a request for future payment - default "unpaid" unless there's
    explicit evidence of payment (a "paid"/"réglé" stamp or watermark, amount_due = 0) - then
    "paid" - or a partial payment already recorded against a larger total - then "partial".
  - Only use these three values. "overdue" and "disputed" aren't inferable from a single
    document (they need today's date or external dispute context this agent doesn't have) -
    never guess either of those.
- line_items: one entry per line on the document.
  - description: the exact label as printed, in the document's own language - never translated.
  - common_name: a short, common name (in one word) in French for what this line item actually
  *is* make it general  so that all items for the same product/service across different documents
    will be matched to the same common_name.
- quantity, unit_price, line_total: as printed, or inferred from context if only one of the
    three is missing (line_total = quantity * unit_price).
- confidence: your overall confidence in this extraction, between 0 and 1. Being present isn't
  enough - a field that's legible but doesn't make sense (see the sanity-check note above)
  counts against confidence the same as a field that's missing or illegible. Never output above
  0.95, even when everything looks perfect - 1.0 is reserved for a value a human has explicitly
  confirmed, not something you claim on your own; leaving that headroom is what makes a
  human-confirmed value distinguishable from your own best guess downstream.
  - 0.80 to 0.95 (high): every key field is legible, plausible, and the amounts reconcile
    (line_items + tax_amount = total_amount, etc.).
  - 0.50 to 0.80 (medium): plausible but one or two fields are ambiguous, partly illegible, or
    don't quite make sense.
  - < 0.50 (low): key fields are missing, illegible, don't make sense, or the amounts don't
    reconcile at all.
- reasoning: one short sentence in French explaining that confidence level - name the specific
  field that's the problem and why (illegible, missing, or just doesn't make sense), not a
  vague "something's uncertain".
- uncertain_fields: the itemized version of "reasoning" - one {"field", "reason"} entry per
  specific field you're not fully confident about, "reason" a short sentence in French (e.g.
  {"field": "vendor_name_raw", "reason": "semble illisible sur le scan, plusieurs lettres
  incohérentes"}). "field" must be the exact JSON key from this schema (for a line item,
  "line_items[N].description" where N is its 0-based index) - the user's own current
  (possibly-wrong) value for that exact field gets shown alongside your reason when this is
  presented, so an approximate or made-up key isn't useful here, it has to resolve to a real
  field. This is what gets shown to the user when they're asked to confirm - a vague
  "reasoning" sentence isn't enough on its own, name every field that's actually in question so
  the user knows precisely what to check, not just that something, somewhere, might be wrong.
  Empty list only when confidence is high and nothing is genuinely in question.
"""


async def call_parser(pdf_path: Path, model: str) -> dict[str, Any]:
    """Rasterize the PDF's pages locally (app/services/pdf_extraction.py::render_pages), then
    send them as images to `model` (a vision-capable model) via OpenRouter. Raises RuntimeError
    if the response can't be parsed as the expected JSON object."""
    image_data_urls = await pdf_extraction.render_pages(pdf_path)
    logger.debug("bill_parser.rendered_pages", pages=len(image_data_urls))

    response = await llm_client.client.chat.completions.create(
        model=model,
        max_tokens=4096,
        messages=[
            {"role": "system", "content": PARSER_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Bill page image(s) below:"},
                    *[{"type": "image_url", "image_url": {"url": url}} for url in image_data_urls],
                ],
            },
        ],
        temperature=0.3,
        # Reasoning disabled by explicit choice - not free by default on a "reasoning" model,
        # and it was the dominant cost in the 60-180s+ per-call latency observed live (medium
        # effort was previously kept on purpose: PARSER_PROMPT's address/common_name
        # sanity-checking benefits from it, and low effort caused gpt-oss-120b, an earlier
        # PARSER_MODEL, to spend its whole budget on hidden reasoning and return empty content).
        # Re-verify extraction quality on real bills after this change - PARSER_MODEL's
        # nemotron reasoning info confirms {"mandatory": false}, so "none" is honored rather
        # than silently ignored.
        extra_body={"reasoning": {"effort": "none"}},
    )

    if not response.choices:
        # A free-tier model can come back with an error/rate-limit body that has no `choices`
        # at all (observed live against nvidia's free reasoning model) - `response.choices[0]`
        # would raise a bare TypeError that _call_parser_safe's `except RuntimeError` doesn't
        # catch, crashing run_decision_loop before the retry model ever gets a chance. Treat it
        # the same as any other unusable response instead.
        raise RuntimeError(f"parser returned no choices from {model!r}: {response!r}")

    choice = response.choices[0]
    raw = (choice.message.content or "").strip()
    logger.debug("bill_parser.raw_response", raw=raw[:500])

    if not raw:
        raise RuntimeError(
            f"parser returned no text response (finish_reason={choice.finish_reason!r}, "
            f"usage={response.usage})"
        )

    result = llm_client.clamp_confidence(llm_client.extract_json(raw, source="parser"))
    # Every bill goes through the same vision path now - no more direct-text-layer-vs-OCR
    # branching to record. Kept as a field rather than removed: `bills.extraction_strategy` is
    # a real DB column other code reads (see _BILL_FIELDS below), not worth a migration to drop.
    result["extraction_strategy"] = "vision"
    return result


async def _call_parser_safe(pdf_path: Path, model: str) -> dict[str, Any]:
    """call_parser, but a malformed/unparseable response - or the API call itself failing -
    degrades to a confidence-0 result instead of raising. A parse failure (e.g. the model
    echoing an unescaped smart-quote from a hard-to-read scan straight into a JSON string) is
    just an extreme case of "not confident" - it should go through the same retry-then-elicit
    path as any other bad result, not bypass it by crashing run_decision_loop on the first
    attempt before the retry model ever runs.

    openai.APIError (base class for RateLimitError, APIStatusError/non-2xx responses,
    APIConnectionError, APITimeoutError) is caught alongside RuntimeError for the same reason -
    hit live against a real free-tier daily quota ("Rate limit exceeded: free-models-per-day"):
    the openai client raises its own exception type for a non-2xx HTTP response, which a bare
    `except RuntimeError` doesn't catch, so it was propagating all the way out to the router's
    per-file handler as a raw API error string instead of trying RETRY_MODEL first. A model
    being rate-limited or briefly unreachable is exactly the kind of transient failure retrying
    with a different model is for - PARSER_MODEL and RETRY_MODEL are different OpenRouter
    accounts/models, so a quota hit on one doesn't necessarily block the other."""
    try:
        return await call_parser(pdf_path, model)
    except (RuntimeError, openai.APIError) as exc:
        logger.warning("bill_parser.call_failed", model=model, error=str(exc))
        return {
            "confidence": 0.0,
            "reasoning": f"Le modèle {model} n'a pas produit une réponse exploitable : {exc}",
        }


async def run_decision_loop(pdf_path: Path) -> tuple[dict[str, Any], bool]:
    """High confidence on the first (cheap) pass -> accept it. Medium -> retry once on a
    stronger model, a genuinely different approach per /CLAUDE.md non-negotiable #3, not the
    same call again. Still low after that -> give up and say so, don't guess (non-negotiable
    #4) - real elicitation is Phase 3, this just returns resolved=False.

    Returns (result, resolved). Uses the shared decision_loop.run (roadmap.md Part 6.4) - the
    only parser-specific thing left here is what "a different approach" means (escalate to a
    stronger model) and the per-attempt logging.
    """

    async def _first() -> dict[str, Any]:
        result = await _call_parser_safe(pdf_path, PARSER_MODEL)
        logger.info("bill_parser.attempt", model=PARSER_MODEL, confidence=result.get("confidence"))
        return result

    async def _retry() -> dict[str, Any]:
        result = await _call_parser_safe(pdf_path, RETRY_MODEL)
        logger.info("bill_parser.retry", model=RETRY_MODEL, confidence=result.get("confidence"))
        return result

    return await decision_loop.run(
        _first,
        _retry,
        high_confidence_threshold=HIGH_CONFIDENCE_THRESHOLD,
        low_confidence_floor=LOW_CONFIDENCE_FLOOR,
    )


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
    "payment_status",
    "extraction_strategy",
)


_LINE_ITEM_FIELD_RE = re.compile(r"^line_items\[(\d+)\]\.(.+)$")


def _lookup_field_value(result: dict[str, Any], field: str) -> Any:
    """Resolves a field path from PARSER_PROMPT's "uncertain_fields" ("vendor_name_raw",
    "line_items[1].description", ...) back to its actual current value in `result`, so the
    elicitation question can show what's there now, not just the field's name."""
    match = _LINE_ITEM_FIELD_RE.match(field)
    if match:
        index, sub_field = int(match.group(1)), match.group(2)
        line_items = result.get("line_items") or []
        if 0 <= index < len(line_items):
            return line_items[index].get(sub_field)
        return None
    return result.get(field)


def _format_field_value(value: Any) -> str:
    if value is None or value == "":
        return "non renseigné"
    return f'"{value}"' if isinstance(value, str) else str(value)


def build_elicitation_question(result: dict[str, Any]) -> str:
    """A human-readable question from the parser's own reasoning, grounded in whatever it did
    manage to read - not a generic "something's wrong" message. In French, to match
    PARSER_PROMPT's "reasoning" (embedded below) - a French reasoning wrapped in an English
    template would read as a mixed-language sentence.

    Itemizes "uncertain_fields" below the general reasoning sentence, one line per specific
    field *with its current (possibly-wrong) value shown inline* - naming the field alone
    still leaves the user having to go dig up what the system actually thinks that field is
    before they can correct it; showing the value directly is what makes the question
    something they can act on immediately, not just a pointer to go investigate."""
    vendor = result.get("vendor_name_raw") or result.get("vendor_key")
    total = result.get("total_amount")
    currency = result.get("currency") or ""
    known = f" de {vendor}" if vendor else ""
    amount = f" ({total} {currency})".rstrip() if total is not None else ""
    reasoning = result.get("reasoning") or (
        "l'extraction n'était pas assez fiable pour être validée automatiquement."
    )

    uncertain_fields = [f for f in (result.get("uncertain_fields") or []) if f.get("field")]
    detail = ""
    if uncertain_fields:
        lines = []
        for entry in uncertain_fields:
            field = entry["field"]
            current_value = _format_field_value(_lookup_field_value(result, field))
            reason = entry.get("reason") or "incertain"
            lines.append(f"- {field} (actuellement {current_value}) : {reason}")
        detail = "\n\nChamps à vérifier :\n" + "\n".join(lines)

    return (
        f"J'ai lu une facture{known}{amount}, mais je ne suis pas sûr du résultat : {reasoning}"
        f"{detail}\n\nPeux-tu confirmer les bonnes informations, ou me dire ce qui ne va pas ?"
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

    bill = await bills_repo.update(db, user_id, bill_id, **updates)
    if bill is None:
        # Non-negotiable #4: never fail silently. A mismatched/missing bill here means
        # something upstream is wrong (wrong tenant, or the bill was deleted mid-flight) -
        # surface it rather than quietly inserting line items for a bill that was never
        # actually updated.
        raise NotFoundError(f"bill {bill_id} not found")

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
        # Continue the pipeline automatically - parsing resolved means there's a vendor and
        # line items to categorize, not a separate manually-triggered step.
        await categorizer_service.categorize_and_persist_bill(db, user_id, bill_id)
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


def _merge_line_items(
    original: list[dict[str, Any]], corrected: list[dict[str, Any]] | None
) -> list[dict[str, Any]]:
    """extracted_answer's line_items are corrections, not a replacement - the extraction
    prompt is deliberately told not to invent/repeat values the user didn't mention (see
    ANSWER_EXTRACTION_PROMPT), so a corrected item routinely lacks line_total/quantity/
    unit_price even when it's meant to patch an existing item, not replace the whole list.
    Blindly replacing line_items with that array silently drops the real amounts for every
    item the user didn't happen to mention - money data, not something to guess or lose
    silently (non-negotiable #1/#4 territory even though this isn't a query-scoping case).

    ANSWER_EXTRACTION_PROMPT tells the model to reference the item it's correcting by its
    0-based "index" in the original array (the model sees that array as context, so it can
    resolve "the second item"/an ambiguous product name/etc. far more reliably than any string
    match we could do here) - that's the primary match. A common_name/description
    (case-insensitive) match is kept only as a fallback for a response that omits "index".
    Either way: corrected fields win, everything else - including line_total - carries over
    onto the matched original. No match at all -> treat as a genuinely new item, kept only if
    it already has its own line_total (never invent an amount)."""
    if not corrected:
        return original

    merged = [dict(item) for item in original]

    def _key(item: dict[str, Any]) -> str:
        return str(item.get("common_name") or item.get("description") or "").strip().lower()

    for raw_item in corrected:
        corrected_item = dict(raw_item)
        index = corrected_item.pop("index", None)
        if isinstance(index, int) and not isinstance(index, bool) and 0 <= index < len(merged):
            merged[index].update(corrected_item)
            continue

        target_key = _key(corrected_item)
        match = next((m for m in merged if target_key and _key(m) == target_key), None)
        if match is not None:
            match.update(corrected_item)
        elif "line_total" in corrected_item:
            merged.append(corrected_item)
        else:
            logger.warning("bill_parser.new_line_item_skipped_no_amount", item=corrected_item)

    return merged


async def resume_from_elicitation_answer(
    db: AsyncSession,
    user_id: uuid.UUID,
    bill_id: uuid.UUID,
    elicitation_id: uuid.UUID,
    answer_text: str,
) -> None:
    """The other half of the pause built in parse_and_persist_bill's unresolved branch. The
    user answers in plain text, not JSON - parse_elicitation_answer turns that into structured
    corrections, which merge into the parser's own partial result (the human's values win) and
    the bill completes through the same persist_bill_result path a first-pass resolve would
    have used. Real pause/resume: this can run in a completely separate request, hours or days
    later, after a server restart - nothing here depends on the original upload request still
    being alive, since the state it needs lives in Postgres (the Elicitation row), not
    in-process.

    Two concurrent/retried answer submissions for the same elicitation must not both persist
    (that would duplicate line items) - a plain "is it pending" read-then-write check can't
    prevent that, since both requests could pass the check before either writes. The atomic
    claim_pending_elicitation call below is what actually prevents it: only one request can
    ever win it, and the loser raises ConflictError before touching the bill at all."""
    elicitation = await elicitations_service.get_elicitation(db, user_id, bill_id, elicitation_id)
    if elicitation.status != ElicitationStatus.PENDING:
        # Fast-path rejection for the common sequential case (already answered) - saves an
        # LLM call. Not the actual concurrency guard; that's the atomic claim below.
        raise ConflictError(f"elicitation {elicitation_id} is already {elicitation.status.value}")

    partial_result = (elicitation.context or {}).get("partial_result", {})
    extracted_answer = await elicitation_answers.parse_elicitation_answer(
        elicitation.question, partial_result, answer_text
    )
    merged_result = {**partial_result, **extracted_answer, "confidence": 1.0}
    merged_result["line_items"] = _merge_line_items(
        partial_result.get("line_items") or [], extracted_answer.get("line_items")
    )

    await elicitations_service.claim_pending_elicitation(db, user_id, bill_id, elicitation_id)

    await persist_bill_result(db, user_id, bill_id, merged_result)
    await bills_repo.update(db, user_id, bill_id, status=BillStatus.PENDING)
    await elicitations_service.update_elicitation(
        db,
        user_id,
        bill_id,
        elicitation_id,
        answer={"text": answer_text, "extracted": extracted_answer},
    )
    # Parsing just resolved (via a human's answer) - continue into categorization, same as
    # the direct-resolve path in parse_and_persist_bill.
    await categorizer_service.categorize_and_persist_bill(db, user_id, bill_id)

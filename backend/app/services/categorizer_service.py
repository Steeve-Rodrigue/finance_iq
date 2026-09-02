"""The categorizer agent - second of the three agents sharing app/services/decision_loop.py.
Assigns a bill to one of the user's own categories (get-or-create, same pattern as
bill_parser_service._get_or_create_vendor_id), asking the user when it can't decide
confidently rather than guessing or defaulting to "autre". See
.claude/skills/bill-categories/SKILL.md for the suggested taxonomy this prompts with."""

import uuid
from typing import Any

import openai
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.exceptions import ConflictError, NotFoundError
from app.models.bills import BillStage, BillStatus
from app.models.elicitations import ElicitationStage, ElicitationStatus
from app.repos import bill_line_items_repo, bills_repo, categories_repo
from app.services import decision_loop, elicitation_answers, elicitations_service, llm_client

logger = structlog.get_logger()

CATEGORIZER_MODEL = settings.parser_model
RETRY_MODEL = settings.parser_retry_model
HIGH_CONFIDENCE_THRESHOLD = 0.80
LOW_CONFIDENCE_FLOOR = 0.70

# Mirrors .claude/skills/bill-categories/SKILL.md - kept here as the actual runtime prompt
# input since the model doesn't read the skill file itself. Names in French (matching
# "common_name"/"reasoning"/"payment_method" elsewhere - see PARSER_PROMPT in
# bill_parser_service.py); slugs stay ASCII/accent-free per the normalization rule already
# given to the model ("slug normalisé (minuscules, tirets, sans accents)").
SUGGESTED_TAXONOMY = (
    ("courses", "Courses"),
    ("restauration", "Restauration"),
    ("charges", "Charges & Factures"),
    ("abonnements", "Abonnements & Logiciels"),
    ("transport", "Transport"),
    ("logement", "Logement"),
    ("sante", "Santé"),
    ("achats", "Achats"),
    ("loisirs", "Loisirs"),
    ("autre", "Autre"),
)

CATEGORIZER_PROMPT = """Tu catégorises une dépense (facture ou reçu) déjà extraite, à partir du \
fournisseur, des articles achetés et des catégories existantes de l'utilisateur.

Réponds UNIQUEMENT en JSON, sans markdown, sans préambule, avec exactement cette forme :

{
  "category_slug": "slug normalisé (minuscules, tirets, sans accents)",
  "category_name": "nom lisible de la catégorie",
  "confidence": 0.0,
  "reasoning": "pourquoi ce niveau de confiance, en français"
}

Règles :
- Préfère une catégorie EXISTANTE de l'utilisateur si elle correspond vraiment - reprends
  exactement son slug et son nom tels que donnés, ne les reformule pas.
- Si aucune catégorie existante ne convient, choisis dans la taxonomie suggérée fournie plus
  bas, ou une catégorie raisonnable en dernier recours si vraiment rien ne convient.
- "autre" est réservé aux cas qui ne correspondent vraiment à rien d'autre - ce n'est pas une
  case par défaut pour éviter de choisir.
- confidence : ta confiance globale, entre 0 et 1. Ne dépasse jamais 0.95, même quand c'est
  évident - 1.0 est réservé à une valeur confirmée explicitement par un humain, pas à ta propre
  estimation, même si tu es sûr.
  - 0.80 à 0.95 (haute) : le fournisseur ou les articles indiquent clairement une seule
    catégorie évidente (ou l'historique de ce fournisseur le confirme, si fourni).
  - 0.50 à 0.80 (moyenne) : plausible mais le fournisseur est ambigu (ex. un supermarché qui
    vend aussi des articles ménagers ou de l'électronique).
  - < 0.50 (basse) : aucune catégorie ne semble vraiment correspondre, ou l'information
    disponible est insuffisante pour trancher.
- reasoning : une phrase courte en français expliquant ce niveau de confiance.
"""


def _format_taxonomy() -> str:
    return "\n".join(f"- {name} ({slug})" for slug, name in SUGGESTED_TAXONOMY)


def _format_existing_categories(categories: list[Any]) -> str:
    if not categories:
        return "(aucune)"
    return "\n".join(f"- {c.name} ({c.slug})" for c in categories)


def _format_line_items(line_items: list[Any]) -> str:
    if not line_items:
        return "(aucun détail de ligne)"
    return "\n".join(f"- {li.common_name or li.description}" for li in line_items)


async def call_categorizer(
    *,
    model: str,
    vendor_name: str | None,
    total_amount: Any,
    line_items: list[Any],
    existing_categories: list[Any],
    vendor_history: list[str] | None = None,
) -> dict[str, Any]:
    """One call: given the bill's own data plus the user's existing categories (and, on
    retry, this vendor's own categorization history - a genuinely different signal, not the
    same call again, per /CLAUDE.md non-negotiable #3), ask for a category assignment. Raises
    RuntimeError if the response can't be parsed as the expected JSON object."""
    history_block = ""
    if vendor_history:
        history_block = "\n\nCatégorisations précédentes pour ce même fournisseur : " + ", ".join(
            vendor_history
        )

    existing_block = _format_existing_categories(existing_categories)
    user_content = (
        f"Fournisseur : {vendor_name or 'inconnu'}\n"
        f"Montant total : {total_amount}\n"
        f"Articles :\n{_format_line_items(line_items)}\n\n"
        f"Catégories existantes de l'utilisateur :\n{existing_block}\n\n"
        f"Taxonomie suggérée :\n{_format_taxonomy()}"
        f"{history_block}"
    )

    response = await llm_client.client.chat.completions.create(
        model=model,
        max_tokens=512,
        messages=[
            {"role": "system", "content": CATEGORIZER_PROMPT},
            {"role": "user", "content": user_content},
        ],
        temperature=0.2,
        extra_body={"reasoning": {"effort": "low"}},
    )
    if not response.choices:
        # Same gap as bill_parser_service.call_parser had - a free-tier model can return a
        # 200-ish body with choices=None (an embedded provider error) instead of raising, and
        # `response.choices[0]` on that would crash with a bare TypeError _call_categorizer_safe
        # doesn't catch.
        raise RuntimeError(f"categorizer returned no choices from {model!r}: {response!r}")

    raw = (response.choices[0].message.content or "").strip()
    logger.debug("categorizer.raw_response", raw=raw[:500])
    return llm_client.clamp_confidence(llm_client.extract_json(raw, source="categorizer"))


async def _call_categorizer_safe(**kwargs: Any) -> dict[str, Any]:
    """Same tolerance as bill_parser_service._call_parser_safe - a malformed response, or the
    API call itself failing (rate limit, timeout, connection error - openai.APIError), degrades
    to confidence=0 (triggering retry/elicit) instead of crashing the loop."""
    try:
        return await call_categorizer(**kwargs)
    except (RuntimeError, openai.APIError) as exc:
        model = kwargs.get("model")
        logger.warning("categorizer.call_failed", model=model, error=str(exc))
        return {
            "confidence": 0.0,
            "reasoning": f"Le modèle {model} n'a pas produit une réponse exploitable : {exc}",
        }


async def _get_or_create_category_id(
    db: AsyncSession, user_id: uuid.UUID, result: dict[str, Any]
) -> uuid.UUID | None:
    slug = result.get("category_slug")
    if not slug:
        return None
    category = await categories_repo.get_by_slug(db, user_id, slug)
    if category is None:
        category = await categories_repo.create(
            db, user_id, name=result.get("category_name") or slug, slug=slug
        )
    return category.id


def build_categorization_elicitation_question(result: dict[str, Any]) -> str:
    reasoning = result.get("reasoning") or (
        "je n'arrive pas à déterminer une catégorie avec certitude."
    )
    return (
        f"Je n'arrive pas à choisir une catégorie avec certitude pour cette dépense : {reasoning} "
        "Quelle catégorie veux-tu utiliser ?"
    )


async def categorize_and_persist_bill(
    db: AsyncSession, user_id: uuid.UUID, bill_id: uuid.UUID
) -> None:
    """The categorizer's entry point - called right after a bill's parse resolves (whether on
    the first pass/retry, or after a parsing elicitation is answered), continuing the pipeline
    automatically rather than requiring a separate manual trigger. Same
    confidence/retry/elicit shape as the parser, via the shared decision_loop."""
    bill = await bills_repo.get_by_id(db, user_id, bill_id)
    if bill is None:
        raise NotFoundError(f"bill {bill_id} not found")

    line_items = await bill_line_items_repo.list_by_bill(db, user_id, bill_id)
    existing_categories = await categories_repo.list_by_user(db, user_id)

    vendor_history: list[str] = []
    if bill.vendor_id:
        past_bills = await bills_repo.list_categorized_by_vendor(db, user_id, bill.vendor_id)
        vendor_history = [b.category.name for b in past_bills if b.id != bill_id and b.category]

    async def _first() -> dict[str, Any]:
        result = await _call_categorizer_safe(
            model=CATEGORIZER_MODEL,
            vendor_name=bill.vendor_name_raw,
            total_amount=bill.total_amount,
            line_items=line_items,
            existing_categories=existing_categories,
        )
        logger.info(
            "categorizer.attempt", model=CATEGORIZER_MODEL, confidence=result.get("confidence")
        )
        return result

    async def _retry() -> dict[str, Any]:
        result = await _call_categorizer_safe(
            model=RETRY_MODEL,
            vendor_name=bill.vendor_name_raw,
            total_amount=bill.total_amount,
            line_items=line_items,
            existing_categories=existing_categories,
            vendor_history=vendor_history,
        )
        logger.info("categorizer.retry", model=RETRY_MODEL, confidence=result.get("confidence"))
        return result

    result, resolved = await decision_loop.run(
        _first,
        _retry,
        high_confidence_threshold=HIGH_CONFIDENCE_THRESHOLD,
        low_confidence_floor=LOW_CONFIDENCE_FLOOR,
    )

    if resolved:
        await persist_categorization_result(db, user_id, bill_id, result)
        return

    # Same pattern as bill_parser_service's unresolved branch: flag the bill (not just leave
    # current_stage at CATEGORIZING with status untouched) so this stage shows up wherever
    # "flagged bills have a pending elicitation" is assumed - e.g. clarify.html filters on
    # bills.status, not on which stage got stuck.
    await bills_repo.update(
        db,
        user_id,
        bill_id,
        status=BillStatus.FLAGGED,
        confidence=result.get("confidence"),
        reasoning=result.get("reasoning"),
    )
    await elicitations_service.create_elicitation(
        db,
        user_id,
        bill_id,
        stage=ElicitationStage.CATEGORIZING,
        question=build_categorization_elicitation_question(result),
        context={"partial_result": result},
    )
    await db.commit()


async def persist_categorization_result(
    db: AsyncSession, user_id: uuid.UUID, bill_id: uuid.UUID, result: dict[str, Any]
) -> None:
    """The one place a finalized categorization actually gets written - called both for a
    result resolved on the first pass/retry, and for one resumed after a categorization
    elicitation is answered.

    current_stage goes straight to COMPLETE, not AUDITING - there is no auditor stage and none
    is planned (product decision), so categorizing is the pipeline's actual last step now.
    status goes to RESOLVED for the same reason: un-flagging to PENDING (the resume path's old
    behavior) used to leave a bill stuck there forever with nothing further to un-flag it,
    since only the never-built auditor was ever going to move a bill to RESOLVED."""
    category_id = await _get_or_create_category_id(db, user_id, result)
    bill = await bills_repo.update(
        db,
        user_id,
        bill_id,
        category_id=category_id,
        current_stage=BillStage.COMPLETE,
        status=BillStatus.RESOLVED,
    )
    if bill is None:
        raise NotFoundError(f"bill {bill_id} not found")
    # The categorizer decides at the bill level, not per line item - every line item on the
    # bill inherits the same category once one is assigned, rather than leaving
    # bill_line_items.category_id permanently null.
    await bill_line_items_repo.set_category_for_bill(db, user_id, bill_id, category_id)
    await db.commit()


async def resume_categorization_from_elicitation_answer(
    db: AsyncSession,
    user_id: uuid.UUID,
    bill_id: uuid.UUID,
    elicitation_id: uuid.UUID,
    answer_text: str,
) -> None:
    """The categorizer's half of pause/resume - mirrors
    bill_parser_service.resume_from_elicitation_answer, including the same atomic-claim
    protection against a duplicate/concurrent resume."""
    elicitation = await elicitations_service.get_elicitation(db, user_id, bill_id, elicitation_id)
    if elicitation.status != ElicitationStatus.PENDING:
        raise ConflictError(f"elicitation {elicitation_id} is already {elicitation.status.value}")

    partial_result = (elicitation.context or {}).get("partial_result", {})
    extracted_answer = await elicitation_answers.parse_elicitation_answer(
        elicitation.question, partial_result, answer_text
    )
    merged_result = {**partial_result, **extracted_answer, "confidence": 1.0}

    await elicitations_service.claim_pending_elicitation(db, user_id, bill_id, elicitation_id)

    await persist_categorization_result(db, user_id, bill_id, merged_result)
    await elicitations_service.update_elicitation(
        db,
        user_id,
        bill_id,
        elicitation_id,
        answer={"text": answer_text, "extracted": extracted_answer},
    )

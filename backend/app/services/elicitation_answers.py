"""Turning a human's plain-text answer to an elicitation question into structured field
corrections - shared by every stage that can pause and ask (parsing, categorizing, and
eventually auditing), not owned by any one of them. Lives in its own module specifically so
bill_parser_service.py and categorizer_service.py can both use it without importing each
other."""

import json
from typing import Any

import structlog

from app.config import settings
from app.services import llm_client

logger = structlog.get_logger()

ANSWER_EXTRACTION_PROMPT = """Un utilisateur répond en langage naturel à une question posée sur \
une facture dont l'extraction ou la catégorisation automatique n'était pas assez fiable. Ta \
tâche : transformer sa réponse en corrections structurées, pas relire tout le document.

On te donne : la question posée, ce qui avait été déterminé jusqu'ici (potentiellement faux ou \
incomplet), et la réponse en texte libre de l'utilisateur.

Réponds UNIQUEMENT en JSON, sans markdown, sans préambule - un objet contenant SEULEMENT les \
champs que la réponse de l'utilisateur confirme ou corrige effectivement, avec ces noms de \
champs exacts s'ils s'appliquent : document_type, vendor_name_raw, vendor_key, address, \
invoice_number, issue_date, due_date, service_period_start, service_period_end, currency, \
subtotal, tax_amount, total_amount, amount_due, payment_method, payment_status, line_items, \
category_slug, category_name.


Règles :
- N'invente rien et ne répète pas une valeur que l'utilisateur n'a pas mentionnée - un champ \
absent de sa réponse ne doit pas apparaître dans le JSON du tout.
- Si vendor_name_raw est inclus, inclus aussi vendor_key (la même valeur normalisée : \
minuscules, sans ponctuation ni forme juridique). Même règle pour category_name/category_slug.
- Dates au format YYYY-MM-DD.
- Montants en nombres, pas en texte.
- document_type reste "invoice" ou "receipt" (valeur anglaise fixe), jamais traduit.
- payment_status reste "unpaid", "partial" ou "paid" (valeur anglaise fixe), jamais traduit.
- payment_method en français : "carte", "prélèvement", "espèces", ou "virement".
- Si la réponse ne permet vraiment rien d'exploitable, réponds avec un objet JSON vide {}.

Pour line_items spécifiquement : le contexte ci-dessus contient déjà un tableau line_items -
donne tes corrections par position, ne recopie jamais tout le tableau :
- Si la réponse corrige ou confirme un article déjà présent dans ce tableau, inclus un champ
  "index" (la position 0-based de cet article DANS LE TABLEAU line_items donné en contexte -
  compte les éléments toi-même, ce n'est jamais un numéro que l'utilisateur invente comme
  "article 1/2/3") en plus des champs corrigés (ex. common_name, description). N'inclus PAS
  line_total/quantity/unit_price si l'utilisateur ne les a pas donnés - ces valeurs déjà
  connues sont conservées automatiquement, ne les recopie pas et ne les invente pas.
- Si la réponse mentionne un article qui n'existe vraiment pas dans le tableau original,
  n'inclus PAS de champ "index", et donne au minimum "description" et "line_total" - sans
  line_total un nouvel article ne sera pas conservé (jamais de montant inventé).
- Un article que l'utilisateur ne mentionne pas du tout doit rester absent de ta réponse - il
  est conservé tel quel automatiquement, inutile de le confirmer.
"""


async def parse_elicitation_answer(
    question: str, partial_result: dict[str, Any], answer_text: str
) -> dict[str, Any]:
    """The user answers a pending elicitation in plain text (not JSON) - this turns that free
    text into the same structured field-correction shape the caller merges into its own
    partial result, via one OpenRouter call. Raises RuntimeError if the response can't be
    parsed as JSON, same failure mode as call_parser/call_categorizer."""
    user_content = (
        f"Question posée : {question}\n\n"
        "Ce qui avait été déterminé jusqu'ici (potentiellement incorrect ou incomplet) :\n"
        f"{json.dumps(partial_result, ensure_ascii=False)}\n\n"
        f"Réponse de l'utilisateur : {answer_text}"
    )
    response = await llm_client.client.chat.completions.create(
        model=settings.parser_model,
        max_tokens=4024,
        messages=[
            {"role": "system", "content": ANSWER_EXTRACTION_PROMPT},
            {"role": "user", "content": user_content},
        ],
        temperature=0.1,
        # Reasoning disabled by explicit choice - see bill_parser_service.call_parser's comment
        # on the same change for the full rationale (hidden reasoning was the dominant cost in
        # observed per-call latency).
        extra_body={"reasoning": {"effort": "none"}},
    )
    if not response.choices:
        # Same gap as bill_parser_service.call_parser had - a free-tier model can return a
        # 200-ish body with choices=None (an embedded provider error) instead of raising, and
        # `response.choices[0]` on that would crash with a bare TypeError instead of a message
        # a caller can actually do something with.
        raise RuntimeError(
            f"answer extraction returned no choices from {settings.parser_model!r}: {response!r}"
        )

    raw = (response.choices[0].message.content or "").strip()
    logger.debug("elicitation_answers.raw_response", raw=raw[:500])
    return llm_client.extract_json(raw, source="answer extraction")

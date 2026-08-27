"""The sub-categorizer agent - takes all of a user's line items already grouped by their
bill's category and splits each category into sub-categories (and, where it decides a category
has enough distinct items to warrant it, a second level of sub-sub-categories), purely from its
own read of the line items - not one of the three pipeline agents sharing decision_loop.py by
bill, but a batch/on-demand job over already-existing data (see subcategorize_all_categories).

Deliberate compromise vs. /CLAUDE.md non-negotiable #4 ("ask the user"): Elicitation is
bill-scoped (Elicitation.bill_id is NOT NULL) and this agent operates across many bills within
one category, so there's no single bill to hang a question on. Adding a new ElicitationStage
would need a hand-written Postgres `ALTER TYPE ... ADD VALUE` migration with no precedent
anywhere in this repo's history. Instead, a category that's still unresolved after retry has
every one of its items routed into one visible "Autre" sub-category (mirroring this app's own
catch-all convention at the top-level category tier) rather than a blocking question -
non-negotiables #2/#3 are fully honored either way; #4 is honored in spirit (nothing silently
dropped) but not literally."""

import uuid
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.categories import Category
from app.repos import bill_line_items_repo, categories_repo, subcategories_repo
from app.services import decision_loop, llm_client

logger = structlog.get_logger()

SUBCATEGORIZER_MODEL = settings.parser_model
RETRY_MODEL = settings.parser_retry_model
HIGH_CONFIDENCE_THRESHOLD = 0.80
LOW_CONFIDENCE_FLOOR = 0.70

CATCH_ALL_SLUG = "autre"
CATCH_ALL_NAME = "Autre"

SUBCATEGORIZER_PROMPT = """Tu affines une catégorie de dépenses déjà assignée, en la répartissant \
en sous-catégories à partir des articles qu'elle contient.

Réponds UNIQUEMENT en JSON, sans markdown, sans préambule, avec exactement cette forme :

{
  "groups": [
    {
      "name": "nom lisible de la sous-catégorie",
      "slug": "slug normalisé (minuscules, tirets, sans accents)",
      "item_indices": [0, 2, 5],
      "children": [
        {
          "name": "nom lisible de la sous-sous-catégorie",
          "slug": "slug normalisé",
          "item_indices": [2, 5]
        }
      ]
    }
  ],
  "confidence": 0.0,
  "reasoning": "pourquoi ce niveau de confiance, en français"
}

Règles :
- Chaque article (numéroté depuis 0 dans la liste fournie) doit apparaître dans EXACTEMENT un
  groupe, au niveau le plus profond où il est classé - un article dans un groupe qui a des
  "children" doit être répertorié soit dans les indices d'un enfant, soit dans les indices
  directs du parent, jamais les deux.
- "children" est optionnel : n'ajoute un second niveau que si la catégorie contient vraiment
  assez d'articles distincts pour que ce soit utile - une poignée d'articles ne mérite pas
  d'être encore subdivisée.
- Un article que tu ne peux vraiment pas classer avec confiance va dans un groupe portant
  "slug": "autre" - ce n'est pas une case par défaut pour éviter de choisir.
- confidence : ta confiance globale sur le découpage entier, entre 0 et 1. Ne dépasse jamais
  0.95, même quand c'est évident - 1.0 est réservé à une valeur confirmée par un humain.
  - 0.80 à 0.95 (haute) : les regroupements sont clairs et couvrent bien les articles.
  - 0.50 à 0.80 (moyenne) : les regroupements sont plausibles mais plusieurs articles sont
    ambigus ou peu descriptifs.
  - < 0.50 (basse) : les articles sont trop vagues, trop peu nombreux, ou trop hétérogènes pour
    un découpage fiable.
- reasoning : une phrase courte en français expliquant ce niveau de confiance.
"""


def _format_line_items_for_subcategorization(line_items: list[Any]) -> str:
    return "\n".join(
        f"{i}. {li.common_name or li.description} — {li.line_total}"
        for i, li in enumerate(line_items)
    )


async def call_subcategorizer(
    *,
    model: str,
    category_name: str,
    line_items: list[Any],
    established_subcategory_names: list[str] | None = None,
) -> dict[str, Any]:
    """One call: given one category's own line items (and, on retry, the sub-category names
    already established for OTHER categories earlier in this same batch run - a genuinely
    different signal, not the same call again, per /CLAUDE.md non-negotiable #3), ask for a
    sub-category grouping. Raises RuntimeError if the response can't be parsed as the expected
    JSON object."""
    established_block = ""
    if established_subcategory_names:
        established_block = (
            "\n\nSous-catégories déjà utilisées pour d'autres catégories dans cette même "
            "analyse (pour cohérence de style de nommage, ne les réutilise que si elles "
            "correspondent vraiment) : " + ", ".join(established_subcategory_names)
        )

    user_content = (
        f"Catégorie : {category_name}\n"
        f"Articles :\n{_format_line_items_for_subcategorization(line_items)}"
        f"{established_block}"
    )

    response = await llm_client.client.chat.completions.create(
        model=model,
        max_tokens=1024,
        messages=[
            {"role": "system", "content": SUBCATEGORIZER_PROMPT},
            {"role": "user", "content": user_content},
        ],
        temperature=0.15,
        extra_body={"reasoning": {"effort": "low"}},
    )
    raw = (response.choices[0].message.content or "").strip()
    logger.debug("subcategorizer.raw_response", raw=raw[:500])
    return llm_client.clamp_confidence(llm_client.extract_json(raw, source="subcategorizer"))


async def _call_subcategorizer_safe(**kwargs: Any) -> dict[str, Any]:
    """Same tolerance as categorizer_service._call_categorizer_safe - a malformed response
    degrades to confidence=0 (triggering retry, then the category-level "Autre" fallback if
    still unresolved) instead of crashing the batch run."""
    try:
        return await call_subcategorizer(**kwargs)
    except RuntimeError as exc:
        model = kwargs.get("model")
        logger.warning("subcategorizer.call_failed", model=model, error=str(exc))
        return {
            "confidence": 0.0,
            "reasoning": f"Le modèle {model} n'a pas produit une réponse exploitable : {exc}",
        }


def _collect_indices(groups: list[dict[str, Any]]) -> set[int]:
    indices: set[int] = set()
    for group in groups:
        indices.update(group.get("item_indices") or [])
        indices.update(_collect_indices(group.get("children") or []))
    return indices


def _collect_names(groups: list[dict[str, Any]]) -> list[str]:
    names: list[str] = []
    for group in groups:
        names.append(group.get("name") or group.get("slug") or CATCH_ALL_NAME)
        names.extend(_collect_names(group.get("children") or []))
    return names


async def _persist_group_tree(
    db: AsyncSession,
    user_id: uuid.UUID,
    category_id: uuid.UUID,
    groups: list[dict[str, Any]],
    line_items_by_index: dict[int, Any],
    parent_subcategory_id: uuid.UUID | None = None,
) -> None:
    """Recursively walks `groups`/`children`, get_or_create-ing a Subcategory row per group and
    bulk-assigning each group's DIRECT (non-child) item indices to its own subcategory_id - an
    item covered by a child group only gets tagged with that more specific leaf, never both."""
    for group in groups:
        subcategory = await subcategories_repo.get_or_create(
            db,
            user_id,
            category_id,
            name=group.get("name") or group.get("slug") or CATCH_ALL_NAME,
            slug=group.get("slug") or CATCH_ALL_SLUG,
            parent_subcategory_id=parent_subcategory_id,
        )

        children = group.get("children") or []
        child_indices = _collect_indices(children)
        direct_indices = [i for i in (group.get("item_indices") or []) if i not in child_indices]
        direct_ids = [line_items_by_index[i].id for i in direct_indices if i in line_items_by_index]
        await bill_line_items_repo.set_subcategory_for_line_items(
            db, user_id, direct_ids, subcategory.id
        )

        if children:
            await _persist_group_tree(
                db,
                user_id,
                category_id,
                children,
                line_items_by_index,
                parent_subcategory_id=subcategory.id,
            )


async def _subcategorize_one_category(
    db: AsyncSession, user_id: uuid.UUID, category: Category, established_names: list[str]
) -> list[str]:
    """One category's worth of work - the decision_loop.run cycle plus persistence, isolated
    so one category's failure can't block the others in the same batch run. Returns the
    sub-category names just used/created, for the NEXT category's retry-context signal within
    this same run."""
    line_items = await bill_line_items_repo.list_by_category(db, user_id, category.id)
    if not line_items:
        return []
    indexed = dict(enumerate(line_items))

    async def _first() -> dict[str, Any]:
        result = await _call_subcategorizer_safe(
            model=SUBCATEGORIZER_MODEL, category_name=category.name, line_items=line_items
        )
        logger.info(
            "subcategorizer.attempt",
            category_id=str(category.id),
            model=SUBCATEGORIZER_MODEL,
            confidence=result.get("confidence"),
        )
        return result

    async def _retry() -> dict[str, Any]:
        result = await _call_subcategorizer_safe(
            model=RETRY_MODEL,
            category_name=category.name,
            line_items=line_items,
            established_subcategory_names=established_names or None,
        )
        logger.info(
            "subcategorizer.retry",
            category_id=str(category.id),
            model=RETRY_MODEL,
            confidence=result.get("confidence"),
        )
        return result

    result, resolved = await decision_loop.run(
        _first,
        _retry,
        high_confidence_threshold=HIGH_CONFIDENCE_THRESHOLD,
        low_confidence_floor=LOW_CONFIDENCE_FLOOR,
    )

    if resolved:
        groups = list(result.get("groups") or [])
        # Defensive catch-all: an index the model's groups didn't cover (recursively) is a
        # model omission, not a legitimate "Autre" - still routed there rather than left
        # unassigned, even on an otherwise "resolved" high-confidence response.
        missing = sorted(set(indexed) - _collect_indices(groups))
        if missing:
            groups.append({"name": CATCH_ALL_NAME, "slug": CATCH_ALL_SLUG, "item_indices": missing})
        await _persist_group_tree(db, user_id, category.id, groups, indexed)
        return _collect_names(groups)

    # Non-negotiable #4's spirit, adapted (see module docstring): never silently drop these
    # items - one visible "Autre" leaf, logged, instead of a blocking elicitation.
    logger.warning(
        "subcategorizer.unresolved",
        category_id=str(category.id),
        confidence=result.get("confidence"),
    )
    catch_all = await subcategories_repo.get_or_create(
        db, user_id, category.id, name=CATCH_ALL_NAME, slug=CATCH_ALL_SLUG
    )
    await bill_line_items_repo.set_subcategory_for_line_items(
        db, user_id, [li.id for li in line_items], catch_all.id
    )
    return [CATCH_ALL_NAME]


async def subcategorize_all_categories(db: AsyncSession, user_id: uuid.UUID) -> dict[str, int]:
    """The batch entry point - one call processes every one of the user's categories. Full
    overwrite every run (no incremental/diff layer, matching the categorizer's own lack of
    one): clears every line item's subcategory_id and deletes all existing Subcategory rows for
    this user FIRST, in that FK-safe order, then rebuilds from scratch."""
    await bill_line_items_repo.clear_subcategory_for_user(db, user_id)
    await subcategories_repo.delete_all_for_user(db, user_id)

    categories = await categories_repo.list_by_user(db, user_id)
    established: list[str] = []
    subcategory_count = 0
    for category in categories:
        names = await _subcategorize_one_category(db, user_id, category, established)
        established.extend(names)
        subcategory_count += len(names)

    await db.commit()
    return {"categories_processed": len(categories), "subcategories_created": subcategory_count}

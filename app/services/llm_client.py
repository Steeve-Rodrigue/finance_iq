"""Shared OpenRouter client and JSON-response parsing - every agent (parser, categorizer,
and eventually the auditor) talks to a model and gets back "JSON, no markdown, no preamble",
so this is the one place that plumbing lives instead of being duplicated per agent."""

import json
from typing import Any

from openai import AsyncOpenAI

from app.config import settings

client = AsyncOpenAI(
    api_key=settings.openrouter_api_key, base_url=settings.openrouter_base_url, timeout=60
)


def extract_json(raw: str, *, source: str) -> dict[str, Any]:
    """Find-the-{-to-}-and-parse. Raises RuntimeError with a clear message if the model didn't
    keep its "JSON, no markdown, no preamble" promise - every caller treats that as a signal
    to retry with a different approach, not a hard crash."""
    if not raw:
        raise RuntimeError(f"{source} returned no text response")

    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise RuntimeError(f"no JSON object found in {source} response:\n{raw}")

    try:
        return json.loads(raw[start : end + 1])
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"invalid JSON from {source}: {exc}\n\nraw response:\n{raw}") from exc


def clamp_confidence(result: dict[str, Any], *, max_value: float = 0.95) -> dict[str, Any]:
    """Defense in depth on top of the prompt instruction ("never output above 0.95") - a model
    can still ignore that. 1.0 is reserved for a value a human has explicitly confirmed (see
    resume_from_elicitation_answer's merged_result), never something a model claims on its own
    - without this cap, an overconfident 0.99/1.0 from the model itself would be indistinguishable
    from a real human confirmation downstream. Mutates and returns `result` for convenient
    chaining at the call site."""
    confidence = result.get("confidence")
    if isinstance(confidence, int | float) and confidence > max_value:
        result["confidence"] = max_value
    return result

"""The one shared decision-loop shape every agent uses (/CLAUDE.md non-negotiables #2-#5,
roadmap.md Part 6.4: "The decision loop is one shared function... If a change would require
copy-pasting the branching logic, that's the wrong change - extend the shared function
instead"). What "a different approach" means for the retry attempt is entirely up to the
caller (a stronger model for the parser, added vendor-history context for the categorizer) -
this module only owns the confidence thresholds and the accept/retry/give-up branching."""

from collections.abc import Awaitable, Callable
from typing import Any

HIGH_CONFIDENCE_THRESHOLD = 0.90
LOW_CONFIDENCE_FLOOR = 0.86


async def run(
    attempt_first: Callable[[], Awaitable[dict[str, Any]]],
    attempt_retry: Callable[[], Awaitable[dict[str, Any]]],
    *,
    high_confidence_threshold: float = HIGH_CONFIDENCE_THRESHOLD,
    low_confidence_floor: float = LOW_CONFIDENCE_FLOOR,
) -> tuple[dict[str, Any], bool]:
    """High confidence on the first (cheap) attempt -> accept it. Medium -> retry once with a
    genuinely different approach (non-negotiable #3), not the same call again. Still low after
    that -> give up and say so, don't guess (non-negotiable #4) - the caller is responsible for
    turning `resolved=False` into a real elicitation, not this function.

    Returns (result, resolved).
    """
    result = await attempt_first()
    if result.get("confidence", 0) >= high_confidence_threshold:
        return result, True

    result = await attempt_retry()
    if result.get("confidence", 0) >= low_confidence_floor:
        return result, True

    return result, False

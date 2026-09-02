"""A minimal in-memory, per-process sliding-window rate limiter for the public /demo upload
endpoint (app/routers/demo.py) - the only thing standing between it and someone scripting
repeated calls to run up real OpenRouter API costs. Deliberately simple: no Redis, no shared
state across server instances or restarts. That's a real limitation for a multi-instance
deployment, not a complete abuse defense - just enough to meaningfully raise the bar for a
portfolio-scale public demo."""

import time
from collections import defaultdict

_requests: dict[str, list[float]] = defaultdict(list)


def is_allowed(key: str, *, max_requests: int, window_seconds: float) -> bool:
    """True and records this call if `key` has made fewer than `max_requests` calls in the
    trailing `window_seconds`, false (and doesn't record it) otherwise."""
    now = time.monotonic()
    cutoff = now - window_seconds
    timestamps = _requests[key]
    # Prune expired entries in place so this dict doesn't grow unbounded across every distinct
    # key seen over the process's lifetime.
    while timestamps and timestamps[0] < cutoff:
        timestamps.pop(0)
    if len(timestamps) >= max_requests:
        return False
    timestamps.append(now)
    return True


def reset() -> None:
    """Test-only: this module's state is a process-global dict, unlike DB state (which each
    test's transaction rolls back automatically - see tests/conftest.py's db_session), so
    tests need an explicit way to clear it between runs or requests sharing a rate-limit key
    (e.g. the same test client IP) would leak across otherwise-independent tests."""
    _requests.clear()

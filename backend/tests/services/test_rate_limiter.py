from app.services import rate_limiter


def test_allows_up_to_max_requests_then_blocks() -> None:
    key = "test-allows-up-to-max"
    assert rate_limiter.is_allowed(key, max_requests=2, window_seconds=60)
    assert rate_limiter.is_allowed(key, max_requests=2, window_seconds=60)
    assert not rate_limiter.is_allowed(key, max_requests=2, window_seconds=60)


def test_different_keys_are_independent() -> None:
    assert rate_limiter.is_allowed("test-key-a", max_requests=1, window_seconds=60)
    assert rate_limiter.is_allowed("test-key-b", max_requests=1, window_seconds=60)
    assert not rate_limiter.is_allowed("test-key-a", max_requests=1, window_seconds=60)


def test_expired_entries_free_up_the_window() -> None:
    key = "test-expired-entries"
    # A window so short it's already expired by the time the second call runs - proves stale
    # timestamps get pruned rather than counted forever.
    assert rate_limiter.is_allowed(key, max_requests=1, window_seconds=1e-6)
    assert rate_limiter.is_allowed(key, max_requests=1, window_seconds=1e-6)

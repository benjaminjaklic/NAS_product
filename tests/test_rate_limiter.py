"""Tests for the rate limiter (in-memory backend + Redis fallback selection)."""
import importlib

from app.utils.rate_limiter import RateLimiter, _create_limiter


def test_in_memory_blocks_after_limit():
    rl = RateLimiter()
    key = "1.2.3.4"
    # First 3 requests allowed
    assert rl.is_rate_limited(key, max_requests=3, window_seconds=60) is False
    assert rl.is_rate_limited(key, max_requests=3, window_seconds=60) is False
    assert rl.is_rate_limited(key, max_requests=3, window_seconds=60) is False
    # 4th request is over the limit
    assert rl.is_rate_limited(key, max_requests=3, window_seconds=60) is True


def test_get_remaining_counts_down():
    rl = RateLimiter()
    key = "5.6.7.8"
    assert rl.get_remaining(key, max_requests=2, window_seconds=60) == 2
    rl.is_rate_limited(key, max_requests=2, window_seconds=60)
    assert rl.get_remaining(key, max_requests=2, window_seconds=60) == 1


def test_separate_keys_are_independent():
    rl = RateLimiter()
    assert rl.is_rate_limited("a", max_requests=1, window_seconds=60) is False
    assert rl.is_rate_limited("a", max_requests=1, window_seconds=60) is True
    # Different key still has full budget
    assert rl.is_rate_limited("b", max_requests=1, window_seconds=60) is False


def test_factory_falls_back_without_redis(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    limiter = _create_limiter()
    assert isinstance(limiter, RateLimiter)


def test_factory_falls_back_on_bad_redis_url(monkeypatch):
    # Unreachable Redis must not crash; it should fall back to in-memory.
    monkeypatch.setenv("REDIS_URL", "redis://127.0.0.1:6390/0")
    limiter = _create_limiter()
    assert isinstance(limiter, RateLimiter)

"""
Rate limiting utilities for security.

Uses Redis when a REDIS_URL is configured and reachable (shared across workers
and persistent across restarts), otherwise falls back to a thread-safe
in-memory limiter so the app always works out of the box.
"""
import os
import logging
from functools import wraps
from flask import request, jsonify, current_app
from datetime import datetime, timedelta
import threading

logger = logging.getLogger(__name__)


class RateLimiter:
    """Simple in-memory rate limiter"""
    
    def __init__(self):
        self.requests = {}
        self.lock = threading.Lock()
    
    def is_rate_limited(self, key, max_requests=60, window_seconds=60):
        """Check if a key has exceeded rate limit"""
        now = datetime.utcnow()
        window_start = now - timedelta(seconds=window_seconds)
        
        with self.lock:
            if key not in self.requests:
                self.requests[key] = []
            
            # Clean old requests
            self.requests[key] = [t for t in self.requests[key] if t > window_start]
            
            # Check limit
            if len(self.requests[key]) >= max_requests:
                return True
            
            # Record this request
            self.requests[key].append(now)
            return False
    
    def get_remaining(self, key, max_requests=60, window_seconds=60):
        """Get remaining requests in current window"""
        now = datetime.utcnow()
        window_start = now - timedelta(seconds=window_seconds)
        
        with self.lock:
            if key not in self.requests:
                return max_requests
            
            recent = [t for t in self.requests[key] if t > window_start]
            return max(0, max_requests - len(recent))
    
    def cleanup(self, max_age_seconds=3600):
        """Remove old entries to prevent memory bloat"""
        now = datetime.utcnow()
        cutoff = now - timedelta(seconds=max_age_seconds)
        
        with self.lock:
            keys_to_delete = []
            for key, times in self.requests.items():
                # Keep only recent requests
                self.requests[key] = [t for t in times if t > cutoff]
                if not self.requests[key]:
                    keys_to_delete.append(key)
            
            for key in keys_to_delete:
                del self.requests[key]


class RedisRateLimiter:
    """Redis-backed rate limiter using fixed-window counters.

    Falls back to an in-memory limiter on any Redis error so a transient Redis
    outage never takes the whole application down.
    """

    def __init__(self, client):
        self.client = client
        self._fallback = RateLimiter()

    def is_rate_limited(self, key, max_requests=60, window_seconds=60):
        rkey = f"ratelimit:{key}"
        try:
            current = self.client.incr(rkey)
            if current == 1:
                self.client.expire(rkey, window_seconds)
            return current > max_requests
        except Exception as e:  # pragma: no cover - defensive
            logger.warning(f"Redis rate-limit error, using in-memory fallback: {e}")
            return self._fallback.is_rate_limited(key, max_requests, window_seconds)

    def get_remaining(self, key, max_requests=60, window_seconds=60):
        rkey = f"ratelimit:{key}"
        try:
            current = self.client.get(rkey)
            used = int(current) if current else 0
            return max(0, max_requests - used)
        except Exception:  # pragma: no cover - defensive
            return self._fallback.get_remaining(key, max_requests, window_seconds)

    def cleanup(self, max_age_seconds=3600):
        # Redis expires keys automatically via TTL; nothing to do.
        return


def _create_limiter():
    """Build the active limiter: Redis if available, else in-memory."""
    redis_url = os.environ.get("REDIS_URL")
    if not redis_url:
        logger.info("No REDIS_URL set — using in-memory rate limiter")
        return RateLimiter()
    try:
        import redis  # imported lazily so it's an optional dependency
        client = redis.from_url(redis_url, socket_connect_timeout=3, decode_responses=True)
        client.ping()
        logger.info("Connected to Redis for rate limiting")
        return RedisRateLimiter(client)
    except Exception as e:
        logger.warning(f"Redis unavailable ({e}) — falling back to in-memory rate limiter")
        return RateLimiter()


# Global rate limiter instance (Redis-backed when configured)
limiter = _create_limiter()


def rate_limit(max_requests=60, window_seconds=60, key_func=None):
    """
    Decorator to rate limit a route.
    
    Args:
        max_requests: Maximum requests allowed in the window
        window_seconds: Time window in seconds
        key_func: Function to generate the rate limit key (default: IP address)
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Get rate limit key
            if key_func:
                key = key_func()
            else:
                key = request.remote_addr or 'unknown'
            
            # Check rate limit
            if limiter.is_rate_limited(key, max_requests, window_seconds):
                return jsonify({
                    'error': 'Rate limit exceeded. Please try again later.',
                    'retry_after': window_seconds
                }), 429
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def rate_limit_login(max_attempts=5, lockout_seconds=300):
    """
    Special rate limiter for login attempts.
    More strict to prevent brute force attacks.
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            key = f"login:{request.remote_addr}"
            
            if limiter.is_rate_limited(key, max_attempts, lockout_seconds):
                return jsonify({
                    'error': 'Too many login attempts. Please try again later.',
                    'retry_after': lockout_seconds
                }), 429
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def rate_limit_api(max_requests=100, window_seconds=60):
    """Rate limiter specifically for API endpoints"""
    return rate_limit(max_requests, window_seconds)


def rate_limit_upload(max_uploads=10, window_seconds=60):
    """Rate limiter for file uploads"""
    return rate_limit(max_uploads, window_seconds)

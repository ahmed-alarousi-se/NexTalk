import time
from collections import defaultdict
from threading import Lock
from uuid import UUID

from fastapi import HTTPException

from src.core.config import settings


class MessageRateLimiter:
    """In-process sliding-window rate limiter per user."""

    def __init__(self, max_per_minute: int = 60):
        self.max_per_minute = max_per_minute
        self._events: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def check(self, user_id: UUID) -> None:
        key = str(user_id)
        now = time.monotonic()
        window = 60.0
        with self._lock:
            timestamps = [t for t in self._events[key] if now - t < window]
            if len(timestamps) >= self.max_per_minute:
                raise HTTPException(
                    status_code=429,
                    detail="Message rate limit exceeded. Try again shortly.",
                )
            timestamps.append(now)
            self._events[key] = timestamps


message_rate_limiter = MessageRateLimiter(max_per_minute=settings.MESSAGE_RATE_LIMIT_PER_MINUTE)

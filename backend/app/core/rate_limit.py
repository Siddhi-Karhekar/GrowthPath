"""
A minimal in-process cooldown for endpoints that call the (rate-limited,
free-tier) Groq API - guards against accidental refresh/double-click spam
burning through the shared quota, and for concept-graph builds specifically,
against two overlapping builds for the same subject racing each other's
dedup logic.

Deliberately not a real distributed rate limiter (Redis, etc.) - this is a
single free-tier instance with no horizontal scaling, so a plain in-memory
dict is enough. It resets harmlessly on restart/redeploy; that's fine, this
is spam insurance, not a security boundary.
"""
import time

from fastapi import HTTPException

_last_call: dict[str, float] = {}


def enforce_cooldown(user_id: str, action: str, seconds: float = 10.0) -> None:
    key = f"{user_id}:{action}"
    now = time.monotonic()
    last = _last_call.get(key)
    if last is not None and now - last < seconds:
        wait = round(seconds - (now - last), 1)
        raise HTTPException(
            429,
            f"Please wait {wait}s before generating again - this calls a rate-limited free LLM API.",
        )
    _last_call[key] = now

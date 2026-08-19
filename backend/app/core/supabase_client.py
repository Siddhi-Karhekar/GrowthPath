"""
Thin wrapper around the Supabase server client. We use the service role key
here because the backend needs to bypass row-level security for some writes
(e.g. writing ML-derived analytics), while every request is still scoped to
the authenticated user's own user_id extracted from their JWT (see security.py).
"""
from functools import lru_cache
from supabase import create_client, Client

from app.core.config import get_settings


@lru_cache
def get_supabase() -> Client:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError(
            "Supabase is not configured. Set SUPABASE_URL and "
            "SUPABASE_SERVICE_ROLE_KEY in your .env (see .env.example)."
        )
    return create_client(settings.supabase_url, settings.supabase_service_role_key)

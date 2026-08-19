"""
Verifies the Supabase Auth JWT that the frontend sends on every request
(Authorization: Bearer <token>), and extracts the user_id. Since this is a
single-user-per-account (student-only, no teacher/admin roles) app, the only
authorization rule we need is "you can only ever read/write your own rows" -
enforced by scoping every query in services/ to this user_id.

Supabase has two JWT signing modes depending on when the project was
created:
  - Newer projects (JWT Signing Keys) use asymmetric keys (ES256/RS256) -
    verified here via the project's public JWKS endpoint, no shared secret
    needed.
  - Older projects use a single shared HS256 secret (SUPABASE_JWT_SECRET).
We try JWKS first and fall back to the shared secret if it's configured,
so this works regardless of which mode a given project uses.
"""
from functools import lru_cache

import jwt
from fastapi import Header, HTTPException, status
from jwt import PyJWKClient

from app.core.config import get_settings

AUDIENCE = "authenticated"
ASYMMETRIC_ALGORITHMS = ["ES256", "RS256"]


@lru_cache
def _get_jwks_client() -> PyJWKClient:
    settings = get_settings()
    jwks_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    # cache_keys keeps signing keys in memory instead of re-fetching the
    # JWKS endpoint on every single request.
    return PyJWKClient(jwks_url, cache_keys=True)


def get_current_user_id(authorization: str = Header(default="")) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")

    token = authorization.split(" ", 1)[1]
    settings = get_settings()

    if not settings.supabase_url:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "SUPABASE_URL not configured on the server")

    payload = _decode_via_jwks(token) or _decode_via_shared_secret(token, settings.supabase_jwt_secret)
    if payload is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or unverifiable token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token missing subject claim")
    return user_id


def _decode_via_jwks(token: str) -> dict | None:
    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        return jwt.decode(token, signing_key.key, algorithms=ASYMMETRIC_ALGORITHMS, audience=AUDIENCE)
    except Exception:
        # Covers "this project doesn't use JWKS", network errors fetching
        # it, and a token that simply isn't asymmetrically signed - any of
        # these should fall through to the shared-secret attempt below.
        return None


def _decode_via_shared_secret(token: str, secret: str) -> dict | None:
    if not secret:
        return None
    try:
        return jwt.decode(token, secret, algorithms=["HS256"], audience=AUDIENCE)
    except jwt.PyJWTError:
        return None

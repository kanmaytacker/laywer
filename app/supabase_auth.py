from __future__ import annotations

import time
from dataclasses import dataclass

import httpx
from fastapi import Depends, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt

from .settings import get_env


JWKS_CACHE: dict[str, object] = {"expires_at": 0.0, "jwks": {}}
JWKS_TTL_SECONDS = 60 * 60
bearer_scheme = HTTPBearer(auto_error=False)


@dataclass
class SupabaseUser:
    id: str
    email: str
    tenant_id: str
    claims: dict


def _parse_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(status_code=401, detail="Invalid Authorization header")
    return parts[1].strip()


def _parse_bearer_credentials(credentials: HTTPAuthorizationCredentials | None) -> str:
    if credentials and credentials.scheme and credentials.credentials:
        if credentials.scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Invalid auth scheme")
        return credentials.credentials
    raise HTTPException(status_code=401, detail="Missing Authorization header")


async def _fetch_jwks() -> dict:
    supabase_url = get_env("SUPABASE_URL")
    if not supabase_url:
        raise HTTPException(status_code=503, detail="SUPABASE_URL is not configured")
    url = f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"JWKS fetch failed: {exc}") from exc
    if resp.status_code >= 300:
        raise HTTPException(status_code=502, detail=f"JWKS fetch failed: {resp.status_code}")
    body = resp.json()
    keys = body.get("keys", [])
    return {key.get("kid"): key for key in keys if key.get("kid")}


async def _get_jwks_cached() -> dict:
    now = time.time()
    if JWKS_CACHE["jwks"] and now < float(JWKS_CACHE["expires_at"]):
        return JWKS_CACHE["jwks"]  # type: ignore[return-value]
    jwks = await _fetch_jwks()
    JWKS_CACHE["jwks"] = jwks
    JWKS_CACHE["expires_at"] = now + JWKS_TTL_SECONDS
    return jwks


async def _decode_token(token: str) -> dict:
    try:
        header = jwt.get_unverified_header(token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Invalid JWT header: {exc}") from exc

    kid = header.get("kid")
    if not kid:
        raise HTTPException(status_code=401, detail="JWT kid missing")

    jwks = await _get_jwks_cached()
    key = jwks.get(kid)
    if not key:
        # rotate cache once if key not found
        JWKS_CACHE["expires_at"] = 0.0
        jwks = await _get_jwks_cached()
        key = jwks.get(kid)
    if not key:
        raise HTTPException(status_code=401, detail="Unknown JWT signing key")

    issuer = f"{get_env('SUPABASE_URL').rstrip('/')}/auth/v1"
    audience = get_env("SUPABASE_JWT_AUDIENCE", "authenticated")
    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=[key.get("alg", "RS256")],
            issuer=issuer,
            audience=audience,
        )
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"JWT verification failed: {exc}") from exc
    return payload


async def get_supabase_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    authorization: str | None = Header(default=None),
) -> SupabaseUser:
    token = _parse_bearer_credentials(credentials) if credentials else _parse_bearer_token(authorization)
    payload = await _decode_token(token)

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="JWT missing subject")
    email = payload.get("email", "") or ""

    # Current tenant model: per-user tenant by default unless custom claim set.
    tenant_id = payload.get("tenant_id") or payload.get("app_metadata", {}).get("tenant_id") or user_id
    return SupabaseUser(id=user_id, email=email, tenant_id=tenant_id, claims=payload)


def require_supabase_user(user: SupabaseUser = Depends(get_supabase_user)) -> SupabaseUser:
    return user

from __future__ import annotations

import os

from supabase import Client, create_client


def _require(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is not configured")
    return value


def get_supabase_client(service_role: bool = False) -> Client:
    url = _require("SUPABASE_URL")
    key_name = "SUPABASE_SERVICE_ROLE_KEY" if service_role else "SUPABASE_ANON_KEY"
    key = _require(key_name)
    return create_client(url, key)

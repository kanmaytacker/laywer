from __future__ import annotations

import math
import time
from collections import defaultdict
from datetime import datetime
from typing import Any

from fastapi import HTTPException

from .settings import get_env
from .supabase_data import rest_insert, rest_select


_RATE_WINDOWS: dict[str, dict[int, int]] = defaultdict(dict)


def enforce_rate_limit(user_id: str, route_key: str) -> None:
    limit = int(get_env("APP_RATE_LIMIT_PER_MINUTE", "60") or "60")
    now = int(time.time())
    minute = now // 60
    key = f"{user_id}:{route_key}"
    bucket = _RATE_WINDOWS[key]
    # compact previous minute entries
    stale = [k for k in bucket.keys() if k < minute - 1]
    for k in stale:
        bucket.pop(k, None)
    current = bucket.get(minute, 0) + 1
    bucket[minute] = current
    if current > limit:
        raise HTTPException(status_code=429, detail=f"Rate limit exceeded ({limit}/minute)")


def _estimate_cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    # Rough defaults; override per model in future.
    rates = {
        "gpt-4.1-mini": (0.40, 1.60),  # per 1M tokens
        "gpt-4.1": (5.00, 15.00),
    }
    in_rate, out_rate = rates.get(model, (0.40, 1.60))
    cost = (input_tokens / 1_000_000.0) * in_rate + (output_tokens / 1_000_000.0) * out_rate
    return float(math.ceil(cost * 1_000_000) / 1_000_000)


async def log_llm_usage(
    *,
    tenant_id: str,
    user_id: str,
    model: str,
    endpoint: str,
    input_tokens: int = 0,
    output_tokens: int = 0,
    job_id: str | None = None,
    case_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    await rest_insert(
        "llm_usage",
        {
            "tenant_id": tenant_id,
            "created_by": user_id,
            "case_id": case_id,
            "job_id": job_id,
            "endpoint": endpoint,
            "model": model,
            "tokens_in": input_tokens,
            "tokens_out": output_tokens,
            "cost_usd": _estimate_cost_usd(model, input_tokens, output_tokens),
            "meta": metadata or {},
            "created_at": datetime.utcnow().isoformat(),
        },
    )


async def log_ai_event(
    *,
    tenant_id: str,
    user_id: str,
    event_type: str,
    case_id: str | None = None,
    job_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    await rest_insert(
        "ai_audit_events",
        {
            "tenant_id": tenant_id,
            "created_by": user_id,
            "case_id": case_id,
            "job_id": job_id,
            "event_type": event_type,
            "meta": metadata or {},
            "created_at": datetime.utcnow().isoformat(),
        },
    )


async def get_prompt_template(name: str, default_content: str) -> str:
    rows = await rest_select(
        "prompt_templates",
        f"name=eq.{name}&active=eq.true&select=content,version&order=version.desc",
    )
    if not rows:
        return default_content
    return rows[0].get("content") or default_content

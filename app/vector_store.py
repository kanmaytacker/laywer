from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from openai import OpenAI

from .supabase_client import get_supabase_client


@dataclass
class VectorSettings:
    openai_api_key: str
    embedding_model: str = "text-embedding-3-small"
    embedding_dim: int = 1536


def _settings() -> VectorSettings | None:
    openai_api_key = os.getenv("OPENAI_API_KEY", "").strip()
    embedding_model = os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-small").strip() or "text-embedding-3-small"
    if not openai_api_key:
        return None
    return VectorSettings(openai_api_key=openai_api_key, embedding_model=embedding_model, embedding_dim=1536)


def _as_vector_literal(values: list[float]) -> str:
    return "[" + ",".join(f"{v:.8f}" for v in values) + "]"


def _embed_text(text: str, cfg: VectorSettings) -> list[float]:
    client = OpenAI(api_key=cfg.openai_api_key)
    response = client.embeddings.create(model=cfg.embedding_model, input=text)
    return response.data[0].embedding


def split_text_chunks(text: str, chunk_size: int = 1400, overlap: int = 180) -> list[str]:
    safe = (text or "").strip()
    if not safe:
        return []
    out: list[str] = []
    start = 0
    while start < len(safe):
        end = min(len(safe), start + chunk_size)
        chunk = safe[start:end].strip()
        if chunk:
            out.append(chunk)
        if end >= len(safe):
            break
        start = max(0, end - overlap)
    return out


def _hash_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


async def index_case_section(
    *,
    case_id: str,
    tenant_id: str,
    content: str,
    source: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return await index_case_chunks(
        case_id=case_id,
        tenant_id=tenant_id,
        source_key=source,
        chunks=[content],
        metadata=metadata or {},
    )


async def index_case_chunks(
    *,
    case_id: str,
    tenant_id: str,
    source_key: str,
    chunks: list[str],
    metadata: dict[str, Any] | None = None,
    doc_id: str | None = None,
    chunk_ids: list[str] | None = None,
) -> dict[str, Any]:
    cfg = _settings()
    if not cfg:
        return {"indexed": False, "reason": "OpenAI embedding settings missing"}

    client = get_supabase_client(service_role=True)
    rows = []
    for idx, raw_chunk in enumerate(chunks):
        chunk = (raw_chunk or "").strip()
        if not chunk:
            continue
        embedding = _embed_text(chunk, cfg)
        rows.append(
            {
                "id": str(uuid4()),
                "tenant_id": tenant_id,
                "case_id": case_id,
                "doc_id": doc_id,
                "chunk_id": (chunk_ids[idx] if chunk_ids and idx < len(chunk_ids) else None),
                "source_key": source_key,
                "chunk_index": idx,
                "content_hash": _hash_text(chunk),
                "embedding_model": cfg.embedding_model,
                "embedding_dim": cfg.embedding_dim,
                "metadata": metadata or {},
                "content": chunk,
                "token_count": max(1, len(chunk.split())),
                "embedding": _as_vector_literal(embedding),
            }
        )
    if not rows:
        return {"indexed": False, "reason": "No chunks to index"}

    try:
        response = (
            client.schema("docs")
            .table("page_section")
            .upsert(rows, on_conflict="tenant_id,source_key,chunk_index,embedding_model")
            .execute()
        )
        return {"indexed": True, "rows": response.data or []}
    except Exception as exc:
        return {"indexed": False, "reason": str(exc)}


async def search_case_sections(*, case_id: str, query: str, tenant_id: str, match_count: int = 5) -> list[dict[str, Any]]:
    cfg = _settings()
    if not cfg:
        return []
    safe_query = (query or "").strip()
    if not safe_query:
        return []
    embedding = _embed_text(safe_query, cfg)

    try:
        client = get_supabase_client(service_role=True)
        result = (
            client.schema("docs")
            .rpc(
                "match_page_sections",
                {
                    "query_embedding": _as_vector_literal(embedding),
                    "match_count": match_count,
                    "filter": {"case_id": case_id, "tenant_id": tenant_id},
                },
            )
            .execute()
        )
        return result.data or []
    except Exception:
        return []

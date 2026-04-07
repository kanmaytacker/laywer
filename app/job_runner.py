from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Any

from .copilot import artifact_pack, extract_documents, split_into_pages
from .governance import log_ai_event
from .supabase_data import rest_delete, rest_insert, rest_patch, rest_select
from .vector_store import index_case_chunks, split_text_chunks


def _sha(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


async def _process_vector_index_text(job: dict[str, Any]) -> dict[str, Any]:
    payload = job.get("payload") or {}
    case_id = payload.get("case_id")
    tenant_id = payload.get("tenant_id") or job.get("tenant_id")
    content = payload.get("content", "")
    source = payload.get("source", "summary")
    metadata = payload.get("metadata", {}) or {}
    chunks = split_text_chunks(content)
    result = await index_case_chunks(
        case_id=case_id,
        tenant_id=tenant_id,
        source_key=f"text:{source}:{case_id}",
        chunks=chunks,
        metadata=metadata,
    )
    return {"indexed_chunks": len(chunks), "result": result}


async def _process_case_documents(job: dict[str, Any], case_item: dict[str, Any], documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    extracted_docs = await extract_documents(documents)
    for doc in extracted_docs:
        doc_id = doc.get("id")
        if not doc_id:
            continue
        text = doc.get("text", "") or ""
        pages = split_into_pages(text)

        await rest_delete("document_pages", f"document_id=eq.{doc_id}")
        await rest_delete("document_chunks", f"document_id=eq.{doc_id}")
        await rest_delete(
            "page_section",
            f"tenant_id=eq.{job.get('tenant_id')}&case_id=eq.{case_item.get('id')}&doc_id=eq.{doc_id}",
            schema="docs",
        )

        page_rows = []
        for i, page_text in enumerate(pages, start=1):
            page_rows.append(
                {
                    "tenant_id": job.get("tenant_id"),
                    "case_id": case_item.get("id"),
                    "document_id": doc_id,
                    "page_number": i,
                    "content": page_text,
                    "content_hash": _sha(page_text),
                }
            )
        if page_rows:
            await rest_insert("document_pages", page_rows)

        chunks = split_text_chunks(text)
        chunk_rows = []
        for i, chunk_text in enumerate(chunks):
            chunk_rows.append(
                {
                    "tenant_id": job.get("tenant_id"),
                    "case_id": case_item.get("id"),
                    "document_id": doc_id,
                    "chunk_index": i,
                    "content": chunk_text,
                    "content_hash": _sha(chunk_text),
                    "token_count": max(1, len(chunk_text.split())),
                    "embedding_model": "text-embedding-3-small",
                    "page_from": 1,
                    "page_to": max(1, len(pages)),
                }
            )
        inserted = await rest_insert("document_chunks", chunk_rows) if chunk_rows else []
        chunk_ids = [row.get("id") for row in inserted if row.get("id")]
        await index_case_chunks(
            case_id=case_item.get("id"),
            tenant_id=job.get("tenant_id"),
            source_key=f"doc:{doc_id}",
            chunks=chunks,
            metadata={"doc_id": doc_id, "title": doc.get("title", "")},
            doc_id=doc_id,
            chunk_ids=chunk_ids,
        )
    return extracted_docs


async def _process_case_processing(job: dict[str, Any]) -> dict[str, Any]:
    case_id = job.get("case_id")
    tenant_id = job.get("tenant_id")
    user_id = job.get("created_by")

    case_rows = await rest_select("cases", f"id=eq.{case_id}&tenant_id=eq.{tenant_id}&select=*")
    if not case_rows:
        raise RuntimeError("Case not found")
    case_item = case_rows[0]
    docs = await rest_select("documents", f"case_id=eq.{case_id}&tenant_id=eq.{tenant_id}&select=*&order=created_at.desc")

    extracted_docs = await _process_case_documents(job, case_item, docs)
    outputs = artifact_pack(case_item, extracted_docs)
    for kind in ["brief", "chronology", "issues", "draft", "annexure_index"]:
        existing = await rest_select("artifacts", f"case_id=eq.{case_id}&kind=eq.{kind}&tenant_id=eq.{tenant_id}&select=version")
        version = max([row.get("version", 0) for row in existing], default=0) + 1
        await rest_insert(
            "artifacts",
            {
                "tenant_id": tenant_id,
                "case_id": case_id,
                "created_by": user_id,
                "kind": kind,
                "title": kind.replace("_", " ").title(),
                "content": outputs[kind],
                "version": version,
                "sources": [d.get("title", "Document") for d in extracted_docs],
            },
        )
        await index_case_chunks(
            case_id=case_id,
            tenant_id=tenant_id,
            source_key=f"artifact:{kind}:{case_id}",
            chunks=split_text_chunks(outputs[kind]),
            metadata={"kind": kind, "version": version},
        )

    await log_ai_event(
        tenant_id=tenant_id,
        user_id=user_id,
        case_id=case_id,
        job_id=job.get("id"),
        event_type="case_processing_completed",
        metadata={"documents": len(extracted_docs)},
    )
    return {"artifacts_generated": 5, "documents_processed": len(extracted_docs)}


async def run_job(job: dict[str, Any]) -> dict[str, Any]:
    job_type = job.get("job_type")
    if job_type == "vector_index_text":
        return await _process_vector_index_text(job)
    if job_type == "case_processing":
        return await _process_case_processing(job)
    raise RuntimeError(f"Unsupported job type: {job_type}")


async def mark_job_running(job_id: str, worker_id: str) -> dict[str, Any] | None:
    rows = await rest_patch(
        "jobs",
        f"id=eq.{job_id}&status=eq.queued",
        {
            "status": "running",
            "started_at": datetime.utcnow().isoformat(),
            "locked_by": worker_id,
            "locked_at": datetime.utcnow().isoformat(),
        },
    )
    return rows[0] if rows else None


async def mark_job_completed(job_id: str, result: dict[str, Any]) -> None:
    await rest_patch(
        "jobs",
        f"id=eq.{job_id}",
        {
            "status": "completed",
            "result": result,
            "finished_at": datetime.utcnow().isoformat(),
            "error_message": None,
            "progress": 100,
        },
    )


async def mark_job_failed(job: dict[str, Any], error: str) -> None:
    attempts = int(job.get("attempt_count") or 0) + 1
    max_attempts = int(job.get("max_attempts") or 3)
    status = "queued" if attempts < max_attempts else "failed"
    payload = {
        "status": status,
        "attempt_count": attempts,
        "error_message": error[:2000],
    }
    if status == "failed":
        payload["finished_at"] = datetime.utcnow().isoformat()
    await rest_patch("jobs", f"id=eq.{job.get('id')}", payload)

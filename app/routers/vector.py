from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..governance import log_ai_event
from ..supabase_auth import SupabaseUser, require_supabase_user
from ..supabase_data import rest_insert, rest_select

router = APIRouter(prefix="/vector", tags=["vector"])


class IndexSectionRequest(BaseModel):
    case_id: str
    content: str
    source: str = "summary"
    metadata: dict = {}


@router.post(
    "/index",
    summary="Queue vector indexing job",
    description="Queues async vector indexing for case text/content in the `jobs` table.",
)
async def index_section(payload: IndexSectionRequest, user: SupabaseUser = Depends(require_supabase_user)):
    case_rows = await rest_select("cases", f"id=eq.{payload.case_id}&tenant_id=eq.{user.tenant_id}&select=id")
    if not case_rows:
        return {"queued": False, "error": "Case not found"}

    rows = await rest_insert(
        "jobs",
        {
            "tenant_id": user.tenant_id,
            "created_by": user.id,
            "case_id": payload.case_id,
            "job_type": "vector_index_text",
            "status": "queued",
            "payload": {
                "tenant_id": user.tenant_id,
                "case_id": payload.case_id,
                "content": payload.content,
                "source": payload.source,
                "metadata": payload.metadata or {},
            },
            "progress": 0,
            "attempt_count": 0,
            "max_attempts": 3,
        },
    )
    job = rows[0]
    await log_ai_event(
        tenant_id=user.tenant_id,
        user_id=user.id,
        case_id=payload.case_id,
        job_id=job["id"],
        event_type="vector_index_queued",
        metadata={"source": payload.source},
    )
    return {"job": job, "queued": True}


@router.get(
    "/jobs/{job_id}",
    summary="Get vector job status",
    description="Returns a queued/running/completed/failed vector indexing job by id.",
)
async def get_job(job_id: str, user: SupabaseUser = Depends(require_supabase_user)):
    rows = await rest_select(
        "jobs",
        f"id=eq.{job_id}&tenant_id=eq.{user.tenant_id}&select=*",
    )
    return rows[0] if rows else None

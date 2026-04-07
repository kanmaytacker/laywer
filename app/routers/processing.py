from __future__ import annotations

from datetime import datetime
from pathlib import Path
from tempfile import gettempdir
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from ..governance import log_ai_event
from ..supabase_auth import SupabaseUser, require_supabase_user
from ..supabase_data import rest_insert, rest_select, upload_file

router = APIRouter(prefix="/processing", tags=["processing"])


class RunProcessingRequest(BaseModel):
    force: bool = False


def _build_bundle_pdf(case_item: dict, artifacts: list[dict], documents: list[dict]) -> bytes:
    output_path = Path(gettempdir()) / f"bundle_{case_item.get('id')}_{uuid4()}.pdf"
    c = canvas.Canvas(str(output_path), pagesize=A4)
    _, height = A4
    y = height - 48
    c.setFont("Helvetica-Bold", 15)
    c.drawString(42, y, f"Filing Bundle: {case_item.get('name', 'Case')}")
    y -= 20
    c.setFont("Helvetica", 10)
    c.drawString(42, y, f"Generated: {datetime.utcnow().isoformat()} UTC")
    y -= 24

    c.setFont("Helvetica-Bold", 12)
    c.drawString(42, y, "Index")
    y -= 16
    c.setFont("Helvetica", 10)
    for line in ["1. Matter Brief", "2. Chronology", "3. Issue List", "4. Draft Response", "5. Annexure Index", "6. Annexures"]:
        c.drawString(52, y, line)
        y -= 14
    c.showPage()

    for artifact in artifacts:
        c.setFont("Helvetica-Bold", 13)
        c.drawString(42, height - 48, artifact.get("title", "Artifact"))
        c.setFont("Helvetica", 10)
        y = height - 72
        for raw in (artifact.get("content", "") or "").splitlines():
            c.drawString(42, y, raw[:120])
            y -= 14
            if y < 44:
                c.showPage()
                y = height - 48
                c.setFont("Helvetica", 10)
        c.showPage()

    c.setFont("Helvetica-Bold", 13)
    c.drawString(42, height - 48, "Annexures")
    c.setFont("Helvetica", 10)
    y = height - 72
    for idx, doc in enumerate(documents, start=1):
        c.drawString(42, y, f"{idx}. {doc.get('title', 'Document')} ({doc.get('doc_type', 'document')})"[:120])
        y -= 14
        if y < 44:
            c.showPage()
            y = height - 48
            c.setFont("Helvetica", 10)
    c.save()
    payload = output_path.read_bytes()
    output_path.unlink(missing_ok=True)
    return payload


@router.post(
    "/cases/{case_id}/run",
    summary="Queue case processing job",
    description="Queues asynchronous processing for a case (document extraction, generated case documents, indexing).",
)
async def run_case_processing(case_id: str, payload: RunProcessingRequest, user: SupabaseUser = Depends(require_supabase_user)):
    case_rows = await rest_select("cases", f"id=eq.{case_id}&tenant_id=eq.{user.tenant_id}&select=id,name")
    if not case_rows:
        raise HTTPException(status_code=404, detail="Case not found")

    if not payload.force:
        existing = await rest_select(
            "jobs",
            f"case_id=eq.{case_id}&tenant_id=eq.{user.tenant_id}&job_type=eq.case_processing&status=in.(queued,running)&select=id,status",
        )
        if existing:
            return {"job": existing[0], "queued": False}

    rows = await rest_insert(
        "jobs",
        {
            "tenant_id": user.tenant_id,
            "created_by": user.id,
            "case_id": case_id,
            "job_type": "case_processing",
            "status": "queued",
            "payload": {},
            "progress": 0,
            "attempt_count": 0,
            "max_attempts": 3,
        },
    )
    job = rows[0]
    await log_ai_event(
        tenant_id=user.tenant_id,
        user_id=user.id,
        case_id=case_id,
        job_id=job["id"],
        event_type="case_processing_queued",
    )
    return {"job": job, "queued": True}


@router.get(
    "/cases/{case_id}/jobs",
    summary="List case processing jobs",
    description="Lists processing jobs for the given case, newest first.",
)
async def list_case_jobs(case_id: str, user: SupabaseUser = Depends(require_supabase_user)):
    return await rest_select(
        "jobs",
        f"case_id=eq.{case_id}&tenant_id=eq.{user.tenant_id}&job_type=eq.case_processing&select=*&order=created_at.desc",
    )


@router.get(
    "/cases/{case_id}/artifacts",
    summary="List generated case documents",
    description="Returns generated case documents (stored in `artifacts` table) for the given case.",
)
async def list_case_artifacts(case_id: str, user: SupabaseUser = Depends(require_supabase_user)):
    return await rest_select(
        "artifacts",
        f"case_id=eq.{case_id}&tenant_id=eq.{user.tenant_id}&select=*&order=created_at.desc",
    )


@router.get(
    "/cases/{case_id}/bundle",
    summary="Build and export filing bundle",
    description="Builds a filing bundle PDF from generated case documents + uploaded documents and stores it in Supabase Storage.",
)
async def build_bundle(case_id: str, user: SupabaseUser = Depends(require_supabase_user)):
    case_rows = await rest_select("cases", f"id=eq.{case_id}&tenant_id=eq.{user.tenant_id}&select=*")
    if not case_rows:
        raise HTTPException(status_code=404, detail="Case not found")
    case_item = case_rows[0]
    artifacts = await rest_select("artifacts", f"case_id=eq.{case_id}&tenant_id=eq.{user.tenant_id}&select=*&order=created_at.asc")
    documents = await rest_select("documents", f"case_id=eq.{case_id}&tenant_id=eq.{user.tenant_id}&select=*&order=created_at.asc")
    if not artifacts and not documents:
        raise HTTPException(status_code=400, detail="No artifacts/documents available to bundle")

    payload = _build_bundle_pdf(case_item, artifacts, documents)
    out_path = f"{user.tenant_id}/{case_id}/bundle_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}.pdf"
    uploaded = await upload_file("case-exports", out_path, payload, content_type="application/pdf")
    url = uploaded["url"]

    await rest_insert(
        "exports",
        {
            "tenant_id": user.tenant_id,
            "case_id": case_id,
            "created_by": user.id,
            "kind": "filing_bundle",
            "file_path": out_path,
            "file_url": url,
        },
    )
    await log_ai_event(
        tenant_id=user.tenant_id,
        user_id=user.id,
        case_id=case_id,
        event_type="filing_bundle_exported",
        metadata={"path": out_path},
    )
    return {"url": url, "path": out_path}

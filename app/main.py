from __future__ import annotations

import json
from pathlib import Path
from time import perf_counter
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from .auth import get_current_user, require_role
from .db import Base, DATA_DIR, engine, get_db
from .models import Artifact, AuditEvent, Comment, Document, DocumentVersion, Matter, TaskDeadline, User
from .schemas import (
    ArtifactOut,
    CommentCreate,
    CommentOut,
    DocumentOut,
    DocumentVersionOut,
    MatterCreate,
    MatterOut,
    TaskCreate,
    TaskOut,
    UserCreate,
    UserOut,
)
from .services import (
    build_annexure_index,
    build_brief,
    build_chronology,
    build_draft_response,
    build_filing_bundle_pdf,
    build_issues,
    create_artifact,
    extract_text,
    latest_versions_by_matter,
    log_event,
    quick_keywords,
    write_docx,
)
from .routers import chat as chat_router
from .routers import processing as processing_router
from .routers import vector as vector_router
from . import settings
from .logging_utils import log_json
import os

app = FastAPI(
    title="CaseDesk API",
    version="0.1.0",
    description=(
        "CaseDesk backend APIs for cases, contacts, documents, chat, and async processing.\n\n"
        "Authentication notes:\n"
        "- `/chat/*`, `/vector/*`, and `/processing/*` require a Bearer token (Supabase access token).\n"
        "- Click 'Authorize' in Swagger and paste: `Bearer <supabase_access_token>`.\n"
        "- For production flows, prefer Supabase Auth tokens from the frontend."
    ),
    openapi_tags=[
        {"name": "chat", "description": "LLM-backed chat and case summary endpoints."},
        {"name": "vector", "description": "Vector indexing/search job endpoints."},
        {"name": "processing", "description": "Async case processing and bundle export endpoints."},
    ],
)

Base.metadata.create_all(bind=engine)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=Path(__file__).resolve().parent / "static"), name="static")
app.include_router(chat_router.router)
app.include_router(processing_router.router)
app.include_router(vector_router.router)


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid4())
    request.state.request_id = request_id
    started = perf_counter()
    try:
        response = await call_next(request)
    except Exception as exc:
        elapsed_ms = round((perf_counter() - started) * 1000, 2)
        log_json(
            "http.request.error",
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            elapsed_ms=elapsed_ms,
            error=str(exc),
        )
        raise
    elapsed_ms = round((perf_counter() - started) * 1000, 2)
    response.headers["x-request-id"] = request_id
    log_json(
        "http.request",
        request_id=request_id,
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        elapsed_ms=elapsed_ms,
    )
    return response


@app.get("/", include_in_schema=False)
def home():
    return FileResponse(Path(__file__).resolve().parent / "static" / "index.html")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/health/provider")
def health_provider() -> dict:
    key = os.getenv("OPENAI_API_KEY")
    supabase_url = settings.get_env("SUPABASE_URL")
    supabase_anon = settings.get_env("SUPABASE_ANON_KEY")
    supabase_service = settings.get_env("SUPABASE_SERVICE_ROLE_KEY")
    return {
        "openai_configured": bool(key),
        "openai_key_hint": settings.masked_key(key),
        "supabase_configured": bool(supabase_url and supabase_anon),
        "supabase_url_hint": supabase_url[:24] + "..." if supabase_url else "",
        "supabase_anon_key_hint": settings.masked_key(supabase_anon),
        "supabase_service_role_configured": bool(supabase_service),
        "supabase_service_role_key_hint": settings.masked_key(supabase_service),
    }


@app.post("/users", response_model=UserOut, include_in_schema=False)
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    exists = db.query(User).filter(User.email == payload.email).first()
    if exists:
        raise HTTPException(status_code=409, detail="User email already exists")
    user = User(**payload.model_dump())
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.get("/users/me", response_model=UserOut, include_in_schema=False)
def me(user: User = Depends(get_current_user)):
    return user


@app.post("/matters", response_model=MatterOut, include_in_schema=False)
def create_matter(
    payload: MatterCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("Editor")),
):
    matter = Matter(tenant=user.tenant, created_by=user.id, **payload.model_dump())
    db.add(matter)
    db.commit()
    db.refresh(matter)
    log_event(db, user, "create", "matter", str(matter.id), {"title": matter.title})
    return matter


@app.get("/matters", response_model=list[MatterOut], include_in_schema=False)
def list_matters(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return db.query(Matter).filter(Matter.tenant == user.tenant).order_by(Matter.updated_at.desc()).all()


@app.get("/matters/{matter_id}", response_model=MatterOut, include_in_schema=False)
def get_matter(matter_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    matter = db.query(Matter).filter(Matter.id == matter_id, Matter.tenant == user.tenant).first()
    if not matter:
        raise HTTPException(status_code=404, detail="Matter not found")
    return matter


@app.post("/matters/{matter_id}/documents", response_model=DocumentVersionOut, include_in_schema=False)
def upload_document(
    matter_id: int,
    file: UploadFile = File(...),
    title: str = Form(...),
    tag: str = Form(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_role("Editor")),
):
    matter = db.query(Matter).filter(Matter.id == matter_id, Matter.tenant == user.tenant).first()
    if not matter:
        raise HTTPException(status_code=404, detail="Matter not found")

    suffix = Path(file.filename or "").suffix.lower() or ".bin"
    doc = db.query(Document).filter(Document.matter_id == matter_id, Document.title == title).first()
    if not doc:
        doc = Document(matter_id=matter_id, title=title, tag=tag, doc_type=suffix.lstrip("."), created_by=user.id)
        db.add(doc)
        db.commit()
        db.refresh(doc)

    last = (
        db.query(DocumentVersion)
        .filter(DocumentVersion.document_id == doc.id)
        .order_by(DocumentVersion.version_number.desc())
        .first()
    )
    version = 1 if not last else last.version_number + 1

    matter_dir = DATA_DIR / user.tenant / f"matter_{matter_id}" / f"doc_{doc.id}"
    matter_dir.mkdir(parents=True, exist_ok=True)
    path = matter_dir / f"v{version}{suffix}"
    contents = file.file.read()
    path.write_bytes(contents)
    text = extract_text(path)

    dv = DocumentVersion(
        document_id=doc.id,
        version_number=version,
        file_path=str(path),
        extracted_text=text,
        uploaded_by=user.id,
    )
    db.add(dv)
    db.commit()
    db.refresh(dv)

    log_event(db, user, "upload", "document_version", str(dv.id), {"matter_id": matter_id, "document_id": doc.id})
    return dv


@app.get("/matters/{matter_id}/documents", response_model=list[DocumentOut], include_in_schema=False)
def list_documents(matter_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    matter = db.query(Matter).filter(Matter.id == matter_id, Matter.tenant == user.tenant).first()
    if not matter:
        raise HTTPException(status_code=404, detail="Matter not found")
    return db.query(Document).filter(Document.matter_id == matter_id).order_by(Document.created_at.desc()).all()


@app.get("/matters/{matter_id}/search", include_in_schema=False)
def search_documents(
    matter_id: int,
    q: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    matter = db.query(Matter).filter(Matter.id == matter_id, Matter.tenant == user.tenant).first()
    if not matter:
        raise HTTPException(status_code=404, detail="Matter not found")
    versions = latest_versions_by_matter(db, matter_id)
    hits = []
    query = q.lower()
    for v in versions:
        text = v.extracted_text or ""
        idx = text.lower().find(query)
        if idx >= 0:
            doc = db.query(Document).filter(Document.id == v.document_id).first()
            snippet = text[max(0, idx - 120): idx + 180].replace("\n", " ")
            hits.append(
                {
                    "document_id": v.document_id,
                    "document_title": doc.title if doc else f"Document {v.document_id}",
                    "version": v.version_number,
                    "snippet": snippet,
                }
            )
    return {"query": q, "hits": hits, "count": len(hits)}


@app.post("/matters/{matter_id}/tasks", response_model=TaskOut, include_in_schema=False)
def add_task(
    matter_id: int,
    payload: TaskCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("Editor")),
):
    matter = db.query(Matter).filter(Matter.id == matter_id, Matter.tenant == user.tenant).first()
    if not matter:
        raise HTTPException(status_code=404, detail="Matter not found")
    task = TaskDeadline(matter_id=matter_id, created_by=user.id, **payload.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    log_event(db, user, "create", "task", str(task.id), {"matter_id": matter_id})
    return task


@app.get("/matters/{matter_id}/tasks", response_model=list[TaskOut], include_in_schema=False)
def list_tasks(matter_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    matter = db.query(Matter).filter(Matter.id == matter_id, Matter.tenant == user.tenant).first()
    if not matter:
        raise HTTPException(status_code=404, detail="Matter not found")
    return db.query(TaskDeadline).filter(TaskDeadline.matter_id == matter_id).order_by(TaskDeadline.due_date.asc()).all()


@app.post("/matters/{matter_id}/comments", response_model=CommentOut, include_in_schema=False)
def add_comment(
    matter_id: int,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("Editor")),
):
    matter = db.query(Matter).filter(Matter.id == matter_id, Matter.tenant == user.tenant).first()
    if not matter:
        raise HTTPException(status_code=404, detail="Matter not found")
    c = Comment(matter_id=matter_id, author_id=user.id, **payload.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    log_event(db, user, "comment", payload.target_type, str(payload.target_id), {"matter_id": matter_id})
    return c


@app.get("/matters/{matter_id}/comments", response_model=list[CommentOut], include_in_schema=False)
def list_comments(matter_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    matter = db.query(Matter).filter(Matter.id == matter_id, Matter.tenant == user.tenant).first()
    if not matter:
        raise HTTPException(status_code=404, detail="Matter not found")
    return db.query(Comment).filter(Comment.matter_id == matter_id).order_by(Comment.created_at.desc()).all()


def _ensure_matter_access(db: Session, matter_id: int, user: User) -> Matter:
    matter = db.query(Matter).filter(Matter.id == matter_id, Matter.tenant == user.tenant).first()
    if not matter:
        raise HTTPException(status_code=404, detail="Matter not found")
    return matter


@app.post("/matters/{matter_id}/generate/{artifact_type}", response_model=ArtifactOut, include_in_schema=False)
def generate_artifact(
    matter_id: int,
    artifact_type: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("Editor")),
):
    matter = _ensure_matter_access(db, matter_id, user)
    versions = latest_versions_by_matter(db, matter_id)
    if not versions:
        raise HTTPException(status_code=400, detail="No documents uploaded")

    if artifact_type == "brief":
        content, sources = build_brief(matter, versions, db)
        title = "Matter Brief"
    elif artifact_type == "chronology":
        content, sources = build_chronology(versions, db)
        title = "Chronology"
    elif artifact_type == "issues":
        content, sources = build_issues(versions, db)
        title = "Issue List"
    elif artifact_type == "draft":
        content, sources = build_draft_response(matter, versions, db)
        title = "First Draft Response"
    elif artifact_type == "annexure_index":
        content, sources = build_annexure_index(versions, db)
        title = "Annexure Index"
    else:
        raise HTTPException(status_code=400, detail="Unsupported artifact_type")

    artifact = create_artifact(db, matter_id, artifact_type, title, content, sources, user.id)
    log_event(db, user, "generate", "artifact", str(artifact.id), {"artifact_type": artifact_type})
    return artifact


@app.get("/matters/{matter_id}/artifacts", response_model=list[ArtifactOut], include_in_schema=False)
def list_artifacts(matter_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _ensure_matter_access(db, matter_id, user)
    return (
        db.query(Artifact)
        .filter(Artifact.matter_id == matter_id)
        .order_by(Artifact.created_at.desc())
        .all()
    )


@app.get("/matters/{matter_id}/insights", include_in_schema=False)
def get_insights(matter_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _ensure_matter_access(db, matter_id, user)
    versions = latest_versions_by_matter(db, matter_id)
    text = "\n".join(v.extracted_text or "" for v in versions)
    return {"keywords": quick_keywords(text), "documents": len(versions)}


@app.get("/matters/{matter_id}/export/artifact/{artifact_id}/docx", include_in_schema=False)
def export_artifact_docx(
    matter_id: int,
    artifact_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("Editor")),
):
    _ensure_matter_access(db, matter_id, user)
    artifact = db.query(Artifact).filter(Artifact.id == artifact_id, Artifact.matter_id == matter_id).first()
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")

    outdir = DATA_DIR / user.tenant / f"matter_{matter_id}" / "exports"
    outdir.mkdir(parents=True, exist_ok=True)
    outpath = outdir / f"artifact_{artifact.id}_v{artifact.version_number}.docx"
    write_docx(artifact.content, outpath)
    log_event(db, user, "export", "artifact_docx", str(artifact.id), {"path": str(outpath)})
    return FileResponse(path=str(outpath), filename=outpath.name, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")


@app.get("/matters/{matter_id}/export/bundle.pdf", include_in_schema=False)
def export_bundle(
    matter_id: int,
    artifact_ids: str | None = Query(default=None, description="comma separated artifact ids"),
    db: Session = Depends(get_db),
    user: User = Depends(require_role("Editor")),
):
    matter = _ensure_matter_access(db, matter_id, user)
    outdir = DATA_DIR / user.tenant / f"matter_{matter_id}" / "exports"
    outdir.mkdir(parents=True, exist_ok=True)
    outpath = outdir / "filing_bundle.pdf"

    artifacts_query = db.query(Artifact).filter(Artifact.matter_id == matter_id)
    if artifact_ids:
        ids = [int(i.strip()) for i in artifact_ids.split(",") if i.strip().isdigit()]
        artifacts_query = artifacts_query.filter(Artifact.id.in_(ids))
    artifacts = artifacts_query.order_by(Artifact.created_at.asc()).all()
    versions = latest_versions_by_matter(db, matter_id)

    build_filing_bundle_pdf(outpath, matter, artifacts, versions, db)
    log_event(db, user, "export", "bundle_pdf", str(matter_id), {"path": str(outpath)})
    return FileResponse(path=str(outpath), filename=outpath.name, media_type="application/pdf")


@app.get("/matters/{matter_id}/audit", include_in_schema=False)
def matter_audit(matter_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _ensure_matter_access(db, matter_id, user)
    events = (
        db.query(AuditEvent)
        .filter(AuditEvent.tenant == user.tenant)
        .order_by(AuditEvent.created_at.desc())
        .limit(250)
        .all()
    )
    return [
        {
            "id": e.id,
            "action": e.action,
            "entity_type": e.entity_type,
            "entity_id": e.entity_id,
            "meta": json.loads(e.meta or "{}"),
            "created_at": e.created_at.isoformat(),
            "user_id": e.user_id,
        }
        for e in events
    ]

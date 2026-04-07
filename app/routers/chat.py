from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from openai import APIError, OpenAI
from pydantic import BaseModel

from ..governance import enforce_rate_limit, get_prompt_template, log_ai_event, log_llm_usage
from ..schemas import ChatProxyRequest
from ..supabase_auth import SupabaseUser, require_supabase_user
from ..supabase_data import rest_select
from ..vector_store import search_case_sections

router = APIRouter(prefix="/chat", tags=["chat"])


class SummaryDocument(BaseModel):
    title: str
    tag: str | None = None


class CaseSummaryRequest(BaseModel):
    case_name: str
    forum: str | None = None
    stage: str | None = None
    parties: str | None = None
    current_summary: str | None = None
    contacts: list[str] = []
    documents: list[SummaryDocument] = []
    model: str = "gpt-4.1-mini"


class CaseChatRequest(BaseModel):
    model: str = "gpt-4.1-mini"
    messages: list[dict[str, str]]
    use_web_search: bool = False
    citations_required: bool = True


def _extract_text(response) -> str:
    if getattr(response, "output_text", None):
        return response.output_text
    parts: list[str] = []
    output = getattr(response, "output", []) or []
    for item in output:
        for content in getattr(item, "content", []) or []:
            text = getattr(content, "text", None)
            if text:
                parts.append(text)
    return "\n".join(parts).strip()


def _extract_usage(response) -> tuple[int, int]:
    usage = getattr(response, "usage", None) or {}
    if hasattr(usage, "input_tokens"):
        return int(getattr(usage, "input_tokens", 0) or 0), int(getattr(usage, "output_tokens", 0) or 0)
    if isinstance(usage, dict):
        return int(usage.get("input_tokens", 0) or 0), int(usage.get("output_tokens", 0) or 0)
    return 0, 0


def _client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not configured")
    return OpenAI(api_key=api_key)


def _web_tools(use_web_search: bool) -> tuple[list[dict] | None, list[str] | None]:
    if not use_web_search:
        return None, None
    return [{"type": "web_search_preview"}], ["web_search_call.action.sources"]


def _extract_web_sources(raw: dict[str, Any]) -> list[str]:
    out: list[str] = []
    for item in raw.get("output", []):
        if item.get("type") != "web_search_call":
            continue
        action = item.get("action") or {}
        for src in action.get("sources", []) or []:
            url = src.get("url")
            if url:
                out.append(url)
    return sorted(set(out))


async def _execute_chat(
    *,
    endpoint: str,
    user: SupabaseUser,
    model: str,
    messages: list[dict[str, str]],
    use_web_search: bool,
    case_id: str | None = None,
    vector_search: bool = False,
    citations_required: bool = False,
) -> dict[str, Any]:
    enforce_rate_limit(user.id, endpoint)
    client = _client()
    tools, include = _web_tools(use_web_search)
    citations: list[dict[str, Any]] = []

    input_messages = [{"role": m.get("role", "user"), "content": m.get("content", "")} for m in messages]
    if vector_search and case_id:
        last_user = next((m.get("content", "") for m in reversed(messages) if m.get("role") == "user"), "")
        rows = await search_case_sections(case_id=case_id, query=last_user, match_count=8, tenant_id=user.tenant_id)
        if citations_required and not rows:
            raise HTTPException(status_code=400, detail="No grounded case context found. Upload/process documents first.")
        if rows:
            snippets = []
            for idx, row in enumerate(rows[:6], start=1):
                snippets.append(f"[C{idx}] {row.get('content', '')}")
                citations.append(
                    {
                        "id": f"C{idx}",
                        "doc_id": row.get("doc_id"),
                        "chunk_id": row.get("chunk_id"),
                        "chunk_index": row.get("chunk_index"),
                        "score": row.get("similarity"),
                        "metadata": row.get("metadata", {}),
                    }
                )
            grounding_prompt = (
                "Use only the provided case context for case-specific claims.\n"
                "When citing a grounded claim, include citation IDs like [C1], [C2].\n\n"
                "Grounded case context:\n"
                + "\n\n".join(snippets)
            )
            input_messages = [{"role": "system", "content": grounding_prompt}, *input_messages]

    try:
        response = client.responses.create(
            model=model,
            input=input_messages,
            tools=tools,
            include=include,
            metadata={"user_id": user.id, "tenant_id": user.tenant_id, "endpoint": endpoint, "case_id": case_id or ""},
        )
    except APIError as exc:
        status = getattr(exc, "status_code", None) or 500
        msg = str(exc)
        if "insufficient_quota" in msg or status == 429:
            msg = "OpenAI quota exceeded for this API key/project. Check billing and project limits."
        raise HTTPException(status_code=status, detail=f"Proxy error: {msg}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Proxy error: {exc}") from exc

    raw = response.model_dump() if hasattr(response, "model_dump") else {}
    output_text = _extract_text(response)
    in_tok, out_tok = _extract_usage(response)
    await log_llm_usage(
        tenant_id=user.tenant_id,
        user_id=user.id,
        case_id=case_id,
        endpoint=endpoint,
        model=model,
        input_tokens=in_tok,
        output_tokens=out_tok,
        metadata={"web_search": use_web_search, "vector_search": vector_search},
    )
    await log_ai_event(
        tenant_id=user.tenant_id,
        user_id=user.id,
        case_id=case_id,
        event_type=f"{endpoint}_response",
        metadata={"model": model, "input_tokens": in_tok, "output_tokens": out_tok},
    )

    return {
        "id": response.id,
        "model": model,
        "output_text": output_text,
        "sources": _extract_web_sources(raw),
        "citations": citations,
        "raw": raw,
    }


@router.post(
    "/freeform",
    summary="Freeform chat",
    description="General chat completion. Optional web search can be enabled via `use_web_search`.",
)
async def freeform_chat(payload: ChatProxyRequest, user: SupabaseUser = Depends(require_supabase_user)):
    return await _execute_chat(
        endpoint="chat_freeform",
        user=user,
        model=payload.model,
        messages=[{"role": m.role, "content": m.content} for m in payload.messages],
        use_web_search=payload.use_web_search,
        vector_search=False,
    )


@router.post(
    "/case/{case_id}",
    summary="Case-grounded chat",
    description=(
        "Chat grounded on indexed content for a specific case. "
        "Set `citations_required=true` to fail when grounded context is unavailable."
    ),
)
async def case_chat(case_id: str, payload: CaseChatRequest, user: SupabaseUser = Depends(require_supabase_user)):
    case_rows = await rest_select(
        "cases",
        f"id=eq.{case_id}&tenant_id=eq.{user.tenant_id}&select=id,name",
    )
    if not case_rows:
        raise HTTPException(status_code=404, detail="Case not found")
    return await _execute_chat(
        endpoint="chat_case",
        user=user,
        case_id=case_id,
        model=payload.model,
        messages=payload.messages,
        use_web_search=payload.use_web_search,
        vector_search=True,
        citations_required=payload.citations_required,
    )


@router.post(
    "/proxy",
    summary="Backward-compatible chat endpoint",
    description=(
        "Compatibility endpoint. If `case_id` is provided, behaves like case-grounded chat; "
        "otherwise behaves like freeform chat."
    ),
)
async def proxy_chat(payload: ChatProxyRequest, user: SupabaseUser = Depends(require_supabase_user)):
    # Backward-compatible endpoint. Uses case-grounded mode when case_id is provided.
    if payload.case_id:
        case_rows = await rest_select(
            "cases",
            f"id=eq.{payload.case_id}&tenant_id=eq.{user.tenant_id}&select=id",
        )
        if not case_rows:
            raise HTTPException(status_code=404, detail="Case not found")
        return await _execute_chat(
            endpoint="chat_case",
            user=user,
            case_id=payload.case_id,
            model=payload.model,
            messages=[{"role": m.role, "content": m.content} for m in payload.messages],
            use_web_search=payload.use_web_search,
            vector_search=payload.use_vector_search,
            citations_required=payload.citations_required,
        )
    return await _execute_chat(
        endpoint="chat_freeform",
        user=user,
        model=payload.model,
        messages=[{"role": m.role, "content": m.content} for m in payload.messages],
        use_web_search=payload.use_web_search,
        vector_search=False,
    )


@router.post(
    "/summary",
    summary="Generate case summary from payload",
    description="Generates a concise case summary from provided case metadata, contacts, and documents.",
)
async def summarize_case(payload: CaseSummaryRequest, user: SupabaseUser = Depends(require_supabase_user)):
    enforce_rate_limit(user.id, "chat_summary")
    system_prompt_default = (
        "You are a litigation case assistant. Create a concise, professional case brief with this structure exactly:\n"
        "Overview:\n- ...\n\nFacts So Far:\n- ...\n\nOpen Risks:\n- ...\n\nNext Actions:\n- ...\n"
        "Keep bullets short and practical."
    )
    system_prompt = await get_prompt_template("case_summary", system_prompt_default)

    docs = "\n".join(f"- {d.title} ({d.tag or 'document'})" for d in payload.documents) or "- No documents uploaded yet."
    contacts = ", ".join(payload.contacts) or "No contacts linked."
    current = payload.current_summary or "No existing summary."
    user_prompt = (
        f"Case: {payload.case_name}\nForum: {payload.forum or 'Not set'}\nStage: {payload.stage or 'Not set'}\n"
        f"Parties: {payload.parties or 'Not set'}\nContacts: {contacts}\n\nCurrent summary:\n{current}\n\nDocuments:\n{docs}"
    )

    response = await _execute_chat(
        endpoint="chat_summary",
        user=user,
        model=payload.model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        use_web_search=False,
        vector_search=False,
    )
    return {"summary": response["output_text"]}


@router.post(
    "/summary/{case_id}",
    summary="Generate case summary by case id",
    description="Loads case metadata/documents from DB and generates a concise case summary.",
)
async def summarize_case_from_case(case_id: str, user: SupabaseUser = Depends(require_supabase_user)):
    case_rows = await rest_select(
        "cases",
        f"id=eq.{case_id}&tenant_id=eq.{user.tenant_id}&select=id,name,forum,stage,parties,summary",
    )
    if not case_rows:
        raise HTTPException(status_code=404, detail="Case not found")
    case_item = case_rows[0]
    docs = await rest_select(
        "documents",
        f"case_id=eq.{case_id}&tenant_id=eq.{user.tenant_id}&select=title,doc_type",
    )
    payload = CaseSummaryRequest(
        case_name=case_item.get("name", ""),
        forum=case_item.get("forum", ""),
        stage=case_item.get("stage", ""),
        parties=case_item.get("parties", ""),
        current_summary=case_item.get("summary", ""),
        documents=[SummaryDocument(title=d.get("title", "Document"), tag=d.get("doc_type", "")) for d in docs],
    )
    return await summarize_case(payload, user)

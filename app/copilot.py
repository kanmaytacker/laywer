from __future__ import annotations

import os
import re
from datetime import datetime
from pathlib import Path
from tempfile import gettempdir
from typing import Any

from openai import OpenAI

from .services import extract_text
from .supabase_data import download_public_file

DATE_PATTERNS = [
    re.compile(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b"),
    re.compile(r"\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\b"),
    re.compile(r"\b[A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}\b"),
]


async def extract_documents(documents: list[dict[str, Any]], bucket: str = "case-documents") -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for doc in documents:
        path = doc.get("file_path", "")
        if not path:
            continue
        try:
            payload = await download_public_file(bucket, path)
            suffix = Path(path).suffix or ".bin"
            tmp_path = Path(gettempdir()) / f"md_extract_{doc.get('id', 'doc')}{suffix}"
            tmp_path.write_bytes(payload)
            text = extract_text(tmp_path)
            tmp_path.unlink(missing_ok=True)
        except Exception:
            text = ""
        out.append(
            {
                "id": doc.get("id"),
                "tenant_id": doc.get("tenant_id"),
                "case_id": doc.get("case_id"),
                "title": doc.get("title", "Document"),
                "doc_type": doc.get("doc_type", ""),
                "file_path": path,
                "text": text or "",
            }
        )
    return out


def split_into_pages(text: str, page_size: int = 3500) -> list[str]:
    safe = (text or "").strip()
    if not safe:
        return []
    pages: list[str] = []
    start = 0
    while start < len(safe):
        end = min(len(safe), start + page_size)
        pages.append(safe[start:end].strip())
        start = end
    return [p for p in pages if p]


def _llm_available() -> bool:
    return bool(os.getenv("OPENAI_API_KEY"))


def _call_llm(prompt: str, model: str = "gpt-4.1-mini") -> str:
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    response = client.responses.create(
        model=model,
        input=[
            {"role": "system", "content": "You are a legal drafting copilot for Indian litigation."},
            {"role": "user", "content": prompt},
        ],
    )
    text = getattr(response, "output_text", None)
    if text:
        return text
    return ""


def _all_text(extracted_docs: list[dict[str, Any]], max_chars: int = 12000) -> str:
    parts = []
    for doc in extracted_docs:
        snippet = (doc.get("text", "") or "").strip()
        if not snippet:
            continue
        parts.append(f"[{doc.get('title', 'Document')}]\n{snippet}")
    return "\n\n".join(parts)[:max_chars]


def build_brief(case_item: dict[str, Any], extracted_docs: list[dict[str, Any]]) -> str:
    combined = _all_text(extracted_docs)
    if _llm_available() and combined:
        prompt = (
            f"Case: {case_item.get('name', '')}\n"
            f"Forum: {case_item.get('forum', '')}\n"
            f"Stage: {case_item.get('stage', '')}\n"
            f"Parties: {case_item.get('parties', '')}\n\n"
            "Write a concise matter brief with headings:\n"
            "1) Facts Summary\n2) Party Positions\n3) Disputed Points\n4) Relief Sought\n\n"
            f"Documents:\n{combined}"
        )
        try:
            return _call_llm(prompt)
        except Exception:
            pass
    return (
        "Facts Summary\n"
        f"- Matter: {case_item.get('name', 'Untitled')}\n"
        f"- Forum: {case_item.get('forum', 'Not set')}\n\n"
        "Party Positions\n- To be refined based on uploaded records.\n\n"
        "Disputed Points\n- To be extracted from notices/orders.\n\n"
        "Relief Sought\n- Appropriate relief based on records and law."
    )


def build_chronology(extracted_docs: list[dict[str, Any]]) -> str:
    rows: list[str] = []
    for doc in extracted_docs:
        text = doc.get("text", "")
        title = doc.get("title", "Document")
        for pattern in DATE_PATTERNS:
            for m in pattern.finditer(text):
                snippet = text[max(0, m.start() - 80): m.end() + 120].replace("\n", " ")
                rows.append(f"- {m.group(0)}: {snippet} (Source: {title})")
    unique = []
    seen = set()
    for row in rows:
        key = row[:140]
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    body = "\n".join(unique[:30]) if unique else "- No explicit date events found."
    return f"Chronology\n{body}"


def build_issues(extracted_docs: list[dict[str, Any]]) -> str:
    keywords = ["penalty", "mismatch", "disallow", "non-compliance", "violation", "unexplained", "demand"]
    rows = []
    for doc in extracted_docs:
        text = (doc.get("text") or "").lower()
        title = doc.get("title", "Document")
        for kw in keywords:
            idx = text.find(kw)
            if idx >= 0:
                raw = doc.get("text", "")
                snippet = raw[max(0, idx - 70): idx + 160].replace("\n", " ")
                rows.append(f"- Issue: {kw.title()}\n  Evidence: {snippet}\n  Source: {title}")
    if not rows:
        return "Issue List\n- No issues auto-detected. Add manual issues."
    return "Issue List\n" + "\n".join(rows[:20])


def build_draft(case_item: dict[str, Any], issue_text: str) -> str:
    issues = [line.replace("- Issue: ", "") for line in issue_text.splitlines() if line.startswith("- Issue: ")]
    issues = issues[:8] if issues else ["Facts and legal interpretation based on records"]
    return (
        "Draft Reply / Written Submissions\n"
        f"In the matter of: {case_item.get('name', 'Untitled')}\n"
        f"Forum: {case_item.get('forum', 'Not set')}\n\n"
        "1. Preliminary submissions\n"
        "This response is filed based on available records and annexures.\n\n"
        "2. Brief facts\n"
        "Facts are set out in the chronology and brief.\n\n"
        "3. Issues\n"
        + "\n".join(f"- {issue}" for issue in issues)
        + "\n\n4. Prayer\nAppropriate relief may kindly be granted."
    )


def build_annexure_index(extracted_docs: list[dict[str, Any]]) -> str:
    lines = []
    for idx, doc in enumerate(extracted_docs, start=1):
        label = chr(64 + min(idx, 26))
        lines.append(f"- Annexure-{label}: {doc.get('title', 'Document')} ({doc.get('doc_type', 'document')})")
    return "Annexure Index\n" + ("\n".join(lines) if lines else "- No annexures available.")


def artifact_pack(case_item: dict[str, Any], extracted_docs: list[dict[str, Any]]) -> dict[str, str]:
    issues = build_issues(extracted_docs)
    return {
        "brief": build_brief(case_item, extracted_docs),
        "chronology": build_chronology(extracted_docs),
        "issues": issues,
        "draft": build_draft(case_item, issues),
        "annexure_index": build_annexure_index(extracted_docs),
        "generated_at": datetime.utcnow().isoformat(),
    }

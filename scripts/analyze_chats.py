#!/usr/bin/env python3
import argparse
import json
import re
from collections import Counter
from pathlib import Path
from typing import Dict, Any, List

TOPIC_KEYWORDS = {
    "contracts": ["contract", "agreement", "nda", "msa", "clause", "terms"],
    "compliance": ["compliance", "gdpr", "hipaa", "policy", "regulation"],
    "litigation": ["lawsuit", "litigation", "dispute", "motion", "court"],
    "employment": ["employment", "offer letter", "termination", "hr", "non-compete"],
    "ip": ["trademark", "patent", "copyright", "ip", "licensing"],
    "research": ["summarize", "research", "analyze", "compare", "explain"],
}


def classify_topics(text: str) -> List[str]:
    lower = text.lower()
    found = []
    for topic, keywords in TOPIC_KEYWORDS.items():
        if any(k in lower for k in keywords):
            found.append(topic)
    return found


def load_jsonl(path: Path) -> List[Dict[str, Any]]:
    rows = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def build_requirements(summary: Dict[str, Any]) -> str:
    top_topics = ", ".join([t for t, _ in summary["top_topics"][:5]]) or "general legal assistance"
    return f"""# Lawyer AI App - Draft Requirements

## Product goal
Build an AI assistant focused on legal workflows inferred from prior usage patterns.

## Target capabilities
1. Legal Q&A with citations and confidence levels.
2. Contract analysis (risk flags, clause extraction, suggested edits).
3. Matter workspace (store files, notes, chat history).
4. Drafting support for emails, notices, and legal templates.
5. Retrieval over prior matters and uploaded documents.

## Inferred priority topics
{top_topics}

## Functional requirements
1. Authentication and role-based access (admin, lawyer, assistant).
2. Secure document upload and parsing (PDF/DOCX/TXT).
3. Conversational assistant with context window over matter documents.
4. Source-grounded answers with citation snippets.
5. Red-flag detector for contract/legal risk language.
6. Export outputs to DOCX/PDF.
7. Audit log for prompts, outputs, and user actions.

## Non-functional requirements
1. Encryption at rest and in transit.
2. PII handling and data retention controls.
3. Prompt/output observability and moderation.
4. Latency target: <8s p95 for standard Q&A.
5. High availability with daily backup.

## Suggested MVP scope
1. Matter creation + document upload.
2. RAG chat over documents.
3. Contract risk checklist for top 3 contract types.
4. Basic drafting templates.
5. Admin dashboard for usage and logs.
"""


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True, help="Normalized JSONL")
    p.add_argument("--outdir", required=True, help="Output directory")
    args = p.parse_args()

    rows = load_jsonl(Path(args.input))

    total_conversations = len(rows)
    total_messages = 0
    user_messages = 0
    assistant_messages = 0
    topic_counter = Counter()
    word_counter = Counter()

    for conv in rows:
        for m in conv.get("messages", []):
            total_messages += 1
            role = m.get("author", "unknown")
            text = m.get("text", "")
            if role == "user":
                user_messages += 1
            elif role == "assistant":
                assistant_messages += 1

            for t in classify_topics(text):
                topic_counter[t] += 1

            for w in re.findall(r"[a-zA-Z]{4,}", text.lower()):
                if w not in {"this", "that", "with", "from", "have", "will", "your", "about"}:
                    word_counter[w] += 1

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    summary = {
        "total_conversations": total_conversations,
        "total_messages": total_messages,
        "user_messages": user_messages,
        "assistant_messages": assistant_messages,
        "top_topics": topic_counter.most_common(10),
        "top_keywords": word_counter.most_common(25),
    }

    summary_path = outdir / "summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    req_md = build_requirements(summary)
    req_path = outdir / "requirements_draft.md"
    req_path.write_text(req_md, encoding="utf-8")

    print(f"Wrote {summary_path}")
    print(f"Wrote {req_path}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
from typing import Dict, Any, List


def extract_messages(conv: Dict[str, Any]) -> List[Dict[str, Any]]:
    mapping = conv.get("mapping", {})
    out = []
    for _, node in mapping.items():
        msg = node.get("message")
        if not msg:
            continue
        author = (msg.get("author") or {}).get("role", "unknown")
        create_time = msg.get("create_time")
        content = msg.get("content") or {}
        parts = content.get("parts", [])
        text = "\n".join([p for p in parts if isinstance(p, str)]).strip()
        if not text:
            continue
        out.append(
            {
                "id": msg.get("id"),
                "author": author,
                "create_time": create_time,
                "text": text,
            }
        )
    out.sort(key=lambda x: (x["create_time"] is None, x["create_time"]))
    return out


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True, help="Path to conversations.json")
    p.add_argument("--output", required=True, help="Output JSONL")
    args = p.parse_args()

    in_path = Path(args.input)
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    conversations = json.loads(in_path.read_text(encoding="utf-8"))
    with out_path.open("w", encoding="utf-8") as f:
        for conv in conversations:
            row = {
                "conversation_id": conv.get("id"),
                "title": conv.get("title", ""),
                "create_time": conv.get("create_time"),
                "update_time": conv.get("update_time"),
                "messages": extract_messages(conv),
            }
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    print(f"Wrote normalized chats to {out_path}")


if __name__ == "__main__":
    main()

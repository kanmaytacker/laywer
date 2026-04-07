from __future__ import annotations

import json
from datetime import datetime


def log_json(event: str, **kwargs) -> None:
    payload = {"ts": datetime.utcnow().isoformat(), "event": event, **kwargs}
    print(json.dumps(payload, ensure_ascii=True), flush=True)

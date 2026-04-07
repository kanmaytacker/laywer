from __future__ import annotations

import os

from openai import OpenAI

from . import settings  # noqa: F401


def get_openai_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    print(api_key)
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    return OpenAI(api_key=api_key)

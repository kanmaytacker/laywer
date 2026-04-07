from __future__ import annotations

from typing import Any

from .supabase_client import get_supabase_client


def _apply_query(builder, query: str):
    parts = [part for part in query.split("&") if part]
    for part in parts:
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        if key == "select":
            continue
        if key == "order":
            if "." in value:
                field, direction = value.rsplit(".", 1)
                builder = builder.order(field, desc=(direction.lower() == "desc"))
            else:
                builder = builder.order(value)
            continue
        if key == "limit":
            try:
                builder = builder.limit(int(value))
            except Exception:
                pass
            continue
        if value.startswith("eq."):
            builder = builder.eq(key, value[3:])
            continue
        if value.startswith("in.(") and value.endswith(")"):
            raw = value[4:-1]
            items = [item.strip() for item in raw.split(",") if item.strip()]
            builder = builder.in_(key, items)
            continue
    return builder


def _parse_select(query: str) -> str:
    for part in query.split("&"):
        if part.startswith("select="):
            return part[len("select="):] or "*"
    return "*"


async def rest_select(table: str, query: str, schema: str = "public") -> list[dict[str, Any]]:
    client = get_supabase_client(service_role=True)
    builder = client.schema(schema).table(table).select(_parse_select(query))
    builder = _apply_query(builder, query)
    response = builder.execute()
    return response.data or []


def _apply_where(builder, where: str):
    parts = [part for part in where.split("&") if part]
    for part in parts:
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        if value.startswith("eq."):
            builder = builder.eq(key, value[3:])
        elif value.startswith("in.(") and value.endswith(")"):
            raw = value[4:-1]
            items = [item.strip() for item in raw.split(",") if item.strip()]
            builder = builder.in_(key, items)
    return builder


async def rest_insert(table: str, payload: Any, schema: str = "public") -> list[dict[str, Any]]:
    client = get_supabase_client(service_role=True)
    response = client.schema(schema).table(table).insert(payload).execute()
    return response.data or []


async def rest_patch(table: str, where: str, payload: dict[str, Any], schema: str = "public") -> list[dict[str, Any]]:
    client = get_supabase_client(service_role=True)
    builder = client.schema(schema).table(table).update(payload)
    builder = _apply_where(builder, where)
    response = builder.execute()
    return response.data or []


async def rest_delete(table: str, where: str, schema: str = "public") -> None:
    client = get_supabase_client(service_role=True)
    builder = client.schema(schema).table(table).delete()
    builder = _apply_where(builder, where)
    builder.execute()


def public_storage_url(bucket: str, path: str) -> str:
    client = get_supabase_client(service_role=True)
    return client.storage.from_(bucket).get_public_url(path)


def signed_storage_url(bucket: str, path: str, expires_in: int = 3600) -> str:
    client = get_supabase_client(service_role=True)
    payload = client.storage.from_(bucket).create_signed_url(path, expires_in)
    if isinstance(payload, dict):
        signed = payload.get("signedURL") or payload.get("signedUrl") or payload.get("signed_url")
        if signed:
            if signed.startswith("http://") or signed.startswith("https://"):
                return signed
            supabase_url = client.supabase_url.rstrip("/")
            return f"{supabase_url}/storage/v1{signed}" if signed.startswith("/") else f"{supabase_url}/storage/v1/{signed}"
    raise RuntimeError("Could not generate signed storage URL")


async def download_public_file(bucket: str, path: str) -> bytes:
    client = get_supabase_client(service_role=True)
    payload = client.storage.from_(bucket).download(path)
    if payload is None:
        raise RuntimeError("Download returned empty payload")
    return payload


async def upload_file(bucket: str, path: str, payload: bytes, content_type: str = "application/octet-stream") -> dict[str, Any]:
    client = get_supabase_client(service_role=True)
    client.storage.from_(bucket).upload(
        path=path,
        file=payload,
        file_options={"content-type": content_type, "upsert": "true"},
    )
    return {"path": path, "url": signed_storage_url(bucket, path, expires_in=3600)}

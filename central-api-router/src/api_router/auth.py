"""API-key auth — fail-closed (no keys configured -> reject everything)."""

from __future__ import annotations

import os

from fastapi import Header, HTTPException, status


def _keys() -> set[str]:
    raw = os.environ.get("GATEWAY_API_KEYS") or os.environ.get("GATEWAY_API_KEY", "")
    return {k.strip() for k in raw.split(",") if k.strip()}


async def require_api_key(x_api_key: str | None = Header(default=None)) -> str:
    keys = _keys()
    if not keys:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "no gateway API keys configured")
    if x_api_key is None or x_api_key not in keys:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or missing API key")
    return x_api_key

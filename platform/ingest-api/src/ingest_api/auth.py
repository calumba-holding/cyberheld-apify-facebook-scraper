"""API-key auth. Keys come from INGEST_API_KEYS (comma-separated) or INGEST_API_KEY.

Fail-closed: if no keys are configured the API rejects everything rather than
running open.
"""

from __future__ import annotations

import os

from fastapi import Header, HTTPException, status


def _valid_keys() -> set[str]:
    raw = os.environ.get("INGEST_API_KEYS") or os.environ.get("INGEST_API_KEY", "")
    return {k.strip() for k in raw.split(",") if k.strip()}


async def require_api_key(x_api_key: str | None = Header(default=None)) -> str:
    keys = _valid_keys()
    if not keys:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "no ingest API keys configured"
        )
    if x_api_key is None or x_api_key not in keys:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or missing API key")
    return x_api_key

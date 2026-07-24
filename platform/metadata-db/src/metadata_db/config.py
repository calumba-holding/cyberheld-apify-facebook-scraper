"""Connection configuration — DSN from the environment."""

from __future__ import annotations

import os

DEFAULT_DSN = "postgresql+psycopg://postgres:dev@localhost:55432/evidence"


def database_url() -> str:
    """Return the SQLAlchemy DSN.

    Reads ``DATABASE_URL`` if set; otherwise the local dev default (the
    docker-compose Postgres). Normalises a bare ``postgresql://`` URL to the
    psycopg (v3) driver so both forms work.
    """
    url = os.environ.get("DATABASE_URL", DEFAULT_DSN)
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url

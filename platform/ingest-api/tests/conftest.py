from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from metadata_db.engine import make_engine, ping, reset_schema

from ingest_api import create_app

API_KEY = "test-key-123"


@pytest.fixture(scope="session")
def _engine():
    eng = make_engine()
    if not ping(eng):
        pytest.skip("Postgres not reachable (docker compose up in platform/metadata-db)")
    return eng


@pytest.fixture()
def client(_engine, monkeypatch):
    reset_schema(_engine)
    monkeypatch.setenv("INGEST_API_KEY", API_KEY)
    return TestClient(create_app())


@pytest.fixture()
def auth():
    return {"X-API-Key": API_KEY}

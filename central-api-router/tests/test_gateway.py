"""Central API router tests — no DB, no scraper; pure gateway + routing."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from api_router import create_app
from api_router.routes import CAPTURE_ROUTES, ENRICH_ROUTES

API_KEY = "test-key"


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("GATEWAY_API_KEY", API_KEY)
    return TestClient(create_app())


@pytest.fixture()
def auth():
    return {"X-API-Key": API_KEY}


def test_health_open(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_auth_required(client):
    assert client.post("/v1/fb/post", json={"target_url": "x"}).status_code == 401


def test_capture_routes_return_202_and_route_to_browser(client, auth):
    for path, job_type in CAPTURE_ROUTES.items():
        r = client.post(f"/v1{path}", headers=auth, json={"target_url": "https://x/y"})
        assert r.status_code == 202, path
        body = r.json()
        assert body["job_type"] == job_type
        assert body["routed_to"] == "browser" and body["pool"] == "pool.browser"
        uuid.UUID(body["job_id"]); uuid.UUID(body["case_id"])


def test_device_hint_routes_to_device_pool(client, auth):
    r = client.post("/v1/ig/post", headers=auth,
                    json={"target_url": "https://ig/p/1", "device": True})
    assert r.json()["routed_to"] == "device" and r.json()["pool"] == "pool.device"


def test_enrich_routes_to_connector(client, auth):
    for path, job_type in ENRICH_ROUTES.items():
        r = client.post(f"/v1{path}", headers=auth, json={"value": "a@b.com"})
        assert r.status_code == 202
        assert r.json()["routed_to"] == "connector"


def test_job_status_has_trace(client, auth):
    jid = client.post("/v1/fb/post", headers=auth, json={"target_url": "https://x"}).json()["job_id"]
    s = client.get(f"/v1/jobs/{jid}", headers=auth)
    assert s.status_code == 200
    events = [t["event"] for t in s.json()["trace"]]
    assert any("ingested" in e for e in events)
    assert any("routed to 'browser'" in e for e in events)
    assert any("handed off" in e for e in events)   # stub, no worker run


def test_case_reuse(client, auth):
    first = client.post("/v1/ig/profile", headers=auth, json={"target_url": "https://ig/x"}).json()
    second = client.post("/v1/ig/post", headers=auth,
                         json={"target_url": "https://ig/x/p/1", "case_id": first["case_id"]}).json()
    assert second["case_id"] == first["case_id"]


def test_unknown_case_rejected(client, auth):
    r = client.post("/v1/fb/post", headers=auth,
                    json={"target_url": "https://x", "case_id": "not-a-real-case"})
    assert r.status_code == 400


def test_capabilities_map_is_the_whole_architecture(client, auth):
    d = client.get("/v1/capabilities", headers=auth).json()
    ids = {c["id"] for c in d["capabilities"]}
    # the full board is represented as routable capabilities
    assert {"gateway", "workflow", "router", "session_pool", "browser", "device",
            "watch", "processing", "connector", "sealing", "object_store",
            "metadata_db", "evidence_package", "triage", "notify"} <= ids
    assert d["entry"] == "gateway"

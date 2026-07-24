"""Ingest API tests (#36) — against a real Postgres via the metadata_db engine."""

from __future__ import annotations

import uuid

from ingest_api.routes import CAPTURE_ROUTES, ENRICH_ROUTES


def test_health_needs_no_auth(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_capture_requires_api_key(client):
    r = client.post("/fb/post", json={"target_url": "https://fb.com/x"})
    assert r.status_code == 401


def test_capture_returns_202_and_creates_job(client, auth):
    r = client.post("/fb/post", headers=auth, json={"target_url": "https://fb.com/x"})
    assert r.status_code == 202
    body = r.json()
    assert body["status"] == "queued"
    assert body["job_type"] == "fb/post"
    uuid.UUID(body["job_id"])  # valid uuid
    uuid.UUID(body["case_id"])

    # status endpoint reflects it
    s = client.get(f"/jobs/{body['job_id']}", headers=auth)
    assert s.status_code == 200
    assert s.json()["job_type"] == "fb/post"
    assert s.json()["status"] == "queued"
    assert s.json()["target_url"] == "https://fb.com/x"


def test_all_capture_routes_registered(client, auth):
    for path, job_type in CAPTURE_ROUTES.items():
        r = client.post(path, headers=auth, json={"target_url": "https://x/y"})
        assert r.status_code == 202, path
        assert r.json()["job_type"] == job_type


def test_enrich_routes(client, auth):
    for path, job_type in ENRICH_ROUTES.items():
        r = client.post(path, headers=auth, json={"value": "a@b.com"})
        assert r.status_code == 202, path
        assert r.json()["job_type"] == job_type


def test_reuse_existing_case(client, auth):
    first = client.post("/ig/profile", headers=auth, json={"target_url": "https://ig/x"}).json()
    second = client.post(
        "/ig/post", headers=auth,
        json={"target_url": "https://ig/x/p/1", "case_id": first["case_id"]},
    ).json()
    assert second["case_id"] == first["case_id"]
    assert second["job_id"] != first["job_id"]


def test_job_not_found(client, auth):
    r = client.get(f"/jobs/{uuid.uuid4()}", headers=auth)
    assert r.status_code == 404


def test_invalid_job_id(client, auth):
    r = client.get("/jobs/not-a-uuid", headers=auth)
    assert r.status_code == 400


def test_invalid_case_id_rejected(client, auth):
    r = client.post(
        "/fb/post", headers=auth,
        json={"target_url": "https://fb.com/x", "case_id": "not-a-uuid"},
    )
    assert r.status_code == 400

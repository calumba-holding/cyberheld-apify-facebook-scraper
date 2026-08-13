"""Central API tests."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api_router import create_app
from api_router.models import JobRecord
from api_router.orchestrator import DockerWorkerOrchestrator
from api_router.services import SERVICES
from api_router.store import JobStore


class FakeOrchestrator:
    def __init__(self, store):
        self.store = store

    def sessions(self):
        return []

    def reconcile_watch_jobs(self):
        return None

    def reconcile_running_jobs(self):
        return None

    def reconcile_partial_reasons(self):
        return None

    def reconcile_legacy_partial_jobs(self):
        for job in self.store.list():
            if job.status == "partial":
                self.store.update(job.job_id, status="succeeded")

    def job_logs(self, job_id, tail=200):
        if self.store.get(job_id) is None:
            raise KeyError(job_id)
        return {"job_id": job_id, "container": "fb-job-test", "running": True, "exit_code": None, "logs": "hello"}

    def create_job(self, payload):
        record = JobRecord(
            job_id="job-1", status="needs_authentication", target_url=str(payload.target_url),
            platform=payload.platform or payload.detected_platform(),
            scraper=payload.scraper, continue_watching=payload.continue_watching, worker=1,
            max_posts=payload.max_posts, poll_interval_seconds=payload.poll_interval_seconds,
            created_at="2026-08-11T00:00:00+00:00", updated_at="2026-08-11T00:00:00+00:00",
            login_url="http://localhost:6081/vnc.html",
        )
        return self.store.create(record)

    async def authentication_complete(self, job_id):
        return self.store.update(job_id, status="queued", login_url=None)

    async def stop_watch(self, job_id):
        return self.store.update(job_id, status="succeeded", watch_id=None)

    async def cancel_job(self, job_id):
        job = self.store.get(job_id)
        if job is None:
            raise KeyError(job_id)
        return self.store.update(job_id, status="cancelled", error="Cancelled by operator")

    async def restart_job(self, job_id):
        job = self.store.get(job_id)
        if job is None:
            raise KeyError(job_id)
        if job.status not in {"failed", "cancelled"}:
            raise RuntimeError(f"job is {job.status}; only failed or cancelled jobs can be resumed")
        return self.store.update(job_id, status="queued", error=None)

    def create_worker(self, label=None):
        return self.store.create_worker(label)

    async def start_worker_authentication(self, worker, platform="facebook"):
        return {"worker": worker, "platform": platform, "status": "authentication_started", "live_url": f"http://127.0.0.1:{6080 + worker}/vnc.html"}

    async def finish_worker_authentication(self, worker, platform="facebook"):
        return {"worker": worker, "platform": platform, "authenticated": False, "status": "login_required", "live_url": f"http://127.0.0.1:{6080 + worker}/vnc.html"}


@pytest.fixture()
def client(tmp_path):
    store = JobStore(tmp_path)
    return TestClient(create_app(store=store, orchestrator=FakeOrchestrator(store)))


def test_health(client):
    assert client.get("/health").json() == {"status": "ok", "jobs": 0, "sessions": 0}


def test_root_lists_exactly_the_four_services(client):
    routes = client.get("/").json()["routes"]
    paths = {r["path"] for r in routes}
    assert paths == {"/facebook/watch", "/facebook/screenshot", "/instagram/screenshot", "/facebook/comments"}
    # each carries its docker container (the diagram)
    containers = {r["path"]: r["docker_container"] for r in routes}
    assert containers["/facebook/watch"] == "watch-posting"
    assert containers["/facebook/comments"] == "comments-scraper"


def test_each_route_forwards_to_its_scraper_service(client):
    # no scraper service is running -> gateway forwards and returns 502 (it does not scrape)
    for svc in SERVICES:
        r = client.post(svc.route, json={"target_url": "https://x"})
        assert r.status_code == 502, svc.route
        body = r.json()
        assert body["error"] == "scraper_unavailable"
        assert body["service"] == svc.name


def test_session_sub_api_present(client):
    d = client.get("/").json()
    s = d["session_sub_api"]
    assert s["service"] == "API Chrome Sessions"
    assert s["docker_container"] == "chrome-sessions"
    assert "lease" in s["used_by"] or "scraper" in s["used_by"]
    # it is a sub-API, not a gateway route
    assert client.post("/sessions", json={}).status_code == 404


def test_job_lifecycle_and_result_pending(client):
    created = client.post("/v1/jobs", json={
        "target_url": "https://www.facebook.com/example/posts/1",
        "scraper": "post-engagement",
        "continue_watching": True,
    })
    assert created.status_code == 202
    assert created.json()["status"] == "needs_authentication"
    assert created.json()["login_url"].endswith("/vnc.html")

    jobs = client.get("/v1/jobs").json()["jobs"]
    assert len(jobs) == 1
    assert client.get("/v1/jobs/job-1").status_code == 200
    assert client.get("/v1/jobs/job-1/result").status_code == 409


def test_rejects_non_facebook_job_urls(client):
    response = client.post("/v1/jobs", json={"target_url": "https://example.com/post"})
    assert response.status_code == 422


@pytest.mark.parametrize(
    ("action", "scraper", "continue_watching"),
    [
        ("scrape", "post-engagement", False),
        ("watch", "post-engagement", True),
        ("profile", "profile-scraper", False),
    ],
)
def test_action_maps_to_job_contract(client, action, scraper, continue_watching):
    response = client.post("/v1/jobs", json={
        "target_url": (
            "https://www.facebook.com/example"
            if action == "profile"
            else "https://www.facebook.com/example/posts/1"
        ),
        "action": action,
        "worker": {"scrape": 1, "watch": 2, "profile": 3}[action],
    })
    assert response.status_code == 202
    body = response.json()
    assert body["action"] == action
    assert body["scraper"] == scraper
    assert body["continue_watching"] is continue_watching


def test_reel_is_classified_and_uses_post_engagement(client):
    response = client.post("/v1/jobs", json={
        "target_url": "https://www.facebook.com/reel/1324727872632161",
        "worker": 4,
    })
    assert response.status_code == 202
    body = response.json()
    assert body["content_type"] == "reel"
    assert body["selected_scraper"] == "reel-engagement"


@pytest.mark.parametrize(("url", "content_type", "scraper"), [
    ("https://www.instagram.com/p/ABC123/", "post", "post-engagement"),
    ("https://www.instagram.com/reel/ABC123/", "reel", "post-engagement"),
    ("https://www.instagram.com/tv/ABC123/", "reel", "post-engagement"),
    ("https://www.instagram.com/example.profile/", "profile", "profile-scraper"),
])
def test_instagram_urls_are_classified(client, url, content_type, scraper):
    response = client.post("/v1/jobs", json={"target_url": url, "worker": 4})

    assert response.status_code == 202
    body = response.json()
    assert body["platform"] == "instagram"
    assert body["content_type"] == content_type
    assert body["selected_scraper"] == scraper


def test_instagram_watch_is_rejected(client):
    response = client.post("/v1/jobs", json={
        "target_url": "https://www.instagram.com/p/ABC123/",
        "action": "watch",
        "worker": 4,
    })

    assert response.status_code == 422


def test_active_job_can_be_cancelled(client):
    created = client.post("/v1/jobs", json={
        "target_url": "https://www.facebook.com/example/posts/1",
        "worker": 5,
    }).json()
    response = client.post(f"/v1/jobs/{created['job_id']}/cancel")
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"


def test_cancelled_job_can_be_resumed(client):
    created = client.post("/v1/jobs", json={
        "target_url": "https://www.facebook.com/example/posts/1",
        "worker": 5,
    }).json()
    client.post(f"/v1/jobs/{created['job_id']}/cancel")

    response = client.post(f"/v1/jobs/{created['job_id']}/restart")

    assert response.status_code == 202
    assert response.json()["status"] == "queued"


def test_legacy_partial_job_is_exposed_as_succeeded(client):
    created = client.post("/v1/jobs", json={
        "target_url": "https://www.facebook.com/example/posts/1",
        "worker": 1,
    }).json()
    client.app.state.job_store.update(created["job_id"], status="partial")

    response = client.get(f"/v1/jobs/{created['job_id']}")

    assert response.status_code == 200
    assert response.json()["status"] == "succeeded"
    assert "accept_partial" not in response.json()["next_actions"]


def test_dynamic_worker_can_be_added(client):
    response = client.post("/v1/workers", json={"label": "Worker Six"})
    assert response.status_code == 201
    assert response.json()["worker"] == 6
    assert response.json()["novnc_port"] == 6086


def test_dynamic_worker_uses_available_compose_cli(tmp_path):
    store = JobStore(tmp_path / "store")
    store.create_worker("Worker Six")
    orchestrator = DockerWorkerOrchestrator(tmp_path, store)
    orchestrator.compose_command = ["docker-compose"]
    command = orchestrator._dynamic_worker_command(6, "fb-worker-auth-6", detach=True)

    assert command[:3] == ["docker-compose", "run", "-d"]
    assert "fb-worker-auth-6" in command
    assert "6086:6080" in command
    assert any(value.endswith(":/data/dynamic-profiles") for value in command)
    assert "SCRAPE_PROFILE_ROOT_DIR=/data/dynamic-profiles" in command
    assert command[0] != "docker"


def test_result_summary_and_download(client):
    created = client.post("/v1/jobs", json={
        "target_url": "https://www.facebook.com/example/posts/1",
        "worker": 1,
    }).json()
    store = client.app.state.job_store
    result = {
        "summary": {"succeeded": 1, "partial": 0, "failed": 0},
        "artifacts": {"video": {"present": False}},
        "results": [{
            "completeness": {"commentsExtracted": True, "postReactionsExtracted": True},
            "post": {
                "url": "https://www.facebook.com/example/posts/1",
                "reactionSummary": {"total": 2},
                "reactions": [
                    {"name": "A", "reaction": "Like", "profile_url": "https://facebook.com/a"},
                    {"name": "B", "reaction": "Love", "profile_url": "https://facebook.com/b"},
                ],
            },
            "comments": [{"id": "1"}],
        }],
    }
    result_path = store.save_result(created["job_id"], result)
    store.update(created["job_id"], status="succeeded", result_path=str(result_path))

    summary = client.get(f"/v1/jobs/{created['job_id']}/result/summary")
    assert summary.status_code == 200
    assert summary.json()["comments"] == 1
    assert summary.json()["reaction_types"] == {"Like": 1, "Love": 1}

    download = client.get(f"/v1/jobs/{created['job_id']}/result/download")
    assert download.status_code == 200
    assert "attachment" in download.headers["content-disposition"]

    logs = client.get(f"/v1/jobs/{created['job_id']}/logs?tail=50")
    assert logs.status_code == 200
    assert logs.json()["logs"] == "hello"

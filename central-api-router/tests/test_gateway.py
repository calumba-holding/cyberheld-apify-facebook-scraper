"""API Gateway tests — exactly the diagram: 4 routes -> 4 scraper services, no more."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api_router import create_app
from api_router.services import SERVICES


@pytest.fixture()
def client():
    return TestClient(create_app())


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


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


def test_removed_endpoints_are_gone(client):
    # the old capture/enrich/jobs/capabilities sprawl must be absent
    for path in ["/v1/fb/post", "/fb/post", "/v1/enrich/domain", "/v1/jobs",
                 "/v1/capabilities", "/jobs"]:
        assert client.post(path, json={}).status_code == 404, path
        assert client.get(path).status_code == 404, path

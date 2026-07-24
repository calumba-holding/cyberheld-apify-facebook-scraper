"""Notify tests (#42). Offline via injected transports; real Postgres."""

from __future__ import annotations

import pytest
from sqlalchemy import func, select

from metadata_db.engine import make_engine, make_session_factory, ping
from metadata_db.engine import reset_schema as reset_metadata
from metadata_db.models import MediaAsset
from metadata_db.repository import Repository

from notify import (
    DeliveryError,
    EmailChannel,
    McpCallbackChannel,
    NotifyService,
    WebhookChannel,
    build_notification,
)
from notify.engine import migrate_down as notify_down
from notify.engine import migrate_up as notify_up
from notify.models import Notification


@pytest.fixture()
def sealed_job():
    eng = make_engine()
    if not ping(eng):
        pytest.skip("Postgres not reachable")
    notify_down(eng)      # drop notifications first (FKs jobs)
    reset_metadata(eng)
    notify_up(eng)
    with make_session_factory(eng)() as s:
        repo = Repository(s)
        case = repo.open_case(external_ref="CASE-NOTIFY")
        job = repo.create_job(case.id, "fb/post", "https://fb.com/x")
        for i in range(3):  # 3 sealed captures
            a = repo.add_media_asset(job.id, kind="screenshot", object_key=f"{job.id}/s{i}.png")
            repo.mark_asset_sealed(a.id)
        s.commit()
        return {"engine": eng, "job_id": job.id}


def _session(eng):
    return make_session_factory(eng)()


def test_build_notification_counts_sealed(sealed_job):
    with _session(sealed_job["engine"]) as s:
        note = build_notification(s, sealed_job["job_id"])
    assert note["sealed_captures"] == 3
    assert note["message"] == "job done, 3 captures sealed"


def test_all_channels_delivered_and_recorded(sealed_job):
    eng, job_id = sealed_job["engine"], sealed_job["job_id"]
    webhook_calls, mcp_calls, emails = [], [], []
    channels = [
        WebhookChannel("https://hook/x", transport=lambda u, p: webhook_calls.append((u, p))),
        McpCallbackChannel("https://mcp/x", transport=lambda u, p: mcp_calls.append((u, p))),
        EmailChannel("a@b.com", transport=lambda to, subj, body: emails.append((to, subj))),
    ]
    with _session(eng) as s:
        note = build_notification(s, job_id)
        results = NotifyService().notify(s, note, channels)
        s.commit()

    assert all(r.delivered for r in results)
    assert webhook_calls and mcp_calls and emails
    assert mcp_calls[0][1]["type"] == "mcp_callback"   # MCP-shaped envelope
    with _session(eng) as s:
        n = s.execute(select(func.count()).select_from(Notification)).scalar_one()
        assert n == 3


def test_retry_then_success(sealed_job):
    eng, job_id = sealed_job["engine"], sealed_job["job_id"]
    calls = {"n": 0}

    def flaky(url, payload):
        calls["n"] += 1
        if calls["n"] < 3:
            raise DeliveryError("temporary")

    with _session(eng) as s:
        note = build_notification(s, job_id)
        results = NotifyService(attempts=3).notify(s, note, [WebhookChannel("u", transport=flaky)])
        s.commit()

    assert results[0].delivered is True
    assert results[0].attempts == 3


def test_failure_is_recorded_never_raised(sealed_job):
    eng, job_id = sealed_job["engine"], sealed_job["job_id"]

    def always_fail(url, payload):
        raise DeliveryError("down")

    with _session(eng) as s:
        note = build_notification(s, job_id)
        results = NotifyService(attempts=2).notify(s, note, [WebhookChannel("u", transport=always_fail)])
        s.commit()  # no exception propagated

    assert results[0].delivered is False
    assert results[0].attempts == 2
    with _session(eng) as s:
        row = s.execute(select(Notification)).scalars().one()
        assert row.delivered is False and row.error == "down"


def test_notify_does_not_touch_sealed_evidence(sealed_job):
    eng, job_id = sealed_job["engine"], sealed_job["job_id"]
    with _session(eng) as s:
        before = s.execute(select(func.count()).select_from(MediaAsset)).scalar_one()
        note = build_notification(s, job_id)
        NotifyService().notify(s, note, [WebhookChannel("u", transport=lambda u, p: None)])
        s.commit()
    with _session(eng) as s:
        after = s.execute(select(func.count()).select_from(MediaAsset)).scalar_one()
    assert before == after == 3  # sealed assets untouched

from __future__ import annotations

import asyncio

from api_router.models import JobRecord
from api_router.orchestrator import DockerWorkerOrchestrator
from api_router.store import JobStore


def running_job(job_id="race-job"):
    return JobRecord(
        job_id=job_id,
        status="running",
        target_url="https://www.facebook.com/example/posts/1",
        scraper="post-engagement",
        continue_watching=False,
        worker=1,
        max_posts=20,
        poll_interval_seconds=90,
        created_at="2026-08-12T00:00:00+00:00",
        updated_at="2026-08-12T00:00:00+00:00",
    )


def test_reconcile_skips_live_local_executor(tmp_path):
    store = JobStore(tmp_path)
    job = store.create(running_job())
    orchestrator = DockerWorkerOrchestrator(tmp_path, store)
    loop = asyncio.new_event_loop()
    task = loop.create_future()
    orchestrator._tasks[job.job_id] = task

    orchestrator.reconcile_running_jobs()

    assert store.get(job.job_id).status == "running"
    task.cancel()
    loop.close()


def test_reconcile_prefers_persisted_result_when_container_missing(tmp_path):
    store = JobStore(tmp_path)
    job = store.create(running_job("persisted-job"))
    store.save_result(job.job_id, {
        "summary": {"succeeded": 1, "partial": 0, "failed": 0},
        "results": [],
    })
    orchestrator = DockerWorkerOrchestrator(tmp_path, store)

    orchestrator.reconcile_running_jobs()

    updated = store.get(job.job_id)
    assert updated.status == "succeeded"
    assert updated.error is None
    assert updated.result_path.endswith("result.json")


def test_restart_archives_stale_result_before_new_attempt(tmp_path):
    store = JobStore(tmp_path)
    failed = running_job("restart-with-result")
    failed = failed.model_copy(update={"status": "failed", "error": "old attempt failed"})
    store.create(failed)
    store.save_result(failed.job_id, {
        "summary": {"succeeded": 1, "partial": 0, "failed": 0},
        "results": [],
    })
    orchestrator = DockerWorkerOrchestrator(tmp_path, store)
    orchestrator.is_authenticated = lambda worker, platform="facebook": (True, None)
    orchestrator._remove_container_if_present = lambda name: asyncio.sleep(0)

    updated = asyncio.run(orchestrator.restart_job(failed.job_id))

    assert updated.status == "queued"
    assert store.load_result(failed.job_id) is None
    assert len(list((tmp_path / "jobs" / failed.job_id / "attempts").glob("result-*.json"))) == 1
    task = orchestrator._tasks.pop(failed.job_id)
    task.cancel()
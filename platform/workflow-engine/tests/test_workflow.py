"""End-to-end workflow test (#37).

Runs the real CaptureWorkflow + activities against an ephemeral local Temporal
server and a real Postgres, and asserts the custody log was journaled in order and
the job was sealed. Skipped if Postgres is unreachable.
"""

from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from metadata_db.engine import make_engine, make_session_factory, ping, reset_schema
from metadata_db.models import Job
from metadata_db.repository import Repository

from workflow_engine.activities import ALL_ACTIVITIES
from workflow_engine.workflows import CaptureWorkflow


@pytest.fixture()
def job_id():
    eng = make_engine()
    if not ping(eng):
        pytest.skip("Postgres not reachable (docker compose up in platform/metadata-db)")
    reset_schema(eng)
    with make_session_factory(eng)() as s:
        repo = Repository(s)
        case = repo.open_case(external_ref="CASE-WF")
        job = repo.create_job(case.id, "fb/post", "https://fb.com/x")
        s.commit()
        return str(job.id)


async def test_capture_workflow_journals_and_seals(job_id, tmp_path, monkeypatch):
    monkeypatch.setenv("EVIDENCE_STORAGE_DIR", str(tmp_path / "worm"))

    async with await WorkflowEnvironment.start_local() as env:
        async with Worker(
            env.client,
            task_queue="capture",
            workflows=[CaptureWorkflow],
            activities=ALL_ACTIVITIES,
            activity_executor=ThreadPoolExecutor(max_workers=4),
        ):
            result = await env.client.execute_workflow(
                CaptureWorkflow.run,
                {"job_id": job_id, "job_type": "fb/post", "target_url": "https://fb.com/x"},
                id=f"capture-{job_id}",
                task_queue="capture",
            )

    assert result["status"] == "succeeded"
    assert result["object_keys"]

    # The custody log in Postgres reflects the journaled steps, in order.
    with make_session_factory(make_engine())() as s:
        job = s.get(Job, uuid.UUID(job_id))
        assert job.status == "succeeded"
        steps = [(st.step_index, st.name, st.state) for st in Repository(s).custody_log(uuid.UUID(job_id))]

    assert steps == [
        (1, "launch", "succeeded"),
        (2, "capture", "succeeded"),
        (3, "seal", "succeeded"),
    ]

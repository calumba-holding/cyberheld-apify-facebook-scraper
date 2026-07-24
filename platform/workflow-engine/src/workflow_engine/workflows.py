"""Temporal workflow (#37) — one workflow per job.

The workflow orchestrates the custody-journaled steps. It contains no IO and no
wall-clock reads (determinism); everything real happens in activities. The step
sequence here is the durable record — Temporal persists it and resumes mid-way on
crash, which is exactly what makes the execution journal a chain of custody.
"""

from __future__ import annotations

from datetime import timedelta

from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from .activities import (
        mark_running,
        record_step_finish,
        record_step_start,
        run_capture,
        seal_bundle,
    )

_OPTS = {"start_to_close_timeout": timedelta(seconds=60)}


@workflow.defn
class CaptureWorkflow:
    @workflow.run
    async def run(self, job: dict) -> dict:
        job_id = job["job_id"]

        # Step 1 — launch
        await workflow.execute_activity(record_step_start, args=[job_id, 1, "launch", None], **_OPTS)
        await workflow.execute_activity(mark_running, args=[job_id], **_OPTS)
        await workflow.execute_activity(record_step_finish, args=[job_id, 1, "succeeded", None], **_OPTS)

        # Step 2 — capture
        await workflow.execute_activity(record_step_start, args=[job_id, 2, "capture", None], **_OPTS)
        artifacts = await workflow.execute_activity(run_capture, args=[job], **_OPTS)
        await workflow.execute_activity(
            record_step_finish, args=[job_id, 2, "succeeded", {"artifacts": len(artifacts)}], **_OPTS
        )

        # Step 3 — seal (Sealing writes its own custody step and flips job -> succeeded)
        seal = await workflow.execute_activity(
            seal_bundle, args=[job_id, job.get("worker_id", "browser-worker"), artifacts], **_OPTS
        )

        return {"job_id": job_id, "status": "succeeded", "object_keys": seal["object_keys"]}

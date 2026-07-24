"""Dispatch helper — how the Ingest API (#36) hands a job to Temporal.

The Ingest API stays sync/fast; when Temporal is deployed, `routes._accept` calls
`start_capture_workflow` to enqueue the job and returns 202 immediately.
"""

from __future__ import annotations

import os

from temporalio.client import Client

TASK_QUEUE = os.environ.get("EVIDENCE_TASK_QUEUE", "capture")
TARGET = os.environ.get("TEMPORAL_TARGET", "localhost:7233")


async def connect(target: str | None = None) -> Client:
    return await Client.connect(target or TARGET)


async def start_capture_workflow(client: Client, job: dict, task_queue: str = TASK_QUEUE):
    from .workflows import CaptureWorkflow

    return await client.start_workflow(
        CaptureWorkflow.run,
        job,
        id=f"capture-{job['job_id']}",
        task_queue=task_queue,
    )

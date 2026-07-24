"""Dispatch helper — how the Ingest API (#36) hands a job to Temporal.

The Ingest API stays sync/fast; when Temporal is deployed, `routes._accept` calls
`start_capture_workflow` to enqueue the job and returns 202 immediately.
"""

from __future__ import annotations

import os

from temporalio.client import Client

from capability_router import task_queue_for

TARGET = os.environ.get("TEMPORAL_TARGET", "localhost:7233")


async def connect(target: str | None = None) -> Client:
    return await Client.connect(target or TARGET)


async def start_capture_workflow(client: Client, job: dict, task_queue: str | None = None):
    """Enqueue a job. The Capability Router (#38) picks the pool task queue from the
    job_type unless one is given explicitly."""
    tq = task_queue or task_queue_for(job["job_type"])
    return await client.start_workflow(
        CaptureWorkflow.run,
        job,
        id=f"capture-{job['job_id']}",
        task_queue=tq,
    )


# Imported lazily below to avoid pulling workflow defs at module import in some paths.
from .workflows import CaptureWorkflow  # noqa: E402

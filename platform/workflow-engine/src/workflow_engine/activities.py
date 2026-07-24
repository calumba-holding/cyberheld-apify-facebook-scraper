"""Temporal activities (#37).

Activities do all IO (the workflow stays deterministic). Each capture step records
its own custody-log entry in the Metadata DB — written before the work, ticked off
after — so Temporal's durable replay and the DB custody log stay in lock-step: a
crash after step N's start replays from step N, not step 1.

The seal step calls the real Sealing Service (#34), which manages its own custody
step and flips the job to succeeded.
"""

from __future__ import annotations

import base64
import json
import os
import tempfile
import uuid

from temporalio import activity

from metadata_db.engine import make_engine, make_session_factory
from metadata_db.repository import Repository

_factory = None


def _session():
    global _factory
    if _factory is None:
        _factory = make_session_factory(make_engine())
    return _factory()


@activity.defn
def record_step_start(job_id: str, index: int, name: str, detail: dict | None = None) -> None:
    with _session() as s:
        Repository(s).start_step(uuid.UUID(job_id), index, name, detail)
        s.commit()


@activity.defn
def record_step_finish(job_id: str, index: int, state: str, detail: dict | None = None) -> None:
    with _session() as s:
        Repository(s).finish_step(uuid.UUID(job_id), index, state, detail)
        s.commit()


@activity.defn
def mark_running(job_id: str) -> None:
    with _session() as s:
        Repository(s).set_job_status(uuid.UUID(job_id), "running")
        s.commit()


@activity.defn
def run_capture(job: dict) -> list[dict]:
    """Simulated capture. A real deployment dispatches to the Node browser worker
    via the Capability Router (#38); the artifact bundle it returns is identical in
    shape, so nothing downstream changes when that lands."""
    payload = json.dumps(
        {"target_url": job["target_url"], "job_type": job["job_type"], "captured": True}
    ).encode()
    return [
        {"kind": "other", "filename": "capture.json",
         "data_b64": base64.b64encode(payload).decode(), "mime": "application/json"},
        {"kind": "screenshot", "filename": "screenshot.png",
         "data_b64": base64.b64encode(b"\x89PNG fake screenshot").decode(), "mime": "image/png"},
    ]


@activity.defn
def seal_bundle(job_id: str, worker_id: str, artifacts: list[dict]) -> dict:
    from sealing import (
        ArtifactInput,
        CaptureBundle,
        LocalDevTimestamper,
        LocalWormBackend,
        ManifestSigner,
        SealingService,
    )

    storage_dir = os.environ.get("EVIDENCE_STORAGE_DIR") or tempfile.mkdtemp(prefix="ec-worm-")
    signer = ManifestSigner.from_env()
    service = SealingService(LocalWormBackend(storage_dir), LocalDevTimestamper(signer), signer)
    bundle = CaptureBundle(
        job_id=uuid.UUID(job_id),
        worker_id=worker_id,
        artifacts=[
            ArtifactInput(
                kind=a["kind"], filename=a["filename"],
                data=base64.b64decode(a["data_b64"]), mime_type=a.get("mime"),
            )
            for a in artifacts
        ],
    )
    with _session() as s:
        result = service.seal(s, bundle)
        s.commit()
    return {"object_keys": result.object_keys, "artifact_count": len(artifacts)}


ALL_ACTIVITIES = [
    record_step_start,
    record_step_finish,
    mark_running,
    run_capture,
    seal_bundle,
]

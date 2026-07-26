"""Lightweight in-memory case/job store — enough for the gateway's 202 + job_id
contract and status reads. (The real custody store, Metadata DB, is a downstream
capability, not built into the router.)"""

from __future__ import annotations

import threading
import uuid
from datetime import datetime, timezone


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Store:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._cases: dict[str, dict] = {}
        self._jobs: dict[str, dict] = {}

    def open_case(self, external_ref: str | None) -> str:
        cid = str(uuid.uuid4())
        with self._lock:
            self._cases[cid] = {"id": cid, "external_ref": external_ref, "created_at": _now()}
        return cid

    def has_case(self, case_id: str) -> bool:
        with self._lock:
            return case_id in self._cases

    def create_job(self, case_id: str, job_type: str, target_url: str | None,
                   routed_to: str, pool: str) -> dict:
        jid = str(uuid.uuid4())
        job = {
            "job_id": jid, "case_id": case_id, "job_type": job_type,
            "target_url": target_url, "status": "queued",
            "routed_to": routed_to, "pool": pool,
            "trace": [], "created_at": _now(),
        }
        with self._lock:
            self._jobs[jid] = job
        return job

    def trace(self, job_id: str, event: str) -> None:
        with self._lock:
            j = self._jobs.get(job_id)
            if j is not None:
                j["trace"].append({"at": _now(), "event": event})

    def set_status(self, job_id: str, status: str) -> None:
        with self._lock:
            j = self._jobs.get(job_id)
            if j is not None:
                j["status"] = status

    def get_job(self, job_id: str) -> dict | None:
        with self._lock:
            j = self._jobs.get(job_id)
            return dict(j) if j else None

    def list_jobs(self, limit: int = 50) -> list[dict]:
        with self._lock:
            return [dict(j) for j in list(self._jobs.values())[-limit:][::-1]]


store = Store()

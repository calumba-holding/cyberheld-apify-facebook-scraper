"""The accept path: validate → open case → create job → route → hand off. This is
the gateway behaviour shared by every capture/enrich endpoint."""

from __future__ import annotations

from fastapi import HTTPException

from .backends import backend
from .routing import route
from .store import store


def accept(job_type: str, target: str, case_id: str | None,
           external_ref: str | None, device: bool = False) -> dict:
    if case_id is not None and not store.has_case(case_id):
        raise HTTPException(400, "unknown case_id")
    cid = case_id or store.open_case(external_ref)

    cap_id, pool = route(job_type, device=device)
    job = store.create_job(cid, job_type, target, cap_id, pool)

    store.trace(job["job_id"], "ingested at gateway")
    store.trace(job["job_id"], f"routed to '{cap_id}' ({pool})")
    backend.dispatch(store, job)   # stub: records hand-off, runs nothing

    return {
        "job_id": job["job_id"],
        "case_id": cid,
        "job_type": job_type,
        "status": job["status"],
        "routed_to": cap_id,
        "pool": pool,
    }

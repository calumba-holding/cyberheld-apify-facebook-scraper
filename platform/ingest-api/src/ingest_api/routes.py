"""The one door — capture + enrich intake and job status.

Every route validates, opens a case record + job, and returns 202 + job_id
immediately. It never blocks on capture: actual execution is dispatched to the
durable workflow engine (Temporal, #37). Until that lands, the job is recorded as
`queued` and a worker/dispatcher picks it up — the contract (202 + job_id) is
already stable.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, FastAPI, HTTPException
from sqlalchemy.orm import Session

from metadata_db.models import Job
from metadata_db.repository import Repository

from .auth import require_api_key
from .db import get_session
from .schemas import CaptureRequest, EnrichRequest, JobAccepted, JobStatus, StepView

# route path -> job_type (job_type is the stable machine label stored on the job)
CAPTURE_ROUTES = {
    "/fb/profile": "fb/profile",
    "/fb/post": "fb/post",
    "/fb/reel": "fb/reel",
    "/ig/profile": "ig/profile",
    "/ig/post": "ig/post",
    "/tiktok/profile": "tiktok/profile",
    "/tiktok/post": "tiktok/post",
}
ENRICH_ROUTES = {
    "/enrich/email-verify": "enrich/email-verify",
    "/enrich/domain": "enrich/domain",
}


def _accept(
    session: Session, job_type: str, target_url: str, case_id: str | None, external_ref: str | None
) -> JobAccepted:
    repo = Repository(session)
    if case_id:
        try:
            cid = uuid.UUID(case_id)
        except ValueError:
            raise HTTPException(400, "invalid case_id")
    else:
        cid = repo.open_case(external_ref=external_ref).id
    job = repo.create_job(cid, job_type=job_type, target_url=target_url)
    # dispatch to Temporal here (#37); must not block — returns immediately.
    return JobAccepted(job_id=str(job.id), case_id=str(cid), job_type=job_type, status="queued")


def _make_capture_handler(job_type: str):
    async def handler(
        body: CaptureRequest, session: Session = Depends(get_session)
    ) -> JobAccepted:
        return _accept(session, job_type, body.target_url, body.case_id, body.external_ref)

    return handler


def _make_enrich_handler(job_type: str):
    async def handler(
        body: EnrichRequest, session: Session = Depends(get_session)
    ) -> JobAccepted:
        return _accept(session, job_type, body.value, body.case_id, body.external_ref)

    return handler


def register_routes(app: FastAPI) -> None:
    router = APIRouter(dependencies=[Depends(require_api_key)])

    for path, job_type in CAPTURE_ROUTES.items():
        router.add_api_route(
            path, _make_capture_handler(job_type), methods=["POST"],
            status_code=202, response_model=JobAccepted, tags=["capture"],
            name=f"capture:{job_type}",
        )
    for path, job_type in ENRICH_ROUTES.items():
        router.add_api_route(
            path, _make_enrich_handler(job_type), methods=["POST"],
            status_code=202, response_model=JobAccepted, tags=["enrich"],
            name=f"enrich:{job_type}",
        )

    @router.get("/jobs/{job_id}", response_model=JobStatus, tags=["status"])
    async def job_status(job_id: str, session: Session = Depends(get_session)) -> JobStatus:
        try:
            jid = uuid.UUID(job_id)
        except ValueError:
            raise HTTPException(400, "invalid job_id")
        job = session.get(Job, jid)
        if job is None:
            raise HTTPException(404, "job not found")
        steps = [
            StepView(step_index=s.step_index, name=s.name, state=s.state)
            for s in Repository(session).custody_log(jid)
        ]
        return JobStatus(
            job_id=str(job.id), case_id=str(job.case_id), job_type=job.job_type,
            status=job.status, target_url=job.target_url, steps=steps,
        )

    app.include_router(router)

    @app.get("/health", tags=["meta"])
    async def health() -> dict:
        return {"status": "ok"}

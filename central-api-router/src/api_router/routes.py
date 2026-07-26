"""All gateway routes, mounted under /v1 with API-key auth."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from .auth import require_api_key
from .capabilities import GATEWAY, all_caps, get
from .dispatch import accept
from .schemas import (
    ArchitectureMap,
    Capability,
    CaptureRequest,
    EnrichRequest,
    JobAccepted,
    JobStatus,
)
from .store import store

# capture endpoint path -> job_type
CAPTURE_ROUTES = {
    "/fb/profile": "fb/profile", "/fb/post": "fb/post", "/fb/reel": "fb/reel",
    "/ig/profile": "ig/profile", "/ig/post": "ig/post",
    "/tiktok/profile": "tiktok/profile", "/tiktok/post": "tiktok/post",
}
ENRICH_ROUTES = {
    "/enrich/email-verify": "enrich/email-verify",
    "/enrich/domain": "enrich/domain",
}


def build_router() -> APIRouter:
    api = APIRouter(prefix="/v1", dependencies=[Depends(require_api_key)])

    for path, job_type in CAPTURE_ROUTES.items():
        def make(jt: str):
            async def handler(body: CaptureRequest) -> JobAccepted:
                return JobAccepted(**accept(jt, body.target_url, body.case_id,
                                            body.external_ref, device=body.device))
            return handler
        api.add_api_route(path, make(job_type), methods=["POST"], status_code=202,
                          response_model=JobAccepted, tags=["capture"], name=f"capture:{job_type}")

    for path, job_type in ENRICH_ROUTES.items():
        def make_e(jt: str):
            async def handler(body: EnrichRequest) -> JobAccepted:
                return JobAccepted(**accept(jt, body.value, body.case_id, body.external_ref))
            return handler
        api.add_api_route(path, make_e(job_type), methods=["POST"], status_code=202,
                          response_model=JobAccepted, tags=["enrich"], name=f"enrich:{job_type}")

    @api.get("/jobs/{job_id}", response_model=JobStatus, tags=["status"])
    async def job_status(job_id: str) -> JobStatus:
        job = store.get_job(job_id)
        if job is None:
            raise HTTPException(404, "job not found")
        return JobStatus(**job)

    @api.get("/jobs", tags=["status"])
    async def jobs():
        return {"jobs": store.list_jobs()}

    @api.get("/capabilities", response_model=ArchitectureMap, tags=["architecture"])
    async def capabilities() -> ArchitectureMap:
        caps = [Capability(id=c.id, name=c.name, layer=c.layer, kind=c.kind,
                           summary=c.summary, status=c.status, downstream=c.downstream)
                for c in all_caps()]
        return ArchitectureMap(entry=GATEWAY.id, capabilities=caps)

    @api.get("/capabilities/{cap_id}", response_model=Capability, tags=["architecture"])
    async def capability(cap_id: str) -> Capability:
        try:
            c = get(cap_id)
        except KeyError:
            raise HTTPException(404, "unknown capability")
        return Capability(id=c.id, name=c.name, layer=c.layer, kind=c.kind,
                          summary=c.summary, status=c.status, downstream=c.downstream)

    return api

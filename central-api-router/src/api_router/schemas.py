"""Request / response models for the central API router."""

from __future__ import annotations

from pydantic import BaseModel


class CaptureRequest(BaseModel):
    target_url: str
    case_id: str | None = None
    external_ref: str | None = None
    max_posts: int | None = None
    device: bool = False  # force the Device Workers pool (app-only capture)


class EnrichRequest(BaseModel):
    value: str
    case_id: str | None = None
    external_ref: str | None = None


class JobAccepted(BaseModel):
    job_id: str
    case_id: str
    job_type: str
    status: str
    routed_to: str          # capability id the request was routed to
    pool: str               # task queue / pool


class TraceStep(BaseModel):
    at: str
    event: str


class JobStatus(BaseModel):
    job_id: str
    case_id: str
    job_type: str
    status: str
    target_url: str | None
    routed_to: str
    pool: str
    trace: list[TraceStep]


class Capability(BaseModel):
    id: str
    name: str
    layer: str
    kind: str
    summary: str
    status: str             # e.g. "gateway" | "planned" | "interface"
    downstream: list[str]


class ArchitectureMap(BaseModel):
    entry: str
    capabilities: list[Capability]

"""Request/response models."""

from __future__ import annotations

from pydantic import BaseModel


class CaptureRequest(BaseModel):
    target_url: str
    case_id: str | None = None
    external_ref: str | None = None
    max_posts: int | None = None


class EnrichRequest(BaseModel):
    value: str
    case_id: str | None = None
    external_ref: str | None = None


class JobAccepted(BaseModel):
    job_id: str
    case_id: str
    job_type: str
    status: str


class StepView(BaseModel):
    step_index: int
    name: str
    state: str


class JobStatus(BaseModel):
    job_id: str
    case_id: str
    job_type: str
    status: str
    target_url: str | None
    steps: list[StepView]

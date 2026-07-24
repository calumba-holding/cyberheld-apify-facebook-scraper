"""Data-access layer used by the Sealing Service (#34) and Ingest API (#36).

Thin, intention-revealing CRUD over the schema. All identity/uuid generation and
custody-log integrity live in the database (defaults + triggers); this layer just
expresses the operations the control plane needs.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Case, ContentItem, Entity, Hash, Job, JobStep, MediaAsset


class Repository:
    def __init__(self, session: Session) -> None:
        self.s = session

    # --- cases / jobs ---------------------------------------------------
    def open_case(self, external_ref: str | None = None) -> Case:
        case = Case(external_ref=external_ref)
        self.s.add(case)
        self.s.flush()
        return case

    def create_job(
        self, case_id: uuid.UUID, job_type: str, target_url: str | None = None
    ) -> Job:
        job = Job(case_id=case_id, job_type=job_type, target_url=target_url)
        self.s.add(job)
        self.s.flush()
        return job

    def set_job_status(self, job_id: uuid.UUID, status: str) -> None:
        job = self.s.get(Job, job_id)
        if job is None:
            raise LookupError(f"job {job_id} not found")
        job.status = status
        self.s.flush()

    # --- custody log ----------------------------------------------------
    def start_step(
        self,
        job_id: uuid.UUID,
        step_index: int,
        name: str,
        detail: dict | None = None,
    ) -> JobStep:
        """Write a step down *before* doing it."""
        step = JobStep(
            job_id=job_id, step_index=step_index, name=name, state="started", detail=detail
        )
        self.s.add(step)
        self.s.flush()
        return step

    def finish_step(
        self,
        job_id: uuid.UUID,
        step_index: int,
        state: str,
        detail: dict | None = None,
    ) -> JobStep:
        """Tick a step off *after* doing it (started -> terminal)."""
        step = self.s.execute(
            select(JobStep).where(
                JobStep.job_id == job_id, JobStep.step_index == step_index
            )
        ).scalar_one()
        step.state = state
        if detail is not None:
            step.detail = detail
        step.finished_at = func.now()
        self.s.flush()
        self.s.refresh(step)  # load the DB-side timestamp, not the func expression
        return step

    def custody_log(self, job_id: uuid.UUID) -> Sequence[JobStep]:
        return (
            self.s.execute(
                select(JobStep)
                .where(JobStep.job_id == job_id)
                .order_by(JobStep.step_index)
            )
            .scalars()
            .all()
        )

    # --- entities / content / assets ------------------------------------
    def upsert_entity(
        self, platform: str, handle: str, display_name: str | None = None
    ) -> Entity:
        existing = self.s.execute(
            select(Entity).where(Entity.platform == platform, Entity.handle == handle)
        ).scalar_one_or_none()
        if existing is not None:
            if display_name is not None:
                existing.display_name = display_name
            self.s.flush()
            return existing
        entity = Entity(platform=platform, handle=handle, display_name=display_name)
        self.s.add(entity)
        self.s.flush()
        return entity

    def add_content_item(
        self,
        job_id: uuid.UUID,
        platform: str,
        item_type: str,
        source_url: str | None = None,
        entity_id: uuid.UUID | None = None,
        payload: dict | None = None,
    ) -> ContentItem:
        item = ContentItem(
            job_id=job_id,
            platform=platform,
            item_type=item_type,
            source_url=source_url,
            entity_id=entity_id,
            payload=payload,
        )
        self.s.add(item)
        self.s.flush()
        return item

    def add_media_asset(
        self,
        job_id: uuid.UUID,
        kind: str,
        object_key: str,
        content_item_id: uuid.UUID | None = None,
        byte_size: int | None = None,
        mime_type: str | None = None,
    ) -> MediaAsset:
        asset = MediaAsset(
            job_id=job_id,
            kind=kind,
            object_key=object_key,
            content_item_id=content_item_id,
            byte_size=byte_size,
            mime_type=mime_type,
        )
        self.s.add(asset)
        self.s.flush()
        return asset

    def record_hash(
        self,
        media_asset_id: uuid.UUID,
        digest: str,
        algo: str = "sha256",
        rfc3161_token: bytes | None = None,
    ) -> Hash:
        """SHA-256 for an artifact; 1:1 with the asset (DB-enforced)."""
        h = Hash(
            media_asset_id=media_asset_id,
            digest=digest,
            algo=algo,
            rfc3161_token=rfc3161_token,
        )
        self.s.add(h)
        self.s.flush()
        return h

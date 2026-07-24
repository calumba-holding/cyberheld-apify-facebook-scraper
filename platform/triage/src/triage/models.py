"""ORM for triage_flags (mirrors migrations/0001_triage.sql)."""

from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import Boolean, DateTime, Float, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TriageFlag(Base):
    __tablename__ = "triage_flags"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    # FKs to jobs(id) / content_items(id) are enforced by the SQL migration; the
    # referenced tables live in the metadata_db Base, so map plain UUID columns here.
    job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    content_item_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    score: Mapped[float] = mapped_column(Float)
    crosses_threshold: Mapped[bool] = mapped_column(Boolean)
    rationale: Mapped[str | None] = mapped_column(Text)
    model: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )

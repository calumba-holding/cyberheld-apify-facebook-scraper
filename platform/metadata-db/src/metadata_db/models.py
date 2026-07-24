"""ORM models mirroring migrations/0001_init.sql.

The SQL migration is authoritative for DDL (constraints, triggers, defaults);
these models exist so services can query in Python. Keep them in sync with the
migration when the schema changes.
"""

from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


# Server-side default helpers (mirror the DDL in migrations/0001_init.sql).
_UUID_PK = lambda: mapped_column(  # noqa: E731
    UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
)
_NOW = lambda: mapped_column(DateTime(timezone=True), server_default=text("now()"))  # noqa: E731


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[uuid.UUID] = _UUID_PK()
    external_ref: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, server_default=text("'open'"))
    legal_hold: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    retention_until: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[dt.datetime] = _NOW()
    updated_at: Mapped[dt.datetime] = _NOW()

    jobs: Mapped[list["Job"]] = relationship(back_populates="case")


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = _UUID_PK()
    case_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cases.id"))
    job_type: Mapped[str] = mapped_column(Text)
    target_url: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, server_default=text("'queued'"))
    created_at: Mapped[dt.datetime] = _NOW()
    updated_at: Mapped[dt.datetime] = _NOW()

    case: Mapped[Case] = relationship(back_populates="jobs")
    steps: Mapped[list["JobStep"]] = relationship(back_populates="job")


class JobStep(Base):
    """Append-only custody log. DB triggers forbid delete/reorder/rewrite."""

    __tablename__ = "job_steps"
    __table_args__ = (UniqueConstraint("job_id", "step_index"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id"))
    step_index: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(Text)
    state: Mapped[str] = mapped_column(String, server_default=text("'started'"))
    detail: Mapped[dict | None] = mapped_column(JSONB)
    started_at: Mapped[dt.datetime] = _NOW()
    finished_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))

    job: Mapped[Job] = relationship(back_populates="steps")


class Entity(Base):
    """Platform handle only — never resolved identity."""

    __tablename__ = "entities"
    __table_args__ = (UniqueConstraint("platform", "handle"),)

    id: Mapped[uuid.UUID] = _UUID_PK()
    platform: Mapped[str] = mapped_column(String)
    handle: Mapped[str] = mapped_column(Text)
    display_name: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = _NOW()


class ContentItem(Base):
    __tablename__ = "content_items"

    id: Mapped[uuid.UUID] = _UUID_PK()
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id"))
    entity_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("entities.id"))
    platform: Mapped[str] = mapped_column(String)
    item_type: Mapped[str] = mapped_column(String)
    source_url: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[dict | None] = mapped_column(JSONB)
    captured_at: Mapped[dt.datetime] = _NOW()


class MediaAsset(Base):
    __tablename__ = "media_assets"

    id: Mapped[uuid.UUID] = _UUID_PK()
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id"))
    content_item_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("content_items.id"))
    kind: Mapped[str] = mapped_column(String)
    object_key: Mapped[str] = mapped_column(Text)
    byte_size: Mapped[int | None] = mapped_column(BigInteger)
    mime_type: Mapped[str | None] = mapped_column(Text)
    sealed_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[dt.datetime] = _NOW()


class Hash(Base):
    """SHA-256 per artifact, 1:1 with media_assets (UNIQUE media_asset_id)."""

    __tablename__ = "hashes"
    __table_args__ = (
        CheckConstraint("algo <> ''", name="hashes_algo_nonempty"),
    )

    id: Mapped[uuid.UUID] = _UUID_PK()
    media_asset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("media_assets.id"), unique=True
    )
    algo: Mapped[str] = mapped_column(String, server_default=text("'sha256'"))
    digest: Mapped[str] = mapped_column(Text)
    rfc3161_token: Mapped[bytes | None] = mapped_column(LargeBinary)
    created_at: Mapped[dt.datetime] = _NOW()

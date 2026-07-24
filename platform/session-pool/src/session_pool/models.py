"""ORM model for accounts (mirrors migrations/0001_accounts.sql)."""

from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import DateTime, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (
        UniqueConstraint("platform", "account_ref"),
        UniqueConstraint("platform", "profile_ref"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    platform: Mapped[str] = mapped_column(String)
    account_ref: Mapped[str] = mapped_column(Text)
    profile_ref: Mapped[str] = mapped_column(Text)
    state: Mapped[str] = mapped_column(String, server_default=text("'active'"))
    health_score: Mapped[int] = mapped_column(Integer, server_default=text("100"))
    warnings: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    leased_by: Mapped[str | None] = mapped_column(Text)
    leased_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    last_used_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )

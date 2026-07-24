"""Notify service (#42): on job completion, tell clients — webhook / email / MCP
callback ("job done, N captures sealed") + the pull-side GET /jobs/{id} the Ingest
API already serves.

Delivery is at-least-once (retry with backoff) and **never blocks or corrupts the
sealed record**: notify only reads the Metadata DB and writes an audit row per
attempt; a delivery failure is recorded, not raised.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from typing import Callable, Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from metadata_db.models import Job, MediaAsset

from .channels import Channel
from .models import Notification


def build_notification(session: Session, job_id: uuid.UUID) -> dict:
    job = session.get(Job, job_id)
    if job is None:
        raise LookupError(f"job {job_id} not found")
    sealed = session.execute(
        select(func.count())
        .select_from(MediaAsset)
        .where(MediaAsset.job_id == job_id, MediaAsset.sealed_at.is_not(None))
    ).scalar_one()
    return {
        "job_id": str(job_id),
        "case_id": str(job.case_id),
        "job_type": job.job_type,
        "status": job.status,
        "sealed_captures": sealed,
        "message": f"job done, {sealed} captures sealed",
    }


@dataclass
class DeliveryResult:
    channel: str
    target: str
    delivered: bool
    attempts: int
    error: str | None


class NotifyService:
    def __init__(
        self,
        attempts: int = 3,
        backoff_seconds: float = 0.0,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._attempts = attempts
        self._backoff = backoff_seconds
        self._sleep = sleep

    def notify(
        self, session: Session, notification: dict, channels: Sequence[Channel]
    ) -> list[DeliveryResult]:
        job_id = uuid.UUID(notification["job_id"])
        results: list[DeliveryResult] = []
        for ch in channels:
            delivered = False
            error: str | None = None
            attempt = 0
            for attempt in range(1, self._attempts + 1):
                try:
                    ch.send(notification)
                    delivered = True
                    error = None
                    break
                except Exception as e:  # delivery failure never propagates
                    error = str(e)
                    if attempt < self._attempts and self._backoff:
                        self._sleep(self._backoff * attempt)
            session.add(
                Notification(
                    job_id=job_id, channel=ch.name, target=ch.target,
                    delivered=delivered, attempts=attempt, error=error,
                )
            )
            results.append(DeliveryResult(ch.name, ch.target, delivered, attempt, error))
        session.flush()
        return results

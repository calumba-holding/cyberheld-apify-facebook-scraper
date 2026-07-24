"""Triage service (#41): rank captured content by likelihood of crossing the
legal threshold, so review time goes to the items that matter.

Reads content items from the Metadata DB, classifies each, and writes triage_flags
(derived metadata). It never touches sealed artifacts — this is a prioritization
index, not a legal determination.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from metadata_db.models import ContentItem

from .classifier import Classifier
from .models import TriageFlag


@dataclass
class Flagged:
    content_item_id: uuid.UUID
    score: float
    crosses_threshold: bool
    rationale: str


def _text_of(item: ContentItem) -> str:
    payload = item.payload or {}
    if isinstance(payload, dict):
        for key in ("text", "comment", "body", "caption"):
            if isinstance(payload.get(key), str):
                return payload[key]
        return json.dumps(payload, sort_keys=True)
    return str(payload)


def triage_job(
    session: Session,
    job_id: uuid.UUID,
    classifier: Classifier,
    cutoff: float = 0.5,
    item_types: tuple[str, ...] = ("comment",),
) -> list[Flagged]:
    """Classify a job's content items; store flags; return them ranked (desc)."""
    stmt = select(ContentItem).where(ContentItem.job_id == job_id)
    if item_types:
        stmt = stmt.where(ContentItem.item_type.in_(item_types))
    items = session.execute(stmt).scalars().all()

    results: list[Flagged] = []
    for item in items:
        verdict = classifier.classify(_text_of(item))
        crosses = verdict.score >= cutoff
        session.add(
            TriageFlag(
                job_id=job_id,
                content_item_id=item.id,
                score=verdict.score,
                crosses_threshold=crosses,
                rationale=verdict.rationale,
                model=classifier.name,
            )
        )
        results.append(
            Flagged(item.id, verdict.score, crosses, verdict.rationale)
        )
    session.flush()
    results.sort(key=lambda r: r.score, reverse=True)
    return results


def flagged_only(results: list[Flagged]) -> list[Flagged]:
    return [r for r in results if r.crosses_threshold]

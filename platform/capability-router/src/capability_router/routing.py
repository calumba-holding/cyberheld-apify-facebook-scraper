"""Route a job to a worker pool.

A job_type is the stable label the Ingest API stores (e.g. `fb/post`,
`enrich/domain`, `processing/transcribe`). An optional explicit pool hint
(`device:ig/post`) overrides the default so app-only captures can be forced onto
Device workers "where browser fails".
"""

from __future__ import annotations

from .pools import BROWSER, CONNECTOR, POOLS, PROCESSING, WATCH, Pool

CAPTURE_TARGETS = ("fb/", "ig/", "tiktok/")


def route(job_type: str) -> Pool:
    # Explicit pool hint: "<pool>:<job_type>"
    if ":" in job_type:
        hint, _, _rest = job_type.partition(":")
        if hint in POOLS:
            return POOLS[hint]

    if job_type.startswith("enrich/"):
        return CONNECTOR
    if job_type.startswith("processing/"):
        return PROCESSING
    if job_type.startswith("watch/"):
        return WATCH
    if job_type.startswith(CAPTURE_TARGETS):
        return BROWSER  # default capture pool

    # Unknown job types default to browser capture rather than failing routing.
    return BROWSER


def task_queue_for(job_type: str) -> str:
    return route(job_type).task_queue

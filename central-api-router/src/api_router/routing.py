"""Route a request to a worker-pool capability + its queue. Pure routing config —
this is the 'router' half of the central API router."""

from __future__ import annotations

CAPTURE_TARGETS = ("fb/", "ig/", "tiktok/")


def route(job_type: str, device: bool = False) -> tuple[str, str]:
    """Return (capability_id, pool_queue) for a job_type.

    device=True forces the Device Workers pool for app-only capture.
    """
    if job_type.startswith("enrich/"):
        return "connector", "pool.connector"
    if job_type.startswith("processing/"):
        return "processing", "pool.processing"
    if job_type.startswith("watch/"):
        return "watch", "pool.watch"
    if job_type.startswith(CAPTURE_TARGETS):
        if device:
            return "device", "pool.device"
        return "browser", "pool.browser"
    return "browser", "pool.browser"

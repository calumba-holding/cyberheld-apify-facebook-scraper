"""The architecture as data: every box on the evidence-capture board expressed as a
routable *capability*. The gateway routes to these; it does NOT implement them
(no scraper, no sealing, no DB built here) — they are the downstream contract.

This is what makes this service the *central API router*: it owns the map of the
whole system and the flow between capabilities, and dispatches to them.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Cap:
    id: str
    name: str
    layer: str          # entry | orchestration | routing | identity | worker | custody | storage | output
    kind: str
    summary: str
    status: str = "interface"     # this gateway only defines the interface/contract
    downstream: list[str] = field(default_factory=list)


# The one door — this service.
GATEWAY = Cap(
    "gateway", "Central API Router", "entry", "gateway",
    "One authenticated door. Validates, opens a case, returns 202 + job_id, and routes "
    "the request to the right capability. Never blocks; never runs a scraper itself.",
    status="gateway",
    downstream=["workflow"],
)

CAPABILITIES: list[Cap] = [
    GATEWAY,
    Cap("workflow", "Durable Workflow Engine (Temporal)", "orchestration", "workflow",
        "One workflow per job; the step journal is the chain of custody.",
        downstream=["router"]),
    Cap("router", "Capability Router", "routing", "router",
        "Per-pool queues with independent concurrency limits.",
        downstream=["browser", "device", "watch", "processing", "connector"]),
    Cap("session_pool", "Account & Session Pool", "identity", "pool",
        "Health-scored signed-in accounts; quarantine-first; 1 account ↔ 1 profile.",
        downstream=["browser", "device"]),
    Cap("browser", "Browser Workers", "worker", "pool",
        "Docker + Chrome persistent profile; fb/ig profile + post-engagement.",
        downstream=["sealing"]),
    Cap("device", "Device Workers", "worker", "pool",
        "Android + adb/UiAutomator for app-only capture.",
        downstream=["sealing"]),
    Cap("watch", "Watch Workers", "worker", "pool",
        "Always-on poll + comment diff + incident cap.",
        downstream=["sealing"]),
    Cap("processing", "Processing Workers", "worker", "pool",
        "yt-dlp → ffmpeg → Whisper + OCR.",
        downstream=["sealing"]),
    Cap("connector", "Connector Workers", "worker", "pool",
        "Thin wrappers on outside APIs behind /enrich/*.",
        downstream=["sealing"]),
    Cap("sealing", "Sealing Service", "custody", "service",
        "The only route to storage: SHA-256 + RFC 3161 timestamp + signed manifest.",
        downstream=["object_store", "metadata_db"]),
    Cap("object_store", "Object Store (WORM)", "storage", "store",
        "S3/MinIO Object Lock; retention + legal hold.",
        downstream=["evidence_package"]),
    Cap("metadata_db", "Metadata DB", "storage", "db",
        "Cases, jobs, step journal, hashes — the queryable index over sealed evidence.",
        downstream=["triage", "notify"]),
    Cap("evidence_package", "Evidence Package", "output", "builder",
        "Self-contained, offline-verifiable zip + manifest + custody log."),
    Cap("triage", "LLM Triage", "output", "service",
        "Flags which content plausibly crosses the legal threshold."),
    Cap("notify", "Notify", "output", "service",
        "webhook · email · MCP callback + GET /jobs/{id}."),
]

_BY_ID = {c.id: c for c in CAPABILITIES}


def get(cap_id: str) -> Cap:
    return _BY_ID[cap_id]


def all_caps() -> list[Cap]:
    return list(CAPABILITIES)

"""The capture bundle — the worker contract.

Every capture worker (the existing Node/TS browser scraper, and later device /
processing / connector workers) hands the Sealing Service a CaptureBundle: the
raw artifacts for one job. This is the seam that encapsulates the existing
codebase inside the architecture — a worker produces a bundle, Sealing does the
rest. See docs/worker-contract.md.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field

# Allowed artifact kinds must match the media_assets.kind CHECK in the DB schema.
ARTIFACT_KINDS = frozenset(
    {"screenshot", "video", "image", "audio", "transcript", "ocr", "other"}
)


@dataclass
class ArtifactInput:
    kind: str
    filename: str
    data: bytes
    mime_type: str | None = None
    content_item_id: uuid.UUID | None = None

    def __post_init__(self) -> None:
        if self.kind not in ARTIFACT_KINDS:
            raise ValueError(f"unknown artifact kind: {self.kind!r}")


@dataclass
class CaptureBundle:
    job_id: uuid.UUID
    artifacts: list[ArtifactInput] = field(default_factory=list)
    worker_id: str = "unknown"

    def __post_init__(self) -> None:
        if not self.artifacts:
            raise ValueError("capture bundle has no artifacts to seal")

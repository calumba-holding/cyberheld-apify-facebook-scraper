"""Adapter: existing scraper output -> CaptureBundle.

This is where the current Node/TS scraper is encapsulated inside the architecture.
The scraper already writes artifacts (screenshots, session videos) and a JSON
result. This maps such an output directory into the worker contract (CaptureBundle)
so Sealing can turn it into evidence, without the scraper knowing anything about
custody, hashing, or storage.
"""

from __future__ import annotations

import uuid
from pathlib import Path

from .bundle import ArtifactInput, CaptureBundle

# Map file extensions from the existing scraper's `out/` artifacts to artifact kinds.
_EXT_KIND: dict[str, tuple[str, str]] = {
    ".png": ("screenshot", "image/png"),
    ".jpg": ("image", "image/jpeg"),
    ".jpeg": ("image", "image/jpeg"),
    ".webm": ("video", "video/webm"),
    ".mp4": ("video", "video/mp4"),
    ".json": ("other", "application/json"),
    ".txt": ("transcript", "text/plain"),
}


def bundle_from_directory(
    job_id: uuid.UUID,
    directory: str | Path,
    worker_id: str = "browser-worker",
    prefix: str | None = None,
) -> CaptureBundle:
    """Build a CaptureBundle from files in ``directory``.

    ``prefix`` optionally filters to one run's files (the scraper names artifacts
    like ``<run-id>_post-01.png``). Unknown extensions are sealed as ``other``.
    """
    root = Path(directory)
    artifacts: list[ArtifactInput] = []
    for path in sorted(root.iterdir()):
        if not path.is_file():
            continue
        if prefix and not path.name.startswith(prefix):
            continue
        kind, mime = _EXT_KIND.get(path.suffix.lower(), ("other", "application/octet-stream"))
        artifacts.append(
            ArtifactInput(
                kind=kind, filename=path.name, data=path.read_bytes(), mime_type=mime
            )
        )
    return CaptureBundle(job_id=job_id, artifacts=artifacts, worker_id=worker_id)

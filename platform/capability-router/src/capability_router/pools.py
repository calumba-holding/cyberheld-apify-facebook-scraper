"""Worker pools and their per-pool concurrency limits.

Each pool is an independent Temporal task queue with its own concurrency cap, so a
saturated pool (e.g. heavy video Processing) cannot starve another (e.g. the
Browser capture devices). Limits are overridable via env:
`EC_POOL_<NAME>_CONCURRENCY` (e.g. EC_POOL_PROCESSING_CONCURRENCY=2).
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Pool:
    name: str
    default_concurrency: int

    @property
    def task_queue(self) -> str:
        return f"pool.{self.name}"

    @property
    def max_concurrency(self) -> int:
        raw = os.environ.get(f"EC_POOL_{self.name.upper()}_CONCURRENCY")
        if raw:
            try:
                return max(1, int(raw))
            except ValueError:
                pass
        return self.default_concurrency


# The five worker pools from the architecture board.
BROWSER = Pool("browser", default_concurrency=5)     # 5 workers running today
DEVICE = Pool("device", default_concurrency=10)      # 10x Android
WATCH = Pool("watch", default_concurrency=8)         # always-on pollers
PROCESSING = Pool("processing", default_concurrency=2)  # heavy: yt-dlp/ffmpeg/Whisper
CONNECTOR = Pool("connector", default_concurrency=8)  # thin external API wrappers

POOLS: dict[str, Pool] = {
    p.name: p for p in (BROWSER, DEVICE, WATCH, PROCESSING, CONNECTOR)
}

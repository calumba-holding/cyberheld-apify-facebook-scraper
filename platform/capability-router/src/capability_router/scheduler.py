"""In-process demonstration of independent per-pool concurrency.

The production concurrency limit is enforced by each pool's Temporal worker
(`max_concurrent_activities`). This asyncio scheduler models the same invariant so
it can be tested directly: acquiring a slot in one pool never waits on another
pool's saturation — heavy Processing cannot starve Browser.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from .pools import POOLS, Pool


class PoolScheduler:
    def __init__(self) -> None:
        self._sems: dict[str, asyncio.Semaphore] = {
            name: asyncio.Semaphore(pool.max_concurrency) for name, pool in POOLS.items()
        }

    def available(self, pool: Pool) -> int:
        return self._sems[pool.name]._value  # type: ignore[attr-defined]

    @asynccontextmanager
    async def slot(self, pool: Pool):
        sem = self._sems[pool.name]
        await sem.acquire()
        try:
            yield
        finally:
            sem.release()

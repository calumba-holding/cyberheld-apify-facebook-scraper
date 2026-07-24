"""Worker entrypoint — runs the capture workflow + activities against a Temporal
server. `python -m workflow_engine.worker`."""

from __future__ import annotations

import asyncio
import os
import sys
from concurrent.futures import ThreadPoolExecutor

from temporalio.worker import Worker

from capability_router import POOLS

from .activities import ALL_ACTIVITIES
from .client import connect
from .workflows import CaptureWorkflow


async def main(pool_name: str | None = None) -> None:
    """Run one pool's worker: its own task queue and independent concurrency limit,
    so this pool cannot starve another. `python -m workflow_engine.worker processing`."""
    name = pool_name or os.environ.get("EC_POOL", "browser")
    pool = POOLS[name]
    client = await connect()
    with ThreadPoolExecutor(max_workers=pool.max_concurrency) as executor:
        worker = Worker(
            client,
            task_queue=pool.task_queue,
            workflows=[CaptureWorkflow],
            activities=ALL_ACTIVITIES,
            activity_executor=executor,
            max_concurrent_activities=pool.max_concurrency,
        )
        print(f"worker: pool={pool.name} queue={pool.task_queue} concurrency={pool.max_concurrency}")
        await worker.run()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else None))

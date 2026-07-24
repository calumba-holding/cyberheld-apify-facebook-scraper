"""Worker entrypoint — runs the capture workflow + activities against a Temporal
server. `python -m workflow_engine.worker`."""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor

from temporalio.worker import Worker

from .activities import ALL_ACTIVITIES
from .client import TASK_QUEUE, connect
from .workflows import CaptureWorkflow


async def main() -> None:
    client = await connect()
    with ThreadPoolExecutor(max_workers=8) as executor:
        worker = Worker(
            client,
            task_queue=TASK_QUEUE,
            workflows=[CaptureWorkflow],
            activities=ALL_ACTIVITIES,
            activity_executor=executor,
        )
        await worker.run()


if __name__ == "__main__":
    asyncio.run(main())

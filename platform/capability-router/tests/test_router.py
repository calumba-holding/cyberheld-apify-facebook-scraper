"""Capability Router tests (#38)."""

from __future__ import annotations

import asyncio

import pytest

from capability_router import (
    BROWSER,
    CONNECTOR,
    PROCESSING,
    WATCH,
    PoolScheduler,
    route,
    task_queue_for,
)
from capability_router.pools import DEVICE


@pytest.mark.parametrize(
    "job_type,pool",
    [
        ("fb/post", BROWSER),
        ("fb/profile", BROWSER),
        ("ig/reel", BROWSER),
        ("tiktok/profile", BROWSER),
        ("enrich/email-verify", CONNECTOR),
        ("enrich/domain", CONNECTOR),
        ("processing/transcribe", PROCESSING),
        ("watch/fb-post", WATCH),
        ("device:ig/post", DEVICE),   # explicit pool hint overrides default
        ("something/unknown", BROWSER),  # safe default
    ],
)
def test_routing(job_type, pool):
    assert route(job_type) is pool
    assert task_queue_for(job_type) == pool.task_queue


def test_pools_have_independent_limits(monkeypatch):
    monkeypatch.setenv("EC_POOL_PROCESSING_CONCURRENCY", "3")
    assert PROCESSING.max_concurrency == 3
    assert BROWSER.max_concurrency == 5  # unaffected


def test_task_queue_names():
    assert BROWSER.task_queue == "pool.browser"
    assert PROCESSING.task_queue == "pool.processing"


async def test_saturated_pool_does_not_starve_another(monkeypatch):
    """The core guarantee: filling Processing to its limit must not delay Browser."""
    monkeypatch.setenv("EC_POOL_PROCESSING_CONCURRENCY", "1")
    sched = PoolScheduler()

    hog_running = asyncio.Event()
    release_hog = asyncio.Event()

    async def hog():
        async with sched.slot(PROCESSING):
            hog_running.set()
            await release_hog.wait()  # hold the only processing slot

    task = asyncio.create_task(hog())
    await asyncio.wait_for(hog_running.wait(), timeout=1)

    # Processing is now saturated. A second processing job would block...
    assert sched.available(PROCESSING) == 0

    # ...but a Browser job acquires its own pool's slot immediately.
    acquired = asyncio.Event()

    async def browser_job():
        async with sched.slot(BROWSER):
            acquired.set()

    await asyncio.wait_for(browser_job(), timeout=1)  # would raise if it had to wait
    assert acquired.is_set()

    release_hog.set()
    await task

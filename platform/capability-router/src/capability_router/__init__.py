"""Capability Router (#38) — per-pool queues with independent concurrency limits."""

from .pools import BROWSER, CONNECTOR, DEVICE, POOLS, PROCESSING, WATCH, Pool
from .routing import route, task_queue_for
from .scheduler import PoolScheduler

__all__ = [
    "Pool",
    "POOLS",
    "BROWSER",
    "DEVICE",
    "WATCH",
    "PROCESSING",
    "CONNECTOR",
    "route",
    "task_queue_for",
    "PoolScheduler",
]

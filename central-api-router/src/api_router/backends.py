"""Downstream backends. The gateway routes to these; it does not implement them.

This build ships only the StubBackend — it records that a job was handed off to a
capability, WITHOUT running any scraper/worker. That is the point: architecture and
routing only. A real deployment swaps in a backend that enqueues to Temporal / the
Capability Router; the gateway contract does not change.
"""

from __future__ import annotations

from typing import Protocol

from .store import Store


class Backend(Protocol):
    def dispatch(self, store: Store, job: dict) -> None: ...


class StubBackend:
    """No worker is run. Records the hand-off on the job trace."""

    def dispatch(self, store: Store, job: dict) -> None:
        store.trace(
            job["job_id"],
            f"handed off to '{job['routed_to']}' on {job['pool']} "
            f"(interface only — no worker built in the gateway)",
        )


backend: Backend = StubBackend()

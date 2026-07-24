"""Connector framework — thin, uniform adapters over outside APIs.

Each connector implements one `run(value, resolver)` and registers itself. External
access (DNS, HTTP, paid APIs) goes through an injected client/resolver so connectors
are testable offline and the "tool sprawl" stays behind one contract.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Protocol


class Resolver(Protocol):
    def a(self, domain: str) -> list[str]: ...
    def mx(self, domain: str) -> list[str]: ...


class Connector(ABC):
    name: str

    @abstractmethod
    def run(self, value: str, resolver: Resolver) -> dict: ...


_REGISTRY: dict[str, Connector] = {}


def register(connector: Connector) -> Connector:
    _REGISTRY[connector.name] = connector
    return connector


def get(name: str) -> Connector:
    if name not in _REGISTRY:
        raise KeyError(f"unknown connector: {name!r} (have: {names()})")
    return _REGISTRY[name]


def names() -> list[str]:
    return sorted(_REGISTRY)

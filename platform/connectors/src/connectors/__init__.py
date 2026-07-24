"""Connector Workers (#39) — thin wrappers on outside APIs behind /enrich/*."""

from . import domain_lookup, email_verify  # noqa: F401  (self-register on import)
from .base import Connector, Resolver, get, names, register
from .resolvers import SocketResolver
from .runner import connector_for_job_type, run_connector, seal_connector_result

__all__ = [
    "Connector",
    "Resolver",
    "get",
    "names",
    "register",
    "SocketResolver",
    "run_connector",
    "seal_connector_result",
    "connector_for_job_type",
]

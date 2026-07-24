"""domain connector — resolves A records for a domain."""

from __future__ import annotations

from .base import Connector, Resolver, register


class DomainLookupConnector(Connector):
    name = "domain"

    def run(self, value: str, resolver: Resolver) -> dict:
        domain = value.strip().lower()
        ips = resolver.a(domain)
        return {"domain": domain, "a_records": ips, "resolves": len(ips) > 0}


register(DomainLookupConnector())

"""email-verify connector — syntax + MX-based deliverability guess."""

from __future__ import annotations

import re

from .base import Connector, Resolver, register

_EMAIL = re.compile(r"^[^@\s]+@([^@\s]+\.[^@\s]+)$")


class EmailVerifyConnector(Connector):
    name = "email-verify"

    def run(self, value: str, resolver: Resolver) -> dict:
        m = _EMAIL.match(value.strip())
        if not m:
            return {
                "input": value, "valid_syntax": False,
                "domain": None, "has_mx": False, "deliverable": False,
            }
        domain = m.group(1).lower()
        try:
            mx = resolver.mx(domain)
            has_mx: bool | None = len(mx) > 0
        except NotImplementedError:
            mx, has_mx = [], None  # unknown without a DNS resolver
        return {
            "input": value, "valid_syntax": True, "domain": domain,
            "mx": mx, "has_mx": has_mx, "deliverable": bool(has_mx),
        }


register(EmailVerifyConnector())

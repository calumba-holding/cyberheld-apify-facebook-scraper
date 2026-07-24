"""Default resolver. `a()` is real (socket); `mx()` needs a DNS library in
production (inject one) — it is intentionally not faked here."""

from __future__ import annotations

import socket


class SocketResolver:
    def a(self, domain: str) -> list[str]:
        try:
            infos = socket.getaddrinfo(domain, None)
        except OSError:
            return []
        return sorted({i[4][0] for i in infos})

    def mx(self, domain: str) -> list[str]:
        raise NotImplementedError(
            "MX lookup needs a DNS library (e.g. dnspython). Inject a resolver in "
            "production; the framework keeps external access behind this interface."
        )

"""Trusted timestamping.

The board requires an RFC 3161 trusted timestamp from an eIDAS-qualified TSA
(step ② of sealing). That is a production/legal requirement and needs a real TSA
endpoint, so it is defined here as an interface with a documented HTTP adapter to
plug in, plus a clearly-labelled local dev timestamper for offline development and
tests. The dev timestamper is a real Ed25519 signature over (digest || time) but is
NOT a qualified TSA and must never be used for evidence intended for proceedings.
"""

from __future__ import annotations

import datetime as dt
from abc import ABC, abstractmethod
from dataclasses import dataclass

from .signer import ManifestSigner


def utcnow_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


@dataclass
class TimestampToken:
    token: bytes
    tsa: str
    timestamp: str
    qualified: bool


class Timestamper(ABC):
    tsa: str

    @abstractmethod
    def timestamp(self, digest: bytes) -> TimestampToken: ...


class LocalDevTimestamper(Timestamper):
    """DEV ONLY — not an eIDAS-qualified TSA. Ed25519 over (digest || iso-time)."""

    def __init__(self, signer: ManifestSigner) -> None:
        self._signer = signer
        self.tsa = "local-dev-timestamper (NOT eIDAS-qualified)"

    def timestamp(self, digest: bytes) -> TimestampToken:
        ts = utcnow_iso()
        token = self._signer.sign(digest + ts.encode())
        return TimestampToken(token=token, tsa=self.tsa, timestamp=ts, qualified=False)


class Rfc3161HttpTimestamper(Timestamper):
    """Production adapter point: request an RFC 3161 token from a qualified TSA.

    Intentionally not implemented — wiring a specific eIDAS-qualified TSA (endpoint,
    policy OID, hash algorithm negotiation, token verification) is a deployment
    decision tracked with the WORM/GDPR launch gate (#35). Implement here.
    """

    def __init__(self, url: str, policy_oid: str | None = None) -> None:
        self.url = url
        self.policy_oid = policy_oid
        self.tsa = f"rfc3161:{url}"

    def timestamp(self, digest: bytes) -> TimestampToken:  # pragma: no cover
        raise NotImplementedError(
            "Plug an RFC 3161 eIDAS-qualified TSA here before production sealing. "
            "See docs/evidence-capture-architecture.md (Sealing Service #34)."
        )

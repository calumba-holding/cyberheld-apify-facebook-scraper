"""Manifest signing (Ed25519). Signs the canonical manifest so a third party can
verify integrity offline with only the public key."""

from __future__ import annotations

import os

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

_RAW = serialization.Encoding.Raw
_RAWPUB = serialization.PublicFormat.Raw
_RAWPRIV = serialization.PrivateFormat.Raw
_NOENC = serialization.NoEncryption()


class ManifestSigner:
    def __init__(self, private_key: Ed25519PrivateKey) -> None:
        self._k = private_key

    @classmethod
    def generate(cls) -> "ManifestSigner":
        return cls(Ed25519PrivateKey.generate())

    @classmethod
    def from_seed(cls, seed: bytes) -> "ManifestSigner":
        return cls(Ed25519PrivateKey.from_private_bytes(seed))

    @classmethod
    def from_env(cls, var: str = "SEALING_SIGNING_SEED") -> "ManifestSigner":
        """Load a hex 32-byte seed from env, or generate an ephemeral dev key."""
        hexseed = os.environ.get(var)
        if hexseed:
            return cls.from_seed(bytes.fromhex(hexseed))
        return cls.generate()

    def sign(self, data: bytes) -> bytes:
        return self._k.sign(data)

    def public_key_bytes(self) -> bytes:
        return self._k.public_key().public_bytes(_RAW, _RAWPUB)

    def seed(self) -> bytes:
        return self._k.private_bytes(_RAW, _RAWPRIV, _NOENC)


def verify_signature(public_key_bytes: bytes, data: bytes, signature: bytes) -> bool:
    try:
        Ed25519PublicKey.from_public_bytes(public_key_bytes).verify(signature, data)
        return True
    except Exception:
        return False

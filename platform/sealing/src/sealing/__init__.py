"""Sealing Service (#34) — the only route to storage; nothing is stored unsealed."""

from .bundle import ArtifactInput, CaptureBundle
from .service import SealingService, SealResult, verify_package
from .signer import ManifestSigner, verify_signature
from .storage import LocalWormBackend, StorageBackend, WriteOnceError
from .timestamper import LocalDevTimestamper, Rfc3161HttpTimestamper, Timestamper


def __getattr__(name: str):
    # Lazy export so importing `sealing` doesn't require boto3.
    if name == "S3WormBackend":
        from .s3_storage import S3WormBackend

        return S3WormBackend
    raise AttributeError(name)


__all__ = [
    "S3WormBackend",
    "ArtifactInput",
    "CaptureBundle",
    "SealingService",
    "SealResult",
    "verify_package",
    "ManifestSigner",
    "verify_signature",
    "LocalWormBackend",
    "StorageBackend",
    "WriteOnceError",
    "LocalDevTimestamper",
    "Rfc3161HttpTimestamper",
    "Timestamper",
]

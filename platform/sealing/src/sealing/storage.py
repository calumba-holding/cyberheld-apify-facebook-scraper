"""Object storage backends. The Sealing Service is the ONLY caller of ``put``.

``LocalWormBackend`` emulates write-once semantics for dev/tests; the real WORM
object store (MinIO / S3 Object Lock) lands in issue #35 behind this interface.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path


class WriteOnceError(RuntimeError):
    """Raised when an already-written object key is written again (WORM)."""


class StorageBackend(ABC):
    @abstractmethod
    def put(self, object_key: str, data: bytes) -> None: ...

    @abstractmethod
    def get(self, object_key: str) -> bytes: ...

    @abstractmethod
    def exists(self, object_key: str) -> bool: ...

    @abstractmethod
    def keys(self) -> list[str]: ...


class LocalWormBackend(StorageBackend):
    def __init__(self, root: str | Path) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, object_key: str) -> Path:
        # Contain the key under root; reject traversal.
        p = (self.root / object_key).resolve()
        if not str(p).startswith(str(self.root.resolve())):
            raise ValueError(f"object_key escapes storage root: {object_key}")
        return p

    def put(self, object_key: str, data: bytes) -> None:
        p = self._path(object_key)
        if p.exists():
            raise WriteOnceError(f"{object_key} already written (write-once)")
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)

    def get(self, object_key: str) -> bytes:
        return self._path(object_key).read_bytes()

    def exists(self, object_key: str) -> bool:
        return self._path(object_key).exists()

    def keys(self) -> list[str]:
        root = self.root.resolve()
        return sorted(
            str(p.resolve().relative_to(root)) for p in self.root.rglob("*") if p.is_file()
        )

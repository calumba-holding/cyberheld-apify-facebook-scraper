"""Object storage backends. The Sealing Service is the ONLY caller of ``put``.

``LocalWormBackend`` emulates write-once semantics for dev/tests; the real WORM
object store (MinIO / S3 Object Lock) lands in issue #35 behind this interface.
"""

from __future__ import annotations

import datetime as dt
import json
from abc import ABC, abstractmethod
from pathlib import Path


class WriteOnceError(RuntimeError):
    """Raised when an already-written object key is written again (WORM)."""


class StorageBackend(ABC):
    @abstractmethod
    def put(
        self,
        object_key: str,
        data: bytes,
        retain_until: dt.datetime | None = None,
        legal_hold: bool = False,
    ) -> None: ...

    @abstractmethod
    def get(self, object_key: str) -> bytes: ...

    @abstractmethod
    def exists(self, object_key: str) -> bool: ...

    @abstractmethod
    def keys(self) -> list[str]: ...

    # --- WORM controls (retention + legal hold) -------------------------
    def set_legal_hold(self, object_key: str, on: bool) -> None:
        raise NotImplementedError

    def get_legal_hold(self, object_key: str) -> bool:
        raise NotImplementedError

    def get_retention(self, object_key: str) -> dict | None:
        """Return {'mode', 'retain_until'} or None if unset."""
        raise NotImplementedError


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

    def _meta_path(self, object_key: str) -> Path:
        return self._path(object_key + ".wormmeta")

    def put(
        self,
        object_key: str,
        data: bytes,
        retain_until: dt.datetime | None = None,
        legal_hold: bool = False,
    ) -> None:
        p = self._path(object_key)
        if p.exists():
            raise WriteOnceError(f"{object_key} already written (write-once)")
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        # Emulate retention/legal-hold metadata (real enforcement is S3 Object Lock).
        self._meta_path(object_key).write_text(
            json.dumps(
                {
                    "mode": "COMPLIANCE" if retain_until else None,
                    "retain_until": retain_until.isoformat() if retain_until else None,
                    "legal_hold": legal_hold,
                }
            )
        )

    def get(self, object_key: str) -> bytes:
        return self._path(object_key).read_bytes()

    def exists(self, object_key: str) -> bool:
        return self._path(object_key).exists()

    def keys(self) -> list[str]:
        root = self.root.resolve()
        return sorted(
            str(p.resolve().relative_to(root))
            for p in self.root.rglob("*")
            if p.is_file() and not p.name.endswith(".wormmeta")
        )

    def _meta(self, object_key: str) -> dict:
        mp = self._meta_path(object_key)
        return json.loads(mp.read_text()) if mp.exists() else {}

    def set_legal_hold(self, object_key: str, on: bool) -> None:
        meta = self._meta(object_key)
        meta["legal_hold"] = on
        self._meta_path(object_key).write_text(json.dumps(meta))

    def get_legal_hold(self, object_key: str) -> bool:
        return bool(self._meta(object_key).get("legal_hold", False))

    def get_retention(self, object_key: str) -> dict | None:
        meta = self._meta(object_key)
        if not meta.get("retain_until"):
            return None
        return {"mode": meta.get("mode"), "retain_until": meta["retain_until"]}

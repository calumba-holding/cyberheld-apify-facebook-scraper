"""Sealing Service (#34) — the only route to storage. Nothing is stored unsealed.

For each artifact in a capture bundle:
  ① SHA-256                          -> recorded in the Metadata DB (hashes)
  ② RFC 3161 trusted timestamp       -> token stored with the hash
  ③ signed manifest + custody log    -> the machine-generated proof of integrity

The manifest is the line between "a screenshot of what I saw" and "this existed
at <time> and has not been touched since". It is verifiable offline with only the
public key (see verify_package).
"""

from __future__ import annotations

import base64
import hashlib
import json
import uuid
from dataclasses import dataclass

from sqlalchemy.orm import Session

from metadata_db.repository import Repository

from .bundle import CaptureBundle
from .signer import ManifestSigner, verify_signature
from .storage import StorageBackend
from .timestamper import Timestamper, utcnow_iso

MANIFEST_VERSION = 1


def _canonical(manifest: dict) -> bytes:
    """Deterministic bytes for signing/verifying (signature field excluded)."""
    body = {k: v for k, v in manifest.items() if k != "signature"}
    return json.dumps(body, sort_keys=True, separators=(",", ":")).encode()


@dataclass
class SealResult:
    manifest: dict
    manifest_bytes: bytes
    signature: bytes
    public_key: bytes
    object_keys: list[str]


class SealingService:
    def __init__(
        self,
        storage: StorageBackend,
        timestamper: Timestamper,
        signer: ManifestSigner,
    ) -> None:
        self._storage = storage
        self._ts = timestamper
        self._signer = signer

    def seal(self, session: Session, bundle: CaptureBundle) -> SealResult:
        repo = Repository(session)
        job_id = bundle.job_id

        # Custody: write the step down BEFORE doing it.
        step_index = repo.next_step_index(job_id)
        repo.start_step(
            job_id, step_index, "seal",
            detail={"worker_id": bundle.worker_id, "artifact_count": len(bundle.artifacts)},
        )

        sealed_artifacts: list[dict] = []
        object_keys: list[str] = []
        for art in bundle.artifacts:
            digest = hashlib.sha256(art.data).hexdigest()
            object_key = f"{job_id}/{art.kind}/{art.filename}"
            self._storage.put(object_key, art.data)  # write-once
            token = self._ts.timestamp(bytes.fromhex(digest))

            asset = repo.add_media_asset(
                job_id, kind=art.kind, object_key=object_key,
                content_item_id=art.content_item_id,
                byte_size=len(art.data), mime_type=art.mime_type,
            )
            repo.record_hash(asset.id, digest=digest, rfc3161_token=token.token)
            repo.mark_asset_sealed(asset.id)

            object_keys.append(object_key)
            sealed_artifacts.append({
                "object_key": object_key,
                "kind": art.kind,
                "mime_type": art.mime_type,
                "byte_size": len(art.data),
                "sha256": digest,
                "timestamp": {
                    "tsa": token.tsa,
                    "at": token.timestamp,
                    "qualified": token.qualified,
                    "token_b64": base64.b64encode(token.token).decode(),
                },
            })

        # Tick the seal step off AFTER doing it, then snapshot the custody log.
        repo.finish_step(job_id, step_index, "succeeded")
        custody_log = [
            {
                "step_index": s.step_index,
                "name": s.name,
                "state": s.state,
                "started_at": s.started_at.isoformat() if s.started_at else None,
                "finished_at": s.finished_at.isoformat() if s.finished_at else None,
            }
            for s in repo.custody_log(job_id)
        ]

        manifest = {
            "manifest_version": MANIFEST_VERSION,
            "job_id": str(job_id),
            "worker_id": bundle.worker_id,
            "sealed_at": utcnow_iso(),
            "tsa": self._ts.tsa,
            "artifacts": sealed_artifacts,
            "custody_log": custody_log,
        }
        manifest_bytes = _canonical(manifest)
        signature = self._signer.sign(manifest_bytes)
        public_key = self._signer.public_key_bytes()

        # The manifest + signature are themselves sealed artifacts of the job.
        man_key = f"{job_id}/manifest/manifest.json"
        sig_key = f"{job_id}/manifest/manifest.sig"
        self._storage.put(man_key, manifest_bytes)
        self._storage.put(sig_key, signature)
        man_asset = repo.add_media_asset(
            job_id, kind="manifest", object_key=man_key,
            byte_size=len(manifest_bytes), mime_type="application/json",
        )
        repo.record_hash(man_asset.id, digest=hashlib.sha256(manifest_bytes).hexdigest())
        repo.mark_asset_sealed(man_asset.id)
        object_keys += [man_key, sig_key]

        repo.set_job_status(job_id, "succeeded")

        return SealResult(
            manifest={**manifest, "signature": base64.b64encode(signature).decode()},
            manifest_bytes=manifest_bytes,
            signature=signature,
            public_key=public_key,
            object_keys=object_keys,
        )


def verify_package(
    manifest_bytes: bytes,
    signature: bytes,
    public_key: bytes,
    storage: StorageBackend,
) -> tuple[bool, list[str]]:
    """Offline verification: signature valid AND every stored artifact still hashes
    to what the manifest recorded. Returns (ok, problems)."""
    problems: list[str] = []
    if not verify_signature(public_key, manifest_bytes, signature):
        problems.append("manifest signature invalid")
        return False, problems

    manifest = json.loads(manifest_bytes)
    for art in manifest.get("artifacts", []):
        key = art["object_key"]
        try:
            data = storage.get(key)
        except Exception:
            problems.append(f"missing artifact: {key}")
            continue
        actual = hashlib.sha256(data).hexdigest()
        if actual != art["sha256"]:
            problems.append(f"hash mismatch (tampered): {key}")
    return (len(problems) == 0), problems

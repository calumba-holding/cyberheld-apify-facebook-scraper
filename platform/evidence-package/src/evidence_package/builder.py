"""Evidence Package builder (#40).

Assembles a self-contained `zip` for a job: the sealed artifacts (from WORM), a
signed package manifest with each artifact's SHA-256 + RFC 3161 timestamp, and the
machine-generated custody log (from the Metadata DB). The zip verifies **offline**
with only what it contains — so it stays valid after every source account, post, or
even the live systems are gone.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import uuid
import zipfile

from sqlalchemy import select

from metadata_db.models import Case, Hash, Job, MediaAsset
from metadata_db.repository import Repository

from sealing import ManifestSigner


def _canonical(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()


def build_package(session, job_id, storage, signer: ManifestSigner | None = None) -> bytes:
    signer = signer or ManifestSigner.from_env()
    jid = uuid.UUID(str(job_id))
    job = session.get(Job, jid)
    if job is None:
        raise LookupError(f"job {jid} not found")
    case = session.get(Case, job.case_id)

    rows = session.execute(
        select(MediaAsset, Hash)
        .join(Hash, Hash.media_asset_id == MediaAsset.id, isouter=True)
        .where(MediaAsset.job_id == jid)
    ).all()

    custody = [
        {
            "step_index": s.step_index, "name": s.name, "state": s.state,
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "finished_at": s.finished_at.isoformat() if s.finished_at else None,
        }
        for s in Repository(session).custody_log(jid)
    ]

    files: dict[str, bytes] = {}
    artifacts: list[dict] = []
    for asset, h in rows:
        data = storage.get(asset.object_key)
        files[asset.object_key] = data
        artifacts.append({
            "name": asset.object_key,
            "kind": asset.kind,
            "sha256": h.digest if h else hashlib.sha256(data).hexdigest(),
            "rfc3161_token_b64": base64.b64encode(h.rfc3161_token).decode()
                if (h and h.rfc3161_token) else None,
            "sealed_at": asset.sealed_at.isoformat() if asset.sealed_at else None,
        })

    manifest = {
        "package_version": 1,
        "job_id": str(jid),
        "job_type": job.job_type,
        "case": {"id": str(case.id), "external_ref": case.external_ref} if case else None,
        "artifacts": sorted(artifacts, key=lambda a: a["name"]),
        "custody_log": custody,
    }
    manifest_bytes = _canonical(manifest)
    signature = signer.sign(manifest_bytes)
    public_key = signer.public_key_bytes()

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("package_manifest.json", manifest_bytes)
        z.writestr("package_manifest.sig", signature)
        z.writestr("public_key.b64", base64.b64encode(public_key))
        z.writestr("custody_log.json", _canonical(custody))
        z.writestr("README.txt", _readme(manifest))
        for name, data in files.items():
            z.writestr(f"artifacts/{name}", data)
    return buf.getvalue()


def _readme(manifest: dict) -> str:
    return (
        "Evidence package\n"
        f"job_id: {manifest['job_id']}\n"
        f"artifacts: {len(manifest['artifacts'])}\n\n"
        "Verify with evidence_package.verify_package_zip(zip_bytes): checks the Ed25519\n"
        "signature over package_manifest.json and re-hashes every file in artifacts/.\n"
        "Self-contained — no live service required.\n"
    )

"""Behavioral tests for the Sealing Service (#34), against real Postgres + storage."""

from __future__ import annotations

import hashlib

import pytest
from sqlalchemy import select

from metadata_db.models import Hash, JobStep, MediaAsset
from metadata_db.repository import Repository

from sealing import ArtifactInput, CaptureBundle, verify_package
from sealing.storage import WriteOnceError

PNG = b"\x89PNG\r\n\x1a\n fake screenshot bytes"
JSON = b'{"comments": 37, "post": "x"}'


def _bundle(job_id):
    return CaptureBundle(
        job_id=job_id,
        worker_id="fb-worker-1",
        artifacts=[
            ArtifactInput("screenshot", "post-01.png", PNG, "image/png"),
            ArtifactInput("other", "engagement.json", JSON, "application/json"),
        ],
    )


def test_nothing_in_storage_until_sealed(storage):
    assert storage.keys() == []  # nothing is stored unsealed


def test_seal_records_hashes_and_stores_artifacts(service, session, storage, job):
    result = service.seal(session, _bundle(job.id))
    session.commit()

    # Every artifact stored + hashed with the true SHA-256.
    assert storage.exists(f"{job.id}/screenshot/post-01.png")
    assert storage.exists(f"{job.id}/other/engagement.json")
    repo_hashes = session.execute(select(Hash)).scalars().all()
    digest_by_none = {h.digest for h in repo_hashes}
    assert hashlib.sha256(PNG).hexdigest() in digest_by_none
    assert hashlib.sha256(JSON).hexdigest() in digest_by_none

    # media_assets are marked sealed.
    assets = session.execute(select(MediaAsset)).scalars().all()
    assert assets and all(a.sealed_at is not None for a in assets)

    # Manifest is signed and lists both content artifacts.
    assert result.manifest["worker_id"] == "fb-worker-1"
    kinds = {a["kind"] for a in result.manifest["artifacts"]}
    assert {"screenshot", "other"} <= kinds


def test_package_verifies_offline(service, session, storage, job):
    result = service.seal(session, _bundle(job.id))
    session.commit()
    ok, problems = verify_package(
        result.manifest_bytes, result.signature, result.public_key, storage
    )
    assert ok, problems


def test_tampered_artifact_fails_verification(service, session, storage, job):
    result = service.seal(session, _bundle(job.id))
    session.commit()
    # Tamper at rest (bypass WORM by writing the underlying file directly).
    target = storage._path(f"{job.id}/other/engagement.json")
    target.write_bytes(b'{"comments": 9999}')
    ok, problems = verify_package(
        result.manifest_bytes, result.signature, result.public_key, storage
    )
    assert not ok
    assert any("tampered" in p for p in problems)


def test_tampered_manifest_fails_signature(service, session, storage, job):
    result = service.seal(session, _bundle(job.id))
    session.commit()
    forged = bytearray(result.manifest_bytes)
    forged[10] ^= 0x01
    ok, problems = verify_package(
        bytes(forged), result.signature, result.public_key, storage
    )
    assert not ok
    assert any("signature" in p for p in problems)


def test_seal_writes_custody_step(service, session, job):
    service.seal(session, _bundle(job.id))
    session.commit()
    steps = (
        session.execute(select(JobStep).where(JobStep.job_id == job.id)).scalars().all()
    )
    seal_steps = [s for s in steps if s.name == "seal"]
    assert len(seal_steps) == 1
    assert seal_steps[0].state == "succeeded"
    assert seal_steps[0].finished_at is not None
    # job flipped to succeeded
    assert Repository(session).s.get(type(job), job.id).status == "succeeded"


def test_write_once_blocks_reseal(service, session, job):
    service.seal(session, _bundle(job.id))
    session.commit()
    with pytest.raises(WriteOnceError):
        service.seal(session, _bundle(job.id))


def test_encapsulates_existing_scraper_output(service, session, storage, job, tmp_path):
    """The current Node scraper's `out/` artifacts flow through sealing unchanged."""
    from sealing.capture_import import bundle_from_directory

    out = tmp_path / "out"
    out.mkdir()
    (out / "run_post-01.png").write_bytes(PNG)
    (out / "run_session-01.webm").write_bytes(b"WEBMfake")
    (out / "run_engagement.json").write_bytes(JSON)

    bundle = bundle_from_directory(job.id, out, worker_id="fb-worker-1")
    result = service.seal(session, bundle)
    session.commit()

    kinds = {a["kind"] for a in result.manifest["artifacts"]}
    assert {"screenshot", "video", "other"} <= kinds
    ok, problems = verify_package(
        result.manifest_bytes, result.signature, result.public_key, storage
    )
    assert ok, problems

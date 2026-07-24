"""Evidence Package tests (#40) — build from real sealed data, verify offline."""

from __future__ import annotations

import io
import shutil
import zipfile

import pytest

from metadata_db.engine import make_engine, make_session_factory, ping, reset_schema
from metadata_db.repository import Repository

from sealing import ArtifactInput, CaptureBundle, LocalDevTimestamper, LocalWormBackend, ManifestSigner, SealingService

from evidence_package import build_package, verify_package_zip


@pytest.fixture()
def sealed(tmp_path):
    eng = make_engine()
    if not ping(eng):
        pytest.skip("Postgres not reachable")
    reset_schema(eng)
    storage = LocalWormBackend(tmp_path / "worm")
    signer = ManifestSigner.generate()
    service = SealingService(storage, LocalDevTimestamper(signer), signer)
    with make_session_factory(eng)() as s:
        repo = Repository(s)
        case = repo.open_case(external_ref="CASE-PKG")
        job = repo.create_job(case.id, "fb/post", "https://fb.com/x")
        s.commit()
        bundle = CaptureBundle(
            job_id=job.id, worker_id="fb-worker-1",
            artifacts=[
                ArtifactInput("screenshot", "post-01.png", b"\x89PNG shot", "image/png"),
                ArtifactInput("other", "engagement.json", b'{"comments":37}', "application/json"),
            ],
        )
        service.seal(s, bundle)
        s.commit()
        return {"job_id": str(job.id), "storage": storage, "engine": eng, "tmp": tmp_path}


def _build(sealed):
    eng = sealed["engine"]
    with make_session_factory(eng)() as s:
        return build_package(s, sealed["job_id"], sealed["storage"])


def test_package_contains_expected_members(sealed):
    zip_bytes = _build(sealed)
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        names = z.namelist()
    assert "package_manifest.json" in names
    assert "package_manifest.sig" in names
    assert "custody_log.json" in names
    assert any(n.startswith("artifacts/") and n.endswith("post-01.png") for n in names)


def test_package_verifies_offline(sealed):
    ok, problems = verify_package_zip(_build(sealed))
    assert ok, problems


def test_tampered_artifact_fails(sealed):
    zip_bytes = _build(sealed)
    # rewrite one artifact inside the zip
    buf = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zin, zipfile.ZipFile(buf, "w") as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename.endswith("engagement.json"):
                data = b'{"comments":9999}'
            zout.writestr(item, data)
    ok, problems = verify_package_zip(buf.getvalue())
    assert not ok and any("tampered" in p for p in problems)


def test_valid_after_source_deleted(sealed):
    """The zip is self-contained: wiping the DB and WORM store does not affect it."""
    zip_bytes = _build(sealed)
    # destroy the sources
    reset_schema(sealed["engine"])                      # drop all metadata
    shutil.rmtree(sealed["tmp"] / "worm", ignore_errors=True)  # delete WORM store
    ok, problems = verify_package_zip(zip_bytes)         # still verifies
    assert ok, problems

"""WORM object store tests (#35).

The S3 tests run against a real MinIO with Object Lock (skipped if unreachable).
Set MINIO_ENDPOINT (default http://localhost:59000) + creds to run.
"""

from __future__ import annotations

import datetime as dt
import os
import uuid

import pytest

from sealing.storage import LocalWormBackend, WriteOnceError

MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "http://localhost:59000")
MINIO_KEY = os.environ.get("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET = os.environ.get("MINIO_SECRET_KEY", "minioadmin")


def _minio_up() -> bool:
    import urllib.error
    import urllib.request

    try:
        urllib.request.urlopen(f"{MINIO_ENDPOINT}/minio/health/live", timeout=2)
        return True
    except (urllib.error.URLError, OSError):
        return False


s3only = pytest.mark.skipif(not _minio_up(), reason="MinIO not reachable")


@pytest.fixture()
def worm():
    from sealing import S3WormBackend

    backend = S3WormBackend(
        bucket=f"ec-test-{uuid.uuid4().hex[:12]}",
        endpoint_url=MINIO_ENDPOINT,
        access_key=MINIO_KEY,
        secret_key=MINIO_SECRET,
        default_retention_days=1,  # bucket default protects every object
    )
    backend.ensure_bucket()
    return backend


# --- interface parity: LocalWorm --------------------------------------------
def test_local_worm_write_once_and_metadata(tmp_path):
    b = LocalWormBackend(tmp_path)
    ru = dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=1)
    b.put("a/b.txt", b"hi", retain_until=ru, legal_hold=True)
    assert b.get("a/b.txt") == b"hi"
    assert b.keys() == ["a/b.txt"]  # .wormmeta sidecars excluded
    assert b.get_legal_hold("a/b.txt") is True
    assert b.get_retention("a/b.txt")["mode"] == "COMPLIANCE"
    with pytest.raises(WriteOnceError):
        b.put("a/b.txt", b"overwrite")


# --- real S3 Object Lock -----------------------------------------------------
@s3only
def test_s3_put_get_roundtrip(worm):
    worm.put("job/x/a.png", b"PNGBYTES")
    assert worm.exists("job/x/a.png")
    assert worm.get("job/x/a.png") == b"PNGBYTES"
    assert "job/x/a.png" in worm.keys()


@s3only
def test_s3_app_level_write_once(worm):
    worm.put("job/x/a.png", b"one")
    with pytest.raises(WriteOnceError):
        worm.put("job/x/a.png", b"two")


@s3only
def test_s3_default_retention_protects_object(worm):
    # No explicit retain_until — bucket DefaultRetention should still apply.
    worm.put("job/x/a.png", b"data")
    r = worm.get_retention("job/x/a.png")
    assert r is not None and r["mode"] == "COMPLIANCE"


@s3only
def test_s3_locked_version_cannot_be_deleted(worm):
    ru = dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=5)
    worm.put("job/x/a.png", b"data", retain_until=ru)
    from botocore.exceptions import ClientError

    version = worm._current_version("job/x/a.png")
    with pytest.raises(ClientError):
        worm._s3.delete_object(Bucket=worm.bucket, Key="job/x/a.png", VersionId=version)


@s3only
def test_s3_legal_hold_reports_and_blocks(worm):
    worm.put("job/x/a.png", b"data", legal_hold=True)
    assert worm.get_legal_hold("job/x/a.png") is True
    from botocore.exceptions import ClientError

    version = worm._current_version("job/x/a.png")
    with pytest.raises(ClientError):
        worm._s3.delete_object(Bucket=worm.bucket, Key="job/x/a.png", VersionId=version)
    worm.set_legal_hold("job/x/a.png", False)
    assert worm.get_legal_hold("job/x/a.png") is False

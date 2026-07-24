"""S3 / MinIO WORM object store (#35) behind the StorageBackend interface.

Uses S3 Object Lock (write-once) with per-object COMPLIANCE retention + legal hold.
Object Lock requires a versioned bucket created with ObjectLockEnabledForBucket; a
bucket-level DefaultRetention protects every object even when a caller does not pass
an explicit retain_until.

boto3 is imported lazily so LocalWormBackend users don't need it.
"""

from __future__ import annotations

import datetime as dt

from .storage import StorageBackend, WriteOnceError


class S3WormBackend(StorageBackend):
    def __init__(
        self,
        bucket: str,
        *,
        endpoint_url: str | None = None,
        access_key: str,
        secret_key: str,
        region: str = "us-east-1",
        lock_mode: str = "COMPLIANCE",
        default_retention_days: int | None = 3650,
    ) -> None:
        import boto3
        from botocore.config import Config

        self.bucket = bucket
        self.lock_mode = lock_mode
        self.default_retention_days = default_retention_days
        self._s3 = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
            config=Config(signature_version="s3v4"),
        )

    # --- setup ----------------------------------------------------------
    def ensure_bucket(self) -> None:
        from botocore.exceptions import ClientError

        try:
            self._s3.head_bucket(Bucket=self.bucket)
        except ClientError:
            self._s3.create_bucket(Bucket=self.bucket, ObjectLockEnabledForBucket=True)
        if self.default_retention_days:
            self._s3.put_object_lock_configuration(
                Bucket=self.bucket,
                ObjectLockConfiguration={
                    "ObjectLockEnabled": "Enabled",
                    "Rule": {
                        "DefaultRetention": {
                            "Mode": self.lock_mode,
                            "Days": self.default_retention_days,
                        }
                    },
                },
            )

    # --- StorageBackend -------------------------------------------------
    def put(
        self,
        object_key: str,
        data: bytes,
        retain_until: dt.datetime | None = None,
        legal_hold: bool = False,
    ) -> None:
        if self.exists(object_key):
            raise WriteOnceError(f"{object_key} already written (write-once)")
        kwargs: dict = {"Bucket": self.bucket, "Key": object_key, "Body": data}
        if retain_until is not None:
            kwargs["ObjectLockMode"] = self.lock_mode
            kwargs["ObjectLockRetainUntilDate"] = retain_until
        if legal_hold:
            kwargs["ObjectLockLegalHoldStatus"] = "ON"
        self._s3.put_object(**kwargs)

    def get(self, object_key: str) -> bytes:
        return self._s3.get_object(Bucket=self.bucket, Key=object_key)["Body"].read()

    def exists(self, object_key: str) -> bool:
        from botocore.exceptions import ClientError

        try:
            self._s3.head_object(Bucket=self.bucket, Key=object_key)
            return True
        except ClientError:
            return False

    def keys(self) -> list[str]:
        out: list[str] = []
        token: str | None = None
        while True:
            kw = {"Bucket": self.bucket}
            if token:
                kw["ContinuationToken"] = token
            resp = self._s3.list_objects_v2(**kw)
            out += [o["Key"] for o in resp.get("Contents", [])]
            if not resp.get("IsTruncated"):
                break
            token = resp.get("NextContinuationToken")
        return sorted(out)

    # --- WORM controls --------------------------------------------------
    def _current_version(self, object_key: str) -> str:
        return self._s3.head_object(Bucket=self.bucket, Key=object_key)["VersionId"]

    def set_legal_hold(self, object_key: str, on: bool) -> None:
        self._s3.put_object_legal_hold(
            Bucket=self.bucket,
            Key=object_key,
            LegalHold={"Status": "ON" if on else "OFF"},
        )

    def get_legal_hold(self, object_key: str) -> bool:
        resp = self._s3.get_object_legal_hold(Bucket=self.bucket, Key=object_key)
        return resp["LegalHold"]["Status"] == "ON"

    def get_retention(self, object_key: str) -> dict | None:
        from botocore.exceptions import ClientError

        try:
            r = self._s3.get_object_retention(Bucket=self.bucket, Key=object_key)[
                "Retention"
            ]
        except ClientError:
            return None
        return {"mode": r["Mode"], "retain_until": r["RetainUntilDate"].isoformat()}


def build_from_env() -> S3WormBackend:
    """Construct a WORM backend from S3_*/MINIO_* env vars and ensure the bucket."""
    import os

    backend = S3WormBackend(
        bucket=os.environ.get("EVIDENCE_BUCKET", "evidence"),
        endpoint_url=os.environ.get("S3_ENDPOINT", os.environ.get("MINIO_ENDPOINT")),
        access_key=os.environ.get("S3_ACCESS_KEY", os.environ.get("MINIO_ACCESS_KEY", "minioadmin")),
        secret_key=os.environ.get("S3_SECRET_KEY", os.environ.get("MINIO_SECRET_KEY", "minioadmin")),
        region=os.environ.get("S3_REGION", "us-east-1"),
        lock_mode=os.environ.get("EVIDENCE_LOCK_MODE", "COMPLIANCE"),
        default_retention_days=int(os.environ.get("EVIDENCE_RETENTION_DAYS", "3650")),
    )
    backend.ensure_bucket()
    return backend

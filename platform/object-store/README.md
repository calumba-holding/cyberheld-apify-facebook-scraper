# Object store (WORM) — #35

Write-once evidence storage. **Nothing is stored here except through the Sealing
Service (#34).** Implemented as `sealing.s3_storage.S3WormBackend` behind the
`StorageBackend` interface; this dir provides the dev MinIO.

## Guarantees (S3 Object Lock)

- Bucket created with Object Lock enabled (versioned); a **DefaultRetention**
  (COMPLIANCE, `EVIDENCE_RETENTION_DAYS`) protects every object even without an
  explicit per-object retention.
- A locked object **version cannot be deleted or overwritten** within retention
  (a plain delete only writes a delete marker; the version stays immutable).
- **Legal hold** pins an object indefinitely regardless of retention.

## ⚠️ GDPR launch gate (decide before production)

Indefinite retention of personal data is not GDPR-defensible. `EVIDENCE_RETENTION_DAYS`
(default 3650) + the per-case retention path and legal-hold exception must be set to a
defensible policy **before launch**. This is an explicit decision, not a default to ship.

## Dev

```bash
cd platform/object-store && docker compose up -d      # MinIO S3 on :59000, console :59001
export MINIO_ENDPOINT=http://localhost:59000
cd ../sealing && pytest tests/test_worm_store.py       # S3 tests run against it
```

Config env: `S3_ENDPOINT`/`MINIO_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`,
`EVIDENCE_BUCKET`, `EVIDENCE_LOCK_MODE`, `EVIDENCE_RETENTION_DAYS`.

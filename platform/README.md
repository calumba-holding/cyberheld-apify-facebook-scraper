# platform/ — evidence-capture control plane

The Python control plane the project is building toward (see
`../docs/evidence-capture-architecture.md`). The existing Node/TS scraper is a
**capture worker** behind the worker contract (`../docs/worker-contract.md`), not a
separate program — this is where the whole codebase gets encapsulated in the
architecture, one service at a time.

## Services

| Dir | Issue | Phase | Status |
|-----|-------|-------|--------|
| `metadata-db/` | #33 | P1 | ✅ built — queryable index + custody log |
| `sealing/` | #34 | P1 | ✅ built — only route to storage (SHA-256 + TSA + signed manifest) |
| `object-store/` | #35 | P1 | ✅ built — S3/MinIO Object Lock WORM (`sealing.s3_storage.S3WormBackend`) |
| `ingest-api/` | #36 | P2 | ✅ built — FastAPI one door (202 + job_id, capture/enrich/status) |
| `workflow-engine/` | #37 | P2 | ✅ built — Temporal; one workflow/job, custody journal, seals |
| `capability-router/` | #38 | P2 | ✅ built — per-pool task queues + independent concurrency |
| `session-pool/` | #43 | P3 | ✅ built — health-scored accounts, atomic lease, quarantine-first |
| `connectors/` | #39 | P4 | ✅ built — external-API wrappers behind /enrich/*, results sealed |
| `processing/` | #45 | P4 | ✅ built — ffmpeg frames + tesseract OCR (+Whisper iface), derived artifacts sealed |
| `evidence-package/` | #40 | P5 | ✅ built — self-contained, offline-verifiable zip (valid after source deleted) |

## Stack

Python 3.11+ · SQLAlchemy 2.0 · Postgres 17 · cryptography (Ed25519). Each service
owns a `src/` package + `tests/`; SQL migrations are authoritative for DB schema.

## Dev

```bash
cd platform/metadata-db && docker compose up -d      # Postgres on :55432
python3 -m venv .venv && source .venv/bin/activate
pip install -r metadata-db/requirements.txt -r sealing/requirements.txt
export DATABASE_URL=postgresql://postgres:dev@localhost:55432/evidence
( cd metadata-db && pytest )
( cd sealing && pytest )
```

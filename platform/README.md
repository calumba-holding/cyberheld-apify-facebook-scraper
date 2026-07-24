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
| _(object store)_ | #35 | P1 | ⬜ WORM store behind `sealing.storage.StorageBackend` |
| _(ingest api)_ | #36 | P2 | ⬜ FastAPI one door |
| _(temporal)_ | #37 | P2 | ⬜ durable workflow / custody journal |
| _(router)_ | #38 | P2 | ⬜ per-pool queues |

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

# Metadata DB

The queryable index over sealed evidence — **Phase 1 (custody spine)**, issue #33.
See `../../docs/evidence-capture-architecture.md`.

Holds: `cases · jobs · job_steps (custody log) · entities · content_items · media_assets · hashes`.
The **`job_steps`** table is the machine-generated **chain of custody**: append-only, written by the
workflow engine (Temporal, #37) before each step and ticked off after. Integrity is enforced by DB
triggers, not by application code.

## Schema authority

`migrations/0001_init.sql` is the source of truth for DDL (constraints, triggers, defaults).
`src/metadata_db/models.py` mirrors it for Python callers (Sealing #34, Ingest API #36) and must be
kept in sync.

## Run locally

```bash
cd platform/metadata-db
docker compose up -d                 # Postgres 17 on localhost:55432

python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# apply schema
python -c "from metadata_db.engine import make_engine, migrate_up; migrate_up(make_engine())"

# run tests (resets schema per test against the running Postgres)
pip install pytest && pytest
```

Override the connection with `DATABASE_URL` (default `postgresql://postgres:dev@localhost:55432/evidence`).

## Design invariants (tested)

- `job_steps` cannot be deleted, reordered, or have `job_id/step_index/name/started_at` rewritten.
- A step that reached a terminal state (`succeeded/failed/skipped`) cannot change state again.
- `hashes` is 1:1 with `media_assets`.
- `entities` are unique per `(platform, handle)` and store handles only — **no identity resolution**.

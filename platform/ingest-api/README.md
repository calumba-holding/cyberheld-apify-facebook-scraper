# Ingest API (#36) — the one door

FastAPI. Every entry point (Case UI, MCP/chat, direct clients) comes through here.
It **validates, opens a case + job, and returns `202 + job_id` immediately** — it
never blocks on capture. See `../../docs/evidence-capture-architecture.md`.

## Routes (all require `X-API-Key`, except `/health`)

- **capture:** `POST /fb/profile · /fb/post · /fb/reel · /ig/profile · /ig/post · /tiktok/profile · /tiktok/post`
  body: `{ "target_url": "...", "case_id"?: "...", "external_ref"?: "...", "max_posts"?: n }`
- **enrich:** `POST /enrich/email-verify · /enrich/domain` — body: `{ "value": "...", "case_id"?: "..." }`
- **status:** `GET /jobs/{job_id}` → job status + custody-log steps
- `GET /health`

A request with no `case_id` opens a new case; passing `case_id` attaches the job to
an existing case. Response: `{ job_id, case_id, job_type, status: "queued" }`.

## Not-yet-wired (by design)

The route records the job as `queued` and returns. Dispatch to the durable workflow
engine (Temporal, #37) plugs in at the marked point in `routes.py::_accept` — the
`202 + job_id` contract is already stable, so nothing downstream changes when it lands.

## Auth

Keys from `INGEST_API_KEYS` (comma-separated) or `INGEST_API_KEY`. **Fail-closed**:
with no keys configured the API returns 503 rather than running open.

## Run

```bash
cd platform/metadata-db && docker compose up -d      # Postgres :55432
export DATABASE_URL=postgresql://postgres:dev@localhost:55432/evidence
export INGEST_API_KEY=dev-key
cd ../ingest-api && pip install -r requirements.txt
uvicorn ingest_api.app:app --reload   # http://localhost:8000/docs
pytest
```

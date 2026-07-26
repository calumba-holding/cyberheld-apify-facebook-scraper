# Central API Router

**One door in.** A single API gateway that fronts the whole evidence-capture
architecture: it authenticates, opens a case, returns `202 + job_id`, and **routes**
each request to the right capability. It **runs no scraper** and stores no evidence
itself — those are downstream capabilities it routes to.

This is the *architecture as a service*: the router owns the map of the entire system
(`GET /v1/capabilities`) and dispatches to it. Backends are interfaces/stubs — swapping
in a real backend (Temporal / the pools) doesn't change the gateway contract.

## Endpoints (all under `/v1`, `X-API-Key` required except `/health`)

- **capture** — `POST /fb/profile · /fb/post · /fb/reel · /ig/profile · /ig/post · /tiktok/profile · /tiktok/post`
  body `{ "target_url": "…", "case_id"?, "external_ref"?, "device"? }` → `202 { job_id, case_id, routed_to, pool }`
- **enrich** — `POST /enrich/email-verify · /enrich/domain` — body `{ "value": "…" }`
- **status** — `GET /jobs/{id}` (status + routing + trace), `GET /jobs`
- **architecture** — `GET /capabilities` (the full map), `GET /capabilities/{id}`
- `GET /health`, `GET /`

## Routing

`job_type → capability + pool`: `fb|ig|tiktok/*` → **browser** (or **device** with
`"device": true`), `enrich/*` → **connector**, `processing/*` → **processing**,
`watch/*` → **watch**. See `src/api_router/routing.py` and the capability map in
`src/api_router/capabilities.py`.

## Run

```bash
cd central-api-router
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export GATEWAY_API_KEY=dev-key
uvicorn api_router.app:app --port 8080     # docs at http://localhost:8080/docs
pytest                                     # no DB / no services needed
```

Auth is **fail-closed**: with no `GATEWAY_API_KEY(S)` set, every request is rejected.

## Scope

Deliberately **architecture + routing only** — no scraper, no DB, no sealing built in.
Those are downstream capabilities the router knows about and routes to. The full
platform implementation lives on `master` for reference.

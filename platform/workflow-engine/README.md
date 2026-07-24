# Workflow engine (Temporal) — #37

One workflow per job. Each step is written to the custody log **before** it runs and
ticked off **after**; a crash after step N replays from step N, not step 1. **The
execution journal is the chain of custody** — machine-generated, not written up later.
See `../../docs/evidence-capture-architecture.md`.

## Shape

- `workflows.py::CaptureWorkflow` — deterministic orchestration (no IO / no clock).
  Steps: **launch → capture → seal**. Sealing (#34) writes its own custody step and
  flips the job to `succeeded`.
- `activities.py` — all IO. Custody-log writes + `run_capture` (simulated today;
  dispatches to the Node browser worker via the Router #38 later) + `seal_bundle`
  (real Sealing service → Metadata DB + WORM store).
- `client.py::start_capture_workflow` — the hook the Ingest API (#36) calls to enqueue
  a job (plugs into `ingest_api/routes.py::_accept`).
- `worker.py` — `python -m workflow_engine.worker` runs the workflow + activities.

## Run

```bash
# 1. Postgres (custody DB)
cd platform/metadata-db && docker compose up -d
# 2. Temporal dev server (needs the `temporal` CLI: `brew install temporal`)
temporal server start-dev            # gRPC :7233, UI :8233
# 3. worker
export DATABASE_URL=postgresql://postgres:dev@localhost:55432/evidence
export EVIDENCE_STORAGE_DIR=/tmp/ec-worm
cd platform/workflow-engine && pip install -r requirements.txt
python -m workflow_engine.worker
```

## Tests

`pytest` runs the workflow end-to-end against an **ephemeral local Temporal server**
(downloaded automatically) + real Postgres — no external services needed.

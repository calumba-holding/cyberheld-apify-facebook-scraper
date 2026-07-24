# End-to-end testing — evidence-capture platform

How to verify the platform, from a single service up to the full path
**request → sealed evidence package**. Everything here runs against **real**
infrastructure (Postgres, MinIO Object Lock, an ephemeral Temporal server,
ffmpeg/tesseract) — there are no mocks in the test suites.

> Architecture: [`evidence-capture-architecture.md`](./evidence-capture-architecture.md).
> The control plane is Python (`platform/*`); the Node/TS scraper is a capture
> worker behind the [worker contract](./worker-contract.md).

---

## 0. Prerequisites

| Tool | Why | Check |
|------|-----|-------|
| Python 3.11+ | control plane | `python3 --version` |
| Docker + Compose | Postgres, MinIO | `docker info` |
| `psql` (Postgres client) | apply migrations / inspect | `psql --version` |
| `ffmpeg`, `ffprobe`, `tesseract` | Processing Workers (#45) | `ffmpeg -version` |
| `yt-dlp` | Processing download step (optional) | `yt-dlp --version` |
| `temporal` CLI | Temporal dev server (#37) | `temporal --version` (`brew install temporal`) |
| Node + pnpm/npm | the Node scraper (capture) | `node -v` |

The **test suites** need only Postgres (all services) plus MinIO (WORM tests) and
the `temporal` dev server / `WorkflowEnvironment` (workflow tests). ffmpeg/tesseract
are auto-skipped if absent.

---

## 1. One-time setup

```bash
cd facebook-scraper

# Python env for the control plane
python3 -m venv .venv && source .venv/bin/activate
pip install -r platform/metadata-db/requirements.txt \
            -r platform/sealing/requirements.txt \
            -r platform/ingest-api/requirements.txt \
            -r platform/workflow-engine/requirements.txt \
            -r platform/session-pool/requirements.txt \
            -r platform/connectors/requirements.txt \
            -r platform/processing/requirements.txt \
            -r platform/evidence-package/requirements.txt \
            -r platform/triage/requirements.txt \
            -r platform/notify/requirements.txt

# Infra
( cd platform/metadata-db  && docker compose up -d )   # Postgres  -> localhost:55432
( cd platform/object-store && docker compose up -d )   # MinIO S3  -> localhost:59000 (console :59001)

export DATABASE_URL="postgresql://postgres:dev@localhost:55432/evidence"
export MINIO_ENDPOINT="http://localhost:59000"
```

Apply all schemas (each service owns its migration):

```bash
python -c "from metadata_db.engine   import make_engine, migrate_up; migrate_up(make_engine())"    # note: run with PYTHONPATH below
# Each service's pyproject sets pythonpath; the simplest per-service form is:
( cd platform/metadata-db  && python -c "from metadata_db.engine import make_engine, migrate_up as u; u(make_engine())" )
( cd platform/session-pool && PYTHONPATH=src:../metadata-db/src python -c "from session_pool.engine import make_engine, migrate_up as u; u(make_engine())" )
( cd platform/triage       && PYTHONPATH=src:../metadata-db/src python -c "from triage.engine import make_engine, migrate_up as u; u(make_engine())" )
( cd platform/notify       && PYTHONPATH=src:../metadata-db/src python -c "from notify.engine import make_engine, migrate_up as u; u(make_engine())" )
```

---

## 2. Level 1 — per-service test suites (fastest signal)

Each service's `pyproject.toml` sets the right `PYTHONPATH`, so just `pytest` in
its directory. With `DATABASE_URL` (and `MINIO_ENDPOINT`) exported:

```bash
for s in metadata-db sealing ingest-api workflow-engine session-pool \
         connectors processing evidence-package triage notify; do
  echo "== $s =="; ( cd platform/$s && pytest -q ); done
```

What each proves (all against real infra):

| Service | Key e2e assertions |
|---------|--------------------|
| `metadata-db` | append-only custody log (trigger-enforced), hashes 1:1 with assets |
| `sealing` | SHA-256 + timestamp + signed manifest; **tampering fails offline verify** |
| `object-store` (via `sealing`) | S3 Object Lock: a locked version can't be deleted; legal hold |
| `ingest-api` | API-key auth, `202 + job_id`, case/job created, all routes |
| `workflow-engine` | **full workflow** launch→capture→seal journaled + sealed (ephemeral Temporal + real PG) |
| `capability-router` | saturated Processing pool does not starve Browser |
| `session-pool` | atomic `FOR UPDATE SKIP LOCKED` lease; quarantine-first |
| `processing` | real ffmpeg frames + tesseract OCR; derived artifacts sealed |
| `connectors` | enrichment result sealed into the evidence record |
| `evidence-package` | zip verifies **offline after DB + WORM deleted** |
| `triage` | ranks/flags; writes derived metadata; sealed evidence untouched |
| `notify` | webhook/email/MCP delivery, at-least-once, never corrupts sealed record |

`workflow-engine/tests/test_workflow.py` is the closest thing to a single
end-to-end run: it drives the real `CaptureWorkflow` through Temporal and asserts
the custody log + sealed output in Postgres.

---

## 3. Level 2 — run the live control plane and drive it by API

This exercises the real request path across process boundaries.

**Terminal A — Temporal dev server:**
```bash
temporal server start-dev            # gRPC :7233, UI http://localhost:8233
```

**Terminal B — a pool worker** (runs `CaptureWorkflow` + activities):
```bash
source .venv/bin/activate
export DATABASE_URL=postgresql://postgres:dev@localhost:55432/evidence
export EVIDENCE_STORAGE_DIR=/tmp/ec-worm            # local WORM dir the seal step writes to
cd platform/workflow-engine
PYTHONPATH=src:../metadata-db/src:../sealing/src:../capability-router/src \
  python -m workflow_engine.worker browser          # task queue pool.browser
```

**Terminal C — Ingest API:**
```bash
source .venv/bin/activate
export DATABASE_URL=postgresql://postgres:dev@localhost:55432/evidence
export INGEST_API_KEY=dev-key
cd platform/ingest-api
PYTHONPATH=src:../metadata-db/src uvicorn ingest_api.app:app --port 8000
# docs at http://localhost:8000/docs
```

**Terminal D — drive it:**
```bash
# 1. Submit a capture request (the one door)
curl -s -X POST http://localhost:8000/fb/post \
  -H "X-API-Key: dev-key" -H "content-type: application/json" \
  -d '{"target_url":"https://www.facebook.com/some/post"}'
# -> {"job_id":"...","case_id":"...","job_type":"fb/post","status":"queued"}

# 2. Poll status (custody steps appear as the workflow runs)
curl -s http://localhost:8000/jobs/<job_id> -H "X-API-Key: dev-key"
```

> **Note (honest):** today the Ingest route records the job as `queued` and the
> **worker is triggered manually / by dispatch** — the automatic hand-off is the
> one line `routes._accept` leaves for `workflow_engine.client.start_capture_workflow`.
> To drive the workflow now, either call that dispatch helper, or run the workflow
> directly (below). The `run_capture` activity is **simulated** (deterministic fake
> artifacts) until the real Node scraper is wired in (§5).

Kick a workflow directly for a created `job_id`:
```bash
cd platform/workflow-engine
PYTHONPATH=src:../metadata-db/src:../sealing/src:../capability-router/src python - <<'PY'
import asyncio, os
from workflow_engine.client import connect, start_capture_workflow
async def main():
    c = await connect()  # TEMPORAL_TARGET or localhost:7233
    job = {"job_id": os.environ["JOB_ID"], "job_type": "fb/post", "target_url": "https://fb/x"}
    h = await start_capture_workflow(c, job)   # routed to pool.browser by job_type
    print("result:", await h.result())
asyncio.run(main())
PY
```

---

## 4. Verify the outcome (what "sealed evidence" means)

After a workflow completes, verify each guarantee:

```bash
export PGURI=postgresql://postgres:dev@localhost:55432/evidence

# a) Custody log — machine-generated chain of custody, in order, terminal states
psql "$PGURI" -c "select step_index,name,state,finished_at from job_steps
                  where job_id='<job_id>' order by step_index;"

# b) Hashes recorded 1:1 with sealed artifacts
psql "$PGURI" -c "select ma.kind, ma.object_key, h.digest, ma.sealed_at
                  from media_assets ma join hashes h on h.media_asset_id=ma.id
                  where ma.job_id='<job_id>';"

# c) Artifacts + signed manifest physically in the WORM dir
ls -R $EVIDENCE_STORAGE_DIR/<job_id>/
```

Build and **offline-verify** the evidence package (needs nothing but the zip):
```bash
cd platform/evidence-package
PYTHONPATH=src:../metadata-db/src:../sealing/src python - <<'PY'
import os, uuid
from metadata_db.engine import make_engine, make_session_factory
from sealing import LocalWormBackend
from evidence_package import build_package, verify_package_zip
job_id = uuid.UUID(os.environ["JOB_ID"])
storage = LocalWormBackend(os.environ["EVIDENCE_STORAGE_DIR"])
with make_session_factory(make_engine())() as s:
    zip_bytes = build_package(s, job_id, storage)
open("/tmp/evidence.zip","wb").write(zip_bytes)
print("verify:", verify_package_zip(zip_bytes))   # (True, [])
PY
unzip -l /tmp/evidence.zip     # package_manifest.json + .sig + custody_log.json + artifacts/
```

Then the intelligence/output steps:
```bash
# LLM triage (needs ANTHROPIC_API_KEY for the real classifier; FakeClassifier otherwise)
#   from Python: triage.triage_job(session, job_id, ClaudeClassifier("threats/harassment"))
# Notify (webhook/email/MCP):
#   from Python: notify.NotifyService().notify(session, notify.build_notification(session, job_id), [WebhookChannel(url)])
```

---

## 5. Bringing in a **real** capture (Node scraper)

The Node/TS scraper stays a capture worker behind the bundle contract. To seal a
real Facebook/Instagram capture instead of the simulated one:

```bash
# 1. Run the existing scraper to produce artifacts in out/ (per repo README/CLAUDE.md)
cd facebook-scraper
npm install && npm run build
node dist/main.js --target facebook --scraper post-engagement \
  --target-url "https://www.facebook.com/..."      # writes JSON + screenshots/webm to out/

# 2. Seal that output directory into the evidence record
cd platform/sealing
PYTHONPATH=src:../metadata-db/src python - <<'PY'
import os, uuid
from metadata_db.engine import make_engine, make_session_factory
from sealing import LocalWormBackend
from sealing.capture_import import bundle_from_directory
from sealing import SealingService, LocalDevTimestamper, ManifestSigner
job_id = uuid.UUID(os.environ["JOB_ID"])          # a job you created via Ingest
bundle = bundle_from_directory(job_id, "../../out", worker_id="fb-worker-1")
signer = ManifestSigner.from_env()
svc = SealingService(LocalWormBackend(os.environ["EVIDENCE_STORAGE_DIR"]),
                     LocalDevTimestamper(signer), signer)
with make_session_factory(make_engine())() as s:
    print(svc.seal(s, bundle).object_keys); s.commit()
PY
```

This is exactly what the `run_capture` Temporal activity will call once the Node
worker is invoked through the Capability Router — the bundle boundary doesn't change.

---

## 6. Production caveats to remember when testing "for real"

- **RFC 3161 TSA:** the dev timestamper is **not** an eIDAS-qualified TSA. For
  legally-usable timestamps, plug `sealing.Rfc3161HttpTimestamper` into a qualified
  TSA (see `platform/sealing/README.md`).
- **WORM retention / GDPR:** `platform/object-store` uses COMPLIANCE Object Lock;
  set a defensible retention policy + legal-hold path **before** real evidence.
- **Signing key:** set `SEALING_SIGNING_SEED` (hex Ed25519 seed) so manifests are
  signed by a stable, custodied key — otherwise each process generates an ephemeral one.
- **Device Workers (#44):** not built — needs Android/adb hardware.

---

## 7. Teardown

```bash
( cd platform/metadata-db  && docker compose down -v )
( cd platform/object-store && docker compose down -v )
# stop the temporal dev server (Ctrl-C in Terminal A)
```

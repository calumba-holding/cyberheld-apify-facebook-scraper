# Capability Router (#38) — per-pool queues

Routes each job to a worker **pool**, each of which is an independent Temporal task
queue with its own concurrency limit — so a saturated pool (heavy video **Processing**)
cannot starve another (the **Browser** capture devices). See
`../../docs/evidence-capture-architecture.md`.

## Pools & routing

| Pool | Task queue | Default concurrency | Gets |
|------|-----------|--------------------|------|
| browser | `pool.browser` | 5 | `fb/* · ig/* · tiktok/*` capture (default) |
| device | `pool.device` | 10 | explicit `device:<job_type>` (app-only) |
| watch | `pool.watch` | 8 | `watch/*` |
| processing | `pool.processing` | 2 | `processing/*` (yt-dlp/ffmpeg/Whisper) |
| connector | `pool.connector` | 8 | `enrich/*` |

`route(job_type) -> Pool` / `task_queue_for(job_type) -> "pool.<name>"`. Limits are
overridable per pool via `EC_POOL_<NAME>_CONCURRENCY`.

## How it's wired

- **Dispatch:** `workflow_engine.client.start_capture_workflow` uses `task_queue_for`
  to enqueue a job on its pool queue (the Ingest API calls this).
- **Workers:** `python -m workflow_engine.worker <pool>` runs one pool's worker with
  `task_queue = pool.task_queue` and `max_concurrent_activities = pool.max_concurrency`.
  Run one per pool; each scales independently.

## The guarantee (tested)

`PoolScheduler` models the same invariant the Temporal workers enforce, and a test
proves it: with Processing saturated to its limit, a Browser job still acquires its
slot immediately — no cross-pool starvation.

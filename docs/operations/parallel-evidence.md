# Operations: parallel evidence capture

Guidance for running large `post-screenshot` batches with the worker pool (`--workers`/`--worker-concurrency`).
See `docs/contracts/cli.md` for the full flag contract and `docs/plans/evidence-collection-parallel-screenshots.md`
for the original design.

## Recommended starting point

Start conservative and tune upward while watching for blocks/login walls, rather than jumping straight to 100
parallel tabs:

```bash
node dist/main.js \
  --target instagram \
  --scraper post-screenshot \
  --urls-file ./jobs/reels.txt \
  --workers 5 \
  --worker-concurrency 8 \
  --no-screen-video \
  --output-file ./out/batch.json
```

This gives 40 parallel tabs across 5 Chrome processes. Raise `--workers` and/or `--worker-concurrency` once you've
confirmed a low failure/block rate at this level, keeping `workers * worker-concurrency <= 100`.

## RAM guidelines (headful Chrome, 1280x720 viewport)

| Configuration | Approximate RAM |
|----------------|-----------------|
| 1 worker x 8 tabs | ~2-4 GB |
| 5 workers x 8 tabs (40 parallel) | ~10-20 GB |
| 10 workers x 10 tabs (100 parallel) | ~20-40 GB |

These are rough upper bounds; actual usage depends on page weight and whether `--screen-video` is enabled (leave
it off with `--no-screen-video` for screenshot-only batches — it is the default artifact otherwise and adds
per-tab overhead).

## Login requirements before a batch

- **Instagram** and **Facebook without `--public-session`/`--guest-session`** require a real logged-in account per
  worker profile directory. Each worker index needs a one-time manual login before its first batch run:

  ```bash
  node dist/main.js profile login --target instagram --profile-root-dir ~/.scrape/profiles/worker-0
  node dist/main.js profile login --target instagram --profile-root-dir ~/.scrape/profiles/worker-1
  # ... one per worker index used, matching the watch-farm convention of one real account per worker
  ```

- **Facebook `--public-session`** self-bootstraps per worker (no login needed) — each worker's public profile
  directory is created automatically on first use.
- **Facebook/Instagram `--guest-session`** needs no per-worker setup; each tab already gets a unique temporary
  Chrome profile.

## Reducing blocks and rate limits

- Keep `--worker-start-delay-ms` (default 2000ms) enabled so worker processes don't all hit the target platform in
  the same instant.
- Use `--item-delay-ms` to pace requests within a worker when scraping many URLs back-to-back on the same tab slot.
- Leave `--max-retries` at its default (2) so transient failures self-heal, but note login-wall/blocked-page
  failures fail fast and are not retried — check `artifacts.blockedPage` on those items.
- Never share one real account's profile directory across multiple concurrently-running worker processes —
  Chrome's profile lock will make the second process fail to start.

## Known gaps (tracked in the evidence-collection plan)

- No automated large-scale (100-URL) load test yet; the mechanism has been verified at small scale (2-4 workers)
  against real targets, not at full 100-parallel scale.
- `--concurrency` (single-process tab count) caps at 32; `--worker-concurrency` caps at 16 per worker process.

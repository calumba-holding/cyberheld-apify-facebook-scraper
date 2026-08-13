# scrape

Local CLI scraper with a plugin-oriented target architecture.

Current plugin support:
- `facebook`
  - scraper: `post-engagement`
  - scraper: `reel-engagement`
  - scraper: `comment-reactions`
  - scraper: `post-screenshot`
  - scraper: `profile-scraper`
- `instagram`
  - scraper: `post-engagement`
  - scraper: `profile-scraper`
  - scraper: `post-screenshot`

The CLI reuses a persistent Chrome profile per target by default, can open a persistent non-login public Facebook profile or a temporary guest Chrome session for Facebook, always prints JSON to stdout, and records browser video via Playwright by default while scraping.

## Project structure

```text
src/
  cli/        CLI parsing, help text, and runtime orchestration
  common/     shared runtime helpers and common types
  facebook/   Facebook-specific plugin, extractors, and types
  instagram/  Instagram-specific plugin, extractors, and types
```

## Features

- persistent per-target Chrome profiles
- one-time manual login flow via CLI
- optional Facebook public-session scraping with a persistent non-login profile
- optional Facebook guest-session scraping without saved login state
- scraping one or many target URLs
- parallel scraping with `--concurrency`
- strict JSON output to stdout
- optional `--output-file`
- browser-only video capture enabled by default
- strict linting via `npm run lint`

## Requirements

- macOS (local CLI) or Docker (multi-profile workers)
- Google Chrome installed at `/Applications/Google Chrome.app` (local CLI)
- Node.js `>= 20`

## Docker — five isolated Facebook profiles

### Central dashboard and per-job workers

The primary local infrastructure starts only the control plane. Browser workers are created per login, scrape, or watch job and reuse one of five persistent profile slots.

The supported client workflow is exactly two commands:

```bash
just build
just start
```

`just build` creates the API, dashboard, and on-demand browser-worker images.
`just start` starts the complete control plane, waits for health checks, and preserves worker profiles and prior results across restarts.

- dashboard: `http://127.0.0.1:3100`
- Swagger UI: `http://127.0.0.1:8080/docs`
- ReDoc: `http://127.0.0.1:8080/redoc`
- full lifecycle: [docs/local-control-plane.md](docs/local-control-plane.md)
- complete new-PC setup and command reference: [docs/NEW-PC-SETUP.md](docs/NEW-PC-SETUP.md)
- failed or cancelled jobs can be resumed from the dashboard or with `POST /v1/jobs/{job-id}/restart`
- useful scraper output is reported as `succeeded`; completeness flags and notes still disclose data Facebook did not expose
- expand **New capture** in the dashboard to use the interactive curl composer for the selected URL, operation, platform, and worker

### Client demo — exact sequence

Start from a clean control plane:

```bash
docker compose up -d control-api dashboard
```

Run workers 1, 2, and 3 **one after another** against the same target and save each completed result without printing the large JSON to the terminal:

```bash
chmod +x scripts/demo-sequential.sh
./scripts/demo-sequential.sh "https://www.facebook.com/strache/posts/pfbid02W8viejbotoUbitpaHq5VZECCHGVGZfe4DbmXEETEYhjkMWu3N1d8oaMEB316aatXl"
```

Defaults:

- workers: `1 2 3` (override with `WORKERS="1 2"`)
- output: `runs/demo/<job-id>-result.json` (override with `OUTPUT_DIR=...`)
- API: `http://127.0.0.1:8080` (override with `API_URL=...`)

If a worker requires login, the script prints the `login_url` and exact `next_actions` curl commands, then waits for Enter. Run:

```bash
curl -sS -X POST http://127.0.0.1:8080/v1/jobs/JOB_ID/authentication/start | jq
curl -sS http://127.0.0.1:8080/v1/jobs/JOB_ID/authentication | jq
curl -sS -X POST http://127.0.0.1:8080/v1/jobs/JOB_ID/authentication-complete | jq
```

For a single finished job, download instead of printing JSON:

```bash
curl -sS http://127.0.0.1:8080/v1/jobs/JOB_ID/result/download \
  --output JOB_ID-result.json
```

Show only the compact terminal summary:

```bash
curl -sS http://127.0.0.1:8080/v1/jobs/JOB_ID/result/summary | jq
```

After the demo, stop and delete all worker containers while preserving saved profiles and results:

```bash
for container in $(docker ps -aq \
  --filter 'name=evidence-control-fb-worker-' \
  --filter 'name=fb-login-' \
  --filter 'name=fb-watch-'); do
  docker rm -f "$container"
done
```

Stop the dashboard and API too:

```bash
docker compose down --remove-orphans
```

These commands preserve `docker/profiles/`, `docker/artifacts/`, and `runs/`.

### Public curl interface — choose an action

Call the central API with the Facebook link, worker slot, and one action. Do not concatenate direct Docker commands.

Instagram uses the same jobs, workers, authentication, logs, resume, summary, and download APIs. The platform is inferred from the URL. Instagram currently exposes two job families: post/reel engagement and profile plus recent posts.

Instagram post or reel:

```bash
curl -sS -X POST http://127.0.0.1:8080/v1/jobs \
  -H 'Content-Type: application/json' \
  -d '{
    "target_url": "https://www.instagram.com/reel/SHORTCODE/",
    "worker": 1
  }' | jq
```

Instagram profile and latest 20 posts:

```bash
curl -sS -X POST http://127.0.0.1:8080/v1/jobs \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "profile",
    "target_url": "https://www.instagram.com/example/",
    "worker": 1,
    "max_posts": 20
  }' | jq
```

Start or verify Instagram authentication for a worker directly with `?platform=instagram`. Job-level authentication automatically uses the job platform.

Reel URLs are detected automatically and routed to `reel-engagement`; callers can omit `action` when they want URL-based automatic routing.

One-time post scrape:

```bash
curl -sS -X POST http://127.0.0.1:8080/v1/jobs \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "scrape",
    "target_url": "FACEBOOK_POST_URL",
    "worker": 1
  }' | jq
```

Scrape first, then continue watching for new comments:

```bash
curl -sS -X POST http://127.0.0.1:8080/v1/jobs \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "watch",
    "target_url": "FACEBOOK_POST_URL",
    "worker": 1,
    "poll_interval_seconds": 90
  }' | jq
```

Profile and latest 20 posts:

```bash
curl -sS -X POST http://127.0.0.1:8080/v1/jobs \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "profile",
    "target_url": "FACEBOOK_PROFILE_URL",
    "worker": 1,
    "max_posts": 20
  }' | jq
```

When the response says `needs_authentication`, run the exact commands returned under `next_actions`: start authentication, check it, then resume the original job.

The old direct commands are separate commands, not one command:

```bash
docker compose run --rm --service-ports fb-worker-1 login
docker compose run -d --service-ports fb-worker-1 watch
```

They are retained only for low-level troubleshooting. Normal clients should use the curl API above.

### Always-on comment watch (recommended for Pascal)

**Full guide:** [docs/WATCH-FARM-SETUP.md](docs/WATCH-FARM-SETUP.md) — five workers, five accounts, five post URLs, JSON events for new comments.

```bash
docker compose build
./scripts/docker/setup-all-worker-configs.sh   # create farm/config/worker-1..5.json
# Edit each worker-N.json with one post URL per worker
./scripts/docker/observe-login.sh 1            # repeat for workers 2–5 (ports 6082–6085)
./scripts/docker/watch-all-dev.sh              # run all five watchers in parallel
```

Artifacts: `docker/artifacts/worker-N/watch/fb-worker-N/events/`

### One-off batch scrape (five URLs, no watch loop)

See [docs/docker-infrastructure.md](docs/docker-infrastructure.md).

```bash
docker compose build
docker compose run --rm --service-ports fb-worker-1 login
cp docker/urls.example.txt docker/urls.txt
./scripts/docker/batch-scrape.sh
```

## Install

```bash
npm install
npm run build
```

Repository workflow guidance is handled with project-local skills:
- `.agents/skills/repo-implement-feature/SKILL.md`
- `.agents/skills/repo-docs-sync/SKILL.md`
- `.agents/skills/update-changelog/SKILL.md`

When code changes affect contracts, scraper behavior, or repository workflow, update the docs in the same change. Use the changelog skill when preparing unreleased notes in `CHANGELOG.md`.

## First run

Log into the persistent scraper profile once when you need authenticated scraping:

```bash
node dist/main.js profile login --target facebook
node dist/main.js profile login --target instagram
```

For public Facebook posts you can also skip login.
Recommended: use a persistent public session that keeps cookie consent and other non-login session state in a separate profile:

```bash
node dist/main.js \
  --target facebook \
  --scraper post-engagement \
  --target-url "https://www.facebook.com/..." \
  --public-session
```

You can still use a fully fresh temporary guest browser session when needed:

```bash
node dist/main.js \
  --target facebook \
  --scraper post-engagement \
  --target-url "https://www.facebook.com/..." \
  --guest-session
```

## CLI overview

```bash
scrape --target <target> --scraper <scraper> --target-url <url> [--target-url <url> ...] [options]
scrape profile login --target <target> [options]
scrape profile path --target <target>
```

When running the compiled entrypoint directly, both forms are accepted:

```bash
node dist/main.js --target facebook --scraper post-engagement --target-url "https://www.facebook.com/..."
node dist/main.js --target instagram --scraper post-engagement --target-url "https://www.instagram.com/p/..."
node dist/main.js scrape --target facebook --scraper post-engagement --target-url "https://www.facebook.com/..."
```

## Profile commands

Open the persistent target profile and log in manually:

```bash
node dist/main.js profile login --target facebook
node dist/main.js profile login --target instagram
```

Show the resolved profile path:

```bash
node dist/main.js profile path --target facebook
node dist/main.js profile path --target instagram
```

Default profile root:

```text
~/.scrape/profiles/<target>
```

## Scrape one URL

```bash
node dist/main.js \
  --target facebook \
  --scraper post-engagement \
  --target-url "https://www.facebook.com/..."
```

```bash
node dist/main.js \
  --target instagram \
  --scraper post-engagement \
  --target-url "https://www.instagram.com/p/..."
```

```bash
node dist/main.js \
  --target facebook \
  --scraper profile-scraper \
  --target-url "https://www.facebook.com/example/" \
  --max-posts 20
```

```bash
node dist/main.js \
  --target instagram \
  --scraper profile-scraper \
  --target-url "https://www.instagram.com/example_profile/"
```

## Scrape comment reactions for one target comment

```bash
node dist/main.js \
  --target facebook \
  --scraper comment-reactions \
  --target-url "https://www.facebook.com/...?...&comment_id=123456789"
```

The `comment-reactions` scraper:
- requires a Facebook URL with `?comment_id=...`
- finds the linked target comment
- extracts reactions for that comment only
- does not scrape post reactions
- for Facebook `--public-session`, first tries an API-first focused-comment path before falling back to DOM modal scraping
- slowly scrolls back to the top at the end so the video shows the post context
- fails the result if the target comment cannot be found

For Facebook share/video URLs, the scraper follows the Facebook redirect and continues on the resolved watch or permalink URL. In `--public-session`, reel URLs are also rewritten to the equivalent watch/video URL because the logged-out watch/video surface is usually richer than the logged-out reel surface. Public watch/video `post-engagement` runs now try a GraphQL-first video path before DOM scraping by reading the loaded video's `storyId` and `feedbackId` from Relay, replaying `CometFocusedStoryViewUFIQuery`, paging public comments/replies while Facebook still exposes cursors, merging the watch-surface `TAHOE` pagination queries when available, and repeating that bounded bundle once more to recover some logged-out payload drift. If that still does not produce a usable API result and the DOM comment crawl stays empty, visible comments already present in Relay state can also be merged into the result. For watch/video `post-engagement` runs, it also downloads the original source video as a per-item artifact when possible unless `--no-download` disables that step. Both Facebook scrapers can also run with `--public-session` or `--guest-session` when the target post is publicly visible.

## Scrape multiple URLs in parallel

```bash
node dist/main.js \
  --target facebook \
  --scraper post-engagement \
  --target-url "https://www.facebook.com/post-a" \
  --target-url "https://www.facebook.com/post-b" \
  --target-url "https://www.facebook.com/post-c" \
  --concurrency 3
```

## Scrape a large batch across a worker pool

For batches beyond one Chrome process's practical tab limit (~16 tabs), use `--workers` to fork separate Chrome
worker processes, each running `--worker-concurrency` tabs:

```bash
node dist/main.js \
  --target instagram \
  --scraper post-screenshot \
  --urls-file ./jobs/reels.txt \
  --workers 10 \
  --worker-concurrency 10 \
  --no-screen-video \
  --output-file ./out/ig-batch.json
```

`--workers * --worker-concurrency` must not exceed 100. For authenticated targets (Instagram, and Facebook without
`--public-session`/`--guest-session`), log into each worker's profile once before running a batch:

```bash
node dist/main.js profile login --target instagram --profile-root-dir ~/.scrape/profiles/worker-0
node dist/main.js profile login --target instagram --profile-root-dir ~/.scrape/profiles/worker-1
# ...one per worker index used
```

Failed items automatically retry (`--max-retries`, default 2) with exponential backoff, except login-wall/blocked-page
failures, which fail fast. Use `--item-delay-ms` to pace requests within a worker.

See [docs/contracts/cli.md](docs/contracts/cli.md#worker-pool---workers--1) for the full contract and
[docs/operations/parallel-evidence.md](docs/operations/parallel-evidence.md) for RAM guidelines and recommended
worker counts.

## Save JSON while keeping the default browser video

```bash
node dist/main.js \
  --target facebook \
  --scraper post-engagement \
  --target-url "https://www.facebook.com/..." \
  --output-file ./out/facebook-post.json \
  --verbose
```

## Disable browser video for one run

```bash
node dist/main.js \
  --target facebook \
  --scraper post-engagement \
  --target-url "https://www.facebook.com/..." \
  --no-screen-video
```

## Disable original source-video download for a watch/video run

```bash
node dist/main.js \
  --target facebook \
  --scraper post-engagement \
  --target-url "https://www.facebook.com/share/v/1CnN9eCXgg/" \
  --no-download
```

## Output behavior

- `stdout`: always final JSON
- `stderr`: logs and errors
- `--output-file <path>`: also writes the JSON to disk using the run-scoped filename `<run-id>_<basename>`
- `run.browserSession`: reports whether the run used the authenticated persistent profile, the public persistent profile, or a guest session
- `results[].scrape.browser`: reports `persistent-chrome-profile` or `guest-chrome-session`
- Facebook watch/video `post-engagement` runs may also write a per-item source video file next to the JSON output unless `--no-download` disables that artifact
- browser video:
  - enabled by default for browser-based scrapers
  - disable per run with `--no-screen-video`
  - disable via environment with `SCRAPE_SCREEN_VIDEO=false`
  - at most one final `.webm` artifact is kept per scrape run
  - saved next to the output JSON when `--output-file` is set
  - otherwise saved under the temp artifact directory for that run
  - temporary raw Playwright video files are cleaned up automatically

## Facebook post-engagement output

The Facebook plugin currently extracts:
- post URL
- post content
- post reactions with per-user reaction type
- comments and replies
- UTC timestamps for visible comments/replies

The `post-engagement` scraper extracts post reactions. It does not yet enrich every comment with its reaction-user list; use `comment-reactions` for one specific linked comment.

`--public-session` is now the recommended no-login mode for publicly visible Facebook posts. It uses a separate persistent profile (default: `~/.scrape/profiles/facebook-public`) so cookie-consent and other non-login session state can survive across runs. For page-scoped public post URLs, the scraper now tries an API-first GraphQL path before DOM scraping: it captures the public feed request template, pages the feed via GraphQL, requests the single-post payload directly, requests the focused-story UFI payload directly, replays `CommentsListComponentsPaginationQuery` for additional public top-level comment pages, replays `Depth1CommentsListPaginationQuery` for publicly visible reply batches, replays `CometUFIReactionsDialogQuery` to populate public per-user post reactions, repeats those first-page reaction samples across bounded passes to absorb public payload instability, and then best-effort tries `CometUFIReactionsDialogTabContentRefetchQuery` for extra reaction pages when Facebook allows that refetch path. `--guest-session` stays available for a fully fresh temporary session.

Both public modes apply a small stealth-hardening layer (`navigator.webdriver`, automation flag reduction, common fingerprint patches). When Facebook redirects the browser away from the requested post to home/login, the run now fails fast with a clear login-wall/bot-check error instead of continuing on the wrong page. Failed items also include blocked-page diagnostics (`artifacts.blockedPage`) with screenshot/html paths when capture succeeds. If Facebook merely hides reactions/comments from public visitors, the item may still end up `PARTIAL`.

Self-healing extraction scripts are stored locally in `scripts.json`. The saved `post-engagement` fast path is accepted only when it extracts comments or reactions; post-text-only results trigger repair or fall back to the standard scraper. Use `--regenerate-script` to skip the saved script for a run and let the normal scraper path refresh it afterward. Script generation/repair needs `SCRAPE_LLM_API_KEY`; `SCRAPE_LLM_MODEL` can override the default Gemini model. When generation or repair runs, the item output includes `artifacts.selfHealing[]` with the action, status, full-page screenshot, and sanitized HTML snapshot used for the LLM prompt.

A `post-engagement` result may still be marked successful when the post has zero visible comments. For zero post reactions, an empty `post.reactions` array only stays successful when the scraper can positively confirm an explicit zero-reaction state; otherwise the item remains `PARTIAL`.

For Facebook public-session page-post and watch/video runs, a `PARTIAL` item may now still include useful API-derived data such as post text, aggregate reaction totals, public per-user reaction samples, multiple paged batches of visible public top-level comments, and publicly visible reply batches even when Facebook does not expose the full per-user reaction list, blocks the reaction refetch query for logged-out sessions, or withholds an unfiltered all-comments view.

## Instagram post-engagement output

The Instagram plugin currently extracts:
- canonical post URL
- post caption when available from page metadata
- visible like/comment totals from labeled UI counts or page metadata
- liker profiles when the logged-in profile can open the likes dialog
- visible comments with permalink-derived ids
- ISO timestamps for comments when available

The Instagram `post-engagement` scraper reports `PARTIAL` when comment expansion still appears actionable after its crawl budget or when the likes dialog cannot be opened for user-level extraction.

## Instagram profile-scraper output

The Instagram profile scraper currently extracts:
- canonical profile URL
- username / handle
- display name when visible
- bio when visible
- profile picture URL when visible
- post / follower / following counts when visible
- verified / private indicators when visible
- visible external links
- at least one screenshot artifact path when capture succeeds

## Linting

```bash
npm run lint
npm run lint:fix
```

Rules include:
- strict type-checked TypeScript linting
- max `300` lines per file excluding comments and blank lines

## Notes

- By default the scraper uses a custom persistent Chrome profile, not the host system default Chrome profile.
- Facebook `--public-session` runs use a separate persistent non-login profile at `~/.scrape/profiles/facebook-public` by default.
- Facebook `--guest-session` runs use a temporary Chrome session instead of the saved scraper profile.
- Facebook extraction is scoped to the target post container to avoid drifting into adjacent posts.
- When Facebook does not show a comments filter for small threads, the scraper treats the visible thread as already complete.

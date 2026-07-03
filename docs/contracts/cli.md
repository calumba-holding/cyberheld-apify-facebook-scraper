# CLI Contract

## Command surface

```bash
scrape --target <target> --scraper <scraper> --target-url <url> [--target-url <url> ...] [options]
scrape profile login --target <target> [options]
scrape profile path --target <target>
```

Direct compiled-entrypoint invocation is also supported:

```bash
node dist/main.js [scrape] --target <target> --scraper <scraper> --target-url <url> [options]
node dist/main.js [scrape] profile login --target <target> [options]
node dist/main.js [scrape] profile path --target <target>
```

## Current target/scraper support

- target: `facebook`
- scraper: `post-engagement`
- scraper: `comment-reactions`
- scraper: `post-screenshot`
- target: `instagram`
- scraper: `post-engagement`
- scraper: `profile-scraper`
- scraper: `post-screenshot`

## Flag rules

### Required for scrape runs

- `--target <target>`
- `--scraper <scraper>`
- `--target-url <url>` (repeatable)

### Optional

- `--concurrency <n>` (tabs per worker process; 1-32)
- `--urls-file <path>` (newline-delimited target URLs; `#`-prefixed lines and blanks are skipped)
- `--public-session` (Facebook only; use a persistent non-login Facebook profile for public scraping)
- `--guest-session` (Facebook only; use a temporary Chrome session without the saved target profile)
- `--screen-video` (force-enable; the default is on)
- `--no-screen-video`
- `--no-download`
- `--output-file <path>`
- `--chrome-executable <path>`
- `--profile-root-dir <dir>`
- `--artifact-root-dir <dir>` (root dir for screenshots and other artifacts; default `SCRAPE_ARTIFACT_ROOT_DIR` or OS temp dir)
- `--wait-after-navigation-ms <ms>`
- `--request-timeout-secs <s>`
- `--regenerate-script` (skip the saved self-healing extraction script for this run)
- `--workers <n>` (parallel Chrome worker processes; default 1, max 20)
- `--worker-concurrency <n>` (tabs per worker when `--workers` > 1; default 4, max 16)
- `--worker-start-delay-ms <ms>` (stagger delay between worker starts; default 2000)
- `--max-retries <n>` (per-item retry attempts; default 2, max 5)
- `--item-delay-ms <ms>` (delay before scraping each item, per tab; default 0)
- `--verbose`
- `-h`, `--help`
- `--version`

## Retry policy

Each item retries up to `--max-retries` times (default 2, so 3 attempts total) with exponential backoff (1s, 2s,
4s, ... capped at 30s) when:

- the scraper throws (navigation timeout, transient network error, etc.) and the error is not flagged as a
  login-wall/blocked-page failure (those fail fast on the first attempt, matching existing block-diagnostics behavior)
- a `post-screenshot` result completes with zero screenshots captured

`--item-delay-ms` adds a fixed delay before each item starts (per tab), independent of retries, to pace requests
against the target platform. When an item required more than one attempt, its output includes `scrape.attempts`
(the number of attempts taken); this field is omitted when an item succeeds or fails on the first attempt.

## Worker pool (`--workers` > 1)

For batches beyond a single Chrome process's practical tab limit (~16), `--workers <n>` forks `n` separate Chrome
worker processes via `child_process.fork`, each running its own persistent-profile (or public/guest) browser with
`--worker-concurrency` tabs. Target URLs are split into contiguous chunks across workers (remainder URLs go to the
first workers) so concatenating each worker's results in worker order reconstructs the original input order.

- `--workers * --worker-concurrency` must not exceed 100.
- Worker starts are staggered by `index * --worker-start-delay-ms` to avoid synchronized bursts against the target platform.
- For `persistent-profile` and `--public-session` runs, each worker `N` uses its own Chrome profile directory
  `<profile-root-dir>/worker-N/<target>` to avoid Chrome's single-instance profile lock. Authenticated targets
  (Instagram, and Facebook without `--public-session`/`--guest-session`) require a prior manual login per worker:
  `scrape profile login --target <target> --profile-root-dir <profile-root-dir>/worker-N`.
- `--guest-session` workers do not need per-worker login; each uses its own unique temporary Chrome profile already.
- If a worker process fails to start or exits before returning a result, every URL assigned to that worker is
  reported as `FAILED` with a descriptive error instead of failing the whole run.
- `--workers 1` (the default) is a no-op and behaves exactly like the pre-worker-pool single-process path.

## Output rules

- `stdout`: final JSON only
- `stderr`: logs, warnings, and user-facing errors
- `--output-file`: writes the same final JSON to disk using the run-scoped filename `<run-id>_<basename>`
- browser video is enabled by default for scrape runs unless `--no-screen-video` or `SCRAPE_SCREEN_VIDEO=false` disables it
- Facebook watch/video source-video download is enabled by default for `post-engagement` runs unless `--no-download` disables it
- `--public-session` uses a persistent non-login Facebook profile and is currently supported only for `--target facebook`
- `--guest-session` uses a temporary Chrome session and is currently supported only for `--target facebook`

New scrapers must keep the same stdout/stderr split.

## Exit codes

- `0`: all requested URLs succeeded or partially succeeded without any failed run item
- `1`: at least one requested URL failed during runtime
- `2`: invalid usage or validation error before the scrape run starts

## Validation rules

- `--target` must be a supported target
- `--scraper` must be supported by the selected target
- every `--target-url` must be a valid URL
- integer flags must stay within their documented ranges

Scraper-specific validation is allowed when it is deterministic at parse/dispatch time.

Facebook target URLs may be generic share links. The scraper may follow Facebook redirects first and continue on the resolved permalink or watch URL.

Current scraper-specific requirement:
- `comment-reactions` requires a Facebook target URL containing `?comment_id=...`
- `--public-session` and `--guest-session` are rejected for non-Facebook targets

## Naming rules

- target names: lowercase kebab-case or single token (`facebook`)
- scraper names: lowercase kebab-case (`post-engagement`, `comment-reactions`)
- environment variables: `SCRAPE_*`

Current self-healing script generation variables:
- `SCRAPE_LLM_API_KEY`: Google AI API key used only when generating or repairing a saved extraction script
- `SCRAPE_LLM_MODEL`: optional Gemini model override for script generation

## Adding a new scraper

When adding a new scraper:

1. add the scraper to the target plugin support list
2. update help text in `src/cli/help.ts`
3. update examples in `README.md`
4. update `docs/scrapers/`
5. add or update parser/registry tests

## Error-message guidelines

- keep parse/validation messages short and actionable
- mention the missing or invalid flag explicitly
- prefer one clear sentence over stack traces
- preserve existing error wording unless there is a strong reason to change it

# Implementation Plan: Evidence Collection at Scale

**Status:** Draft for engineering  
**Audience:** Developers working on `facebook-scraper`  
**Product context:** Legal/forensics workflow — clients send Facebook/Instagram URLs; the system must capture reliable, court-usable evidence quickly, including many URLs in parallel (target: ~100 concurrent captures per batch).

---

## 1. Problem statement

### 1.1 User need (from client conversation)

- Input: batches of client links (Facebook posts/shares/reels, Instagram posts/reels/profiles).
- Output: **reliable evidence artifacts** per URL — primarily **screenshots** (and optionally structured JSON + video).
- Throughput: **high parallelism** (client mentioned ~100 parallel screenshots; product should treat this as a **throughput goal**, not a single-process limit).
- Pain today: evidence is inconsistent — engagement scraping exists, but **post/reel screenshot evidence is not a first-class scraper**, Instagram reels are untested, and parallelism is capped at **16 tabs in one Chrome**.

### 1.2 What already works (do not rebuild)

| Capability | Location | Notes |
|------------|----------|-------|
| Facebook post engagement (reactions, comments, API-first public path) | `src/facebook/scrapers/post-engagement/` | Production-ready for data extraction |
| Facebook comment reactions | `src/facebook/scrapers/comment-reactions/` | Single-comment scope |
| Instagram post engagement | `src/instagram/scrapers/post-engagement/` | Needs login for full likes list |
| Instagram profile + screenshot | `src/instagram/scrapers/profile-scraper/` | Screenshot pattern exists here |
| Multi-URL parallel scrape | `src/cli/runtime.ts` (`mapLimit`) | Default concurrency `1`, max `16` |
| Per-item browser tab | `plugin.runScrape` → `context.newPage()` | Safe for parallel tabs within one context |
| Blocked-page screenshot/HTML | `src/facebook/shared/block-diagnostics.ts` | Reuse patterns |
| JSON stdout contract | `src/common/output-item.ts` | Must stay stable |

### 1.3 Gaps to close

1. **No `post-screenshot` scraper** for Facebook or Instagram posts/reels.
2. **Instagram `/reel/` URLs** — no normalization or reel-specific readiness checks.
3. **Concurrency model** — single Chrome context + max 16 tabs does not scale to ~100.
4. **Evidence mode confusion** — default artifact is **screen video** (`.webm`), not PNG/JPEG screenshots.
5. **No batch/job abstraction** — CLI is run-oriented, not job-queue oriented for large batches.
6. **No rate-limit / retry policy** documented for high parallelism.

---

## 2. Goals and non-goals

### 2.1 Goals (MVP → v1)

| ID | Goal | Priority |
|----|------|----------|
| G1 | New scraper `post-screenshot` for `facebook` and `instagram` | P0 |
| G2 | Deterministic screenshot artifacts per URL in JSON output | P0 |
| G3 | Support Instagram reel URLs (`/reel/<shortcode>/`) | P0 |
| G4 | Raise practical parallelism via **worker pool** (multiple browser processes) | P0 |
| G5 | CLI flag to run screenshot-only jobs with video disabled by default | P0 |
| G6 | Clear `SUCCEEDED` / `PARTIAL` / `FAILED` semantics for screenshot completeness | P0 |
| G7 | Reuse existing login profiles (`~/.scrape/profiles/<target>`) | P0 |
| G8 | Document ops limits (RAM, recommended worker counts) | P1 |

### 2.2 Non-goals (this plan)

- Cloud SaaS / hosted queue (local-first stays; optional file-based job input only).
- Replacing `post-engagement` extraction logic.
- Guaranteed full comment/reaction lists in screenshot mode.
- Bypassing Instagram/Facebook ToS or login walls (fail fast + diagnostics instead).
- Mobile app or non-macOS support in v1.

---

## 3. Recommended architecture

### 3.1 Two execution modes

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI (unchanged entry)                    │
│  scrape --target X --scraper post-screenshot --target-url ...   │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
     ┌────────▼────────┐          ┌─────────▼──────────┐
     │  Single-worker   │          │  Worker pool        │
     │  (current path)  │          │  (new, optional)    │
     │  1 Chrome ctx    │          │  N Chrome processes │
     │  concurrency ≤16 │          │  each concurrency ≤8│
     └────────┬────────┘          └─────────┬──────────┘
              │                             │
              └──────────────┬──────────────┘
                             │
                    ┌────────▼────────┐
                    │ post-screenshot  │
                    │ per target plugin│
                    └─────────────────┘
```

**Phase 1:** Implement `post-screenshot` inside existing single-worker CLI (concurrency up to 16).  
**Phase 2:** Add worker pool orchestration for batches > 16 (target aggregate ~100).

### 3.2 New scraper: `post-screenshot`

Add to both targets:

```text
src/<target>/scrapers/post-screenshot/
  index.ts           # orchestration
  capture.ts         # viewport + full-page capture logic
  readiness.ts       # wait until post surface is stable
  url.ts             # target-specific URL normalization (instagram reel)
```

Wire in `src/<target>/plugin.ts` and register scraper name in `scrapers` array.

### 3.3 Result type extension

Add a new result kind (preferred over overloading `profile`):

```typescript
// src/common/types.ts (proposed)
export interface ScreenshotScrapeResult extends BaseScrapeResult {
    kind: 'screenshot';
    screenshots: ScreenshotArtifact[];  // ordered: viewport, optional fullPage
    metadata?: {
        title?: string;
        captionPreview?: string;
        visibleLikeCount?: number;
        visibleCommentCount?: number;
    };
}
```

Update `ScrapeResult` union and `buildSuccessOutput` in `src/common/output-item.ts`:

- Map `kind: 'screenshot'` → `artifacts.screenshots[]` (same shape as profile scraper).
- **Success rule:** `SUCCEEDED` if at least one **viewport** screenshot captured and URL did not redirect to login/home.
- **Partial:** capture succeeded but metadata/readiness incomplete (e.g. media still loading blur).
- **Failed:** navigation error, login wall, zero screenshots.

### 3.4 Screenshot capture spec (per item)

| Step | Behavior |
|------|----------|
| 1. Navigate | `page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout })` |
| 2. Resolve URL | Canonical URL from `page.url()` after redirects |
| 3. Block detection | Reuse Facebook `isFacebookLoginOrHomeUrl` pattern; add Instagram login/challenge detectors |
| 4. Readiness wait | Wait for target-specific root selector + network idle OR bounded timeout (see §4) |
| 5. Stabilize | Fixed short delay (`waitAfterNavigationMs`, default 1500–3000 ms) |
| 6. Capture viewport | `page.screenshot({ path, fullPage: false })` — **required** |
| 7. Capture full page | Optional second file `*_full.png` when `--full-page-screenshot` |
| 8. Artifact paths | `{artifactRootDir}/{runId}/screenshots/{runId}_{itemIndex}_{slug}.png` |
| 9. Close tab | Always `page.close()` in `finally` |

Reuse `captureInstagramProfileScreenshot` path logic from:

`src/instagram/scrapers/profile-scraper/screenshot.ts`

Extract shared helper to:

`src/common/screenshot-artifacts.ts`

---

## 4. Target-specific behavior

### 4.1 Facebook `post-screenshot`

| Topic | Decision |
|-------|----------|
| URL types | Permalink, share links, watch/video, reels (reuse `resolveFacebookPostUrl`, `rewriteFacebookReelUrlToWatchUrl` for `--public-session`) |
| Session modes | Support `persistent-profile`, `public-session`, `guest-session` (same as post-engagement) |
| Readiness | Post root visible (`src/facebook/post-root.ts` helpers) + no login redirect |
| Video default | **Off** when `--scraper post-screenshot` (override CLI default for this scraper) |
| Optional metadata | Post text snippet from DOM if cheap |

**Files to reuse:** `src/facebook/shared/url.ts`, `block-diagnostics.ts`, `guest-session.ts`.

### 4.2 Instagram `post-screenshot`

| Topic | Decision |
|-------|----------|
| URL types | `/p/<shortcode>/`, `/reel/<shortcode>/`, accept query params (`?igsh=...`) |
| Session | **Requires** `persistent-profile` (same as today) |
| Reel handling | No rewrite required initially; verify DOM parity with `/p/` or add normalization to `/p/<shortcode>/` if Instagram redirects |
| Readiness | `article` or main post container visible; dismiss cookie banner if present (shared helper) |
| Login wall | If URL contains `/accounts/login` → fail with blocked-page artifact |
| Likes dialog | **Do not open** in screenshot mode (speed) |

**New tests:** `tests/browser/instagram-reel-screenshot.spec.ts` with a stable public reel fixture or mocked HTML.

---

## 5. CLI and configuration changes

### 5.1 New flags (proposed)

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--scraper post-screenshot` | enum | — | New scraper on facebook + instagram |
| `--full-page-screenshot` | boolean | false | Also capture full-page PNG |
| `--workers <n>` | int | 1 | Number of parallel Chrome **processes** (phase 2) |
| `--worker-concurrency <n>` | int | 4 | Tabs per worker (phase 2) |
| `--urls-file <path>` | string | — | Newline-delimited URLs (phase 2 batch input) |
| `--screenshot-viewport-width` | int | 1280 | Viewport width |
| `--screenshot-viewport-height` | int | 720 | Viewport height |

Keep existing:

- `--concurrency` → tabs per **single** worker (phase 1, max raise to 32 if stable).
- `--no-screen-video` → should be implicit for `post-screenshot`; still allow `--screen-video` for audit trail if needed.

### 5.2 Environment variables

| Variable | Purpose |
|----------|---------|
| `SCRAPE_WORKERS` | Default worker count |
| `SCRAPE_WORKER_CONCURRENCY` | Tabs per worker |
| `SCRAPE_CONCURRENCY` | Existing; document interaction with workers |
| `SCRAPE_SCREENSHOT_VIEWPORT` | Optional `WxH` shorthand |

### 5.3 Example commands (acceptance)

**Single URL, Instagram reel:**

```bash
node dist/main.js \
  --target instagram \
  --scraper post-screenshot \
  --target-url "https://www.instagram.com/reel/DU_bfUNDWwP/" \
  --no-screen-video \
  --output-file ./out/batch.json
```

**30 Facebook URLs, single Chrome:**

```bash
node dist/main.js \
  --target facebook \
  --scraper post-screenshot \
  --public-session \
  $(printf '%s\n' "${URLS[@]}" | sed 's/^/--target-url /') \
  --concurrency 8 \
  --no-screen-video \
  --output-file ./out/fb-batch.json
```

**~100 URLs, worker pool (phase 2):**

```bash
node dist/main.js \
  --target instagram \
  --scraper post-screenshot \
  --urls-file ./jobs/reels.txt \
  --workers 10 \
  --worker-concurrency 10 \
  --no-screen-video \
  --output-file ./out/ig-100.json
```

Aggregate concurrency = `workers × worker_concurrency` (cap at 100 by validation).

---

## 6. Worker pool design (phase 2)

### 6.1 Why not 100 tabs in one Chrome?

- Memory: ~100 headful tabs ≈ unstable on typical Mac hardware.
- Single profile lock: one persistent context shares cookies/storage — contention and crashes.
- Platform rate limits: Instagram/Facebook throttle aggressive same-session traffic.

### 6.2 Worker pool model

```
Parent process (cli/runtime-pool.ts)
  ├── spawn Worker 0 → child process → scrape subset URLs[0..9]
  ├── spawn Worker 1 → child process → scrape subset URLs[10..19]
  └── ...
Each child:
  - Own Chrome persistent profile OR guest profile suffix: ~/.scrape/profiles/instagram-worker-3
  - Runs existing scrape command internally OR imports runScrapeCommand with isolated profileDir
  - Writes partial JSON to temp dir
Parent merges results → single ScrapeRunOutput
```

**Implementation options (pick one in sprint planning):**

| Option | Pros | Cons |
|--------|------|------|
| A. `child_process.fork` + shared TS module | No duplicate CLI parsing; typed IPC | More code in runtime |
| B. Spawn `node dist/main.js` per worker | Process isolation for free | Merge/exit-code handling harder |
| C. Shell background jobs | Quick prototype | Poor error handling — avoid |

**Recommendation:** Option A — `src/cli/worker-pool.ts` with forked workers calling `runScrapeCommand` subset.

### 6.3 Profile sharding strategy

| Target | Strategy |
|--------|----------|
| Instagram | **Required login** — clone base profile to `instagram-worker-{i}` on first run OR round-robin 10 logged-in profiles (manual setup doc) |
| Facebook public | All workers may share `facebook-public` read-only OR separate `facebook-public-worker-{i}` to reduce throttling |
| Facebook authenticated | Same as Instagram — sharded profiles |

Document in `docs/operations/worker-profiles.md` (new).

### 6.4 Merge semantics

Parent `run` object:

```json
{
  "run": {
    "concurrency": 100,
    "workers": 10,
    "workerConcurrency": 10,
    "itemCount": 100
  },
  "results": [ /* stable order matching input URLs */ ]
}
```

Preserve input order even if workers finish out of order (index in IPC).

---

## 7. Reliability: retries, rate limits, failures

### 7.1 Retry policy (per item)

| Failure type | Retry | Max attempts |
|--------------|-------|----------------|
| Navigation timeout | Yes | 2 |
| Login wall / challenge | No | 1 (fail fast) |
| Zero-byte screenshot | Yes | 2 |
| Target 429 / blank page | Yes with backoff | 3 (exponential, cap 30s) |

Add `--max-retries <n>` (default 2) for screenshot scraper only.

### 7.2 Backoff between items (same worker)

Optional `--item-delay-ms` (default 0 for benchmark, 500–2000 for production) to reduce blocks.

### 7.3 Diagnostics (unchanged contract)

On failure, populate `artifacts.blockedPage` with screenshot + HTML when possible (reuse Facebook helper; add Instagram equivalent in `src/instagram/shared/block-diagnostics.ts`).

---

## 8. Output contract updates

### 8.1 JSON shape (additive)

Extend `ScrapeItemOutput` usage — no breaking changes:

```json
{
  "input": { "targetUrl": "https://www.instagram.com/reel/..." },
  "scrape": { "status": "SUCCEEDED", "jobId": "...", "browser": "persistent-chrome-profile" },
  "artifacts": {
    "screenshots": [
      { "localPath": "/path/run/screenshots/run_0_reel.png" },
      { "localPath": "/path/run/screenshots/run_0_reel_full.png" }
    ]
  },
  "metadata": {
    "finalUrl": "https://www.instagram.com/reel/.../",
    "title": "optional"
  }
}
```

Document in `docs/contracts/output-json.md`.

### 8.2 Exit codes

Unchanged:

- `0` — all items `SUCCEEDED` or `PARTIAL` without `FAILED`
- `1` — any `FAILED`
- `2` — usage error

---

## 9. Implementation phases and tasks

### Phase 0 — Prep (0.5 day)

- [ ] **P0-1** Review this plan; agree on worker pool approach (§6.2 Option A).
- [ ] **P0-2** Add fixture URLs list (internal, not committed if sensitive) for IG reel, IG post, FB post, FB share, FB reel.
- [ ] **P0-3** Define acceptance screenshots (resolution, file size floor e.g. > 20 KB).

### Phase 1 — `post-screenshot` scraper (3–4 days)

| Task | Owner hints | Files |
|------|-------------|-------|
| **P1-1** Add `ScreenshotScrapeResult` type | types | `src/common/types.ts` |
| **P1-2** Extract `writeScreenshotArtifact()` helper | common | `src/common/screenshot-artifacts.ts` |
| **P1-3** Facebook `post-screenshot` scraper | facebook | `src/facebook/scrapers/post-screenshot/*` |
| **P1-4** Wire Facebook plugin + URL reuse | facebook | `src/facebook/plugin.ts` |
| **P1-5** Instagram `post-screenshot` scraper | instagram | `src/instagram/scrapers/post-screenshot/*` |
| **P1-6** Instagram block diagnostics | instagram | `src/instagram/shared/block-diagnostics.ts` |
| **P1-7** Map output in `buildSuccessOutput` | common | `src/common/output-item.ts` |
| **P1-8** CLI: register scraper, `--full-page-screenshot`, auto `--no-screen-video` for this scraper | cli | `src/cli/parse.ts`, `help.ts` |
| **P1-9** Unit tests: output mapping, URL validation | tests | `tests/unit/output-item.test.ts`, registry |
| **P1-10** Browser tests: IG reel + FB public post screenshot | tests | `tests/browser/*-screenshot.spec.ts` |
| **P1-11** Docs sync | docs | `docs/scrapers/*`, `docs/contracts/*`, `README.md` |

**Definition of done (phase 1):**

- One command captures viewport PNG for IG reel and FB post.
- JSON includes `artifacts.screenshots[0].localPath`.
- `npm run lint && npm run build` pass.

### Phase 2 — Parallelism uplift (2–3 days)

| Task | Notes | Status |
|------|-------|--------|
| **P2-1** Raise `--concurrency` max 16 → 32 (configurable constant) | Load-test on dev machine | Not done — left at 16 |
| **P2-2** Implement `src/cli/worker-pool.ts` | Fork model (Option A) | Done — `child_process.fork` per worker, IPC request/response |
| **P2-3** Add `--workers`, `--worker-concurrency`, `--urls-file` | Parse + validate product ≤ 100 | Done (`--urls-file` already existed) |
| **P2-4** Profile sharding for workers | Per-worker `<profile-root-dir>/worker-N` for persistent-profile/public-session; guest-session unaffected (already unique temp dirs) | Done |
| **P2-5** Merge partial outputs in parent | Contiguous chunking + worker-order concatenation preserves input URL order | Done, verified with a real 2-worker run |
| **P2-6** Retries + `--item-delay-ms` | Scraper-level or runtime-level | Not done |
| **P2-7** Integration test: 20 URLs, 4 workers × 5 concurrency | CI may use mocked/smoke only | Partial — unit tests for chunking/parsing added (`tests/unit/worker-pool.test.ts`, `tests/unit/parse.test.ts`); no automated 20-URL browser integration test yet |
| **P2-8** Ops doc: RAM guidelines, recommended worker counts | `docs/operations/parallel-evidence.md` | Not done |

**Definition of done (phase 2):**

- 100 URLs complete with `--workers 10 --worker-concurrency 10` on reference hardware (document actual runtime). — not yet load-tested at this scale; verified end-to-end at small scale (2 workers, real Instagram reel URL, isolated profile dirs confirmed via file mtimes).
- No duplicate `runId` artifact collisions between workers. — each worker generates its own `runId` inside `runScrapeCommand`; confirmed distinct in the verification run.

### Phase 3 — Product polish (optional, 2 days)

| Task | Notes |
|------|-------|
| **P3-1** Combined mode: `--scraper post-evidence` runs screenshot + lightweight engagement metadata | Thin wrapper calling both paths sequentially on same page |
| **P3-2** ZIP export of all screenshots for a run | `--bundle-artifacts` |
| **P3-3** HTML evidence report generator | Separate script consuming JSON |

---

## 10. Testing strategy

### 10.1 Unit tests

- Registry lists `post-screenshot` for facebook + instagram.
- `buildSuccessOutput` for `kind: 'screenshot'`.
- URL parser accepts `/reel/`, `/p/`, FB share URLs.
- Worker pool split: 100 URLs → 10 workers × 10 URLs each.

### 10.2 Browser tests (Playwright)

| Spec | Asserts |
|------|---------|
| `instagram-reel-screenshot.spec.ts` | PNG exists, min dimensions, not login page |
| `instagram-post-screenshot.spec.ts` | Same for `/p/` |
| `facebook-public-post-screenshot.spec.ts` | `--public-session` capture |
| `facebook-login-wall-screenshot.spec.ts` | Fails with `blockedPage` artifact |

Use committed HTML fixtures where live network is flaky.

### 10.3 Manual QA checklist

- [ ] Logged-in Instagram reel (client example URL).
- [ ] Logged-out Facebook public post (`--public-session`).
- [ ] Batch of 30 mixed URLs, concurrency 8, all PNGs present.
- [ ] Batch of 100 IG reels with 10 workers (phase 2).
- [ ] Verify disk usage (~500 KB–2 MB per PNG × 100).

---

## 11. Performance and capacity planning

### 11.1 Rough estimates (headful Chrome, viewport 1280×720)

| Metric | Single worker | 10 workers × 10 tabs |
|--------|---------------|----------------------|
| RAM | ~2–4 GB | ~20–40 GB (upper bound) |
| Time per URL | 5–15 s | dominated by slowest worker |
| 100 URLs | 8–25 min @ c=8 | ~2–8 min idealized |

**Recommendation for Pascal's machine class:** start with **`--workers 5 --worker-concurrency 8` (40 parallel)**; tune upward after observing block rate.

### 11.2 Rate-limit mitigation

- Stagger worker start (`workerStartDelayMs: 2000`).
- Rotate user-agent only in guest mode (already in `browser-stealth.ts`).
- Do not share one Instagram account across 100 simultaneous tabs without sharding.

---

## 12. Documentation deliverables

| Document | Action |
|----------|--------|
| `docs/scrapers/facebook-post-screenshot.md` | Create |
| `docs/scrapers/instagram-post-screenshot.md` | Create |
| `docs/contracts/cli.md` | Add flags + scraper |
| `docs/contracts/output-json.md` | Screenshot kind |
| `docs/operations/parallel-evidence.md` | Create (phase 2) |
| `README.md` | Examples section |
| `CHANGELOG.md` | Unreleased entry per repo skill |

Follow `.agents/skills/repo-docs-sync/SKILL.md` on every PR.

---

## 13. Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Instagram blocks parallel logged-in scraping | High | Worker profile sharding, delays, reduce concurrency |
| Reel DOM differs from post | Medium | Browser tests + readiness selectors per path |
| 100 Chrome processes OOM | High | Cap validated product, document hardware reqs |
| Legal admissibility of screenshots | Product/legal | Timestamp in JSON (`scrapedAt`), retain `finalUrl`, optional video with `--screen-video` |
| Screenshot without full comment thread | Expected | Document that `post-screenshot` ≠ `post-engagement`; offer combined mode in phase 3 |

---

## 14. Open questions (resolve before phase 2)

1. **Evidence standard:** Viewport only, or full-page required for legal deliverables?
2. **Instagram accounts:** One login replicated to N profiles, or N manual logins?
3. **Facebook default for batches:** `--public-session` or authenticated?
4. **Aggregate concurrency cap:** Hard cap 100, or configurable up to 200?
5. **Deliverable to client:** JSON only, or ZIP of PNGs + manifest?

---

## 15. Suggested ticket breakdown (Jira/Linear)

| Ticket | Title | Phase | Estimate |
|--------|-------|-------|----------|
| SCRAPE-101 | Add `ScreenshotScrapeResult` + output mapping | 1 | 4h |
| SCRAPE-102 | Common screenshot artifact helper | 1 | 2h |
| SCRAPE-103 | Facebook `post-screenshot` scraper | 1 | 8h |
| SCRAPE-104 | Instagram `post-screenshot` + reel support | 1 | 8h |
| SCRAPE-105 | CLI flags + auto no-video for screenshot scraper | 1 | 4h |
| SCRAPE-106 | Browser tests for screenshot scrapers | 1 | 6h |
| SCRAPE-107 | Docs + README for post-screenshot | 1 | 3h |
| SCRAPE-201 | Worker pool orchestration | 2 | 12h |
| SCRAPE-202 | Profile sharding + ops guide | 2 | 6h |
| SCRAPE-203 | Retries, delays, load test 100 URLs | 2 | 8h |

**Total estimate:** ~7–9 dev-days for MVP (phase 1 + 2).

---

## 16. Reference: current code touchpoints

```text
src/cli/runtime.ts          # mapLimit concurrency — extend or call worker pool
src/cli/parse.ts            # concurrency max 16 — raise + new flags
src/common/output-item.ts   # add screenshot kind mapping
src/common/types.ts         # ScrapeResult union
src/facebook/plugin.ts      # route post-screenshot
src/instagram/plugin.ts     # route post-screenshot
src/instagram/scrapers/profile-scraper/screenshot.ts  # pattern to extract
```

---

## 17. Success metrics

| Metric | Target |
|--------|--------|
| IG reel screenshot success rate (logged in) | ≥ 95% on fixture set |
| FB public post screenshot success rate | ≥ 90% |
| 100 URL batch completion | < 15 min on reference Mac with 10×10 workers |
| Failed items include diagnostics | 100% of login-wall failures |
| Zero regression on existing scrapers | `npm run lint`, unit + browser smoke green |

---

*Last updated: 2026-05-26*

# Instagram control-plane parity plan

## Goal

Add Instagram as a first-class platform beside Facebook in the Docker control plane, API, persistent workers, and admin dashboard.

The admin/API expose two Instagram job families:

1. **Instagram post/reel engagement** — `/p/`, `/reel/`, `/reels/`, and `/tv/` URLs; extracts content, comments, replies, reaction/liker identities, counts, screenshots/evidence, and structured JSON.
2. **Instagram profile** — profile URL; extracts profile metadata and the latest requested posts (20 by default), with screenshots and structured JSON.

Instagram posts and reels are classified separately for display, but both use the `post-engagement` execution contract. `post-screenshot` remains an internal evidence strategy/artifact producer rather than a third admin job family.

## Existing implementation found

The repository already contains a substantial Instagram scraper:

- `src/instagram/plugin.ts` registers `post-engagement`, `post-screenshot`, and `profile-scraper`.
- `src/instagram/scrapers/post-engagement/index.ts` extracts post details, comments/replies, and liker identities.
- `src/instagram/scrapers/post-screenshot/` captures screenshots, engagement JSON, comments, and reactions for posts/reels.
- `src/instagram/scrapers/profile-scraper/` extracts profile metadata and a screenshot.
- `src/instagram/shared/url.ts` recognizes `/p/`, `/reel/`, `/reels/`, and `/tv/` URLs and extracts shortcodes.
- `src/instagram/shared/block-diagnostics.ts` captures login/challenge evidence.
- Browser/unit tests already cover URL classification, post extraction, comments/replies, and profile metadata.

No separate Instagram scraping implementation was found elsewhere in the accessible Downloads tree. The other Instagram files under `wavo/` are OAuth/publishing automation, not evidence scraping, and should not be merged into this control plane.

## Parity gaps

1. The API accepts only `facebook.com` and has no persisted `platform` field.
2. URL classification is Facebook-specific.
3. Worker authentication checks only Facebook `c_user`/`xs` cookies.
4. Worker Docker commands hard-code `--target facebook` and the Facebook profile command.
5. Worker cards represent one Facebook session, not per-platform sessions.
6. Instagram profiles currently use `<profile-root>/instagram`, but control-plane session checks and auth lifecycle do not know that path.
7. Instagram profile scraping does not collect the latest 20 posts; it only extracts header metadata and a screenshot.
8. The dashboard labels every URL as Facebook and offers only Facebook capture types.
9. Swagger models/examples describe only Facebook.
10. `scripts.json` contains a saved self-healing script only for `facebook|post-engagement`; Instagram has no equivalent saved-script fast path.
11. The watch subsystem is Facebook-specific. It must not be advertised for Instagram until a target-aware Instagram watcher exists.

## Data model and API design

### Requests

Add `platform: "facebook" | "instagram" | null` to `CreateJobRequest`.

- If omitted, infer it from the URL host.
- Validate that the URL host matches the selected platform.
- Keep `action: "scrape" | "profile"` for both platforms.
- Keep `action: "watch"` Facebook-only until Instagram watch is implemented.

### Classification

Persist and return:

- `platform`: `facebook` or `instagram`
- `content_type`: `post`, `reel`, `video`, or `profile`
- `selected_scraper`: `post-engagement`, `reel-engagement`, or `profile-scraper`

Instagram mapping:

- `/p/<shortcode>` → `post` → `post-engagement`
- `/reel/<shortcode>`, `/reels/<shortcode>`, `/tv/<shortcode>` → `reel` → `post-engagement`
- `/<username>` → `profile` → `profile-scraper`

### Persistence

Add a non-null `platform` column to `jobs` with migration behavior:

- Existing rows default to `facebook`.
- New rows persist the inferred/explicit platform.
- Restart/resume uses the persisted platform.

### Worker session representation

Keep one worker slot but store independent profiles beneath it:

- `docker/profiles/worker-N/facebook/`
- `docker/profiles/worker-N/instagram/`

Return platform-specific session information for every worker:

```json
{
  "worker": 1,
  "sessions": {
    "facebook": { "authenticated": true, "state": "available" },
    "instagram": { "authenticated": false, "state": "login_required" }
  }
}
```

Authentication endpoints become platform-aware:

- `POST /v1/workers/{worker}/authentication/start?platform=instagram`
- `POST /v1/workers/{worker}/authentication/finish?platform=instagram`

Job authentication derives the platform from the persisted job and requires no query parameter.

## Implementation phases

### Phase 1 — Platform-aware contracts and migrations

Files:

- `central-api-router/src/api_router/models.py`
- `central-api-router/src/api_router/store.py`
- `central-api-router/src/api_router/app.py`
- `central-api-router/tests/test_gateway.py`

Work:

1. Add the platform enum/field and host inference.
2. Replace Facebook-only URL validation with platform-aware validation.
3. Add Instagram URL classification tests for post, reel, TV, and profile.
4. Migrate existing SQLite jobs to `platform=facebook`.
5. Include platform in list/detail/result summary and Swagger examples.

Acceptance:

- Instagram URLs are accepted and correctly classified.
- Cross-platform host mismatches return 422.
- Existing Facebook jobs remain readable.

### Phase 2 — Platform-aware persistent authentication

Files:

- `central-api-router/src/api_router/orchestrator.py`
- `central-api-router/src/api_router/models.py`
- `docker/entrypoint.sh`
- API race/auth tests

Work:

1. Generalize `_cookie_db`, `is_authenticated`, login URLs, and auth container startup by platform.
2. Facebook check remains `c_user` + `xs` under `facebook/Default/Cookies`.
3. Instagram check reads `instagram/Default/Cookies` and requires a valid Instagram session cookie set (verify the exact current cookie names using a logged-in fixture; likely `sessionid` plus account identity cookie).
4. Add `SCRAPE_TARGET=facebook|instagram` to worker containers.
5. Make `login`, `scrape`, and `profile` commands invoke `--target "$SCRAPE_TARGET"`.
6. Include platform in container names to prevent Facebook/Instagram auth collisions.
7. Preserve independent Facebook and Instagram profiles across restarts.

Acceptance:

- A worker can be authenticated to Facebook, Instagram, both, or neither.
- Starting Instagram authentication opens Instagram in noVNC.
- Verifying Instagram login does not alter Facebook state.
- Restarting Docker preserves both sessions.

### Phase 3 — Two Instagram job executors

Files:

- `central-api-router/src/api_router/orchestrator.py`
- `docker/entrypoint.sh`
- `src/instagram/plugin.ts`
- `src/instagram/scrapers/post-engagement/`
- `src/instagram/scrapers/post-screenshot/`
- execution/recovery tests

Work:

1. Pass job platform through static and dynamic Docker commands.
2. Instagram post/reel jobs run `--target instagram --scraper post-engagement`.
3. Fold screenshot/evidence capture into the Instagram post/reel result so each successful job has the same evidence package expectations as Facebook.
4. Preserve comments, replies, reaction totals, liker identities, caption/content, final canonical URL, screenshots, engagement JSON, and session video.
5. Keep successful-but-incomplete extraction as `succeeded` with completeness notes.
6. Ensure failed/cancelled Instagram jobs use the existing `/restart` resume flow and the same persistent Instagram profile.
7. Add Docker-level smoke tests for command construction and result parsing.

Acceptance:

- `/p/`, `/reel/`, `/reels/`, and `/tv/` jobs execute in Docker.
- Results are persisted under `runs/api/jobs/<id>/result.json`.
- Summary/download/log/restart endpoints work identically to Facebook.

### Phase 4 — Instagram profile plus latest posts

Files:

- `src/instagram/scrapers/profile-scraper/index.ts`
- new `src/instagram/scrapers/profile-scraper/posts.ts`
- `src/instagram/scrapers/profile-scraper/extraction.ts`
- `src/common/types.ts`
- browser/unit tests

Work:

1. Retain existing header metadata: username, display name, bio, image, external links, counts, verification, privacy.
2. Add virtualized scrolling over the profile grid.
3. Collect up to `maxPosts` unique post/reel links during every scroll pass, not only at the final DOM state.
4. For each recent item collect shortcode, canonical URL, type, thumbnail, caption/alt text when exposed, timestamp when exposed, and visible engagement counts.
5. Populate `recentPosts`, `requestedPostCount`, `extractedPostCount`, and `errors` using the same common profile contract as Facebook.
6. Keep private profiles successful when useful metadata is available, with a completeness note explaining posts were unavailable.

Acceptance:

- Default profile jobs request 20 recent posts.
- Virtualized posts are accumulated and deduplicated.
- Private/short profiles return useful successful results with truthful counts/notes.

### Phase 5 — Admin dashboard parity

Files:

- `platform/admin-ui/app/page.tsx`
- `platform/admin-ui/app/globals.css`

Work:

1. Add a platform selector: Facebook / Instagram.
2. Change URL label, placeholder, validation copy, and available job types based on platform.
3. Expose two Instagram capture types: Post or reel engagement; Profile plus latest posts.
4. Show platform icon/label on every job row and detail view.
5. Show Facebook and Instagram authentication state separately on worker cards.
6. Add Authenticate/Reauthenticate/Verify controls per platform.
7. Reuse immediate noVNC loading, progress, reconnect, and error UX.
8. Keep Resume job, results, logs, downloads, filters, and summaries platform-neutral.
9. Add platform filter to Jobs and Results.

Acceptance:

- Operators can create and distinguish Instagram jobs without typing scraper identifiers.
- Worker cards clearly show which platform is authenticated.
- Mobile and fixed-desktop layouts remain intact.

### Phase 6 — Swagger, docs, and client startup

Files:

- `central-api-router/src/api_router/app.py`
- `README.md`
- `docs/local-control-plane.md`
- `docs/scrapers/instagram-post-engagement.md`
- `docs/scrapers/instagram-profile-scraper.md`

Work:

1. Add Instagram request/response examples to Swagger.
2. Document URL classification and two job families.
3. Document platform-aware worker authentication.
4. Confirm `just build` and `just start` build/start Instagram support with no extra service.
5. Add curl examples for Instagram post/reel and profile jobs.

## Test matrix

### Unit/API

- Platform inference and host validation.
- Instagram post/reel/profile URL classification.
- SQLite migration defaults old jobs to Facebook.
- Platform-specific cookie detection.
- Docker command includes correct target and profile.
- Failed Instagram job restart.
- Result status and completeness behavior.

### Browser

- Instagram `/p/` comments, replies, and likes dialog.
- Instagram `/reel/` canonicalization and extraction.
- Login/challenge redirect diagnostics.
- Profile metadata and screenshot.
- Profile virtualized latest-post accumulation.

### End-to-end Docker

1. `just build`
2. `just start`
3. Authenticate one worker to Instagram through noVNC.
4. Run one post job, one reel job, and one profile job.
5. Download all results.
6. Force one failure and verify Resume job.
7. Restart the control plane and verify sessions/results persist.

## Explicit non-goals for the first implementation

- Instagram publishing/OAuth Graph API automation from the separate `wavo` project.
- Instagram comment watch until a target-aware watch implementation exists.
- Treating `post-screenshot` as a third user-facing job family.
- Sharing Facebook cookies/profile directories with Instagram.

## Recommended implementation order

Implement Phases 1–3 first and validate a real Instagram post/reel through Docker. Then implement recent profile posts (Phase 4), dashboard parity (Phase 5), and documentation/E2E validation (Phase 6). This avoids building UI around unverified session-cookie and Docker execution assumptions.

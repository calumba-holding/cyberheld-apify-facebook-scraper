# scrape

Local CLI scraper with a plugin-oriented target architecture.

Current plugin support:
- `facebook`
  - scraper: `post-engagement`
  - scraper: `comment-reactions`
- `instagram`
  - scraper: `post-engagement`
  - scraper: `profile-scraper`

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

- macOS
- Google Chrome installed at `/Applications/Google Chrome.app`
- Node.js `>= 20`

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

The `post-engagement` scraper does not enrich comments with comment-level reactions. Use `comment-reactions` when you need reactions for one specific comment.

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

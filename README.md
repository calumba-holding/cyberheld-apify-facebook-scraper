# scrape

Local CLI scraper with a plugin-oriented target architecture.

Current plugin support:
- `facebook`
  - scraper: `post-engagement`
  - scraper: `comment-reactions`

The CLI reuses a persistent Chrome profile per target, always prints JSON to stdout, and can optionally record browser video via Playwright while scraping.

## Project structure

```text
src/
  cli/        CLI parsing, help text, and runtime orchestration
  common/     shared runtime helpers and common types
  facebook/   Facebook-specific plugin, extractors, and types
```

## Features

- persistent per-target Chrome profiles
- one-time manual login flow via CLI
- scraping one or many target URLs
- parallel scraping with `--concurrency`
- strict JSON output to stdout
- optional `--output-file`
- optional browser-only video capture
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

Log into Facebook once with the persistent scraper profile before scraping:

```bash
node dist/main.js profile login --target facebook
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
node dist/main.js scrape --target facebook --scraper post-engagement --target-url "https://www.facebook.com/..."
```

## Profile commands

Open the persistent target profile and log in manually:

```bash
node dist/main.js profile login --target facebook
```

Show the resolved profile path:

```bash
node dist/main.js profile path --target facebook
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
- extracts all reactions for that comment only
- does not scrape post reactions
- fails the result if the target comment cannot be found

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

## Record browser video and save JSON

```bash
node dist/main.js \
  --target facebook \
  --scraper post-engagement \
  --target-url "https://www.facebook.com/..." \
  --screen-video \
  --output-file ./out/facebook-post.json \
  --verbose
```

## Output behavior

- `stdout`: always final JSON
- `stderr`: logs and errors
- `--output-file <path>`: also writes the JSON to disk
- browser video:
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
- per-comment / per-reply reactions when available

## Linting

```bash
npm run lint
npm run lint:fix
```

Rules include:
- strict type-checked TypeScript linting
- max `300` lines per file excluding comments and blank lines

## Notes

- The scraper uses a custom persistent Chrome profile, not the host system default Chrome profile.
- Facebook extraction is scoped to the target post container to avoid drifting into adjacent posts.
- When Facebook does not show a comments filter for small threads, the scraper treats the visible thread as already complete.

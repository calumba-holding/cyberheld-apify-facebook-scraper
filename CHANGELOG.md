# Changelog

## Unreleased

- Added a worker-pool mode (`--workers`, `--worker-concurrency`, `--worker-start-delay-ms`) that forks separate Chrome processes to scale batch scrapes beyond one process's tab limit, with per-worker profile isolation and merged JSON output that preserves input URL order.
- Added per-item retries with exponential backoff (`--max-retries`, default 2) for transient failures and zero-screenshot results, plus `--item-delay-ms` for request pacing; login-wall/blocked-page failures still fail fast. Raised the single-process `--concurrency` cap from 16 to 32.
- Added `docs/operations/parallel-evidence.md` with RAM guidelines and recommended worker counts for large batches.
- Added Facebook watch/share video support for `post-engagement`, including redirect resolution to the final watch URL, original source-video downloads by default, and a `--no-download` opt-out.
- Added an Instagram `profile-scraper` with persistent-profile login plus visible profile metadata extraction and screenshot artifacts. #15
- Changed browser-based scrapers to record Playwright video by default; pass `--no-screen-video` to disable it per run. #14
- Improved Instagram compact-count parsing so values such as `3,4K` are normalized correctly for post and profile metrics.
- Changed the Facebook `post-engagement` scraper to extract post reactions plus comments only, leaving comment-level reaction extraction to the `comment-reactions` scraper.
- Improved `post-engagement` status semantics so posts with zero visible comments or zero visible post reactions can still report `SUCCEEDED` when extraction completed cleanly.
- Added an Instagram `post-engagement` scraper with persistent-profile login plus post details, comments, and post-reaction extraction.  #13
- Improved recorded browser videos to scroll back to the top after extraction so the final artifact includes the surrounding post context.
- Changed `--output-file` JSON artifact names to use a run-id prefix so they line up with the matching video artifact for the same scrape.
- Added a `comment-reactions` Facebook scraper that targets one `comment_id`, extracts all reactions for that comment, and fails the result when the target comment cannot be found.
- Added a local-first Facebook scraping CLI with persistent Chrome profile login, JSON stdout output, parallel URL processing, and optional browser video capture.
- Replaced the earlier Apify actor runtime with a direct local scraper workflow built around `node dist/main.js`.
- Improved browser video artifact handling to keep a single valid final `.webm`, clean up ghost recordings, and handle artifact finalization more reliably.
- Added support for invoking the compiled entrypoint as either `node dist/main.js ...` or `node dist/main.js scrape ...`.

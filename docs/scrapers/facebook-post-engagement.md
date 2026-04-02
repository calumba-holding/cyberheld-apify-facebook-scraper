# Facebook `post-engagement`

This is the current reference scraper and the baseline example for future scraper additions.

## Purpose

Scrape engagement data for a Facebook post using a persistent Chrome profile.

## Current behavior

- opens a Facebook post URL
- follows Facebook share/video redirects before extraction
- scopes extraction to the target post when possible
- extracts post content when a post body block is available
- extracts comments
- attempts to switch to the "All comments" filter
- extracts post reactions
- for Facebook watch/video pages, downloads the original source video as an item artifact in parallel with the scrape unless `--no-download` disables it
- does not enrich comments with comment-level reactions

## Inputs

Required:
- `--target facebook`
- `--scraper post-engagement`
- `--target-url <facebook-post-url>`

Optional:
- `--concurrency <n>`
- `--screen-video`
- `--no-screen-video`
- `--no-download`
- `--output-file <path>`
- `--verbose`

## Output expectations

A successful item includes:
- `post.url`
- optional `post.content`
- `post.reactionSummary.total`
- `post.reactions`
- `comments[]`
- `artifacts.sourceVideo.localPath` for watch/video runs when the original video download is enabled and succeeds

The scraper returns comments without `comments[].reactions`. Use `comment-reactions` for single-comment reaction extraction.

## Success semantics

Current implementation treats an item as:
- `SUCCEEDED` when the all-comments state was resolved and both extraction steps completed, including posts with zero visible comments and posts where the scraper can positively confirm an explicit zero-reaction state
- `PARTIAL` when useful data was extracted but one of those completeness goals was missed
- `FAILED` when runtime execution for the URL failed

## Watch/video note

For Facebook watch/video layouts, `post.url` should reflect the resolved watch URL rather than the original share URL.
The source-video artifact is additive; it does not replace the run-level browser screen recording.

## Notes for future refactors

When extracting reusable pieces from this scraper, prefer moving them into:
- `src/facebook/shared/` when reused by multiple scrapers
- `src/facebook/scrapers/post-engagement/` when they remain scraper-specific

# Facebook `post-engagement`

This is the current reference scraper and the baseline example for future scraper additions.

## Purpose

Scrape engagement data for a Facebook post using a persistent Chrome profile.

## Current behavior

- opens a Facebook post URL
- scopes extraction to the target post when possible
- extracts post content
- extracts comments
- attempts to switch to the "All comments" filter
- extracts post reactions
- enriches comments with comment-level reactions

## Inputs

Required:
- `--target facebook`
- `--scraper post-engagement`
- `--target-url <facebook-post-url>`

Optional:
- `--concurrency <n>`
- `--screen-video`
- `--output-file <path>`
- `--verbose`

## Output expectations

A successful item includes:
- `post.url`
- optional `post.content`
- `post.reactionSummary.total`
- `post.reactions`
- `comments[]`

Comment reactions are attached to individual comments in `comments[].reactions`.

## Success semantics

Current implementation treats an item as:
- `SUCCEEDED` when all-comments filter was applied and both comments + post reactions were extracted
- `PARTIAL` when useful data was extracted but one of those completeness goals was missed
- `FAILED` when runtime execution for the URL failed

## Notes for future refactors

When extracting reusable pieces from this scraper, prefer moving them into:
- `src/facebook/shared/` when reused by multiple scrapers
- `src/facebook/scrapers/post-engagement/` when they remain scraper-specific

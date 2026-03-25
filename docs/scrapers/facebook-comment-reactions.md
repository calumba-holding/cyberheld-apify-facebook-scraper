# Facebook `comment-reactions`

This scraper extracts reactions for one target Facebook comment identified by `comment_id` in the input URL.

## Purpose

Fetch the linked target comment and its reactions without doing a full post-engagement scrape.

## Inputs

Required:
- `--target facebook`
- `--scraper comment-reactions`
- `--target-url <facebook-post-url-with-comment_id>`

Example:

```bash
node dist/main.js \
  --target facebook \
  --scraper comment-reactions \
  --target-url "https://www.facebook.com/...?...&comment_id=123456789"
```

## Current behavior

- opens the target Facebook post URL
- keeps the target post scope when possible
- reads `comment_id` from the URL
- checks the currently loaded comments first because standard Facebook post deep links usually surface the target comment near the top
- falls back to a bounded comment expansion/scroll search when needed
- extracts all reactions for the matching comment only
- does not scrape post reactions
- does not perform a full comment crawl
- when `--screen-video` is enabled, slowly scrolls back to the top at the end so the recording includes the post context

## Output expectations

A successful item includes:
- `post.url`
- `post.reactions = []`
- `comments` with exactly one target comment
- `comments[0].reactions` containing the comment reaction breakdown and users

## Success semantics

- `SUCCEEDED`: target comment found and the scraper completed the single-comment reaction flow
- `FAILED`: missing `comment_id`, target comment not found, or runtime failure prevented extraction

## Notes

- This scraper is optimized for comment deep links on normal Facebook post views.
- Reel or non-standard comment layouts may still require fallback scanning.
- The browser video for this scraper should mostly show the target comment flow rather than a full-post scrape.

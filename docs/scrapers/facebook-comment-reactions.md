# Facebook `comment-reactions`

This scraper extracts reactions for one target Facebook comment identified by `comment_id` in the input URL.

## Purpose

Fetch the linked target comment and its reactions without doing a full post-engagement scrape.

## Inputs

Required:
- `--target facebook`
- `--scraper comment-reactions`
- `--target-url <facebook-post-url-with-comment_id>`

Optional:
- `--public-session`
- `--guest-session`

Example:

```bash
node dist/main.js \
  --target facebook \
  --scraper comment-reactions \
  --target-url "https://www.facebook.com/...?...&comment_id=123456789"
```

## Current behavior

- opens the target Facebook post URL
- reads `comment_id` from the URL
- for `--public-session`, first rewrites public reel comment URLs to the equivalent watch/video URL when Facebook drops `comment_id` on the reel surface, then tries an API-first path by reading the focused target comment from the page's Relay store and replaying `CometUFIReactionsDialogQuery` against that comment feedback id
- for public comment reactions, also replays per-reaction first-page samples across bounded repeated passes, merges `reactors` plus `important_reactors` user edges when present, and best-effort tries `CometUFIReactionsDialogTabContentRefetchQuery` when Facebook exposes a next cursor
- if the public API-first path is unavailable, falls back to the existing DOM path
- keeps the target post scope when possible
- checks the currently loaded comments first because standard Facebook post deep links usually surface the target comment near the top
- falls back to a bounded comment expansion/scroll search when needed
- extracts reactions for the matching comment only
- does not scrape post reactions
- does not perform a full post comment crawl
- slowly scrolls back to the top at the end so the recording includes the post context when browser video is enabled

## Output expectations

A successful item includes:
- `post.url`
- `post.reactions = []`
- `comments` with exactly one target comment
- `comments[0].reactions` containing the comment reaction breakdown and users

## Success semantics

- `SUCCEEDED`: target comment found and the scraper completed the single-comment reaction flow with no visible completeness gap
- `PARTIAL`: target comment and useful reaction data were extracted, but Facebook exposed only a partial public reactor sample (for example when the logged-out reactions refetch query is blocked)
- `FAILED`: missing `comment_id`, target comment not found, or runtime failure prevented extraction

## Public-session note

`--public-session` runs the scraper in a dedicated persistent non-login Facebook profile.
For public comment deep links, it now prefers an API-first path that can extract the focused target comment and its visible reaction users without opening the nested reactions modal. When a public reel deep link drops `comment_id`, the scraper first rewrites it to the equivalent watch/video URL before attempting the API path. Logged-out Facebook still tends to block reaction pagination with `Unauthorized logged out query`, so public comment-reaction runs may return `PARTIAL` with a non-zero reaction count and a partial user list.

## Guest-session note

`--guest-session` runs the same scraper in a temporary Chrome session without saved login state.
It is intended for publicly visible comment deep links when a fresh session is desired. If Facebook redirects the browser away from the requested comment URL to home/login or another unrelated page, the item fails immediately instead of scraping the redirected page and captures blocked-page screenshot/html diagnostics.

## Notes

- This scraper is optimized for comment deep links on normal Facebook post views.
- Reel or non-standard comment layouts may still require fallback scanning.
- The browser video for this scraper should mostly show the target comment flow rather than a full-post scrape.

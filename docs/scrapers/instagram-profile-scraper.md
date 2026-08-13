# Instagram profile-scraper

## Goal

Scrape visible profile metadata for a single Instagram account, capture screenshot evidence, and collect recent post/reel links.

## CLI

```bash
scrape --target instagram --scraper profile-scraper --target-url "https://www.instagram.com/<handle>/"
```

## Extracted data

- canonical profile URL
- username / handle
- display name when visible
- bio when visible
- profile picture URL when visible
- post / follower / following counts when visible
- verified / private indicators when visible
- visible external links
- screenshot artifact paths
- up to `--max-posts` recent posts/reels (default 20)
- recent item canonical URL, shortcode, type, thumbnail, and visible description
- requested/extracted post counts and extraction errors

## Status rules

### `SUCCEEDED`

- usable profile metadata was extracted
- unavailable screenshots or recent posts remain visible through artifact/count/error metadata rather than changing the terminal job status

### `FAILED`

- the profile page could not be loaded
- or no usable profile metadata could be extracted

## Notes

- the scraper prefers visible header data and falls back to canonical/meta hints where needed
- screenshot artifacts are written to a deterministic run-scoped path and referenced in the item output
- the profile grid is virtualized; links are accumulated during every scroll pass and deduplicated
- private profiles can succeed with metadata and zero recent posts when Instagram does not expose the grid

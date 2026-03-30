# Instagram profile-scraper

## Goal

Scrape visible profile metadata for a single Instagram account and capture at least one screenshot artifact.

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

## Status rules

### `SUCCEEDED`

- usable profile metadata was extracted
- at least one screenshot artifact was captured

### `PARTIAL`

- usable profile metadata was extracted
- but screenshot capture did not complete

### `FAILED`

- the profile page could not be loaded
- or no usable profile metadata could be extracted

## Notes

- the scraper prefers visible header data and falls back to canonical/meta hints where needed
- screenshot artifacts are written to a deterministic run-scoped path and referenced in the item output

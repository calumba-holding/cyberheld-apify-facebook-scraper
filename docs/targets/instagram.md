# Instagram target notes

## Supported scraper

- `post-engagement`
- `profile-scraper`

## Current behavior

- uses the persistent local Chrome profile under `~/.scrape/profiles/instagram`
- `profile login --target instagram` opens the Instagram login page for one-time manual authentication
- post caption and visible counts are read from Instagram page metadata when available
- profile pages can be scraped for visible profile metadata and screenshot artifacts
- comments are collected from visible post comment permalinks and expanded by clicking `Load more comments` / `View all replies` where visible
- liker profiles are collected from the likes dialog when the logged-in profile can open it

## URL expectations

- supported target URLs are Instagram post URLs such as:
  - `https://www.instagram.com/p/<shortcode>/`
- supported profile URLs are Instagram profile URLs such as:
  - `https://www.instagram.com/<handle>/`
- query parameters may be present; the scraper prefers the canonical URL from the page

## Completeness semantics

- internally, Instagram uses target-neutral completeness signals; the JSON output keeps the legacy `allCommentsFilterApplied` field name for backward compatibility
- for Instagram output, `allCommentsFilterApplied` reflects whether the bounded comment crawl finished without visible expansion work remaining
- the scraper reports `PARTIAL` when comment expansion still appears actionable after the crawl budget
- the scraper also reports `PARTIAL` when the likes dialog cannot be opened for user-level extraction
- the profile scraper reports `PARTIAL` when profile metadata is extracted but screenshot capture does not complete

## Implementation notes

- keep Instagram-specific selectors and DOM assumptions inside `src/instagram/`
- prefer metadata and stable permalink/timestamp anchors over brittle class-name matching

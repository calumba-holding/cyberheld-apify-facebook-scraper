# Instagram post-engagement

## Goal

Scrape engagement data for a single Instagram post with the local persistent-profile CLI flow.

## CLI

```bash
scrape --target instagram --scraper post-engagement --target-url "https://www.instagram.com/p/<shortcode>/"
```

## Extracted data

- canonical post URL
- post caption when available
- visible like/comment totals from labeled UI counts or page metadata
- liker profiles from the likes dialog when available
- visible comments
- comment ids derived from Instagram comment permalink URLs
- comment timestamps from visible `<time>` elements when available

## Status rules

### `SUCCEEDED`

- visible comments were fully extracted within the bounded comment crawl
- liker profiles were extracted from the likes dialog

### `PARTIAL`

- the post was scraped, but liker profiles could not be opened or extracted
- or visible comment expansion still remained actionable after the crawl budget

### `FAILED`

- the post page could not be loaded or no usable engagement data could be extracted

## Notes

- Instagram has no Facebook-style `All comments` filter; the JSON output keeps `allCommentsFilterApplied` as a backward-compatible field name for comment-crawl completeness
- the scraper prefers labeled UI counts and falls back to page metadata when visible count labels are absent

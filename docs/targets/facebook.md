# Facebook Target

## Scope

Facebook is currently the only supported target.

Current scraper:
- `post-engagement`

## Behavioral rules

- use the persistent target-specific Chrome profile
- keep Facebook-specific scraping logic inside `src/facebook/`
- prefer target-local shared helpers over leaking logic into `src/common/`
- keep selectors and UI assumptions documented when adding a new scraper

## URL handling

Facebook target URLs may contain share or tracking parameters.

Current normalization rules remove known non-essential parameters such as:
- `rdid`
- `share_url`

When adding new URL helpers:
- keep normalization in a Facebook-local helper
- preserve parameters that are required for scraper behavior
- document scraper-specific requirements such as `comment_id`

## Selector guidance

- prefer selectors scoped to the target post or target dialog
- avoid page-global selectors when a scoped locator is possible
- document locale-sensitive selectors or English-label assumptions
- keep selector constants centralized when they are reused

## Comment targeting guidance

For Facebook post deep links that include `comment_id`:
- normal post views usually surface the target comment in a highlighted position near the top
- reel or non-standard layouts may still require a bounded fallback scan

Do not assume a full comment crawl is required for every comment-targeted scraper.

## Shared-helper guidance

Move reusable Facebook-only logic into target-local shared helpers when reused by multiple scrapers.

Examples:
- URL parsing and normalization
- target comment lookup
- modal open/close helpers
- comment record extraction
- reaction user normalization

## Testing guidance

Facebook-specific behavior should be covered at the smallest useful level:
- unit tests for URL parsing, selector helpers, mapping, and matching
- browser tests for DOM/locator behavior where unit tests are not enough

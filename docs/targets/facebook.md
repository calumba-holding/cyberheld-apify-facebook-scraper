# Facebook Target

## Scope

Facebook is currently the only supported target.

Current scrapers:
- `post-engagement`
- `comment-reactions`

## Behavioral rules

- use the persistent target-specific Chrome profile by default
- allow `--public-session` for public Facebook scrape runs that should keep a separate persistent non-login profile
- allow `--guest-session` for public Facebook scrape runs that should not reuse saved login state
- keep Facebook-specific scraping logic inside `src/facebook/`
- prefer target-local shared helpers over leaking logic into `src/common/`
- keep selectors and UI assumptions documented when adding a new scraper

## URL handling

Facebook target URLs may contain share or tracking parameters.
They may also begin as generic share links and then resolve into a post permalink or a watch/video URL during navigation.

Current normalization rules remove known non-essential parameters such as:
- `rdid`
- `share_url`

When adding new URL helpers:
- keep normalization in a Facebook-local helper
- preserve parameters that are required for scraper behavior
- preserve `v` for watch URLs and `comment_id` for comment-targeted flows
- document scraper-specific requirements such as `comment_id`

## Selector guidance

- prefer selectors scoped to the target post or target dialog
- for watch/video layouts, prefer the watch feed container instead of page-global selectors when it is available
- avoid page-global selectors when a scoped locator is possible
- document locale-sensitive selectors or English-label assumptions
- keep selector constants centralized when they are reused

## Comment targeting guidance

For Facebook post deep links that include `comment_id`:
- normal post views usually surface the target comment in a highlighted position near the top
- reel or non-standard layouts may still require a bounded fallback scan
- the `comment-reactions` scraper should stop once the target comment is found instead of doing a full comment crawl

Do not assume a full comment crawl is required for every comment-targeted scraper.

## Public-session guidance

For Facebook public-session runs:
- launch a dedicated persistent non-login profile such as `~/.scrape/profiles/facebook-public`
- reuse cookie-consent and other non-login browser state across runs
- warm the session on Facebook before navigating to the target post
- apply best-effort stealth hardening because the browser is still automation-controlled
- for page-scoped public post URLs, prefer an API-first flow: open the page root, capture the public feed GraphQL request template, find the target post in the feed payload, request the single-post GraphQL payload directly, request the focused-story UFI GraphQL payload directly, replay the public top-level comment pagination query directly when more public comment pages exist, replay the public depth-1 reply pagination query when visible replies expose expansion tokens, replay the public reactions dialog query to collect visible per-user reaction entries, repeat those logged-out reaction samples across bounded passes to absorb unstable ordering, and best-effort try the reactions-dialog refetch query when a next cursor is exposed
- for public reel URLs, prefer rewriting the reel URL to the equivalent watch/video URL before extraction because the logged-out watch/video surface is usually richer and more stable than the logged-out reel surface
- for public watch/video post-engagement runs, prefer a GraphQL-first video flow before DOM scraping: read the loaded video's `storyId` and `feedbackId` from Relay, request `CometFocusedStoryViewUFIQuery` directly, replay public top-level comment pagination until the exposed cursors are exhausted, replay visible depth-1 reply pagination for comments that expose reply expansion tokens, and merge the watch-surface `TAHOE` comment/reply pagination queries when that watch-specific public path is available
- if that public watch/video API path still does not produce a usable comment result and the DOM comment crawl remains empty, also look for visible comments already present in the page's Relay store and merge those visible public comments into the final result
- for public `comment-reactions` deep links, prefer the focused-comment Relay-store path first: if a reel deep link drops `comment_id`, rewrite it to the equivalent watch/video URL, then extract the target comment's feedback id from the loaded page state and replay the public reactions dialog query for that comment before falling back to DOM modal automation
- treat that API-first flow as headless-friendly and independent of the browser screen video; it should still preserve the normal CLI/output contract
- fail fast when Facebook redirects the browser away from the requested target URL to home/login or another unrelated page
- capture blocked-page screenshot/html diagnostics when that redirect failure happens

## Guest-session guidance

For Facebook guest-session runs:
- launch a temporary Chrome session without the saved target profile
- expect best-effort behavior only for publicly visible posts, comments, and reactions
- dismiss visible guest modals/cookie prompts before extraction when possible
- warm the session on Facebook before navigating to the target post
- apply best-effort guest-session stealth hardening to reduce obvious automation fingerprints
- fail fast when Facebook redirects the browser away from the requested target URL to home/login or another unrelated page
- capture blocked-page screenshot/html diagnostics when that redirect failure happens
- keep the same scraper names and JSON contract; only the browser session mode changes
- do not use the persistent profile for browser navigation in this mode

## Watch/video guidance

For Facebook watch/video pages:
- expect the final navigated URL to be a watch URL even when the input was a generic share link
- scope extraction to the watch feed container when possible
- keep comment extraction compatible with video pages that do not expose a standard post body block
- when running `post-engagement` on a watch/video URL, also download the original source video as a per-item artifact when possible unless `--no-download` disables it
- persistent-profile runs may pass browser cookies to the downloader; guest-session runs must work without the saved profile cookies

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

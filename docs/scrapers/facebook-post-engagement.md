# Facebook `post-engagement`

This is the current reference scraper and the baseline example for future scraper additions.

## Purpose

Scrape engagement data for a Facebook post using the authenticated persistent Chrome profile by default, a persistent non-login public profile when `--public-session` is set, or a temporary Facebook guest session when `--guest-session` is set.

## Current behavior

- opens a Facebook post URL
- follows Facebook share/video redirects before extraction
- scopes extraction to the target post when possible
- extracts post content when a post body block is available
- extracts comments
- attempts to switch to the "All comments" filter
- extracts post reactions
- for Facebook watch/video pages, downloads the original source video as an item artifact in parallel with the scrape unless `--no-download` disables it
- when the self-healing LLM path generates or repairs a script, captures the sanitized HTML snapshot and a full-page screenshot as item diagnostics
- does not enrich comments with comment-level reactions

## Inputs

Required:
- `--target facebook`
- `--scraper post-engagement`
- `--target-url <facebook-post-url>`

Optional:
- `--concurrency <n>`
- `--public-session`
- `--guest-session`
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
- `artifacts.selfHealing[]` when the run generated or repaired a saved extraction script

The scraper returns comments without `comments[].reactions`. Use `comment-reactions` for single-comment reaction extraction.

## Success semantics

Current implementation treats an item as:
- `SUCCEEDED` when the all-comments state was resolved and both extraction steps completed, including posts with zero visible comments and posts where the scraper can positively confirm an explicit zero-reaction state
- `PARTIAL` when useful data was extracted but one of those completeness goals was missed
- `FAILED` when runtime execution for the URL failed

## Public-session note

`--public-session` keeps the same scraper behavior and output contract but runs inside a dedicated persistent non-login Facebook profile.
Use it as the preferred no-login mode for publicly visible posts when you want cookie-consent and other non-login state to survive across runs.
For public reel URLs, the scraper first rewrites the reel to the equivalent watch/video URL because Facebook's logged-out watch/video surface exposes richer public post/comment data than the reel surface. For public watch/video post-engagement runs, the scraper now also tries a GraphQL-first video path before DOM scraping by reading the loaded video's `storyId` and `feedbackId` from Relay, requesting `CometFocusedStoryViewUFIQuery` directly, replaying public top-level comment pagination, replaying visible reply pagination, and additionally merging the watch-surface `TAHOE` comment/reply pagination queries when Facebook exposes those watch-specific cursors. If that still does not yield a usable API result and the DOM comment crawl stays empty, the scraper falls back to merging any visible public Relay comments already present on the page into the final result.

For page-scoped public post URLs, the scraper now tries an API-first path before DOM scraping:
- warm a logged-out public session on the page root
- capture the public `ProfileCometTimelineFeedRefetchQuery` request template
- find the target post in the public feed payload, paging that feed via GraphQL when needed
- request `CometSinglePostDialogContentQuery` directly via GraphQL using the captured public-session parameters
- then request `CometFocusedStoryViewUFIQuery` directly via GraphQL to maximize the public comment/reaction totals available without opening the dialog through the DOM
- when the focused-story payload reports more public top-level comments, replay `CommentsListComponentsPaginationQuery` directly via GraphQL to collect the extra visible public comment pages
- when public top-level comments expose reply expansion tokens, replay `Depth1CommentsListPaginationQuery` directly via GraphQL to collect the visible public reply batches
- replay `CometUFIReactionsDialogQuery` directly via GraphQL to collect public per-user post reaction entries and reaction-specific first-page samples
- repeat those public first-page reaction queries across bounded passes and merge/deduplicate the samples because Facebook's logged-out reactor ordering can drift between passes
- best-effort replay `CometUFIReactionsDialogTabContentRefetchQuery` when the reactions payload exposes a next cursor; if Facebook allows the refetch path, merge extra reaction-user pages into `post.reactions`

Current API-first limitations:
- it returns public post text, public reaction totals, public per-user reaction entries, and the visible comment payload that Facebook exposes to the logged-out session, including additional paged top-level comment batches and visible reply batches when the public pagination queries are available; on watch/video surfaces this now also includes repeated pagination passes until the exposed public cursors are exhausted or the bounded safety limit is reached, plus a second bounded bundle pass to absorb logged-out payload drift between requests
- post reaction-user extraction is still best-effort because Facebook often blocks the reactions refetch query for logged-out sessions with `Unauthorized logged out query`, leaving only the first visible page for each reaction bucket available
- it does not yet guarantee `All comments`, so `completeness.allCommentsFilterApplied` stays `false`
- because of those limits, successful API-first public-session items are currently expected to be `PARTIAL`

## Guest-session note

`--guest-session` keeps the same scraper behavior and output contract but runs inside a temporary Chrome session without saved login state.
Use it only for publicly visible posts when you explicitly want a fresh session. If Facebook redirects the browser away from the requested post to home/login, the scraper now fails fast with a clear redirect error and captures blocked-page screenshot/html diagnostics. If Facebook merely hides reactions/comments behind guest restrictions, the item may still become `PARTIAL`.

## Watch/video note

For Facebook watch/video layouts, `post.url` should reflect the resolved watch URL rather than the original share URL.
The source-video artifact is additive; it does not replace the run-level browser screen recording.

## Notes for future refactors

When extracting reusable pieces from this scraper, prefer moving them into:
- `src/facebook/shared/` when reused by multiple scrapers
- `src/facebook/scrapers/post-engagement/` when they remain scraper-specific

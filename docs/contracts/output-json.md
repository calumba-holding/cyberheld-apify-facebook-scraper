# Output JSON Contract

All scrape runs emit one JSON object to stdout.

## Top-level shape

```ts
{
  target: SupportedTarget;
  scraper: string;
  profileDir: string;
  run: {
    runId: string;
    startedAt: string;
    finishedAt: string;
    concurrency: number;
    requestedUrls: number;
    browserSession: 'persistent-profile' | 'public-session' | 'guest-session';
  };
  summary: {
    succeeded: number;
    partial: number;
    failed: number;
  };
  artifacts: {
    video: {
      present: boolean;
      localPath?: string;
    };
  };
  results: ScrapeItemOutput[];
}
```

## Per-item shape

```ts
{
  input: { targetUrl: string };
  scrape: {
    jobId: string;
    status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
    scrapedAt: string;
    runtime: 'cli';
    browser: 'persistent-chrome-profile' | 'guest-chrome-session';
    error?: string;
  };
  completeness?: {
    allCommentsFilterApplied: boolean;
    commentsExtracted: boolean;
    postReactionsExtracted: boolean;
  };
  post?: {
    url: string;
    content?: string;
    reactionSummary: { total: number };
    reactions: ReactionUser[];
  };
  comments?: ScrapedComment[];
  profile?: {
    url: string;
    username?: string;
    displayName?: string;
    bio?: string;
    profilePictureUrl?: string;
    externalLinks: string[];
    counts: { posts?: number; followers?: number; following?: number };
    indicators: { verified: boolean; private: boolean };
  };
  artifacts?: {
    screenshots?: { localPath: string }[];
    sourceVideo?: { localPath: string };
    blockedPage?: {
      finalUrl: string;
      screenshot?: { localPath: string };
      html?: { localPath: string };
    };
  };
}
```

`profileDir` remains part of the top-level contract. For Facebook `public-session` runs it reports the dedicated public-profile path. For guest Facebook runs it still reports the resolved target profile path for compatibility, even though that persistent profile is not used by the scrape session.

## Status semantics

### `SUCCEEDED`

Use when the scraper met its intended completeness rules for that scraper. For `post-engagement`, that can still be `SUCCEEDED` when `comments` is empty because the target post has no visible comments. An empty `post.reactions` array only counts as complete when the scraper can positively confirm a zero-reaction state for the target post.

### `PARTIAL`

Use when the scraper produced useful output but one or more non-fatal completeness goals were not met.

### `FAILED`

Use when the scraper could not produce the requested result for that input URL.

Runtime failures should keep the same item shape and populate:
- `scrape.status = 'FAILED'`
- `scrape.error`
- empty reaction/comment arrays as appropriate
- `artifacts.blockedPage` when the scraper captured redirect/login-wall diagnostics before failing

## Stability rule

New scrapers may omit irrelevant data, but they should preserve the overall shape whenever possible.

Preferred approach:
- keep `post` present even when a scraper does not extract post reactions
- keep `comments` present even when empty
- use empty arrays and explicit booleans instead of shape drift

## Scraper-specific status note

The `comment-reactions` scraper may report `SUCCEEDED` while leaving post reactions empty, because its success condition is finding the target comment and extracting that comment's reactions rather than scraping the post reaction list. For Facebook `public-session` comment deep links, it may also report `PARTIAL` when the target comment and its aggregate reaction data are available but the logged-out reaction-user list is only partially exposed.

The `post-engagement` scraper returns comments without `comments[].reactions`; it extracts post reactions only.
For Facebook watch/video runs, `post.url` should reflect the resolved watch or video permalink after Facebook redirects, not the original share URL.
Facebook public-session runs report `run.browserSession = 'public-session'` while keeping `results[].scrape.browser = 'persistent-chrome-profile'` because they still use a persistent Chrome profile.
For Facebook page-post public-session runs, an API-first fallback may return `PARTIAL` with a non-zero `post.reactionSummary.total` while `post.reactions` contains only the currently reachable public per-user reaction samples from the public reactions dialog GraphQL path rather than a guaranteed full reactor list. The scraper repeats those first-page reaction samples across bounded passes to recover some public ordering drift and also best-effort tries the reactions-dialog refetch query when the first page exposes a next cursor, but logged-out sessions may still receive `Unauthorized logged out query` and remain partial. The same public API-first path may still populate multiple visible top-level comment pages and visible reply batches via GraphQL pagination even though `completeness.allCommentsFilterApplied` remains `false`.
Facebook guest-session runs report `run.browserSession = 'guest-session'` and `results[].scrape.browser = 'guest-chrome-session'`.
When Facebook redirects a public/guest session away from the requested target, failed items may include `artifacts.blockedPage` with screenshot/html diagnostics for the blocked page.

For Instagram `post-engagement`, `PARTIAL` is expected when visible comment expansion still remains actionable after the crawl budget or when the likes dialog cannot be opened for user-level extraction.

For Instagram `profile-scraper`, `SUCCEEDED` means usable profile metadata was extracted and at least one screenshot artifact was captured. `PARTIAL` means metadata was extracted but screenshot capture did not complete.

## Completeness booleans

The `completeness` flags describe whether the scraper completed its intended extraction steps, not whether the resulting arrays are non-empty.

`allCommentsFilterApplied` is a legacy output field name kept for backward compatibility. For non-Facebook targets, read it as "comment visibility completeness" rather than literally "a comments filter was applied".

Examples:
- `commentsExtracted: true` with `comments: []` means the post had no visible comments or the scraper confirmed the visible comment state successfully.
- `postReactionsExtracted: true` with `post.reactionSummary.total: 0` means the scraper completed post-reaction extraction and positively confirmed that the target post shows zero visible reactions.
- for Instagram, `allCommentsFilterApplied: false` means the scraper could still see actionable comment expansion controls after its bounded crawl loop, even though partial comment data may already be present.

## Comment reaction rule

Comment-level reactions belong inside the comment object:

```ts
comment.reactions = {
  count: number;
  label: string;
  breakdown: { reaction: string; count: number }[];
  users: { name: string; profile_url: string; reaction: string }[];
}
```

Post-level reactions belong in:
- `post.reactions`
- `post.reactionSummary.total`

Do not mix comment reactions into the post reaction list.

## Source-video artifact rule

Facebook `post-engagement` items for watch/video URLs may populate `artifacts.sourceVideo` with the downloaded original video file.

## Profile-scraper rule

Profile scrapes populate `profile` and may populate `artifacts.screenshots`.

They do not need to populate:
- `post`
- `comments`
- `completeness`

## Backward-compatibility rule

If a scraper introduces new output fields:
- prefer additive changes
- document them in this file in the same change
- avoid renaming or removing existing fields unless explicitly approved

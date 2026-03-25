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
    browser: 'persistent-chrome-profile';
    error?: string;
  };
  completeness: {
    allCommentsFilterApplied: boolean;
    commentsExtracted: boolean;
    postReactionsExtracted: boolean;
  };
  post: {
    url: string;
    content?: string;
    reactionSummary: { total: number };
    reactions: ReactionUser[];
  };
  comments: ScrapedComment[];
}
```

## Status semantics

### `SUCCEEDED`

Use when the scraper met its intended completeness rules for that scraper.

### `PARTIAL`

Use when the scraper produced useful output but one or more non-fatal completeness goals were not met.

### `FAILED`

Use when the scraper could not produce the requested result for that input URL.

Runtime failures should keep the same item shape and populate:
- `scrape.status = 'FAILED'`
- `scrape.error`
- empty reaction/comment arrays as appropriate

## Stability rule

New scrapers may omit irrelevant data, but they should preserve the overall shape whenever possible.

Preferred approach:
- keep `post` present even when a scraper does not extract post reactions
- keep `comments` present even when empty
- use empty arrays and explicit booleans instead of shape drift

## Scraper-specific status note

The `comment-reactions` scraper may report `SUCCEEDED` while leaving post reactions empty, because its success condition is finding the target comment and extracting that comment's reactions rather than scraping the post reaction list.

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

## Backward-compatibility rule

If a scraper introduces new output fields:
- prefer additive changes
- document them in this file in the same change
- avoid renaming or removing existing fields unless explicitly approved

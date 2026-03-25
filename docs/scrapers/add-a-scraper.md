# Add a Scraper

Use this checklist whenever you add a new scraper.

## Read this first

1. `docs/architecture.md`
2. `docs/contracts/cli.md`
3. `docs/contracts/output-json.md`
4. `docs/contracts/video-artifacts.md`
5. `docs/targets/<target>.md`

## Goals

- keep scraper additions predictable
- keep entrypoints thin
- reuse shared helpers
- preserve CLI and JSON contracts
- update docs together with code

## Preferred file layout

```text
src/<target>/
  plugin.ts
  types.ts
  shared/
  scrapers/
    <scraper>/
      index.ts
      ...helper modules
```

## Naming rules

- scraper names use lowercase kebab-case
- scraper folder name matches scraper name
- scraper docs live in `docs/scrapers/<target>-<scraper>.md`

Examples:
- `post-engagement`
- `comment-reactions`

## Implementation checklist

### 1. Define the scraper contract

Decide and document:
- required URL shape or flags
- whether it extracts post content, post reactions, comments, or comment reactions
- what counts as `SUCCEEDED`, `PARTIAL`, and `FAILED`

### 2. Add the implementation entrypoint

- add a scraper entrypoint under `src/<target>/scrapers/<scraper>/index.ts`
- keep orchestration in the scraper entrypoint
- move reusable target-specific logic into `src/<target>/shared/`

### 3. Wire it into the target plugin

- add the scraper name to the target plugin support list
- route the scraper name to its implementation
- keep `plugin.ts` focused on routing and browser/profile lifecycle

### 4. Preserve contracts

- keep stdout JSON shape stable
- keep stderr for diagnostics only
- do not add scraper-specific ad hoc output modes

### 5. Update docs

Update all relevant docs in the same change:
- `docs/scrapers/<target>-<scraper>.md`
- `docs/contracts/cli.md` if command semantics changed
- `docs/contracts/output-json.md` if output semantics changed
- `docs/targets/<target>.md` if target behavior changed
- `README.md` examples/help if user-facing behavior changed

### 6. Add tests

Minimum expectation:
- parser or validation coverage if new validation rules were added
- registry coverage for the new scraper name
- unit tests for new helper logic
- browser tests when selector/DOM behavior is central to correctness

## DRY rules

Before creating a new helper, check whether the logic belongs in:
- existing scraper-local helper module
- target-local shared helper module

Do not duplicate:
- URL parsing
- target element matching
- modal handling
- output mapping

## Review checklist

Before considering the scraper done:
- help text updated
- README examples updated
- scraper doc added
- tests added/updated
- `npm run lint`
- `npm run build`

## Reference example

See `docs/scrapers/facebook-post-engagement.md` for the current scraper baseline.

# Documentation

This repository keeps its implementation rules inside the codebase, similar to how pi ships docs next to its extension points.

If you are adding or changing a target or scraper, read these files first:

1. `docs/architecture.md`
2. `docs/contracts/cli.md`
3. `docs/contracts/output-json.md`
4. `docs/contracts/video-artifacts.md`
5. `docs/scrapers/add-a-scraper.md`
6. `docs/targets/facebook.md` for Facebook work

## Goals

- keep architecture discoverable from inside the repo
- make scraper additions repeatable and low-risk
- preserve stable CLI and JSON contracts
- keep target-specific scraping logic out of CLI/common layers
- encourage DRY shared helpers instead of copy-paste scraper code

## Document map

### Core architecture

- `docs/architecture.md` — module boundaries, target layout, and scraper lifecycle

### Contracts

- `docs/contracts/cli.md` — command surface, flags, error behavior, exit codes
- `docs/contracts/output-json.md` — stdout JSON schema and result semantics
- `docs/contracts/video-artifacts.md` — screen-video artifact lifecycle

### Target docs

- `docs/targets/facebook.md` — Facebook-specific URL, selector, and behavior notes

### Scraper docs

- `docs/scrapers/add-a-scraper.md` — required workflow for new scrapers
- `docs/scrapers/facebook-post-engagement.md` — current scraper as the reference example

### Automation docs

- `docs/automation/docs-sync.md` — project-local documentation sync skill and usage rules

### Project-local skills

- `.agents/skills/repo-implement-feature/SKILL.md` — implementation workflow for code changes in this repo
- `.agents/skills/repo-docs-sync/SKILL.md` — documentation update workflow paired with implementation work
- `.agents/skills/update-changelog/SKILL.md` — changelog update workflow for unreleased notes

## Documentation rules

- Docs are part of the implementation contract.
- When adding a new scraper, add or update its scraper doc in `docs/scrapers/`.
- When changing CLI behavior, update `docs/contracts/cli.md` and the help/README text in the same change.
- When changing output shape or semantics, update `docs/contracts/output-json.md` in the same change.
- Prefer small focused docs over one large README.

## Planned structure direction

The current Facebook code is still mostly flat under `src/facebook/`. New scraper work should move toward this structure:

```text
src/
  <target>/
    plugin.ts
    types.ts
    shared/
    scrapers/
      <scraper>/
        index.ts
```

`plugin.ts` should stay thin and route to scraper implementations. Shared target-specific helpers should live under `src/<target>/shared/`.

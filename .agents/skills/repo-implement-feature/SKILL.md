---
name: repo-implement-feature
description: Implement or refactor code in this repository while following the repo architecture, keeping changes DRY, preserving CLI/output contracts, and updating documentation in the same change. Use when adding a feature, changing scraper behavior, refactoring code, or modifying repository workflow.
---

# Repo Implement Feature

Use this skill for implementation work in this repository.

If you changed code, you are not done until the related docs are also updated.

## Read first

Before coding, read these files:

1. `docs/README.md`
2. `docs/architecture.md`
3. `docs/contracts/cli.md`
4. `docs/contracts/output-json.md`
5. `docs/contracts/video-artifacts.md`
6. `docs/scrapers/add-a-scraper.md`
7. `docs/targets/facebook.md` for Facebook work
8. `AGENTS.md`
9. `CLAUDE.md`
10. `.agents/skills/repo-docs-sync/SKILL.md`

## Goals

- keep implementation aligned with repo architecture
- keep target-specific logic inside the target folder
- keep orchestration thin and helpers focused
- prefer DRY reusable modules over copy-paste
- preserve stable CLI and JSON contracts unless intentionally changing them
- update docs in the same change as the code

## Implementation rules

- keep CLI parsing/runtime code in `src/cli/`
- keep cross-target runtime helpers in `src/common/`
- keep target-specific scraping logic in `src/<target>/`
- for new target-local reusable logic, prefer `src/<target>/shared/`
- for scraper-specific logic, prefer `src/<target>/scrapers/<scraper>/`
- keep `plugin.ts` thin; use it for routing and target lifecycle orchestration
- avoid leaking target-specific behavior into common layers
- keep files reasonably small; avoid unnecessary monoliths

## Contract rules

Before changing behavior, check whether the change affects:

- CLI usage or validation
- output JSON shape or result semantics
- video artifact behavior
- target-specific assumptions
- scraper-specific success/failure semantics

If yes, update the matching docs in the same change.

## Required doc step

Before finishing implementation work, load and follow:
- `.agents/skills/repo-docs-sync/SKILL.md`

At minimum, consider updates to:
- `docs/**`
- `README.md`
- `AGENTS.md`
- `CLAUDE.md`

## Validation step

After code changes, run:

```bash
npm run lint
npm run build
```

Run extra tests when the affected area has them.

## Completion checklist

Before considering the task done:

1. code implemented or refactored
2. structure follows repo architecture
3. duplicate logic reduced where practical
4. related docs updated via `repo-docs-sync`
5. `npm run lint` passed
6. `npm run build` passed
7. changed file paths are clearly reported

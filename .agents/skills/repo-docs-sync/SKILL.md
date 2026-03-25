---
name: repo-docs-sync
description: Synchronize this repository's internal documentation with code changes. Use whenever you update code, refactor behavior, or add a feature that affects source code, CLI behavior, scraper structure, target behavior, output contracts, or repository workflow so the repo docs are updated in the same change.
---

# Repo Docs Sync

Update repository documentation so it stays aligned with the current codebase.

Use this skill together with implementation work: if you changed code or added a feature, make the corresponding doc updates before considering the task done.

## Read first

Always read these files before editing docs:

1. `docs/README.md`
2. `docs/architecture.md`
3. `docs/contracts/cli.md`
4. `docs/contracts/output-json.md`
5. `docs/contracts/video-artifacts.md`
6. `docs/scrapers/add-a-scraper.md`
7. `docs/targets/facebook.md` for Facebook changes
8. `README.md`
9. `AGENTS.md`
10. `CLAUDE.md`

## Goal

Keep repository docs current whenever implementation changes.

## Allowed edits

Unless the user explicitly asks for more, only edit:

- `docs/**`
- `README.md`
- `AGENTS.md`
- `CLAUDE.md`

Do **not** edit source code, tests, package manifests, or build config when running this skill.

## Workflow

1. Inspect the provided request and any git diff context.
2. Identify which contracts or behavior changed.
3. Update only the docs that are actually affected.
4. Keep wording concise, concrete, and in English.
5. Preserve existing contracts unless the code already changed them.
6. If no doc updates are needed, make no file changes.

## Required checks

For each code change, consider whether it affects:

- architecture or file placement rules
- CLI usage, flags, or validation
- stdout JSON shape or semantics
- video artifact behavior
- target-specific behavior
- scraper-specific behavior
- hook or automation workflows

## Documentation rules

- prefer small focused doc edits over broad rewrites
- keep docs implementation-facing, not marketing-heavy
- if a new scraper is added, add a scraper doc in `docs/scrapers/`
- if a new automation flow is added, document it in `docs/`
- if a contract changed, update the contract doc in the same change

## Output behavior

If you made no documentation edits, say `DOCS_UNCHANGED`.
If you did make edits, briefly list the files you updated.

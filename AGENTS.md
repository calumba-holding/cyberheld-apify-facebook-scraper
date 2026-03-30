# Repository Agent Guide

This repository is a local CLI scraper.

## What this project is

A local CLI scraper with a plugin-oriented architecture.

Current implementation:
- target: `facebook`
- scraper: `post-engagement`
- scraper: `comment-reactions`
- target: `instagram`
- scraper: `post-engagement`

The scraper:
- reuses a persistent Chrome profile per target
- logs in manually once via `profile login`
- scrapes one or many target URLs
- prints JSON to stdout
- can optionally record a host screen video with ffmpeg

## Project structure

```text
src/
  cli/          CLI parsing, help text, argument handling, runtime orchestration
  common/       shared runtime helpers and common/shared types
  facebook/     Facebook target plugin, scrapers, selectors, extractors, target types
  instagram/    Instagram target plugin, scrapers, selectors, extractors, target types
  plugins/      shared plugin helpers such as unsupported-target stubs
  registry.ts   target/plugin registration
```

## Desired extension / plugin structure

The codebase should stay organized around targets and scrapers.

### Rules

- each target gets its own folder: `src/<target>/`
- each target exposes its entrypoint from `src/<target>/plugin.ts`
- each target keeps its own target-specific types in `src/<target>/types.ts`
- scraper-specific modules stay inside the target folder, not in `src/common/`
- shared runtime code goes in `src/common/`
- shared CLI code goes in `src/cli/`
- plugin registration belongs in `src/registry.ts`
- placeholder targets should use `src/plugins/unsupported.ts` until implemented
- do not leak target-specific scraping logic into CLI or common layers

### Example layout

```text
src/
  cli/
    help.ts
    parse.ts
    runtime.ts
    types.ts
  common/
    profile.ts
    screen-recording.ts
    types.ts
  facebook/
    plugin.ts
    types.ts
    profile.ts
    selectors.ts
    constants.ts
    post-root.ts
    post-extraction.ts
    post-reaction-modal.ts
    reactions.ts
    comment-filter.ts
    comment-extraction.ts
    comment-reactions.ts
    comment-reaction-modal.ts
    comment-timestamps.ts
    comments.ts
  plugins/
    unsupported.ts
  registry.ts
```

## Commands

```bash
npm install
npm run build
npm run lint
npm run test
npm run test:unit
npm run test:browser

node dist/main.js --help
node dist/main.js profile login --target facebook
node dist/main.js profile login --target instagram
node dist/main.js profile path --target facebook
node dist/main.js profile path --target instagram
node dist/main.js --target facebook --scraper post-engagement --target-url "https://www.facebook.com/..."
node dist/main.js --target instagram --scraper post-engagement --target-url "https://www.instagram.com/p/..."
```

## Documentation-first workflow

Before adding or changing a target, scraper, CLI contract, output contract, or automation, read:

- `docs/README.md`
- `docs/architecture.md`
- `docs/contracts/cli.md`
- `docs/contracts/output-json.md`
- `docs/contracts/video-artifacts.md`
- `docs/scrapers/add-a-scraper.md`
- `docs/targets/facebook.md` for Facebook work

Repository docs are part of the implementation contract and must be updated in the same change.
Whenever you update code, refactor behavior, or add a feature, first load `.agents/skills/repo-implement-feature/SKILL.md` and then use `.agents/skills/repo-docs-sync/SKILL.md` before finishing.

## Project-local skills

- implementation workflow: `.agents/skills/repo-implement-feature/SKILL.md`
- docs sync: `.agents/skills/repo-docs-sync/SKILL.md`
- changelog updates: `.agents/skills/update-changelog/SKILL.md`

Use the implementation skill for code changes, the docs sync skill to keep repository docs aligned in the same change, and the changelog skill when updating release notes.

## Development rules

- keep the CLI local-first; do not reintroduce legacy cloud-runtime concepts
- keep target-specific code inside `src/<target>/`
- keep shared helpers in `src/common/`
- keep plugin abstractions in `src/plugins/` or `src/common/types.ts`
- stdout should remain structured JSON for scrape commands
- use the persistent profile flow for authenticated scraping
- prefer small modules; lint enforces max 300 lines per file
- run `npm run lint` and `npm run build` after refactors

## Cleanup policy

- do not add legacy cloud-runtime scaffolding or schema files back into this repo
- do not add unused platform-specific storage or runtime layers unless explicitly requested

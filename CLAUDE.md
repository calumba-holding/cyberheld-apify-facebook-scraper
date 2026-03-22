# CLAUDE.md

This repository is a local CLI scraper.

## Summary

- plugin-oriented architecture
- persistent Chrome profile per target
- authenticated Facebook scraping through local Playwright-controlled Chrome
- JSON output to stdout
- optional screen recording via ffmpeg

## Current supported target/scraper

- `facebook` + `post-engagement`

## Key directories

```text
src/
  cli/          CLI parsing, help text, argument handling, runtime orchestration
  common/       shared runtime helpers and common/shared types
  facebook/     Facebook target plugin, scrapers, selectors, extractors, target types
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

## Common commands

```bash
npm install
npm run build
npm run lint
npm run hooks:install

node dist/main.js --help
node dist/main.js profile login --target facebook
node dist/main.js profile path --target facebook
node dist/main.js --target facebook --scraper post-engagement --target-url "https://www.facebook.com/..."
```

## Implementation guidance

- keep target-specific logic inside `src/facebook/`
- keep shared runtime logic in `src/common/`
- keep shared plugin abstractions centralized
- do not reintroduce legacy cloud-runtime patterns, schemas, or platform-specific runtime code
- preserve JSON stdout contract for scrape runs
- preserve persistent-profile login workflow
- keep files under the 300-line lint limit where possible
- after code changes, run:
  - `npm run lint`
  - `npm run build`

## Notes for future targets

If new targets are added:
- create a dedicated folder like `src/instagram/`
- keep target-specific types in that target folder
- keep only shared abstractions in `src/common/types.ts`

# Architecture

## Design principles

- **Local-first**: the CLI runs on the user's machine, reuses persistent browser profiles, and does not depend on a cloud runtime.
- **Convention-first**: targets, scrapers, docs, and tests should live in predictable paths.
- **Thin orchestration**: CLI and target entrypoints coordinate work; extraction logic lives in focused helper modules.
- **Stable contracts**: stdout JSON, exit codes, and artifact behavior must remain predictable across scraper additions.
- **Target isolation**: target-specific scraping logic stays inside `src/<target>/`.
- **DRY shared helpers**: shared target-specific logic belongs in target-local shared modules, not copy-pasted between scrapers.

## Directory roles

```text
src/
  cli/        CLI parsing, help text, runtime orchestration, output writing
  common/     runtime helpers shared by all targets
  <target>/   target plugin, target types, target-specific shared helpers, scraper implementations
  registry.ts target/plugin registration

docs/
  contracts/  stable user-facing and machine-facing contracts
  targets/    target-specific behavioral rules
  scrapers/   how to add scrapers + scraper-specific docs

tests/
  unit/       deterministic parser, registry, output, helper tests
  browser/    Playwright/browser behavior tests for extractors and selectors
```

## Target structure

Each target owns its implementation details.

### Required target files

```text
src/<target>/
  plugin.ts
  types.ts
```

### Preferred structure for new work

```text
src/<target>/
  plugin.ts                # thin target entrypoint and scraper router
  types.ts                 # target-level result/types
  shared/                  # target-specific helpers reused by 2+ scrapers
  scrapers/
    <scraper>/
      index.ts             # scraper entrypoint
      ...helper modules
```

## Placement rules

- `src/cli/`: argument parsing, help text, runtime orchestration, output emission
- `src/common/`: profile management, logging, cross-target runtime helpers
- `src/<target>/shared/`: target-specific reusable helpers such as URL parsing, modal handling, or comment matching
- `src/<target>/scrapers/<scraper>/`: scraper-specific orchestration and helper modules
- `src/registry.ts`: target/plugin registration only

Do not place Facebook scraping logic in `src/cli/` or `src/common/`.

## Scraper lifecycle

A scraper should follow this flow:

1. Parse CLI input in `src/cli/`
2. Resolve target plugin via `src/registry.ts`
3. Launch persistent browser context for the target
4. Route to the selected scraper implementation
5. Run scraper-specific extraction logic
6. Map to the stable output contract
7. Finalize artifacts
8. Emit JSON to stdout

## Entry point responsibilities

### `src/main.ts`

- boot the CLI
- catch top-level errors
- print usage errors consistently

### `src/cli/runtime.ts`

- create run IDs
- manage concurrency
- own browser context lifecycle
- map scraper results to JSON output
- finalize artifacts

### `src/<target>/plugin.ts`

- declare supported scrapers
- provide target profile/browser hooks
- route to scraper implementation
- avoid embedding large extraction flows directly when a scraper grows beyond trivial size

## Shared-helper rule

If logic is reused by two or more scrapers in the same target, move it into `src/<target>/shared/`.

Examples:
- URL normalization
- target comment lookup
- reaction modal open/close behavior
- reusable record extraction

If logic is only used by one scraper, keep it inside that scraper folder.

## Documentation rule

New behavior is not complete until the docs are updated.

At minimum:
- new scraper -> add/update a file in `docs/scrapers/`
- new CLI flag or changed semantics -> update `docs/contracts/cli.md`
- changed JSON shape/semantics -> update `docs/contracts/output-json.md`
- changed target behavior -> update `docs/targets/<target>.md`

## Migration note

The current codebase still uses a mostly flat `src/facebook/` layout. New scrapers and larger refactors should move toward the preferred `shared/` + `scrapers/` structure incrementally instead of forcing a one-shot rewrite.

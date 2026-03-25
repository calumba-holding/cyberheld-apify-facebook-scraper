# CLI Contract

## Command surface

```bash
scrape --target <target> --scraper <scraper> --target-url <url> [--target-url <url> ...] [options]
scrape profile login --target <target> [options]
scrape profile path --target <target>
```

Direct compiled-entrypoint invocation is also supported:

```bash
node dist/main.js [scrape] --target <target> --scraper <scraper> --target-url <url> [options]
node dist/main.js [scrape] profile login --target <target> [options]
node dist/main.js [scrape] profile path --target <target>
```

## Current target/scraper support

- target: `facebook`
- scraper: `post-engagement`

## Flag rules

### Required for scrape runs

- `--target <target>`
- `--scraper <scraper>`
- `--target-url <url>` (repeatable)

### Optional

- `--concurrency <n>`
- `--screen-video`
- `--no-screen-video`
- `--output-file <path>`
- `--chrome-executable <path>`
- `--profile-root-dir <dir>`
- `--wait-after-navigation-ms <ms>`
- `--request-timeout-secs <s>`
- `--verbose`
- `-h`, `--help`
- `--version`

## Output rules

- `stdout`: final JSON only
- `stderr`: logs, warnings, and user-facing errors
- `--output-file`: writes the same final JSON to disk

New scrapers must keep the same stdout/stderr split.

## Exit codes

- `0`: all requested URLs succeeded or partially succeeded without any failed run item
- `1`: at least one requested URL failed during runtime
- `2`: invalid usage or validation error before the scrape run starts

## Validation rules

- `--target` must be a supported target
- `--scraper` must be supported by the selected target
- every `--target-url` must be a valid URL
- integer flags must stay within their documented ranges

Scraper-specific validation is allowed when it is deterministic at parse/dispatch time.

Example:
- a future scraper may require a `comment_id` query parameter in the target URL

## Naming rules

- target names: lowercase kebab-case or single token (`facebook`)
- scraper names: lowercase kebab-case (`post-engagement`, `comment-reactions`)
- environment variables: `SCRAPE_*`

## Adding a new scraper

When adding a new scraper:

1. add the scraper to the target plugin support list
2. update help text in `src/cli/help.ts`
3. update examples in `README.md`
4. update `docs/scrapers/`
5. add or update parser/registry tests

## Error-message guidelines

- keep parse/validation messages short and actionable
- mention the missing or invalid flag explicitly
- prefer one clear sentence over stack traces
- preserve existing error wording unless there is a strong reason to change it

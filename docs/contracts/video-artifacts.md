# Video Artifact Contract

Screen recording is enabled by default for scrape runs and can be disabled with `--no-screen-video` or `SCRAPE_SCREEN_VIDEO=false`.
This contract covers the run-level browser recording artifact. Per-item downloaded source videos are separate additive artifacts.

## Current behavior

- recording is per run, not per individual result item
- only one final `.webm` artifact is kept per run
- zero-byte or ghost recordings are discarded
- if every scrape result failed, the final video artifact is discarded

## Storage behavior

When browser video is enabled:

1. raw Playwright video files are written into a dedicated per-run temp directory
2. the run is finalized
3. the best valid `.webm` is selected
4. the final artifact is moved to its final destination
5. leftover raw files are cleaned up

## Final artifact location

- with `--output-file <path>`: save the video next to the run-scoped JSON output file, with the JSON written as `<run-id>_<basename>` and the video written as `<run-id>.webm`
- without `--output-file`: save under the per-run artifact directory

## Output contract

Run-level browser video presence is reported through:

```ts
artifacts: {
  video: {
    present: boolean;
    localPath?: string;
  };
}
```

Facebook watch/video `post-engagement` items may additionally expose:

```ts
result.artifacts.sourceVideo = {
  localPath: string;
}
```

The source-video artifact does not replace or alter the run-level screen-recording lifecycle. It may be suppressed per run with `--no-download`.

Self-healing script generation/repair may additionally expose per-item screenshot and HTML diagnostics under `result.artifacts.selfHealing[]`. These diagnostics are separate from the run-level screen recording and are captured only when the LLM generation/repair path runs.

## Recorded-flow note

When browser video is enabled, scrapers may add small end-of-run navigation behavior for video clarity. Current behavior includes a slow scroll back to the top after extraction so the recording ends with the surrounding post context visible.

## Design rule for new scrapers

A new scraper may change what appears in the recording because it changes the browser flow, but it must not silently change the artifact lifecycle itself.

Do not change:
- one final video per run
- discard-on-total-failure behavior
- dedicated raw temp directory behavior

unless the contract docs and tests are updated in the same change.

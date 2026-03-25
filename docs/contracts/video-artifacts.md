# Video Artifact Contract

Screen recording is optional and controlled by `--screen-video`.

## Current behavior

- recording is per run, not per individual result item
- only one final `.webm` artifact is kept per run
- zero-byte or ghost recordings are discarded
- if every scrape result failed, the final video artifact is discarded

## Storage behavior

When `--screen-video` is enabled:

1. raw Playwright video files are written into a dedicated per-run temp directory
2. the run is finalized
3. the best valid `.webm` is selected
4. the final artifact is moved to its final destination
5. leftover raw files are cleaned up

## Final artifact location

- with `--output-file <path>`: save video next to the JSON output file
- without `--output-file`: save under the per-run artifact directory

## Output contract

Video presence is reported through:

```ts
artifacts: {
  video: {
    present: boolean;
    localPath?: string;
  };
}
```

## Design rule for new scrapers

A new scraper may change what appears in the recording because it changes the browser flow, but it must not silently change the artifact lifecycle itself.

Do not change:
- one final video per run
- discard-on-total-failure behavior
- dedicated raw temp directory behavior

unless the contract docs and tests are updated in the same change.

# Worker contract — how the codebase is encapsulated in the architecture

The evidence-capture platform treats every capture source uniformly. A **worker**
(the existing Node/TS browser scraper today; device / processing / connector workers
later) does one thing: produce a **capture bundle** for a job. It knows nothing about
custody, hashing, timestamping, or storage — the control plane owns all of that.

```
 worker (capture)            control plane
 ┌───────────────┐   bundle  ┌──────────────────────────────────────────┐
 │ browser/device│  ───────▶ │ Sealing (#34): SHA-256 + TSA + manifest  │
 │  scraper       │          │   → Metadata DB (#33)  → WORM store (#35) │
 └───────────────┘          └──────────────────────────────────────────┘
```

## The capture bundle

`platform/sealing/src/sealing/bundle.py`:

- `CaptureBundle(job_id, artifacts[], worker_id)`
- `ArtifactInput(kind, filename, data, mime_type?, content_item_id?)`
  where `kind ∈ {screenshot, video, image, audio, transcript, ocr, other}`
  (must match the `media_assets.kind` CHECK in the DB schema).

A worker's only obligation: hand a bundle to the Sealing Service. In return the job
gets sealed artifacts, a signed manifest, and a custody-log entry — automatically.

## Encapsulating the existing scraper (today)

The current scraper already writes artifacts to `out/` (`*.png` screenshots, `*.webm`
session videos) and a JSON result. The adapter
`platform/sealing/src/sealing/capture_import.py::bundle_from_directory(job_id, dir)`
maps such an output directory straight into a `CaptureBundle` — no scraper changes
required. This is the concrete seam that turns the standalone CLI into the platform's
**Browser Workers** pool.

Extension inférence maps `out/` files to artifact kinds:

| file | kind |
|------|------|
| `*.png` | screenshot |
| `*.jpg/.jpeg` | image |
| `*.webm/.mp4` | video |
| `*.json` | other (capture data) |
| `*.txt` | transcript |

## Direction

- **Now:** a thin shim runs a scrape, then calls `bundle_from_directory` → `SealingService.seal`.
- **Next (P2):** the Capability Router (#38) invokes the Node worker via this same contract,
  and Temporal (#37) records each step in the custody log. The bundle boundary stays identical —
  only the caller changes. That is what lets the whole codebase live inside the architecture as
  it grows, one worker pool at a time.

# Processing Workers (#45, P4)

Turns captured media into **searchable, transcribed evidence**: `yt-dlp → ffmpeg →
Whisper + OCR`. Its own pool with its own concurrency limit (Router #38) so heavy
video work never starves capture. See `../../docs/evidence-capture-architecture.md`.

## Pipeline

```
media (bytes/URL) --download--> ffmpeg (probe + frames) --> OCR (tesseract)
                                                        \--> transcript (Whisper)
                                   -> derived artifacts sealed (#34) into DB + WORM
```

- `ffmpeg_tools.probe_media` / `extract_frames` — **real** (ffmpeg/ffprobe).
- `TesseractOcr` — **real** OCR on frames; `NullOcr` fallback.
- `Transcriber` — `NullTranscriber` by default (transcription off); `WhisperCliTranscriber`
  is the real adapter, kept behind the interface because the model isn't shipped here.
- `Source` — `PassthroughSource` (bytes already captured) or `YtDlpDownloader` (URL).
- `seal_processing_result` — seals transcript + OCR text + sample frames as evidence.

## Runtime deps (system binaries, not pip)

`ffmpeg`, `ffprobe`, `tesseract`, `yt-dlp`; optional `whisper` CLI + model.

## Tests

`pytest` exercises ffmpeg + tesseract for real (skips cleanly if absent); the sealing
test runs end-to-end against the dev Postgres + local WORM. Transcription is covered
via `NullTranscriber` (Whisper not installed here).

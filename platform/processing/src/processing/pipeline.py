"""Processing pipeline (#45): captured media -> searchable, transcribed evidence.

download -> ffmpeg frames + probe -> Whisper transcript + OCR text. Derived
artifacts are sealed (#34) into the Metadata DB + WORM like any capture, so a
video reel becomes searchable evidence with a custody trail.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from . import ffmpeg_tools
from .ocr import NullOcr, OcrEngine
from .transcribe import NullTranscriber, Transcriber


@dataclass
class ProcessingResult:
    probe: dict
    frame_count: int
    ocr_texts: list[str] = field(default_factory=list)
    transcript: str = ""
    frames: list[bytes] = field(default_factory=list)


class ProcessingPipeline:
    def __init__(
        self,
        ocr: OcrEngine | None = None,
        transcriber: Transcriber | None = None,
    ) -> None:
        self.ocr = ocr or NullOcr()
        self.transcriber = transcriber or NullTranscriber()

    def process(self, media: bytes, fps: float = 1.0, frame_limit: int | None = 10) -> ProcessingResult:
        probe = ffmpeg_tools.probe_media(media)
        frames = ffmpeg_tools.extract_frames(media, fps=fps, limit=frame_limit)
        ocr_texts = [t for t in (self.ocr.ocr(f) for f in frames) if t]
        transcript = self.transcriber.transcribe(media)
        return ProcessingResult(
            probe=probe, frame_count=len(frames), ocr_texts=ocr_texts,
            transcript=transcript, frames=frames,
        )


def seal_processing_result(
    session, job_id, media: bytes, result: ProcessingResult, storage,
    signer=None, timestamper=None, max_frames: int = 3,
):
    """Seal the derived artifacts (transcript, OCR text, sample frames)."""
    from sealing import (
        ArtifactInput,
        CaptureBundle,
        LocalDevTimestamper,
        ManifestSigner,
        SealingService,
    )

    signer = signer or ManifestSigner.from_env()
    timestamper = timestamper or LocalDevTimestamper(signer)

    artifacts = [
        ArtifactInput("transcript", "transcript.txt", result.transcript.encode(), "text/plain"),
        ArtifactInput("ocr", "ocr.txt", "\n".join(result.ocr_texts).encode(), "text/plain"),
    ]
    for i, frame in enumerate(result.frames[:max_frames]):
        artifacts.append(ArtifactInput("image", f"frame_{i:03d}.png", frame, "image/png"))

    bundle = CaptureBundle(
        job_id=uuid.UUID(str(job_id)), worker_id="processing-worker", artifacts=artifacts
    )
    return SealingService(storage, timestamper, signer).seal(session, bundle)

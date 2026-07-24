"""Processing Workers (#45) — yt-dlp -> ffmpeg -> Whisper + OCR."""

from .download import PassthroughSource, Source, YtDlpDownloader
from .ocr import NullOcr, OcrEngine, TesseractOcr
from .pipeline import ProcessingPipeline, ProcessingResult, seal_processing_result
from .transcribe import NullTranscriber, Transcriber, WhisperCliTranscriber

__all__ = [
    "ProcessingPipeline",
    "ProcessingResult",
    "seal_processing_result",
    "TesseractOcr",
    "NullOcr",
    "OcrEngine",
    "NullTranscriber",
    "WhisperCliTranscriber",
    "Transcriber",
    "PassthroughSource",
    "YtDlpDownloader",
    "Source",
]

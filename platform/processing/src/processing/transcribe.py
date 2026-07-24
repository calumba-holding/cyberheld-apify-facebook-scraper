"""Transcription. Whisper needs a model that isn't shipped here, so the default is
a NullTranscriber; WhisperCliTranscriber is the real adapter (shells the `whisper`
CLI) to enable in a deployment that has it."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Protocol


class Transcriber(Protocol):
    def transcribe(self, media: bytes) -> str: ...


class NullTranscriber:
    """Default. Returns empty text — transcription is off until a model is wired in."""

    def transcribe(self, media: bytes) -> str:
        return ""


class WhisperCliTranscriber:
    def __init__(self, model: str = "base") -> None:
        self.model = model

    def transcribe(self, media: bytes) -> str:  # pragma: no cover (needs model)
        whisper = shutil.which("whisper")
        if whisper is None:
            raise RuntimeError(
                "whisper CLI not found — install openai-whisper + a model, or inject "
                "another Transcriber. Kept behind this interface on purpose."
            )
        with tempfile.TemporaryDirectory() as d:
            src = Path(d) / "media"
            src.write_bytes(media)
            subprocess.run(
                [whisper, str(src), "--model", self.model, "--output_format", "txt",
                 "--output_dir", d],
                capture_output=True, check=True,
            )
            txts = list(Path(d).glob("*.txt"))
            return txts[0].read_text().strip() if txts else ""

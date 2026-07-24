"""Media source. YtDlpDownloader fetches a URL (real, needs network); often the
capture already has the bytes, so PassthroughSource covers that case."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Protocol


class Source(Protocol):
    def fetch(self, ref: str | bytes) -> bytes: ...


class PassthroughSource:
    def fetch(self, ref: str | bytes) -> bytes:
        if isinstance(ref, bytes):
            return ref
        return Path(ref).read_bytes()


class YtDlpDownloader:
    def fetch(self, ref: str | bytes) -> bytes:  # pragma: no cover (network)
        if isinstance(ref, bytes):
            return ref
        yt = shutil.which("yt-dlp")
        if yt is None:
            raise RuntimeError("yt-dlp not found on PATH")
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "video.%(ext)s"
            subprocess.run([yt, "-o", str(out), "-f", "mp4/best", ref],
                           capture_output=True, check=True)
            files = [p for p in Path(d).iterdir() if p.is_file()]
            if not files:
                raise RuntimeError("yt-dlp produced no output")
            return files[0].read_bytes()

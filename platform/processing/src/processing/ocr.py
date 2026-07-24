"""OCR on captured frames. TesseractOcr is real; NullOcr is a no-op fallback."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Protocol


class OcrEngine(Protocol):
    def ocr(self, image: bytes) -> str: ...


class TesseractOcr:
    def ocr(self, image: bytes) -> str:
        tesseract = shutil.which("tesseract")
        if tesseract is None:
            raise RuntimeError("tesseract not found on PATH")
        with tempfile.TemporaryDirectory() as d:
            src = Path(d) / "frame.png"
            src.write_bytes(image)
            out = subprocess.run(
                [tesseract, str(src), "stdout"], capture_output=True, text=True, check=True
            )
        return out.stdout.strip()


class NullOcr:
    def ocr(self, image: bytes) -> str:
        return ""

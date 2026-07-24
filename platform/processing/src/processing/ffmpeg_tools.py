"""ffmpeg / ffprobe wrappers — real media processing."""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path


class ToolMissing(RuntimeError):
    pass


def _require(tool: str) -> str:
    path = shutil.which(tool)
    if path is None:
        raise ToolMissing(f"{tool} not found on PATH")
    return path


def probe_media(data: bytes) -> dict:
    """Return {duration, width, height, codec} via ffprobe."""
    ffprobe = _require("ffprobe")
    with tempfile.TemporaryDirectory() as d:
        src = Path(d) / "in"
        src.write_bytes(data)
        out = subprocess.run(
            [ffprobe, "-v", "quiet", "-print_format", "json",
             "-show_format", "-show_streams", str(src)],
            capture_output=True, text=True, check=True,
        )
    info = json.loads(out.stdout)
    video = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), {})
    duration = info.get("format", {}).get("duration")
    return {
        "duration": float(duration) if duration else None,
        "width": video.get("width"),
        "height": video.get("height"),
        "codec": video.get("codec_name"),
    }


def extract_frames(data: bytes, fps: float = 1.0, limit: int | None = None) -> list[bytes]:
    """Extract PNG frames at `fps`, up to `limit`."""
    ffmpeg = _require("ffmpeg")
    with tempfile.TemporaryDirectory() as d:
        dd = Path(d)
        src = dd / "in"
        src.write_bytes(data)
        cmd = [ffmpeg, "-v", "error", "-i", str(src), "-vf", f"fps={fps}"]
        if limit:
            cmd += ["-frames:v", str(limit)]
        cmd += [str(dd / "f_%04d.png")]
        subprocess.run(cmd, capture_output=True, check=True)
        frames = sorted(dd.glob("f_*.png"))
        return [f.read_bytes() for f in frames]

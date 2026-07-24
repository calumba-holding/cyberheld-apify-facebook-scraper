"""Processing pipeline tests (#45).

ffmpeg/ffprobe/tesseract are exercised for real (skipped if absent). Whisper is not
installed, so transcription is tested via NullTranscriber.
"""

from __future__ import annotations

import shutil
import subprocess

import pytest

from processing import NullTranscriber, ProcessingPipeline, TesseractOcr
from processing import ffmpeg_tools

_HAVE_FFMPEG = bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))
_HAVE_TESS = bool(shutil.which("tesseract"))

ffmpeg_only = pytest.mark.skipif(not _HAVE_FFMPEG, reason="ffmpeg/ffprobe not installed")
tess_only = pytest.mark.skipif(not _HAVE_TESS, reason="tesseract not installed")


@pytest.fixture()
def test_video(tmp_path):
    out = tmp_path / "v.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-f", "lavfi",
         "-i", "testsrc=duration=1:size=320x240:rate=5", "-pix_fmt", "yuv420p", str(out)],
        check=True, capture_output=True,
    )
    return out.read_bytes()


@pytest.fixture()
def text_image():
    PIL = pytest.importorskip("PIL")
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGB", (480, 120), "white")
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 56)
    except Exception:
        font = ImageFont.load_default()
    d.text((20, 25), "EVIDENCE 42", fill="black", font=font)
    import io

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@ffmpeg_only
def test_probe_media(test_video):
    info = ffmpeg_tools.probe_media(test_video)
    assert info["width"] == 320 and info["height"] == 240
    assert info["duration"] and info["duration"] > 0


@ffmpeg_only
def test_extract_frames(test_video):
    frames = ffmpeg_tools.extract_frames(test_video, fps=2, limit=3)
    assert 1 <= len(frames) <= 3
    assert all(f[:8] == b"\x89PNG\r\n\x1a\n" for f in frames)


@tess_only
def test_tesseract_reads_text(text_image):
    text = TesseractOcr().ocr(text_image)
    assert "EVIDENCE" in text and "42" in text


def test_null_transcriber():
    assert NullTranscriber().transcribe(b"anything") == ""


@ffmpeg_only
def test_pipeline_process(test_video):
    result = ProcessingPipeline().process(test_video, fps=2, frame_limit=3)
    assert result.frame_count >= 1
    assert result.probe["width"] == 320
    assert result.transcript == ""  # NullTranscriber


@ffmpeg_only
def test_pipeline_seals_derived_artifacts(test_video, tmp_path):
    from metadata_db.engine import make_engine, make_session_factory, ping, reset_schema
    from metadata_db.repository import Repository

    from sealing import LocalWormBackend, verify_package
    from processing import seal_processing_result

    eng = make_engine()
    if not ping(eng):
        pytest.skip("Postgres not reachable")
    reset_schema(eng)
    with make_session_factory(eng)() as s:
        repo = Repository(s)
        case = repo.open_case(external_ref="CASE-PROC")
        job = repo.create_job(case.id, "processing/transcribe", "reel.mp4")
        s.commit()

        result = ProcessingPipeline(ocr=TesseractOcr() if _HAVE_TESS else None).process(
            test_video, fps=2, frame_limit=2
        )
        storage = LocalWormBackend(tmp_path / "worm")
        sealed = seal_processing_result(s, job.id, test_video, result, storage=storage)
        s.commit()

    kinds = {a["kind"] for a in sealed.manifest["artifacts"]}
    assert {"transcript", "ocr", "image"} <= kinds
    ok, problems = verify_package(sealed.manifest_bytes, sealed.signature, sealed.public_key, storage)
    assert ok, problems

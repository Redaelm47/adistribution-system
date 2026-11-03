"""Local media work, no model involved: probing, frames, audio, thumbnails. ffmpeg and ffprobe must be on PATH."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path


def run(*args: str | Path) -> str:
    out = subprocess.run([str(a) for a in args], capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError(f"{args[0]} failed: {out.stderr.strip()[-400:]}")
    return out.stdout


def probe(path: Path) -> dict:
    """Duration, size, frame rate and whether there is sound."""
    info = json.loads(run("ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,r_frame_rate", "-of", "json", path))
    video = next((s for s in info["streams"] if s["codec_type"] == "video"), None)
    if video is None:
        raise ValueError(f"no video stream in {path.name}")
    num, den = (video.get("r_frame_rate") or "30/1").split("/")
    return {
        "duration": round(float(info["format"]["duration"]), 3),
        "width": video["width"],
        "height": video["height"],
        "fps": round(float(num) / float(den or 1), 3),
        "has_audio": any(s["codec_type"] == "audio" for s in info["streams"]),
    }


def frame(video: Path, at: float, out: Path, width: int = 1280) -> Path:
    """One frame at `at` seconds, as JPEG."""
    run("ffmpeg", "-v", "error", "-y", "-ss", f"{at:.3f}", "-i", video, "-frames:v", "1", "-vf", f"scale={width}:-2", "-q:v", "3", out)
    return out


def frames(video: Path, times: list[float], folder: Path, width: int = 512, prefix: str = "f") -> list[dict]:
    """Frames at the given times. Small on purpose: what a model needs to judge a moment, not to admire it."""
    folder.mkdir(parents=True, exist_ok=True)
    shots = []
    for i, t in enumerate(times):
        path = frame(video, t, folder / f"{prefix}{i:02d}.jpg", width)
        shots.append({"t": round(t, 2), "path": path})
    return shots


def spread(duration: float, n: int, margin: float = 0.4) -> list[float]:
    """n times spread over the video, away from the very first and last frames."""
    if duration <= 2 * margin:
        return [duration / 2]
    step = (duration - 2 * margin) / max(1, n - 1)
    return [margin + i * step for i in range(n)]


def audio(video: Path, out: Path, limit: float = 600) -> Path:
    """What Muse Voice Transcribe accepts: WAV, mono, 16-bit PCM, 16 kHz, at most 10 minutes."""
    run("ffmpeg", "-v", "error", "-y", "-i", video, "-t", f"{limit:.0f}", "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-map_metadata", "-1", out)
    return out


def clip(video: Path, start: float, end: float, out: Path, width: int = 640, fps: int = 8) -> Path:
    """A short, small, silent excerpt (for a model that watches the moment itself)."""
    run("ffmpeg", "-v", "error", "-y", "-ss", f"{start:.3f}", "-to", f"{end:.3f}", "-i", video, "-an", "-vf", f"scale={width}:-2,fps={fps}", "-c:v", "libx264", "-crf", "30", "-pix_fmt", "yuv420p", out)
    return out

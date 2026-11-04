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


def face_point(still: Path, face_mask: Path, w: int = 1920, h: int = 1080) -> list[int] | None:
    """The centre of the face SAM 3.1 found, in the bridge's 1920x1080 frame (the still cropped like `cover`). Reads only."""
    import cv2
    import numpy as np

    if not Path(face_mask).exists():
        return None
    sh, sw = cv2.imread(str(still)).shape[:2]
    m = cv2.resize(cv2.imread(str(face_mask), cv2.IMREAD_GRAYSCALE), (sw, sh), interpolation=cv2.INTER_LINEAR)
    k = max(w / sw, h / sh)
    nw, nh = max(w, round(sw * k)), max(h, round(sh * k))
    m = cv2.resize(m, (nw, nh), interpolation=cv2.INTER_LINEAR)
    x0, y0 = (nw - w) // 2, (nh - h) // 2
    m = m[y0 : y0 + h, x0 : x0 + w]
    ys, xs = np.nonzero(m > 127)
    if len(xs) < 50:
        return None
    return [int(xs.mean()), int(ys.mean())]


def cover(still: Path, out: Path, mask: Path | None = None, name: str = "still.jpg", w: int = 1920, h: int = 1080, face_mask: Path | None = None) -> dict:
    """The frozen frame as the bridge shows it (object-fit: cover, 1920x1080), and, when SAM gave a mask, the subject alone
    as a PNG with alpha at the same place, with its box, centre and a point on its head, all in that frame."""
    import cv2
    import numpy as np

    def fit(img, interp):
        ih, iw = img.shape[:2]
        k = max(w / iw, h / ih)
        nw, nh = max(w, round(iw * k)), max(h, round(ih * k))
        r = cv2.resize(img, (nw, nh), interpolation=interp)
        x0, y0 = (nw - w) // 2, (nh - h) // 2
        return r[y0 : y0 + h, x0 : x0 + w]

    img = fit(cv2.imread(str(still)), cv2.INTER_CUBIC)
    cv2.imwrite(str(out / name), img, [cv2.IMWRITE_JPEG_QUALITY, 94])
    res: dict = {"still": name}
    if mask is None or not Path(mask).exists():
        return res
    m = cv2.imread(str(mask), cv2.IMREAD_GRAYSCALE)
    if m.shape[:2] != cv2.imread(str(still)).shape[:2]:
        m = cv2.resize(m, (cv2.imread(str(still)).shape[1], cv2.imread(str(still)).shape[0]), interpolation=cv2.INTER_LINEAR)
    m = fit(m, cv2.INTER_LINEAR)
    m = cv2.GaussianBlur(m, (5, 5), 0)  # soft edge, no stair steps
    ys, xs = np.nonzero(m > 127)
    if len(xs) < 200:
        return res
    rgba = np.dstack([img, m])
    cv2.imwrite(str(out / "cutout.png"), rgba)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())
    head = ys < y0 + (y1 - y0) * 0.18
    # the face: where SAM 3.1 found it; without that, the middle of the subject's top fifth (a guess that misses a cat lying down)
    face = face_point(still, face_mask, w, h) if face_mask else None
    res.update(cutout="cutout.png", box=[x0, y0, x1, y1], center=[int(xs.mean()), int(ys.mean())], face=face or [int(xs[head].mean()), int(ys[head].mean())])
    return res

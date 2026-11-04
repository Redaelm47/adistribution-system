"""Every call to a Meta model goes through here, so every call is timed, priced and put on record.

Prices are Meta's published rates (https://dev.meta.ai/docs/pricing-rate-limits/), in USD.
Without META_API_KEY the class runs in simulation: same steps, same events, no network, and each call says `simulated`.
"""

from __future__ import annotations

import base64
import json
import os
import random
import time
import uuid
from pathlib import Path
from typing import Any, Callable

import httpx

PRICES = {
    "muse-spark-1.3": {"input": 1.25, "output": 4.25, "cached": 0.15},  # per million tokens
    "muse-wonder-1.0": {"input": 4.00, "output": 20.00, "cached": 0.20},
    "muse-voice-transcribe-1.0": {"hour": 0.18},  # per hour of audio, whole seconds
    "sam-3.1": {"image": 0.0025, "frame": 0.0002, "min_frames": 50},
    "muse-image-1.0": {"image": 0.01},
}

TRANSCRIBE = "muse-voice-transcribe-1.0"
SAM = "sam-3.1"


def load_env(root: Path) -> None:
    """Read KEY=value lines from .env without printing them."""
    env = root / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env(Path(__file__).resolve().parents[2])


def token_cost(model: str, usage: dict) -> float:
    p = PRICES[model]
    fresh = max(0, usage.get("input", 0) - usage.get("cached", 0))
    return (fresh * p["input"] + usage.get("cached", 0) * p["cached"] + usage.get("output", 0) * p["output"]) / 1e6


def _preview(parts: list[dict]) -> list[Any]:
    """What was sent, readable: text kept, each image replaced by its name and size."""
    out = []
    for p in parts:
        if "text" in p:
            out.append(p["text"] if len(p["text"]) < 1500 else p["text"][:1500] + " [...]")
        elif "image" in p:
            path = Path(p["image"])
            out.append(f"<image {path.name}, {path.stat().st_size // 1024} KB>")
        elif "video" in p:
            path = Path(p["video"])
            out.append(f"<video {path.name}, {path.stat().st_size // 1024} KB{', ' + str(p['fps']) + ' fps' if p.get('fps') else ''}>")
    return out


# ---------------------------------------------------------------- spending caps: the code refuses to spend past them

RUNS = Path(__file__).resolve().parents[2] / "runs"
RUN_CAP = float(os.environ.get("META_RUN_CAP", "1.00"))  # USD per run
TOTAL_CAP = float(os.environ.get("META_SPEND_CAP", "15.00"))  # USD over every run on this machine


def spent_so_far() -> float:
    """Real money spent, summed from every run's trace (simulated calls cost nothing)."""
    total = 0.0
    for trace in RUNS.glob("*/trace.jsonl"):
        for line in trace.read_text().splitlines():
            try:
                ev = json.loads(line)
            except ValueError:
                continue
            if ev.get("type") == "call" and ev.get("status") in ("done", "error") and ev.get("cost") and not ev.get("simulated"):
                total += float(ev.get("cost") or 0)
    return total


class OverBudget(RuntimeError):
    pass


class Billed(RuntimeError):
    """A call that failed after the API had already billed it (an incomplete answer): its cost still counts toward the caps."""

    def __init__(self, msg: str, usage: dict, cost: float):
        super().__init__(msg)
        self.usage, self.cost = usage, cost


def check_budget(run_spent: float) -> None:
    if run_spent >= RUN_CAP:
        raise OverBudget(f"this run has spent ${run_spent:.2f}, its cap is ${RUN_CAP:.2f} (META_RUN_CAP in .env)")
    total = spent_so_far()
    if total >= TOTAL_CAP:
        raise OverBudget(f"${total:.2f} spent in all, the cap is ${TOTAL_CAP:.2f} (META_SPEND_CAP in .env)")


class Meta:
    def __init__(self, on_call: Callable[..., Any] = lambda **_: None, key: str | None = None):
        self.key = key or os.environ.get("META_API_KEY") or os.environ.get("MODEL_API_KEY", "")
        self.mode = "live" if self.key else "simulation"
        self.spent = 0.0  # real USD spent by this run
        self.on_call = on_call

    # -------------------------------------------------------------- bookkeeping shared by all calls

    def _call(self, model: str, label: str, request: Any, run: Callable[[], tuple[Any, dict, float]], simulated: Callable[[], tuple[Any, dict, float]]):
        cid = uuid.uuid4().hex[:8]
        if self.mode == "live":
            check_budget(self.spent)  # before anything is sent
        self.on_call(id=cid, model=model, label=label, status="run", request=request, simulated=self.mode != "live")
        t = time.time()
        try:
            result, usage, cost = run() if self.mode == "live" else simulated()
            if self.mode == "live":
                self.spent += cost
        except Exception as e:
            billed = {}
            if self.mode == "live" and isinstance(e, Billed):
                self.spent += e.cost
                billed = {"usage": e.usage, "cost": round(e.cost, 6)}
            self.on_call(id=cid, model=model, label=label, status="error", error=str(e)[:500], ms=int((time.time() - t) * 1000), simulated=self.mode != "live", **billed)
            raise
        shown = result if not isinstance(result, (bytes, bytearray)) else f"<{len(result)} bytes>"
        text = json.dumps(shown, default=str)
        self.on_call(id=cid, model=model, label=label, status="done", response=shown if len(text) < 6000 else text[:6000] + " [...]", usage=usage, cost=round(cost, 6), ms=int((time.time() - t) * 1000), simulated=self.mode != "live")
        return result

    @staticmethod
    def _pause():
        time.sleep(random.uniform(0.6, 1.4))

    # -------------------------------------------------------------- Muse Spark: understand and write, strict JSON out

    def respond(self, model: str, parts: list[dict], schema: dict, label: str, simulate: Callable[[], dict], effort: str | None = None) -> dict:
        """`effort`: Muse Spark's reasoning effort (low for plain reading; None keeps the API default)."""

        def live():
            return self._respond_live(model, parts, schema, effort)

        def sim():
            self._pause()
            out = simulate()
            chars = sum(len(p.get("text", "")) for p in parts)
            images = sum(1 for p in parts if "image" in p)
            usage = {"input": chars // 4 + images * 1500, "output": len(json.dumps(out)) // 4, "cached": 0, "estimated": True}
            return out, usage, token_cost(model, usage)

        return self._call(model, label, {"model": model, "input": _preview(parts), "json_schema": schema}, live, sim)

    # -------------------------------------------------------------- Muse Voice Transcribe: words with times

    def transcribe(self, audio: Path, label: str, seconds: float) -> list[dict]:
        cost = int(seconds) / 3600 * PRICES[TRANSCRIBE]["hour"]

        def live():
            words = self._transcribe_live(audio)
            return words, {"audio_seconds": int(seconds)}, cost

        def sim():
            self._pause()
            return [], {"audio_seconds": int(seconds)}, cost

        return self._call(TRANSCRIBE, label, {"model": TRANSCRIBE, "file": f"<audio {audio.name}, {audio.stat().st_size // 1024} KB, {seconds:.1f} s>"}, live, sim)

    # -------------------------------------------------------------- SAM 3.1: one frame, one text prompt, one mask

    def segment(self, image: Path, prompt: str, mask_out: Path, label: str) -> dict | None:
        cost = PRICES[SAM]["image"]

        def live():
            return self._segment_live(image, prompt, mask_out), {"images": 1}, cost

        def sim():
            self._pause()
            return _fake_mask(image, mask_out), {"images": 1}, cost

        res = self._call(SAM, label, {"model": SAM, "image": f"<image {image.name}, {image.stat().st_size // 1024} KB>", "prompt": prompt}, live, sim)
        if res:
            res["mask"] = mask_out
        return res

    # -------------------------------------------------------------- live transport (https://dev.meta.ai/docs/api-reference)

    def _post(self, path: str, **kw) -> httpx.Response:
        """POST with retries on 429, 500 and 503 only, as the docs advise; other errors are raised at once."""
        url = path if path.startswith("http") else f"{BASE}{path}"
        for attempt in range(4):
            r = httpx.post(url, headers={"Authorization": f"Bearer {self.key}"}, timeout=180, **kw)
            if r.status_code in (429, 500, 503) and attempt < 3:
                wait = float(r.headers.get("retry-after") or 0) or 0.5 * 2**attempt + random.random() * 0.3
                time.sleep(min(wait, 60))
                continue
            if r.status_code >= 400:
                try:
                    msg = r.json()["error"]["message"]
                except Exception:
                    msg = r.text[:300] or "empty body"
                raise RuntimeError(f"{r.status_code} from {path}: {msg}")
            return r
        raise RuntimeError(f"gave up on {path} after retries")

    def _respond_live(self, model: str, parts: list[dict], schema: dict, effort: str | None = None) -> tuple[dict, dict, float]:
        body = {
            "model": model,
            "input": [{"type": "message", "role": "user", "content": [_content(p) for p in parts]}],
            "text": {"format": {"type": "json_schema", "name": "answer", "schema": _strict(schema), "strict": True}},
            # Reasoning tokens count as output: 4,000 ran out on the first live run (status incomplete, no answer).
            "max_output_tokens": 16000,
        }
        if effort:
            body["reasoning"] = {"effort": effort}
        data = self._post("/responses", json=body).json()
        u = data.get("usage") or {}
        usage = {
            "input": u.get("input_tokens", 0),
            "output": u.get("output_tokens", 0),
            "cached": (u.get("input_tokens_details") or {}).get("cached_tokens", 0),
            "reasoning": (u.get("output_tokens_details") or {}).get("reasoning_tokens", 0),
        }
        try:
            text = _output_text(data)
        except RuntimeError as e:
            raise Billed(str(e), usage, token_cost(model, usage)) from None
        return json.loads(text), usage, token_cost(model, usage)

    def _transcribe_live(self, audio: Path) -> list[dict]:
        req = {"model": TRANSCRIBE, "audioEncoding": "WAV", "mode": "ENDPOINTING"}
        r = self._post(
            f"/asr/transcribe?sessionId={uuid.uuid4().hex}",
            files={"request": (None, json.dumps(req), "application/json"), "audio": (audio.name, audio.read_bytes(), "audio/wav")},
        ).json()
        turns = [{"start": t["startMs"] / 1000, "end": t["endMs"] / 1000, "text": t["transcript"].strip()} for t in r.get("turns") or [] if t.get("transcript", "").strip()]
        if not turns and (r.get("transcript") or "").strip():
            turns = [{"start": 0.0, "end": (r.get("audioDurationMs") or 0) / 1000, "text": r["transcript"].strip()}]
        return turns

    def _segment_live(self, image: Path, prompt: str, mask_out: Path) -> dict | None:
        noun = prompt.lower().removeprefix("the ").removeprefix("a ").removeprefix("an ").strip()
        body = {
            "model": SAM,
            "input": [{"type": "message", "role": "user", "content": [{"type": "input_text", "text": noun}, _content({"image": image})]}],
            "metadata": {"mask_encoding": "one_bit", "include_confidence": "true"},
        }
        data = self._post("/responses", json=body).json()
        return _decode_sam(_output_text(data), image, mask_out)


BASE = os.environ.get("META_API_BASE", "https://api.meta.ai/v1")


def _content(p: dict) -> dict:
    """One part of a Responses message: text, a JPEG frame, or a small MP4."""
    if "text" in p:
        return {"type": "input_text", "text": p["text"]}
    if "image" in p:
        return {"type": "input_image", "image_url": f"data:image/jpeg;base64,{_b64(p['image'])}"}
    if "video" in p:
        part = {"type": "input_video", "video_url": f"data:video/mp4;base64,{_b64(p['video'])}"}
        if p.get("fps"):
            part["fps"] = p["fps"]
        return part
    raise ValueError(f"unknown part {list(p)}")


def _strict(schema: dict) -> dict:
    """Strict JSON output wants every key required and no extra keys, on every object."""
    s = dict(schema)
    if s.get("type") == "object":
        props = {k: _strict(v) for k, v in s.get("properties", {}).items()}
        s.update(properties=props, required=list(props), additionalProperties=False)
    if s.get("type") == "array" and isinstance(s.get("items"), dict):
        s["items"] = _strict(s["items"])
    return s


def _output_text(data: dict) -> str:
    if isinstance(data.get("output_text"), str):
        return data["output_text"]
    texts = [c.get("text", "") for item in data.get("output", []) for c in item.get("content", []) or [] if c.get("type") == "output_text"]
    if not texts:
        raise RuntimeError(f"no text in the response (status {data.get('status')})")
    return "".join(texts)


def _decode_sam(text: str, image: Path, out: Path) -> dict | None:
    """SAM 3.1 answers in text: a box and a base85 mask per object. The official parser decodes it; the mask sits in its box."""
    import asyncio

    import cv2
    import meta_sam_parser as sp
    import numpy as np

    if not text.strip():
        return None

    async def parse():
        async def events():
            lane = {"item_id": "sam", "output_index": 0, "content_index": 0}
            yield {"type": "response.output_text.delta", "delta": text, **lane}
            yield {"type": "response.output_text.done", "text": text, **lane}
            yield {"type": "response.completed", "response": {"status": "completed"}}

        stream = sp.parse_responses_stream(events(), sp.image_segmentation_format())
        async for _ in stream:
            pass
        return await stream.final_result()

    result = asyncio.run(parse())
    masks = [r for r in result.records if hasattr(r, "mask")]
    if not masks:
        return None
    h, w = cv2.imread(str(image)).shape[:2]
    best = max(masks, key=lambda r: (r.confidence or 0, (r.bounds.right - r.bounds.left) * (r.bounds.bottom - r.bounds.top)))
    ras = np.frombuffer(sp.decode_mask_to_raster(best.mask), np.uint8).reshape(best.mask.height, best.mask.width)
    full = np.zeros((h, w), np.uint8)
    b = best.bounds
    x0, y0 = int(b.left), int(b.top)
    patch = cv2.resize((ras > 0).astype(np.uint8) * 255, (max(1, int(b.right - b.left)), max(1, int(b.bottom - b.top))), interpolation=cv2.INTER_NEAREST)
    ph, pw = patch.shape
    full[y0 : y0 + ph, x0 : x0 + pw] = patch[: max(0, h - y0), : max(0, w - x0)]
    cv2.imwrite(str(out), full)
    ys, xs = np.nonzero(full)
    return {
        "box": [x0, y0, int(b.right), int(b.bottom)],
        "score": best.confidence,
        "center": [int(xs.mean()), int(ys.mean())] if len(xs) else [(x0 + int(b.right)) // 2, (y0 + int(b.bottom)) // 2],
        "objects": len(masks),
    }


def _b64(path: Path) -> str:
    return base64.b64encode(Path(path).read_bytes()).decode()


def _fake_mask(image: Path, out: Path) -> dict:
    """Simulation only. On a Mac, Apple Vision's foreground cut-out stands in for SAM 3.1 (pipeline/tools/cutout.swift), so the moves
    can be checked on a real outline; elsewhere, an ellipse in the middle of the frame. Either way the call is marked simulated."""
    import shutil
    import subprocess

    import cv2
    import numpy as np

    img = cv2.imread(str(image))
    h, w = img.shape[:2]
    swift = Path(__file__).resolve().parents[1] / "tools/cutout.swift"
    if shutil.which("swift") and swift.exists():
        rgba = out.with_name(out.stem + "_vision.png")
        done = subprocess.run(["swift", str(swift), str(image), str(w // 2), str(h // 2), str(rgba), str(out)], capture_output=True, text=True, timeout=120)
        m = cv2.imread(str(out), cv2.IMREAD_GRAYSCALE) if done.returncode == 0 and out.exists() else None
        if m is not None and m.shape[:2] == (h, w) and (m > 127).sum() > 500:
            ys, xs = np.nonzero(m > 127)
            return {"box": [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())], "score": None, "center": [int(xs.mean()), int(ys.mean())], "stand_in": "Apple Vision (simulation)"}
    mask = np.zeros((h, w), np.uint8)
    cv2.ellipse(mask, (w // 2, h // 2), (w // 6, h // 3), 0, 0, 360, 255, -1)
    cv2.imwrite(str(out), mask)
    return {"box": [w // 2 - w // 6, h // 2 - h // 3, w // 2 + w // 6, h // 2 + h // 3], "score": None, "center": [w // 2, h // 2]}

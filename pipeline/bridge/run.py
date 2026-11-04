"""One run, start to end: a video and an ad go in, a bridge comes out, and every model call is on record.

    python -m bridge.run video.mp4 ad.mp4 [--prompt "..."] [--tone funny]

Without META_API_KEY the model calls are simulated, and every event says so.
"""

from __future__ import annotations

import argparse
import json
import shutil
import time
import traceback
import uuid
from pathlib import Path

from . import invent, steps
from .context import Context, StopRun
from .meta import Meta

ROOT = Path(__file__).resolve().parents[2]
RUNS = ROOT / "runs"

PLAN = [
    ("look", "Look at both files", None, steps.look),
    ("transcribe", "Listen", "Muse Voice Transcribe", steps.transcribe),
    ("moment", "Find the moment", "Muse Spark", steps.find_moment),
    ("ad", "Read the ad", "Muse Spark", steps.read_ad),
    ("cutout", "Cut out", "SAM 3.1", steps.cutout),
    ("write", "Write the way in", "Muse Spark", steps.write),
    ("invent", "Write a new move", "Muse Code", invent.invent),
    ("animate", "Animate", None, steps.animate),
    ("review", "Watch the result", "Muse Spark", invent.review),
]


def new_run(video: Path, ad: Path, prompt: str = "", tone: str = "") -> Context:
    rid = time.strftime("%m%d-%H%M%S-") + uuid.uuid4().hex[:4]
    folder = RUNS / rid
    folder.mkdir(parents=True)
    v = folder / ("video" + video.suffix.lower())
    a = folder / ("ad" + ad.suffix.lower())
    shutil.copyfile(video, v)
    shutil.copyfile(ad, a)
    (folder / "inputs.json").write_text(json.dumps({"names": {"video": video.name, "ad": ad.name}, "files": {"video": v.name, "ad": a.name}, "prompt": prompt, "tone": tone}))
    return Context(id=rid, folder=folder, video=v, ad=a, prompt=prompt, tone=tone)


def execute(ctx: Context) -> Context:
    ctx.meta = Meta(on_call=lambda **c: ctx.emit("call", step=ctx.step, **c))
    ctx.emit("start", mode=ctx.meta.mode, prompt=ctx.prompt, tone=ctx.tone, plan=[{"step": s, "title": t, "model": m} for s, t, m, _ in PLAN])
    status = "done"
    try:
        for step, title, model, fn in PLAN:
            ctx.step_start(step, title, model)
            fn(ctx)
    except StopRun:
        status = "no-bridge"
    except Exception as e:  # the interface must show the failure, not hang
        status = "error"
        ctx.emit("step", step=ctx.step, status="error", summary=str(e)[:300])
        (ctx.folder / "error.txt").write_text(traceback.format_exc())
    calls = [e for e in ctx.events if e["type"] == "call" and e.get("status") == "done"]
    total = {
        "calls": len(calls),
        "cost": round(sum(c.get("cost") or 0 for c in calls), 6),
        "input_tokens": sum((c.get("usage") or {}).get("input", 0) for c in calls),
        "output_tokens": sum((c.get("usage") or {}).get("output", 0) for c in calls),
        "seconds": round(time.time() - ctx.t0, 1),
    }
    result = {k: ctx.data.get(k) for k in ("moment", "adread", "bridge", "spec")}
    (ctx.folder / "result.json").write_text(json.dumps({"status": status, "mode": ctx.meta.mode, "total": total, **result}, indent=2, default=str))
    ctx.emit("end", status=status, total=total)
    return ctx


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("video", type=Path)
    p.add_argument("ad", type=Path)
    p.add_argument("--prompt", default="")
    p.add_argument("--tone", default="")
    args = p.parse_args()
    ctx = execute(new_run(args.video, args.ad, args.prompt, args.tone))
    print((ctx.folder / "result.json").read_text())
    print(f"trace: {ctx.folder / 'trace.jsonl'}")


if __name__ == "__main__":
    main()

"""One run, start to end: a video and an ad go in, a bridge comes out, and every model call is on record.

    python -m bridge.run video.mp4 ad.mp4 [--prompt "..."] [--tone funny]

Without META_API_KEY the model calls are simulated, and every event says so.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import time
import traceback
import uuid
from pathlib import Path

from . import invent, library, steps
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


VOICE_PLAN = [("voice", "Your voice", None), ("animate", "Animate", None)]
VOICE_TEXT = {"system": "the Mac's system voice", "own": "your own recording", "none": "no voice, text only"}


def revoice_run(src: str, choice: str) -> Context:
    """A follow-up run that only changes who says the lines: the earlier run's script, moment and cut-out, rendered again.
    No model call (the script was written by Muse Spark in `src`), so it costs nothing."""
    old = RUNS / src
    spec = json.loads((old / "spec.json").read_text())
    inp = json.loads((old / "inputs.json").read_text())
    rid = time.strftime("%m%d-%H%M%S-") + uuid.uuid4().hex[:4]
    folder = RUNS / rid
    (folder / "public").mkdir(parents=True)
    for f in [*old.glob("*.mp4"), *old.glob("*.jpg"), *old.glob("*.png")]:
        if f.name.startswith("bridge"):
            continue
        os.link(f, folder / f.name)  # hard links: no copy, the disk is short
    for f in (old / "public").iterdir():
        if f.is_file() and not f.name.startswith("line"):
            os.link(f, folder / "public" / f.name)
    (folder / "inputs.json").write_text(json.dumps({**inp, "voice_of": src, "voice": choice}))
    ctx = Context(id=rid, folder=folder, video=folder / inp["files"]["video"], ad=folder / inp["files"]["ad"], prompt=inp.get("prompt", ""), tone=inp.get("tone", ""))
    res = json.loads((old / "result.json").read_text())
    ctx.data.update(spec=spec, bridge=res.get("bridge") or {"move": spec["move"], "lines": spec["lines"]}, moment=res.get("moment"), adread=res.get("adread"))
    ctx.data["voice"] = {"choice": choice, "files": []}
    return ctx


def revoice(ctx: Context) -> Context:
    ctx.meta = Meta(on_call=lambda **c: ctx.emit("call", step=ctx.step, **c))
    src = RUNS / json.loads((ctx.folder / "inputs.json").read_text())["voice_of"]
    spec = ctx.data["spec"]
    # a run from before the face prompt existed: find the face once (one SAM 3.1 call), so the move aims at it
    face = spec.get("cutout") and not (src / "face_mask.png").exists() and ctx.meta.mode == "live" and (ctx.folder / "moment_full.jpg").exists()
    plan = ([("face", "Find the face", "SAM 3.1")] if face else []) + VOICE_PLAN
    ctx.emit("start", mode="local" if not face else ctx.meta.mode, prompt="", tone=ctx.tone, plan=[{"step": s, "title": t, "model": m} for s, t, m in plan], voice_of=src.name)
    for line in (src / "trace.jsonl").read_text().splitlines():  # the video's frames and its moment, as the first run found them
        ev = json.loads(line)
        if ev["type"] in ("media", "moment"):
            ctx.emit(ev["type"], **{k: v for k, v in ev.items() if k not in ("n", "type", "t")})
    b = ctx.data["bridge"]
    ctx.emit("bridge", move=b["move"], lines=b["lines"], why=b.get("why", ""), level=3 if b["move"].startswith("gen-") else library.get(b["move"])["level"], idea="")
    status = "done"
    try:
        if face:
            ctx.step_start("face", "Find the face", "SAM 3.1")
            subject = (ctx.data.get("moment") or {}).get("subject") or "subject"
            p = steps.find_face(ctx, ctx.folder / "moment_full.jpg", subject)
            if p:
                spec["face"] = p
                ctx.step_done(f"Face of the {subject} found: the move aims at it")
            else:
                ctx.step_skip("No face found: the move keeps its first aim")
        v = ctx.data["voice"]
        ctx.step_start("voice", "Your voice", None)
        ctx.step_done(f"The script Muse Spark wrote, said by {VOICE_TEXT[v['choice']]}" + (f" ({len(v['files'])} file{'s' if len(v['files']) > 1 else ''})" if v["choice"] == "own" else ""))
        ctx.step_start("animate", "Animate", None)
        steps.render_bridge(ctx)
        ctx.step_done(f"Move “{ctx.data['spec']['move']}” rendered again on this machine with the new voice (no model call)")
    except Exception as e:
        status = "error"
        ctx.emit("step", step=ctx.step, status="error", summary=str(e)[:300])
        (ctx.folder / "error.txt").write_text(traceback.format_exc())
    calls = [e for e in ctx.events if e["type"] == "call" and e.get("status") == "done"]
    total = {"calls": len(calls), "cost": round(sum(c.get("cost") or 0 for c in calls), 6), "input_tokens": 0, "output_tokens": 0, "seconds": round(time.time() - ctx.t0, 1)}
    result = {k: ctx.data.get(k) for k in ("moment", "adread", "bridge", "spec")}
    (ctx.folder / "result.json").write_text(json.dumps({"status": status, "mode": ctx.meta.mode if calls else "local", "total": total, **result}, indent=2, default=str))
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

"""Level 3 and the review loop.

Level 3: when no move of the library fits, Muse Code (Meta's coding agent, run headless with `muse exec`) writes a new move
as a Remotion file. It must type-check, it is rendered like any other, and it joins the library for the next videos.

The loop: Muse Spark watches the rendered bridge and lists what is wrong (text out of frame, unreadable, a broken cut-out,
blank frames, the ad not shown). The fix goes back to whoever made the part at fault: Muse Code for a move it wrote,
Muse Spark for the line. Then the bridge is rendered again and watched again. Two rounds at most.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
import uuid
from pathlib import Path

from . import library, media
from .meta import check_budget, token_cost

ROOT = Path(__file__).resolve().parents[2]
RENDER = ROOT / "render"
GEN = RENDER / "src/product/moves/gen"
MUSE = shutil.which("muse") or str(Path.home() / ".local/bin/muse")
CODE_MODEL = "muse-code"
SPARK = "muse-spark-1.3"


def muse_ready() -> bool:
    return Path(MUSE).exists() and bool(os.environ.get("META_API_KEY"))


# ---------------------------------------------------------------- the generated moves' index, rebuilt from the files on disk


def rebuild_index() -> None:
    """`gen/index.ts` imports every generated move, so the renderer knows them by id (`gen-<name>`)."""
    GEN.mkdir(parents=True, exist_ok=True)
    names = sorted(p.stem for p in GEN.glob("*.tsx"))
    lines = ["// Written by pipeline/bridge/invent.py: one import per move Muse Code wrote. Do not edit by hand.", "import type {MoveProps, Spec} from '../../kit';", "import type React from 'react';"]
    lines += [f"import * as {n} from './{n}';" for n in names]
    lines.append("export const GEN: Record<string, {Component: React.FC<MoveProps>; seconds: (s: Spec) => number}> = {")
    lines += [f"\t'gen-{n.lower()}': {{Component: {n}.Move, seconds: {n}.seconds}}," for n in names]
    lines.append("};")
    (GEN / "index.ts").write_text("\n".join(lines) + "\n")


def _typecheck(file: Path) -> str:
    """Errors from tsc that concern this file, or '' when it is clean."""
    out = subprocess.run(["npx", "tsc", "--noEmit", "-p", "."], cwd=RENDER, capture_output=True, text=True, timeout=300)
    rel = file.relative_to(RENDER).as_posix()
    return "\n".join(l for l in (out.stdout + out.stderr).splitlines() if rel in l or "gen/index.ts" in l)[:3000]


# ---------------------------------------------------------------- Muse Code, headless


def _muse_exec(ctx, prompt: str, label: str) -> dict:
    """One headless Muse Code turn in render/, on record like every model call: what was asked, what it did, tokens, cost."""
    check_budget(ctx.meta.spent)
    task = ctx.folder / f"muse_task_{uuid.uuid4().hex[:6]}.md"
    task.write_text(prompt)
    log = ctx.folder / (task.stem + ".jsonl")
    cid = uuid.uuid4().hex[:8]
    ctx.emit("call", step=ctx.step, id=cid, model=CODE_MODEL, label=label, status="run", request={"model": CODE_MODEL, "mode": "muse exec --json (headless)", "task": prompt[:1500]}, simulated=False)
    t = time.time()
    # Bounded: 30 steps at medium reasoning effort (the spending caps are checked before each turn, not inside one).
    cmd = [MUSE, "exec", "--json", "--disable-approval", "--max-model-steps", "30", "--reasoning-effort", "medium", "--prompt-file", str(task)]
    done = subprocess.run(cmd, cwd=RENDER, capture_output=True, text=True, timeout=1500, env={**os.environ})
    log.write_text(done.stdout)
    usage = {"input": 0, "output": 0, "cached": 0}
    last_text = ""
    for line in done.stdout.splitlines():
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        for u in _find(ev, "usage"):
            if isinstance(u, dict):
                usage["input"] += int(u.get("input_tokens") or u.get("prompt_tokens") or 0)
                usage["output"] += int(u.get("output_tokens") or u.get("completion_tokens") or 0)
                usage["cached"] += int((u.get("input_tokens_details") or {}).get("cached_tokens") or 0)
        for txt in _find(ev, "text"):
            if isinstance(txt, str) and txt.strip():
                last_text = txt
    cost = token_cost(SPARK, usage) if usage["input"] or usage["output"] else None
    ctx.meta.spent += cost or 0
    status = "done" if done.returncode == 0 else "error"
    body = {"id": cid, "model": CODE_MODEL, "label": label, "status": status, "ms": int((time.time() - t) * 1000), "simulated": False,
            "response": {"exit": done.returncode, "said": last_text[-1200:], "log": log.name}, "usage": usage if cost is not None else {"note": "no usage in the event stream"}, "cost": round(cost, 6) if cost is not None else 0}
    if status == "error":
        body["error"] = (done.stderr or last_text or "muse exec failed")[-500:]
    ctx.emit("call", step=ctx.step, **body)
    return {"ok": done.returncode == 0, "said": last_text, "stderr": done.stderr[-800:]}


def _find(obj, key):
    """Every value stored under `key`, at any depth (the event format of `muse exec --json` is not documented in detail)."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == key:
                yield v
            yield from _find(v, key)
    elif isinstance(obj, list):
        for v in obj:
            yield from _find(v, key)


WRITE_MOVE = """You write ONE new motion-design move for a Remotion renderer. Work only in this folder.

Read first: src/product/kit.tsx (the Spec a run hands over, the fonts, the palette and a small motion kit) and src/product/moves/Wall.tsx (a finished move: follow its structure, quality and timing).

Create the file src/product/moves/gen/{name}.tsx that exports exactly:
  export const Move: React.FC<MoveProps>
  export const seconds = (s: Spec) => number

The move, as the director described it: {idea}
The line(s) shown on screen while it plays, word by word at reading pace (use Words, lineWords and lineLen from the kit): {lines}
{subject}

Rules:
- 1920x1080, 30 fps. Everything is a pure function of t, in seconds (t = frame / fps), like Wall.
- Play s.video, muted, for about 1 s up to s.freezeAt (as Wall does), then hold s.still: the frozen picture. The motion then carries that picture into the ad: s.adFirst (the ad's first frame), then s.ad playing from (s.adFrom ?? 0), and it ends full screen on the ad, which plays for (s.adSeconds ?? 4) seconds.
- The bridge itself, before the ad plays, lasts 4 to 8 seconds.
- Media: only the files named in the spec, and click.ogg through the kit's Click. Nothing else: no other images, no fonts other than the kit's, no network.
- Imports: only react, remotion and ../../kit.
- Clean and satisfying: springs that overshoot (sp), eased curves (inOut, out3), one or two accent colours from ACCENTS on white or black. No flashes, no shaking, nothing violent.
- Text stays inside the frame and readable, whatever the length of the line (up to 8 words per line).
- Do not edit any other file.

When the file is written, run `npx tsc --noEmit -p .` and fix every error in your file until it passes. Then answer in one sentence: what the move does.
"""

FIX_MOVE = """The move in src/product/moves/gen/{name}.tsx was rendered and watched. These problems were seen:
{problems}
Fix them in that file only, keeping the idea of the move. Same rules as before: imports only from react, remotion and ../../kit; only the spec's files and click.ogg; text inside the frame.
Then run `npx tsc --noEmit -p .` and fix every error in that file until it passes. Answer in one sentence: what you changed.
"""


def invent(ctx) -> None:
    """Level 3: only when the writer found that no library move fits."""
    b = ctx.data["bridge"]
    if b["move"] != "new":
        ctx.step_skip(f"The library has a move for this video: {b['move']}")
        return
    fallback = library.moves_for(bool(ctx.data.get("cut")))[0]["id"]
    if not muse_ready():
        why = "Muse Code is not installed on this machine" if not Path(MUSE).exists() else "no Meta API key"
        b["move"] = fallback
        ctx.step_skip(f"{why}: the library move “{fallback}” is used instead")
        return
    name = "M" + time.strftime("%m%d%H%M") + uuid.uuid4().hex[:3]
    cut = ctx.data.get("cut")
    subject = (f"A subject ({ctx.data['moment'].get('subject')}) was cut out by SAM 3.1: s.cutout is that subject alone (PNG with alpha, 1920x1080, at its place in s.still), s.box its box, s.center its centre, s.face a point on its head. The move may use them."
               if cut else "There is no subject cut out: the move works on the whole picture (s.cutout is absent).")
    ctx.say("Nothing in the library fits this one, so Muse Code is writing a new move for it.")
    r = _muse_exec(ctx, WRITE_MOVE.format(name=name, idea=b.get("idea") or b["why"], lines=" / ".join(f"“{l}”" for l in b["lines"]), subject=subject), label="write a new move")
    file = GEN / f"{name}.tsx"
    errors = _typecheck(file) if file.exists() else "file not written"
    if not r["ok"] or errors:
        if file.exists():
            file.rename(ctx.folder / f"{name}.rejected.tsx")
        rebuild_index()
        b["move"] = fallback
        ctx.step_skip(f"Muse Code's move did not pass the checks ({(errors or r['stderr'] or 'failed')[:120]}): “{fallback}” is used instead")
        return
    rebuild_index()
    move_id = f"gen-{name.lower()}"
    library.add_generated({
        "id": move_id, "level": 3, "needs_subject": bool(cut), "rendered": True, "file": file.relative_to(ROOT).as_posix(),
        "what": (r["said"].strip() or b.get("idea") or "")[:300], "line_shape": "As written for the video it was made for.", "example": b["lines"], "made_for": ctx.id,
    })
    b["move"] = move_id
    ctx.data["invented"] = {"id": move_id, "file": file}
    ctx.emit("invented", move=move_id, file=file.relative_to(ROOT).as_posix(), said=r["said"][-300:])
    ctx.step_done(f"New move {move_id} written by Muse Code, type-checked, added to the library")


# ---------------------------------------------------------------- the loop: watch, find what is wrong, fix

REVIEW = {
    "type": "object",
    "properties": {
        "ok": {"type": "boolean", "description": "true when nothing here would embarrass the brand or the video's creator"},
        "problems": {"type": "array", "items": {"type": "object", "properties": {"at": {"type": "number", "description": "seconds into the bridge"}, "what": {"type": "string"}}, "required": ["at", "what"]}},
        "fix": {"type": "string", "enum": ["none", "rewrite_lines", "other_move", "fix_code"], "description": "fix_code: the motion itself is broken; rewrite_lines: the words are the problem; other_move: this move does not suit the picture"},
        "advice": {"type": "string", "description": "one sentence for whoever fixes it"},
    },
    "required": ["ok", "problems", "fix", "advice"],
}

CHECKS = """You are the last check before this bridge goes into a real video. It is a short motion-design transition: a video freezes, a line appears, and the picture is carried into an ad.
Watch it and list only real problems, with the second they happen:
- text cut off by the frame edge, overlapping other text, or hard to read on its background
- the cut-out subject broken: holes, a halo, missing limbs, a piece of background stuck to it
- blank, black or frozen frames where something should move; elements that jump instead of moving
- the ad not clearly visible, full screen, at the end
- a line that does not match what is on screen or what the ad sells
If nothing is wrong, ok is true, problems is empty and fix is "none". Do not invent problems to look useful.
The line: {lines}. The ad: {ad}."""


def review(ctx) -> None:
    out = ctx.folder / "bridge.mp4"
    if not out.exists():
        ctx.step_skip("Nothing rendered to watch")
        return
    from .steps import render_bridge, write  # late import: steps imports this module

    for round_ in (1, 2):
        verdict = _watch(ctx, out, round_)
        if verdict["ok"] or verdict["fix"] == "none":
            ctx.say("I watched the bridge: nothing to fix." if round_ == 1 else "Watched again after the fix: it holds.")
            ctx.step_done("Watched by Muse Spark: nothing to fix" if round_ == 1 else "Fixed, then watched again: clean")
            return
        if round_ == 2:
            ctx.step_done(f"Still one issue after the fix: {verdict['problems'][0]['what'][:100] if verdict['problems'] else verdict['advice'][:100]}")
            return
        problems = "\n".join(f"- at {p['at']:.1f}s: {p['what']}" for p in verdict["problems"]) or f"- {verdict['advice']}"
        ctx.say(f"I watched the bridge and something is off: {(verdict['problems'][0]['what'] if verdict['problems'] else verdict['advice']).rstrip('.')}. Fixing it.")
        shutil.copyfile(out, ctx.folder / "bridge_before_review.mp4")
        move = ctx.data["bridge"]["move"]
        if move.startswith("gen-") and muse_ready():
            name = Path(ctx.data.get("invented", {}).get("file") or next(GEN.glob(f"{move[4:]}*.tsx"), Path(""))).stem
            _muse_exec(ctx, FIX_MOVE.format(name=name, problems=problems + f"\nAdvice: {verdict['advice']}"), label="fix the move")
            rebuild_index()
        else:
            avoid = move if verdict["fix"] == "other_move" else None
            write(ctx, feedback=f"A first version was rendered and watched. Problems: {problems}\nAdvice: {verdict['advice']}" + (f"\nDo not use the move {avoid} again." if avoid else ""), avoid=avoid)
        render_bridge(ctx)
    return


def _watch(ctx, video: Path, round_: int) -> dict:
    d = media.probe(video)["duration"]
    frames = media.frames(video, media.spread(d, 8, 0.2), ctx.folder / f"review{round_}", width=448, prefix="r")  # eight stills with their times: enough to see text, cut-out and the ad
    a = ctx.data.get("adread") or {}
    parts = [{"text": CHECKS.format(lines=" / ".join(ctx.data["bridge"]["lines"]), ad=f"{a.get('brand', '')}, {a.get('product', '')}")}]
    parts += [p for s in frames for p in ({"text": f"at {s['t']:.1f}s"}, {"image": s["path"]})]
    v = ctx.meta.respond(SPARK, parts, REVIEW, label="watch the bridge" if round_ == 1 else "watch it again", simulate=lambda: {"ok": True, "problems": [], "fix": "none", "advice": "simulated: no real review without a key."})
    ctx.emit("review", round=round_, ok=v["ok"], problems=v["problems"], fix=v["fix"], advice=v["advice"], frames=[{"t": s["t"], "url": ctx.url(s["path"])} for s in frames])
    return v

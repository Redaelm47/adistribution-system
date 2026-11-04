"""The steps of one run. Each step reads what earlier steps left in `ctx.data` and adds its own result.

Cost is decided here: the video is never sent whole. The transcript is cheap (billed per second of audio),
so it is read first; only a dozen small frames go to Muse Spark to judge the picture, and SAM 3.1 sees one frame.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

from . import library, media
from .context import Context, StopRun

SPARK = "muse-spark-1.3"
ROOT = Path(__file__).resolve().parents[2]


def _clock(t: float) -> str:
    return f"{int(t // 60)}:{t % 60:04.1f}"


WATCH_UP_TO = 90  # seconds: shorter videos are also sent whole to Muse Spark, small and silent (the transcript carries the words)


# ---------------------------------------------------------------- 1. look at both files (local, no model)

def look(ctx: Context) -> None:
    v = media.probe(ctx.video)
    a = media.probe(ctx.ad)
    ctx.data.update(video=v, ad=a)
    shots = media.frames(ctx.video, media.spread(v["duration"], 12), ctx.folder / "frames", width=384)  # one image tile each: what a model needs to judge a moment
    ad_shots = media.frames(ctx.ad, [0.2] + media.spread(min(a["duration"], 20), 3, 1.0), ctx.folder / "ad", prefix="a", width=384)
    ctx.data.update(shots=shots, ad_shots=ad_shots)
    ctx.emit("media", video=v, ad=a, frames=[{"t": s["t"], "url": ctx.url(s["path"])} for s in shots])
    ctx.step_done(f"{_clock(v['duration'])} of video, {_clock(a['duration'])} of ad, 12 frames kept")


# ---------------------------------------------------------------- 2. transcribe (Muse Voice Transcribe)

def transcribe(ctx: Context) -> None:
    said = {}
    for key, path in (("video", ctx.video), ("ad", ctx.ad)):
        if not ctx.data[key]["has_audio"]:
            said[key] = []
            continue
        wav = media.audio(path, ctx.folder / f"{key}.wav")
        said[key] = ctx.meta.transcribe(wav, label=f"listen to the {key}", seconds=min(600, ctx.data[key]["duration"]))
    ctx.data["said"] = said
    n = sum(len(l["text"].split()) for l in said["video"])
    ctx.step_done(f"{n} words in the video, {sum(len(l['text'].split()) for l in said['ad'])} in the ad" if n else "No speech in the video: the picture decides alone")


# ---------------------------------------------------------------- 3. find the moment (Muse Spark)

MOMENT = {
    "type": "object",
    "properties": {
        "freeze_at": {"type": "number", "description": "seconds into the video"},
        "why": {"type": "string", "description": "one short sentence, plain English"},
        "subject": {"type": "string", "description": "one or two words naming the main subject to cut out, e.g. 'kitten' or 'man', or 'none' when there is none"},
        "found": {"type": "boolean", "description": "false when no moment is good enough for a bridge"},
    },
    "required": ["freeze_at", "why", "subject", "found"],
}


def find_moment(ctx: Context) -> None:
    said = "\n".join(f"[{l['start']:.1f}-{l['end']:.1f}s] {l['text']}" for l in ctx.data["said"]["video"]) or "(no speech)"
    prompt = (
        "You place one mid-roll ad inside this video. Pick the single best moment to freeze the picture and start a short bridge to the ad.\n"
        "A good moment: a break the video already makes (a finished sentence, a pause, a cut, the end of an action), with a readable, expressive frame "
        "(the subject visible and sharp, eyes open, no motion blur). Never in the middle of a sentence.\n"
        "If nothing is good enough, set found to false.\n\n"
        f"Video length: {ctx.data['video']['duration']:.1f}s. What is said, with times:\n{said}\n\n"
        "Frames, each labelled with its time:"
    )
    parts = [{"text": prompt}] + [p for s in ctx.data["shots"] for p in ({"text": f"frame at {s['t']:.1f}s"}, {"image": s["path"]})]
    if ctx.data["video"]["duration"] <= WATCH_UP_TO:
        small = media.clip(ctx.video, 0, ctx.data["video"]["duration"], ctx.folder / "watch.mp4", width=320, fps=2)
        parts += [{"text": "And the whole video, small and silent:"}, {"video": small, "fps": 1}]  # one frame a second: the frames above carry the detail
    if ctx.prompt:
        parts.append({"text": f"The advertiser asked: {ctx.prompt}"})
    m = ctx.meta.respond(SPARK, parts, MOMENT, label="find the moment", simulate=lambda: _sim_moment(ctx))
    m["freeze_at"] = max(0.0, min(float(m["freeze_at"]), ctx.data["video"]["duration"] - 0.05))
    if m["subject"].strip().lower() in ("", "none", "null", "nothing"):
        m["subject"] = None
    ctx.data["moment"] = m
    still = media.frame(ctx.video, m["freeze_at"], ctx.folder / "moment.jpg", width=768)
    ctx.data["still"] = still
    ctx.emit("moment", at=m["freeze_at"], why=m["why"], subject=m["subject"], found=m["found"], url=ctx.url(still))
    if not m["found"]:
        ctx.say("I watched the whole video and found no moment that would not cut someone off. No bridge here: the ad plays as usual.")
        ctx.step_done("No good moment: no bridge (level 4)")
        raise StopRun
    ctx.say(f"I watched the whole video. The best moment is {_clock(m['freeze_at'])}: {m['why'][0].lower() + m['why'][1:]}")
    ctx.step_done(f"Freeze at {_clock(m['freeze_at'])}")


def _pick(ctx: Context, n: int) -> int:
    """A stable choice per video, for the simulation (no model): the same video name always gets the same move."""
    import zlib

    name = json.loads((ctx.folder / "inputs.json").read_text())["names"]["video"]
    return zlib.crc32(name.encode()) % max(1, n)


def _sim_moment(ctx: Context) -> dict:
    d = ctx.data["video"]["duration"]
    return {"freeze_at": round(d * 0.55, 2), "why": "the subject looks straight at the camera, right after the action ends.", "subject": "subject", "found": True}


# ---------------------------------------------------------------- 4. read the ad (Muse Spark)

AD = {
    "type": "object",
    "properties": {
        "brand": {"type": "string"},
        "product": {"type": "string", "description": "what is sold, two to four words"},
        "promise": {"type": "string", "description": "what the ad says, one short sentence"},
        "hook": {"type": "string", "description": "one word or short phrase from the ad a bridge line can end on"},
    },
    "required": ["brand", "product", "promise", "hook"],
}


def read_ad(ctx: Context) -> None:
    said = " ".join(l["text"] for l in ctx.data["said"]["ad"]) or "(no speech)"
    parts = [{"text": f"This is an ad. What it says out loud: {said}\nIts frames, the first one is what the viewer sees first:"}]
    parts += [{"image": s["path"]} for s in ctx.data["ad_shots"]]
    a = ctx.meta.respond(SPARK, parts, AD, label="read the ad", simulate=lambda: {"brand": "the brand", "product": "the product", "promise": "what the ad promises.", "hook": "treats"})
    ctx.data["adread"] = a
    ctx.emit("ad", url=ctx.url(ctx.data["ad_shots"][0]["path"]), **a)
    ctx.step_done(f"{a['brand']}: {a['product']}")


# ---------------------------------------------------------------- 5. cut out the subject (SAM 3.1)

def cutout(ctx: Context) -> None:
    subject = ctx.data["moment"].get("subject")
    if not subject:
        ctx.data["cut"] = None
        ctx.step_skip("No subject on screen: a move that works on any picture")
        return
    full = media.frame(ctx.video, ctx.data["moment"]["freeze_at"], ctx.folder / "moment_full.jpg", width=min(1920, ctx.data["video"]["width"]))
    cut = ctx.meta.segment(full, subject, ctx.folder / "mask.png", label=f"cut out {subject}")
    ctx.data["cut"] = cut
    if cut is None:
        ctx.step_skip(f"SAM found no clean outline for {subject}: a move that works on any picture")
        return
    ctx.emit("cutout", url=ctx.url(cut["mask"]), box=cut["box"])
    ctx.step_done(f"{subject} cut out")


# ---------------------------------------------------------------- 6. write the way in (Muse Spark)

WRITE = {
    "type": "object",
    "properties": {
        "move": {"type": "string", "description": "a move id from the list, or \"new\" when none of them fits"},
        "lines": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 2},
        "why": {"type": "string", "description": "why this line and move fit this video and this ad, one sentence"},
        "idea": {"type": "string", "description": "only when move is \"new\": the new motion in one or two sentences, what moves from what to what; otherwise empty"},
    },
    "required": ["move", "lines", "why", "idea"],
}


def write(ctx: Context, feedback: str | None = None, avoid: str | None = None) -> None:
    has_subject = bool(ctx.data.get("cut"))
    moves = [mv for mv in library.moves_for(has_subject) if mv["id"] != avoid] or library.moves_for(has_subject)
    m, a = ctx.data["moment"], ctx.data["adread"]
    before = " ".join(l["text"] for l in ctx.data["said"]["video"] if l["end"] <= m["freeze_at"] + 0.3)[-400:]
    prompt = "\n".join([
        "You write the way in: what is said while a frozen video turns into an ad. It must make people stay for the ad.",
        f"Frozen moment at {m['freeze_at']:.1f}s: {m['why']}" + (f" Subject: {m['subject']}." if has_subject else " There is no subject to cut out."),
        f"Said just before: {before or '(nothing)'}",
        f"The ad: {a['brand']}, sells {a['product']}. It says: {a['promise']} Possible last word: {a['hook']}.",
        f"Tone asked: {ctx.tone or 'funny'}.",
        "",
        "Pick one move (its id) and write the line(s) for it:",
        *[f"- {mv['id']}: {mv['what']} Line shape: {mv['line_shape']} Example: {' / '.join(mv['example'])}" for mv in moves],
        "If none of these moves suits this picture and this ad (rare: prefer the library), answer move \"new\", write the line anyway, and describe the new motion in idea; a coding agent will write it.",
        "",
        "Rules:",
        *[f"- {r}" for r in library.RULES],
        "Lines a human found good (tone only, never copy them):",
        *[f"- \"{t}\" ({why})" for t, why in library.GOOD],
        "Lines a human found bad:",
        *[f"- \"{t}\" ({why})" for t, why in library.BAD],
    ])
    if ctx.prompt:
        prompt += f"\nThe advertiser asked: {ctx.prompt}"
    if feedback:
        prompt += f"\n\n{feedback}"
    parts = [{"text": prompt}, {"text": "The frozen frame:"}, {"image": ctx.data["still"]}]
    # simulation only: a different library move per video, with its example line; SIM_MOVE forces one (previews of the demo film)
    sim = next((mv for mv in moves if mv["id"] == os.environ.get("SIM_MOVE")), None) or moves[_pick(ctx, len(moves))]
    w = ctx.meta.respond(SPARK, parts, WRITE, label="write the way in" if not feedback else "rewrite after the review", simulate=lambda: {"move": sim["id"], "lines": sim["example"], "why": "simulated: the library example for this move.", "idea": ""})
    if w["move"] != "new" and w["move"] not in {mv["id"] for mv in moves}:
        w["move"] = moves[0]["id"]
    if feedback and w["move"] == "new":  # no second invention inside the loop
        w["move"] = moves[0]["id"]
    w["lines"] = [l.strip() for l in w["lines"] if l.strip()][:2]
    ctx.data["bridge"] = w
    ctx.emit("bridge", move=w["move"], lines=w["lines"], why=w["why"], level=3 if w["move"] == "new" else library.get(w["move"])["level"], idea=w.get("idea") or "")
    ctx.say("The way in: " + " ".join(f"“{l}”" for l in w["lines"]))
    ctx.step_done(f"{w['move']}: " + " / ".join(w["lines"]))


# ---------------------------------------------------------------- 7. animate (library move, rendered locally, no model call)

RENDER = ROOT / "render"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def animate(ctx: Context) -> None:
    busy = subprocess.run(["pgrep", "-f", "remotion render"], capture_output=True, text=True).stdout.strip()
    if busy:
        ctx.step_skip("Another render is running on this machine: the bridge spec is saved, render it later")
        return
    pub = ctx.folder / "public"
    pub.mkdir(exist_ok=True)
    full_still = ctx.folder / "moment_full.jpg"
    if not full_still.exists():
        media.frame(ctx.video, ctx.data["moment"]["freeze_at"], full_still, width=1920)
    cut = ctx.data.get("cut")
    framed = media.cover(full_still, pub, mask=cut["mask"] if cut else None)  # still.jpg (+ cutout.png) in the bridge's own frame
    media.cover(media.frame(ctx.ad, 0.05, ctx.folder / "ad_first_raw.jpg", width=1920), ctx.folder, name="ad_first.jpg")
    for src, name in ((ctx.video, "video.mp4"), (ctx.ad, "ad.mp4"), (ctx.folder / "ad_first.jpg", "ad_first.jpg"), (RENDER / "public/sfx/kenney-click_002.ogg", "click.ogg")):
        dest = pub / name
        dest.unlink(missing_ok=True)
        try:
            os.link(src, dest)  # no copy: the disk is tight
        except OSError:
            shutil.copyfile(src, dest)
    spec = {"move": ctx.data["bridge"]["move"], "video": "video.mp4", "still": "still.jpg", "ad": "ad.mp4", "adFirst": "ad_first.jpg", "freezeAt": ctx.data["moment"]["freeze_at"], "lines": ctx.data["bridge"]["lines"], "adSeconds": min(5.0, ctx.data["ad"]["duration"])}
    spec.update({k: v for k, v in framed.items() if k != "still"})
    ctx.data["spec"] = spec
    render_bridge(ctx)
    ctx.step_done(f"Move “{spec['move']}”" + (", written by Muse Code," if spec["move"].startswith("gen-") else " from the library,") + " rendered on this machine (no model call)")


def render_bridge(ctx: Context) -> Path:
    """Render (or render again, after a fix) the bridge from the run's spec. The spec follows the latest move and lines."""
    spec = ctx.data["spec"]
    spec.update(move=ctx.data["bridge"]["move"], lines=ctx.data["bridge"]["lines"])
    pub = ctx.folder / "public"
    (ctx.folder / "spec.json").write_text(json.dumps(spec, indent=2))
    out = ctx.folder / "bridge.mp4"
    cmd = ["npx", "remotion", "render", "src/product/index.ts", "Bridge", str(out), f"--props={ctx.folder / 'spec.json'}", f"--public-dir={pub}", "--log=error"]
    if Path(CHROME).exists():
        cmd.append(f"--browser-executable={CHROME}")
    done = subprocess.run(cmd, cwd=RENDER, capture_output=True, text=True, timeout=900)
    if done.returncode != 0 or not out.exists():
        raise RuntimeError(f"render failed: {(done.stderr or done.stdout).strip()[-300:]}")
    ctx.emit("result", url=ctx.url(out) + f"?v={int(out.stat().st_mtime)}", spec=spec)
    return out

"""Make a spot: one video moment + one ad, ready for every bridge template.

    python3 pipeline/tools/make_spot.py make --name dude-bottle --video raw/videos/x.mp4 --freeze 12.4 \
        --subject 980,520 --ad raw/ads/y.mp4
    python3 pipeline/tools/make_spot.py script --name dude-bottle --script scripts.json

`make` writes render/public/spots/<name>/: the clip around the moment, the frozen frame, the person
cut out (Apple Vision for now, SAM 3.1 in the product), a 0.75x slow-motion lead-in, source frames at
60 fps for time remapping, the ad's first and last frames and its sound, and spot.json (positions,
zoom, timings) that the templates read (tools/render.py --spot=<name>).

`script` takes the spot's own lines (gag and inner thought, written for this video and this ad, in
the product by Muse Spark), voices them with Chatterbox and stores them in spot.json:

    {"gag": {"lines": [["k1", "Text."], ...], "pills": [[["k1", 0.3]], ...], "you": false, "out": [["k5", 0.3]], "source": "..."},
     "thought": {"lines": [...], "bubbles": [[["k1", 0.2]], ...], "out": [...]}}

Video times: --freeze is in the source video's seconds; --subject is a point on the person in a
1920x1080 frame. All paths may be relative to render/public.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "render" / "public"
CUTOUT = ROOT / "pipeline" / "tools" / "cutout.swift"
VOICE = ROOT / "voice"

BEFORE, AFTER = 3.0, 3.0  # clip around the moment (s)
LEAD = 0.945  # source seconds played at 0.75x before the freeze (1.26 s on screen, as on the parkour clip)
FRAMES_BEFORE, FRAMES_SPAN = 2.433, 3.3  # source frames at 60 fps around the freeze


def sh(*cmd):
    subprocess.run([str(c) for c in cmd], check=True)


def ff(*args):
    sh("nice", "-n", "10", "ffmpeg", "-loglevel", "error", "-y", *args)


def probe(path, entry):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", entry, "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True)
    return out.stdout.strip().split("\n")[0]


def resolve(p):
    p = Path(p)
    return p if p.is_absolute() or p.exists() else PUBLIC / p


def rel(p):
    return str(Path(p).relative_to(PUBLIC))


FIT = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1"


def make(a):
    d = PUBLIC / "spots" / a.name
    d.mkdir(parents=True, exist_ok=True)
    video, ad = resolve(a.video), resolve(a.ad)
    before, after = a.before or BEFORE, a.after or AFTER
    start = max(0.0, a.freeze - before)
    # Optional crop (w:h:x:y in the source's 1920x1080 frame), e.g. to keep someone out of the picture.
    crop, k, (ox, oy) = "", 1.0, (0, 0)
    if a.crop:
        cw, ch, ox, oy = (int(v) for v in a.crop.split(":"))
        crop, k = f"scale=1920:1080,crop={cw}:{ch}:{ox}:{oy},", 1920 / cw
    freeze_at = a.freeze - start

    # The clip, 1920x1080 at 30 fps, and the frozen frame.
    ff("-ss", start, "-t", before + after, "-i", video, "-vf", f"{crop}{FIT},fps=30", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", *(["-c:a", "aac", "-b:a", "192k"] if a.talk else ["-an"]), d / "clip.mp4")
    end = float(probe(d / "clip.mp4", "format=duration"))
    ff("-ss", freeze_at, "-i", d / "clip.mp4", "-frames:v", "1", d / "freeze.png")

    # The person under the point.
    x, y = (float(v) for v in a.subject.split(","))
    x, y = (x - ox) * k, (y - oy) * k
    if a.cutout_box:  # look for the person only inside this box (Vision can prefer a bigger object)
        bw, bh, bx, by = (int(v) for v in a.cutout_box.split(":"))
        ff("-i", d / "freeze.png", "-vf", f"crop={bw}:{bh}:{bx}:{by}", d / "cut_in.png")
        sh("swift", CUTOUT, d / "cut_in.png", x - bx, y - by, d / "cut_rgba.png", d / "cut_mask.png")
        rgba, m = Image.new("RGBA", (1920, 1080)), Image.new("L", (1920, 1080))
        rgba.paste(Image.open(d / "cut_rgba.png"), (bx, by))
        m.paste(Image.open(d / "cut_mask.png").convert("L"), (bx, by))
        rgba.save(d / "person.png")
        m.save(d / "person_mask.png")
        for f in ("cut_in.png", "cut_rgba.png", "cut_mask.png"):
            (d / f).unlink()
    else:
        sh("swift", CUTOUT, d / "freeze.png", x, y, d / "person.png", d / "person_mask.png")
    mask = np.asarray(Image.open(d / "person_mask.png").convert("L")) > 127
    ys, xs = np.nonzero(mask)
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    band = mask[y0 : y0 + max(4, int(0.12 * (y1 - y0)))]
    hx = int(np.nonzero(band)[1].mean())
    head = {"x": hx, "y": int(y0 + 0.06 * (y1 - y0))}
    subject = {"x": int((x0 + x1) / 2), "y": int((y0 + y1) / 2)}

    # Camera: the person fills about 576 px of height, placed left of centre, never showing past the frame.
    zoom = a.zoom or float(np.clip(576 / max(1, y1 - y0), 1.15, 2.4))
    def fit(want, c, size):
        lo, hi = size - (size - c) * zoom, c * zoom  # anchor range that keeps the frame covered
        return int(np.clip(want, lo, hi))
    anchor = {"x": fit(720, subject["x"], 1920), "y": fit(560, subject["y"], 1080)}

    # The shot the moment is in: the lead-in and any rewind must not cross a cut.
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(d / "clip.mp4"), "-vf", "fps=30,scale=160:90,format=gray", "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    g = np.frombuffer(raw, np.uint8).reshape(-1, 90, 160).astype(np.float32)
    jumps = np.abs(np.diff(g, axis=0)).mean(axis=(1, 2))
    cuts = [(i + 1) / 30 for i, j in enumerate(jumps) if j > max(30.0, 4 * np.median(jumps)) and (i + 1) / 30 < freeze_at - 0.05]
    steady_from = round(max(cuts) + 0.05, 3) if cuts else 0.0

    # Slow-motion lead-in (0.75x, motion-interpolated to 50 fps) and 60 fps source frames.
    # A talking video keeps its speed and its sound: the lead-in is the clip itself, from its start.
    lead_in = 0.0 if a.talk else max(freeze_at - LEAD, steady_from)
    if not a.talk:
        ff("-ss", lead_in, "-t", freeze_at - lead_in + 0.05, "-i", d / "clip.mp4", "-vf", "setpts=PTS/0.75,minterpolate=fps=50:mi_mode=mci:mc_mode=aobmc:vsbmc=1",
           "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", d / "leadin.mp4")
    frames = d / "frames"
    frames.mkdir(exist_ok=True)
    for f in frames.glob("*.jpg"):
        f.unlink()
    f0 = max(0.0, freeze_at - FRAMES_BEFORE)
    ff("-ss", f0, "-t", FRAMES_SPAN, "-i", d / "clip.mp4", "-vf", "minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:vsbmc=1", "-q:v", "3", "-start_number", "0", frames / "f%03d.jpg")
    count = len(list(frames.glob("*.jpg")))

    # The ad: as is, its first and last frames, its sound, the colour of its first frame's background.
    ff("-i", ad, "-vf", f"{FIT},fps=25", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-an", d / "ad.mp4")
    ff("-i", ad, "-vn", "-ac", "2", "-ar", "48000", d / "ad.wav")
    duration = int(probe(d / "ad.mp4", "stream=nb_frames")) / 25
    ff("-i", d / "ad.mp4", "-frames:v", "1", d / "first.png")
    ff("-sseof", "-0.1", "-i", d / "ad.mp4", "-update", "1", "-frames:v", "1", d / "last.png")
    border = np.asarray(Image.open(d / "first.png").convert("RGB"))
    edge = np.concatenate([border[:20].reshape(-1, 3), border[-20:].reshape(-1, 3), border[:, :20].reshape(-1, 3), border[:, -20:].reshape(-1, 3)])
    paper = "#%02x%02x%02x" % tuple(int(v) for v in np.median(edge, axis=0))
    last_dark = bool(np.asarray(Image.open(d / "last.png").convert("L")).mean() < 110)

    spot = {
        "name": a.name,
        "video": {
            "clip": rel(d / "clip.mp4"), "leadInClip": rel(d / ("clip.mp4" if a.talk else "leadin.mp4")), "freeze": rel(d / "freeze.png"), "person": rel(d / "person.png"),
            "leadIn": round(lead_in, 4), "freezeAt": round(freeze_at, 4), "end": round(end, 3), "leadInRate": 1 if a.talk else 0.75, "steadyFrom": steady_from, "talk": bool(a.talk),
            "subject": subject, "anchor": anchor, "zoom": round(zoom, 3),
            "box": {"x0": x0, "y0": y0, "x1": x1, "y1": y1}, "head": head,
            "frames": {"dir": rel(frames), "freezeIndex": int(round((freeze_at - f0) * 60)), "count": count},
            "source": {"file": str(a.video), "start": round(start, 3)},
        },
        "ad": {
            "video": rel(d / "ad.mp4"), "audio": rel(d / "ad.wav"), "duration": duration, "brand": a.brand or Path(a.ad).stem, "site": "",
            "paper": paper, "letterInk": "#111111", "first": rel(d / "first.png"), "last": rel(d / "last.png"), "lastDark": last_dark, "you": None,
        },
        "scripts": {},
        "voices": {},
    }
    old = d / "spot.json"
    if old.exists():  # keep lines already written for this spot
        prev = json.loads(old.read_text())
        spot["scripts"], spot["voices"] = prev.get("scripts", {}), prev.get("voices", {})
    old.write_text(json.dumps(spot, indent=1))
    print(json.dumps({k: spot["video"][k] for k in ("subject", "anchor", "zoom", "box", "head")}), "ad", duration, "s, paper", paper)


def script(a):
    d = PUBLIC / "spots" / a.name
    spot = json.loads((d / "spot.json").read_text())
    scripts = json.loads(Path(a.script).read_text())
    for kind, sc in scripts.items():
        voice_dir = d / "voice" / kind
        lines = json.dumps(sc["lines"])
        settings = ["--exaggeration", "0.45", "--cfg", "0.5"] if kind == "thought" else ["--exaggeration", "0.75", "--cfg", "0.35"]
        sh("nice", "-n", "10", VOICE / ".venv-cb" / "bin" / "python", VOICE / "chatterbox_voice.py", "--lines", lines, "--out", voice_dir, *settings)
        spot["voices"][kind] = json.loads((voice_dir / "lines.json").read_text())
        spot["scripts"][kind] = {k: v for k, v in sc.items() if k != "lines"} | {"voice": kind}
    (d / "spot.json").write_text(json.dumps(spot, indent=1))
    print("scripts:", ", ".join(scripts))


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    m = sub.add_parser("make")
    m.add_argument("--name", required=True)
    m.add_argument("--video", required=True)
    m.add_argument("--freeze", type=float, required=True)
    m.add_argument("--subject", required=True)
    m.add_argument("--ad", required=True)
    m.add_argument("--brand")
    m.add_argument("--zoom", type=float)
    m.add_argument("--cutout-box", help="w:h:x:y in the output frame: run the cutout inside this box only")
    m.add_argument("--before", type=float, help="seconds of video kept before the freeze")
    m.add_argument("--after", type=float, help="seconds kept after it")
    m.add_argument("--talk", action="store_true", help="someone is talking: no slow motion, keep the sound")
    m.add_argument("--crop", help="w:h:x:y in the source frame (scaled to 1920x1080)")
    s = sub.add_parser("script")
    s.add_argument("--name", required=True)
    s.add_argument("--script", required=True)
    a = ap.parse_args()
    {"make": make, "script": script}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())

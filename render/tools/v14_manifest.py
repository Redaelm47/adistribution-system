"""Measures the V14 film's media (screen recordings, the product's own bridges, the ad) and writes src/film8/v14.json.

    python3 tools/v14_manifest.py

Run it again whenever a file in public-film/v14 changes: the film reads every length and every mark from that JSON.
"""

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
P = ROOT / "public-film/v14"


def length(f: Path) -> float:
    return round(float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)], capture_output=True, text=True).stdout.strip()), 3)


def has_audio(f: Path) -> bool:
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", str(f)], capture_output=True, text=True).stdout
    return bool(out.strip())


def rec(name: str) -> dict:
    f = P / f"{name}.mp4"
    m = P / f"{name}.marks.json"
    d = {"file": f"v14/{name}.mp4", "len": length(f)}
    if m.exists():
        j = json.loads(m.read_text())
        d.update(marks=j.get("marks", {}), rects=j.get("rects", {}), run=j.get("run"))
    return d


def clip(name: str, extra: dict | None = None) -> dict:
    f = P / f"{name}.mp4"
    side = P / f"{name}.json"  # the run's spec and result, when the clip is a product output
    d = {"file": f"v14/{name}.mp4", "len": length(f), "audio": has_audio(f)}
    if side.exists():
        d.update(json.loads(side.read_text()))
    return {**d, **(extra or {})}


manifest = {
    "home": rec("ui_home"),
    "run": rec("ui_run"),
    "code": rec("ui_code"),
    "main": clip("bridge_main"),
    "car": [clip(f"car{i}") for i in range(4) if (P / f"car{i}.mp4").exists()],
    "ad": clip("ad"),
}
(ROOT / "src/film8/v14.json").write_text(json.dumps(manifest, indent=1) + "\n")
print(json.dumps({k: (v["len"] if isinstance(v, dict) else [c["len"] for c in v]) for k, v in manifest.items()}))

"""Takes one finished product run into the V14 film, and its record into the repository.

    python3 tools/v14_take.py <run-id> <slot> [--title "Kitten asleep"]

slot: main (the bridge after "Now, let's watch that video again"), car0..car3 (the carousel), or ui_run / ui_code (recordings
made separately with record_ui.mjs; here only the record is kept). The bridge goes to public-film/v14/<slot>.mp4 with a <slot>.json
beside it (move, lines, cost); the run's trace, result and spec go to examples/<run-id>/ (no media), so judges can check
every call the film shows.
"""

import argparse
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
V14 = ROOT / "render/public-film/v14"

p = argparse.ArgumentParser()
p.add_argument("run")
p.add_argument("slot")
p.add_argument("--title", default="")
a = p.parse_args()
run = ROOT / "runs" / a.run
result = json.loads((run / "result.json").read_text())
if result.get("mode") == "live":  # only real runs go on record in the repository; simulations are previews
    ex = ROOT / "examples" / a.run
    ex.mkdir(parents=True, exist_ok=True)
    for f in ("trace.jsonl", "result.json", "spec.json", "inputs.json"):
        if (run / f).exists():
            shutil.copyfile(run / f, ex / f)
    print(f"record kept in {ex.relative_to(ROOT)}")
else:
    print("simulation: not copied to examples/")
if a.slot.startswith(("main", "car")):
    name = "bridge_main" if a.slot == "main" else a.slot  # the film reads the main bridge as bridge_main.mp4
    shutil.copyfile(run / "bridge.mp4", V14 / f"{name}.mp4")
    still = V14 / f"{a.slot}_still.jpg"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(run / "moment.jpg"), "-vf", "scale=480:-2", str(still)], check=True)
    b = result.get("bridge") or {}
    side = {"run": a.run, "move": b.get("move"), "lines": b.get("lines"), "title": a.title or json.loads((run / "inputs.json").read_text())["names"]["video"], "still": f"v14/{still.name}", "mode": result.get("mode"), "total": result.get("total")}
    (V14 / f"{name}.json").write_text(json.dumps(side, indent=1))
    print(json.dumps(side))
subprocess.run(["python3", str(ROOT / "render/tools/v14_manifest.py")], check=True)

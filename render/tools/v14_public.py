"""Rebuilds render/public-film8/: hard links to exactly the media the V14 film reads, so bundling copies ~200 MB instead of the
whole public-film folder (1.4 GB). Run it right before a film render: links made earlier can point to a file since replaced.

    python3 tools/v14_public.py
"""

import json
import os
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
src, dst = ROOT / "public-film", ROOT / "public-film8"
shutil.rmtree(dst, ignore_errors=True)  # only links live here: the media stay in public-film
need = set()
for k, x in json.loads((ROOT / "src/film8/voice.json").read_text()).items():
    if isinstance(x, dict) and x.get("file"):
        need.add(x["file"])
code = "".join(p.read_text() for p in (ROOT / "src/film8").glob("*.tsx"))
need |= set(re.findall(r"'((?:v14|voice)/[^'`$]+\.(?:mp3|wav|ogg|oga|png|jpg|mp4))'", code))
need |= {p.relative_to(src).as_posix() for p in (src / "sfx").glob("*.*")}  # every sound: the mixer reads them by table name
for p in (src / "v14").rglob("*"):
    rel = p.relative_to(src).as_posix()
    if p.is_file() and not rel.startswith(("v14/pexels/", "v14/inputs/")) and p.suffix in (".mp4", ".jpg", ".png", ".mp3", ".wav"):
        need.add(rel)
n = size = 0
missing = []
for rel in sorted(need):
    s = src / rel
    if not s.is_file():
        missing.append(rel)
        continue
    d = dst / rel
    d.parent.mkdir(parents=True, exist_ok=True)
    os.link(s, d)
    n += 1
    size += s.stat().st_size
print(f"{n} files linked, {size / 1e6:.0f} MB; missing: {missing}")

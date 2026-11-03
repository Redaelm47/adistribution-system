"""The web interface: drop a video and an ad, follow every Meta model call live, get the bridge.

    .venv/bin/python app/server.py          then open http://localhost:8000
"""

from __future__ import annotations

import asyncio
import json
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from fastapi import FastAPI, File, Form, HTTPException, UploadFile  # noqa: E402
from fastapi.responses import FileResponse, StreamingResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

from bridge.context import Context  # noqa: E402
from bridge.meta import Meta  # noqa: E402
from bridge.run import RUNS, execute  # noqa: E402

app = FastAPI(title="AdistributionSystem")
LIVE: dict[str, Context] = {}  # runs started by this server, with their events in memory


@app.get("/api/status")
def status():
    return {"mode": Meta().mode}


@app.post("/api/runs")
async def create(video: UploadFile = File(...), ad: UploadFile = File(...), prompt: str = Form(""), tone: str = Form("")):
    import time
    import uuid

    rid = time.strftime("%m%d-%H%M%S-") + uuid.uuid4().hex[:4]
    folder = RUNS / rid
    folder.mkdir(parents=True)
    paths = {}
    for key, up in (("video", video), ("ad", ad)):
        suffix = Path(up.filename or "x.mp4").suffix.lower() or ".mp4"
        dest = folder / f"{key}{suffix}"
        with open(dest, "wb") as f:
            while chunk := await up.read(1 << 20):
                f.write(chunk)
        paths[key] = dest
    names = {"video": video.filename, "ad": ad.filename}
    files = {k: p.name for k, p in paths.items()}
    (folder / "inputs.json").write_text(json.dumps({"names": names, "files": files, "prompt": prompt, "tone": tone}))
    ctx = Context(id=rid, folder=folder, video=paths["video"], ad=paths["ad"], prompt=prompt, tone=tone)
    LIVE[rid] = ctx
    threading.Thread(target=execute, args=(ctx,), daemon=True).start()
    return {"id": rid}


@app.get("/api/runs")
def runs():
    out = []
    for folder in sorted(RUNS.glob("*"), reverse=True)[:30]:
        res = folder / "result.json"
        if res.exists():
            r = json.loads(res.read_text())
            names = json.loads((folder / "inputs.json").read_text())["names"] if (folder / "inputs.json").exists() else {}
            out.append({"id": folder.name, "status": r["status"], "mode": r["mode"], "total": r["total"], "names": names, "lines": (r.get("bridge") or {}).get("lines")})
    return out


@app.get("/api/runs/{rid}/events")
async def events(rid: str):
    """Server-sent events: the whole trace from the start, then live until the run ends."""
    folder = RUNS / rid
    if not folder.exists():
        raise HTTPException(404)

    async def stream():
        sent = 0
        while True:
            ctx = LIVE.get(rid)
            if ctx is not None:
                evs = ctx.events
            else:  # a run from an earlier session: replay its trace
                trace = folder / "trace.jsonl"
                evs = [json.loads(l) for l in trace.read_text().splitlines()] if trace.exists() else []
            for ev in evs[sent:]:
                yield f"data: {json.dumps(ev, default=str)}\n\n"
            sent = len(evs)
            if evs and evs[-1]["type"] == "end":
                return
            if ctx is None:
                return
            await asyncio.sleep(0.15)

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@app.get("/api/runs/{rid}/inputs")
def inputs(rid: str):
    f = RUNS / rid / "inputs.json"
    if not f.exists():
        raise HTTPException(404)
    return json.loads(f.read_text())


@app.get("/api/runs/{rid}/files/{name:path}")
def files(rid: str, name: str):
    base = (RUNS / rid).resolve()
    path = (base / name).resolve()
    if base not in path.parents or not path.is_file():
        raise HTTPException(404)
    return FileResponse(path)


app.mount("/", StaticFiles(directory=Path(__file__).parent / "static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn

    RUNS.mkdir(exist_ok=True)
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")

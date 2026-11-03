"""What one run carries from step to step, and how it reports what happens.

Every event is appended to `trace.jsonl` in the run folder, so a run can be replayed and checked later:
the interface shows the same events live, and the README links recorded traces.
"""

from __future__ import annotations

import json
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


class StopRun(Exception):
    """A step decided there is nothing more to do (level 4: no bridge)."""


@dataclass
class Context:
    id: str
    folder: Path
    video: Path
    ad: Path
    prompt: str = ""
    tone: str = ""
    meta: Any = None
    data: dict = field(default_factory=dict)
    events: list = field(default_factory=list)
    step: str = ""
    t0: float = field(default_factory=time.time)
    lock: threading.Lock = field(default_factory=threading.Lock)

    def emit(self, kind: str, **body: Any) -> dict:
        with self.lock:
            ev = {"n": len(self.events), "type": kind, "t": round(time.time() - self.t0, 3), **body}
            self.events.append(ev)
            with open(self.folder / "trace.jsonl", "a") as f:
                f.write(json.dumps(ev, default=str) + "\n")
        return ev

    def url(self, path: Path) -> str:
        return f"/api/runs/{self.id}/files/{Path(path).relative_to(self.folder).as_posix()}"

    def say(self, text: str) -> None:
        self.emit("say", text=text)

    def step_start(self, step: str, title: str, model: str | None) -> None:
        self.step = step
        self.emit("step", step=step, title=title, model=model, status="run")

    def step_done(self, summary: str) -> None:
        self.emit("step", step=self.step, status="done", summary=summary)

    def step_skip(self, summary: str) -> None:
        self.emit("step", step=self.step, status="skip", summary=summary)

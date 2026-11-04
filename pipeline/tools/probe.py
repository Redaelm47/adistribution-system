"""First contact with the API, for well under a cent: one tiny Muse Spark call with a strict JSON answer.

    ../.venv/bin/python tools/probe.py

It checks the key, the endpoint, the request format and how usage comes back, before any real run spends anything.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bridge.meta import Meta  # noqa: E402

calls = []
m = Meta(on_call=lambda **c: calls.append(c))
if m.mode != "live":
    sys.exit("No META_API_KEY in .env: nothing sent.")
schema = {"type": "object", "properties": {"ok": {"type": "boolean"}, "word": {"type": "string"}}, "required": ["ok", "word"]}
try:
    out = m.respond("muse-spark-1.3", [{"text": "Answer ok=true and one English word for a cat."}], schema, label="probe", simulate=dict)
    print("answer:", out)
except Exception as e:
    print("FAILED:", e)
done = calls[-1]
print(json.dumps({k: done.get(k) for k in ("status", "ms", "usage", "cost", "error")}, indent=2))

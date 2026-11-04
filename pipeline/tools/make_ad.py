"""The film's ad: a fictional cat-treat brand, every picture made with Muse Image, so it is ours to show.

    ../.venv/bin/python tools/make_ad.py <out_folder> [--only 1,3] [--n 1]

Six pictures, 0.01 USD each at Meta's published price. Each call goes through the same spending caps and is written
to <out_folder>/trace.jsonl like a product run. Text is never asked of the model: the brand name and the slogans are laid over
the pictures in the film, so they are sharp and can be changed without paying again.
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bridge.meta import PRICES, Meta, check_budget  # noqa: E402

MODEL = "muse-image-1.0"
LOOK = "bright commercial advertising photography, hot pink and sunny yellow studio backdrop, glossy, sharp, high key light, 16:9 wide shot, no text, no letters, no logos"

SHOTS = {
    "pack": "a plump resealable pouch of crunchy cat treats with a big cartoon cat face printed on it, standing alone in the centre, " + LOOK,
    "shake": "a hand shaking a pouch of cat treats in mid air, motion blur on the pouch, a few treats flying out, " + LOOK,
    "stare": "a fluffy kitten sitting upright, eyes huge and fixed on something just off camera, ears forward, " + LOOK,
    "pounce": "a kitten leaping toward a pile of small brown fish-shaped cat treats, paws stretched out, frozen mid-jump, " + LOOK,
    "pile": "a heap of small brown fish-shaped crunchy cat treats spilling out of a tipped pouch, macro close-up, " + LOOK,
    "happy": "a kitten with closed eyes and a blissful face, chewing a treat, a few crumbs on the floor, " + LOOK,
}


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("out", type=Path)
    p.add_argument("--only", default="", help="comma-separated shot names to (re)make")
    args = p.parse_args()
    out = args.out
    out.mkdir(parents=True, exist_ok=True)
    trace = out / "trace.jsonl"
    meta = Meta(on_call=lambda **c: trace.open("a").write(json.dumps({"type": "call", "t": time.time(), **c}, default=str) + "\n"))
    if meta.mode != "live":
        sys.exit("No META_API_KEY: nothing is generated (this script never simulates pictures).")
    names = [n for n in SHOTS if not args.only or n in args.only.split(",")]
    for name in names:
        check_budget(meta.spent)

        def live(name=name):
            r = meta._post("/images/generations", json={"model": MODEL, "prompt": SHOTS[name], "n": 1, "size": "1792x1024", "response_format": "b64_json", "output_format": "png"}).json()
            item = r["data"][0]
            if item.get("b64_json"):
                (out / f"{name}.png").write_bytes(base64.b64decode(item["b64_json"]))
            else:
                import httpx

                (out / f"{name}.png").write_bytes(httpx.get(item["url"], timeout=120).content)
            return {"file": f"{name}.png", "revised_prompt": item.get("revised_prompt", "")}, {"images": 1, **(r.get("usage") or {})}, PRICES[MODEL]["image"]

        meta._call(MODEL, f"ad picture: {name}", {"model": MODEL, "prompt": SHOTS[name], "n": 1, "size": "1792x1024"}, live, lambda: ({}, {}, 0.0))
        print(f"{name}.png  (spent so far in this script: ${meta.spent:.2f})")


if __name__ == "__main__":
    main()

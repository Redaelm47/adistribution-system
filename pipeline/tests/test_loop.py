"""Level 3, the review loop, the spending caps and the bridge's frame, checked offline (no model, no render)."""

import json
from pathlib import Path

import cv2
import numpy as np
import pytest

from bridge import invent, library, media, meta, steps
from bridge.context import Context


@pytest.fixture
def ctx(tmp_path: Path) -> Context:
    c = Context(id="test", folder=tmp_path, video=tmp_path / "video.mp4", ad=tmp_path / "ad.mp4")
    c.meta = meta.Meta(key="")  # simulation
    c.data.update(bridge={"move": "wall", "lines": ["This might not be an ad.", "Oh wait. Actually, it is."], "why": "", "idea": ""}, adread={"brand": "B", "product": "treats"})
    (tmp_path / "bridge.mp4").write_bytes(b"not a real video")
    return c


def steps_of(c: Context) -> list[dict]:
    return [e for e in c.events if e["type"] == "step"]


def test_invent_falls_back_to_the_library_when_muse_code_is_missing(ctx, monkeypatch):
    monkeypatch.setattr(invent, "muse_ready", lambda: False)
    ctx.data["bridge"].update(move="new", idea="the frame folds like a letter into an envelope")
    ctx.step = "invent"
    invent.invent(ctx)
    assert ctx.data["bridge"]["move"] == "wall"  # first library move that needs no subject
    assert steps_of(ctx)[-1]["status"] == "skip"


def test_invent_does_nothing_when_a_library_move_fits(ctx):
    ctx.step = "invent"
    invent.invent(ctx)
    assert ctx.data["bridge"]["move"] == "wall"
    assert "library has a move" in steps_of(ctx)[-1]["summary"]


def test_review_sends_a_bad_line_back_to_the_writer_then_watches_again(ctx, monkeypatch):
    verdicts = iter([
        {"ok": False, "problems": [{"at": 1.2, "what": "the second line runs off the right edge"}], "fix": "rewrite_lines", "advice": "shorter second line"},
        {"ok": True, "problems": [], "fix": "none", "advice": ""},
    ])
    monkeypatch.setattr(invent, "_watch", lambda c, video, round_: next(verdicts))
    calls = []
    monkeypatch.setattr(steps, "write", lambda c, feedback=None, avoid=None: calls.append(("write", feedback, avoid)))
    monkeypatch.setattr(steps, "render_bridge", lambda c: calls.append(("render",)))
    ctx.step = "review"
    invent.review(ctx)
    assert calls[0][0] == "write" and "runs off the right edge" in calls[0][1] and calls[0][2] is None
    assert calls[1] == ("render",)
    assert steps_of(ctx)[-1]["summary"].startswith("Fixed, then watched again")
    assert (ctx.folder / "bridge_before_review.mp4").exists()


def test_review_asks_for_another_move_when_the_move_does_not_suit(ctx, monkeypatch):
    verdicts = iter([{"ok": False, "problems": [], "fix": "other_move", "advice": "the wall hides the subject"}, {"ok": True, "problems": [], "fix": "none", "advice": ""}])
    monkeypatch.setattr(invent, "_watch", lambda c, video, round_: next(verdicts))
    seen = {}
    monkeypatch.setattr(steps, "write", lambda c, feedback=None, avoid=None: seen.update(avoid=avoid))
    monkeypatch.setattr(steps, "render_bridge", lambda c: None)
    ctx.step = "review"
    invent.review(ctx)
    assert seen["avoid"] == "wall"


def test_review_sends_a_broken_generated_move_to_muse_code(ctx, monkeypatch):
    ctx.data["bridge"]["move"] = "gen-m11041200abc"
    ctx.data["invented"] = {"id": "gen-m11041200abc", "file": invent.GEN / "M11041200abc.tsx"}
    verdicts = iter([{"ok": False, "problems": [{"at": 3.0, "what": "black frames"}], "fix": "fix_code", "advice": "the ad never appears"}, {"ok": True, "problems": [], "fix": "none", "advice": ""}])
    monkeypatch.setattr(invent, "_watch", lambda c, video, round_: next(verdicts))
    monkeypatch.setattr(invent, "muse_ready", lambda: True)
    monkeypatch.setattr(invent, "rebuild_index", lambda: None)
    asked = []
    monkeypatch.setattr(invent, "_muse_exec", lambda c, prompt, label: asked.append((label, prompt)) or {"ok": True, "said": "", "stderr": ""})
    monkeypatch.setattr(steps, "write", lambda *a, **k: pytest.fail("a generated move is fixed by Muse Code, not rewritten"))
    monkeypatch.setattr(steps, "render_bridge", lambda c: None)
    ctx.step = "review"
    invent.review(ctx)
    assert asked and asked[0][0] == "fix the move"
    assert "M11041200abc.tsx" in asked[0][1] and "black frames" in asked[0][1]


def test_generated_moves_join_the_library(tmp_path, monkeypatch):
    monkeypatch.setattr(library, "GENERATED", tmp_path / "moves_gen.json")
    library.add_generated({"id": "gen-x", "level": 3, "needs_subject": False, "rendered": True, "what": "folds", "line_shape": "", "example": ["Hi."]})
    assert "gen-x" in [m["id"] for m in library.moves_for(has_subject=False)]
    assert library.get("gen-x")["level"] == 3


def test_total_spending_cap(monkeypatch):
    monkeypatch.setattr(meta, "spent_so_far", lambda: 99.0)
    with pytest.raises(meta.OverBudget):
        meta.check_budget(0.0)


def test_cover_frames_the_still_like_the_player_and_keeps_the_cutout_in_place(tmp_path):
    # a 4:3 frame (1280x960) with a white square subject; the bridge shows it object-fit: cover at 1920x1080
    img = np.zeros((960, 1280, 3), np.uint8)
    img[400:560, 560:720] = 255
    mask = np.zeros((960, 1280), np.uint8)
    mask[400:560, 560:720] = 255
    cv2.imwrite(str(tmp_path / "still_src.jpg"), img)
    cv2.imwrite(str(tmp_path / "mask.png"), mask)
    res = media.cover(tmp_path / "still_src.jpg", tmp_path, mask=tmp_path / "mask.png")
    still = cv2.imread(str(tmp_path / "still.jpg"))
    assert still.shape[:2] == (1080, 1920)
    cut = cv2.imread(str(tmp_path / "cutout.png"), cv2.IMREAD_UNCHANGED)
    assert cut.shape == (1080, 1920, 4)
    # scaled by 1.5 to 1920x1440, then 180 px cropped off the top and the bottom: the square lands at x 840-1080, y 420-660
    x0, y0, x1, y1 = res["box"]
    assert abs(x0 - 840) <= 3 and abs(x1 - 1080) <= 3 and abs(y0 - 420) <= 3 and abs(y1 - 660) <= 3
    assert cut[540, 960, 3] > 200 and cut[700, 300, 3] < 20  # opaque on the subject, clear elsewhere
    assert res["face"][1] < res["center"][1]

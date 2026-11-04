"""The live Meta calls, checked offline: requests are built as the docs say, and answers shaped like the docs' examples are read back."""

import json
from pathlib import Path

import cv2
import numpy as np
import pytest

from bridge import meta
from bridge.steps import MOMENT


class Reply:
    def __init__(self, body, status=200, headers=None):
        self._body, self.status_code, self.headers = body, status, headers or {}
        self.text = json.dumps(body)

    def json(self):
        return self._body


@pytest.fixture
def frame(tmp_path: Path) -> Path:
    path = tmp_path / "frame.jpg"
    cv2.imwrite(str(path), np.full((80, 100, 3), 128, np.uint8))
    return path


def test_strict_schema_requires_every_key_and_no_extra():
    s = meta._strict(MOMENT)
    assert s["additionalProperties"] is False
    assert set(s["required"]) == set(MOMENT["properties"])


def test_respond_builds_a_responses_call_and_reads_usage(monkeypatch, frame):
    sent = {}

    def post(url, headers, json, timeout, **_):
        sent.update(url=url, auth=headers["Authorization"], body=json)
        return Reply({
            "status": "completed",
            "output": [{"type": "message", "content": [{"type": "output_text", "text": '{"freeze_at": 3.2, "why": "x", "subject": "kitten", "found": true}'}]}],
            "usage": {"input_tokens": 1500, "input_tokens_details": {"cached_tokens": 500}, "output_tokens": 40, "output_tokens_details": {"reasoning_tokens": 10}},
        })

    monkeypatch.setattr(meta.httpx, "post", post)
    calls = []
    m = meta.Meta(on_call=lambda **c: calls.append(c), key="LLM_test")
    out = m.respond("muse-spark-1.3", [{"text": "pick"}, {"image": frame}], MOMENT, label="find", simulate=dict)
    assert out["subject"] == "kitten"
    assert sent["url"].endswith("/v1/responses") and sent["auth"] == "Bearer LLM_test"
    content = sent["body"]["input"][0]["content"]
    assert content[0] == {"type": "input_text", "text": "pick"}
    assert content[1]["type"] == "input_image" and content[1]["image_url"].startswith("data:image/jpeg;base64,")
    assert sent["body"]["text"]["format"]["strict"] is True
    done = calls[-1]
    assert done["status"] == "done" and done["usage"] == {"input": 1500, "output": 40, "cached": 500, "reasoning": 10}
    assert done["cost"] == pytest.approx((1000 * 1.25 + 500 * 0.15 + 40 * 4.25) / 1e6, abs=1e-6)


def test_transcribe_reads_turns(monkeypatch, tmp_path):
    wav = tmp_path / "a.wav"
    wav.write_bytes(b"RIFF")
    monkeypatch.setattr(meta.httpx, "post", lambda url, **kw: Reply({"transcript": "hi there. bye", "audioDurationMs": 4000, "turns": [{"turnId": 1, "startMs": 200, "endMs": 1500, "transcript": "hi there."}, {"turnId": 2, "startMs": 2000, "endMs": 3000, "transcript": "bye"}]}))
    lines = meta.Meta(key="k").transcribe(wav, label="listen", seconds=4)
    assert lines == [{"start": 0.2, "end": 1.5, "text": "hi there."}, {"start": 2.0, "end": 3.0, "text": "bye"}]


def test_sam_mask_is_placed_in_its_box(tmp_path, frame):
    from meta_sam_parser import _mask_codec

    w, h = 20, 40
    bits = [1 if 5 < x < 15 and 5 < y < 35 else 0 for y in range(h) for x in range(w)]
    payload = _mask_codec._encode_raster(bits, w, h)
    text = f"<0f>0<|box;x1=10;y1=20;x2=29;y2=59;w=100;h=80|><|mask;x=0;y=0;data={h},{w},{payload}|>"
    res = meta._decode_sam(text, frame, tmp_path / "mask.png")
    mask = cv2.imread(str(tmp_path / "mask.png"), cv2.IMREAD_GRAYSCALE)
    assert res["box"] == [10, 20, 30, 60]
    assert (mask > 0).sum() == sum(bits)
    assert mask[20 + 20, 10 + 10] == 255 and mask[0, 0] == 0


def test_sam_with_no_match_returns_none(frame, tmp_path):
    assert meta._decode_sam("", frame, tmp_path / "m.png") is None


def test_errors_are_not_retried_except_rate_limits(monkeypatch):
    seen = []

    def post(url, **kw):
        seen.append(1)
        return Reply({"error": {"message": "bad key", "type": "authentication_error"}}, status=401)

    monkeypatch.setattr(meta.httpx, "post", post)
    with pytest.raises(RuntimeError, match="401"):
        meta.Meta(key="k")._post("/responses", json={})
    assert len(seen) == 1


def test_spending_cap_stops_a_call_before_it_is_sent(monkeypatch, frame):
    monkeypatch.setattr(meta, "RUN_CAP", 0.5)
    monkeypatch.setattr(meta.httpx, "post", lambda *a, **k: pytest.fail("a call went out past the cap"))
    m = meta.Meta(key="k")
    m.spent = 0.5
    with pytest.raises(meta.OverBudget):
        m.respond("muse-spark-1.3", [{"text": "x"}], MOMENT, label="find", simulate=dict)

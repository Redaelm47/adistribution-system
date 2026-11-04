"""The bridge's voice: the line said by a system voice of the computer (macOS `say`), never an AI service.

Every model the product calls is a Meta model, and Meta's API has no speech synthesis, so the voice is the operating system's
own text-to-speech, run locally (the organizers allow a system voice that is not an AI call). Each move has its own character,
as in the demo film; a Premium or Enhanced voice is used when the computer has one (System Settings > Accessibility >
Spoken Content > System voice > Manage Voices). Without `say` (Linux, Windows), the bridge stays text only and says so.

    BRIDGE_VOICE=off        text only
    BRIDGE_VOICE=Ava        one voice for every move (any installed voice name)
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path

from .media import run

# One character per move (the film's casting idea: a different voice every time). Names are matched by their start,
# so "Shelley" finds "Shelley (English (US))" as well as "Shelley (Anglais (É.-U.))".
CAST = {"camera": "Samantha", "behind": "Whisper", "iris": "Daniel", "throw": "Moira", "thought": "Shelley", "wall": "Karen"}
KEEP = {"behind"}  # moves whose voice is the joke itself (a whisper): a premium voice does not replace it
PREMIUM = re.compile(r"\((Premium|Enhanced|Améliorée|Premium)\)", re.I)


def installed() -> list[tuple[str, str]]:
    """(name, locale) of every voice `say` knows, English ones first."""
    if not shutil.which("say"):
        return []
    out = subprocess.run(["say", "-v", "?"], capture_output=True, text=True).stdout
    voices = []
    for line in out.splitlines():
        m = re.match(r"^(.*?)\s+([a-z]{2}[_-][A-Z]{2,3})\s+#", line)
        if m:
            voices.append((m.group(1).strip(), m.group(2)))
    return [v for v in voices if v[1].startswith("en")] + [v for v in voices if not v[1].startswith("en")]


def _find(name: str, voices: list[tuple[str, str]]) -> str | None:
    us = [v for v, loc in voices if v.lower().startswith(name.lower()) and loc.replace("-", "_") == "en_US"]
    anyloc = [v for v, _ in voices if v.lower().startswith(name.lower())]
    return (us or anyloc or [None])[0]


def pick(move: str) -> str | None:
    """The voice for this move, or None for text only."""
    want = os.environ.get("BRIDGE_VOICE", "")
    if want.lower() == "off":
        return None
    voices = installed()
    if not voices:
        return None
    if want:
        return _find(want, voices)
    best = [v for v, loc in voices if PREMIUM.search(v) and loc.startswith("en")]
    if best and move not in KEEP:
        return best[0]
    return _find(CAST.get(move, "Samantha"), voices) or _find("Samantha", voices)


def speak(text: str, voice: str, out: Path, fit: float | None = None) -> float:
    """Says `text` into `out` (WAV, 48 kHz). With `fit` (seconds), the rate is raised until the line fits the time the move shows it."""
    tmp = out.with_suffix(".aiff")
    rate = 185
    for _ in range(3):
        subprocess.run(["say", "-v", voice, "-r", str(rate), "-o", str(tmp), text], check=True, capture_output=True)
        dur = float(run("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", tmp).strip() or 0)
        if not fit or dur <= fit * 1.15 or rate >= 260:
            break
        rate = min(260, int(rate * dur / (fit * 1.05)))
    run("ffmpeg", "-v", "error", "-y", "-i", tmp, "-ar", "48000", "-ac", "1", "-af", "loudnorm=I=-16:TP=-2", out)
    tmp.unlink(missing_ok=True)
    return dur


READ = 0.24  # seconds per word on screen, as in the renderer


def voice_lines(move: str, lines: list[str], folder: Path) -> list[dict]:
    """One WAV per line the move shows (the thought move shows all its lines as one), ready for the spec."""
    voice = pick(move)
    if not voice:
        return []
    said = [" ".join(lines)] if move == "thought" else lines
    out = []
    for i, text in enumerate(said):
        f = folder / f"line{i}.wav"
        dur = speak(text, voice, f, fit=len(text.split()) * READ + 0.6)
        out.append({"file": f.name, "voice": voice, "seconds": round(dur, 2)})
    return out

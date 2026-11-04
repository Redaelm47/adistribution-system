"""The bridge's voice. Three choices, given in the chat once the script is written:
    system  the Mac's own voice (macOS `say`), at its natural pace, never an AI service
    own     the advertiser's own recording of each line, uploaded in the chat (the product only cleans its level)
    none    text only

Every model the product calls is a Meta model, and Meta's API has no speech synthesis, so the voice is the operating system's
own text-to-speech, run locally (the organizers allow a system voice that is not an AI call). Only a Premium or Enhanced
English voice is used (System Settings > Accessibility > Spoken Content > System voice > Manage Voices > English, e.g.
"Ava (Premium)"): the basic voices sound robotic, so without a Premium one the bridge stays text only and says so.

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
    # Premium or nothing (Reda, Nov 4: the basic system voices "font peur"): without a Premium or Enhanced English voice, text only.
    best = [v for v, loc in voices if PREMIUM.search(v) and loc.startswith("en")]
    best.sort(key=lambda v: 0 if "premium" in v.lower() else 1)  # Premium before Enhanced
    return best[0] if best else None


def speak(text: str, voice: str, out: Path) -> float:
    """Says `text` into `out` (WAV, 48 kHz) at the voice's natural pace: the move waits for the line, the line is never sped up."""
    tmp = out.with_suffix(".aiff")
    subprocess.run(["say", "-v", voice, "-o", str(tmp), text], check=True, capture_output=True)
    level(tmp, out)
    tmp.unlink(missing_ok=True)
    return seconds(out)


def seconds(f: Path) -> float:
    return float(run("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f).strip() or 0)


def level(src: Path, out: Path) -> None:
    """Any audio file to a WAV the renderer plays: 48 kHz mono, silence trimmed at both ends, loudness at -16 LUFS."""
    trim = "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse"
    run("ffmpeg", "-v", "error", "-y", "-i", src, "-ar", "48000", "-ac", "1", "-af", f"{trim},loudnorm=I=-16:TP=-2", out)




def said(move: str, lines: list[str]) -> list[str]:
    """What is spoken, one entry per audio file: the thought move says all its lines as one."""
    return [" ".join(lines)] if move == "thought" else list(lines)


def voice_lines(move: str, lines: list[str], folder: Path, choice: str = "system", files: list[Path] | None = None) -> list[dict]:
    """One WAV per spoken entry, ready for the spec; [] = text only."""
    texts = said(move, lines)
    if choice == "none":
        return []
    if choice == "own":
        if not files or len(files) != len(texts):
            raise ValueError(f"{len(texts)} recording(s) needed, one per line, {len(files or [])} given")
        out = []
        for i, (text, src) in enumerate(zip(texts, files)):
            f = folder / f"line{i}.wav"
            level(src, f)
            out.append({"file": f.name, "voice": "your recording", "text": text, "seconds": round(seconds(f), 2)})
        return out
    voice = pick(move)
    if not voice:
        return []
    out = []
    for i, text in enumerate(texts):
        f = folder / f"line{i}.wav"
        out.append({"file": f.name, "voice": voice, "text": text, "seconds": round(speak(text, voice, f), 2)})
    return out

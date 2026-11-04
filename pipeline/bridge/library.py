"""The library of moves, and the lines that worked.

A move is the motion that carries the frozen picture into the ad. It never changes from one video to the next;
the line said over it is written for each video. Lines below were judged by a human on real drafts (Oct 31 to Nov 3):
they are the examples the writer learns the tone from, never text to copy.
"""

from __future__ import annotations

import json
from pathlib import Path

GENERATED = Path(__file__).with_name("moves_gen.json")  # moves Muse Code wrote (level 3), kept for the next videos

MOVES = [
    {
        "id": "wall",
        "level": 1,
        "needs_subject": False,
        "rendered": True,  # ported to render/src/product/Bridge.tsx
        "what": "The frame falls back onto a white gallery wall and swings on its nail; the ad is the next picture along the wall.",
        "line_shape": "Two beats. A teasing denial, then the admission. 4 to 8 words each.",
        "example": ["This might not be an ad.", "Oh wait. Actually, it is."],
    },
    {
        "id": "camera",
        "level": 1,
        "needs_subject": False,
        "rendered": True,
        "what": "A camera viewfinder frames the shot, the shutter fires, and the camera roll's next photo is the ad.",
        "line_shape": "A reaction to what is on screen, then an offer tied to the ad.",
        "example": ["Oh, he's so cute.", "Here's what you could give him."],
    },
    {
        "id": "throw",
        "level": 1,
        "needs_subject": False,
        "rendered": True,
        "what": "A mouse grabs the frozen picture and throws it off screen; the next card slides in: the ad, with its product circled.",
        "line_shape": "One unfinished sentence that the ad completes.",
        "example": ["He's looking for..."],
    },
    {
        "id": "iris",
        "level": 2,
        "needs_subject": True,
        "rendered": True,
        "what": "A coloured iris closes on the subject's face while the line lands, shuts, and opens on the ad in a burst.",
        "line_shape": "An apology, then a question that names the ad's product.",
        "example": ["Sorry...", "did someone say treats?"],
    },
    {
        "id": "behind",
        "level": 2,
        "needs_subject": True,
        "rendered": True,
        "what": "The cut-out subject steps out of its own picture; behind it, tiles flip into the ad; the camera goes past the subject into the ad.",
        "line_shape": "A whisper to the viewer, behind the subject's back.",
        "example": ["Psst.", "Behind you."],
    },
    {
        "id": "thought",
        "level": 2,
        "needs_subject": True,
        "rendered": True,
        "what": "A thought bubble rises from the subject and grows, blob by blob, until it swallows the screen and becomes the ad.",
        "line_shape": "The subject's own inner voice, first person, landing on the ad's product.",
        "example": ["What if I got a treat instead?"],
    },
]

# Lines a human judged good on earlier drafts, with what made them work.
GOOD = [
    ("Wait for it... wait for it... There it is!", "jokes about the ad break itself, works on any video"),
    ("Sorry... did someone say apps?", "an apology that names the ad's product"),
    ("And what if... he just built his own?", "starts from what the person does, lands on what the ad sells"),
    ("Or... you could just make your own.", "turns to the viewer"),
    ("Hi. You can't skip this one.", "dry, honest about being an ad"),
    ("Psst. Behind you.", "a voice plotting behind the subject's back"),
    ("Forget him. What about...", "dismisses the video for a second, playfully"),
]

# Lines a human judged bad, and why. The writer must not do this.
BAD = [
    ("It could.", "nobody understands what it refers to"),
    ("Sorry... is this a bad time?", "flat, no link to the ad"),
    ("A bird? A plane? No...", "relies on a reference the viewer must know"),
    ("Right after this.", "sounds like a template, not a person"),
    ("No ladder. No team. Just...", "slogan-like, not human"),
]

RULES = [
    "At most 8 words per line, at most two lines.",
    "Start from what is on screen at the frozen moment, end on what the ad sells.",
    "Sound like a person talking, dry and short. No slogans, no puns that need a reference, no hashtags.",
    "Never insult the video or its creator; tease gently.",
    "Never claim it is not an ad unless the next line admits it is.",
    "English only.",
    "Pick a move whose text never lands on the subject (its face or body): the line always sits beside it.",
]


def generated() -> list[dict]:
    return json.loads(GENERATED.read_text()) if GENERATED.exists() else []


def add_generated(move: dict) -> None:
    moves = [m for m in generated() if m["id"] != move["id"]] + [move]
    GENERATED.write_text(json.dumps(moves, indent=2) + "\n")


def all_moves() -> list[dict]:
    return MOVES + generated()


def moves_for(has_subject: bool) -> list[dict]:
    """Moves the video allows, among those the renderer knows: the library's, then the ones Muse Code wrote for earlier videos."""
    return [m for m in all_moves() if m.get("rendered") and (has_subject or not m["needs_subject"])]


def get(move_id: str) -> dict:
    return next((m for m in all_moves() if m["id"] == move_id), {"id": move_id, "level": 3})

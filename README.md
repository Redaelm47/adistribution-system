# AdistributionSystem

Mid-roll ads are mostly watched to the end. What they cost is goodwill: they cut a video at an arbitrary second, and people resent the interruption. AdistributionSystem watches the video, finds a moment where a break already feels natural, and writes a short motion-design bridge from what is on screen to what the ad says. The ad then arrives as part of the video instead of breaking it.

We showed the idea to 10 people: 9 found an ad that arrives this way more pleasant than a regular mid-roll, and said they would stay on it longer. A small informal check, not a study.

Choosing a better moment is not new on its own: platforms already avoid cutting people mid-sentence. The bridge is: the frozen picture itself carries the viewer into the ad, with a line written for that video and that ad. A brand with one ad gets a different way in for each of its ten thousand videos, and nobody has to check them one by one: the system watches its own work.

Built solo with Meta's models during the [Meta Global AI Developer Hackathon](https://cerebralvalley.ai/e/meta-ai-developer-hackathon) (Indie Developer track, Oct 27 to Nov 4, 2026). Everything in this repository was written during the hackathon; the commit history shows it step by step.

**Demo film:** link added on submission day (Nov 4).

## What one run does

You drop a video and an ad. Then, with every model call shown live in the interface:

| Step | Model | What it does |
|---|---|---|
| Listen | Muse Voice Transcribe | What is said, with times, in the video and the ad, so the bridge never cuts a sentence. |
| Find the moment | Muse Spark | Reads the transcript, twelve timed frames and, for videos up to 90 s, the whole video, and picks the second to freeze. Says so when no moment is good enough. |
| Read the ad | Muse Spark | Brand, product, promise, and a word a line can land on. |
| Cut out | SAM 3.1 | The subject of the frozen frame, as a mask, then its face, with a second prompt. The moves that hold on to a subject use the mask, and the ones that aim (the camera's focus, the iris, the thought bubble) aim at the face. |
| Write the way in | Muse Spark | Picks a move from the library and writes the line for this video and this ad, from examples a human judged good or bad. |
| Write a new move | Muse Code (headless) | Only when no move fits: writes a new Remotion move, which must type-check, and adds it to the library for the next videos. |
| Animate | none | Renders the move with Remotion on your machine, the line said by a Premium system voice of the Mac when there is one (macOS `say`, at its natural pace). No model call: Meta's API has no speech synthesis, and no other AI service is used. Then the chat asks who says the script (below). |
| Watch the result | Muse Spark | Watches eight timed stills of the rendered bridge, lists what is wrong (text off the frame, a broken cut-out, the ad not shown), sends the fix to whoever made the faulty part (the line to Muse Spark, a generated move to Muse Code), and watches again. Two rounds at most. |

Every model the product calls at runtime is a Meta model. Nothing else is called: no other AI service, no voice service.

**Who says the script:** once the bridge is there, the chat shows the script and asks who says it: the Mac's system voice (macOS `say`), the advertiser's own recording of each line (one audio file per line, uploaded in the chat), or nobody (text only). The bridge is rendered again with that voice, without any model call, and the move waits for each line to be said. The product never calls a voice service.

**Operating-system features, not model calls:** the system voice of the Mac (macOS `say`). In simulation mode (no API key), Apple Vision's built-in foreground cut-out stands in for SAM 3.1 so the moves can be previewed, and every simulated call is marked as such. Everything else in the table above is a Meta model call.

**Cost per video:** **$0.037 to $0.061, $0.042 on average**, measured on the 10 live runs in `examples/` that use a library move (10- to 14-second videos and a 10-second ad): 6 to 8 Meta calls, about 5,000 input tokens and 6,000 to 12,000 output tokens, most of them Muse Spark's reasoning. The bridge is made once per video and serves every view of it: on a video seen 10,000 times, that is less than half a thousandth of a cent per view, against the several dollars per thousand views an advertiser already pays for the mid-roll itself. Each run prints its exact bill (calls, tokens, dollars) in the interface and in `result.json`.

**When Muse Code writes a new move (level 3):** $0.216 on our live run, $0.177 of it Muse Code (30 steps at most, medium reasoning effort). It happens only when no move in the library fits, and the new move then serves every later video at the usual cost.

**Time per video:** two to four minutes in our live runs, on a laptop that was rendering the demo film at the same time. Most of it is Muse Spark thinking and the animation rendering on your machine; the interface shows each step live while it runs.

## How it decides

The line is written for every video. The motion comes from a library, and new code is written only when nothing fits:

1. **No subject on screen** (a landscape, a screen recording): a move that works on any picture.
2. **A subject** (a person, a cat): a move that holds on to it, using SAM 3.1's cut-out.
3. **Nothing fits**: Muse Code writes a new move; it is rendered, reviewed, and kept.
4. **No good moment**: no bridge at all, rather than a bad one.

The library today (`render/src/product/moves/`):

| Move | Level | What happens |
|---|---|---|
| `wall` | 1 | The frame falls back onto a white gallery wall and swings on its nail; the ad is the next picture along the wall. |
| `camera` | 1 | A digicam viewfinder hunts and locks on the subject, the shutter fires, and the camera roll's next photo is the ad. |
| `throw` | 1 | A mouse grabs the frozen picture and throws it away; the ad's card slides in. |
| `iris` | 2 | A colour iris closes on the subject's face while the line lands, shuts, and opens on the ad. |
| `behind` | 2 | The cut-out subject steps out of its own picture while tiles flip into the ad behind it. |
| `thought` | 2 | A thought bubble rises from the subject's head, fills word by word, and swallows the screen into the ad. |
| `gen-*` | 3 | Moves Muse Code wrote for earlier videos (`moves/gen/`, listed in `pipeline/bridge/moves_gen.json`). |

## Run it

Needs Python 3.11+, Node 18+ and ffmpeg on your PATH. The bridge is rendered with Remotion, which uses Google Chrome when it is installed and otherwise downloads its own headless browser on the first render.

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
(cd render && npm install)      # the renderer
cp .env.example .env            # then put your Meta Model API key in it
.venv/bin/python app/server.py  # open http://localhost:8000
```

Drop a video, then an ad, and press the arrow. The left column is the conversation: each step, the Meta model it calls, and what came back. The calls drawer lists every call with what was sent, the answer, the time and the cost. The run ends on the rendered bridge, ready to export, and on its bill.

- **Level 3 (optional):** install Muse Code (`curl -fsSL https://dev.meta.ai/install.sh | sh`). It uses the same `META_API_KEY`. Without it, the run falls back to a library move and says so.
- **Voice (optional, one minute):** the first render speaks the line with a Premium system voice of your Mac. Install one in System Settings > Accessibility > Spoken Content > System voice > Manage Voices > English, for example "Ava (Premium)" or "Zoe (Premium)". Without one, or off a Mac, it is text only (`BRIDGE_VOICE=off` forces it). Either way, the chat then lets you give your own recording of each line instead.
- **Spending caps:** the code refuses any call past `META_RUN_CAP` (USD per run, default 1.00) or `META_SPEND_CAP` (USD over every run on the machine, default 15.00). Both are in `.env.example`.
- **Without a key** the same steps run in simulation, on your files, and every call is labelled `simulated`.
- **Command line:** `cd pipeline && ../.venv/bin/python -m bridge.run video.mp4 ad.mp4 --prompt "make a new transition"`.
- **Tests** (offline, they can never reach Meta): `cd pipeline && ../.venv/bin/python -m pytest -q`.

## Every run is on record

Each run is saved in `runs/<id>/`: `trace.jsonl` (every event and every model call, with request, response, tokens, cost and time), `result.json`, and the bridge's `spec.json`. The runs shown in the demo film are copied, without their media, to `examples/<id>/`, so each call the film shows can be checked. The film shows the interface replaying those runs with long waits shortened, and says so on screen.

## Repository layout

```
app/                  the web interface (FastAPI and plain JS): drop a video and an ad, follow every call live
pipeline/bridge/      one run: the steps, the Meta client (prices, caps, trace), level 3 and the review loop
pipeline/tools/       probe.py (first API check), make_ad.py (optional: pictures for a sample ad with Muse Image)
render/src/product/   the bridge renderer: kit.tsx, one file per move in moves/, Muse Code's moves in moves/gen/
render/tools/         record_ui.mjs (films the interface for the demo), the film's media manifest
examples/             the records of the runs shown in the demo film
docs/                 notes from the hackathon: tests on real videos, verdicts on each draft, references
```

`pipeline/motion_ads/` and `render/src/templates/` are the first week's experiments (planar ad placement, hand-made bridge templates). The product above replaced them; they stay in the history. In the first days their draft voices were made with open-source speech models, for our own previews. When the organizers ruled on Nov 3 that every AI model called at runtime must be a Meta model, those voices and the scripts that made them were taken out of the repository. The product never called them.

## Rights and third-party media

This repository holds our own code and media, media we generated with AI models, and third-party media whose licence allows this use, each listed here with its source.

The only sound the product adds to a bridge is a click from Kenney's UI Audio pack (CC0). The repository also holds frames of the Pexels test clips used by the first week's templates (Pexels License, listed in `clips/SOURCES.md`). The demo film uses cat photos from Wikimedia Commons (public domain, CC0 and CC BY), cat videos from Pexels (Pexels License), sounds from Freesound (CC0 and CC BY) and AI voices (the narration, and the recording given to the product for the main transition's lines); their authors, licences and sources are in [docs/film-credits.md](docs/film-credits.md). The ad in the film, for Shakerz, a fictional brand, was made by us with AI and is labelled as AI-generated on screen.

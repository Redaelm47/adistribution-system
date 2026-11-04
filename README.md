# AdistributionSystem

Mid-roll ads are mostly watched to the end. What they cost is goodwill: they cut a video at an arbitrary second, and people resent the interruption. AdistributionSystem watches the video, finds a moment where a break already feels natural, and writes a short motion-design bridge from what is on screen to what the ad says. The ad then arrives as part of the video instead of breaking it.

Choosing a better moment is not new on its own: platforms already avoid cutting people mid-sentence. The bridge is: the frozen picture itself carries the viewer into the ad, with a line written for that video and that ad.

Built solo with Meta's models during the [Meta Global AI Developer Hackathon](https://cerebralvalley.ai/e/meta-ai-developer-hackathon) (Indie Developer track, Oct 27 to Nov 4, 2026). Everything in this repository was written during the hackathon.

## How it decides

The line is written for every video. The motion comes from a library of moves, and new code is written only when nothing fits:

1. **No subject on screen** (a landscape, a screen recording): a move that works on any picture, such as the frame stepping back onto a wall ("This might not be an ad.").
2. **A subject** (a person, a cat): a move that holds on to it, such as the subject stepping out of its own picture ("Psst. Behind you.").
3. **Nothing fits**: a coding agent writes a new move, it is rendered and reviewed, and it joins the library for the next videos.
4. **No good moment**: no bridge at all, rather than a bad one.

## Meta models, step by step

| Step | Model | Status |
|---|---|---|
| Transcribe the video and the ad | Muse Voice Transcribe | built, tested offline |
| Pick the moment (transcript, frames, and the whole video when short), read the ad | Muse Spark | built, tested offline |
| Cut out the subject | SAM 3.1 | built, tested offline |
| Write the line and pick the move | Muse Spark | built, tested offline |
| Animate the move | none: a library move rendered with Remotion | `wall` ported, others next |
| Write a new move when none fits | Muse Code, headless | planned |
| Watch the render, find what is wrong, fix it | Muse Spark | planned |

Every model the product calls at runtime is a Meta model.

## Run it

Needs Python 3.11+, Node 18+ and ffmpeg on your PATH. The bridge is rendered with Remotion, which uses Google Chrome when it is installed and otherwise downloads its own headless browser on the first render.

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
(cd render && npm install)      # the renderer
cp .env.example .env            # then put your Meta Model API key in it
.venv/bin/python app/server.py  # open http://localhost:8000
```

Drop a video and an ad, press the arrow. The right column lists every Meta model call as it happens: what was sent, what came back, how long it took and what it cost. Each run is saved in `runs/<id>/trace.jsonl` and can be reopened from the home page. Without a key, the same steps run in simulation and every call is labelled `simulated`.

From the command line: `cd pipeline && ../.venv/bin/python -m bridge.run video.mp4 ad.mp4`. Tests: `cd pipeline && ../.venv/bin/python -m pytest -q`.

## Repository layout

```
app/        the web interface: drop a video and an ad, follow every model call live
pipeline/   the steps that call Meta's models (Python)
render/     motion-design rendering (Remotion)
docs/       notes
```

## Status

Work in progress: see the commit history.

# AdistributionSystem

The mid-roll ad cuts a video at a random second, and that is when people leave. AdistributionSystem watches the video, finds a moment where a break already feels natural, and writes a short motion-design bridge from what is on screen to what the ad says. The ad then arrives as part of the video instead of breaking it.

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
| Transcribe the video | Muse Voice Transcribe | in progress |
| Pick the moment, read the ad | Muse Spark | in progress |
| Cut out the subject | SAM 3.1 | in progress |
| Write the line and the bridge | Muse Spark | in progress |
| Write a new move when none fits | Muse Code, headless | planned |
| Watch the render, find what is wrong, fix it | Muse Spark | planned |

Every model the product calls at runtime is a Meta model.

## Repository layout

```
app/        the web interface: drop a video and an ad, follow every model call live
pipeline/   the steps that call Meta's models (Python)
render/     motion-design rendering (Remotion)
docs/       notes
```

## Status

Work in progress: see the commit history.

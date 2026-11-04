You write ONE new motion-design move for a Remotion renderer. Work only in this folder.

Read first: src/product/kit.tsx (the Spec a run hands over, the fonts, the palette and a small motion kit) and src/product/moves/Wall.tsx (a finished move: follow its structure, quality and timing).

Create the file src/product/moves/gen/M11042017b1f.tsx that exports exactly:
  export const Move: React.FC<MoveProps>
  export const seconds = (s: Spec) => number

The move, as the director described it: The frozen frame crunches like a dry treat with cracks spreading out as the kitten keeps staring, then crumbs fall away to reveal the ad underneath.
The line(s) shown on screen while it plays, word by word at reading pace (use Words, lineWords and lineLen from the kit): “He stopped sniffing to stare at you.” / “He wants something crunchy.”
A subject (kitten) was cut out by SAM 3.1: s.cutout is that subject alone (PNG with alpha, 1920x1080, at its place in s.still), s.box its box, s.center its centre, s.face a point on its head. The move may use them.

Rules:
- 1920x1080, 30 fps. Everything is a pure function of t, in seconds (t = frame / fps), like Wall.
- Play s.video, muted, for about 1 s up to s.freezeAt (as Wall does), then hold s.still: the frozen picture. The motion then carries that picture into the ad: s.adFirst (the ad's first frame), then s.ad playing from (s.adFrom ?? 0), and it ends full screen on the ad, which plays for (s.adSeconds ?? 4) seconds.
- The bridge itself, before the ad plays, lasts 4 to 8 seconds.
- Media: only the files named in the spec, and click.ogg through the kit's Click. Nothing else: no other images, no fonts other than the kit's, no network.
- Imports: only react, remotion and ../../kit.
- Clean and satisfying: springs that overshoot (sp), eased curves (inOut, out3), one or two accent colours from ACCENTS on white or black. No flashes, no shaking, nothing violent.
- Text stays inside the frame and readable, whatever the length of the line (up to 8 words per line).
- Do not edit any other file.

When the file is written, run `npx tsc --noEmit -p .` and fix every error in your file until it passes. Then answer in one sentence: what the move does.

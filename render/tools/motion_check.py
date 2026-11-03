#!/usr/bin/env python3
"""Does the film ever stand still? Measures the share of pixels that change, 10 times a second.

    python3 tools/motion_check.py name=video.mp4 [name=video.mp4 ...]

Reda on the first versions: "tellement lent". His references: Allo 0% of still time and never more than 0.1 s, Shipper 9% and 1.7 s.
Target for ours: under 8% and never more than 0.6 s. Prints where the still stretches are.
"""
import subprocess, sys
import numpy as np

W, H = 160, 90
for arg in sys.argv[1:]:
    name, path = arg.split("=", 1)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps=10,scale={W}:{H},format=gray", "-f", "rawvideo", "-"], capture_output=True).stdout
    a = np.frombuffer(raw, dtype=np.uint8).reshape(-1, H, W).astype(float)
    c = (np.abs(np.diff(a, axis=0)) > 6).mean(axis=(1, 2)) * 100
    still = c < 0.3
    runs, start = [], None
    for i, s in enumerate(list(still) + [False]):
        if s and start is None:
            start = i
        if not s and start is not None:
            if i - start >= 4:
                runs.append((start / 10, (i - start) / 10))
            start = None
    longest = max([r[1] for r in runs], default=0)
    ok = still.mean() < 0.08 and longest <= 0.6
    print(f"{name}: {len(a)/10:.1f} s, still {still.mean()*100:.0f}%, longest {longest:.1f} s, {'OK' if ok else 'TOO STILL'}")
    if runs:
        print("   still at:", ", ".join(f"{t:.1f}s ({d:.1f})" for t, d in runs))

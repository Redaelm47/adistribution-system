"""The freeze frame without the person, so the cut-out can move in front of the background (parallax).

    clean_plate.py <freeze.png> <person_mask.png> <plate.jpg>

A stand-in: the background sits blurred and dimmed behind him, and he hides almost all of the patch.
"""
import sys
import cv2
import numpy as np

freeze, mask_path, out = sys.argv[1:4]
img = cv2.imread(freeze)
mask = cv2.imread(mask_path, cv2.IMREAD_UNCHANGED)
mask = mask[..., 3] if mask.ndim == 3 and mask.shape[2] == 4 else (mask if mask.ndim == 2 else mask[..., 0])
mask = cv2.resize(mask, (img.shape[1], img.shape[0]))
hole = cv2.dilate((mask > 16).astype(np.uint8) * 255, np.ones((31, 31), np.uint8))
small = cv2.inpaint(cv2.resize(img, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA), cv2.resize(hole, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_NEAREST), 9, cv2.INPAINT_TELEA)
patch = cv2.resize(small, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_LINEAR)
a = cv2.GaussianBlur(hole, (21, 21), 0)[..., None] / 255.0
cv2.imwrite(out, (img * (1 - a) + patch * a).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 94])
print("hole px:", int((hole > 0).sum()))

# Optional: a cleaner cut-out next to the plate. One pixel off the edge, and the brick stuck to his hair
# (Apple Vision keeps a bit of the wall behind him; SAM 3.1 replaces all this in the product).
if len(sys.argv) > 5:
    person = cv2.imread(sys.argv[4], cv2.IMREAD_UNCHANGED)
    alpha = cv2.erode(person[..., 3], np.ones((3, 3), np.uint8))
    if "--brick" in sys.argv:  # the parkour clip only
        x0, y0, x1, y1 = 1010, 380, 1095, 425
        b, r = person[y0:y1, x0:x1, 0].astype(int), person[y0:y1, x0:x1, 2].astype(int)
        alpha[y0:y1, x0:x1][r - b > 12] = 0
    person[..., 3] = cv2.GaussianBlur(alpha, (3, 3), 0)
    cv2.imwrite(sys.argv[5], person)

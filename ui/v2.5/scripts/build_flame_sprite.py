"""Turns the flame sprite sheet into a transparent, evenly-celled strip.

Run from ui/v2.5:
    python3 scripts/build_flame_sprite.py <source.png> [dest.png]

The source sheet is not kept in the repo - only the strip this produces,
src/components/Scenes/flames.png. Re-run this if the artwork is ever replaced.

The source is a row of hand-drawn flames on a flat dark ground. Three things
have to happen before CSS can step through it as a sprite:

  * the ground has to become alpha, or the card shows through it as dark
    rectangles. Alpha is taken from each pixel's distance to the ground
    colour, which keeps the soft outer glow that a colour key would clip away.
  * the frames have to be cut apart at the gutters between them. They are not
    evenly spaced, and their glows touch, so the cut is made at the darkest
    column near each nominal boundary rather than by slicing into tenths.
  * they have to be re-laid into cells of equal width, each flame centred on
    its own base and standing on the cell floor. Stepping through the drawn
    frames as they come makes the flame jitter and hop.
"""
import sys

import numpy as np
from PIL import Image

FRAMES = 10
# The source carries faint smoke wisps as well as flame. Anything within
# SMOKE of the ground colour is dropped outright - kept, it composites onto a
# bright preview as grey smudges - and the glow ramps from there up to OPAQUE.
SMOKE = 22.0
OPAQUE = 52.0
PAD_X, PAD_Y = 8, 4
CELL_H = 256  # the sheet is redrawn to this cell height; a flame is at most
              # about 160px tall on a card, so the source's 491 is dead weight
COLOURS = 96  # flat cel-shaded fills quantise to a small palette very well


def to_rgba(im):
    """Ground colour out, alpha in.

    The glow is drawn *blended into* the ground, so simply keeping the pixel
    and adding alpha leaves the ground's colour smeared through it - which
    shows up as a dark ring once the flame is composited onto anything
    lighter. Undoing the blend recovers what the glow's own colour was:
    p = c*a + ground*(1-a), so c = (p - ground*(1-a)) / a.
    """
    rgb = np.asarray(im.convert("RGB")).astype(np.float64)
    ground = rgb[2, 2].copy()
    dist = np.abs(rgb - ground).max(axis=2)
    alpha = np.clip((dist - SMOKE) / (OPAQUE - SMOKE), 0, 1)
    a = alpha[:, :, None]
    with np.errstate(divide="ignore", invalid="ignore"):
        colour = np.where(a > 0.05, (rgb - ground * (1 - a)) / a, 0)
    colour = np.clip(np.nan_to_num(colour), 0, 255)
    alpha = np.where(alpha > 0.05, alpha, 0)
    return np.dstack([colour, alpha * 255]).round().astype(np.uint8), dist


def cut_points(dist):
    """The darkest column near each nominal frame boundary."""
    prof = dist.sum(axis=0)
    step = len(prof) / FRAMES
    edges = [0]
    for k in range(1, FRAMES):
        c = int(k * step)
        lo, hi = max(0, c - 70), min(len(prof), c + 70)
        edges.append(lo + int(np.argmin(prof[lo:hi])))
    edges.append(len(prof))
    return edges


def base_centre(alpha):
    """Horizontal centre of the flame's foot, not of its bounding box.

    Centring on the bounding box lets a frame whose licks lean left sit its
    base to the right, which reads as the flame skating sideways.
    """
    h = alpha.shape[0]
    foot = alpha[int(h * 0.86):].sum(axis=0)
    if foot.sum() == 0:
        return alpha.shape[1] / 2
    return float((foot * np.arange(len(foot))).sum() / foot.sum())


def main(src, dst="src/components/Scenes/flames.png"):
    rgba, dist = to_rgba(Image.open(src))
    edges = cut_points(dist)

    frames = []
    for i in range(FRAMES):
        cell = rgba[:, edges[i]:edges[i + 1]]
        a = cell[:, :, 3]
        ys, xs = np.nonzero(a > 6)
        box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
        crop = cell[box[1]:box[3], box[0]:box[2]]
        frames.append((crop, base_centre(crop[:, :, 3])))

    cell_w = max(f.shape[1] for f, _ in frames) + PAD_X
    cell_h = max(f.shape[0] for f, _ in frames) + PAD_Y
    sheet = Image.new("RGBA", (cell_w * FRAMES, cell_h), (0, 0, 0, 0))
    for i, (crop, cx) in enumerate(frames):
        img = Image.fromarray(crop, "RGBA")
        x = i * cell_w + int(round(cell_w / 2 - cx))
        x = max(i * cell_w, min(x, (i + 1) * cell_w - img.size[0]))
        sheet.alpha_composite(img, (x, cell_h - img.size[1]))
    scale = CELL_H / cell_h
    sheet = sheet.resize(
        (int(round(cell_w * scale)) * FRAMES, CELL_H), Image.LANCZOS
    )
    # quantise with alpha kept: the art is flat fills plus a soft glow, so a
    # small palette costs nothing visible and most of the file size
    sheet = sheet.quantize(colors=COLOURS, method=Image.FASTOCTREE)
    sheet.save(dst, optimize=True)
    print("%d frames, cell %dx%d, sheet %dx%d -> %s"
          % (FRAMES, sheet.size[0] // FRAMES, sheet.size[1],
             sheet.size[0], sheet.size[1], dst))


if __name__ == "__main__":
    main(*sys.argv[1:3])

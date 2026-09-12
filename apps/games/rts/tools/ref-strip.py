#!/usr/bin/env python3
"""Magnify an RA2 reference into a readable frame strip.

The wiki rips are the sprite's own size — a GI is 13x29 pixels. Dropped into a
comparison sheet they are a smudge, and a smudge is what art gets judged
against. This crops each frame to its own content, scales it with NEAREST so
every pixel stays a pixel, and lays the frames out in a row.

    python3 tools/ref-strip.py rifle                 # -> art/out/ref-zoom-rifle.png
    python3 tools/ref-strip.py rifle --frames 12 --mag 10
    python3 tools/ref-strip.py --all                 # every file the compare table names

An animated GIF contributes evenly-spaced frames across the whole animation
(a walk cycle's eight facings are not the first eight frames); a still image
contributes itself.
"""
import argparse
import json
import os
import re
import subprocess
import sys

from PIL import Image, ImageSequence

RTS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(RTS, "docs", "ra2-ref", "sprites")
OUT = os.path.join(RTS, "art", "out")


def refs_from_compare():
    """{key: file} out of the REFS table in tools/ra2-compare.js."""
    src = open(os.path.join(RTS, "tools", "ra2-compare.js")).read()
    body = src[src.index("const REFS = {"):]
    body = body[:body.index("\n};")]
    out = {}
    for m in re.finditer(r"^\s*(\w+):\s*\{([^}]*)\}", body, re.M):
        f = re.search(r"file:\s*'([^']+)'", m.group(2))
        if f:
            out[m.group(1)] = f.group(1)
    return out


def frames_of(path, want):
    im = Image.open(path)
    frames = [f.convert("RGBA") for f in ImageSequence.Iterator(im)]
    if len(frames) <= want:
        return frames
    step = len(frames) / float(want)          # spread across the whole animation
    return [frames[int(i * step)] for i in range(want)]


def strip(key, file, want, mag, bg=(20, 28, 38, 255)):
    path = os.path.join(REF, file)
    if not os.path.exists(path):
        return f"{key}: missing {file}"
    tiles = []
    for f in frames_of(path, want):
        bb = f.getbbox()
        tiles.append(f.crop(bb) if bb else f)
    tiles = [t for t in tiles if t.width and t.height]
    if not tiles:
        return f"{key}: {file} has no opaque pixels"
    # One magnification for the whole strip, so the frames stay comparable.
    m = mag or max(2, min(12, 320 // max(t.height for t in tiles)))
    gap = 6
    w = sum(t.width for t in tiles) * m + gap * (len(tiles) + 1)
    h = max(t.height for t in tiles) * m + gap * 2
    out = Image.new("RGBA", (w, h), bg)
    x = gap
    for t in tiles:
        big = t.resize((t.width * m, t.height * m), Image.NEAREST)
        out.paste(big, (x, gap + (h - gap * 2 - big.height) // 2), big)
        x += big.width + gap
    os.makedirs(OUT, exist_ok=True)
    dst = os.path.join(OUT, f"ref-zoom-{key}.png")
    out.save(dst)
    sizes = ", ".join(f"{t.width}x{t.height}" for t in tiles[:4])
    return f"{key}: {os.path.relpath(dst, RTS)}  x{m}  frames {len(tiles)}  sprite {sizes}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("keys", nargs="*")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--frames", type=int, default=8)
    ap.add_argument("--mag", type=int, default=0, help="0 = pick one that fills ~320px")
    a = ap.parse_args()
    table = refs_from_compare()
    keys = sorted(table) if a.all else a.keys
    if not keys:
        ap.error("name a unit key, or pass --all")
    for k in keys:
        if k not in table:
            print(f"{k}: not in the ra2-compare REFS table", file=sys.stderr)
            continue
        print(strip(k, table[k], a.frames, a.mag))


if __name__ == "__main__":
    main()

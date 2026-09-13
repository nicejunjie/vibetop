#!/usr/bin/env python3
"""The RA2 rip's own vertical budget for a unit: where its parts start and stop.

`ra2-size.js` says whether a sprite is the right size. This says how that height
is SPENT — how many rows go to the head, the body and the legs — which is what
the GI pass showed actually matters: ours ran a 43% torso where RA2 spends 24%,
and no amount of colour work fixes a figure built on the wrong skeleton.

    python3 tools/ra2-rows.py rifle
    python3 tools/ra2-rows.py --all

Bands are found from the rip itself, not assumed:
  * head    the leading rows, ending where the silhouette first widens sharply
            (a helmet is narrow, shoulders are not)
  * torso   from the shoulders down to the waist — the narrowest row below the
            widest one
  * legs    everything under the waist
Also prints the widest row and the median brightness, since RA2's figures are
dark drawings with bright accents and ours are not.
"""
import argparse
import os
import re
import sys

from PIL import Image, ImageSequence

RTS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(RTS, "docs", "ra2-ref", "sprites")


def refs():
    src = open(os.path.join(RTS, "tools", "ra2-compare.js")).read()
    body = src[src.index("const REFS = {"):].split("\n};")[0]
    out = {}
    for m in re.finditer(r"^\s*(\w+):\s*\{([^}]*)\}", body, re.M):
        f = re.search(r"file:\s*'([^']+)'", m.group(2))
        if f:
            out[m.group(1)] = f.group(1)
    return out


def bands(path):
    im = Image.open(path)
    f = [x.convert("RGBA") for x in ImageSequence.Iterator(im)][0]
    bb = f.getbbox()
    if not bb:
        return None
    f = f.crop(bb)
    w, h = f.size
    px = f.load()
    rows = []          # (width, mean value) per row
    for y in range(h):
        xs = [x for x in range(w) if px[x, y][3] >= 24]
        if not xs:
            rows.append((0, 0.0))
            continue
        vals = [max(px[x, y][:3]) / 255 for x in xs]
        rows.append((xs[-1] - xs[0] + 1, sum(vals) / len(vals)))
    # The rips carry a GROUND SHADOW and it is part of the frame, so the naive
    # bbox is not the figure: the GI's rip is 13x29 and the man is 13x23, the
    # last six rows being a flat navy ellipse. A RELATIVE darkness test does not
    # find it (these sprites are dark all over — the GI's median value is 0.22),
    # so test for what the shadow actually IS: a trailing run of rows made
    # almost entirely of one flat dark colour, with no lit pixel in them.
    def shadow_row(y):
        xs = [x for x in range(w) if px[x, y][3] >= 24]
        if not xs:
            return False
        dark = sum(1 for x in xs if max(px[x, y][:3]) <= 64)
        return dark / len(xs) >= 0.85
    end = len(rows) - 1
    while end > 0 and shadow_row(end):
        end -= 1
    rows = rows[:end + 1]
    h = len(rows)
    widths = [r[0] for r in rows]
    widest = max(widths)
    wi = widths.index(widest)
    # head: the leading run before the silhouette reaches 70% of its widest
    head = 0
    while head < len(widths) and widths[head] < widest * 0.70:
        head += 1
    # waist: the narrowest row between the widest row and two thirds down
    lo, hi = wi + 1, max(wi + 2, int(h * 0.62))
    seg = widths[lo:hi] or widths[wi:wi + 1]
    waist = lo + seg.index(min(seg)) if seg else wi
    allv = sorted(v for r in rows for v in ([r[1]] if r[0] else []))
    dark = sum(1 for y in range(h) for x in range(w)
               if px[x, y][3] >= 24 and max(px[x, y][:3]) / 255 < 0.22)
    opaque = sum(1 for y in range(h) for x in range(w) if px[x, y][3] >= 24)
    return {
        "w": w, "h": h, "head": head, "torso": waist - head, "legs": h - waist,
        "widest": widest, "widestRow": wi,
        "med": allv[len(allv) // 2] if allv else 0,
        "dark": dark / opaque if opaque else 0,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("keys", nargs="*")
    ap.add_argument("--all", action="store_true")
    a = ap.parse_args()
    table = refs()
    keys = sorted(table) if a.all else a.keys
    if not keys:
        ap.error("name a unit key, or pass --all")
    print(f"{'unit':<14}{'size':>8}{'head':>7}{'torso':>7}{'legs':>7}   split (h/t/l)   widest  dark  med")
    for k in keys:
        if k not in table:
            print(f"{k}: not registered", file=sys.stderr)
            continue
        p = os.path.join(REF, table[k])
        if not os.path.exists(p):
            print(f"{k:<14} missing {table[k]}")
            continue
        b = bands(p)
        if not b:
            print(f"{k:<14} empty")
            continue
        t = b["h"]
        print(f"{k:<14}{b['w']}x{b['h']:<5}{b['head']:>7}{b['torso']:>7}{b['legs']:>7}"
              f"   {b['head']/t*100:4.0f}% {b['torso']/t*100:4.0f}% {b['legs']/t*100:4.0f}%"
              f"   {b['widest']:>5} @{b['widestRow']:<3}{b['dark']*100:5.0f}%{b['med']:6.2f}")


if __name__ == "__main__":
    main()

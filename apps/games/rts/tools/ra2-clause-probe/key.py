#!/usr/bin/env python3
"""Chroma-key an RA2 rip and dump it in the same {w,h,mask,rgba} shape the
structure bakes use, so tools/clause-checks/structures.js can be run over it.

Three keys: `blue` (SHP rips, b - max(r,g) >= M), `green` (grass, g - max(r,b) >= M)
and `olive` (yellow-green grass, min(r,g) - b >= M, border-connected -- the only
one that cuts nuclear-reactor / allied-ore-refinery / soviet-sentry-gun at all).
Frame 0 of an animated GIF, composited (PIL hands back deltas)."""
import sys, json, base64
from PIL import Image

def load_frame0(p):
    im = Image.open(p)
    im.seek(0)
    return im.convert('RGBA')

def key_blue(im, margin):
    px = im.load(); w, h = im.size
    mask = bytearray(w*h); rgba = bytearray(w*h*4)
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            bg = (a <= 8) or (b - max(r, g) >= margin)
            i = y*w+x
            if not bg:
                mask[i] = 1
                rgba[i*4:i*4+4] = bytes((r, g, b, 255))
    return w, h, mask, rgba

def key_olive(im, margin):
    """OLIVE-grass-backed rips, and the ONLY key that works on three of them.

    `soviet-service-depot.gif`'s grass keys green; `nuclear-reactor.gif`,
    `allied-ore-refinery.gif` and `soviet-sentry-gun.gif` do NOT. Their grass is
    a yellow-green around (152,156,64), so `g - max(r,b)` is **4** and no margin
    the green key accepts separates anything -- the reactor plate comes back
    173x136, the whole file, at every margin from 4 to 56. That is why the
    earlier [GAREFN] sweep in structure-clause-triage.md could only report
    "passes at 2 of 15 cuts -- inconclusive": it was measuring the file.

    The separating quantity is `min(r,g) - b`: 48-88 on every grass colour in
    those three plates, 12-20 on the buildings' brick, navy and concrete. And
    the background is taken BORDER-CONNECTED rather than by colour alone, so
    pale roof and concrete pixels that happen to land in the grass band survive
    inside the silhouette.

    Validated the way this directory's rule 1 demands -- the crop must stop
    moving, and must agree with the size the reference document records:

        nuclear-reactor.gif      tol 20..36  ->  170..172 x 129   (doc: 166x129)
        allied-ore-refinery.gif  tol 16..48  ->  165..175 x 133/134
        soviet-sentry-gun.gif    tol 16..48  ->  41..42 x 33      (doc cites 41x40)
    """
    px = im.load(); w, h = im.size
    cand = bytearray(w*h)
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a <= 8 or (min(r, g) - b) >= margin:
                cand[y*w+x] = 1
    bg = bytearray(w*h); st = []
    def seed(i):
        if cand[i] and not bg[i]:
            bg[i] = 1; st.append(i)
    for x in range(w):
        seed(x); seed((h-1)*w + x)
    for y in range(h):
        seed(y*w); seed(y*w + w-1)
    while st:
        i = st.pop(); cx = i % w; cy = i // w
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                nx, ny = cx+dx, cy+dy
                if nx < 0 or ny < 0 or nx >= w or ny >= h: continue
                seed(ny*w+nx)
    mask = bytearray(w*h); rgba = bytearray(w*h*4)
    for i in range(w*h):
        if not bg[i]:
            mask[i] = 1
            r, g, b, a = px[i % w, i // w]
            rgba[i*4:i*4+4] = bytes((r, g, b, 255))
    return w, h, mask, rgba

def key_green(im, margin):
    """grass-backed rips: dominant green"""
    px = im.load(); w, h = im.size
    mask = bytearray(w*h); rgba = bytearray(w*h*4)
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            bg = (a <= 8) or (g - max(r, b) >= margin)
            i = y*w+x
            if not bg:
                mask[i] = 1
                rgba[i*4:i*4+4] = bytes((r, g, b, 255))
    return w, h, mask, rgba

def largest_component(w, h, mask):
    seen = bytearray(w*h); best = None
    for s in range(w*h):
        if not mask[s] or seen[s]: continue
        st = [s]; seen[s] = 1; cells = []
        while st:
            i = st.pop(); cells.append(i)
            cx = i % w; cy = i // w
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    nx, ny = cx+dx, cy+dy
                    if nx < 0 or ny < 0 or nx >= w or ny >= h: continue
                    j = ny*w+nx
                    if mask[j] and not seen[j]: seen[j] = 1; st.append(j)
        if best is None or len(cells) > len(best): best = cells
    return best

def crop(w, h, mask, rgba, cells=None):
    if cells is not None:
        m2 = bytearray(w*h)
        for i in cells: m2[i] = 1
        mask = m2
    xs = [i % w for i in range(w*h) if mask[i]]
    ys = [i // w for i in range(w*h) if mask[i]]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    bw, bh = x1-x0+1, y1-y0+1
    m = bytearray(bw*bh); rg = bytearray(bw*bh*4)
    for y in range(bh):
        for x in range(bw):
            si = (y+y0)*w + (x+x0); di = y*bw+x
            m[di] = mask[si]
            if mask[si]: rg[di*4:di*4+4] = rgba[si*4:si*4+4]
    return bw, bh, m, rg

if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]
    mode = sys.argv[3] if len(sys.argv) > 3 else 'blue'
    margin = int(sys.argv[4]) if len(sys.argv) > 4 else 40
    biggest = '--largest' in sys.argv
    im = load_frame0(src)
    w, h, mask, rgba = {'blue': key_blue, 'green': key_green, 'olive': key_olive}[mode](im, margin)
    cells = largest_component(w, h, mask) if biggest else None
    bw, bh, m, rg = crop(w, h, mask, rgba, cells)
    json.dump({'w': bw, 'h': bh,
               'mask': base64.b64encode(bytes(m)).decode(),
               'rgba': base64.b64encode(bytes(rg)).decode()}, open(out, 'w'))
    print(f'{src} mode={mode} margin={margin} largest={biggest} -> {bw}x{bh}', file=sys.stderr)

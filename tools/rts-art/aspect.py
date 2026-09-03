#!/usr/bin/env python3
"""Opaque-bbox aspect of each baked structure vs its docs/ra2-ref/ sprite.

Run `node tools/rts-art/cmp.js` first (it dumps mine_<fac>_<key>.png into
RTS_OUT).  Usage:  python3 tools/rts-art/aspect.py <dir-with-mine_*.png>
The reference column is the RA2 asset the structure was rebuilt against; a
match inside +-8% is the bar set in docs/ra2-art-plan.md.
"""
import sys, os, glob
from PIL import Image
try:
    import numpy as np
except ImportError:
    np = None

REF = {
    ('dir','base'):      'allied-construction-yard-idle.png',
    ('col','base'):      'soviet-construction-yard-idle.png',
    ('dir','power'):     'allied-power-plant-idle.png',
    ('col','power'):     'soviet-tesla-reactor-anim-last.png',
    ('dir','refinery'):  'allied-ore-refinery-anim-last.png',
    ('col','refinery'):  'soviet-ore-refinery-anim-last.png',
    ('dir','barracks'):  'allied-barracks-idle.png',
    ('col','barracks'):  'soviet-barracks-anim-last.png',
    ('dir','factory'):   'allied-war-factory-idle.png',
    ('col','factory'):   'soviet-war-factory-anim-last.png',
    ('dir','airforce'):  'allied-airforce-command-anim-last.png',
    ('col','radar'):     'soviet-radar-tower-idle.png',
    ('dir','depot'):     'allied-service-depot-idle.png',
    ('col','depot'):     'soviet-service-depot-idle.png',
    ('dir','lab'):       'allied-battle-lab-idle.png',
    ('col','lab'):       'soviet-battle-lab-idle.png',
    ('dir','purifier'):  'allied-ore-purifier-anim-last.png',
    ('col','reactor'):   'soviet-nuclear-reactor-idle.png',
    ('dir','chrono'):    'allied-chronosphere-idle.png',
    ('dir','weather'):   'allied-weather-control-idle.png',
    ('col','curtain'):   'soviet-iron-curtain-idle.png',
    ('col','nuke'):      'soviet-nuclear-silo-idle.png',
    ('dir','spysat'):    'allied-spy-satellite-idle.png',
    ('col','psisensor'): 'soviet-psychic-sensor-idle.png',
    ('col','cloningvats'): 'soviet-cloning-vats-idle.png',
    ('dir','gapgen'):    'allied-gap-generator.png',
    ('dir','grandcannon'): 'allied-grand-cannon.png',
}

def aspect(path):
    """Aspect of the SPRITE's opaque bbox.

    Two things in docs/ra2-ref/ are opaque but are NOT the sprite, and both
    silently measured the whole canvas instead of the building:

      * the two Construction Yard grabs are in-game gif frames on a solid
        BLUE background (and the `-idle-last` frames this used to point at
        are the last frame of the idle loop -- a puff of smoke for the
        Allied yard and an entirely empty field for the Soviet one);
      * every clean SHP rip carries the palette's SHADOW INDEX as an opaque
        magenta blob (153,0,153) sprawling off the sprite's lower right,
        which inflated every reference's WIDTH and so made our own art read
        as far too tall. It cost `dir:lab` a phantom -40%.

    Mask both, plus transparency, and measure what is left.
    """
    im = Image.open(path).convert('RGBA')
    if np is None:
        bb = im.getchannel('A').getbbox() or im.getbbox()
    else:
        a = np.asarray(im)
        r, g, b, al = (a[..., 0].astype(int), a[..., 1].astype(int),
                       a[..., 2].astype(int), a[..., 3])
        bg = (al < 8)
        bg |= (b > 140) & (r < 80) & (g < 80)                  # gif blue key
        bg |= (abs(r - b) <= 12) & (g <= 40) & (r >= 110)      # shadow index
        ys, xs = np.where(~bg)
        if not len(xs):
            return None
        bb = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    if not bb:
        return None
    return (bb[2] - bb[0]) / float(bb[3] - bb[1])

def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), 'out')
    refdir = os.path.join(os.path.dirname(__file__), '..', '..', 'docs', 'ra2-ref')
    rows = []
    for (fk, key), ref in sorted(REF.items()):
        mine = os.path.join(outdir, 'mine_%s_%s.png' % (fk, key))
        if not os.path.exists(mine):
            continue
        a = aspect(mine)
        rp = os.path.join(refdir, ref)
        r = aspect(rp) if os.path.exists(rp) else None
        d = ('%+.1f%%' % ((a / r - 1) * 100)) if r else '   -  '
        rows.append((fk + ':' + key, a, r, d, ref if r else ref + ' (missing)'))
    print('%-18s %7s %7s %8s  %s' % ('structure', 'mine', 'ref', 'delta', 'reference'))
    for n, a, r, d, ref in rows:
        print('%-18s %7.3f %7s %8s  %s' % (n, a, ('%.3f' % r) if r else '  -  ', d, ref))

main()

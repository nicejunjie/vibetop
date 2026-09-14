# The War Miner's ore bin bakes #333300 — open lead

**Symptom.** On `warminer` (facing set `col`, so `sov` is true) the ore bin —
the mass the whole unit is built around, and roughly half the sprite in
`soviet-war-miner.png` — renders as a near-black olive slab. Sampled at four
points on its top face: `#333300`, `#333300`, `#333300`, `#999933`. A colour
census of the bin region gives `#333300` × 37921 (at 13x = ~224 sprite px),
`#993333` × 8047, `#666633` × 3687, `#996633` × 3380, `#663300` × 2860.

The reference's bin is a bright tan-gold.

**What has been RULED OUT** (each by measurement, not by reading):

1. `BIN_E` (`#4a3c1e`). It does reach `#333300` via pixelate's saturation
   rescue — sat 0.59, plain snap all-51, rescue drives the low channel to 0 —
   so it looked like the answer. Changed it to `#6b5a30`, re-rendered: **no
   visible difference**. Probed by tinting: `BIN_E` covers **0.0%** of the
   sprite. Reverted.
2. `BIN` (`VACC.warminer`, `#b39a4e`). Probed by tinting: covers **10.6%** —
   it is present, but it is not the slab.
3. `BIN` at any shade factor. `isoBox` grades side faces at f = 0.80 (near) and
   0.58 (far), each as a gradient f*1.18 → f → f*0.80, and the top face at
   1.24 → 1.02. Working every one of those through the snap for 179/154/78
   gives `#cccc66`, `#996633`, `#666633` and `#663333` — the census's smaller
   buckets — and **never `#333300`**. To reach (51,51,0) the factor must be
   about 0.30, which `isoBox` never uses.
4. Something drawn over the crate. `drawBin2` contains only the `crate(...)`
   call; nothing else paints that area.

**Therefore** the slab is a different colour entirely, drawn by something other
than the crate, and large. The next step is to bisect `drawBin2`/`bakeVehicle`
by tinting rather than to guess a fifth colour — four hypotheses have now failed
in a row, each of which looked correct on the arithmetic.

**Also worth knowing:** codex was given this unit with the rip and the
constraints and produced a worse sprite (bin enlarged to ~70% of the frame in
saturated orange, cab shrunk to a cluster) while reporting all gates green and
"visually inspected all eight bearings". Its output was reverted. Render and
look before believing a delegated report on art.

---

# The structures' teal, and why the obvious sweep is wrong

Scanned `rts/bake/{buildings,civ,walls}.js` and all 27 `rts/units/structures/*`
against the shade ladder: **313 literals** land on the teal diagonal, across 29
files. Worst offenders by count: `base.js` 51, `power.js` 41, `civ.js` 24,
`barracks.js` 24, `depot.js` 21. Worst single colour: `civ.js` `#3f5460`
(63/84/96), teal at 37 of 80 rungs.

**Do not blanket-neutralise them.** I tried it — 167 replacements over the 25
combat-structure files, excluding `civ.js` and `weather.js` — and it took
`clause.unmetStructures` from 1 to 2.

The reason is worth knowing before anyone tries again. `tools/clause-checks/
structures.js` detects house colour as:

    s >= 0.25 && v >= 0.20 && hueGap(h, 197) <= 20

Hue 197 is a cyan-blue. Those blue-grey structure literals were being counted as
the OWNER'S COLOUR by the clause checker, so some building was meeting its
house-colour minimum on colours that are not the owner's at all. Neutralising
them removed the teal and the accidental house colour together, and the building
fell under its floor.

So there are really two defects stacked here:

1. structure literals that bake teal, and
2. at least one structure whose house-colour clause passes on accidental
   blue-grey rather than on `panel`/the owner's hue.

Fixing (1) alone breaks (2)'s clause. The right order is to find which building
depends on the accident — render each one and look, rather than trusting the
count — give it real owner colour, and only then neutralise. That needs a
session with room to render 25 buildings.

## The blocker is the FLAK CANNON — named, and narrowed to four colours

Finding it did NOT need 25 building renders. Re-apply the sweep, re-record, and
diff `detail.clauses` for rows whose `unit` is a structure:

    before:  gapgen     | [dir] exactly 2 house collar rings and nothing else remapped
                          measured 3 house-coloured blob(s) >= 18 px   (already failing)
    after:   gapgen     | (same, still failing)
           + flakcannon | [col] exactly 1 barrel — the Sentry Gun's two is the read
                          against it — >=2px thick at >=25% contrast and the topmost mass
                          measured 2 bright crown blob(s) >=2px

The sweep lifts a SECOND mass at the Flak Cannon's crown over that 25% contrast
floor, so it counts as a second barrel.

That file has been bitten by this exact trap twice already and says so in its
own comments: `FK_GUNL` carries a note that it was chosen so the collar ring
reads "without crossing the clause's brightness floor", and the ammo drum was
moved from `baseY-8` to `baseY-4` because "its bright lid highlight poked 2px
into the crown band, a spurious extra barrel".

**Eliminated:** FK_GUNL. Dropped it to `#5c5c5c` and then `#4e4e4e` with the
sweep applied; the clause still failed both times. So it is one of the other
four literals the sweep changes in `flakcannon.js` — `FK_GUN` `#343a44`,
`FK_BARD` `#2a2e35`, the pale foot plate `#6d7482`, or the fifth.

**Remaining work is now one unit and five colours:** bisect those replacements
one at a time against `clause.unmetStructures`, find the one that lifts a crown
mass over the floor, and give that mass a DARKER neutral rather than its
luma-matched one. Then the 167-literal sweep lands clean.

## The APC's deck cavity: the floor is NOT hidden

§2.4 "deck cavity visible as a house-hued interior" measures 0 against a want of
>= 12 px. The obvious reading is that something covers the floor. It does not:
tinting the well floor magenta and counting gives **83 visible sprite pixels**.
The art is on screen; the clause is not finding it.

`tools/clause-checks/naval-air.js:436` looks for connected components of
owner-hued pixels that satisfy ALL of:

    c.h >= 2  &&  c.n >= 6  &&  c.ringV <= c.v - 0.35
    && c.x0 > 0 && c.y0 > 0 && c.x1 < f.w - 1 && c.y1 < f.h - 1

then discards the topmost (the bridge roof, trim) and wants the largest of the
rest at >= 12 px. Measuring 0 means no SECOND qualifying component exists.

**Ruled out by test:**
- the floor being covered — 83 px are visible
- the seat thwarts hiding it — narrowed from wid*0.19 x 1.0 to wid*0.115 x 0.5,
  measurement unchanged at 0
- the floor being too thin — raised its height 0.6 -> 1.2 -> 1.8 and widened it
  to wid*0.235, still 0

**Most likely remaining cause:** the floor is CONNECTED to the other
house-coloured masses. The two rubbing strakes are `panel` at wid*0.32 and run
the full flank, so they touch the sprite outline; the bridge roof is `panel`
too. If antialiasing bridges the floor to either, the whole thing is ONE
component that touches the edge, and the `x0 > 0 ... x1 < f.w - 1` test throws
it out. That is checkable by dumping the component list rather than by guessing
again — `comps(f, OWN, true)` is right there.

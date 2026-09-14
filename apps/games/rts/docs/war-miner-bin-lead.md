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

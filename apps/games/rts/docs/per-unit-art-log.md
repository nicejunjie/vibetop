# The per-unit art walk

The user's instruction, 2026-09-05: *"you have to do it one unit after another,
menu item and actually unit inplay"*.

Aggregate tools (`legibility.js`, `cameo-legibility.js`) answer **"is the SET
separable"**. They cannot answer **"does the Rocketeer read as a Rocketeer"**,
and that is the question that decides whether the art is good. So each unit is
taken one at a time, on BOTH surfaces it is met on — the menu cameo and the
thing on the ground — beside RA2's own plate.

**The rig:** `node apps/games/rts/tools/unit-compare.js <key> [...]` writes
`art/out/cmp-<key>.png` — our cameo at the drawn size, our in-play sprite at
zoom 1 on the game's own ground, RA2's real plate. It follows the unit's
faction (an early version only built a Directorate base, so every Collective
unit came back "(not in the panel)" — the rig's fault, not the art's).

## Fixed

| unit | what was wrong | fix |
|---|---|---|
| **G.I.** (and all 14 troopers) | cameo was interpolated MUSH — a grey smear for a helmet — and the scale was driven by WIDTH, so only the top 38% showed: head and shoulders, **no weapon, at any crop depth** (0.72 and 0.82 rendered identically) | nearest-neighbour for portraits; scale driven by the crop's HEIGHT. Every trooper now shows its identifying prop |
| **Grizzly** (and all vehicles) | cameo used `ICON_FACE 4`, "front-on" — a tank becomes a symmetrical lump with no barrel and no hull. Our own side bearings read as tanks instantly | bearing is per class now: vehicles 3/4 side, infantry front-on (RA2 shoots infantry as portraits) |
| **V3 Launcher** | missile lay near-flat on the bed and read as a truck with a pipe; RA2 raises it to ~40° and that diagonal IS the unit. The code comment already said "an angled rail… so nothing competes with that diagonal" — the geometry just never delivered it (25°) | rail, jack strut and rocket raised together |
| **Terror Drone** | a squat body with stubby legs; RA2's splayed spider legs ARE the silhouette | leg reach +25%, arch deliberately unchanged (it is what carries the scale gate at ZMIN) |
| **superweapon clocks** | M1's caption was baked onto the 56x42 clock icon, straight across the countdown numerals | `cameoFor(..., noCap)`, cache key carries it |

## Looked at, and deliberately LEFT ALONE

Not inventing work is part of the job.

- **Power Plant, War Factory** — already match their plates (three towers; the
  ribbed Quonset hangar with its arched opening). Art pass 8 did this properly.
- **Tesla Tank** — ours has tall copper coils with a live arc between them.
  RA2's emitter is more compact, but ours reads instantly as a Tesla Tank at
  our size, and the arc is exactly the energy signature the specialists should
  have. A deliberate stylisation that works.
- **Flak Track** — its barrel is near-vertical where RA2's sits at ~45°. This
  is **deliberate and measured**: the code records that a shallower jib left
  its crown "the same fat box the IFV wears — the two lightest vehicles in the
  game, and the pair the gate scored at 0.709". Do not "fix" it.

## Recorded disagreement, NOT changed

- **Mirage Tank** — RA2's plate shows a clear gun barrel; ours has essentially
  none. The code states this was deliberate — *"No turret, and almost no gun:
  just a stubby muzzle under the stack's chin"* — citing a reference. Two
  cited readings disagree; changing it against a prior deliberate decision
  needs better evidence than one plate, so it is written down instead.

## Open, with agents

- **Naval** — the Aegis is drawn 54x65 at zoom 1, i.e. TALLER THAN WIDE, where
  RA2's cruiser is long and low. A proportion defect, and very likely why
  `aegis | squid` has been the one stubborn confusable pair for weeks.
- **Infantry specialists have lost their ENERGY SIGNATURE**, which in RA2 IS
  the identity. The Desolator's plate is dominated by a yellow-green
  radioactive glow; ours is a dark figure with one small green dot. The Tesla
  Trooper's is dominated by electric arcs; ours has **none at all** — which our
  own Tesla Tank shows we know how to draw.

## The standing lesson

Three of the five fixes above were **invisible to every aggregate metric**, and
two of them made the aggregate slightly WORSE while making the unit obviously
better: the infantry crop cost 4% of pairs-under-RA2's-bar because showing more
of each man makes the men more alike. The metric cannot see "reads as a G.I.".
Keep both instruments; when they disagree, the picture wins and the trade gets
written down.

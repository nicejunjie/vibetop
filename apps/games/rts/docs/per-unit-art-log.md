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

## The Spy is CORRECT — I was reading the cameo again (third time)

I recorded, in a commit message, that "the Spy is still BLUE where RA2's is a
man in a dark suit" and that he needs the Rocketeer's fix. **That is wrong.**
The code says why, citing the identity reference:

> "THE COAT IS THE HOUSE ZONE. §1.5's table gives the Spy `fedora / long coat /
> coat hem, no split legs / briefcase`, and the middle column of that table is
> headed 'mid zone (HOUSE)' — RA2 remaps the coat, exactly as it remaps a GI's
> torso."

His coat is blue because it is the house zone, by design and by reference. RA2's
*painted plate* shows a dark suit; RA2's *sprite* remaps. Same trap as the Grand
Cannon and the Psychic Sensor, and I walked into it a third time — after writing
the rule down twice.

**And the budget move I was going to make to pay for it is also forbidden.**
Tanya sits at 15.7% owner colour, second-lowest after the dog, so raising her
looked like free headroom. She is EXEMPT on purpose: `hue.infantryBelowBudget`
is **0**, and its note reads *"RA2's own 14.3% low end IS Tanya"* and *"close
the gap on the other twelve, never by painting those two."* Ours at 15.7% is
already RA2's own figure.

So there is no Spy work and no Tanya work. Checking the recorded design cost two
lookups; doing it would have cost two units moved away from RA2.

## Open, with agents

- **Naval** — the Aegis is drawn 54x65 at zoom 1, i.e. TALLER THAN WIDE, where
  RA2's cruiser is long and low. A proportion defect, and very likely why
  `aegis | squid` has been the one stubborn confusable pair for weeks.
- **Infantry specialists have lost their ENERGY SIGNATURE**, which in RA2 IS
  the identity. The Desolator's plate is dominated by a yellow-green
  radioactive glow; ours is a dark figure with one small green dot. The Tesla
  Trooper's is dominated by electric arcs; ours has **none at all** — which our
  own Tesla Tank shows we know how to draw.

## Measured NEGATIVE results — recorded so nobody re-runs them

**The IFV: do not lengthen it.** It is 17 long against 15 wide, by far the
shortest thing that drives, and it appears in FOUR of the sidebar's eight worst
pairs — so stretching it toward RA2's longer eight-wheeled car is the obvious
move. It is wrong. At len 24 the art gate returned `peerVsSelf.vehicle` 1 -> 3
(three vehicles matching a PEER better than their own other bearings),
`iou.groundCombat.mean` over its 0.45 ceiling, and `mass.tightestBand6`
2.093 -> 1.801, under its floor of 2. At len 20 it still failed. Lengthening
crowds the 22-24 band that mirage, flaktrack and v3 already share, so the IFV
stops being separable BY SIZE. **Its shortness is its place in the size
ladder.** Fix its cameo collisions with value or a prop, never length.

## A CAMEO is not a SPRITE — do not read proportion off a plate

**Psychic Sensor.** RA2's plate shows a tall slender tower; ours is a wide flat
drum, and it collides with the Cloning Vats, the Nuclear Reactor and the Flak
Cannon, which are also squat. The obvious read is "our proportion is inverted".
But the code cites `[NAPSIS]` as "a squat armoured drum", and RA2's in-game
Psychic Sensor IS drum-like — its cameo is a dramatic low-angle hero shot, the
way most of the corpus is.

So: use RA2's plates to judge COMPOSITION, LIGHTING and what the subject's
identifying feature is. Do NOT read in-game proportion off them; that is what
the sprite rips in `docs/ra2-ref/` are for. The Aegis case is different and
still stands, because there the in-play sprite is measurably taller than wide,
which no camera angle explains.

**The Grand Cannon confirmed this within the hour, and it had already bitten
once.** RA2's plate is dominated by an enormous barrel; ours is a stubby gun on
a fat dome, and it collides with the IFV and the Ore Purifier — so lengthening
it looked like the same win the V3's raised rail had been. The code stopped it,
because a previous pass had already made and undone exactly that mistake,
citing a 1:1 re-read of the in-game render
(`docs/ra2-ref/allied-grand-cannon.png`, 181x133):

> "The previous pass had this the wrong way round: it drew a low drum on a big
> parade slab with a forty-pixel barbette gun, and nearly all of the sprite was
> that barrel. The real French emplacement is the OPPOSITE — a fat rounded
> ARMOURED DOME, taller than it is wide once the gun is on ... and the gun
> poking out of its shoulder is SHORT and thick."

Two units, two hours apart, the same trap with opposite answers: the V3's
raised rail was RIGHT (its sprite really does carry the missile high) and the
Grand Cannon's long barrel would have been WRONG. **The plate cannot tell you
which. Only the sprite rip can.** Check the rip before changing a proportion.

## The standing lesson

Three of the five fixes above were **invisible to every aggregate metric**, and
two of them made the aggregate slightly WORSE while making the unit obviously
better: the infantry crop cost 4% of pairs-under-RA2's-bar because showing more
of each man makes the men more alike. The metric cannot see "reads as a G.I.".
Keep both instruments; when they disagree, the picture wins and the trade gets
written down.

---

# Where the art stands, 2026-09-05

## The map: DONE by the measure we have

**Zero confusable pairs in every group, in all three windows, at both zooms.**
Not one vehicle, trooper, aircraft or hull is closer to a peer than a player is
to telling friend from foe. `aegis | squid`, carried for weeks, is gone —
closed by PROPORTION once the fleet was measured on the rendered frame instead
of on plan geometry.

## The sidebar: most of the way, and the rest is the medium

|  | at the start | now | RA2 |
|---|---|---|---|
| worst pair | 27.2 | **53.6** | 58.5 |
| 5th percentile | 36.7 | **68.4** | 81.7 |
| median | 51.2 | **82.6** | 100.5 |
| greyed floor | 12.2 | **35.1** | — |
| pairs under RA2's bar | 780 / 780 | **372** | — |
| at DPR 2 | 717 | **150** | — |
| plate luminance SD | 10.2 | ~21 | 22.6 |

Four of RA2's five differences are closed: the NAME is on the plate, each plate
has its own ENVIRONMENT, the subject FILLS the frame, and the CAMERA varies by
class (infantry front-on portraits, everything else three-quarter). What is
left is the medium — RA2's plates are painted scenes and ours are our own
sprites, well framed.

## The current worst pair, and a measured dead end

`GI | Spy` 53.6. Both read as a pale head over a blue torso at 60x48.
Brightening the rifle's barrel glint (#5c636e -> #a7aeb9) to make the G.I.'s
weapon read — RA2's plate is dominated by it — made the pair **worse**, 53.6 ->
53.4: the extra pale pixels push him TOWARD the pale-hatted Spy. Reverted.

It also arrived as a deliberate trade: it was 56.1 before the Rocketeer
whitening and the stature moves, which took the MAP to zero confusable infantry.
The two surfaces do not always move together, and when they disagree the map is
the one being played.

## Structures: checked, and the answer keeps being "already deliberate"

Power Plant, War Factory, Airforce Command, Battle Lab, Ore Refinery, Barracks,
Grand Cannon, Psychic Sensor — all walked through the rig against their plates.
**None needed work.** Two produced near-misses that the code itself stopped
(Grand Cannon's barrel, Psychic Sensor's proportion) and one more nearly did:

* **Airforce Command helipads.** The four pad slots carry a house-coloured
  double diamond over an OLIVE field with dark blades and a tan centre, which
  at a glance reads more like carpet than concrete. It is deliberate and laid
  out from the geometry, not eyeballed — *"the four quadrant centres ARE the
  Harrier pad slots (PAD_SLOTS), so the markings are laid out from them"*. With
  no sprite rip of RA2's own pads to check against, a documented decision beats
  my hunch. Left alone.

**This is the signal that the per-unit walk has done its work.** It is now
returning "already correct, and here is the reference" far more often than it
returns a defect — six of the last eight units. The remaining sidebar gap to
RA2 is not art direction any more; it is that RA2's plates are painted
illustrations and ours are our own sprites, well framed. That is a different
project, and it should be started deliberately rather than arrived at by
another lap of this one.

## The composited FRAME — the measurement the tool asked for, finally taken

`legibility.js`'s own header has said this since it was written, and nobody had
done it:

> "the reporter was looking at a BATTLE, where units are at eight facings,
> overlap, and carry bars and effects. This tool compares one facing, isolated,
> side by side, which is the most flattering arrangement there is. **Do not read
> a pass here as 'vehicles are fine on the map.'** The honest next step for that
> complaint is to measure a composited FRAME, not a roster."

Done: two full armies, twelve kinds each, mixed arms, overlapping, some
damaged so the health bars are up, at zoom 1 and at ZMIN
(`scratchpad/frame/battle-z*.png`). No page errors.

**It passes, and it passes on the thing that matters most.** Friend-from-foe is
instant — blue army left, red army right — which is the read a player makes
every second. And the units whose identity this pass rebuilt are exactly the
ones that announce themselves in the crowd: the V3's raised white missile, the
Tesla Tank's copper coils, the Terror Drone's splayed legs, the Prism Tank's
mast, Yuri's robe, the Desolator's glow.

**One hypothesis formed by looking, and MEASURED FALSE.** In the frame the red
army seemed to carry less owner colour than the blue. It does not:

    Directorate vehicles 0.172   infantry 0.268
    Collective  vehicles 0.164   infantry 0.323

Essentially equal on vehicles, and the Collective's infantry carry MORE. The
impression comes from red-on-sand having less contrast than blue-on-sand, which
is a property of the colour pair and the terrain, not of our art — and it is
the player who picks the colour. Recorded so the next person who sees it in a
desert frame does not go looking for an asymmetry that is not there.

## The rule this whole pass earned

**A CAMEO IS NOT A SPRITE.** It cost three near-misses to learn and one to
un-learn:
  * the *Psychic Sensor* looked like an inverted proportion — RA2's in-game
    sensor is a squat drum, and its plate is a low-angle hero shot;
  * the *Grand Cannon*'s enormous plate barrel had ALREADY been built and undone
    once against the in-game render;
  * the *Spy* looked blue where RA2's plate is a dark suit — his coat IS the
    house zone, by reference;
  * and the *V3*, where the raised rail was RIGHT, because its sprite really
    does carry the missile high.
The plate cannot tell you which. Only the sprite rip can. Read plates for
composition, lighting and identifying feature; read rips for proportion.

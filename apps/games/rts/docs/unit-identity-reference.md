# Unit identity reference — how RA2 actually keeps its roster apart, and the per-unit spec that follows

> **Status:** reference model, written 2026-09-04. It answers one question —
> *"in real ra2, those are distinguishable at any size, and they are all unique
> with unique features"* — by measuring the real sprites rather than
> describing them. It is **not** a plan and it does not touch product code.
> Companions: `apps/games/rts/docs/roadmap.md` (the standing "true RA2
> experience" bar and the per-item art passes), `docs/ra2-art-plan.md` (how the
> art was rebuilt; the fetch workflow), `apps/games/rts/docs/gap-audit-art.md`
> §2-3 (the state/motion gaps — this file deliberately does not repeat them).

---

## 0. Method, so every number below can be re-derived

Everything in §1 is measured off the sprites in `docs/ra2-ref/` and off
`/tmp/RA2inis/{art,rules}.ini`. Nothing is from memory.

* **Scale.** RA2's isometric cell canvas is **60x30 px** ([ModEnc,
  TMP](https://modenc.renegadeprojects.com/TMP): "48x24 for TS and 60x30 for
  RA2"), and RA2 has **no zoom** — every sprite is drawn at 1:1, always. Our
  `TW = 64, TH = 32` (`rts.html:747`) is therefore **1.067x** RA2's scale at
  `zoom = 1`, and our zoom range is `ZMIN = 0.55 … ZMAX = 2.0`
  (`rts.html:24995`) applied as one global `ctx.scale(zoom, zoom)`
  (`rts.html:28118`). So our effective scale against RA2 runs **0.59x - 2.13x**.
  *RA2's art was never asked to survive below 1.0x. Ours is.*
* **Screenshots are native.** A 2x2-block test over `allied-grizzly-tank.png`,
  `soviet-rhino-tank.png`, `allied-prism-tank.png`, `soviet-kirov.png` scores
  0.000-0.055 — they are 1:1 grabs, not upscales, so pixel counts taken off
  them are real on-screen pixels.
* **Vehicle bodies** were segmented out of the wiki turnaround screenshots by
  building a background palette from the image border ring, then subtracting
  both the background and its 0.42/0.48/0.54/0.60 multiples (RA2's ground
  shadow is a multiply of the terrain). Largest-width connected component =
  the broadside facing. This is the same trap `docs/design-decisions.md`
  records ("Measuring an RA2 reference sheet: segment by GREENNESS, never by
  background median") — the shadow must come off or every width is wrong.
* **Infantry bodies** came from the clean SHP rips (wiki `File:… animation.gif`
  decoded to PNG frames), with the SHP **shadow index** — which decodes as a
  dark navy blob, not magenta, in these rips — masked as
  `b > r+12 && b > g+12 && r < 85 && g < 85`.
* **House-colour census** counts a pixel as owner-hue at `HSV s > 0.40` and
  hue within ±22° of 0° (red) or 200-255° (blue), body pixels only. Every
  infantry rip on disk is a **RED-owner** rip, which is exactly what makes it
  usable: on a Soviet unit whose fixed palette is olive/tan/grey, *any*
  saturated red is remap.

New references fetched for this document (2.9 MB, `docs/ra2-ref/`):
`allied-gi-anim{,-last}.png`, `soviet-yuri-anim{,-last}.png`,
`allied-attack-dog-anim{,-last}.png`, `allied-{destroyer,aegis-cruiser,aircraft-carrier,dolphin,hornet,landing-craft,nighthawk,mcv}.png`,
`soviet-{typhoon-sub,sea-scorpion,dreadnought,giant-squid,mcv,amphibious-transport}.png`,
plus the derived evidence figure `analysis-infantry-silhouette-test.png`.

---

## 1. The mechanism, stated as rules

### 1.1 The sizes RA2 actually works at — measured

**Infantry** (clean rips, red owner, shadow removed; `w x h` in native px):

| unit | RA2 id | bbox | body px | owner hue |
|---|---|---|---|---|
| Attack Dog (running) | `ADOG` | **21x15** | 95 | 29.5% |
| Crazy Ivan | `IVAN` | 12x25 | 117 | **47.9%** |
| Engineer | `ENGINEER` | 13x25 | 168 | 44.6% |
| Rocketeer | `JUMPJET` | 16x24 | 165 | 28.5% |
| Chrono Legionnaire | `CLEG` | 15x26 | 128 | 24.2% |
| Tanya | `TANY` | 13x26 | 133 | **14.3%** |
| Conscript | `E2` | 13x27 | 168 | 44.6% |
| GI | `E1` | 12x28 | 115 | 45.2% |
| Tesla (Shock) Trooper | `SHK` | **18**x28 | 187 | 32.1% |
| Yuri | `YURI` | 12x29 | 171 | 26.9% |
| Flak Trooper (gun up) | `FLAKT` | 12x**37** | 182 | 26.4% |

So: **RA2 infantry are 12-18 px wide, 24-29 px tall, and 81-190 opaque
pixels.** That is the entire canvas the game has to work with, and it is
*smaller* than what our renderer gets at `zoom = 1`.

**Vehicles, aircraft and ships** (broadside body, shadow removed, native px):

| class | unit | RA2 id | bbox | aspect |
|---|---|---|---|---|
| tiny | Terror Drone | `DRON` | **21x14** | 1.50 |
| | Hornet | `HORNET` | 27x15 | 1.80 |
| light | Flak Track | `HTK` | **45x45** | **1.00** |
| | IFV | `FV` | 50x45 | 1.11 |
| medium | Tesla Tank | `TTNK` | 52x37 | 1.41 |
| | Grizzly Tank | `GTNK` | **54x23** | **2.35** |
| | Chrono Miner | `CMIN` | 55x28 | 1.96 |
| | Rhino Tank | `HTNK` | **56x28** | 2.00 |
| | Apocalypse | `MTNK` | **59x34** | **1.74** |
| | War Miner | `HARV` | 56x48 | 1.17 |
| | Mirage Tank | `RTNK` | 59x39 | 1.51 |
| | Prism Tank | `SREF` | 59x**43** | 1.37 |
| | Sea Scorpion | `HYD` | 59x32 | 1.84 |
| heavy | V3 Launcher | `V3` | **63**x36 | 1.75 |
| | Nighthawk | `SHAD` | 64x**21** | **3.05** |
| | MCV (Allied) | `AMCV` | 69x47 | 1.47 |
| | Harrier (span) | `ORCA` | 71x44 | 1.61 |
| | Typhoon Sub (surfaced) | `SUB` | 75x**14** | **5.36** |
| capital | Aegis Cruiser | `AEGIS` | 91x35 | 2.60 |
| | Destroyer | `DEST` | 101x41 | 2.46 |
| | Giant Squid | `SQD` | 117x30 | 3.90 |
| | Dreadnought | `DRED` | 133x45 | 2.96 |
| | **Kirov Airship** | `ZEP` | **139x62** | 2.24 |
| | Aircraft Carrier | `CARRIER` | **143**x52 | 2.75 |

**Rule 1 — the mass hierarchy is monotone and it spans 6.8x.** Smallest
combat body 21 px, largest 143 px. There is no bunching: every class occupies
its own width band (tiny 21-27, light 45-50, medium 51-59, heavy 63-75,
capital 91-143), and the *aspect* separates units inside a band (Flak Track
1.00 vs Grizzly 2.35 at nearly the same width). **Size and aspect together
carry the first read, before a single detail is resolved.**

### 1.2 Silhouette-first? Only for vehicles. For infantry the claim is false.

This is the part of the user's claim that does not survive contact with the
sprites, and saying so is worth more than agreeing.

`docs/ra2-ref/analysis-infantry-silhouette-test.png` renders eleven RA2
infantry as **pure black alpha masks** at 7x beside their colour originals.
Result:

* **Genuinely readable as a black shape (5 of 12):** Attack Dog (quadruped,
  horizontal, aspect 1.4 against everyone else's 0.45), Flak Trooper (a
  12x37 column — the raised barrel is 9 px of pure spike above the helmet),
  Tesla Trooper (18 px wide — a third wider than anyone else, from the
  pauldrons), Guardian GI deployed (a wide low dome), Chrono Legionnaire
  (blocky powered-suit shoulders, no neck).
* **Indistinguishable as black shapes (7 of 12):** GI, Conscript, Crazy Ivan,
  Engineer, Rocketeer, Tanya, Yuri. All are a 12-13 x 25-29 two-legged blob.
  Held up side by side at 7x with the colour stripped, a GI and a Conscript
  and a Crazy Ivan are the *same silhouette*.

**Rule 2 — RA2 tells vehicles apart by silhouette and infantry apart by
colour blocking.** Two different mechanisms, and conflating them is the single
biggest way to get this wrong. A vehicle has 600-1500 px and can afford a
distinct outline; an infantryman has 81-190 px and cannot, so RA2 spends the
budget on a **2-3 zone colour layout** instead — see §1.5.

For vehicles the silhouette test does hold. At broadside the Grizzly (a 23 px
tall slab with a barrel), the Prism Tank (a 43 px tall shard), the V3 (a
rocket longer than its truck), the Flak Track (a square with a stick out of
the top) and the Nighthawk (a 21 px tall rotor line) are all separable with
colour removed.

### 1.3 The spike: what actually breaks the outline, measured

Take the column-height profile of a segmented broadside body (how many body
pixels in each pixel column, left to right). For the **Grizzly**, 54 columns:

```
2 3 2 2 2 2 2 3 2 2 3 1 2 | 7 10 14 15 15 16 15 14 16 16 16 17 17 16 16 18 19 …
└──────── barrel ────────┘   └──────────────── hull ─────────────────────────
```

The first **13 columns are 2-3 px tall**. That is the gun: a 2-px-thick sliver
that is **24% of the unit's whole width** and sits entirely outside the hull.
It is the single feature that says "tank" before anything else resolves. The
Nighthawk's profile does the same thing with its rotor (columns 24-31 run
1-3 px tall, a 1-2 px blade line spanning half the airframe).

**Rule 3 — every RA2 unit has exactly one spike: a thin high-contrast
protrusion that breaks the body outline, 15-30% of the unit's long axis, and
as thin as 2 px.** Barrels (Grizzly, Rhino, Apocalypse's twins), coils (Tesla
Tank's pair, Tesla Trooper's pack), rails (V3's missile), rotors (Nighthawk),
dishes/crystals (Prism Tank's upright block), legs (Terror Drone's four
splayed blades), gondolas (Kirov). **Two px is RA2's floor, never its target.**

**Rule 4 — the spike must clear the body, not sit on it.** The Grizzly's
barrel starts where the hull ends. The V3's missile overhangs both ends of the
truck. The Flak Trooper's barrel is above the helmet. A feature drawn *inside*
the body outline is a texture, not a spike, and it dies first at low zoom.

### 1.4 The house-colour remap: how much, and exactly where

RA2's remap is a 16-index palette ramp per house, and `rules.ini:2827
[Colors]` gives the hues as HSV byte triples: `DarkRed=0,230,255`
(**s = 0.90, v = 1.00**) and `DarkBlue=153,214,212` (216°, **s = 0.84,
v = 0.83**). These are *fully saturated* colours across a full value ramp —
not a mid-tone accent band. Our own `COL = ['#4aa3db', '#e5646c']`
(`docs/design-decisions.md`) is s = 0.66 / s = 0.56: paler on both counts.

Measured owner-hue fraction, body pixels only:

| | measured range | median |
|---|---|---|
| **RA2 infantry** (red-owner rips) | **14.3 - 47.9%** | **~29%** |
| **RA2 Soviet vehicles** (red owner, olive/tan base — so red *is* the remap) | Apocalypse 20.9, Tesla Tank 14.6, V3 16.7, Flak Track 17.2, War Miner 11.5, Soviet MCV 23.5, Sea Scorpion 19.0, Dreadnought 20.6, Terror Drone 38.7 | **~19%** |
| **our units** (recorded in `roadmap.md` per-unit passes) | infantry 12.5-19.1, vehicles 10.5-22.6 | ~15% |

**Rule 5 — RA2's remap budget is ~19% for vehicles and ~29-45% for infantry,
not one flat number.** Our uniform 12-18% house rule is approximately right
for vehicles and **about half** of what RA2 puts on a foot soldier. That is
not a rounding error; it is the mechanism §1.2 says infantry identity depends
on.

Where the colour goes matters more than how much, and the sprites are blunt
about it:

* **Apocalypse Tank** (`soviet-apocalypse-tank.png`, red owner, zoomed): the
  red is **four canister drums stacked 2x2 on the rear deck**, each roughly
  7x7 px, plus a band on the turret cheek. Hull, tracks and the twin barrels
  are olive-grey. The house colour *is* the identity feature.
* **V3 Launcher**: the red is the missile's **nose cone and tail fins**. The
  missile body is white, the truck olive. The house colour lands on the two
  ends of the one thing that names the unit.
* **Rhino Tank** (red owner): **three discrete panels along the flank plus two
  on the turret cheeks** — five separate blocks, not a band.
* **Grizzly Tank** (blue owner): **two discrete panels** — one turret cheek,
  one hull flank — on a pale silver body, with a clear gap between them.
* **GI / Conscript / Crazy Ivan / Engineer**: the **entire torso**, from the
  collar to the belt, in owner colour, over legs in a fixed neutral.

**Rule 6 — RA2 paints the owner colour ON the identity feature, in a small
number of DISCRETE blocks, never as a continuous stripe.** Vehicles: 2-5
blocks of 4-8 px, sited on the turret cheek, the flank plate, or the named
part (canisters, nose cone). Infantry: one big block, the torso.

**Rule 7 — the discreteness is itself a shape cue.** Two red blocks with a gap
read as *armour plates* and are countable at 1:1; one long band reads as
*paint* and carries no shape information. Colour and silhouette are doing the
same job in the same pixels.

**Rule 8 — some units are not remapped at all.** `art.ini` gives
`Remapable=yes` to nearly everything, but **`[ZEP]` (Kirov, art.ini:779) and
`[HORNET]` (art.ini) carry no `Remapable` key.** The Kirov's red is fixed
paint. So the largest airframe in the game — 139x62, 2.2x the Harrier's
span — is identified by **mass and shape alone**, and RA2 was comfortable with
that. Colour is never the last line of identity.

### 1.5 How infantry are actually told apart: the 2-3 zone colour layout

With 12x27 px and no usable silhouette, RA2 gives each infantryman a
**vertical stack of 2-3 flat colour zones plus one prop**, and makes the zone
values and hues different per unit. Read off the rips at 7x:

| unit | top zone | mid zone (house) | bottom zone | prop |
|---|---|---|---|---|
| GI | grey pot helmet | **red torso**, wide | **olive** legs | rifle across chest |
| Conscript | dark cap | **red torso**, wide | **tan/brown** trousers | rifle held low |
| Crazy Ivan | ushanka (dark, fur flaps) | **red vest**, 47.9% | dark | dynamite bundle at the waist |
| Engineer | small helmet | **red**, 44.6% | **near-white/orange hazmat** — the only light-value body in the roster | toolbox |
| Tesla Trooper | small bowl helmet sunk between | **silver carapace** with a red chest | silver greaves | 18 px pauldrons, arc when firing |
| Tanya | **blonde head**, brightest 2x2 on the field | small red top, 14.3% — the lowest | **bare pale limbs** | two pistols out to the sides |
| Yuri | bald domed head | grey coat with a **red collar + red hem** only | **one unbroken coat block, no legs** | none |
| Chrono Legionnaire | helmet with a collar ring | silver suit, red trim | blocky suit legs | long level rifle |
| Rocketeer | rounded dome | red chest plate | pack tanks behind the shoulders | drawn at altitude, shadow offset |
| Flak Trooper | helmet | red chest | dark | barrel angled up past the head |
| Spy | **fedora** | long coat | **coat hem, no split legs** | briefcase |

**Rule 9 — the three levers on an infantryman are (a) the value of the LEG
zone, (b) the presence/absence of a leg split, and (c) one 3-4 px prop at
hand or shoulder height.** GI vs Conscript — the one pair RA2 genuinely
struggles with — is separated *only* by leg colour (olive vs tan) and cap
shape. Yuri and the Spy get a coat, which deletes the leg split entirely and
is instantly readable. Tanya gets skin. The Engineer gets a light-value body
that inverts the whole figure.

**Rule 10 — one bright 2x2 anchor.** Tanya's blonde head, the Engineer's white
suit, the Tesla Trooper's silver carapace: at the size where everything else
mushes, a single high-value 2x2 patch in a fixed body position survives and
names the unit. RA2 uses this sparingly, so it stays diagnostic.

### 1.6 Where the user's claim is overstated — the honest line

The claim is *"distinguishable at any size, all unique with unique features"*.
Measured, that is true of the roster **as an ensemble**, and false in these
specific places:

1. **Seven of twelve infantry share one silhouette** (§1.2). Strip the colour
   and RA2 loses them too.
2. **GI vs Conscript is a genuinely weak pair.** 12x28 vs 13x27, same pose,
   same house-coloured torso, same 44-45% remap. The only separators are leg
   hue and headgear at 3 px. In practice the factions never field both, which
   is what saves it.
3. **Head-on facings collapse.** The narrowest components in the turnaround
   sheets are 29-31 px for Grizzly, Rhino, Apocalypse and Tesla Tank — at
   facings 1 and 5 the broadside spike (the barrel) points at the camera and
   contributes nothing. RA2 accepts that two of eight facings are ambiguous.
4. **Allied armour shares one palette.** Grizzly, Mirage, Prism and IFV are
   all pale blue-grey; they separate on *top furniture* (barrel / emitter
   housing / crystal / boxy turret), not on colour.
5. **RA2 leans hard on things that are not the map sprite.** Nearly every unit with an
   `art.ini` section carries an explicit `Cameo=` and usually an `AltCameo=`
   as well — `HTNKICON`/`HTNKUICO`, `MTNKICON`, `SREFICON`, `FLKTICON`,
   `SHKICON`, `DRONICON`, `desticon`, `DREDICON`; the few without a section
   (`E1`, `E2`) fall back to the engine's default `<id>ICON`. Identity in RA2 is
   *sprite + sidebar cameo + hover name + selection voice + the fact that you
   built the army yourself*. The sprite carries the largest share, not the
   whole load.
6. **The Mirage Tank is deliberately indistinguishable** — it renders as a
   tree. Uniqueness is not an absolute in RA2's own design.

**The defensible version of the claim, and the bar we should hold ourselves
to:** *every RA2 unit is identifiable at 1:1 within about a second, in
isolation, at its broadside facing, from silhouette + a 2-3 zone colour layout
+ one spike — and no two units in the same faction's roster share both their
size class and their spike.* That is testable and we can be held to it.

---

## 2. Per-unit identity spec

Roster from the `UNITS` map (`apps/games/rts/rts.html:1144-1590`, 41 entries)
and `docs/desktop.md`'s Iron Frontier paragraph. **Size class** is relative to
our own roster, using the RA2 counterpart's measured broadside body width:
`XS` <30, `S` 30-50, `M` 50-60, `L` 60-80, `XL` >=80 px (infantry are their own
scale: `i-` classes by height).

**"Pixel budget"** = the minimum on-screen extent the named feature needs to
survive, expressed at our `zoom = 1` (i.e. RA2 px x 1.067). The floor
throughout is **2 px of thickness with >= 25% value contrast against what is
behind it**, which is where RA2 itself bottoms out. Anything authored at 2 px
is gone at `ZMIN = 0.55`; see requirement R1.

**§2.1-2.4 are the 41 UNITS and are the whole of the 96-clause count.**
Structures were added in §2.5-2.9 on 2026-09-06 and have their OWN size-class
scale, their own preamble and their own provenance rules — start at §2.5 before
reading a structure row, and see `docs/clause-inventory.md` for why the
structure clauses are deliberately outside the 96 and outside `clause.checked`.

### 2.1 Directorate infantry

| our unit | RA2 counterpart | the ONE silhouette/identity feature | size class | pixel budget |
|---|---|---|---|---|
| `rifle` GI | `[E1]` E1, 12x28 | **No usable silhouette** — identity is a house-coloured torso block over *olive* legs and a grey pot helmet. Deployed, the feature becomes the sandbag parapet drawn OVER him. | i-M (28) | torso block >= 7w x 6h; helmet >= 5x3 in a value distinct from both torso and legs; legs must read olive, not tan (this is the only thing separating him from a Conscript) |
| `rocket` Guardian GI | `[GGI]`, 15x30 standing / 14x17 deployed | **The shoulder missile tube**, angled ~30° up, overhanging the head by 5-6 px. Deployed: a wide low dome, aspect ~0.8 — the only Allied infantry wider than tall. | i-M | tube >= 8 px long x 2.5 px thick, clearing the helmet by >= 4 px; deployed dome >= 15w x 12h |
| `rocketeer` Rocketeer | `[JUMPJET]`, 16x24 | **Air, not ground** — no ground contact, a separated drop shadow below, plus two pack tanks *behind* the shoulders (never level with the head). | i-S (24, the shortest) | altitude offset >= 10 px; shadow blob >= 9x4 separated from the feet; pack >= 4w x 6h and strictly below the helmet crown |
| `engineer` Engineer | `[ENGINEER]`, 13x25 | **Inverted value** — a near-white/orange hazmat body where every other infantryman is mid-to-dark. The only light-value soldier on the field. | i-S | body value >= 0.75 across >= 55% of the torso+legs; toolbox >= 4x3 at hand height |
| `dog` Attack Dog | `[ADOG]/[DOG]`, 21x15 running | **Quadruped** — bbox aspect **1.4** against every other infantry's 0.43-0.65. Horizontal spine, four legs, tail below the hocks. | i-XS (15 tall) | body <= 9 px tall and >= 19 px long; no vertical torso mass; house colour on the collar/harness, never the coat |
| `tanya` Tanya | `[TANY]`, 13x26 | **Bare pale limbs + a bright blonde 2x2 head** — the highest-value head on the field over the *lowest* house-colour fraction in RA2 (14.3%). Two pistols held out to the sides. | i-M | head patch >= 3x2 at >= 0.85 value; limbs >= 30% of body px in skin tone; pistols break the outline by >= 2 px each side |
| `cleg` Chrono Legionnaire | `[CLEG]`, 15x26 | **Powered-suit shoulders with no neck** — the widest Allied foot silhouette, a collar ring, and a long rifle held level. Plus the teleport shimmer state. | i-M | shoulder line >= 15 px (>= 20% wider than a GI's 12); rifle >= 9 px long held horizontal |
| `spy` Spy | `[SPY]`, 13x25 | **Fedora + long coat** — a civilian silhouette: brimmed hat and NO leg split, the hem is one block. (Mostly moot in play: he renders as an enemy rifleman while disguised, `rts.html:29332`.) | i-S | hat brim >= 7 px wide, >= 1.5x the head; coat hem one unbroken block >= 8 px wide, no vertical gap |

### 2.2 Collective infantry

| our unit | RA2 counterpart | the ONE silhouette/identity feature | size class | pixel budget |
|---|---|---|---|---|
| `conscript` Conscript | `[E2]`, 13x27 | House torso over **tan/brown** trousers under a dark peaked cap. Deliberately the GI's twin; the leg hue and the cap are the whole separation. | i-M | legs must be tan/brown, >= 20 hue-degrees off the GI's olive; cap silhouette flat, not domed |
| `flak` Flak Trooper | `[FLAKT]`, 12x**37** | **The tallest infantry silhouette in the game** — the flak barrel raised 45-60°, 9-10 px of pure spike above the helmet. | i-XL (37) | barrel >= 10 px long x 2.5 px thick, clearing the helmet crown by >= 8 px; total height >= 1.25x a Conscript's |
| `teslatrooper` Tesla Trooper | `[SHK]`, **18**x28 | **The widest infantry** — armoured pauldrons 50% wider than a Conscript's shoulders, over a silver carapace; arcs between the gauntlets when firing. | i-M, widest | shoulder line >= 18 px; carapace value >= 0.70 (silver) across >= 40% of the torso; the roadmap already caught the pauldrons swallowing the helmet — bowl must clear the caps by >= 2 px |
| `ivan` Crazy Ivan | `[IVAN]`, 12x25 | **The most saturated man on the field** (47.9% house) — a red vest, an ushanka with fur flaps, and a dynamite bundle at the waist. No silhouette; pure colour + prop. | i-S | house fraction >= 35%; ushanka flaps break the head outline >= 2 px each side; bundle >= 4x3 at waist height |
| `desolator` Desolator | `[DESO]` | **Backpack tank + wide-mouthed beam gun**, hooded. Deployed: crouched inside a green radiation pool — the pool is the silhouette. | i-M | pack >= 5w x 8h above the shoulder line; gun muzzle >= 4 px across (fat, not a rifle); deployed pool >= 1 tile |
| `yuri` Yuri | `[YURI]`, 12x29 | **The coat** — one unbroken hem block to the ankles, no leg split, over a bald domed head. House colour only on a collar and a hem band (26.9%). | i-L (29) | hem block >= 9 px wide with zero vertical gap for >= 8 px of height; head dome bare, no helmet |
| `engineer`, `dog` | shared | see §2.1 | | |

### 2.3 Directorate vehicles and aircraft

| our unit | RA2 counterpart | the ONE silhouette feature | size class | pixel budget |
|---|---|---|---|---|
| `lancer` Grizzly Tank | `[GTNK]`, 54x23, aspect **2.35** | **The flattest thing on the ground** — a 16-px-tall hull with a 13 px x 2 px gun barrel overhanging 24% of its length. Two discrete house panels (turret cheek, hull flank) with a gap between them. | M | hull height <= 0.45 x length; barrel >= 13 px x 2.2 px, entirely clear of the hull; exactly 2 house blocks, each 4-8 px, individually countable (gap >= 2 px, no fusing) |
| `ifv` IFV | `[FV]`, 50x45, aspect **1.11** | **Nearly square** — a tall boxy turret that is proportionally huge on a small wheeled body, and it swaps per passenger (`TurretCount=4`, art.ini:569). | S | body aspect 1.0-1.2; ~~turret >= 45% of total height~~ (**struck — it cannot coexist with the aspect clause beside it, see below**); four distinct turret models must be visually distinct at >= 8x8 px each |
| `mirage` Mirage Tank | `[RTNK]`, 59x39 | **A wide flat emitter housing over the deck and NO long gun** (a stub only) — the anti-Grizzly. Plus the tree-disguise state. | M | housing >= 60% of hull width, >= 6 px tall, sitting proud of the deck; gun stub <= 6 px (any longer and it reads as a Grizzly) |
| `prismtank` Prism Tank | `[SREF]`, 59x**43** | **The tallest tank profile** — an upright prism crystal block on a low box turret, the top 10 px of the silhouette. | M, tallest tank | crystal >= 10 px tall x >= 5 px wide, standing above the turret roof; total height >= 1.15x the Mirage's |
| `chronominer` Chrono Miner | `[CMIN]`, 55x28, aspect **1.96** | **A long low body with a ribbed chrono drum for a nose** (violet, fixed hue) and a big tan ore bin behind. No turret — that is the read against the War Miner. | M | height <= 0.55 x length; nose drum >= 8 px long, violet and unmistakably not house hue; zero turret mass |
| `nighthawk` Nighthawk | `[SHAD]`, 64x**21**, aspect **3.05** | **The flattest airframe** — two overlapping tandem rotor discs whose blades are 1-2 px lines spanning past the fuselage. | L | ~~rotor span >= 1.25x fuselage length~~ (**impossible with our blur disc, see below**); blades 2 px with >= 40% value contrast; fuselage height <= 0.35 x length |
| `harrier` Harrier | `[ORCA]`, 71x44 span | **A broad swept delta wing**, no rotor — the only fixed-wing Directorate airframe. Empty racks after firing are a second state. | L | wing span >= 1.5x fuselage width; wing >= 5 px chord at the root; nose cone >= 4 px |
| `hornet` Hornet | `[HORNET]`, 27x15, **not remapped** | **The smallest thing that flies** — half a Harrier. Identity is size, not detail. | XS | total span <= 0.45x the Harrier's; do not add detail it cannot carry |
| `mcv` MCV (shared) | `[AMCV]`, 69x47 | **The biggest ground vehicle that is not a ship** — a slab-sided works body, no weapon, no turret. | L | >= 1.17x the widest tank; zero barrel, zero turret ring |
| `destroyer` Destroyer | `[DEST]`, 101x41 | A long hull with a **forward gun turret and an aft helipad** (its Osprey). | XL | length >= 1.46x any land vehicle; one turret forward of amidships |
| `aegis` Aegis Cruiser | `[AEGIS]`, 91x35 | **A big flat-panel radar face and missile cells, no gun barrel** — the visual "it cannot shoot the shore". | XL | radar panel >= 8x8 px, vertical; explicitly no barrel |
| `carrier` Aircraft Carrier | `[CARRIER]`, **143x52** — the largest sprite in RA2 | **A flat flight deck the full length of the hull** with three Hornets parked on it. | XL, largest | deck a single unbroken flat plane >= 80% of length; 3 visible parked airframes |
| `dolphin` Dolphin | `[DLPH]`, `Voxel=no` (SHP) | **Organic** — a curved body with a dorsal fin, no straight lines; submerged most of the time (only the wake ring shows, `rts.html:29355-29360`). | S | no orthogonal edges anywhere; fin >= 3 px above the back |
| `lcraft` Landing Craft | `[LCRF]` | **An open bow ramp** — a flat rectangular deck with a hinged front, carrying visible cargo. | L | ramp plane distinct from the deck; visible cargo when loaded |

> **The Grizzly's corrected block numbers (2026-09-07).** The row used to ask
> for blocks of **6-8 px** separated by **>= 4 px**. Neither number has a source:
> §1.4 describes RA2's Grizzly as *"two discrete panels — one turret cheek, one
> hull flank ... with a clear gap between them"* and states no figure, and
> **Rule 6 in the same section gives the vehicle band as "2-5 blocks of 4-8
> px"** — so the row narrowed its own reference's band without saying why. The
> gap was inconsistent with §2.4 as well: the Rhino, on a 65x38 hull, is asked
> for **>= 3 px** between five blocks, and the Apocalypse — the row that states
> the same *countability* property this one means — sets the bar at
> **>= 2 px**. Demanding a wider gap on the smallest tank on the field than on
> either of those is not a stricter spec, it is an unsourced one.
> The arithmetic says the same thing: two 6 px panels plus 4 px of air is
> **16 rows of a 22-row sprite**, and rows 0-7 are the turret roof and the
> barrel while row 21 is the contact shadow — 14 rows for a 16-row budget. Both
> configurations that do deliver it (raise the turret cap, or drop the flank
> panel onto the contact shadow) add mask and cost `iou.groundCombat.mean`
> **0.4652 -> 0.4667**, more than the whole of that gate's previous gain.
> Corrected to §1.4's own band and the Apocalypse row's own countability bar.
> The art was fixed in the same pass and the fix is a *rendering-order* one
> (the far flank's panel was painted on the deck and fused with the turret
> cheek); measured 2 blocks, minor dims 6 and 5, gap 2-3 px depending on
> bearing, with the silhouette byte-identical. Working: `per-unit-art-log.md`.
>
> **The IFV's struck clause.** *"turret >= 45% of total height"* cannot hold at
> the same time as *"body aspect 1.0-1.2"* on the same row, and the frontier is
> measured rather than argued. At the IFV's gated octant the camera has
> `|fy| = |py| = ISO_Y` and `ISO_Y/ISO_X = 1/2` exactly, so a ground footprint
> of screen width `w` projects to `w/2` of screen HEIGHT carrying no vertical
> structure at all: `h = w/2 + V`. The aspect clause (`w/h >= 1.0`) therefore
> caps the unit's entire vertical budget `V` at `w/2` — 26.5 px on our 53 px
> sprite — and the turret's crown has to come out of that after the wheels, the
> chassis and the crew box have taken their share. Swept one lever at a time
> (turret up, body down, wheels in, chassis down): the best turret fraction
> reachable **at aspect exactly 1.000 is 0.420**; **0.45 first appears at aspect
> 0.943**, which is 0.849 of `[FV]`'s own 1.111 and breaks the aspect clause
> beside it. And 45% has no measured source — there is no `[FV]` rip in
> `docs/ra2-ref/sprites/`, §1.1's only measured `[FV]` datum is the 50x45 bbox
> that the *other* clause already encodes, and this project has recorded three
> separate times that in-game proportion cannot be read off a cameo. What the
> row's PROSE asserts is real and is honoured: `art.ini [FV]` puts the missile
> turret's muzzle at **Z=180** and the gun turret's at **Z=160** where `[GTNK]`
> and `[HTNK]` sit at **Z=100**, on a body RA2 draws SHORTER than the Grizzly's
> — and our IFV's crown is 15 px against the Grizzly's 5. The intent is met;
> only the unsourced number is struck. Working: `per-unit-art-log.md`.
>
> **The Nighthawk's struck clause.** Its three requirements cannot all hold at
> once for us, and the proof is arithmetic rather than a matter of skill: a
> ground circle under this camera projects to an ellipse of aspect exactly 2,
> so a rotor of span `>= 1.25L` is `>= 0.625L` TALL and caps the whole unit at
> aspect 1.6 — against the 3.05 the same row demands. RA2 escapes it by drawing
> the rotor as 1-2 px blade lines rather than a swept disc. **We draw the disc
> on purpose**: at alpha .09 it was ~1400 px sitting three luminance points off
> the grass — invisible to a player, counted as body by every mask metric — and
> that is exactly why `harrier | nighthawk` failed the union window. Lengthening
> the blades alone does not buy the clause back either, because the sheet is
> baked at a fixed blade phase and a near-vertical arm puts the height straight
> back. Shipped 2026-09-05 at aspect 2.606 (0.86 of RA2), fuselage height
> 24/79 = 0.30, rotor span 0.84L. Full working: `per-unit-art-log.md`.
>
> **The strike is CHECKED, not merely asserted** (2026-09-06). Struck is not the
> same as skipped: `tools/clause-checks/naval-air.js` carries a row for this
> clause that verifies the two premises above out of the source — the tile is
> 2:1 (`TW = 64, TH = 32`) and the rotor is drawn in the ground plane
> (`ry = mrR * ISO_Y * 1.4142` against `rx = mrR * ISO_X * 1.4142`) — and it
> goes RED if either stops being true, at which point the strike has to be
> re-argued rather than inherited. It counts in `clause.checked` and separately
> in `clause.struck`, whose target is `<= 1` and points DOWN, so striking a
> clause can never be a way to move the coverage number.
>
> **Its SIZE is a separate clause and it has its own ceiling.** RA2 draws
> [ORCA] at 1.11x [SHAD]; ours drew the Nighthawk at 1.65x the Harrier,
> because aspect is scale-invariant and nothing measured it until
> `size.airOutsideRA2Band` existed. Closed 2026-09-05 to 76 px against 60
> (`VSC` 0.88 / 1.15), which takes that gate to 0 and the air group's spread
> from 1.835 to 1.405. It stops there, not at the RA2-correct 62/69, because
> `peerVsSelf.air` binds first: the two masks are alike enough that once
> their sizes converge the Nighthawk beats the Harrier's own rotations. The
> spread's arithmetic floor is 1.190, the Hornet:Kirov ratio.

> **Two ratios CORRECTED 2026-09-06, and both were above RA2's own.** The
> Destroyer's row read *"length >= 1.7x any land vehicle"* and the MCV's
> *">= 1.20x the widest tank"*. Neither number came off RA2; both are above it,
> and the numbers that disprove them are in §1.1 and in the second column of
> the two rows themselves.
>
> * **Destroyer.** `[DEST]` is 101 px and the widest land vehicle in §1.1 is
>   `[AMCV]` at 69 px, so **RA2's own ratio is 1.46**. The row asked for 16%
>   more separation than the game it cites, which made it unclosable by
>   fidelity — reachable only by drawing a fleet RA2 does not have. Corrected
>   to 1.46, **and it is still UNMET at 0.848**, because the real defect is the
>   SIGN: our Destroyer is shorter than our MCV. That 0.848 is exactly
>   `1.46 x (naval bake scale 0.881 / MCV bake scale 1.522)` to four decimals,
>   i.e. the clause is a pure CROSS-GROUP SCALE probe, and the thing that
>   actually holds it is `size.crossGroupSpread`. Correcting the threshold
>   closes nothing and is not meant to.
> * **MCV.** `[AMCV]` is 69 px and RA2's widest tank is 59 (`[MTNK]`, `[RTNK]`
>   and `[SREF]` all tie there), so **RA2's own ratio is 1.17**. Corrected, and
>   **still UNMET at 1.154** — 0.987 of RA2's own. The residual is not a
>   statement about the MCV: it equals `mcvScale / prismScale`, the two most
>   oversized vehicles on the board (+19.8% and +21.5% of the vehicle group
>   scale) measured against each other.
>
> Both ceilings were MEASURED rather than argued and are written up in
> `per-unit-art-log.md`. A row stating a ratio above RA2's own is the one kind
> of clause that punishes fidelity, which is why these thresholds are now
> DERIVED from §1.1's bboxes inside the check instead of written as literals.
>
> **The Chrono Miner's `height <= 0.55 x length` was NOT changed.** It was
> being measured at a bearing where height-over-length does not exist; 0.55
> stands and the unit meets it at 0.522. Same file.

### 2.4 Collective vehicles and aircraft

| our unit | RA2 counterpart | the ONE silhouette feature | size class | pixel budget |
|---|---|---|---|---|
| `rhino` Rhino Tank | `[HTNK]`, 56x28, 886 body px | A thicker, shorter gun than the Grizzly's on a **taller** hull, and **five** house blocks (three flank panels + two turret cheeks) against the Grizzly's two. | M | hull height >= 1.25x the Grizzly's; 5 discrete house blocks, each 4-6 px, gaps >= 3 px; gun >= 1.6x the Grizzly's barrel thickness |
| `mammoth` Apocalypse | `[MTNK]`, 59x34 | **Four house-coloured canister drums stacked 2x2 on the rear deck**, plus **twin** barrels — the only two-barrelled thing on the field. | M, heaviest | each canister >= 6x6 px and individually countable (gaps >= 2 px); twin barrels >= 19 px, visibly two, tapering |
| `teslatank` Tesla Tank | `[TTNK]`, 52x37 | **Two coil columns standing above the deck with an arc between them** — the only paired vertical masts on a hull. | M | each column >= 9 px tall x 3 px wide; gap between them >= 5 px so the pair reads as two |
| `v3` V3 Launcher | `[V3]`, **63x36** — the longest land vehicle | **A white missile on a rail overhanging both ends of its truck**, with a red nose cone and red tail fins and nothing else coloured. | L | missile >= 1.10x the truck length, overhanging >= 5 px at the nose; nose cone and fins in house hue, midbody pure white |
| `flaktrack` Flak Track | `[HTK]`, **45x45**, aspect **1.00** | **The only square vehicle** — a short open-bed halftrack with a gun raised off the bed. | S | ~~body aspect 0.95-1.10~~ (**waived 2026-09-07 against a measured decision, see below**); gun raised >= 10 px above the bed line |
| `warminer` War Miner | `[HARV]`, 56x48 | **A harvester with a turret** — the bin plus a small gun; the tallest non-MCV Collective vehicle. | M | turret >= 6x6 px on the bin's shoulder; bin >= 35% of body px |
| `drone` Terror Drone | `[DRON]`, **21x14**, 89 body px, `Voxel=no` | **Four splayed blade legs round a tiny core** — an insect. The smallest thing on the field, 38.7% house on the core. | XS, smallest | total <= 0.55x the smallest tank; legs >= 4 px reach beyond the core, tapered blades not wires; core in house hue |
| `apc` Amphibious Transport | `[SAPC]` | **An open-topped hovercraft** — a fat inflatable skirt round a red (house) inner deck with visible seat blocks. | M | skirt a continuous rounded band round the whole hull; deck cavity visible as a house-hued interior |
| `kirov` Kirov Airship | `[ZEP]`, **139x62**, **no `Remapable` key** | **Mass** — 2.2x the Harrier's span and the largest airframe in the game, a cigar envelope with structural hoops, a hanging gondola and a painted shark mouth. Its identity is deliberately not colour. | XL | span >= 2.0x the Harrier's *on screen*; gondola visibly separated below the envelope by >= 4 px; the existing 1.3x draw scale (`rts.html:29398`) is a symptom of the bake being too small |
| `sub` Typhoon Attack Sub | `[SUB]`, 75x**14**, aspect **5.36** | **The flattest hull afloat** — a long low deck with a conning tower; submerged most of the time. | L | height <= 0.20 x length; conning tower the only vertical mass |
| `seascorp` Sea Scorpion | `[HYD]`, 59x32 | **A small hull with a flak gun** — the fleet's smallest armed ship, the same gun read as the Flak Track. | M | shortest armed hull afloat; gun matches the Flak Track's silhouette |
| `dread` Dreadnought | `[DRED]`, 133x45 | **Two big missile boxes standing on the deck** — the V3's silhouette logic at capital-ship scale. | XL | two launch boxes >= 10x10 px, countable, standing proud of the deck |
| `squid` Giant Squid | `[SQD]`, 117x30, `Voxel=no` | **Tentacles** — a long soft mass with no hull line at all; the only unit whose outline is not a machine. | XL | zero straight edges; >= 4 tentacles resolvable at 3 px each |
| `mcv` MCV (shared) | `[SMCV]` | as §2.3; the Soviet body is chunkier and reads 23.5% house against the Allied 21.0% | L | |

> **The Flak Track's waived clause (2026-09-07).** *"body aspect 0.95-1.10"*
> measures **0.878** and is left there **knowingly**, because closing it means
> undoing a decision this project already made on evidence. There are exactly
> two routes to 0.95 and both were measured:
>
> * **Lower the jib.** The near-vertical barrel is what makes the sprite tall,
>   and `per-unit-art-log.md` records under "Looked at, and deliberately LEFT
>   ALONE" that *"a shallower jib left its crown the same fat box the IFV wears
>   — the two lightest vehicles in the game, and the pair the gate scored at
>   0.709"*. `rts.html`'s own Flak Track block repeats it. Shortening the barrel
>   to `ky-15.6` does reach aspect **0.956** — and it is the reverted change.
> * **Grow the footprint, jib untouched.** This route is new and was never tried
>   by the passes that recorded the decision: at `len` 23->28 / `wid` 15->18 the
>   sprite goes 43x49 -> 47x49 and the aspect reaches **0.959** with the gun
>   exactly as drawn. It also improves the unit's worst-in-group size deviation
>   (-0.2474, which is 0.0026 from tripping `size.vehicleOutsideRA2Band`). It
>   was still **reverted**: it takes `flaktrack | ifv` from **0.6088 to 0.6817**
>   and `iou.groundCombat.mean` from **0.4667 to 0.4777**.
>
> So both routes fail into the same place — the IFV — which is the point. The
> Flak Track and the IFV are the two lightest vehicles on the field, and the
> only thing separating their masks is that one of them is tall and narrow.
> The clause asks for exactly the property that separation is bought with.
> It is waived, not ignored: the unit is still inside `art-metrics`' own +-20%
> RA2 aspect band (0.878 = 0.878 of `[HTK]`'s 1.00) and
> `aspect.vehicleOutsideRA2Band` stays 0. Working: `per-unit-art-log.md`.

---

### 2.5 Structures — the scale these budgets are on, and what a check can reach

Everything above is a UNIT. Until this pass **§2 stated no identity feature and
no pixel budget for a single structure**, which is why building identity was
never measured: `size.bld*` (added 2026-09-05) keeps a structure's SIZE against
RA2's own sprite, but size is not identity, and nothing said what a Refinery has
to LOOK like. The rows in §2.6-2.8 close that.

**The roster is the `BLDS` map** (`apps/games/rts/rts.html:2020-2320`). Where
RA2's two houses build different buildings for the same slot the row names both;
where our `byFac` gives them different `Foundation=` the row says so, because
`art-metrics.js` measures each faction's sprite against ITS OWN diamond.

**Size class** is two facts, both from RA2 and neither from us:

* **`Foundation=`**, per faction, out of `/tmp/RA2inis/art.ini`.
* a **profile class** from RA2's own sprite height over its footprint-diamond
  height (`RA2_BLD` in `tools/art-metrics.js`, which is where the measurement
  and its provenance live): **LOW** < 1.35, **BLOCK** 1.35-2.0, **TALL**
  2.0-3.0, **SPIRE** >= 3.0. The fifteen measured structures fall 5 / 5 / 3 / 2
  across those bands, so the classes separate rather than bunch.

**Do not read the profile class as a target for our own raw ratio.** Our
structures bake at a house scale of **1.148** of RA2's height-over-footprint
(`bldSummary.houseScaleH`), so eight of the fifteen sit one band above their
RA2 class purely from that. What is owed is the *deviation from the group's own
median scale*, which is what `size.bldWorstOffHouseScale` already gates. A row
below that says "TALL" is telling you the shape of the thing, not handing you a
number to hit.

#### The five primitives the budgets are written in

So that a clause is checkable rather than admirable. All five are already
computable from what `pageExtract` bakes, or are one field away from it (see
"What a check cannot reach yet" below).

| term | means |
|---|---|
| **sprite** | the structure's IDLE frame `A.s` and its opaque bbox `Sw x Sh` — exactly the `blds` record `art-metrics.js` already builds. RA2's side is frame 0, for the reason `RA2_BLD` gives at length |
| **diamond** | the footprint plot at `zoom = 1`: `Fw = (gw+gh)*32`, `Fh = (gw+gh)*16` on our 64x32 cell. Both games derive it from the same `Foundation=`, which is what makes it the unit of comparison |
| **row / col profile** | `rowProfile` / `colProfile` of the sprite mask — already in `art-metrics.js` and already used by `spikeOf` |
| **crown** | everything above the highest row whose width is >= 55% of the sprite's widest row. This is §1.3's own body/spike split turned on its side, and it is what separates a mast, a dish or a statue from the block under it |
| **house fraction** | §1.4's census (HSV `s > 0.40`, hue within +-22 deg of the owner) over the sprite's own opaque pixels |

#### A width clause may state a FLOOR and must not state a ceiling

Our `plot()` paints the cells a structure owns, so our width-over-footprint is
**0.727-1.193 and sits at ~1.02 for eleven of the fifteen**, while RA2's art
underfills its diamond by a per-building margin and runs **0.692-0.975**. The
convention therefore only ever pushes our sprites WIDER than RA2's. That has a
consequence for how a budget may be phrased, and it is the reason this section
does not simply gate sprite aspect:

* `w/h >= X` is safe — the convention can only help us pass it, so a failure is
  the art.
* `w/h <= X` is not — the convention alone can fail a correctly drawn tower.

Measured, so the point is not theoretical. Ranking all fifteen by our sprite
aspect against RA2's gives deviations from **-10.4%** (`radar:col`) to
**+27.4%** (`reactor:col`), and the four worst — `reactor:col` +27.4%,
`tesla:col` +25.5%, `lab:col` +25.3%, `lab:dir` +18.1% — are exactly the four
whose RA2 counterpart underfills its diamond hardest in width (`ra2WOverFoot`
0.692, 0.700, 0.844, 0.800 against a roster median of 0.850). An aspect gate at
the `RA2_BLD_BAND` of 0.20 would fail those four, and it would be failing them
for RA2's underfill, not for our drawing. This is the same trap already recorded
against `wScale` in `docs/design-decisions.md` ("Buildings were drawn ~1.15x
RA2"), reached from the other end, and it is why the towers below are specified
by their CROWN geometry rather than by their outline.

#### What the reference set actually is

Fifteen structures measured off RA2's own 1:1 sprites, committed in
`docs/ra2-ref/sprites/buildings/` (four blue-chroma-key SHP renders, eleven
native in-game captures), plus 74 cameo plates in `docs/ra2-ref/cameos/`, plus
RA2's own `art.ini`/`rules.ini`. Every sprite in that directory was opened and
looked at for this pass; the readings below are of those images.

**The standing rule that shapes every row: a cameo is not a sprite.** Plates are
painted hero shots — read them for composition and for the identifying feature,
never for proportion. This project has recorded three near-misses from reading
proportion off a plate (the Psychic Sensor, the Grand Cannon, the Spy), and the
Grand Cannon is the case where the sprite and the plate flatly disagree: the
plate shows a long barrel, the sprite a SHORT thick one, and lengthening ours to
match the plate would have been the error. So where a row's only evidence is a
plate, its budget is a COUNT and a contrast floor, never a fraction, and the row
says so.

#### The rips our own code cites are real — nine of them cross-check

`rts.html`'s building blocks cite rip filenames that are **not in the repo**
(`allied-battle-lab-idle.png`, `soviet-service-depot-idle.png`, ...), and
`docs/ra2-ref/sprites/README.md` records that as a measurement nobody can
re-check. Nine of them can now be cross-checked against the committed corpus,
because both describe the same sprite:

| RA2 section | the rip `rts.html` cites | its w/h | the committed sprite | its w/h | delta |
|---|---|---|---|---|---|
| `[NANRCT]` | `soviet-nuclear-reactor-idle.png` 166x129 | 1.287 | `nuclear-reactor.gif` 166x129 | 1.287 | **0.0%** |
| `[GTGCAN]` | `allied-grand-cannon.png` 181x133 | 1.361 | `grand-cannon.png` 117x85 | 1.376 | -1.1% |
| `[NADEPT]` | `soviet-service-depot-idle.png` 160x147 | 1.088 | `soviet-service-depot.gif` 161x146 | 1.103 | -1.3% |
| `[GATECH]` | `allied-battle-lab-idle.png` 118x213 | 0.554 | `allied-battle-lab.gif` 120x213 | 0.563 | -1.7% |
| `[NATECH]` | `soviet-battle-lab-idle.png` 148x167 | 0.886 | `soviet-battle-lab.gif` 152x168 | 0.905 | -2.0% |
| `[GAPOWR]` | `allied-power-plant.png` 84x89 | 0.944 | `allied-power-plant.png` 86x93 | 0.925 | +2.1% |
| `[NATSLA]` | `Tesla coil animation 2.gif` 41x82 | 0.500 | `tesla-coil.gif` 42x81 | 0.519 | -3.6% |
| `[GAPRIS]` | `allied-prism-tower-anim-last.png` 53x101 | 0.525 | `prism-tower.png` 57x104 | 0.548 | -4.3% |
| `[NARADR]` | `soviet-radar-tower-idle.png` 90x125 | 0.720 | `soviet-radar-tower.png` 103x136 | 0.757 | -4.9% |

**Max deviation 4.9%, median 2.0%, and one exact.** Eight of the nine are
NEGATIVE by 1-5%, which is a systematic offset and not noise: the code's rips
were measured with the SHP shadow index masked off, and the committed captures
include the building's own ground bib. That is a coherent bbox convention
difference of the size you would predict, on nine independent files.

So the class of citation is validated at about +-5%, and the rows below are
allowed to source a feature from a cited-but-absent rip **where the number is a
count or a shape rather than a tight fraction**, saying each time that that is
what it rests on. It is a weaker source than a committed sprite and it is
labelled as one. It does not become a substitute for fetching the file.

#### Two reference rules the sprites gave up

**Rule S1 — house colour scales INVERSELY with footprint.** Measured with
§1.4's own census on the four blue-key structures, where the mask is exact and
the owner is red:

| structure | Foundation | house fraction |
|---|---|---|
| `[NATSLA]` Tesla Coil | 1x1 | **39.6%** |
| `[GAPRIS]` Prism Tower | 1x1 | 15.0% |
| `[NACNST]` Soviet Construction Yard | 4x4 | 14.8% |
| `[GACNST]` Allied Construction Yard | 4x4 | **9.5%** |

A 1x1 defence carries up to four times the house fraction of a 4x4 production
block, which is the opposite of the intuition that a bigger building shows more
team paint. It follows from what the paint is FOR: on a one-cell tower the
house-coloured buttresses ARE the silhouette, while on a four-cell hall the
paint is trim on a shape that is already unmistakable. Both of our own
building-art passes reached the same place from the drawing side —
`rts.html`'s Construction Yard block states "the ONLY saturated hue on either
sprite is `col`" and its Nuclear Reactor block records the reference reading
**8%** and deliberately declines to paint the towers.

**Rule S2 — the ONE feature is a CROWN, not an outline.** Every structure whose
identity survived a squint in this pass carries it above the block: three
capacitor towers, two smokestacks, four antenna masts, an onion dome, a statue,
a dish, a sphere, three cooling towers, a crane. Not one of the fifteen is told
apart by the shape of its base, and this is the structural difference from
§1.2's finding for vehicles, where the whole outline carries the read. It is
also why a budget below is nearly always "the crown is N things of size M
clearing the roofline by K", and why `size.bld*`'s single height number could
never have caught a mis-drawn building on its own.

#### What a check cannot reach yet — say so rather than let it drift

`pageExtract` stores a structure as
`{ key, fac, name, cat, gw, gh, w, h, edges }` (`tools/art-metrics.js:790`).
**There is no mask and no rgba**, where a unit record carries both. So of the
budgets written below:

* clauses on **bbox, aspect, footprint and clipping** are checkable today;
* clauses on **counts, crowns, gaps, profiles and house fraction** — which is
  most of them, because Rule S2 says that is where identity lives — need the
  `blds` record to carry `mask` and `rgba` the way `recs` does. That is a
  four-line change to the push in `pageExtract` plus a `byBldFac(key, fac)`
  helper on the clause-check `ctx`, and it is not made here: **this pass writes
  the reference and touches no art and no tool.**

Until that lands these rows are **stated and unchecked**, exactly as all 96 unit
clauses were before `tools/clause-checks/` existed. They are deliberately NOT
counted in `clause.checked`, and §2.6-2.8 are NOT in the 96 — see
`docs/clause-inventory.md`, which explains why adding them to that number would
be a false green.

### 2.6 Production and economy structures

Size class is `Foundation=` (per faction) and RA2's own profile band, per §2.5.
`Sw` / `Sh` are the sprite's own bbox; every fraction below is a fraction of
those, so nothing here moves when the zoom or the cell size does.

| our structure | RA2 counterpart | the ONE silhouette feature | size class | pixel budget |
|---|---|---|---|---|
| `base` Construction Yard | `[GACNST]` 4x4, 213x137 · `[NACNST]` 4x4, 204x153 — both blue-key SHP, frame 0 | **The broadest, flattest thing you own, with ONE crane over a marked apron.** Directorate: an orange gantry and claw on a red-capped turntable beside a ribbed silver hall. Collective: two red booms and a bell spire over a limestone portal. | 4x4 · LOW (1.14 / 1.28) | sprite `w/h >= 1.30` — the widest-aspect structure in the game, ahead of the Grand Cannon's 1.376 (measured 1.555 / 1.333; stated as a floor per §2.5's width rule); exactly ONE crane/boom group above the hall roofline, its jib >= 3 px thick and clearing the roof by >= 0.10 `Sh` — a second mast group is the Battle Lab's read and must not appear here; house fraction 9-16% (measured 9.5% / 14.8%), trim only, never the hall roof |
| `power` Power Plant · Tesla Reactor | `[GAPOWR]` 2x2, 86x93 (native capture) · `[NAPOWR]` 3x2, `Height=3`, **no committed sprite** | Directorate: **three separate capped towers round a glowing copper basin**, and no chimney anywhere on it. Collective: a pale glass orb cradled between two rough masonry masses. | dir 2x2 · BLOCK (1.55) · col 3x2 | exactly **3** towers, each 0.18-0.22 `Sw` (measured 16-18 px on 86); the tallest crown clears the drum roofline by >= 0.45 `Sh` (measured: crown y=2 against roofline y≈45 of 93); each tower carries a lit slit >= 2 px wide at >= 25% value contrast (the §2 floor); **zero** chimneys — a chimney is the Refinery's read; Collective: exactly ONE orb held between exactly TWO masses, and **no fraction is stated** — the only evidence is `rts.html:13714`'s own 1:1 reading of `soviet-tesla-reactor-anim-last.png` (113x94), a rip not in the repo |
| `refinery` Ore Refinery | `[GAREFN]` 4x3, 169x132 (native capture) · `[NAREFN]` 4x3, `Height=6`, **no committed sprite** | **Two capped smokestacks over a ribbed barrel vault, with an open unloading dock at ground level.** The stacks are the whole read against the War Factory, which shares the vault and has none. | 4x3 · LOW (1.26) | exactly **2** stacks with a clear gap >= 0.08 `Sw` between them (measured: x 35..57 and 72..96 of 169, gap 15 px = 0.089); each stack 0.12-0.15 `Sw` (measured 22-24 px); the taller clears the vault crown by >= 0.30 `Sh` (measured: y=4 against crown y≈50 of 132); an unroofed dock plane at ground level where the harvester parks, its marking at >= 25% contrast |
| `barracks` Barracks | `[GAPILE]` 3x2, `Height=4` — the committed `allied-barracks.png` is a **13,646-colour resample**, usable for SHAPE only · `[NAHAND]` 2x2, native capture, **but see the bbox warning below** | Directorate: **two ribbed Quonset barrels side by side in echelon**, dark arched mouths, and a short domed watch drum with a flag. Collective: **the statue IS the building** — a saluting conscript over a plinth. | dir 3x2 · col 2x2 · SPIRE | Directorate: exactly **2** barrels, parallel and staggered so both mouths are visible; each mouth a dark arch >= 2 px across at >= 25% contrast; the watch drum a mast and not a spire — its crown no higher than the barrels', so the sprite stays wide (**no fraction is stated**: the only image is a resample); Collective: the figure's crown clears the plinth by >= 0.55 `Sh` (measured 158 px of a re-read 163 — see below); house colour on the plinth panels and the hammer-and-sickle only, never on the figure |
| `factory` War Factory | `[GAWEAP]` 5x3, 207x155 (native capture) · `[NAWEAP]` 5x3, `Height=6`, no committed sprite | **The longest hall in the game, with a hazard-striped exit ramp and rails running out of its mouth** and one flag at the back corner. No stacks — that is the read against the Refinery, which shares the vault. | 5x3 · LOW (1.29) | sprite `w/h >= 1.25` (measured 1.335; a floor); an exit-ramp plane leaving the hall mouth and crossing the diamond edge, >= 0.15 `Sw` long, striped at >= 25% contrast; exactly **zero** smokestacks; exactly ONE flag/mast group |
| `shipyard` Naval Yard | `[NAYARD]` 4x4, 176x200 (native capture) · `[GAYARD]` 4x4, `Height=10`, no committed sprite | **The crane is the tallest thing on the rig** — a yellow lattice jib with a hanging hook over a decked pontoon standing on piles in open water. | 4x4 · BLOCK (1.67) | the jib is the topmost mass and its tip lies within the top 0.10 `Sh` (measured y≈8 of ~192); the jib overhangs the deck horizontally so the hook hangs clear of it (measured: hook x≈205 against a deck edge at x≈200); the deck stands on visible piles with water beneath — `[NAYARD] WaterBound=yes`, and our own `water: true` places it the same way; house colour on the deck kerb and the hut roofs, not on the crane |
| `depot` Service Depot | `[NADEPT]` 4x3, 161x146 (native capture) · `[GADEPT]` 3x3, `Height=3`; `rts.html:16726` cites `allied-service-depot-idle.png` 140x87 | **The empty pad** — most of the plot is flat hazard-striped hardstanding with nothing standing on it, because a vehicle parks there, and a crane swings a hook over it. | col 4x3 · BLOCK (1.39) · dir 3x3 | a flat pad >= 0.50 `Sw` wide carrying **zero** mass above the ground plane (measured on `[NADEPT]`: the pad octagon runs x≈62..160 of 161 = 0.61 `Sw`, and over those columns the sprite is a thin ground band only); the pad's hazard marking at >= 25% contrast; exactly ONE crane/gantry group with its jib tip horizontally over the pad; the works confined to the remaining <= 0.50 `Sw` |
| `radar` Radar Tower | `[NARADR]` 2x2, 103x136 (native capture, tight) — Collective only; `radar:dir` bakes but is never drawn | **The dish IS the building** — one big round ribbed parabolic face with a domed hub, sitting almost on a squat camouflage mound. | 2x2 · TALL (2.27) | dish >= 0.55 `Sw` and essentially circular, aspect 0.90-1.10 (measured x 26..83 by y 3..55 = 58x53 on 103x136 → 0.563 `Sw`, aspect 1.09); the dish lies **wholly inside the top 45% of `Sh`** (measured y 3..55 = 2%-40%); >= 3 ribs resolvable at 2 px each at >= 25% contrast; house colour on the ring collar, the wedge blocks and the hub crescent — never on the dish face. *The two readings of this dish disagree and the floor is set to satisfy both: 0.563 on the committed capture, 0.69 on the 90x125 rip `rts.html:18169` cites.* |
| `airforce` Airforce Command | `[GAAIRC]` 3x2, `Height=7` — Directorate only. **No committed sprite**; evidence is `cameos/airforce.png` and `rts.html:16440`'s reading of a 137x149 rip | **A lattice control tower beside a flat helipad** — a slim framework mast with a lit cab and a scanner coil, over a pale apron quartered by an aviation-yellow cross. | 3x2 | exactly ONE tower group whose crown clears the block roofline and is the topmost mass; a helipad plane carrying a cross marking at >= 25% contrast and **four** pad quadrants (our `makes: 'a'` parks four Harriers on it); **zero** dish bowls standing proud of the roof — RA2's dish lies FACE-UP on the deck, and that is the read against the Radar Tower. Counts and contrast only; **no fraction is stated** because neither source may carry one |
| `lab` Battle Lab | `[GATECH]` 3x2, 120x213 · `[NATECH]` 3x3, 152x168 — both native captures | Directorate: **four bare whip antennas over a stack of drums** — RA2's tallest structure, and the only one whose crown is a thicket of 1-2 px verticals. Collective: **the onion dome**, gilded, on a red-banded masonry block. | dir 3x2 · TALL (2.84) · col 3x3 · BLOCK (1.87) | Directorate: >= **4** masts, each 2-4 px thick at >= 25% contrast, tips clearing the highest drum rim by >= 0.20 `Sh` (measured: tips y 8/18/33/47 against a rim at y≈52, on 213 → 0.207); the drum stack, not the mast cluster, is the widest mass; Collective: exactly ONE dome, its bulb >= 0.20 `Sw` (measured x 62..96 = 34 px on 152 → 0.224), the dome-and-drum crown occupying the top >= 0.40 `Sh` above the block's corner turrets (measured y 8..78 of 168 → 0.42); the dome is the **topmost mass** — zero antennas above it, which is the read against the Allied lab |
| `reactor` Nuclear Reactor | `[NANRCT]` 4x4, 166x129 (native capture) — Collective only | **Three waisted cooling towers with open tops**, and a red-banded vessel between them with black ducts diving into each. | 4x4 · **LOW (1.075)** — the lowest-profile structure in RA2, despite being the Collective's biggest | exactly **3** towers, each with a visible **waist** <= 0.75 of its own rim width (measured on the back tower: rim ≈48 px, waist ≈34 px → 0.71) and each flaring below the waist to a foot wider than its rim; the tallest tower's crown inside the top 0.10 `Sh` (measured y≈8 of 129 → 0.06); >= 3 ducts resolvable at 2 px linking vessel to towers; house fraction LOW — the reference reads **8%** (`rts.html:18483`), so the paint is the vessel bands, the rim beacons and one riser per tower, never the brick |
| `purifier` Ore Purifier | `[GAOREP]` 3x3, `Height=4` — Directorate only. **No committed sprite**; evidence is `cameos/purifier.png` and `rts.html:17752`'s reading of a 127x105 rip | **A wedding-cake smelter with a recessed ring of glowing molten ore** turning inside a broad fluted drum, under a dark scalloped chute. | 3x3 | exactly ONE lit ring, unbroken round the drum, at >= 25% value over the drum body — it is the only structure in the roster whose identity is a light source rather than a shape; the drum the widest mass; a chute or headpiece above the drum crown. Counts and contrast only; **no fraction is stated** |
| `spysat` SpySat Uplink | `[GASPYSAT]` → `Image=GASPST`, 2x2, `Height=5` — Directorate only. **Plate only** (`cameos/spysat.png`); our code cites no rip | **A flat rectangular panel array, not a bowl** — a mesh slab tipped up on a mast beside a lattice tower. | 2x2 | the array has at least two parallel STRAIGHT edges and no circular rim — that is the whole read against the Radar Tower's bowl and the Airforce Command's face-up dish; exactly ONE array. Composition from the plate only, so **no fraction and no ratio is stated** |

> **A bbox warning on `[NAHAND]`, found while writing this row.** `RA2_BLD`
> records the Soviet Barracks as **117x205** and notes it as a tight crop. It is
> not one: `soviet-barracks.png` is a small SCENE, and 117x205 is the whole
> file. Looked at with candidate boxes drawn on it, the building runs about
> **x 15..100 by y 10..172 — roughly 86x163 (+-4 px)** — the rest is grass on
> the left, pavement on the right and about **36 rows of road below the base
> plate**. The image cannot be auto-segmented to settle it, because the statue's
> steel is the same value as the road; the sweep over six background tolerances
> collapses onto a 16x14 blob, so this is an eye measurement and is offered as
> one.
>
> **What it changes, if it holds.** `[NAHAND]`'s height over its footprint goes
> **3.417 -> ~2.72** and its width over footprint **0.975 -> ~0.72**. That
> matters because this row is the one that ACQUITTED our own Soviet Barracks:
> ours bakes 131x246 = 3.844 footprint-heights, which against 3.417 is an
> `hScale` of 1.125 and a deviation of **-0.020** from the group's median
> 1.148 — comfortably inside the band, and `RA2_BLD`'s own source note says
> "this is why ours at 3.84 footprint-heights was left alone". Against 2.72 the
> `hScale` is **~1.41** and the deviation **~+0.23**, which would make it the
> worst structure in the set and a second `size.bldOutsideRA2Band` failure
> beside `power:dir`.
>
> **It is deliberately NOT fixed here.** This pass writes the reference and
> changes no art and no tool, so every metric stays byte-identical; editing
> `RA2_BLD` would move `size.bldOutsideRA2Band` and `size.bldWorstOffHouseScale`
> in the same commit that writes the rows. The right next step is to re-crop the
> file to the building, commit the crop beside the scene, and re-measure — and
> to check the other "whole file" entries the same way. Two were checked while
> here and are sound: `[GAPOWR]` (86x93) and `[NARADR]` (103x136) really do fill
> their files, and `[NAYARD]`'s hand-adjusted 176x200 measures ~185x192 on the
> grid, inside 5%.

### 2.7 Base defences

RA2 orders these by `Height=` in `art.ini` and the order is the cheapest true
thing available about them: **Pillbox 1 · Sentry Gun 2 · Patriot 3 · Flak Cannon
4 · Tesla Coil 5 · Prism Tower 6 · Gap Generator 6**, against a Construction
Yard's 4. Per `RA2_BLD`'s own note it is an ORDERING and never a pixel budget —
rise per `Height` cell measures 4.25 px on `[GACNST]` and 12.3 px on `[GAPRIS]`
— so where a row below has no sprite it states the ordering and stops.

| our structure | RA2 counterpart | the ONE silhouette feature | size class | pixel budget |
|---|---|---|---|---|
| `sentry` Pillbox | `[GAPILL]` 1x1, **`Height=1`** — the flattest structure in RA2. Plate + `rts.html:16093`'s reading of a 48x29 rip | **A flat lid on a mound with one bright plate and a house lens dead centre** — no drum, no barrel stub, and the lowest crown of anything you can build. | 1x1 · flattest | height over footprint strictly BELOW the Sentry Gun's, which `art.ini` ranks 1 against 2 (ours holds it: 1.281 against 2.156); exactly ONE bright plate, with the house lens centred on it and the lens the sprite's only saturated pixels; **zero** vertical mast and zero enclosing drum |
| `sentrygun` Sentry Gun | `[NALASR]` 1x1, `Height=2`. Plate + `rts.html:18765`'s reading of a 41x40 rip | **An OPEN machine, not a bunker** — two long thin barrels raised steeply off a small receiver on splayed legs, and the barrels are the top of the silhouette. | 1x1 | exactly **2** barrels, resolvable as two at 2 px each with a gap >= 2 px between them, and they are the topmost mass; **zero** enclosing drum or roof; the legs visible as separate members under the receiver. Counts only |
| `tesla` Tesla Coil | `[NATSLA]` 1x1, **42x81**, blue-key SHP frame 0 — an EXACT mask | **A pale sphere on a pinched neck.** The electrode ball rides a coil column that narrows almost to nothing under it, over splayed house-coloured buttresses. | 1x1 · TALL (2.70) | the sphere a single blob >= 0.45 `Sw` and >= 0.20 `Sh` (measured 20x19 on 42x81 → 0.476 / 0.235); **a neck beneath it pinching to <= 0.10 `Sw`** — measured **3 px = 0.071**, a 6.7x pinch off the sphere, and this is the entire silhouette; the widest row in the bottom third and >= 0.85 `Sw` (measured 38 px at row 68 of 81 → 0.905); house fraction ~40% (measured **39.6%** by §1.4's census), carried by the buttresses |
| `prism` Prism Tower | `[GAPRIS]` 1x1, **57x104**, blue-key SHP frame 0 — an EXACT mask | **A wide flat crown of blades over a pinched column** — the anti-Tesla. Where the Coil's crown is a compact ball, the Tower's is an umbrella. | 1x1 · SPIRE (3.47) | the crown >= 0.55 `Sw` at its widest and >= 0.22 `Sh` deep (measured 35 px wide at row 15, 28 rows deep, on 57x104 → 0.614 / 0.269); a waist beneath it <= 0.25 `Sw` (measured 12 px → 0.211); **the crown fraction >= 1.25x the Tesla Coil's sphere fraction** so the two 1x1 towers cannot converge (measured 0.614 against 0.476 = 1.29); house fraction ~15% (measured **15.0%**), on the drum panel and the shoulder wedges |
| `patriot` Patriot Missile | `[NASAM]` 1x1, `Height=3`. Plate + `rts.html:18864`'s reading of a 44x55 rip | **A block of four tube mouths standing on a house torus** — taller than wide, the dark mouths facing out over a bright ring at the foot. | 1x1 | exactly **4** tube mouths, countable, each a dark disc >= 2 px at >= 25% contrast; one continuous house torus round the foot; the sprite taller than wide. Counts only |
| `flakcannon` Flak Cannon | `[NAFLAK]` 1x1, `Height=4` — the tallest of the four 1x1 gun defences. Plate + `rts.html:18972`'s reading of a 53x68 rip | **One long pale barrel raised steeply**, the top of the silhouette, on a compact cross of short legs. | 1x1 | exactly **1** barrel — the Sentry Gun's two is the read against it — >= 2 px thick at >= 25% contrast and the topmost mass; the legs compact enough that the sprite is taller than wide; the `Height=` ordering holds against the Sentry Gun (4 against 2) and the Pillbox (4 against 1) |
| `grandcannon` Grand Cannon | `[GTGCAN]` 2x2, **117x85**, native capture, verified by eye in `sprites/README.md` | **A fat armoured dome on a three-armed turntable, with a SHORT thick gun off its shoulder** — and the gun being short is the whole point of the row. | 2x2 · BLOCK (1.42) | sprite `w/h >= 1.30` (measured 1.376; a floor); the gun contributes <= **0.30 `Sw`** of tube beyond the dome (measured: dome to x≈85, muzzle to x≈112 of 117 → 0.23) — **this is the clause the cameo would have got wrong**, because `cameos/grandcannon.png` shows a long barrel and `sprites/README.md` records that lengthening ours to match it would have been the error; exactly **3** outrigger arms ending in round pads with a bright boss (measured at x≈10, x≈105 and x≈57-front); the DOME is the tallest mass, not the gun (measured: dome top y=8 against the gun's y≈22) |
| `gapgen` Gap Generator | `[GAGAP]` 1x1, `Height=6`. Plate + `rts.html:19478`'s reading of a 118x130 rip — **and the two agree independently**, which is why this row is here at all | **A crown of four tall talons splaying up and outward** off a waisted column wearing two collar rings. | 1x1 | exactly **4** talons, countable, each 2 px at >= 25% contrast, splaying so the crown is wider at its top than the column beneath it; exactly **2** house collar rings and nothing else remapped — both sources say the collars are the only remap surface. Counts only |

### 2.8 Superweapons

| our structure | RA2 counterpart | the ONE silhouette feature | size class | pixel budget |
|---|---|---|---|---|
| `chrono` Chronosphere | `[GACSPH]` 4x3, `Height=3` — the LOWEST superweapon. Plate + `rts.html:19067`'s reading of a 178x109 rip | **One big ribbed hemispherical hood with a bright lens face** — a single dome, and the only superweapon whose crown is lower than its plot is wide. | 4x3 | exactly ONE dome; ribs resolvable at 2 px at >= 25% contrast; the lens the brightest patch on the sprite; the `Height=` ordering holds — lowest of the four, against Weather 5, Iron Curtain 6, Nuclear Silo 8. Counts and ordering only |
| `weather` Weather Control Device | `[GAWEAT]` → `Image=GAWETH`, 3x3, `Height=5`. Plate + `rts.html:19169`'s reading of a 146x135 rip | **A polished sphere on a pedestal flanked by two low domes** — three round masses, one high and two low. | 3x3 | exactly **3** round masses in a one-high-two-low arrangement; the sphere the topmost and the only one standing clear of the block; both domes visibly below the sphere's underside. Counts only |
| `curtain` Iron Curtain | `[NAIRON]` 3x3, `Height=6`. Plate + `rts.html:19290`'s reading of a 138x101 rip | **A red ring lying flat with an amber orb held in a cradle above it** — the only superweapon whose house colour is a whole structural member rather than trim. | 3x3 | exactly ONE ring, unbroken and horizontal, in house hue; exactly ONE orb held above it on visible arms; the ring's diameter greater than the orb's. Counts only |
| `nuke` Nuclear Missile Silo | `[NAMISL]` 3x3, **`Height=8`** — the tallest superweapon | **Clearance, not a tower.** `Height=8` is a missile's room to leave a silo that is mostly below grade; there is no drawn spire to match. | 3x3 | **this row deliberately states no feature budget.** `cameos/nuke.png` is a blurred upload with no resolvable feature, and `rts.html:19388` cites a 152x131 rip that is not in the repo, so nothing measurable can be sourced. What IS owed is the ordering: the silo must read taller than the Iron Curtain (8 against 6) and both taller than the Chronosphere (8 and 6 against 3) |

### 2.9 Structures deliberately left without a row

Fewer sourced rows beat a complete table of guesses, so these are named and the
reason is given rather than filled in.

* **`wall`, `gate`** — `[GAWALL]` / `[NAWALL]` / `[GAGATE_A]`. No committed
  sprite and no cameo plate; `rts.html:20024` cites `allied-wall.png` 42x43 and
  `soviet-wall.png` 35x38, neither in the repo. And a wall's identity is not a
  silhouette at all: it is the CHAIN (`Adjacent=8`, `Selectable=no`, and the
  four-bit connection mask `bakeWallSeg` bakes a frame per value of). A §2-shaped
  row would be the wrong shape of clause, not merely an unsourced one.
* **`psisensor` Psychic Sensor** — `[NAPSIS]` 2x2, `Height=8`. Plate only, with
  no rip cited in our own code, **and the Psychic Sensor is one of the three
  cases `docs/ra2-ref/sprites/README.md` records as a near-miss produced by
  reading proportion off a plate.** Writing a row here would be repeating the
  recorded mistake on the recorded example.
* **`cloningvats` Cloning Vats** — `[NACLON]` 2x2, `Height=6`. The only evidence
  is `cameos/cloningvats.png`, which is a blurred upload with no resolvable
  feature. There is nothing to state.
* **The neutral house** — the fourteen `neut: true` keys (`civflat` … `civbarn`,
  `oilderrick`, `hospital`, `airport`, `bhut`). No sprite, no cameo, and RA2's
  civilian set is 155 `CanBeOccupied=yes` sections that our nine blocks stand in
  for rather than reproduce. There IS a measurement waiting here — `SPR.neut`
  bakes the Office Block at **89x143 on a 1x1 plot, 4.47 footprint-heights, the
  most vertical thing on the board** — but a height with no counterpart is a
  number, not an identity, and this section is about identity.
* **The faction halves with no committed sprite** — `power:col`, `refinery:col`,
  `factory:col`, `shipyard:dir`, `depot:dir`. Each is named inside its shared
  row above with a feature statement and **no fraction**, for the reason §2.5
  gives. They are not separate omissions; they are rows whose second half is
  stated more weakly than its first, on purpose.

---

## 3. What our renderer would have to change — ranked by readability bought

These are **requirements**, not a plan. Ranked by how much each buys against
the model in §1.

**R1 — Guarantee the 2-px floor at `ZMIN`, or stop going below 1.0x.**
*Buys the most, because it silently voids everything below it.* RA2 authored
its spikes at a 2 px floor for a renderer that never scaled. We scale by
0.55, so an RA2-faithful 2 px barrel is 1.1 device px and disappears into a
bilinear smear — and every measurement, aspect check and hue census in the
roadmap was taken at 1:1, where the problem is invisible. Either (a) raise
`ZMIN` to ~0.85, or (b) author every identity spike at >= 3.6 px at zoom 1 so
it clears 2 px at `ZMIN`, or (c) bake a low-zoom sprite set with thickened
spikes. Until one of these holds, no other item on this list is verifiable in
play.

**R2 — Restore infantry house colour to RA2's 29-45%, on the torso.**
Our infantry sit at 12.5-19.1% (roadmap per-unit passes); RA2's sit at
14.3-47.9%, median ~29%, and it is the **torso as one block**. This is the
mechanism that separates seven units that share a silhouette (§1.2), so it is
worth more than any silhouette work on infantry. Tanya at 14.3% is RA2's
deliberate exception, not the rule.

**R3 — Break every vehicle's house colour back into 2-5 discrete blocks, sited
on the identity feature.** Rhino: five blocks (three flank + two turret
cheeks). Grizzly: two, with a gap. Apocalypse: the four canisters *are* the
house colour. This is a *placement* change, not a budget change — the totals
in the roadmap passes are already inside RA2's 12-27% vehicle range. See §4.

**R4 — Enforce the leg-zone / leg-split / prop triad on infantry (Rule 9).**
Specifically: GI legs olive vs Conscript legs tan (>= 20 hue-degrees apart);
Yuri and the Spy get an unbroken coat hem with no leg split; the Engineer's
body inverts to a light value; Tanya gets skin-toned limbs and a bright head.
Cheap, and it is what makes the "same blob" units readable.

**R5 — Audit every unit's spike against §1.3 and give each one a number.**
Every unit must have exactly one, it must clear the body outline, it must be
15-30% of the long axis, and no two units in the same faction may share both
size class and spike type. The pairs at risk on our roster are
Grizzly/Rhino (both "hull + barrel"), Mirage/Prism (both "housing on a deck"),
Chrono Miner/War Miner (both "bin on tracks"), and Harrier/Nighthawk (both
"airframe at altitude").

**R6 — Fix the mass hierarchy at the two ends.** RA2 spans 21 px to 143 px
(6.8x) with no bunching. Two of ours are known off: the Kirov is drawn at a
1.3x fudge factor (`rts.html:29398`) precisely because the bake is too small,
and the gap audit records it at aspect 0.73 head-on against RA2's 1.43. The
Terror Drone was cut to 26x17 in art pass 8 against RA2's measured **21x14**
(x 1.067 = 22x15), so it is still ~18% oversized and is the roster's floor; the
Kirov should be measured against 139x62 x 1.067 = **148x66** at zoom 1 and
baked at that size rather than scaled at draw time.

**R7 — Raise the owner colours' saturation, or accept a larger area.**
RA2's house hues are HSV s = 0.84-0.90; ours are s = 0.56-0.66. At equal area
we deliver roughly two-thirds the chroma signal, and the asymmetry is already
recorded as a measurement hazard in `docs/design-decisions.md` ("the blue is
saturated, the red is pale — the SAME sprite measures ~5-6 points higher for
the blue owner"). Either move `COL` toward RA2's saturation or budget more
area on infantry (R2) to compensate.

**R8 — Give the eight-facing problem the RA2 answer, which is that it has
none.** RA2's head-on facings collapse to 29-31 px blobs too (§1.6.3). This is
*not* a defect to chase; it is licence to spend nothing on it. Recorded here so
a future pass does not "fix" it.

**R9 — Make the cameo carry its share.** `art.ini` gives all but a couple of
these units an explicit `Cameo=` (and usually a second `AltCameo=` for the
veteran icon); the rest take the engine default. If our sidebar/build panel does not present a per-unit icon
at least as distinctive as the map sprite, we are asking the sprite to do a
job RA2 split across two surfaces.

---

## 4. The conflict: what the art passes deliberately reduced, and whether to walk it back

The roadmap's art pass 8 made four decisions that pull against §1. Taking them
one at a time, against the sprites rather than against the principle:

**4.1 "Segmented colour bands collapsed to one unbroken band."**
Grizzly: *"The three-segment house-colour skirt (a row of bus windows at 1:1)
became ONE unbroken band a flank."* Rhino: *"It carried remap in TWO rows down
each flank plus bulged coloured cheeks … one continuous band now."*
Apocalypse: *"The segmented colour band and the turret trim strips collapsed
into one unbroken skirt band."*

**Verdict: the diagnosis was right, the fix was wrong.** The sprites are
unambiguous — the RA2 Rhino carries **three discrete flank panels plus two
turret cheeks**, the RA2 Grizzly **two discrete panels with a gap**. RA2 is
segmented. What was actually wrong was that our segments were *evenly spaced
and evenly sized*, which is what made them read as bus windows; RA2's are
irregular, sited on plate boundaries, and separated by gaps wider than the
blocks. **Correct resolution: restore discreteness, keep the reduced total
area, and copy the sprite's block positions rather than distributing them.**
Rule 7 is why this matters — discrete blocks carry shape information that a
band does not.

**4.2 "Coloured turret cheeks reverted to hull value."**
Grizzly: *"the fully-coloured turret cheeks became one small remap panel set
back from the mantlet."* Rhino: *"the cheeks went back to hull value."*

**Verdict: over-corrected on the Rhino.** `soviet-rhino-tank.png` at 7x shows
**two red panels on the turret cheeks**, clearly. The Grizzly's blue sits on
the turret side too. Fully-coloured cheeks were too much; hull value is too
little. **Correct resolution: a cheek panel of 4-6 px on both, which is what
the sprite has.**

**4.3 "Owner hue driven into a common 12-18% band."**
`docs/design-decisions.md`: *"Target 12-18% of opaque pixels in `col`."*

**Verdict: right for vehicles and structures, wrong for infantry.** Measured,
RA2's vehicles run 11.5-27.1% (median ~19%) — our 10.5-22.6% is inside that.
RA2's infantry run 14.3-47.9% (median ~29%) — our 12.5-19.1% is roughly half.
The band was derived from structures, where it is correct (the same
design-decisions entry records that a 1x1 defence *cannot* wear as much as its
sprite does, for real denominator reasons), and then applied uniformly.
**Correct resolution: split the rule — structures and vehicles 12-20%,
infantry 28-42%, with Tanya-style heroes allowed to sit low deliberately.**

**4.4 "The only saturated red or blue on a sprite is the owner's colour."**

**Verdict: keep it, unchanged.** This one is *more* RA2-correct than RA2, and
the reason it was adopted — the user could not tell friend from foe — is a
real problem RA2 does not have to solve, because RA2 pairs a red house against
a blue house across a whole match rather than putting both on one screen with
fixed faction paint underneath. Nothing in §1 argues against it. Note only the
corollary the docs already record: the V3's white missile body, the Engineer's
white suit, the Grizzly's silver hull and the Chrono Miner's violet drum are
all *fixed neutral or off-axis* hues doing identity work, and that is
compatible.

### The bottom line on shape vs paint

The brief's expected answer was *"RA2 distinguishes by SHAPE not by paint, so
the fix is silhouette work rather than re-adding house colour."* **Measured,
that is half right, and the half it gets wrong is the half that matters
most for our current state.**

* For **vehicles, aircraft and ships** it is correct. Size class, aspect and
  one spike do the work; the house colour is 19% and could be removed
  entirely (the Kirov and the Hornet *have* no remap) without losing the unit.
  Our vehicle passes are therefore broadly right and need placement fixes
  (R3), not more paint.
* For **infantry** it is wrong. Seven of twelve RA2 infantry are the same black
  shape (§1.2, `analysis-infantry-silhouette-test.png`). RA2 tells them apart
  with a 2-3 zone colour layout in which the owner colour is 29-45% of the
  body — and our reduction to 12-19% removed the primary mechanism, not a
  loudness problem. Silhouette work on a 12x27 canvas cannot substitute; there
  is nowhere to put it.

So the resolution under a "true RA2" standard is **not symmetrical**: keep the
vehicle restraint and fix where its colour sits; reverse the infantry
reduction and fix what its colour zones say. And R1 sits above both, because a
renderer that scales RA2-scale art down to 0.59x is holding the art to a
standard the art was never designed for, and none of it can be judged until
that is settled.

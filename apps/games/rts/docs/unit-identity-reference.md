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
| | Apocalypse | `MTNK` | 56x41 | 1.37 |
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
| `lancer` Grizzly Tank | `[GTNK]`, 54x23, aspect **2.35** | **The flattest thing on the ground** — a 16-px-tall hull with a 13 px x 2 px gun barrel overhanging 24% of its length. Two discrete house panels (turret cheek, hull flank) with a gap between them. | M | hull height <= 0.45 x length; barrel >= 13 px x 2.2 px, entirely clear of the hull; exactly 2 house blocks, each 6-8 px, separated by >= 4 px |
| `ifv` IFV | `[FV]`, 50x45, aspect **1.11** | **Nearly square** — a tall boxy turret that is proportionally huge on a small wheeled body, and it swaps per passenger (`TurretCount=4`, art.ini:569). | S | body aspect 1.0-1.2; turret >= 45% of total height; four distinct turret models must be visually distinct at >= 8x8 px each |
| `mirage` Mirage Tank | `[RTNK]`, 59x39 | **A wide flat emitter housing over the deck and NO long gun** (a stub only) — the anti-Grizzly. Plus the tree-disguise state. | M | housing >= 60% of hull width, >= 6 px tall, sitting proud of the deck; gun stub <= 6 px (any longer and it reads as a Grizzly) |
| `prismtank` Prism Tank | `[SREF]`, 59x**43** | **The tallest tank profile** — an upright prism crystal block on a low box turret, the top 10 px of the silhouette. | M, tallest tank | crystal >= 10 px tall x >= 5 px wide, standing above the turret roof; total height >= 1.15x the Mirage's |
| `chronominer` Chrono Miner | `[CMIN]`, 55x28, aspect **1.96** | **A long low body with a ribbed chrono drum for a nose** (violet, fixed hue) and a big tan ore bin behind. No turret — that is the read against the War Miner. | M | height <= 0.55 x length; nose drum >= 8 px long, violet and unmistakably not house hue; zero turret mass |
| `nighthawk` Nighthawk | `[SHAD]`, 64x**21**, aspect **3.05** | **The flattest airframe** — two overlapping tandem rotor discs whose blades are 1-2 px lines spanning past the fuselage. | L | ~~rotor span >= 1.25x fuselage length~~ (**impossible with our blur disc, see below**); blades 2 px with >= 40% value contrast; fuselage height <= 0.35 x length |
| `harrier` Harrier | `[ORCA]`, 71x44 span | **A broad swept delta wing**, no rotor — the only fixed-wing Directorate airframe. Empty racks after firing are a second state. | L | wing span >= 1.5x fuselage width; wing >= 5 px chord at the root; nose cone >= 4 px |
| `hornet` Hornet | `[HORNET]`, 27x15, **not remapped** | **The smallest thing that flies** — half a Harrier. Identity is size, not detail. | XS | total span <= 0.45x the Harrier's; do not add detail it cannot carry |
| `mcv` MCV (shared) | `[AMCV]`, 69x47 | **The biggest ground vehicle that is not a ship** — a slab-sided works body, no weapon, no turret. | L | >= 1.20x the widest tank; zero barrel, zero turret ring |
| `destroyer` Destroyer | `[DEST]`, 101x41 | A long hull with a **forward gun turret and an aft helipad** (its Osprey). | XL | length >= 1.7x any land vehicle; one turret forward of amidships |
| `aegis` Aegis Cruiser | `[AEGIS]`, 91x35 | **A big flat-panel radar face and missile cells, no gun barrel** — the visual "it cannot shoot the shore". | XL | radar panel >= 8x8 px, vertical; explicitly no barrel |
| `carrier` Aircraft Carrier | `[CARRIER]`, **143x52** — the largest sprite in RA2 | **A flat flight deck the full length of the hull** with three Hornets parked on it. | XL, largest | deck a single unbroken flat plane >= 80% of length; 3 visible parked airframes |
| `dolphin` Dolphin | `[DLPH]`, `Voxel=no` (SHP) | **Organic** — a curved body with a dorsal fin, no straight lines; submerged most of the time (only the wake ring shows, `rts.html:29355-29360`). | S | no orthogonal edges anywhere; fin >= 3 px above the back |
| `lcraft` Landing Craft | `[LCRF]` | **An open bow ramp** — a flat rectangular deck with a hinged front, carrying visible cargo. | L | ramp plane distinct from the deck; visible cargo when loaded |

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

### 2.4 Collective vehicles and aircraft

| our unit | RA2 counterpart | the ONE silhouette feature | size class | pixel budget |
|---|---|---|---|---|
| `rhino` Rhino Tank | `[HTNK]`, 56x28, 886 body px | A thicker, shorter gun than the Grizzly's on a **taller** hull, and **five** house blocks (three flank panels + two turret cheeks) against the Grizzly's two. | M | hull height >= 1.25x the Grizzly's; 5 discrete house blocks, each 4-6 px, gaps >= 3 px; gun >= 1.6x the Grizzly's barrel thickness |
| `mammoth` Apocalypse | `[MTNK]`, 56x41 | **Four house-coloured canister drums stacked 2x2 on the rear deck**, plus **twin** barrels — the only two-barrelled thing on the field. | M, heaviest | each canister >= 6x6 px and individually countable (gaps >= 2 px); twin barrels >= 19 px, visibly two, tapering |
| `teslatank` Tesla Tank | `[TTNK]`, 52x37 | **Two coil columns standing above the deck with an arc between them** — the only paired vertical masts on a hull. | M | each column >= 9 px tall x 3 px wide; gap between them >= 5 px so the pair reads as two |
| `v3` V3 Launcher | `[V3]`, **63x36** — the longest land vehicle | **A white missile on a rail overhanging both ends of its truck**, with a red nose cone and red tail fins and nothing else coloured. | L | missile >= 1.10x the truck length, overhanging >= 5 px at the nose; nose cone and fins in house hue, midbody pure white |
| `flaktrack` Flak Track | `[HTK]`, **45x45**, aspect **1.00** | **The only square vehicle** — a short open-bed halftrack with a gun raised off the bed. | S | body aspect 0.95-1.10; gun raised >= 10 px above the bed line |
| `warminer` War Miner | `[HARV]`, 56x48 | **A harvester with a turret** — the bin plus a small gun; the tallest non-MCV Collective vehicle. | M | turret >= 6x6 px on the bin's shoulder; bin >= 35% of body px |
| `drone` Terror Drone | `[DRON]`, **21x14**, 89 body px, `Voxel=no` | **Four splayed blade legs round a tiny core** — an insect. The smallest thing on the field, 38.7% house on the core. | XS, smallest | total <= 0.55x the smallest tank; legs >= 4 px reach beyond the core, tapered blades not wires; core in house hue |
| `apc` Amphibious Transport | `[SAPC]` | **An open-topped hovercraft** — a fat inflatable skirt round a red (house) inner deck with visible seat blocks. | M | skirt a continuous rounded band round the whole hull; deck cavity visible as a house-hued interior |
| `kirov` Kirov Airship | `[ZEP]`, **139x62**, **no `Remapable` key** | **Mass** — 2.2x the Harrier's span and the largest airframe in the game, a cigar envelope with structural hoops, a hanging gondola and a painted shark mouth. Its identity is deliberately not colour. | XL | span >= 2.0x the Harrier's *on screen*; gondola visibly separated below the envelope by >= 4 px; the existing 1.3x draw scale (`rts.html:29398`) is a symptom of the bake being too small |
| `sub` Typhoon Attack Sub | `[SUB]`, 75x**14**, aspect **5.36** | **The flattest hull afloat** — a long low deck with a conning tower; submerged most of the time. | L | height <= 0.20 x length; conning tower the only vertical mass |
| `seascorp` Sea Scorpion | `[HYD]`, 59x32 | **A small hull with a flak gun** — the fleet's smallest armed ship, the same gun read as the Flak Track. | M | shortest armed hull afloat; gun matches the Flak Track's silhouette |
| `dread` Dreadnought | `[DRED]`, 133x45 | **Two big missile boxes standing on the deck** — the V3's silhouette logic at capital-ship scale. | XL | two launch boxes >= 10x10 px, countable, standing proud of the deck |
| `squid` Giant Squid | `[SQD]`, 117x30, `Voxel=no` | **Tentacles** — a long soft mass with no hull line at all; the only unit whose outline is not a machine. | XL | zero straight edges; >= 4 tentacles resolvable at 3 px each |
| `mcv` MCV (shared) | `[SMCV]` | as §2.3; the Soviet body is chunkier and reads 23.5% house against the Allied 21.0% | L | |

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

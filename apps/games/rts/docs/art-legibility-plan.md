# Art legibility — the menu and the map, measured

> The complaint, verbatim: *"art is still the biggest issue, troops and units
> are not unique enough under that small size in the menu or on the map."*

Two surfaces. **The map** has been measured hard (`tools/legibility.js`, four art
passes, the ZMIN change). **The menu** — the build-sidebar cameos — had never
been measured by anything; `legibility.js`'s own header admits it ("that
measurement is not in this file yet … it belongs here"). This document creates
that measurement, reports both surfaces on one scale, and ranks the work.

Everything below is labelled **MEASURED** or **INFERRED**. New tool:
`apps/games/rts/tools/cameo-legibility.js`. New reference corpus: 74 real RA2
cameo plates in `apps/games/rts/docs/ra2-ref/cameos/`, pulled from the C&C wiki
`File:` namespace. Side-by-side figure: `docs/ra2-ref/cameo-ours-vs-ra2.png`.
Contact sheets are regenerated to `art/out/` (gitignored) by
`cameo-legibility.js --sheet`.

---

## 0. The short version

**The menu is far worse than the map, and nobody knew because nobody had
measured it.** Our median pair of sidebar cameos scores **51.2** (Directorate) /
**48.4** (Collective) on the metric `legibility.js` already uses. Real RA2's
*closest* pair of cameos — its worst case, out of 2701 pairs — scores **58.5**.
All 780 of our Directorate pairs and all 780 Collective pairs sit under RA2's
5th percentile. MEASURED.

The three causes are measurable, and the two biggest are cheap to fix:

| cause | ours | RA2 |
|---|---|---|
| the item's **name** printed on the plate | absent | on every shipped plate (60 of 74 corpus plates; the 14 without are visibly pre-release alpha/beta uploads) |
| fraction of the plate that is **picture** rather than flat wash | 40% (infantry 30%) | 76% |
| how differently bright the plates are from **each other** (across-plate luminance SD) | 10.2 / 8.2 | 22.6 |
| **contrast within** a plate (luminance SD) | 51.9 / 51.0 | 66.3 |

Prototyped on the real pixels (not guessed): adding RA2's caption alone takes
the worst pair from 27.2 → 41.1 (Directorate) and 23.1 → 42.3 (Collective).
Caption + per-item background takes it to 53.5 / 51.9, i.e. within a whisker of
RA2's own floor of 58.5. MEASURED.

On the map, the headline finding is about the **tool**: `legibility.js`'s
`CELL = 28` centre-crops every unit drawn larger than 28 px. Widen the window to
64 and infantry go from **0 pairs under the friend-vs-foe floor to 11** at zoom 1.
The tool's verdict is dominated by its window size, not by the art — so fix the
window before commissioning any more map art from it.

---

## 1. What was measured, with what

### 1.1 The metric

Byte-for-byte the distance `legibility.js` uses: luminance-weighted squared
difference plus two chroma-opponent terms, normalised per pixel so numbers taken
at different resolutions sit on one scale.

```
d(a,b) = sqrt( mean_i [ (La-Lb)² + 0.35·(Δ(R-B))² + 0.35·(Δ(G-B))² ] )
```

It is **not** a validated model of human confusion. It is a consistent yardstick,
and it is anchored to an external ground truth (§2.2) rather than to a number
somebody picked.

### 1.2 The cameo pipeline, as it actually is

`cameoFor()` (rts.html ~L27799) bakes a canvas **120×96** and CSS-sizes it to
**60×48** (`.pit .em canvas { width:60px; height:48px }`) inside a 64×52 button.
60×48 is exactly RA2's own cameo resolution, so the comparison is like-for-like.
MEASURED (read off the live DOM).

The plate is: a vertical gradient sky whose tint is derived from the **mean colour
of the item's own sprite**, a house-tinted ground band, the item's baked map
sprite scaled to fit (cap `k = 3.0`), and a 1 px bevel. No text — the `.nm`/`.ct`
spans are `display:none`, kept only as the button's accessible name.

`cameo-legibility.js` reads the **live sidebar** rather than re-deriving from the
sprite atlas (the atlas knows nothing about the wash, band or bevel), box-
downsamples 120×96 → 60×48, and compares. It walks all four tabs for both
factions by seeding `localStorage['vibetop:rts:fac']` before load — there is no
test hook for `faction`.

It also reports the **greyed** condition, because `.pit.dis` / `.pit.locked`
render through `filter: grayscale(.65) brightness(.6)` and in the early game most
of the sidebar is greyed.

### 1.3 The RA2 corpus

74 plates, `docs/ra2-ref/cameos/`, one per roster item, fetched by wiki search on
`srnamespace=6`. 72 are natively 60×48 — which is what confirms the format. A
handful are localised (French / German / Korean / Chinese) or pre-release
alpha/beta uploads where no shipped English plate was found; those are noted
where they matter. `_source.json` records the wiki title each file came from.

---

## 2. THE MENU — the unclaimed win

### 2.1 The numbers

`node apps/games/rts/tools/cameo-legibility.js`

```
plate: 120x96 bitmap shown at 60px x 48px (measured at 60x48, i.e. DPR 1)

THE BAR = real RA2 cameos, same metric, same size. 74 plates, 2701 pairs:
  min 58.5, 5th pct 81.7, 25th pct 93.2, mean 100.7

DIRECTORATE — 40 cameos, 780 pairs
  whole sidebar : mean 52.0, min 27.2, 5th pct 36.7,  UNDER RA2's bar: 780/780
  greyed (.dis) : mean 26.8, min 12.2
  at DPR 2      : mean 54.1, min 27.9        <- HiDPI does not rescue it
  structures 10  45 pairs  mean 50.0  min 35.6
  defence     9  36 pairs  mean 55.2  min 36.4
  infantry    8  28 pairs  mean 46.1  min 28.9
  units      13  78 pairs  mean 50.0  min 29.3

COLLECTIVE — 40 cameos, 780 pairs
  whole sidebar : mean 48.2, min 23.1, 5th pct 32.5,  UNDER RA2's bar: 780/780
  greyed (.dis) : mean 24.6, min 11.0
  structures 10  45 pairs  mean 44.9  min 28.0
  defence     8  28 pairs  mean 44.4  min 25.6
  infantry    8  28 pairs  mean 44.0  min 25.8
  units      14  91 pairs  mean 52.2  min 33.4
```

**The worst pairs in the build menu** (MEASURED):

| d | pair | sidebar |
|---|---|---|
| **23.1** | Flak Cannon \| Flak Trooper | Collective |
| **25.1** | Crazy Ivan \| Typhoon Attack Sub | Collective |
| **25.6** | Flak Cannon \| Tesla Coil | Collective |
| **25.8** | Barracks \| Psychic Sensor | Collective |
| **25.8** | Crazy Ivan \| Yuri | Collective |
| 26.6 | Yuri \| Typhoon Attack Sub | Collective |
| 27.0 | Sentry Gun \| Flak Cannon | Collective |
| **27.2** | GI \| Nighthawk | Directorate |
| 28.9 | GI \| Rocketeer | Directorate |
| 29.3 | Destroyer \| Aegis Cruiser | Directorate |
| 30.3 | Harrier \| Nighthawk | Directorate |
| 30.6 | Power Plant \| Nighthawk | Directorate |

Greyed out — the state most of the sidebar is in for the first five minutes of a
match — the same list bottoms out at **11.0** (Flak Cannon \| Flak Trooper) and
**12.2** (GI \| Guardian GI). MEASURED.

Note the Directorate list is dominated by one item: **Nighthawk** appears in five
of the eight worst pairs. Its sprite is small and dark, so the subject-mean tint
rule yields a near-neutral dark wash and the plate is mostly empty. Single-item
defect; subsumed by M1–M3 below but worth naming.

### 2.2 Why "RA2's own corpus" is the right bar, and not friend-vs-foe

`legibility.js` anchors on *the same unit in the two owners' colours*, because on
the map the player must tell friend from foe every second. **That anchor does not
exist in the sidebar** — the sidebar only ever shows your own house, so the
same-item-two-colours distance there is near zero by construction and would be a
meaningless floor.

The defensible bar is the game we are copying. Run the identical metric over 74
real RA2 plates and you get the distance Westwood's own art keeps between two
icons a player picks between: min 58.5, 5th pct 81.7, median 100.5. **Our median
pair is below RA2's closest pair.** MEASURED.

### 2.3 Is that just "RA2 has painted backgrounds"? — no

Fair objection: RA2's cameos are photographic renders on varied scenes, so of
course they differ more. Tested. Remove each plate's global tone (subtract its
per-channel mean) and rescale every plate to the same contrast, leaving only
structure and layout:

| set | structure-only min | 5th pct | median | frame busyness |
|---|---|---|---|---|
| RA2 refs | 55.9 | 70.7 | 83.9 | 66.9% |
| ours, Directorate | 31.3 | 42.6 | 54.8 | 34.6% |
| ours, Collective | 28.2 | 36.5 | 52.0 | 33.7% |

("Frame busyness" = fraction of pixels whose luminance departs from that row's
median by >12; a flat horizontal gradient scores ≈0.)

With tone and contrast equalised RA2 is **still ~1.5× further apart**. So it is
not only the backgrounds — the pictures themselves are structurally more
distinct, and two-thirds of an RA2 plate is picture where only a third of ours
is. MEASURED.

INFERRED: some fraction of the remaining gap is unreachable without a rendering
pipeline — a hand-drawn vector plate cannot carry a photograph's pixel variety.
But the prototypes in §2.5 close more than half of it with drawing changes
alone, so the gap is not an excuse.

### 2.4 What RA2 does that we do not

Look at `docs/ra2-ref/cameo-ours-vs-ra2.png` (ours left, RA2 right, 16 items).
Four concrete, checkable differences:

1. **RA2 prints the item's NAME on the plate.** Bold condensed white caps with a
   hard black outline across the bottom, one or two lines ("G.I.", "GUARDIAN
   G.I.", "AEGIS CRUISER", "WEATHER MACHINE", "CHRONO LEGIONNAIRE"). MEASURED:
   an outlined-white-text detector finds it on 59 of 74 corpus plates; a 60th
   (`colrefinery`, "ORE REFINERY") uses grey text the detector misses, and all
   14 remaining are visibly pre-release alpha/beta plates in a different style
   with no bevel. **Every shipped-style plate in the corpus carries a caption.**

   Our code says the opposite, in a comment, and the sidebar was built on it:

   > `// No prose on the cameo — RA2 puts none there.` (rts.html ~L27751)

   That comment is factually wrong, and it is the single most expensive line in
   the sidebar. The name currently exists only in the hover tooltip — i.e. it
   costs a hover and a wait, which is exactly the "learned, not discoverable"
   pattern this project rejects elsewhere.

2. **RA2 crops in hard.** The subject overflows the frame: Guardian GI is cut off
   at the knees, the Grizzly's hull runs off both edges, the Chrono Legionnaire
   is a shoulders-up close-up. Ours draws the whole orthographic map sprite,
   centred, with margins — 40% of the plate is subject against RA2's 76%, and
   infantry are worst at **30%**. MEASURED.

3. **RA2 gives every plate its own environment.** Green valley (GI), sand dune
   (Guardian GI), white cloud (Rocketeer), an office interior (Spy), meadow
   (Tanya), dark void with a cyan beam (Chrono Legionnaire), sea and sky (Aegis),
   blue splash (Destroyer). Ours is one gradient for all 80 plates, tinted by the
   sprite's own mean colour — and because nearly every sprite is grey-blue steel
   with a little owner colour, that rule produces nearly the same tint every
   time: across-plate luminance SD **10.2 / 8.2** against RA2's **22.6**.
   MEASURED. (The existing code comment already anticipates this — "a background
   every icon shares carries no information" — and the subject-mean tint was the
   attempted fix. The measurement says it did not work.)

4. **RA2 varies the camera.** Infantry are portraits; vehicles are low three-
   quarter hero shots; ships are broadside; the Terror Drone is a low ground-level
   shot. Ours is one isometric bearing (`ICON_FACE = 4`) for every item on the
   board. MEASURED (by inspection of the two contact sheets).

### 2.5 What each fix buys — prototyped on the real pixels

Each candidate was applied to the live plates and re-measured. This is not an
estimate; it is the same tool run over transformed pixels.

| variant | DIR min | DIR p5 | DIR med | COL min | COL p5 | COL med |
|---|---|---|---|---|---|---|
| as shipped | 27.2 | 36.7 | 51.2 | 23.1 | 32.5 | 48.4 |
| **+ RA2 name caption** | **41.1** | **52.8** | 63.7 | **42.3** | **52.3** | 62.0 |
| + per-item background | 44.3 | 58.5 | 80.6 | 32.2 | 50.1 | 76.7 |
| **+ both** | **53.5** | **69.2** | 88.1 | **51.9** | **64.7** | 85.1 |
| *(RA2's own bar)* | *58.5* | *81.7* | *100.5* | *58.5* | *81.7* | *100.5* |
| greyed, as shipped | 12.2 | 18.5 | 26.2 | 11.0 | 15.8 | 25.1 |
| greyed + caption | 21.1 | 29.2 | 34.9 | 24.0 | 29.1 | 34.2 |
| greyed + background | 18.3 | 26.5 | 40.5 | 15.4 | 23.1 | 37.4 |
| greyed + both | 28.5 | 35.0 | 46.0 | 29.0 | 33.8 | 44.0 |

Infantry portrait crop, measured on the infantry tab alone:

| variant | DIR min | DIR med | COL min | COL med |
|---|---|---|---|---|
| as drawn | 28.9 | 42.4 | 25.8 | 36.9 |
| crop ×1.6 | 30.3 | 60.5 | 33.1 | 52.4 |
| **crop ×2.2** | **38.7** | **73.1** | **42.8** | **66.0** |
| *(RA2's own Allied infantry)* | *82.9* | *96.9* | — | — |

**Caveat on the background row, stated plainly:** the prototype assigned each
plate an arbitrary hue spread evenly round the wheel. That is *not* shippable —
a rainbow sidebar is not RA2. The number is an upper bound on what background
variation alone can buy; the shippable form is a **category scene** (sky for
air, sea for naval, terrain for ground, an interior/close backdrop for infantry
portraits) plus a per-item hue and value offset within that category, which
INFERRED should land somewhat below 58.5/50.1 but well above 36.7/32.5. The
prototype sheet is `art/out/cameos-proto-{dir,col}.png` — look at it before
copying the approach; it demonstrates the mechanism, not the taste.

---

## 3. THE MAP — current numbers, and a caveat that changes the verdict

### 3.1 As the shipped tool reports it

`node apps/games/rts/tools/legibility.js` — run today, 40 units.

```
zoom 1 (game default)   threshold 32          zoom 0.75 (ZMIN)   threshold 24.5
  vehicle  13  mean 79.0  min 54.0   0          vehicle  mean 73.9  min 39.8   0
  infantry 14  mean 48.5  min 32.4   0          infantry mean 38.0  min 25.7   0
  air       3  mean 63.8  min 50.8   0          air      mean 56.5  min 42.2   0
  naval    10  mean 55.0  min 27.6   1          naval    mean 55.4  min 42.6   0
```

**Worst pairs, zoom 1** (threshold 32): `aegis | squid` **27.6** ← under the
floor; `ivan | yuri` 32.4; `ivan | spy` 35.9; `rifle | conscript` 38.8;
`yuri | spy` 38.8; `rifle | ivan` 38.9; `rifle | rocketeer` 39.2;
`conscript | tanya` 39.3.

**Worst pairs, zoom 0.75** (threshold 24.5): `ivan | spy` 25.7; `ivan | yuri`
28.0; `conscript | tanya` 28.5; `tanya | spy` 28.5; `rifle | ivan` 28.6;
`tanya | ivan` 29.2; `rifle | conscript` 30.2; `ivan | cleg` 30.3.

This confirms the roadmap: R1 (ZMIN) is closed, and `aegis | squid` is the one
pair under a threshold anywhere. **Nothing below proposes changing ZMIN.**

### 3.2 The tool's window is doing most of the judging

`legibility.js` normalises every unit into a `CELL = 28` box. The code scales the
bounding box by the zoom and then **centres it in a 28×28 cell, discarding
anything that falls outside**. Drawn sizes at zoom 1 (MEASURED, from the tool's
own `sizes` output):

| unit | drawn px | unit | drawn px |
|---|---|---|---|
| GI | 16×36 | Aegis Cruiser | 54×65 |
| Crazy Ivan | 17×32 | Giant Squid | 79×69 |
| Spy | 19×29 | Dreadnought | 68×92 |
| Yuri | 14×39 | Aircraft Carrier | 84×74 |

So **every vehicle and every ship is being compared on its middle 28×28 patch**,
and a 36 px trooper loses 4 px off each end. Widen the window and re-run
(zoom 1, same code, `CELL` parameterised):

| window | threshold | infantry mean / min | pairs under the floor |
|---|---|---|---|
| CELL = 28 (as shipped) | 32.0 | 48.5 / 32.4 | **0** infantry, 1 naval |
| CELL = 64 (nothing cropped) | 18.3 | 23.1 / 16.1 | **11** infantry, 0 naval |
| union-footprint (no background at all) | 42.2 | 67.9 / 56.1 | 0 infantry, 1 air |

Three windows, three verdicts. MEASURED. The mechanism is not mysterious: at
CELL 64 a 20×36 trooper fills 18% of the compared area and the other 82% is the
same grass for both units, which drags every distance *and* the anchor down
together; at CELL 28 the crop throws away the head, the weapon and the feet —
which is where infantry identity lives — and keeps the torso, which is where it
does not.

At CELL = 64 the worst pairs at zoom 1 are, in order: `ivan|spy` 16.1,
`ivan|yuri` 16.6, `conscript|tanya` 17.6, `tanya|ivan` 17.8, `tanya|spy` 17.8,
`rifle|ivan` 17.9, `conscript|spy` 18.1, `rifle|conscript` 18.2 — all under the
18.3 floor. **That list is the owner's complaint, in numbers.** The CELL = 28
report does not contain it.

Two supporting measurements for the same conclusion — the infantry share a
colour and a size, so only fine shape separates them, and fine shape is what a
20 px figure has least of (MEASURED, facing 3, zoom 1, composited on grass):

```
GI          16x36  mean rgb(81,103,74)  sat 0.435  lum 93.4
Conscript   18x36  mean rgb(80,100,77)  sat 0.464  lum 91.6
Crazy Ivan  17x32  mean rgb(77, 94,69)  sat 0.424  lum 86.5
Spy         19x29  mean rgb(82,102,78)  sat 0.419  lum 93.5
Yuri        14x39  mean rgb(82, 95,78)  sat 0.414  lum 90.0
Tanya       20x33  mean rgb(92,103,69)  sat 0.401  lum 96.2
Rocketeer   22x29  mean rgb(86,105,86)  sat 0.391  lum 97.7
Chrono Leg. 28x30  mean rgb(81,102,90)  sat 0.379  lum 94.9
```

Eight kinds within 11 points of luminance and 0.08 of saturation of each other.

### 3.3 What this says about `aegis | squid`

`aegis | squid` = 27.6 is the *only* pair the shipped tool puts under a floor,
and both units are drawn far larger than the 28 px window (54×65 and 79×69) — so
the number is a comparison of the cruiser's midship against the squid's mantle,
not of two silhouettes. Under the other two windows it passes comfortably:
CELL 64 gives 27.2 against a threshold of 18.3, and the union-footprint metric
does not put it in the worst eight at all (naval min there is `dread|squid`
50.4). MEASURED.

INFERRED: `aegis | squid` is substantially a centre-crop artefact, and the week
of hull-redesign it would otherwise justify should not be spent until §4 P1 is
done. This does not contradict the established finding that the bake dims are
RA2-proportioned — it says the *number* that motivated further work is
window-dependent.

The pair that survives **all three** windows is `harrier | nighthawk`: 30.3 in
the Directorate cameo list, and the single failure of the union-footprint metric
at both zooms (41.6 vs threshold 42.2 at zoom 1; 39.5 vs 41.7 at ZMIN). Two grey
aircraft, confusable on both surfaces. MEASURED.

---

## 4. The ranked plan

Ranked by legibility bought per unit of work. **Menu work and map work are
separate tracks and do not block each other.**

### MENU

#### M1 — Put the item's name on the plate, RA2's way. *Cheap: hours.*

- **Problem (MEASURED):** the sidebar carries no text; the name is available only
  by hovering. Worst pair 23.1 (Collective) / 27.2 (Directorate), and 11.0 / 12.2
  greyed. RA2 prints the name on every shipped plate.
- **Change:** in `cameoFor()`, after the sprite and before the bevel, draw the
  item's name across the bottom of the 60×48 plate: bold condensed caps, white
  fill over a ~2.5 px black stroke, one line, wrapping to two when it does not
  fit — which is what RA2 does for CHRONO LEGIONNAIRE. Use **RA2's own caption
  strings**, read off the plates in `docs/ra2-ref/cameos/`, not our internal
  `spec.name`: RA2 says WEATHER MACHINE, not "Weather Control Device", and
  ARMORED TRANSPORT, not "Amphibious Transport". Delete the
  `// No prose on the cameo — RA2 puts none there.` comment; it is false and it
  is load-bearing. Keep the `.nm`/`.ct` spans as the accessible name and keep the
  drawn tooltip — RA2 has both.
- **Expected (MEASURED on a prototype of the real pixels):** worst pair
  27.2 → **41.1** (DIR, +51%) and 23.1 → **42.3** (COL, +83%); 5th percentile
  36.7 → 52.8 and 32.5 → 52.3. Greyed worst pair 12.2 → 21.1 and 11.0 → 24.0.
- **Verify:** `node apps/games/rts/tools/cameo-legibility.js` — every `min` and
  `5th pct` figure must move by at least the amounts above, in both sidebars and
  in the greyed row. Then look at `--sheet` output at 1:1 and check the caption
  is legible at 60×48 without the subject disappearing behind it.
- **Risk:** the caption sits over the bottom of the subject. RA2 accepts this.
  If a specific plate's identity feature is at the bottom (the Terror Drone's
  legs), nudge the subject up rather than shrinking the caption.

#### M2 — One background per item, not one for all eighty. *Medium: 2–4 days.*

- **Problem (MEASURED):** across-plate luminance SD 10.2 / 8.2 against RA2's
  22.6; frame busyness 34% against 76%. The subject-mean tint rule collapses
  because nearly every sprite is grey-blue steel.
- **Change:** replace the single sky gradient with a small vocabulary of
  **category scenes** — open sky and cloud for air, sea horizon for naval,
  ground-and-horizon for vehicles and structures, a close dark backdrop for
  infantry portraits — and within a category vary hue *and plate value* per item
  by a stable key hash, targeting an across-plate luminance SD near RA2's 22.6.
  Keep the house colour in the frame and the ground band, where it is now.
- **Expected:** worst pair to **44.3 / 32.2** and 5th pct to **58.5 / 50.1** in
  the (unshippable) rainbow upper bound; INFERRED a disciplined category+hue
  version lands around 40 / 45 on the worst pair. Combined with M1, MEASURED
  **53.5 / 51.9** worst pair and **69.2 / 64.7** at the 5th percentile — against
  RA2's floor of 58.5 and 5th pct of 81.7.
- **Verify:** the tool, plus `--sheet`: the two contact sheets must stop reading
  as one blue mass. Check `lumSpread` in the JSON output moves from ~10 to ~22.
- **Risk:** taste. The prototype is a rainbow and looks wrong. Build the category
  vocabulary first, get one tab of it in front of a human, then extend.

#### M3 — Crop infantry to RA2's portrait. *Medium: ~2 days.*

- **Problem (MEASURED):** infantry plates are 30% subject, 70% wash — the worst
  fill on the board — and their pairs are the tab's floor (28.9 / 25.8). RA2
  frames infantry as chest-up portraits that overflow the plate.
- **Change:** give the cameo path a per-class crop rectangle. For `cls === 'i'`,
  crop to the head-and-torso of the baked sprite and scale it to overflow the
  60×48 plate rather than fitting it. That is a change to the `k = Math.min(...)`
  fit rule plus a source rect, not new art.
- **Expected (MEASURED, ×2.2 prototype):** infantry worst pair 28.9 → **38.7**
  (DIR) and 25.8 → **42.8** (COL); infantry median 42.4 → 73.1 and 36.9 → 66.0.
- **Verify:** the tool's `infantry` per-tab row in both sidebars.
- **Risk:** our infantry sprites are ~16×36 at bake resolution and were drawn to
  read as whole figures at 20 px, not as faces. A ×2.2 crop will expose that the
  helmet is four pixels. INFERRED this is still a net win — the measurement says
  the *pair separation* improves sharply — but it may pull M4-class rework of the
  infantry heads in behind it. Do M1 and M2 first and re-measure before
  committing to this one.

#### M4 — Reconsider the greyed style. *Cheap: hours. Do it after M1–M3.*

- **Problem (MEASURED):** `grayscale(.65) brightness(.6)` roughly halves every
  distance (mean 52.0 → 26.8, min 27.2 → 12.2). The early game is mostly greyed
  cameos, so this is the *dominant* reading condition, not an edge case.
- **Change:** grey the plate but keep the caption at full white (M1 makes this
  possible — text drawn into the canvas is greyed with it, so the caption would
  have to move to a CSS overlay, or the filter be replaced by a canvas-side
  desaturation that skips the caption band).
- **Expected:** after M1+M2 the greyed floor is already 28.5 / 29.0 MEASURED;
  exempting the caption should add most of the caption's own 9–13 point
  contribution back. INFERRED.
- **Verify:** the tool's `greyed (.dis)` row.

#### M5 — The Nighthawk plate specifically. *Cheap, and mostly free after M1–M2.*

Five of the eight worst Directorate pairs contain the Nighthawk. Its sprite is
small and dark, so the derived tint gives a near-neutral dark wash and the plate
reads as empty. After M1–M2, re-measure; if it is still in the worst five, give
it a light sky (it is an aircraft — M2's air category should already do this)
and raise its fit scale.

### MAP

#### P1 — Fix the measurement window before commissioning any more map art. *Cheap: hours. Highest map priority.*

- **Problem (MEASURED):** `CELL = 28` centre-crops every unit drawn larger than
  28 px — all 13 vehicles, all 10 ships, and 4 px off each end of every trooper.
  Changing the window flips the infantry verdict from 0 confusable pairs to 11.
  Every map art decision is currently graded by a tool whose answer is dominated
  by its window.
- **Change:** (a) make `CELL` an env-overridable constant, as `LEG_ZOOMS` already
  is; (b) set the default to at least the largest drawn unit (84 px at zoom 1),
  and note in the header that padding dilutes distances uniformly, so the
  *threshold moves with it* and only same-window comparisons are meaningful;
  (c) add the **union-footprint** variant as a second reported column — distance
  computed only over pixels where either unit has a body, which is free of both
  the crop bias and the padding bias. All three numbers, side by side, so nobody
  cites one in isolation again. A run at CELL 96 needs `--max-old-space-size`;
  either raise it in the shebang or store thumbnails as `Uint8Array` rather than
  plain arrays.
- **Expected:** no art change; the tool starts reporting the 11 infantry pairs
  the owner is complaining about.
- **Verify:** the same three tables in §3.2 reproduce.

#### P2 — Infantry silhouette and value, on the map. *Expensive: weeks.*

- **Problem (MEASURED):** eight kinds inside 11 points of luminance and 0.08 of
  saturation, 14–22 px wide, 29–39 px tall. At CELL 64, eleven pairs under the
  friend-vs-foe floor at zoom 1: `ivan|spy` 16.1, `ivan|yuri` 16.6,
  `conscript|tanya` 17.6, `tanya|ivan` 17.8, `tanya|spy` 17.8, `rifle|ivan` 17.9,
  `conscript|spy` 18.1, `rifle|conscript` 18.2 and three more, against a floor of
  18.3.
- **Change:** this is `unit-identity-reference.md` §3's R1–R6 work, and it is the
  one item on this list that is genuinely a week or more per faction. The
  measured lever is **plate value**, not more owner colour — §3.2 shows the eight
  kinds differ by 11 luminance points total, and the established finding
  (roadmap) is that pushing owner-colour *area* made map legibility worse. Give
  each kind a distinct overall value and a distinct outline mass at 20 px, and
  keep the owner colour budget where it is.
- **Expected:** unquantified until P1 lands; the target is zero pairs under the
  floor in whichever window P1 settles on.
- **Verify:** `legibility.js` after P1, plus a live rendered frame — the standing
  rule is that headless numbers pass while the renderer throws.
- **Note:** do **not** start this before P1. Grading infantry art with a tool
  that crops the head off is how three art passes closed the metrics while the
  screen stayed a blue mass.

#### P3 — `harrier | nighthawk`. *Small: a day or two.*

The only pair that fails under **every** window: 41.6 vs 42.2 (union footprint,
zoom 1), 39.5 vs 41.7 (ZMIN), and 30.3 in the Directorate cameo list. Two grey
aircraft of similar span. MEASURED. Both surfaces improve from the same work, so
it is the best value on the map list after P1. RA2's own plates
(`docs/ra2-ref/cameos/harrier.png`, `nighthawk.png`) show a swept-delta jet at
altitude against blue versus a squat twin-rotor helicopter over ground — a
fuselage-shape and rotor-versus-wing distinction we have flattened.

#### P4 — `aegis | squid`: re-measure, do not redraw. *Free.*

27.6 against a floor of 32 is the shipped tool's only failure, but both units are
drawn at 54×65 and 79×69 — more than twice the 28 px window — so the number
compares their middles. Under CELL 64 it passes (27.2 vs 18.3) and under the
union-footprint metric it is not in the worst eight. MEASURED. Re-run after P1
and only then decide whether there is a silhouette problem to fix. This is a week
of hull work that the measurement does not currently justify.

---

## 5. How to verify the whole thing

```bash
node apps/games/rts/tools/cameo-legibility.js                 # menu, both sidebars
node apps/games/rts/tools/cameo-legibility.js --sheet         # + contact sheets to LOOK at
node apps/games/rts/tools/cameo-legibility.js --json m.json   # machine-readable
node apps/games/rts/tools/legibility.js                       # map, as it stands
LEG_ZOOMS=1 node apps/games/rts/tools/legibility.js           # one zoom, faster
```

Acceptance for the menu track, in order:

1. After M1: both sidebars' `min` ≥ 40 and `5th pct` ≥ 50; greyed `min` ≥ 20.
2. After M2: both sidebars' `min` ≥ 50 and `5th pct` ≥ 62; `lumSpread` ≥ 20.
3. After M3: the `infantry` per-tab `min` ≥ 38 in both sidebars.
4. At every step, open `art/out/cameos-{dir,col}.png` and put it beside
   `art/out/cameos-ra2-ref.png`. The number is a proxy; the sheet is the thing.

**Prove each change against the unfixed build first.** Run the tool before the
edit and watch the failing number; a green-only-on-the-fix result proves nothing,
and an assertion made true by the fix's own drawing is a tautology.

---

## 6. What this study did NOT establish

- **The metric is not a human study.** It is `legibility.js`'s metric, anchored
  to RA2's own corpus. It says our plates are objectively closer together than
  RA2's by a factor of two; it does not say a specific player confuses a specific
  pair.
- **The background prototype is a mechanism demo, not a design.** Its arbitrary
  rainbow would look wrong shipped. Its number is an upper bound.
- **The infantry portrait-crop number is approximate.** The prototype extracted
  the subject with a row-median mask and upscaled it, which blurs; a real crop
  re-rendered from the bake will differ, probably favourably.
- **The RA2 corpus contains 6 alpha/beta uploads and several localised plates**
  where no shipped English plate was found by search. They are distinct items so
  they do not distort the pairwise distribution, but they are why the caption
  detector finds 59/74 rather than 74/74.
- **Nothing here re-opens ZMIN.** R1 is closed. §3.2 is about the tool's window,
  which is a different variable, and no proposal changes ZMIN or spike thickness.
- **Nothing here proposes more owner colour.** The established finding that
  pushing owner-colour area made map legibility worse stands; §3.2's lever is
  plate *value*, not hue area.
- **The map at DPR 2 / other zooms** was measured only at zoom 1 and 0.75. The
  cameos were measured at DPR 1 and DPR 2 (mean 52.0 → 54.1; HiDPI does not
  rescue the menu).

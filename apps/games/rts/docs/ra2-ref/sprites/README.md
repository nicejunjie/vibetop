# RA2 sprite rips — VERIFIED BY EYE, one at a time

The code comments throughout `rts.html` cite sprite rips by filename
(`allied-grand-cannon.png`, `soviet-terror-drone.png`,
`allied-ore-refinery-idle.png`, …). **None of them were in the repo.** Only the
74-plate cameo corpus survived, so every "re-read at 1:1 against the render"
comment recorded a measurement nobody could re-check.

This directory is the beginning of putting that right, and the METHOD matters
more than the two files in it.

## Why not just fetch them

Because a search loop returns the wrong units, silently. Asking the C&C wiki's
file search for these gave:

    "Nighthawk"     -> File:RA2 Allied Battle Lab.gif   (a different BUILDING)
    "Rhino Tank"    -> File:C&C-RA2-ggprisdm.gif        (same file as Prism Tank)
    "V3 Launcher"   -> File:RA2 V3 Launcher Icons.png   (60x48 — a CAMEO)

Those were downloaded and then **deleted rather than committed**. A wrong
reference sprite does not fail loudly: it silently anchors every future
proportion decision to the wrong unit, which is the exact failure this
directory exists to prevent.

## The method that works

1. Find an EXACT file title first. No fuzzy search-and-take-the-first-hit.
2. Download it.
3. **Open the image and look at it.** Confirm it is the right unit, the right
   game, and an in-game render rather than a cameo or concept art.
4. Only then commit it, with its wiki title and dimensions recorded below.

## What is here

| file | wiki title | size | verified |
|---|---|---|---|
| `grand-cannon.png` | `File:RA2 Grand Cannon.gif` | 117x85 | Looked at. A fat rounded armoured dome on a splayed steel turntable with three round outrigger pads and bright bosses, and a SHORT thick gun off its shoulder — which independently confirms the `key === 'grandcannon'` comment's 1:1 re-read, and confirms that lengthening its barrel to match the CAMEO would have been wrong |
| `prism-tower.png` | `File:C&C-RA2-ggprisdm.gif` | 272x256 | Looked at. The Allied Prism Tower: a slender tower with a crystal-cluster crown on a red-trimmed base, on a BLUE chroma key. Note this is the TOWER, not the Prism Tank |
| `terror-drone.png` | `File:RA2 Terror Drone.png` | 258x222 | Looked at. **EIGHT BEARINGS** on snow — the most useful shape a rip can take. A SMALL red body on legs that splay well beyond it, which independently confirms the 2026-09-05 leg-reach extension (4.7/3.9 -> 5.9/4.9): RA2's drone really is mostly legs |
| `allied-barracks.png` | `File:RA2 Allied Barracks.png` | 172x142 | Looked at. Two ribbed Quonset barrels side by side with dark arched openings, a watch drum with a silver dome and a flag, yellow hazard plates on the apron. Confirms the barracks comment's own description down to the hazard plates |

Note the Grand Cannon here is 117x85 where the code comment cites 181x133 — the
same subject at a different resolution, so use it for SHAPE and PROPORTION, not
for absolute pixel counts.

## The reference table has now been CHECKED AGAINST A REAL SPRITE

`RA2_ASPECT` is transcribed from `unit-identity-reference.md` §1.1, and a test
verifies the transcription — but until now nothing verified the DOCUMENT. The
Terror Drone sheet is the first chance to close that loop, because it carries
all eight bearings.

Segmenting the eight drones off the snow and measuring each bounding box:

    widest bearings   27x18  ->  aspect 1.50
    narrowest         24x18  ->  aspect 1.33
    the table says    21x14  ->  aspect 1.50

**The broadside aspect matches the table exactly.** The absolute pixel counts
differ — this render is at a different scale and my segmentation includes the
drop shadow — which is precisely why the gate compares RATIOS and not sizes.

Two things are validated at once: the number in §1.1, and the convention
`art-metrics.js` uses of taking the WIDEST bearing as the broadside. A unit
whose aspect swings 1.33-1.50 across its own facings needs that convention to
be stated, and it turns out to be the right one.

## A DISCREPANCY the sprites found in the reference itself

Measuring three units off their own eight-bearing sheets, by segmenting each
sprite off the snow and taking the widest bounding box:

| unit | measured broadside | §1.1 says | verdict |
|---|---|---|---|
| Terror Drone `[DRON]` | 27x18 = **1.50** | 21x14 = 1.50 | matches exactly |
| Rhino Tank `[HTNK]` | 51x26 = **1.96** | 56x28 = 2.00 | matches (2%, inside segmentation noise) |
| Apocalypse `[MTNK]` | 59x34 = **1.74** | 56x41 = 1.37 | **DOES NOT MATCH** |

The Apocalypse sheet does contain a bearing at 59x43 = 1.37 — the document's
figure exactly. So §1.1's Apocalypse row is not its BROADSIDE; it is a taller,
narrower facing.

**This matters, because `art-metrics.js` compares our WIDEST bearing against
that number.** For the Apocalypse the two sides of the comparison are different
facings. Our Apocalypse currently reads 1.27 against a reference of 1.37 —
comfortably in band at 0.93 — but against a true broadside of 1.74 it would be
0.73, i.e. OUTSIDE. The gate may be passing that unit for the wrong reason.

Not changed unilaterally: one segmentation of one sheet is thinner evidence
than the document, and my blob detector includes drop shadows (which is why the
Rhino comes out 51x26 where §1.1 says 56x28). What is warranted is the flag.
Re-deriving `[MTNK]` — and spot-checking the other rows the same way — needs
more sheets, and the method is above.

## The standing rule this supports

**A cameo is not a sprite.** RA2's plates are painted hero shots; its sprites
are what the game draws. Read plates for composition, lighting and identifying
feature; read RIPS for proportion. Three near-misses in one session came from
reading proportion off a plate — the Psychic Sensor, the Grand Cannon and the
Spy — and one real fix (the V3's raised rail) came from a case where the plate
happened to agree with the sprite.

Where no rip exists, `RA2_ASPECT` in `tools/art-metrics.js` is the trustworthy
reference: its numbers come from `unit-identity-reference.md` §1.1, which cites
BBOXES rather than files, and a test re-derives every row from that document so
the transcription cannot drift.

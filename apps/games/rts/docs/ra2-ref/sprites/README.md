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

## A discrepancy the sprites found in the reference — and CORRECTED

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
that number** — for aspect, and since 2026-09-05 for SIZE as well. For the
Apocalypse the two sides of the comparison were different facings.

### Why it was corrected rather than left flagged

The first pass flagged this and declined to change it, on the grounds that one
segmentation is thinner evidence than the document and that the blob detector
includes drop shadows. Both objections were then tested, and both fail:

- **Threshold sweep.** Re-segmenting at value cuts of 150/165/180/190/200/210
  returns 59x34 = 1.74 and exactly eight blobs at EVERY cut. The measurement is
  threshold-insensitive, so shadow contamination is not deciding it.
- **The full bearing set** comes out `[0.71, 0.76, 1.28, 1.28, 1.34, 1.37,
  1.69, 1.74]`. The document's 1.37 is the sixth of eight — a mid facing. Two
  bearings are TALLER than wide (bow-on and stern-on, barrels up-screen), which
  is what a broadside convention exists to exclude.
- **The convention holds on the other two sheets** — the Drone matches the
  document exactly and the Rhino to 2%. Two units support "widest = the
  document's number"; the Apocalypse is the one that breaks it.

`[MTNK]` is therefore recorded as **59x34 = 1.74**, in `unit-identity-reference.md`
§1.1 and §2.1 and in `RA2_BBOX`. This is the only row in the table backed by a
measurement of the actual sprite rather than by transcription.

### What the correction changes, honestly

It does not make a problem go away — it MOVES it, and to the truer place:

| gate | with 56x41 | with 59x34 |
|---|---|---|
| `aspect.vehicleOutsideRA2Band` | 0 (ours 1.27 vs 1.37 = 0.93) | **1** (ours 1.27 vs 1.74 = 0.73) |
| `size.vehicleOutsideRA2Band` | 1 (89/56 = +25%) | **0** (89/59 = +19%) |

So our Apocalypse is not too BIG, as the size gate briefly said. It is too
SQUAT: 89x70 where the proportion should be nearer 1.74. That is a real and
actionable defect, and the old row was hiding it behind a passing gate.

### The systematic risk this exposes

RA2's tanks are VOXELS, not SHPs. There is no canonical sprite bbox for them at
all — every number in §1.1's vehicle block is somebody's measurement of one
rendered frame, at a bearing nobody wrote down. The Apocalypse is simply the
row where that showed. The other twelve vehicle rows carry the same risk and
have not been checked against a real sheet, so **extending this rip set is the
highest-value reference work available.** The method is above.

## NOT a fetching problem — the vehicles have no canonical sprite at all

Filed first as "fetching is blocked" when the wiki started returning 403s. That
framing was wrong, and the answer was on this machine the whole time. RA2's own
`art.ini`:

    HTNK Voxel=yes   MTNK Voxel=yes   GTNK Voxel=yes   SREF Voxel=yes
    RTNK Voxel=yes   FV   Voxel=yes   HTK  Voxel=yes   TTNK Voxel=yes
    CMIN Voxel=yes   HARV Voxel=yes   V3   Voxel=yes   SHAD Voxel=yes
    DRON Voxel=NO

**Eleven of the thirteen vehicle rows in §1.1 describe VOXEL models.** A voxel
has no sprite and therefore no bounding box: every number in that block is
somebody's measurement of one RENDERED FRAME, at a bearing nobody wrote down.
No amount of downloading fixes that, because the artefact being sought does not
exist.

And this explains the two results that were otherwise just luck:

| unit | art.ini | doc vs my measurement |
|---|---|---|
| Terror Drone `[DRON]` | **Voxel=no** — an SHP, so it HAS one canonical sprite | matched **exactly**, 1.50 vs 1.50 |
| Apocalypse `[MTNK]` | Voxel=yes | did NOT match; the doc's figure was a mid bearing |

The row that agreed is the only one with a real sprite behind it. The row that
disagreed is a voxel, and disagreed for exactly that reason.

**So the rule for §1.1's vehicle block is:** treat those numbers as one
rendered bearing, not as ground truth, and when a unit's aspect is in question
resolve it by rendering the voxel across all eight bearings and taking the
widest — which is what the Rhino and Apocalypse sheets in this directory are.
The infantry and naval rows are not affected in the same way; check `Voxel=`
before trusting any row as a sprite measurement.

## The old note, kept for the record: fetching was ALSO blocked (2026-09-05)

An attempt to extend this set with eight more vehicle sheets — Grizzly, Prism
Tank, Mirage, IFV, Flak Track, Tesla Tank, Chrono Miner, War Miner — returned
Cloudflare's interstitial for every title:

    HTTP 403  text/html  "<title>Just a moment...</title>"

The control proves it is the HOST and not the titles: re-fetching
`RA2_Rhino_Tank.png`, which downloaded cleanly earlier the same day, now
returns the same 403. So the exact-title method above is still correct and
still the one to use; the source is simply challenging this host now. Back off
and try later from a different network rather than retrying in a loop, and do
NOT fall back to a fuzzy search — that is what produced the wrong-unit rips
this file exists to warn about.

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

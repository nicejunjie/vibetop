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

Note the Grand Cannon here is 117x85 where the code comment cites 181x133 — the
same subject at a different resolution, so use it for SHAPE and PROPORTION, not
for absolute pixel counts.

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

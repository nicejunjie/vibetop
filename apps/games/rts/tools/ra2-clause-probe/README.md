# `ra2-clause-probe` — run a SHIPPED structure clause over a sprite it was not written for

Three passes have now built this by hand and thrown it away
(`structure-clause-triage.md`'s Method paragraph describes it; so does the
2026-09-06 clause-rewrite section). It is committed so the fourth does not.

## What it is for

`tools/clause-checks/structures.js` decides whether a building's art satisfies
§2.5-2.9. Before believing a red row you have to answer one question:

> **Does RA2's own sprite pass this clause?**

If it does not, the row is a BROKEN CHECK and the fix is the checker — never the
art (`docs/qa-charter.md`'s two-pillar rule; the Service Depot was squashed into
a one-pixel hairline by ignoring this, twice). And when you rewrite a clause you
have to answer a second question, or the rewrite is decoration:

> **Does the new clause still FAIL on deliberately broken art?**

This directory answers both, against the *shipped* math.

## The three pieces

| file | does |
|---|---|
| `run-clause.js` | Loads `structures.js` **verbatim from disk** and appends only an export epilogue, so the probe cannot drift from what the gate runs. Runs `check()` over any `{w,h,mask,rgba}` record. |
| `dump-blds.js` | Bakes our own structures out of any build of the page (honours `ART_HTML`) into that record shape, using art-metrics.js's own `bbox()` code. |
| `key.py` | Chroma-keys an RA2 rip from `docs/ra2-ref/sprites/buildings/` into the same shape. Blue key for the SHP rips, green for the grass-backed ones. |

## Use

```bash
cd apps/games/rts/tools/ra2-clause-probe

# 1. our own bakes
node dump-blds.js ours.json base gapgen

# 2. RA2's, from a committed rip (frame 0, composited; PIL hands back deltas)
python3 key.py ../../docs/ra2-ref/sprites/buildings/allied-construction-yard.gif gacnst.json blue 40

# 3. the shipped clause, on either
CHK=../clause-checks/structures.js
node run-clause.js $CHK base dir ours.json   4 4
node run-clause.js $CHK base dir gacnst.json 4 4

# 4. does it still bite? re-bake from a build with the part deleted
ART_HTML=/tmp/broken.html node dump-blds.js broken.json base
node run-clause.js $CHK base dir broken.json 4 4
```

`ART_HTML` is `art-metrics.js`'s own escape hatch, so step 4 needs no edit to
`rts.html` — copy it, break the copy, point at the copy.

## Two rules this directory exists to enforce

1. **Validate the key before believing anything keyed.** A blue-keyed rip must
   crop to exactly the bbox `docs/ra2-ref/sprites/README.md` records, at every
   threshold. `allied-construction-yard.gif` gives 213x137 and
   `soviet-construction-yard.gif` 204x153 at every cut from 20 to 60. The
   grass-backed rips carry a soft drop shadow that no single threshold resolves,
   so a claim made from one of those is only worth stating **across a sweep**.
2. **Reproduce the shipped numbers first.** Before the probe is allowed to say
   anything about a reference, run it on our own bake and check it prints what
   `art-metrics.js` prints. If it does not, the probe is wrong, not the gate.

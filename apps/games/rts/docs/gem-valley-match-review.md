# Gem Valley: first full live-input match

2026-09-15. Local working tree, Allied player versus normal Soviet AI; normal
starting funds and units, menu-supported speed 6. No spawning, grants, direct
orders, instant construction or simulated tick skipping. Camera hooks and
read-only state inspection were used alongside real sidebar/mouse commands.

## Observed sequence

| Game time | Observation |
| --- | --- |
| 0:34 | Power plant placed through the green placement cursor. |
| 1:58 | Refinery placed; both opening miners began returning via Chrono warp. |
| 2:15 | Credits had risen from 7,200 to 8,241 while barracks construction continued. Three miners were mining. |
| 3:44 | War factory placed; continuous Grizzly production began. |
| 6:16 | Five tanks received an attack-move toward the summit. |
| 6:45 | Four reached the summit; one remained on an attack-move near the southern approach. Sampling alone cannot identify its engagement target. |
| 7:16 | Second attack-move ordered toward the opposing base. |
| 7:30 | All seven tanks were at/across the south ramp area. |
| 8:15 | The attacking tanks were gone; two new tanks remained near our factory. |
| 9:00 | Only one player building remained. |
| 9:17 | Terminal defeat (`over=-1`), zero player buildings, 53 enemy units and 20 enemy buildings. |

No browser page errors were recorded. Periodic snapshots reported no nonzero
`stuck` values; that sampling does not prove that no transient stall occurred.
The resource/production/input/attack/defeat chain completed in a real match.

## Limits and next tests

The intentionally basic build stopped at one factory and used only Grizzlies
for its offensive force, with almost no defensive spending. It lost while
holding about 20,540 credits. This is not evidence that the map or faction
balance needs a numerical change. No balance values were changed on that basis.

This match did not exercise expansion harvesting, engineer captures, aviation,
naval landing or the Soviet player opening. Those remain separate coverage gaps.
We did not inspect a frame-by-frame record of the final attack, so its exact
composition and route are not established by this run.

Artifacts: `art/out/full-match-review.json`, `match-power.png`,
`match-refinery.png`, `match-barracks.png`, `match-factory.png`, and wave images.
The first run's `match-finished.png` was captured at terminal simulation state,
before the score card. The runner now waits for the UI's `over` state, saves
the whole page, takes periodic combat images, and exports the final save for
subsequent runs; those additions are not retroactive evidence for this run.

Run with `node tools/full-match-review.js`. A defeat is a legitimate completed
match, not an automation failure. Missing terminal results and browser errors
are failures. This runner is a review aid, not a competitive player or a claim
that every gameplay system is verified.

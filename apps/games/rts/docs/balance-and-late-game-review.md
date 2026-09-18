# Economy, strategy and late-game acceptance — 2026-09-16

Scope: close the two requested review gaps: representative economy/strategy
evidence, and aircraft/superweapon/capture use during complete normal-economy
matches. This is not a promise of tournament-perfect faction balance.

## Method

- Live matches use actual sidebar, map and keyboard inputs, normal starting
  money, normal build/charge times and the normal enemy AI. Hooks read state,
  move the review camera, and restore explicitly identified campaign saves.
  No unit spawning, money grants, forced charges, damage injection or skipped
  simulation ticks are used in these live matches.
- The revised strategy keeps short mixed-unit queues, repairs damaged
  structures, builds defensive coverage and additional factories, expands
  mining, and advances through the technology tree. This replaces the earlier
  five-tank attacks and single-factory cash accumulation.
- Separate headless controls pair Normal versus Normal on Gem Valley,
  Frontier and Coastal, with seeds 160916 and 260916 and both faction/starting
  position assignments. These are AI-policy controls, not human win rates.
  A run reaching the 30-minute cap is reported as unfinished, not a win or a
  successful terminal-match check. The game's economic-concession result is
  also distinct from destruction of all enemy buildings.

## Confirmed defect: isolated-lake naval spending

The old AI asked only whether water was within twenty tiles of its starting
yard. Gem Valley's two separate lakes therefore attracted shipyards and fleets.
In seed 160916, eight hulls per side occupied their own lake; neither fleet
could reach the opposing lake. An extended diagnostic still had no result at
45 game minutes. Preserved `balance-stall-diagnostic-save.json` and the original
paired results in `art/out/balance-paired-review.json`.

`aiCheckShore` now requires a shared water component reaching both starting
regions. AI shipyard placement stays in that useful component, and naval
recruitment/production observes the same decision. Versioned cache state
recomputes the old proximity-only decision when restoring a save. Player
shipyard placement, unit prices, weapon strength and AI income bonuses are
unchanged.

The four same-seed Gem Valley reruns all reached results in 13:35–20:09,
including the former 45-minute stalemate. All four happened to favour the
Allied AI; that small sample is not proof of equal faction strength and is not
a reason to tune damage until a chosen set of seeds splits exactly 50/50.
Four focused tests cover Gem Valley, dry Frontier, connected Coastal and old
save restoration. Full cross-map comparisons and live-match results follow.

## Review-runner corrections (not game defects)

An initial placement check read the ready flag before the input command had
executed, then pressed Escape with nothing selected and opened Options. The
runner now waits for command completion and uses right-click cancellation.
A subsequent Soviet placement intersected a moving miner: placement correctly
remained uncommitted. Site selection now leaves extra clearance around moving
units and retries, retaining the campaign save rather than granting a building.
The Soviet run resumes seed 2855908269 from that saved campaign; it must not
be described as an uninterrupted run. Its queued Radar and paid progress are
retained. New runs also checkpoint the review strategy separately from game
state, so resumption does not restart the construction plan.

Both campaigns subsequently hit a runner-only cancellation problem: a click
at the canvas's top-left intersected the HUD. Cancellation now uses an
unobstructed canvas position. Both completed campaigns below are resumed
campaigns, not uninterrupted runs. Expenses, losses, charge progress and
ordinary simulation time were retained across each resumption.

## Completed normal-economy campaigns

| Campaign | Result | Economy / production | Late-game evidence |
| --- | --- | --- | --- |
| Allied, Gem Valley, seed 2855860506 | Win, 27:59; no enemy buildings remain | $65,569 harvested, 89 units built, $545 left | The original four Harriers show at least 12 sampled ammunition decreases and 12 refills; naturally charged Weather Storm fired into the enemy base; oil derrick captured |
| Soviet, Gem Valley, seed 2855908269 | Win, 15:59; economic concession, 20 enemy buildings remain | $55,467 harvested, 54 units built, $7,535 left | Naturally charged Iron Curtain activated over eleven vehicles; oil derrick captured; sustained mixed-army attack |

Opened the actual storm, curtain and final scorecard PNGs; both browser reports
record no browser errors. Sources are `art/out/strategy-final-match-advanced-review.json`
and `art/out/strategy-final-soviet-match-advanced-review.json`, with corresponding
`*-full-match-review.json`, terminal saves, and activation/finished screenshots.
Aircraft ammunition samples establish repeated combat/rearming of the same
aircraft, not an exact count of every shot between samples.

The Allied Chronosphere charged but was not activated. The Soviet silo was
still charging at victory. Enemy production-building capture attempts failed;
these campaigns demonstrate neutral-building capture and income, **not**
captured-factory production. Existing isolated feature checks remain separate
evidence for features not exercised here. The completed matches close the
previous lack of representative sustained-production / late-tech campaigns;
they do not cover every possible superweapon and capture combination.

## Additional confirmed fixes

- **Captured airports:** the AI never dispatched their ready paradrops. It now
  uses a valid land staging position through the ordinary superweapon action.
  Two faction-specific tests check no offline dispatch, correct reinforcement
  type, landing, and no duplicate firing while recharging. Those tests use
  fixtures; they are not represented as normal-economy campaign evidence.
- **Scorecard reason:** economic-concession wins previously said the enemy
  base was levelled even with surviving buildings. Result text now distinguishes
  economic collapse from base elimination, for either player and win/loss.
  A focused test and a presentation replay of the actual Soviet terminal save
  verify this. Opened `art/out/economic-result-corrected.png`. Victory rules
  and timing were not changed.

A broader experiment reserving every queue's unpaid cost before optional
spending was **rejected and reverted**: it resolved one control stalemate but
introduced others. Its `reserved-budget-*` and `airport-budget-*` artifacts are
experimental results, not evidence for the final implementation. No unit
price, weapon damage or difficulty income multiplier was changed.

A narrower four-hull pre-laboratory cap also failed to improve the remaining
Coastal case and was removed. `final-naval-tech-*` records that experiment;
it is not the final implementation. The existing eight-hull limit is retained.

The live campaigns loaded before the last AI policy changes; the final paired
controls and regression suite below exercise the final code. Do not conflate
these two kinds of evidence.

## Final paired controls and remaining limits

`art/out/accepted-balance-paired-review.json` contains all twelve final-code
controls. Eleven reached a result before thirty game minutes, versus nine
in the original baseline. The remaining capped run is reported below, not
counted as a pass. Times are simulation ticks converted to minutes/seconds.

| Map | Seed | Player-zero faction | Final outcome | Time |
| --- | --- | --- | --- | --- |
| Gem Valley | 160916 | Allied | Allied win | 13:35 |
| Gem Valley | 160916 | Soviet | Allied win | 20:09 |
| Gem Valley | 260916 | Allied | Allied win | 15:59 |
| Gem Valley | 260916 | Soviet | Allied win | 18:44 |
| Frontier | 160916 | Allied | Allied win | 18:26 |
| Frontier | 160916 | Soviet | Soviet win | 23:38 |
| Frontier | 260916 | Allied | Allied win | 12:11 |
| Frontier | 260916 | Soviet | Allied win | 13:33 |
| Coastal | 160916 | Allied | Allied win | 17:12 |
| Coastal | 160916 | Soviet | **Unfinished** | 30:00 cap |
| Coastal | 260916 | Allied | Soviet win | 11:17 |
| Coastal | 260916 | Soviet | Soviet win | 11:37 |

The ineffective early-fleet-cap experiment produced identical rows, including
minute samples, to this final rerun. Removing it therefore retains all measured
improvements without an unsupported production-policy change.

The remaining Coastal run has both banks at zero and surviving units/buildings;
the connected-water-only control also remained unfinished at sixty minutes.
The airport fix does not resolve it. This remains an AI endgame/pacing limitation,
not a claim of a frozen simulation, and is not silently closed. The eight Allied
and three Soviet wins also do not establish equal faction strength. Larger
seed sets and representative human strategies are needed before balance tuning.

## Verification

Reproduction (from `apps/games/rts`):

```sh
node --test rts*.test.js
RTS_SLOW=1 node --test --test-name-pattern='AI economies actually grow|matches reach a decision|hard beats easy|no unit ends a match stuck' rts.test.js
node tools/balance-paired-review.js --tag=accepted
node tools/result-reason-review.js
```

Live-campaign review code is in `tools/full-match-review.js` and
`tools/lib/advanced-match-review.js`. The saved review JSONs preserve the
actual seeds, orders and state; the paired runner writes each result as it
finishes so capped outcomes cannot silently disappear from the report.

- Complete normal Node suite on the final implementation: **289 passed,
  0 failed, 11 opt-in skips**.
- Explicit slow simulation checks: **4 passed** (economy growth, match
  decisions, Hard/Easy differentiation, and stuck-order checks).
- No commit, push or deployment performed in this pass.

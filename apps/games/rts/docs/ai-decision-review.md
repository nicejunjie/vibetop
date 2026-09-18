# Opponent decision improvements — 2026-09-16

## Implemented

### Emergency miner production

Previously, losing the last miner could append its replacement behind multiple
tanks while other production lanes continued consuming its funding. When a
factory and refinery survive but no miner does, the AI now:

- Cancels combat vehicles ahead of the replacement through the existing
  cancellation/refund function, refunding only money already paid.
- Prioritizes the replacement without restarting its paid progress.
- Temporarily pauses optional production, while allowing queued power and
  refinery work to continue.
- Releases only its own emergency pauses when mining units return or the
  factory/refinery prerequisite disappears. Existing unrelated pauses remain.
- Does not freeze other production when a surviving captured factory cannot
  produce the faction's intended replacement miner.

No resources, units, damage bonuses or production-speed advantages were added.
This does not conjure a recovery when the bank cannot afford a miner, and it
does not address every exhausted-ore endgame.

## Verification

`rts-ai-decisions.test.js` covers both factions' refunds and miner priority, preserving
preexisting pauses, leaving healthy economies alone, and an actual replacement
produced by the ordinary paid simulation followed by automatic queue resumption.
All five retained focused tests passed. The production fixture waits long enough for the
miner's actual 59-second build time; no forced completion is used.

Full-match comparisons use the same twelve Normal-vs-Normal seeds, maps and
seat swaps as the preceding review, with normal starting resources. Artifacts:
`art/out/recovery-policy-balance-paired-review.json`; prior baseline:
`art/out/accepted-balance-paired-review.json`. These measure AI-policy behavior,
not human difficulty or proof of optimal play.

The final normal regression suite passed **294 tests**, with zero failures
and eleven opt-in skips. All four selected
extended checks also passed (economy growth, match decisions, difficulty
separation and stuck orders). The removed scouting-memory experiment's tests
are not counted as tests of the retained implementation.

The retained policy reached results in **10/12** thirty-minute paired controls,
versus **11/12** before this pass. The existing Coastal seed-160916 Soviet-seat
timeout remains. Gem Valley seed 260916, Soviet seat, changed from defeat at
18:44 to surviving the cap: 199 units produced by thirty minutes, versus 177
at the old defeat. An extended sixty-minute run remained unfinished, with
312 units produced and the opponent reduced from 27 buildings to 20. This
demonstrates recovery and continued activity, **not** a solved endgame or an
overall win-rate improvement. Artifact:
`art/out/recovery-extended-balance-paired-review.json`.

The comparisons and slow checks loaded before the final captured-factory
eligibility safeguard; the final complete regression suite includes it.
The safeguard is directly covered by a foreign-factory fixture. No human
full-match playtest was performed in this pass.

## Rejected experiment and remaining work

A scouting-memory candidate replaced whole-map army/defense totals and
air-tech knowledge with copied observations. Hidden health/death changes did
not leak into reports; mobile reports expired after one minute and buildings
remained known until revisited. Focused tests passed, but the paired full
matches stalled in all four Coastal cases (versus one in the prior baseline).
The candidate was **reverted**, not
shipped as an improvement. Its evidence is preserved separately in
`art/out/intelligence-balance-paired-review.json`.

An inspected thirty-minute Coastal state had both banks at zero, multiple
empty miners travelling toward ore, roughly 46,053 ore units still present
on the map, and undersized teams waiting to fill. This is not proof that all
ore was exhausted: harvesting access and economic recovery need further
investigation. Forcing a desperate attack merely to turn a timeout into a loss
would not establish smarter play.

Strategic strength estimates, target selection and air-tech capability still
have whole-map information. A fair-information replacement needs coordinated
scouting and recovery behavior; this pass does not claim to have completed it.

No art was changed. No commit, push or deployment was performed.

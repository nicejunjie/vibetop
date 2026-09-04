# Iron Frontier — playtest protocol

**Why this exists.** Code audits and sprite sheets do not find what a player
finds in minute twelve of a real match: a frozen superweapon clock, a harvester
idling beside ore, an AI that never attacks, a unit that will not path. The
user cannot be the only playtester of a project this size. Every phase merge in
`docs/rts-roadmap.md` is followed by a playtest pass, and the findings go into
Phase 0 of the plan as reproduced, scripted issues.

Two complementary passes, run by two agents in parallel:

## A. Human-style play (Playwright, real mouse and keyboard)

Play at 1400×900, `deviceScaleFactor: 2`, desktop only. Use the real input
paths — `page.mouse`, `page.keyboard`, clicks on the sidebar — never the
`__rtsTest` API to give orders (it may be used to *read* state). Take a
screenshot every game minute and LOOK at it. Keep a running issue log with a
one-line repro for each entry.

Scenarios (each is a whole match or until the point of failure):

1. **Standard opening, both sides, Normal.** Power → Refinery → Barracks →
   War Factory → Radar/AFC → Depot → Lab. Note every moment the UI gives no
   feedback (nothing happens on a click, a queue that stalls, a READY that
   cannot be placed, a stat that does not update).
2. **Every buildable, both sides.** Build and use every structure, defence,
   infantry, vehicle, aircraft and superweapon once. For each unit: select it,
   move it, attack with it, watch it die. For each structure: watch it build,
   take damage, be repaired, be sold. Anything that never happens is a finding.
3. **Superweapons.** Build each, watch the clock through low power and
   through a power-plant loss, fire each at the enemy base, and at your own
   units. Watch the AI fire its own.
4. **Economy over time.** Play to ore exhaustion. Do harvesters expand, idle,
   or block each other? Does income match the counter? Sell and refund.
5. **Air.** Harriers vs every AA; Kirov vs every AA; Rocketeers; what happens
   when the Airforce Command dies with jets in the air.
6. **Orders under stress.** Box-select 30 units, move across the map, through
   chokepoints, over ramps and bridges, into water edges and cliffs; queued
   waypoints; guard; scatter; rally points; control groups; deploy GI/MCV.
7. **Defence and siege.** Let the AI attack a walled-in base; attack an AI base
   with each defence type present. Note kiting, overkill, targeting choices.
8. **Hard AI, both sides, to the end.** Does it win, stall, or die? Where does
   it stop making sense (idle army, unbuilt tech, wasted superweapons)?
9. **Every map.** One match each, watching pathing around the map's feature.
10. **UI loop.** Pause/resume, New → menu → new match, help, scores, debug
    mode on/off, hover cards, tooltips, the minimap, edge scroll, zoom.

Severity: **blocker** (progress impossible or match-deciding), **major** (a
player would call it broken), **minor** (wrong but survivable), **nit**.

## B. Soak: whole matches with invariant checks

`__rtsSim(seed, dA, dB, ticks, facA, facB, everyMinute)` replays a match
headlessly. Run six seeds × both faction orders × two difficulties, 30 game
minutes each, and assert every minute (a violation is a finding with the
seed, tick and entity):

- No unit holds a move/attack order for > 60 s without moving or firing
  (stuck), unless blocked by a wall of units at the target. **The clock starts
  when the ORDER does**, and "moving" means getting measurably closer to the
  order's target — an implementation that reads `movedAt` alone fires on the
  tick an order reaches a unit that had been idle before it, and reported 120
  phantom stuck units per 24 matches (`docs/design-decisions.md`, "A stuck
  detector that started its clock before the order arrived").
- No harvester idles > 45 s while reachable ore exists and a refinery stands.
- No production queue stays `ready` > 60 s for the AI (never placed).
- Every AI-buildable unit and structure appears at least once across the
  seeds (the AI uses its whole roster).
- A built superweapon fires within charge + 60 s while powered.
- No NaN/undefined positions, hp > maxhp, negative credits, dead units still
  in `g.units`, occupancy pointing at dead buildings.
- Aircraft never > 20 s with no pad while an Airforce Command stands.
- Credits do not stay flat for > 90 s while harvesters mine.
- Match ends (someone wins) within 30 min on Hard vs Easy.

New invariants are added whenever a human-pass finding could have been caught
by one.

## Output

Each pass writes `docs/rts-playtest-<date>.md`: a table of findings (severity,
scenario, repro, screenshot path) and the invariant violations. Everything
reproduced goes into `docs/rts-roadmap.md` Phase 0 with a ☐.

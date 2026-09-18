# RA2-like experience: implementation sequence

User approved this sequence on 2026-09-15. This is not a claim of art acceptance.

1. Close outstanding art and motion problems before adding more units.
   - Tanya: retain the lean silhouette and open dual-pistol pose.
   - Ivan: distinguish carrying explosives from reaching to plant them.
   - Chrono Legionnaire: raise the supported emitter into an aiming pose.
   - Keep firing boots planted; animate joints instead of sliding the whole sprite.
   - Review shipyards, Aegis launcher attachment, dolphin and squid on water.
   - Preserve the user's accepted unit shapes.
2. Develop one deliberately designed tactical map, with distinct main/side routes,
   contested resources and useful terrain; inspect it in game before expanding
   the map catalogue. Connectivity alone is not a play-quality verdict.
3. Play complete matches through actual inputs. Record concrete economy,
   navigation, targeting, landing and AI failures before changing those systems.

## First motion batch

`tools/specialist-motion-review.js before|after` produces six-frame front/side
walk/fire strips for Tanya, Ivan and CLEG, with fixed ground anchors, 4x and
native-size views. The reference row samples the local RA2 GIF across its entire
animation (different actions, not phase-aligned matches).

The baker now exposes phase, raise and recoil to unit art. Only these three
specialists bypass whole-body firing translation. Tanya's wrists recover
independently, Ivan reaches down/out with the held explosive, and CLEG's arms
raise with the rifle. Weapon timings, projectile origins and game rules are
unchanged. This does not yet implement Tanya's separate C4-specific pose or
redo prone/death motion.

Ivan's walking legs now use separate hip/knee/ankle joints and a continuous
passing-foot lift rather than the generic front-view sideways squat. The free
arm counter-swings while the explosive hand stays controlled.

Review script checks fixed foot pixels across the six standing-fire phases,
eight bearings and both owners, and rejects frozen firing poses. These checks
are motion invariants, not likeness or acceptance scores.

Opened the resulting six-frame strips at native and enlarged sizes and the
eight-bearing firing boards. Regression suite: 223 passed, 6 opt-in slow tests
skipped. Infantry pixel checks: 624 sampled frames at DPR 1/2 passed.

The existing actual-mouse player contracts can now run against the local tree:
`../../../tests/e2e/node_modules/.bin/playwright test --config tools/playwright-rts.config.js`
from the RTS directory. This uses a loopback static server, not production.
All 10 existing player-input contracts passed, including boarding, post-reload
commands, edge scrolling, building placement and the touch boarding case.
These are targeted interactions, not a complete-match playtest.

## Shipyard and naval review

Opened completed RA2 shipyard construction frames (not the empty first GIF
frame), the paired 2x board, eight-bearing Aegis comparisons, and both fleets
on actual water at gameplay scale.

- Allied shipyard: compacted the four support caissons, exposed the rear cap,
  and gave the central crane pedestal dark steel volume and curved bearing rings.
- Soviet shipyard: replaced screen-space brick pillars with inclined machinery
  housings, continuous sloping tops and recessed front panels; increased deck depth.
- Aegis: lowered both launcher supports and canisters together, preserving their
  connection to the hull; added narrow bevels instead of a single flat white wall.
- Squid: a new all-bearing check found the long arms clipped at facing 10.
  Expanded only its horizontal sprite padding, preserving scale and world anchor.

`node tools/naval-crisp-check.js` checks 192 frames per DPR (1 and 2), both owners,
all 32 bearings, native raster consistency, clipping and unfiltered live draws.
It also produces `art/out/naval-rotation.png`, reviewed at native size.
These are rendering checks, not a visual acceptance score.

Review outputs: `art/out/shipyards-compact.png`,
`art/out/ra2-compare-aegis.png`, `art/out/world-compact-fleet-dir.png`, and
`art/out/world-compact-fleet-col.png`. No production deployment in this batch.

## Authored Gem Valley layout

The existing Gem Valley now has a reserved four-cell summit spine through both
ramps and two three-cell lowland flanks. Compact gem deposits sit beside the
summit road; separate lowland ore expansions sit beside the flank routes and
lake margins. Opening resource patches are retained. Removed random rock/tree
placement from this map in favour of fixed woodland landmarks outside the lanes.
Terrain and resource placement remain 180-degree symmetric.

Opened `art/out/world-tactical-gems.png` after each layout/render iteration.
The wide roads exposed repeated four-way wheel ruts and tile-centred bright
patches, which read as mesh/paving rather than earth. Wide road interiors now
use continuous dirt with fine grain; narrow connected tracks retain their ruts.

`rts-world-scale.test.js` checks reserved routes, neutral-building clearance,
mirrored resources and flank connectivity even with the entire summit blocked.
The combined regression run passed 226 tests, with 6 opt-in slow tests skipped.

`node tools/tactical-map-review.js` stages four tanks per route but uses real
mouse drag selection, ground-click orders and the live game clock. It observes
the middle of each route to reject unintended detours. Its target is beyond
the exit, allowing the normal formation spread without misidentifying a tank
assigned a slot on the ramp as a navigation failure.
All three route probes passed: four tanks each traversed the summit, west and
east routes. The probe centres each lane before clicking and targets clear
ground beyond the exit, not the woodland further along the west flank.
Opened the resulting `art/out/gem-valley-route-probe.png` in the real renderer.
This probe is not a complete-match playtest or a balance verdict; resource
timing, defensive strength and AI route choices still require full games.

## First complete live-input match

Ran the Allied opening against normal Soviet AI on Gem Valley through terminal
defeat at about 9:17 game time. Production, placement, mining returns and two
attack-move commands were executed through real UI inputs. No grants, spawning
or tick skipping. No browser errors recorded. The basic single-factory tank
strategy lost with substantial unspent cash; this is not a balance verdict.
See `docs/gem-valley-match-review.md` for the observed timeline and coverage gaps.
Added `tools/full-match-review.js` to make subsequent complete-match reviews
repeatable as an input workflow, with snapshots and screenshots. Remaining:
combined-arms/defensive play, expansions/captures, Soviet opening and naval play.

## Expansion-order continuity

The live-input expansion scenario reproduced a gameplay defect: after two
highland gem deliveries, the clicked cell ran out and the miner silently
abandoned the remaining gem field for ore beside the refinery. Independent
regressions reproduced the same loss of assignment for both miner types.

`rts/ore.js` now retains the explicit harvest-order anchor across depleted
cells and searches locally (six-cell search extent) before reverting to normal
prospecting. A cell emptied by another miner en route also preserves the order.
New movement commands still override it. No capacity, income or speed changes.

`rts-harvest-expansion.test.js` covers both miners, complete field exhaustion,
depletion during travel and movement override. The first two tests failed before
the fix; all four now pass. The combined regression run before the fourth test
was added passed 229 tests, with 6 opt-in tests skipped.

Run `node tools/full-match-review.js --expansion` for the actual-input scenario:
normal opening, build/train via sidebar, scout and capture an oil derrick with
an engineer, verify passive oil income excluding mining deliveries, then scout
the summit and direct a miner onto gems. It checks delivery, return and switching
to a neighbouring gem cell after the clicked cell runs out. This is a scoped
economy/capture scenario, not a second full match or a naval landing test.
Pre-fix history is preserved in `art/out/expansion-before-review.json`; the rerun
uses `art/out/expansion-review.json` and `expansion-*.png` without overwriting
the first full-match artifacts.

The post-fix live-input run passed all steps. At tick 13958 the Chrono Miner
was mining an adjacent highland gem cell with its harvest order intact after
the original cell had been exhausted and the cargo delivered. Opened
`art/out/expansion-adjacent-seam.png` to inspect the final scene. Soviet behaviour
is covered by the regression fixture, not a separate live-input run here.

## Naval landing and exit placement

Transport unloading previously searched for any empty ground within six cells,
allowing passengers to jump across open water or an enclosing cliff ring.
Unloading now searches connected dry ground from the hull or its immediately
adjacent beach. The hull cell is reserved, and passengers that cannot fit remain
aboard. A sea-side failure explains that the transport needs a clear shore.

The narrow-beach regression also exposed a separate exit-placement bug:
`near()` supplies whole spatial buckets, but `standSpot()` treated every unit
in those buckets as occupying the candidate tile. It now checks actual distance.
Five landing regressions cover both amphibious hulls, cliffs, partial loads and
a miner retaining its vehicle identity, health and rank after landing.
Two older capacity/passenger fixtures spawned ground transports on rock cell
(15,15), confirmed for seeds 8100 and 8101. They now use the existing clear-ground
fixture helper; capacity, health and rank assertions remain unchanged.

`node tools/naval-landing-review.js` passed real mouse/keyboard boarding, sailing,
rejected open-water unloading, island landing and subsequent infantry movement.
It stages units and disables AI on the real coastal map: this is a controlled
landing exercise, not a full production/economy/naval combat match. Opened
`art/out/naval-landing.png` after the final rerun to inspect the scene. The live
exercise also caught infantry movement onto gems being labelled "Harvesting";
movement feedback and acknowledgement now distinguish miners from passengers.

The complete Node regression run passed 234 tests, with 11 opt-in tests skipped;
the subsequently added miner case also passed with all five landing tests.
The shared player-input suite exposed another fixture issue in its random-map
staging helper: it checked terrain but ignored building occupancy, placing the
boarding squad inside a neutral oil derrick. Opened the failure screenshot
(preserved as `art/out/boarding-fixture-before.png`) and added an occupancy
check to scene selection; no gameplay assertion was relaxed.
The complete player-input rerun then passed all 10 cases, including mouse and
touch boarding, post-reload orders and building placement.

## Soviet live-input review and faction feedback

The full-match runner now accepts `--soviet`, resolving building names and
footprints from the actual faction and producing Rhinos instead of Grizzlies.
Its artifacts use a `soviet-` prefix, preserving the earlier Allied histories.
The initial runner attempt stopped because it tried to click the Allied power
plant name; this was a review-tool assumption, not a construction failure.

Separately, the actual Soviet opening, ready-building and low-power UI also
used Allied generic building names. Those messages now resolve the faction's
specification, matching the sidebar's Tesla Reactor. The focused browser check
`node tools/faction-feedback-review.js` passed both factions' opening, completed
power building and low-power wording. Construction uses real clicks and time;
the power deficit alone is a paused UI fixture, not an economic scenario.
Opened `art/out/faction-ready-col.png` to inspect the resulting message.

`node tools/full-match-review.js --soviet --expansion` passed on seed 2820593982:
normal AI/resources, real production, engineer capture of the oil derrick,
passive income, War Miner highland delivery and continued adjacent-gem mining
after the clicked tile was exhausted. Final observation tick 15227. Opened
`art/out/soviet-expansion-adjacent-seam.png`, plus the actual base/factory views.
This closes the earlier live-input Soviet mining coverage gap; it is still a
scoped expansion exercise, not a complete-match or balance verdict.

Node regression run after the UI fix: 235 passed, 11 opt-in tests skipped.
No unit stats, accepted artwork, or production deployment changed in this batch.

The separate complete Soviet-vs-Allied normal-AI match (seed 2820628130)
reached the defeat scorecard at 9:33, tick 34381. Power/refinery/barracks/factory
were built through the sidebar, Rhinos exited the factory, and two attack-move
orders advanced through the highland route into combat. Final state: no own
buildings, five surviving units, roughly $25,413 unspent; enemy 38 units and
21 buildings. No browser errors. Opened the factory, first-wave, combat and
final-scorecard screenshots, not just the state log.

This deliberately simple single-factory, pure-tank, undefended opening loses
with substantial unused income. It does not establish faction balance, nor
cover combined arms, rebuilding or full naval economy/combat. Artifacts:
`art/out/soviet-full-match-review.json`, `soviet-full-match-final-save.json`,
and `soviet-match-finished.png`. One combat screenshot also shows small bright
effects over unrevealed ground; projectile/effect shroud handling merits a
separate controlled reproduction before declaring its precise cause.

## Combat effects under shroud

Controlled browser reproduction confirmed missing visibility checks: explosions,
smoke, debris, crate pickup glyphs, shots and enemy aircraft wrecks were drawn
over wholly unexplored ground. This establishes a renderer defect; it does not
identify the exact effect responsible for every bright pixel in the earlier
combat screenshot.

Added shroud checks for local effects, projectile positions/trail samples,
enemy wrecks and enemy parachutes. Flak uses its actual tracer/burst phase.
Instant beams are suppressed if any part of their ground path is unrevealed,
so a visible target cannot expose a hidden emitter or cross a gap-shrouded
strip. This is conservative whole-beam suppression, not pixel-clipping of a
partially hidden beam. Own wrecks/parachutes and command pings retain their
existing player-feedback visibility. Global superweapon warnings, sky washes,
damage, targeting, simulation and accepted unit art are unchanged.

`node tools/shroud-effects-review.js` checks 15 effect types in revealed and
unrevealed scenes, plus four mixed-visibility projectile/beam cases (34 checks).
The hidden effects match the empty scene; revealed effects and command pings
remain visible. `--before` is an observation mode, not a passing-test claim.
Opened `art/out/shroud-effects-before.png`, the repaired scene, and the
30-panel `art/out/shroud-effects-board-after.png` to inspect every sampled
effect at game scale. The board uses direct canvas captures so the pause/HUD
overlay does not obscure the effects being judged.
All 34 browser checks passed; the full Node suite passed 235 tests with 11
opt-in tests skipped. No production deployment in this batch.

## Building repair and production recovery

A controlled live-input recovery scene reproduced incorrect Soviet repair
charging: a half-health Tesla Reactor cost $60 to restore, using the Allied
$800 plant price instead of the reactor's $600. The HUD also called it a Power
Plant. Repair now resolves the structure's own faction specification (including
captured structures), and the final tick charges only for HP actually restored.
The same real repair action now costs $45 and names the Tesla Reactor correctly.
Three regression cases cover both native factions and a captured reactor's
last missing HP. The Soviet half-health regression failed before the fix.

The lost-factory simulation correctly preserved two queued Rhinos and their
partial progress without further spending, but its cameo still looked like a
normal active queue. It now displays WAIT with a cold progress hand; the drawn
tooltip says to rebuild the missing producer and that progress is retained.
This is derived UI state, not a new queue pause flag, so it does not overwrite
the player's hold/cancel choices. Opened `art/out/recovery-before.png` and
`recovery-waiting.png` to compare the actual sidebar and tooltip.

`node tools/recovery-review.js` stages the base, damage and factory loss, then
uses real repair/production/rebuild clicks and normal simulation time. No
income-producing units remain in the fixture, isolating repair and queue costs.
This is a recovery exercise, not a complete defensive match. `--before` records
the pre-fix repair/queue observations without claiming the incorrect cost passed.
The completed live-input rerun passed: repair charged $45, the missing-factory
queue and bank stayed unchanged, rebuilding through the sidebar resumed the
original partial tank, and a Rhino actually exited the replacement factory.
Opened `art/out/recovery-resumed.png` to verify the final scene. Full Node
regression suite: 238 passed, 11 opt-in tests skipped. Not deployed.

## Manual defence shutdown

The actual Power-button scene reproduced an OFF-labelled Tesla Coil still
firing: after allowing the previous shot to finish, the target fell from
99800 to 99600 HP while the coil was manually disabled. The three defence
regressions (Tesla, Prism, Sentry Gun) also failed before the fix. Their
observation window exceeds the slow Tesla firing cycle, avoiding a false pass
from sampling only its cooldown.

`stepBld` now distinguishes manual shutdown from a grid brown-out. A disabled
weapon/service stops, clears pending charge/target/support state, and reacquires
after reactivation. Paid maintenance on the building itself remains possible.
Service Depot vehicle repair pauses while disabled. Offline Prism Towers cannot
contribute support beams. Grid loss also clears an unfinished unpowered charge;
the existing Tesla Trooper brown-out exception remains separate from manual OFF.

Six focused regressions cover defence disable/enable, Prism support, cancellation
of a pending charge and Service Depot repair. The real-input browser rerun
`node tools/power-control-review.js` passed: target HP stayed at 99800 while OFF,
then decreased after clicking Power again. Opened `art/out/power-off-before.png`,
`power-off-after.png`, and `power-restored.png`; the first visibly shows a bolt
from the dark OFF-labelled tower, unlike the repaired scene. This is a controlled
combat fixture, not another complete match.

This batch does not claim a complete audit of producer/tech-building shutdown:
those have separate availability/queue code paths. Spy-induced grid blackout
versus production speed also needs a dedicated follow-up; `powered` accounts
for blackout, while `prodSpeed` currently derives its penalty from supply/demand.
Full Node suite passed 244 tests with 11 opt-in tests skipped, including the
existing Tesla Trooper-powered coil behaviour. No deployment in this batch.

## Producer shutdown and sabotage blackout

The producer audit reproduced the next power-control defect: a manually
disabled War Factory still progressed from 8.33% to 16.27% and spent roughly
$71 during the observation window. Six lane regressions and a spy-blackout
speed regression failed before the fix.

Queues now require an enabled producer before progressing or charging. Disabled
producers do not provide a multiple-factory speed bonus or an exit. A completed
vehicle already inside a disabled factory waits in the bay. Another enabled
factory may temporarily take over, while the user's chosen primary designation
survives and returns when re-enabled. Power cycling does not release a manual
queue pause. This changes operational production, not technology prerequisites
or which captured-faction units appear in the catalogue.

Spy blackout now applies the existing total-blackout 0.5x production floor even
when nominal supply exceeds demand, and normal speed returns on expiry. Its
periodic HUD message identifies temporary sabotage rather than asking for a
new power plant. Producer queue tooltips distinguish "Power on" from "Rebuild"
while retaining the WAIT marker and saved progress.

`node tools/recovery-review.js --power` passed actual repair/queue/power-toggle
inputs: credits and progress were constant while OFF, then the original Rhino
completed and left the factory after reactivation. Opened the before, waiting
and resumed `art/out/production-power-*.png` scenes. Base setup remains a fixture,
not a new full match. Ten focused tests cover all lanes, blackout expiry,
multiple factories, held-door release and preservation of a player's pause.
The blackout HUD is separately checked by the paused UI fixture in
`tools/faction-feedback-review.js`, not by claiming a live spy-infiltration run.
Both faction feedback checks passed; opened `art/out/faction-blackout-col.png`.
Full Node suite: 254 passed, 11 opt-in tests skipped. Not deployed.

## Airfield recovery and superweapon shutdown

Reproduced and repaired offline airfield servicing and armed aircraft hovering
indefinitely after losing a landing pad. A disabled airfield retains parking
but supplies no reload/repair. Displaced aircraft retain return intent until a
replacement slot exists, while explicit movement still overrides that intent.
Six regressions cover service restoration, destroyed/captured fields, delayed
replacement, distinct slot reservations and command override.

`tools/airfield-recovery-review.js` passed actual Power clicks and live-clock
service/relocation checks in a staged scene. Opened the OFF scene and the
replacement-pad scene after the landing animation finished. Full suite at this
point: 260 passed, 11 opt-in skipped. This is not a full aircraft combat match.

All five superweapon countdowns also ignored their own building's OFF state.
They now pause without losing progress; already charged weapons retain charge
but cannot target/fire while all their chargers are disabled. One enabled
charger keeps the shared timer operational. The HUD distinguishes OFFLINE from
grid LOW POWER. Existing grid-loss semantics for an already charged weapon and
technology prerequisite rules are unchanged.

Six dedicated superweapon regressions passed. `tools/super-power-review.js`
passed actual Power toggles, paused timer, blocked targeting and restoration;
its ready charge is an explicit fixture, not a claimed ten-minute charging run.
Opened the offline icon/building scene. No deployment.

The full suite after superweapon shutdown passed 266 tests, with 11 opt-in
skips. A follow-up economic audit reproduced three more OFF-service defects:
oil income/hospital healing continued, an offline purifier still boosted
deliveries, and an offline refinery still accepted cargo. Manual shutdown now
pauses these services. Automatic miners can divert to another enabled refinery;
an explicit docking choice waits with its cargo intact and resumes on power-on.
Captured refineries no longer remain valid delivery destinations for their
previous owner's miner. Ordinary grid-brownout economics are unchanged.

Six economic regressions passed, including both miner types and explicit
docking retention. `tools/economic-power-review.js` passed real power-toggle
inputs, frozen oil income/cargo, exact resumed delivery and restored oil payouts.
Opened both screenshots. These economy scenes are staged, not full matches.

Added the captured-refinery regression (seven economy cases now pass), and
corrected the delivery popup to show the actual credited amount including an
enabled purifier's bonus. The browser exercise verifies both a $125 credit and
the +125 popup for a $100 load. Neutral captured structures now show their OFF
label and darkened surface, rather than silently stopping income/healing.

Radar availability also used building ownership rather than enabled state.
`radarUp` now requires an enabled Radar or Airforce Command and a powered grid.
`tools/radar-power-review.js` passed both types: real Power clicks blank the
minimap and block camera navigation, then restore navigation on reactivation.
Opened the Airforce Command OFF screenshot. Tech prerequisites remain separate.

Latest full Node run: 273 passed, 11 opt-in skipped. All ten actual-input
Playwright contracts passed, including touch boarding. `git diff --check` clean.

## Defensive and coastal complete-match review

The input runner now supports `--combined` (infantry, two factories, ground/AA
defence, attempted repairs) and `--naval` (Coastal, shipyard, Destroyers).
Artifacts have distinct prefixes so earlier match records remain intact.
The first defensive runner attempt used the art nickname `guardian` rather than
the roster key `rocket`; it stopped in the harness and is not a gameplay failure.

The corrected defensive run, seed 2821560404, reached defeat at 10:33, tick
38017, with no browser errors. It built nine structures including both factories,
trained GIs/Guardian GIs/Grizzlies and lost production buildings under attack.
The production plan was late: tank queuing started only after the second factory,
and it never accumulated the five-tank threshold for an offensive wave. This is
a mixed-unit defensive/loss exercise, not proof of coordinated combined-arms
attacking or a balance verdict. Final cash was about $11,977; three units survived.
Opened the built base, combat and final-scorecard images.

The Coastal run, seed 2820888330, reached defeat at 10:47, tick 38866, also with
no browser errors. It constructed the shipyard through normal production,
launched a five-Destroyer wave at tick 23778 and a second order at tick 27427.
Opened departure, coastal combat and scorecard images. Final state: one Destroyer,
no own buildings, about $16,304; enemy 36 units and 18 buildings. This fleet-first
strategy leaves its land base undefended. It covers normal naval economy,
production, sailing and combat, not a full economy-to-amphibious-landing campaign.

The defensive combat screenshot exposed a stale-hover bug: a destroyed factory
still showed its old HP until the pointer moved. Reproduced separately with a
stationary pointer: the demolished factory still read 1000/1000 HP. Hover cards
now refresh on the existing 150ms cursor beat, clear dead/departed targets and
resolve the building's faction and actual maximum HP. `tools/live-hover-review.js`
passed damage, destruction and departure checks. Opened the repaired scene.

All six opt-in slow simulation checks passed: deterministic replay, clean-state
replay, AI economy growth, terminal decisions, difficulty ordering and no final
unactionable orders. These simulation checks are not art-quality judgments.
No accepted unit geometry, art baselines, deployment or repository history changed
in this gameplay/service batch.

Final follow-up: the Chrono Miner's charged teleport now also rechecks refinery
ownership before relocation, not merely before unloading. The added capture-
during-charge case and all eight economy cases passed. The full post-hover run
passed 273 tests (11 opt-in skips); the extra teleport case was then run in the
focused eight-case suite. This accounting does not relabel focused tests as a
second full-suite run.

## Input-fixture boundary failure found during final verification

The post-hover input suite initially had one attack-target failure (nine other
contracts passed). Opened the failure screenshot and retained click-state
diagnostics; it was not dismissed as a flaky pass. The staging helper validated
only a five-cell centre, while this scenario placed its target seven cells out.
A 50-seed simulation audit found eleven invalid target placements (rocks or
outside the map). Two subsequently captured failures show targets at (11,64)
and (7,64), outside the 0..63 bounds. `rightOrder` correctly rejected these map
coordinates; AI then moved the invalidly spawned infantry back inside, explaining
the misleading later screenshot.

The shared input fixture now validates all actual spawn positions and their
approaches, even when selecting a smaller clear area. Its screen helper also uses
the renderer's height/zoom projection rather than a flat formula, and attack
clicks use the target's current position. Added a raised-terrain variant; retained
attack type, exact target ID, focus flag and approach-distance assertions.
The coordinate/projection improvements alone did not eliminate the out-of-map
failure; the diagnostic reproduction above motivated the spawn-boundary fix.

Final complete reruns on the repaired tree: 274 Node tests passed, 11 opt-in
skipped; all 11 player-input contracts passed, including the added high-ground
case. The earlier six opt-in simulation checks passed separately. Preserved
the pre-fix diagnostic report as `art/out/attack-boundary-before-review.json`.
The corrected ordinary/high-ground attack pair then passed five repetitions each
(10/10), with the original attack/focus/distance assertions intact.

## Grounded infantry motion and complete combined/landing review (2026-09-16)

Replaced the whole-standing-figure prone transform with projected joint poses:
separate hips/knees/ankles and shoulders/elbows/hands, a supported chest, and
counter-cycling crawl limbs. Down/up now traverse six poses; the intermediate
knee touches down before the legs extend. Death uses its own relaxed collapse
frames rather than ending as an alert prone rifleman. Living standing/walking
geometry remains unchanged. Corpse draws now use native nearest-neighbour
sampling and a device-snapped origin, including burn/electric overlays.

Tanya building attacks record a distinct planting action. Her legs bend while
boots stay grounded, pistols are holstered and the hands place a small charge;
the building attack no longer emits a pistol tracer. This changes presentation,
not C4 damage, attack range, cooldown or input responsiveness. Moving interrupts
the visual recovery. Added four simulation tests for C4 versus pistol firing,
movement override, six-phase transitions and transitions starting at tick zero.

Opened sampled local RA2 animations and fixed-scale before/after pose boards,
then the thirteen-unit/eight-bearing roster and a rendered ground scene.
The first pose pass exposed mismatched Ivan/Spy clothing and standing gun parts
inside reused head crops; corrected those instead of treating the initial render
as final. Specialized head rendering excludes the Flak cannon and Desolator
equipment; carried tools, explosives, emitters and Tesla gauntlets stay attached
to the new hands. The review scene keeps both bases alive so it cannot silently
switch the test soldiers into victory cheers.

The complete-match runner now starts tank production immediately on the first
factory and explicitly sends infantry support with its attack waves. Added
`--landing`, which produces its transport/passengers through the normal economy,
boards through clicks, crosses the bay, unloads/reboards on the island, then
attempts the hostile coast and inland orders while the enemy AI remains active.
These workflows require actual completion evidence; their existence alone is
not a successful-playtest claim. Final results follow below.

The real-click C4 scene found a separate sequencing defect: killing the last
enemy building switched Tanya directly into victory cheer, hiding every planting
frame. C4 recovery now precedes the victory pose; a fifth focused test covers
this and the real-click review observed all six frames in order. Opened
`art/out/tanya-c4-live.png`. Damage and victory timing remain unchanged.

The first normal-economy amphibious run stopped on an overly tight parking
expectation near the starting base, before boarding. The transport had moved
nearby and cleared its move order. Preserved `landing-failure.png` and its report;
the review now chooses an unoccupied 3x3 land apron rather than a single free
cell beside structures, then verifies boarding itself. The second run uses a
distinct `clear-apron-` prefix. No game pathing rules were relaxed for this.

The saved Coastal campaign exposed a genuine transport-class defect, not just
a review-runner issue. Five Destroyers acquired `enter` orders for the landing
craft when it was clicked with escorts selected. `canBoard` treated every
non-infantry unit as vehicle cargo. It now explicitly accepts only class `v`
for vehicle slots, rejecting ships and sea creatures. The ENTER runtime also
validates eligibility before walking toward the hull: old invalid orders could
otherwise stall just outside boarding distance forever. Added three tests for
all naval roster types, preserved infantry/tank/miner loading, and clearing a
saved invalid order while still far from the hull.

Other review corrections are kept distinct from game defects: this random
island's (31,31) is ROCK, so refusing the scripted destination was correct;
landing sites now use scouted passable cells. Unloaded passengers receive new
world entity IDs. Group boarding uses the game's type selection rather than
assuming rapid same-type clicks remain single selections. A transport sent into
the defended enemy harbour was destroyed normally; that loss is retained in the
subsequent save, where a replacement was purchased through production. Escort
orders and a flank landing replace the unsupported direct harbour assault.

Two additional Gem Valley full matches finished without browser errors:
Allied seed 2827048879, defeat at tick 34875 (9:41), two attack waves, $11,190
remaining; Soviet seed 2830742920, defeat at tick 41213 (11:26), two attack waves,
two factories/two barracks, $18,021 remaining. Opened their actual combat and
scorecards. These are evidence of completed input/gameplay paths, not a finding
that Normal is fairly balanced: their macro still underuses income and they
attack defended positions without higher technology. No costs, weapon damage,
AI bonuses or difficulty parameters were changed on that evidence alone.

The regenerated Tanya/Ivan/CLEG standing-fire/walk review PNGs are byte-for-byte
unchanged from the preceding accepted-motion batch. This checks preservation,
not likeness. The expanded crispness check sampled 2,080 frames at both DPRs,
including grounded actions and a live corpse draw; no clipped/soft body pixels,
grid changes or filtered live draws were found.

The repaired Coastal campaign also reached its actual scorecard: seed
2830713499, defeat at tick 55893 (15:31), 76 units built, 36 enemy units
destroyed, $21,200 harvested, no browser errors. This was a resumed campaign,
not an uninterrupted clean-start run: the replacement transport and prior
combat loss remained in the saved world. Six passengers reached the hostile
flank, unloaded, and received inland attack orders through real input. Opened
`verified-coast-landing-enemy-coast.png`, `verified-coast-landing-inland-push.png`
and `verified-coast-landing-finished.png`. The quiet interval after the assault
was not a frozen save: the enemy subsequently destroyed the remaining economy
and base. No save-restoration or economy change was justified by that interval.

Final verification: 282 normal Node tests passed (11 opt-in skips); all six
selected slow simulations passed, including economy growth, match decisions,
hard/easy differentiation, determinism and stuck-order checks. All eleven
browser input tests passed. A separate actual-click boarding check confirms
that clicking the craft with a Destroyer selected no longer boards the ship,
while infantry still board. The grounded live scene and final scorecard were
opened and visually inspected; these visual checks are separate from numerical
crispness and regression checks. This closes the concrete defects found in
this pass, not a claim that all possible bugs or balance questions are solved.
No commit, push or deployment was performed in this pass.

## Economy and late-game follow-up — 2026-09-16

Completed two representative Normal-economy campaigns with sustained mixed
production, mining expansion, higher technology, capture income and naturally
charged superweapons: Allied victory at 27:59, Soviet victory at 15:59. Both
were resumed after review-runner input failures; no funds, units or charges
were granted. The same four Allied Harriers repeatedly fought and rearmed.
Opened actual activation and scorecard images, not just state reports.

Fixed AI investment in disconnected lakes, missing captured-airport paradrop
dispatch, and scorecards incorrectly calling economic concessions base
destruction. Rejected broad spending-reservation and early-fleet-cap
experiments when comparisons did not justify them. Prices, damage and
difficulty multipliers remain unchanged.

Detailed methodology, preserved artifacts, coverage boundaries, paired
controls and the remaining Coastal stalemate are recorded in
[the economy and late-game review](balance-and-late-game-review.md).
This is representative acceptance evidence, not proof of perfect balance or
coverage of every superweapon/captured-production combination. No commit,
push or deployment was performed.

## Opponent recovery decisions — 2026-09-16

Added emergency last-miner replacement: cancel queued vehicles ahead of the
miner with normal paid refunds, pause optional lanes, preserve miner progress,
then resume those lanes. Guard against an incompatible surviving captured
factory. A scouting-memory experiment was reverted after all four Coastal
controls stalled. The retained recovery policy keeps one formerly defeated
Soviet economy alive but does not finish that match within sixty minutes;
endgame conversion remains open. See [AI decision review](ai-decision-review.md)
for the 294-test regression result, five focused cases and paired-match limits.

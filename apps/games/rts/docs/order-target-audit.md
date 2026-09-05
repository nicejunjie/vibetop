# Right-click order targets — what works, what silently does nothing

Opened 2026-09-04 from one report: *"there is no way I can let miner to go back
to refinery, refinery isn't an end point. There are many such stupid issues."*

## The one root cause

`rightOrder()` is a ladder. Every rung that matches issues a real command; if
none match, it falls through to a plain **`move` to the clicked tile**. When the
click was on one of **your own buildings**, that tile is inside a footprint the
pathfinder cannot enter, so the unit walks up, stops several cells short, and
nothing happens. The mechanic you were reaching for usually exists — there is
simply no order that arrives at it.

Measured, before the fix, at an identical camera and seed:

| attempt | result |
|---|---|
| loaded miner right-clicks its own Refinery | dist 13.09 -> **4.00**, state `idle`, never docked |
| damaged vehicle right-clicks its own Service Depot | stops **2.96** cells off the pad, `onPad:false`, never repaired |

The Service Depot's repair code is *correct* — it heals anything touching the pad
(`|dx| <= gw/2 + 0.6`) and even shakes out a Terror Drone, which is RA2's only
cure. Nothing ever reached it.

## The matrix

`wantsOwn` (the "order to my own thing" rung) admitted exactly three cases.

| selected | own target | RA2 | ours before | status |
|---|---|---|---|---|
| Harvester | Refinery | dock, unload, resume | `move`, stops short | **FIXED** — reuses `homeRef` + state `toref`, the same path a full miner sets for itself |
| Vehicle (damaged) | Service Depot | drive onto pad, repair | `move`, stops short | **FIXED** — aims at the pad centre so the existing repair can see it |
| Tesla Trooper | Tesla Coil | hand-charge | `own` -> `coil` | ok |
| Engineer | damaged own building | repair | `own` -> `capture` | ok |
| Crazy Ivan | anything of ours | bomb it | `own` -> `attack force` | ok |
| Infantry | own Transport | board | `enter` | ok |
| Infantry | own garrisonable block | reinforce | `garrison` | ok |
| Production building selected | ground | rally point | `rally` | ok |

Enemy-side interactions ride the `attack` command and were already wired:
Engineer capture (`UNITS[u.type].capture` in the attack path) and Spy infiltrate
(`[SPY] Infiltrate=yes`).

## The five candidates — measured 2026-09-04

Driven through the REAL click path (click the unit, right-click the target) with
each case on its own patch of ground. Two harness traps cost several runs and are
recorded so the next probe does not repeat them: `__rtsScreen()` returns
CANVAS-relative coordinates while `page.mouse` takes PAGE coordinates, and the
app's top bar sits above the canvas — every click landed ~40 px high until the
canvas bounding box was added; and spawning every case at the same offset stacked
the units so the click selected whichever was on top.

| case | target confirmed | result | verdict |
|---|---|---|---|
| Harrier (ammo 0) -> own Airforce Command | `airforce`, built | **no order at all**, both runs | **DEFECT.** A click that does nothing and says nothing. Whether RA2 lets you send a plane home to rearm is a separate question; a silent no-op is wrong either way |
| Vehicle -> own Service Depot | `depot`, built | plain `move` | **UNRESOLVED.** The predicate itself is correct — tested directly in-page: `cls 'v'`, `air false`, depot `kind 'b'`, **predicate true** — so `wantsOwn` is wired right and the click's target resolution did not return the depot in that run. Needs a target-picking probe, not another order probe |
| Terror Drone -> our own tank | `lancer` | `move` in one run, none in another | **NOT ESTABLISHED** — results varied between runs |
| MCV -> ground | ground | `move`, no deploy | Consistent with RA2 (deploy is its own command). Probably correct; not a defect |
| Chrono Legionnaire -> our own tank | `lancer` | varied | **NOT ESTABLISHED** |
| Yuri -> our own tank | `lancer` | varied | **NOT ESTABLISHED** |

Four of the six are reported as unestablished rather than guessed at. The probe
needs to settle the unit before clicking (units drift, and the click chases a
stale screen position) before those four mean anything.

## The rule this leaves behind

**A right-click that resolves to one of your own buildings must never fall
through to `move`.** Either a rung claims it and issues a real order, or the
click should say why nothing happened. A unit walking up to a building and
stopping is indistinguishable from a bug, because it *is* one.

The cheapest guard against regression is the e2e test added with this pass
(`right-clicking your own refinery sends a loaded miner home`), which asserts the
miner ends up with a `homeRef` and in a docking state — proved red against the
pre-fix build, where it came back `homeRef:false`.

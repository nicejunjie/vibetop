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
| Harvester | Refinery | dock, unload, resume | `move`, stops short | **FIXED TWICE** — see the second pass below; the order was right, everything around it was not |
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

---

# Settled, 2026-09-05 — and the audit above was wrong about the depot

A rebuilt probe closed every open row. The lever that finally made it
deterministic was **`G.opt.speed = 0`**: the raf loop computes
`_step = STEP / (opt.speed/4)`, so speed 0 gives `Infinity` and the world only
moves when the probe calls `step(n)`. Drift is then not *settled*, it is
impossible. Four runs across two processes were byte-identical.

Five more traps had to be paid, none of them in the plan, and each produced a
plausible wrong answer first:

1. `begin()` sets `state='play'` but leaves the **title overlay** covering the
   canvas, so every click is swallowed and everything reads `order: null`.
2. A bare match has **no enemy**, so `g.over = 1` on tick 0 and `finish()` fires
   180 ticks later; after that `pointerdown` returns early and the probe
   **silently measures nothing**. This is why only the first case ever worked.
3. RA2's **select-all-of-type**: two clicks on the same unit type within 380 ms
   select every visible one, so two consecutive cases ordered each other's units.
4. Reading a target's position from the fixture rather than live.
5. **`order.t === 'move'` is not proof of a fall-through.** See below.

## The depot: the earlier inference was wrong

The audit above says *"`pickAt` did not return the depot"*. **It did.** Measured
with a 7x7 hover sweep over the whole footprint, every sampled point inside it
returned the Service Depot. `wantsOwn` was true and `cmd('own', …)` fired all
along. What looked like a fall-through was **the depot rung's own handler
writing a `move`** — the two are told apart by the `id` field (`orderUnitsTo`
always writes `id: 0`; the own-handler does not) and by `say()`:

| case | order | `id` | say |
|---|---|---|---|
| vehicle -> own depot | `{t:"move",x:46,y:14}` | absent -> own handler | "Going in for repairs" |
| vehicle -> bare ground | `{t:"move",x:22,y:7,id:0}` | present -> fall-through | "Moving" |
| miner -> own refinery | `null`, `state:'toref'` | — | "Returning to the refinery" |

**The real defect was one layer down: the order fired and the vehicle was still
never repaired.** The order aimed at `round(cx),round(cy)` — a cell *inside* the
footprint, which the pathfinder cannot enter — and a move completes only within
1.183 cells, which from outside a 3x3 can never trip. So the order was never
completed, it was **abandoned** by the `noProg` branch, and the vehicle stopped
wherever it happened to stall: 1.912 to 2.145 cells out, against a repair reach
of `gw/2 + 0.6` = 2.1. **It worked 89.9% of the time by coincidence, on a
0.02-cell margin** (62 of 69 live trials; 2 of 8 headless).

Fixed by aiming at the nearest **passable** cell on the ring outside the
footprint, so the order can complete, plus a `dockB` flag that says "I was sent
here" — the ambient "touching the pad" reach stays at 0.6 so the depot does not
quietly become a field hospital for anything fighting nearby.

## Two corners of every building were dead to clicks

Found on the way, and worse than the thing being looked for. `pickAt` tested
buildings with a screen-space **circle** of radius `max(gw,gh) * 22`, but a
footprint projects to an isometric **diamond**: for a 3x3 the anti-diagonal
corners sit `(1.5 - -1.5) * TW/2 = 96` px out against a 66 px radius. Confirmed
on the 4x3 refinery too (112 vs 88). The clicked pixel is now inverted to a tile
and tested against the footprint rectangle.

Sampling cell CENTRES does not catch this — at +-1 cell the corner is only 64 px
out and slips inside the circle. The regression test walks the footprint *area*.

## The three "not established" rows: settled, and not defects

Terror Drone, Chrono Legionnaire and Yuri right-clicking **our own tank** all
give a fall-through `move` (`id: 0`, say "Moving"), and the unit acknowledges and
moves. These are orders to your own **unit**, not your own **building**, so the
rule this document sets does not bite, and the click is not silent. *(Inferred:
RA2 agrees — a Terror Drone only infests hostile vehicles, `Temporal` is not
offered on friendlies, Yuri cannot control his own side, and none of the three
has an `AttackCursorOnFriendlies` equivalent, unlike `[IVAN]`.)* No fix.


---

# Second pass, 2026-09-06 — the same report came back

*"cannot force miner to return to refinery"*, five days after the row above was
marked FIXED. The order was never the problem the second time. Three things
around it were, and each one on its own is enough to make a player conclude the
refinery is not an order target.

| defect | measured before | after |
|---|---|---|
| cursor over your own refinery, miner selected | **`select`** — the one cue the game gives said "not an order target" | `enter` (RA2's Enter mission; both miners carry `VoiceEnter=`) |
| Chrono Miner, forced dock | **drives** (`toref`) while the automatic full-load return *warps* | warps, identically — one `sendHome()` serves both |
| target refinery, stale seam clock | **retargets to the nearest after 1 tick** (stallAt age 954; unloaded 24 cells from the one clicked) | keeps the clicked refinery |

`stallAt` is the give-up clock and `'mining'` never refreshes it, so any miner
that had been working a seam for fifteen seconds entered `'toref'` already past
the 900-tick limit. **With one refinery on the map this is invisible** — which
is how it survived both a fix and a test.

## Why the first pass's test did not catch any of it

It set the miner's cargo to **full** and then asserted `homeRef` was truthy and
the state was one of four. A full miner returns home on its own: the assertions
were true before the click, and would have been true if the click had done
nothing whatsoever. It also passed `__rtsScreen`'s canvas-relative coordinates
to `page.mouse`, which takes page coordinates — the exact trap recorded two
sections above in this same file, so every click landed about 40 px high.

The replacement drives a **part-loaded, actively mining** miner (nothing but
the click can send it home), adds the canvas bounding box to every click,
checks the cursor, and asserts the miner banks credits **at the refinery that
was clicked** with a second refinery sitting closer. Proved red against the
pre-fix build first: `Expected "enter", Received "select"`.

Three headless regression tests in `rts.test.js` cover the same ground through
`applyCmd`'s real `own` case, reached by a new `orderOwn` harness hook. That
hook exists because the hooks beside it (`orderCoil`, `orderCapture`)
**re-implement** their command instead of calling it — a test written against
one of those cannot fail when the player's path breaks, which is the shape of
bug this whole file is about.

## Still open, deliberately

* **No pause at the door.** RA2 pauses a returning miner briefly at the
  refinery *unless* it was micro-ed — that pause is the whole reason manual
  returns are worth doing. We have no pause on either path, so a forced return
  saves less than it should.
* **Automatic returns should head back to the patch they left**; ours takes the
  nearest ore, which is RA2's behaviour after a *forced* return. Both of these
  move every economy number in the balance suite and want their own pass.


---

# Third pass, 2026-09-07 — *"clicking the docking sign has no effect"*

The same area, a third report, and this time with the **aim point** in it:

> "I can force miner go to refinery, but it stays there, doesn't go in dock,
> doesn't unload ore." … "to force miner go back to refinery, clicking the
> docking sign has no effect. I click a bit in front of the refinery, and the
> cursor is a moving cursor not a docking cursor."

Both passes above tested the ORDER and never the CLICK. `orderOwn` is handed
the refinery; the e2e clicked its **centre**. The player aims at the dock — and
the dock is not on the foundation.

| defect | measured before | after |
|---|---|---|
| click on the drawn dock ramp | `pickAt` -> **null** -> a plain `move`; the miner drove to the kerb, parked, banked nothing (1200 ticks at (11.86,6.77) with `atRefinery` **true**) | resolves to the refinery; `cmd('own')`; docks |
| cursor over the drawn dock ramp | **`move`** | `enter` |
| `refDock` for a 4x3 refinery at cy 6 | **(7, 9)** — the footprint ends at y 7 and the ramp is drawn on y 8, so the destination was a clear tile of grass *beyond the building's own art* | (7, 8), the apron the sprite draws |
| where the ore was banked | wherever the miner first crossed `dist < 3.90` — **margin 0.00-0.04 of a cell over 16 approach bearings**, up to 4 cells from the dock, sometimes behind the building | standing within half a cell of a door cell, every bearing |

**Both refinery sprites draw their dock outside the foundation** — the Soviet
pale ramp slab running off the dished pit, the Allied hoist mouth under the
drum — and `pickAt` resolves a building from its foundation rectangle only. So
the most obvious thing on the building to aim at was the one part of it that
was bare ground. The art file had been saying so in its own words the whole
time: *"the dock tile centre is (cx - 64, baseY + 32)"*, i.e. two cells down the
`+gy` face, one closer than `refDock` was aiming.

**This was never about `forcedDock`.** The automatic full-load return shares
every one of these faults: same `refDock`, same `atRefinery`. `forcedDock`
removed the accident that used to paper over the arrival mismatch (an unforced
give-up re-chose the nearest refinery, which sometimes unloaded it by luck), it
did not create one.

## The shape of the fix

`footBounds(b)` gives the footprint in cell indices — the missing primitive.
`b.cx` sits on a **half** cell whenever the span is even, which is exactly what
`Math.round(cy + gh/2 + 1)` rounded a whole tile past. From it:

* `dockApron(b)` — the cell row outside the `+gy` face, the face both sprites
  draw the dock on. `refDock` aims at it, and `dockAt()` makes a click on it
  mean the refinery for a harvester, in **`rightOrder` and `pickCursor` alike**
  so the cue and the order cannot disagree.
* `atRefinery` is the **same band**, one cell clear of the footprint plus half
  a cell of hull slop. A footprint is a rectangle and its ring of doors is a
  rectangular band; the old circle-about-a-rectangle was both too tight at the
  corners and 1.4 cells too loose along the faces. Every dock cell satisfies
  the band by construction, so "reached my dock" implies "docked".

`dockAt` is deliberately **not** folded into `pickAt`: the apron is ordinary
walkable ground that every other unit must still be sendable to, and force-fire
must not treat it as a structure.

## The other dockable structures — checked, and clear

Measured the same way (a rendered frame, every cell in a 11x10 window coloured
by whether a click on it picks the building):

| structure | drawn dock affordance | inside the clickable footprint? |
|---|---|---|
| Ore Refinery, both factions | ramp / pit / hoist mouth on the `+gy` apron | **NO** — the defect above |
| Service Depot, both factions | the toothed repair apron | yes (the Soviet gantry mast overhangs, but that is superstructure, not the dock) |
| Airforce Command | the helipad | yes |
| Naval Shipyard | the rig deck | yes (drum edges overhang) |

The Service Depot's *order* also already aims at `floor(gw/2) + 1` — the
adjacent kerb — which is the arithmetic `refDock` should have had. The refinery
was the only structure whose dock affordance and clickable cells disagreed.

## Proof

`clickCell` / `rightClickCell` / `cursorAt` / `hover` run the real
`clickSelect`, `rightOrder` and `pickCursor` at the pixel a grid cell projects
to, so the **pick** is under test and not just the command behind it. Committed
as plumbing first and the tests proved red on that commit:

* `refDock says y=7, the footprint ends at y=5, the sprite's ramp is at y=6`
* `hovering the drawn dock with a miner selected: cursor 'move', expected 'enter'`

The e2e was proved red twice against the pre-fix build — once on the cursor,
and once with the cursor assertion removed so the ORDER assertion is
independently red (*"the dock order never took"*).

Played in a real browser, 12 scenarios: both factions x empty/part/full x one
refinery and two. Every one shows the `enter` cursor over the drawn dock, takes
the dock order from a right-click there, goes to the refinery that was
**clicked** (not the nearer one), banks credits, and goes back to mining. The
Chrono Miner warps onto the ramp itself; the War Miner drives up against the
plate.

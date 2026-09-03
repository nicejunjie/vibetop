# Pass A — human-style playtest (Playwright, real mouse/keyboard)

Harness: chromium 1400×900 @2x against `http://127.0.0.1:8121/rts.html`. All orders
issued through `page.mouse` / `page.keyboard`; `__rtsTest` used only to read state and
to fast-forward quiet build stretches. Screenshots in this directory.

Coverage this pass: scenario 1 (both factions, Normal + Easy), 2 (every Directorate and
Collective structure, defence, infantry, vehicle built and placed), 3 (both Directorate
superweapons charged and the Weather Storm fired), 6 (box select, group move, control
groups, S/G/X/D, minimap orders), 8 (AI observed to 27 min), 10 (pause, help, scores,
minimap, sell, repair). Not reached: air combat vs AA, ore exhaustion, maps 2–6.

## Findings

| # | Severity | Scenario | What happened | What RA2 does | Repro (map/faction/time) | Screenshot |
|---|---|---|---|---|---|---|
| 1 | **blocker** | 1 | Playing the protocol's own opening (Power→Refinery→Barracks→WF) I was dead at **6:53 on Normal** and at **13:22 on Easy**, without a misplay. Player structure build times measured: Power Plant $800 = **60.0 s** (Normal) / 34.1 s (Easy); Refinery $2000 = **84.4 s**; War Factory $2000 = **84.5 s**; AFC 42.5 s; Depot 34.5 s. The AI's own structures completed at 0:36, 1:07, **1:10** (3 s after the previous one), 2:35, 2:56, 4:22 — a $2000 Refinery **23 s** after the previous building. At 6:53 the Collective had 8 structures + **38 units** and $4510 banked; I had 6 structures, 3 rifles and **$10 598 unspent**. Money is never the constraint — the single-yard build clock is, and the AI is not on it. | Both sides share one build clock; a $800 power plant is ~7 s, a $2000 factory ~17 s. Normal AI's first probe is a small squad, and a clean macro opening survives it. | Iron Frontier / Directorate / Normal, t=0–6:53 | `A07-rushed.png` |
| 2 | **blocker** | 6 | Seven of twelve units were **entombed by my own base and never moved again**. They held `order: move→(28,12)` with `path:null`, `state:"idle"`, `noProg` climbing to **32 907 ticks (9.1 game min)** and `movedAt` unchanged since they were built (**18.7 min**). Occupancy confirms (5,12)/(6,12)/(6,13) is a sealed pocket: 4 vehicles at (5,12), 3 infantry at (11,13) — the infantry are standing *inside* a structure footprint. No "unable to comply", no cursor change, no re-path, no attempt to push out. Re-issuing move, Stop and Scatter all leave them frozen. | RA2 never seals a unit: the War Factory keeps a clear exit cell, units are never inside a footprint, blocked units re-path and EVA says "Unable to comply." | Iron Frontier / Directorate / debug / from unit spawn onwards | `A18-trapped.png` |
| 3 | **major** | 8 | The AI builds a **doom-stack and stops attacking**. At 26:54 the Collective had **114 units, 111 of them `state:"idle"`** (the other 3 were harvesters). **30 units sat on the single cell (51,55)**; four more cells held 10–11 each. **31 units held a live `move` order while idle** — the AI is stuck inside its own stack. My base lost 0 buildings in the 27 minutes it stood there. | RA2's AI attacks in repeated waves, spreads its team-types, and never parks 114 units on five tiles. | Iron Frontier / Directorate / Easy / debug, 13:00–27:00 | `A22-enemybase.png` |
| 4 | **major** | 6 | **No unit spacing.** Ten Rhinos ordered to (45,52) all finished at *exactly* (44,52) and drew as one interpenetrating pile with overlapping selection brackets. The same stacking is why the AI's army in #3 is un-movable. | RA2 units take one cell each and spread into the destination area; a group arrives as a formation, not a single sprite pile. | Iron Frontier / Collective / debug, 2:00–2:40 | `A35-fight13.png` |
| 5 | **major** | 10 | **Help cannot be closed and locks you out of the match.** `?` opens `#hv.overlay.help.show` (z-index 6) over the whole tactical view. Escape does nothing, clicking the map does nothing, `elementFromPoint(600,400)` returns the help text — every selection and order is swallowed. Only the "Got it" button at the bottom of the panel closes it. The match keeps running at 60 ticks/s the whole time. | RA2 pauses in the options menu and Esc closes it; nothing traps you with the battle live. | any match, click `?` | `A27-help.png` |
| 6 | **major** | 10 | **Right-click on the minimap does nothing.** With 12 units selected, a right-click on `#mini` over the enemy base left every unit's `order` at `null` and `state` at `idle`. Left-click does jump the camera (works). | Right-clicking the radar map is a core RA2 order — move/attack-move to that spot. | any match, select units, right-click `#mini` | — |
| 7 | **major** | 1 | **Full cost is charged the instant you click a row, and a queue behind an unplaced READY makes zero progress with no message.** Clicking Power Plant took credits 10 000→9 200 at `prog:0.0147`. With one READY item unplaced, six further structures queued: `$9 800` spent, `$200` left, `prog:0` forever, list `["refinery","refinery","barracks","barracks","factory","factory"]`. Nothing on screen says the lane is blocked or that you must place first. Right-clicking a row cancels with a full refund — but the only hint bar text is "Right-click to move or attack". | RA2 draws credits *as the clock ticks*, so queueing never bankrupts you instantly; a ready structure flashes on its cameo with "Construction complete" and the on-hold state is unmistakable. | Iron Frontier / Directorate / Easy, click 7 structure rows without placing | — |
| 8 | minor | 1/2 | The **READY flash is drawn straight across the item's cost/description text**, so both are unreadable, and the cameo dims to near-black — the row reads as *disabled*, not *ready*. | RA2 flashes "Ready" over a still-bright cameo at a fixed sidebar position. | any match, queue any structure | `A11-defence.png` (Patriot row), `A02-pp-ready.png` |
| 9 | minor | 1 | **No placement ghost.** In placement mode the only feedback is a flat 2×2 cell tint — no structure silhouette, no size cue. Over grass the "legal" green is almost invisible; you cannot tell what will be built or how big it is. The red "illegal" footprint is also drawn out over the black off-map void. | RA2 draws the actual building semi-transparent, snapped to cells, with unmistakable green/red per-cell tinting, and never outside the map. | any match, arm any structure and hover | `A03b.png`, `A03c-illegal.png` |
| 10 | minor | 3/10 | The **superweapon icons are an overlay on the battlefield at top-left and eat mouse input there**. A left-drag begun at (60,120) never reaches the canvas — the selection was unchanged afterwards. | RA2 keeps the tactical view clear; superweapon clocks live in the sidebar over their cameos. | build a superweapon, then drag-select from the top-left corner | `A11-defence.png` |
| 11 | minor | 6 | **A band box never picks up harvesters, Engineers or the MCV** (12 selected of 18 owned). Combined with #2/#12 a parked MCV can also be un-clickable behind building sprites, making "Deploys in place into a Construction Yard (D)" unreachable. | RA2's band box takes every unit in it, harvesters and MCV included. | any match, drag a box over your whole base | `A13-boxsel.png` |
| 12 | minor | 2 | **Own structures interpenetrate.** Placed on legal adjacent cells, the sprites clip through each other into an unreadable pile — two power plants drawn one inside the other, the Battle Lab through the Refinery. Newly-built vehicles spawn *underneath* the pile and are invisible until they move. | RA2 sprite bounds match `Foundation=`, so structures never overlap and you can always read your own base. | Iron Frontier / Directorate / debug, build 8+ structures near the yard | `A12-units.png` |
| 13 | minor | 3 | The **$5000 Weather Control Device fires one thin lightning bolt over a flat dark ellipse for ~7 s** and then ends. No cloud art, no screen darkening, no sustained barrage. | RA2's storm is a sustained, loud, multi-bolt event over a real cloud layer — the visual payoff for the most expensive building in the game. | build Weather Control, charge 10 min, fire | `A25-storm2.png` |
| 14 | nit | 10 | **Command-bar labels are clipped** — "Scatte", "Deplo" — and the three-row bar overlays the bottom production row (Ore Purifier is half-hidden behind it) at 1400×900. | — | any match, look at `#cmdbar` | `A01-start-dir.png` |
| 15 | nit | 2 | The **Collective's Battle Lab reads "requires Airforce Command or Radar Tower"** — the Allied structure named in the Soviet build list. | — | Iron Frontier / Collective, Structures tab | `A31-collective.png` |

Verified working (no finding): placement is correctly refused over units and off-map;
right-click cancel refunds 100%; Sell and Repair both enter a clearly-signposted mode
and Sell removes the building; `P` pauses and the ⏸ button pauses; `S` clears orders,
`G` guards with a "Guarding — 2 units" toast and sets `guardX/guardY`, `X` scatters,
`D` toggles GI deploy; `H` centres on base; minimap left-click jumps the camera; the
Weather Storm arms, shows "click where the storm should form. Esc cancels", fires and
resets its recharge; superweapon clocks correctly read LOW POWER and start ticking when
power goes positive; every Directorate and Collective structure, defence, infantry and
vehicle in the sidebar can be built and placed; harvesters mine and income accrues.

## Overall feel

It looks the part when the camera is still and falls apart the moment anything moves.
The two things that ruin a match are not art: you cannot survive your own opening, and
your units will not go where you send them. On Normal the standard build order is a
loss — not because the AI outplays you but because it is not on your build clock, so
by the time your War Factory lands it has thirty conscripts in your base and you still
have $10 000 you were never allowed to spend. Drop to Easy and the same thing happens
six minutes later. Then, once you do get a base up, half your army is quietly bricked
inside it: four tanks and three infantry sat on a live move order for nine game minutes
without the game ever admitting anything was wrong — no "unable to comply", no cursor,
no retry. Meanwhile the AI has the mirror-image bug, stacking 114 units onto five tiles
until it can no longer attack at all, which is the only reason a debug match reaches
minute 27. RA2's texture is *legibility* — you always know what is ready, where it will
go, and what your units are doing — and that is exactly what is missing: READY printed
through the price text, a placement "ghost" that is a barely-visible tint with no
building in it, a queue that eats $9 800 and silently stops, a minimap that ignores
right-click, and a Help panel that traps you with the battle running. Fix the build-rate
symmetry and unit collision/pathing first; almost everything else on this list is a
half-hour of polish next to those two.

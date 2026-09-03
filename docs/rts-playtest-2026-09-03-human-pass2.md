# Pass A (pass 2) — human-style playtest, Playwright real mouse/keyboard

Harness: chromium 1400×900 @ `deviceScaleFactor: 2` against `http://127.0.0.1:8121/rts.html`.
Every order through `page.mouse` / `page.keyboard` / real sidebar clicks; `__rtsTest` used only to
read state, move the camera, force a superweapon charge, and drop enemy infantry next to a defence
as a fixture. Screenshots in this directory (111 files).

Coverage this pass: scenario 1 (Directorate/Normal ×3 full openings, timed), 2 (every Directorate
and every Collective structure, defence, infantry and vehicle built and used; Collective roster
read in full), 3 (Chronosphere, Weather Storm and Nuclear Missile charged and fired; Iron Curtain
built), 5 (Harrier attack run, ammo, return-to-pad, rearm; Airforce Command sold under parked jets),
6 (32-unit band box, long move, spacing, attack-move, force-fire, follow, guard/stop/scatter,
control groups, T, N, F1–F4, Space, Delete-mode, minimap right-click, MCV deploy), 7 (Tesla Coil
engaging), 9 (Iron Frontier + River Crossing incl. bridge crossing), 10 (menu, options card, help,
pause, sell/repair/power modes, radar, zoom, victory/defeat cards, New-mid-match confirm).
Not reached: ore exhaustion, Hard-AI-to-the-end, maps 2/3/4/6, Rocketeer/Kirov vs AA duels.

## Findings

| # | Severity | Scenario | What happened | What RA2 does | Repro (map/faction/time) | Screenshot |
|---|---|---|---|---|---|---|
| 1 | **blocker** | 1/8 | **The opening is still a guaranteed loss on Normal**, though the cause has moved. The build clock is now symmetric (AI: power@36 s, refinery@120 s, barracks@142 s, factory@227 s — exactly my own 34/84/21/84 s), so pass-1 #1's asymmetry is gone. What kills you now is volume: the AI's `opening` grace ends at 6:00 and the wave that lands is 35–49 units. Three tight matches, no misplay, queues never idle: **dead at 6:53, 7:11 and 8:46**, with **$14 411 / $16 673 / $18 423 unspent** each time. In the best run I had 8 structures, 2 pillboxes and 30 units at 6:45 and was still levelled by 8:46 against 49. Every structure costs `cost ÷ 23.8` seconds (a $2000 refinery = 84 s), so no build order can put more than ~12 Guardian GIs on the field before the timer expires — money is still never the constraint. | Both sides are on one clock *and* a Normal AI's first probe is a squad, not an army; a clean macro opening survives it. RA2's clock is also ~4× faster ($2000 War Factory ≈ 20 s, not 84 s). | Iron Frontier / Directorate / Normal, t=0–8:46 (3 matches) | `C406.png`, `C463.png`, `B06-under-attack.png` |
| 2 | major | 10 | **Sell mode survives a new match.** Arm Sell, then New → "Back to the menu?" → Menu → Start Game: the fresh match opens with the SELL button lit (`class="on"`), `cursorKind()` still `sell`, and the sidebar in sell styling. The first click on any structure you own sells it. The only Construction Yard is guarded ("Cannot sell your only Construction Yard"), so it is not instantly fatal — but the second building you place is. Repair/Power presumably leak the same way. | Modes are per-match state and reset on a new game. | any faction, arm Sell → New → Menu → Start | `H02-collective-base.png` (SELL lit at 0:51 of a brand-new match), `H03-sellmode-persists.png` |
| 3 | major | 2/10 | **The Airforce Command cannot be clicked while its own Harriers are parked on it.** Three landed Harriers cover 3 of its 4 cells; a left-click on any of those cells selects a Harrier, so you can never select the AFC to set a rally point or make it primary, and in Sell mode those cells answer "Click one of your structures". Only the one uncovered cell works. Compounding it: on a plain 2×2 Power Plant only the two *upper* footprint cells select the building at all — clicking its lower half selects nothing. | The building is always clickable under its sprite; parked aircraft do not steal its hit-box. | Iron Frontier / Directorate / debug, build AFC + 3 Harriers, let them land, click the building | `D23-afc-unclickable.png`, `D22-afc-sold.png` |
| 4 | minor | 3/10 | **Pass-1 #10 is unfixed: the superweapon cameos still sit on the battlefield and eat input.** They render at page (10,50)–(72,180); `elementFromPoint(40,80)` is the swbar. A left-drag begun at (30,70) selects **0** units; the identical drag begun at (200,300) selects 22. | The tactical view is clear; superweapon clocks live in the sidebar over their cameos. | build any superweapon, drag-select from the top-left corner | `D13-swbar.png`, `D12-superweapons.png` |
| 5 | minor | 2 | **Structures still interpenetrate.** With the full Directorate tech tree placed on legal, non-overlapping footprints the base reads as one jumble — the Refinery's conveyor is drawn through the Construction Yard's platform, the War Factory arch through the Airforce Command, the Barracks dome inside the Refinery. Same on the Collective side. Pass-1 #12 is not fixed. | Sprite bounds match `Foundation=`; you can always read your own base. | Iron Frontier / either faction / debug, build 8+ structures near the yard | `D04-allstructures.png`, `D05-defences.png`, `H02-collective-base.png` |
| 6 | minor | 1 | **A queued structure whose prerequisite dies stalls silently.** My Refinery was destroyed with `airforce` sitting in the build queue: the queue still held it (`queue:["airforce"]`), the cameo went `locked dis` reading "requires Refinery", the `×N` queue badge went blank, and there was no ON HOLD marker or message. The ON HOLD path exists but only fires for "waiting for credits" (`stepQueues` `continue`s out of the prereq case before it). | RA2 keeps the queued item visible and unmistakably on hold. | Iron Frontier / Directorate / Normal, queue AFC then lose the Refinery | `B05-onhold.png` |
| 7 | minor | 3 | **The Weather Storm is better but still thin.** It now darkens the whole screen, draws a cloud shadow and does real damage (10 bolts × 250 over 20 s; it killed the enemy refinery). But it is one hair-thin bolt every ~1.7 s inside a ~3-cell radius, each visible for 0.23 s; across 12 consecutive 900 ms samples of one firing I caught **zero** bolts and the enemy base lost 0 hp in the first 11 s. For $5000 and a 10-minute charge the payoff still reads as a dark ellipse. | A sustained, loud, multi-bolt event over a real cloud layer that visibly wrecks a base. | Iron Frontier / Directorate / debug, fire Weather Control at a base | `G05.png` (the one bolt I caught), `F2.png`, `F6.png` |
| 8 | minor | 6 | **MCV deploy refuses with no way to see why.** Standing on clean grass at (8,21) with room all around, `D` answers "Cannot deploy here — the MCV needs a clear 3×3 of open ground". The actual blocker was an ore patch two cells north-west, because the deploy footprint anchors at `(round(x)-1, round(y)-1)`; nothing on screen shows which 3×3 is being tested. Deployment works once you nudge one cell. | RA2 shows the yellow/red deploy footprint under the MCV before you commit. | Iron Frontier / Collective / debug, build MCV, press D near ore | `K12-mcv-deploy.png` |
| 9 | nit | 10 | The **top-left message log accumulates** — I regularly had 5–6 stacked yellow lines over the battlefield ("Battle Lab online / Low power… / Ore Purifier ready… / Click anywhere in the green area… / Ore Purifier online"), and it is also where the superweapon cameos and the "N selected" label live, so the whole corner is text. | RA2 shows one or two transient lines. | any match, place several structures quickly | `D04-allstructures.png` |
| 10 | nit | 10 | **Help still runs the match behind it.** Esc now closes it (pass-1 #5 fixed), but with `#hv` open the sim keeps ticking at 60/s — measured exactly 60 ticks in one wall second. The Esc *options* card does pause correctly ("The match is paused", 0 ticks/s), so the two panels disagree. | Esc/menu pauses a skirmish. | any match, click `?`, watch the clock | `D03-esc-options.png` |

## Pass 1 items — verified

**Fixed (13):**
- **#2 units entombed** — 32 mixed units box-selected and sent 20 cells across the map: all 32 completed the order, 0 with `noProg > 600`, `still: 0`. Not reproduced. (`D09-arrived.png`)
- **#4 no unit spacing** — the same 32 arrived spread over **26 distinct cells, max 3 per cell**, each with its own selection bracket. (`D09-arrived.png`)
- **#5 Help traps you** — Esc closes it now (`overlay help show` → `overlay help`). (Residual: see finding 10.)
- **#6 minimap right-click does nothing** — right-click on `#mini` now orders all 32 selected units (`move:63,63`). Left-click still jumps the camera.
- **#7 full cost charged on click / silent blocked queue** — progressive charging is in: the Refinery drew 10 000 → 7 327 smoothly across its 84 s at ~24 credits/s, `prog` rising 0 → 0.94 in step. The cameo now carries a `×N` queue badge and the tooltip reads "8 queued · right-click to cancel". (`C406.png`)
- **#8 READY flash unreadable** — READY is now yellow-on-bright-cameo with a highlight border, and the tab grows a notification dot. (`B02-ready-sidebar.png`)
- **#9 no placement ghost** — a translucent green silhouette of the actual building, snapped to cells, over a green buildable-area grid; illegal placement says "Can't build there — needs clear ground inside the green area" with a 'no' sound. (`B03-ghost.png`)
- **#11 band box misses harvesters/Engineer/MCV** — one drag over the base selected **32 of 32** owned units including 4 harvesters, the Engineer, the MCV and 3 Harriers. (`D07-boxsel.png`)
- **#14 clipped command-bar labels** — TEAM 1 / TEAM 2 / SAME / DEPLOY / GUARD / PLAN all render in full and the bar no longer overlaps the production grid at 1400×900.
- **#15 Collective Battle Lab wrong prereq** — now reads "requires War Factory + Radar Tower". (`H01-collective-start.png`)
- **#3 AI doom-stack that never attacks** — the opposite now: the AI attacks on schedule at 6:00 and finishes the job (it beat me in all three Normal matches). No 100-unit parked stack observed.
- **#1 (half of it) build-clock asymmetry** — measured AI completions land exactly on the player's clock (see finding 1).
- **#13 (partly)** — the storm now darkens the screen and does real damage; see finding 7 for what is left.

**Not fixed (3):**
- **#10 superweapon overlay eats mouse input** → finding 4.
- **#12 structures interpenetrate** → finding 5.
- **#1 the opening is unsurvivable on Normal** → finding 1 (different mechanism, same outcome).

**Also confirmed working this pass (no finding):** attack-move (`Ctrl+Shift+RMB` → `amove`, "Attack-move — N units will engage…"), force-fire (`Ctrl+RMB` → `ffire`, correctly skipped by unarmed units), Follow (`F` → "Follow: click the friendly unit to shadow (Esc cancels)"), Stop/Guard/Scatter, control groups `Ctrl+1`/`1` (27 units stored and recalled exactly), `T` select-all-of-type, `N` cycle, `Ctrl+F1` view bookmark, `Space`, `Esc` cancels a mode then opens a paused options card, `New` mid-match asks "Back to the menu?", debug wins are not recorded on the leaderboard, shroud (the black jagged area *is* shroud, not off-map void) and radar bezel with a live view rectangle, progressive power gauge (green→red) and the grey unpowered-structure look with "Low power — production is slowed and defences are offline", rubble/craters, Harrier full cycle (fly → 1 missile → kill → RTB → land → rearm to 2/2), Tesla Coil charge-up and bolt, Nuclear Missile launch → mushroom + crater → target destroyed, Chronosphere arming with its cyan 3×3 field, Iron Curtain buildable, sell refund ("Sold Power Plant for $400"), River Crossing bridge crossing by a 26-unit army with 0 stuck.

## Overall feel

Everything I complained about in the *interface* last time has been fixed, and the difference is
enormous: READY is legible, the ghost shows you the actual building, the queue tells you what it
holds and takes your money as the clock sweeps, the minimap takes orders, the band box takes
everything, Esc closes what it opened and pauses when it should, and — the big one — thirty-two
units sent across the map arrive spread over twenty-six cells with nobody bricked in the base.
Orders now feel like an RTS. The art carries it too: powered vs unpowered structures, rubble,
the radar bezel, the Tesla bolt, the mushroom cloud. What has not moved is the thing that decides
whether anyone gets to *see* any of it. Three tight Normal matches, protocol build order, no idle
queues, defences up — dead at 6:53, 7:11 and 8:46 with fifteen thousand credits I was never
allowed to spend. The clock is symmetric now, which is genuinely fixed, but a $2000 building takes
84 seconds while the AI's grace timer expires at 6:00 and forty units walk in; there is no build
order that answers that, so the fix has to be the clock rate or the wave size, not the player.
Behind it sit three smaller things that a picky player notices in the first ten minutes: a new
match that starts with Sell armed and the sell cursor live, an Airforce Command you can never
click because your own jets are parked on it, and a base that still draws as one interpenetrating
pile the moment it has eight buildings in it.

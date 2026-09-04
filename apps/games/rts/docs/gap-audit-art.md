# Iron Frontier (`apps/games/rts/rts.html`) — art & presentation gap audit vs Red Alert 2

Audited **2026-09-04** against `apps/games/rts/rts.html` at **32 272 lines**, git HEAD **`448fe32`**
(`v1.19.279`). Line numbers are as of that commit. RA2 ground truth is `/tmp/RA2inis/` and
`/tmp/YRinis/` — **both still exist**, so every citation below was re-read from the file rather than
inherited from the previous audit. (The inis are CRLF; a naive `awk '$0=="[X]"'` returns nothing.)

The game was verified **live**, not grepped: a loopback server feeding `rts.html` to headless
Chromium (the pattern in `apps/games/rts/tools/art-metrics.js`), driving `window.__rtsTest` /
`window.__rtsTables`, counting baked frames off `__rtsTest.spr()`, and screenshotting driven
set-pieces — buildings at 45 % and 18 % hp, buildings dying, infantry killed by six different
warheads, a nuke, a gem plateau, contact sheets of trees and cliffs. The page loads with **zero
console and zero page errors** in every run. Rows marked *grep only* are weaker evidence on purpose:
the audit this one replaces was misled by exactly that — it counted `scorch`, found the word in a
comment, and filed a blocker.

---

## What the previous audit got wrong

The 2026-09-02 audit was written against a 17 267-line file. It is now 32 272 lines and **34 of its
44 art rows are implemented**. Both of its "systemic findings" — the two claims every other row hung
off — are gone. The record, so the correction is visible rather than quietly erased:

| Marked | Actually |
|---|---|
| **blocker** — "a structure sprite has exactly one state" | Five state sets are baked lazily per key: damaged (`bakeDamaged` 18595, 6 frames measured on 10 structures), unpowered (`bakeUnpowered` 18651 — desaturated *and* the idle animation frozen), 32 aiming bearings (`aimOf` 18935), 7 door frames (`doorOf` 18912), and build-up (`bakeMake` 18697, deliberately gated off) |
| **blocker** — "infantry have no facings" | `bakeInfantry(col, kind, fac, phase, dir, state)` (4403) bakes per direction and per state; 8 distinct stand canvases measured per kind; 11 sequences (`INF_SEQ` 4330) |
| **blocker** — "no infantry death animations" | `INF_DEATH` (1058) maps the killing warhead to RA2's `InfDeath=` 1-6; `infCorpse` (19741) plays twirl / mist / flying / burn / electro / crush-splat |
| **blocker** — "explosions are one baked radial blob" | Four size families × 11 frames (`bakeExplosionFamily` 17500, `famOf` 17573), body plus an additive hot core; a building death queues five at once, matching `Explosion=TWLT070,S_BANG48,…` |
| **blocker** — "no RA2 cursor set, five CSS cursors" | 17 canvas-drawn cursors (`__rtsTest.cursorSet()`), animated on a 150 ms beat |
| **blocker** — "T3 and Sell render outside the sidebar and cannot be clicked" | Fixed 2026-09-02 (v1.19.240); the command bar is `ui.ini`'s six |
| **blocker** — "the sidebar is a modern scrolling web list" | Rebuilt as RA2's command bar: radar bezel, power meter, credits ticker, cameo grid, clock wipe |
| **major** — "buildings vanish on death" | `killBld` (19288) stages five blasts, throws ballistic debris, stands a smoke column, and lays a rubble/crater decal that weathers over 90 s |
| **major** — "no craters and no scorch; grep finds 0/1 and the 1 is a comment" | `bakeScorchDecal` (17581), `bakeCraterDecal` (17600), `decal()` (19765), size-gated at 14/24 per `Crater=`/`Scorch=` |
| **major** — "defences never aim" | 32 bearing frames per aiming defence (`AIMED` 18934) — **and the audit's own citation was wrong**, see below |
| **major** — "footprints are systematically one tile smaller than RA2's" | Every `Foundation=` matches, per faction, verified against `art.ini` |
| **major** — "no height levels" | `computeHeight` (2787) derives a real per-cell height field; `sy()` (25513) lifts ground, ore, trees, structures, units, decals, shots and blasts together, and `screenToGrid` inverts it |
| **major** — "no LAT transitions", "cliffs are grey brick", "roads have no connectors", "shroud edge is a hard black diamond", "nuke is a brown mud column", "ore does not glitter", "unpowered is a ⚡ emoji", "vehicles never smoke", "8 facings" | All implemented. Vehicles now render **32** bearings, not 8 — measured as 32 distinct hull *and* 32 distinct turret canvases on the Rhino |
| **major** — "Prism Tower has neither a charge anim nor support links", "no Tesla charge-up" | `CHARGE_T = 28` (21643) matching `DelayedFireDelay=28`; `PRISM_SUP_MAX=8 / MOD=1.5 / DUR=15` (21647) with drawn beams |

**One citation in the old audit was simply misread, and the code is right where the audit called it
wrong.** The row "Defences never aim" cited "`Turret=yes` + `TurretAnim=LASER` … on the Prism
(rules.ini:10393-10395)". Those lines are inside **`[NALASR]`, the Soviet Sentry Gun**. `[ATESLA]`
(Prism Cannon) says **`Turret=no`**, `[TESLA]` says `Turret=no`, and `[GAPILL]` has no `Turret=` key
at all. RA2's Prism Tower and Tesla Coil do not rotate — they play a `SpecialAnim` wind-up, which is
exactly what the game does. `AIMED` correctly lists only `[NALASR]`, `[NASAM]`, `[NAFLAK]` and
`[GTGCAN]`, the four that really carry `Turret=yes`.

**One row is a DECISION, not a gap, and must never be listed as work.** Structures have no build-up,
no MCV unpack animation and no sell fold-away: `MAKE_T = 0` (19188) and `MCV_T = 0` (18905). The
machinery is fully built behind those constants — `bakeMake` (18697), the reverse-play sell, and
`unpackOf` (18858), a real four-frame MCV fold-out. The user asked for instant structures twice.

---

## Read this first — what the systemic findings are now

The old audit's two causes are closed. What is left is not one big thing; it is **a long tail of
small deviations plus five stale comments and dead branches left behind by the rebuild**. Two
patterns are worth naming:

1. **The art overshot the ini in a few places and nobody checked back.** `firePorts` (18567) always
   emits three fire ports, where every 1×1 defence in art.ini carries exactly one
   `DamageFireOffset0=` and no `…1=`/`…2=`. `AIMED` gives the Pillbox a traversing turret RA2's
   `[GAPILL]` does not have. Neither is a bug you can see fail — which is why they survived.
2. **Comments now describe code that was replaced.** The explosion draw is still introduced by
   "The blast is one baked radial-gradient sprite scaled per fx" (29211-29214), twelve lines above
   the four-family frame draw that replaced it (29453-29461). `T_CIV` (761) is declared, tested in
   `solidT()`, given a minimap colour and exported to the test surface — and **never assigned by
   anything**, a vestige of the obstacle-only civilian system the neutral `civ*` structures replaced.
   These cost nothing at runtime and mislead every reader after.

Shape and state work is genuinely done. What remains is regularity — ore fields, gems, tree
silhouettes and snow cliffs still read as a grid or a repeat at high zoom — plus the ini nits above.

---

## 1. Structures

| Gap | RA2 (citation) | Game now | Severity | Effort |
|---|---|---|---|---|
| **Fire ports are over-applied.** Every structure gets three flame sources when hurt, including the 1×1 defences | art.ini gives each 1×1 defence exactly one port and no more: `[GTGCAN] DamageFireOffset0=-1,28`, `[NASAM] 1,20`, `[NAFLAK] -5,13`, `[NALASR] -5,15` — there is no `DamageFireOffset1=` on any of them | `firePorts` (rts.html:18567) always returns 3, scanned off the roofline; `portsOf` (18782) memoises them. Three fires on a one-cell tower over-reads. Verified live (`ports:3` on every structure measured) | nit | S |
| **The Pillbox traverses a turret RA2 does not give it** | `[GAPILL]` has no `Turret=` key; `[NALASR]`, `[NASAM]`, `[NAFLAK]`, `[GTGCAN]` all have `Turret=yes` with a named `TurretAnim=`. art.ini flags `[GAPILL] Recoilless=yes` — it is the *example* of a fixed emplacement | `AIMED = { sentry: 1, sentrygun: 1, patriot: 1, flakcannon: 1, grandcannon: 1 }` (rts.html:18934) — `sentry` is the Pillbox (1730). Read code | nit | S |
| **The Nuclear Reactor's footprint is cited off the wrong art.ini section.** It is 2×3 where RA2's is 4×4 — the biggest structure in the game drawn at a third of its area | The Soviet Nuclear Reactor is `[NANRCT]` (rules.ini: Cost 1000, Power 2000, Strength 1000, TechLevel 9) and `art.ini [NANRCT] Foundation=4x4`. `[NAAPWR]` — which has `Foundation=2x3` — has **no rules.ini section at all**; it is unused art | `BLDS.reactor` `gw: 2, gh: 3` with the comment "art.ini `[NAAPWR]` Foundation=2x3 — deep, not wide" (rts.html:1774). Every other footprint in the table is right; this one reads the wrong key. Verified against art.ini and rules.ini | minor | M |
| **The rubble decal pops in at full opacity on the death tick**, so the crater is fully painted under a fireball that has not peaked yet | RA2 hides the ground under the death anims and the scar appears as they clear | `killBld` (rts.html:19322) pushes the rubble at `t: 0` and it draws immediately, while the sprite is removed the same tick. Verified live — screenshotted at t=6 with a complete crater under a still-blooming blast. A ~10-tick alpha ramp closes it | minor | S |
| **The concrete apron is still painted inside each building's own canvas, not on the ground layer** | 11 `BibShape=` keys — `GAWEAPBB, NAWEAPBB, GAREFNBB, NAREFNBB, GAHPADBB, NAHPADBB, GAAIRCBB, GADEPTBB, NADEPTBB, CAOUTPBB, NAWASTBB` (art.ini:843, 889, 1106, 1163, 1267, 1283, 1326, 2396, 2432, 2932, 8037) — a separate shared ground-layer shape | `plot()` (rts.html:9438) now traces the true cell parallelogram, so an apron matches its owned cells exactly and neighbours no longer read as growing through each other. It still cannot tile against an adjacent building's apron. Read code — severity dropped from the old audit's `minor/M` | nit | S |
| **Prism support cites `PrismSupportDuration` where the offline period is `PrismSupportDelay`** | rules.ini:136-137: `PrismSupportDelay=60` — "*Firing a support beam takes a Prism offline for this long*"; `PrismSupportDuration=15` — "*A support beam is visible for this long*" | `o.cool = PRISM_SUP_DUR * 2` (rts.html:21657) = 30, commented "it spent its charge supporting"; the beam's own `life` is `CHARGE_T` (28), not 15. `PrismSupportDelay` is never referenced. A constant/comment mismatch, not a crash | nit | S |
| Damaged art, destruction, aiming, doors, Tesla/Prism charge, alternating Patriot tubes, unpowered, the repair wrench, garrison, footprints | | All present and correct — see the correction table above | — | — |

## 2. Infantry

| Gap | RA2 (citation) | Game now | Severity | Effort |
|---|---|---|---|---|
| **Firing is 3 phases where RA2's is 6** | `[E1Sequence] FireUp=164,6,6` (art.ini:9660) — six frames per facing; `FireProne=212,6,6` (9664) | `INF_SEQ` (rts.html:4330) `fire: 3`, `fireprone: 2`; drawn at 29641. The walk *was* fixed to 6 (`(G.tick>>2)%6`, 29642) and measured as 6 distinct phases, so the fire cycle is the one that did not follow | minor | S |
| **`panic` has no sequence and fails silently** | `[E1Sequence] Panic=8,6,6` (art.ini:9674) | `INF_SEQ` (rts.html:4330) has `cheer` but no `panic`; `fr()` (6027) does `if (!INF_SEQ[st]) st = 'stand'`, so a future `fr('panic', …)` renders a standing man rather than erroring. Cheer itself works (2 phases on `G.over`, 29630) | nit | M |
| Facings, deaths, prone/crawl + `ProneDamage`, idle fidgets, 6-frame walk, selection bracket from unit size | | All present and correct — 8 stand canvases per kind measured, six `InfDeath` styles screenshotted, `proneMul` (1054) applied in `damage()` | — | — |

## 3. Vehicles / aircraft

| Gap | RA2 (citation) | Game now | Severity | Effort |
|---|---|---|---|---|
| **The Kirov's art was never re-proportioned** — head-on it collapses to aspect 0.74 against 1.43 broadside, the exact numbers the previous audit measured | RA2's Kirov is the largest thing in the sky and reads long from every bearing | `bakeVehicle`'s Kirov branch (rts.html:7322). The gondola *is* now its own layer with a bomb bay that opens on `u.fireAt`, and at 110×77 it is the largest sprite measured (Apocalypse 81×57, MCV 95×74) — so "reads small" is answered by comparison, but the bbox is bit-identical to the old audit's. Verified live | minor | M |
| 32 facings, damaged smoke and flame, recoil, track marks and dust, Harrier descent *and* take-off ramp, IFV turret swap | | All present — 32 distinct hull and 32 distinct turret canvases measured on the Rhino | — | — |

## 4. Effects

| Gap | RA2 (citation) | Game now | Severity | Effort |
|---|---|---|---|---|
| **Ore and gem fields read as a diamond honeycomb at close zoom.** The tan backing square is gone, but each cell's cluster still stops at its own diamond, so a field is a visible lattice — worst on gems, ~700 near-identical cones on a regular grid | RA2 ore is 19 overlay types `TIB01`…`TIB19` and gems `GEM01`…`GEM09` (rules.ini:1498-1516, 1423-1431), so no two cells repeat | `bakeOre` (rts.html:4033); glitter is real (`bakeSparkle` 3980, additive pass 28731/28767) and the seam is feathered. Verified live at zoom 1.6-2.2 — the cluster boundaries are legible | minor | M |
| Explosion families, craters and scorch, debris, the nuke, rocket trails, the V3's own projectile, feathered shroud, gap fog, four-layer building fire | | All present and correct | — | — |

## 5. Terrain

| Gap | RA2 (citation) | Game now | Severity | Effort |
|---|---|---|---|---|
| **Ore still spawns on pavement in the urban theatre — the cause moved, the symptom did not** | RA2 ore grows on ground and dirt, never on `Pavement` | `patch()` (rts.html:2702) now refuses anything but `T_GROUND`/ore, which reads as fixed. But the urban theatre paints `T_GROUND` as concrete slabs — `bakeGroundSheet('pave', 61)` (18953) — so an urban ore field still lies on paving. Verified live | minor | S |
| **Snow cliffs are markedly worse than temperate ones** | RA2's snow cliffs are the same irregular rock under snow, not a different construction | `bakeCliff` (rts.html:3438) — the temperate branch reads as jointed rock with a boulder-strewn crest; the snow branch is still very regular grey blockwork with a cap. Verified live against a contact sheet | minor | S |
| **Cliffs still read engineered rather than cut** even in the best theatre — uniform course height, a flat top line, no talus | `SetName = Cliff Set`, `Destroyable Cliffs`, `ZMM Cliff Set` (temperat.ini:310, 860, 460) | `bakeCliff` (rts.html:3438). No longer "a grey brick retaining wall" — the old row's severity of `major` is wrong now | minor | M |
| **Ramps read paved, not as a rock slope** | `SetName = Ramps` / `ZMM Ramps` / `DirtRoads Slopes` (temperat.ini:295, 268, 472) | `bakeRamp(kind, dir, flat, walls)` (rts.html:17767) — a stone slope with side walls, no longer planks, but still parallel-striped | nit | S |
| **Tree silhouettes barely vary.** The count went 4 → 8 per theatre, but the *shape* variety is about three (tree / dead trunk / boulder); the five living variants share one canopy blob at different sizes | temperat.ini ships ~30 terrain objects | `bakeTree(v, snow)` (rts.html:3794), 8 per theatre at 19015-19026. Snow variants do now carry snow load. Verified live off a contact sheet | nit | M |
| **Tile-set variety is still a fraction of RA2's** | 82 tilesets in temperat.ini, 75 in snow.ini, **110** in urban.ini | 64 ground + 64 alt ground + 15 LAT + 64 apron + 16 cliff + 32 road + 16 shore + 16 shallow + 16 scree + 8 decal + 8 terrain objects, per theatre (rts.html:18942-19026). Much wider than the old audit found, still well under RA2 | minor | L |
| Height levels, LAT transitions, road masks, civilian sets, map-border continuation, per-map lighting, snow trees | | All present and correct — `computeHeight` (2787), `bakeLat` (3377), `bakeRoad` (3728), ten civilian types (18010), `bakeApronSheet` (3106), `MAPS[].light` (2438) | — | — |

## 6. UI / HUD

The old §6 is closed almost entirely, and its two blockers were fixed the day it was written.
Measured with `getBoundingClientRect` at 1100×620, 1280×720, 1500×950 and 1920×1080: **no element
overflows `#side` at any size**. `#cmdbar` and `#sbtools` are both `repeat(3, minmax(0,1fr))`
(rts.html:215, 130) — the exact fix the old audit prescribed. The command bar is `ui.ini`'s six and
nothing else (verified live: `Team 1, Team 2, Same, Deploy, Guard, Plan` =
`[AdvancedCommandBar] ButtonList=Team01,Team02,TypeSelect,Deploy,Guard,PlanningMode`), with
Sell / Repair / Power moved to `#sbtools` under the radar as RA2 has them. The radar draws through
the same isometric matrix as the field with a true four-corner viewport quad (30539); the power
meter, the credits ticker, the clock wipe over the cameo, icon tabs, pip health bars, the top-left
EVA rail, eight house colours, the in-game options card and a drawn `#ptip` tooltip panel are all
present. There are **17 canvas-drawn cursors**, 33 frames, verified live off `cursorSet()`.

| Gap | RA2 (citation) | Game now | Severity | Effort |
|---|---|---|---|---|
| **The radar gate is cosmetic — a dead radar is still a live map-jump and order surface** | `[NARADR] Powered=true`; RA2 blacks the radar out *and* takes the map away with it | `drawMini` (rts.html:30553) computes `radarOn` as a **local**, blanks the canvas and prints `NO RADAR`. The `mini` pointerdown handler (28430-28446) has no such guard: a left-click on the black panel still `centerOn()`s that cell and a right-click still emits `cmd('move', {x, y})` to it. Verified live against a panel showing only the `NO RADAR` text. Hoisting `radarOn` into a shared predicate closes it | major | S |
| **"Game settings" expands into nothing you can see** | — | `setTog`'s handler (rts.html:31265) flips `setGrid.hidden` and never scrolls the revealed content into view; `#ovCard` is `overflow-y:auto` with no visible scrollbar. **Measured at 1500×950**: `scrollHeight` 922 → 1149 with `scrollTop` still 0, and the screenshot after the click shows *nothing new* — starting credits, units, speed, Bases, Short Game, Crates and Superweapons are all below the fold, and the disclosure row you just clicked has gone behind the sticky footer. Same at 1920×1080. The audit's biggest match-flow gap is implemented, works, and is undiscoverable | major | S |
| **Cameos never wear the player's house colour — two independent causes** | RA2 tints the cameo frame with the house colour | (a) `cameoFor` (rts.html:26894) sets `var acc = own === 'col' ? [216,67,77] : [74,163,219]` from the **faction**, under a comment reading "the HOUSE's colour, never the item's". (b) `cameoCache` (26872) is keyed `(b\|u):fac:own:key` with no colour component and `applyHouse` (17134) clears `lineupCache` and `thumbDots` but **not** `cameoCache`. So a green army fields green sprites while every sidebar cameo — and every superweapon clock, which calls `cameoFor` — stays blue | minor | S |
| **Cameos are still auto-crops of the in-game sprite** | RA2's cameos are hand-drawn 60×48 PCX art | `cameoFor` (rts.html:26879) now composes 60×48 with a sky wash, a ground line and a house bevel, which is a real improvement — but the subject is the baked sprite | minor | L |
| **Fonts are `system-ui` / `ui-monospace` throughout** | RA2 uses its own bitmap font everywhere | 17 `system-ui` sites (rts.html:12, 42, …), no `@font-face`, no bitmap face anywhere | minor | M |
| The options card has no Delete for a save slot, and no tooltips toggle | RA2's in-game menu is Load / Save / **Delete** / Restart / Abort / Game Settings | `buildSlotRows` (rts.html:31035) builds Save and Load only | nit | S |
| The power meter is the one sidebar control with neither a readout nor a tooltip | RA2's meter is numberless too, so this is a consistency nit, not a fidelity one | every `.pit`, `#cmdbar` and `#sbtools` control draws a `#ptip`; `#pwr` (rts.html:652) draws nothing | nit | S |
| The superweapon clocks are the last native `title=` tooltips left | RA2 draws its own | rts.html:26712, 26741 — everything else moved to the canvas panel | nit | S |
| `lastRadar` is module-level and never reset between matches | — | rts.html:30550. A match that ended with the radar up, followed by one that starts without, chirps `radaroff` on the new match's first `drawMini` | nit | S |
| Sidebar, command bar, power meter, credits ticker, clock wipe, icon tabs, isometric radar, 17 cursors, pip health bar, EVA rail, superweapon cameos, eight house colours, options card, drawn tooltips | | All present and correct | — | — |

## 7. Audio

No RA2 assets are used; everything is synthesis. The old §7 said ten effects, no music, no
per-weapon reports and TTS for everything. Measured live by rendering each entry into an
`OfflineAudioContext` and taking its RMS: **`SPEC` has ~65 sound kinds and not one of them is
silent**; `REPORT` (rts.html:25888) maps 30 unit types to distinct weapon reports; structure and
economy sounds are all there; unit acknowledgements are a formant-vocoder radio (`VOX`, 26244) with
separate select / move / attack / deploy / harvest line sets for 40 units, verified as different
waveforms rather than assumed.

| Gap | RA2 (citation) | Game now | Severity | Effort |
|---|---|---|---|---|
| **EVA is still browser `SpeechSynthesis`** | RA2's EVA is a recorded voice per faction | `eva()` (rts.html:26480). It is no longer silent when `getVoices()` is empty — there is a real `evachime` plus the message rail as a fallback — but the voice itself is the OS's, so it varies by platform and does not match the radio the units now speak on. Downgraded from the old audit's `major` | minor | M |
| **EVA speech is never cancelled** | — | no `speechSynthesis.cancel()` anywhere; `clearEva` (rts.html:26654) clears the rail and the throttle map only. A base collapse queues several lines that keep reading out over the score card and the front menu, and pause does not pause the voice | minor | S |
| **Music has no track rotation** — one ~90 s loop per theatre | `theme.ini` declares 18 tracks and rotates the ones marked `Normal=yes` within a match | `MUS.set(G.theatre)` (rts.html:31084, 31402) picks one of four loops (temperate / snow / urban / menu). The score itself is real and has a combat-intensity layer; measured RMS 0.021-0.045 on all four | minor | M |
| The Dolphin and the Giant Squid have no acknowledgement lines at all | `rules.ini [DLPH]` and `[SQD]` each carry `VoiceSelect`/`VoiceMove`/`VoiceAttack`/`VoiceFeedback`/`DieSound` | `VOX.dolphin` and `VOX.squid` (rts.html:26290-26291) are `{f:0, s:[], m:[], a:[]}`, and `unitAck` (26333) special-cases only the dog's bark and the drone's clatter — so selecting or ordering either is silent | nit | S |
| 65 sounds, per-weapon reports, structure and economy sounds, generative music with an intensity layer, a synth radio for 40 units' voices, select/move/attack distinction, `Limit`/`Priority`/`Range`/`MinVolume` from sound.ini | | All present and correct | — | — |

---

## Present but visibly broken

| What | Where | Evidence |
|---|---|---|
| **The radar's "NO RADAR" panel still jumps the camera and still takes move orders.** With the panel blank, a left-click centres the view on that cell and a right-click orders the selection there | `drawMini` rts.html:30553 vs the `mini` pointerdown at 28430 | Read code; agent-verified live against a panel drawing only the `NO RADAR` text |
| **Expanding "Game settings" reveals nothing.** `#ovCard` gains 227 px of content and stays at `scrollTop: 0`; the disclosure row disappears behind the sticky footer and no setting becomes visible | `setTog` handler rts.html:31265 | Measured live at 1500×950 (922 → 1149 scrollHeight, scrollTop 0) and screenshotted before/after; same at 1920×1080 |
| **Every sidebar cameo and superweapon clock is the wrong colour once the player picks a house.** The field army repaints; the cameos do not | `cameoFor` rts.html:26894, `cameoCache` 26872, `applyHouse` 17134 | Read code — the accent is derived from the faction, and the cache has no colour in its key and is not invalidated |
| **The rubble decal is fully painted before the first explosion frame peaks** | `killBld` rts.html:19322 pushes it at `t: 0` | Screenshotted at t=6 of a structure death: a complete crater under a still-blooming fireball |
| **Ore fields still lie on urban pavement.** `patch()` was fixed to refuse anything but `T_GROUND`; the urban theatre's `T_GROUND` *is* concrete | `patch()` rts.html:2702, `bakeGroundSheet('pave', 61)` 18953 | Read code + live render |
| **`T_CIV` can never exist.** Declared at 761, tested in `solidT()` at 769, given a minimap colour at 30518, exported to `__rtsTables.TER` at 32245 — and assigned by nothing. A test could assert against a terrain type the map generator cannot produce | rts.html:761 | Four occurrences in the file, all reads |
| **The explosion draw is introduced by the comment for the code that replaced it** — "The blast is one baked radial-gradient sprite scaled per fx", twelve lines above the four-family, eleven-frame draw | rts.html:29211-29214 vs 29453-29461 | Read code |
| **The Pillbox traverses a turret RA2 does not give it**, and every structure gets three fire ports where the 1×1 defences have one | `AIMED` rts.html:18934, `firePorts` 18567 | Read code + art.ini: `[GAPILL]` has no `Turret=`; no 1×1 defence has a `DamageFireOffset1=` |
| **A new match can chirp `radaroff` on its first frame** because `lastRadar` survives the match that set it | rts.html:30550 | Read code |

---

## What is actually left, by impact

**This list is shared and deduplicated across both gap audits** — `gap-audit-art.md` and
`gap-audit-features.md` end with the same block, so there is one place to read the remaining work.
The section tag says which document carries the row's detail. Severity and effort use the same
scales as the rest of both files.

### Closed since this audit was written (2026-09-04)

Rows 1-7, 17, 18 and part of 12 below are **done**, and row 8 **did not reproduce**. They are
annotated in place rather than deleted, so the record shows what was found and what was
actually true. Two of the audit's own citations were wrong and are corrected here.

A later pass closed the six art rows **21 and 23-27**; they are appended to the table. Five of the
six are terrain or animation defects the art gate cannot see at all — it measures unit sprites at
eight bearings and nothing else — so each was verified against a rendered frame at native
resolution, and each new guard was run against the unfixed build first and made to fail with the
signature it names. Row 27's own headline number turned out to be a misreading; the correction is
in its entry.

| was | what shipped | commit |
|---|---|---|
| 1 | `edgeDist()` — range and MinimumRange are both measured to the target's WALL. Tanya and Ivan now destroy the 4x4 yard, the 5x3 factory, the 4x3 refinery, the 3x2 barracks and the 2x2 power plant; before, zero damage to any of them | `f088a16` |
| 2 | The ROF x4 sweep found **sixteen** weapons, not three: the War Miner, Desolator, Nighthawk, **Yuri**, **Chrono Legionnaire**, and **eleven of the thirteen `IFV_MODES` rows** — every passenger mode except the one that was already converted | `f2889ff` |
| 3 | The duplicate `FlakGuyWH` is gone, and a test now walks the whole file for duplicate object keys so the class of bug cannot recur silently. `__rtsTest.step` was doubled the same way | `f088a16` |
| 4, 6, 12 | One frame-rate correction closes all three. rules.ini settles it beside `IronCurtainDuration` (line 693): *"In frames 900 is a minute for 15fps"*. Iron Curtain 20 s -> **50 s**, Terror Drone 120 -> **240** ticks per bite, Ivan's fuse 900 -> **1800**, radiation apply 32 -> **64** | `f2889ff` |
| 5 | `PrismSupportDelay=60` (240 ticks) now sets the offline window; `PrismSupportDuration` sets only the beam's life. `CHARGE_T` was the same raw-frames mistake: 28 -> **112** | `e74154b` |
| 7 | One `radarUp()`, called by both `drawMini` and the `#mini` pointerdown handler. Measured: 2294 px of camera jump on a dead radar before, 0 after | `e74154b` |
| 17 | **The citation was wrong.** `[GAOREP]` has no `BuildLimit` line — RA2 does not limit the Ore Purifier either, and a useless second one is RA2's own behaviour. No change made | — |
| 18 | Nuclear Reactor 2x3 -> **4x4**. `[NAAPWR]` is dead art with no rules.ini section at all; `Name=Nuclear Reactor` is on `[NANRCT]` (rules.ini:15992) | this commit |
| 8 | **Did not reproduce.** Measured at both 1400x900 and 1500x950: opening the drawer takes `scrollTop` 0 -> 120 and 0 -> 70, the toggle stays on screen, and Start Game is inside the card's box in every state. Either it was fixed between the audit and the sweep, or the original measurement read a different element | — |
| 13 (part) | **Aircraft rearm** was 2.5 s; `[General] ReloadRate=.3` is MINUTES per ammo point — 1080 ticks. The row's other half, "`[ORCA] Ammo=1` + `[Maverick] Burst=2` is one two-round attack", is **dropped: `[ORCA]` carries no `Ammo=` line in this ini** | this commit |
| 16 | **`ARMOURS` was nine columns where RA2's `Verses=` rows are eleven** (rules.ini:19086 lists the order). All 36 warhead rows widened; the Terror Drone moved from `light` to its real `special_1`, which rules.ini's own comment calls "a unit with infantry vulnerabilities" — as `light` it took 50% from small arms. **The row's justification was wrong**: it said Tesla and the War Miner's gun are 200% against it, but only ten warheads in this ini even have eleven columns and only four differ from 100, none of them 200 | this commit |
| 19 (part) | **VeteranROF and VeteranSpeed applied only at ELITE** while VeteranCombat and VeteranArmor were already per-level — `[General]` calls all four "per level", cap 2. Veteran speed moved into `uspd`, which the file's own comment names as the single place every mover reads. **`ElitePrimary` is still unmodelled** (34 units have one) and stays open | this commit |
| 20 | **Ore densified every second at +2**, unconditionally. Now RA2's mechanism — periodic, `[Riparius] GrowthPercentage=.06`, one of twelve density stages — at ore's own `Growth=2200`. See design-decisions.md for the two-reading comparison and its measured cost | this commit |
| 28 | **Dreadnought salvo 100 × 2**; `[General] DMislDamage=300` is what the DMisl detonates for, `[DredLauncher] Burst=2` sends two. The 100 was the launcher's own `Damage=50` doubled — the projectile's launch value, not its warhead's | this commit |
| 35 | **EVA speech was never cancelled**, so a base collapse read out over the score card and on into the front menu, and pausing the match did not pause the voice. One `evaHush()`, called from pause/resume, `finish()` and `menu()`. Verified only as a smoke test — headless Chromium has no TTS voice, so the behaviour itself is unverified | this commit |
| 14 | **Not actioned: unverifiable.** "A damaged power plant produces full output; RA2 scales it with health" — there is no ini key for it in v1.006, so it rests on engine behaviour I cannot cite. Left open rather than changing a core economy mechanic on an unsupported claim | — |
| 25 | **Infantry firing was 3 phases** where `[E1Sequence] FireUp=164,6,6` and `FireProne=212,6,6` (art.ini:9660, 9664) are SIX — the walk was corrected to six in an earlier pass and the fire cycle was not. `INF_SEQ` widened, `infSeqOf` re-phased to two ticks a frame across the 13-tick burst window, and `bakeInfantry`'s raise/recoil curves rewritten as six-entry tables. Measured headless off `art.fr()`: **3 distinct `fire` frames and 2 `fireprone` before, 6 and 6 after**, against the walk's 6 | this commit |
| 24 | **The rubble decal popped in at full opacity on the death tick.** It now holds at zero for six ticks and eases to full by tick 30, so the crater emerges as `killBld`'s `life: 32` centre blast burns out. Verified as a seven-frame strip at t = 0/4/8/14/22/34/60: **before, a complete crater under a still-rising fireball at t = 0; after, clean ground until the blast clears.** Shell craters and scorches keep their own timing — those are already queued to their round's impact | this commit |
| 21 | **Ore lay on urban pavement.** `patch()` refusing anything but `T_GROUND` never reached the case it was written for, because the urban theatre PAINTS its `T_GROUND` as concrete slabs. An ore cell now wears the theatre's *alt* material — its dirt — decided in one place (`dirtAt`) that the LAT feather mask reads too, so the dirt blends into the surrounding paving instead of ending on a tile edge, and ore that spreads mid-match brings its dirt with it. Measured on River Crossing: **62 of 62 ore cells on paving before, 0 after** | this commit |
| 23 | **Ore and gem fields read as a diamond honeycomb.** Two causes, both closed: the variant was picked by `(x * 5 + y * 11) & 3`, which reduces to `(x + 3y) mod 4` — fixed diagonal stripes, not a hash — and every cell's cluster was CLIPPED to its own diamond, so the outermost crystals were sliced flat along the boundary and the slices lined up across a field. Now **12 variants** per density level off the cell hash, the crystals drawn outside the clip on a canvas 26 px wider than the tile so a cluster overhangs its neighbours, and one ore pass after all the ground is down (drawn per-cell, the next cell's ground tile repainted the last one's overhang and put the seam straight back). Verified live at zoom 1 and 1.8 on Iron Frontier, River Crossing and Gem Valley | this commit |
| 26 | **Snow cliffs were markedly worse than temperate, and cliffs generally read engineered.** Four causes: a cliff cell was ONE sprite per neighbour mask, so a ridge was the same rock at a one-cell period (now 16 masks × **3 variants**, baked lazily); `crest1` was computed and never read, so every column's top sat level at `crest` and a run carried one ruled line (now the crest slopes across each column); the crown-edge rim lumps were drawn INSIDE the crown's clip, so they could only bite inward and the plateau stayed a mathematically exact diamond (now unclipped and pushed out over the drop, with their own shadow); and the talus was four small lumps hugging the wall (now seven over a 14 px band with real boulders among the chips). The snow branch specifically: its face was a cold blue-grey (`#828d95` over `#3f4952`) which under regular strata banding read as chromed panelling, and its snow cap was a straight-edged quad from a column's leading crest point to its trailing one — one ruled white line the length of a ridge. The face is warm-neutral stone now, the load follows the broken crest at a depth cut per point with about one column in four scoured bare, and snow catches on the bedding-plane ledges. Also: each column's jut now tapers to nothing at the cell's two end vertices, which closes the dark slit that opened at every tile boundary. **What is NOT closed: a cliff run still reads as one panel per tile** — each cell bakes its own columns with independent juts, so the two sides of a shared vertex do not match. That needs seam-matched cliff construction, not more texture | this commit |
| 27 | **The Kirov was never re-proportioned.** *The row's own headline number was a misreading:* head-on aspect **0.74 is right** — unit-identity-reference.md §2.4 measures RA2's `[ZEP]` nose-on at 61×86 = **0.71**. What was actually wrong is what §2.4 and §3's R6 name: the bake was 132×51 and `drawUnit` multiplied it by 1.3, so at 172×66 it was **16 % longer than RA2's proportion** (139×62 = 2.24 against our 2.61) *and* it was the one sprite on the field going through a bilinear upscale, because the battlefield context has image smoothing on. Now baked at its drawn size (`VSC.kirov = 1.30`) with the draw fudge gone, and re-proportioned to R6's target of 139×62 × 1.067 = **148×66**. Measured, composed exactly as `drawUnit` composes: **broadside 172×66 (2.61) → 147×66 (2.23)** against RA2's 2.24; **nose-on 83×114 (0.73) → 72×102 (0.71)** against RA2's 0.71; span 3.3× the Harrier's against §2.4's "≥ 2.0×". **Still open: §2.4's "gondola separated below the envelope by ≥ 4 px"** — measured 0 px of daylight in every bearing, and it trades directly against the size target (each 4 px of separation costs ~6 % of the broadside aspect, taking 2.23 to ~2.10). The gate does not measure it, by its own note. **`tools/art-metrics.js:258` must lose its `? 1.3 : 1` when this lands** — the harness hardcodes the fudge it calls "the Kirov's draw fudge", and with it left in place the harness composes a Kirov 1.3× larger than the game draws | this commit |

| 9 | **Measured, and the row is wrong on all three counts.** 12 matches × 25 game-minutes, instrumented per order type. **Transports:** 12 loads in 12 matches on River Crossing, 8 in 12 on the default map — "never loads a transport" is false. **Attack-move:** `amove` is 0 and always will be, because it is a PLAYER command (ctrl+shift click) while `aiOrderAttack` issues a target-directed `attack`. A set-piece drives four tanks past a Sentry Gun under each order: both destroy it, same final hp, same survivors — an `attack` order falls through to `findTarget` and stops to fight what it meets. Counting order NAMES measured nothing. A test now pins the two as equivalent so the counter is never "fixed" by bolting `amove` onto the AI. **Garrison:** the AI does garrison — 3 blocks entered over 12 matches once there are blocks. The audit measured 0 because **the headless sim's default map has no garrisonable structure at all**, which is row 22 wearing row 9's clothes | this commit |
| 22 (part) | **Three of seven maps placed nothing garrisonable** — Frozen Front, Chokepoint Pass and Gem Valley never called a civilian-block generator, so a whole mechanic did not exist on them and the default sim map was one of them. All seven now carry at least four, guarded by a test | this commit |

| 32 | **The Guardian GI fired its missile while WALKING.** rulesmd.ini's `[GGI]` has `Deployer=yes` + `DeployFire=yes`: standing he is an ordinary rifleman, braced he is an anti-armour and anti-air emplacement, and ours made the deploy state decorative. Now gated — and he auto-braces on BOTH sides, which is not a nicety: `[GGI]`'s commented-out `DeployTime` says the explicit state machine was dropped "b/c of autodeploy", and without it the gate is a pure nerf. **The first attempt WAS that pure nerf**: the deploy check went through `findTarget`, which filters candidates by the weapon the unit holds right now — the 4-cell rifle while packed — so a tank at 6 cells was invisible and he never braced. It has its own scan on the missile's range now | this commit |

| 19 (rest) | **`ElitePrimary` scoped, not done.** 34 anchored `ElitePrimary=` lines, ~24 of them on units we field. They are NOT multipliers — `[M60]` 15 dmg becomes `[M60E]` 25 at the same ROF and range, `[120mm]` 90/ROF65/AP becomes `[120mmE]` 85/ROF80 with a **different warhead** (`RHINAPE`), `[20mmRapid]` 30/ROF20/HARVWH becomes 50/ROF50/**HowitzerWH**, and `[Maverick]` 150/Burst2/Rng6 becomes `[MaverickE]` **300/Burst4/Rng9**. So the work is ~24 weapon rows plus warheads we do not have, AND a per-unit read of `EliteAbilities=` first: a unit that gets both `ElitePrimary` and `FIREPOWER` would otherwise be double-buffed against the elite VeteranCombat multiplier already applied. Left open deliberately — half of this is worse than none of it | — |

| 33 | **Split: half the row is unsupported, half is real.** `MultiplayerAICM=400,0,0` is described in rules.ini only as "Multiplayer AI Coefficient of Money (Genius, Smart, Easy)" — a per-difficulty lump, which is exactly what the code pays once at match start on Hard. The row calls that a defect without saying what the correct behaviour would be, so **no change made**. `AITriggerSuccessWeightDelta=20` IS unimplemented: RA2 raises a team-type's trigger weight by 20 when its team succeeds and lowers it when it fails, so the AI learns which attacks work on this map against this opponent. We track `ai.failed` and per-team outcomes already, so the hook exists; the feature does not. **Open, with the citation** | — |

| 26 (rest) | **Cliff seam-matching — a scoped CANDIDATE, deliberately not shipped.** The art pass tapered each column's JUT to zero at the cell vertices, closing the dark slit at every tile boundary, and left the CREST untapered — so where two cells meet one skyline can end 10 px high and the next begin at 0, which is what still makes a run read as one panel per tile. The same taper applied to `crest`/`crest1` at the first and last column would make the two sides of a shared vertex agree without needing seam-matched construction between cells, and costs nothing across the middle of a cell where the variation is doing its work. **Written, then reverted unverified**: three attempts to render a cliff run for an A/B landed on shroud and then on an ore field, and shipping a visual change nobody has looked at is what this session spent the day objecting to elsewhere. It needs one before/after crop of a cliff run on Chokepoint Pass or Frozen Front with the map revealed (`g.seen.fill(1)`) and the camera actually on the wall | — |


Five tests asserted the old wrong values and so certified the bugs they guarded (`wm.rate === 20`,
`desolator.rate === 50`, `yuri.rate === 200`, `IVAN_BOMB_T === 900`, and the Iron Curtain test's own
title said "twenty seconds"); each now carries the rules.ini line it agrees with. Every new guard was
run against the BROKEN build first and made to fail with the expected signature — one of them passed
on a broken build at first because it was matching a word inside a comment, which is recorded in the
test itself.

The 24-match soak (6 seeds x 4 difficulty/faction combos, 30 game-minutes each) is clean through all
of this: zero invariant violations, zero page errors, mean match length unmoved (17.8 -> 18.2 min).

### Blocker

1. **(features §3, S) Weapon range is measured centre-to-centre with no footprint allowance.**
   Tanya cannot damage *any* building 2×2 or larger — measured: 3 000 ticks against a 3×2 Barracks,
   hp 500 → 500, closest approach 1.87 against her C4's range of 1.2. Crazy Ivan cannot plant on
   one either. Against the 4×4 Construction Yard every attacker with range ≤ 3 stalls at 3.01 and
   does nothing, the Tesla Trooper included. Two units' entire reason to exist is unreachable. The
   fix pattern is already in the file: `atRefinery` (20419) adds `max(gw,gh)/2 + 1.9`; `rngVs`
   (2034) does not.

### Major

2. **(features §2a, S)** Three units carry the raw RA2 `ROF` where the file's own convention —
   stated in the comment beside each of them — is `ROF × 4`. The **War Miner**, **Desolator** and
   **Nighthawk** fire four times too fast. Measured live.
3. **(features §2a, S)** `VERSES` declares **`FlakGuyWH` twice** (977 and 988); the annotated-correct
   RA2 row loses to the later wrong one, so the Flak Trooper's AA burst does 4× RA2's damage to
   medium armour — which is what both harvesters are made of.
4. **(features §3, S)** The **Iron Curtain lasts 20 s**; `IronCurtainDuration=750` at the frame rate
   the ini itself documents is 50. Measured: 1 200 ticks.
5. **(features §3, S)** A **Prism support beam costs its tower 30 ticks**, not `PrismSupportDelay`'s
   240 — the code uses `PrismSupportDuration` ×2, the key for how long the beam is *visible*. The
   four-second dead weight is the entire tactical cost of the mechanic.
6. **(features §3, S)** The **Terror Drone eats its host twice as fast as RA2** — 120 ticks per bite
   against `[DroneJump] ROF=60`'s 240.
7. **(art §6, S)** **The radar gate is cosmetic.** `drawMini` blanks the panel to `NO RADAR`, but the
   `mini` pointerdown handler has no such guard — a left-click on the black panel still jumps the
   camera and a right-click still issues a move order to that cell. A player with no Radar keeps
   full map navigation, which is precisely what RA2's gate exists to deny.
8. **(art §6, S)** **"Game settings" expands into nothing you can see.** Measured at 1500×950:
   clicking the disclosure grows `#ovCard`'s `scrollHeight` 922 → 1149 and leaves `scrollTop` at 0,
   so the entire drawer — starting credits, units, speed, Bases, Short Game, Crates, Superweapons —
   stays below the fold, and the row you just clicked is gone behind the sticky footer. The biggest
   match-flow gap the old audit filed is now fully implemented, works, and is undiscoverable.
9. **(features §6, M)** The AI **never garrisons a civilian block, never loads a transport and never
   attack-moves** — three mechanics that exist and work for the player. Measured over a 22-minute
   hard-vs-hard sim: 0 / 0 / 0, against 29 tech captures.
10. **(features §1, M)** **No country layer.** RA2 has nine countries with one unique unit or power
    each; the game has two factions and no country field. Five units are therefore missing (Sniper,
    Terrorist, Tank Destroyer, Demolition Truck, Black Eagle) and three that *should* be
    country-locked — Grand Cannon, Tesla Tank, Desolator — are open to everyone.
11. **(features §4, L)** **Two seats only**, and the multiplayer wire is a same-browser
    `BroadcastChannel`. The lockstep core (command queue, barrier, state hashing, desync detection)
    is real and tested; a cross-machine relay and player ids past two are not.

### Minor

12. **(features §3, S) One timing sweep closes four rows at once.** Ivan's fuse (15 s vs 30), the
    Chronosphere's warp delay (2 s vs 4) and radiation's apply and decay are all halved by the same
    mistaken premise — and rows 4 and 5 above are the same family. See the systemic finding.
13. **(features §2a, S)** Aircraft rearm in 2.5 s where `ReloadRate=.3` is 18, and the Harrier fires
    two separate missiles where `[ORCA] Ammo=1` + `[Maverick] Burst=2` is one two-round attack.
14. **(features §3, S)** A **damaged power plant produces full output**; RA2 scales it with health.
15. **(art §6, S)** **Cameos never wear the player's house colour.** `cameoFor` hard-codes the accent
    from the *faction* under a comment claiming it is the house's, and `cameoCache` is not keyed on
    colour or cleared by `applyHouse` — so the army on the field is green and every sidebar cameo
    and superweapon clock is still blue.
16. **(features §2a, S)** `ARMOURS` has nine slots where RA2's `Verses=` rows have eleven, so
    `special_1` is gone and with it RA2's designed counters to the Terror Drone (Tesla and the War
    Miner's own gun are 200 % against it; here they are 85 % and 50 %).
17. **(features §2b, S)** The **Ore Purifier has no `BuildLimit=1`**. A second one is buildable,
    costs $2 500 and 200 power, and does nothing — the income bonus is capped at one internally.
18. **(art §1, M)** The **Nuclear Reactor's footprint is read off the wrong art.ini section** —
    `[NAAPWR]`'s 2×3, where the building's own `[NANRCT]` is **4×4**.
19. **(features §2a, S/M)** A **veteran gets neither `VeteranROF` nor `VeteranSpeed`** (both fire only
    at elite, though `VeteranAbilities=` lists them at rank 1 on most units), and an elite never
    swaps to its `ElitePrimary` — 34 units have one.
20. **(features §3, S)** Ore densifies every second; `GrowthRate=5` is five **minutes**. The spread
    beside it is exact.
21. **(art §5, S)** **Ore still lies on pavement** in the urban theatre — `patch()` was fixed to
    refuse anything but `T_GROUND`, but urban `T_GROUND` is painted as concrete slabs.
22. **(features §6 / art §5, M)** Content is thin on four of seven maps: three have no garrisonable
    civilians, only one has bridges or a repair hut, one has no tech buildings. Half the neutral-house
    work is unreachable in a normal game.
23. **(art §4, M)** Ore and gem fields read as a **diamond honeycomb** at close zoom — the backing
    square is gone, the per-cell cluster boundary is not.
24. **(art §1, S)** The **rubble decal pops in at full opacity on the death tick**, so the crater is
    fully painted under a fireball that has not peaked.
25. **(art §2, S)** Infantry **firing is 3 phases** where `[E1Sequence] FireUp=164,6,6` is six. The
    walk was fixed to six; the fire cycle was not.
26. **(art §5, S/M)** **Snow cliffs are markedly worse than temperate ones**, and cliffs generally
    still read engineered — uniform course height, flat top line, no talus.
27. **(art §3, M)** The **Kirov's art was never re-proportioned** — head-on it still collapses to
    aspect 0.74 against 1.43 broadside, the previous audit's exact numbers.
28. **(features §2a, S)** The **Dreadnought's salvo is 200** where `[General] DMislDamage=300` ×
    `Burst=2` is 600 — and the file already follows that convention for the V3.
29. **(art §7, M)** **Music is four loops with no rotation** against `theme.ini`'s 18 tracks, and
    **EVA is still `speechSynthesis`** (unit voices are a real synth; EVA is not).
30. **(art §6, M/L)** Fonts are `system-ui` throughout — 17 sites, no bitmap face — and cameos,
    though now framed and skied, are still auto-crops of the in-game sprite rather than art.
31. **(art §5, L)** Tile-set variety is still a fraction of RA2's 82 / 75 / 110 per theatre.
32. **(features §3, S)** The **Guardian GI fires its missile while walking**; `[GGI] DeployFire=yes`.
33. **(features §6, M/S)** No per-trigger success/failure track record
    (`AITriggerSuccessWeightDelta`), and `MultiplayerAICM=400` is implemented as a one-off +$400.
34. **(features §3, M)** No formation-preserving move.
35. **(art §7, S)** **EVA speech is never cancelled** — a base collapse keeps reading out over the
    score card and the front menu, and pause does not pause the voice.
36. **(features §5, M)** No **`Beacon`** button or `B` key, now that multiplayer ships;
    `ui.ini [MultiplayerAdvancedCommandBar]` is a seven-button bar and `#cmdbar` is a static six.

### Nits

37. **(art §1)** Fire ports are always three where every 1×1 defence has one `DamageFireOffset0=`;
    the Pillbox traverses a turret `[GAPILL]` does not have; the apron is still painted inside each
    building's canvas rather than as a shared `BibShape=` ground layer; the Prism-support comment
    cites `PrismSupportDuration` for the offline window.
38. **(art §2/§4)** `T_CIV` is declared, tested in `solidT()`, given a minimap colour and exported to
    the test surface — and **never assigned by anything**; the explosion draw is still introduced by
    the comment describing the single-blob code that replaced it; `INF_SEQ` has no `panic`, so a
    future `fr('panic', …)` silently renders a standing man.
39. **(features §2/§3)** Flak Cannon sight 10 vs `[NAFLAK] Sight=5` and adjacency 8 vs the file's own
    +4 rule; `SonicWH` and `IvanWH` carry the wrong `InfDeath`; the Guardian GI's missile has no
    `MinimumRange=1`; the Spy's blackout is 10 % short; structure repair runs ~6× RA2's rate (the
    price is exact); `MaxWaypointPathLength=15` is unenforced; no unit-sell at the Service Depot;
    `GuardAreaTargetingDelay` and `BaseDefenseDelay` are unmodelled.
40. **(art §6/§7)** The Dolphin and the Giant Squid have no acknowledgement lines at all; `lastRadar`
    is module-level and never reset, so a new match can chirp `radaroff` on its first frame; the
    options card has no Delete for a save slot and no tooltips toggle; the power meter is the one
    sidebar control with neither a readout nor a tooltip; the superweapon clocks are the last native
    `title=` tooltips left in the game.

### Explicitly NOT gaps — standing decisions, do not "fix" these

- **Structures have no build-up, no MCV unpack and no sell fold-away.** `MAKE_T = 0` (19188),
  `MCV_T = 0` (18905). `bakeMake`, the reverse-play sell and `unpackOf`'s four-frame MCV fold-out are
  all fully built behind those constants. The user asked for instant structures twice.
- **Superweapon and paradrop clocks stay top-left over the battlefield**, not on their sidebar cameos.
- **`P` is Pause**, not RA2's `CombatantSelect`.
- **The AI builds no walls** — `AIBuildsWalls=no` is honoured on purpose; `AIPickWallDefensePercent`
  is wired and dormant, as in RA2.
- **Sidebar scrolling is on PageUp/PageDown/Home/End**, not the arrows, because the arrows pan.
- **Naval task forces never fire on the land maps** — `AINavalYardAdjacency=20` gates them and Iron
  Frontier has no shore.
- **The Grand Cannon has one idle frame** where other structures have six; `[GTGCAN]` has no
  `ActiveAnim=`, so that matches RA2.

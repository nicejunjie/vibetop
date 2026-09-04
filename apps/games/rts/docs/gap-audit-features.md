# Iron Frontier (`apps/games/rts/rts.html`) vs Red Alert 2 v1.006 — feature gap audit

Audited **2026-09-04** against `apps/games/rts/rts.html` at **32 272 lines**, git HEAD **`448fe32`**
(`v1.19.279`). Line numbers are as of that commit. Ground truth is `/tmp/RA2inis/{rules,art,ai,eva,
keyboard,ui,sound,theme}.ini` and `/tmp/YRinis/rulesmd.ini` — **both directories still exist**, so
every citation below was re-read from the file rather than inherited from the previous audit. (The
inis are CRLF; a naive `awk '$0=="[SECTION]"'` returns nothing, which is why a first pass looks like
the sections are missing.)

The game was verified **live**: a loopback server feeding `rts.html` to headless Chromium (the
pattern in `apps/games/rts/tools/art-metrics.js`), driving `window.__rtsTest`, `window.__rtsTables`
and `window.__rtsSim`. Fire rates were measured by watching `u.cool` reset over 1 200 ticks; the
Iron Curtain's duration by damaging an ironed tank every tick until damage landed; Tanya's C4 by
ordering her onto a real Barracks and reading its hit points 3 000 ticks later. The page loads with
**zero console and zero page errors**; a 15-minute hard-vs-easy `__rtsSim` replay runs clean in
4.2 s. Rows marked *read code* or *grep only* are weaker evidence on purpose — the audit this one
replaces was misled by exactly that.

Roster tables: `ARMOURS` L966, `VERSES` L967, `UNITS` L1144, `BLDS` L1686, `SW` L2265, `MAPS` L2437,
`FACTIONS` L2086, `AI_TEAMS` L22738.

Conversion factors, which are the file's **own** convention and are stated in its comments:
**RA2 `ROF` frames × 4 = game `rate` ticks** (`u.cool` counts down one per tick, rts.html:21140);
**`Speed` × 0.013 = `spd`**; Cost / Strength / Armor / Sight / Range 1:1.

---

## What the previous audit got wrong

The 2026-09-02 audit was written against a 17 267-line file. It is now 32 272 lines, and **all 25 of
its ranked gaps have been built**. Its headline blocker is fixed outright. Four were closed with a
defect this audit re-opens at a lower severity (the radar gate, the War Miner's gun, veterancy, and
Prism support) — those are in "Present but broken" below, not here. The record, so the correction is
visible rather than quietly erased:

| Marked | Actually |
|---|---|
| **blocker** — "the Prism Tank fires `PrismWarhead` (200 % vs infantry, 50 % vs structures) instead of `CometWH`" | `UNITS.prismtank` is `CometWH`, ROF 400, range 10, Speed 4 — exactly `[SREF]`/`[Comet]` |
| **major ×7** — seven prerequisite rows (Tesla Coil, Pillbox/Sentry, Patriot/Flak Cannon, Tesla Tank, Flak Trooper, Refinery/Barracks/War Factory, Battle Lab) | **All prerequisites now match `Prerequisite=` exactly** — structures and units, both factions, land and naval. §2c is closed outright |
| **major ×6** — Battle Lab power, Barracks armour, Iron Curtain **charge**, Harrier range, Flak Trooper AA secondary, Flak Track AA range, Apocalypse `MammothTusk` | All fixed. **Every** `Cost`/`Strength`/`Armor`/`Power`/`Sight` in `BLDS` now matches its rules.ini section |
| **major** — "veterancy promotes on kill count, not `VeteranRatio=3.0`" | Promotion is on kill **value** against the unit's own cost (19712), cap 2 |
| **major** — "no force-fire, no attack-move" | Both present: Ctrl+right-click force-fires at an entity or bare ground, Ctrl+Shift+right-click is `amove`. Follow (F) and planning mode (Z) landed with them |
| **major** — "minimap draws from tick 0 with no radar and no power check" | Gated at 30553 — but the gate is **cosmetic**; see the art audit §6 |
| **major** — "the War Miner has no gun" | It has one — and it fires four times too fast; see §2a |
| **major** — "no skirmish starting-credits option" | Credits, starting units, game speed, Bases, Short Game, Crates and Superweapons are all there and all work — and the drawer that holds them is undiscoverable; see the art audit §6 |
| **major** — "no Attack Dog", "no crates", "civilians not garrisonable", "no walls or gates", "no Gap Generator", "no Prism support chain", "23 of eva.ini's 120 lines", "no transports and no naval layer" | All implemented. EVA is **66 unique lines over 74 call sites**, including every line the old audit named |
| **major** — "no team types / task forces" | `AI_TEAMS` (22738) is a real `ai.ini`-shaped layer; a 22-minute hard-vs-hard sim fired 16 distinct team keys |
| **major** — "no >2 players; no multiplayer" | Partly: a real lockstep layer ships (command queue, `LOCKSTEP_DELAY`, state hashing, desync detection) with Host/Join in the menu. Still two seats and still same-browser only |
| **the one reproducible bug** — "all four superweapons declare `cat` twice, so lane and tab disagree" | Fixed. Each carries a single `cat: 'def'`; `laneOfBld` routes them to the Defence lane and `defenceOrderFor` lists them on the Defence tab |
| **"the sidebar understates the Nuclear Reactor by 4×"** | `power: 2000` with `desc: '+2000 power'` |
| **"the Pillbox is blacked out on low power"** | `[GAPILL]` has no `Powered=` key and the Pillbox now keeps firing; `[NALASR] Powered=yes` goes dark (22143) |

**Two of its RA2 citations were simply wrong, and the code is right where the audit called it wrong.**
The old §3 said RA2's chronoshifted units "come back after `ChronoDelay` unless dropped on land" —
that was Red Alert 1. `ChronoDelay` is the post-teleport immobilisation; the game's one-way shift is
correct. And the old art §1 attributed `Turret=yes`/`TurretAnim=LASER` to the Prism Tower; those
lines are inside `[NALASR]`, the Soviet Sentry Gun. `[ATESLA]` and `[TESLA]` both say `Turret=no`.

---

## Read this first — the systemic findings

The old audit's causes (unenforced prerequisites, a handful of role-inverting stats) are gone. Two
new ones account for most of what is left, and each is one sweep rather than a list of chores.

**1. The file states RA2's frame rate twice, and the two statements disagree.** rts.html:19929 says
*"One rules frame is four of our ticks (a Grizzly's `ROF=60` is our `rate: 240`)"* — 15 fps, and
`rules.ini` confirms it twice in its own comments (`SpyPowerBlackout=1000 ; Frame time a spy shuts
down power for (900 = 1 minute)`, and `IronCurtainDuration=750 ;gs In frames 900 is a minute for
15fps`). But the whole "Phase 4c" special-mechanics block asserts **30 fps** in as many words —
`PARASITE_ROF` (20646), `IVAN_BOMB_T` (20696), the radiation constants (20775) — and halves every
duration it converts. `CHRONO_DELAY` (20425) and `IRON_T` (2287) land on the same halving. Six rows
below are that one mistake: the Iron Curtain lasts 20 s instead of 50, a Terror Drone eats its host
in 12 s instead of 24, Ivan's fuse is 15 s instead of 30, the Chronosphere warps in 2 s instead of 4,
and radiation both applies and clears twice as fast. A single pass over the timing constants against
×4 closes all of them.

**2. Range is measured centre-to-centre, so a short weapon cannot reach a big building at all.**
`rngVs` (2034) returns the raw range and `dist` (19575) measures to a structure's *centre*, with no
allowance for its footprint. RA2 measures to the nearest occupied cell. The consequence is not
subtle: **Tanya cannot damage any building 2×2 or larger** and **Crazy Ivan cannot plant on one** —
both measured, both zero damage over thousands of ticks — and against the 4×4 Construction Yard
every attacker with range ≤ 3 stalls at 3.01 cells and does nothing at all. The fix already exists
in the file: `atRefinery` (20419) adds `max(gw, gh) / 2 + 1.9` for exactly this reason.

A third, smaller pattern is worth naming because it has now bitten twice: **a duplicated key in an
object literal silently discards the correct value.** The old audit's one reproducible bug was
`cat:` declared twice on all four superweapons. That is fixed — and `VERSES` now declares
`FlakGuyWH` twice (977 and 988), where the annotated, RA2-correct row loses to a wrong one nine
lines later. Nothing in the test suite looks for this.

---

## 1. Roster — closed, except the country layer

RA2's buildable set is `[BuildingTypes]`/`[InfantryTypes]`/`[VehicleTypes]`/`[AircraftTypes]`
filtered to `TechLevel != -1` with an Allied or Soviet `Owner=`. Enumerated from `rules.ini` that is
**36 structures, 21 infantry, 28 vehicles, 2 aircraft**. Diffed against `__rtsTables` live:

| Class | RA2 | Game | Missing |
|---|---|---|---|
| Structures | 36 (`AMRADR` is `GAAIRC`'s American twin) | 43 `BLDS` keys, 29 buildable + 14 neutral | **none** |
| Infantry | 21 | 14 kinds + the YR Guardian GI | `SNIPE`, `TERROR` (country); `CCOMAND`, `PTROOP`, `CIVAN`, `YURIPR` (campaign/hero) |
| Vehicles | 28 | 25 + Hornet + MCV | `TNKD`, `DTRUCK` (country) |
| Aircraft | 2 | Harrier | `BEAG` (country) |

Every remaining row of the old §1a/§1b is closed — Attack Dog, Spy, Chrono Legionnaire, Nighthawk,
both Shipyards and all eleven hulls, Gap Generator, Grand Cannon, walls and gates, Desolator, Yuri,
Terrorist-adjacent mechanics, the War Miner's gun, the Chrono Miner split, SpySat, Psychic Sensor,
Cloning Vats, the whole neutral house. Verified live: `panelKeys(G, 0, tab)` for a Directorate side
reaches every Directorate item on `b`/`d`/`i`/`v`, ships included.

| Gap | RA2 behaviour (rules.ini key) | What the game does now | Severity | Effort |
|---|---|---|---|---|
| **No country layer at all.** RA2 has nine countries, each with one unique unit or power, chosen under the side | `Owner=` narrows five sections to one country each: `[SNIPE]` British, `[TERROR]` Cuban, `[TNKD]` German, `[DTRUCK]` Libyan, `[BEAG]` Korean; `[General] AllyParaDropInf=E1 AllyParaDropNum=6` / `SovParaDropInf=E2 SovParaDropNum=9` is the American/Russian power | `FACTIONS` (rts.html:2086) has exactly two entries, `dir` and `col`; there is no country field on a side. The three country units the game *does* carry — Grand Cannon (French), Tesla Tank (Russian), Desolator (Iraqi) — are unrestricted, so every Directorate player gets the French wall and every Collective player gets both the Russian and the Iraqi unit at once. Verified live (`__rtsTables.FACTIONS`) | major | M |
| Chrono Commando / Psi-Corps Trooper / Chrono Ivan / Yuri Prime | `[CCOMAND]` TL9, `[PTROOP]` TL9, `[CIVAN]` TL9, `[YURIPR]` TL9 `BuildLimit=1` | missing. All four are campaign units — RA2 does not offer them in skirmish either, so this is scope, not a gap | nit | — |

## 2. Stats fidelity

The conversion factors the previous audit established still hold and are the file's own convention,
stated in its comments: **RA2 `ROF` frames × 4 = game `rate` ticks** (`u.cool` counts down one per
tick, rts.html:21140), **`Speed` × 0.013 = `spd`**, Cost/Strength/Armor/Sight/Range 1:1. `rules.ini`
itself pins the frame rate the ×4 comes from: `IronCurtainDuration=750 ;gs In frames 900 is a minute
for 15fps`.

### 2a. Units

Every unit was re-checked against its own `[SECTION]` and its `Primary=`/`Secondary=` weapon.
**The whole of the previous audit's §2a is fixed** — Prism Tank (`CometWH`, ROF 400, range 10,
Speed 4), Kirov Speed 5, harvester sight 4, Harrier range 6, Apocalypse `MammothTusk` 2×50/320/8,
Flak Track AA range 10, the Flak Trooper's `FlakGuyAAGun` secondary, Guardian GI 160/8, Tanya's
C4 at ROF 400, the deployed GI's `Para` at 60/5, Terror Drone range 1.83, V3 and IFV
`MinimumRange`. What is left:

| Gap | RA2 behaviour (rules.ini key) | What the game does now | Severity | Effort |
|---|---|---|---|---|
| **Three units carry the raw RA2 `ROF` where the file's own convention is `ROF × 4`, so they fire four times too fast.** Each one's comment cites the right number and the field beside it contradicts it | `[20mmRapid] ROF=20` (War Miner), `[RadBeamWeapon] ROF=50` (Desolator), `[BlackHawkCannon] ROF=40` (Nighthawk) → `rate` 80 / 200 / 160 | `warminer rate: 20` (rts.html:1162), `desolator rate: 50` (1386), `nighthawk rate: 40` (rts.html:1435). **Measured live**: the War Miner's `cool` resets every **20** ticks against a GI's correct 80 and a Grizzly's correct 240; the Desolator every **50**, so its 125-damage rad beam does 4× RA2's DPS; the Nighthawk every **40** on an explicit attack order | major | S |
| Yuri's mind-control acquisition is four times too fast | `[MindControl] ROF=200` → 800 | `yuri rate: 200` (rts.html:1397). Milder than the three above because control is permanent and single-target, so the rate only gates re-grabbing | minor | S |
| **`VERSES` declares `FlakGuyWH` twice, and the annotated-correct row loses** | `[FlakGuyWH] Verses=150%,100%,50%,80%,**20%**,20%,0%,0%,0%` | rts.html:977 has that row exactly, commented "Flak Trooper's AA gun (rulesmd.ini)"; rts.html:988 re-declares `FlakGuyWH: [150,100,50,80,**80**,20,0,0,0]` and, being later in the same object literal, wins. Verified live: `__rtsTables.verses('FlakGuyWH','medium')` returns **0.8**. The Flak Trooper's AA burst does four times RA2's damage to medium armour — which is what both harvesters are made of | major | S |
| **`ARMOURS` has nine slots; RA2's `Verses=` rows have eleven** | `[DRON] Armor=special_1`. `[Electric]`/`[Shock]` are **200%** vs `special_1` and `[HARVWH]` is **200%** — the Tesla weapons and the War Miner's own gun are RA2's designed answers to a Terror Drone | `ARMOURS` (rts.html:966) stops at `concrete`; the drone is `armour: 'light'` (rts.html:1354), so Tesla is 85% and the War Miner 50% against it. Verified live. The file's own `HARVWH` comment ("Verses[9]=200% — it chews wooden structures") misreads that column: index 9 is `special_1`, not wood | minor | S |
| **The Iron Curtain lasts 20 s; RA2's lasts 50** | `[General] IronCurtainDuration=750` with the ini's own note "In frames 900 is a minute for 15fps" | `IRON_T = 20 * 60` (rts.html:2287). `STORM_T` on the same line converts `LightningStormDuration=180` at the same 15 fps and is right, so this is a one-constant slip, not a convention difference | major | S |
| **Aircraft rearm 7× too fast** | `[General] ReloadRate=.3` — 0.3 minutes, i.e. **18 s** per ammo point | `reload: 150` ticks = **2.5 s** (rts.html:1208, applied at 21630 `u.ammo++`). A Harrier is back over the target almost as soon as it lands | minor | S |
| Harrier fires two separate missiles instead of RA2's one two-round burst | `[ORCA] Ammo=1` + `[Maverick] Burst=2` — one attack run delivers 2×150 and the jet goes home | `ammo: 2` with no `burst` (rts.html:1208). The file *has* a `burst` field and uses it on the Dreadnought (1566), so the jet loiters over the target for two shots and eats twice the AA | minor | S |
| **Dreadnought salvo is a third of RA2's** | `[DredLauncher] Damage=50` is a launcher stub exactly as `[V3Launcher] Damage=1` is; the real number is `[General] DMislDamage=300`, `Burst=2` → **600** a salvo | `dmg: 100, burst: 2` = 200 (rts.html:1566). The file already follows this convention for the V3 (`V3RocketDamage=200` → `dmg: 200`) and not here | minor | S |
| Flak Cannon sight and adjacency | `[NAFLAK] Sight=5`, `Adjacent=2` | `sight: 10`, `adj: 8`. The file carries every `Adjacent=` at +4 by decision, which would make it 6 | nit | S |
| Two `InfDeath` rows disagree with the warhead | `[SonicWarhead] InfDeath=3` (flying death), `[IvanWH] InfDeath=6` | `INF_DEATH` (rts.html:1058-1066) has `SonicWH: 5` and `IvanWH: 2`. The `RadBeamWH`/`RadSite` 7→4 fold is documented in the comment and is a decision | nit | S |
| Guardian GI missile has no minimum range | `[MissileLauncher] MinimumRange=1` | `rocket.w2` (rts.html:1183) carries no `minRng`, though the IFV and V3 both do | nit | S |
| **Veteran rank gets neither the ROF nor the speed bonus** | `VeteranAbilities=` lists `ROF` on 27 of 49 sections and `FASTER` on 45 of 49 — **at rank 1**. `VeteranROF=0.6`, `VeteranSpeed=1.2` | rts.html:20097 and 21091 gate both on `rank === 2`, while `vetFire`/`vetArmour` (1107, 1112) compound per level with `Math.pow`. A veteran is tougher and hits harder but shoots and moves at a rookie's pace | minor | S |
| **Elite units never swap to their elite weapon** | 34 sections carry an `ElitePrimary=` — `20mmRapidE`, `NeutronRifleE`, `SuperComet`, `MaverickE` — a different weapon, not a multiplier | no `ElitePrimary` handling anywhere; elite is only ×1.21 damage / ×0.6 ROF / ×1.2 speed / self-heal | minor | M |

### 2b. Structures — closed

Every `Cost`/`Strength`/`Armor`/`Power`/`Sight` in `BLDS` now matches its `rules.ini` section, both
factions, including the fourteen structures added since the last audit. The previous audit's whole
§2b list is fixed: Barracks armour `steel`, War Factory −25, Service Depot −25/−20, Battle Lab −100,
Construction Yard sight 8, Airforce Command 5, Refinery/Lab 6, War Factory 4, superweapon HP 750,
the Nuclear Reactor's `+2000 power` description, Iron Curtain recharge 5 minutes. All five
superweapon charge times match `RechargeTime=` exactly (Chrono 7, Storm 10, Curtain 5, Nuke 10,
Paradrop 4 — verified live off `__rtsTables.SW`). The only survivors are the Flak Cannon's sight and
adjacency, listed in §2a.

### 2c. Prerequisites — closed

Every `req` / `reqAll` in `UNITS` and `BLDS` was diffed against `Prerequisite=`, structures and units,
both factions, land and naval. **All match.** The previous audit's seven rows are all fixed
(Tesla Coil `POWER,RADAR`; Pillbox/Sentry `BARRACKS`; Patriot/Flak Cannon `BARRACKS` only; Tesla Tank
`NARADR`; Flak Trooper `NARADR`; Refinery/Barracks `POWER`; War Factory `PROC,GAPILE`; Battle Lab
`GAWEAP,RADAR`). The naval additions are right too: `[AEGIS] GAYARD,RADAR`, `[CARRIER]`/`[DLPH]`
`GATECH`, `[HYD] NARADR`, `[DRED]`/`[SQD] NATECH`.

### 2d. Warhead table — closed but for one duplicate key

All 36 `VERSES` rows were diffed against `Verses=`. Every warhead that exists in `rules.ini` matches
on all nine shared columns. The two exceptions are in §2a: the duplicated `FlakGuyWH` key and the two
missing `special_1`/`special_2` columns.

## 3. Mechanics

Every row of the old §3 was re-driven through the game's own API. **Twenty-eight of its thirty-one
rows are implemented**: garrisoning, engineer capture/repair/defusal, the IFV's thirteen `IFVMode=`
weapons over four turrets, Terror Drone infestation, Ivan's timed bombs, Tesla Troopers crewing a
coil, Chrono Legionnaire erasure, Spy infiltration, kill-*value* veterancy, `RepairPercent=15%`,
ore spread, crates, tech buildings, destructible bridges with `[CABHUT]`, the Gap Generator, the
radar/power minimap gate, Prism support chaining, the whole naval layer, transports, walls and gates
with the `Wall=` warhead flag, attack-move, force-fire, Follow, planning mode, Guard-distinct-from-
Stop, and control groups 1-0 with Ctrl/Shift/Alt. What survives is almost entirely **timing**.

| Gap | RA2 behaviour (rules.ini key/section) | What the game does now | Severity | Effort |
|---|---|---|---|---|
| **Weapon range is measured centre-to-centre with no footprint allowance, so short-range weapons cannot reach a large building at all.** This kills Tanya's and Crazy Ivan's entire reason to exist | RA2 measures a weapon's reach to the target's nearest occupied cell, which is why `[Sapper] Range=1.5` is enough to C4 a 4×4 Construction Yard | `rngVs` (rts.html:2034) returns the raw range and `dist` (19575) is centre-to-centre. **Measured live**: Tanya ordered onto a 3×2 Barracks closes to **1.87** against her `w2.rng` of 1.2, stands there for 3 000 ticks and does **zero** damage (hp 500 → 500); on a 2×2 Power Plant she reaches 1.69, also zero; on a 1×1 Sentry Gun she reaches 1.19 and one-shots it. Crazy Ivan (rng 1.5) reaches 1.51 on the same Barracks and never plants. Against the 4×4 Construction Yard **every** short-range attacker stalls at 3.01 — Tanya, Ivan and even the Tesla Trooper (rng 3) all do nothing. The fix pattern is already in the file 800 lines away: `atRefinery` (20419) uses `max(gw,gh)/2 + 1.9` | **blocker** | S |
| **Prism support beams cost the supporting tower 30 ticks where RA2 takes it offline for 240** | `[General] PrismSupportDelay=60` — "*Firing a support beam takes a Prism offline for this long*". `PrismSupportDuration=15` is a different key: "*A support beam is visible for this long*" | `o.cool = Math.max(o.cool, PRISM_SUP_DUR * 2)` (rts.html:21657) uses the *duration* key, ×2, and never references `PrismSupportDelay`. Measured live with three towers on one Apocalypse: 480 damage at t=29 and another **240 at t=58** — a supporter fully recovered and supported again 29 ticks later. The four-second dead weight is the entire tactical cost of the mechanic | major | S |
| **The Terror Drone eats its host twice as fast as RA2** | `[DroneJump] ROF=60` frames = 4 s | `PARASITE_ROF = 120` (rts.html:20648), commented "RA2 runs its logic at 30 fps, so that is 50 points every TWO seconds". Measured: damage lands at 120 / 240 / 360, and a 300-hp Grizzly dies in 720 ticks instead of 1 440. The approach weapon (`drone.rate: 240`) is right; only the gnaw is wrong | major | S |
| **The Iron Curtain lasts 20 s; RA2's lasts 50** | `[General] IronCurtainDuration=750`, whose own comment reads "*In frames 900 is a minute for 15fps*" | `IRON_T = 20 * 60` (rts.html:2287). Measured live by damaging an ironed Rhino every tick until damage landed: **1 200 ticks exactly**. `BLDS.curtain.desc` has been written to match the bug ("invulnerable for 20 seconds"). The charge time next to it *is* right at 5 minutes | major | S |
| Crazy Ivan's fuse is 15 s; RA2's is 30 | `[General] IvanTimedDelay=450` frames | `IVAN_BOMB_T = 900` (rts.html:20699), same 30 fps premise in the comment. The player-facing countdown at 20707 prints the wrong number from the wrong constant | minor | S |
| The Chronosphere's warp delay is half RA2's, and `ChronoDistanceFactor` is unused | `[General] ChronoDelay=60` frames = 4 s; `ChronoTrigger=yes` + `ChronoDistanceFactor=48` + `ChronoMinimumDelay` scale it by distance | `CHRONO_DELAY = 60 * 2` = 120 ticks (rts.html:20425), applied flat at 20078. The distance-scaling helper `chronoDelayFor` (20416) exists but is wired only to the Chrono Legionnaire. *(The old audit's claim that RA2's shifted units "come back" is wrong — that was RA1. The one-way shift is correct.)* | minor | S |
| Radiation applies and decays twice as fast as RA2 | `[Radiation] RadApplicationDelay=16` frames, `RadDurationMultiple=1` (a site lives `Level` frames) | `RAD_APPLY = 32`, `RAD_DECAY_T = 10`, `RAD_DECAY = 5` (rts.html:20778) — a 500-level pool lives ~1 000 ticks where RA2's lives 2 000. Measured: 485 → 385 over 200 ticks, gone by ~1 000 | minor | S |
| The Spy's blackout is 10 % short | `[General] SpyPowerBlackout=1000` frames, and the same line documents "*900 = 1 minute*" — so 66.7 s | `SPY_BLACKOUT = 3600` (rts.html:20948) = 60 s. The money steal beside it (`SPY_STEAL = 0.5`) is exact | nit | S |
| **A damaged power plant produces full output** | RA2 scales a power plant's output with its health, which is why bombing the plants browns out a base before it destroys anything | `recalcPower` (rts.html:19352) reads `bspecOfB(g, b).power` with no hp term. Measured: a plant at 25 % hp still contributed the full 200 | minor | S |
| Ore densifies about 300× too fast | `[General] GrowthRate=5` — **5 minutes** between growth steps | `stepOre` (rts.html:25231) adds +2 every 60 ticks to a 900 cap. The *spread* beside it is exact (`ORE_SPREAD_T = 2200 * 4`, 6 %, gems excluded, rts.html:22028) | minor | S |
| Structure repair runs about 6× RA2's rate | `[General] RepairRate=.016` minutes between steps, `RepairStep=8` hp — roughly two minutes for a full structure | `stepBld` (rts.html:22119) heals 0.5 % of max hp every 6 ticks: a full repair in ~20 s. The *price* is exact (`0.15 × cost`, `RepairPercent=15%`) | nit | S |
| The Guardian GI fires its missile while walking | `[GGI] Deployer=yes DeployFire=yes` — the missile only fires deployed | `UNITS.rocket` (rts.html:1180) has a `w2` and no `dep`, so the missile is always live. The GI's own deploy beside it is correct | minor | S |
| `MaxWaypointPathLength=15` is unenforced | `[General] MaxWaypointPathLength=15` | `(u.wp || (u.wp = [])).push(...)` (rts.html:28095) — the queue is unbounded | nit | S |
| No formation-preserving move | RA2 Ctrl-drag holds the group's shape | `spreadSpot` (rts.html:22460) gives each unit its own cell on a ring. Follow (F) is implemented (27542) | minor | M |
| No unit-sell at the Service Depot, and selling a producer does not refund its queue | `EVA_UnitSold`; `[General] RefundPercent=50%` applies to units too | `sellBld` (rts.html:27861) refunds structures only | nit | S |
| `GuardAreaTargetingDelay=36` and `BaseDefenseDelay=.25` have no counterpart | `[General]` | behaviour is immediate. Grep only | nit | S |
| Air combat: pads, ammo and reload | `[ORCA] Ammo=1`, `[Maverick] Burst=2`, `[General] ReloadRate=.3`, `PadAircraft`, `AircraftFogReveal=6` | Pads, the sortie cycle and the corrected range 6 are all right; the two-missile structure and the 2.5 s rearm are in §2a | minor | S |

## 4. Match flow

Almost all of the old §4 is closed, and verified by driving it: starting credits
(5 000 / 10 000 / 20 000, all applied), starting units (0 → 2 entities, 3 → 5, 10 → 12), Short Game
on/off, Crates on/off, Bases off (0 buildings, an MCV instead), Superweapons off (honoured in both
`panelKeys` and `canBuild`, per `DisableableFromShell=yes`), and RA2's 1-6 game-speed slider that
changes ticks per second and not the tick, so determinism holds. EVA coverage went from 23 lines to
**66 unique lines over 74 call sites**, including every line the old audit listed by name. The score
screen is a per-side comparison table with Leadership / Economy / Technology. Save/load round-trips
exactly — credits, unit count, building count and seed all restored, and the sim keeps stepping.

| Gap | RA2 behaviour | What the game does now | Severity | Effort |
|---|---|---|---|---|
| **Two seats only, and the multiplayer wire is same-browser** | RA2 skirmish is up to 8, over a real network | `side: [newSide(P_HUMAN), newSide(P_AI)]` (rts.html:2393). The lockstep core is real and tested — command queue, `LOCKSTEP_DELAY`, `netMayStep`, 60-tick state hashing, desync detection (24485), Host/Join in the front menu — but the transport is a `BroadcastChannel` between two tabs of one browser. A cross-machine relay, player ids past two, reconnect-from-log and latency adaptation are all open | major | L |
| **The skirmish options drawer is undiscoverable** | — | Implemented, works, and cannot be seen — the defect is in the art audit §6 because it is a layout bug, but it belongs to this section's feature | major | S |
| The options card has no Delete for a save slot | RA2's in-game menu is Load / Save / **Delete** / Restart / Abort / Settings | `buildSlotRows` (rts.html:31035) | nit | S |
| Skirmish options, EVA coverage, score screen, save/load, pause, map preview, win/lose | | All present and correct | — | — |

## 5. Hotkeys — `keyboard.ini [Hotkey]` vs the `keydown` handler (rts.html:27445)

**Every row of the old §5 is closed**, and every one was verified by driving a real key press:
`Q`/`W`/`E`/`R` select tabs 0-3, `T` type-selects ("All visible Chrono Miners: 2"), `K`/`L` enter
repair and sell mode, `Z` toggles planning mode, `N` steps the next object ("2/6 · Chrono Miner"),
`F` enters follow mode, `Space` reports the last radar event separately from `H` (base), `Delete`
self-destructs the selection, `F1`-`F4` recall views with `Ctrl+F1`-`F4` to set them, and `Ctrl+C`
downloads a PNG where RA2 wrote a `.pcx`. Teams are 1-9 and 0 with Ctrl to create, **Shift to add**
and **Alt to centre** — all ten, all four modifiers (27551-27568). Bindings were diffed 1:1 against
`keyboard.ini`'s VK codes.

| Gap | RA2 behaviour (keyboard.ini) | What the game does now | Severity | Effort |
|---|---|---|---|---|
| **No `Beacon`, now that multiplayer ships** | `ui.ini [MultiplayerAdvancedCommandBar] ButtonList=…,Beacon` is a **seven**-button bar in MP; `PlaceBeacon=66` is `B` | `#cmdbar` (rts.html:663-670) is a static six with no MP branch in `refreshCmdbar` (27886) | minor | M |
| `AllToCheer=67` **C** | RA2 makes the whole army cheer | missing. `INF_SEQ` has the cheer animation and fires it on victory, so only the key and the order are absent | nit | S |
| `ToggleAlliance=65` **A**, `PageUser=85` **U** | multiplayer diplomacy | missing, and moot at 1v1 | nit | M |
| `CenterView=12` (numpad 5) | centres on the selection | missing; `Space` and `H` cover the two cases a player reaches for | nit | S |
| Sidebar scroll is on PageUp/PageDown/Home/End, not the arrows | `SidebarUp/Down=2086/2088` are the arrow keys | Deliberate and commented (rts.html:27484) — the arrows pan the camera, as they do in RA2 | — | — |
| Every other binding | | Present and matching `keyboard.ini` | — | — |
## 6. AI

The old §6's headline row is closed: `AI_TEAMS` (rts.html:22738) is a real task-force layer modelled
on `ai.ini`, and a 22-minute hard-vs-hard `__rtsSim` fired **16 distinct team keys**. `TeamDelays`,
`TotalAITeamCap=30`, `DissolveUnfilledTeamDelay`, `Min/MaximumAIDefensiveTeams`,
`Allied/SovietBaseDefenseCounts`, `AIHateDelays`, `AISafeDistance=20`, `HarvestersPerRefinery=2`,
`AINavalYardAdjacency=20` and the whole `AIIonCannon*Value` superweapon table are all carried in at
their rules.ini values. `AIBuildsWalls=no` is honoured on purpose (`AI_BUILDS_WALLS = false`,
rts.html:22715), so an AI that builds no walls is **correct**, not a gap.

| Gap | RA2 behaviour (rules.ini / ai.ini key) | What the game does now | Severity | Effort |
|---|---|---|---|---|
| **The AI never garrisons, never loads a transport and never attack-moves** — three mechanics that exist, work for the player, and are in `ai.ini`'s own team scripts | `ai.ini` pairs `LoadOntoTransport` with the Move in its `[ScriptTypes]`; garrisoned civilians are worth `ThreatPerOccupant=10` each; `AttackMove` is a `[ScriptTypes]` action | Measured over a 22-minute hard-vs-hard sim: **garrisons 0, transports 0, attack-moves 0**, against 29 tech captures and 20 defensive teams. `AI_TEAMS` carries `dirHawk` and `dirLand` with `drop: true` and neither fired | major | M |
| No per-trigger track record | `AITriggerSuccessWeightDelta=20`, `AITriggerFailureWeightDelta=-50`, `AITriggerTrackRecordCoefficient=1` — RA2's AI *learns* which teams work against you | rts.html:23131-23134 nudges a weight by `+20` for a matching posture, but nothing accumulates across the match; weights are static per difficulty | minor | M |
| `MultiplayerAICM=400` is a one-off grant, not an income coefficient | `[General] MultiplayerAICM=400,0,0` — "Coefficient of Money" for the AI in multiplayer | rts.html:23191 pays a single +$400 at match start. Against a $10 000 opening that is a rounding error | minor | S |
| Content is thin on four of the seven maps | RA2 maps carry civilians, bridges and tech buildings everywhere | Sampled all seven `MAPS`: `tundra` / `choke` / `gems` have **no** garrisonable civilian blocks, only `river` has bridges or a Bridge Repair Hut, `coastal` has no tech buildings, and the Tech Hospital was not seen placed on any sampled map. Half the neutral-house work is unreachable in a normal game | minor | M |
| Naval task forces never fire on the land maps | `AINavalYardAdjacency=20` | Correct by design — `dirFleet`/`dirCV`/`colSub` are gated on a reachable shore, and Iron Frontier has none. Recorded so it is not mistaken for a gap | — | — |
| Task forces, defensive counts, placement bias, difficulty knobs, harvester harassment, engineer captures, MCV redeploy, superweapon targeting, harvesters per refinery, aircraft lane | | All present and matching their rules.ini values | — | — |

---

## Present but broken

Ordered by how much of a feature the defect eats. All were reproduced live.

| What | Where | Evidence |
|---|---|---|
| **Tanya's C4 can never damage a building of 2×2 or larger, and Crazy Ivan can never plant on one.** Both units exist to kill structures; both are inert against every structure worth killing | `rngVs` rts.html:2034, `dist` 19575 — centre-to-centre with no footprint term | Measured: Tanya on a 3×2 Barracks, 3 000 ticks, hp **500 → 500**, closest approach 1.87 vs her C4's 1.2; on a 2×2 Power Plant 1.69, also zero; on a 1×1 Sentry Gun she closes to 1.19 and one-shots it (hp −2 100). Ivan on the same Barracks reaches 1.51 against his 1.5 and never plants. On the 4×4 Construction Yard **every** attacker with range ≤ 3 stalls at 3.01 — Tanya, Ivan and the Tesla Trooper alike |
| **`VERSES` declares `FlakGuyWH` twice; the annotated-correct row loses.** rts.html:977 carries `[150,100,50,80,20,20,0,0,0]` — RA2's row exactly, with the comment naming its source. rts.html:988 re-declares it as `[150,100,50,80,**80**,20,0,0,0]` and, being later in the same object literal, wins | rts.html:977 and 988 | Verified live: `__rtsTables.verses('FlakGuyWH','medium')` returns **0.8** where `[FlakGuyWH] Verses=` col 5 is 20 %. Both harvesters are `medium` |
| **Three units carry the raw RA2 `ROF` where their own comment cites it and the file's convention is `ROF × 4`** — the War Miner, the Desolator and the Nighthawk fire four times too fast | rts.html:1162, 1386, 1435 | Measured: the War Miner's `cool` resets every **20** ticks against a GI's correct 80 and a Grizzly's correct 240; the Desolator every **50**, so its 125-damage rad beam does 4× RA2's DPS; the Nighthawk every **40** on an attack order. *(The Chrono Legionnaire's `rate: 120` looks like the same bug and is not — `fire()`'s `ChronoBeam` branch overrides `cool` to 8, so the field is dead code.)* |
| **A Prism support beam takes its tower offline for 30 ticks where `PrismSupportDelay=60` is 240** — the code uses `PrismSupportDuration`, the key for how long the beam is *visible* | rts.html:21657 | Measured with three towers on one Apocalypse: 480 damage at t=29 and another **240 at t=58**. A supporter recovered and supported again 29 ticks later; RA2's four-second dead weight is the mechanic's entire cost |
| **The Iron Curtain lasts 20 s against RA2's 50, and the sidebar text was written to match the bug** | `IRON_T = 20 * 60` rts.html:2287; `BLDS.curtain.desc` says "invulnerable for 20 seconds" | Measured by damaging an ironed Rhino every tick until damage landed: **1 200 ticks exactly**. `IronCurtainDuration=750` at the 15 fps the ini documents on that very line is 3 000 ticks. `STORM_T` on the same source line converts `LightningStormDuration=180` at 15 fps and is right |
| **The Terror Drone eats its host twice as fast as RA2** | `PARASITE_ROF = 120` rts.html:20648 | Measured: damage at 120 / 240 / 360, a 300-hp Grizzly dead in 720 ticks instead of 1 440. The approach weapon (`drone.rate: 240`) is correct — only the post-infest gnaw is not |
| **A second Ore Purifier is buildable, costs $2 500 and 200 power, and does nothing.** `[GAOREP] BuildLimit=1`; `BLDS.purifier` has no `max`, so `canBuild` (22189) never blocks it, while the income code caps the bonus at one (`hasBld(...) ? 1 : 0`, 20610) | rts.html:1765, 20610, 22189 | Placed three live, all succeeded |
| **A damaged power plant produces full output** | `recalcPower` rts.html:19352 reads `bspecOfB(g, b).power` with no hp term | Measured: a plant at 25 % hp still contributed 200. RA2 scales output with health, which is why bombing the plants browns out a base before it destroys anything |
| **The Nuclear Reactor's footprint is read off the wrong art.ini section.** It cites `[NAAPWR] Foundation=2x3`; `[NAAPWR]` has **no rules.ini section at all** — it is unused art. The building's own section is `[NANRCT]`, whose `Foundation=4x4` | rts.html:1774 | Every other footprint in the table matches. Verified against art.ini and rules.ini |
| **The Guardian GI fires its missile while walking** | `UNITS.rocket` rts.html:1180 has a `w2` and no `dep` | `[GGI] Deployer=yes DeployFire=yes` — the missile should require the deploy. The GI's own deploy beside it is correct |
| **The AI never garrisons, never loads a transport and never attack-moves** — three mechanics that exist and work for the player, and that `ai.ini`'s own `[ScriptTypes]` pair with the move | `AI_TEAMS` rts.html:22738; `dirHawk` and `dirLand` carry `drop: true` and never fired | Measured over a 22-minute hard-vs-hard `__rtsSim`: garrisons 0, transports 0, attack-moves 0, against 29 tech captures and 20 defensive teams |
| **Half the neutral-house work is unreachable in a normal game.** Sampled all seven maps: `tundra`, `choke` and `gems` have no garrisonable civilian blocks; only `river` has bridges or a Bridge Repair Hut; `coastal` has no tech buildings; the Tech Hospital was not seen placed on any sampled map | `placeNeutrals` | Sampled live across `MAPS` |

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

| 9 | **Measured, and the row is wrong on all three counts.** 12 matches × 25 game-minutes, instrumented per order type. **Transports:** 12 loads in 12 matches on River Crossing, 8 in 12 on the default map — "never loads a transport" is false. **Attack-move:** `amove` is 0 and always will be, because it is a PLAYER command (ctrl+shift click) while `aiOrderAttack` issues a target-directed `attack`. A set-piece drives four tanks past a Sentry Gun under each order: both destroy it, same final hp, same survivors — an `attack` order falls through to `findTarget` and stops to fight what it meets. Counting order NAMES measured nothing. A test now pins the two as equivalent so the counter is never "fixed" by bolting `amove` onto the AI. **Garrison:** the AI does garrison — 3 blocks entered over 12 matches once there are blocks. The audit measured 0 because **the headless sim's default map has no garrisonable structure at all**, which is row 22 wearing row 9's clothes | this commit |
| 22 (part) | **Three of seven maps placed nothing garrisonable** — Frozen Front, Chokepoint Pass and Gem Valley never called a civilian-block generator, so a whole mechanic did not exist on them and the default sim map was one of them. All seven now carry at least four, guarded by a test | this commit |


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

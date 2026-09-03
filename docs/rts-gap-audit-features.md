# Iron Frontier (`landing/rts.html`) vs Red Alert 2 v1.006 — feature gap audit

Ground truth: `/tmp/RA2inis/{rules,ai,eva,keyboard,ui}.ini`, `/tmp/YRinis/rulesmd.ini`.
Code refs are line numbers in `/home/junjie/vibe-coding/vibetop/landing/rts.html` (17 267 lines).
Roster tables: `UNITS` L617, `BLDS` L813, `SW` L1018. Verified live against
`http://127.0.0.1:8121/rts.html` (Playwright, `__rtsTables` / `__rtsTest`); the page loads
with **zero console/page errors**.

Conversion factors established from the data (they hold consistently, so deviations below are
real, not unit confusion): **ROF frames × 4 = game `rate`**; **RA2 `Speed` × 0.013 = game `spd`**;
Cost/Strength/Armor/Sight/Range are 1:1.

---

## 1. Roster

RA2 buildable set taken from `[InfantryTypes]`/`[VehicleTypes]`/`[AircraftTypes]`/`[BuildingTypes]`
filtered to `TechLevel != -1` and an Allied/Soviet `Owner=`. YR-only additions the game already
carries (GGI, FLAKT) are in scope.

### 1a. Allied (Directorate)

| Gap | RA2 behaviour (rules.ini key) | What the game does now | Severity | Effort |
|---|---|---|---|---|
| Attack Dog | `[ADOG]` $200, Str 100, Speed 8, Sight 9, `Primary=GoodTeeth` (30 dmg, ROF 30, Rng 1.5, `ParasiteDog` — 100% vs infantry, 0% vs everything else); `Prerequisite=Barracks`, TL2. Only unit that detects a disguised Spy/Mirage | **missing** — no dog in `UNITS` (L617-812) | major | S |
| Spy | `[SPY]` $1000, Str 100, flak, Speed 4, Sight 9, `Primary=MakeupKit` (`Snapshot` warhead, `MakesDisguise=yes`); `Prerequisite=GAPILE,GATECH`. Infiltration effects driven by `[General] SpyMoneyStealPercent=.5`, `SpyPowerBlackout=1000` | **missing** — no disguise system, no infiltration | major | L |
| Chrono Legionnaire | `[CLEG]` $1500, Str 125, Speed 5, Sight 8, teleport locomotor `{4A582747…}`, `Primary=NeutronRifle` (8 dmg, ROF 120, Rng 5, `ChronoBeam` — erases the target rather than damaging it); `Prerequisite=GAPILE,TECH` | **missing** (roadmap L135/137 lists it open) | major | M |
| Navy SEAL | `[GHOST]` Name=SEAL, `TechLevel=-1` in vanilla rules.ini (YR `[GHOST]` TL9, $1000, `Primary=MP5`, `Secondary=Sapper`) | **missing** — arguably out of scope for v1.006 skirmish (TL −1), in scope only under the YR carve-out | minor | S |
| Sniper | `[SNIPE]` $600, Str 125, `Primary=AWP` (125 dmg, ROF 150, **Range 14**, `HollowPoint`), `Prerequisite=GAPILE,RADAR`, TL1 (British) | **missing** — country-specific unit, no country layer at all | minor | M |
| Tank Destroyer | `[TNKD]` $900, Str 400, heavy, Speed 5, `Primary=SABOT` (150 dmg, ROF 70, Rng 5, `UltraAP` — 100% vs light/heavy, 40% vs medium, 2% vs infantry AND structures), `Prerequisite=GAWEAP,RADAR` (German) | **missing** | minor | M |
| Black Eagle | `[BEAG]` $1200, Str 200, `Primary=Maverick2` (200 dmg vs the Harrier's 150), TL3 (Korean) | **missing** | minor | S |
| Nighthawk / BlackHawk Transport | `[SHAD]` $1000, Str 175, Speed 14, `Passengers=5`, `Primary=BlackHawkCannon`, `Prerequisite=GAWEAP` | **missing** — no transports of any kind | major | L |
| Allied Shipyard + all Allied navy | `[GAYARD]` $1000 Str 1500 `Adjacent=12`; `[DEST]` $1000, `[AEGIS]` $1200, `[CARRIER]` $2000, `[DLPH]` $500, `[LCRF]` $900 | **missing** — `solidT()` (L517) makes `T_WATER` impassable to everything; no naval layer | major | L |
| SpySat Uplink | `[GASPYSAT]` $1500, Str 1000, wood, Power −100, `Prerequisite=GATECH,GACNST`, TL9 — reveals the whole map | **missing** | minor | S |
| Gap Generator | `[GAGAP]` $1000, Str 600, wood, Power −100, `GapGenerator=yes`, `Prerequisite=GATECH`, TL7 | **missing** — no shroud-*re*-imposition mechanic exists (`g.seen` is a one-way latch, L14470-14481) | major | M |
| Grand Cannon | `[GTGCAN]` $2000, Str 900, steel, Power −100, Sight 10, `Primary=GrandCannonWeapon` (150 dmg, ROF 120, **Range 15, MinimumRange 3**, `GrandCannonWH`), `Prerequisite=RADAR`, TL7 | **missing** — the Allies have no long-range defence at all | major | M |
| Allied Wall | `[GAWALL]` $100/segment, Str 300, concrete, `Adjacent=8`, `Repairable=false`, `Prerequisite=GAPILE`; `[General] WallBuildSpeedCoefficient=3.0`, `WallTower=GACTWR` | **missing** — no wall/gate at all | major | M |
| Guardian GI | YR `[GGI]` — present | **present** (L638) but with real stat/mechanic errors, see §2 and §3 | — | — |
| Chrono Miner teleport-home | `[CMIN] Locomotor={4A582747…}` (teleport) — it warps back to the refinery when full; `[General] ChronoDelay=60`, `ChronoHarvTooFarDistance=50` | **partial** — the Chrono Miner exists (`UNITS.harvester` with `capCol` split, L618) but drives home like the War Miner (`stepHarvester` `state==='toref'`, L13228-13260). No warp, and the Allied/Soviet miners are the *same* `type`, so they cannot diverge behaviourally | major | M |
| GI / Engineer / Rocketeer / Grizzly / IFV / Mirage / Prism Tank / Tanya / MCV / Harrier / Chronosphere / Weather Control / Pillbox / Patriot / Prism Tower / all six Allied economy+tech structures | — | **present** | — | — |

### 1b. Soviet (Collective)

| Gap | RA2 behaviour (rules.ini key) | What the game does now | Severity | Effort |
|---|---|---|---|---|
| Attack Dog | `[DOG]` $200, `Primary=BadTeeth`, `Prerequisite=Barracks`, TL2 | **missing** | major | S |
| Desolator | `[DESO]` $600, Str 150, plate, Sight 6, `Deployer=yes`/`DeployFire=yes`, `Primary=RadBeamWeapon` (125 dmg, ROF 50, Rng 6, `RadBeamWarhead` 100/100/100/20/15/10/0/0/0), `Secondary=RadEruptionWeapon`, `SelfHealing=yes`, `Prerequisite=NAHAND,RADAR`, TL8. Leaves radiation (`[Radiation] RadLevelMax=500`) | **missing** — and there is no radiation/ground-hazard system to hang it on | major | L |
| Yuri | `[YURI]` $1200, Sight 12, `Primary=MindControl` (`Controller` warhead, `MindControl=yes`), `Prerequisite=NAHAND,NATECH`, TL10 | **missing** — no mind control; ownership transfer only exists for structures via engineer (L13391) | major | L |
| Terrorist | `[TERROR]` $200, Str 75, flak, Speed 6, `Primary=TerrorBomb` (225 dmg, `TerrorBombWH` CellSpread 2), `Explodes=yes` (Cuba) | **missing** | minor | S |
| Demolition Truck | `[DTRUCK]` $1500, `Primary=Demobomb` (300 dmg, `DemobombWH` **CellSpread 8**), `Explodes=yes` (Libya) | **missing** | minor | S |
| Amphibious Transport | `[SAPC]` $900, Str 300, heavy, `Passengers=12`, `Prerequisite=NAYARD` | **missing** | major | L |
| Soviet Shipyard + navy | `[NAYARD]` $1000 TL2; `[SUB]` $1000, `[HYD]` $600, `[DRED]` $2000, `[SQD]` $1000 | **missing** | major | L |
| Cloning Vats | `[NACLON]` $2500, Str 1000, Power −200, `Prerequisite=NATECH`, TL9 — doubles infantry output | **missing** | minor | S |
| Psychic Sensor | `[NAPSIS]` $1000, Str 750, Power −50, Sight 10, `SensorArray=yes`, `Prerequisite=NATECH`, TL10 | **missing** | minor | S |
| Soviet Wall | `[NAWALL]` $100, Str 300, concrete, `Adjacent=8`, `Prerequisite=NAHAND` | **missing** | major | M |
| War Miner's gun | `[HARV] Primary=20mmRapid` — 30 dmg, ROF 20, Rng 5.5, `HARVWH`; the Soviet miner shoots back | **missing** — `UNITS.harvester` (L618) is `dmg: 0` for both factions | major | S |
| Terror Drone armour class | `[DRON] Armor=special_1` | **partial** — game uses `light` (L779). `ARMOURS` (L551) has no `special_1`/`special_2` slot, so every warhead's 10th/11th Verses column is discarded | minor | M |
| Conscript / Flak Trooper / Engineer / Shock ("Tesla") Trooper / Crazy Ivan / Rhino / Flak Track / V3 / Terror Drone / Apocalypse / Tesla Tank / SMCV / Kirov / Sentry Gun / Flak Cannon / Tesla Coil / Iron Curtain / Nuke Silo / all Soviet economy+tech structures | — | **present** | — | — |

### 1c. Neutral / map objects

| Gap | RA2 behaviour | What the game does now | Severity | Effort |
|---|---|---|---|---|
| Tech Oil Derrick | `[CAOILD]` Str 1000, steel, `Capturable=yes`, `Unsellable=yes` — capture for a cash trickle | **missing** | major | M |
| Tech Airport / Hospital / Outpost | `[CAAIRP]` Str 800 (paradrop), `[CATHOSP]`/`[CAHOSP]` Str 800 (heals infantry), `[CAOUTP]` Str 2000 | **missing** | minor | M |
| Garrisonable civilian buildings | 155 sections carry `CanBeOccupied=yes` with `MaxNumberOccupants` 1-10 (e.g. `[CACITY01]`=10, `[CAEUR1]`=3); `[General] ThreatPerOccupant=10` | **missing** — `T_CIV` (L515) is inert scenery, `solidT()` (L517) treats it as a rock. `mapCity` (L1194) places 10 of them | major | M |
| Bridges destructible + `[CABHUT]` repair hut | Bridge cells collapse under fire; `[CABHUT]` Str 2000 rebuilds them; `EVA_BridgeRepaired` exists in eva.ini (#46) | **missing** — `T_BRIDGE` (L515) is an indestructible passable deck | major | M |
| Crates | `[CrateRules]` `CrateMaximum=255 CrateMinimum=1 CrateRadius=3.0 CrateRegen=3 FreeMCV=yes`; `[Powerups]` Money 2000 / Veteran / Firepower ×2.0 / Armor ×1.5 / Speed ×1.2 / Reveal / HealBase / Unit | **missing** — no crate entity anywhere in the file | major | M |
| Ore spreading | `[General] TiberiumSpreads=yes`, `[Riparius] Spread=2200 SpreadPercentage=.06 Growth=2200 Value=25`; `[Cruentus] Value=50` | **partial** — regrowth only, capped at 900/tile, never spreads (L14512-14515). Gem value ×2 is correct (`GEM_MULT`, L516) | minor | S |

---

## 2. Stats fidelity

### 2a. Twelve units (spot-check)

| Gap | RA2 behaviour (rules.ini key) | What the game does now | Severity | Effort |
|---|---|---|---|---|
| **Prism Tank warhead is inverted** | `[SREF] Primary=Comet`; `[Comet]` Damage 100, **ROF 100** (→400), **Range 10**, **Warhead=CometWH**; `[CometWH] Verses=100,100,100,75,50,50,**200,200,200**` — a *siege* gun: double vs every structure, half vs armour | `UNITS.prismtank` (L790-799) `rate: 240`, `rng: 8`, `wh:'PrismWarhead'` — `VERSES.PrismWarhead` (L568) is 200% vs infantry / **50% vs all structures**. Exactly the opposite role | **blocker** | S |
| Prism Tank speed | `[SREF] Speed=4` → 0.052 | `spd: 0.078` (L794) = Speed 6; the in-code comment even claims "Speed 6" | major | S |
| Kirov speed | `[ZEP] Speed=5` → 0.065 | `spd: 0.045` (L675) = Speed 3.5 | minor | S |
| Harvester sight | `[HARV] Sight=4`, `[CMIN] Sight=4` | `sight: 5` (L620) | nit | S |
| Harrier missile range | `[Maverick] Range=6`, ROF 10 (→40), Damage 150, Burst 2 | `rng: 3.2` (L668) — nearly half. Forces the jet to fly into Patriot/Flak range | major | S |
| Apocalypse AA missile | `[MammothTusk]` Damage 50 **Burst 2** (=100/volley), **ROF 80** (→320), **Range 8** | `aaW: { dmg: 50, rate: 100, rng: 6, aaRng: 6 }` (L707) — 3.2× too fast, 2 tiles short, half the volley | major | S |
| Flak Track AA range | `[FlakTrackAAGun] Range=10`, Damage 35, ROF 25 (→100) | `aaW.aaRng: 6.5` (L752). Damage/ROF correct | major | S |
| Flak Trooper has no AA weapon | `[FLAKT] Secondary=FlakGuyAAGun` — Damage 20, ROF 25 (→100), **Range 8**, warhead `FlakGuyWH` (150/100/50/80/20/20/0/0/0) | `UNITS.flak` (L645) has no `aaW`; it shoots aircraft with its ground `FlakTWH` burst at `aaRng: 6`. `weaponFor` (L582) therefore never swaps | major | S |
| Guardian GI missile | YR `[MissileLauncher]` Damage 40, **ROF 40** (→160), **Range 8**, `GUARDWH` (20/20/20/**100**/50/**100**/10/10/10) | `w2: { dmg:40, rate:200, rng:6 … }` (L642) — 25% too slow, 2 tiles short. `VERSES.GUARDWH` (L570) is correct | minor | S |
| Tanya C4 | `[Sapper]` Damage 2500, **ROF 100** (→400), Range 1.5, `Super` | `w2: { dmg:2500, rate:200, rng:1.2 … }` (L736) — twice RA2's rate | minor | S |
| Deployed-GI weapon | `[Para]` Damage 15, **ROF 15** (→60), **Range 5**, `SSA` | `dep: { dmg:15, rate:40, rng:6 … }` (L628) — 50% too fast, 1 tile too far | minor | S |
| Terror Drone attack range | `[DroneJump] Range=1.83` | `rng: 1.5` (L780) | nit | S |
| V3 minimum range | `[V3Launcher] MinimumRange=5` (plus `[General] V3RocketDamage=200`, ROF 150→600, Range 18 — all correct in-game) | no `MinimumRange` concept anywhere; a V3 can fire point-blank (L755-760) | major | S |
| IFV minimum range | `[HoverMissile] MinimumRange=1` | not modelled (L718) | nit | S |
| **Correct**: GI, Conscript, Engineer, Rhino, Grizzly, Apocalypse main gun (100 dmg × Burst 2 = the game's 200), Mirage, Tesla Tank, Tesla Trooper, Crazy Ivan, MCV, Rocketeer, Kirov bomb, IFV, V3 — cost/HP/armour/speed/sight/ROF/range/warhead all match | | | | |

### 2b. Eight structures (spot-check)

| Gap | RA2 behaviour (rules.ini key) | What the game does now | Severity | Effort |
|---|---|---|---|---|
| Barracks armour | `[GAPILE]`/`[NAHAND] Armor=steel` | `BLDS.barracks.armour='wood'` (L831). Under `VERSES.AP` (L556) that is 65% vs 45% — the barracks takes ~44% more tank damage than it should | major | S |
| War Factory power | `[GAWEAP]`/`[NAWEAP] Power=-25` | `power: -50` (L836) — double | minor | S |
| Service Depot power | `[GADEPT] Power=-25`, `[NADEPT] Power=-20` | `power: -50` (L866), same for both factions | minor | S |
| Battle Lab power | `[GATECH]`/`[NATECH] Power=-100` | `power: -200` (L871) — double, and it is the single biggest early power hit in the game | major | S |
| Construction Yard sight | `[GACNST]`/`[NACNST] Sight=8` | `sight: 6` (L817) | nit | S |
| Airforce Command sight | `[GAAIRC] Sight=5` | `sight: 9` (L857) — nearly double | minor | S |
| Refinery / Battle Lab / War Factory sight | `[GAREFN] Sight=6`, `[GATECH] Sight=6`, `[GAWEAP] Sight=4` | 5 / 5 / 5 (L826, L871, L836) | nit | S |
| Superweapon HP | `[GACSPH]`/`[NAIRON] Strength=750` (Weather/Nuke are 1000) | all four `hp: 1000` (L918-941) | nit | S |
| Nuclear Reactor description | `[NANRCT] Power=2000` — the game's value is right | `desc: '+500 power'` (L882) with `power: 2000` — the sidebar lies to the player by 4× | minor | S |
| Iron Curtain charge time | `[IronCurtainSpecial] RechargeTime=5` (Chrono 7, Storm 10, Nuke 10) | `SW.curtain.charge = 60*60*7` (L1027) — 40% too long; verified live (`swCharge.curtain === 7`) | major | S |
| **Correct**: Power Plant (800/750/wood/+200/4), Tesla Reactor (600/+150), Refinery (2000/1000/wood/−50), Radar Tower (1000/1000/wood/−50/10), Pillbox (500/400/steel, Vulcan2 50/26→104/5.5), Sentry Gun (idem, Vulcan), Tesla Coil (1500/600/steel/−75, CoilBolt 200/120→480/7), Prism Tower (1500/600/steel/−75, PrismShot 120/60→240/8), Patriot (1000/900/−50, RedEye2 75/55→220/12), Flak Cannon (1000/900/−50, FlakWeapon 40/20→80/12), Ore Purifier (2500/900/−200, `PurifierBonus=.25`) | | | | |

### 2c. Prerequisites (`Prerequisite=` vs `spec.req`, L1049 `reqMet`)

| Gap | RA2 behaviour | What the game does now | Severity | Effort |
|---|---|---|---|---|
| Tesla Coil needs Radar | `[TESLA] Prerequisite=POWER,RADAR,NACNST`, TL5 | `BLDS.tesla` (L846) has **no `req`** — a $1500 coil is buildable from the opening Construction Yard | major | S |
| Pillbox / Sentry Gun need Barracks | `[GAPILL]`/`[NALASR] Prerequisite=BARRACKS,*CNST` | no `req` (L839, L891) | minor | S |
| Patriot / Flak Cannon need only Barracks | `[NASAM] Prerequisite=BARRACKS,GACNST` TL4; `[NAFLAK] Prerequisite=BARRACKS,NACNST` TL4 | gated behind `airforce` / `radar` (L901, L909) — AA arrives a whole tier late | major | S |
| Tesla Tank needs Radar, not Lab | `[TTNK] Prerequisite=NAWEAP,NARADR` | `req: 'lab'` (L783) | major | S |
| Flak Trooper needs Radar | `[FLAKT] Prerequisite=NAHAND,NARADR` | no `req` (L645) — buildable off the bare Barracks | minor | S |
| Refinery / Barracks need Power; War Factory needs Refinery + Barracks; Battle Lab needs War Factory | `[GAREFN] Prerequisite=POWER`; `[GAPILE] Prerequisite=POWER`; `[GAWEAP] Prerequisite=PROC,GAPILE`; `[GATECH] Prerequisite=GAWEAP,RADAR` | none of these are enforced (L824, L829, L834, L869) — you can open straight into a War Factory | major | S |
| **Correct**: MCV (`GAWEAP,GADEPT`→`req:'depot'`), Rocketeer, V3, Crazy Ivan, Apocalypse, Kirov, Mirage, Prism Tank, Tanya, Nuclear Reactor, Ore Purifier, Service Depot, Airforce Command, Radar Tower, all four superweapons (`*TECH`) | | | | |

---

## 3. Mechanics

| Gap | RA2 behaviour (rules.ini key/section) | What the game does now | Severity | Effort |
|---|---|---|---|---|
| Garrisoning civilian buildings | `CanBeOccupied=yes` + `MaxNumberOccupants` on 155 civilian sections; occupants fire from windows; `[General] ThreatPerOccupant=10`; EVA `StructureGarrisoned`/`StructureAbandoned` | **missing** — `T_CIV` is impassable scenery (L514-517) | major | M |
| Engineer capture | Engineer walks in, is consumed, building keeps its damage; also **repairs** a damaged own/allied structure to full and defuses Ivan bombs (`[DefuseKit] Warhead=BombDisarm`) | **partial** — capture works (`stepUnit` `order.t==='capture'`, L13391-13407). No repair-by-engineer, no bomb defusal, no multi-engineer rule | minor | M |
| IFV weapon swap by passenger | `[FV] Passengers=1`; the turret changes with the occupant (10+ variants) | **missing** — no transports at all; roadmap L135 lists it open | major | L |
| Terror Drone infesting | `[DroneJump] Warhead=Parasite`, `Parasite=yes` — the drone *enters* a vehicle and kills it from inside; only a Service Depot or a Desolator's rad can clear it | **partial** — plain 50-damage melee every 240 ticks (L776-782); no infestation state | major | M |
| Mirage disguise | `[General] DefaultMirageDisguises=TREE01..TREE04` | **present** — `isDisguised` (L12705), 120-tick idle, 1.5-tile reveal, drops on fire (`findTarget` L12735) | — | — |
| Tanya C4 on buildings | `[Sapper]` 2500/`Super` on `use:'bld'` | **present** (L736) but ROF is 2× (see §2a) | nit | S |
| Crazy Ivan bombs | `[IvanBomber]` plants a **timed** bomb (`[IvanBomb] IvanBomb=yes`, `BombTickingSound`); bombs stick to units, can be defused, and can be planted on your own units to make suicide carriers | **partial** — instant 400 damage at range 1.5 (L769-775); no timer, no attachment, no defusal | major | M |
| Tesla Trooper charging coils | Shock Trooper next to a Tesla Coil boosts/powers it (`[TESLA] Secondary=OPCoilBolt` in YR; vanilla behaviour is the same charge mechanic) | **missing** | minor | M |
| Chrono Legionnaire erasure | `[ChronoBeam] Temporal=yes` — target is erased over time, not damaged | **missing** | major | M |
| Spy infiltration effects | `SpyMoneyStealPercent=.5`, `SpyPowerBlackout=1000`; EVA #88-95 cover tech/radar/cash/power sabotage | **missing** | major | L |
| Crushing | `Crusher=yes` on all tanks, `Crushable=yes` on infantry; `[SHK] Crushable=no`, `[DRON] Crusher=no` | **present and correct** — `crusher()`/`crushable()`/`crush()` L13262-13264 | — | — |
| Veterancy thresholds | `[General] VeteranRatio=3.0` — promotion at 3× **the unit's own cost in kill value**, `VeteranCap=2` | **partial** — flat kill *count*: 3 kills = veteran, 6 = elite (`damage()` L12766-12769). A GI that kills three Conscripts promotes as fast as an Apocalypse that kills three MCVs | minor | S |
| Veterancy bonuses | `VeteranCombat=1.1`, `VeteranArmor=1.5`, **`VeteranROF=0.6`**, **`VeteranSpeed=1.2`**, `VeteranSight=0.0` | **partial** — `vetFire`/`vetArmour` (L599-600) applied in `fire()`/`damage()`. **ROF and speed bonuses are absent**; the elite self-heal (L13377) has no rules.ini basis | major | S |
| Structure repair (wrench) | `[General] RepairPercent=15%`, `RepairRate=.016`, `RepairStep=8` — a full repair costs 15% of build cost | **partial** — `stepBld` (L13574-13579) charges **30%** of cost for a full repair, at 0.5% maxhp per 6 ticks | minor | S |
| Service Depot repair | `[General] RepairBay=GADEPT,NADEPT`, `IRepairRate=.001`, `IRepairStep=20`; free | **present** (L13581-13589), rate is a house number (2% maxhp/0.5 s) not the rules one | nit | S |
| Sell | `[General] RefundPercent=50%` | **present** — `sellBld` L13379-13383. RA2 also refunds **units** produced from the sold structure and lets you sell a *unit* at the Service Depot (`EVA_UnitSold`); neither exists | nit | S |
| Low-power effects | `MinLowPowerProductionSpeed=.5`, `MaxLowPowerProductionSpeed=.8`, `LowPowerPenaltyModifier=1`; `Powered=yes` buildings go dark | **present** — `prodSpeed()` L13680-13684 implements the curve exactly. But `powered()` (L12540) is all-or-nothing per side and `stepBld` (L13590) darkens **every** defence — RA2's `[GAPILL]` has no `Powered=` key, so the Pillbox keeps firing in a blackout while `[NALASR] Powered=yes` does not. Also RA2 scales a damaged power plant's output with its health; the game does not (L12529-12538) | minor | S |
| Ore growth | `TiberiumGrows=yes`, `TiberiumSpreads=yes`, `GrowthRate=5`, `[Riparius] Value=25`, `[Cruentus] Value=50` | **partial** — grows to a 900 cap, never spreads (L14512) | minor | S |
| Crates | see §1c | **missing** | major | M |
| Tech buildings | Oil Derrick / Airport / Hospital, all `Capturable=yes Unsellable=yes` | **missing** | major | M |
| Bridges | destructible cells + `[CABHUT]` repair hut | **missing** — `T_BRIDGE` is indestructible (L515-520) | major | M |
| Shroud | `[General] FogOfWar=no`, `[AudioVisual] ShroudGrow=no` — RA2 vanilla has shroud only, and it does **not** regrow | **present and correct** (`revealFor`/`tileSeen` L14470-14488) | — | — |
| Gap Generator | `[GAGAP] GapGenerator=yes` re-shrouds a radius on the enemy's map | **missing** — `g.seen` is a one-way `Uint8Array` latch, so there is no mechanism to un-see | major | M |
| Radar / minimap gating | `[NARADR] Powered=true`; the minimap is black without a powered radar building. `RadarOn`/`RadarOff` sounds in `[AudioVisual]` | **missing** — `drawMini()` (L16488) renders from tick 0 with no radar building and no power check. Radar is currently *only* a tech-tree gate | major | S |
| Chronosphere rules | `[GACSPH] SuperWeapon=ChronoSphereSpecial`, `RechargeTime=7`, `IsPowered=true`, `PreClick=yes`; `[General] ChronoDelay=60`, `ChronoDistanceFactor=48`, `ChronoRangeMinimum=0`, `ChronoTrigger=yes`. In RA2 the shifted units come **back** after `ChronoDelay` unless dropped on land; infantry chronoshifted are killed | **partial** — `swFire` key `'chrono'` (L12970-12989): 3×3, ≤9 vehicles, infantry die (correct), instant one-way move. No return trip, no distance-scaled delay, no per-unit warp-in animation timing | minor | M |
| Iron Curtain | `RechargeTime=5`, invulnerability for a fixed window, kills infantry it covers | **present** — `ironed()` L1047, `damage()` voids the hit L12746. Charge time wrong (7 vs 5) | major | S |
| Lightning Storm | `[General] LightningDamage=250`, `LightningStormDuration=180` frames, `LightningCellSpread=10`, `LightningSeparation=3`, `LightningHitDelay=10`, `LightningWarhead=IonWH` (100% everything except **3% vs concrete**) | **partial** — `stepStorm` (L12879-12899): 10 bolts / 20 s / 3×3 / **200** damage on a bespoke `WeatherWH` that is 100% vs concrete (L563). RA2's damage is 250 and its warhead barely scratches concrete | minor | S |
| Nuclear missile | `[NAMISL] SuperWeapon=MultiSpecial`, `RechargeTime=10`, `WeaponType=NukeCarrier`; radiation crater afterwards (`[Radiation]`) | **present** — `stepNuke` L12903-12934, 10 s flight, per-cell falloff, ore vaporised, shroud burned. No lingering radiation field | minor | M |
| Prism Tower support chain | `[General] PrismType=ATESLA`, `PrismSupportMax=8`, `PrismSupportModifier=150%`, `PrismSupportDelay=60`, `PrismSupportDuration=15`, `PrismSupportHeight=420`; `[PrismSupport]` 200 dmg Rng 8 | **missing** — towers fire independently (`stepBld` L13590-13593). This is the single defining Allied defence mechanic | major | M |
| Naval combat | see §1 | **missing** | major | L |
| Air combat — ammo/pads | `[ORCA] Ammo=1`; `[Maverick] Burst=2`; `[General] PadAircraft=ORCA,BEAG`, `ReloadRate=.3`, `AircraftFogReveal=6`, `AttackingAircraftSightRange=2` | **present** — `stepAircraft` L13517, `findPad` L13496, 4 pads/HQ (`PAD_SLOTS` L972). Game fires 2 separate missiles where RA2 fires one 2-round burst; range is 3.2 vs 6 | minor | S |
| Air combat — Kirov bombs, AA | `[BlimpBomb]` 250/`BlimpHE` CellSpread 2 | **present and correct** (L672-680, `canHit` L948, `rngVs` L954) | — | — |
| Transports (Flak Track 5, IFV 1, SAPC 12, LCRF 12, Nighthawk 5) | `Passengers=` on each | **missing entirely** — no load/unload, no passenger list | major | L |
| Harvester auto-return | correct | **present** (`stepHarvester` L13095-13260), plus a flee-under-fire behaviour RA2 does not have | — | — |
| Building placement adjacency | `Adjacent=2` on most structures, `4` on Pillbox/Sentry/Patriot, `8` on walls, `12` on shipyards, `[General] AINavalYardAdjacency=20` | **partial** — one global `BUILD_RADIUS = 6` (L13797) for everything, and it is measured from the *whole* footprint box, not RA2's cell adjacency. Defences cannot be pushed 4 cells out, walls cannot chain | minor | S |
| MCV deploy | `[AMCV] DeploysInto=GACNST`; `[General] BaseUnit=AMCV,SMCV`, `AIAutoDeployFrameDelay=15,25,100` | **present and correct** — `deployMcv`, D key (L15095), double-click (L15272), `canPlace(...{anywhere:true})` | — | — |
| Walls and gates | `[General] GDIGateOne=GAGATE_A`, `NodGateOne=NAGATE_A`, `WallTower=GACTWR`, `WallBuildSpeedCoefficient=3.0`; walls block movement and most warheads honour `Wall=yes` | **missing** — no walls, no gates; `VERSES` ignores the `Wall=` flag entirely | major | M |
| GI deploy | `[E1] Deployer=yes`, secondary `Para` | **present** (L15353-15360, `weaponFor` L589) with the stat errors in §2a. **RA2's `[GGI] Deployer=yes DeployFire=yes` means the Guardian GI's missile only fires deployed** — the game fires it while walking | minor | S |
| Rally points | `EVA_NewRallyPointEstablished` (#100) | **present** — `makeRally` L15651, draws the routed path. Only Barracks/War Factory accept one; RA2 lets any production structure (incl. Shipyard) take one | nit | S |
| Waypoints | `[General] MaxWaypointPathLength=15`, `[AudioVisual] WaypointAnimationSpeed=10` | **present** — shift-right-click queue + `Path` mode (L15546, L15572) | — | — |
| Formation move | RA2 `Ctrl`-drag formation / "F" follow | **partial** — `orderUnitsTo` spreads a group over a ring (L15559-15563) but there is no formation-preserving move and no Follow command | minor | M |
| Guard / Scatter / Stop | `GuardObject=G`, `ScatterObject=X`, `StopObject=S`; `[General] GuardModeStray=2.0`, `GuardAreaTargetingDelay=36` | **present** (L15085-15105, `unitsCmd` L15334) though "Guard" and "Stop" are the *same* code path — RA2's Guard actively engages inside `GuardModeStray` and returns to post; Stop does not | minor | S |
| Control groups | `TeamCreate_1..10` (Ctrl+digit), `TeamSelect_1..10`, `TeamAddSelect` (Shift+digit), `TeamCenter` (Alt+digit) | **partial** — only groups **1-5** (`/^[1-5]$/` L15108), no add-to-group, no centre-on-group | minor | S |
| Attack-move | `AttackMove` is a supported `[AdvancedCommandBar]` button in ui.ini | **missing** — no attack-move order type; `orderAttack` (L15630) needs a target entity | major | M |
| Force-fire | RA2 Ctrl+click force-fires at ground/own units | **missing** — `rightOrder` (L15580) has no modifier path; Shift is waypoint-queue only | major | S |
| Planning mode | `PlanningMode=Z` in keyboard.ini, in the default `[AdvancedCommandBar] ButtonList` | **missing** | minor | M |

---

## 4. Match flow

| Gap | RA2 behaviour | What the game does now | Severity | Effort |
|---|---|---|---|---|
| Skirmish: starting credits | RA2 skirmish credits selector | **missing** — hard-coded $10 000 (`newSide` L1086) | major | S |
| Skirmish: unit count | RA2 "Units" slider seeds each player's opening force | **missing** — always 1 yard + 2 harvesters + 3 infantry (`startMatch` L16982-16997) | minor | S |
| Skirmish: Short Game | ends the match when a player has no structures **and** no MCV | **partial** — that is the *only* win rule the game has (L14544-14557); there is no long-game "kill every unit too" mode and no toggle | minor | S |
| Skirmish: Crates on/off | `[CrateRules]` | **missing** (no crates) | minor | S |
| Skirmish: Bases on/off | RA2 "Bases" option starts you with units only | **missing** | minor | S |
| Skirmish: Superweapons on/off | `DisableableFromShell=yes` on all four `[*Special]` sections | **missing** — always on | minor | S |
| Skirmish: Game speed | `[General] GameSpeedBias=1.6`; RA2 has a speed slider | **missing** — `STEP = 1000/60` fixed (L500), no in-match speed control | minor | S |
| Skirmish: map preview | RA2 shows a preview + spawn dots | **present** — `mapThumb`/`buildMapRow` (L16762-16803), six maps, theatre glyphs | — | — |
| Skirmish: more than 2 players / teams / colours | RA2 skirmish is up to 8 | **missing** — hard 2-player (`P_HUMAN=0, P_AI=1`, L522) | major | L |
| Win/lose conditions | short game = all structures + MCV | **present** and slightly better (`economyDead` L14561 breaks stalemates). Note the MCV clause counts "*could* still buy one" (L14553), which is not an RA2 rule | — | — |
| EVA lines | `eva.ini [DialogList]` lists **120** skirmish-relevant events | **partial** — the game fires 23 (grep `eva(` → L12759, 12760, 12768, 12770, 12860, 12932, 12946-12951, 12966-12967, 12987-12988, 13402-13403, 13706, 13717, 14977, 15033, 15347, 15382, 15485). Missing high-frequency ones: `NewConstructionOptions` (#49 — fires on every tech unlock, one of RA2's most recognisable lines), `Building` (#52), `OnHold` (#56), `Canceled` (#51), `Repairing` (#57), `UnitRepaired` (#70), `UnitSold` (#71), `BaseDefensesOffLine` (#59), `BuildingOffLine`/`OnLine` (#60/61), `CannotDeployHere` (#63), `SelectTarget` (#65), `Training` (#66), `UnableToComply` (#47), `NewRallyPointEstablished` (#100), `BattlefieldControlOnline` (#120), `BattleControlTerminated` (#15), `YouAreVictorious`/`YouHaveLost` (#22/23), `NuclearSiloDetected`/`IronCurtainDetected`/`ChronosphereDetected` (#1/4/7 — fired when the enemy **builds** one, not when it fires), `EnemyAirArmadaDetected` (#96), `ArmorBattallianDetected` (#98), `StructureGarrisoned` (#107), `ChronoMinerOffline` (#109), `NewTechnologyAcquired` (#74) | major | M |
| Score screen | RA2 shows a per-player breakdown (buildings/units/harvested, leadership/economy/technology, ranked) with `ScoreAnimSound` | **partial** — `finish()` (L17009-17032) shows a one-line "units built / lost / killed" plus the leaderboard. No harvested total, no ranking, no per-side comparison | minor | M |
| Pause | RA2 pauses via Options (Esc) | **present** — P key + button (L15107, L16915) | — | — |
| Save / load | RA2 saves skirmish games | **missing** — no serialisation anywhere | minor | L |
| Multiplayer | RA2 is lockstep-deterministic | **missing**. The sim *is* deterministic: `srand`/`rnd` is a seeded xorshift (L528-536), `__rtsSim` (L17148) replays a whole match headlessly from a seed, and `simStep` (L14493) is the only mutator. Two obstacles: (a) `stepUnit`/`aiTactics` read `performance.now()`-free but rendering-side state (`headless` guards are already in place, good), (b) there is no command-queue/lockstep layer and no `Beacon` (roadmap L112 says "Beacon pending multiplayer") | major | L |

---

## 5. Hotkeys — `keyboard.ini [Hotkey]` vs the `keydown` handler (L15068-15121)

Decoding: value & 0xFF = VK code; +256 = Shift, +512 = Ctrl, +1024 = Alt, +2048 = extended.

| Gap | RA2 behaviour (keyboard.ini) | What the game does now | Severity | Effort |
|---|---|---|---|---|
| `P` collides | `CombatantSelect=80` = **P** (select all combat units on screen) | **P = pause** (L15107). RA2 pauses from the Options key (Esc) | minor | S |
| Type-select key | `TypeSelect=84` = **T** | button only ("Same", L15396); no key | minor | S |
| Sidebar tabs | `StructureTab=81` **Q**, `UnitTab=82` **R**, `InfantryTab=69` **E**, `DefenseTab=87` **W** | **missing**; W/A/S/D are camera pan, so Q/E/R are free and W conflicts | minor | S |
| Repair / Sell modes | `ToggleRepair=75` **K**, `ToggleSell=76` **L** | button only (`setCmdMode`, L15303) | minor | S |
| Next object | `NextObject=78` **N** | **missing** | minor | S |
| Follow | `Follow=70` **F** | **missing** | minor | M |
| Alliance / Beacon / Cheer / Page user | `ToggleAlliance=65` **A**, `PlaceBeacon=66` **B**, `AllToCheer=67` **C**, `PageUser=85` **U** | **missing** (all multiplayer-adjacent; `A` conflicts with camera pan) | nit | M |
| Planning mode | `PlanningMode=90` **Z** | **missing** | minor | M |
| View bookmarks | `View1..4=112..115` **F1-F4**; `SetView1..4=624..627` **Ctrl+F1-F4** | **missing** | minor | S |
| Teams 6-10 | `TeamSelect_10=48` **0**, `_6..9=54..57` **6-9**; `TeamCreate_*=560..569` **Ctrl+digit**; `TeamAddSelect_*=304..313` **Shift+digit**; `TeamCenter_*=1072..1081` **Alt+digit** | only 1-5 select and Ctrl+1-5 assign (L15108-15120); no Shift-add, no Alt-centre | minor | S |
| Centre view / radar event | `CenterView=12` (numpad 5), `CenterOnRadarEvent=32` **Space**, `CenterBase=72` **H** | **Space and H both go home** (L15081-15082). RA2's Space centres on the *last radar event*, H centres on base — the "where did that explosion happen" key is missing | minor | S |
| Delete / Options | `Delete=46`, `Options=27` **Esc** | Esc cancels (L15072-15080) ✓; Delete (self-destruct selection) missing | nit | S |
| Sidebar scroll | `SidebarUp/Down=2086/2088` (arrow keys), `PageUp/PageDown/Home/End` | arrows pan the camera; the build list scrolls only with the mouse | nit | S |
| Screen capture | `ScreenCapture=579` Ctrl+C | **missing** | nit | S |
| **Present**: Esc, Space/H home, S stop, G guard, D deploy, X scatter, 1-5 / Ctrl+1-5, WASD+arrows pan, wheel zoom | | | | |

---

## 6. AI

RA2's skirmish AI is data-driven: `ai.ini` holds **241 sections** — `[TaskForces]` (fixed unit
compositions), `[ScriptTypes]` (move/attack/guard scripts) and `[TeamTypes]` bound to
per-difficulty trigger weights. Tuning lives in `rules.ini [General]`.

| Gap | RA2 behaviour (rules.ini / ai.ini key) | What the game does now | Severity | Effort |
|---|---|---|---|---|
| Team types / task forces | `ai.ini [TaskForces]` + `[TeamTypes]`; `[General] TeamDelays=2000,2500,3500`, `TotalAITeamCap=30,30,30`, `DissolveUnfilledTeamDelay=5000`, `FillEarliestTeamProbability=100,100,100` | **missing** — one monolithic `ai.wave` array (`aiTactics` L14344-14468). No named compositions, no per-team scripts, no team cap | major | L |
| Trigger weighting / learning | `AITriggerSuccessWeightDelta=20`, `AITriggerFailureWeightDelta=-50`, `AITriggerTrackRecordCoefficient=1` | **missing** — posture is recomputed from army value only (`stepAI` L13985-13996) | minor | M |
| Defensive team counts | `MinimumAIDefensiveTeams=1,1,1`, `MaximumAIDefensiveTeams=2,2,2`, `AlliedBaseDefenseCounts=25,20,6`, `SovietBaseDefenseCounts=25,22,6`, `BaseDefenseDelay=.25`, `UseMinDefenseRule=yes` | **partial** — a flat 3 (5 when defending) defence cap (L14140), one `ai.garrison` list (L14425-14449). No per-difficulty defence budget | minor | S |
| Base defence placement | `AIPickWallDefensePercent=50,25,10`, `AIBuildsWalls=no`/`NodAIBuildsWalls=no`, `BaseBias=2`, `AISafeDistance=20` | **partial** — `aiPlace` (L14244) biases defences toward the enemy and spaces the base by `crowding()`. No wall logic (nothing to build) | nit | S |
| Difficulty knobs | RA2 varies via the `x,y,z` triples throughout `[General]` (`AIHateDelays=30,50,70`, `AIVirtualPurifiers=4,2,0`, `MultiplayerAICM=400,0,0`, `CampaignMoneyDelta*`) — i.e. brutal gets **free virtual ore purifiers and a cash multiplier** | **different by design** — `DIFF` (L13860-13863) handicaps only the AI's own play (react/apm/group/opening) and explicitly refuses economy bonuses. Defensible, but it is not RA2's curve: RA2's Brutal is materially advantaged | minor | M |
| Harvester harassment | RA2 teams target harvesters via `TargetSpecialThreatCoefficient` | **present** — `cfg.harass` on hard (L13862), `findTarget` weights harvesters +12 (L12744) | — | — |
| Engineer captures | RA2 AI fields engineer teams to grab tech buildings and enemy structures | **missing** — `aiProduce` (L14009-14172) never queues an engineer; `canBuild` allows it but no branch picks it | major | M |
| MCV redeploy / base rebuild | `[General] BaseUnit=AMCV,SMCV`, `AIAutoDeployFrameDelay=15,25,100` | **present and good** — L14013-14036 | — | — |
| Superweapon targeting | `AIIonCannon*Value` table weights War Factory 100, Power 60, Base Defense 35, Helipad 20, ConYard 10, harvester/MCV/engineer 1; `AIMinorSuperReadyPercent=.7` | **partial** — `aiSwTarget` (L14184-14199) scores by *cluster density* with refineries ×2.5. RA2's table would rank a **War Factory** highest and a Refinery not at all. Curtain-the-wave and chrono-to-refinery (L14208-14232) are good RA2-flavoured touches with no rules.ini basis | minor | S |
| Harvesters per refinery | `[General] HarvestersPerRefinery=2` | **partial** — `wantHarv = min(1+cfg.expand, nRef+1)` (L14160), i.e. 2-4 total rather than 2 per refinery | nit | S |
| Aircraft / naval AI | RA2 uses aircraft teams and naval teams | **partial** — fills Harrier pads and sends Kirovs (L14150-14152, L14196); no naval (nothing to build) | nit | S |
| AI does not use: garrison, crates, tech buildings, walls, transports, attack-move | — | **missing** — all downstream of §1/§3 | major | L |

---

## Top 25 gaps by impact

Ordered by severity, then by effort (cheapest first inside a band).

1. **(blocker, S)** §2a — Prism Tank fires `PrismWarhead` (200% vs infantry, 50% vs structures) instead of RA2's `CometWH` (50% vs armour, **200% vs structures**), at ROF 240 not 400 and Range 8 not 10. The Allied siege tank is currently an anti-infantry gun.
2. **(major, S)** §2c — Tesla Coil has no prerequisite: a $1500 coil is buildable off the opening Construction Yard. RA2 needs `POWER,RADAR`.
3. **(major, S)** §2c — Patriot Missile and Flak Cannon are gated behind Airforce/Radar; RA2 needs only `BARRACKS` (TL4). AA arrives a full tier late for both sides.
4. **(major, S)** §2c — Refinery/Barracks (need POWER), War Factory (needs PROC+Barracks) and Battle Lab (needs War Factory) have no prerequisites; the whole opening build order is unconstrained.
5. **(major, S)** §3 — Minimap draws from tick 0 with no radar building and no power check (`drawMini` L16488). RA2 blacks it out without a powered radar.
6. **(major, S)** §2b — Battle Lab draws −200 power (RA2 −100) and Barracks armour is `wood` not `steel`; both distort the whole mid-game.
7. **(major, S)** §2b — Iron Curtain charges for 7 min; `[IronCurtainSpecial] RechargeTime=5`.
8. **(major, S)** §2a — Harrier missile range 3.2 vs RA2's 6; the jet must fly into AA to shoot.
9. **(major, S)** §2a — Flak Trooper has no `FlakGuyAAGun` secondary (20 dmg, Rng 8, `FlakGuyWH`); it engages aircraft with its ground burst at 6 tiles.
10. **(major, S)** §2a — Flak Track AA range 6.5 vs RA2's 10; Apocalypse `MammothTusk` at rate 100/range 6 vs RA2's 320/8.
11. **(major, S)** §3 — Veterancy has no `VeteranROF=0.6` or `VeteranSpeed=1.2`, and promotes on kill *count* not `VeteranRatio=3.0` kill value.
12. **(major, S)** §3 — No force-fire (Ctrl+click). `rightOrder` (L15580) has no modifier path at all.
13. **(major, S)** §2c — Tesla Tank gated behind the Battle Lab; RA2 needs only `NARADR`.
14. **(major, S)** §1b — The Soviet War Miner has no gun (`[HARV] Primary=20mmRapid`, 30/20/5.5, `HARVWH`).
15. **(major, S)** §4 — No skirmish starting-credits option; $10 000 is hard-coded.
16. **(major, S)** §2a — V3 Launcher has no `MinimumRange=5`; it snipes at point-blank.
17. **(major, M)** §3 — Prism Tower support chaining (`PrismSupportMax=8`, `+150%`) is absent; the Allied defence has no identity.
18. **(major, M)** §3 — No attack-move order.
19. **(major, M)** §1c/§3 — No crates (`[CrateRules]`/`[Powerups]`).
20. **(major, M)** §1a/§1b — No Attack Dog on either side (the only spy/Mirage detector, and the cheapest anti-infantry unit in the game).
21. **(major, M)** §1c/§3 — Civilian buildings are not garrisonable (155 RA2 sections carry `CanBeOccupied=yes`); the urban theatre's ten `T_CIV` blocks are inert.
22. **(major, M)** §1/§3 — No walls or gates (`[GAWALL]`/`[NAWALL]` $100, `Adjacent=8`), and `VERSES` ignores every warhead's `Wall=` flag.
23. **(major, M)** §1a — No Gap Generator, and no mechanism for it: `g.seen` is a one-way latch.
24. **(major, M)** §4 — 23 of eva.ini's 120 skirmish lines are implemented; `NewConstructionOptions`, `Building`, `OnHold`, `Canceled`, `BaseDefensesOffLine`, `CannotDeployHere` and the three "*Detected*" superweapon warnings are the ones a player notices immediately.
25. **(major, L)** §1/§3 — No transports and no naval layer at all: Shipyards, 11 ship classes, `[HTK] Passengers=5`, `[FV] Passengers=1` (and therefore the IFV turret swap, roadmap L135), Nighthawk, amphibious APC.

---

## Present but broken

The one outright *bug* I could reproduce is a superweapon lane/tab split. All four superweapon
entries in `BLDS` are written `{ cat: 'def', fac: …, cat: 'str', … }` (L918, L924, L930, L936) —
the key is declared **twice**, so the later `'str'` wins and `laneOfBld()` (L13646) routes them into
the **structures** lane `'b'`, while `defenceOrderFor()` (L1001) lists them on the **Defence** tab.
Verified live: clicking Chronosphere on the Defence tab pushes `'chrono'` onto `side[0].queues.b`,
it finishes as `queues.b.ready`, and `refreshPanel()` (L15012) then flags the **Structures** tab
`hasready` while `say(...)` tells the player to "click it under Structures" (L15025-15029) — where
there is no Chronosphere row. The finished $2500 building is only clickable on the tab that is not
flashing, and a queued superweapon also silently blocks the entire structures queue, which is why
the Defence lane's whole reason for existing (L13640-13644: "a Sentry Gun never delays a Refinery")
does not apply to the most expensive item in the game. Two smaller live-verified defects sit
beside it: `BLDS.reactor` carries `power: 2000` (correct per `[NANRCT]`) with `desc: '+500 power'`
(L882), so the sidebar understates the Nuclear Reactor by 4×; and `stepBld` (L13590) blacks out
*every* defence on low power, including the Pillbox, which in RA2 has no `Powered=` key and keeps
firing (only `[NALASR] Powered=yes` and the coil/tower/AA sites go dark). Everything else I checked
that is claimed done in `docs/rts-roadmap.md` — crushing, Mirage disguise, MCV deploy, the low-power
production curve, shroud, waypoints, veterancy chevrons, pad-based aircraft, the four superweapon
effects — behaves as described.

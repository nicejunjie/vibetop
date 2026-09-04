# Iron Frontier (`apps/games/rts/rts.html`) — art & presentation gap audit vs Red Alert 2

Audited 2026-09-02 against `apps/games/rts/rts.html` @ 17267 lines (HEAD `0dfab90`), served
at `http://127.0.0.1:8121/rts.html`. RA2 facts are grepped from `/tmp/RA2inis/`
(`art.ini`, `rules.ini`, `temperat.ini`, `snow.ini`, `urban.ini`, `sound.ini`,
`ui.ini`) — no fact below is from memory. Screenshots referenced by filename all
live in `/home/junjie/.claude/jobs/dcf15416/tmp/gap/` and were looked at, not
assumed.

**Read this first — the two systemic findings.** Almost every row below is
downstream of one of two things:

1. **A structure sprite has exactly one state.** `bakeBuilding(key, col, fac, bph)`
   (rts.html:5250) bakes N idle phases and nothing else. RA2 gives every building
   a MAKE build-up (208 `Buildup=` keys in art.ini), a **damaged** variant of the
   base SHP *and* of every active anim (39 `ActiveAnimDamaged=`), fixed fire
   attachment points on the damaged art (174 `DamageFireOffset0=`), a firing /
   charge anim (`SpecialAnim`), door anims, and a death that leaves craters and
   debris. We have none of those six.
2. **Infantry have no facings.** `bakeInfantry(col, kind, fac, phase)`
   (rts.html:2207) takes no direction and bakes one front-on canvas;
   `drawUnit` (rts.html:16268) never indexes a facing. Every soldier on the field
   faces the camera at all times (`k_inf.png`). RA2's `[E1Sequence]`
   (art.ini:9655) is 8 facings × {Ready, Guard, Walk 6f, FireUp 6f, Prone,
   Crawl 6f, FireProne 6f, Down, Up, Idle1 15f, Idle2 14f, Die1 15f, Die2 15f,
   Die3/4/5, Cheer, Panic}.

Sprite *shape* work is genuinely far along — the roadmap's per-item passes hold up
at 1:1 (`fsheet.png`, `art.png`, `art_col.png`). What is missing is almost entirely
**state, motion and the frame around the game**, not silhouette.

---

## 1. Structures

| Gap | RA2 (citation) | Game now | Severity | Effort |
|---|---|---|---|---|
| **No damaged state.** A structure at 45 % and at 18 % hp is pixel-identical to a full-health one; the only change is smoke/fire particles floated over it | Every building SHP carries a damaged frame, and every active anim has a damaged twin — 39 `ActiveAnimDamaged=` in art.ini (`[GAPOWR] ActiveAnimDamaged=GAPOWR_AD`, art.ini:1908; `[GAWEAP] ActiveAnimDamaged=GAWEAP_AD` + `ActiveAnimTwoDamaged`, art.ini:843) | `drawBld` rts.html:16374-16387 — only `G.fx.push({smoke})` / `{fire}`. `a_damaged.png`: six structures at 45 %/18 % hp, all visually pristine | **blocker** | L |
| **Fire on a hurt building is one wandering ember, not RA2's fixed fire ports** | 174 `DamageFireOffset0=` in art.ini, up to three per building (`[GAWEAP] DamageFireOffset0=-10,-10 / 1=27,30 / 2=0,70`, art.ini:857-859) — the flames sit on the same holes every time | rts.html:16378 picks one of three offsets from `[-0.3,0.25,0.05]×gw` — a generic jitter, not per-structure art | major | M |
| **No destruction at all.** A killed building simply disappears — no rubble, no crater, no scorch, no debris, no collapse | `[GAPRIS] Explosion=TWLT070,S_BANG48,S_BRNL58,S_CLSN58,S_TUMU60` — five simultaneous anims; `DebrisAnims=DBRIS1LG,DBRIS1SM,DBRIS4LG,…` with `MinDebris=2/MaxDebris=3` (rules.ini:10390-10393); 88 `DebrisAnims=` lines; 12 crater SHPs `[CRATER01]`…`[CRATER12]` (art.ini:8835-8868); `Crater=yes`/`Scorch=yes` per anim (art.ini:10346-10348). temperat.ini even ships `SetName = RA2 rubble farm / rubble mobile / rubble mexican` | `killBld` rts.html:12521 clears occupancy and returns; `damage()` rts.html:12771 calls `boom(g,b.cx,b.cy,26)` — one radial blob. `c_destroy_after.png`: five buildings deleted, bare grass left | **blocker** | M |
| **No MAKE build-up.** Placement snaps a finished building into existence | 208 `Buildup=` entries in art.ini — one MAKE SHP per structure (`Buildup=GAWEAPMK`, `NAHANDMK`, `GAPRISMK`, …), plus `FreeBuildup=true`. A faithful version = one extra baked frame set per key: the same art masked by a rising horizontal wipe with a scaffold/crane silhouette drawn in the uncovered band, 6-10 phases, played once on `b.builtAt` | Deliberately removed — see the comment at rts.html:16369-16372 ("the old clipped-rise behind a drawn scaffold read as a wireframe glitch"). No replacement | major | M |
| **Footprints are systematically one tile smaller than RA2's**, which changes base density and makes the long RA2 halls impossible to draw | `Foundation=` in art.ini: Construction Yard 4×4 (`[GACNST]`/`[NACNST]`), War Factory **5×3** (`[GAWEAP]`:843), Refinery 4×3, Allied Barracks 3×2 (`[GAPILE]`), Airforce Command 3×2 (`[GAAIRC]`), Allied Battle Lab 3×2 / Soviet 3×3 (`[GATECH]`/`[NATECH]`), Tesla Reactor 3×2 (`[NAPOWR]`), Nuclear Reactor 2×3 (`[NAAPWR]`:1947), Chronosphere 4×3 (`[GACSPH]`) | `BLDS` rts.html:817-939: base 3×3, factory 3×3, refinery 3×2, barracks 2×2, airforce 2×2, lab 2×2, power 2×2, reactor 2×2, chrono 3×3. Only depot 3×3, radar 2×2, nuke 3×3, Soviet Barracks 2×2 and the 1×1 defences match | major | L |
| **No "bib" concrete apron** as a separate, shared, ground-layer shape under the vehicle structures | 11 `BibShape=` keys — exactly the buildings a vehicle drives onto: `GAWEAPBB, NAWEAPBB, GAREFNBB, NAREFNBB, GAHPADBB, NAHPADBB, GAAIRCBB, GADEPTBB, NADEPTBB, CAOUTPBB, NAWASTBB` (art.ini:843, 889, 1106, 1163, 1267, 1283, 1326, 2396, 2432, 2932, 8037) | Each branch paints its own pad inside its sprite (`apron()` rts.html:5358) — so aprons differ per building, never tile against neighbours, and are clipped by the sprite canvas rather than lying on the ground layer | minor | M |
| **Defences never aim.** Tesla Coil, Prism Tower, Patriot, Flak Cannon, Sentry Gun and Pillbox play a fixed idle slew loop regardless of where the target is | `Turret=yes` + `TurretAnim=SAM` / `TurretAnim=LASER`, `TurretAnimIsVoxel=true` on `[NASAM]` (rules.ini:10472-10474) and the Prism (rules.ini:10393-10395) — a real rotating voxel turret | `tface`/`aimAt` exist only on units (rts.html:12463, 13453); `drawBld` rts.html:16372 picks `art.frames[(tick/5 + b.id*2) % n]` — a time-driven idle, never a bearing. The Sentry Gun's twin barrels "slew on its trunnion" on a timer (roadmap §Sentry Gun) | major | M |
| **No Tesla Coil charge-up.** The bolt just appears | `[NATSLA_B]` is a 10-frame firing anim (art.ini:3006-3015) gated by `IsAnimDelayedFire=yes` / `DelayedFireDelay=28` (art.ini:2977-2978) with its own sound `Report=TeslaCoilPowerUp` — the coil visibly winds up for 28 frames before the shot lands | `fire()` rts.html:12995 pushes the bolt on the same tick as `damage()`; no charge state on the building | major | S |
| **No Prism Tower charge, and no support links** | `[GAPRIS] SpecialAnim=GAPRIS_A`, `IsAnimDelayedFire=yes`, `DelayedFireDelay=28` (art.ini:2130-2140). `PrismSupportModifier=150%`, `PrismSupportMax=8`, `PrismSupportDuration=15`, `PrismSupportHeight=420` (rules.ini:134-138) — neighbouring towers fire visible support beams into the firing tower | Neither exists; `s.beam` is one instant lance from `-86 px` (rts.html:16019) | major | M |
| **Patriot fires from one point, not alternating tubes** | `[NASAM] PrimaryFireFLH=90,50,100` and `SecondaryFireFLH=90,-50,100` (art.ini:2884-2885) — ±50 leptons, i.e. the launcher alternates left/right tubes | `BLDS.patriot.launch: 34` (rts.html:903), single origin (rts.html:16011) | minor | S |
| **Unpowered = a red `⚡` emoji floating over the roof**, not RA2's dead building | `ActiveAnimPowered=no` / `SpecialAnimPowered=no` on `[NATSLA]` (art.ini:2968-2971) and `[GAPRIS]` — the animation *stops* and the lights go out; `WorkingSound=PowerOn` / `NotWorkingSound=PowerOff` (rules.ini:10485-10486) | `drawBld` rts.html:16394-16400 `ctx.fillText('⚡', …)`. The sprite is unchanged and its idle animation keeps running. Visible in `art_col.png` (three bolts hanging over the base) and `e_f3.png` | major | S |
| **Repair = a `🔧` emoji glyph** | RA2 draws an animated spinning wrench sprite over the building | rts.html:16402-16405 `ctx.fillText('🔧', …)` | minor | S |
| **No garrison.** Infantry cannot enter civilian structures | RA2 urban theatre garrisonable civilians (`Occupiable`, muzzle ports); temperat.ini `SetName = Civilian Buildings` (line 323), urban.ini has 110 tilesets | `T_CIV` is in `solidT()` (rts.html:517) — pure obstacle; four `bakeCiv(0..3)` blocks (rts.html:12159, 12369), no interaction | minor | L |
| **No production door animation** — units teleport out of the Barracks/War Factory | `[GAWEAP] DoorAnim`, `UnderDoorAnim=GAWEAP_1`, `RoofDeployingAnim=GAWEAP_3`, `UnderRoofDoorAnim=GAWEAP_4`, `DeployingAnim=GAWEAP_2` (art.ini:846-861) — the roof opens and the vehicle rises out | Nothing; `spawnUnit` puts the unit on the spawn tile | minor | M |
| Idle animation coverage is good but partial | Every RA2 structure with machinery has an `ActiveAnim` | `A.frames` cycling is implemented for base/refinery/factory/barracks/power/airforce/radar/depot/lab/purifier and the defences (roadmap §Per-item polish). The four superweapons + `reactor` also animate. No structure is animation-less | — | — |
| Owner-colour remap policy is correct | RA2 remaps only the house-colour palette range | Verified in the roadmap's per-item hue census (12-18 % owner hue, 0 % opposing) and visible side-by-side in `fsheet.png` — this one is genuinely done | — | — |

---

## 2. Infantry

| Gap | RA2 (citation) | Game now | Severity | Effort |
|---|---|---|---|---|
| **Zero facings — every soldier always faces the camera** | `[E1Sequence] Walk=8,6,6` etc. (art.ini:9659) — every sequence is authored for 8 facings | `bakeInfantry(col, kind, fac, phase)` rts.html:2207 has no direction argument; `SPR.unit[p][fac][type]` is a single canvas; `drawUnit` rts.html:16269 `s = art.walk[(tick>>3)%3]`. See `k_inf.png` (all nine kinds, one pose) and `j_sel.png` (two GIs facing the camera while the tanks beside them are correctly oriented) | **blocker** | L |
| **No death animations of any kind** — a killed trooper vanishes into a generic 12-px blast | `rules.ini:19096`: *"InfDeath = which death animation to use: 0=instant, 1=twirl, 2=explodes, 3=flying death, 4=burn death, 5=electro, 6=Yuri head explode, 7=Nuke Melt"* — assigned per warhead (`[Fire] InfDeath=4`, `[IonWH] InfDeath=5`, `[HE] InfDeath=2`, `[AP] InfDeath=3`, `[SA] InfDeath=1`); the SHP carries `Die1=134,15,0` and `Die2=149,15,0` (art.ini:9667-9668), 15 frames each, and shared anims `[ELECTRO]` (art.ini:10951) / `[FLAMEGUY]` (art.ini:14316) cover the rest | `damage()` rts.html:12773: `tgt.dead = true; boom(g,tgt.x,tgt.y,12)`. Nothing else. Crushing (`crush()` rts.html:13264) also leaves no splat | **blocker** | L |
| **No firing frames** — a GI shooting looks exactly like a GI standing | `FireUp=164,6,6` and `FireProne=212,6,6` (art.ini:9660, 9664) — 6 frames each × 8 facings | `drawUnit` rts.html:16268 chooses only between `art` (idle) and `art.walk[0..2]` (moving) | major | M |
| **No prone / crawl.** RA2 infantry drop flat under fire and crawl, and `ProneDamage` halves what they take | `Prone=86,1,6`, `Crawl=86,6,6`, `Down=260,2,2`, `Up=276,2,2` (art.ini:9658-9663); `ProneDamage` per warhead (rules.ini:19102) | Not modelled at all | major | L |
| **No idle fidgets** | `Idle1=56,15,0,W` and `Idle2=71,14,0,E` (art.ini:9665-9666) — two 14/15-frame loops, direction-locked | Standing infantry are a static frame | minor | M |
| **Walk cycle is 3 frames, RA2's is 6** | `Walk=8,6,6` (art.ini:9659) | `art.walk[((G.tick>>3)%3)]` rts.html:16270, baked from `gait(phase)` rts.html:2201 | minor | S |
| No `Cheer` / `Panic` states | `Cheer=56,15,0,W`, `Panic=8,6,6` (art.ini:9672, 9674) | absent | nit | M |
| Deployed GI sandbags | RA2 E1 deploy | Done — `bakeSandbags(col)` rts.html:3062, drawn over the trooper (rts.html:16281). Roadmap still flags the art as a placeholder; it now reads as a three-course parapet, which is fine | — | — |
| Veterancy chevrons, selection brackets, shadows, 8-facing air infantry | RA2 gold chevrons at the sprite corner | All present: chevrons rts.html:16298-16306, corner brackets rts.html:16287, `shadowBlob` rts.html:2234 (Rocketeer's shadow is deferred to the ground pass, correctly) | — | — |
| Selection box is the *sprite bbox*, so a Tesla Trooper's brackets are visibly bigger than a GI's | RA2 sizes the bracket from the unit's `Size`, so all infantry read the same | rts.html:16287 uses `s.bb` | nit | S |

---

## 3. Vehicles / aircraft

| Gap | RA2 (citation) | Game now | Severity | Effort |
|---|---|---|---|---|
| **8 facings, RA2 voxels render 32** — a turning tank snaps in 45° steps | RA2 vehicles are voxels rasterised per-frame at the unit's actual facing; turret and hull both | `bakeVehicle(col, kind, fac, anim)` rts.html:3124 bakes 8; `u.face` is `round(atan2/(π/4))` (rts.html:13453). `l_veh.png` | major | L |
| **No damaged smoke or damaged art on vehicles** — a tank at 10 % hp looks new | RA2 vehicles trail black smoke below 50 % and show a damaged voxel/`ExtraDamageStage` | `drawUnit` rts.html:16238-16325 has no hp branch at all; only structures smoke | major | S |
| **No recoil** on any gun | RA2 tanks visibly rock back on firing (`Recoilless=yes` is called out as the *exception* on `[GAPILL]`, art.ini:2113) | `grep -c recoil apps/games/rts/rts.html` = 0 | minor | M |
| **No track marks and no dust behind a moving vehicle** | RA2 lays tread decals on the ground and kicks dust | `grep -c trackmark/tread-decal` = 0; the only `dust` fx is harvester mining (rts.html:13207) | minor | M |
| **MCV unpack is an instant swap** | `[GACNST] Buildup=GACNSTMK` — deploying an MCV plays the Construction Yard's MAKE anim | `deployMcv` rts.html:12509: `u.dead = true; placeBld(...)` on the same tick | major | M |
| **Harrier landing is a one-tick pop from cruise altitude to zero** | RA2 Harriers descend onto the pad | `stepAircraft` rts.html:13553 `u.landed = true` and `altOf()` (rts.html:960) returns 0 immediately. Take-off *is* smoothed, but only for a newly built aircraft (`born`/`CLIMB`, rts.html:958) — a sortie off the pad also pops | minor | S |
| **IFV never changes turret** | RA2's IFV swaps its whole turret voxel per passenger (10 variants) | Roadmap "Air layer follow-ups, part 2" — open; no transports exist | minor | L |
| **Kirov reads small and has no bomb-bay motion**; head-on facings 1 and 5 collapse to aspect 0.73 vs 1.43 broadside | RA2's Kirov is the largest thing in the sky with an animated gondola | `airsheet.js` output: `kirov p0 [[110,77,1.43],[64,88,0.73],…]`; visible in `f_x4.png` as a small red cigar sitting near ground level | minor | M |
| Vehicle wrecks | RA2 vehicles explode without a wreck; only aircraft leave a falling airframe | Correct — `crashAircraft` rts.html:12786 tumbles the airframe through its facings behind a smoke trail and detonates on landing. Ground vehicles just `boom` | — | — |
| Turret independent of hull, muzzle flash at the barrel, harvester mining frames, Harrier empty-rack variant, Kirov prop frames, Rocketeer hover, ground shadows for air units, altitude bob | | All present: rts.html:16263-16266 (hull/turret split), 16070-16074 (`SPR.flash`), `art.mine` (16259), `art.empty` (16261), `art.anim` (16260), `hoverIdle` 13330, `drawAirShadow` 16349, `altOf` bob 960 | — | — |

---

## 4. Effects

| Gap | RA2 (citation) | Game now | Severity | Effort |
|---|---|---|---|---|
| **Explosions are one baked radial-gradient blob scaled up** — no frames, no smoke ball, no fireball, no size families | `[EXPLOLRG] / [EXPLOMED] / [EXPLOSML] / [EXPLOLB]` (art.ini:11611-11678), the `[TWLT026…TWLT100I]` family (art.ini:11150-11200), `[S_BANG16/24/34/48]`, `[S_BRNL20/30/40/58]`, `[S_CLSN16…58]`, `[S_TUMU22…60]` (art.ini:11329-11452) — and 358 `Explosion=` lines assign **five at once** to a building death | `bakeExplosionSprite()` rts.html:11925 → one sprite; render rts.html:16205 `ctx.drawImage(SPR.boom.c, …)` scaled by `fx.size`. In `g2_fx.png` the *large* (size 26) blast is a 40-px orange smudge | **blocker** | M |
| **No craters and no scorch marks.** The ground is untouched after any explosion | 12 crater SHPs `[CRATER01]`…`[CRATER12]` (art.ini:8835-8868); `Crater=yes` / `Scorch=yes` flags on the anims (art.ini:10346-10348, 11155-11163); `Deform`/`DeformThreshhold` per warhead (rules.ini:19099-19100) | `grep -c crater/scorch` = 0/1 (the one is a word in a comment). `c_destroy_after.png` — five buildings destroyed, ground pristine | major | M |
| **No flying debris** | `DebrisAnims=DBRIS1LG,DBRIS1SM,DBRIS2LG,…` on 88 entries with `MinDebris`/`MaxDebris` up to 10 (`[CAOUTP]`, rules.ini) | absent | minor | M |
| **Nuke mushroom is a brown mud column with a flat brown cap** — no fire core, no white flash column, no rolling cloud | RA2's nuke is a multi-second scripted anim with a white-hot core, a rising cap and a ground shock ring | rts.html:16144-16158; look at `g2_fx.png` / `g_fx.png` — a brown ellipse stack drawn straight through the War Factory | major | M |
| **Rockets have no smoke trail** | RA2 missiles trail `[FIRE01/02/03]`-family smoke puffs behind them | rts.html:16044-16053 — a stroked line with a glow pass, nothing persistent | minor | S |
| **V3 has no distinct projectile** | `[V3WH]`/`[V3EWH]` are their own warheads with their own anims | `fire()` rts.html:13006 classifies it as generic `rocket: splash > 0.2` | minor | S |
| **Ore does not glitter or animate; ore tiles show as a hard rectangular grid inside a field** | RA2 ore is 19 overlay types `TIB01`…`TIB19` and gems `GEM01`…`GEM09` (rules.ini:1498-1516, 1423-1431); ore also *spreads* (`[Riparius] Growth=2200, Spread=2200, GrowthPercentage=.06`) | `bakeOre(level, variant)` rts.html:1993 → 3 density levels × 4 variants, static. Very visible in `h_close_tundra.png`: each ore cell shows its own tan backing square, so the field reads as a checkerboard. Gems are ~700 identical purple cones (`h_close_gems.png`) | major | M |
| **Shroud edge is a hard black diamond per tile** — a staircase, not RA2's soft ragged border | RA2 draws shroud with a dedicated edge-shape set (half/corner/inner-corner tiles), giving a feathered, dithered boundary | rts.html:15823-15828 `ctx.fillStyle='#05070b'; diamond(…); fill()`. See `art.png` / `art_col.png` | major | M |
| **No Gap Generator / fog** | RA2's Gap Generator re-shrouds a radius | Absent (roadmap: "Patriot/Flak Cannon/**Gap Generator** wait for air units and fog" — the first two shipped, the Gap Generator did not) | minor | M |
| Fire on buildings is two ellipses, no flame licks or heat shimmer | `[FIRE01]`/`[FIRE02]`/`[FIRE03]`/`[FIRE3]` (art.ini:11479-11539) | rts.html:16097-16107 | minor | S |
| Tracer, Tesla bolt, Prism lance, flak burst, Kirov bomb, storm bolt, chrono flash, Iron Curtain shimmer, muzzle flash, Mirage tree disguise, water animation | | All present and reasonable — rts.html:15990-16078 (shots), 16211 (`ironGlow`), 16244 (Mirage draws a real theatre tree), `SPR.water` 4 phase frames (rts.html:12336-12343). Verified in `g2_fx.png` | — | — |

---

## 5. Terrain

| Gap | RA2 (citation) | Game now | Severity | Effort |
|---|---|---|---|---|
| **No height levels.** A "cliff" is a wall on flat ground; the plateau behind it draws at the same screen height as the ground below it | RA2 terrain is 2-level per cliff and up to 15 levels per map; `SetName = Cliff Set`, `ZMM Cliff Set`, `Destroyable Cliffs`, `Slope Set Pieces`, `ZSlope Set Pieces`, `New MM Height Pieces`, `Newest MM Height`, `Obsolete Height Pieces` (temperat.ini:310, 460, 860, 497, 509, 544, 816, 284) | Only the cliff tile itself is lifted — `s.lift = (CLIFF_H - CLIFF_SH)/2` at rts.html:1898 is the **only** `lift` assigned to any tile. `h_close_gems.png`: the gem plateau interior sits at the same elevation as the field outside its wall | major | L |
| **Cliffs read as a regular grey brick retaining wall**, not rock | RA2 cliff faces are irregular shadowed rock with a mottled top | `bakeCliff(mask, kind)` rts.html:1753 — 16 edge masks of stacked quads. `h_close_gems.png` | major | M |
| **Ramps read as a wooden boardwalk**, not a rock slope | `SetName = Ramps` / `ZMM Ramps` / `DirtRoads Slopes` / `Paved Road Slopes` / `Water slopes` (temperat.ini:295, 268, 472, 759, 735) | `bakeRamp(kind, dir)` rts.html:12021 — plank-striped strips. `h_close_gems.png` top-right and left | minor | M |
| **No LAT (linked-adjacent-tile) transitions.** Grass→rock, grass→sand, snow→rock all meet on a hard tile diamond, quilted | temperate alone has `LAT Grass`, `LAT Grass, thick`, `LAT Grass Rough`, `LAT Sand`, `LAT Pavement`, plus `GrassThick Individual`, `GrassRough Individual`, `Sand Individual`, `Pavement Individual` (temperat.ini:173, 347, 590, 685, 748, 359, 604, 699, 662) | Only a 16-mask `bakeScree` pebble fringe (rts.html:1722). `h_close_tundra.png` shows the snow/rock quilt | major | M |
| **Roads have no junction/bend/end/slope connectors** | `DirtRoads Bendy`, `DirtRoads Junctions`, `DirtRoads Straight`, `DirtRoads Slopes`, `Paved Roads`, `Paved Road Ends`, `Paved road bits`, `Paved Road Slopes` — 8 distinct road tilesets (temperat.ini:385-411, 435-447, 626, 674, 759) | `bakeRoad(kind, v)` rts.html:1905 — 8 *decorative variants*, chosen by hash, not by neighbour mask; roads simply butt together | minor | M |
| **Tile-set variety is a tiny fraction of RA2's** | 82 tilesets in temperat.ini, 75 in snow.ini, **110** in urban.ini | 64 position-indexed ground tiles from one seamless sheet per theatre + 64 rock, 8 decals, 16 shore, 16 shallow, 16 scree, 16 cliff, 8 road, 4 water positions × 4 phases (`bakeAll` rts.html:12319-12360) | major | L |
| **4 tree variants per theatre; RA2 temperate ships ~30 terrain objects** and none of our snow trees carry snow | temperat.ini `SetName = Ice Flow`, `House`, `Ruins`, `Farm Crops`, `Dead Oil Tanker`, `Waterfalls`(A-D), `Water Caves`, `Scrin Wreckage`, `RA2 uss arizona`, plus the TREE/TC terrain objects | `SPR.tree` = 4 per theatre (rts.html:12360); `h_close_tundra.png` shows identical dark-green conifers on snow | minor | M |
| **Civilian buildings: 4 blocks, shared across all theatres, never garrisonable, never destructible** | `SetName = Civilian Buildings` + `Misc Buildings` + `House` + `Ruins` (temperat.ini:323, 187, 241, 532); urban.ini has 110 tilesets | `SPR.civ = [bakeCiv(0..3)]` rts.html:12369, indexed by hash; `T_CIV` is in `solidT()` rts.html:517. `h_map_river.png` — the same four beige boxes repeated across the city | minor | M |
| **Ore spawns on urban pavement** | RA2 ore only grows on ground/dirt | `genCore`'s `patch()` rts.html:1237 doesn't exclude `T_ROAD`/pavement. `h_close_river.png`: ore fields all over the asphalt | minor | S |
| **Map border is raw black** — the playable diamond just ends | RA2 maps continue past the visible border with real terrain and clamp the camera inside it | rts.html:15794 `ctx.fillStyle='#0b0e14'; fillRect(…)` then nothing outside the grid. Every wide shot (`art.png`, `h_map_river.png`) | minor | S |
| **No map lighting / ambient.** Every theatre is lit identically; there is no per-map ambient tint or per-cell lighting | RA2 maps carry `[Lighting]` (Ambient/Red/Green/Blue/Level) and RA2 darkens the whole tactical view under a Lightning Storm — which we *do* do (rts.html:16197) but nowhere else | Only the storm/nuke full-screen washes (rts.html:16196-16197) | minor | M |
| Water animation, shorelines, shallows, bridges, gems as a 2× ore variant, 6 maps × 3 theatres, mirrored fairness | | All present and working (`bakeWaterSheet` 1593, `bakeShore` 1674, `bakeShallow` 1705, `bakeBridge` 12070, `T_GEM` 12122, `MAPS` 1108) | — | — |

---

## 6. UI / HUD

| Gap | RA2 (citation) | Game now | Severity | Effort |
|---|---|---|---|---|
| **The sidebar is a modern web list, not RA2's command bar.** Wide scrolling rows of `cameo + name + "$800 · +200 power"` prose | RA2's sidebar is a fixed metal panel: a two-column grid of 60×48 cameos with **no text**, the radar in a bezel above, tabs as icon buttons | `#side { width:186px }` rts.html:88-92; `.pit` rows rts.html:105-118; `buildPanel()` rts.html:14890. See `i_sidebar.png`, `j_q_side.png` | **blocker** | L |
| **Two command-bar buttons are rendered entirely outside the sidebar and cannot be clicked.** Measured: sidebar right edge = 1375 px; `T3` occupies 1375→1400 and `Sell` occupies 1375→1400 | — | `#cmdbar { grid-template-columns: repeat(5, 1fr) }` rts.html:82 — `1fr` is `minmax(auto,1fr)`, so `Scatter`/`Deploy` min-content blows the tracks past the 174 px content box. Fix is `minmax(0,1fr)`. `j_q_side.png`, and the measurement in this audit | **blocker** | S |
| **The command bar mixes two different RA2 UI regions and has 11 buttons where RA2 has 6** | `ui.ini [AdvancedCommandBar] ButtonList=Team01,Team02,TypeSelect,Deploy,Guard,PlanningMode` (+`Beacon` in MP). **Sell / Repair / Power are the three toggle buttons on the sidebar itself**, not command-bar entries; Stop is the S key | rts.html `#cmdbar` holds Same, Path, T1, T2, T3, Guard, Stop, Scatter, Deploy, Sell, Repair — and wraps onto three rows | major | S |
| **No power bar.** Power is a text pill in the browser-chrome top bar | RA2 puts a vertical power meter down the left of the sidebar with a moving needle, green→yellow→red | `.stat` tiles rts.html:38-46; `updateHUD()` rts.html:14867 | major | M |
| **Credits are a top-bar pill, not a sidebar ticker**, and there is no digit-by-digit count with the RA2 tick | RA2 counts the credit total up/down one unit per tick with the coin sound | `shownCred` rts.html:14757, `sfx('cash')` = one 880→1320 Hz sine (rts.html:14741) | minor | S |
| **Build progress is a translucent fill sweeping across the row; RA2 wipes a clock over the cameo** | RA2 draws a radial clock-hand wipe over the cameo, then the cameo flashes "READY" | `.pit .fill` rts.html:119-122; the READY stamp (rts.html:124-138) covers the whole row instead of the cameo. `j_q_side.png` | major | M |
| **Cameos are auto-crops of the in-game sprite at 60×44**, no faction frame, no bevel art | RA2 cameos are hand-drawn 60×48 PCX art with a house-styled frame | `cameoFor()` rts.html:14942-14963 — `W=60, H=44`, `strokeRect` border | major | L |
| **Tabs are text labels** ("Structures Defence Infantry Units") | RA2's four sidebar tabs are icon buttons | `.ptab div` rts.html:96-102 | minor | S |
| **The radar is drawn in grid space (axis-aligned squares) while the world is isometric**, and the viewport marker on it is a diamond — the radar is rotated 45° relative to what you see | RA2's radar is isometric, same orientation as the battlefield | `drawMini()` rts.html:16488-16532 `mctx.fillRect(x*sc, y*sc, …)`; viewport drawn from `screenToGrid` corners → a diamond. `i_mini.png` | major | M |
| **The radar always works** — no Radar/Airforce Command required, no power gating, no bezel, no sweep pulse | RA2's radar is dark until you own a radar structure *and* have power | no radar/power gate anywhere near `drawMini`; `#mini` rts.html:94 is a bare canvas with a 1-px border | major | S |
| **No RA2 cursor set.** Five CSS cursors total | RA2 has an animated cursor per intent: move, no-move, attack, force-fire, select, sell, repair, deploy, enter, guard, waypoint, chrono, nuke, beacon | rts.html:74-76 (`default`, `crosshair`, `not-allowed`) plus `pointer` (rts.html:15305) and `grabbing` (15217). `grep -c cursor` finds nothing else | **blocker** | M |
| **Health bar is a solid tri-colour rectangle, not RA2's pip bar** | RA2 draws a bracketed bar of discrete pips over the unit, green/yellow/red | `hpBar()` rts.html:16470-16476 — `fillRect` | minor | S |
| **EVA text appears as a bottom-centre web toast** | RA2 prints EVA/game messages top-left inside the tactical view in its own yellow bitmap font | `#tip` rts.html:180-186 (`bottom:10px`, `translateX(-50%)`) | minor | S |
| **Superweapon clocks use emoji glyphs**, greyscale-filtered | RA2 stacks the superweapon's own cameo with a clock wipe | `mkSwIcon` rts.html:14810 `em.textContent = SW[k].em`; `.swic .em { filter: grayscale(1) }` rts.html:170. The conic charge sweep itself is right | minor | M |
| **Two house colours only** (blue / red) | RA2 has 8 selectable house colours | `var COL = ['#4aa3db','#e5646c']` rts.html:11920 | minor | M |
| **Fonts are `system-ui` / `ui-monospace` throughout** | RA2 uses its own bitmap font everywhere | rts.html:12, 42, 47 and ~30 `ctx.font = '… system-ui'` sites | minor | M |
| **No in-game options menu.** Pause is a button; "New" → a confirm card → the front menu | RA2's in-game menu has Load / Save / Delete / Restart Mission / Abort Mission / Game Settings (scroll rate, volumes, tooltips) | `togglePause` rts.html:16915, `newBtn` handler rts.html:16938-16951, `menu()` rts.html:16953 | minor | M |
| **Panel tooltips are the browser's native `title=`** | RA2 draws its own tooltip box with the name, cost and power draw | `b.title = …` rts.html:14911; the in-world hover card (`#hov` rts.html:187-191, `j_hov.png`) is a modern dark chip with a 👇 emoji | nit | S |
| Rally flag with a routed dashed line, numbered waypoint markers, selection brackets, build-ready tab dot, minimap superweapon flash, placement mask | | All present and good: `drawRally` 16418, waypoints 16308-16324, `brackets` 16227, `.ptab div.hasready` 149, `mmPing` 12993, build mask 15895 | — | — |

---

## 7. Audio

No real RA2 assets may be used — everything below assumes synthesis or original
recording. **Nothing in the game plays a sampled sound; every effect is an
oscillator or a white-noise burst.**

| Gap | RA2 (citation) | Game now | Severity | Effort |
|---|---|---|---|---|
| **10 synthesised effects cover the entire game** | sound.ini declares **501** sound entries; rules.ini carries 705 `Sound=`/`VoiceSelect`/`VoiceMove`/`VoiceAttack`/`DieSound` assignments | `sfx(kind)` rts.html:14732-14747: `shot, cannon, die, boom, cash, ready, click, place, no, promote` — that is the whole set | major | L |
| **No per-weapon sounds.** Every gun is either `shot` (40 ms noise) or `cannon`; the Tesla bolt, prism beam, flak burst, V3, Kirov bomb and nuke all reuse them | RA2 has a distinct report per weapon plus `Report=TeslaCoilPowerUp` on the charge anim (art.ini:3014) | `fire()` rts.html:13019 `sfx(src.type === 'rifle' ? 'shot' : 'cannon')` | major | M |
| **No structure sounds** — nothing plays on power up/down, on selling, on capturing, or when a building is placed on the ground | `WorkingSound=PowerOn` / `NotWorkingSound=PowerOff` appear 11× in rules.ini (e.g. `[NASAM]`, rules.ini:10485-10486) | only `sfx('place')` and `sfx('ready')` | minor | S |
| **No music.** RA2 ships 18 tracks | theme.ini declares 18 `[…]` track entries | no music path in the file at all | major | M |
| **EVA and unit voices are browser `SpeechSynthesis`** — pitch-shifted TTS, availability and voice vary by OS, and `speechSynthesis.getVoices()` is often empty on first use | RA2's EVA is a recorded voice per faction; unit acknowledgements are per-unit recorded lines with 3-5 variants each | `eva()` rts.html:14678-14694, `unitAck()` rts.html:14713-14730. The `ACK` table (rts.html:14698-14711) has good coverage — 13 unit types × move/attack/deploy — but it is TTS, and only 13 of the ~25 unit types have any lines (no engineer, tanya, tesla trooper, ivan, drone, v3, flak track, mirage, IFV, terror drone) | major | M |
| No select-vs-move-vs-attack distinction in unit voices | RA2 has separate `VoiceSelect` / `VoiceMove` / `VoiceAttack` per unit | `unitAck` handles `move`/`attack`/`harvest`/`deploy` — there is no *select* line | minor | S |
| Sound is globally rate-limited to 70 ms per kind and the whole master gain is 0.32 | | rts.html:14735, 14646 — fine, but with only two weapon sounds a 40-tank battle is a monotone | minor | S |
| EVA line coverage is good | | unit ready, construction complete, low power, base/miner under attack, unit/structure lost, insufficient funds, primary building, promotion, superweapon ready + enemy launch warnings | — | — |

---

## Top 25 art gaps by impact

Ordered by severity, then by effort (cheapest first within a band).

1. **(6, S)** Two command-bar buttons — `T3` and `Sell` — render outside the sidebar and cannot be clicked; `grid-template-columns: repeat(5,1fr)` needs `minmax(0,1fr)` (rts.html:82).
2. **(4, M)** Explosions are a single scaled radial blob; RA2 fires five named anims at once from four size families.
3. **(1, M)** Buildings vanish on death — no rubble, no crater, no scorch, no debris, no collapse.
4. **(6, M)** No RA2 cursor set: five CSS cursors stand in for a dozen animated intent cursors.
5. **(1, L)** No damaged structure state — a building at 18 % hp is pixel-identical to a new one.
6. **(2, L)** Infantry have no facings; every soldier faces the camera in every situation.
7. **(2, L)** Infantry have no death animations; RA2 has six selected per warhead (`InfDeath=0..7`).
8. **(6, L)** The sidebar is a modern scrolling list of prose rows, not RA2's cameo grid + radar bezel.
9. **(1, S)** Unpowered structures show a red `⚡` emoji instead of going dark and stopping their animation.
10. **(1, S)** Tesla Coil has no 28-frame charge-up before the bolt.
11. **(6, S)** The radar is always live — no Radar building or power required, no bezel, no sweep.
12. **(3, S)** Vehicles never smoke or show damage art below half health.
13. **(6, S)** The command bar has 11 buttons where RA2's `ui.ini` lists 6, mixing sidebar toggles into it.
14. **(1, M)** Defences never aim — turret art is a time-driven idle loop, not a bearing.
15. **(1, M)** No MAKE build-up on placement (208 per-structure MAKE anims in RA2).
16. **(1, M)** Prism Tower has neither a charge anim nor RA2's support-beam links between towers.
17. **(4, M)** Nuke mushroom is a brown mud column with a flat cap — no fire, no white core, no shock cloud.
18. **(4, M)** Ore/gems are static and tile visibly as a rectangular grid inside a field.
19. **(4, M)** Shroud edge is a hard black diamond staircase, not RA2's soft feathered border.
20. **(6, M)** Build progress sweeps across the row instead of wiping a clock over the cameo.
21. **(6, M)** Radar draws in axis-aligned grid space while the world is isometric — a 45° orientation mismatch.
22. **(5, M)** No LAT transitions: every ground-type boundary is a hard tile diamond.
23. **(5, M)** Cliffs read as a grey brick retaining wall; ramps read as a boardwalk.
24. **(5, L)** No terrain height levels — a plateau draws at the same elevation as the ground outside it.
25. **(7, L)** Ten synthesised sounds and no music cover a game RA2 gives 501 sound entries and 18 tracks.

*(Just below the line, and cheap: `(1,L)` footprints one tile smaller than RA2's across every production structure; `(3,M)` MCV unpack is an instant swap; `(6,S)` health bar is a solid rect, not a pip bar; `(2,M)` no infantry firing frames.)*

---

## Present but visibly broken in the screenshots

| What | Where | Evidence |
|---|---|---|
| **`T3` and `Sell` command buttons sit entirely outside the sidebar (x 1375→1400 against a right edge of 1375) and are unclickable**; `Repair` is stranded alone on a third row; the bar's 111 px height also clips the last build row (`Ore Purifier`) mid-word | `#cmdbar` CSS rts.html:82-83 | `j_q_side.png`, `i_sidebar.png`, `art.png` (bottom-right), and the DOM measurement |
| **The minimap viewport marker is a diamond drawn over an axis-aligned square map** — with most of the map shrouded it reads as a stray white arrow poking out of the radar | `drawMini` rts.html:16525-16531 | `i_sidebar.png` (top), `art.png` (top-right) |
| **The nuke mushroom cloud renders as an opaque brown mud pillar drawn straight through the building in front of it** — no additive blending, no fire, and it z-fights the structure | rts.html:16144-16158 (`globalCompositeOperation='source-over'` for the whole mushroom) | `g_fx.png`, `g2_fx.png` |
| **Ore cells show their own tan backing rectangle**, so an ore field is a visible checkerboard of squares rather than a seam | `bakeOre` rts.html:1993, drawn at rts.html:15873-15877 | `h_close_tundra.png` (most obvious on snow), `h_close_gems.png` |
| **Ore and gem fields spawn on urban pavement and roads** | `patch()` rts.html:1237 does not exclude `T_ROAD` | `h_close_river.png`, `h_map_river.png` |
| **Six damaged structures (three at 45 %, three at 18 % hp) are indistinguishable from full-health ones** in a still frame — the only tell is the 30-px hp bar | `drawBld` rts.html:16374 | `a_damaged.png` |
| **Five destroyed structures leave completely clean grass** | `killBld` rts.html:12521 | `b_destroy_t0.png` → `c_destroy_after.png` |
| **The gem plateau's cliff ring is a low grey brick wall around ground that is at the same elevation as the field outside it**; the two ramps into it read as wooden decking | `bakeCliff` rts.html:1753, `bakeRamp` rts.html:12021 | `h_close_gems.png` |
| **The whole infantry roster renders in one front-facing pose**, side by side with correctly-oriented vehicles in the same screenshot | `bakeInfantry` rts.html:2207 | `k_inf.png`, `j_sel.png` |
| **`⚡` emoji glyphs float over every unpowered structure** in the Collective opening scene | `drawBld` rts.html:16397 | `art_col.png`, `e_f3.png` |
| **`fsheet.js` clips the entire Collective row** — the 2600 px canvas only fits the Directorate set plus four Collective items, so the harness silently under-reports | `apps/games/rts/art/fsheet.js` (fixed `height: 2600`) | `fsheet.png` bottom, `fsheet_col.png` |

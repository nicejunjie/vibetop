# Iron Frontier (landing/rts.html) — standing requirement and roadmap

## The requirement, in the user's words

> "all these matters, all details matter. fix them all! … every detail matters
> for this project, the goal is provide a true ra2 experience"  (2026-09-01)

**Binding for every change to the RTS:** the yardstick is Red Alert 2 itself.
Nothing is "good enough" because it is playable; if RA2 does it and we do not,
or we do it and it does not look, move or behave like RA2, it is a defect. No
detail is below the bar. When a QA agent or a reviewer lists a "nit", it goes
on this list and gets fixed, not filed.

Companion documents: `docs/ra2-art-plan.md` (how the art was rebuilt; the
verification harness), `docs/design-decisions.md` (why odd things are the
way they are — colour policy, proportions, dock face, overlays).

## Working rules that follow from it

1. **Build from the real sprite.** Before drawing anything, fetch the real RA2
   asset from the C&C wiki `File:` namespace (`api.php?action=query&list=search
   &srnamespace=6&srsearch=…`, then `prop=imageinfo&iiprop=url`); the wiki
   serves WebP, convert with PIL. Keep it in `docs/ra2-ref/`. Only if no asset
   exists anywhere may an item be built from description, and the commit must
   say so.
2. **Measure, then judge.** Opaque-bbox aspect ratio within ±8% of the
   reference; hue census shows 0% of the opposing player's hue; both owner
   colours rendered side by side. Then look at it at 1:1 in the scene.
3. **Every mechanic RA2 has that we lack is a roadmap item**, not a scope
   decision (primary building, rally points, build-up animation, damage
   states, mining animation, hover names…).
4. **Both factions, always.** A Directorate/Collective pair is two different
   things, not a recolour, unless RA2 itself shares the asset.

## Roadmap

Status: ☐ open · ◐ in progress · ☑ done (with version)

### Art fidelity
- ☑ v1.19.193 Every structure and unit rebuilt against RA2 sprites, both factions
- ☑ v1.19.198 Owner-only colour policy; proportions to reference; Tesla coil from the real sprite
- ☑ v1.19.200 Soviet Barracks rebuilt as the RA2 monument from the real sprite
- ☑ v1.19.200 Soviet Construction Yard from the clean sprite (limestone works, two booms, split pad, hammer-and-sickle)
- ☑ v1.19.200 Soviet War Factory from the in-game sprite (onion tower, six fins, bells, swung door leaf)
- ☑ v1.19.200 Tesla Reactor from the clean sprite (battered pylons, roof slabs, orb below the roofline, side prongs)
- ☑ v1.19.200 Allied yard: 19 thin silver ribs, amber rail deck, front-left arch and shutter, hanging claw
- ☑ v1.19.200 Soviet yard clutter: loading table, pipe elbows, spoil heap, yellow tank, hydrant, drums
- ☑ v1.19.200 Apocalypse: eight individually visible canisters, tapered turret, twin mantlets
- ☑ v1.19.200 Chrono Miner: ribbed chrome drum nose with pipes, violet gear and scoop fingers
- ☑ v1.19.200 `rocket` is Guardian GI (Directorate) / Flak Trooper (Collective), from the real animation frames
- ☑ v1.19.199 Damaged structures smoke below half health and burn below a quarter
- ☑ v1.19.199 Build-up animation: a placed structure rises out of its pad behind a scaffold
- ☑ v1.19.200 Harvester mining frames: scoop/arm down, gear turned, spoil at the seam, alternating while loading
- ☑ v1.19.200 Infantry three-frame walk cycle (scissor stride, counter-swinging arms, bobbing rifle)
- ☑ v1.19.200 Tank turrets aim independently of the hull (hull/turret split, 1.5 s return)
- ☑ v1.19.199 Muzzle flash at the barrel tip; Tesla shots are a crawling jagged bolt from coil head to target
- ☑ Aircraft: separate air draw pass over the depth-sorted ground list; baked soft drop shadow offset down-left of the airframe; flak bursts hang in the air, Kirov bombs fall for their whole flight before the blast (queued fx)

### Per-item polish (art pass 8: "更像真实 RA2", every structure at 1:1 against its sprite)
- ☑ Construction Yards — both re-read at 1:1 against `allied-construction-yard-idle.png` / `soviet-construction-yard-anim2.png`. Allied: two broad curved flukes leaning apart round a dark chimney, mast crane moved level with the pad centre and rebanded (wide `col` base drum / amber ring / glass waist / amber body / silver ring / `col` cap / glass dome), amber box jib with cab and a claw on a cable, orange double-rail bay with ball bollards in front of the gable, silver arch rim round a navy face with the louvre left of centre, near flank falls to near-black with two hoop bands, five `col` slots on the near upper flank, two `col` panels at the far end and beside the arch foot, deck stepped at the right corner. Soviet: steel bell spire with brass cap and antennae (was a brass onion), pink-cream limestone portal (pillars + lintel) round a navy body with the slanted chute plate on top and the hammer-and-sickle on the navy wall (was on the pad), dark gunmetal machine block under the boom (was limestone), boom A plated 8px with a black channel and hazard dashes and a near-vertical forearm, second tilted grille, yellow/black hatch dashes, fat hydrant, yellow tank / spoil heap / front drums removed. Both yards now bake six phases (`bakeBuilding(key, col, fac, bph)`, `A.frames`) and `drawBld` cycles them: Allied jib slews and hoists, fans turn; Soviet boom swings and the claw lifts. Aspect 1.50 vs ref 1.55 and 1.28 vs 1.32; owner hue 14.5% / 14.0%, 0% opposing.
- ☑ Ore Refineries — both re-read at 1:1 against `allied-ore-refinery-idle.png` / `soviet-ore-refinery-anim-last.png` (wiki rips decoded to `docs/ra2-ref/*-ore-refinery-{idle,anim,anim-mid,anim-last,scene}.png`), both MIRRORED so the dock stays on the +gy face. Allied: the drum is an open-mouthed cylinder facing the dock (nested C hoops silver/ivory/lavender/ivory/`col` round a navy cavity with a slatted floor, tan hoist and amber ore slot), ported `col` spine from the tall stack's collar to a jamb block, white rails on charcoal with a chevron patch at each corner, two `col` tanks with white bands, three stepped blocks, straight silver stacks (hard-banded, dark bores, `col` collars) over a ribbed bulge / the olive ribbed skirt with a pipe loop; the old vault + half-disc + steam is gone. Soviet: bell-profile iron cones lit olive-brown left to black right (no leg struts), organ pipes with elbows and feet, two-stage back cone, pale collars under flared chimney lips, the `col` hopper slab with an inclined slatted bridge and two fanned grilles, pale concrete octagon, bigger dished pit with a dark ladder, pale ramp slab with `col` lamps, small tank. Six idle phases each: Allied hoist bobs, sparks fly, ports light in turn; Soviet chimneys smoke, bores and the pit glow pulse, ladder rungs step. Aspect 1.29 vs ref 1.38 and 1.13 vs 1.10; owner hue 15.0% / 14.3%, 0% opposing.
- ☐ Power plants, barracks, war factories, defences, the rest — same method (`docs/ra2-art-plan.md` §4, `aspect.py`, hue census, scene at zoom 1 and 2, build-up, damaged).

### Controls and UX
- ☑ v1.19.194 Selection brackets, primary building, hover name card
- ☑ v1.19.198 Mouse-wheel zoom about the cursor
- ☑ v1.19.199 Touch: tap selects own / orders at, drag pans, pinch zooms; desktop-only gate removed
- ☐ RA2 sidebar behaviour: build queue tabs per structure type with icons, repeat/hold, "cannot build" reasons
- ☑ v1.19.209 RA2 bottom command bar: Same, Path (waypoint mode), T1/T2/T3 (click recalls, Shift-click assigns), Guard, Stop, Scatter, Sell (half refund), Repair (0.5%/s at 30% of cost, wrench glyph); ☑ Deploy (v1.19.212, GI sandbags, hotkey D); Beacon pending multiplayer
- ☑ v1.19.199 Veterancy: 3 kills veteran (+25% damage, -15% damage taken), 6 elite (+50%/-30%, self-heal); gold chevrons; kills and rank on the hover card
- ☑ v1.19.209 Sell / repair via the command bar
- ☑ v1.19.199 Waypoints: shift-right-click queues stops; dashed numbered route shown on the selected unit
- ☑ v1.19.199 S stop, G guard, X scatter (deploy: no deployable unit yet)

### Simulation and AI
- ☑ v1.19.198 Harvester obeys move orders and holds; AI spaces its base
- ☑ v1.19.199 Shroud: map starts black, stays revealed once seen; hidden enemies neither drawn nor hoverable (RA2 without fog)
- ☑ v1.19.199 Ore regrows slowly on existing seams (2/s per tile, never spreads)
- ☐ Superweapons / tech buildings — decide the scope against RA2's tech tree
- ☑ AI: harvester harassment (existing), defences toward the enemy (existing), rebuilds by count (existing); target list now covers every structure type with a catch-all

### Audio
- ☑ v1.19.199 EVA via speech synthesis: unit ready, construction complete, low power, base/miner under attack, unit/structure lost, insufficient funds, primary building selected
- ☑ v1.19.199 Units acknowledge orders with per-type lines in a faction voice (speech synthesis, throttled)

### Roster expansion (user, 2026-09-01: "implement more buildings and other combat items matching real RA2, right now there are too few")
Every new item is built to the same bar as wave 4: real sprite fetched from the C&C wiki `File:` namespace, aspect within ±8%, owner-only colour 12-18% with 0% opposing hue, checked at 1:1 in the scene, sim stats scaled from RA2 rules.ini, AI taught to use it.
- ☑ Phase A — tech structures from real sprites: Allied Airforce Command, Service Depot, Battle Lab, Ore Purifier, Prism Tower; Soviet Radar Tower, Service Depot, Battle Lab, Nuclear Reactor, Sentry Gun (Patriot/Flak Cannon/Gap Generator wait for air units and fog)
- ☑ Phase B — all 11 ground units from real sprites: Engineer (both), Tanya, IFV, Mirage; Rhino, Flak Track, V3, Tesla Trooper, Crazy Ivan, Terror Drone, Tesla Tank; engineer capture, hero cap, tiers, AI use (Chrono Legionnaire still open)
- ☑ Air layer (art7/air): Rocketeer (JUMPJET), Harrier (ORCA, Aircraft lane, 4 pads per Airforce Command, 2 missiles per sortie, returns to reload), Kirov Airship (ZEP, bombs what is under it); Flak Trooper (FLAKT) as its own key, Guardian GI made Allied-only and AA; Patriot Missile (NASAM) and Flak Cannon (NAFLAK) in the Defence lane; per-weapon `aa`/`ag` flags so only AA touches aircraft and AA sites never fire at the ground; aircraft ignore terrain, draw above every ground entity with a ground shadow, altitude bob, propeller / missile-rack / jet-flame frames; "cannot" cursor and refused orders for non-AA units; AI builds AA when bombed or after radar, fills its pads and strikes harvesters/refineries, sends Kirovs with waves; hover card shows missiles/on-pad; voices for all five
- ☐ Air layer follow-ups: aircraft crash-and-burn on death (they pop now), Harrier hover-circle animation while idle in the air, Rocketeer take-off from the Barracks door, IFV turret swap on a Rocketeer passenger (no transports yet), Chrono Legionnaire
- ☐ Phase C — superweapons: Chronosphere / Weather Control Device vs Iron Curtain / Nuclear Missile Silo
- ☑ Tech-tree gating as RA2 (Radar/Airforce → tier 2, Battle Lab → tier 3), sidebar shows prerequisites (v1.19.209)

### Combat model (user, 2026-09-02: "攻击力和血量、装甲等等因素也要全都符合ra2")
- ☑ RA2 armour classes + warhead Verses table, secondary weapons (Guardian GI missile, Tanya C4), rules.ini strength/cost/speed/sight/ROF/range for every unit and structure, RA2 veterancy multipliers, $10000 start, Chrono/War Miner capacities, Allied Power Plant vs Tesla Reactor (v1.19.212)
- ☑ Air-layer items (Rocketeer, Harrier, Kirov, Patriot, Flak Cannon, Flak Trooper) carry their rules.ini numbers (v1.19.212); ☐ AA secondary weapons for Flak Track (FlakWH) / Apocalypse (MammothTusk) — they use their ground warhead against aircraft for now
- ☐ `spectre` is not an RA2 unit — replace it with the Prism Tank (art + stats)
- ☐ MCV / deployable Construction Yard; Ore Purifier +25% and Service Depot repair already follow rules.ini
- ☐ RA2 build-time discount for extra factories (MultipleFactory=0.8) and low-power production penalty curve (currently a flat 0.4×)
- ☑ GI deploy (RA2 E1 Para weapon: range 6, double fire rate behind sandbags; a move order packs up; the AI deploys holding GIs, a human uses D) (v1.19.212) — ☐ deployed-GI art is a placeholder sandbag ring, needs the real RA2 sandbag sprite
- ☐ Vehicles crush infantry (RA2 Crusher=yes) — under RA2 verses infantry masses beat tank lines, and crushing is RA2's main answer; the AI's unit mix and the balance tests both depend on it
- ◐ AI re-tuned for RA2 pacing: spends its bank on more factories/barracks and deeper queues, weighs enemy defences before attacking, no tech before an army, one or two miners per refinery, assumes infantry until scouted; hard-vs-easy self-play is still being measured across both factions

### Debug mode (user, 2026-09-02: "add a debug mode, for instant build, no resource limit and all map vision open, player unit has 10x more durance and 10x more attack than AI opponent")
- ☑ Start-screen checkbox (remembered): instant build for the player, credits pinned at 999999, whole map revealed, the player's units and structures deal 10× and take 1/10; the game is not scored; a banner says so at start (v1.19.213)

### Camera (user, 2026-09-02: "when no unit is selected, I can use right click and drag to move my view on the map")
- ☑ Right-drag pans the map whenever nothing of the player's is selected (middle-drag always pans; a right click that does not move still falls through to the normal right-click) (v1.19.215)

### Terrain and maps (user, 2026-09-02: "build real terrains like RA2, instead of the current plain surface with blocked areas; support multiple maps")
- ☑ Terrain step 1: water with shimmer, shorelines, cliffs (raised, block movement), roads, trees as occluding objects, snow theatre (v1.19.210)
- ☑ Terrain art pass against RA2 tileset references (`docs/ra2-ref/terr-*.png`): seamless 256×128 ground sheets cut into 64 position-indexed tiles, 32 px cliff faces with 16 edge masks, animated water + shallows, shore/road overlays, rock sheets with scree, 4 tree variants per theatre; rocks/trees never land on water or against a cliff, ridges are 3-wide plateaus (v1.19.211)
- ☐ Terrain step 3: more map shapes (chokepoints, plateaus with ramps, bridges), gem fields, urban theatre with civilian structures
- ☑ Three mirrored 2-player maps (Iron Frontier, Lake Divide, Frozen Front) with seeded variation; a playability + mirror-fairness test covers every map
- ☑ Map picker on the start screen; pathfinding and placement aware of water/cliffs/trees; minimap colours per terrain
- ◐ Theatres: temperate and snow shipped (v1.19.211); urban still open — structures keep their art, ground changes

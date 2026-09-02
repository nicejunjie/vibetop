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

### Controls and UX
- ☑ v1.19.194 Selection brackets, primary building, hover name card
- ☑ v1.19.198 Mouse-wheel zoom about the cursor
- ☑ v1.19.199 Touch: tap selects own / orders at, drag pans, pinch zooms; desktop-only gate removed
- ☐ RA2 sidebar behaviour: build queue tabs per structure type with icons, repeat/hold, "cannot build" reasons
- ☑ v1.19.209 RA2 bottom command bar: Same, Path (waypoint mode), T1/T2/T3 (click recalls, Shift-click assigns), Guard, Stop, Scatter, Sell (half refund), Repair (0.5%/s at 30% of cost, wrench glyph); Deploy/Beacon pending a deployable unit and multiplayer
- ☑ v1.19.199 Veterancy: 3 kills veteran (+25% damage, -15% damage taken), 6 elite (+50%/-30%, self-heal); gold chevrons; kills and rank on the hover card
- ☑ v1.19.209 Sell / repair via the command bar
- ☑ v1.19.199 Waypoints: shift-right-click queues stops; dashed numbered route shown on the selected unit
- ☑ v1.19.199 S stop, G guard, X scatter (deploy: no deployable unit yet)

### Simulation and AI
- ☑ v1.19.198 Harvester obeys move orders and holds; AI spaces its base
- ☑ v1.19.199 Shroud: map starts black, stays revealed once seen; hidden enemies neither drawn nor hoverable (RA2 without fog)
- ☑ v1.19.199 Ore regrows slowly on existing seams (2/s per tile, never spreads)
- ☐ Superweapons / tech buildings — decide the scope against RA2's tech tree
- ☐ AI: attacks harvesters, builds defences toward the enemy, rebuilds destroyed structures

### Audio
- ☑ v1.19.199 EVA via speech synthesis: unit ready, construction complete, low power, base/miner under attack, unit/structure lost, insufficient funds, primary building selected
- ☑ v1.19.199 Units acknowledge orders with per-type lines in a faction voice (speech synthesis, throttled)

### Roster expansion (user, 2026-09-01: "implement more buildings and other combat items matching real RA2, right now there are too few")
Every new item is built to the same bar as wave 4: real sprite fetched from the C&C wiki `File:` namespace, aspect within ±8%, owner-only colour 12-18% with 0% opposing hue, checked at 1:1 in the scene, sim stats scaled from RA2 rules.ini, AI taught to use it.
- ☐ Phase A — defences and tech structures: Allied Patriot Missile, Prism Tower, Gap Generator, Battle Lab, Airforce Command; Soviet Sentry Gun (sprite on disk), Flak Cannon, Radar Tower, Battle Lab, Nuclear Reactor
- ☐ Phase B — units: Allied Engineer, Rocketeer (jetpack), IFV, Mirage Tank, Harrier, Chrono Legionnaire, Tanya; Soviet Engineer, Tesla Trooper, Crazy Ivan, Rhino Tank (sprite on disk), Flak Track, V3 Launcher, Terror Drone, Kirov, Tesla Tank
- ☐ Phase C — superweapons: Chronosphere / Weather Control Device vs Iron Curtain / Nuclear Missile Silo
- ☐ Tech-tree gating as RA2 (Radar/Airforce → tier 2, Battle Lab → tier 3), sidebar shows prerequisites

### Terrain and maps (user, 2026-09-02: "build real terrains like RA2, instead of the current plain surface with blocked areas; support multiple maps")
- ☐ Tileset built against RA2 references: grass/dirt/sand variants, cliffs (height edges that block movement, with top/side faces), water and shoreline, roads, trees and rocks as objects with shadows, ore and gem fields
- ☐ Map format (size, tiles, objects, ore, start positions) + several 2-player maps (temperate lake, snow, urban ruins) — hand-authored layouts, seeded variation
- ☐ Map picker on the start screen; pathfinding aware of cliffs/water; minimap colours per terrain
- ☐ Theatres: temperate first, then snow (RA2 has temperate/snow/urban); structures keep their art, ground changes

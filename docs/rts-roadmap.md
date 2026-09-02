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
- ☐ Soviet Barracks from the real sprite (was built from description)
- ☐ Soviet Construction Yard from the real sprite (was a screenshot)
- ☐ Soviet War Factory from the real sprite (was a screenshot)
- ☐ Tesla Reactor from the real sprite (was a screenshot)
- ☐ Allied yard: finer, more silver corrugation on the vault; amber pipework deck
- ☐ Soviet yard: pipe runs, yellow tank, hydrant — the reference's clutter
- ☐ Apocalypse: individually visible missile canisters (2 rows of stubby tubes)
- ☐ Chrono Miner: ribbed, scoop-like chrome machinery cluster on the nose
- ☐ `rocket` → faction-specific anti-tank infantry: Guardian GI (Directorate) / Flak Trooper (Collective), from real sprites
- ☑ v1.19.199 Damaged structures smoke below half health and burn below a quarter
- ☑ v1.19.199 Build-up animation: a placed structure rises out of its pad behind a scaffold
- ☐ Harvester mining animation frames (RA2 miner's scoop/drill works while loading)
- ☐ Infantry walk cycle (RA2 infantry animate; ours slide)
- ☐ Vehicle turret rotates independently toward the target
- ☑ v1.19.199 Muzzle flash at the barrel tip; Tesla shots are a crawling jagged bolt from coil head to target

### Controls and UX
- ☑ v1.19.194 Selection brackets, primary building, hover name card
- ☑ v1.19.198 Mouse-wheel zoom about the cursor
- ☑ v1.19.199 Touch: tap selects own / orders at, drag pans, pinch zooms; desktop-only gate removed
- ☐ RA2 sidebar behaviour: build queue tabs per structure type with icons, repeat/hold, "cannot build" reasons
- ☑ v1.19.199 Veterancy: 3 kills veteran (+25% damage, -15% damage taken), 6 elite (+50%/-30%, self-heal); gold chevrons; kills and rank on the hover card
- ☐ Sell / repair modes on the sidebar
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

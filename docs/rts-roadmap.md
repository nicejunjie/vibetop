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
- ☐ Damaged-state look for structures (RA2: darker/damaged frame + smoke + fire)
- ☐ Build-up animation when a structure is placed (RA2 rises from its pad)
- ☐ Harvester mining animation frames (RA2 miner's scoop/drill works while loading)
- ☐ Infantry walk cycle (RA2 infantry animate; ours slide)
- ☐ Vehicle turret rotates independently toward the target
- ☐ Muzzle flash / recoil per facing; tesla arc as a drawn bolt to the target

### Controls and UX
- ☑ v1.19.194 Selection brackets, primary building, hover name card
- ☑ v1.19.198 Mouse-wheel zoom about the cursor
- ☐ Touch: pinch zoom, drag pan, tap select, long-press order (the shell is used on phones/tablets)
- ☐ RA2 sidebar behaviour: build queue tabs per structure type with icons, repeat/hold, "cannot build" reasons
- ☐ Unit veterancy chevrons; kill counter on hover
- ☐ Sell / repair modes on the sidebar
- ☐ Waypoint queueing (shift-click)
- ☐ Guard / scatter / stop / deploy hotkeys as in RA2

### Simulation and AI
- ☑ v1.19.198 Harvester obeys move orders and holds; AI spaces its base
- ☐ Fog of war / shroud with radar reveal, as RA2
- ☐ Ore regrowth from gems/drills? (RA2: ore grows slowly; gems don't)
- ☐ Superweapons / tech buildings — decide the scope against RA2's tech tree
- ☐ AI: attacks harvesters, builds defences toward the enemy, rebuilds destroyed structures

### Audio
- ☐ EVA-style announcements (unit ready, construction complete, low power, base under attack)
- ☐ Per-unit acknowledgement voices on order (RA2 units talk back)

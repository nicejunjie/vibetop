# RA2 Art Rebuild — requirement, plan and build procedure

> This file is self-contained. A fresh Claude Code session should be able to
> read only this file (plus the reference images it points at) and execute the
> whole job. Written 2026-09-01, against `landing/rts.html` at v1.19.192 /
> sw v455.

---

## 1. The requirement, in the user's words

Verbatim, across the conversation that produced this plan:

- *"能做个即时战略游戏么？ra2那样，production quality，聪明的ai对手，真的好玩"* — build an RA2-style RTS at production quality.
- *"the art is a very minor improvement, still in terrible shape. You should make everything looks like ra2 items, all the building shapes should recover it, others too."*
- *"make sure you get the real ra2 building and character image, and reconstrut our ones close to them"*
- *"none of them look alike to ra2 ones."*
- *"and I have been telling you, the building shapes should look alike the ra2 ones. and you have been igoring this request, if you ressembles the shape well enough, maybe vector is fine."*
- *"make sure you design both ally and russian items. the russian barrack is a tall building with its upper look like a soilder, do you see that?"*
- *"the main construction building loooks nothing alike to the ra2 ones"*
- *"i request you to make the most serious effort in building the arts, get image of all real ra2 items, make a detailed plan of what each should look like, then carefully build our counterparts one by one. use subagents to build them in parallel, then 2 subagents to quality check."*
- *"record my requirement, the plan, all in one file on the disk, I will restart claude code clean to build it."*

### What that means concretely

1. **Shape is the priority, not rendering medium.** Vector canvas drawing is
   acceptable *if the silhouette matches*. A hand-authored pixel-art pipeline
   was tried and rejected ("all dots, looks fuzzy. trash") — `bakePix` and
   `PIXBLD` still exist in the file but `PIXBLD` is empty and must stay that
   way unless the user asks again.
2. **Both factions.** Directorate ↔ RA2 Allies, Collective ↔ RA2 Soviets.
   Soviet structures are *different buildings*, not recolours. The Soviet
   Barracks in particular is a tall block crowned by a saluting soldier statue.
3. **Work from the images, not from memory.** Six consecutive attempts failed
   because they were built from written descriptions. The turn that finally
   moved the needle was the one that downloaded the sprites and looked at them.

### History — what was already tried and rejected

| Attempt | Outcome |
|---|---|
| More greebles / pipework on concrete sheds | rejected, "still terrible" |
| Warmer palette, squatter massing, filled footprints | rejected |
| Hand-authored pixel grids on a locked palette | rejected, "all dots, fuzzy, trash" |
| Shape fixes from *written* wiki descriptions | rejected, "none of them look alike" |
| **Rebuild from downloaded sprites** | **first real progress** — user: *"the barrack looks closer to ra2 one now, but keep improving"* |

The lesson to carry in: **look at the reference image before drawing, and
compare renders against it side by side afterwards.**

---

## 2. Reference images (already on disk)

`docs/ra2-ref/` — 23 files, downloaded from the C&C Wiki API. All are real
in-game sprites or sprite sheets. Read them with the Read tool; it renders
images visually.

```
allied-construction-yard.gif   allied-power-plant.png    allied-ore-refinery.gif
allied-barracks.png            allied-war-factory.gif    allied-pillbox.gif
allied-grizzly-tank.png        allied-prism-tank.png     allied-chrono-miner.png
allied-gi.png
soviet-construction-yard.gif   soviet-construction-yard.jpg
soviet-construction-yard-anim.gif                        soviet-tesla-reactor.png
soviet-ore-refinery.gif        soviet-ore-refinery.jpg   soviet-war-factory.jpg
soviet-tesla-coil.jpg          soviet-rhino-tank.png     soviet-apocalypse-tank.png
soviet-war-miner.png           soviet-conscript.png      soviet-conscript-anim.gif
```

Several are 8-facing sheets with the units arranged in a ring; crop one facing
and upscale with PIL (`Image.NEAREST`) to study it.

### Three caveats, found by actually looking at these

- **No Soviet Barracks image was obtainable.** Build it from the user's own
  description — a tall building whose top looks like a soldier — and flag in
  the commit that it is unverified.
- **`soviet-tesla-coil.jpg` is a photograph of a real-world Tesla coil, not the
  game sprite.** It corroborates only the general form (thin column, bulbous
  discharge head, arcs). That spec is likewise "from knowledge". If a real
  sprite turns up later, redo that item first.
- **`soviet-ore-refinery.gif` opens on an empty construction pad.** Step to the
  final frame of the build-up animation to see the finished building.

---

## 3. The code you will be editing

**One file: `landing/rts.html`** (~4300 lines, single inline `<script>`, no
build step). Everything below lives in it.

### 3.1 Where the art is

| What | Function | Line (approx, at v1.19.192) |
|---|---|---|
| Structures | `bakeBuilding(key, col, fac)` | 1628 |
| Vehicles (8 facings) | `bakeVehicle(col, kind)` | 1065 |
| Infantry | `bakeInfantry(col, kind)` | 941 |
| Bakes everything at load | `bakeAll()` | search `SPR.bld = [{ dir:` |

`bakeBuilding` opens with a shared preamble (palette consts, platform, and the
local helpers `stackR` / `pylon` / `apron`), then a flat
`if (key === 'base') { … } else if (key === 'power') { … } …` chain. Each
branch begins `if (sov) { …Soviet… } else { …Allied… }` where
`var sov = fac === 'col'`.

Sprites are keyed `SPR.bld[player][faction][key]` → `{ s:{c,g,w,h}, ax, ay }`,
where `(ax, ay)` is the footprint centre in the sprite's own pixels.
`SPR.unit[player][type]` is a single canvas for infantry, an array of 8 for
vehicles.

### 3.2 Drawing contract inside a `bakeBuilding` branch

In scope: `g` (2D context), `cx`, `baseY` (footprint centre), `fw`, `fh`
(footprint half-extents), `col` (owning player's colour), `sov`, and the
palette consts `PLAT PLAT_E BODY BODY_D RIBL RIB RIBP BLU BLUL STK STK_T AMB
AMBH HAZ CONC STEEL ROOF dark TAR hi lo u`.

Helpers (all take `g` first unless noted):

```
shade(colour, factor)                          → lighter/darker colour string
mixc(a, b, t)                                  → blend two colours
diamond(g, cx, cy, w, h)                       → iso diamond PATH (then fill/stroke)
outline(g, colour)                             → stroke the current path
isoBox(g, cx, cy, len, wid, hgt, dir, col, edge)   → volume, dir in GRID space
prism(g, cx, cy, hw, hh, lift, wall, roof, edge)   → footprint-aligned box, returns roof y
vault(g, cx, cy, hw, hh, rise, col, edge)          → ribbed barrel roof
gable(g, cx, cy, hw, hh, rise, cA, cB, edge)       → pitched roof, returns ridge
cylinder(g, cx, cy, rx, h, body, top, edge)        → upright cylinder
faceL / faceR (cx, cy, hw, hh, lift, t, v)         → point on a wall, t along, v up
facePatch(g, F, cx, cy, hw, hh, lift, t0,t1, v0,v1, fill, edge)   → quad on a wall
chevrons(g, F, …, n, cA, cB)                       → hazard stripes on a wall
lattice(g, x0,y0, x1,y1, w, col)                   → girder truss
railing / pipeRun / streak / floodlight / drums / crates / steam
stackR(x, y, r, h)   pylon(x, y, r, h)   apron(x, y, hw, hh)      (local to bakeBuilding)
```

### 3.3 Hard rules

- **No `Math.random` anywhere.** The sim is deterministic and seeded
  (`srand`/`rnd`); a random call breaks headless balance runs. Use `srand(k)`
  then `rnd()` if you need scatter.
- **Bake once.** Everything is drawn into an offscreen canvas at load; the
  render loop only `drawImage`s. Never draw shapes per frame.
- **Two colour axes.** Player colour = *whose it is*; fixed per-type colour =
  *what it is*. A red base and a blue base must read as the same building.
- **Canvas must fit the art.** `head` (per-key, near the top of
  `bakeBuilding`) reserves vertical room above the footprint. Tall Soviet
  structures need it raised or they clip.
- Keep `PIXBLD` empty.

---

## 4. Verification harness

A local static server plus Playwright. **Always look at a render — never judge
sprite work by reading code.**

```bash
# once per session
cd landing && python3 -m http.server 8099 --bind 127.0.0.1 &

# contact sheet of every structure, both factions
node tools/rts-art/fsheet.js       # writes fsheet.png

# one structure, zoomed (args: key, zoom)
node tools/rts-art/one.js power 4  # writes one.png

# all 8 facings of each vehicle
node tools/rts-art/vsheet.js       # writes vsheet.png

# infantry
node tools/rts-art/usheet.js       # writes usheet.png

# in-game scene
node tools/rts-art/shot.js         # writes art.png
```

Those scripts are committed in **`tools/rts-art/`**. Each launches chromium,
loads `http://127.0.0.1:8099/rts.html`, waits for `window.__rts`, reads
`window.__rtsTest.spr()`, blits sprites onto a canvas and saves a PNG.
`cmp.js` dumps each structure to `mine_<key>.png` so you can build the
side-by-side against `docs/ra2-ref/`. They hardcode an output path in the
job tmp dir — repoint that to somewhere you can Read.

**The single most useful tool is a side-by-side sheet**: reference image on the
left, our render on the right, one row per item. Build it and Read it.

---

## 5. Build procedure

The user asked for: **parallel subagents to build, then 2 subagents to quality
check.** Structure it as four waves.

### Wave 0 — setup (main session, ~10 min)

1. Start the static server; confirm the harness scripts render.
2. Read all 23 reference images yourself so you can judge the agents' output.
3. Produce a **baseline** side-by-side sheet (reference vs current) and keep it
   for comparison at the end.

### Wave 1 — build, in parallel (7 subagents)

**Conflict avoidance is the whole design problem here.** Every branch lives in
the same file, so agents must not edit `landing/rts.html` concurrently. Give
each builder `isolation: "worktree"` — each gets its own checkout, edits only
its own branch, renders, iterates, and reports. The main session then splices
each finished branch back into the real file. Splicing is mechanical because
the branches are delimited by `} else if (key === '<key>') {`.

One agent per structure, on a capable model (opus/sonnet, not haiku — this is
visual judgement, not find-and-replace):

| Agent | Builds | Reference files |
|---|---|---|
| 1 | `base` — both factions | allied-construction-yard.gif, soviet-construction-yard.{gif,jpg} |
| 2 | `power` — Allied plant + Tesla Reactor | allied-power-plant.png, soviet-tesla-reactor.png |
| 3 | `refinery` — both | allied-ore-refinery.gif, soviet-ore-refinery.{gif,jpg} |
| 4 | `barracks` — both | allied-barracks.png, (Soviet: from description) |
| 5 | `factory` — both | allied-war-factory.gif, soviet-war-factory.jpg |
| 6 | `sentry` + `tesla` | allied-pillbox.gif, soviet-tesla-coil.jpg |
| 7 | vehicles + infantry | grizzly, prism, chrono-miner, rhino, apocalypse, war-miner, gi, conscript |

**Every builder's brief must contain, verbatim:**

- The art spec for its item (section 6 below).
- The absolute paths of its reference images, and the instruction: *"Read every
  one of these images before writing any code. Read them again after your first
  render and compare."*
- The drawing contract (section 3.2) and the hard rules (section 3.3).
- The verify loop: *"render with `node one.js <key> 4`, Read the PNG, compare
  against the reference, iterate. You must do at least three render-look-fix
  cycles. Do not report done off an unrendered change."*
- A budget: *"at most ~45 minutes and ~8 render cycles; report what you got to
  even if imperfect."*
- The output contract: *"reply with the complete final text of your
  `} else if (key === '<key>') { … }` branch, and nothing else in a code block."*

### Wave 2 — integrate (main session)

Splice each returned branch into `landing/rts.html`. Then:

- `./run-tests.sh` must pass (the pre-commit hook runs it; never `--no-verify`).
- Render the full contact sheet and the in-game scene; eyeball for clipping,
  sprites overflowing their canvas, or z-order errors.

### Wave 3 — quality check (2 subagents, in parallel)

Both get the reference images AND the freshly rendered sheets. Neither writes
code.

- **QA-A (fidelity):** for each item, score 1-5 on *"would a Red Alert 2 player
  name this building from its silhouette alone?"* and list the single biggest
  remaining deviation from the reference. Must Read both the reference and our
  render for every item.
- **QA-B (coherence & correctness):** do the two factions read as two distinct
  armies? Is the player colour visible and consistent on every item? Any sprite
  clipped, floating off its platform, mis-anchored, or drawn per-frame? Any
  `Math.random`? Does it still look right at 1:1 in the in-game scene rather
  than only when zoomed?

Feed their findings back into a short Wave-4 fix pass in the main session.

### Ship

Bump `VERSION` **and** `landing/sw.js`'s `VERSION` (both, always — the sw
string is the deploy signal the SSE stream watches). Commit, merge to `main`,
push, then deploy:

```bash
sudo -u vibetop git -C /opt/vibetop/app pull --ff-only
sudo -u vibetop /opt/vibetop/app/landing/install.sh
sudo systemctl restart vibetop-manager
grep -o "v4[0-9][0-9]" /opt/vibetop/vibetop-www/sw.js | head -1   # confirm
```

### Cost note

7 builders × ~8 render cycles plus 2 QA agents is a substantial run. That is
what the user asked for. If a cheaper first pass is wanted, do Wave 1 with
agents 1, 2 and 7 only (yard, power, units) — those are the three the user has
named as wrong most often.

---

## 6. Per-item art specification

Written by inspecting every reference image. All px values are at final
on-screen scale for the stated footprint (3x3 diamond = 192x96, 3x2 = 160x80,
2x2 = 128x64, 1x1 = 64x32). "Height" = rise above the ground diamond.
PLAYER colour is Directorate blue `#2f5aa0` / Collective red `#b3242a`.
Fixed colours never remap.

---

### base — Allied Construction Yard (Directorate)
- **SOURCE:** observed in `allied-construction-yard.gif` (frame 0; later frames are a destruction animation — ignore them)
- **SILHOUETTE:** A big ribbed half-cylinder hangar with two tall curved fins jutting from its roof, plus a fat striped smokestack-tower and a skeletal crane arm hanging off the left front corner.
- **MASSING:** Dominant: a corrugated barrel vault laid diagonally (axis back-left → front-right), spanning ~0.9·fw wide and rising ~55px, sitting centre-right; its front gable is a dark A-frame face. Secondary: a cylindrical tower ~28px diameter, ~50px tall at front-left, on a round red plinth. Tertiary: a lattice crane arm ~0.4·fw long reaching from the tower toward front-centre, tip ~35px up, ending in a two-prong claw over a rail strip. Roof clutter (fans, fins) adds ~20px above the vault crown. All on a raised dark octagonal deck ~8px thick covering the 3x3 pad.
- **PALETTE:** silver corrugated vault `#b9bcc4` with dark rib shadows `#5a5e6a`; gunmetal body/deck `#2b3040`; warning-red roof fins and intake rings `#c22b20` (fixed — this red is on both factions' yards); crane/tower yellow `#e0a63c`; white door louvers `#e8eaee`; deck rail lines burnt orange `#a05a20`. PLAYER colour: a trim band around the deck edge, the small pennant on the vault crown, and the gable's chevron emblem.
- **DETAILS:** (1) Two large curved red fins rise from the roof left of the vault like whale flukes — the single most recognisable feature. (2) The dark gable face carries a white horizontally-louvered roll-up door with a small white chevron logo above it. (3) Two flat grey turbine fans (~18px discs, spoked) lie on the roof between the fins. (4) The yellow crane ends in an open claw dangling over an orange-edged rail track inset in the deck. (5) The stack-tower is banded: red cap ring, silver/blue mid band, yellow body.
- **MOST COMMON MISTAKE:** Drawing it as a generic biggest-box HQ — without the roof fins and the crane-plus-claw it reads as a second War Factory.

### base — Soviet Construction Yard (Collective)
- **SOURCE:** observed in `soviet-construction-yard.gif` (very small, 70x54 source; fine detail below the pixel level was not resolvable)
- **SILHOUETTE:** A dense clenched cluster of dark-red machinery with crane claws raised at the corners like a crab, and one thin gold-tipped spire poking from the centre.
- **MASSING:** No single dominant vault — a blocky agglomeration ~0.8·fw x 0.8·fh of stepped dark boxes, tallest at centre-back (~45px). Two or three articulated crane arms (each ~25px long, elbow-jointed, claw tips up) sprout from the left and right corners at ~35px. A slender central mast ~60px tall with a small gold ball finial. Front-centre: a small round pad/hatch at deck level on the khaki base plate.
- **PALETTE:** oxblood/dark-red machinery `#7e1f1c` (fixed Soviet industrial red); near-black steel `#1d1d22`; charcoal-brown deck `#3a352c`; khaki base plate `#6b6248`; brass spire tip `#c8973a`; pale grey highlights `#9aa0a8`. PLAYER colour: the crane-arm sleeves and a deck-edge band.
- **DETAILS:** (1) Corner crane claws angled upward-outward — the crab pose is the identifier. (2) Thin centre mast with gold ball tip, a miniature Kremlin antenna. (3) Massing is chaotic and stepped, no clean roofline anywhere. (4) Round hatch/pad with markings at the front deck corner. (5) Overall value is much darker than any other Soviet building.
- **MOST COMMON MISTAKE:** Mirroring the Allied yard in red — the Soviet yard has no barrel vault and no single big door; it's claws and clutter.

### power — Allied Power Plant (Directorate)
- **SOURCE:** observed in `allied-power-plant.png`
- **SILHOUETTE:** Three fat vertical cylinders standing in a triangle around a central up-tilted metal bowl, like batteries around a satellite dish.
- **MASSING:** 2x2. Three capacitor cylinders (~22px diameter, ~55px tall including domed caps) placed back-left, back-right, front-centre-ish on the diamond; between them, centred, a copper parabolic bowl ~30px across tilted up-left at ~40px height, fed by a coiled-spring column of machinery ~35px tall beneath it. Squat gunmetal drum bases (~15px) under each cylinder. Octagonal dark base plate ~5px.
- **PALETTE:** cobalt-violet cylinder bodies `#4a52c0` with strong white specular streak `#dfe2f2`; copper/amber bowl and coil `#c07a2e` with bright rim light `#f0c060`; gunmetal drum bases `#565a66`; dark base plate `#33363f`; cap collars brass `#a8823c`. PLAYER colour: the skirt band at the base of each cylinder and the base-plate rim.
- **DETAILS:** (1) The upturned copper bowl in the middle — no other building has a dish aimed at the sky. (2) Each cylinder has a small rectangular access panel on its front face and a rounded metallic cap. (3) A visible coiled (helical) column connects base machinery to the bowl. (4) The three cylinders are individually lit with one hot vertical highlight each, making them read glassy. (5) Base cluster is greebled with small pipes/valves between the drums.
- **MOST COMMON MISTAKE:** Drawing a smokestack or cooling-tower power plant — this one is electrical/capacitive, cylinders + dish, with zero chimneys.

### power — Tesla Reactor (Collective)
- **SOURCE:** observed in `soviet-tesla-reactor.png`
- **SILHOUETTE:** A glowing glass orb cradled between two leaning masonry pylons plastered with red warning panels.
- **MASSING:** 2x2. Dominant: translucent sphere ~40px diameter, centred, its equator at ~30px height. Two pylon towers (~20px wide, ~55px tall, rectangular with stepped tops) flank it front-left and right, leaning a few degrees inward; each pylon top slopes toward the orb. Grey elbow pipes (~8px bore) exit the right pylon and run to ground. Low masonry plinth ~6px under everything.
- **PALETTE:** orb glass pale violet-white `#b9b2e8` with swirl highlight `#eeeaff` and deep violet limb `#5a4e9a`; pylon masonry grey-brown `#6e6258` with darker brick seams `#4a4038`; warning panels red `#c22b20` with white glyph marks `#e8e6e0`; pipes slate `#7a7f86`; drooping cables near-black `#22252a`. PLAYER colour: the red warning panels are the remap surface (blue panels when Directorate-owned); orb and masonry are fixed.
- **DETAILS:** (1) The orb visibly swirls/pulses — one strong off-centre swirl highlight. (2) Red rectangular panels with tiny white markings sit on BOTH the pylon tops and their sloped inner faces — 4-5 panels total. (3) Thin cables sag from the orb's underside to the plinth. (4) Fat grey pipes elbow out of the right pylon and dive into the ground. (5) Masonry is rough/mottled, deliberately older-looking than any Allied surface.
- **MOST COMMON MISTAKE:** Making the orb opaque or tiny — it must be the biggest, brightest, most saturated thing on the building, clearly glass with an internal glow.

### refinery — Allied Ore Refinery (Directorate)
- **SOURCE:** observed in `allied-ore-refinery.gif`
- **SILHOUETTE:** Two tall silver bottle-shaped stacks behind a huge ribbed drum seen edge-on, with a flat docking ramp sticking out to the right.
- **MASSING:** 3x2. Dominant: a vertical-standing ribbed drum/wheel (a barrel vault sliced to a half-disc, flat face toward front-right) ~55px tall, ~0.45·fw wide, front-centre-left. Behind it two flask towers — cylindrical neck on conical shoulder — ~28px diameter at base, ~75px and ~85px tall, one at back-left (rising from a squat olive ribbed dome ~20px) and one back-centre. A blue spine/bridge with three porthole discs runs along the top between drum and towers at ~50px. Right third of the footprint: flat dark dock deck ~10px high with rails, a small crane, and the unload bay. Olive base plate.
- **PALETTE:** silver-white drum ribs `#d8dae2` with blue band arcs `#2f5aa0`; steel towers `#aeb2be` with dark caps `#3a3e4a`; olive-khaki dome and pad `#6f6b48`; blue machinery spine `#2c4f92`; deck charcoal `#2e3138`; hazard yellow chevrons `#d8b41e`; ore glow amber `#e09a30` at the dump slot. PLAYER colour: the blue drum bands, tower collar rings, and spine — the building's blue IS the remap.
- **DETAILS:** (1) The two flask/bottle towers with narrow necks and dark caps — instantly says "refinery". (2) Ribbed half-drum with concentric blue arc bands, like a giant wheel embedded in the building. (3) Flat dock deck with two parallel rails and yellow chevrons at the outer edge — the harvester visibly parks here, so keep it clear of clutter. (4) A warm amber glow at the dump slot where the deck meets the drum. (5) Blue rooftop spine with three round port lights.
- **MOST COMMON MISTAKE:** Omitting the dock — without the flat rail deck the harvester has nowhere to "dock" visually and the building reads as a power plant.

### refinery — Soviet Ore Refinery (Collective)
- **SOURCE:** observed in `soviet-ore-refinery.gif` (final frame of a build-up animation; earlier frames are the bare pad)
- **SILHOUETTE:** Two giant dark funnels — wide cones necking into tall black chimneys — with red radiator grilles bristling between them and a round unload pit in front.
- **MASSING:** 3x2. Two furnace cones: base diameter ~0.4·fw each, sloping into cylindrical stacks ~14px diameter; total heights ~85px (back-right, taller) and ~70px (front-left). The front-left cone's skirt is ringed by ~8 pale vertical pipes. Between/behind the cones at ~35px: red machinery block with three angled red radiator grilles on short booms and a red conveyor bridge sloping down toward the front. Front-right: a circular unload pad ~0.35·fw across, dished, with a ladder/conveyor laid across it and a pale flat ramp exiting the pad edge. Mottled khaki base plate.
- **PALETTE:** dark iron cones `#3c3a36` with olive sheen `#5c5844`; black stacks `#191a1e` with pale collar rings `#9aa0a8`; red grilles/conveyor `#c22b20` (remap); bone-white ramp `#cfcabc`; khaki mottled pad `#6b6248`; pipe ring pewter `#8a8e96`. PLAYER colour: the red radiator grilles, conveyor bridge, and small corner lamps.
- **DETAILS:** (1) The cone-into-chimney profile, twice, at different heights — nothing Allied has this shape. (2) Ring of vertical pipes around the front cone's skirt, like organ pipes. (3) Three red slatted grilles angled outward on booms, reading as glowing radiators. (4) Circular recessed unload pad with a ladder across it — the harvester's dock; keep the ring concentric and obvious. (5) Pale ramp tongue sticking off the pad toward the map edge of the footprint.
- **MOST COMMON MISTAKE:** Reusing the Allied refinery massing in red — the Soviet one is cones and chimneys with a round pit, not drums and bottles with a flat rail dock.

### barracks — Allied Barracks (Directorate)
- **SOURCE:** observed in `allied-barracks.png`
- **SILHOUETTE:** Two parallel Quonset huts stepped in echelon with a small domed watch-tower flying a flag behind them.
- **MASSING:** 2x2. Two barrel-vault huts, axes back-left → front-right, each ~0.45·fw wide, ~32px to the vault crown; the right hut sits ~half a hut-length further toward front-right (staggered, not aligned). Back-left between them: a slim round tower ~12px diameter, ~55px tall, with a dark dome cap and a black flag on a pole reaching ~70px. Khaki pad with yellow-striped corners; a cluster of 3 small drums at the front-right pad corner.
- **PALETTE:** vault canvas white-grey `#d4d6da` with fabric shading `#9b9fae`; frame ribs and end-arches blue `#2f5aa0` (remap); window slits green glass `#3f7a4a`; dark arch doors `#23262e`; khaki pad `#6f6b48`; hazard yellow `#d8b41e`; flag black `#16181d`. PLAYER colour: the vault rib frames, tower bands, and flag field.
- **DETAILS:** (1) The echelon stagger of the two huts — do not align them; the offset is the read. (2) Each hut's gable end is a dark arch door with a tiny ladder beside it. (3) A row of 3-4 small green-lit window slits low on each hut's flank. (4) Dome-capped tower with flag — the only vertical element. (5) Yellow hazard stripes on exactly two pad corners, front-left and front-centre.
- **MOST COMMON MISTAKE:** One big hut instead of two staggered small ones — a single vault at 2x2 scale reads as a mini War Factory.

### barracks — Soviet Barracks (Collective)
- **SOURCE:** **from knowledge, NOT verified against an image** (no Soviet Barracks image in the reference set)
- **SILHOUETTE:** A squat fortress block of dark concrete crowned by a large statue of a saluting conscript.
- **MASSING:** 2x2. Base: a heavy rectangular concrete block ~0.8·fw x 0.8·fh, ~35px tall, with slightly battered (inward-sloping) walls and a stepped parapet. On its roof, off-centre toward back, a plinth ~10px carrying a statue of a soldier (helmeted figure, one arm raised in salute, rifle slung) ~40px tall, total ~85px. Front face: wide low doorway with red frame at deck level.
- **PALETTE:** concrete grey-brown `#7a7266`; darker shadow courses `#4e483e`; statue verdigris/bronze `#6e7a5a` or bare grey `#8d9096`; door and banner red `#b3242a` (remap); roof trim near-black `#26282c`; khaki pad `#6b6248`. PLAYER colour: the door frame, a wall banner, and a flag beside the statue.
- **DETAILS:** (1) The rooftop conscript statue, arm raised — the identifier; keep it big enough to read at game scale (~40% of building height). (2) A vertical red banner hung on the front wall. (3) Battered walls with visible horizontal formwork lines. (4) Low wide doorway soldiers emerge from. (5) Optional: a searchlight or loudspeaker horn on one parapet corner.
- **MOST COMMON MISTAKE:** Making it a red Quonset hut — the Soviet barracks is monumental concrete + statue, with no vault anywhere.

### factory — Allied War Factory (Directorate)
- **SOURCE:** observed in `allied-war-factory.gif`
- **SILHOUETTE:** One enormous glass-panelled barrel vault filling the whole pad, open-mouthed at the front with a lit interior and an exit ramp.
- **MASSING:** 3x3. Dominant: a single barrel vault, axis back-left → front-right, ~0.85·fw wide, ~70px at the crown, with 6-7 rib bays each holding a pale skylight strip. The front-right end is OPEN: a full-height arch showing a warm yellow lit interior floor and a ribbed ramp/track running down onto the apron (vehicles drive out here — keep this quadrant clear). Back-left: a round machinery pod (~18px dome on a drum) with a black flag mast to ~85px, plus a flat grey panel wall. Front-left apron: a scatter of drums and crates ~6px. Dark olive pad with rimmed edge.
- **PALETTE:** skylight glass pale lavender `#c3c2e2` with white glints `#eceafe`; rib frames silver `#a9adb9`; blue trim arcs at both vault ends `#2f5aa0` (remap); interior glow amber `#d8a840`; pod/machinery gunmetal `#4a4e5a`; pad dark olive `#3c3e30`; drums charcoal `#2c2e34`. PLAYER colour: the end-arch trim bands, flag, and small door accents.
- **DETAILS:** (1) The open lit mouth with exit ramp — the factory must look like something drives out of it. (2) Repeating glass roof bays with individual skylight strips, giving a striped shimmer. (3) Blue arc trim outlining both ends of the vault. (4) Black flag on the back-left pod. (5) Crate-and-drum clutter only on the front-left apron, never in the exit lane.
- **MOST COMMON MISTAKE:** Closing the front with a door — the Allied factory's mouth is open and glowing; a shut roll-door makes it read as the barracks or ConYard.

### factory — Soviet War Factory (Collective)
- **SOURCE:** observed in `soviet-war-factory.jpg`
- **SILHOUETTE:** A long low masonry hall with a row of black boiler-pots chained along its flank, red radiator fins on the roof, and a tiny gold onion dome at one corner.
- **MASSING:** 3x3. Dominant: a rectangular stone hall ~0.85·fw x 0.6·fh, walls ~40px, with a shallow-pitched roof carrying a white ridge strip of panels (~8 panels) to ~55px. Front face: a huge dark garage opening ~0.4·fw wide under a red hazard-striped lintel, with a striped ramp apron in front (exit lane — keep clear). Along the left/front wall: a rank of 4 black cylindrical furnace pots (~14px diameter, ~30px tall, domed caps) each with a red panel and a thin smoke pipe. Back-left corner: a gold onion dome ~10px on a small drum tower, total ~65px. Rear: 2 thin chimneys ~70px.
- **PALETTE:** stone khaki `#8a8064` with mortar shadow `#5c5544`; roof ridge panels off-white `#d9d6ca`; red grilles/lintel/flags `#b3242a` (remap); furnace pots iron black `#22232a`; onion dome gold `#c8973a`; ramp stripes red/white `#b3242a`/`#d9d6ca`; pad umber `#4a4236`. PLAYER colour: the roof radiator grilles, door lintel stripes, and wall flag emblem.
- **DETAILS:** (1) The row of four attached black boiler pots with domed lids — the Soviet factory's signature flank. (2) Gold onion dome at the back corner, small but unmistakable. (3) Red angled radiator grilles standing on the roof like fins. (4) Dark gaping vehicle door with red-striped lintel and striped ramp. (5) A red emblem (star/flag motif) centred above the door.
- **MOST COMMON MISTAKE:** Giving it a big glass vault — the Soviet factory is masonry and pots, flat-ish and grounded, the anti-Allied-factory.

### sentry — Allied Pillbox (both factions)
- **SOURCE:** observed in `allied-pillbox.gif`
- **SILHOUETTE:** A low camouflaged mound — sandbag ring, metal drum, dark gun slit, capped by a coloured disc — barely taller than a tank.
- **MASSING:** 1x1 (64x32 diamond). Bottom: an octagonal khaki sandbag/stone skirt covering the whole tile, ~8px tall with lumpy scalloped edge. Middle: a grey-silver drum ~0.6 tile wide, ~8px, carrying a continuous dark horizontal firing-slit band. Top: a shallow domed disc cap ~0.4 tile wide, ~5px. Total ~20-22px — deliberately squat.
- **PALETTE:** sandbag khaki `#8a7f5c` with olive mottle `#5f5a40`; drum steel `#a9adb9` with darker lower rim `#5a5e6a`; slit band near-black `#1c1e24`; cap disc PLAYER colour (this is the main remap surface) with a light specular arc; ground-shadow olive `#3c3a2e`.
- **DETAILS:** (1) The dark slit band all the way round — a tiny barrel stub (~6px) may point at the target. (2) Player-coloured dome cap, the only saturated pixel cluster on it. (3) Scalloped sandbag ring wider than the drum, grounding it. (4) No mast, no antenna — its lowness is the identity.
- **MOST COMMON MISTAKE:** Building it tall — a pillbox taller than ~22px reads as a watchtower; it should look like something you could trip over.

### tesla — Tesla Coil (both factions)
- **SOURCE:** **from knowledge, NOT verified** — `soviet-tesla-coil.jpg` is a photograph of a real-world Tesla coil, not the game sprite. It corroborates only the general form (thin column, bulbous discharge head, arcs).
- **MASSING:** 1x1, tall: a slender dark metal column ~10px diameter rising ~65-70px from a small round stepped base (~0.5 tile, ~6px), in 2-3 stacked segments separated by collar rings; crowned by a mushroom/acorn electrode head ~16px wide with 3-4 short downward prongs. It intentionally overflows the tile upward.
- **PALETTE:** column iron `#33353c` with copper winding hints `#8a5a2e`; collar rings pewter `#8a8e96`; electrode head dark chrome `#565a66` with white-blue specular `#dfe8ff`; arc/spark white-violet `#cfd6ff`; base concrete `#6e6a5e`. PLAYER colour: the collar rings and a small base band; the electric glow stays fixed blue-white.
- **DETAILS:** (1) When charged, jagged arcs crawl around the head — even a static 2-3-fork lightning glyph sells it. (2) Segmented column with visible winding texture on at least one segment. (3) Prongs under the head like a jellyfish fringe. (4) Faint ambient glow halo at the head when powered. (5) Nothing at ground level but the small base — the emptiness around the thin column is part of the silhouette.
- **MOST COMMON MISTAKE:** Thickening the column for "readability" — it must stay needle-thin; the height-to-width extremity is the identifier.

### unit: rifle — GI (Directorate)
- **SOURCE:** observed in `allied-gi.png` (walking figures + deployed-in-sandbags variants)
- **SILHOUETTE:** A small soldier with a bulky vest and helmet holding a rifle level; when deployed, only helmet and gun over a ring of sandbags.
- **MASSING:** ~18px tall standing. Helmet + head ~4px; blue armoured vest torso ~6px (widest part); olive trousers/legs ~6px; boots ~2px. Rifle held horizontal at chest height, ~8px long.
- **PALETTE:** vest and helmet PLAYER blue `#2f5aa0` (remap); face tan `#d8a878`; trousers olive `#4f6136`; boots/rifle near-black `#22242a`.
- **DETAILS:** (1) The blue vest is the biggest colour block — player identity lives on the torso. (2) Olive legs contrast the vest so the figure doesn't become one blob. (3) Rifle carried level across the body, not slung.
- **MOST COMMON MISTAKE:** All-blue soldier — losing the olive lower half makes GI and a blue Conscript indistinguishable.

### unit: conscript — Conscript (Collective)
- **SOURCE:** observed in `soviet-conscript.png`
- **SILHOUETTE:** A soldier in a long tan greatcoat with red-padded shoulders/chest and a grey helmet, rifle held low and level.
- **MASSING:** ~18px tall. Grey-silver helmet ~4px; red chest/shoulder rig ~4px band across the upper torso; tan-brown greatcoat falling straight from chest to below the knee ~8px (the coat makes the lower body a single tapered column); dark boots ~2px. Rifle ~8px, held at waist height.
- **PALETTE:** greatcoat tan-brown `#a08258` with shadow folds `#6e5638`; chest/shoulder rig PLAYER red `#b3242a` (remap); helmet steel grey `#9aa0a8`; boots/rifle near-black `#22242a`; face tan `#d8a878`.
- **DETAILS:** (1) Red shoulders over a tan coat — the inverse colour layout of the GI (colour on top, neutral below). (2) The coat's straight skirt: legs mostly hidden. (3) Grey helmet clearly lighter than the coat.
- **MOST COMMON MISTAKE:** Dressing him in red head-to-toe — the coat must stay tan; only shoulders/chest carry the player red.

### unit: lancer — Grizzly Tank (Directorate)
- **SOURCE:** observed in `allied-grizzly-tank.png` (8-facing sheet)
- **SILHOUETTE:** A short, low, light tank — flat wedge hull, small boxy turret set slightly back, one long thin gun.
- **MASSING:** Hull ~40x22px, height ~10px; light track skirts with 4-5 visible pale road wheels each side. Turret: a small rounded box ~10px wide, centred slightly rear of hull middle, ~6px tall, carrying a thin dark barrel ~16px (about 40% of total length ahead of the hull nose).
- **PALETTE:** hull pale silver-grey `#b9bcc4` with dark navy deck panels `#2b3040`; PLAYER blue patches `#2f5aa0` on the hull side skirt and turret cheek (remap); tracks charcoal `#26282e`; wheels pale `#a9adb9`; barrel near-black `#1c1e24`.
- **DETAILS:** (1) The two-tone hull — light body, dark deck insets. (2) Blue skirt patch on each flank at the hull midline. (3) Barrel thin and long relative to the tiny turret. (4) Low profile: total height clearly under half the sprite's length.
- **MOST COMMON MISTAKE:** Drawing a chunky medium tank — the Grizzly must look one weight-class lighter than the Rhino.

### unit: mammoth — Apocalypse Tank (Collective)
- **SOURCE:** observed in `soviet-apocalypse-tank.png` (8-facing sheet)
- **SILHOUETTE:** A huge double-wide tank with TWO side-by-side cannons and rows of red missile canisters humped on the turret's back.
- **MASSING:** Largest unit: hull ~52x30px, height ~14px, on two broad track units with full-length skirts and a raked dozer-like glacis. Turret: massive, ~60% of hull width, centred, carrying two parallel dark barrels ~18px each (clearly two tubes, with a gap). Rear-top of turret: two racks of red missile canisters (2 rows of 3-4 stubby cylinders, ~3px each) plus a small mast.
- **PALETTE:** hull tan-olive `#8a8058` with dark green-grey top plates `#4c4e42`; PLAYER red on the missile canisters, turret trim stripe, and skirt segments `#b3242a` (remap); tracks iron `#26282e` with pale wheel dots; barrels gun-black `#17181c`; glacis steel `#9aa0a8`.
- **DETAILS:** (1) Twin barrels — never one. (2) The red canister racks on the turret rear. (3) Track skirts nearly touch the ground; almost no wheel visible. (4) It should occupy visibly more footprint than the Rhino side by side. (5) Slight hull overhang past the tracks at front, like a jaw.
- **MOST COMMON MISTAKE:** A scaled-up Rhino with one gun — twin cannons + missile racks are non-negotiable.

### unit: spectre — Prism Tank (Directorate)
- **SOURCE:** observed in `allied-prism-tank.png` (8-facing sheet)
- **SILHOUETTE:** A flat-decked tank with no gun — instead a pedestal mast holding an angled mirror box aimed upward, like a searchlight cannon.
- **MASSING:** Hull ~42x24px, very flat (~8px), dark deck with blue side skirts, tracks with light upper guard. At hull centre: a cylindrical pedestal ~5px diameter, ~8px tall, topped by the prism assembly: a rectangular reflector housing ~12px wide with a curved/arched top edge, tilted up ~30-40°, its face bright mirror-white.
- **PALETTE:** deck dark navy `#262b3a`; skirts PLAYER blue `#2f5aa0` (remap); reflector face white-silver `#e6e9f2` with cyan glint `#bfe6f2`; housing gunmetal `#565a66`; tracks charcoal `#26282e`; hull edge highlights pale `#a9adb9`.
- **DETAILS:** (1) The up-tilted mirror box on a stalk — no barrel anywhere; this absence is the identifier. (2) Reflector face is the brightest surface on any vehicle. (3) Flat panelled deck with visible seam lines. (4) Firing beam is weapon VFX, not baked.
- **MOST COMMON MISTAKE:** Giving it a barrel or making the reflector a radar dish — it's an angled rectangular mirror, not a bowl and not a gun.

### unit: harvester — Chrono Miner (Directorate)
- **SOURCE:** observed in `allied-chrono-miner.png` (8-facing sheet)
- **SILHOUETTE:** A tracked truck that is mostly cargo bin: chrome machinery snout and low blue cab up front, big slatted tan crate-bin behind.
- **MASSING:** ~46x28px. Front third: low cab block in PLAYER blue with a white-chrome angular machinery cluster ahead/around it (piped, ribbed, scoop-like, ~10px tall). Rear two-thirds: a tall rectangular ore bin ~14px high, tan/gold with X-frame slats on the sides like a reinforced crate, flat top. Tracks dark with 4 pale road wheels; slight nose-down stance.
- **PALETTE:** bin tan-gold `#b0955a` with slat shadows `#7a6438`; chrome machinery white-silver `#dfe2ea`; cab PLAYER blue `#2f5aa0` (remap); tracks charcoal `#26282e`; wheels pale `#a9adb9`; small amber lamp dots `#e0a63c`.
- **DETAILS:** (1) The bin dominates — over half the vehicle's length and its tallest point. (2) Chrome piped snout at the front, glinting brighter than the rest. (3) X-braced slat pattern on the bin flanks. (4) Keep other cyan off the body so the teleport VFX reads.
- **MOST COMMON MISTAKE:** Drawing a tank with a box — the cab must be small and low; an armoured/turreted front kills the "truck" read.

### unit: harvester — War Miner (Collective)
- **SOURCE:** observed in `soviet-war-miner.png` (8-facing sheet)
- **SILHOUETTE:** A white-bodied tracked hauler with a red-capped cab and a mining arm up front, hauling the same huge slatted bin behind.
- **MASSING:** ~50x30px — a size class up from the Chrono Miner. Front: angular white/silver wedge cab ~10px tall with a PLAYER-red roof block and a red mining arm/turret stub (~8px) above; a toothed scoop/grinder chin at the nose. Rear: tan/gold slatted ore bin like the Allied one but larger (~16px tall). Heavy dark tracks with 4 big pale road wheels.
- **PALETTE:** cab white-silver `#dfe2ea` with steel shading `#9aa0a8`; roof block and arm PLAYER red `#b3242a` (remap); bin tan-gold `#b0955a` with slat shadows `#7a6438`; tracks charcoal `#26282e`; wheels bright pale `#c4c8d0`; scoop teeth iron `#4a4e56`.
- **DETAILS:** (1) The white cab — unusual among Soviet units and the fastest tell vs the Chrono Miner's blue-and-chrome front. (2) Red arm/gun stub on the cab roof: this miner fights back. (3) Toothed scoop at the nose, angled down. (4) Bigger, chunkier wheels than the Allied miner. (5) Same family-resemblance tan bin so both read as "harvester".
- **MOST COMMON MISTAKE:** Painting the cab red — the body stays white with red accents; a fully red front turns it into a fire truck.

---

### Cross-cutting rules for every builder

1. **Player colour is always trim, never mass.** Bands, skirts, panels, flags,
   cap discs. The largest remap surface on any building should stay under
   ~15% of its pixels (the Tesla Reactor's warning panels and the pillbox cap
   are the ceiling).
2. **Faction material language, consistent across every item.** Directorate =
   silver/white metal, glass, blue trim, rounded vaults. Collective =
   masonry/iron, black stacks, red trim, cones and blocks.
3. **Every production/refining structure has a functional mouth** (factory
   exits, refinery docks). It must sit on a predictable footprint quadrant and
   stay free of greebles.
4. **Tall sprites overflow their diamond** — refinery stacks ~85px, tesla coil
   ~70px. Raise the per-key `head` value so nothing clips.

## 7. Acceptance criteria

The job is done when **all** of these hold:

1. For every item, a side-by-side render sits next to its reference and the
   silhouettes plainly correspond — the shape test, not the colour test.
2. The Soviet set is visibly a *different army*, not a red version of the
   Allied set. At minimum: Tesla Reactor ≠ Allied Power Plant, and the Soviet
   Barracks is a tall block with a soldier statue on top.
3. Player colour is legible on every structure and unit at 1:1 zoom in the
   in-game scene, without dominating the sprite.
4. `./run-tests.sh` passes; no `Math.random`; nothing drawn per frame; no
   sprite clipped by its canvas.
5. Deployed, with the sw VERSION bumped, and the version on the server
   confirmed.

## 8. Pitfalls this project has actually hit

Each of these cost a real debugging cycle. Do not rediscover them.

- **A corner-to-corner roof ridge** turns the near roof plane into a huge
  downward cone. Ridges must run between the midpoints of opposite eaves.
- **Per-axis arrival/extent tests** behave badly in iso; use radial ones.
- **Dithering scattered across a flat surface** reads as dirt, not texture.
  Shade in bands along a real colour ramp.
- **The roof is the plane facing the sky.** If it is the darkest surface in the
  sprite, the whole thing reads as mud.
- **A big concrete apron around a building** makes it read as a board-game
  piece. RA2 buildings fill their plot and sit on a thin platform.
- **Saturating a whole hull or wall in the player colour** is the single most
  repeated mistake in this project's history. RA2 uses it as trim, panels and
  flags over a drab body.
- **Bands and trim drawn at the eaves** get eaten by the roof diamond; inset
  them a couple of pixels.
- **Tracks pushed past ~0.42 of hull width** detach from the hull.
- **A test that renders the headless canvas stub** needs any new ctx method
  added to it in `landing/rts.test.js` (`quadraticCurveTo`, `createLinearGradient`
  were both added this way).

## 9. Quick orientation for a fresh session

```bash
cd /home/junjie/vibe-coding/vibetop
git log --oneline -8            # recent art history
sed -n '1628,1700p' landing/rts.html   # top of bakeBuilding
ls docs/ra2-ref/                # the reference images
cd landing && python3 -m http.server 8099 --bind 127.0.0.1 &
```

Read `CLAUDE.md` for repo conventions (dev on `multi-user`, prod runs from
`/opt/vibetop/app` off `origin/main`, always bump both VERSION strings).

# Iron Frontier (apps/games/rts/rts.html) — standing requirement and roadmap

## The requirement, in the user's words

> "all these matters, all details matter. fix them all! … every detail matters
> for this project, the goal is provide a true ra2 experience"  (2026-09-01)

**Binding for every change to the RTS:** the yardstick is Red Alert 2 itself.
Nothing is "good enough" because it is playable; if RA2 does it and we do not,
or we do it and it does not look, move or behave like RA2, it is a defect. No
detail is below the bar. When a QA agent or a reviewer lists a "nit", it goes
on this list and gets fixed, not filed.

**Open, and the biggest art gap on the field:** units are hard to tell apart on the
map — measured, nine pixels of a Grizzly fall outside a Rhino. Evidence in
`unit-confusability-audit.md` and `unit-identity-reference.md`; the plan is
`unit-redesign-plan.md`. Read the plan's §1 before touching unit art: the fix is
asymmetric (vehicles need colour PLACEMENT, infantry need twice the colour AREA),
and §2 is a gate that voids the rest until it is settled.

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
   decision (primary building, rally points, damage
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
- ☑ War Factories — both re-read at 1:1 against the last frame of the wiki build-up gifs (`allied-war-factory-idle.png` / `soviet-war-factory-idle.png`, sheets in `*-war-factory-buildup.png`), both MIRRORED so the mouth and rails stay on the +gy face (spawn tile `cy + gh/2 + 1`). Allied: navy deck with a khaki kit apron, one long low vault (6 bays, each ONE pane in four strips white → lavender → blue, broad silver hoops with a lit top edge, navy plinth with the `col` stripe and a silver pipe along its foot), bright silver hoop round a lit tan bay with two rails running a tile out of it, low navy wing with a silver girder down the far side, far end = sphere on a navy drum over a plinth, black flag mast, leaning `col` fluke behind and a tall `col` C-fluke with a framed panel to the right, lying silver tank / gear discs / amber tube / handrail on the flank. Soviet: dark-iron hall on cream concrete, 7 white ridge blocks with a silver pipe elbowing behind them to the tower, six thin slotted `col` radiator fins leaning back in two rows (far row over the ridge, near row over the eave) with stand-pipes, pale domed boilers against the wall and `col` slotted machine boxes in front, navy drum tower (silver collar, gold onion, spire) at the +gx/-gy corner beside a pink limestone block, two grey cylinders and the black cauldron with bent exhausts, pink limestone portal round the maw with the leaf (pink frame, navy panel, hammer-and-sickle laid into its plane) swung toward -gx, pale ramp with a `col` kerb, brass rail and long rails. Six idle phases each (`factory` added to the `A.frames` list): Allied hoist bobs, crown lamp blinks, glow breathes, flag ripples; Soviet hook rides, welding flashes in the bay, boiler fireboxes glow in turn, two smoke stacks puff. `pad` 24 / `head` 104 for this key so the rails and flank kit clear the canvas. Aspect 1.32 vs ref 1.42 and 1.20 vs 1.12; owner hue 12.6% / 17.5%, 0% opposing.
- ☑ Barracks — both re-read at 1:1 against the SHP rips (`allied-barracks-idle.png`, a fresh decode of the wiki's `Allied Barrack animation 1.gif`; `soviet-barracks-idle.png` from `Soviet Barracks animation 2.gif`). Allied: the two Quonset huts were rotated 90 deg — their barrels now run along **gy** with the open arch on the +gy face, which is the tile trained infantry step onto (`cy + gh/2 + 1`), and the pair sits side by side across gx with the sprite's 1.2-tile / 0.57-tile echelon; each barrel rebuilt as the sprite's three sections (dark navy office block carrying the green window strips, a white canvas drum proud of the hull banded with three broad `col` straps, a ribbed steel collar inside a fat brass horseshoe over a black cavity with shutter slats and a lit threshold), navy skirt, navy pad kerb, two bright yellow/black hazard plates drawn locally (the shared `apron()` veils its stripes), and a shorter banded watch drum with a silver dome, teal pane and a small navy flag with a cyan device (the sprite's flag carries no house colour). Soviet: the conscript is scaled 1.22x in x (the SHP statue is 0.47 of the apron width, ours was 0.39 — the "statue too small" note was about MASS, not height, which was already 58/42), recast in cool silver with a steel rifle detached at his right; the plinth is now pale limestone braced by tan ledger courses instead of dark earth, its faces carry only a recessed stone plaque with the hammer-and-sickle (the full-height `col` plaque and `col` lintel are gone), and the deck is narrowed to the sprite's 0.55 of the apron with a thick `col` rim frame and three corner slabs instead of four loose crates. Both bake six idle phases (`barracks` added to the `A.frames` list): Allied the flag ripples on two harmonics, the door glow breathes and the window panes light in turn; Soviet the deck floodlight sweeps and breathes, the doorway glows and the base vents steam. Aspect 1.031 vs ref 1.024 and 0.533 vs 0.552; owner hue 14.7% / 13.5% (13.9% / 12.8% as the red owner), 0% opposing on all four.
- ☑ Power plants — both re-read at 1:1 against the SHP rips (`allied-power-plant-idle.png`, a fresh decode of the wiki's `File:Power plant animation 1.gif`, last of 24 frames, RED owner — which is what proves where the remap lives; cross-read against the blue in-game screenshot `allied-power-plant.png` for true colour) and `soviet-tesla-reactor-anim-last.png` (magenta shadow index masked). Allied: the remap moved off five stacked pad bands / a cap disc onto the two surfaces the sprite actually uses — a big curved HOUSE PANEL across the front of each tower's fat dark-navy base DRUM (it was a thin stripe on a gunmetal frustum, then a lampshade cone) and a hairline rim on the base octagon; the drums stand on silver rock plinths on a grey-olive pad instead of a black one; the columns went from magenta-violet with a lava-lamp amber core to cool slate-indigo with a narrow near-white specular and a gold plasma flame that fades at both ends; the dish is now a DEEP tilted bowl (fat dark rim, far inner wall in shadow, hot pool at the near side) instead of a flat gold ellipse; the coil is a dark ringed stack with brass-lit edges and the tie rods splay outward as in the sprite. Soviet: the wall texture was inverted — the lit face is now dusty pink-grey rubble in irregular jittered courses (it was olive-drab vertical fluting with pilasters, reading as a portico) and the shaded face dark olive with two channels; the two masses stopped being identical boxes (tall narrow tower back-left, one chunky wall with a small stepped crown right); the roof warning slabs shrank from whole-roof “pools” to narrow angled bars on a stone kerb; the deck kerb is pale stone rather than a fat `col` band; added the near-riser strut lattice, the grey pipe stub off the tower's left flank, the dark machine framework under the orb and a stone ramp; the orb is a matte mottled grey-white ball with a violet glow ring and a dark belly. Both bake six idle phases (`power` added to the `A.frames` list): Allied the plasma columns breathe out of phase, the coil's brass glow climbs the stack, the dish pool pulses and a transformer lamp blinks on each cap in turn; Soviet the Tesla arcs crawl between the mass tops and the orb (plus one inside it) and the orb's halo pulses. Aspect 0.942 vs ref 0.944 and 1.224 vs 1.202; owner hue 16.2% / 13.7% (15.1% / 13.8% as the red owner), 0% opposing except 0.06% on the red Soviet, which is the blue-white lightning itself.
- ☑ Airforce Command HQ — re-read at 1:1 against a fresh RED-owner MAKE rip (`allied-airforce-command-idle.png`, last of 24 frames, 137x149; contact sheet in `*-buildup.png`). The three light-grey drums became ONE dark slate-navy block on a pale concrete apron: a fat `col` TORUS round the root of a control tower that now has a lit lavender glass cab under a silver lip and a turning silver SCANNER COIL on top (the old flat white solar-panel array on a tilted mast is gone), a face-up dished radar with a sweeping trace lying on the roof, roof vents/kit boxes/eave rail, a wide silver-ribbed drum with a low `col` band and a navy collar dish of instrument rods at the left shoulder, a short drum with a `col` vertical stripe at the front, and two stout whip masts on the right shoulder; the loose crates, drums and floodlights are gone. The helipad was CLIPPED by the sprite canvas (`pad` is 24 for this key now) and is rebuilt as the sprite draws it: pale concrete under a broad bright aviation-yellow cross, four `col` double diamonds over olive fields with dark blades and a scorched tan centre — each laid out FROM `PAD_SLOTS`, so the four Harrier park spots land dead centre of their markings — plus eight rim bollards and a corner lamp that blinks in turn. Six idle phases (`airforce` added to the `A.frames` list): the coil turns, the roof dish sweeps, the cab panes and the pad lamps light in turn. Aspect 0.953 vs ref 0.919; owner hue 13.0% red / 13.4% blue, 0% opposing.
- ☑ Soviet Radar Tower — re-read at 1:1 against a fresh RED-owner MAKE rip (`soviet-radar-tower-idle.png`, last of 29 frames, 90x125). The dish grew from 0.52 to 0.69 of the sprite width and its shading was INVERTED to match the sprite — dark navy band across the top, pale panelled silver below, fine panel grain, two concentric arcs and five heavy navy ribs including the thin feed mast that runs through the hub and out past the bottom rim (the painted-on feed-horn tripod is gone); the hub is a small matte dome with a `col` CRESCENT on its left. The long clean mast became a tapering navy trunnion with stringers, the back-shell disc now genuinely protrudes down-right, the crisp khaki prism with its `col` cornice became an irregular MOTTLED CAMO MOUND with no house paint at all, the collar is a fat 8-segment red-and-white life-ring sunk into the roof (was 14 thin floating bands), the four thin splayed legs became three chunky `col` WEDGE BLOCKS with lit top plates and dark grate strips, and the pale concrete ramp and the roof machinery were added; the big striped raft is down to a scuffed dirt patch. Six idle phases (`radar` added to `A.frames`): the whole face turns — ribs, arcs and specular together — and the roof beacon blinks. Aspect 0.679 vs ref 0.720; owner hue 13.0% both colours, 0% opposing.
- ☑ Service Depot (Directorate) — re-read at 1:1 against `allied-service-depot-idle.png` (last frame of the wiki `Allied Service depot animation.gif`, RED owner). The fabricated house-colour ring painted on the pad and the grey lattice crane are gone; the pad is now the sprite's dark diamond GRATING under a fat amber kerb of 24 chasing lamps, ringed by an oil-mottled apron, with four house clamp wedges on silver arms reaching in from the rim (each with its own blinking lamp). The works is the sprite's navy hull carrying ONE fat yellow gantry beam plus a thinner parallel rail, a silver projector head that slides along it and welds, a big house block at the beam's foot and a second house machine box at its head, a ribbed silver scoop on the far corner, a row of silver rollers along the hull and the big silver C guide-rail over the back of the pad. The pad is re-centred on the FOOTPRINT centre so a vehicle parked for repair lands on the grating (see `docs/design-decisions.md`). Six idle phases (`depot` added to the `A.frames` list); `head` 88. Aspect 1.538 vs ref 1.609; owner hue 12.8% / 13.0%, 0% opposing.
- ☑ Service Depot (Collective) — re-read at 1:1 against `soviet-service-depot-idle.png` (RED owner) plus the in-game shot. The house-painted mast and the house counterweight are gone: the mast is a BLACK X-braced lattice tower with the house machine house and a dark operator cab at its head, and the jib is a black lattice boom with stay cables, a dark counterweight and a house hook that rides up and down. The works sits on a bold house-red PIPE frame with corner stanchions, the brick block is bigger with real courses, a red chevron band on its upper face and a silver girder deck across its front, the boiler is the sprite's pale olive tank on a black cradle with a squat house pot beside it, and the black stack smokes. The pad's loose dashes became four chunky yellow/black hazard BARS with inward arrow heads round a clean parking plate, re-centred on the footprint centre. Six idle phases. Aspect 1.162 vs ref 1.088; owner hue 11.8% / 12.0%, 0% opposing.
- ☑ Battle Lab (Directorate) — re-read at 1:1 against `allied-battle-lab-idle.png` (118x213, RED owner — which is what proved the remap is the mast COILS, a strip down the spine and the stepped block at its foot, not a ground plinth). The two silos standing on the deck became panelled BARRELS hung off a narrow navy spine, each with the sprite's curved underside (the right one on a ribbed pedestal), coarse 3x5 barrel-shaded plates instead of a fine brick grid, a pale collar with rail posts and a shallow dark cap with one sweeping specular; the spine is drawn between them so its house strip reads and stops at the dome tops; added the white-outlined badge shield hanging off the spine at mid height, the arched grey service duct down the near face, and the sprite's deck — near-black with a pale skid, a house-rimmed circular hatch, a tan plank and two small masts. Five ball-tipped whips, two wearing house coils. Six idle phases: a charge climbs each coil, the domes' glass sheen sweeps, the mast tips blink, the hatch ring pulses and the coils arc across. `head` 152 for this key so the antenna thicket clears the canvas. Aspect 0.553 vs ref 0.554; owner hue 15.1% / 14.0%, 0% opposing except 0.10% on the red owner, which is the blue-white arc itself.
- ☑ Battle Lab (Collective) — re-read at 1:1 against `soviet-battle-lab-idle.png` (RED owner). The floating hula-hoop rings became FAT bands hugging each tier; every window lost its full house frame and is now an arched, recessed opening with a lit sill and just one red lintel bar per face; added the arcaded tier (dark columns with a reactor drum turning behind them in a breathing gold glow), the pale pink buttress blocks at the near corners with a squat house pod at each foot, string courses and a lit/shaded stone split, and a wide pale stone slab in place of the dark platform; the stray turret drawn in front of the drum is gone (three roof-corner turrets remain, black onion caps on brass spires) and the spire now carries the sprite's cross bar. Six idle phases: arcade glow breathes, the reactor turns, the gold dome's highlight sweeps, the finials glint, the pods pulse and a base vent steams. Aspect 0.841 vs ref 0.886; owner hue 17.1% / 17.6%, 0% opposing.
- ☑ Ore Purifier — re-read at 1:1 against the RED-owner MAKE rip (`allied-ore-purifier-anim-last.png`, last frame, 127x105 once the magenta shadow index is masked), every band placed from a measured row of that sprite scaled 1.067 about the mound's widest row. The clean grey ellipse "plate" became a rough olive SPOIL MOUND with a chunky broken rim and banded spoil; the two candy-striped `col` sausages with white pill sleeves became ONE fat slate CONDUIT BELT round the mound (two concentric hoops read as a ring-toss) with white specular runs on its front quarters and its lowest run half-buried in the spoil, plus two house ELBOWS rearing up the drum's flanks with bolted flanges and a fat red-white-red CLAMP down the drum's right front into the mound; the stack was rebuilt as the sprite's wedding cake — a broad vertically FLUTED drum with ring courses, a thin torus of GLOWING MOLTEN ORE on its shoulder with dark slots inside it (was a 13px lit band that read as a corn cob), a darker ore-crusted cone with a scalloped hem inside that ring, a house collar, a taller gunmetal neck carrying the sprite's black star, and a scallop-rimmed chute with a black bore. Every cool tone is held under HSV s=0.40 (the sprite's fixed navy conduit would paint blue onto a red owner). Six idle phases (`purifier` added to the `A.frames` list): the molten slots turn like a centrifuge, the glow breathes, the chute throat flares and the two pad lamps blink. Aspect 1.198 vs ref 1.21; owner hue 16.7% red / 17.1% blue, 0% opposing.
- ☑ Nuclear Reactor — re-read at 1:1 against the in-game shot (`soviet-nuclear-reactor.png`, building 169x124) cross-read against the snow-theatre shot (`soviet-nuclear-reactor-ingame.png`, the one that shows the GREEN core light in every rim and between the skirt vents); no clean SHP rip exists — the wiki's `File:RA2 Nuclear Reactor.gif` is the same screenshot. The three straight `coolTower` frustums (cement silos) were replaced by a local hyperboloid profile `r(u) = rw + (rb-rw)(1-u)³ + (rt-rw)u³` sampled into the silhouette, the courses, the mottle and the vents, so each tower now has the sprite's hard WAIST at ~0.55 of its foot radius, a flared skirt of black VENTS between pale ribs, one dashed house cable and two grey twins on its face, and a flared rim with a dark mouth, a lit far wall and a green core. The bright bands painted down every tower are gone: `col` now sits on the vessel, one thin cable per tower, a dark front kerb on each plinth, the caisson band and the rim beacons. The vessel grew into the sprite's real barrel — six stacked dark rings under four house bands with cream separators — the ducts were darkened, thickened and re-aimed so they arc high out of the crown and dive into each tower, the parade-concrete diamond was cut back to bare hardstanding plus small plinths and a poured pad, and the caisson became the sprite's pale instrument machine on dark legs. Six idle phases (`reactor` added to the `A.frames` list): steam rolls off the two near rims, the core glow pulses in the rims, the vent gaps and the crown, and the rim beacons blink. Aspect 1.238 vs ref 1.31; owner hue 11.5% red / 11.4% blue, 0% opposing — the real sprite reads 8.2%, so this sits deliberately at the bottom of the 12-18% house band rather than painting the brick.
- ☑ Pillbox (Directorate) — re-read at 1:1 against a fresh RED-owner MAKE rip (`allied-pillbox-anim-last.png`, last of 7 frames, 48x29). The sprite's values were inverted here: the pale sand mound is now a DARK earth-and-sandbag mound in three courses (the top one a near-black navy collar), the grey saucer a genuinely BRIGHT silver-white plate with a dark rim ring and rivets, and the small domed lens a fat FLAT house disc lying in the plate — the only saturated pixels on the sprite. The three house slit-bands round a drum the sprite has not got, and the barrel stub poking out of it, are gone; the firing aperture is a dark notch cut low in the collar. Six idle phases: the slit flares, a highlight crosses the plate, the lens glints. Aspect 1.659 vs ref 1.655; owner hue 13.0% red / 13.7% blue, 0% opposing.
- ☑ Sentry Gun (Collective) — re-read at 1:1 against a fresh RED-owner MAKE rip (`soviet-sentry-gun-anim-last.png`, last of 11 frames, 41x40). It was the wrong machine: a closed armoured drum on a black diamond pad with one near-horizontal gun and an optic mast, 17% too wide. It is now the sprite's OPEN mount — four dark navy legs splayed to pale foot pads off a small receiver, a brass ammo drum on the right shoulder, a pair of bright house-coloured sloped ammo cheeks, and TWO long thin pale olive barrels with cooling bands raised ~62°, which are the top of the silhouette. Six idle phases: the pair slews on its trunnion and the muzzles flare. Aspect 0.971 vs ref 1.025; owner hue 14.5% / 12.7%, 0% opposing.
- ☑ Prism Tower (Directorate) — re-read at 1:1 against the SHP rip (`allied-prism-tower-anim-last.png`, 53x101, magenta shadow masked). The body's value was inverted: the pale silver frustum "lampshade" with three claws lying on the ground is now a DARK NAVY drum on an olive-khaki disc, wearing ONE big house panel with a recessed lit slot and a house wedge braced at each shoulder; the column is slim navy laced by four thin blue struts on blinking amber bolts; under the crown a dark house band and a rounded slate CAPSULE with a charge glow. The crown is the sprite's WIDE FLAT umbrella — nine dark navy blades with silver ribs and a white X at the hub — not a narrow upright white fan. Six idle phases: the crown turns a ninth of a turn, the capsule breathes, the slot lights, the bolts blink. The prism beam now leaves the crown (shot origin -58 → -86). Aspect 0.548 vs ref 0.525; owner hue 12.5% / 12.8%, 0% opposing except 0.4% on the red owner (strut-shadow blends over the navy).
- ☑ Tesla Coil (Collective) — re-read at 1:1 against a fresh RED-owner rip (`soviet-tesla-coil-idle.png`, last frame of the wiki's `Tesla coil animation 2.gif`, 41x82). The massing was right; the detail was not: the pylons were fat flat slabs stopping a quarter of the way up and are now narrower posts reaching 45% of the height with a lit cheek, a shadowed cheek and a cut top; the helix went from a dim thread on a black pipe to a fat bright silver winding of six turns; the plant between the legs is pale instead of mud grey; and the electrode sits on a short collar instead of floating on a spindle. Six idle phases: the arcs crawl up the winding and one licks the sphere while its halo breathes. The Tesla bolt now leaves the electrode (shot origin -62 → -104). Aspect 0.482 vs ref 0.500; owner hue 16.1% / 16.6%, 0% opposing (see `docs/design-decisions.md` — the sprite's own buttresses are far past our 18% ceiling, so the turned faces are desaturated).
- ☑ Patriot Missile System (Directorate) — re-read at 1:1 against `allied-patriot-anim-last.png` (44x55, magenta shadow masked — the sprite is TALLER than wide, ours was 40% too wide). The wide low silver saucer with a little tilted box and four dots on its lid is gone: the launcher IS the building — a fat bright house TORUS round the foot of a small bright white dome, and on it a dark navy block of FOUR chunky tubes with big dark silver-rimmed mouths, strapped with one broad house band, plus a radar cap with a blinking lamp. The front tube mouths sit at -46 so `launch: 34` (drawn at -10-launch) puts the missile at the tubes. Six idle phases: the block traverses and tilts, the lamp blinks. Aspect 0.859 vs ref 0.800; owner hue 17.4% / 15.3%, 0% opposing.
- ☑ Flak Cannon (Collective) — re-read at 1:1 against `soviet-flak-cannon-anim-last.png` (53x68, magenta shadow masked). The leg span came in from ±36 to ±26 and the barrel from 45° to ~71°, which took the aspect from +44% to exact; the house colour moved off a crew shield and four foot pads onto the sprite's bright angular MOUNT block at the barrel's foot plus two leg pads, and the plain dark sleeve became a pale banded tube with a ladder of cooling rings and a dark muzzle brake, with a brass ammo feed and a lit round beside the mount. Six idle phases: the barrel slews and the loaded round glints. Aspect 0.779 vs ref 0.779; owner hue 15.3% / 15.0%, 0% opposing.
- ☑ **Infantry, all nine** — every kind re-measured against its RED-owner SHP rip in `docs/ra2-ref/` (`allied-guardian-gi-anim.png`, `soviet-flak-trooper-anim.png`, `engineer-anim.png`, `soviet-tesla-trooper-anim.png`, `soviet-crazy-ivan-anim.png`, `allied-rocketeer-anim.png`, frame 0 of `soviet-conscript-anim.gif`, plus a fresh `allied-tanya-idle.png` decoded from the wiki's `Tanya animation.gif`). The hue census was already in band; every defect was SHAPE. Three global moves fixed most of it: the whole figure is now squeezed on x about the ground anchor (one extra `g.scale(0.90, 1)` inside `bakeInfantry`, so torso, arms, weapon and shadow narrow together and nothing drifts off the anchor), `USC_I` dropped 1.30 → 1.22, and `helmet()` lost a third of its band and brim so a face still reads under the dome. Then per kind (aspect / owner-hue blue / red, before → after):
  - GI (`rifle`) — helmet r 4.0 → 3.15 and lifted, chest plate pulled in off the ribs, rifle lengthened across the body so the wedge silhouette survives the narrowing. 0.500 → 0.485; 17.6/22.2% → 17.4/20.3%.
  - Conscript — steel pot r 4.0 → 3.15, scarf cut from a chest-wide slab to the collar-and-shoulder mass the sprite actually paints, longer legs. 0.556 → 0.515; 11.8/13.6% → 12.9/14.7%.
  - Guardian GI (`rocket`) — the missile tube spanned the body plus 60%; it is 17% shorter with a smaller amber warhead, and the helmet + visor came down a size. 0.676 → 0.576 (ref 0.500); 19.8/19.4% → 14.8/15.0%.
  - Flak Trooper — barrel thinned 4.0 → 3.4 with a smaller muzzle brake and receiver, the gold shell drum halved (it read as a bell at the belt), vest pulled off the shoulders. 0.605 → 0.529; 11.6/12.5% → 13.8/14.5%.
  - Engineer — hard hat r 4.0 → 2.95 with a shorter crest, soft cap re-cut to match, toolbox 7.0 → 5.2 wide (it was as wide as his shoulders). 0.600 → 0.531; 17.6/18.0% → 18.1/18.3%.
  - Tanya — the hair was a brown bowl down to the chin; crown r 3.9 → 3.0, lifted, side locks narrowed so the bare face reads. 0.571 → 0.516; 14.7/17.2% → 17.9/18.5%.
  - Tesla Trooper — the steel pauldrons swallowed the helmet: caps 2.5 → 2.0, shoulders dropped 0.8px, bowl r 4.6 → 3.6 and raised 1.3px onto a fatter collar ring, carapace widened so the SUIT still reads. 0.605 → 0.543 (ref 0.759, but that rip is a firing frame with the arm out); 13.6/13.4% → 17.8/19.1%.
  - Crazy Ivan — ushanka crown r 3.5 → 2.8 lifted off the brow with shorter flaps, beard cut back and the eyes re-seated, dynamite bundle down from a beer crate to three 1.35px sticks. 0.629 → 0.562; 16.0/17.1% → 14.3/14.6%.
  - Rocketeer — the two pack tanks stood level with his head and he read as a mech; they are narrower, shorter and dropped behind the shoulders, the chest plate is pulled in and the dome comes clear above them. 0.595 → 0.545; 13.8/12.5% → 13.0/12.7%.
  - **Deployed GI** — the placeholder ring of 20 bags around the tile (drawn UNDER him, and double-scaled by `zoom`) is replaced by `bakeSandbags(col)`, baked once per owner on the infantry sheet and anchor: a three-course khaki parapet on the FRONT arc only, with an owner-colour stripe painted along the crest. `drawUnit` drops the trooper 9px and draws the wall OVER him, so he reads as dug in with the rifle across the top.
- ☑ Grizzly Tank (`lancer`) — re-read at 1:1 against the SE facing of `allied-grizzly-tank.png`. The three-segment house-colour skirt (a row of bus windows at 1:1) became ONE unbroken band a flank with a lit forward lip, carried round the glacis and closed by a darker tail plate; the fully-coloured turret cheeks became one small remap panel set back from the mantlet; deck/ring/track/chassis all came down (`RING` 8.4→7.4, chassis 4.4→3.8, track 3.8→3.4) and the near-white deck plate dropped to shade 1.08; the gun went thin and dark (w 1.5/0.85 → 1.20/0.70) and the road wheels were given a pale cap so the track reads as a run, not a black bar. Aspect 1.50 → **1.62** vs ref 1.62; owner hue 27.1% → **22.5%** (13.8% as red), 0% opposing.
- ☑ Rhino Tank (`rhino`) — re-read against `soviet-rhino-tank.png`. It carried remap in TWO rows down each flank plus bulged coloured cheeks and stood at 33.7% house colour, half again over any other unit: one continuous band now, the cheeks went back to hull value, the turret face plate shrank, and the gun became the sheet's stubby 120mm (17.5→15.5 long, 2.05→1.60 thick). `ACCENT.rhino` was navy `#39415a` — an OPPOSING hue on a Soviet tank, 4.4% of the sprite — now neutral `#2b2f36`. `RING` 9.4→8.4, chassis 5.8→5.0. Aspect 1.49 → **1.59** vs ref 1.57; owner hue 33.7% → **16.8%** (12.2% as red), opposing 4.4% → **0%**.
- ☑ Apocalypse Tank (`mammoth`) — re-read against `soviet-apocalypse-tank.png`. It was the worst proportion on the field (1.21 against the sheet's 1.41): `RING` 12.6→10.8, chassis 7.6→6.6, turret prism 7.4→6.2, mast −15.5→−12.4 and the canisters shortened, ~8px of height gone while `len` went 33→34. The segmented colour band and the turret trim strips collapsed into one unbroken skirt band, and the twin barrels now reach the sheet's length and taper (17.0→19.5 long, 1.75/1.0 → 1.35/0.80) so they read as the longest thing on the field rather than exhaust stubs. Aspect 1.21 → **1.42** vs ref 1.41; owner hue 24.7% → **17.8%** (13.1% as red), 0% opposing.
- ☑ Mirage Tank (`mirage`) — re-read against `allied-mirage-tank.png`. It was too long and too flat (1.57 against 1.36): `len` 30→24 and the emitter core grew 7.0→8.8 tall. The four-plate stack of full-white slabs out-shouted every other unit; it is three plates now, only the TOP one in `ACCENT.mirage` and the two below at shade 0.50/0.64, so the housing reads as a shell with one bright mouth. Flank band lifted clear of the track, cowl pulled in, stub gun thinned. Aspect 1.57 → **1.41** vs ref 1.36; owner hue 24.1% → **19.4%** (12.3% as red), 0% opposing. NOT matched: RA2's idle tree disguise — `bakeVehicle` has no unit state, so it would need a second baked frame plus a `drawUnit` branch on idle.
- ☑ Tesla Tank (`teslatank`) — re-read against `soviet-tesla-tank.png`. The full-height house-colour core block standing between the two coils was the largest single mass on the tank: it is hull value now with a colour CAP on top, the flank went to one band lifted clear of the track, and the hull/track came down 0.6px each. The five-ring coil columns and the arc across the pair are unchanged — they are the identity. Aspect 1.45 → **1.52** vs ref 1.50; owner hue 26.4% → **19.9%** (13.0% as red), 0% opposing.
- ☑ V3 Rocket Launcher (`v3`) — re-read against `soviet-v3-launcher.png`. The rocket carried three separate colour bands (motor skirt, midbody ring, nose) and read as a candy stripe at 1:1; the sheet's missile is WHITE with a red nose and red fins and nothing else, so the midbody ring is gone, the nose cone is longer and the tail fins wider. Truck, rail and six wheels unchanged — the aspect was already right. Aspect 1.27 → **1.24** vs ref 1.28; owner hue 24.6% → **21.9%** (16.3% as red), 0% opposing (one stray pixel of blue in the cab glass at the red owner).
- ☑ **Light vehicles and aircraft, all eight** — each re-measured at the down-right facing against its RA2 sheet (aspect ours vs ref; owner hue blue/red, 0% opposing throughout unless noted). `allied-ifv-idle.png` was fetched for this pass (wiki `File:CNCRA2 IFV Default.png`); the rest were already on disk.
  - Chrono Miner — was a bright chrome-and-pale-blue toy truck: the body is now near-black charcoal with ONE tall house band across the cab and a **violet** ribbed nose drum (the sprite's chrono cluster is the whole nose, not a badge on the flank), the tan bin cut from 45% to ~28% of the length, chrome tracks darkened, the cyan windscreen replaced by neutral glass. 1.35 → 1.34 (ref 1.15); 20.2/14.8% → 14.9/12.0%.
  - War Miner — a third oversized: bin 17x15x12.4 → 12.8x12.4x10.2, boom reach and white fore-chassis pulled in, the house drum thickened so the shoulder still carries the colour. 1.22 → 1.29 (ref 1.17); 17.6/14.0% → 18.4/14.8%.
  - IFV — the proportion was inverted (the RA2 sprite is nearly SQUARE): `len` 26 → 21, tyres 2.6 → 3.0, the six forward-reaching tubes became a TALL boxy launcher housing with short steep muzzles, and the owner colour moved off two full-length flank stripes onto the turret, its ring and the cab roof. 1.32 → 1.12 (ref 0.98); 21.7/15.2% → 14.6/11.4%.
  - Flak Track — the sheet's vehicle is cream with red fittings: body lightened, the red bed slab and the long flank band cut back, and the gun rebuilt as a squat house-colour turret cone with a SHORT dark barrel and a small shield instead of a pale steel jib as long as the hull. 1.17 → 1.13 (ref 1.05); 20.7/19.9% → 15.5/11.1%.
  - Terror Drone — 2.4x too big for the fleet and reading as a barrel on stilts: `len`/`wid` 14x12 → 9x8, leg span more than halved, body pucks a third of their radius, and the four wire legs are now BROAD tapered blades as in the sprite. 1.50 → 1.53 (ref 1.64), 45x30 → 26x17 px; 18.1/15.4% → 16.3/10.5%.
  - Harrier — the wing was a sliver on a fat fuselage: fuselage 24x2.6 → 23x2.35 and the wings rebuilt as a broad swept delta (span 10.5 → 11.4, longer root chord), missiles tucked in under them, nose cone and fin shortened. 1.39 → 1.45 (ref 1.34); 21.2/19.9% → 22.6/15.9%.
  - Kirov — the **shark mouth was missing entirely** and is now painted on the nose belly (dark maw, six teeth, one eye), the envelope slimmed to the sheet's cigar (68x10.4 from 64x11.5) and belted with three HEAVY dark structural hoops, the tail rebuilt as a busy red cluster (two outrigger pods, a spine pod, struts) and the gondola given its catwalk rails. 1.38 → 1.43 (ref 1.50); 19.2/17.8% → 22.0/21.2%.
  - Prism Tank look (`spectre`) — `len` 30 → 26 / `wid` 17 → 18, the six house dominoes down each flank replaced by ONE solid owner plate under the sprite's pale track-guard stripe, and the thin mast with a small cantilevered head became a low box turret carrying a TALL upright prism block; the fixed cyan core now takes the owner's hue so a red player's tank has no blue on it. 1.48 → 1.33 (ref 1.30); 18.2/15.6% → 14.9/11.2% (0.5% opposing on red — the near-white emitter face).
- ☑ **`aspect.py` was measuring the wrong thing, and the "far out" list was mostly an artefact of it** (art pass 9). Two opaque things in `docs/ra2-ref/` are not the sprite: the palette's SHADOW INDEX, a magenta `(153,0,153)` blob sprawling off the lower right of every clean SHP rip, and the two Construction Yard grabs, which are in-game gif frames on a solid BLUE key (and the `-idle-last` frames the table pointed at are the *last* frame of the idle loop — a puff of smoke for the Allied yard, an entirely empty field for the Soviet one). The alpha bbox therefore measured the shadow's width, or the whole canvas. `aspect()` now masks transparency, the gif blue key and the shadow index, and the two yard entries point at `-idle.png`. Re-measured, six of the eight structures listed as "far out" were already inside ±8%:

  | structure | recorded | true (fixed tool) | now |
  |---|---|---|---|
  | `dir:base` | +25.7% | **+1.6%** (ref 1.555, not 1.257) | 1.580 / +1.6% |
  | `col:base` | −11.2% | **+0.5%** (ref 1.333, not 1.509) | 1.340 / +0.5% |
  | `dir:lab` | −39.9% | +8.0% (ref 0.554, not 0.995) | **0.536 / −3.3%** |
  | `col:lab` | −11.9% | +11.4% (ref 0.886, not 1.126) | **0.827 / −6.6%** |
  | `col:radar` | −41.5% | **−5.7%** (ref 0.720, not 1.160) | 0.679 / −5.7% |
  | `col:barracks` | −48.0% | **−3.6%** (ref 0.552, not 1.025) | 0.533 / −3.6% |
  | `dir:power` | −20.1% | **−0.1%** (ref 0.944) | 0.942 / −0.1% |
  | `col:power` | −11.4% | **+6.6%** (ref 1.202, not 1.447) | 1.281 / +6.6% |
  | `col:factory` | +11.3% | +14.2% (ref 1.096, not 1.124) | **1.085 / −1.0%** |

  The three that were genuinely out (`col:factory`, `col:lab`, `dir:lab`) are fixed by making `VPOW` faction-aware — `VPOW['factory:col'] = 1` and `VPOW.lab = 1`, i.e. their vertical mass follows the plot in full rather than by its square root. `factory` is the entry that forced the per-faction split: the Soviet hall was 14% too flat at the square root while the Allied vault is already 7% too tall. The Soviet exit ramp runs well past the plot's S corner and grows with `VS`, so `factory`'s `pad` goes 24 → 34; nothing in the set clips. Whole set after: **every structure with a usable reference inside ±8% except `dir:grandcannon` (+14.6%) and `dir:gapgen` (−8.4%)**, both of which sit at `VS = 1` (their plots did not grow) and so needed a real redraw, not a rescale. Done in the Grand Cannon / Gap Generator entry below: **`dir:grandcannon` +14.6% → +1.3%** and **`dir:gapgen` −8.4% → −2.8%**, so the whole set with a usable reference is now inside ±8%.
- ☑ Playtest pass-3 art nits (art pass 9): the **Attack Dog** read as an orange fox and is now a German Shepherd — black saddle (the breed's own marking; the house colour moved off the coat onto a broad collar and a harness strap over the withers), deeper barrel (`H` 3.0 → 3.7), long black-masked blocky muzzle, wedge head, and a sabre tail hanging below the hocks instead of a bushy one carried level. **Civilian blocks** cast a ground shadow again (it was drawn at 27×10 under the block's own base, so every civilian building on the board was the one thing standing on the pavement without one) and their status/garrison bars hang over the building's MASS rather than off a two-pixel radio mast forty pixels above the roof (`artTopSolid`, a new `A.mass` beside `A.rise`, used by structures too). The **map apron** no longer stripes: it dimmed in 8 bands (an 0.11 alpha step) on a Chebyshev distance, whose square rings project to long straight diagonals — now 32 bands on a smoothstep over a Euclidean distance, ending at the cleared background. The **placement wash** is RA2's cell grid, not a colour bath: one path, a 0.055 fill and a 0.32 edge instead of a flat 0.16 green over half the screen. The **front menu** hides the live sidebar (`body.atmenu`, keyed off `state === 'menu'` so every in-match `showCard` still shows the HUD behind it).
- ☑ **Chokepoint Pass has elevation** (art pass 9). Its ridge runs corner to corner with open field on both sides, so nothing is ever enclosed, nothing but the wall itself is level 1, and the two passes — whose only high neighbour IS the wall — found no uphill end, fell into `computeHeight`'s "a ramp that climbs nothing" case and stayed dead flat: the ridge on the map named for it was scenery you walked straight through. A T_CLIFF is high ground by definition (`hi[]` is seeded from it) but was skipped as a seed for the uphill BFS; it now seeds it, so each pass climbs out of the field, crests inside the band and drops down the far side, drawn with the ramp kerbs and risers instead of the flat cutting tile. Passability is untouched — `hf` is read only by `hPx`/`sy`, i.e. by where a thing is DRAWN, never by the movement grid — and the terrain builder is unchanged, so the map design is the same map. The crest reaches ~0.3 of a level: the notch is three cells thick, and its centre is two cells from open field and five from the nearest cliff, so that is what interpolating between them gives.
- ☑ Grand Cannon + Gap Generator — the last two structures outside ±8%, both
  re-read at 1:1 against their in-game renders. **Grand Cannon** ([GTGCAN],
  `allied-grand-cannon.png`, 181x133): the previous pass had it exactly the
  wrong way round — a low drum on a parade slab with a forty-pixel barbette
  gun, so nearly all of the sprite was barrel. The real French emplacement is
  a fat rounded ARMOURED DOME (44 high on a 22 radius, welded plate with two
  seams) standing on a splayed steel turntable whose four outrigger arms end
  in round pads with a bright boss, and the gun out of its shoulder is SHORT
  and thick (25 long) with three baffle fins and a fat muzzle brake. House
  colour moved off the whole left flank onto what the sprite actually paints:
  one cheek plate, a bowed band round the dome's foot (drawn as an ellipse
  whose top arc IS the band edge, so it wraps the front instead of ringing the
  far side), the rim round the race and the gun's plating. The old octagonal
  apron and four bollards are gone. Aspect 1.379 vs ref 1.361; owner hue
  13.9%, 0% opposing. **Gap Generator** ([GAGAP], `allied-gap-generator.png`,
  118x130, GREEN owner — which is what proves the remap is the two COLLAR
  RINGS and nothing else): rebuilt as the sprite's stack — a mound of five fat
  pale spheres lobed round the foot with a warm gold sheen across each
  shoulder and a pale cap closing them into one body, the lower house collar,
  a WAISTED grey column with two shallow seams, the upper house collar, a
  white disc platform with four navy instrument pods stood round its rim, and
  out of its centre a short black mast faced in gold inside a crown of four
  tall black talons. The old three loose pods on a slab, ten thin spines and
  a bowl are gone, and `gapgen` joins the `A.frames` list so its six idle
  phases actually cycle (art.ini [GAGAP] `ActiveAnim=GAGAP_A`): the talons
  breathe, the gold mast face flickers, the pod lamps light in turn and a ring
  of field lifts off the tips. Aspect 0.882 vs ref 0.908; owner hue 14.9%, 0%
  opposing.
- ☑ 2026-09-03 The leftovers, audited rather than assumed. The six base
  defences (Pillbox, Sentry Gun, Tesla Coil, Prism Tower, Patriot, Flak
  Cannon) turned out to have been rebuilt against real sprites back in the
  defence pass and merely never REGISTERED in `aspect.py`'s `REF`, so they had
  gone two months unmeasured; all six are now in the map and all six pass
  (+0.2 / −5.3 / −3.6 / +4.4 / +7.4 / −0.0%). What was genuinely still a
  placeholder was the **walls and gates**, drawn as a flat cross of precast
  slabs for both houses with the owner's colour at 0.9%. Both rebuilt from the
  real SHP rips off the C&C wiki (`allied-wall.png` frame 0 of
  `Allied_Fortress_Walls_animation.gif`, 42x43; `soviet-wall.png` frame 0 of
  `Soviet_Fortress_Walls_animation.gif`, 35x38 — the file that was already
  here as "the Soviet wall" was Yuri's citadel wall, and the run photos
  `allied-wall-scene.jpg` / `soviet-wall-scene.jpg` show how a run links):
  **Directorate** — a stepped SANDBAG plinth under a stone collar, an
  octagonal post in the owner's colour and, in a silver crown rim, a glass
  dome; neighbours joined by a narrow precast curtain wall. **Collective** —
  a heaped mound of RUBBLE with an iron cap block, a steel lid and two
  steel-tipped stakes leaning out of it; a run reads as a rampart of piled
  stone. Aspect +2.4% and +0.4%; owner hue 14.9% / 11.4% with 0% opposing.
  The **gate** follows each faction's wall: a pier at each end built like that
  faction's post, and two BARRED leaves that slide apart (the old leaves lay
  flat on the ground like planks), red pier lamps that go green as it opens.
  `aspect.py` also stopped pointing at four filenames that were not on disk —
  a missing reference is skipped in SILENCE, which is how `col:reactor` hid
  standing 12.1% too tall for its 2x3 plot; it is measured now (−5.5%) after a
  `VPOW` fix, and the three with no usable wiki asset are listed by name with
  the reason.

### C3 — vehicle colour PLACEMENT (`unit-redesign-plan.md` §3)

Art pass 8 collapsed every vehicle's house colour into one unbroken flank band
and put the turret cheeks back to hull value. Measured against the sprites that
fixed a real symptom the wrong way round: **the totals were fine, the placement
was not.** Our vehicles already sit inside RA2's 11.5–27% remap range, and
`unit-identity-reference.md` §1.4 is blunt about the rest — RA2 never paints an
unbroken band. It paints **2–5 discrete blocks sited ON the identity feature**,
because two plates with a gap are *countable* and a stripe carries no shape at
all (Rule 7). So this pass moves paint; it does not add any.

Owner-hue percentages below are body-pixel censuses over all 8 bearings at
zoom 1, blue owner / red owner, by `unit-identity-reference.md` §0's rule
(s > 0.40, hue within ±22° of the owner). They are a different measurement from
the single-facing numbers in the art-pass-8 entries above, so compare them only
with each other.

- ☑ Grizzly (`lancer`) — **two blocks, and only two**: one hull-flank plate and
  one turret cheek, with the gap between them (ref §1.4's blue Grizzly). The
  band's glacis wrap and tail plate are gone — that wrap was what made it one
  continuous stripe round the hull. Both blocks stay strictly inside the
  outline the band already had: the Grizzly's own gun is a 2px sliver and
  anything raised here buries it. 15.4/11.1% → **13.7/10.7%**.
- ☑ Rhino (`rhino`) — **five blocks**: three flank plates a side, bolted
  applique standing on the track guard with a ≥3px gap, plus the two turret
  cheeks, which go from hull value to house colour (the bar painted across the
  turret face is gone — it put remap where nothing is shaped). This is the one
  unit whose plates deliberately stand PROUD: countable notches on the flank
  are what separate it from the Tesla Tank's identical olive lozenge without
  spending a pixel more paint. 12.6/9.3% → **12.3/9.3%**.
- ☑ Apocalypse (`mammoth`) — **the house colour IS the canisters**. The
  unbroken skirt band is gone; in its place four fat drums stacked 2×2 on the
  REAR DECK, individually countable with a lit cap and a dark muzzle, plus two
  short shoulder plates so the flank is not mute. The eight thin tubes strung
  down both flanks read as ribs on a skirt from two tiles away and put the tell
  on the one surface every tank already has. 13.6/10.9% → **13.1/11.1%**.
- ☑ Mirage (`mirage`) — two flank plates and no glacis wrap; the remap moved UP
  onto the **emitter housing**, which is what names the unit: the ring at its
  foot, and the bottom plate of the stack itself (the reference's housing is a
  mid-value shell with ONE bright mouth at the top, so the plate under that
  mouth is free to carry the owner). Painting the full flank spent the whole
  budget on the shape it shares with the Chrono Miner — its worst confusion on
  the field at 0.837 IoU. 12.3/9.7% → **12.1/8.8%**.
- ☑ Prism Tank (`prismtank`) — the one hull-length plate a flank became two with
  a gap, under the pale guard stripe; the turret band and the cowl trim on the
  crystal housing stay, so it reads as four blocks with the colour on the
  identity feature. 17.5/12.6% → **17.0/12.2%**.
- ☑ Tesla Tank (`teslatank`) — two flank plates instead of a bar, and a fatter
  house-colour foot under each coil column: the coil pair is the identity, so
  that is where the remap belongs. 14.5/11.3% → **14.2/10.7%**.
- ☑ V3 (`v3`) — the bed band became two short plates. The reference's V3 is a
  white missile with a red nose cone and red fins and *nothing else coloured*;
  a bar down the truck bed was competing with the one diagonal that names it.
  15.5/12.8% → **14.9/12.1%**.
- Untouched, because they already carry discrete blocks: Flak Track, IFV,
  Chrono Miner, War Miner, MCV, Terror Drone (all ±0.0%).

Gate (`RTS_ART=1 node --test apps/games/rts/rts-art.test.js`), before → after:
`iou.groundCombat.mean` 0.679 → **0.6769**, `iou.vehicle.mean` 0.5809 →
**0.5802**, `mass.groundCombatSpan` 2.317 → **2.357**, `mass.tightestBand6`
1.197 → **1.200**; every other metric unchanged, none regressed.

**What did NOT move, and why.** `peerVsSelf.vehicle` (11 of 13) and
`iou.sameFactionOver75` (16) are pure ALPHA-silhouette measurements, and the
five same-faction vehicle pairs over the ceiling — Chrono Miner|Mirage 0.837,
Mirage|Prism 0.816, Rhino|Tesla 0.801, Tesla|War Miner 0.799, Rhino|War Miner
0.790 — all need ≥0.04 of separation. A colour-placement commit at a constant
budget cannot buy that: the audit's own finding is that the shared track-box
lozenge carries 88–92% of every ground vehicle's outline. That is **C4**'s work
(spikes and the mass hierarchy), and doing it here would have meant either
re-adding paint (plan §4 forbids it) or silhouette surgery under a colour
commit. One experiment worth recording: giving *every* tank the same
proud-applique treatment made `iou.vehicle.mean` WORSE (0.5801 → 0.5808) — a
shared visual language is a shared silhouette. Only the Rhino keeps it, and the
counts differ per unit on purpose.

### Controls and UX
- ☑ v1.19.194 Selection brackets, primary building, hover name card
- ☑ v1.19.198 Mouse-wheel zoom about the cursor
- ☑ v1.19.199 Touch: tap selects own / orders at, drag pans, pinch zooms; desktop-only gate removed
- ☑ 2026-09-03 (cameo grid, clock wipe, READY, queue badge, ON HOLD) RA2 sidebar behaviour: build queue tabs per structure type with icons, repeat/hold, "cannot build" reasons
- ☑ v1.19.209 RA2 bottom command bar: Same, Path (waypoint mode), T1/T2/T3 (click recalls, Shift-click assigns), Guard, Stop, Scatter, Sell (half refund), Repair (0.5%/s at 30% of cost, wrench glyph); ☑ Deploy (v1.19.212, GI sandbags, hotkey D); Beacon pending multiplayer
- ☑ v1.19.199 Veterancy: 3 kills veteran (+25% damage, -15% damage taken), 6 elite (+50%/-30%, self-heal); gold chevrons; kills and rank on the hover card
- ☑ v1.19.209 Sell / repair via the command bar
- ☑ v1.19.199 Waypoints: shift-right-click queues stops; dashed numbered route shown on the selected unit
- ☑ v1.19.199 S stop, G guard, X scatter (deploy: no deployable unit yet)

### Simulation and AI
- ☑ v1.19.198 Harvester obeys move orders and holds; AI spaces its base
- ☑ v1.19.199 Shroud: map starts black, stays revealed once seen; hidden enemies neither drawn nor hoverable (RA2 without fog)
- ☑ v1.19.199 Ore regrows slowly on existing seams (2/s per tile, never spreads)
- ☑ Superweapons: all four built (see Phase C under Roster expansion) — timers, targeting, EVA warnings, AI use
- ☑ AI: harvester harassment (existing), defences toward the enemy (existing), rebuilds by count (existing); target list now covers every structure type with a catch-all

### Audio
- ☑ v1.19.199 EVA via speech synthesis: unit ready, construction complete, low power, base/miner under attack, unit/structure lost, insufficient funds, primary building selected
- ☑ v1.19.199 Units acknowledge orders with per-type lines in a faction voice (speech synthesis, throttled)

### Roster expansion (user, 2026-09-01: "implement more buildings and other combat items matching real RA2, right now there are too few")
Every new item is built to the same bar as wave 4: real sprite fetched from the C&C wiki `File:` namespace, aspect within ±8%, owner-only colour 12-18% with 0% opposing hue, checked at 1:1 in the scene, sim stats scaled from RA2 rules.ini, AI taught to use it.
- ☑ Phase A — tech structures from real sprites: Allied Airforce Command, Service Depot, Battle Lab, Ore Purifier, Prism Tower; Soviet Radar Tower, Service Depot, Battle Lab, Nuclear Reactor, Sentry Gun (Patriot/Flak Cannon/Gap Generator wait for air units and fog)
- ☑ Phase B — all 11 ground units from real sprites: Engineer (both), Tanya, IFV, Mirage; Rhino, Flak Track, V3, Tesla Trooper, Crazy Ivan, Terror Drone, Tesla Tank; engineer capture, hero cap, tiers, AI use (Chrono Legionnaire still open)
- ☑ Air layer (art7/air): Rocketeer (JUMPJET), Harrier (ORCA, Aircraft lane, 4 pads per Airforce Command, 2 missiles per sortie, returns to reload), Kirov Airship (ZEP, bombs what is under it); Flak Trooper (FLAKT) as its own key, Guardian GI made Allied-only and AA; Patriot Missile (NASAM) and Flak Cannon (NAFLAK) in the Defence lane; per-weapon `aa`/`ag` flags so only AA touches aircraft and AA sites never fire at the ground; aircraft ignore terrain, draw above every ground entity with a ground shadow, altitude bob, propeller / missile-rack / jet-flame frames; "cannot" cursor and refused orders for non-AA units; AI builds AA when bombed or after radar, fills its pads and strikes harvesters/refineries, sends Kirovs with waves; hover card shows missiles/on-pad; voices for all five
- ☑ Air layer follow-ups, part 1: a killed aircraft no longer pops — it becomes a `g.wrecks` entry that falls (40 ticks, a Kirov 90, tumbling through its facings behind a smoke trail), and detonates where it lands on friend and foe alike (a Kirov as its own bomb: 250 / splash 2 / BlimpHE, straight down; a jet keeps its forward momentum). An idle Harrier/Rocketeer holds a 0.45-tile hover circle instead of freezing, and an aircraft built mid-match climbs from the ground to cruise height over 30 ticks (`born`), so a Rocketeer lifts off from the Barracks door
- ☑ 2026-09-03 (full IFVMode table) Air layer follow-ups, part 2: IFV turret swap on a Rocketeer passenger (no transports yet), Chrono Legionnaire
- ☑ v1.19.231 Phase C — superweapons: Chronosphere / Weather Control Device vs Iron Curtain / Nuclear Missile Silo
- ☑ shipped earlier (wrecks, hover, AA) Air layer follow-ups: aircraft crash-and-burn on death (they pop now), Harrier hover-circle animation while idle in the air, Rocketeer take-off from the Barracks door, IFV turret swap on a Rocketeer passenger (no transports yet), Chrono Legionnaire
- ☑ Phase C — superweapons, all four from real sprites, both factions (`req:'lab'`, 3x3, rules.ini cost/1000hp concrete/-200 power, one each). One charge timer per weapon PER SIDE (a second silo buys nothing, losing the charger resets it), and it only advances while the grid is powered:
  - ☑ Chronosphere ($2500, 7:00) — pale panelled dome and house-coloured arch rails over a pod deck (`allied-chronosphere-idle.png`, aspect 1.598 vs 1.633, house 13.0-13.3%, 0% opposing); two clicks lift up to nine vehicles out of a 3x3 and drop them anywhere, infantry in the field die as in RA2.
  - ☑ Weather Control Device ($5000, 10:00) — the great orb on its ribbed column with four corner orbs and a cross mast, lightning crawling between them (`allied-weather-control-idle.png`, aspect 1.066 vs 1.081, house 13.7-14.6%); fires a 20-second 3x3 storm of ten 200-damage bolts on `WeatherWH` under a darkened sky.
  - ☑ Iron Curtain ($2500, 7:00) — radial house-panelled drum under an emitter sphere on struts, coils crackling (`soviet-iron-curtain-idle.png`, aspect 1.364 vs 1.366, house 15.7-16.8%); 20 seconds of true invulnerability (`damage()` voids the hit) for a 3x3 of own units and structures, and it kills the infantry under it.
  - ☑ Nuclear Missile Silo ($5000, 10:00) — ribbed black tower on a railed apron with red trim, a service hoop and blinking hatch lamps (`soviet-nuclear-silo-idle.png`, aspect 1.146 vs 1.16, house 15.4-15.8%); ten-second flight, then 500 damage per footprint CELL falling to nothing at four tiles, mushroom cloud, ore vaporised, shroud burned off.
  - ☑ UI: RA2-style clocks stacked in the top-left of the map (one per superweapon owned, the AI's never shown), a conic charge sweep and MM:SS, EVA on ready, click-to-target with a footprint ghost and Esc to cancel; enemy launches raise the RA2 warnings and flash the target on the minimap.
  - ☑ AI: builds its faction's pair after the Battle Lab once the bank clears $6000 and an army stands, nukes/storms the densest enemy structure cluster (refinery weighted), curtains its wave when it commits and chronoshifts it next to the enemy refinery.
- ☑ Tech-tree gating as RA2 (Radar/Airforce → tier 2, Battle Lab → tier 3), sidebar shows prerequisites (v1.19.209)

### Combat model (user, 2026-09-02: "攻击力和血量、装甲等等因素也要全都符合ra2")
- ☑ RA2 armour classes + warhead Verses table, secondary weapons (Guardian GI missile, Tanya C4), rules.ini strength/cost/speed/sight/ROF/range for every unit and structure, RA2 veterancy multipliers, $10000 start, Chrono/War Miner capacities, Allied Power Plant vs Tesla Reactor (v1.19.212)
- ☑ Air-layer items (Rocketeer, Harrier, Kirov, Patriot, Flak Cannon, Flak Trooper) carry their rules.ini numbers (v1.19.212); ☑ AA secondaries via a `spec.aaW` weapon that `weaponFor` picks whenever the target `isAir` — Flak Track FlakWH (35, range 6.5) over its ground FlakTWH (25), Apocalypse MammothTusk (50, HE, range 6) so the heaviest tank in the game is no longer free food for an airship; the IFV keeps HE both ways
- ☑ `spectre` is gone — the key is `prismtank` with RA2 PTNK stats ($1200, 150 hp, light, Speed 6, Sight 8, Comet 100 dmg / ROF 60 / Range 8, PrismWarhead, Battle Lab), it fires the Prism Tower's beam, and the Allied AI alternates it with the Mirage as its tier-3 pick. The art kind inside `bakeVehicle` is still named `spectre`; the bake site maps `prismtank` → that sprite.
- ☑ MCV — RA2 SMCV/AMCV ($3000, 1000 hp, heavy, Speed 4, Sight 6, no weapon, War Factory + Service Depot). D / the Deploy button / a double-click unfolds it in place into a 3x3 Construction Yard centred on its tile (refused with a warning if `canPlace` says no), the yard inherits the MCV's hp fraction. Losing the last yard no longer loses the match while an MCV stands, and the AI buys and redeploys one. Ore Purifier +25% and Service Depot repair already follow rules.ini
- ☑ MultipleFactory=0.8 compounds without a building cap now, floored at 0.25 (1 · .80 · .64 · .51 · .41 · .328 · .262 · .25), and the low-power penalty is RA2's curve instead of a flat 0.4×: `prodSpeed()` = 0.8 − 0.3 × min(1, deficit/use), so barely in the red is 0.8× and a total blackout is the 0.5× floor (MinLowPowerProductionSpeed=.5 / MaxLowPowerProductionSpeed=.8). Defences still go dark on negative power
- ☑ Mirage Tank tree disguise: two seconds still (no order, no move, no shot) and it draws as a theatre tree picked off its id; `findTarget` skips a disguised Mirage beyond 1.5 tiles, so an enemy walks past it until it is almost on top of it or until the tank fires (firing sets `fireAt` and drops the disguise for 2 s). The owner's hover card says "Mirage Tank (disguised)"
- ☑ GI deploy (RA2 E1 Para weapon: range 6, double fire rate behind sandbags; a move order packs up; the AI deploys holding GIs, a human uses D) (v1.19.212) — ☑ 2026-09-03 deployed-GI art rebuilt from
  `docs/ra2-ref/allied-gi.png`, which has three deployed men in it: RA2 drops
  a complete RING of bags, about 32x19, and the man sits down INSIDE it so
  only his helmet, his house-coloured shoulders and his gun clear the rim.
  Ours was a front arc with no back lip at all, which read as a soldier
  standing behind a crescent. It is now baked as TWO canvases on the infantry
  sheet — `back` (his ground shadow, the dark dished pit and the lower back
  lip) goes down BEFORE the man, `front` (three courses of parapet) over him —
  with the bags laid as oblong sacks along the ring's tangent and a seeded
  size jitter so a course is bags rather than a moulded tyre. The house-colour
  stripe that used to be painted along the crest is gone: RA2 leaves the bags
  khaki and the owner's colour on the emplacement is the man's own vest
  showing over the rim (owner hue 8.0% blue / 10.8% red, 0% opposing, against
  6.8% on the reference crop)
- ☑ Vehicles crush infantry (RA2 Crusher=yes / Crushable=yes): a ground vehicle other than the Terror Drone ignores enemy infantry in its separation nudge and kills any trooper under its tracks; the Tesla Trooper is uncrushable (v1.19.218)
- ◐ AI re-tuned for RA2 pacing: spends its bank on more factories/barracks and deeper queues, weighs enemy defences before attacking, no tech before an army, one or two miners per refinery, assumes infantry until scouted; hard-vs-easy self-play is still being measured across both factions

### Debug mode (user, 2026-09-02: "add a debug mode, for instant build, no resource limit and all map vision open, player unit has 10x more durance and 10x more attack than AI opponent")
- ☑ Start-screen checkbox (remembered): instant build for the player, credits pinned at 999999, whole map revealed, the player's units and structures deal 10× and take 1/10; the game is not scored; a banner says so at start (v1.19.213)

### Camera (user, 2026-09-02: "when no unit is selected, I can use right click and drag to move my view on the map")
- ☑ Right-drag pans the map whenever nothing of the player's is selected (middle-drag always pans; a right click that does not move still falls through to the normal right-click) (v1.19.215)

### Terrain and maps (user, 2026-09-02: "build real terrains like RA2, instead of the current plain surface with blocked areas; support multiple maps")
- ☑ Terrain step 1: water with shimmer, shorelines, cliffs (raised, block movement), roads, trees as occluding objects, snow theatre (v1.19.210)
- ☑ Terrain art pass against RA2 tileset references (`docs/ra2-ref/terr-*.png`): seamless 256×128 ground sheets cut into 64 position-indexed tiles, 32 px cliff faces with 16 edge masks, animated water + shallows, shore/road overlays, rock sheets with scree, 4 tree variants per theatre; rocks/trees never land on water or against a cliff, ridges are 3-wide plateaus (v1.19.211)
- ☑ Terrain step 3: three more map shapes, gem fields and the urban theatre (v1.19.212)
  - ☑ **Chokepoint Pass** — one unbroken cliff wall on the anti-diagonal (self-mirroring), cut only by two mirrored ramp bands; the ore sits in the pockets either side of each pass
  - ☑ **River Crossing** — a four-tile river across the waist with two bridge crossings, approach roads and a street along each bank
  - ☑ **Gem Valley** — a cliff-ringed plateau open through one ramp on the north face and its mirror on the south, gems inside
  - ☑ `T_RAMP` / `T_BRIDGE` — passable by construction (out of `solidT`, so astar, `tilePassable` and the AI honour them for free), refused by `canPlace`, drawn with their own art, and coloured on the minimap
  - ☑ `T_GEM` — an ore variant worth 2× per bail (RA2 gems 50 vs ore 25) via a `cargoV` value carried beside the `cargo` volume; blue-violet crystal clusters, distinct minimap colour, `patch()` takes a gem flag
  - ☑ Urban theatre — a poured-concrete ground sheet with iso-aligned slab joints, oil stains and rubble; asphalt roads with kerb-and-sidewalk rims; street trees in paved pits; ten neutral `T_CIV` civilian blocks (shop, apartment, warehouse, filling station) in mirrored pairs; cliffs, shores and scree keep their sculpted art under a cool grey cast
  - ☑ Map picker shows all six with theatre glyphs (🌲 temperate, ❄️ snow, 🏙️ urban) and wraps to two lines on narrow widths
- ☑ Three mirrored 2-player maps (Iron Frontier, Lake Divide, Frozen Front) with seeded variation; a playability + mirror-fairness test covers every map
- ☑ Map picker on the start screen; pathfinding and placement aware of water/cliffs/trees; minimap colours per terrain
- ☑ Theatres: temperate and snow (v1.19.211), urban (v1.19.212) — structures keep their art, the ground and street furniture change

## Gap audit (2026-09-02) and closure plan

Two audits were run against the real RA2 v1.006 inis (`rules.ini`, `art.ini`,
theatre inis, `eva.ini`, `keyboard.ini`, `ui.ini`), with every claim cited and
verified in the running game. They are the execution documents for this plan;
read the relevant section before starting any item:

- **`apps/games/rts/docs/gap-audit-features.md`** — roster, stats, mechanics, match flow,
  hotkeys, AI. 25 ranked gaps; one blocker.
- **`apps/games/rts/docs/gap-audit-art.md`** — structures, infantry, vehicles, effects,
  terrain, HUD, audio. 25 ranked gaps; two systemic causes.

The two systemic findings that most rows fall out of: **a structure sprite has
exactly one state** (no damaged art, no destruction, no build-up, no aiming,
no power-off), and **infantry have no facings and no death animations**. On
the feature side, **prerequisites are largely unenforced** and a handful of
stats are wrong enough to invert a unit's role (the Prism Tank is an
anti-infantry gun instead of a siege gun).

Fixed the same day as the audit: superweapons queued in the structures lane
(v1.19.239); `T3`/`Sell` command buttons rendered outside the sidebar and were
unclickable (v1.19.240); a superweapon clock froze silently under low power —
the charge halt is RA2's `IsPowered` rule, but the clock now reads LOW POWER
(v1.19.241). The auditors did not play whole matches, so **player-observed
issues are a separate input**: every one the user reports goes into Phase 0
below as its own line, reproduced first, before anything else is built.

### Plan — eight phases, ordered by player impact per builder-hour

Each phase is sized in builder batches (one opus builder, one worktree, one
verified merge; two run in parallel). Effort letters are the audits' S/M/L.
Within a phase, items are in execution order.

**Phase 0 — correctness sweep (feature audit §2, §3; art §6 "broken";
player reports). ~2 batches, all S.** Nothing new to draw; pure rules.ini
fidelity plus reproduced player reports.
- ☑ v1.19.241 Superweapon clock shows LOW POWER (red) while the charge is
  halted, with time-left in the tooltip, instead of a frozen countdown.
- ☑ 2026-09-03 Phase 0 sweep shipped: Prism Tank `CometWH`/ROF 400/range 10/
  Speed 4; every prerequisite above enforced (`reqAll` = AND, faction-aware
  lock labels); the stat list above; elite ROF ×0.6 and speed ×1.2; kill-value
  promotion (`VeteranRatio=3`); 15% repair; radar-gated minimap; V3/IFV
  minimum range. Not done from the list: War Miner gun (needs a shooting
  harvester state — moved to Phase 4), isometric minimap (Phase 1 sidebar).
- ☑ 2026-09-03 Playtest pass 1 (`playtest-2026-09-03-{human,soak}.md`,
  144 soak matches + 10 human scenarios). Fixed: move orders that could never
  give up (dead `repathAt` test, truthy empty path); armies stacked on one
  tile (spawn steps off the door, idle units and group orders take one cell
  each); units entombed by a new structure (nudged out); AI posture deadlock;
  Collective never built Sentry Guns; AI never built the Depot or a
  superweapon (rungs + a reserve); paid units binned at a blocked door;
  `pathQ` leaking between matches; Help/Scores could not be closed by Esc or
  a backdrop click; radar right-click did nothing; no message when queuing
  behind an unplaced structure; band box skipped harvesters/MCV; first AI
  attack came at 5 min on Normal (now 8; Easy 10).
- ☑ 2026-09-03 Progressive charging: `stepQueues` deducts `cost × Δprog`
  per tick, parks an item `q.hold` (red clock hand, `HOLD` on the cameo, EVA
  "On hold") when the bank empties and resumes when money returns;
  `cancelLast` refunds `q.paid`, while a finished structure waiting for a spot
  still refunds its whole cost. Placement ghost is now the structure's own
  baked sprite, tinted green/red and drawn over the world.
- ☑ **Superweapon and paradrop clocks stay top-left over the battlefield — by
  decision, not omission.** RA2 stacks them on their sidebar cameos; the user
  ruled the tactical-view placement better (2026-09-03) and it is now the
  intended design. They take no mouse input (`#swbar` is `pointer-events:
  none`, only `.swic` is clickable), so the drag-eating bug that made this
  look like a defect is gone. **Do not "fix" this by moving them to the
  sidebar.** See `docs/design-decisions.md`.
- ☑ 2026-09-03 Soak residuals — settled tile stacks and crowd-stuck units, one
  mechanism between them. The separation push lives inside `moveAlong`, which
  only runs while a unit is FOLLOWING A PATH, so a unit that had stopped —
  order complete, order dropped, or never given one — settled exactly where it
  stood and stayed there. `stepSettle` gives a unit that did not move this tick
  the same push at a shuffle's pace, skipping anything that walked in the last
  1.5 s or fired in the last 3 s so a firing line still holds its ground.
  Measured over 24 hard-vs-easy Iron Frontier matches on the build carrying the
  `isAiSide` seat-0 fix: **tile stacks 74 → 1**, **crowd-stuck 131 → 1**, units
  standing inside a building footprint 43 → 31, frozen-army flags 8 → 2. Gates
  level: HE 22/24 → 22/24, HN 44/48 → 43/48 across two disjoint 12-seed sets,
  NE 18/24 → 18/24, Coastal 11/12 → 12/12. The old "~12 crowd-stuck" was also
  being *mis-counted* — see `docs/design-decisions.md`, "A stuck detector that
  started its clock before the order arrived". Everything else that list
  carried is fixed: ~~structures interpenetrate~~ (Phase 2 footprints), ~~Weather Storm
  is one thin bolt~~ (Phase 5 storm timing), ~~the AI never fields
  Engineer/Tanya/Ivan/Drone/Tesla Tank/Purifier~~ (Phase 6 task forces),
  ~~a hull re-issues an order it can never complete~~ (the naval follow-up's
  `g.wzone` water bodies — 419 of those stuck flags came from one Destroyer
  ordered to a beach).
- ☑ 2026-09-03 **The Directorate is slower than the Collective through the mid game — closed as a DEFECT, with no balance change.**
  Found while chasing the Coastal asymmetry, and it is not naval: on Iron
  Frontier, which has no water at all, hard-Directorate takes 19.9 min on
  average against the same seeds hard-Collective closes in 13.3. Between the
  War Factory and the Battle Lab the Directorate fields `dirGrz` (max 2) and
  `dirInf`; the Collective fields `colFlood`, `colRhino` (max 2), `colMech`
  and `colDrone`. It wants its own balance pass with its own soak — it moves
  the pinned snapshots, so it must not ride inside another change.
  **Measured 2026-09-03: this is a DEFECT, not a balance gap.** `P_HUMAN` was
  answering three questions at once, and `advance()`, `orderUnitsTo()` and the
  crush branch had no escape hatch for an AI sitting at seat 0 — so a seat-0
  AI's deployed GIs could never walk again and its tanks never crushed. `dep`
  is on the GI and nothing else, so it cost the Directorate alone, and
  `gates.sh` puts the HARD side at seat 0. With `isAiSide` alone (feat/net) and
  no balance change at all: hard-Directorate 20.6 → 19.1 min, hard-Collective
  17.1 → 18.3, gap **3.5 → 0.8 min**; the hard mirror moves from dir 2 / col 19
  to dir 7 / col 13, and the gate re-baselines to 22/24. Do NOT tune
  `AI_TEAMS`, the Battle Lab priority or `dirGrz` on top of it: a build-order
  pass that looked right against the *broken* baseline (tech rungs above the
  extra War Factory) measured dir 18 / col 5 in the mirror once the seat fix
  was in — a buff on top of a fix. Rejected; see `docs/design-decisions.md`.
- ☑ v1.19.242 Prism Tank: `CometWH` (50% vs armour, 200% vs structures), ROF 400,
  range 10, Speed 4. *(blocker)*
- ☑ v1.19.242 Prerequisites enforced exactly as `Prerequisite=`: Tesla Coil POWER+RADAR;
  Patriot/Flak Cannon BARRACKS only; Refinery/Barracks POWER; War Factory
  PROC+Barracks; Battle Lab War Factory+RADAR; Tesla Tank RADAR; Flak Trooper
  RADAR; Pillbox/Sentry BARRACKS.
- ☑ v1.19.242 Stats: Barracks armour steel; War Factory −25, Service Depot −25/−20,
  Battle Lab −100 power; yard sight 8, AFC 5, Refinery/Lab 6, WF 4,
  harvester 4; superweapon HP 750 (Chrono/Curtain); Iron Curtain recharge 5;
  Lightning 250 dmg on IonWH (3% vs concrete); Kirov Speed 5; Harrier
  Maverick range 6 as one 2-round burst; Apocalypse MammothTusk 2×50 / ROF 320
  / range 8; Flak Track AA range 10; Flak Trooper `FlakGuyAAGun` secondary
  (20/100/8, FlakGuyWH); Guardian GI missile ROF 160 range 8, deploy-only
  (`DeployFire`); Tanya C4 ROF 400; GI `Para` 15/60/5; Terror Drone range
  1.83; V3 and IFV `MinimumRange`; War Miner `20mmRapid` gun; Nuclear Reactor
  desc +2000; Pillbox not `Powered`.
- ☑ v1.19.242 Veterancy: promote on kill *value* (`VeteranRatio=3` × own cost), add
  `VeteranROF=0.6` and `VeteranSpeed=1.2`, drop the elite self-heal.
- ☑ v1.19.242 Repair cost 15% (`RepairPercent`), Service Depot at `IRepairRate`.
- ☑ v1.19.242 Radar: minimap black until a powered Radar/AFC exists (`RadarOn/Off`).
- ☑ 2026-09-03 (ore backing square fixed in the effects pass; road exclusion in genCore) Ore never on roads/pavement; ore tiles without the tan backing square.
- ◐ ☑ Minimap drawn isometric (same orientation as the field, terrain blitted
  through the `setTransform(k, k/2, −k, k/2, …)` matrix, click-to-jump and
  right-click orders inverted through the same projection), viewport as the
  true screen quad. ☑ 2026-09-03 `fsheet.js` MEASURES its canvas
  instead of guessing it. The hard-coded 1500x4200 fitted only the Directorate
  row (and painted the background over just the top 2600 of it), so the whole
  Collective row rendered off the bottom, and it would have re-broken silently
  on the next unit added. It now lays every sprite out in a first pass with no
  drawing and allocates exactly what that came to — 1500x9202 at the current
  86-sprite roster — with a faction header on each row.

**Phase 1 — the RA2 sidebar and controls (art §6; feature §3, §5).
~3 batches, L.** The single largest presentation gap.
- ☑ Sidebar as RA2's command bar: radar in a drawn metal bezel with rivets, a
  vertical power meter (bar = drain, needle = output, green→yellow→red),
  credits ticker stepping once per frame with the coin tick, a two-column
  60×48 cameo grid with NO prose (name/cost/power/prerequisite in a
  canvas-drawn tooltip hung off the sidebar's edge), icon tabs, a clock wipe
  with a bright hand over the cameo, READY on the cameo, a queue-count badge,
  and empty slot plates so the grid reads as a fixed panel. Army and clock
  fold into the sidebar header; the top-bar Credits/Power pills are gone.
- ☑ Command bar reduced to `ui.ini`'s six (Team01, Team02, TypeSelect,
  Deploy, Guard, PlanningMode); Sell / Repair / Power are the three sidebar
  toggles (Power flips `b.offline`, which `recalcPower` honours and `drawBld`
  draws dark with an OFF tag); Stop is the S key, Scatter the X key.
- ☑ Cursor set: 17 canvas-drawn cursors (select, move, no-move, attack,
  force-fire, attack-move, guard, deploy, enter, sell, repair, power,
  waypoint, chrono, nuke, storm, curtain), applied to `#cv` as
  `cursor: url(data:…) hx hy`, chosen per hover context by `pickCursor()`;
  move / attack / force-fire / attack-move / chrono animate on a 150 ms beat
  that doubles as the context poll, so the cursor answers a held Ctrl without
  the mouse moving.
- ☑ Orders: force-fire (Ctrl+right-click, at an entity **or** bare ground —
  `fireGround` hits your own units too), attack-move (Ctrl+Shift+right-click,
  order type `amove`: fights what it meets, then resumes), Follow (F, then
  click a friendly unit), planning mode (Z), Guard distinct from Stop
  (`GuardModeStray=2.0`: `u.guard` reaches out via `nearestFoe` and walks back
  to its post; `u.stopped` fires but never moves).
- ☑ Hotkeys per `keyboard.ini`: Q/W/E/R tabs, T type-select, K/L repair/sell,
  Z planning mode, N next object, F1–F4 views with Ctrl+F1–F4 to set, teams
  1–0 with Ctrl assign / Shift add / Alt centre, Space = last radar event
  (`g.radarEvent`), H = base, Delete = self-destruct, Esc = options card,
  PageUp/PageDown/Home/End scroll the sidebar (`SidebarUp/Down` — the arrows
  are the camera, in RA2 too), Ctrl+C = ScreenCapture (RA2 wrote a .pcx; the
  browser hands the canvas over as a downloaded PNG).
  **P deliberately stays pause** rather than becoming CombatantSelect: pause
  is the key a player reaches for, and it also lives in the options card.
- ◐ ☑ Pip health bar (bracketed, green/yellow/red, pip count scaled to the
  object); ☑ EVA text top-left in the tactical view as a fading stack; ☑
  superweapon clocks over their own cameos; ☑ in-game options card (Esc —
  resume, restart, abort to menu, sound, scroll speed, game speed, three
  save/load slots; pauses while open).
  ☑ 8 house colours (RA2's gold/red/blue/green/orange/teal/purple/pink on the
  front menu's settings strip; the player picks, the AI takes the opposite —
  blue↔red, otherwise red. The colour is painted INTO the art at bake time,
  so a pick re-runs `bakeOwned()` — the owner-coloured half of `bakeAll`,
  ~1.6s — behind a "Repainting the army…" notice, and the faction line-ups
  and map-preview spawn dots follow it).

**Phase 2 — structure states (art §1). ~4 batches, L.** One baked frame set
per state, for every structure and defence, both factions.
- ☑ Damaged art at ≤50% + fire ports. `A.dmg` is a generic post-pass over the
  baked healthy frames (silhouette bites, soot, cracks, blackened patches,
  broken panes, masked to the sprite's alpha); the three ports per key are
  read off the art's own roofline, and the idle animation drops to a third
  speed while hurt.
- ☑ Destruction: `killBld` stages 3–5 blasts across the footprint, throws
  debris on ballistic arcs, stands a smoke column over the wreck, and leaves
  a baked rubble decal per footprint size (soft scorch, churned crater,
  broken slabs, twisted rebar) on the ground layer, passable, fading over 60s.
- ☒ MAKE build-up per structure — REMOVED at the user's request (asked twice; MAKE_T = 0, no unpack delay, instant sell). Was: MAKE build-up per structure (apron first, then a rising wipe behind a
  scaffold girder + working crane, 7 phases baked lazily per key, ~2.5s,
  inert while it runs); ☑ MCV unpack ([GACNST] `Buildup=GACNSTMK`) plays
  FIRST — four frames baked off this owner's MCV sprite at the facing it
  stopped on (flanks folding down into aprons, four jacks dropping, the
  gantry standing up, the hardstanding spreading), 48 ticks in front of the
  yard's own MAKE, which `placeBld` then runs as before.
- ☑ Unpowered: baked desaturated frame, animation frozen, no emoji (the OFF
  tag stays for a player-switched-off structure). ☑ Repair wrench: an
  8-frame gold wrench turning on a dark disc over the structure, replacing
  the `🔧` glyph. Sprite and Repair-mode cursor are drawn from ONE path
  (`wrenchPath`), so the tool in the world and the tool on the pointer are
  the same object.
- ☑ Defences aim: 8 bearing frames baked lazily for the Sentry Gun barrels,
  Flak Cannon barrel, Patriot launcher and Pillbox slit (`gunAim` projects a
  raised gun at a world bearing into the iso view); Tesla Coil and Prism
  Tower both wind up for `DelayedFireDelay=28` with drawn charge art and a
  rising sound; Prism support links (+150% per supporter, max 8) with the
  beams drawn; Patriot alternates its tubes.
- ☑ Production doors on spawn ([GAWEAP] `UnderDoorAnim`/`RoofDeployingAnim`,
  [NAWEAP]'s maw leaf, [GAPILE]/[NAHAND]). Every producing structure now
  stands SHUT when idle, as RA2's do; a finished unit waits inside the bay
  while the door opens (22 ticks), steps out at the mouth tile
  `stepQueues` already picked, and the door holds 26 ticks and shuts over
  22. Seven whole frames are baked lazily per structure the first time it
  produces (`doorOf`, `doorDmgOf` — the aim-frame pattern), indexed by a
  `dopen` 0..1 argument to `bakeBuilding`: the Directorate factory's roller
  shutter rises inside the hoop while the crown panel slides back, the
  Collective factory's leaf swings out past the -gx jamb, the Directorate
  barracks' hut shutters lift and the Collective barracks' two steel leaves
  part onto a lit hall. Presentation only — `headless` spawns on the tick
  it always did, so every balance run is bit-identical.
- ☑ Sell = the MAKE played BACKWARDS (RA2's own rule): `sellBld` stops the
  structure, runs `make` down through the build-up frames in reverse, and
  only then pays the refund and removes it — with no death blasts, debris
  or rubble decal (a sold building is folded away, not levelled).
- ☑ Footprints to RA2 `Foundation=`, every key verified against `art.ini`:
  Construction Yard 4×4 (`[GACNST]`/`[NACNST]`), War Factory **5×3**
  (`[GAWEAP]`/`[NAWEAP]`), Refinery 4×3, Allied Barracks 3×2 (`[GAPILE]`) /
  Soviet 2×2 (`[NAHAND]`), Airforce Command 3×2 (`[GAAIRC]`), Allied Battle Lab
  3×2 (`[GATECH]`) / Soviet 3×3 (`[NATECH]`), Tesla Reactor 3×2 (`[NAPOWR]`),
  Nuclear Reactor 2×3 (`[NAAPWR]`), Chronosphere 4×3 (`[GACSPH]`), Soviet
  Service Depot 4×3 (`[NADEPT]`, Allied stays 3×3), Ore Purifier 3×3
  (`[GAOREP]`), Cloning Vats 2×2 (`[NACLON]`) and Gap Generator 1×1
  (`[GAGAP]`) — the last two SHRANK. Footprints are now per FACTION, resolved
  through `bspecFor` at every site that reads one (`placeBld`, `canPlace`,
  `aiPlace`, the ghost, the cursor, `bakeBuilding`), because RA2's are.
  Two art changes carry it: the ground plate is the TRUE cell parallelogram
  (`plot()`, not a rhombus — this is what stopped adjacent structures reading
  as though they grew through each other), and the superstructure's vertical
  mass scales with the plot so a bigger `Foundation=` is bigger in both axes.
  Start pads, the opening force, `mapTrees` and the AI's placement radius
  re-tuned around the bigger plots. See `docs/design-decisions.md` for the
  before/after aspect table.

**Phase 3 — infantry motion (art §2). ~2 batches, L.** — DONE
- ☑ 8 facings for every infantry kind; 6-frame walk.
- ☑ Firing frames; prone/crawl under fire with `ProneDamage`.
- ☑ Death animations per warhead `InfDeath` (twirl, explode, fly, burn,
  electro, crushed splat); idle fidgets; cheer on victory.
- ☑ Selection bracket from unit size, not sprite bbox.

  Built as a *lazy facing/state atlas*: `bakeInfantry(col, kind, fac, phase,
  dir, state)` bakes one frame, `SPR.unit[p][fac][kind].fr(state, dir, phase)`
  memoises the rest on first use, so load-time baking is unchanged (~1.6 s).
  Sequences follow `[E1Sequence]`: stand / walk 6 / fire 3 / down / up /
  prone / crawl 6 / fireProne 2 / idle1 3 / idle2 3 / cheer 2. Deaths are fx
  objects (`g.fx[].corpse`) played off the same baked figure. See
  "RTS infantry facings are two transforms" in `docs/design-decisions.md`.

**Phase 4 — roster and mechanics, land (feature §1, §3). ~4 batches, M.**
- ☑ Attack Dog, both sides ([ADOG]/[DOG] $200/100hp/Speed 8/Sight 9,
  `GoodTeeth`/`BadTeeth` firing `ParasiteDog`: the leap removes any infantryman
  outright and does literally nothing to armour). Own 8-facing atlas (stand /
  6-frame run / 3-frame leap), `DetectDisguise=yes` strips a Mirage within
  Sight 9, TechLevel-2 slot after the Engineer, and the AI buys two or three
  when the enemy is fielding men.
- ☑ Walls and gates: `[GAWALL]`/`[NAWALL]` $100 concrete segments with 16
  neighbour-mask pieces per faction (Directorate precast, Collective bolted
  plate), press-and-drag chain laying that charges per segment,
  `WallBuildSpeedCoefficient=3.0`, the `Wall=` warhead flag (`WH_WALL`, folded
  into target picking as well as damage), `Selectable=no`, `ThreatPosed=0`;
  `[GAGATE_A]` gates that travel for their owner and are shut to everyone else.
  Per-structure `Adjacent=` replaces `BUILD_RADIUS` (see design-decisions for
  why the rules.ini values are carried in at +4).
- ☑ Gap Generator ([GAGAP] $1000/600hp/−100 power, radius 10): `applyGaps()`
  writes the shroud back over `g.seen` before each reveal pass, so the enemy
  has to re-scout what it took; soft-edged gap fog; it blinds the AI's
  `scoutEnemy` on the same terms.
- ☑ Grand Cannon ([GTGCAN] $2000/900hp/steel/−100, 150 damage, ROF 480,
  Range 15, `MinimumRange=3`) with the defences' 8-bearing aiming frames, a
  slow lobbed shell on a real arc and a crater where it lands.
- ☑ Spy Satellite ([GASPYSAT] $1500/1000hp/−100, `SpySat=yes`, `Powered=true`
  — the whole map while it stands and the grid holds, shroud straight back
  when either goes); Psychic Sensor ([NAPSIS] $1000/750hp/−50,
  `PsychicDetectionRadius=15` — every hostile inside the ring is drawn joined
  to the thing of yours it means to kill); Cloning Vats ([NACLON]
  $2500/1000hp/−200, `Cloning=yes`, BuildLimit=1 — a free second copy of every
  infantryman, out of the Vats' own door).
- ☑ The neutral house (`P_NEUT`, house −1 in `g.blds`):
  - **Garrisonable civilian buildings.** The urban theatre's blocks are real
    neutral structures, not terrain: four looks with `MaxNumberOccupants`
    10/6/3/2, entered by right-click with the ENTER cursor, and only by RA2's
    two `Occupier=yes` sections ([E1] GI, [E2] Conscript). Occupants fire their
    own weapons out of four sandbagged ports with lit windows, the block flies
    the occupier's colour, `[General] ThreatPerOccupant=10` folds into target
    picking, D evacuates, an enemy Engineer *clears* rather than captures, and
    the whole garrison dies with the building. EVA StructureGarrisoned /
    StructureAbandoned (#107/#108).
  - **Destructible bridges + [CABHUT].** Deck cells are grouped into vertical
    spans at `BridgeStrength=1500`; force-fire and nuke blast take one down,
    the cells revert to water with torn-deck art, traffic on them goes into the
    river, and an Engineer entering a repair hut rebuilds it (EVA
    BridgeRepaired #46). `mapRiver` places four huts, two per bank.
  - **Tech buildings.** Oil Derrick ([CAOILD] `ProduceCashStartup=1000`,
    `ProduceCashAmount=20` every `ProduceCashDelay=100`), Tech Hospital
    ([CATHOSP] `Hospital=yes`, heals your infantry near it) and Tech Airport
    ([CAAIRP] `SuperWeapon=ParaDropSpecial`, 4-minute recharge, `AllyParaDropNum=6`
    / `SovParaDropNum=9`), all `Capturable=yes NeedsEngineer=yes Unsellable=yes`,
    laid down in mirrored pairs by every map generator, and the AI sends spare
    Engineers at them.
  - **Crates.** `[CrateRules]` CrateMinimum/CrateRegen=3/CrateRadius=3.0/FreeMCV,
    with the `[Powerups]` weight table (Money 2000, Veteran, Unit, Firepower
    ×2.0, Armour ×1.5, Speed ×1.2, Reveal, HealBase), RA2's wooden crate art and
    the effect glyph on pickup.
  - **Ore spreading.** `[Riparius] Spread=2200 SpreadPercentage=.06` throws a
    seam into empty ground next to a rich cell; `[Cruentus] SpreadPercentage=0`
    keeps gem fields finite.
- ☑ 2026-09-03 Unit mechanics, the whole row. Every one of these is a weapon
  whose warhead does something other than subtract hit points, so they all
  hang off `fire()` rather than off `damage()`:
  - **Two miners, not one.** `harvester` split into [CMIN] **Chrono Miner**
    (Directorate: $1400, Str 1000, Speed 4, Sight 4, Storage 20 bails,
    `Primary=none`, teleport locomotor) and [HARV] **War Miner** (Collective:
    same chassis, Storage 40, `Turret=yes` + `20mmRapid` 30 / ROF 20 / Range
    5.5 / `HARVWH`, `OpportunityFire=yes`). The word "harvester" survives as
    the ROLE — `harvKey(fac)` / `isHarv(u)` resolve it at spawn, build, count
    and order, so the AI, the tests and `orderUnitsTo` never had to change.
    A full Chrono Miner stands still for `ChronoDelay` and is then simply AT
    its refinery (chrono flash both ends), unless the trip is longer than
    `ChronoHarvTooFarDistance=50`, in which case it drives.
  - **Terror Drone infest.** `[DroneJump]` `LimboLaunch=yes` + `[Parasite]`
    `Parasite=yes`: the drone leaves the map and lives inside the vehicle,
    taking 50 off it every two seconds until one of them is finished. It is
    untargetable in there, the host shudders and throws sparks, a Service
    Depot shakes it out and kills it, and a drone whose host died climbs back
    out.
  - **Crazy Ivan.** `[IvanBomb]` `IvanBomb=yes` PLACES (no damage at all);
    `[General] IvanTimedDelay=450` frames at RA2's 30 fps is a 15-second fuse,
    drawn as a satchel with a lit fuse and a count over the carrier. The blast
    is `[IvanWH]` 400 / CellSpread 1.5 / `PercentAtMax=.25`. He will bomb his
    own units (`AttackCursorOnFriendlies=yes`), and an Engineer inside
    `[DefuseKit]`'s Range 1.5 takes one off without being spent.
  - **Engineer extras.** Entering one of your OWN damaged buildings puts it
    straight back to full and spends him; the garrison eviction and the
    bridge-hut repair are unchanged.
  - ☑ **Captured production.** A structure now carries the faction that BUILT
    it (`b.fac`, stamped by `placeBld`, never rewritten), so an Engineer takes
    a Soviet War Factory rather than turning it into an Allied one: it keeps
    its Soviet plate — in its holder's colour — its `byFac` footprint and its
    power draw, and it rolls Rhinos for whoever holds it. rules.ini roots
    every build list at the producing structure (`[HTNK] Prerequisite=NAWEAP`,
    `[E2] NAHAND`, `[SAPC] NAYARD`, Soviet structures `...,NACNST`) and gives
    those buildings an all-nine-country `Owner=`, so the gate is what you HOLD,
    not what side you are. One predicate — `facAllows` — answers for
    `canBuild`, `aiCanMake`, the sidebar tab, the cameo and the hover card.
    Depth is not free: the Apocalypse still wants their Battle Lab
    (`[APOC] NAWEAP,NATECH`), the Radar Tower their refinery
    (`[NARADR] NAREFN,NACNST`). See `docs/design-decisions.md`.
  - **Tesla Trooper charges coils.** Up to three ([SHK]) hold one Tesla Coil:
    it fires with the grid completely down and swaps its bolt for
    `[OPCoilBolt]` (300 against the coil's own 200). Right-click the coil with
    troopers selected; the ENTER cursor is on it.
  - **Desolator + the radiation layer.** [DESO] $600 / Str 150 / plate /
    Sight 6 / `RadBeamWeapon` 125 / ROF 50 / Range 6, `SelfHealing=yes`,
    `ImmuneToRadiation=yes`, Prerequisite Barracks+Radar. D deploys him into
    `RadEruptionWeapon`, which floods the ground around him. `g.rad` is a
    per-cell level following `[Radiation]`: `RadLevelMax=500`,
    `RadLevelFactor=0.2` applied every `RadApplicationDelay`, decaying over
    `Level × RadDurationMultiple`, `RadColor=0,255,0` drawn as a green wash
    with motes lifting off the hot cells. `RadSite` Verses is infantry-only.
    The nuke leaves one too (`[NukePayload] RadLevel=500` — the audit had it
    missing).
  - **Yuri.** [YURI] $1200 / Sight 12 / `[MindControl]` Range 7 / ROF 200 /
    `[Controller]` `MindControl=yes`. One victim at a time, permanently, until
    Yuri dies or he takes another; `ImmuneToPsionics=yes` exempts both miners,
    the Terror Drone and Yuri himself, and the warhead's Verses row is 0%
    against every structure. Violet halo on the victim, tether to the holder.
  - **Chrono Legionnaire.** [CLEG] $1500 / Str 125 / `[NeutronRifle]` 8 / ROF
    120 / Range 5 / `[ChronoBeam]` `Temporal=yes`: the target is erased over
    time, never damaged, at a rate scaled by its own Strength (a Conscript in
    ~2 s, an Apocalypse in ~13, a structure by the same rule), and snaps back
    whole if the beam breaks. It moves by the teleport locomotor —
    `ChronoTrigger=yes`, `256/ChronoDistanceFactor` per cell, floored at
    `ChronoMinimumDelay` — and is out of phase (untargetable) while warping.
  - **Spy.** [SPY] $1000 / flak / Sight 9, `PermaDisguise=yes`: he reads as one
    of the ENEMY's own riflemen to the enemy, walking or standing, and nothing
    targets him until a dog (`DetectDisguise=yes`) strips him. Infiltration:
    Refinery `SpyMoneyStealPercent=.5`, Power Plant `SpyPowerBlackout` (the
    whole grid, not one building), Radar wipes the victim's shroud, Barracks /
    War Factory turn out veterans from then on, Battle Lab is eva.ini #92
    "Technology stolen" and adds the enemy's lab unit to your own lane.
  - **Chronosphere.** RA2's is a ONE-WAY trip (the return leg was RA1's):
    `ChronoDelay` is how long the squad spends out of phase, and the ground it
    lands on decides — solid ground keeps it, open water takes it.
  - Sidebar Infantry tabs now run GI / Engineer / Dog / Guardian GI /
    Rocketeer / Spy / Tanya / Chrono Legionnaire and Conscript / Engineer /
    Dog / Flak Trooper / Tesla Trooper / Ivan / Desolator / Yuri, in TechLevel
    order; the AI fields one or two of each specialist where the scout report
    calls for it. Art for all four new men is built on the infantry facing
    atlas against `docs/ra2-ref/ra2-{deso,cleg,spy}-*` (no Yuri rip exists on
    the wiki — see `docs/design-decisions.md`).

**Phase 5 — effects and terrain (art §4, §5). ~4 batches, M/L.**
- ☑ Explosion size families, craters, scorch, debris; nuke with white core,
  fireball, rolling cap, shock ring, additive blend; rocket smoke trails;
  distinct V3 projectile; recoil; track marks and dust. Four baked frame
  sequences (`bakeExplosionFamily`, 11 frames each: small / medium / large /
  building) replace the single scaled radial blob — a billowing fireball that
  cools into a smoke ball, with the white-hot core baked as its own frame and
  drawn additively over it; `famOf(size)` picks the family, so every existing
  `boom()` call site got the right one for free. Vehicle deaths take the large
  family plus 3–6 debris chunks and a smoke column (`vehicleDeath`). Ground
  decals (`decal()` on `g.rubble`, capped at 56, weathering over 90 s):
  medium+ blasts scorch, shells/bombs/large blasts crater
  (art.ini `Crater=yes`/`Scorch=yes`, rules.ini `Deform`/`DeformThreshhold`).
  The nuke is a four-second mushroom — flash column, dust annulus running out
  across the ground, hourglass stem, rolling cap that climbs and darkens,
  additive core — and leaves radiation decals on the crater. Missiles trail
  puffs laid along the path already flown; the V3 is its own finned round on
  a high arc with a motor flame. Tanks rock 2 px back along the barrel axis
  for four ticks; tracked vehicles lay fading tread decals (a render-side
  ring buffer, 180 max) and kick dust on dirt and road.
- ☑ Ore glitter animation and seamless ore fields; gem variety. The soil wash
  is feathered off the tile edge (`feather()`), so a field is one seam
  instead of a checkerboard of tan backing squares; three baked sparkle
  phases cycle on an eight-step clock offset by the cell hash; gems bake
  three habits (tall spires / squat clusters / low fan) rather than one cone.
- ☑ Soft feathered shroud edge; Gap fog rendering. 16 `bakeShroudEdge` tiles
  keyed on the explored-neighbour mask: the border cell draws its ground
  under a black tile whose rim is eaten away toward each open side, with
  ragged bites so the line is not an airbrush. The Gap Generator's fog draws
  the same tiles at a fraction of the opacity.
- ☑ LAT ground transitions; rock cliffs with shadowed faces; rock-slope
  ramps; road bends/junctions/ends; snow trees; theatre-specific civilian
  sets; map border continuation; per-map ambient lighting. Each theatre now
  carries TWO grounds (grass/sand, snow/scoured earth, pavement/dirt) laid in
  hashed patches, and the base cell beside an alt one draws a 16-mask LAT edge
  tile with the alt material feathered and speckled over its own edge
  (`bakeLat`); the rock fringe (`bakeScree`) is the same machinery with the
  scree stones added. `bakeCliff` is rebuilt as a row of irregular rock
  COLUMNS — unequal widths, broken crests, per-column jut, strata, seepage
  streaks and talus — in three palettes (temperate grey-brown, snow
  white-blue, urban concrete with form-board courses and tie-rod holes).
  Roads (`bakeRoad` / `bakeUrbanRoad`) are keyed by the 4-bit neighbour mask,
  so straights, bends, T-junctions, crossroads and dead ends fall out of one
  arm union, with wheel ruts and bitten-out ragged shoulders on dirt and
  kerbs, sidewalk lips, centre lines and stop bars on the paved set; a cell
  with road on all four sides is drawn as solid paving instead of a junction.
  Eight terrain objects per theatre (five trees + a dead trunk + two rock
  outcrops; five street trees + three bombed shells in the city), ice floes
  on frozen water, six new civilian looks (office block, shop row, ruined
  block, grain depot, farmhouse, barn) and a mirrored farm pair on the
  temperate maps. Terrain continues `APRON` tiles past the playable diamond,
  drained and dimmed in eight distance bands into a matching background.
  Every map carries a `light` block (`multiply` + additive wash) under the
  storm and nuke washes.
- ☑ Terrain height levels (plateaus draw raised). `computeHeight` derives a
  per-cell height field from the terrain the generators already lay: a cliff
  top is level 1, any ground the map border cannot flood-reach without
  crossing a cliff is enclosed and therefore level 1 too, and a ramp
  interpolates between the two ends of its run (BFS distance to low and to
  high). `sy()` subtracts that height, so the ground, ore, trees, structures,
  units, decals, shots and explosions on a raised tile all draw raised
  together; `screenToGrid` inverts it by re-projecting twice. Passability is
  untouched — the height is derived FROM the terrain, never the other way
  round.
- ☑ Vehicle damage: dark smoke below 50 % hp, flame licks below 25 %
  (art §3 "no damaged smoke or damaged art on vehicles").
- ☑ Harrier descent onto the pad; Kirov size and gondola motion. `altOf`
  ramps the altitude over 34 ticks in BOTH directions (`landAt` / `flyAt`
  caught on the `landed` transition), and a descending Harrier stays in the
  air draw pass until it is down. The Kirov draws at 1.3× and rocks on its
  long axis. ☑ The gondola is now its OWN baked layer (`out.lay()` on the
  Kirov's sprite set — hull / gondola / gondola-with-the-bay-open, baked on
  first draw): `drawUnit` draws the two layers with the pod trailing the
  envelope by 14 ticks and swinging wider, so it reads as slung on cables,
  and the bomb bay opens for 24 ticks from `u.fireAt` — two leaves down, a
  lit bay and the bomb clear of it ([ZEP] `PrimaryFireFLH=-50,0,-140`).

**Phase 6 — match flow and AI (feature §4, §6). ~2 batches, M.**
- ☑ Skirmish options: a shut-by-default "Game settings" drawer under the map
  row carrying starting credits (5 000/10 000/20 000), starting units (0–10),
  game speed (RA2's 1–6), Bases, Short Game, Crates, Superweapons and the
  eight house colours, persisted in `localStorage` beside faction/map and
  frozen into `G.opt` at `startMatch`. Every default reproduces the
  pre-Phase-6 match bit for bit (asserted against a recorded three-minute
  sim), so the balance harness is unaffected. Crates off spawns none;
  Superweapons off takes all four structures out of `canBuild`; Short Game
  off is RA2's long game (the last unit has to die too); Bases off starts
  each side with an MCV instead of the yard; speed is ticks per second, not a
  changed tick (see `docs/design-decisions.md`).
- ☑ EVA coverage of `eva.ini`'s skirmish lines. Added on top of the 23 that
  were there: NewConstructionOptions (#49), Building (#52), Training (#66),
  Canceled (#51), Repairing (#57), UnitRepaired (#70), BaseDefensesOffLine
  (#59), BuildingOffLine/OnLine (#60/61), CannotDeployHere (#63),
  SelectTarget (#65), UnableToComply (#47), NewRallyPointEstablished (#100),
  BattlefieldControlOnline (#120), BattleControlTerminated (#15),
  YouAreVictorious/YouHaveLost (#22/23), NuclearSilo/IronCurtain/
  Chronosphere-Detected (#1/#4/#7, on the enemy BUILDING one),
  EnemyAirArmadaDetected (#96), ArmorBattallianDetected (#98),
  EnemyInfantryBattalionDetected (#99), ChronoMiner/OreMinerOffline
  (#109/#86), NewTechnologyAcquired (#74). The standing watches
  (`stepEvaWatch`) run every 30 ticks, are edge-tested against their
  threshold and are skipped headless; `eva()` throttles per line in game
  FRAMES, as RA2 does, and returns whether it spoke.
- ☑ RA2 score screen: a per-house table (structures built/lost/destroyed,
  units built/lost/destroyed, ore harvested) in the two house colours with
  the better column bolded, then Leadership/Economy/Technology as
  percentages — **approximations** of Westwood's, not the shipped formula
  (the weights are in no readable .ini); the leaderboard follows it.
- ☑ Save/load: three `localStorage` slots (map, clock, age) from the Esc
  options card, plus a "Load saved game" button on the front menu that only
  appears when a slot is full. Format and the determinism guarantee are in
  `docs/design-decisions.md`; a round-trip test steps the original and the
  restored copy 1 000 ticks and compares state hashes.
- ☑ AI: RA2's **task-force / team-type layer**, modelled on `ai.ini`'s
  [TaskForces] / [ScriptTypes] / [TeamTypes] / [AITriggerTypes] and paced by
  `rules.ini [General]`. Twenty named task forces (`__rtsTables.AI_TEAMS`), ten
  a side — Allied Infantry Attack (4 GI + 2 Grizzly), Grizzly Attack (4 Grizzly
  + 2 IFV + 2 Guardian GI), Mirage Ambush, **Prism Siege** (3 Prism + 4 Mirage
  + 2 Grizzly + 6 GI), Rocketeer Raid, Tanya Strike, Harrier Attack, Tech
  Capture, Base Defense; Soviet Conscript Flood, Rhino Spearhead, Apocalypse,
  Tesla Tank, **Bombard** (3 V3 + 4 Flak Track + 4 Rhino), Kirov Raid, Terror
  Drone Attack, Ivan vs Allies, Desolator Line, Tech Capture, Base Defense.
  Each carries a per-difficulty trigger weight, a `Max=` instance count and a
  prerequisite structure; `TotalAITeamCap` (30), `TeamDelays` (2000/2500/3500)
  and `DissolveUnfilledTeamDelay` (5000 frames, converted) run the cadence.
  **Production requests come from the teams being filled** — the ad-hoc "roll a
  die and pick a unit" in `aiProduce` is gone, the economy/structure ladder is
  untouched. Teams gather at the staging point, then attack-move at a target
  CLASS (`aiPickTarget(…, cls)`: base defences → power → production →
  harvesters → nearest), retreat below `give`, and absorb the loose pool
  (`Reinforce=`) up to `wave`. Engineer teams capture the Oil Derrick first,
  then tech buildings, bridge huts, our own damaged structures and an
  undefended enemy building. `AIIonCannon*Value` drives the superweapon aim
  (War Factory 100, Power 60, Base Defense 35, Helipad/Radar 20, ConYard 10,
  harvester/MCV/Engineer 1), with `AIMinorSuperReadyPercent` holding a full
  team for an Iron Curtain that is 70% charged. `HarvestersPerRefinery=2`, the
  refinery count follows the ore the base can reach, and
  `AIVirtualPurifiers` / `MultiplayerAICM` are RA2's Brutal-tier economy
  handicap (see `docs/design-decisions.md`). Defensive teams honour
  `Minimum/MaximumAIDefensiveTeams`; the base-defence plan runs rules.ini's own
  `((TotalBaseCost-2000)/1500 × Coefficient) + 3×(Level-1)` clamped by
  `Allied/SovietBaseDefenseCounts`. `AIBuildsWalls=no`, so the AI builds none —
  `AIPickWallDefensePercent` is wired but dormant, and a wall in the way is
  SHOT (`aiClearWall`).
- ☑ AI siege posture: the defence line is valued against our own army, and two
  broken waves inside four minutes set it too; hard and normal then raise the
  artillery task force, which targets base defences first and out-ranges them
  (Prism Tank 10 vs Tesla Coil 7, V3 18 vs Prism Tower 8) behind a screen of
  line tanks and infantry, with the Chronosphere dropping it at the defence
  line when it is still walking. Gate: hard vs an easy AI that never attacks
  and holds every unit home went **11/24 → 22/24** over 12 seeds × both faction
  orders (30-minute cap).
- ☑ The ladder is ordered in the MIDDLE, not just at the ends. The posture
  ladder's deadlock escape no longer commits on unit COUNT (a $100 Conscript
  army trips a head-count threshold at half the value it is charging into),
  and a house sitting on `AI_HOARD` = $12 000 gets one production building
  past its tier's `fact`/`bar` appetite. Gates over the same 12 seeds × both
  faction orders, 30-minute cap: hard vs easy **18/24 → 21/24**, hard vs
  normal **19/24 → 21/24**, normal vs easy **9/24 → 19/24** (and Normal
  playing the Collective 1/12 → 9/12). Normal's `opening`, `wave` and
  `purifiers` are fenced by playtest pass 3 and did not move.
- ☑ `__rtsSim` repeats itself: `newState` resets the spatial index, so the
  second match in a process is the same match as the first (it was not — see
  `docs/design-decisions.md`). `tmp/play/soakB.js --batch` plays several
  matches per process and matches the one-per-process numbers 24/24.
- ☑ AA is PLANNED, not reacted to. `aiProduce` used to open its anti-air on
  `ai.airAt` — the tick an enemy aircraft was last seen or felt — so the first
  sortie was also the first sighting and an easy Directorate's Harriers ate a
  normal Collective's miners unopposed from 14–16 min. The screen now goes up
  once the other house merely *can* field aircraft (`aiFoeCanFly`: an Airforce
  Command for Harriers/Rocketeers/Nighthawks, or the Battle Lab + War Factory
  pair a Kirov needs), sized as a PROPORTION of the same
  `Allied/SovietBaseDefenseCounts` plan the gun towers use — a third of it
  (2–4 guns) when they can fly, half of it (3–6) once the bombs actually fall,
  and the old single post-radar tower when the enemy has no airfield at all.
  It is bought out of spare cash, so it does not come out of the army's money.
  Gates over 12 seeds × both faction orders, 30-minute cap: hard vs easy
  **19/24 → 23/24**, hard vs normal **19/24 → 22/24**, normal vs easy
  **22/24 → 21/24**.

**Phase 7 — audio (art §7). DONE (2026-09-03).** Original synthesis only —
every sound is oscillators and one baked noise buffer, no files, no libraries.
- ☑ A synth kit (`SND`: `nz`/`op`/`clk`/`verb`, one shared feedback delay) under
  a four-bus mixer (SFX / voices / EVA / music) that enforces sound.ini's rules:
  per-sound `Limit`, `Priority` (a full 26-voice mixer drops the lowest), `Range`
  attenuation in cells from the camera, `MinVolume` for `Type=GLOBAL`, and the
  existing 70 ms same-sound throttle.
- ☑ 50 sounds where there were 10. Per-weapon reports keyed by shooter the way
  rules.ini's `Report=` reads (`REPORT` table): rifle, MG, three cannon weights,
  rocket, flak, Tesla bolt + `TeslaCoilPowerUp` charge, Prism beam + wind-up,
  Harrier, V3, Grand Cannon, Kirov bomb, Desolator, Yuri, Chrono Legionnaire,
  Ivan tick, Terror Drone, dog, `InfantrySquish`; four explosion bands with
  debris tails; nuke + siren, storm thunder + wind bed, Chronosphere and Iron
  Curtain stings.
- ☑ Structure and economy: placement thud, MAKE hammer loop, construction
  chime, sell (till + collapse), repair wrench, `WorkingSound`/`NotWorkingSound`,
  low-power alarm, credit tick, harvester dump, radar on/off, superweapon-ready
  sting, garrison in/out, bridge collapse, crate pickup, promotion fanfare.
- ☑ Unit voices: a per-faction radio synth (formant bursts, 420–2900 Hz band,
  squelch) replaces SpeechSynthesis for units — all 29 kinds, `VoiceSelect`
  (new) / `VoiceMove` / `VoiceAttack` / deploy / harvest, 2–3 patterns each.
  EVA keeps SpeechSynthesis for its words but now rides the EVA bus and falls
  back to a chime + the message rail when `getVoices()` is empty (it used to
  say nothing at all).
- ☑ Music: a generative score — a ~90 s loop per theatre (temperate industrial
  march, snow cold pads, urban driving bass), a menu theme, four eight-bar
  sections, and an intensity layer that opens up on weapon reports near the
  camera. Toggle + three volume sliders in the Options card, all persisted.
- Cost: 0.042 ms/frame of audio scheduling in a 40-unit battle (measured), one
  noise buffer per context, one delay, one radio chain.

**Phase 8 — transports, navy, multiplayer. ~6 batches, L.**
- ☑ Transports: `Passengers=` on four hulls — Flak Track 5 ([HTK]), IFV 1
  ([FV]), Nighthawk 5 ([SHAD] $1000 / Str 175 / Speed 14 / Sight 7 /
  `BlackHawkCannon` 35, a Directorate helicopter that lands on any clear cell
  to load and unload and never touches an Airforce Command pad) and the
  Amphibious Transport 12 ([SAPC] $900 / Str 300 / heavy / Speed 6, Collective,
  and land-only until the navy lands since `Prerequisite=NAYARD` has nothing
  to point at yet). A passenger is stored the way a garrison's occupants are —
  off the map, not targetable, not counted as army, not band-selectable — and
  comes back out with the health and rank it went in with; the load dies with
  the hull, as RA2's does (there is no eject mechanism in rules.ini, only
  `[General] CrewEscape` for a `Crewed=` vehicle's single crewman).
  Load = right-click one of our own transports with the ENTER cursor (the
  garrison UX, reused); unload = `D`/Deploy. A cargo pip strip per RA2's
  `PipScale=Passengers`, on two rows past six seats.
- ☑ IFV turret swap: [FV] `TurretCount=4` / `WeaponCount=13`, driven off
  `IFVMode=` on the passenger. All thirteen modes are in the table with their
  rules.ini weapons, and every infantryman on the roster maps to one (GI /
  Conscript / Spy machine gun, Engineer repair arm, Flak Trooper and Rocketeer
  flak, Tanya SMG, Shock Trooper bolt, Ivan demolition charge, Yuri psi-pulse,
  Desolator rad beam, Chrono Legionnaire neutron rifle, dog and Guardian GI the
  rocket pod). Four turret models are baked on demand and swap on the hull; the
  weapon, its range, its warhead and whether the thing can shoot aircraft at
  all follow the man inside. An Engineer's IFV has no gun — it welds friendly
  vehicles ([RepairBullet] Damage=-50 / ROF 80 / Range 1.8).
- ☑ AI transports: two `mech` task forces that mount their infantry before
  they move (ai.ini pairs LoadOntoTransport with the Move) and put the load
  down at the target, plus a hard-only Nighthawk insertion that drops a squad
  at the enemy refineries.
- ☑ 2026-09-03 Naval layer: Shipyards, water pathing, all 11 ship classes, naval AI.
- ☑ 32-facing vehicles and aircraft. RA2 renders a voxel at 32 bearings, not
  the 8 an infantry SHP carries: `u.face`/`u.tface` are now 0..31 (11.25 deg a
  step) for every hull, turret, aircraft nose and aiming defence, and infantry
  stay at 8 because their art really is eight hand-drawn facings (`octOf`
  bridges the two). The sheets are baked LAZILY per bearing — `faceSheet`
  hands back an Array of self-replacing getters, so `set[u.face]` reads like
  the old baked strip while the canvas behind it is drawn the first frame that
  bearing is actually asked for. Four times the facings therefore HALVED the
  load: bake 1289–1358 ms → 702–731 ms, because no vehicle bakes anything at
  boot any more. Hulls and turrets also SLEW at rules.ini `ROT=` (5 for almost
  every tank, 40 for a Terror Drone, 10 for a Kirov, 3 for an Orca/Harrier;
  one ROT point = 0.1 facings per tick, so a ROT=5 turret sweeps the full 32
  in ~64 ticks) instead of snapping, and a gun will not fire until it BEARS —
  the sim rule RA2 has and we did not.

- ☑ Water pathing: a second passability class. `MV_LAND` / `MV_NAVAL` /
  `MV_AMPH` (rules.ini `SpeedType=` / `MovementZone=`) threaded through
  `blocked()` / `tilePassable()` / `astar()` as an optional last argument, so
  `undefined` still means LAND and no pre-naval call site changed behaviour.
  A hull only floats on `T_WATER`; the amphibious pair (Landing Craft,
  Amphibious Transport) crosses both; a bridge deck BLOCKS a ship, because
  every RA2 naval hull that matters carries `TooBigToFitUnderBridge=true`.
  `waterSpot`/`freeWaterNear`/`dockSpot` are the wet `standSpot`/`freeTileNear`.
- ☑ Shipyards: `[GAYARD]`/`[NAYARD]` $1000 / Str 1500 / concrete /
  Foundation 4x4 / `Adjacent=12` / Sight 10, `WaterBound=yes` — `canPlace`
  gains a water plot rule (every footprint cell `T_WATER`, at least one dry
  cell in the ring) and a `queues.n` naval lane whose producer is the yard.
  Ships list at the bottom of the Units tab in TechLevel order. Art rebuilt
  against the real sprites (`docs/ra2-ref/allied-naval-yard-anim*.png`,
  `soviet-naval-yard-anim*.png`, fetched from the C&C wiki): RA2's yards are
  not docks along a shore, they are OFFSHORE RIGS in open water on their own
  legs with a lattice crane over the sea. Directorate — four fat caissons on
  concrete collars with foam rings, glossy house-coloured domes over house
  rings, a pale stepped tower on a spoked deck rosette, a dark steel arch with
  a house band and a domed head, a yellow jib on a grab. Collective — a low
  pontoon with a house-painted rim, four brick blockhouse pylons under cream
  slab caps carrying house grilles, a black crane tower with a house band and
  a cream jib on a wrecking ball. Six idle phases each (jib slew, fall, launch
  gate, welding arc, swell, floodlights) and a slipway on the near-left face
  where `DockingOffset0` launches. Bbox aspect vs reference: dir 0.862 / 0.823
  (+4.7%), col 0.849 / 0.874 (-2.8%).
- ☑ Ships: nine hulls with rules.ini stats and original 8-facing art (plan
  outline extruded to a deck, boot-topping at the waterline, tiered
  superstructure, one house band), a foam wake on the water, a slow heave and
  roll, and `[General] ShipSinkingWeight=3.0` — a heavy hull lists and goes
  under instead of exploding. Directorate: Destroyer (155mm + the Osprey's
  depth charge as an auto-selected anti-sub weapon), Aegis Cruiser (AA only),
  Aircraft Carrier (`Spawns=HORNET` x3, recovered and re-armed on the deck),
  Dolphin (sonic, `Sensors=yes`), Landing Craft (12 seats, amphibious).
  Collective: Typhoon Sub, Sea Scorpion (flak + deck gun), Dreadnought
  (`Burst=2` at Range 25 / MinimumRange 8), Giant Squid (`ParasitePlus` — it
  takes hold of a hull and drags it under).
- ☑ Naval combat rules: `Underwater=yes` is a targeting class, not cover —
  only `Sensors=yes` (or the Destroyer's depth charge) can engage a submerged
  hull at all, and it surfaces for 90 ticks when it fires. `LandTargeting=1`
  on the Aegis, the Typhoon, the Dolphin and the Squid: their weapons cannot
  be aimed ashore. The Amphibious Transport floats and moved to the Soviet
  Shipyard, per its own `Prerequisite=NAYARD`.
- ☑ Maps: **Coastal** — one shared bay on the map's anti-diagonal with a
  harbour channel up to each start on the main diagonal (both axes are their
  own mirror), an ore-and-gem island in the middle that only an amphibious
  hull can reach, and a land route round either end so the map still plays
  without a fleet. Lake Divide's lake widened and given an inlet; River
  Crossing's four-tile river already takes a 4x4 yard.
- ☑ Naval AI: six task forces (`dirFleet`/`dirCV`/`dirLand`,
  `colSub`/`colDred`/`colLand`), all gated on a Shipyard, which is itself
  gated on `[General] AINavalYardAdjacency=20` — no shore inside twenty cells
  of the Construction Yard and the whole naval half of the ladder is
  unreachable, which is why Iron Frontier is unchanged (measured: eight
  gate matches step tick-for-tick to the same result and the same clock).
  A fleet musters ON THE WATER in its own body (it used to be handed the land
  staging point, which is a beach), is ordered to the water nearest its shore
  target rather than onto it, and a hull that cannot reach where it was sent
  drops the order and holds rather than churning on it. Landing raids are
  hard-only. The offensive team cap and the "one task force recruits at a
  time" interlock are PER DOMAIN — a fleet filling out of the naval lane
  cannot absorb a rifleman, so it must not freeze the land ladder behind it.
- ☑ Water connectivity: `g.wzone` labels every `T_WATER` cell with the BODY it
  belongs to (8-connected, obeying A*'s no-corner-cutting rule), settled once
  when the terrain is final and recomputed when a bridge span drops or is
  repaired. `navReach()` is the single question; the AI never orders a hull
  into a body it is not in, and a human's order to an unreachable body is
  refused with a message instead of churning. Measured: Coastal is one body,
  Lake Divide three, River Crossing three, Iron Frontier none.
- ☑ Ships render at 32 bearings like every other vehicle (`bakeShip` returns a
  lazy `faceSheet`); the bow wave's arms are anchored on the stem.
  Eleven hulls in total, counting the two that are not on a build list: the
  Amphibious Transport (moved here from the vehicle lane) and the Hornet
  (`TechLevel=-1`, it only ever leaves a carrier deck).
- ☑ 2026-09-03 32-facing vehicles.
- ☑ 2026-09-03 (loopback transports; a socket transport is the one open piece) Lockstep multiplayer over the deterministic `__rtsSim` core (command
  queue, beacon).

- ☑ Lockstep command layer over the deterministic `simStep` core, local-first.
  RA2's netcode sends COMMANDS, not state: every client runs the same
  simulation from the same seed and applies each order on an agreed future
  tick. Every input path — move / attack / force-fire / attack-move / follow /
  guard / stop / scatter / deploy / evacuate / unload / enter / garrison /
  queue / cancel / place / wall / rally / sell / repair / power / superweapon /
  self-destruct — now RESOLVES the click (which needs the selection, the
  cursor and the camera: all local) and then emits a plain-JSON command;
  `applyCmd(g, playerId, cmd)` is the only thing that mutates the sim on a
  player's behalf, and `simStep` still steps the world. Commands issued on
  tick T run on T + `LOCKSTEP_DELAY` (2) on every client, applied in a
  canonical order (player id, then that player's issue sequence). Two
  transports behind one interface (`send` / `onCmd` / `ready(tick)`):
  `LocalNet` for single player (loopback, barrier always open — the
  single-player sim is bit-identical to before, the pinned seed-4242 snapshots
  did not move) and `LoopbackNet`, two in-page clients each with its own `G`,
  its own spatial hash and its own path queue, trading JSON bundles across a
  bus with a settable per-client latency. Desync detection hashes the world
  every 60 ticks (`stateHash`, the same fingerprint save/load compares) and
  stops the match with both hashes on a mismatch. Tested: two clients at
  latencies 0 and 3 stay hash-identical at every checkpoint over five game
  minutes of scripted play, and a command corrupted on one side only is caught
  by the check. The AI is NOT a peer — it runs inside `simStep` on every
  client from the same seed and sends nothing.
- ☑ 2026-09-03 A real transport in the `Transport` seam, and the player-identity
  split that a second human forces. `P_HUMAN` was doing three unrelated jobs at
  once and they only agreed because side 0 was the only human: a SIDE INDEX
  (`g.side[p]`, `stepSW(g, P_HUMAN)`, the win test — unchanged), "the player
  whose screen this is" (~165 feedback sites: every eva/say/sfx/creditPop, the
  cursor, the sidebar, the minimap, the selection, the shroud, the score card —
  now `ME`/`FOE`, which follow the local client's seat and touch nothing
  `stateHash` covers, exactly like `g.seen`), and "this side is driven by the
  AI" — six MUTATING branches, where a wrong answer is a desync rather than a
  cosmetic slip: the GI auto-deploy and the tanks-crush branch in `stepUnit`,
  the deploy-pack in `stepHarvester`, the undeploy-to-walk in `advance`, the
  deployed-unit hold in `orderUnitsTo` (this last one is inside `applyCmd`, so
  a view answer there would have desynced immediately), plus the radiation
  credit, which was never a view or an AI question at all and is now
  `otherSide(p)`. The predicate is `aiOf(g, p)` / `isAiSide(g, p)`, which the
  code already expressed ad hoc as `p === P_AI ? g.ai : g.ai2`. Single player
  is BIT-IDENTICAL (state hashes match the previous build tick for tick over
  four seeds x five game minutes); AI-vs-AI changes, because seat 0 driven by
  `g.ai2` finally gets the three AI behaviours it always should have had.
  **BcNet** is the transport: a `BroadcastChannel` carrying bundles between two
  TABS of one browser. Delivery is a separate task in the other context's event
  loop, so unlike `LoopbackNet` it is a genuinely asynchronous wire, and it
  needs no server. It does the three jobs and nothing else — the lobby agrees
  the match record (seed, map, difficulty, options, factions, colours, player
  ids, `LOCKSTEP_DELAY`) before tick 0, `send`/`onWire` relay bundles without
  dropping any (a bundle that outruns the client being built is buffered and
  replayed), and `ready(t)` holds the barrier. It simulates nothing and stores
  no game state. Reachable from the front menu: a **Players** row —
  One player / Host / Join — above Opponent, no hotkey and no room code.
  `MP_DELAY` is 4, not 2: the delay is also the pipeline, and 2 forces a full
  round trip every single tick. Measured in two real tabs: nineteen 60-tick
  hash checkpoints identical, each sidebar its own credits and power, each
  EVA only its owner's lines, no `pageerror` in either tab.
- ☐ A CROSS-MACHINE relay. `BcNet` is same-machine only. The wire for two
  browsers on two hosts is a standalone WebSocket relay — a service of its own,
  NOT a route in `server/terminal-manager.py`, which is the manager's
  identity/auth surface and has no business holding a tick barrier. It plugs in
  at the same seam with the same three jobs. Still to build on top of that:
  player ids past two, reconnect/replay from the command log, latency
  adaptation (RA2 grows the delay rather than stalling), and the Beacon.

Roughly 29 builder batches at two in parallel. Phases 0–1 change how the
game plays and reads immediately; 2–3 make it look like RA2 in motion; 4–5
fill the world; 6–8 are the long tail.

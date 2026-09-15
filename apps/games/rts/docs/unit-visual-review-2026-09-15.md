# RA2 unit-art visual review — 2026-09-15

This is a working visual-review ledger, not a metric scorecard. A unit is not
finished just because it parses, renders, or has old art-log entries. For each
new item, inspect the actual RA2 reference and current in-game art in matching
front, side, rear and three-quarter bearings, identify the working assembly,
change the largest structural/material mismatch, then open the new render at
game size. The user-confirmed units below are excluded from further redesign.

## Already accepted by the user

- Allied and Soviet MCV (`mcv`, two faction renders)
- Allied Chrono Miner (`chronominer`)
- Soviet War Miner (`warminer`)
- Soviet Flak Track (`flaktrack`)
- Allied Prism Tank (`spectre` / game key `prismtank`)
- Allied IFV (`ifv`), Grizzly (`lancer`), Mirage (`mirage`), Amphibious Transport (`apc`)
- Soviet Rhino (`rhino`), Apocalypse (`mammoth`), Terror Drone (`drone`)
- Soviet V3 Launcher (`v3`), Kirov Airship (`kirov`), Typhoon Sub (`sub`), Sea Scorpion (`seascorp`)
- Allied Aircraft Carrier (`carrier`), Amphibious Landing Craft (`lcraft`)
- Allied Harrier (`harrier`), Attack Dog (`dog`); the user initially approved other aircraft but
  then explicitly rejected Kirov's unchanged appearance, so Kirov is open again

The user-accepted art above is locked against further redesign. The
Nighthawk, Destroyer, Dreadnought and Aegis Cruiser remain open.

## This review pass

| Unit | Visual state | Main change | Current comparison |
|---|---|---|---|
| Allied IFV (`ifv`, default missile pod) | self-reviewed, main form now reads | pale six-wheel chassis; neutral rubber and visible hubs; dark box launcher with six open cells | `art/out/ra2-compare-ifv.png` |
| Allied Grizzly (`lancer`) | self-reviewed, main form now reads | low connected angular turret, slender long gun, narrower guards, less saturated cool-steel hull | `art/out/ra2-compare-lancer.png` |
| Soviet Rhino (`rhino`) | self-reviewed, main form now reads | pale steel hull, darker connected low turret, smaller discrete red shoulder fittings, thinner gun | `art/out/ra2-compare-rhino.png` |
| Soviet Apocalypse (`mammoth`) | inspected and substantially revised; still pending | separated twin guns, larger rear equipment drums, connected dark track belts, warm olive steel and front track cheeks; side armour still too flat/light against the RA2 rip | `art/out/ra2-compare-mammoth.png` |
| Allied Mirage (`mirage`) | inspected and revised; still pending | removed invented rear white billboard, seated pale housings beside the turret, shortened gun; game-size render still too bright/boxy against the dark low RA2 unit | `art/out/ra2-compare-mirage.png` |
| Soviet V3 Launcher (`v3`) | user accepted | lengthened/narrowed half-track chassis and lowered inclined missile onto supported launcher rail | `art/out/ra2-compare-v3.png` |
| Soviet Tesla Tank (`teslatank`) | inspected and revised; still pending | RA2's red power housing carries two raised silver electrode assemblies, not ordinary forward barrels. The prior blue-owner bake mixed a fixed red core with blue skirt paint; remapped the connected power housing to the player colour and returned the skirt plates to neutral armour. The comparison now uses red owner to match the source while the gameplay board still checks blue owner. Electrodes remain small/partly occluded in oblique views, hull still broad and action discharge needs review | `art/out/ra2-compare-teslatank.png` |
| Allied Amphibious Transport (`apc`) | inspected and revised; still pending | pale deck on thick charcoal flotation skirt, widened central red troop/ramp well, reduced offset bridge, two enlarged aft fans; bow geometry and fan depth still need review | `art/out/ra2-compare-apc.png` |
| Soviet Terror Drone (`drone`) | user accepted | widened four segmented legs, replaced dominant blue dome with silver central core and red machine collar | `art/out/ra2-compare-drone.png` |
| Allied Nighthawk (`nighthawk`) | inspected and revised; still pending | RA2 has a dark substantial transport cabin with a sloped cockpit, thin tapering boom and broad rotor. Added a narrowing cockpit/chin wedge, reduced the slab roof and restored distinct dark-body/light-crown planes. Blue-grey surfaces rasterized as cyan blocks and were corrected to neutral metal; gameplay cabin is still boxy, tail highlights too pale and rotor/airframe balance weaker than RA2 | `art/out/ra2-compare-nighthawk.png` |
| Allied Harrier (`harrier`) | user accepted | corrected inverted wingtip front/rear geometry into coherent swept wings, reduced blue tip area | `art/out/ra2-compare-harrier.png` |
| Soviet Kirov (`kirov`) | user accepted | lengthened/slimmed/darkened envelope, changed front to a 28%-length elliptical cap, replaced grey underbody box with an open rack of four spaced tapered bombs | `art/out/ra2-compare-kirov.png` |
| Soviet Conscript (`conscript`) | inspected and revised; still pending | compared actual palette bakes: previous left/right pants snapped to olive versus orange, and a uniform `#996666` trial snapped pink. Settled on one warm-brown thigh material and darker brown shins, narrowed the bow-legged knee stance, widened the continuous hip cloth and neutralized blue-tinted mask/boots/harness; legs now consistent but pose and brown value still need polish | `art/out/ra2-compare-conscript.png` |
| Allied GI (`rifle`, art file `gi`) | inspected and revised; still pending | kept silver pot helmet and removed invented tan face; this pass removed dark chest webbing that shredded the owner-colour vest, enlarged vest from helmet rim to hips, widened matching sleeves and separated narrower neutral-dark legs. Big colour blocks read more clearly at game size, but idle stance is still rigid against RA2 | `art/out/ra2-compare-rifle.png` |
| Allied Attack Dog (`dog`) | user accepted | separated golden-tan shepherd coat from black saddle and lightened muzzle; profile has four legs/tail | `art/out/ra2-compare-dog.png` |
| Allied Engineer (`engineer`) | inspected and revised; still pending | RA2 reference clearly carries an owner-colour vest and substantial painted toolbox, not drab cloth and a grey steel case. Restored those major colour blocks and separated khaki work trousers; comparison now reads as a worker carrying a box, but gameplay figure is still undersized, trousers dark in raster and pose too stiff | `art/out/ra2-compare-engineer.png` |
| Allied Chrono Legionnaire (`cleg`) | inspected and revised; still pending | fixed coat material-table contradiction (black base versus claimed silver armour), restored pale plate suit and levelled chrono rifle; map emitter and cameo action still weaker than RA2 | `art/out/cmp-cleg.png` |
| Soviet Desolator (`desolator`) | inspected and revised; still pending | RA2's green is a small emitter integrated with the chest/shoulder radiation weapon, not a detached glowing ball. Shortened the barrel and moved/shrank the muzzle and bloom to its end, remapped formerly hard-coded red shell/arms for either owner and separated slimmer dark legs; map unit no longer carries wrong-faction red, but sealed rig/weapon pose still needs refinement | `art/out/ra2-compare-desolator.png` |
| Soviet Flak Trooper (`flak`) | inspected and revised; still pending | kept the RA2 map's pale upright shoulder cannon and separate dark diagonal menu pose; split the map gun into a dark shoulder receiver, an explicit collar and a silver long bore rather than one even white pole, but game-size transition remains subtle and menu figure less dynamic | `art/out/ra2-compare-flak.png` |
| Allied Guardian GI (`rocket`) | inspected and revised; still pending | RA2's shoulder-supported launcher reads as a thick weapon close to the upper body; our prior version projected as a spear climbing well above the helmet. Lowered and levelled it, connected the owner-colour vest to the belt; actual gameplay size is still small and the weapon/arm pose still rigid | `art/out/ra2-compare-rocket.png` |
| Soviet Crazy Ivan (`ivan`) | inspected and revised; still pending | RA2 local walk/cameo image shows a red head/shoulder accent, pale arms and a wide dark-trouser stance; the previous flared rust greatcoat hid the legs and overpainted the whole body. Removed the skirt, widened/separated trousers, restored exposed arms and reduced red to owner-colour shoulder strips/headgear. The carried dynamite remains too much like a tan box, and headgear/pose need closer source reading | `art/out/ra2-compare-ivan.png` |
| Allied Rocketeer (`rocketeer`) | inspected and revised; still pending | RA2 reference foregrounds broad owner-colour flight chest and two separate silver suspended legs; ours had a white torso box and overlapping legs hidden by large orange exhaust. Restored a large remapped central chest plate inside silver pressure-suit edges, separated/silvered both legs and shifted/shortened the twin flames outside them; game-size flyer now reads less like a rocket box, though frontal pose remains rigid | `art/out/ra2-compare-rocketeer.png` |
| Allied Spy (`spy`) | inspected and revised; still pending | earlier fixed a missing coat vertex and exposed two legs; this pass replaced parallel trouser rectangles with two articulated hip-knee-foot paths, moved shoes to match and asymmetrically flared the hem. Both legs now resolve in eight game bearings, though coat/pose still much stiffer than RA2's walking figure | `art/out/ra2-compare-spy.png` |
| Allied Tanya (`tanya`) | inspected and revised; still pending | replaced blue/red uniform with warm brown hair, tan skin/top and dark khaki trousers, retaining twin low pistols; actual RA2 cameo has a stronger long-hair/bare-arm action pose than this frontal map-derived menu | `art/out/cmp-tanya.png` |
| Soviet Tesla Trooper (`teslatrooper`) | inspected and revised; still pending | RA2 reference has a large red/owner-colour breastplate with steel bowl helmet, shoulders and gauntlet, while ours had become almost entirely silver. Restored a broad remapped chest plate, removed silver seams that fragmented it, and made shoulder/belt trim remap correctly; it reads more clearly at game size, though pose and legs remain too stiff next to RA2 | `art/out/ra2-compare-teslatrooper.png` |
| Soviet Yuri (`yuri`) | inspected and revised; still pending | the local RA2 screenshot disproves the earlier "long coat/no legs" interpretation: Yuri wears a grey uniform with a red shoulder rig and separate trousers. Removed floor-length purple skirt, restored articulated leg helper and grey torso/arms with owner-colour harness while keeping bald head. Eight-way bake now reads as a standing person rather than a robe, but pose is still stiff and the psychic attack/action is unreviewed | `art/out/ra2-compare-yuri.png` |
| Allied Aegis Cruiser (`aegis`) | inspected and revised; still pending | RA2 shows two substantial white AA launchers fanning outward/up from a central dark mount, not one long white deckhouse. Shortened tubes, splayed and raised their tips, darkened/narrowed the common pedestal; frontal bearings now separate, but broadside still hides one launcher and our hull/bridge proportions remain too boxy | `art/out/ra2-compare-aegis.png` |
| Allied Aircraft Carrier (`carrier`) | user accepted | narrowed the over-wide flat flight deck and strengthened the white layered island | `art/out/ra2-compare-carrier.png` |
| Allied Destroyer (`destroyer`) | inspected and revised; still pending | reference shows a parked stern anti-sub aircraft with fuselage, spanning wing and two blue wingtip nacelles. Raised/lengthened the gold fuselage above the wing and made the nacelles thicker and blue-topped; in front/rear bearings the wing span is clearer, but at gameplay size side-on it still reads too much like a yellow-blue symbol | `art/out/ra2-compare-destroyer.png` |
| Soviet Dreadnought (`dread`) | inspected and revised; still pending | moved both parallel missiles inward from the outboard hull edges to a paired deck position at exactly the same fore/aft station. They no longer look like detached white outriggers in oblique views; launcher support and boxy khaki superstructure still need work | `art/out/ra2-compare-dread.png` |
| Soviet Typhoon Sub (`sub`) | user accepted | lowered neutral casing value and highlight while keeping the red belly and stern planes distinct | `art/out/ra2-compare-sub.png` |
| Allied Amphibious Landing Craft (`lcraft`, distinct ship key from accepted ground APC) | user accepted | shortened bow ramp, flattened cargo and turned tall exhaust-like tubes into broad shallow ducted fans on steel bases | `art/out/ra2-compare-lcraft.png` |
| Soviet Sea Scorpion (`seascorp`) | user accepted | changed short wide hull to narrow extended boat while retaining one white-red elevated AA barrel | `art/out/ra2-compare-seascorp.png` |
| Soviet Giant Squid (`squid`) | inspected and revised; still pending | shortened/narrowed mantle and curved aft fin from prior pass; this pass reduced arm-tip lateral spread from 1.90W to 0.82W so frontal arms trail as a close bundle rather than a jellyfish fan, while side/oblique arms remain long and curved. Head-on aft fins still compress into a bar and land-context live board applies submerged translucency | `art/out/ra2-compare-squid.png` |
| Allied Dolphin (`dolphin`) | inspected and revised; still pending | RA2 has a bottlenose beak extending beyond the rounded melon; ours read as a blunt generic fish. Extended and tapered the continuous snout curve and mouth line while preserving the flukes, fins and strapped weapon pod. Side shape is less blunt but body is still stiff/pod-heavy; land-context live board applies submerged translucency and is not a reliable water-scale judgment | `art/out/ra2-compare-dolphin.png` |

These are agent visual judgments, not user acceptance. Revisit if the complete
roster comparison reveals a new obvious mismatch. IFV's other turret modes
still need action-pose review.

## Human infantry follow-up, 2026-09-15

Viewed the local RA2 image beside eight baked bearings and the live map, with
matching red owner colour where the source is red. The top reference and bake
are independently fitted by the comparison tool, so their display size is not
a valid body-size comparison; the live map is the gameplay-size check. These
are visual findings, not silhouette-score or pixel-ratio acceptance.

- Conscript: the source has a narrow grey face/head block, dark arms, red
  chest accent and substantial warm-brown trousers. Our previous bake had
  bright pale face and red sleeve blocks. Rebuilt the chest remap as a
  connected vest/scarf, darkened sleeves and face mask, kept bent brown legs.
  Still too upright and the red chest is partly hidden by the gun in some
  bearings. See `art/out/ra2-compare-conscript.png`.
- GI: reduced V-splayed straight legs, made the upper sleeves continuous
  with the owner-colour vest, then replaced the parallel leg bars with two
  knee-bent olive trousers and planted dark boots. The legs now resolve in
  eight bearings but are still too skinny/stiff beside the source.
- Tanya: replaced the exposed tan midriff with a dark upper shirt, neutralized
  trousers and thigh pouches, retained pale bare arms/twin pistols. Her pose
  and hair mass still differ from the source.
- Tesla Trooper: built a larger asymmetric owner-colour power gauntlet with a
  metal conductive tip instead of two symmetric plain sleeves. The action
  discharge still needs a visual review.
- Desolator: shortened the detached green orb/receiver and inset a smaller
  green radiation window into the weapon body; the green source accent is
  still stronger than our bake.
- Chrono Legionnaire: pale armour/grey trousers and an upper diagonal owner
  harness now read closer to the source; removed the giant idle cyan blob,
  keeping bright charge for action/cameo. Upper harness can be clearer.
- Spy: narrowed the over-splayed two-leg stance and darkened the case. The
  walking pose still reads stiff in the live map.
- Flak Trooper: retained the upright shoulder gun but changed its upper bore
  from bright white to lower-value silver and strengthened the darker lower
  receiver relation. More shoulder support/pose work remains.
- Engineer: re-viewed with matching red owner, changed the over-wide horizontal
  toolbox into a taller hand-carried case closer to his arm and lifted the
  khaki trouser material. The box now resembles a worker's prop rather than
  a side-mounted plank; arms/trousers are still too dark at live-map size.
- Guardian GI: re-viewed with matching red-owner bake, added a broad dark
  shoulder-seated launcher receiver beneath the narrower tube. It reads less
  like a floating rifle stroke, but live-size shoulder/hand attachment and
  defensive pose remain pending.
- Rocketeer: re-viewed with matching red-owner bake; no new structural redraw
  in this follow-up. Flight pack and body pose remain pending.
- Crazy Ivan and Yuri: prior structural redraws are pending close action-pose
  inspection. All human infantry remain open; no user acceptance inferred.

## Human infantry follow-up, continued

- Yuri: compared the local RA2 gameplay screenshot with eight bakes. The
  earlier two straight trouser posts were replaced by independent hip-knee-
  foot cloth volumes, with broader shoulders/arms. Both legs now read in
  frontal bearings, but side views and the psychic action still need work.
- Crazy Ivan: the reference's red upper garment is broader than our two
  threadlike lapels. Darkened the under-shirt and widened connected owner-
  coloured vest panels, retaining pale exposed arms, separate dark trousers
  and a hand-held bundle. At actual gameplay size the bundle remains a small
  tan block; do not claim its dynamite cylinders are yet visible.
- Rocketeer: moved/widened the pair of rear pressure tanks outboard so they
  frame the upper body and relate visually to the lower nozzles, rather than
  disappear behind the chest and arms. The flight silhouette is clearer,
  though the front suit/visor and pack remain simplified at game size.

## Human infantry follow-up, enlarged visual check

Viewed Tesla Trooper, Desolator, Chrono Legionnaire, Tanya and Spy at eight
bearings and live-map size, then enlarged Tanya/Tesla bakes (`CMP_MAG=6`) to
verify that the named material actually survived the infantry quantization.
Do not use numerical silhouette reports as likeness proof.

- Tanya: reduced the owner mark to a narrow upper-shirt accent, turned the
  trousers olive and kept the chest neutral dark. A blue-grey shirt trial
  rendered purple and was immediately replaced by equal-channel charcoal;
  the final shirt, pale arms and olive trousers now separate. Hair/face and
  pistol pose remain simplified beside the RA2 reference.
- Tesla Trooper: replaced thin black leg posts with two heavier knee-bent
  leg volumes. The first silver greaves vanished in the bake, so widened and
  brightened the actual metal cover plates; they now show in all frontal and
  rear bearings. The central grass gap and pose still need refinement.
- Desolator, Chrono Legionnaire and Spy: inspected again without a new edit
  in this segment. Their weapon support, action charge and walking posture
  respectively remain open.

## Human infantry follow-up, source interpretation correction

- Spy: enlarged the local `spy.gif` frame and compared the map bake. The
  drawn brown briefcase was an earlier interpretation, but no clear case is
  visible in this source; it made the map sprite carry a large invented side
  block. Removed it from the idle/walk art and left the exposed hand/coat
  unobstructed. The source frame is more action-like than a neutral idle, so
  do not copy its reaching arm onto every bearing without checking animation.
  Both legs remain visible but the live walking posture is still stiff.
- Chrono Legionnaire: widened/re-angled the red shoulder-to-waist equipment
  harness under the pale shell, then re-opened the enlarged eight-bearing
  board. It is still mostly occluded by the foreground rifle: the reference's
  vivid vertical-diagonal upper accent remains weaker in our bake. This
  iteration is a checkpoint, not acceptance.
- Desolator: enlarged the reference/gameplay board. A manual bent-leg trial
  created a large apparent grass gap and detached boots, so it was rejected
  after visual inspection. Returned to the shared walking-leg assembly with
  closer-set, fuller charcoal trousers; the two legs now connect to the body,
  but the idle stance is still too straight compared with the source.
- GI and Conscript: viewed both at enlarged bake and live-map size. The GI's
  previous all-green thighs were visually too loud beside the RA2 dark trouser
  mass; darkened main cloth and restricted olive to a narrow side panel.
  Conscript's V legs had no continuous trouser seat; added a brown hip volume
  behind the two independent legs. Both still need more convincing gun/arm and
  knee motion; this is not a likeness verdict from a colour or shape metric.
- Engineer and Guardian GI: enlarged both bakes again. Engineer's source has
  pale outside sleeves, tan work trousers, a red vest and a hanging red case;
  ours still compressed the shirt into red, so widened/lightened exposed
  sleeves, reduced the red shoulder mark, lifted the case and trouser values.
  The bake now shows pale sleeves and red case, but actual-map clothing remains
  small and lower legs still dark. Guardian GI's enlarged launcher receiver
  is attached to the shoulder and reads as a heavy weapon, yet hands/leg stance
  remain too static. No user acceptance inferred.
- Flak Trooper and Rocketeer: enlarged reference and eight bearings. Flak's
  pale upright cannon still has a dark lower receiver/shoulder relation;
  its tan legs and supporting hand remain stylized. Rocketeer's wider side
  pack tanks previously ended above two separate hip nozzles; added neutral
  metal feeder supports behind the suit to connect the pressure pack to
  the nozzles. The connection is visible enlarged but subtle at live size.

## Human walk-pose and large-form review (additional pass)

- Compared source GIFs against enlarged current walk bakes at two opposite
  stride phases for GI, Conscript, Yuri and Tesla Trooper. The first manual
  gait displaced both feet together, leaving either a wide grass wedge or
  a merged single leg. Reworked each as a leading leg plus tucked trailing
  leg. At both reviewed phases the leg-to-hip connection remains visible;
  however their arm/knee motion still reads stiffer than the RA2 animation.
  This is a visual checkpoint, not acceptance.
- The compare-board script now keeps stand and walk pose images separately,
  and explicitly labels the lower live-map panel as stand poses. The upper
  baked pose is controlled by `CMP_STATE` and `CMP_PHASE`; no scalar score
  was used to decide whether the pose looks right.
- Crazy Ivan: RA2 source shows a short red upper garment, exposed arms and a
  small handheld object. Our neutral brown shirt and bright tan bundle made
  him read as a hooded worker carrying an orange block. Darkened the shirt,
  restored a stronger red hat/upper garment, enlarged the visible pale arm
  surface and toned down the bundle. Enlarged visual comparison confirms the
  upper red read is stronger; the face/prop and motion still need work.
- Engineer: source has broad pale sleeves outside a darker red waistcoat,
  long khaki legs and a hanging red toolbox. Narrowed the bright red area,
  moved the white sleeves farther outside and re-opened the bake and live
  map. Sleeve separation is clearer in the enlarged bake; at game scale it
  remains faint, so the unit is still pending.

The other human units inspected in the enlarged stand boards remain open as
well: Tanya's warm upper mass does not yet read as the source dark shirt;
Desolator's legs are straight posts; Flak Trooper and Guardian GI need better
hand/weapon support; CLEG's red rig is hidden; Spy and Yuri remain stiff;
Rocketeer's pack connection is subtle at map scale. Do not treat comparison
generation or syntax checks as a visual acceptance gate.

## Further human visual loop

- Desolator: built an articulated sealed trouser trial, opened stand and walk
  boards, and rejected it. The first trial left a large green triangle below
  the armour; narrowing it merged both legs into a grey slab. Restored the
  earlier separate-leg helper. Also narrowed the overall upper-body scaling
  after reopening the source/current board: pack and side emitter now carry
  more of the silhouette, rather than a uniformly wide red torso. Lower-body
  pose remains a major open defect.
- Guardian GI: the old reduced stature made the soldier look like a miniature
  under a full-size launcher at game scale. Raised the human body while keeping
  the launcher shouldered; stand and walk boards show a more credible human
  height, though the visible hand/leg support is still too rigid.
- Flak Trooper: compared its upright cannon and soldier to the source again.
  Added a bent front arm ending at the breech rather than leaving the cannon
  as a vertical pole beside a straight-armed soldier. The support is visible
  enlarged at the front/three-quarter bearings but faint at live-map size;
  weapon handling and gait remain pending.
- CLEG: routed the red equipment harness nearer the edge of the pale chest
  shell so the foreground rifle would not hide all of it. Enlarged board shows
  only a small improvement; the source's strong red shoulder-to-waist feature
  is still not present at gameplay size. A lower gun trial left the rifle at
  the waist and was reverted after opening the image. Not accepted.
- Tanya: restrained the grey cloth highlight so the upper shirt stays dark.
  A trial with paler bare arms quantized to a loud orange/yellow in the actual
  bake, so it was reverted after opening the image. Her upper colour/material
  read is still too warm overall.
- Spy: his two shoes and knees had previously received the same walking
  translation. Gave the leading and trailing legs different positions while
  leaving the swaying coat in front. Both feet remain connected in the viewed
  walk board; the source's more animated civilian arm/coat pose remains open.
- Yuri: reduced the stretched height and broadened the grey-uniformed body.
  The opened stand board reads as a more compact soldier with red shoulder rig
  and separate grey trousers; one side bearing still opens too much green
  through the legs, so it is not accepted.
- A common shin-overlay experiment was also rejected: viewed stand boards
  showed green-looking Engineer shins and purple-looking CLEG greaves, with
  no convincing new knee bend. The overlay was removed before handoff.

These judgments came from opening the RA2/current boards and live-map panels,
not from a likeness score. Every human infantry unit remains pending.

## Not yet visually reviewed in this pass

- Vehicles: none uninspected in this pass; several above remain pending.
- Aircraft: none uninspected in this pass; Kirov above remains pending.
- Infantry: all keys inspected in this pass; most above remain pending refinement.
- Ships: none uninspected in this pass; most remain pending refinement.
- Structures: `airforce`, `barracks`, `base`, `chrono`, `cloningvats`,
  `curtain`, `depot`, `factory`, `flakcannon`, `gapgen`, `gate`,
  `grandcannon`, `lab`, `nuke`, `patriot`, `power`, `prism`, `psisensor`,
  `purifier`, `radar`, `reactor`, `refinery`, `sentry`, `sentrygun`,
  `shipyard`, `spysat`, `tesla`, `wall`, `weather`.

"Not yet reviewed" does not assert that a unit is bad or good. It marks the
remaining inspection and redraw work under the user's one-by-one request.

## Continued infantry visual review

Opened the local RA2 image, eight current bearings and live-map panel for all
thirteen human infantry. The enlarged sheet is a way to see parts; the map
panel is the actual readability check. No silhouette number was used to
declare a visual match.

- G.I.: the carbine was held too low and diagonally by the hip. Raised the
  shoulder/stock end to put the weapon across the upper body. Front and side
  stand bakes read closer to the source. The pose is still stiff.
- Conscript: a wide green V divided the brown trouser legs below the tunic.
  Extended the seat fabric and brought knees/boots closer, then opened stand
  and walk. A proposed dark crotch patch created two hanging stripes and was
  immediately discarded. Brown lower-body structure is more continuous, but
  the stance remains too rigid.
- Tesla Trooper: the source has silver guards from knee to boot, whereas ours
  had barely visible knee dots over black shins. Widened the greaves and
  removed a consuming outline. The opened board now shows connected neutral
  silver armour; the guards still appear narrower than the source.
- Crazy Ivan: the bright grey waist hem and tan arms made the upper body look
  like another blocky equipment carrier, while the reference has a red short
  top and pale exposed arms. Darkened/shortened the hem and cooled/lit the arm
  skin; stand and walk remain leggy and the bundle is still too box-like.
- Tanya: opened RA2/current again and found the overall upper body was orange
  at actual game scale despite a dark-shirt fill in code. Replaced the warm
  shared skin with a locally neutral pale tone, reduced arm thickness so the
  dark shirt reappears between the arms, then opened stand and walk. The
  orange dominance is reduced, but the present pink-grey arms are still less
  clear than RA2's pale skin. Not accepted.
- Guardian G.I., Rocketeer, Flak Trooper, CLEG, Engineer, Spy, Yuri and
  Desolator were also re-opened against their RA2 sources; no acceptance
  claimed. Spy's blue-side coat remains too black, Desolator's legs too
  straight, CLEG's red chest rig too faint, and Rocketeer's lower jet/legs
  too elongated. Those are structural work for the next visual loop.
- Desolator follow-up: the RA2 sprite shows red trouser material above dark
  boots, not two all-black stalks. Put red suit thigh panels on the existing
  articulated gait and opened both stand and walk. The visible upper legs
  now belong to the red suit and swing with the feet; lower boots still read
  overly vertical in stand. Not accepted yet.
- Rocketeer follow-up: shortened the hanging grey leg columns and lifted the
  toe-down boots after comparing the compact RA2 hover body with ours. Opened
  the eight-direction board and live-map panel; he still has a longer,
  cleaner lower silhouette than the source, so this is a proportion step,
  not acceptance.
- Spy follow-up: the neutral cloth of the open coat was near-black, hiding
  the lapels and skirt inside the dark hat/body mass. Lit the coat-facing
  material to a middle neutral grey and opened the board again. A dark
  fedora over now-visible coat panels is clearer in-game. The coat still
  needs a more natural civilian swing; no acceptance claimed.

## Next infantry check against the pictures

- Chrono Legionnaire: RA2 shows a red shoulder-to-chest equipment assembly
  seated over the pale suit. Ours had a tiny collar ring and a left-edge
  stripe; the gun hid the rest. Added a connected horizontal shoulder harness
  and centre strap above the rifle, then opened stand and walking bearings.
  The red cross-piece is now visible; at live-map size it is still delicate.
- Tanya: the first neutral-gamma trial made the entire figure grey; a warmer
  skin trial then snapped olive. Both were visibly worse and reverted. A
  direct colour precompensation trial made her chest pink and was also
  reverted. Kept a pale narrow light along each bare arm instead, after
  opening its result: hands/arms read better against the dark top without
  repainting the whole figure. Her chest still has a reddish cast, so no
  acceptance.
- Spy: enlarged walk board confirmed that his coat was too static relative
  to the stepping feet. Increased the tail's gait sway and opened walk-p2:
  the hem now follows the legs more clearly, but the reaching upper-body
  action in RA2 is not yet matched.
  Lowering his torso and shortening both sleeves was tested on walk-p2; the
  coat covered too much of the feet and still did not create a real reaching
  pose, so that body shift was discarded.
- Conscript: re-opened both stand and walk after the prior crotch fix. The
  reference has broad connected rust-brown trousers; ours still had a tall
  green opening and thin brown sides. Thickened the thigh and shin volumes
  locally, then brought knee/boot anchors in a little. The viewed stand now
  has less grass between the legs; walk still shows two separate boots and
  a stiff upper body. Not accepted.
- G.I.: opened the stand/walk RA2 comparison after raising the gun. The local
  RA2 image carries broad muted olive trouser fabric; ours was mostly near-
  charcoal legs with tiny bright strips. Shifted the actual thigh and shin
  cloth to restrained olive, then opened the eight bearings and game-size
  panel. The palette now separates jacket from trousers more clearly; pose
  and body proportions still need work.
- Crazy Ivan: the RA2 reference and small cameo show a red short top, pale
  exposed arms and a fistful of bound sticks; ours put a large gold suitcase-
  like square at one hand. Changed the sticks to warm brown tones and narrowed
  the bundle into a taller bound cluster. Re-opened the stand board, then
  broadened the entire figure because the previous bake was an extremely
  skinny red head on two long bars. Opened stand and walk after that: the
  upper body now has more credible mass, the fuse/bundle is no longer a large
  gold box, and both feet survive the gait. Legs remain somewhat long.
- Guardian G.I.: after the earlier height adjustment, the launcher bearer
  remained an arm-and-gun shape over a narrow body. Broadened the armoured
  human body under the shouldered tube and opened stand, walk and live-map
  panels. The launcher continues to sit on the shoulder across bearings;
  the bearer now has a more substantial stance. The reference's exact upper
  armour layout still needs a closer redraw.
- Tanya follow-up: after the neutral and strongly warm channel settings both
  failed visually, tried a smaller warm bias and re-opened stand and walk.
  This kept the pale exposed arms while returning the trousers toward muted
  olive rather than a pink/dark blob; the upper vest is still not as clearly
  black as the RA2 reference. This remains pending, not accepted.
- Rocketeer: compared the RA2 hover sprite again and saw a grey-white suit
  framing a smaller red chest equipment patch, whereas ours had a red plate
  nearly filling the torso. Narrowed that plate without removing the red
  backpack tanks, then opened the full eight-bearing and live-map board.
  The white pressure suit is clearer; pack/nozzle and lower-leg relationships
  still need refinement.
- Yuri: the local source and RA2 action read give a psychic attacker raising
  both hands to the temples. The old fire bake kept the same downward arms as
  stand. Gave the fire state two connected raised grey sleeves and bare hands,
  leaving the bald crown clear. Opened the fire eight-bearing board to check
  arm attachment and head occlusion; stand remains unchanged. The source PNG
  is a gameplay still, so attack likeness is not yet independently accepted.
- Conscript arm trial: a bent extra forearm to the rifle looked attached in
  one front bearing but protruded as a third dark arm when the soldier turned.
  It was removed after opening the eight-bearing sheet. A proper arm pose
  must replace, not overlay, the hanging sleeve.
  Followed that finding: on the visible front and side bearings, replaced the
  two generic hanging sleeves with shoulders, projecting elbows and hands
  meeting the carried rifle; rear bearings retain the normal trailing arms.
  Opened stand and walk boards. The third-arm protrusion is gone, both legs
  still walk, and the gun now has a person supporting it. The front still
  reads blocky at game size, so this is not acceptance.
- CLEG follow-up: tried a thicker shoulder band but it stayed largely hidden
  under the collar and pauldrons. Lowered the cross-piece onto the exposed
  upper chest and re-opened the board; a red strip now survives above the
  carried rifle without repainting the pale armour. Still subtle in the map
  panel; not accepted.
- Flak Trooper: source's lower body is brown trouser cloth beneath the upright
  cannon; ours was mostly two very narrow orange sticks. Widened the actual
  trouser legs and boots without changing the cannon silhouette, then opened
  stand and walk. The gait still has two feet and the barrel remains seated
  beside the head; lower-body bulk is somewhat closer but still tall.

### Tanya — user correction: open arms and two pistols

- Extracted and opened the local Tanya animation as a contact sheet. The
  former review board showed only its first idle frame; that was insufficient
  for understanding her weapon pose.
- Replaced the generic downward sleeves and muzzle-down gun marks with two
  articulated bare arms, independently held pistols, and distinct ready/fire
  hand heights. The far arm is painted behind the torso; in side views both
  hands extend beyond the chest, keeping both guns visible.
- Removed Tanya's unequal RGB gamma. Authored black cloth, pale skin and
  olive trousers directly; shortened and tapered the top to restore a waist.
- Opened stand, walk phase 2 and fire phase 2 in all eight bearings, with the
  live game-size stand panel. Iterated after seeing the far arm cross the
  chest/face in the first attempt. No acceptance is inferred from these edits.
- Tesla Trooper: widened the silver shin guards and opened the comparison;
  the knee-to-boot material is clearer. The chest still needs a rounder form.
- Desolator: extracted the reference animation. It exposes a substantial
  shoulder-borne cannon and a forward-leaning dark-suited figure, unlike the
  current straight red torso and tiny chest-level emitter. This is the next
  structural correction; no rewrite had landed at this checkpoint.

### Follow-through: weapon support, human stance, and the roster sheet

- Desolator: rebuilt the dark pressure suit, articulated legs, coloured knee
  guards, small sealed head, green equipment chamber and shoulder cannon.
  The first barrel was visibly too large and covered the head; reduced its
  diameter/length, made the front carry angle steeper, and foreshortened the
  firing barrel. Opened stand, walk and fire boards after these corrections.
  Green chamber placement follows the visible animation; its internal
  function is not established by the local reference.
- Spy: opened a contact sheet of the source animation before rebuilding.
  Removed the oversized brim and blue coat rails; used a continuous neutral
  charcoal coat, peaked lapels, separate moving tails and trouser legs.
  Bent empty hands and a slight forward lean replace rigid hanging sleeves.
  Opened stand/walk, including rear and profile. Removed the unequal channel
  gamma that made grey cloth change material colour.
- GI: opened the original animation frames. Tapered the vest into the waist,
  connected short sleeves to exposed forearms and rifle grips, and moved the
  rifle behind the body on rear bearings. Rebuilt knee/ankle/boot positions so
  walking includes a lifted trailing foot. The complete roster sheet exposed
  a firing rifle above stationary hands; raised the elbows/grips to follow it.
- Conscript: rebuilt the same hip/knee/ankle continuity in his own trousers,
  shortened the solid trouser seat so it no longer extends to the knees,
  and moved the rear-view rifle behind the torso. The first brown recolour
  remained orange after palette processing. Equal-channel gamma and explicit
  muted red-brown fills survived the final bake; opened that result. Raised
  the supporting arms for fire after the roster review.
- Tesla Trooper: rounded the breastplate with a curved lower edge and a
  broad curved light plane instead of a centre stripe. Opened the board again
  to inspect the chest together with the previously widened silver greaves.
- Added `node tools/infantry-review.js`: all 13 human infantry types, eight
  standing bearings, front/side walk and fire samples at fixed 3x. Opened the
  resulting `art/out/infantry-review.png`, corrected the firing arm attachment
  noted above, then regenerated and opened it again. Enlarged row spacing
  after the tall Flak barrel crossed into the preceding row on the first
  sheet. The sheet is visual evidence, not a likeness score or user acceptance.

### Refinement pass: volume, material and small highlights

- Reopened the GI reference animation and rebuilt the figure: curved/tapered
  vest, smaller steel helmet, connected short sleeves and forearms, supported
  rifle, articulated olive fatigues and planted leather boots. Broad shading
  planes follow the body rather than adding outlines to rectangular fills.
  Opened stand/walk/fire; corrected the first attempt's rear forearms crossing
  the torso and its steel helmet being remapped into cloth/skin colours.
- Traced the visible colour defects into the bake. Histogram merging removed
  one- or two-pixel authored material highlights; a warm-colour heuristic also
  zeroed blue and created orange marks on brown trousers. Human infantry now
  uses 16 channel levels with explicit surface-colour preservation, bypassing
  those colour heuristics and frequency merging. Other callers retain the
  original behaviour; accepted vehicles and the dog are outside this change.
- Tanya retains two open arms and independent pistols. Refined her curved
  black shirt and replaced silver-looking thigh pouches with olive cloth.
  Conscript jacket and brown trousers now have shaped light/shadow planes;
  reopened the output after removing the orange-colour artefacts.
- Engineer: opened the original/current board, then replaced the rectangular
  bib and straight trouser bars with an open fitted waistcoat, pale sleeves,
  independent knees/ankles, shaped boots and a curved hard hat. The tool case
  hangs from a handle connected to the hand. Removed his old unequal-channel
  value pass so explicit shirt/khaki/hat materials survive. Opened all eight
  stand and walk bearings and the live game-size stand panel.
- Regenerated the 13-type overview after these edits. Parsing and diff checks
  pass, separately from visual review. This is an iteration, not a claim that
  the entire human roster has reached RA2 quality or received user acceptance.

### Leg visibility and grounding — user-reported Spy grey wash

- Opened Spy's original animation contact sheet and current eight-bearing
  board. His broad mid-grey trousers blended into the grass and the coat
  covered the upper leg split. Replaced the grey wash with dark blue-charcoal
  cloth, narrow creases, wider separate legs, shorter split coat tails, and
  black shoes with small upper planes above the contact shadow.
- Reviewed all 13 human types in the roster sheet for the same problem.
  Yuri received darker trouser bodies and explicit connected ankle/shoe
  highlights. Guardian GI received more separated olive legs. Chrono
  Legionnaire's lower armour was rebuilt with independently moving pale
  thigh/shin plates; knee trim now follows the knees instead of bridging them
  in torso coordinates. Boots stay dark and connected to the ankle.
- Shared humanoid legs now retain a small shoe-upper plane while standing,
  not only in a leading walk frame. Opened the complete sheet to inspect its
  effects on Tanya, Flak Trooper, Crazy Ivan and the other callers. Rocketeer's
  intentional airborne posture and accepted vehicles were not changed.
- Opened Spy, Yuri, Guardian GI and Chrono Legionnaire eight-bearing walking
  comparisons and game-size panels. Syntax and diff checks pass separately.
  These fixes address leg/ground readability, not acceptance of all other art.

### Yuri identity correction

- User rejected the generic bald-soldier appearance. Reopened both local Yuri
  gameplay reference and cameo. The earlier interpretation of the lower grey
  body as trousers was wrong: the visible garment is a long tunic with dark
  lower legs/boots, red shoulder accents and coloured hem corners. This
  supersedes the earlier grey-shirt/red-vest description in this log.
- Rebuilt Yuri around that long, split tunic; removed the broad red vest,
  oversized neck frame, blue trousers and idle purple dots. Narrowed the bald
  head, exposed the neck and retained a small goatee. Dark boots remain under
  separate moving legs. Raised hands and restrained psychic highlights are
  limited to attack. Opened stand, walk and fire in eight bearings plus the
  live game-size stand panels. Added separate coloured hem corners afterward.
- The local gameplay reference is a still; it supports outfit and proportions,
  not a frame-accurate attack animation. No user acceptance is inferred.

### Crisp infantry raster and display pass

- User asked why our infantry looks fuzzy compared with RA2, then authorized
  the rendering correction. Opened GI/Spy reference comparison boards before
  changing the bake and saved those boards as `rifle-before-crisp.png` and
  `spy-before-crisp.png`; roster snapshot is `infantry-before-crisp.png`.
- Human infantry now bakes to a fixed logical pixel grid independent of DPR.
  Body coverage is opaque or transparent; the ground shadow is rendered
  separately and composed behind the finished body. This avoids treating
  shadow-contaminated ankle colours as cloth and preserves soft shadows.
- Replaced independent RGB rounding with a small explicit material palette
  plus owner-colour ramp. Corrected an initial rgb()/hex parsing bug that
  turned team red brown, and removed a purple ramp wrongly selected for Spy's
  dark cloth. Reopened the corrected GI/Spy boards and complete roster.
- GI additionally uses integer-grid connected strokes for the rifle, arms
  and small highlights, plus three authored shading bands instead of smooth
  gradients. This is an art-authoring change as well as a display change.
- Live draw uses nearest-neighbour sampling and device-space origin snapping
  only for the new human-infantry sprites. Vehicles, ships, aircraft, dog and
  terrain retain their existing paths. Fractional zoom still has uneven pixel
  replication; origin snapping avoids fractional placement, not that inherent
  non-integer-scale tradeoff.
- Opened GI stand/walk/fire, Spy stand/walk, Tanya fire and the latest full
  roster. Tanya's two guns and the independent walking legs remain visible.
  These are crispness/readability improvements, not complete RA2-art acceptance.
- `node tools/infantry-crisp-check.js` passed: 624 sampled frames match across
  DPR 1/2, with native grids, opaque body coverage, red team-colour preservation,
  and unfiltered device-aligned live draws at zoom 1, 1.35 and 2. Syntax and
  diff checks pass. None of these checks is a likeness score.

### Tanks and aircraft clarity follow-up

- User: “much better. keep improving. also improve all tanks and flights”.
  Preserved accepted vehicle proportions; extended native raster/display work
  to Grizzly, Rhino, Apocalypse, Mirage, Tesla, Prism, IFV, Flak Track, V3,
  Harrier, Hornet, Nighthawk and Kirov. MCVs, miners, ships and dog unchanged.
- Removed whole-surface metal grain for these ground vehicles. Twelve channel
  levels with authored surface colours retained replace the six-level colour
  merging/hue correction. This is not the infantry's skin/cloth palette.
  Existing translucent shadow treatment remains; no blanket opacity snapping.
- Hull and turret live layers now share nearest-neighbour sampling and the
  snapped hull anchor. The IFV mesh rasterizer now uses its destination raster
  ratio: an initial DPR comparison exposed its old global-DPR dependency.
- Nighthawk cabin planes are lighter, and its front now has two sloped glass
  panes with a metal centre post. Rejected the first revision's bright oval
  window because it read as a lamp. Preserved the tail boom and rotor geometry.
- Opened all thirteen source/current comparison boards, including eight
  bearings and live map panels, plus native/2x tank and aircraft contact sheets.
  The contact sheets include the alternate rotor and unloaded Harrier variants.
  Kirov's accepted oval nose, mouth and hanging bombs remain intact.
- Reproduction: `node tools/vehicle-crisp-check.js` generates
  `art/out/tanks-crisp-review.png` and `art/out/aircraft-crisp-review.png`, and
  checks 32 bearings, both owners, separate layers and flight/IFV variants for
  native dimensions, DPR-independent pixels and unfiltered live sampling.
  These checks establish rendering behaviour, not final RA2-art acceptance.

### Nighthawk palette and Flak Track barrel correction

- User rejected the Nighthawk's greyish appearance. Changed body/boom to a
  stronger owner-colour paint ramp (blue for Allied owner 0), with ivory alloy
  roof/door panels and cyan cockpit glass. Tail rotor now uses opaque alloy
  rather than a translucent grey stroke. Geometry is unchanged.
- User identified the Flak Track's “two guns glued together”. Inspection found
  an explicit two-tube loop in the art, not just a display artefact. Replaced it
  with one continuous shaded silver barrel and one dark muzzle. Preserved its
  cradle, elevation, front wheels and rear tracked bogies.
- Opened both updated reference boards: all eight bearings and live game-size
  views. Vehicle raster/layer checks pass at DPR 1 and 2 (2,432 frames/layers).

### Nighthawk: remove toy-like livery

- User rejected the blue/ivory revision as cheap and toyish. Replaced the
  whole-body owner-colour ramp with restrained steel-blue paint and dark
  underside planes; owner colour is confined to smaller markings. Removed
  broad ivory roof/door areas and bright cyan glass.
- First muted revision still looked uniformly shaded. Added narrow cabin
  shoulder highlights and recessed side-door windows, with darker cockpit
  glazing. These separate materials without flooding the body with highlights.
- Opened the source/current eight-bearing and live-scale board after both
  iterations. Vehicle DPR/layer checks, syntax and diff checks pass. This is
  a reviewed revision, not user acceptance of the Nighthawk.

### Mirage identity and release checks

- User found Mirage too similar to Rhino. Opened the actual Mirage voxel
  reference: paired tall pale side housings surround a low olive gun assembly,
  with a dark finned radiator behind. Replaced the round cap/cupola and small
  pods with those connected volumes; kept tracks visible and flank paint low.
  Opened the revised eight-bearing/source/live board. Vehicle checks pass.
- Release hook exposed a simulation canvas stub missing getTransform; added
  its identity counterpart to the existing no-op transform stubs. Added a
  finite-coordinate guard to GI's pixel stroke to prevent invalid input loops.
- Replaced the obsolete source-colour heuristic (every low-saturation literal
  treated as grey on a hypothetical six-level grid) with tests executing the
  actual palette processor: neutral preservation in all modes, bounded colour
  quantization across authored palettes in 12/16-level modes, tiny material
  accents and translucent shadows. No art baseline regenerated for this release.

### Mirage silhouette follow-up (after release)

- User still found the Mirage indistinct. Replaced the two flat-topped pods
  with faceted wraparound shells descending from high inner shoulders to the
  outer chassis, with a recessed olive centre. Replaced the round barrel with
  a broad olive shroud and dark muzzle. Removed generic bright bumper/lamps
  and disabled Mirage's surface value lift to keep its dark/pale contrast.
- Opened the first render and corrected over-tall shells and a hidden muzzle;
  reopened the lower-shell/extended-shroud revision in eight bearings and live
  game scale. Vehicle DPR/layer tests and module/palette tests pass. Local
  revision only; this follow-up has not been committed or deployed.

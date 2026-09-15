# RTS unit art: persistent user preferences and lessons

These instructions apply to art work in this project. They record explicit user
feedback from the RA2 vehicle redesign sessions.

## Reusable workflow for every new item

1. Open the actual RA2 reference and our in-game render at matching bearings.
   Read the unit as a machine: name each major volume, its plausible function,
   where it attaches, what it supports, and which parts move. Mark any uncertain
   interpretation as a hypothesis, then inspect more views before committing.
2. Establish the full length/width/height, mass, stance and silhouette with
   connected body volumes. A long nose cannot compensate for a short carrier;
   a raised box cannot compensate for missing chassis and running gear.
3. Construct the functional assembly from root to working end. A continuous
   conveyor, cradle, turret mount or boom must read as one connected mechanism;
   do not replace a misunderstood structure with decorative holes, seams or
   dots. Use distinct materials only where a real material or component changes.
4. Render again at fixed magnification. Compare source/current front, side,
   rear and three-quarter views, then inspect the actual gameplay size, every
   bearing, and relevant action poses. Check occlusion, clear wheels/tracks,
   component continuity, material consistency, and palette-quantized colours.
5. Fix the largest remaining visual mismatch and repeat. Technical tests may
   establish parsing, clipping and colour invariants; they cannot certify RA2
   likeness. Do not hand off while a known major shape/function mismatch remains.

The Chrono Miner glass hemisphere and the War Miner inclined intake illustrate
this method, but their mechanisms are not templates for unrelated units. Read
each new item independently.

The two RA2 MCVs also must be read independently: the Allied MCV is a
three-axle wheeled construction carrier with a full blue folded works module;
the Soviet MCV reference `docs/ra2-ref/sprites/library/mcv-col.png` is a red,
silver and dark **tracked** carrier with distinct front/rear track bogies and
folded machinery. Soviet art must not be an Allied truck with a new palette.

The Allied Destroyer's stern carries a parked aircraft that can take off and
attack submarines. It is a functional airframe, not a yellow deck marking:
its fuselage, spanning wing and two engine/rotor nacelles must connect and
remain visible at game size. The Soviet Dreadnought's two missiles sit parallel
and side by side at the same fore/aft station; do not stagger them to make
one appear ahead of the other.

## Understand the reference before drawing

- The goal is RA2-like units with coherent components, functions, shapes and
  colours. A pixel-for-pixel copy is not required.
- Before changing art, open the actual RA2 reference images and the current
  rendered unit. Inspect matching front, side, rear and three-quarter views.
  Use nearest-neighbour enlargement when the original sprites are too small.
- Identify the major components, their functions, connections, support points,
  relative sizes and heights. Establish the overall stance and silhouette first.
- Separate confirmed facts from guesses. Verify uncertain component functions
  using available references or animation; do not invent a mechanical explanation
  and then treat it as evidence.
- User-confirmed correction: the Allied Chrono Miner's front is a hemispherical
  GLASS DRIVER CAB. It is not a harvesting drum, a purple mechanical core or two
  solid silver cylinders. Its dark curved glazing, silver framing and enclosed
  volume must read as one cab. The harvesting assembly sits below/in front of it.
- Read each faction's miner independently. Do not assume the Soviet machine uses
  the same front mechanism or teeth as the Allied machine.
- For the Soviet War Miner, the user asked whether the long, sloping front is a
  conveyor belt and then directed a redraw on that basis. Treat it visually as
  a ground-level intake feeding an inclined, continuous conveying path toward
  the hopper: silver side guards, darker central belt, and a broad scoop. The
  exact internal mechanism is not officially verified; do not turn this visual
  model into a claimed RA2 mechanical specification or decorate it with fake
  punched holes.

## Work from large forms to details

- First establish the load-bearing chassis, running gear, cab, cargo body and
  working equipment as simple volumes. Compare their combined stance to RA2.
- Fix incorrect overall proportions and component relationships before adding
  seams, ribs, holes, highlights or texture. Details cannot rescue wrong forms.
- User explicitly identified both miners as too short and disproportionate.
  Review full vehicle length against width and height first, especially side
  and three-quarter views. Lengthen connected chassis/cargo/working sections,
  not just the nose or the final bitmap. Preserve the hemispherical cab.
- Preserve plausible volume and weight: the user's accepted MCV needed a full,
  raised upper body and a substantial chassis, not a flat or sunken back.
- Wheels and tracks must remain visible and structurally connected. Use
  consistent materials across front/rear running gear. Avoid arbitrary grey
  blocks, colour speckles and mismatched wheel colours.
- Check actual palette-quantized output. A neutral metal colour must not turn
  blue, purple or green through shading. Glass, painted panels, bare metal and
  rubber should remain visually distinct.
- Diagnose post-processing before repeatedly recolouring components. Miners
  now use a restrained 1.05 value lift, 16 channel levels and no whole-sprite
  metal grain; the former fleet-wide treatment flattened planes and marked
  glass as metal. Keep such changes miner-specific. Neutral steel still uses
  equal RGB channels; cargo metal may use warm gold/brown tones.

## Visual review is required

- User-confirmed Tanya feature: two open, outstretched bare arms, each holding
  its own pistol. Preserve this pose and check both guns in front, quarter,
  side and rear views, including firing. Generic hanging arms with tiny
  muzzle-down marks at the hips lose her identity. Inspect animation frames,
  not just the GIF's initial idle frame, before deciding how weapons are held.

- After each meaningful structural change, render and OPEN the output alongside
  the RA2 reference before declaring improvement or moving to finer detail.
- Review multiple bearings and actual in-game scale. Look for disconnected
  parts, bad occlusion, flat masses and loss of essential features.
- User identified Spy's broad shaded-grey legs as disappearing into terrain,
  making him appear to float. Check every ground infantry's continuous
  hip/knee/ankle/shoe, visible leg split and foot contact at game size. Keep
  cloth body colour distinct from the terrain/shadow; use restrained surface
  highlights rather than washing whole legs grey. Knee bands must move with
  their own legs, not bridge the gap as torso-space decorations.
- Keep comparison magnification fixed between iterations. Enlarge review tiles
  when required; auto-fitting longer units hides the very proportion change
  being reviewed.
- For human infantry, preserve the fixed logical raster and separate ground
  shadow in `bake/infantry.js`. Opaque body pixels and nearest-neighbour,
  device-aligned live draws prevent faded limbs and display blur. More gradient
  stops or higher DPR is not a substitute for deliberate material planes and
  connected pixel shapes. Inspect palette changes for shifted skin/cloth/steel
  and owner colours; colour strings may be hex or rgb(), so use `rgbOf`.
- The user approved the infantry crispness direction and requested the same
  improvement for tanks and aircraft. Preserve their accepted geometry while
  removing display filtering and whole-surface grain. Vehicle metal/glass needs
  its own colour treatment, not the infantry skin/cloth palette. Layered hulls
  and turrets must share a native grid and snapped display anchor; mesh helpers
  such as IFV must derive raster scale from the destination, not global DPR.
- Nighthawk's grey-green airframe was explicitly rejected as fuzzy. Keep its
  painted body, light alloy panels, cockpit glass and dark rotors distinct.
  The subsequent saturated blue/ivory scheme was rejected as cheap/toyish.
  Do not equate clarity with saturation: use restrained military paint,
  recessed dark glazing, narrow structural highlights and local team markings.
  Flak Track's duplicated parallel barrels were also rejected: preserve one
  connected AA barrel and one muzzle, not a twin-tube or tuning-fork shape.
- Compare matching bearings directly: the miner board now pairs each source
  crop with its current render and also shows the extended harvesting poses.
- Keep both miners on one comparison image, with a shared scale for our unit
  renders, their RA2 references, and a shared gameplay scene. Generate it with:
  `node tools/ra2-compare.js chronominer warminer`
  Output: `art/out/ra2-compare-miners.png`.
- The user explicitly rejects silhouette-similarity numbers as the basis for
  deciding whether the art is correct. Do not optimize the design around them or
  cite them as proof of visual fidelity.
- Passing tests only establishes what those tests check, not that the art looks
  right. Report technical checks separately from visual judgment.
- Do not repeatedly overwrite `docs/art-baseline.json` to manufacture a passing
  result for an unaccepted visual iteration. Keep baseline updates deliberate
  and transparent; do not describe a recorded regression as an improvement.
- Use concise progress updates grounded in visible evidence. Avoid repeated
  claims that the direction is finally correct while major mismatches remain.
- User explicitly said not to stop while known material art problems remain.
  A render or a small edit is a progress checkpoint, not a handoff milestone.
  Continue the inspect/change/render loop until the requested work is complete
  or a genuine blocker requires user input.
- Inspect the full miner turntable as well as the paired reference board:
  `art/out/ra2-compare-miners-rotation.png` contains all 32 bearings in idle and
  mining poses for both units. Boundary checks catch clipping, not bad art.

## Reference locations

- Allied miner: `docs/ra2-ref/sprites/allied-chrono-miner.png`
- Allied miner construction views: `docs/ra2-ref/sprites/library/chronominer-voxel.jpg`.
  Inspect these alongside the sprite sheet: they expose the tapered hopper,
  raised front of the blue middle body, cab supports, and forward lower fingers.
- Soviet miner: `docs/ra2-ref/sprites/soviet-war-miner.png`
- Current art: `rts/units/vehicles/chronominer.js` and `warminer.js`

These instructions are project-local persistent guidance, not a claim of global
cross-project memory. Update them when the user supplies new confirmed facts.

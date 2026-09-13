// Iron Frontier — bake/vehicles.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.
























function bakeVehicle(col, kind, fac, anim) {
  var sov = fac === 'col';
  var dig = anim === 'mine';
  var TRK_TOP = '#4e535c', TRK_SIDE = '#2d3138', TRK_D = '#101316';
  var WHEEL_D = '#131519', WHEEL_L = '#7a808c';
  var BAND = '#cfd6de', STEEL = '#9aa0a8', CHROME = '#dfe3ea';
  var GUN = '#191b20', GUN_L = '#5b616b';
  // House colour lives in a narrow shade window: shade() clips the blue
  // owner to white-cyan past ~1.3, and anything under ~0.7 goes to mud that
  // no longer reads as a side. Everything that wants to be DARKER than that
  // (an outline, a shadowed lip) uses the neutral PEDGE instead of a
  // near-black tint of the player's hue.
  var panel = col, pdark = shade(col, 0.76), plit = shade(col, 1.22);
  var PEDGE = '#191b20';

  // Bins: tan (Allied) and golden (Soviet). Neither is chromatic, so the
  // player colour keeps the field to itself.
  var BIN = sov ? VACC.warminer : '#9d8a52';
  var BIN_E = sov ? '#4a3c1e' : '#3f3517';

  var hull, deck;
  if (kind === 'lancer')       { hull = '#626a7b'; deck = '#3e4450'; }   // slate-navy with a pale top, as allied-grizzly-tank.png (VLIFT lifts it)
  else if (kind === 'spectre') { hull = '#464e5d'; deck = '#30353f'; }   // dark navy-slate, as allied-prism-tank.png
  else if (kind === 'mammoth') { hull = '#555a51'; deck = '#373b35'; }   // cold olive-grey; low value and hard plane separation keep the Apocalypse severe
  else if (kind === 'ifv')     { hull = '#8588a2'; deck = '#7e8394'; }   // lavender-grey body, as the [FV] voxel render (VLIFT lifts it)
  else if (kind === 'mirage')  { hull = '#3f4552'; deck = '#262a33'; }   // dark slate-navy, as mirage.png
  else if (kind === 'rhino')     { hull = '#787a68'; deck = '#505342'; } // restrained olive gunmetal, as rhino.png; avoid the washed-out toy dome
  else if (kind === 'flaktrack') { hull = '#d2cfc0'; deck = '#c2bfae'; } // cream body AND bed, as soviet-flak-track.png
  else if (kind === 'v3')        { hull = '#9c9873'; deck = '#6a6748'; } // tan-khaki truck, as RA2 V3 Rocket Launcher.png
  else if (kind === 'drone')     { hull = '#9aa1ac'; deck = '#5a606b'; } // bare metal carapace
  // Measured off soviet-tesla-tank-sheet.png with its pale studio background
  // masked: the hull's own colours are #5a5542 at 7.6% and #6b694a at 5.5%,
  // median value 0.40 — a DARK olive iron. Ours was #909372 at 0.58, half
  // again too light, and a tank that light reads as painted tin rather than
  // as armour. The deck follows it down.
  else if (kind === 'teslatank') { hull = '#4e4c3a'; deck = '#2c2c24'; } // dark olive iron, as the sheet measures
  else if (kind === 'mcv')     { hull = '#5e5876'; deck = '#41464f'; }   // lavender-grey truck, as allied-mcv.png
  // NIGHTHAWK. This was '#31353d' matte charcoal, which put it at the SAME
  // value as the Harrier's airframe -- the one pair that failed
  // `tools/legibility.js` under all three windows. `docs/ra2-ref/cameos/
  // nighthawk.png` is not a black helicopter: it is a MID-TONE grey-tan
  // machine over pale ground, against a Harrier plate that is nearly a black
  // silhouette. Value, not hue, is what separates two grey aircraft at 20 px,
  // so the chopper carries the light end of the pair and the jet the dark.
  else if (kind === 'nighthawk') { hull = '#6d747e'; deck = '#363b43'; } // gunship grey, LIGHTER than the jet
  else if (kind === 'apc')       { hull = '#8a8d76'; deck = '#4d5042'; } // olive-grey hovercraft
  else                         { hull = sov ? '#4c515a' : '#40454e'; deck = '#2a2e35'; }
  // The Apocalypse carries a neutral charcoal shadow instead of a warm
  // olive one. It keeps the recesses and gun housings visually cold while
  // the mid-tone hull remains a restrained Soviet olive.
  var dark = kind === 'mammoth' ? '#1d2020' : shade(hull, 0.40);
  var turreted = kind === 'lancer' || kind === 'spectre' || kind === 'mammoth' ||
                 kind === 'ifv' || kind === 'rhino' || kind === 'flaktrack';
  // Deck height the turret ring stands on — per kind, facing-independent.
  // Every ring came down in art pass 8: measured against the RA2 sheets
  // our tanks stood 15-25% too tall for their length (Apocalypse 1.21 wide
  // per high against the reference's 1.41), and the deck the turret sits on
  // is where most of that height was.
  var RING = kind === 'mammoth' ? 7.6 : (kind === 'spectre' ? 6.4 :
             (kind === 'ifv' ? 9.5 : (kind === 'rhino' ? 6.1 :
             (kind === 'flaktrack' ? 9.0 : (kind === 'lancer' ? 6.8 : 7.4)))));

  // ── SIZE CLASS ────────────────────────────────────────────────────────
  // One uniform multiplier per kind, applied about the ground anchor, so a
  // vehicle's SIZE moves without a single proportion moving with it
  // (unit-identity-reference.md 1.1 rule 1: "size and aspect together carry
  // the first read, before a single detail is resolved"). It is a scale and
  // not a rewrite of `len`/`wid` precisely because the aspect work already
  // landed — the audit measures our vehicles at 1.01-1.53 against their RA2
  // references and that must not move.
  //
  // The numbers come from the reference's own measured broadside bodies
  // (1.1) times our 1.067 scale: Grizzly 54x23 is the flattest and lightest
  // thing on the ground, the Flak Track and IFV are a size class DOWN from
  // the tank line, the V3 is the longest, and the Apocalypse is the
  // heaviest. Where the reference and the readability bar disagree the bar
  // wins by a modest margin: RA2's own nine ground-combat vehicles span
  // only x2.04 by broadside area, which at our 0.55 minimum zoom is not
  // enough separation, so the two ends are pushed apart about 15% further
  // than the sprites measure. Anything beyond that stops looking like RA2.
  // The two MINERS are the correction this pass makes to the table above.
  // They were sized as tanks, and in RA2 they are not: [CMIN] is 55x28 —
  // aspect 1.96, the LOWEST body in the vehicle class — while [HARV] is
  // 56x48, nearly twice as tall on the same length. Ours came out 55x37 and
  // 74x61, i.e. a Rhino and a Mirage with bins on, and the gate scored
  // rhino|chronominer at 0.760 and mirage|warminer at 0.771, the two worst
  // vehicle pairs on the field. The Chrono Miner drops a class and gets
  // LONGER (see `len`/`wid`); the War Miner goes up one and gets SHORTER.
  // ── ONE SCALE FOR THE WHOLE GROUP (2026-09-07) ────────────────────────
  // The user, looking at the field: "some tanks are just too small, like
  // grizzly tank and ifv, while mirage and prism are huge. make them
  // uniform in sizes, same for russian tanks."
  //
  // Measured, they were right and it was not close. Broadside width over
  // RA2's own broadside width, per unit:
  //
  //   flaktrack 0.956  lancer 0.963  chronominer 1.000  ifv 1.060
  //   rhino 1.161  warminer 1.232  v3 1.270  mirage 1.322  drone 1.333
  //   teslatank 1.346  mammoth 1.492  prismtank 1.508  mcv 1.522
  //
  // RA2 draws every one of those at 1.00 by construction — its ground
  // vehicles run 45-69 px and its TANKS 54-59, a 1.09x band. Ours ran a
  // **1.59x inconsistency**: the Grizzly at 0.96 of its reference beside a
  // Prism Tank at 1.51 of its own, which is exactly the "some tiny, some
  // huge" the user is describing. Every VSC below is now `old x (1.2698 /
  // its measured scale)`, i.e. every unit sits at the group scale and the
  // roster's proportions become RA2's.
  //
  // THIS DELIBERATELY GIVES UP A SEPARATION CUE, and the two metrics that
  // were living on it say so — see `mass.groundCombatSpan` and
  // `mass.tightestBand6` in tools/art-metrics.js, both of which were set
  // ABOVE RA2's own figures on the argument that "RA2's own nine
  // ground-combat vehicles span only x2.04 by broadside area, which at our
  // 0.55 minimum zoom is not enough separation". That argument produced a
  // fleet whose sizes are not RA2's, and the user is the one looking at it.
  // Collapsing all thirteen onto 1.2698 exactly was TRIED FIRST and it is
  // not shippable: `iou.sameFactionOver75` went 0 -> 2 (Chrono Miner |
  // Mirage 0.779, Apocalypse | War Miner 0.754) and
  // `iou.groundCombat.mean` 0.4642 -> 0.5774. RA2 gets away with a flat
  // scale because its ASPECTS carry the separation instead — [CMIN] 1.96
  // against [RTNK] 1.51, [MTNK] 1.74 against [HARV] 1.17 — and ours are all
  // squashed toward the middle at 0.81-0.88 of their references, so with
  // size gone there is nothing left to tell those pairs apart.
  //
  // So the deviations are COMPRESSED to 35% rather than to zero: scale
  // spread 1.59x -> 1.17x, which is the visible half of the complaint (the
  // Grizzly goes 52 -> 63 px and the Prism Tank 89 -> 80) without spending
  // the cue that is currently doing the work. Closing the rest is an ASPECT
  // job on the units sitting at 0.81-0.88, not a size one; that is written
  // up in `unit-identity-reference.md` and is the honest next step.
  var VSC = kind === 'harv' ? (sov ? 1.000 : 1.150) : ({
    // The two the user named FIRST — "grizzly tank and ifv" — are pulled in
    // further than the rest (20% of their deviation kept, not 35%), because
    // they were the two furthest under and they are the ones being looked
    // at. The Grizzly can afford it: its aspect is 2.39, the most
    // distinctive in the group, so size is not what was separating it.
    // 2026-09-10: FITTED TO RA2'S OWN BBOX ON BOTH AXES (K = 1.15 of the
    // reference; `size.*` in art-metrics is the gate). The 35%-compression
    // above still left the roster 1.02-1.50x too TALL while the widths sat
    // at 1.01-1.21, and the user's eye read the heights: "small ones tiny,
    // big ones huge". Each value here puts the broadside WIDTH on RA2's;
    // the HEIGHT overshoot is taken out of the superstructures in the
    // per-kind blocks (crystal, boom, coils, drums, bin).
    // 2026-09-10 (2): the rips themselves, not the table. RA2's Grizzly is
    // 63x43 at the diagonal against the Rhino's 58x43 -- the SAME bulk, a
    // longer gun, a lower hull. Ours was 46x33 there: a sliver. And the
    // Rhino's broadside is 53 px to the Grizzly's 60: a SHORT squat tank.
    // 2026-09-11: the two line tanks still read too full beside the real
    // sheets. Pull the envelopes down before changing their identifying
    // guns; the Grizzly remains the long low wedge and the Rhino the broad
    // Soviet hull.
    lancer: 0.840, rhino: 0.820,
    flaktrack: 1.000, ifv: 1.300,                    // the light class
    teslatank: 0.950, mirage: 1.060, spectre: 1.100, // the mid specials
    v3: 1.180, mammoth: 0.840,                       // the longest / the heaviest
    mcv: 1.100, drone: 0.920, hornet: 0.45,
    // THE TWO AIRCRAFT, sized against RA2 rather than against each other.
    // Aspect is scale-INVARIANT, so the whole art gate was blind to a unit
    // drawn at the wrong SIZE until `size.*OutsideRA2Band` existed: RA2
    // draws [ORCA] at 71 px broadside against [SHAD]'s 64, i.e. the jet is
    // 1.11x the chopper, and ours were 52 against 86 — the Nighthawk 1.65x
    // the Harrier, the relationship INVERTED by 1.83x. The air group was
    // the worst of the four on this axis (spread 1.83 against naval's 1.06).
    // VSC is the right lever because it is PER KIND: the Harrier and the
    // Hornet share one `wing()` call and one `bodyL`/`bodyR`, so touching
    // that geometry moves both, and the Hornet's whole identity is "the
    // smallest thing that flies". Scaling here leaves it at 24 px untouched
    // — and its span/Harrier ratio goes 0.46 -> 0.40, TOWARD RA2's own 0.38.
    // 1.15 / 0.88 and not the 1.33 / 0.73 that would land both on the group
    // median: `peerVsSelf.air` is the ceiling and it binds hard. See the
    // per-unit art log — the two aircraft's masks are similar enough that
    // once their sizes converge the Nighthawk beats the Harrier's own
    // rotations, and the 0 we have today was being bought by the very size
    // error this closes. These are the largest moves that keep it at 0.
    harrier: 1.150, nighthawk: 0.880,
    // The Kirov is baked at the size it is DRAWN at. It used to be baked
    // small and multiplied by 1.3 in `drawUnit` -- which unit-identity-
    // reference.md §2.4 calls out as "a symptom of the bake being too
    // small", and which cost real quality: the battlefield context has
    // image smoothing on, so the largest airframe in the game was the one
    // sprite on the field going through a bilinear upscale while every
    // tank beside it drew 1:1.
    kirov: 1.30,
  }[kind] || 1);

  // part: 'a' = hull+turret in one canvas (the fallback strip), 'h' = hull
  // only, 't' = turret only on a transparent sheet. Same canvas, same
  // anchor, so the three are interchangeable at draw time.
  // `tv` picks WHICH turret model, for the one vehicle that has more than
  // one: [FV] TurretCount=4 (0 rocket, 1 gun, 2 repair arm, 3 high-tech).
  function frame(d, part, tv) {
    // vehicle-only value lift, see the definition. GROUND vehicles only:
    // the aircraft's detail census ("do not add detail it cannot carry")
    // counts the lift's extra gradient tones as detail on the Hornet.
    // The MCV's purple cab and steel machinery are already close to the
    // source value range; giving it the fleet-wide 1.25 lift clips the rear
    // casing to white and makes the works truck look like a toy. Keep the
    // common metal lift for the combat fleet, with a restrained MCV lift.
    setVLIFT((kind === 'harrier' || kind === 'kirov' || kind === 'hornet' || kind === 'nighthawk') ? 1 : (kind === 'mcv' ? 1.08 : 1.25));
    var wantH = part !== 't', wantT = part !== 'h';
    var a = d * FANG;
    // The Kirov is 137px broadside in RA2 against a Rhino's ~60: it gets a
    // sheet of its own, with the same ground-anchor rule (w/2, h - UPAD).
    // A kind scaled UP gets a sheet scaled with it: the anchor rule is
    // (w/2, h - UPAD) whatever the size, so the only thing that must grow
    // is the room above it.
    // The Nighthawk gets a WIDER sheet for the same reason the Apocalypse's
    // guns did: at the two broadside facings the forward axis is worth 1.26
    // screen px per unit BEFORE `USC_V` multiplies it by another 1.46, so a
    // 26-unit tail boom reached 48 px from the anchor and ran straight off
    // the 104 px sheet — MEASURED, octants 3 and 7 came back with the fin
    // sliced flat against the edge. It STILL needs this sheet at
    // `VSC.nighthawk` 0.88: the airframe is not centred on its ground
    // anchor (boom aft, disc forward), and octant 3's opaque box measures
    // 47 px to the RIGHT of the anchor against a 104 px sheet's 52 — four
    // pixels of margin, which is not a margin. Height is untouched; only the room
    // either side of the anchor grows, and `h - UPAD` is unchanged, so no
    // draw-side code moves (every call site is `px - s.w/2`).
    var s = kind === 'kirov' ? mkCanvas(184, 125 + UPAD)
          : kind === 'nighthawk' ? mkCanvas(136, 63 + UPAD)
          : (VSC > 1 ? mkCanvas(Math.round(104 * VSC) + 8, Math.round(63 * VSC) + UPAD)
                     : unitCanvas());
    var g = s.g;
    var cx = s.w / 2, by = s.h - UPAD;
    g.translate(cx, by); g.scale(USC_V * VSC, USC_V * VSC); g.translate(-cx, -by);
    // SMOOTH kinds draw on a scratch sheet with NO_RIM and get ONE outline
    // round the silhouette at the end of this function (see NO_RIM).
    // 2026-09-10: every GROUND vehicle ("apply the same idea to all units").
    // Aircraft keep their own look; ships bake elsewhere.
    var SMOOTH = !(kind === 'harrier' || kind === 'kirov' || kind === 'hornet' || kind === 'nighthawk' || kind === 'apc');
    var sc = null;
    if (SMOOTH) {
      sc = mkCanvas(s.w, s.h);
      sc.g.translate(cx, by); sc.g.scale(USC_V * VSC, USC_V * VSC); sc.g.translate(-cx, -by);
      g = sc.g; setNO_RIM(true);
    }
    var cd = Math.cos(a), sd = Math.sin(a);
    var fx = ISO_X * (cd - sd), fy = ISO_Y * (cd + sd);       // forward
    var px = ISO_X * (-sd - cd), py = ISO_Y * (-sd + cd);     // sideways
    var sg, i2;
    var nearS = py >= 0 ? 1 : -1;                             // which flank faces us
    var flank = Math.abs(py);                                 // 0 = flank is edge-on

    // The Grizzly is narrowed (not shortened): at 17 wide against 30 long it
    // was almost square in plan and read as a Rhino. The War Miner is a size
    // class up on the Chrono Miner, which is half of telling them apart.
    // The IFV is a size class DOWN on every tank: its 24x12 chassis is
    // narrow and nearly square in the isometric view, which is half of
    // telling the rocket buggy from a tracked tank at 1:1.
    // The Rhino is the boxy heavy: shorter and BROADER than the Lancer's
    // wedge (32x19 against 30x15), which is the RA2 plan ratio and what
    // stops the Collective's line tank reading as a recoloured Grizzly.
    // The Terror Drone is a size class below everything — 14x12 is about
    // half a tank, and it has to stay that way or it stops being vermin.
    // Light-vehicle sizes are set against the RA2 sheets measured at the
    // down-right facing: Chrono Miner 53x46, War Miner 55x47, IFV 41x42
    // (nearly SQUARE — a stubby wheeled body under a tall boxy turret),
    // Prism 52x40, Terror Drone 18x11. Ours run ~1.2x the sprite, so these
    // are the reference numbers scaled; the drone in particular was 2.4x
    // over and read as a barrel on stilts rather than as vermin. Tank
    // lengths come from the tank polish pass (Apocalypse 34, Mirage 24).
    // The miners no longer share a hull box. RA2's two harvesters are the
    // same LENGTH and opposite HEIGHTS; ours were the same both ways, so
    // the Chrono Miner is stretched to a long low truck (36x14 in plan) and
    // the War Miner shortened and broadened into a bin on tracks (27x23).
    // The IFV keeps a compact 24-unit body under a tall launcher. Its
    // footprint is deliberately narrower than the tank line while the
    // raised turret supplies the vertical identity visible in the voxel
    // reference; changing only length makes it collide with Mirage,
    // Flak Track and V3 silhouettes.
    // The PRISM TANK is BEAMY (`wid` 22, widest thing on tracks bar the
    // Apocalypse), and that is not an invention: §1.1 measures [SREF] at
    // 59x43 against [MTNK]'s 56x41, so RA2's Prism Tank is the LARGER of
    // the two sprites. It was 16 — narrower than the Mirage — which left it
    // 81 px wide against 77 tall, aspect 1.052 where RA2's is 1.37, very
    // nearly square. Note the direction of this fix versus the IFV's above:
    // the ban is on adding to the crowded 22-24 LENGTH band, and beam is a
    // free axis for SEPARATION: it took `iou.groundCombat.mean` 0.4744 ->
    // 0.4625 and `mass.tightestBand6` 2.093 -> 2.235.
    // But the aspect claim that came with it -- "a ground diamond's w/h
    // rises toward the projection's own 2.0 as the footprint grows either
    // way" -- is BACKWARDS, and it cost the Apocalypse its silhouette.
    // Under 2:1 iso a ground rectangle's BROADSIDE aspect is 2L/W, so beam
    // is the denominator: widening it flattens the aspect, it does not
    // raise it. Measured on the Apocalypse 2026-09-05, one lever at a time:
    //   wid 25 -> 21   aspect 1.271 -> 1.527      (and the sprite got
    //   wid 25 -> 18   aspect 1.271 -> 1.585       NARROWER, 89 -> 84)
    //   len 27 -> 32   aspect 1.271 -> 1.311 only, and 89 -> 97 wide
    // Beam is roughly five times the lever length is, in the opposite
    // direction to the one written here. Grow beam for separation with open
    // eyes; do not grow it expecting aspect.
    var len = kind === 'harv' ? (sov ? 33 : 27) : (kind === 'ifv' ? 24 :
              (kind === 'drone' ? 9 : (kind === 'spectre' ? 24 :
              (kind === 'flaktrack' ? 23 : (kind === 'mammoth' ? 27 :
              (kind === 'rhino' ? 25 : (kind === 'v3' ? 22 :
              (kind === 'mirage' ? 24 : (kind === 'lancer' ? 26 :
              (kind === 'teslatank' ? 27 : 30))))))))));
    var wid = kind === 'harv' ? (sov ? 20 : 18) : (kind === 'ifv' ? 12 :
              (kind === 'drone' ? 8 : (kind === 'spectre' ? 22 :
             (kind === 'mammoth' ? 21 : (kind === 'harv' ? (sov ? 22 : 18) :
              (kind === 'lancer' ? 17.5 : (kind === 'ifv' ? 15 :
              (kind === 'mirage' ? 19 : (kind === 'rhino' ? 18.5 :
              (kind === 'flaktrack' ? 15 : (kind === 'v3' ? 19 :
              (kind === 'drone' ? 12 : (kind === 'teslatank' ? 19 : 17)))))))))))));
    // MCV bounds include the wide tyres and retracted stabilizer feet;
    // its articulated construction plant is authored below in 3D.
    if (kind === 'mcv') { len = 38.4; wid = 17.0; }
    // The Nighthawk is a light helicopter: long for its beam, and the tail
    // boom runs past the hull, so the sheet's length is mostly boom.
    if (kind === 'nighthawk') { len = 34; wid = 13; }
    // [SAPC] Size=15, SizeLimit=6 — a wide, low hovercraft with a skirt
    // that overhangs the deck on every side.
    if (kind === 'apc') { len = 34; wid = 19; }
    // The Terror Drone's shadow is pulled in: a spider does not cast a
    // tank's footprint, and at 14x12 the shared blob was wider than the
    // body it belonged to.
    var shR = kind === 'drone' ? 0.44 : 0.46, shRy = kind === 'drone' ? 0.30 : 0.31;
    // The two bodies-of-revolution airframes. The Nighthawk is NOT one of
    // them — it is built out of the ground kit below — but it is still an
    // aircraft, so it gets the renderer's drop shadow rather than a baked one.
    // The HORNET belongs here too, and it did not used to. `bakeVehicle`'s
    // kind chain ends in an unguarded `else` that draws a Chrono Miner for
    // "any kind the chain does not name", and the Hornet was never named —
    // so the carrier's strike flight took off as three flying ore trucks,
    // 56 px wide with a violet drum for a nose. It is the Harrier's
    // airframe at 0.45 scale, which is the reference's own spec for it:
    // "the smallest thing that flies — half a Harrier; identity is size,
    // not detail" (unit-identity-reference.md 2.3).
    var isAirKind = kind === 'harrier' || kind === 'kirov' || kind === 'hornet';
    if (wantH && !isAirKind && kind !== 'nighthawk' && kind !== 'mcv') shadowBlob(s.g, cx, by, len * shR, wid * shRy);

    // --- primitives -----------------------------------------------------
    // A circle of radius r in the GROUND plane projects to an AXIS-ALIGNED
    // screen ellipse (the two projected axes are 90 degrees out of phase),
    // so every round part below is one ellipse call rather than a rotation.
    var ER = ISO_X * 1.4142, ERY = ISO_Y * 1.4142;
    function gEllipse(ex, ey, r, ry) {
      g.beginPath(); g.ellipse(ex, ey, r * ER, (ry === undefined ? r : ry) * ERY, 0, 0, 6.29);
    }
    // An extruded disc — the shape of a mantlet, a sprocket boss, a fuel
    // drum, a missile canister. Side wall first, then the lit cap.
    function puck(ux, uy, r, h, side, top, edge) {
      g.fillStyle = side;
      g.beginPath();
      g.ellipse(ux, uy, r * ER, r * ERY, 0, 0, Math.PI);
      g.lineTo(ux - r * ER, uy - h);
      g.ellipse(ux, uy - h, r * ER, r * ERY, 0, Math.PI, 0, true);
      g.closePath(); g.fill();
      if (edge && !NO_RIM) { g.strokeStyle = edge; g.lineWidth = 0.7; g.stroke(); }
      gEllipse(ux, uy - h, r); g.fillStyle = top; g.fill();
      if (edge && !NO_RIM) { g.strokeStyle = edge; g.lineWidth = 0.7; g.stroke(); }
    }
    // A TAPERED volume: a plan polygon in (along, across) ground units,
    // extruded upward. RA2 turrets are never boxes — the cheeks pull in
    // toward the mantlet and the tail rounds off, and that taper is most of
    // what separates a Grizzly turret from a crate at 1:1.
    function prism(ux, uy, plan, h, body, edge) {
      var P = [], i;
      for (i = 0; i < plan.length; i++)
        P.push([ux + fx * plan[i][0] + px * plan[i][1],
                uy + fy * plan[i][0] + py * plan[i][1]]);
      var ord = [];
      for (i = 0; i < P.length; i++) ord.push(i);
      ord.sort(function (m, n) {
        return (P[m][1] + P[(m + 1) % P.length][1]) - (P[n][1] + P[(n + 1) % P.length][1]);
      });
      for (i = 0; i < ord.length; i++) {
        var k = ord[i], q = (k + 1) % P.length, p0 = P[k], p1 = P[q];
        var f2 = (p0[1] + p1[1]) / 2 - uy > 0 ? 0.84 : 0.58;
        g.beginPath();
        g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]);
        g.lineTo(p1[0], p1[1] - h); g.lineTo(p0[0], p0[1] - h);
        g.closePath();
        var gr = g.createLinearGradient(0, Math.min(p0[1], p1[1]) - h, 0, Math.max(p0[1], p1[1]) + 0.5);
        gr.addColorStop(0, shade(body, f2 * 1.20));
        gr.addColorStop(1, shade(body, f2 * 0.82));
        g.fillStyle = gr; g.fill();
        if (NO_RIM) {
          if (h > 1.0) {
            g.strokeStyle = 'rgba(224,231,235,.27)'; g.lineWidth = 0.50;
            g.beginPath(); g.moveTo(p0[0], p0[1] - h); g.lineTo(p1[0], p1[1] - h); g.stroke();
          }
          if (h > 2.4 && Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 3.5) {
            g.strokeStyle = 'rgba(24,29,35,.13)'; g.lineWidth = 0.40;
            g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p0[0], p0[1] - h); g.stroke();
          }
        } else if (edge) { g.strokeStyle = edge; g.lineWidth = 0.7; g.stroke(); }
      }
      var ty0 = 1e9, ty1 = -1e9;
      g.beginPath();
      for (i = 0; i < P.length; i++) {
        if (i === 0) g.moveTo(P[i][0], P[i][1] - h); else g.lineTo(P[i][0], P[i][1] - h);
        if (P[i][1] - h < ty0) ty0 = P[i][1] - h;
        if (P[i][1] - h > ty1) ty1 = P[i][1] - h;
      }
      g.closePath();
      var tg = g.createLinearGradient(0, ty0, 0, ty1 + 0.5);
      tg.addColorStop(0, shade(body, 1.26)); tg.addColorStop(1, shade(body, 1.00));
      g.fillStyle = tg; g.fill();
      if (NO_RIM) {
        if (h > 1.0) {
          g.strokeStyle = 'rgba(224,231,235,.26)'; g.lineWidth = 0.50;
          g.beginPath();
          for (i = 0; i < P.length; i++) {
            if (i === 0) g.moveTo(P[i][0], P[i][1] - h); else g.lineTo(P[i][0], P[i][1] - h);
          }
          g.closePath(); g.stroke();
        }
      } else if (edge) { g.strokeStyle = edge; g.lineWidth = 0.7; g.stroke(); }
      return P;
    }
    // Stadium outline in the ground plane, sampled as a polygon: straight
    // run of half-length `st`, semicircular caps of radius `hw`.
    function stadium(ux, uy, st, hw) {
      var P = [], i, t;
      for (i = 0; i <= 6; i++) {
        t = -Math.PI / 2 + Math.PI * i / 6;
        P.push([ux + fx * (st + Math.cos(t) * hw) + px * Math.sin(t) * hw,
                uy + fy * (st + Math.cos(t) * hw) + py * Math.sin(t) * hw]);
      }
      for (i = 0; i <= 6; i++) {
        t = Math.PI / 2 + Math.PI * i / 6;
        P.push([ux + fx * (-st + Math.cos(t) * hw) + px * Math.sin(t) * hw,
                uy + fy * (-st + Math.cos(t) * hw) + py * Math.sin(t) * hw]);
      }
      return P;
    }
    function polyPath(P, dy) {
      g.beginPath();
      for (var i = 0; i < P.length; i++) {
        if (i === 0) g.moveTo(P[i][0], P[i][1] + dy); else g.lineTo(P[i][0], P[i][1] + dy);
      }
      g.closePath();
    }
    // ONE track run. The stadium footprint is extruded: near-side walls,
    // then the lit top run drawn last so it caps the shape cleanly. Road
    // wheels are DARK and sit in the shadowed gap under the top run — the
    // old pale dots read as a row of beads glued to a black box.
    function trackRun(ux, uy, tl, tw, th, wheelCol) {
      var hw = tw / 2, st = Math.max(0.5, tl / 2 - hw);
      var P = stadium(ux, uy, st, hw), i, p0, p1;
      polyPath(P, 0); g.fillStyle = TRK_D; g.fill();               // underside
      for (i = 0; i < P.length; i++) {                             // near walls
        p0 = P[i]; p1 = P[(i + 1) % P.length];
        if ((p0[1] + p1[1]) / 2 <= uy) continue;
        g.beginPath();
        g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]);
        g.lineTo(p1[0], p1[1] - th); g.lineTo(p0[0], p0[1] - th);
        g.closePath();
        g.fillStyle = TRK_SIDE; g.fill();
      }
      // road wheels sunk into the visible flank
      if (flank > 0.14) {
        for (i = -2; i <= 2; i++) {
          var wu = i * st * 0.46;
          var wx = ux + fx * wu + px * hw * 0.94 * nearS;
          var wy = uy + fy * wu + py * hw * 0.94 * nearS - th * 0.46;
          g.fillStyle = WHEEL_D;
          g.beginPath(); g.ellipse(wx, wy, 1.55, 1.35, 0, 0, 6.29); g.fill();
          g.fillStyle = wheelCol || WHEEL_L;
          g.beginPath(); g.ellipse(wx, wy - 0.35, 0.85, 0.7, 0, 0, 6.29); g.fill();
        }
        // drive sprockets, one per end, sitting proud of the run
        for (i = -1; i <= 1; i += 2) {
          var spx = ux + fx * st * i + px * hw * 0.92 * nearS;
          var spy = uy + fy * st * i + py * hw * 0.92 * nearS - th * 0.46;
          g.fillStyle = '#1c1f24';
          g.beginPath(); g.ellipse(spx, spy, 2.1, 1.85, 0, 0, 6.29); g.fill();
          g.strokeStyle = wheelCol || WHEEL_L; g.lineWidth = 0.7;
          g.beginPath(); g.ellipse(spx, spy, 1.15, 1.0, 0, 0, 6.29); g.stroke();
        }
      }
      polyPath(P, -th);                                            // lit top run
      var tg2 = g.createLinearGradient(0, uy - th - hw * 1.2, 0, uy - th + hw * 1.2);
      tg2.addColorStop(0, shade(TRK_TOP, 1.16)); tg2.addColorStop(1, shade(TRK_TOP, 0.78));
      g.fillStyle = tg2; g.fill();
      g.strokeStyle = TRK_D; g.lineWidth = 0.8; g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 0.9;        // track links
      for (i = -3; i <= 3; i++) {
        var lu = i * st * 0.30;
        g.beginPath();
        g.moveTo(ux + fx * lu + px * hw * 0.86, uy + fy * lu + py * hw * 0.86 - th);
        g.lineTo(ux + fx * lu - px * hw * 0.86, uy + fy * lu - py * hw * 0.86 - th);
        g.stroke();
      }
    }
    // Both runs, just outside the hull line. Past ~0.42 of hull width the
    // tracks visibly detach, so 0.40 is the ceiling here.
    function tracks(tl, th2, tw, wheelCol, offScale) {
      var off = wid * (offScale == null ? 0.40 : offScale);
      for (var side = -1; side <= 1; side += 2)
        trackRun(cx + px * off * side, by - 1 + py * off * side, tl, tw, th2, wheelCol);
    }
    // WHEELS, for the one wheeled vehicle in the fleet. A road wheel is a
    // disc standing VERTICALLY in the plane that contains the forward axis,
    // so its outline is the ellipse swept by (forward * cos t, -up * sin t)
    // — which collapses to a circle broadside and to a thin edge-on sliver
    // head-on, exactly as it should. Reusing trackRun's ground-plane
    // ellipse instead drew six pancakes lying in the mud.
    // A tyre is not a flat disc: swept sideways by its own width, so that
    // HEAD-ON, where the disc collapses to a line, the tread band still
    // reads. The first pass drew the bare disc and the two head-on facings
    // came back with six black hairlines poking below the hull.
    function wheelDisc(wx, wy, r, hw, tyre, rim) {
      var i3, t3, k3;
      function ring(ox, oy, rr) {
        g.beginPath();
        for (i3 = 0; i3 <= 16; i3++) {
          t3 = i3 / 16 * 6.2832;
          var qx = ox + fx * rr * Math.cos(t3);
          var qy = oy + fy * rr * Math.cos(t3) - rr * Math.sin(t3);
          if (i3 === 0) g.moveTo(qx, qy); else g.lineTo(qx, qy);
        }
        g.closePath();
      }
      for (k3 = -1; k3 <= 1; k3++) {                               // tread band
        ring(wx + px * hw * k3, wy + py * hw * k3, r);
        g.fillStyle = k3 < 0 ? shade(tyre, 0.7) : tyre; g.fill();
      }
      ring(wx + px * hw * nearS, wy + py * hw * nearS, r);          // near sidewall
      g.fillStyle = tyre; g.fill();
      g.strokeStyle = '#07080a'; g.lineWidth = 0.7; g.stroke();
      ring(wx + px * hw * nearS, wy + py * hw * nearS, r * 0.44);   // pale hub
      g.fillStyle = rim; g.fill();
    }
    // Three tyres a side, near side drawn last so it caps the far row.
    function wheels(wb, r, n, tyre, rim) {
      var off = wid * 0.40, i3, side, ws = [];
      for (side = -1; side <= 1; side += 2)
        for (i3 = 0; i3 < n; i3++) {
          var u3 = (i3 - (n - 1) / 2) * (wb / (n - 1));
          ws.push([cx + fx * u3 + px * off * side,
                   by - r * 0.84 + fy * u3 + py * off * side]);
        }
      ws.sort(function (m, n2) { return m[1] - n2[1]; });
      for (i3 = 0; i3 < ws.length; i3++)
        wheelDisc(ws[i3][0], ws[i3][1], r, 0.62, tyre || '#14161a', rim || '#8b929d');
    }
    // Hull: dark underbody, body box, raked glacis, lit contour.
    function chassis(hx, hy, hl2, hw2, h, body, edge, rake, underH) {
      isoBox(g, hx, hy, hl2 * 0.96, hw2 * 1.04, underH == null ? 1.5 : underH, a, '#2a2e35', '#0b0d10');
      isoBox(g, hx, hy - 1.3, hl2, hw2, h, a, body, edge);
      if (rake) {
        var HL = hl2 / 2, HW = hw2 / 2, cy0 = hy - 1.3 - h;
        var q1 = [hx + fx * HL + px * HW, cy0 + fy * HL + py * HW];
        var q2 = [hx + fx * HL - px * HW, cy0 + fy * HL - py * HW];
        var n2 = [hx + fx * (HL + rake) - px * HW * 0.82,
                  cy0 + fy * (HL + rake) - py * HW * 0.82 + h * 0.66];
        var n1 = [hx + fx * (HL + rake) + px * HW * 0.82,
                  cy0 + fy * (HL + rake) + py * HW * 0.82 + h * 0.66];
        g.beginPath();
        g.moveTo(q1[0], q1[1]); g.lineTo(q2[0], q2[1]);
        g.lineTo(n2[0], n2[1]); g.lineTo(n1[0], n1[1]); g.closePath();
        var lo = Math.min(q1[1], q2[1], n1[1], n2[1]), hi = Math.max(q1[1], q2[1], n1[1], n2[1]);
        var gg = g.createLinearGradient(0, lo, 0, hi + 0.5);
        gg.addColorStop(0, shade(body, 1.30)); gg.addColorStop(1, shade(body, 0.92));
        g.fillStyle = gg; g.fill();
        g.strokeStyle = edge; g.lineWidth = 0.7; g.stroke();
        g.strokeStyle = shade(body, 1.62); g.lineWidth = 1;        // lit silhouette edge
        g.beginPath(); g.moveTo(q1[0], q1[1]); g.lineTo(q2[0], q2[1]); g.stroke();
      }
      // Shared fabricated-hull pass. RA2's bodies are assembled from broad
      // welded plates, so a clean gradient alone reads as painted plastic.
      // These hairline breaks sit only on the visible flank: one lower
      // rubbing seam, two short plate joints, and four subdued rivets. They
      // stay inside the silhouette and keep the owner colour untouched.
      if (flank > 0.14 && h > 2.4) {
        var cs = nearS, csy = hy + py * hw2 * 0.515 * cs;
        function cpoint(u, z) {
          return [hx + fx * u + px * hw2 * 0.515 * cs,
                  csy + fy * u - z];
        }
        var cp0 = cpoint(-hl2 * 0.41, 1.3 + h * 0.20), cp1 = cpoint(hl2 * 0.41, 1.3 + h * 0.20);
        g.strokeStyle = 'rgba(20,24,29,.34)'; g.lineWidth = 0.55;
        g.beginPath(); g.moveTo(cp0[0], cp0[1]); g.lineTo(cp1[0], cp1[1]); g.stroke();
        g.strokeStyle = 'rgba(215,220,224,.24)'; g.lineWidth = 0.42;
        cp0 = cpoint(-hl2 * 0.40, 1.3 + h * 0.78); cp1 = cpoint(hl2 * 0.40, 1.3 + h * 0.78);
        g.beginPath(); g.moveTo(cp0[0], cp0[1]); g.lineTo(cp1[0], cp1[1]); g.stroke();
        for (var cj = -1; cj <= 1; cj += 2) {
          var cu = hl2 * 0.22 * cj, ca = cpoint(cu, 1.3 + h * 0.28), cb = cpoint(cu, 1.3 + h * 0.72);
          g.strokeStyle = 'rgba(24,28,33,.28)'; g.lineWidth = 0.48;
          g.beginPath(); g.moveTo(ca[0], ca[1]); g.lineTo(cb[0], cb[1]); g.stroke();
        }
        for (var cr = -1; cr <= 1; cr += 2) {
          var rv = cpoint(hl2 * 0.36 * cr, 1.3 + h * 0.55);
          g.fillStyle = 'rgba(210,216,220,.62)';
          g.beginPath(); g.ellipse(rv[0], rv[1] - 0.22, 0.34, 0.28, 0, 0, 6.29); g.fill();
          g.fillStyle = 'rgba(30,34,39,.48)';
          g.beginPath(); g.ellipse(rv[0] + 0.10, rv[1] + 0.08, 0.16, 0.13, 0, 0, 6.29); g.fill();
        }
      }
    }
    // Pale bumper strip along the lower front — on every RA2 chassis.
    function bumper(bl, bw2, byb) {
      var fxp = cx + fx * bl, fyp = byb + fy * bl;
      g.strokeStyle = kind === 'mammoth' ? '#858980' : BAND; g.lineWidth = 2.2; g.lineCap = 'butt';
      g.beginPath();
      g.moveTo(fxp + px * bw2, fyp + py * bw2); g.lineTo(fxp - px * bw2, fyp - py * bw2);
      g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1;
      g.beginPath();
      g.moveTo(fxp + px * bw2, fyp + py * bw2 + 1.4); g.lineTo(fxp - px * bw2, fyp - py * bw2 + 1.4);
      g.stroke();
    }
    // A bright plate laid ALONG the forward axis on top of the hull. At the
    // broadside facings (3 and 7) the front and back walls of a box are
    // edge-on, so a plain hull shows two side faces and reads as a flat
    // elevation next to the three-quarter facings; a lit deck panel puts a
    // horizontal surface back in the silhouette at every angle.
    function deckPlate(dxo, dl, dw, dh, dcol) {
      isoBox(g, cx + fx * dxo, by - dh + fy * dxo, dl, dw, 1.5, a, dcol, dark);
    }
    // Track guards that overhang the nose. In the reference every Allied
    // and Soviet tank shows two pale horns ahead of the glacis, and that
    // forked front is what stops the head-on facings reading as a slab.
    function fenders(fu, fh, offScale, widthScale, lengthScale) {
      var fo = wid * (offScale == null ? 0.40 : offScale);
      var fw = wid * (widthScale == null ? 0.27 : widthScale);
      var fl = len * (lengthScale == null ? 0.17 : lengthScale);
      for (var q = -1; q <= 1; q += 2)
        isoBox(g, cx + fx * fu + px * fo * q, by - fh + fy * fu + py * fo * q,
               fl, fw, kind === 'mammoth' ? 1.3 : 1.7, a,
               kind === 'mammoth' ? '#59605a' : STEEL, '#282c33');
    }
    // The three fitments every vehicle carries, so the fleet reads as one
    // design language: a hatch ring on the deck, a headlamp at the nose, a
    // sooty exhaust box at the tail.
    function hatch(hx, hy, r) {
      gEllipse(hx, hy, r); g.fillStyle = 'rgba(0,0,0,.42)'; g.fill();
      gEllipse(hx, hy - 0.5, r * 0.78); g.fillStyle = 'rgba(255,255,255,.20)'; g.fill();
    }
    function lamp(lx, ly) {
      g.fillStyle = '#1a1c20';
      g.beginPath(); g.ellipse(lx, ly, 1.7, 1.35, 0, 0, 6.29); g.fill();
      g.fillStyle = '#f4e6b4';
      g.beginPath(); g.ellipse(lx, ly - 0.15, 1.0, 0.8, 0, 0, 6.29); g.fill();
    }
    function exhaust(ex, ey) {
      isoBox(g, ex, ey, 3.4, 2.4, 2.4, a, '#3a3d43', '#16181c');
      g.fillStyle = '#111316';
      g.beginPath(); g.ellipse(ex - fx * 1.5, ey - 2.2 - fy * 1.5, 1.0, 0.8, 0, 0, 6.29); g.fill();
    }
    // A gun that TAPERS. A constant-width stroke reads as a pipe; RA2's
    // barrels narrow toward a dark muzzle with one pale pixel on the lip,
    // and that lip is most of what makes a tank look aimed rather than
    // parked.
    function barrel(x0, y0, L, w0, w1, bcol) {
      var tx = x0 + fx * L, ty = y0 + fy * L;
      var vx = tx - x0, vy = ty - y0, vl = Math.hypot(vx, vy) || 1;
      var ux2 = vx / vl, uy2 = vy / vl, nx = -uy2, ny = ux2;
      var bc = bcol || GUN;
      function seg(t0, t1, ww0, ww1, cc) {
        var ax = x0 + vx * t0, ay = y0 + vy * t0, bx = x0 + vx * t1, byy = y0 + vy * t1;
        g.beginPath();
        g.moveTo(ax + nx * ww0, ay + ny * ww0); g.lineTo(bx + nx * ww1, byy + ny * ww1);
        g.lineTo(bx - nx * ww1, byy - ny * ww1); g.lineTo(ax - nx * ww0, ay - ny * ww0);
        g.closePath(); g.fillStyle = cc; g.fill();
      }
      seg(0, 0.16, w0 * 1.35, w0 * 1.10, shade(bc, 1.5));          // breech collar
      seg(0.14, 0.86, w0, w1 * 1.12, bc);                          // tapering tube
      seg(0.86, 1, w1 * 1.30, w1 * 1.20, shade(bc, 0.55));         // dark muzzle brake
      var lit = ny < 0 ? 1 : -1;                                   // upper edge of the tube
      g.strokeStyle = GUN_L; g.lineWidth = 0.85; g.lineCap = 'butt';
      g.beginPath();
      g.moveTo(x0 + vx * 0.16 + nx * w0 * 0.55 * lit, y0 + vy * 0.16 + ny * w0 * 0.55 * lit);
      g.lineTo(x0 + vx * 0.84 + nx * w1 * 0.60 * lit, y0 + vy * 0.84 + ny * w1 * 0.60 * lit);
      g.stroke();
      g.fillStyle = '#c3c9d2';                                     // pale tip highlight
      g.beginPath(); g.ellipse(tx, ty, w1 * 0.85, w1 * 0.85, 0, 0, 6.29); g.fill();
    }
    // A slatted ore crate: vertical planks, top and mid rails, and an X
    // brace on each visible flank — the brace is the single detail that
    // makes a bin read as CARGO rather than as a painted block.
    function crate(bcx, bcy, ln, wd, h, body, edge) {
      isoBox(g, bcx, bcy, ln, wd, h, a, body, edge);
      var hl = ln / 2, hw = wd / 2, n = 4;
      var c = [[bcx + fx * hl + px * hw, bcy + fy * hl + py * hw],
               [bcx + fx * hl - px * hw, bcy + fy * hl - py * hw],
               [bcx - fx * hl - px * hw, bcy - fy * hl - py * hw],
               [bcx - fx * hl + px * hw, bcy - fy * hl + py * hw]];
      g.lineCap = 'butt';
      for (var i = 0; i < 4; i++) {
        var p0 = c[i], p1 = c[(i + 1) % 4];
        if ((p0[1] + p1[1]) / 2 <= bcy + 0.1) continue;      // far faces are hidden
        g.lineWidth = 1.2;
        for (var k = 1; k < n; k++) {
          var t = k / n;
          var xx = p0[0] + (p1[0] - p0[0]) * t, yy = p0[1] + (p1[1] - p0[1]) * t;
          g.strokeStyle = 'rgba(44,32,10,.62)';
          g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx, yy - h + 0.8); g.stroke();
          g.strokeStyle = 'rgba(255,240,196,.20)';
          g.beginPath(); g.moveTo(xx + 1.0, yy); g.lineTo(xx + 1.0, yy - h + 0.8); g.stroke();
        }
        g.strokeStyle = 'rgba(255,242,200,.46)'; g.lineWidth = 1.7;      // X brace
        g.beginPath();
        g.moveTo(p0[0] + 0.6, p0[1] - 1.0); g.lineTo(p1[0] - 0.6, p1[1] - h + 1.4); g.stroke();
        g.beginPath();
        g.moveTo(p0[0] + 0.6, p0[1] - h + 1.4); g.lineTo(p1[0] - 0.6, p1[1] - 1.0); g.stroke();
        g.strokeStyle = 'rgba(38,26,6,.62)'; g.lineWidth = 1.7;          // top and mid rails
        g.beginPath();
        g.moveTo(p0[0], p0[1] - h * 0.50); g.lineTo(p1[0], p1[1] - h * 0.50); g.stroke();
        g.beginPath();
        g.moveTo(p0[0], p0[1] - h + 1.0); g.lineTo(p1[0], p1[1] - h + 1.0); g.stroke();
      }
      // The bin is OPEN: its top is a sunken bed of ore, not a painted
      // lid. A flat bright top face is what made the crate read as a
      // shipping container bolted to a tank.
      var lip = [[bcx + fx * hl * 0.88 + px * hw * 0.86, bcy + fy * hl * 0.88 + py * hw * 0.86 - h + 0.6],
                 [bcx + fx * hl * 0.88 - px * hw * 0.86, bcy + fy * hl * 0.88 - py * hw * 0.86 - h + 0.6],
                 [bcx - fx * hl * 0.88 - px * hw * 0.86, bcy - fy * hl * 0.88 - py * hw * 0.86 - h + 0.6],
                 [bcx - fx * hl * 0.88 + px * hw * 0.86, bcy - fy * hl * 0.88 + py * hw * 0.86 - h + 0.6]];
      g.beginPath();
      g.moveTo(lip[0][0], lip[0][1]); g.lineTo(lip[1][0], lip[1][1]);
      g.lineTo(lip[2][0], lip[2][1]); g.lineTo(lip[3][0], lip[3][1]); g.closePath();
      g.fillStyle = '#3a3014'; g.fill();
      g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 0.9; g.stroke();
      for (var oi = -1; oi <= 1; oi++) {                      // a little ore in the bed
        g.fillStyle = oi ? '#8b6f2c' : '#a8873a';
        g.beginPath();
        g.ellipse(bcx + fx * oi * ln * 0.26 + px * oi * wd * 0.16,
                  bcy + fy * oi * ln * 0.26 + py * oi * wd * 0.16 - h + 0.4,
                  1.9, 1.05, 0, 0, 6.29);
        g.fill();
      }
    }

    if (isAirKind) {
      // ---- AIRCRAFT: bodies of revolution about an axis in the ground
      // plane, drawn in screen space. A cross-section circle of radius r
      // projects to an ellipse with semi-axes r*(px,py) (the ground
      // perpendicular) and r*(0,-1) (up), so the silhouette's half-extent
      // in the screen-perpendicular direction n is r*sqrt((n.P)^2+(n.U)^2)
      // — that is what makes a Kirov 2.3x as wide as tall broadside and
      // barely wider than tall nose-on, as the RA2 sheet measures.
      var AL = Math.sqrt(fx * fx + fy * fy), ux2 = fx / AL, uy2 = fy / AL;
      var nx2 = -uy2, ny2 = ux2;
      if (ny2 > 0) { nx2 = -nx2; ny2 = -ny2; }               // n points UP the screen
      var secK = Math.sqrt((nx2 * px + ny2 * py) * (nx2 * px + ny2 * py) + ny2 * ny2);
      // Kirov: 137x61 broadside in the sheet (w/h 2.25) — a CIGAR, and the
      // fat ellipsoid the previous pass drew came back 1.38 at the
      // down-right facing against the reference's 1.50. Harrier: the
      // fuselage is slim and the WINGS carry the silhouette.
      var bodyL = kind === 'kirov' ? 58 : 23, bodyR = kind === 'kirov' ? 9.4 : 2.35;
      var C0y = by - (kind === 'kirov' ? 28 : 3);   // a parked Harrier sits on its gear at the anchor; altitude is added by the renderer
      function pt(t) { return [cx + fx * t * bodyL / 2, C0y + fy * t * bodyL / 2]; }
      // r(t): blunt nose (t=+1), tapering tail (t=-1)
      function rad(t) {
        var q = Math.max(0, 1 - t * t);
        return bodyR * (t >= 0 ? Math.pow(q, kind === 'kirov' ? 0.40 : 0.55) : Math.pow(q, kind === 'kirov' ? 0.70 : 0.5));
      }
      function bodyPath() {
        var i3, t3, p3, e3;
        g.beginPath();
        for (i3 = 0; i3 <= 24; i3++) {
          t3 = -1 + i3 / 12; p3 = pt(t3); e3 = rad(t3) * secK;
          if (i3 === 0) g.moveTo(p3[0] + nx2 * e3, p3[1] + ny2 * e3); else g.lineTo(p3[0] + nx2 * e3, p3[1] + ny2 * e3);
        }
        for (i3 = 24; i3 >= 0; i3--) {
          t3 = -1 + i3 / 12; p3 = pt(t3); e3 = rad(t3) * secK;
          g.lineTo(p3[0] - nx2 * e3, p3[1] - ny2 * e3);
        }
        g.closePath();
      }
      // a quad hung off the axis: from t0 to t1, offset o0..o1 along a screen dir (dx,dy)
      function finQuad(t0, t1, dx, dy, o0, o1, fill, edge) {
        var a0 = pt(t0), a1 = pt(t1);
        // swept: the trailing root sits further aft than the leading root
        g.beginPath();
        g.moveTo(a0[0] + dx * o0, a0[1] + dy * o0); g.lineTo(a1[0] + dx * o0, a1[1] + dy * o0);
        g.lineTo(a1[0] + dx * o1 * 0.92 + (a1[0] - a0[0]) * 0.15, a1[1] + dy * o1 * 0.92 + (a1[1] - a0[1]) * 0.15);
        g.lineTo(a0[0] + dx * o1 + (a1[0] - a0[0]) * 0.55, a0[1] + dy * o1 + (a1[1] - a0[1]) * 0.55);
        g.closePath(); g.fillStyle = fill; g.fill();
        if (edge) { g.strokeStyle = edge; g.lineWidth = 0.7; g.stroke(); }
      }
      var bodyTop = [nx2, ny2], gradA, gradB;

      var C = { AL: AL, a: a, anim: anim, bodyPath: bodyPath, bodyR: bodyR, col: col,
                finQuad: finQuad, fy: fy, g: g, gradA: gradA, gradB: gradB, i2: i2, nx2: nx2,
                ny2: ny2, part: part, pt: pt, puck: puck, px: px, py: py, rad: rad, secK: secK,
                ux2: ux2, uy2: uy2 };
      if (kind === 'kirov') {
        drawKirov(C);
      } else {
        drawHarrier(C);
      }
      return s;
    }

    var C = { BIN: BIN, BIN_E: BIN_E, PEDGE: PEDGE, RING: RING, STEEL: STEEL, VSC: VSC, a: a,
              barrel: barrel, bumper: bumper, by: by, cd: cd, chassis: chassis, col: col,
              crate: crate, cx: cx, dark: dark, deck: deck, deckPlate: deckPlate, dig: dig,
              exhaust: exhaust, fenders: fenders, flank: flank, fx: fx, fy: fy, g: g,
              gEllipse: gEllipse, hull: hull, i2: i2, lamp: lamp, len: len, nearS: nearS,
              panel: panel, pdark: pdark, plit: plit, prism: prism, puck: puck, px: px, py: py,
              s: s, sd: sd, sg: sg, trackRun: trackRun, tracks: tracks, tv: tv, wantH: wantH,
              wantT: wantT, wheelDisc: wheelDisc, wheels: wheels, wid: wid };
    if (kind === 'lancer') {
      drawLancer(C);

    } else if (kind === 'spectre') {
      drawSpectre(C);

    } else if (kind === 'mammoth') {
      drawMammoth(C);

    } else if (kind === 'ifv') {
      drawIfv(C);

    } else if (kind === 'rhino') {
      drawRhino(C);

    } else if (kind === 'flaktrack') {
      drawFlaktrack(C);

    } else if (kind === 'v3') {
      drawV3(C);

    } else if (kind === 'drone') {
      drawDrone(C);

    } else if (kind === 'teslatank') {
      drawTeslatank(C);

    } else if (kind === 'mirage') {
      drawMirage(C);

    // The tail of this chain is the two miners, which makes it the FALLBACK
    // for any kind the chain does not name. The Phase 8 transports assemble
    // their own bodies further down, so they need an arm of their own here
    // or they arrive wearing a mining bin.
    } else if (kind === 'nighthawk' || kind === 'apc' || kind === 'mcv') {
      /* built below */
    } else if (!sov) {
      drawChronominer(C);

    } else {
      drawWarminer(C);
    }

    // MCV: reconstructed from Allied_MCV_Voxel_Render.jpg and the eight
    // in-game bearings in allied-mcv.png. +u is forward, +v across, +z up.
    // A wide six-wheel chassis carries folded foundation wings, retracted
    // stabilizers, a loaded steel cradle and its exposed hinge machinery.
    var C = { VSC: VSC, by: by, cd: cd, col: col, cx: cx, d: d, fx: fx, fy: fy, g: g, px: px,
              py: py, s: s, sd: sd };
    if (kind === 'mcv' && wantH) drawMcv(C);

    // ---- Nighthawk ([SHAD], art `SHAD.VXL`) --------------------------- //
    // A light black-ops helicopter, and the read at 1:1 is entirely the
    // PROPORTION: a short deep glassed cabin at the front, then a long slim
    // TAIL BOOM running most of the sprite's length to a fin and a tail
    // rotor, on skids, under a four-blade main rotor whose disc is wider
    // than the airframe. The first pass drew the cabin as wide as it was
    // long and hid the boom behind it, and it read as a black crate with a
    // propeller. Cabin and boom are drawn as two closures so the near one
    // is drawn last, exactly as the Kirov's pod and the miners' bins are.
    // The airframe is matte charcoal throughout; the owner's colour is a
    // band over each door and the fin flash, because a half-house-coloured
    // helicopter reads as a toy.
    var C = { PEDGE: PEDGE, STEEL: STEEL, a: a, anim: anim, barrel: barrel, by: by,
              chassis: chassis, cx: cx, fx: fx, fy: fy, g: g, hull: hull, i2: i2, len: len,
              panel: panel, puck: puck, px: px, py: py, sg: sg, wantH: wantH, wid: wid };
    if (kind === 'nighthawk') {
      drawNighthawk(C);
    }

    // ---- Amphibious Transport ([SAPC], art `TRS.VXL`) ------------------ //
    // The Soviet landing hovercraft. Four masses, biggest first: a
    // segmented SKIRT lying on the ground; a tall slab-sided HULL standing
    // proud of it; a raised BRIDGE block along the port side with the open
    // cargo well beside it to starboard; and two big ducted lift fans at
    // the stern. Turret=no, no gun, nothing on the roof.
    //
    // The skirt is an ORIENTED capsule (the stadium the track runs use), not
    // a screen-axis ellipse: drawn as a fixed oval it read as a pancake the
    // vehicle was parked on rather than as part of it. The hull has to stand
    // WELL clear of the skirt crown or the whole thing reads as a raft — the
    // first pass had 5px of hull over a 30px skirt and that is exactly what
    // happened. House colour is one rubbing strake a flank plus the bridge
    // roof: a deck-wide band turns the vehicle into a slab of player hue.
    var C = { ER: ER, ERY: ERY, PEDGE: PEDGE, STEEL: STEEL, a: a, by: by, cx: cx, deck: deck,
              deckPlate: deckPlate, fx: fx, fy: fy, g: g, gEllipse: gEllipse, hull: hull, i2: i2,
              len: len, panel: panel, polyPath: polyPath, puck: puck, px: px, py: py, sg: sg,
              stadium: stadium, wantH: wantH, wid: wid };
    if (kind === 'apc') {
      drawApc(C);
    }
    setVLIFT(1);
    var metalSeed = 0;
    for (var ms = 0; ms < kind.length; ms++) metalSeed = (metalSeed + kind.charCodeAt(ms) * (ms + 3)) & 255;
    if (SMOOTH) {
      // MCV shades its metal, rubber and glass separately in the mesh
      // rasterizer; the generic grain pass would put metal marks on tyres.
      if (kind !== 'mcv') metalFinish(sc.c, metalSeed);
      setNO_RIM(false);
      // the silhouette outline: the scratch sheet stamped in eight
      // directions and tinted dark, under the sheet itself
      var oc = mkCanvas(s.w, s.h), og = oc.g, od = kind === 'ifv' || kind === 'mcv' ? 0.25 : 0.65;
      for (var oi = 0; oi < 8; oi++) {
        var oa = oi * Math.PI / 4;
        og.drawImage(sc.c, Math.cos(oa) * od, Math.sin(oa) * od, sc.w, sc.h);
      }
      og.globalCompositeOperation = 'source-in';
      og.fillStyle = '#1a1d23'; og.fillRect(0, 0, oc.w, oc.h);
      s.g.setTransform(DPR, 0, 0, DPR, 0, 0);
      s.g.drawImage(oc.c, 0, 0, oc.w, oc.h);
      s.g.drawImage(sc.c, 0, 0, sc.w, sc.h);
    } else if (kind === 'apc') {
      // The hovercraft keeps its deliberately outlined construction pass,
      // but its broad olive skirt and hull still need the same restrained
      // machining grain as the tracked fleet.
      metalFinish(s.c, metalSeed);
    }
    return s;
  }

  // 32 bearings, LAZILY. Four times the facings must not be four times the
  // boot: `faceSheet` hands back a real Array of length NFACE whose slots
  // are accessor properties, so `set[u.face]` reads exactly like the old
  // eight-entry array while the canvas behind it is drawn on the first
  // frame that actually asks for that bearing — and the getter then
  // replaces itself with the value, so the second read is a plain lookup.
  // A skirmish only ever visits the handful of bearings its units stop on.
  var out = faceSheet(function (d) { return frame(d, 'a'); });
  if (kind === 'kirov') {
    // Baked on demand: a match without a Kirov never pays for the extra
    // sheets, and one Kirov pays for them once.
    out.lay = function () {
      if (!out._lay) out._lay = {
        hull: faceSheet(function (q) { return frame(q, 'h'); }),
        gond: faceSheet(function (q) { return frame(q, 'g'); }),
        open: faceSheet(function (q) { return frame(q, 'go'); })
      };
      return out._lay;
    };
  }
  if (turreted) {
    out.hull = faceSheet(function (q) { return frame(q, 'h'); });
    out.turret = faceSheet(function (q) { return frame(q, 't'); });
  }
  // [FV] TurretCount=4. Baked ON DEMAND, like the Kirov's gondola layers: a
  // match with no IFV — or one whose IFVs are all empty — never pays for the
  // three extra facing sheets, and a loaded one pays for its model once.
  if (kind === 'ifv') {
    out.turrets = function (ti) {
      if (!out._tur) out._tur = {};
      if (!out._tur[ti]) out._tur[ti] = faceSheet(function (q) { return frame(q, 't', ti); });
      return out._tur[ti];
    };
  }
  return out;
}

// An Array of NFACE lazily-baked frames. Every slot is a self-replacing
// getter, so the array reads like a plain baked strip and costs nothing
// until it is indexed. `bb` is filled in here (bakeOwned used to walk every
// frame to do it, which would have forced all 32).
function faceSheet(make) {
  var arr = new Array(NFACE);
  for (var i = 0; i < NFACE; i++) defineFace(arr, i, make);
  return arr;
}

function defineFace(arr, i, make) {
  Object.defineProperty(arr, i, {
    configurable: true, enumerable: true,
    get: function () {
      var v = make(i);
      if (v && !v.bb) v.bb = artBox(v);
      Object.defineProperty(arr, i, { value: v, writable: true, enumerable: true, configurable: true });
      return v;
    }
  });
}

// --- structure assembly ------------------------------------------------
// RA2's buildings are told apart by MASSING, not by a badge on a shared
// box: a refinery is a shed plus a silo plus a dock ramp, and you know it
// from the outline alone with the colour turned off. The previous pass gave
// every structure the same prism and varied only a rooftop ornament, which
// is exactly why they all read as the same office block. Each key below now
// assembles its own volumes out of these primitives.
//
// (hw,hh) are the half-extents of a footprint diamond centred at (cx,cy),
// in the same 2:1 projection as the ground. `lift` extrudes it upward.
// A short drum standing on its end: cylinder() with a flatter lid.
function puckDrum(g, cx, cy, r, h, body, top, edge) {
  cylinder(g, cx, cy, r, h, body, top, edge);
  g.fillStyle = shade(top, 1.18);
  g.beginPath(); g.ellipse(cx, cy - h, r * 0.55, r * 0.26, 0, 0, 6.29); g.fill();
}

function cylinder(g, cx, cy, rx, h, body, top, edge) {
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(cx - rx, cy); g.lineTo(cx - rx, cy - h);
  g.lineTo(cx + rx, cy - h); g.lineTo(cx + rx, cy);
  g.closePath(); g.fill();
  g.beginPath(); g.ellipse(cx, cy, rx, rx * 0.42, 0, 0, Math.PI); g.fill();
  outline(g, edge);
  g.fillStyle = 'rgba(255,255,255,.13)';                 // lit left third
  g.fillRect(cx - rx, cy - h, rx * 0.55, h);
  g.fillStyle = 'rgba(0,0,0,.18)';                       // shaded right third
  g.fillRect(cx + rx * 0.42, cy - h, rx * 0.58, h);
  g.fillStyle = top;
  g.beginPath(); g.ellipse(cx, cy - h, rx, rx * 0.42, 0, 0, 6.29); g.fill();
  outline(g, edge);
}

// Points on the two visible walls of a prism, in face coordinates: t runs
// 0..1 along the wall from its outer corner to the near corner, v runs 0..1
// bottom to top. Doors, bands and chevrons are all placed with these, so
// they skew with the wall instead of sitting on it like a sticker.
function faceL(cx, cy, hw, hh, lift, t, v) { return [cx - hw + hw * t, cy + hh * t - lift * v]; }

function faceR(cx, cy, hw, hh, lift, t, v) { return [cx + hw - hw * t, cy + hh * t - lift * v]; }

function facePatch(g, F, cx, cy, hw, hh, lift, t0, t1, v0, v1, fill, edge) {
  var a = F(cx, cy, hw, hh, lift, t0, v0), b = F(cx, cy, hw, hh, lift, t1, v0),
      c = F(cx, cy, hw, hh, lift, t1, v1), d = F(cx, cy, hw, hh, lift, t0, v1);
  g.beginPath();
  g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (edge) outline(g, edge);
}

function pathOf(g, pts) {
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}

// A hand-painted RA2 surface is never one flat fill. A wall catches sky
// light along the parapet and darkens into the ground, carries horizontal
// panel seams with rivets on them, and picks up grime where it meets the
// apron. Flat fills were most of what still read as vector art once the
// massing was right.
function drawWall(g, F, cx, cy, hw, hh, lift, col, lf, edge, seams) {
  var pts = [F(cx, cy, hw, hh, lift, 0, 0), F(cx, cy, hw, hh, lift, 1, 0),
             F(cx, cy, hw, hh, lift, 1, 1), F(cx, cy, hw, hh, lift, 0, 1)];
  var y0 = pts[0][1], y1 = pts[0][1];
  for (var i = 1; i < 4; i++) { if (pts[i][1] < y0) y0 = pts[i][1]; if (pts[i][1] > y1) y1 = pts[i][1]; }
  g.save(); pathOf(g, pts); g.clip();
  var grd = g.createLinearGradient(0, y0, 0, y1 + 1);
  grd.addColorStop(0, shade(col, lf * 1.16));
  grd.addColorStop(0.50, shade(col, lf));
  grd.addColorStop(1, shade(col, lf * 0.68));            // ambient occlusion at grade
  g.fillStyle = grd; pathOf(g, pts); g.fill();
  var sv = seams || [0.34, 0.68];
  for (var k = 0; k < sv.length; k++) {                  // panel seams + rivets
    var a = F(cx, cy, hw, hh, lift, 0, sv[k]), b = F(cx, cy, hw, hh, lift, 1, sv[k]);
    g.strokeStyle = 'rgba(0,0,0,.26)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.10)';
    g.beginPath(); g.moveTo(a[0], a[1] + 1); g.lineTo(b[0], b[1] + 1); g.stroke();
    for (var r = 0.08; r < 0.99; r += 0.14) {
      var q = F(cx, cy, hw, hh, lift, r, sv[k]);
      g.fillStyle = 'rgba(255,255,255,.16)';
      g.beginPath(); g.arc(q[0], q[1] - 1.4, 0.6, 0, 6.29); g.fill();
    }
  }
  g.restore();
  pathOf(g, pts); if (edge) outline(g, edge);
  return pts;
}

// A box in the ground projection. Returns the roof's y so callers can stack.
function prism(g, cx, cy, hw, hh, lift, wall, roof, edge, seams) {
  drawWall(g, faceL, cx, cy, hw, hh, lift, wall, 0.94, edge, seams);
  drawWall(g, faceR, cx, cy, hw, hh, lift, wall, 0.62, edge, seams);
  var ry = cy - lift;
  if (roof) {
    diamond(g, cx, ry, hw * 2, hh * 2);
    g.fillStyle = roof; g.fill(); if (edge) outline(g, edge);
    g.save(); diamond(g, cx, ry, hw * 2, hh * 2); g.clip();
    g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1;   // roof panel grid
    for (var t = -0.7; t <= 0.71; t += 0.35) {
      g.beginPath();
      g.moveTo(cx + t * hw - hw, ry + t * hh); g.lineTo(cx + t * hw + hw, ry + t * hh); g.stroke();
      g.beginPath();
      g.moveTo(cx - t * hw - hw, ry - t * hh); g.lineTo(cx - t * hw + hw, ry - t * hh); g.stroke();
    }
    g.restore();
    diamond(g, cx, ry, hw * 1.86, hh * 1.86);            // parapet lip
    g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 1.4; g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 1;
    diamond(g, cx, ry + 1.6, hw * 1.86, hh * 1.86); g.stroke();
  }
  return ry;
}

// --- greebles: the small ironmongery that makes a volume read as a working
// --- installation instead of a shape. Cheap, and it is the whole difference.
function railing(g, ax, ay, bx, by, h, col) {
  g.strokeStyle = col; g.lineWidth = 1;
  var n = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / 8));
  for (var i = 0; i <= n; i++) {
    var t = i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h); g.stroke();
  }
  g.beginPath(); g.moveTo(ax, ay - h); g.lineTo(bx, by - h); g.stroke();
  g.beginPath(); g.moveTo(ax, ay - h * 0.5); g.lineTo(bx, by - h * 0.5); g.stroke();
}

// Pipe run down a wall face, in that wall's own skew.
function pipeRun(g, F, cx, cy, hw, hh, lift, t, v0, v1, w, col) {
  var a = F(cx, cy, hw, hh, lift, t, v0), b = F(cx, cy, hw, hh, lift, t, v1);
  g.lineCap = 'round';
  g.strokeStyle = shade(col, 0.55); g.lineWidth = w + 1.4;
  g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  g.strokeStyle = shade(col, 1.05); g.lineWidth = w;
  g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = w * 0.30;
  g.beginPath(); g.moveTo(a[0] - w * 0.28, a[1]); g.lineTo(b[0] - w * 0.28, b[1]); g.stroke();
  for (var i = 1; i < 4; i++) {                          // pipe clamps
    var q = F(cx, cy, hw, hh, lift, t, v0 + (v1 - v0) * i / 4);
    g.strokeStyle = 'rgba(0,0,0,.42)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(q[0] - w * 0.8, q[1]); g.lineTo(q[0] + w * 0.8, q[1]); g.stroke();
  }
}

// Rust/grime streaking down from a vent or a seam — RA2 structures are
// filthy, and clean surfaces are a big part of what read as "toy".
function streak(g, F, cx, cy, hw, hh, lift, t, vTop, len, n) {
  for (var i = 0; i < n; i++) {
    var tt = t + (i - (n - 1) / 2) * 0.028;
    var a = F(cx, cy, hw, hh, lift, tt, vTop), b = F(cx, cy, hw, hh, lift, tt, Math.max(0, vTop - len));
    g.strokeStyle = 'rgba(60,44,26,' + (0.10 + 0.10 * (i % 2)) + ')';
    g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  }
}

function floodlight(g, x, y, dx, col) {
  g.strokeStyle = '#5a6068'; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 9); g.stroke();
  g.fillStyle = '#464c55';
  g.beginPath(); g.roundRect(x - 2.6 + dx * 1.2, y - 12.5, 5.2, 4, 1.2); g.fill();
  outline(g, '#23272c');
  g.fillStyle = '#ffe9a8';
  g.beginPath(); g.ellipse(x + dx * 2.6, y - 10.6, 1.5, 1.6, 0, 0, 6.29); g.fill();
  g.fillStyle = 'rgba(255,233,168,.16)';
  g.beginPath(); g.ellipse(x + dx * 5, y - 9.5, 6, 3.4, 0, 0, 6.29); g.fill();
}

function drums(g, x, y, n, col) {                        // fuel drums on the apron
  for (var i = 0; i < n; i++) {
    var dx2 = x + (i % 2) * 7 - i * 1.6, dy2 = y + Math.floor(i / 2) * 4;
    cylinder(g, dx2, dy2, 3.2, 7, shade(col, 0.86), shade(col, 1.12), '#2f2a1e');
    g.strokeStyle = 'rgba(0,0,0,.30)'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(dx2 - 3.2, dy2 - 4.6); g.lineTo(dx2 + 3.2, dy2 - 4.6); g.stroke();
    g.beginPath(); g.moveTo(dx2 - 3.2, dy2 - 2.4); g.lineTo(dx2 + 3.2, dy2 - 2.4); g.stroke();
  }
}

function crates(g, x, y, n, col) {
  for (var i = 0; i < n; i++) {
    var cxx = x + i * 9 - i * i * 0.5, cyy = y - (i % 2) * 3;
    isoBox(g, cxx, cyy, 8, 8, 6, 0, col, '#3a3226');
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(cxx - 3.4, cyy - 5.5); g.lineTo(cxx + 3.4, cyy - 3.5); g.stroke();
  }
}

// Pitched roof over a footprint diamond. The ridge runs left-corner to
// right-corner so BOTH slopes stay facing the camera.
// Pitched roof over a footprint diamond. The ridge runs between the
// MIDPOINTS of opposite eaves — i.e. along a grid axis, the way a real roof
// sits on a rectangular building. Running it corner-to-corner instead (the
// obvious-looking construction) splits the diamond into two triangles, and
// the near one becomes a huge downward cone: the "funnel roof" bug.
function gable(g, cx, cy, hw, hh, rise, cA, cB, edge) {
  var ax = cx - hw / 2, ay = cy - hh / 2 - rise;         // ridge, far end
  var bx = cx + hw / 2, by = cy + hh / 2 - rise;         // ridge, near end
  g.beginPath();                                          // far slope (N + E corners)
  g.moveTo(ax, ay); g.lineTo(cx, cy - hh); g.lineTo(cx + hw, cy); g.lineTo(bx, by);
  g.closePath(); g.fillStyle = cA; g.fill(); if (edge) outline(g, edge);
  g.beginPath();                                          // near slope (W + S corners)
  g.moveTo(ax, ay); g.lineTo(cx - hw, cy); g.lineTo(cx, cy + hh); g.lineTo(bx, by);
  g.closePath(); g.fillStyle = cB; g.fill(); if (edge) outline(g, edge);
  return [ax, ay, bx, by];
}

// Corrugated half-cylinder roof (a Nissen hut). This is the Allied
// barracks' whole identity in RA2 — a metal tube cut lengthwise dropped on
// a low base — and no amount of detail on a pitched roof substitutes for it.
// Built as bands across a circular cross-section: offset from the ridge line
// follows cos, height follows sin, so the silhouette is a true arc.
function vault(g, cx, cy, hw, hh, rise, col, edge) {
  var N = 8;
  function pt(sv, w, z) { return [cx + sv * hw / 2 - w * hw / 2, cy + sv * hh / 2 + w * hh / 2 - z]; }
  function band(sign, u0, u1, fill) {
    var w0 = sign * Math.cos(u0 * Math.PI / 2), w1 = sign * Math.cos(u1 * Math.PI / 2);
    var z0 = rise * Math.sin(u0 * Math.PI / 2), z1 = rise * Math.sin(u1 * Math.PI / 2);
    var a = pt(-1, w0, z0), b = pt(1, w0, z0), c = pt(1, w1, z1), d = pt(-1, w1, z1);
    g.beginPath();
    g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]);
    g.closePath(); g.fillStyle = fill; g.fill();
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 0.7; g.stroke();   // corrugation
  }
  for (var i = 0; i < N; i++)                            // far slope, in shade
    band(-1, i / N, (i + 1) / N, shade(col, 0.42 + 0.26 * (i / N)));
  for (i = N - 1; i >= 0; i--)                           // near slope, lit toward the ridge
    band(1, i / N, (i + 1) / N, shade(col, 0.66 + 0.52 * (i / N)));
  // Rib rings across the barrel. RA2's cylinders read as a stack of hoops,
  // not as a smooth tube, and that banding is most of the silhouette.
  for (i = 1; i < 7; i++) {
    var rt = -1 + 2 * i / 7;
    var a2 = pt(rt, Math.cos(0.02) * 1, 0), b2 = pt(rt, 0, rise);
    var c2 = pt(rt, -1, 0);
    g.strokeStyle = 'rgba(20,24,30,.34)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(a2[0], a2[1]);
    g.quadraticCurveTo(b2[0], b2[1] - 1.5, c2[0], c2[1]); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.26)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(a2[0] + 1.6, a2[1]);
    g.quadraticCurveTo(b2[0] + 1.6, b2[1] - 1.5, c2[0] + 1.6, c2[1]); g.stroke();
  }
  // near end cap: a semicircular gable wall between the S and E corners
  var s0 = pt(1, 1, 0), s1 = pt(1, -1, 0), apex = pt(1, 0, rise);
  g.beginPath();
  g.moveTo(s0[0], s0[1]);
  g.quadraticCurveTo(s0[0] + (apex[0] - s0[0]) * 0.35, apex[1] + 2, apex[0], apex[1]);
  g.quadraticCurveTo(s1[0] + (apex[0] - s1[0]) * 0.35, apex[1] + 2, s1[0], s1[1]);
  g.closePath();
  g.fillStyle = shade(col, 1.02); g.fill(); if (edge) outline(g, edge);
  return apex;
}

// Waisted cooling tower — the one silhouette that says "power" with no
// label on it at all.
function coolTower(g, cx, cy, rb, rt, h, col, edge) {
  function silh() {
    g.beginPath();
    g.moveTo(cx - rb, cy);
    g.quadraticCurveTo(cx - rt * 1.30, cy - h * 0.66, cx - rt, cy - h);
    g.lineTo(cx + rt, cy - h);
    g.quadraticCurveTo(cx + rt * 1.30, cy - h * 0.66, cx + rb, cy);
    g.closePath();
  }
  silh(); g.fillStyle = shade(col, 0.66); g.fill();
  g.save(); silh(); g.clip();
  g.fillStyle = shade(col, 0.98); g.fillRect(cx - rb - 2, cy - h - 2, rb * 0.85, h + 4);
  g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = 1;    // concrete lift-bands
  for (var i = 1; i < 5; i++) {
    var yy = cy - h * i / 5;
    g.beginPath(); g.moveTo(cx - rb - 2, yy); g.lineTo(cx + rb + 2, yy); g.stroke();
  }
  g.restore();
  silh(); outline(g, edge);
  g.fillStyle = shade(col, 1.12);                        // rim
  g.beginPath(); g.ellipse(cx, cy - h, rt, rt * 0.40, 0, 0, 6.29); g.fill(); outline(g, edge);
  g.fillStyle = 'rgba(20,24,20,.55)';                    // dark mouth
  g.beginPath(); g.ellipse(cx, cy - h + 0.6, rt * 0.74, rt * 0.30, 0, 0, 6.29); g.fill();
}

function steam(g, cx, cy, r, n) {
  for (var i = 0; i < n; i++) {
    g.fillStyle = 'rgba(226,236,244,' + (0.30 - i * 0.055) + ')';
    g.beginPath();
    g.ellipse(cx + (i % 2 ? 1 : -1) * r * 0.32 * i, cy - r * 0.85 * i,
              r * (1 - i * 0.13), r * (0.5 - i * 0.06), 0, 0, 6.29);
    g.fill();
  }
}

// Hazard chevrons across a wall patch — the loudest "vehicles come out
// here" cue RA2 uses, and it costs four quads.
function chevrons(g, F, cx, cy, hw, hh, lift, t0, t1, v0, v1, n, cA, cB) {
  for (var i = 0; i < n; i++) {
    var a = t0 + (t1 - t0) * i / n, b2 = t0 + (t1 - t0) * (i + 1) / n;
    facePatch(g, F, cx, cy, hw, hh, lift, a, b2, v0, v1, i % 2 ? cA : cB, null);
  }
}

function lattice(g, x0, y0, x1, y1, w, col) {
  var dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  var nx = -dy / L * w / 2, ny = dx / L * w / 2;
  g.strokeStyle = col; g.lineWidth = 1.6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x0 + nx, y0 + ny); g.lineTo(x1 + nx, y1 + ny); g.stroke();
  g.beginPath(); g.moveTo(x0 - nx, y0 - ny); g.lineTo(x1 - nx, y1 - ny); g.stroke();
  g.lineWidth = 1;
  var seg = Math.max(2, Math.round(L / 7));
  for (var i = 0; i < seg; i++) {
    var u0 = i / seg, u1 = (i + 1) / seg;
    var ax = x0 + dx * u0, ay = y0 + dy * u0, bx = x0 + dx * u1, by = y0 + dy * u1;
    g.beginPath();
    g.moveTo(ax + nx * (i % 2 ? 1 : -1), ay + ny * (i % 2 ? 1 : -1));
    g.lineTo(bx - nx * (i % 2 ? 1 : -1), by - ny * (i % 2 ? 1 : -1));
    g.stroke();
  }
}

// --- hand-authored pixel sprites --------------------------------------
// RA2's look is not geometry, it is hand-painted SHP art: integer pixels on
// a locked palette, with dithering and hand-placed highlights. Generated
// vector shapes cannot reach that no matter how good the massing gets, so
// structures are authored as pixel grids and blitted a cell at a time.
// One character per cell; ' ' is transparent; H/h are remapped to the
// owning player's colour, everything else is fixed so a red base and a blue
// base read as the same building.
var PIXCELL = 2;                                   // css px per authored cell

// Real ramps, not a handful of tones propped up by dithering. Six steps of
// concrete and four each of roof and steel is what lets a surface be shaded
// in clean bands; scatter across a flat face just reads as noise.
var PIXPAL = {
  'k': '#1c1c16',
  '1': '#4a4438', '2': '#665d4d', '3': '#847a64',
  '4': '#a1957b', '5': '#bdb094', '6': '#d6caae',
  'p': '#252a1c', 'q': '#333a28', 'r': '#4a5240', 't': '#606850', 'u': '#767e63',
  'a': '#3a3f3c', 's': '#5c625d', 'd': '#828881', 'f': '#a8aea6',
  'v': '#7fb8d8', 'y': '#e0a726', 'o': '#8a5a2a',
  '.': 'rgba(0,0,0,.34)'
};

function bakePix(art, col) {
  var rows = art.rows, cols = 0, i;
  for (i = 0; i < rows.length; i++) cols = Math.max(cols, rows[i].length);
  var s = mkCanvas(cols * PIXCELL, rows.length * PIXCELL), g = s.g;
  var house = col, houseDark = shade(col, 0.58);
  for (var y = 0; y < rows.length; y++) {
    var line = rows[y];
    for (var x = 0; x < line.length; x++) {
      var ch = line.charAt(x);
      if (ch === ' ') continue;
      var fill = ch === 'H' ? house : (ch === 'h' ? houseDark : PIXPAL[ch]);
      if (!fill) continue;
      g.fillStyle = fill;
      g.fillRect(x * PIXCELL, y * PIXCELL, PIXCELL, PIXCELL);
    }
  }
  return { s: s, ax: art.ax * PIXCELL, ay: art.ay * PIXCELL };
}

// No grids authored: shape is what was wrong, not the medium, so every
// structure renders from geometry below. bakePix stays for later.
var PIXBLD = {};

// A gun raised `el` radians and traversed to WORLD bearing `th`, seen in
// this isometric projection: `a` is the angle to draw the barrel at on the
// sprite, `k` how much it foreshortens, and (sx,sy) the screen-space unit
// vector of the bearing itself (what a launcher or a gun slit slides along).
// At th = -PI/4 this returns exactly the head-on pose the defences were
// drawn in, so a null bearing and bearing 7 look the same.
function gunAim(th, el) {
  var sdx = Math.cos(th) - Math.sin(th), sdy = (Math.cos(th) + Math.sin(th)) * 0.5;
  var m = Math.sqrt(sdx * sdx + sdy * sdy) || 1;
  sdx /= m; sdy /= m;
  var ce = Math.cos(el), se = Math.sin(el);
  var vx = sdx * ce, vy = sdy * ce - se;
  return { a: Math.atan2(vy, vx), k: Math.sqrt(vx * vx + vy * vy), sx: sdx, sy: sdy };
}

// `dopen` (0..1) is the PRODUCTION DOOR position, RA2's DoorStages: 0 is
// shut (the idle state of [GAWEAP]/[NAWEAP]/[GAPILE]/[NAHAND]), 1 is fully
// open. Only the War Factory and the Barracks read it; every other key
// ignores it, and every existing caller passes nothing, which is shut.
// (gw+gh) each structure's art was proportioned at before the footprints
// moved to RA2's Foundation=. Used only to rescale the headroom allowance.
var FOOT0 = { base: 6, power: 4, refinery: 5, barracks: 4, factory: 6,
              airforce: 4, depot: 6, lab: 4, purifier: 4, reactor: 4,
              chrono: 6, cloningvats: 5, gapgen: 4 };

// How hard the vertical mass follows the plot (default 0.5 -- see
// bakeBuilding). Keyed `key` or, where RA2's two factions disagree,
// `key:fac`; the faction-specific entry wins. Measured against
// docs/ra2-ref/ with a corrected aspect.py, not guessed: `factory` is the
// case that forced the split, because the Soviet hall is 14% too flat at
// the square root while the Allied vault is already 7% too tall.
// `reactor: 0` — the Nuclear Reactor was the one structure whose art
// already stood at the right height for its 2x3 plot: at the square root it
// came out 12.1% too tall against `soviet-nuclear-reactor-idle.png` (166x129
// -> 1.287). It had never been measured because REF pointed at a filename
// that did not exist on disk.
// `lab: 0` — the Battle Lab was the one key where the full factor compounded
// an art that was already tall. VPOW 1 stretched the Allied 3x2 by 1.25 and
// the Soviet 3x3 by 1.50 on top of a drawing whose own vertical mass was
// drawn for a 2x2, and the result was the TALLEST SPRITE IN THE GAME: 306 px
// on a 3x2 plot, taller than the 4x4 Construction Yard. Measured against
// RA2's own art (RA2_BLD in tools/art-metrics.js), the Soviet lab came out
// 1.55x RA2's height-over-footprint against a building house scale of 1.21 —
// the second-worst structure on the board — and the Allied one 1.35x. At
// VPOW 0 they bake 261 and 217 px, which is RA2's [GATECH] 2.84 and [NATECH]
// 1.867 footprint-heights at the house scale, near enough.
//
// Note what this does NOT say: the Allied Battle Lab is legitimately the
// tall one. RA2 draws [GATECH] at 2.84 footprint-heights — the tallest
// structure in its own game — and art.ini gives it Height=12 against the
// Construction Yard's 4. The fault was 11% and 55%, not the 3.8x that the
// raw footprint ratio suggests when there is nothing to compare it to.
var VPOW = { airforce: 1, depot: 1, lab: 0, 'factory:col': 1, reactor: 0 };

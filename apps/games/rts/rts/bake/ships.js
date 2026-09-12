// Iron Frontier — bake/ships.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.

















function bakeShip(col, kind, fac) {
  var sov = fac === 'col';
  var HOUSE = col, HD = shade(col, 0.74), HL = shade(col, 1.24);
  var GUN = '#191b20', GUN_L = '#5b616b', STEEL = '#9aa0a8', DKSTEEL = '#4a505a';
  var GLASS = '#7fb6d8', WHITE = '#e6eaf0';
  // Hull colours. Directorate hulls are haze grey; Collective hulls are the
  // dark olive-slate the Soviet fleet wears. Neither is chromatic, so the
  // owner colour keeps the field to itself.
  var HULL = sov ? '#666d61' : '#8d97a3';
  var DECK = sov ? '#3d4239' : '#454c57';
  if (kind === 'sub')      { HULL = '#2f333a'; DECK = '#1e2126'; }
  if (kind === 'dolphin')  { HULL = '#728798'; DECK = '#4b5a68'; }
  if (kind === 'squid')    { HULL = sov ? '#6c4a60' : '#6c4a60'; DECK = '#432c3d'; }
  if (kind === 'lcraft')   { HULL = '#7e8778'; DECK = '#41473c'; }
  if (kind === 'carrier')  { HULL = '#8a949f'; DECK = '#3a3f47'; }
  var BOOT = shade(HULL, 0.34);                       // boot-topping at the waterline

  // Plan geometry per hull, in pre-scale pixels. L is overall length, W
  // beam, FREE the freeboard the deck stands on.
  //
  // SIZE CLASS is the first read — reference §1.1's rule 1, "size and aspect
  // together carry the first read, before a single detail is resolved" — and
  // these nine lengths are RA2's own broadside sprite widths rescaled so the
  // Destroyer keeps L 46 against its 101 px sprite: Carrier 143 -> 65,
  // Dreadnought 133 -> 61, Giant Squid 117 -> 53, Aegis 91 -> 41, Typhoon
  // 75 -> 34, Sea Scorpion 59 -> 27. The first draft bunched all nine
  // between 18 and 58 and put the SQUID — RA2's second-largest hull — at 20,
  // the single largest proportion error in the game. That is most of why a
  // peer beat EIGHT of ten ships: `iou()` centres both masks on their bbox
  // centre, so a size difference separates two hulls on its own, and a shared
  // size class cannot be undone by fittings that are 8% of the mask.
  var G = { destroyer: { L: 46, W: 12, FREE: 5.0 },
            aegis:     { L: 43, W: 13, FREE: 4.4 },
            carrier:   { L: 71, W: 23, FREE: 6.6 },
            dolphin:   { L: 19, W: 5,  FREE: 2.0 },
            lcraft:    { L: 32, W: 24, FREE: 3.4 },
            sub:       { L: 35, W: 5,  FREE: 1.0 },
            seascorp:  { L: 27, W: 13, FREE: 3.6 },
            dread:     { L: 62, W: 16, FREE: 4.2 },
            squid:     { L: 48, W: 14, FREE: 2.2 } }[kind];

  function frame(d) {
    // The three hulls whose plan runs off a 104 px sheet. The Squid joined
    // them when it grew to RA2's own 117 px class: its arms reach L * 1.05
    // from the mantle, and a clipped arm is an invisible bug that only a
    // rendered frame catches.
    var big = kind === 'carrier' || kind === 'dread' || kind === 'squid';
    var s = big ? mkCanvas(150, 112) : unitCanvas(), g = s.g;
    var cx = s.w / 2, by = s.h - UPAD;
    g.translate(cx, by); g.scale(USC_V, USC_V); g.translate(-cx, -by);
    var a = d * FANG, cd = Math.cos(a), sd = Math.sin(a);
    var fx = ISO_X * (cd - sd), fy = ISO_Y * (cd + sd);       // forward
    var px = ISO_X * (-sd - cd), py = ISO_Y * (-sd + cd);     // sideways
    var nearS = py >= 0 ? 1 : -1;                             // the flank facing us
    var head = fy;                                            // >0 = coming toward the camera

    function P(u, v, z) { return [cx + fx * u + px * v, cy0 + fy * u + py * v - (z || 0)]; }
    var cy0 = by;

    // ---- the plan outline ------------------------------------------- //
    var L = G.L / 2, W = G.W / 2, FR = G.FREE;
    var stem = kind === 'lcraft' ? 0.72 : (kind === 'carrier' ? 0.86 : 1);   // a landing craft has a blunt ramp bow
    // THE STEM IS A BAR, NOT A POINT. A plan that comes to zero beam extrudes
    // its freeboard into a two-pixel POST, and seen end-on that post is the
    // tallest thing on the ship — so `spikeOf`, which scores the median width
    // of everything standing above the hull, was measuring the Destroyer's
    // stem at 4 px and calling it her identity feature, against a 5 px budget
    // for a bridge that is three times that wide. Every real hull has a stem
    // plate; the Typhoon's is finer because her casing is.
    var SB = kind === 'sub' ? 0.16 : 0.28;
    var plan = kind === 'squid'
      ? [[L, 0], [L * 0.5, W * 0.8], [-L * 0.2, W], [-L * 0.9, W * 0.55],
         [-L, 0], [-L * 0.9, -W * 0.55], [-L * 0.2, -W], [L * 0.5, -W * 0.8]]
      : [[L * stem, W * SB], [L * 0.66 * stem, W * 0.70], [L * 0.12, W], [-L * 0.76, W],
         [-L, W * 0.70], [-L, -W * 0.70], [-L * 0.76, -W], [L * 0.12, -W],
         [L * 0.66 * stem, -W * 0.70], [L * stem, -W * SB]];
    if (kind === 'lcraft') { plan[0] = [L * 0.86, W * 0.34]; plan[plan.length - 1] = [L * 0.86, -W * 0.34]; }

    function poly(z, fill, line) {
      g.beginPath();
      for (var i = 0; i < plan.length; i++) {
        var q = P(plan[i][0], plan[i][1], z);
        if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]);
      }
      g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (line) { g.strokeStyle = line; g.lineWidth = 0.8; g.stroke(); }
    }

    // The Dolphin and the Giant Squid are ANIMALS, and §2.3/§2.4 ask for
    // "no orthogonal edges anywhere" and "zero straight edges ... the only
    // unit whose outline is not a machine". They were being drawn on top of
    // the same hull polygon every warship gets — a filled plan, a graded
    // freeboard and a lit sheer line — so under the paint the Squid was a
    // 50 x 16 SHIP, and the alpha mask the gate reads is exactly that hull.
    // She matched the Destroyer at 0.73. Skipping the three ship steps is
    // what the spec asked for in the first place.
    var organic = kind === 'squid' || kind === 'dolphin';
    // 1. The wet hull: the plan filled at the waterline, a shade darker
    //    than the topsides. Drawn FIRST so the freeboard sits on it.
    if (!organic) poly(0, BOOT);
    // 2. Freeboard: one quad per plan edge, far ones first so the near
    //    flank wins, graded like every other iso wall in the game.
    var edges = [], i2;
    for (i2 = 0; organic ? false : i2 < plan.length; i2++) {
      var pA = plan[i2], pB = plan[(i2 + 1) % plan.length];
      var mA = P(pA[0], pA[1], 0), mB = P(pB[0], pB[1], 0);
      edges.push({ a: pA, b: pB, y: (mA[1] + mB[1]) / 2 });
    }
    edges.sort(function (m, n) { return m.y - n.y; });
    for (i2 = 0; i2 < edges.length; i2++) {
      var e = edges[i2];
      var q0 = P(e.a[0], e.a[1], 0), q1 = P(e.b[0], e.b[1], 0);
      var lit = ((q0[1] + q1[1]) / 2 - cy0) > 0 ? 1 : 0.62;
      g.beginPath();
      g.moveTo(q0[0], q0[1]); g.lineTo(q1[0], q1[1]);
      g.lineTo(q1[0], q1[1] - FR); g.lineTo(q0[0], q0[1] - FR);
      g.closePath();
      var top = Math.min(q0[1], q1[1]) - FR, bot = Math.max(q0[1], q1[1]);
      var grd = g.createLinearGradient(0, top, 0, bot + 0.5);
      grd.addColorStop(0, shade(HULL, 1.10 * lit));
      grd.addColorStop(0.62, shade(HULL, 0.92 * lit));
      grd.addColorStop(1, shade(HULL, 0.66 * lit));
      g.fillStyle = grd; g.fill();
      // A single house stripe high on the flank, only on the lit side.
      if (lit === 1 && kind !== 'sub' && kind !== 'dolphin' && kind !== 'squid') {
        g.strokeStyle = HOUSE; g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(q0[0], q0[1] - FR + 1.2); g.lineTo(q1[0], q1[1] - FR + 1.2); g.stroke();
        g.strokeStyle = HD; g.lineWidth = 0.6;
        g.beginPath();
        g.moveTo(q0[0], q0[1] - FR + 2.2); g.lineTo(q1[0], q1[1] - FR + 2.2); g.stroke();
      }
    }
    // 3. The deck.
    if (!organic) {
      var dg = g.createLinearGradient(0, cy0 - FR - Math.abs(fy) * L, 0, cy0 - FR + Math.abs(fy) * L);
      dg.addColorStop(0, shade(DECK, 1.30)); dg.addColorStop(1, shade(DECK, 0.92));
      poly(FR, null, null);
      g.save(); poly(FR, null, null); g.clip();
      poly(FR, dg, null);
      g.restore();
      poly(FR, null, shade(HULL, 1.35));               // lit sheer line
    }

    // ---- helpers on the deck ---------------------------------------- //
    function box(u, v, len, wid, hgt, colr) {
      var q = P(u, v, FR);
      isoBox(g, q[0], q[1], len, wid, hgt, a, colr, 'rgba(10,12,16,.55)');
    }
    function mast(u, v, h, colr) {
      var q = P(u, v, FR);
      g.strokeStyle = colr || DKSTEEL; g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q[0], q[1] - h); g.stroke();
      g.strokeStyle = colr || DKSTEEL; g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(q[0] - 3, q[1] - h * 0.72); g.lineTo(q[0] + 3, q[1] - h * 0.72); g.stroke();
    }
    function barrel(u, v, z, len, thick) {
      var q = P(u, v, FR + z), r = P(u + len, v, FR + z);
      g.strokeStyle = GUN; g.lineWidth = thick;
      g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(r[0], r[1]); g.stroke();
      g.strokeStyle = GUN_L; g.lineWidth = Math.max(0.6, thick - 1.1);
      g.beginPath(); g.moveTo(q[0], q[1] - 0.4); g.lineTo(r[0], r[1] - 0.4); g.stroke();
    }
    function disc(u, v, z, rx, ry, colr) {
      var q = P(u, v, FR + z);
      g.fillStyle = colr; g.beginPath(); g.ellipse(q[0], q[1], rx, ry, 0, 0, 6.29); g.fill();
    }

    var C = { DECK: DECK, FR: FR, G: G, GLASS: GLASS, GUN: GUN, GUN_L: GUN_L, HD: HD, HL: HL,
              HOUSE: HOUSE, HULL: HULL, L: L, P: P, STEEL: STEEL, W: W, barrel: barrel, box: box,
              disc: disc, g: g, mast: mast, nearS: nearS, plan: plan, poly: poly };
    if (kind === 'destroyer') {
      drawDestroyer(C);
    } else if (kind === 'aegis') {
      drawAegis(C);
    } else if (kind === 'carrier') {
      drawCarrier(C);
    } else if (kind === 'dread') {
      drawDread(C);
    } else if (kind === 'seascorp') {
      drawSeascorp(C);
    } else if (kind === 'lcraft') {
      drawLcraft(C);
    } else if (kind === 'sub') {
      drawSub(C);
    } else if (kind === 'dolphin') {
      drawDolphin(C);
    } else if (kind === 'squid') {
      drawSquid(C);
    }
    // A bow wave on every surface hull: two pale chevrons off the stem, on
    // the water, so a ship reads as sitting IN something.
    if (kind !== 'sub' && kind !== 'dolphin' && kind !== 'squid') {
      // Both arms START AT THE STEM and sweep aft and outboard, which is
      // what a bow wave is. The first draft drew each chevron as ONE curve
      // between two points abeam of the stem, so its ends floated free of
      // the plan — and at the two facings where the hull is nearly beam-on
      // to the camera the hull's projected width collapses while the wave's
      // does not, which pulled the whole chevron off the ship. Anchoring
      // the arms on the stem makes that impossible at any bearing.
      //
      // How far outboard the wave throws is set by the ship's LENGTH, not by
      // her beam alone. A flat `W * 1.96` gave the Landing Craft — the
      // beamiest hull afloat and the slowest — a wake half again her own
      // width, and end-on that 1-px stroke became the longest horizontal
      // protrusion on the sprite, so the gate scored her bow WAVE as her
      // identity feature at 3 px instead of her ramp. Same class of bug as
      // the Desolator's backpack: the thin decorative thing wins.
      var WV = Math.min(W, L * 0.30);
      g.strokeStyle = 'rgba(232,244,252,.34)'; g.lineWidth = 1.0;
      var stemQ = P(L * 0.97, 0, 0);
      for (var wi = 0; wi < 2; wi++) {
        for (var sgn = -1; sgn <= 1; sgn += 2) {
          var bwT = P(L * (0.30 - wi * 0.34), sgn * (W + WV * (0.34 + wi * 0.62)), 0);
          var bwC = P(L * (0.86 - wi * 0.10), sgn * (W + WV * (0.00 + wi * 0.40)), 0);
          g.beginPath(); g.moveTo(stemQ[0], stemQ[1]);
          g.quadraticCurveTo(bwC[0], bwC[1], bwT[0], bwT[1]); g.stroke();
        }
      }
    }
    return s;
  }
  // 32 bearings, baked LAZILY, exactly as bakeVehicle's sheet is. Hulls
  // shipped with a flat 8-frame array while `u.face` had already moved to
  // 0..31 for every vehicle and aircraft, so `set[u.face]` was `undefined`
  // for 24 of the 32 bearings and drawUnit threw the moment a ship turned
  // off a cardinal — caught by driving a set-piece and screenshotting it,
  // which no headless balance run can see.
  return faceSheet(frame);
}

// Same lazy atlas as infArt: one standing frame at load, the rest of the
// 8 x 10 set baked the first time a dog actually faces that way.
function dogArt(col, fac) {
  var base = bakeDog(col, fac, 0, 1, 'stand');
  var cache = { 'stand1_0': base };
  base.inf = true;
  base.dog = true;
  base.fr = function (st, dir, phase) {
    if (!DOG_SEQ[st]) st = 'stand';
    var nf = DOG_SEQ[st], d = octOf(dir);              // 32-facing in, 8 SHP facings out
    var ph = (((phase | 0) % nf) + nf) % nf;
    var k = st + d + '_' + ph;
    return cache[k] || (cache[k] = bakeDog(col, fac, ph, d, st));
  };
  return base;
}

// A deployed GI's SANDBAG EMPLACEMENT. Rebuilt from `docs/ra2-ref/allied-gi.png`,
// which shows three of them: RA2 drops a complete RING of bags — an oval
// doughnut about 32x19 with a lower BACK lip and a taller front parapet —
// and the man sits down INSIDE it, so only his helmet, his blue shoulders
// and his gun clear the rim. The old bake was a front arc only, with no
// back lip at all, which read as a soldier standing behind a crescent of
// bags rather than dug into a pit; and it painted a house-colour stripe
// along the crest, which RA2 does not — the bags stay khaki and the OWNER's
// colour on the emplacement is the man's own vest showing over the rim.
// Baked as TWO canvases on the infantry sheet and anchor: `back` goes down
// before the man, `front` over him.
function bakeSandbags(col) {
  var back = unitCanvas(), front = unitCanvas();
  var BAG = '#847b5e', BAGL = '#a39a7a', BAGD = '#3b352a', BAGX = '#5e5644';
  // A sack, not a cobble: an OBLONG laid along the ring's tangent, which is
  // what makes a course of them read as stacked bags at 1:1.
  function bag(g, x, y, rx, ry, tone, rot) {
    g.fillStyle = tone === 2 ? BAGL : (tone === 1 ? BAG : BAGX);
    g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, 6.29); g.fill();
    g.strokeStyle = BAGD; g.lineWidth = 1.1; g.stroke(); g.lineWidth = 1;
    if (tone) {
      g.fillStyle = 'rgba(255,255,255,.16)';
      g.beginPath();
      g.ellipse(x - rx * 0.18, y - ry * 0.42, rx * 0.50, ry * 0.30, rot || 0, 0, 6.29); g.fill();
    }
  }
  function tang(a, rx, ry) { return Math.atan2(ry * Math.cos(a), -rx * Math.sin(a)); }
  var gb = back.g, gf = front.g, cx = back.w / 2, by = back.h - UPAD;
  var RX = 15.4, RY = 7.2, i, a2, jr = lcg(5171);
  function jx() { return 0.86 + jr() * 0.30; }   // per-bag size jitter (seeded, never Math.random)

  // ---- behind the man: his own ground shadow, the pit, the back lip -----
  gb.fillStyle = 'rgba(0,0,0,.26)';
  gb.beginPath(); gb.ellipse(cx + 1.2, by + 1.6, RX + 1.6, RY + 1.2, 0, 0, 6.29); gb.fill();
  // the hole he is sitting in: a dark dished floor inside the ring
  gb.fillStyle = '#463f32';
  gb.beginPath(); gb.ellipse(cx, by - 3.2, RX - 3.6, RY - 1.8, 0, 0, 6.29); gb.fill();
  gb.fillStyle = 'rgba(0,0,0,.30)';
  gb.beginPath(); gb.ellipse(cx, by - 4.4, RX - 5.0, RY - 3.0, 0, 0, 6.29); gb.fill();
  for (i = 0; i < 9; i++) {                      // back lip, lower course
    a2 = Math.PI + 0.12 + (i / 8) * (Math.PI - 0.24);
    bag(gb, cx + Math.cos(a2) * RX, by + Math.sin(a2) * RY - 1.0, 3.5 * jx(), 2.0, 0, tang(a2, RX, RY));
  }
  for (i = 0; i < 8; i++) {                      // back lip, upper course
    a2 = Math.PI + 0.20 + ((i + 0.5) / 8) * (Math.PI - 0.40);
    bag(gb, cx + Math.cos(a2) * (RX - 1.0), by + Math.sin(a2) * (RY - 0.5) - 4.0, 3.3 * jx(), 1.9, 1,
        tang(a2, RX, RY));
  }

  // ---- over the man: the front parapet, three courses -------------------
  for (i = 0; i < 10; i++) {
    a2 = -0.16 + (i / 9) * (Math.PI + 0.32);
    bag(gf, cx + Math.cos(a2) * RX, by + Math.sin(a2) * RY - 1.2, 3.6 * jx(), 2.1, 0, tang(a2, RX, RY));
  }
  for (i = 0; i < 9; i++) {
    a2 = -0.04 + ((i + 0.5) / 9) * (Math.PI + 0.08);
    bag(gf, cx + Math.cos(a2) * (RX - 0.9), by + Math.sin(a2) * (RY - 0.4) - 4.6, 3.5 * jx(), 2.0, 1,
        tang(a2, RX, RY));
  }
  for (i = 0; i < 8; i++) {
    a2 = 0.06 + ((i + 0.2) / 8) * (Math.PI - 0.12);
    bag(gf, cx + Math.cos(a2) * (RX - 2.2), by + Math.sin(a2) * (RY - 1.0) - 8.4, 3.3 * jx(), 1.9, 2,
        tang(a2, RX, RY));
  }
  // the crest shadow the bags cast back into the pit, so the ring reads as
  // a hole rather than as a pile of stones on flat ground
  gf.strokeStyle = 'rgba(30,26,16,.34)'; gf.lineWidth = 2.0;
  gf.beginPath();
  for (i = 0; i <= 14; i++) {
    a2 = 0.16 + (i / 14) * (Math.PI - 0.32);
    var xq = cx + Math.cos(a2) * (RX - 4.4), yq = by + Math.sin(a2) * (RY - 2.2) - 9.8;
    if (i) gf.lineTo(xq, yq); else gf.moveTo(xq, yq);
  }
  gf.stroke(); gf.lineWidth = 1;
  return { back: back, front: front };
}

// Vehicles get 8 baked facings, and every facing is built from the same
// five moves so none of them collapses into a flat elevation:
//
//   1. TRACKS that wrap. A track is a stadium in the ground plane — a
//      straight run with a semicircular drive sprocket at each end — not a
//      box. It is extruded to a LIT top run with DARK road wheels sunk into
//      the flank below, which is the pattern the eye actually uses to read
//      "tracked vehicle" at 20px.
//   2. A HULL with three tones: a lit top deck, a mid-tone flank, a dark
//      underbody skirt, plus a RAKED GLACIS sloping down to the nose. The
//      glacis is what stopped the three-quarter facings reading as stacked
//      cuboids; a hull whose top plane simply ends in a vertical wall has
//      no direction in it.
//   3. A 1px LIGHTER EDGE along the lit silhouette line, so the shape has a
//      drawn contour instead of only a gradient.
//   4. TURRETS with a rounded, chamfered mantlet (an extruded disc, not a
//      cube) and barrels that TAPER to a dark muzzle with a pale tip.
//   5. Fitments — a hatch circle, a headlamp, a rear exhaust box — the same
//      three every time, so the fleet looks like one design language.
//
// Each type still has its own NEUTRAL body colour (pale silver Grizzly,
// grey Prism, olive Apocalypse, tan/golden miner bins), and `col` is trim.
// ── VACC — the vehicles' own accents ──────────────────────────────────────
// C5 of unit-redesign-plan.md: "nine of thirteen ground vehicles picked a
// near-neutral grey, and for each, ALL TWELVE peers carry the same colour
// family. The three with a chromatic accent — both miners and the MCV — are
// precisely the three outside the confusable cluster." That is the
// experiment already run for us, so every ground vehicle gets a fixed hue
// that is ITS OWN, sited on the identity feature
// unit-identity-reference.md 2.3/2.4 names for it.
//
// Two rules bind the choices. (1) Only the OWNER's colour may be saturated
// as a SIDE, so a fixed accent has to be a hue no owner uses: our houses sit
// at 203 degrees (blue) and 356 (red), and every entry below is at least 30
// degrees off both — the Conscript's trousers, 11 degrees off red and
// reading 39% "red" to the census, are the recorded cost of getting this
// wrong (docs/design-decisions.md). (2) The accents are spread round the two
// usable arcs (31-168 and 238-321) rather than clustered, so no two
// vehicles in the confusable cluster share a colour family.
//
// This table is VEHICLE-ONLY and deliberately separate from ACCENT, which
// infantry share: the two rosters have different hue budgets (2.1/2.2 vs
// 2.3/2.4) and one table made every vehicle inherit a soldier's palette.
var VACC = {
  // -- Directorate
  lancer:      '#33bda6',  // 170 jade   — the vision block beside the Grizzly's mantlet.
                           //   Its BODY stays pale silver: 1.4 names it, and the
                           //   silver is the spec, not an omission.
  ifv:         '#dcd046',  //  55 hazard yellow — beacon and chevron on the tall
                           //   launcher box that 2.3 makes the IFV's whole read
  mirage:      '#2fbe6b',  // 145 holo-green — the projector mouth of the emitter
                           //   housing. The Mirage disguises itself as a TREE.
  mirageStack: '#e9edf2',  //     the ribbed WHITE emitter plates 2.3 asks for
  spectre:     '#d45ad0',  // 302 magenta — the refraction flare across the prism
                           //   crystal's bright face (the crystal CORE stays owner-hue)
  chronominer: '#8f6ac8',  // 264 violet — the ribbed chrono drum that IS the unit,
                           //   "violet and unmistakably not house hue" (2.3)
  mcv:         '#e0a33c',  //  38 amber  — the folded crane boom on the works slab
  // -- Collective
  rhino:       '#5ba33a',  // 101 Soviet green — the vision block, the driver's plate
                           //   and the engine-deck louvres. NOT the 66-degree moss it
                           //   started as: that shared a hue bin with the V3's olive
                           //   truck and the pair measured 0.093 apart, the closest
                           //   colour pair on the field.
  rhinoGun:    '#2b2f36',  //     NEUTRAL gunmetal barrel. The Lancer's navy put an
                           //     OPPOSING hue on a Soviet tank (4.4% of the sprite).
  mammothGun:  '#15161a',  //     gun-black twin barrels. 1.4: "hull, tracks and the
                           //     twin barrels are olive-grey" — so the Apocalypse's
                           //     own colour is its OLIVE, deepened in `hull` below,
                           //     and the house colour is the four canister drums.
  teslatank:   '#d08c46',  //  28 copper — the ring windings of the two coil columns.
                           //   A Tesla coil is wound in copper; pale steel rings were
                           //   the ninth grey on a field of greys.
  flaktrack:   '#3fae43',  // 122 ordnance green — the gun shield, the one bright
                           //   vertical face on an otherwise cream halftrack
  v3:          '#e6e7e9',  //     the missile midbody is PURE WHITE and 2.4 says so in
                           //     as many words; the V3's colour is its OLIVE TRUCK,
                           //     which the same bullet calls olive and we drew grey.
  drone:       '#6a63e0',  // 243 electric indigo — the eye cluster and leg joints
  warminer:    '#b39a4e',  //  45 — the golden slatted ore bin. Already its own hue:
                           //     the War Miner is one of C5's three control units.
};

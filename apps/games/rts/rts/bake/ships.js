// Iron Frontier — bake/ships.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.

















function bakeShip(col, kind, fac) {
  var sov = fac === 'col';
  var HOUSE = col, HD = shade(col, 0.74), HL = shade(col, 1.24);
  var GUN = '#1b1b1b', GUN_L = '#626262', STEEL = '#9e9e9e', DKSTEEL = '#515151';
  var GLASS = '#7fb6d8', WHITE = '#eaeaea';
  // Hull colours. BOTH fleets wear GREY — that is what the rips show, and it
  // was not ours to invent. `library/dread.png` and `library/seascorp.png` are
  // the Soviet navy in its own remap, and both hulls are a flat neutral
  // warship grey with the house colour banded on top; `library/sub.png` is the
  // same grey pushed to near-black. The Collective fleet was wearing the
  // ARMY's olive (#666d61), which on RA2's 6-level grid snaps to #666633 —
  // measured 7.4% of the Dreadnought at hue 105 and 3.7% of the Sea Scorpion
  // at hue 98. A GREEN battleship is not a thing RA2 ever drew. The olive was
  // also the only colour separation `aegis | seascorp` had; that pair is a
  // SHAPE pair (aspect 2.10 against 1.79) and has to be carried as one.
  //
  // Directorate hulls keep the blue-tinted haze grey the Destroyer and Aegis
  // rips wear, the Collective's is a plainer and darker neutral, so the two
  // fleets still part on VALUE without either of them taking a hue.
  // EVERY HULL IS A NEUTRAL GREY, and that is a palette-grid requirement, not a
  // style choice. A "slate" with its blue channel a few points over its red
  // looks right in the source and comes apart in the bake: the channels sit at
  // different distances from their grid lines, so the gap widens to a whole
  // step at some rungs of the shade ladder and the hull throws NAVY and TEAL
  // pixels. Checked across the eight shade factors `poly` actually uses:
  // #6e7075 gave 2 navy rungs of 8, #8d97a3 2, #8a949f 3, and the Dolphin's
  // #728798 was non-grey at ALL EIGHT, alternating navy and teal — which is
  // where the blue-green speckle scattered over every deck was coming from.
  // Equal channels stay equal at every rung. Values are each original's luma,
  // so nothing got lighter or darker; only the false hue is gone.
  // THE FLEET WAS TOO DARK, and the number that made it dark was measured
  // wrong. "RA2 hull median luma 0.20" came off a crop of the Dreadnought
  // rosette that still had SEA in it — the navy background dragged the median
  // down and I halved every hull to chase it. Re-measured on frames cropped to
  // the sprite itself:
  //
  //            RA2 med   ours was   RA2 p90   RA2 over 0.75   ours was
  //   destroyer   0.50      0.20      0.86        13.8%         1.9%
  //   aegis       0.50      0.40      0.98        20.4%        12.0%
  //   dread       0.35      0.20      0.74         9.4%         5.8%
  //
  // RA2's warships are LIGHT — a pale grey hull carrying a near-white
  // superstructure, with the dark confined to the boot-topping and the
  // shadows. Only the Dreadnought is genuinely dark-hulled, and even she sits
  // at 0.35. The banded flank, the fixed specular and the plating all stay;
  // what changes is the value they are built on.
  //
  // The Carrier keeps its own override below: the user signed that sprite off
  // at its current value and it is not re-opened by this.
  var HULL = sov ? '#6e6e6e' : '#949494';
  var DECK = sov ? '#454545' : '#5e5e5e';
  // #333333 IS A SHADOW, NOT A BOAT. The casing filled at near-black had no
  // highlight and no volume anywhere on it, so the whole submarine read as a
  // dark smear with a red stripe. The rip's casing is a MID grey that catches
  // light along its crown. The cylindrical banding that makes it read as metal
  // is in sub.js; this is the value it is built on.
  if (kind === 'sub')      { HULL = '#666666'; DECK = '#3f3f3f'; }
  if (kind === 'dolphin')  { HULL = '#6a6a6a'; DECK = '#454545'; }
  // The squid's plum was a HALF-STEP off the palette grid and the shade ladder
  // kept falling off it on the red side: #6c4a60 lit by 1.2 snaps to #996666
  // and its own midtone to #663333, both pure hue 0, so 75% of the animal read
  // as the RED player's unit whoever owned it (hue.maxImpostor 0.752). Pushing
  // the blue channel one level clear holds hue 300 at every rung of the ladder.
  // NOT PURPLE. The animal was a flat lilac cartoon octopus; a census of the
  // rip's own body reads #485458 / #788898 / #606c70 / #303840 — a slate
  // grey-green creature with no purple in it anywhere. The earlier plum was
  // chosen only to keep its shade ladder off the red player's hue, and a
  // neutral grey-green solves that outright: every rung stays neutral.
  // ...and the grey has to be a NEUTRAL one. #68767a reads slate to the eye but
  // its blue channel sits 18 above its red, and on the palette grid that splits:
  // the lit mantle came out #669999 and the arms #336666, a bright teal animal.
  // Equal channels stay equal at every rung, which is what "slate" actually
  // needs, and it is what the rip's own #606c70 / #485458 are reaching for.
  // #70746e IS NOT A NEUTRAL GREY — 112/116/110 — and this file's own header
  // says so twice. At shade 1.14 it snaps to #999966 and the animal's tail fin
  // baked KHAKI. Equal channels stay equal at every rung of the ladder.
  if (kind === 'squid')    { HULL = '#707070'; DECK = '#3f3f3f'; }
  // [LCRAFT] is a HOVERCRAFT, and `library/lcraft-voxel.jpg` reads in exactly
  // three bands: a BLACK rubber skirt all round the bottom, a near-WHITE deck
  // body standing on it, and two dark slate ducted fans aft. It was drawn
  // olive-green, which is none of the three, and the pale deck is the thing
  // that makes the house-colour side panels read at all. BOOT, which is
  // shade(HULL, 0.34), draws the skirt for free once the deck is pale.
  // AND THE DECK HAS TO BE PALE. This file's own note above says the reference
  // is "a near-WHITE deck body standing on" a black skirt, and then set DECK to
  // #5a5a5a — so the craft baked as one dark grey mass with a darker band round
  // it, which is a shadow, not a hovercraft. The whole read is CONTRAST: black
  // rubber under a light hull.
  if (kind === 'lcraft')   { HULL = '#c4c4c4'; DECK = '#9c9c9c'; }
  // The Sea Scorpion is a PALE boat. She was inheriting the Collective's dark
  // #6e6e6e/#454545 and her deck baked near-black, while the rip shows a light
  // grey hull with the dark confined to shadow under the machinery — she is
  // the lightest hull in the Collective fleet, not the darkest.
  if (kind === 'seascorp')  { HULL = '#8f8f8f'; DECK = '#6e6e6e'; }
  if (kind === 'carrier')  { HULL = '#5e5e5e'; DECK = '#5c5c5c'; }
  var BOOT = shade(HULL, 0.16);
  var SHEER = sov ? '#c7c7c7' : '#d6d6d6';           // the sky on the sheer strake                       // boot-topping at the waterline

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
      // THE FLANK IS A HALF-STOP OF VALUE, TOP TO BOTTOM, and it used to be a
      // quarter. This is what separates RA2's ships — heavy, metal, sitting IN
      // the water — from a plastic model floating on it, and it is not texture,
      // it is range and DIRECTION. Sampling the rips row by row down the bottom
      // half of the sprite: the Destroyer's flank runs 0.68 at the sheer to
      // 0.14 at the keel, a span of 0.54; the carrier 0.40 to 0.12; the
      // Dreadnought 0.54 to 0.14. Every one of them plunges to near-black below
      // 88% of the sprite's height.
      //
      // Ours ran 1.10 -> 0.92 -> 0.66, a span of 0.25 that never got dark, and
      // measured on the bake the BOTTOM of the hull came out the BRIGHTEST part
      // of the ship — the Destroyer read 0.36 at midships and 0.61 at 80%, the
      // gradient inverted. A pale rim under a grey slab is exactly how a toy
      // reads.
      //
      // AND THE GRADIENT RAN IN SCREEN Y, WHICH IS THE "WATER RIPPLE ACROSS THE
      // HULL". Each of the ten plan edges filled its own quad with its own
      // `createLinearGradient(0, top, 0, bot)`, where top/bot came from that
      // edge's own screen extent. An iso hull edge is SLANTED, so its extent is
      // far taller than the freeboard: the ramp got stretched over a span the
      // quad only partly covers, and every edge showed a different slice of it.
      // Where two edges met, the value jumped; the near-black boot-topping,
      // pinned to each edge's own waterline, stepped with them. The result was
      // a dark line and a pale line walking diagonally across the flank,
      // crossing the ship from the bow round to the stern — which is exactly
      // what a bow wave looks like, and why deleting the actual bow wave left
      // it untouched.
      //
      // The fix is to stop grading in screen space at all. The freeboard is a
      // wall of height FR standing on the waterline, so its value depends on
      // HEIGHT ABOVE THE WATERLINE and nothing else. Each band is a
      // parallelogram offset from the edge itself, so every edge carries the
      // identical ladder, and the bands join across the chines by construction.
      //
      // Flat bands rather than a ramp is also what makes it read as STEEL. RA2
      // has six levels per channel and spends them on three or four crisp
      // bands with hard boundaries; a smooth ramp is what plastic and rubber
      // look like. The band at 0.72-0.84 is the sea throwing light back up onto
      // the plating just above the boot-topping — it is the bright band at
      // 75-85% of her height that I measured on the Destroyer rip and could not
      // explain, and a hull with a dark strake between two light ones reads as
      // metal in a way a single ramp never does.
      var BANDS = [[0.00, 0.13, 1.42], [0.13, 0.48, 1.04], [0.48, 0.76, 0.60],
                   [0.76, 0.88, 0.86], [0.88, 1.00, 0.18]];
      for (var bi2 = 0; bi2 < BANDS.length; bi2++) {
        var h0 = FR * (1 - BANDS[bi2][0]), h1 = FR * (1 - BANDS[bi2][1]);
        g.beginPath();
        g.moveTo(q0[0], q0[1] - h0); g.lineTo(q1[0], q1[1] - h0);
        g.lineTo(q1[0], q1[1] - h1); g.lineTo(q0[0], q0[1] - h1);
        g.closePath();
        // The sheer strake is a FIXED specular, not a multiple of the hull.
        // On a dark hull `shade(HULL, 1.42)` is still dark — #5e5e5e lit 1.42
        // is value 0.53 — so the whole ship came out with NO pixel above 0.75
        // and `colour.navalDarkest` went to zero. That gate is measuring the
        // right thing: metal is a dark mass with a few near-white hits where an
        // edge catches the sky, and a proportional lift can never produce one.
        // Paint gets lighter in the light; steel gets a highlight.
        g.fillStyle = bi2 === 0 && lit === 1 && !organic ? SHEER
          : shade(HULL, BANDS[bi2][2] * lit);
        g.fill();
      }
      // Plating. A welded hull is frames and strakes, and at this scale the
      // only trace of them is a seam every few pixels — one value down, one
      // pixel wide, stopping short of the sheer and the boot-topping. It costs
      // no new colours (it reuses the shade ladder) and it is the difference
      // between a steel side and a painted block.
      if (lit === 1 && !organic) {
        var ex = q1[0] - q0[0], ey = q1[1] - q0[1];
        var elen = Math.sqrt(ex * ex + ey * ey);
        g.strokeStyle = shade(HULL, 0.70); g.lineWidth = 0.6;
        for (var sp = 9; sp < elen - 4; sp += 9) {
          var t2 = sp / elen, sx2 = q0[0] + ex * t2, sy2 = q0[1] + ey * t2;
          g.beginPath();
          g.moveTo(sx2, sy2 - FR * 0.84); g.lineTo(sx2, sy2 - FR * 0.26); g.stroke();
        }
      }
      // NO HOUSE STRIPE ON THE HULL. There was a 1.5 px house-coloured line run
      // along every lit flank, and at the scale a ship is drawn it was a racing
      // stripe wrapping the whole vessel — the loudest thing on the fleet and
      // the first thing the eye landed on. RA2 does not do it. Its Destroyer is
      // a uniform grey-blue hull with the house colour in two or three BLOCKS
      // up top: a panel on the white superstructure and the rounded stern
      // hangar. So the flank stays hull-coloured and the house colour is spent
      // where the reference spends it, on the deckhouses each ship draws for
      // itself. A thin lit sheer line is all the flank gets.
      if (lit === 1 && !organic) {
        g.strokeStyle = shade(HULL, 1.28); g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(q0[0], q0[1] - FR + 0.6); g.lineTo(q1[0], q1[1] - FR + 0.6); g.stroke();
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
    // NO BOW WAVE. Two pale chevrons used to be stroked off the stem "so a ship
    // reads as sitting IN something", and they were drawn HERE — after the
    // hull, after the deck, after the unit's own superstructure. Nothing
    // occluded them, so the wave did not pass around the hull, it lay ON it: a
    // white line across the ship's side. Drawing order alone would not save it
    // either, because RA2's sprites carry no wake at all. Checked: across the
    // carrier, destroyer and Dreadnought rips the only pale blue-white pixels
    // are ON the superstructure, 47 to 227 of them, and the full contact sheet
    // has no detached arc beside any hull. RA2's wake is an engine effect over
    // the water, not part of the unit's art.
    pixelate(s, 6, 96);   // RA2's own 6-level channel grid: flat bands, not a gradient
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
// as a SIDE, so a fixed accent has to be a hue no owner uses. The houses MOVED
// on 2026-09-13, when the player palette went onto RA2's own deep values: blue
// left the sky at 203 degrees for the rips' navy at 222, and red left a pink
// 356 for a pure 0. Re-checked against the new pair, every entry below still
// clears 30 degrees of both — the closest are the MCV's amber at 38 off red
// and the Chrono Miner's violet at 42 off navy. The Conscript's trousers, 11
// degrees off red and reading 39% "red" to the census, are the recorded cost
// of getting this wrong (docs/design-decisions.md). (2) The accents are spread
// round the two usable arcs rather than clustered, so no two vehicles in the
// confusable cluster share a colour family.
//
// The arcs are narrower than they look, because the BAKE quantises to RA2's
// 6-level channel grid and a hue only survives if the grid can spell it. Check
// a new accent across its whole shade ladder, not just at full value: a colour
// half a step off the grid changes hue from rung to rung, which is how the
// Tesla Tank ended up baking the red player's #663333 onto a Soviet hull.
//
// This table is VEHICLE-ONLY and deliberately separate from ACCENT, which
// infantry share: the two rosters have different hue budgets (2.1/2.2 vs
// 2.3/2.4) and one table made every vehicle inherit a soldier's palette.
var VACC = {
  // -- Fleet. Naval had NO accent rows at all until 2026-09-13, which is a
  // large part of why four hulls could quietly settle on the same grey.
  destroyer:   '#cc9900',  //  45 amber — the OSPREY on the stern pad, the
                           //   brightest thing on RA2's own destroyer and the
                           //   feature that names the ship at a glance
  seascorp:    '#e9e9e9',  //     the white flak mount the rip makes the loudest
                           //   surface on the boat (no hue: it is a value note)
  // -- Directorate
  lancer:      '#33bda6',  // 170 jade   — the vision block beside the Grizzly's mantlet.
                           //   Its BODY stays pale silver: 1.4 names it, and the
                           //   silver is the spec, not an omission.
  ifv:         '#dcd046',  //  55 hazard yellow — beacon and chevron on the tall
                           //   launcher box that 2.3 makes the IFV's whole read
  mirage:      '#2fbe6b',  // 145 holo-green — the projector mouth of the emitter
                           //   housing. The Mirage disguises itself as a TREE.
  mirageStack: '#ececec',  //     the ribbed WHITE emitter plates 2.3 asks for
  // NO MAGENTA. "The refraction flare across the prism" is invented: there is
  // none in `prismtank-voxel.jpg`, which carries a WHITE crystal, a blue hood
  // behind it and a khaki pedestal under it, and nothing else. Painted down the
  // crystal's lit edge it blended with the white face and the palette snap put
  // #cc66cc and #996699 on the one part the tank is named for — pink speckle on
  // a prism. The mirror face kit.js already defines for this unit is #e7e7e7.
  spectre:     '#e7e7e7',
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
  rhinoGun:    '#303030',  //     NEUTRAL gunmetal barrel. The Lancer's navy put an
                           //     OPPOSING hue on a Soviet tank (4.4% of the sprite).
  mammothGun:  '#161616',  //     gun-black twin barrels. 1.4: "hull, tracks and the
                           //     twin barrels are olive-grey" — so the Apocalypse's
                           //     own colour is its OLIVE, deepened in `hull` below,
                           //     and the house colour is the four canister drums.
  teslatank:   '#d08c46',  //  28 copper — the ring windings of the two coil columns.
                           //   A Tesla coil is wound in copper; pale steel rings were
                           //   the ninth grey on a field of greys.
  flaktrack:   '#3fae43',  // 122 ordnance green — the gun shield, the one bright
                           //   vertical face on an otherwise cream halftrack
  v3:          '#e7e7e7',  //     the missile midbody is PURE WHITE and 2.4 says so in
                           //     as many words; the V3's colour is its OLIVE TRUCK,
                           //     which the same bullet calls olive and we drew grey.
  drone:       '#6a63e0',  // 243 electric indigo — the eye cluster and leg joints
  warminer:    '#b39a4e',  //  45 — the golden slatted ore bin. Already its own hue:
                           //     the War Miner is one of C5's three control units.
};

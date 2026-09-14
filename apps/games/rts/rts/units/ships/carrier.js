// Iron Frontier — ships/carrier: the art for one unit.
// Called by bakeShip() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.
//
// THIS IS QWEN'S BAKE, chosen by the user over mine and over opus's after a
// four-way against the rip. Four things were changed on the way in, and each
// is a defect the A/B could not show:
//
//  1. HOUSE COLOUR WAS HARDCODED to #2f6fd0 in three places — the island's
//     third deck, a deck block and the landing-pad X. A fixed faction blue
//     paints the RED player's carrier blue as well, which is the one colour
//     rule this game has ("only the owner's colour is saturated"). All three
//     are HOUSE now.
//  2. THE LANDING PAD SAT ON TOP OF THE ISLAND. Both were drawn at
//     (-L*0.60, W*0.78); the pad block was painted over the island's own base
//     and the X floated on the bridge. The pad moves to the opposite quarter,
//     which is what qwen's own note said it intended.
//  3. TWO AIRFRAMES, not three. §2.3 says "3 visible parked airframes" and the
//     clause check counts them.
//  4. The deck keeps the plating pass — five transverse plates on grid cells —
//     because that is the whole of "金属质感" and it lives in the deck fill
//     qwen inherited unchanged.

function drawCarrier(C) {
  var DECK = C.DECK, FR = C.FR, GLASS = C.GLASS, HD = C.HD, HOUSE = C.HOUSE, HULL = C.HULL, L = C.L,
      P = C.P, W = C.W, box = C.box, g = C.g, mast = C.mast, plan = C.plan;
  var fd = [], fi;
  for (fi = 0; fi < plan.length; fi++) fd.push([plan[fi][0] * 1.02, plan[fi][1] * 1.42]);
  var fpoly = function (z, fill, line) {
    g.beginPath();
    for (var i3 = 0; i3 < fd.length; i3++) {
      var q3 = P(fd[i3][0], fd[i3][1], z);
      if (i3) g.lineTo(q3[0], q3[1]); else g.moveTo(q3[0], q3[1]);
    }
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (line) { g.strokeStyle = line; g.lineWidth = 0.9; g.stroke(); }
  };
  fpoly(FR + 0.6, shade(HULL, 0.42));
  fpoly(FR + 2.6, shade(DECK, 1.06), '#cdd3db');      // deck edge coaming catching the sky
  g.save(); fpoly(FR + 2.6, null, null); g.clip();
  // DECK PLATING. The flight deck is one enormous polygon and filling it with
  // one tone put 59.7% of the whole ship in a single colour — half the sprite
  // a flat card, which is what "no metal" means. Five wide transverse plates,
  // drawn oversize and clipped so they follow the round-down and the bow taper
  // for free, with a hard dark seam at each joint.
  //
  // The factors are GRID CELLS, not ratios. `pixelate` snaps every channel to
  // 0/51/102/153/204/255, so on the old dark deck 1.24, 1.10, 0.92, 0.86 and
  // 0.78 ALL rounded to #333333 and the plating was drawn and then quantised
  // away. On a #5c5c5c deck 1.11 lands on 102 and 0.55 on 51. Anything under
  // about a 0.12 step is a no-op. No longitudinal strakes: two of them turned
  // the deck into a tiled bathroom floor.
  var DPAN = [1.11, 0.55, 1.11, 1.11, 0.55];
  for (var pb = 0; pb < DPAN.length; pb++) {
    var pu0 = L * (1.06 - pb * 0.44), pu1 = pu0 - L * 0.44;
    var k0 = P(pu0, W * 2.4, FR + 2.6), k1 = P(pu1, W * 2.4, FR + 2.6);
    var k2 = P(pu1, -W * 2.4, FR + 2.6), k3 = P(pu0, -W * 2.4, FR + 2.6);
    g.fillStyle = shade(DECK, DPAN[pb]);
    g.beginPath(); g.moveTo(k0[0], k0[1]); g.lineTo(k1[0], k1[1]);
    g.lineTo(k2[0], k2[1]); g.lineTo(k3[0], k3[1]); g.closePath(); g.fill();
    g.strokeStyle = shade(DECK, 0.20); g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(k0[0], k0[1]); g.lineTo(k3[0], k3[1]); g.stroke();
  }
  g.strokeStyle = '#bbbbbb'; g.lineWidth = 1.1;
  for (var ci = 0; ci < 7; ci++) {
    var cu0 = L * (0.86 - ci * 0.24), cu1 = cu0 - L * 0.10;
    var c0 = P(cu0, 0, FR + 2.6), c1 = P(cu1, 0, FR + 2.6);
    g.beginPath(); g.moveTo(c0[0], c0[1]); g.lineTo(c1[0], c1[1]); g.stroke();
  }
  g.strokeStyle = HOUSE; g.lineWidth = 2.4;
  var a0 = P(L * 0.52, -W * 0.55, FR + 2.6), a1 = P(-L * 0.88, -W * 0.10, FR + 2.6);
  g.beginPath(); g.moveTo(a0[0], a0[1]); g.lineTo(a1[0], a1[1]); g.stroke();
  g.strokeStyle = HD; g.lineWidth = 1.2;
  for (var de = -1; de <= 1; de += 2) {
    var e0 = P(L * 0.90, de * W * 1.30, FR + 2.6), e1 = P(-L * 0.94, de * W * 1.30, FR + 2.6);
    g.beginPath(); g.moveTo(e0[0], e0[1]); g.lineTo(e1[0], e1[1]); g.stroke();
  }
  g.restore();
  // Island superstructure: stacked blocks, each narrower than the one below, mast on top.
  // THE ISLAND IS LOW, and that is a proportion gate, not taste. qwen stacked
  // it to 15.6 with a 21.5 mast on top; the sprite came out 129x62, aspect
  // 2.08, against RA2's 143x52 = 2.75, and `aspect.navalOutsideRA2Band` went
  // 2 -> 3. A carrier and a Dreadnought are nearly the same length in RA2 and
  // separate on MASSING: she is flat where he is tall. A tall island gives her
  // a Destroyer's read, which is the exact note already in this file's history.
  // Same stack, same four colours, scaled to clear the band.
  box(-L * 0.60, W * 0.78, L * 0.20, W * 0.36, 4.0, '#8a8a8a');   // base deck 1 (widest)
  box(-L * 0.60, W * 0.78, L * 0.16, W * 0.30, 5.9, '#a8a8a8');   // base deck 2
  box(-L * 0.60, W * 0.78, L * 0.13, W * 0.25, 7.8, HOUSE);       // base deck 3
  box(-L * 0.60, W * 0.78, L * 0.10, W * 0.20, 9.8, '#dfe6ee');   // bridge block
  mast(-L * 0.58, W * 0.78, 13.0);                                // mast (tallest point)
  var iq = P(-L * 0.60, W * 0.78, FR + 6.0);
  g.fillStyle = GLASS; g.fillRect(iq[0] - 2.4, iq[1] - 1.2, 4.8, 1.5);
  box(-L * 0.40, W * 0.30, L * 0.07, W * 0.20, 6.6, HOUSE);
  // Landing pad: raised platform block at the stern quarter, opposite end from the island.
  // Draw the supporting block first (stands off the deck), then paint the X on its top face.
  // THE X HUNG IN THE AIR because it was drawn in SCREEN space: four offsets of
  // +-4.6 and +-2.4 pixels from one projected point. A marking painted on a
  // deck lies IN the deck plane and skews with it; a screen-space cross is the
  // same upright X at every one of the eight bearings, which is exactly how the
  // eye tells a decal floating in front of a sprite from paint on a surface.
  // Every endpoint goes through P() now, in the pad's own deck coordinates, so
  // the X leans with the hull like the landing stripe beside it does.
  //
  // And it had nothing to sit on. The plinth was #5f5f5f — the same value as
  // the deck it stands on, once the deck moved up a grid cell — so the pad was
  // invisible and the X really was floating over bare deck. Its top face is now
  // drawn a step DOWN from the deck with a bright coaming, which is both what
  // makes it read as a raised platform and what gives the X a ground.
  // ...AND IT HUNG OVER THE SIDE. The deck is the hull plan scaled to W * 1.42,
  // but that is its WIDEST station: the plan tapers from L * 0.12 forward, so
  // by L * 0.52 the deck's own half-beam is down to about W * 1.0 — and a pad
  // centred on W * 0.70 with a half-width of W * 0.36 reaches W * 1.06, which
  // is over the edge and out above the sea. A deck fitting has to be placed
  // against the plan at ITS OWN station, not against the beam amidships.
  // -L * 0.10 is inside the full-beam run (L * 0.12 back to -L * 0.76), and
  // 0.74 +- 0.34 reaches W * 1.08 against W * 1.42 there.
  var PU = -L * 0.10, PV = W * 0.74, PZ = FR + 5.0;   // pad centre, top face
  var PL = L * 0.17, PW = W * 0.34;                   // pad half-extents
  function padPt(du, dv) { return P(PU + du, PV + dv, PZ); }
  box(PU, PV, L * 0.16, W * 0.32, 5.0, '#5f5f5f');    // the plinth it stands on
  var f0 = padPt(-PL, -PW), f1 = padPt(PL, -PW), f2 = padPt(PL, PW), f3 = padPt(-PL, PW);
  g.beginPath();
  g.moveTo(f0[0], f0[1]); g.lineTo(f1[0], f1[1]);
  g.lineTo(f2[0], f2[1]); g.lineTo(f3[0], f3[1]); g.closePath();
  g.fillStyle = shade(DECK, 0.55); g.fill();
  g.strokeStyle = '#cdd3db'; g.lineWidth = 0.8; g.stroke();
  // 2.4 px was too thick for a pad this size: the two strokes met in the middle
  // and the whole face baked as one solid house-coloured slab, which reads as a
  // blue box on the deck, not as a marking.
  g.strokeStyle = HOUSE; g.lineWidth = 1.5;
  var xa = padPt(-PL * 0.76, -PW * 0.76), xb = padPt(PL * 0.76, PW * 0.76);
  var xc = padPt(PL * 0.76, -PW * 0.76), xd = padPt(-PL * 0.76, PW * 0.76);
  g.beginPath();
  g.moveTo(xa[0], xa[1]); g.lineTo(xb[0], xb[1]);
  g.moveTo(xc[0], xc[1]); g.lineTo(xd[0], xd[1]);
  g.stroke();
  for (var hi = 0; hi < 3; hi++) {
    var pq2 = P(-L * (0.24 + hi * 0.24), -W * 0.55, FR + 3.0);
    g.fillStyle = '#dde2e8';
    g.beginPath(); g.ellipse(pq2[0], pq2[1], 4.1, 2.0, 0, 0, 6.29); g.fill();
    g.strokeStyle = '#9aa0a8'; g.lineWidth = 1.7;
    g.beginPath(); g.moveTo(pq2[0] - 3.8, pq2[1] + 0.7); g.lineTo(pq2[0] + 3.8, pq2[1] - 0.7); g.stroke();
    g.fillStyle = HOUSE;
    g.beginPath(); g.ellipse(pq2[0] + 1.6, pq2[1] - 0.4, 0.9, 0.7, 0, 0, 6.29); g.fill();
  }
}



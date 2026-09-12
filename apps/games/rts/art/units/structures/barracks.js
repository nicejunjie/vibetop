// Iron Frontier unit art — structures/barracks
// Spliced VERBATIM into apps/games/rts/rts.html between `// @@ART structures/barracks` and
// `// @@END structures/barracks` (one pair per @@PART below). Edit HERE, then
//     node apps/games/rts/tools/art-split.js inject
// — or edit rts.html and `extract`; rts-split.test.js fails while they differ.
// Every free identifier (the canvas `g`, the anchor, the helpers, `col`, `sov`…)
// is a local of the enclosing bake function: see apps/games/rts/art/units/README.md.

// @@PART main — inside bakeBuilding() in rts.html
// Barracks, rebuilt against the real RA2 sprites.
//   Directorate = Allied Barracks: TWO Quonset huts side by side in
//   echelon, white-grey canvas over PLAYER-COLOURED arch frames (that
//   remap IS the building's house colour in RA2), plus a short domed
//   watch-tower with a flag. The pair and the stagger are the identity;
//   the tower is a mast, not a spire, so the sprite stays wide.
//   Collective = Soviet Barracks: a LOW two-storey concrete block
//   crowned by a HUGE saluting conscript - the statue is about half the
//   sprite and is what you name the building by.
// Colour law: the only saturated hue on either sprite is `col`.
var bkPad = sov ? '#8b8770' : '#7d7850';
plot(g, cx, baseY - 2, fw * 1.92, fh * 1.92);
g.fillStyle = bkPad; g.fill(); outline(g, sov ? shade(bkPad, 0.52) : '#20242e');
if (!sov) {                                        // navy kerb round the Allied pad
  g.strokeStyle = '#2a2e38'; g.lineWidth = 2.2;
  plot(g, cx, baseY - 2, fw * 1.90, fh * 1.90); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.10)'; g.lineWidth = 1;
  plot(g, cx, baseY - 3.5, fw * 1.74, fh * 1.74); g.stroke();
}

if (!sov) {
  // ---- Allied Barracks --------------------------------------------
  // Read off the SHP (`allied-barracks-idle.png`): TWO Quonset huts sat
  // side by side ACROSS the +gx axis, each barrel running along gy with
  // its open arch on the +gy (down-left) face - the tile trained
  // infantry step onto. Each barrel is three sections, and that is the
  // read at 1:1: a dark navy office block at the far end carrying the
  // green window strips, a WHITE canvas drum in the middle banded with
  // broad player straps, and a dark ribbed collar at the near end inside
  // a fat brass ring you look through into the lit doorway. Behind them
  // at the back-left corner, a short banded watch drum with a silver
  // dome and a small dark flag. Player colour = the canvas straps, the
  // drum bands and the section joints; nothing else is saturated (the
  // flag is navy with a cyan device in the sprite, not a house flag).
  var CANV = '#f2f4f7', CANVD = '#bcc2cd';
  var HULL = '#2a2f3b', HULLL = '#4a4d58';          // navy body / its lit side
  var BRASS = '#a9823f', BRASSL = '#dcbb78';        // the fat end ring
  var RIBD = shade(col, 0.34), RIBH = shade(col, 1.20);
  var LX = 28.6, LY = 14.3;                         // half-length, +gy (screen -x,+y)
  var WX = 14.2, WY = 7.1;                          // half-width,  +gx (screen +x,+y)
  var vRise = 19, vLift = 9;
  var anP = (bph || 0) * 6.283, anS = Math.sin(anP), anC = Math.cos(anP);
  var ph6 = Math.round((bph || 0) * 6) % 6;
  var SEC_F = -0.52, SEC_N = 0.50;                  // the two section joints

  // sv: -1 far end .. +1 arch end;  w: -1 far eave .. +1 near eave; z up.
  // Explicit point math - never a context transform (the sim tests run
  // rts.html against a canvas stub that has no `transform`).
  var bpt = function (hx, hy, sv, w, z) {
    return [hx - sv * LX + w * WX, hy + sv * LY + w * WY - z];
  };
  var bpoly = function (pts, fill, edge, lw) {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (var q = 1; q < pts.length; q++) g.lineTo(pts[q][0], pts[q][1]);
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (edge) { g.strokeStyle = edge; g.lineWidth = lw || 1; g.stroke(); }
  };
  var bArch = function (hx, hy, sv, k) {            // half-hoop across the barrel
    g.beginPath();
    for (var q = 0; q <= 20; q++) {
      var th = q / 20 * Math.PI;
      var p = bpt(hx, hy, sv, Math.cos(th) * k, vRise * Math.sin(th) * k);
      if (q) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]);
    }
  };
  var bHoop = function (hx, hy, sv, k, colr, lw) {
    bArch(hx, hy, sv, k);
    g.strokeStyle = colr; g.lineWidth = lw; g.lineCap = 'butt'; g.stroke();
  };
  var bDisc = function (hx, hy, sv, k, fill, edge) {
    bArch(hx, hy, sv, k); g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (edge) outline(g, edge);
  };
  // one surface band of a section: u 0..1 from the eave up to the crown,
  // sign -1 the lit up-left slope, +1 the shaded near one
  var bBand = function (hx, hy, sign, u0, u1, s0, s1, k, fill) {
    var w0 = sign * Math.cos(u0 * Math.PI / 2) * k, w1 = sign * Math.cos(u1 * Math.PI / 2) * k;
    var z0 = vRise * Math.sin(u0 * Math.PI / 2) * k, z1 = vRise * Math.sin(u1 * Math.PI / 2) * k;
    bpoly([bpt(hx, hy, s0, w0, z0), bpt(hx, hy, s1, w0, z0),
           bpt(hx, hy, s1, w1, z1), bpt(hx, hy, s0, w1, z1)],
          fill, 'rgba(18,22,30,.14)', 0.7);
  };
  // a whole tube section, lit slope then shaded slope
  var bTube = function (hx, hy, s0, s1, k, cLo, cHi) {
    for (var bi = 0; bi < 6; bi++)
      bBand(hx, hy, -1, bi / 6, (bi + 1) / 6, s0, s1, k,
            mixc(cLo, cHi, 0.52 + 0.48 * (bi / 6)));
    for (bi = 5; bi >= 0; bi--)
      bBand(hx, hy, 1, bi / 6, (bi + 1) / 6, s0, s1, k,
            mixc(shade(cLo, 0.88), cHi, 0.46 + 0.50 * (bi / 6)));
  };

  var bHut = function (gxp, gyp, lit) {
    var hx = gxp, hy = gyp - vLift;                  // barrel axis on screen
    // navy skirt: the +gx flank and the +gy end wall of the base box
    var s0 = bpt(hx, hy, -1, 1, 0), s1 = bpt(hx, hy, 1, 1, 0), s2 = bpt(hx, hy, 1, -1, 0);
    bpoly([s0, s1, [s1[0], s1[1] + vLift], [s0[0], s0[1] + vLift]], '#21242c', '#0e121a');
    bpoly([s2, s1, [s1[0], s1[1] + vLift], [s2[0], s2[1] + vLift]], '#31343c', '#0e121a');
    // FAR office block: dark navy, flat capped
    bDisc(hx, hy, -1, 1.0, '#40434d', '#181a20');
    bTube(hx, hy, -1, SEC_F, 1.0, HULL, HULLL);
    bHoop(hx, hy, -1.0, 1.015, '#1c1e25', 2.6);
    // green window strips low on the far block's +gx flank
    for (var wi = 0; wi < 4; wi++) {
      var t0 = -0.94 + wi * 0.115, t1 = t0 + 0.072;
      var w0 = 0.955, w1 = 0.560;
      var z0 = vRise * Math.sqrt(Math.max(0, 1 - w0 * w0)),
          z1 = vRise * Math.sqrt(Math.max(0, 1 - w1 * w1));
      var on = ((wi + (lit ? 0 : 2) + ph6) % 4) !== 0;   // one pane dark, walking
      bpoly([bpt(hx, hy, t0, w0, z0), bpt(hx, hy, t1, w0, z0),
             bpt(hx, hy, t1, w1, z1), bpt(hx, hy, t0, w1, z1)],
            on ? '#3f8a52' : '#24402c', '#131b17');
      if (on) {
        bpoly([bpt(hx, hy, t0 + 0.012, w0 - 0.02, z0 - 0.5), bpt(hx, hy, t1 - 0.012, w0 - 0.02, z0 - 0.5),
               bpt(hx, hy, t1 - 0.012, w1 + 0.06, z1 + 0.9), bpt(hx, hy, t0 + 0.012, w1 + 0.06, z1 + 0.9)],
              'rgba(158,240,180,.40)', null);
      }
    }
    // CANVAS drum, proud of the hull
    bTube(hx, hy, SEC_F, SEC_N, 1.12, CANVD, CANV);
    for (var ci = 1; ci < 7; ci++)                   // fabric corrugation
      bHoop(hx, hy, SEC_F + (SEC_N - SEC_F) * ci / 7, 1.11, 'rgba(24,28,38,.12)', 1);
    // NEAR collar: dark ribbed steel
    bTube(hx, hy, SEC_N, 0.98, 1.0, '#40434d', '#8d95a8');
    for (ci = 1; ci < 5; ci++)
      bHoop(hx, hy, SEC_N + (0.98 - SEC_N) * ci / 5, 1.005, 'rgba(232,240,252,.26)', 1.4);
    // BROAD player straps: one at each section joint, two on the canvas.
    // This is the RA2 remap band on this building and the whole
    // friend/foe read at 1:1, so they are straps, not wires.
    var strap = function (sv, k, wid) {
      bHoop(hx, hy, sv, k, RIBD, wid + 1.5);
      bHoop(hx, hy, sv, k, shade(col, 0.94), wid);
    };
    strap(SEC_F + 0.02, 1.095, 3.0); strap(SEC_N - 0.02, 1.095, 3.0);
    strap((SEC_F + SEC_N) / 2, 1.09, 2.0);
    // NEAR end: the open arch you look INTO. Fat brass ring outside a
    // navy ring, then a near-black cavity with pale radial slats.
    bDisc(hx, hy, 1.00, 1.14, BRASS, '#3b2c12');
    bHoop(hx, hy, 1.01, 1.10, BRASSL, 1.6);
    bDisc(hx, hy, 1.01, 0.94, '#31343c', '#12161f');
    bDisc(hx, hy, 1.02, 0.78, '#14181f', '#080a0e');
    g.save(); bDisc(hx, hy, 1.02, 0.78, null, null); g.clip();
    for (var ri = 1; ri < 8; ri++) {                 // shutter slats inside
      var rth = ri / 8 * Math.PI;
      var pa = bpt(hx, hy, 1.02, Math.cos(rth) * 0.78, vRise * Math.sin(rth) * 0.78);
      var pb = bpt(hx, hy, 1.02, Math.cos(rth) * 0.78, 0);
      g.strokeStyle = 'rgba(150,158,172,.24)'; g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(pa[0], pa[1]); g.lineTo(pb[0], pb[1]); g.stroke();
    }
    // lit threshold: the doorway the infantry walk out of, breathing
    var dz = 0.26 + 0.26 * (0.5 - 0.5 * anC);
    bpoly([bpt(hx, hy, 1.03, 0.32, 0), bpt(hx, hy, 1.03, -0.32, 0),
           bpt(hx, hy, 1.03, -0.32, vRise * 0.40), bpt(hx, hy, 1.03, 0.32, vRise * 0.40)],
          'rgba(232,190,104,' + dz.toFixed(3) + ')', null);
    // [GAPILE] the hut door: a steel shutter filling the arch, clipped
    // inside the cavity so only what the ring frames is ever seen. Shut
    // at rest; it rises for the man walking out and drops behind him.
    if (DOP < 0.999) {
      var bzT = vRise * 0.80, bzL = bzT * DOP, bsi;
      for (bsi = 0; bzL + bsi * 2.4 < bzT; bsi++) {
        var bz0 = bzL + bsi * 2.4, bz1 = Math.min(bzT, bz0 + 2.4);
        bpoly([bpt(hx, hy, 1.035, -0.82, bz0), bpt(hx, hy, 1.035, 0.82, bz0),
               bpt(hx, hy, 1.035, 0.82, bz1), bpt(hx, hy, 1.035, -0.82, bz1)],
              bsi & 1 ? '#7f8593' : '#8f95a3', 'rgba(20,24,34,.45)', 0.8);
      }
      bpoly([bpt(hx, hy, 1.04, -0.82, bzL), bpt(hx, hy, 1.04, 0.82, bzL),
             bpt(hx, hy, 1.04, 0.82, bzL + 1.7), bpt(hx, hy, 1.04, -0.82, bzL + 1.7)],
            shade(col, 0.94), '#12151c', 0.8);
    }
    g.restore();
    var lp = bpt(hx, hy, 1.05, 0, -vLift * 0.5);     // step out onto the pad
    diamond(g, lp[0], lp[1] + 1.5, 15, 7.5);
    g.fillStyle = '#5d636a'; g.fill(); outline(g, '#20242c');
  };

  // hazard plates: one at the west corner, one on the front face, both
  // read off the sprite. They sit in the walk-out lane, as RA2's do.
  // Drawn locally: the shared apron() washes its stripes out under a grey
  // veil, and on this sprite the two yellow plates are meant to shout.
  var bkHaz = function (axp, ayp, ahw, ahh) {
    diamond(g, axp, ayp, ahw * 2, ahh * 2);
    g.fillStyle = '#2b2f28'; g.fill(); outline(g, '#171a16');
    g.save(); diamond(g, axp, ayp, ahw * 1.86, ahh * 1.86); g.clip();
    for (var hi = -4; hi <= 4; hi++) {
      g.fillStyle = '#e8c22c';
      g.beginPath();
      g.moveTo(axp + hi * 9 - 4, ayp - ahh); g.lineTo(axp + hi * 9 + 0.6, ayp - ahh);
      g.lineTo(axp + hi * 9 + 9.6, ayp + ahh); g.lineTo(axp + hi * 9 + 5, ayp + ahh);
      g.closePath(); g.fill();
    }
    g.restore();
  };
  bkHaz(cx - fw * 0.76, baseY + fh * 0.26, fw * 0.21, fh * 0.21);
  bkHaz(cx - fw * 0.02, baseY + fh * 0.70, fw * 0.23, fh * 0.23);

  // Watch drum, back-left, behind the far hut: player bands, a dark
  // observation collar with one teal pane, a silver dome, a short mast.
  var twx = cx - 24, twy = baseY - 26;
  diamond(g, twx, twy + 1, 16, 8); g.fillStyle = shade(BODY, 0.58); g.fill(); outline(g, PLAT_E);
  cylinder(g, twx, twy, 6.2, 34, '#767d8c', '#98a0af', PLAT_E);
  g.fillStyle = shade(col, 0.42); g.fillRect(twx - 6.2, twy - 27.5, 12.4, 5.2);
  g.fillStyle = col; g.fillRect(twx - 6.2, twy - 26.7, 12.4, 3.0);
  g.fillStyle = shade(col, 0.42); g.fillRect(twx - 6.2, twy - 15.0, 12.4, 4.0);
  g.fillStyle = col; g.fillRect(twx - 6.2, twy - 14.4, 12.4, 2.2);
  g.fillStyle = '#2a2e36';                                // observation collar
  g.fillRect(twx - 7.8, twy - 40, 15.6, 6.2); outline(g, PLAT_E);
  g.fillStyle = '#8fe2d6'; g.fillRect(twx - 6.4, twy - 38.8, 5.4, 3.4);   // teal glass: the
  //   only other lit pane on the sprite, kept off the blue/red axis so a
  //   red-owner Barracks carries no blue pixel at all (and vice versa).
  g.fillStyle = '#b9bfca';                                // silver dome cap
  g.beginPath(); g.ellipse(twx, twy - 40.5, 7.2, 6.0, 0, Math.PI, 0); g.fill();
  outline(g, PLAT_E);
  g.fillStyle = 'rgba(255,255,255,.60)';
  g.beginPath(); g.ellipse(twx - 2.4, twy - 42.0, 2.4, 2.0, 0, Math.PI, 0); g.fill();
  g.strokeStyle = '#9aa0a8'; g.lineWidth = 1.4;           // short mast
  g.beginPath(); g.moveTo(twx + 0.5, twy - 45); g.lineTo(twx + 2.2, twy - 64); g.stroke();
  // flag: dark navy field with a cyan device, rippling over the phases
  var fx = twx + 2.2, fy = twy - 64, rip = anS * 2.2 + Math.sin(anP * 2) * 1.3;
  g.fillStyle = '#1c1e25';
  g.beginPath();
  g.moveTo(fx, fy); g.lineTo(fx + 22, fy + 3.2 - rip);
  g.lineTo(fx + 17.5, fy + 6.6); g.lineTo(fx + 22, fy + 10.0 + rip);
  g.lineTo(fx, fy + 14); g.closePath(); g.fill(); outline(g, '#05060a');
  g.fillStyle = '#31343c';                                // lit hoist edge
  g.beginPath();
  g.moveTo(fx, fy); g.lineTo(fx + 4.5, fy + 0.7 - rip * 0.34);
  g.lineTo(fx + 4.5, fy + 13.2 - rip * 0.1); g.lineTo(fx, fy + 14); g.closePath(); g.fill();
  g.fillStyle = '#63d8e6';                                // cyan device on the fly
  g.beginPath();
  g.moveTo(fx + 11, fy + 4.2 - rip * 0.5); g.lineTo(fx + 16.5, fy + 5.4 - rip * 0.6);
  g.lineTo(fx + 13, fy + 8.8 - rip * 0.3); g.closePath(); g.fill();

  crates(g, cx + fw * 0.30, baseY - fh * 0.66, 2, '#8d9288');
  bHut(cx - 15.5, baseY - 17.0, true);                    // far hut  (-gx)
  bHut(cx + 5.3, baseY + 11.5, false);                    // near hut (+gx, staggered +gy)
  // ---- roof seam: sever the watch drum from the far hut's canvas dome
  // along their natural joint so the two barrels read as separate crowns
  g.save(); g.globalCompositeOperation = 'destination-out';
  g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(cx + (-16), baseY + (-54));
  g.quadraticCurveTo(cx + (-13), baseY + (-44), cx + (-7), baseY + (-33));
  g.stroke();
  g.restore();
  drums(g, cx + fw * 0.60, baseY + fh * 0.30, 3, '#3f4550');

} else {
  // ---- Soviet Barracks: THE MONUMENT ------------------------------
  // Rebuilt against the real SHP, which is not a bunker at all: it is a
  // giant cast-steel conscript standing at attention on a stepped
  // plinth, rifle held vertically against his right shoulder with the
  // bayonet clearing his head. The statue is ~60% of the sprite and the
  // sprite is TALL (w/h ~0.57) - that silhouette IS the building. The
  // "barracks" part is only the low doorway and machinery wrapped
  // around the plinth's base.
  // Colour law: the ONLY saturated hue is `col` - the cap's corner
  // buttresses, the two hammer-and-sickle plaques and the door frame.
  // The statue is steel, the plinth stone and rusted copper beams.
  var SVS = '#c3bda4', SVSD = '#5b5748';           // apron stone / its edge
  var BEAM = '#8d7449', BEAML = '#c0a271';         // tan lattice corner beams
  var PILL = '#a98d78', PILLL = '#cbae97';         // salmon pilasters
  var SLAB = '#75756e', SLABD = '#33332e';         // steel cap / plaques
  var STONE = '#bdb69d', STONE_D = '#8a836d';      // limestone plinth faces
  var anP = (bph || 0) * 6.283, anS = Math.sin(anP), anC = Math.cos(anP);
  var ph6 = Math.round((bph || 0) * 6) % 6;

  // Stone apron: a stepped stone raft, palest thing on the sprite, with
  // three flush drain plates. It is what the statue's mass sits on.
  plot(g, cx, baseY - 4, fw * 1.86, fh * 1.86);
  g.fillStyle = shade(SVS, 1.06); g.fill(); outline(g, SVSD);
  g.strokeStyle = 'rgba(0,0,0,.20)'; g.lineWidth = 1;
  plot(g, cx, baseY - 5.5, fw * 1.62, fh * 1.62); g.stroke();
  var grate = function (gx0, gy0, gw0) {
    diamond(g, gx0, gy0, gw0, gw0 * 0.5);
    g.fillStyle = shade(SLAB, 0.86); g.fill(); outline(g, SVSD);
    diamond(g, gx0, gy0 - 0.8, gw0 * 0.62, gw0 * 0.31);
    g.fillStyle = shade(SLAB, 1.16); g.fill();
  };
  grate(cx - fw * 0.78, baseY - fh * 0.04, 13);
  grate(cx + fw * 0.80, baseY - fh * 0.08, 11);
  grate(cx + fw * 0.24, baseY + fh * 0.78, 12);

  // --- stepped plinth: a truncated pyramid ---------------------------
  // Two visible sloped faces. Each is a frame of copper corner beams and
  // salmon pilasters around one big plaque: the left plaque is the
  // DOORWAY (this is still a barracks), the right one is solid.
  var pw0 = fw * 0.78, ph0 = fh * 0.78, pw1 = fw * 0.44, ph1 = fh * 0.44;
  var pyB = baseY + fh * 0.08, pyH = 44, pyT = pyB - pyH;
  var Pwb = [cx - pw0, pyB], Psb = [cx, pyB + ph0], Peb = [cx + pw0, pyB];
  var Pwt = [cx - pw1, pyT], Pst = [cx, pyT + ph1], Pet = [cx + pw1, pyT];
  var lerpP = function (a, b2, t) { return [a[0] + (b2[0] - a[0]) * t, a[1] + (b2[1] - a[1]) * t]; };
  var mL = function (t, v) { return lerpP(lerpP(Pwb, Psb, t), lerpP(Pwt, Pst, t), v); };
  var mR = function (t, v) { return lerpP(lerpP(Psb, Peb, t), lerpP(Pst, Pet, t), v); };
  var mQuad = function (F, t0, t1, v0, v1, fill, edge) {
    var q0 = F(t0, v0), q1 = F(t1, v0), q2 = F(t1, v1), q3 = F(t0, v1);
    g.beginPath(); g.moveTo(q0[0], q0[1]); g.lineTo(q1[0], q1[1]);
    g.lineTo(q2[0], q2[1]); g.lineTo(q3[0], q3[1]); g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (edge) outline(g, edge);
  };
  // hammer-and-sickle, drawn as strokes so it survives at 1:1
  var sickle = function (hx3, hy3, sz, colr) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = colr; g.lineWidth = sz * 0.20;
    g.beginPath();                                    // sickle blade: a U opening up
    g.arc(hx3 - sz * 0.04, hy3 - sz * 0.02, sz * 0.46,
          Math.PI * 0.08, Math.PI * 1.02, false);
    g.stroke();
    g.beginPath();                                    // its handle, down-left
    g.moveTo(hx3 - sz * 0.49, hy3 - sz * 0.05);
    g.lineTo(hx3 - sz * 0.62, hy3 + sz * 0.42); g.stroke();
    g.lineWidth = sz * 0.19;                          // hammer shaft, crossing it
    g.beginPath();
    g.moveTo(hx3 - sz * 0.30, hy3 + sz * 0.50);
    g.lineTo(hx3 + sz * 0.28, hy3 - sz * 0.40); g.stroke();
    g.lineWidth = sz * 0.32;                          // hammer head
    g.beginPath();
    g.moveTo(hx3 + sz * 0.10, hy3 - sz * 0.60);
    g.lineTo(hx3 + sz * 0.52, hy3 - sz * 0.24); g.stroke();
  };
  // shadow the plinth casts on its own raft
  g.fillStyle = 'rgba(0,0,0,.26)';
  diamond(g, cx + 4, pyB + 3, pw0 * 2.04, ph0 * 2.04); g.fill();
  mQuad(mL, 0, 1, 0, 1, STONE, '#4a4436');            // lit face, in shadow gaps
  mQuad(mR, 0, 1, 0, 1, STONE_D, '#4a4436');          // shaded face
  var pFace = function (F, lit, doorway) {
    var k2 = lit ? 1 : 0.74;
    // corner beams, sloping with the batter
    mQuad(F, 0.00, 0.115, 0, 1, shade(BEAM, k2), '#2e2b22');
    mQuad(F, 0.885, 1.00, 0, 1, shade(BEAM, k2 * 0.88), '#2e2b22');
    mQuad(F, 0.015, 0.055, 0, 1, shade(BEAML, k2), null);
    // pilasters framing the plaque
    mQuad(F, 0.212, 0.282, 0, 1, shade(PILL, k2 * 0.90), '#3a3128');
    mQuad(F, 0.716, 0.786, 0, 1, shade(PILL, k2 * 0.84), '#3a3128');
    mQuad(F, 0.218, 0.248, 0, 1, shade(PILLL, k2), null);
    mQuad(F, 0.723, 0.753, 0, 1, shade(PILLL, k2 * 0.92), null);
    // ledger courses tying the beams together - the SHP face is a braced
    // lattice, not two blank stone panels
    for (var lg = 0; lg < 2; lg++) {
      var lv = 0.235 + lg * 0.40;
      mQuad(F, 0.055, 0.945, lv, lv + 0.048, shade(BEAM, k2 * 0.80), '#332b22');
      mQuad(F, 0.055, 0.945, lv + 0.007, lv + 0.022, shade(BEAML, k2 * 0.86), null);
    }
    // the plaque: a shallow stone recess with the device painted on it
    mQuad(F, 0.310, 0.690, 0.04, 0.88, shade(STONE, k2 * 0.74), '#4a4436');
    mQuad(F, 0.345, 0.655, 0.085, 0.845, shade(STONE, k2 * 1.06), 'rgba(0,0,0,.34)');
    var e0 = F(0.50, doorway ? 0.58 : 0.50);
    sickle(e0[0], e0[1], doorway ? 23 : 20, shade(col, k2 * 1.02));
    if (doorway) {                                    // the barracks door
      mQuad(F, 0.360, 0.640, 0.09, 0.15, shade(col, 0.86), shade(col, 0.42));
      mQuad(F, 0.400, 0.600, 0.00, 0.115, '#15171a', '#0b0d0f');
      mQuad(F, 0.400, 0.600, 0.075, 0.115,
            'rgba(255,186,88,' + (0.20 + 0.28 * (0.5 - 0.5 * anC)).toFixed(3) + ')', null);
      // With the leaves apart you see INTO the hall: the doorway is small
      // and half behind the machinery, so the light doing the work is
      // what makes the door read at 1:1.
      if (DOP > 0.02)
        mQuad(F, 0.402, 0.598, 0.005, 0.113,
              'rgba(255,196,104,' + (0.30 + 0.45 * DOP).toFixed(3) + ')', null);
      // [NAHAND] the door itself: two steel leaves that part sideways
      // onto the face. Shut at rest, open while a conscript walks out.
      var dSl = 0.105 * DOP;
      mQuad(F, 0.400 - dSl, 0.505 - dSl, 0.005, 0.113, '#6c7076', '#26292e');
      mQuad(F, 0.495 + dSl, 0.600 + dSl, 0.005, 0.113, '#5e6268', '#26292e');
      mQuad(F, 0.400 - dSl, 0.505 - dSl, 0.096, 0.108, '#8b9098', null);
      mQuad(F, 0.495 + dSl, 0.600 + dSl, 0.096, 0.108, '#7c8189', null);
      mQuad(F, 0.492 + dSl, 0.508 + dSl, 0.005, 0.113, '#2b2e33', null);
    }
    // lintel course under the cap and a sill at the ground
    mQuad(F, 0, 1, 0.885, 1.00, shade(STONE, k2 * 0.80), '#4a4436');
    mQuad(F, 0, 1, 0.885, 0.915, shade(STONE, k2 * 1.10), null);
    mQuad(F, 0, 1, 0.00, 0.045, shade('#6d6552', k2), '#332f26');
  };
  pFace(mL, true, true);
  pFace(mR, false, false);
  // machinery bundle tucked into the front corner: ribbed pipe runs
  var mach = function (mx, my, ml, mh) {
    g.fillStyle = shade(SLAB, 0.80);
    g.beginPath(); g.ellipse(mx, my, ml, mh, 0, 0, 6.29); g.fill();
    outline(g, SLABD);
    g.strokeStyle = 'rgba(0,0,0,.34)'; g.lineWidth = 1;
    for (var mi = -2; mi <= 2; mi++) {
      g.beginPath();
      g.ellipse(mx + mi * ml * 0.33, my, ml * 0.10, mh * 0.94, 0, 0, 6.29); g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,.18)';
    g.beginPath(); g.ellipse(mx, my - mh * 0.42, ml * 0.86, mh * 0.28, 0, 0, 6.29); g.fill();
  };
  mach(cx + fw * 0.38, pyB + fh * 0.40, 13, 5.5);
  for (var stI = 0; stI < 2; stI++) {                   // vent steam, climbing
    var stT = ((bph || 0) + stI / 2) % 1;
    g.fillStyle = 'rgba(214,220,226,' + (0.30 * (1 - stT)).toFixed(3) + ')';
    g.beginPath();
    g.ellipse(cx + fw * 0.38 - 3 - stT * 7, pyB + fh * 0.40 - 6 - stT * 15,
              3.4 + stT * 5, 2.2 + stT * 3.4, 0, 0, 6.29);
    g.fill();
  }
  mach(cx + fw * 0.60, pyB + fh * 0.10, 10, 4.4);
  isoBox(g, cx - fw * 0.56, pyB + fh * 0.38, 14, 9, 6, 0, shade(SLAB, 0.88), SLABD);

  // --- machined steel cap on top of the plinth -----------------------
  // In the SHP this is a low deck framed by a bold PLAYER-COLOUR rim
  // with three corner slabs, with grey kit and a floodlight inside it -
  // not four loose coloured crates. The rim is the whole friend/foe read.
  var CWc = pw1 * 1.22, CHc = ph1 * 1.22, capH = 13;
  var capT = prism(g, cx, pyT + 1, CWc, CHc, capH, SLAB, shade(SLAB, 1.10), '#2b2b27');
  // deck floor inside the rim
  diamond(g, cx, capT + 0.5, CWc * 1.58, CHc * 1.58);
  g.fillStyle = shade(SLAB, 0.82); g.fill(); outline(g, '#26261f');
  // player rim: a thick diamond frame laid on the deck
  g.lineJoin = 'round';
  diamond(g, cx, capT + 0.5, CWc * 1.86, CHc * 1.86);
  g.strokeStyle = shade(col, 0.44); g.lineWidth = 7.6; g.stroke();
  g.strokeStyle = col; g.lineWidth = 5.4; g.stroke();
  g.strokeStyle = shade(col, 1.20); g.lineWidth = 1.2;
  diamond(g, cx, capT - 0.8, CWc * 1.86, CHc * 1.86); g.stroke();
  // corner slabs, also player colour
  var cslab = function (bx3, by3, bw3) {
    prism(g, bx3, by3, bw3, bw3 * 0.5, 4.5, col, shade(col, 1.20), shade(col, 0.36));
    g.fillStyle = 'rgba(0,0,0,.22)';
    diamond(g, bx3, by3 - 4.5, bw3 * 0.54, bw3 * 0.27); g.fill();
  };
  cslab(cx - CWc * 0.98, capT + capH * 0.06, 8.5);
  cslab(cx + CWc * 0.98, capT + capH * 0.02, 8);
  cslab(cx + CWc * 0.02, capT + CHc * 1.00, 8.5);
  // grey kit standing on the deck, and a floodlight that sweeps
  isoBox(g, cx - CWc * 0.34, capT + CHc * 0.34, 9, 7, 6, 0, shade(SLAB, 1.02), SLABD);
  isoBox(g, cx + CWc * 0.42, capT + CHc * 0.20, 8, 6, 5, 0, shade(SLAB, 0.86), SLABD);
  var flx = cx + CWc * 0.58, fly = capT - CHc * 0.20;
  g.strokeStyle = '#4a4a44'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(flx, fly); g.lineTo(flx, fly - 9); g.stroke();
  g.fillStyle = '#5a5a52';
  g.beginPath(); g.ellipse(flx, fly - 11, 4.2, 3.4, 0, 0, 6.29); g.fill();
  outline(g, SLABD);
  var beam = 0.30 + 0.55 * (0.5 - 0.5 * anC);          // the lamp breathes
  g.fillStyle = 'rgba(255,236,176,' + beam.toFixed(3) + ')';
  g.beginPath(); g.ellipse(flx - 1.4, fly - 11.6, 2.6, 2.0, 0, 0, 6.29); g.fill();
  var swing = (ph6 - 2.5) * 2.6;                       // and sweeps a short cone
  g.fillStyle = 'rgba(255,232,164,.15)';
  g.beginPath();
  g.moveTo(flx - 3.4, fly - 11.6); g.lineTo(flx - 22, fly - 17 + swing);
  g.lineTo(flx - 20, fly - 5 + swing); g.closePath(); g.fill();
  // statue footing block
  var pedT = prism(g, cx - 2, capT - 1.5, 14.0, 6.9, 9, '#59564e', '#77746a', '#26241f');

  // --- the conscript ------------------------------------------------
  // Cast steel, lit from the upper left, banded with casting seams. He
  // stands at attention: left arm folded across the chest, right hand
  // down on the rifle, the rifle vertical against the right shoulder
  // with the bayonet well clear of the head.
  var FY = pedT + 1, sx3 = cx - 3, SW = 1.22;      // SW: the SHP conscript is
  //   0.47 of the apron width and 2.24 tall/wide; ours was 0.39 and 2.94 - a
  //   lath. Every x below is a body coordinate scaled by SW, so the mass
  //   grows without moving the silhouette's height or the plinth.
  var SX = function (v) { return sx3 + v * SW; };
  var SL2 = '#dadde0', SM2 = '#98a0a6', SS2 = '#565d64',
      SD2 = '#464b50', SO2 = '#20242a';
  var spoly = function (pts, fill, edge, lw) {
    g.beginPath(); g.moveTo(SX(pts[0][0]), FY + pts[0][1]);
    for (var pq = 1; pq < pts.length; pq++) g.lineTo(SX(pts[pq][0]), FY + pts[pq][1]);
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (edge) { g.strokeStyle = edge; g.lineWidth = lw || 1.1; g.stroke(); }
  };
  var slimb = function (x0, y0, x1, y1, w, colr) {
    g.lineCap = 'round';
    g.strokeStyle = SO2; g.lineWidth = w * SW + 1.8;
    g.beginPath(); g.moveTo(SX(x0), FY + y0); g.lineTo(SX(x1), FY + y1); g.stroke();
    g.strokeStyle = colr; g.lineWidth = w * SW;
    g.beginPath(); g.moveTo(SX(x0), FY + y0); g.lineTo(SX(x1), FY + y1); g.stroke();
  };
  var seam = function (y2, hw3) {                       // casting seam across the body
    g.strokeStyle = 'rgba(0,0,0,.30)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(SX(-hw3), FY + y2); g.lineTo(SX(hw3), FY + y2 + 1.1); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.14)';
    g.beginPath(); g.moveTo(SX(-hw3), FY + y2 + 1.2); g.lineTo(SX(hw3), FY + y2 + 2.3); g.stroke();
  };
  // rifle butt/stock behind the body, so the barrel reads continuous
  slimb(12.4, -18, 18.6, -132, 4.6, '#33383e');
  // boots and legs - close together, thick, mostly under the coat
  spoly([[-8.8, 0], [8.6, 0], [7.8, -9], [-8.0, -9]], SD2, SO2, 1.3);
  spoly([[-8.8, 0], [-8.0, -9], [-2.4, -9], [-2.8, 0]], SS2, null);
  spoly([[-7.8, -9], [7.6, -9], [7.0, -25], [-7.2, -25]], SM2, SO2, 1.2);
  spoly([[-7.8, -9], [-7.2, -25], [-2.2, -25], [-2.6, -9]], SL2, null);
  spoly([[7.6, -9], [7.0, -25], [3.0, -25], [3.2, -9]], SS2, null);
  g.strokeStyle = SO2; g.lineWidth = 1.1;                // gap between the legs
  g.beginPath(); g.moveTo(SX(0.2), FY - 2); g.lineTo(SX(-0.2), FY - 30); g.stroke();
  // greatcoat skirt, flaring to the hem
  g.fillStyle = 'rgba(0,0,0,.40)';                        // shadow the hem throws
  spoly([[-14.6, -21], [14.4, -21], [13.6, -26], [-13.8, -26]], 'rgba(0,0,0,.40)', null);
  spoly([[-14.6, -23], [14.4, -23], [12.4, -46], [10.6, -67], [-10.8, -67], [-12.6, -46]],
        SM2, SO2, 1.2);
  spoly([[-14.6, -23], [-12.6, -46], [-10.8, -67], [-3.8, -67], [-5.2, -46], [-6.2, -23]],
        SL2, null);
  spoly([[14.4, -23], [12.4, -46], [10.6, -67], [4.8, -67], [6.2, -46], [7.2, -23]],
        SS2, null);
  seam(-30, 13.4); seam(-42, 12.4); seam(-55, 11.4);
  // torso: broad squared shoulders overhanging a narrower waist
  spoly([[-10.0, -67], [9.8, -67], [10.8, -80], [12.2, -92], [15.0, -97],
         [14.4, -103], [-14.6, -103], [-15.2, -97], [-12.4, -92], [-11.0, -80]],
        SM2, SO2, 1.2);
  spoly([[-10.0, -67], [-11.0, -80], [-12.4, -92], [-15.2, -97], [-14.6, -103],
         [-5.6, -103], [-6.2, -90], [-5.0, -70], [-4.8, -67]], SL2, null);
  spoly([[9.8, -67], [10.8, -80], [12.2, -92], [15.0, -97], [14.4, -103],
         [6.4, -103], [6.0, -90], [5.4, -70], [5.2, -67]], SS2, null);
  g.fillStyle = SO2; g.fillRect(SX(-10.8), FY - 71.5, 21.6 * SW, 2.6);   // belt
  g.fillStyle = SD2; g.fillRect(SX(-2.4), FY - 71.5, 4.8 * SW, 2.6);     // buckle
  seam(-84, 13.0); seam(-95, 14.0);
  spoly([[-2.8, -100], [2.6, -100], [1.4, -72], [-1.8, -72]], SD2, null);  // coat opening
  // RIGHT arm: straight down the flank onto the rifle
  slimb(11.0, -99, 12.8, -66, 6.6, SS2);
  // LEFT arm: folded across the chest - a heavy bent limb, not a stick
  slimb(1.0, -98.5, -13.0, -92.0, 9.0, SM2);
  slimb(-13.0, -92.0, -24.0, -85.5, 8.0, SL2);
  spoly([[-28.6, -88.0], [-23.0, -89.6], [-21.4, -83.0], [-26.8, -81.4]],
        SL2, SO2, 1.1);                                 // blocky fist
  // neck + head, rounded under a domed cap
  g.fillStyle = SS2; g.fillRect(SX(-3.6), FY - 107, 7.2 * SW, 5);
  g.strokeStyle = SO2; g.lineWidth = 1; g.strokeRect(SX(-3.6), FY - 107, 7.2 * SW, 5);
  spoly([[-7.4, -103], [7.0, -103], [7.8, -110], [6.6, -117], [-6.8, -117], [-8.0, -110]],
        SM2, SO2, 1.2);
  spoly([[-7.4, -103], [-8.0, -110], [-6.8, -117], [-2.0, -117], [-2.6, -110], [-2.2, -103]],
        SL2, null);
  spoly([[7.0, -103], [7.8, -110], [6.6, -117], [3.4, -117], [3.6, -110], [3.2, -103]],
        SS2, null);
  spoly([[-7.8, -108], [-2.2, -108], [-2.6, -113], [-7.4, -113]], SD2, null);  // brow
  g.fillStyle = SM2;                                    // domed cap crown
  g.beginPath(); g.ellipse(SX(-0.4), FY - 116.5, 8.8 * SW, 7.0, 0, Math.PI, 0); g.fill();
  g.strokeStyle = SO2; g.lineWidth = 1.1; g.stroke();
  g.fillStyle = SL2;
  g.beginPath(); g.ellipse(SX(-2.6), FY - 118.4, 4.8 * SW, 4.4, 0, Math.PI, 0); g.fill();
  g.fillStyle = SS2;                                    // cap band
  g.beginPath(); g.ellipse(SX(-0.4), FY - 115.6, 9.4 * SW, 2.2, 0, 0, 6.29); g.fill();
  g.strokeStyle = SO2; g.lineWidth = 1; g.stroke();
  // rifle: wooden fore-stock, sling, barrel, bayonet - held close in
  slimb(13.2, -30, 16.6, -96, 5.2, '#4d5257');
  slimb(16.6, -96, 18.6, -132, 3.2, '#3a3f45');
  g.strokeStyle = 'rgba(26,24,20,.72)'; g.lineWidth = 1.6;   // sling
  g.beginPath();
  g.moveTo(SX(14.0), FY - 40); g.lineTo(SX(10.0), FY - 68);
  g.lineTo(SX(17.0), FY - 100); g.stroke();
  g.fillStyle = SS2;                                    // bolt + fore-sight
  g.fillRect(SX(14.8), FY - 82, 4.2 * SW, 3.0);
  g.strokeStyle = SO2; g.lineWidth = 0.9; g.strokeRect(SX(14.8), FY - 82, 4.2 * SW, 3.0);
  g.fillStyle = SD2; g.fillRect(SX(16.6), FY - 114, 3.4 * SW, 2.4);
  g.strokeStyle = '#a8a99f'; g.lineWidth = 1.6; g.lineCap = 'round';  // bayonet
  g.beginPath();
  g.moveTo(SX(18.6), FY - 132); g.lineTo(SX(19.8), FY - 146); g.stroke();
  g.fillStyle = SM2;                                    // right hand on the stock
  spoly([[10.4, -68.0], [15.6, -68.0], [15.6, -61.6], [10.4, -61.6]], SM2, SO2, 1.1);
}

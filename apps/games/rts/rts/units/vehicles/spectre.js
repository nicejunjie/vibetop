// Iron Frontier — vehicles/spectre: the art for one unit.
// Called by bakeVehicle() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.





function drawSpectre(C) {
  var PEDGE = C.PEDGE, RING = C.RING, a = C.a, bumper = C.bumper, by = C.by, chassis = C.chassis,
      col = C.col, cx = C.cx, dark = C.dark, deck = C.deck, deckPlate = C.deckPlate,
      exhaust = C.exhaust, fenders = C.fenders, fx = C.fx, fy = C.fy, g = C.g,
      gEllipse = C.gEllipse, hull = C.hull, i2 = C.i2, lamp = C.lamp, len = C.len, panel = C.panel,
      plit = C.plit, prism = C.prism, px = C.px, py = C.py, sg = C.sg, trackRun = C.trackRun,
      wantH = C.wantH, wantT = C.wantT, wid = C.wid;

// PRISM TANK — built against `allied-prism-tank.png` (52x40 at the
// down-right facing). A COMPACT tank, not a long flat barge: a dark
// slate hull with restrained blue flank paint, a narrow pale track-guard
// stripe and a compact turret socket carrying a slender steel mast and a
// small blue/white emitter head. Read the gameplay rip, not the cameo.
if (wantH) {
  // RA2's [SREF] is a low tracked chassis, not a deep purple platform. The
  // side belt and pale guard remain visible below a thin armour ledge.
  for (sg = -1; sg <= 1; sg += 2)
    trackRun(cx + px * wid * 0.42 * sg, by - 1 + py * wid * 0.42 * sg,
             len * 1.04, wid * 0.26, 4.8, '#999999',
             { top: '#343434', side: '#2b2b2b', dark: '#171717',
               wheelCount: 6, wheelScale: 0.8 });
  chassis(cx, by - 2.2, len * 0.88, wid * 0.60, 3.1, hull, dark, 2.2, 0.85);
  deckPlate(0.4, len * 0.54, wid * 0.34, 6.2, shade(hull, 1.12));
  isoBox(g, cx + fx * 7.2, by - 7.2 + fy * 7.2, len * 0.14, wid * 0.31, 0.85, a, deck, dark);
  isoBox(g, cx - fx * 7.6, by - 7.1 - fy * 7.6, len * 0.18, wid * 0.34, 1.5, a,
         shade(hull, 0.86), dark);                      // compact rear engine deck
  for (i2 = -1; i2 <= 1; i2++)                          // louvres on it
    isoBox(g, cx - fx * (7.6 + i2 * 2.0), by - 10.0 - fy * (7.6 + i2 * 2.0),
           0.9, wid * 0.40, 0.7, a, '#2c3038', '#14171c');
  for (sg = -1; sg <= 1; sg += 2) {
    // TWO owner plates per flank with a gap between them, under the
    // pale guard stripe that runs above the track in the reference.
    // One plate the length of the hull was a bar; two are countable,
    // and countability is itself a shape cue.
    // They GROW WITH THE FLANK. The plates ride at `wid * 0.375`, so
    // widening the beam to 22 moved them outboard for free but left
    // them the same size on a third more hull, and the remap census
    // felt it: this unit's owner fraction fell 0.162 -> 0.137 and
    // `hue.vehicleOwnerMean` with it. Scaled up they read the same
    // weight per flank as before and the census comes back out ahead.
    for (i2 = 1; i2 <= 1; i2 += 2)                       // one restrained plate a flank
      isoBox(g, cx + px * wid * 0.375 * sg + fx * (i2 * 6.0 - 0.6),
             by - 3.6 + py * wid * 0.375 * sg + fy * (i2 * 6.0 - 0.6),
             len * 0.24, 1.4, 1.8, a, i2 > 0 ? plit : panel, PEDGE);
    isoBox(g, cx + px * wid * 0.40 * sg - fx * 0.6,
           by - 5.4 + py * wid * 0.40 * sg - fy * 0.6,
           len * 0.76, 0.85, 0.65, a, '#bababa', '#4b5058');
  }
  fenders(len * 0.42, 3.3, 0.40, 0.12, 0.10);
  bumper(len * 0.41, wid * 0.26, by - 1.8);
  lamp(cx + fx * len * 0.38 + px * wid * 0.24, by - 4.2 + fy * len * 0.38 + py * wid * 0.24);
  exhaust(cx - fx * len * 0.40, by - 4.8 - fy * len * 0.40);
}
if (wantT) {
  var pcx = cx - fx * 0.6, pcy = by - RING - fy * 0.6;
  // THE MOUNT, AND THE HEAD RAISED ONTO IT.
  // The crystal head used to be drawn 2.8 units above the turret ring, so
  // there was no room under it for anything and the one part this tank is
  // named for appeared to sit straight on the hull. An earlier attempt added
  // the mount's tiers UNDER the existing head and rendered four yellow pixels:
  // the head is drawn afterwards and simply covered them. The two have to move
  // together, which is what this does.
  //
  // Reading the rip's assembly from the deck up: a BLUE CONE, a bright
  // YELLOW-OLIVE COLLAR standing proud of what it carries — the only warm note
  // on the tank — a KHAKI POST, then the head. Three tiers, not five: the whole
  // mount has about eight pixels of height to work in and anything thinner than
  // two or three merges the moment the palette snaps.
  prism(pcx, pcy, [[3.1, -2.4], [3.1, 2.4], [-1.4, 3.1], [-3.3, 1.9],
                   [-3.3, -1.9], [-1.4, -3.1]],
        2.1, panel, PEDGE);                                   // compact turret socket
  // A RING, NOT A BAND. At 1.7 tall and 2.9 wide it came out a broad yellow
  // belt across the tank — the loudest thing on it, where the rip has a thin
  // collar you notice without it shouting.
  prism(pcx, pcy - 2.1, [[1.8, -1.4], [1.8, 1.4], [-0.8, 1.7], [-1.9, 1.0],
                         [-1.9, -1.0], [-0.8, -1.7]],
        0.55, '#a9a9a9', '#555555');                          // narrow steel hinge collar
  prism(pcx, pcy - 2.65, [[1.15, -0.85], [1.15, 0.85], [-0.5, 1.1], [-1.25, 0.7],
                         [-1.25, -0.7], [-0.5, -1.1]],
        3.8, '#a0a0a0', '#414141');                           // visible steel mast
  // THE PRISM: an upright block standing on the turret roof, not a
  // mast. Dark housing, a bright emitter face on its forward side and
  // a glowing crystal cap — the tallest thing on the chassis.
  // The real eight-bearing prism rip is visually authoritative here. Its
  // emitter is a small blue/white head on a narrow upright steel mast;
  // earlier metric-driven comments about keeping a massive tall column
  // described the wrong visual shape and have been superseded.
  var PW = 1.75, PWT = PW, PH = 5.8;
  var hx = pcx + fx * 0.9, hy = pcy - 6.5 + fy * 0.9;
  // Open C-shaped optical frame: blue rear upright and lower cradle support
  // the narrow front crystal, while the upper hood bridges above the recess.
  // A solid prism across this whole outline erased the functional opening.
  prism(hx - fx * 0.95, hy - 0.15 - fy * 0.95,
        [[0.8, -PW], [0.8, PW], [-0.8, PW], [-0.8, -PW]],
        PH - 0.2, panel, PEDGE);
  prism(hx + fx * 0.8, hy - 0.15 + fy * 0.8,
        [[2.0, -PW * 0.88], [2.0, PW * 0.88],
         [-2.0, PW * 0.88], [-2.0, -PW * 0.88]],
        1.0, panel, PEDGE);
  // The emitter is a thin solid in the front of the blue casing. A flat
  // frontal decal collapses to nothing at broadside, although the RA2 crystal
  // remains visible there as a pale vertical leading edge.
  prism(hx + fx * 3.4, hy - 0.45 + fy * 3.4,
        [[0.9, -PW * 0.56], [0.9, PW * 0.56],
         [-0.9, PW * 0.56], [-0.9, -PW * 0.56]],
        PH - 0.5, '#d9d9d9', '#5e5e5e');
  // WHICH WAY ROUND THE HEAD GOES. This housing was #bebebe, chosen from
  // `prismtank-voxel.jpg`, and the note below records the real hazard that came
  // with it: a blue CORE inside a pale glazed face blends to lavender and the
  // snap lands it on #cc66cc — pink, down the one part the tank is named for.
  // That hazard is about the CORE, not the housing. In allied-prism-tank.png
  // the head is predominantly BLUE with pale facets on it; ours was
  // predominantly pale with a blue trim — the ratio inverted. The housing goes
  // to the owner and the glazed face and its core stay pale, so blue and white
  // meet along ONE edge instead of running side by side up the whole crystal.
  // (The voxel render has now misled this roster four times — the Chrono
  // Miner's violet nose, the IFV's #9b9b9b hull, the Apocalypse's SAM drums and
  // this. The in-game rip is the authority.)
  // No broad side cowls: the source head is a small blue/white emitter on a
  // narrow mast, and flaring trim turned it into a round heavy turret.
  // A shallow forward overhanging hood makes the blue rear casing wrap the
  // narrow white aperture, as it does in the voxel construction views.
  prism(hx + fx * 1.15, hy - PH + 1.0 + fy * 1.15,
        [[PW + 1.85, -PW * 0.8], [PW + 1.85, PW * 0.8],
         [-PW - 0.9, PW], [-PW - 0.9, -PW]],
        1.05, panel, PEDGE);
  // the glazed forward face: pale prism glass with the owner's hue in
  // its core and one VACC.spectre refraction line down it
  var gzU = 4.5, gzV = PWT * 0.68, gzB = 1.6;
  var q1 = [hx + fx * gzU + px * gzV, hy + fy * gzU + py * gzV - gzB];
  var q2 = [hx + fx * gzU - px * gzV, hy + fy * gzU - py * gzV - gzB];
  var q3 = [q2[0], q2[1] - (PH - gzB - 0.6)];
  var q4 = [q1[0], q1[1] - (PH - gzB - 0.6)];
  g.beginPath();
  g.moveTo(q1[0], q1[1]); g.lineTo(q2[0], q2[1]);
  g.lineTo(q3[0], q3[1]); g.lineTo(q4[0], q4[1]); g.closePath();
  g.fillStyle = '#d2d2d2'; g.fill(); outline(g, '#171b23');
  // THE CRYSTAL IS WHITE, AND THE BLUE BELONGS BEHIND IT. An owner-hue core
  // inside a #d2d2d2 glazed face means white meets blue along the crystal's
  // whole length, the renderer blends them to a lavender, and the palette snap
  // lands that on #cc66cc — 14 PINK pixels down the one part this tank is
  // named for. In `prismtank-voxel.jpg` the crystal is a clean white bar and
  // the owner colour is the HOOD standing behind it, a separate object. A pale
  // core keeps the crystal reading as a crystal and takes the blend away.
  g.fillStyle = '#e8e8e8';
  g.beginPath();
  g.moveTo(q1[0] * 0.78 + q2[0] * 0.22, q1[1] * 0.78 + q2[1] * 0.22);
  g.lineTo(q1[0] * 0.22 + q2[0] * 0.78, q1[1] * 0.22 + q2[1] * 0.78);
  g.lineTo(q4[0] * 0.22 + q3[0] * 0.78, q4[1] * 0.22 + q3[1] * 0.78);
  g.lineTo(q4[0] * 0.78 + q3[0] * 0.22, q4[1] * 0.78 + q3[1] * 0.22);
  g.closePath(); g.fill();
  g.strokeStyle = VACC.spectre; g.lineWidth = 1.4; g.lineCap = 'butt';
  g.beginPath();
  g.moveTo(q1[0] * 0.84 + q2[0] * 0.16, q1[1] * 0.84 + q2[1] * 0.16);
  g.lineTo(q4[0] * 0.84 + q3[0] * 0.16, q4[1] * 0.84 + q3[1] * 0.16); g.stroke();
  var tfy = hy - PH;
  var e1 = [hx + fx * (PWT + 0.5) + px * 1.25, tfy + fy * (PWT + 0.5) + py * 1.25 + 0.6];
  var e2 = [hx + fx * (PWT + 0.5) - px * 1.25, tfy + fy * (PWT + 0.5) - py * 1.25 + 0.6];
  var e3 = [hx - fx * 0.2 - px * 1.25, tfy - fy * 0.2 - py * 1.25 - 1.65];
  var e4 = [hx - fx * 0.2 + px * 1.25, tfy - fy * 0.2 + py * 1.25 - 1.65];
  g.beginPath();                                             // the ONE bright face
  g.moveTo(e1[0], e1[1]); g.lineTo(e2[0], e2[1]);
  g.lineTo(e3[0], e3[1]); g.lineTo(e4[0], e4[1]); g.closePath();
  g.fillStyle = '#e4e4e4'; g.fill(); outline(g, '#171b23');
  // the crystal core takes the OWNER's hue, not a fixed cyan: a cyan
  // core is an opposing hue on a red player's tank.
  g.fillStyle = shade(col, 1.24);
  g.beginPath();
  g.moveTo(e1[0] * 0.72 + e2[0] * 0.28, e1[1] * 0.72 + e2[1] * 0.28);
  g.lineTo(e1[0] * 0.28 + e2[0] * 0.72, e1[1] * 0.28 + e2[1] * 0.72);
  g.lineTo(e4[0] * 0.28 + e3[0] * 0.72, e4[1] * 0.28 + e3[1] * 0.72);
  g.lineTo(e4[0] * 0.72 + e3[0] * 0.28, e4[1] * 0.72 + e3[1] * 0.28);
  g.closePath(); g.fill();
  g.fillStyle = VACC.spectre;                                // refraction flare
  g.beginPath();
  g.moveTo(e1[0] * 0.72 + e4[0] * 0.28, e1[1] * 0.72 + e4[1] * 0.28);
  g.lineTo(e2[0] * 0.72 + e3[0] * 0.28, e2[1] * 0.72 + e3[1] * 0.28);
  g.lineTo(e2[0] * 0.56 + e3[0] * 0.44, e2[1] * 0.56 + e3[1] * 0.44);
  g.lineTo(e1[0] * 0.56 + e4[0] * 0.44, e1[1] * 0.56 + e4[1] * 0.44);
  g.closePath(); g.fill();
  g.fillStyle = '#f5f5f5';                                   // cap glint
  gEllipse(hx, hy - PH - 0.2, 1.65); g.fill();
}
}

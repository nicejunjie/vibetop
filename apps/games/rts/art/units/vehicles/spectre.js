// Iron Frontier unit art — vehicles/spectre
// Spliced VERBATIM into apps/games/rts/rts.html between `// @@ART vehicles/spectre` and
// `// @@END vehicles/spectre` (one pair per @@PART below). Edit HERE, then
//     node apps/games/rts/tools/art-split.js inject
// — or edit rts.html and `extract`; rts-split.test.js fails while they differ.
// Every free identifier (the canvas `g`, the anchor, the helpers, `col`, `sov`…)
// is a local of the enclosing bake function: see apps/games/rts/art/units/README.md.

// @@PART main — inside bakeVehicle() in rts.html
// PRISM TANK — built against `allied-prism-tank.png` (52x40 at the
// down-right facing). A COMPACT tank, not a long flat barge: a dark
// slate hull with ONE solid owner-colour plate down each upper flank,
// a pale stripe along the track guard, and a low box turret carrying a
// TALL upright prism block. The previous pass strung six owner-colour
// dominoes down a hull a quarter too long and put a thin mast where
// the sprite has a chunky crystal housing.
if (wantH) {
  tracks(len * 1.00, 4.2, wid * 0.30);
  chassis(cx, by - 1.4, len * 0.84, wid * 0.72, 4.4, hull, dark, 3.0);
  deckPlate(0.4, len * 0.56, wid * 0.44, 6.4, shade(hull, 1.30));
  isoBox(g, cx + fx * 7.2, by - 8.2 + fy * 7.2, len * 0.16, wid * 0.40, 1.2, a, deck, dark);
  isoBox(g, cx - fx * 7.6, by - 7.4 - fy * 7.6, len * 0.24, wid * 0.48, 2.8, a,
         shade(hull, 0.86), dark);                      // rear engine deck
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
    for (i2 = 1; i2 <= 1; i2 += 2)                       // ONE plate a flank (2026-09-10)
      isoBox(g, cx + px * wid * 0.375 * sg + fx * (i2 * 6.0 - 0.6),
             by - 3.6 + py * wid * 0.375 * sg + fy * (i2 * 6.0 - 0.6),
             len * 0.30, 1.8, 3.6, a, i2 > 0 ? plit : panel, PEDGE);
    isoBox(g, cx + px * wid * 0.40 * sg - fx * 0.6,
           by - 6.4 + py * wid * 0.40 * sg - fy * 0.6,
           len * 0.70, 1.5, 1.1, a, '#d3d9e1', '#4b5058');
  }
  fenders(len * 0.42, 3.6);
  bumper(len * 0.41, wid * 0.26, by - 1.8);
  lamp(cx + fx * len * 0.38 + px * wid * 0.24, by - 4.2 + fy * len * 0.38 + py * wid * 0.24);
  exhaust(cx - fx * len * 0.40, by - 4.8 - fy * len * 0.40);
}
if (wantT) {
  var pcx = cx - fx * 0.6, pcy = by - RING - fy * 0.6;
  // low box turret
  prism(pcx, pcy, [[4.2, -3.0], [4.2, 3.0], [-1.8, 4.0], [-4.4, 2.4],
                   [-4.4, -2.4], [-1.8, -4.0]],
        2.8, shade(hull, 1.08), '#14171d');
  for (sg = -1; sg <= 1; sg += 2)                             // owner band round the turret
    prism(pcx, pcy - 0.6, [[3.8, 2.8 * sg], [-4.0, 2.2 * sg], [-4.0, 3.8 * sg], [3.8, 4.2 * sg]],
          2.4, panel, PEDGE);
  // THE PRISM: an upright block standing on the turret roof, not a
  // mast. Dark housing, a bright emitter face on its forward side and
  // a glowing crystal cap — the tallest thing on the chassis.
  // THE CRYSTAL, and it is the TALLEST THING ON ANY TANK. The
  // reference budget is ">= 10 px tall x >= 5 px wide, standing above
  // the turret roof; total height >= 1.15x the Mirage's"
  // (unit-identity-reference.md 2.3), and the squat 7.2-unit housing
  // this replaces measured barely taller than the Mirage's emitter —
  // which is the pair the audit puts at 0.816 silhouette IoU. Narrow
  // it as it rises, too: a shard, not a chimney, so the ONE crown in
  // the fleet that is tall is also the one that is thin.
  // DO NOT SHORTEN THIS TO BUY ASPECT. Measured 2026-09-05: the Prism
  // Tank was 81x77, aspect 1.052 against RA2's 1.37, and the obvious
  // fix — trim the crystal, drop the ring — worked on paper and cost
  // more than it bought. At PH 10.4 / RING 6.2 the aspect came good
  // (0.856 of RA2) but `iou.groundCombat.mean` went 0.4744 -> 0.4824
  // and `mass.tightestBand6` 2.093 -> 1.983, THROUGH its floor: shorn
  // of its crown the unit is a generic tank blob, and its worst pair
  // (mammoth|prismtank) went 0.586 -> 0.656. The aspect was bought
  // from the hull's BEAM instead (`wid` 16 -> 22, below), which moves
  // the same number the right way — a wider footprint pushes a ground
  // diamond's w/h toward the projection's own 2.0 — and leaves the
  // spike alone. That scored 0.840 of RA2 with iou.groundCombat 0.4625
  // and the band at 2.235, i.e. better than the day started on both.
  // WIDER, AND THE CRYSTAL IS LIT DOWN ITS WHOLE HEIGHT. The column
  // was 12.4 units tall and dark slate for 9 of them, with the glass
  // only in the top 3: at zoom 1 the Prism Tank's crown read as a
  // black chimney and the one part the unit is named for was three
  // pixels. §2.3 asks for a CRYSTAL >= 10 x 5 px "standing above the
  // turret roof", and a crystal is bright by definition — the dark
  // housing is the mount, not the emitter. So the forward face is
  // glazed from the cowl up, and PW goes 1.85 -> 2.30, which also
  // moves the unit's broadside aspect TOWARD [SREF]'s 1.372 (ours
  // 1.141, ratio 0.832) rather than away, because width is the axis
  // it is short on. The HEIGHT is untouched: shortening this crown is
  // a proven dead end and the comment above records the numbers.
  // AND IT STAYS A STRAIGHT COLUMN. Tapering it — wide at the mount,
  // narrow at the tip — is the more crystal-like drawing and it was
  // MEASURED and reverted: splitting the housing at 5.6 with a 1.55
  // top took `iou.groundCombat.mean` 0.4645 -> 0.4660 and
  // `mass.tightestBand6` through a tenth, because a tapered crown has
  // less mass standing clear of the hull and the whole ground-combat
  // set closes up behind it. The straight column costs 0.0005 on
  // `iou.vehicle.mean` (`mcv | prismtank` 0.634 -> 0.646, both still
  // far under the 0.75 ceiling) and buys more than that everywhere
  // else. Do not re-taper without re-running the gate.
  var PW = 3.0, PWT = PW, PH = 7.4;   // 2026-09-10: 12.4 -> 6.8. prism.png rip: a SHORT mast with a bright head, not a tower
  var hx = pcx + fx * 0.9, hy = pcy - 2.8 + fy * 0.9;
  prism(hx, hy, [[PW + 0.5, -PW - 0.7], [PW + 0.5, PW + 0.7],
                 [-PW - 0.5, PW + 0.3], [-PW - 0.5, -PW - 0.3]],
        PH, '#b6c0cc', '#12151b');   // PALE: the rip's head is the brightest thing on the tank
  for (sg = -1; sg <= 1; sg += 2)                             // house-colour cowl trim
    prism(hx, hy - 0.8, [[PW, 2.1 * sg], [-PW, 1.8 * sg], [-PW, 2.9 * sg], [PW, 3.2 * sg]],
          2.6, panel, PEDGE);
  // the glazed forward face: pale prism glass with the owner's hue in
  // its core and one VACC.spectre refraction line down it
  var gzU = PWT + 0.5, gzV = PWT + 0.7, gzB = 2.2;
  var q1 = [hx + fx * gzU + px * gzV, hy + fy * gzU + py * gzV - gzB];
  var q2 = [hx + fx * gzU - px * gzV, hy + fy * gzU - py * gzV - gzB];
  var q3 = [q2[0], q2[1] - (PH - gzB - 0.6)];
  var q4 = [q1[0], q1[1] - (PH - gzB - 0.6)];
  g.beginPath();
  g.moveTo(q1[0], q1[1]); g.lineTo(q2[0], q2[1]);
  g.lineTo(q3[0], q3[1]); g.lineTo(q4[0], q4[1]); g.closePath();
  g.fillStyle = '#c9d4de'; g.fill(); outline(g, '#171b23');
  g.fillStyle = shade(col, 1.18);                             // the owner-hue core
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
  var e1 = [hx + fx * (PWT + 0.5) + px * 1.95, tfy + fy * (PWT + 0.5) + py * 1.95 + 0.8];
  var e2 = [hx + fx * (PWT + 0.5) - px * 1.95, tfy + fy * (PWT + 0.5) - py * 1.95 + 0.8];
  var e3 = [hx - fx * 0.2 - px * 1.95, tfy - fy * 0.2 - py * 1.95 - 2.6];
  var e4 = [hx - fx * 0.2 + px * 1.95, tfy - fy * 0.2 + py * 1.95 - 2.6];
  g.beginPath();                                             // the ONE bright face
  g.moveTo(e1[0], e1[1]); g.lineTo(e2[0], e2[1]);
  g.lineTo(e3[0], e3[1]); g.lineTo(e4[0], e4[1]); g.closePath();
  g.fillStyle = '#dfe5ea'; g.fill(); outline(g, '#171b23');
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
  g.fillStyle = '#f2f6f9';                                   // cap glint
  gEllipse(hx, hy - PH - 0.2, 1.3); g.fill();
}

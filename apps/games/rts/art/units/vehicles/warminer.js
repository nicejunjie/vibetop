// ─── vehicles/warminer ─── Iron Frontier unit art. Included into rts.html by tools/rts-build.py;
// every free identifier is a local of bakeVehicle() in rts.src.html — see art/units/README.md.

// WAR MINER — NOT a recoloured Chrono Miner. A size class up, and
// massed the opposite way: the big golden slatted bin IS the vehicle,
// a squat house-colour DRUM stands on its front shoulder, and a white
// skeletal boom swings forward and down off that drum to a toothed
// bucket at the dirt. The drum-plus-boom silhouette is the tell in the
// reference, and the boom is what animates.
// W is the mirror of the Chrono Miner's Q: the War Miner's hull got
// SHORTER (30 -> 27) and BROADER (17 -> 23), so its along-axis
// furniture pulls in while every height below goes UP. RA2 measures
// [HARV] 56x48 against [CMIN] 55x28 — same length, nearly twice the
// height — and that one fact is the whole read between the two
// harvesters (unit-identity-reference.md 2.3/2.4).
var W = len / 30;
tracks(len * 0.94, 4.6, wid * 0.32, '#9aa1ac');
chassis(cx, by - 1.4, len * 0.88, wid * 0.74, 4.6, hull, dark, 0);
for (sg = -1; sg <= 1; sg += 2)                        // house-colour chassis skirt
  for (i2 = -1; i2 <= 1; i2++)
    isoBox(g, cx + px * wid * 0.37 * sg + fx * W * (i2 * 7.2 - 1.4),
           by - 2.4 + py * wid * 0.37 * sg + fy * W * (i2 * 7.2 - 1.4),
           len * 0.21, 1.6, 3.4, a, panel, PEDGE);
var drawBin2 = function () {
  // The bin is big — in `soviet-war-miner.png` it is roughly half the
  // sprite — but not the tower the previous pass built: at 12.4 high
  // it lifted the bbox to 60px against the reference's 47.
  // TALLER than it is long, which is the opposite of the Chrono
  // Miner's truck and the opposite of the Mirage's low slab -- the
  // pair the gate scored at 0.847. RA2 measures 56x48 against the
  // Chrono Miner's 55x28: same length, nearly twice the height, and
  // that is the entire difference between the two harvesters.
  var bcx = cx - fx * W * 6.4, bcy = by - 4.8 - fy * W * 6.4;
  // 2026-09-06, the §2.4 clause pass: "bin >= 35% of body px" had
  // nothing measuring it and the bin came in at 28.3% of the sprite's
  // opaque pixels. The reference sentence in this very block already
  // said what the target was — "in soviet-war-miner.png it is roughly
  // half the sprite" — so this is the drawing catching up with its own
  // citation, not a new opinion. Longer and broader, not TALLER: the
  // height is what the previous pass measured as lifting the bbox to
  // 60 px against the reference's 47, and it is left alone.
  crate(bcx, bcy, 17.0 * W, 16.4, 10.4, BIN, BIN_E);   // 2026-09-10: the sheet's crate is TALL over the rear half
};
var drawFront2 = function () {
  // white fore-chassis under the boom
  isoBox(g, cx + fx * W * 5.6, by - 2.8 + fy * W * 5.6, 8.0 * W, wid * 0.60, 4.4, a,
         '#b9bec7', '#4d525b');
  isoBox(g, cx + fx * W * 4.8, by - 7.2 + fy * W * 4.8, 4.8 * W, wid * 0.46, 2.6, a,
         STEEL, '#4a4f58');                              // boom root housing
  // the house-colour mass at the crate's front shoulder, and the drum
  // standing on it
  isoBox(g, cx + fx * W * 1.4, by - 4.6 + fy * W * 1.4, 4.6 * W, wid * 0.56, 4.6, a, panel, PEDGE);   // a SMALL red cab, as the sheet
  isoBox(g, cx + fx * W * 1.4, by - 10.6 + fy * W * 1.4, 5.9 * W, wid * 0.70, 1.1, a, plit, PEDGE);
  var dx0 = cx + fx * W * 0.9, dy0 = by - 8.4 + fy * W * 0.9;
  puck(dx0, dy0, 2.6, 7.0, pdark, panel, PEDGE);
  g.fillStyle = plit;
  gEllipse(dx0, dy0 - 9.2, 2.1); g.fill();                  // lit cap
  g.strokeStyle = PEDGE; g.lineWidth = 0.8;
  gEllipse(dx0, dy0 - 5.4, 3.3); g.stroke();                // band
  // THE GUN. §2.4 gives this unit one sentence — "a harvester with a
  // TURRET; the bin plus a small gun" — and `UNITS.warminer` has
  // `turret: true` and fires `mg`, so the sim has always known it is
  // armed. Nothing drew it. `docs/ra2-ref/cameos/warminer.png` puts a
  // barrel out over the nose, and it is the one part of the War Miner
  // that a Chrono Miner can never have: without it the two harvesters
  // differ only in colour and bin size, which is exactly the reading
  // that made them the pair the gate scored worst. The drum was
  // already in the right place to BE the turret ring — it just needed
  // a gun coming out of it.
  var wgx = dx0 + fx * 2.6, wgy = dy0 - 6.6 + fy * 2.6;
  isoBox(g, wgx, wgy, 3.0, 4.6, 2.8, a, panel, PEDGE);              // mantlet block
  barrel(wgx + fx * 1.6, wgy - 1.0 + fy * 1.6, 9.4, 1.35, 0.92, '#22262c');
  // boom: two silver rails from under the drum forward and DOWN to the
  // bucket. Digging swings the whole assembly to the dirt.
  var tipU = (dig ? 12.4 : 11.0) * W, tipY = dig ? by - 0.6 : by - 5.4;
  var rootU = 3.0 * W, rootY = by - 11.0;
  for (var rr = -1; rr <= 1; rr += 2) {
    var r0x = cx + fx * rootU + px * 2.1 * rr, r0y = rootY + fy * rootU + py * 2.1 * rr;
    var r1x = cx + fx * tipU + px * 3.0 * rr, r1y = tipY + fy * tipU + py * 3.0 * rr;
    g.strokeStyle = '#2e333a'; g.lineWidth = 3.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(r0x, r0y); g.lineTo(r1x, r1y); g.stroke();
    g.strokeStyle = '#eef1f6'; g.lineWidth = 2.1;
    g.beginPath(); g.moveTo(r0x, r0y - 0.6); g.lineTo(r1x, r1y - 0.6); g.stroke();
    g.strokeStyle = '#7c838d'; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(r0x + 0.9, r0y + 0.8); g.lineTo(r1x + 0.9, r1y + 0.8); g.stroke();
  }
  g.strokeStyle = '#9aa1ac'; g.lineWidth = 1.0;             // lattice bracing
  for (i2 = 0; i2 < 3; i2++) {
    var t0 = i2 / 3, t1 = (i2 + 1) / 3;
    var au = rootU + (tipU - rootU) * t0, ay = rootY + (tipY - rootY) * t0;
    var bu = rootU + (tipU - rootU) * t1, byy2 = rootY + (tipY - rootY) * t1;
    g.beginPath();
    g.moveTo(cx + fx * au + px * (2.1 + t0), ay + fy * au + py * (2.1 + t0));
    g.lineTo(cx + fx * bu - px * (2.1 + t1), byy2 + fy * bu - py * (2.1 + t1));
    g.stroke();
  }
  // toothed bucket at the boom tip
  var bkx = cx + fx * tipU, bky = tipY + fy * tipU;
  prism(bkx, bky, [[2.7, -4.8], [2.7, 4.8], [-2.7, 3.8], [-2.7, -3.8]],
        3.8, '#8f959f', '#3a3e45');
  g.fillStyle = 'rgba(255,255,255,.28)';
  g.beginPath();
  g.moveTo(bkx + fx * 2.7 + px * 4.8, bky + fy * 2.7 + py * 4.8 - 3.8);
  g.lineTo(bkx + fx * 2.7 - px * 4.8, bky + fy * 2.7 - py * 4.8 - 3.8);
  g.lineTo(bkx - fx * 1.0 - px * 4.1, bky - fy * 1.0 - py * 4.1 - 3.8);
  g.lineTo(bkx - fx * 1.0 + px * 4.1, bky - fy * 1.0 + py * 4.1 - 3.8);
  g.closePath(); g.fill();
  for (var tt = -2; tt <= 2; tt++) {                        // teeth
    var exx = bkx + fx * 2.9 + px * tt * 2.15, eyy = bky + fy * 2.9 + py * tt * 2.15;
    g.fillStyle = '#e2e6ec';
    g.beginPath();
    g.moveTo(exx - 1.3, eyy - 1.5); g.lineTo(exx + 1.3, eyy - 1.5);
    g.lineTo(exx, eyy + 1.9); g.closePath(); g.fill();
    g.strokeStyle = '#3a3e45'; g.lineWidth = 0.6; g.stroke();
  }
  if (dig) {                                               // spoil under the bucket
    for (i2 = -1; i2 <= 1; i2++) {
      g.fillStyle = i2 ? 'rgba(150,120,58,.55)' : 'rgba(196,164,84,.62)';
      g.beginPath();
      g.ellipse(bkx + fx * 1.9 + px * i2 * 3.3, bky + 1.6 + fy * 1.9 + py * i2 * 3.3,
                2.1, 1.05, 0, 0, 6.29);
      g.fill();
    }
  }
  for (var l2 = -1; l2 <= 1; l2 += 2)                      // headlamps
    lamp(cx + fx * W * 9.0 + px * 3.9 * l2, by - 5.2 + fy * W * 9.0 + py * 3.9 * l2);
};
if (fy > 0) { drawBin2(); drawFront2(); } else { drawFront2(); drawBin2(); }

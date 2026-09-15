// Iron Frontier — vehicles/mammoth: the art for one unit.
// Called by bakeVehicle() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.





function drawMammoth(C) {
  var PEDGE = C.PEDGE, RING = C.RING, a = C.a, barrel = C.barrel, bumper = C.bumper, by = C.by,
      chassis = C.chassis, cx = C.cx, dark = C.dark, deck = C.deck, deckPlate = C.deckPlate,
      exhaust = C.exhaust, fenders = C.fenders, flank = C.flank, fx = C.fx, fy = C.fy, g = C.g,
      hull = C.hull, i2 = C.i2, lamp = C.lamp, len = C.len, nearS = C.nearS, panel = C.panel,
      plit = C.plit,
      prism = C.prism, px = C.px, py = C.py, trackRun = C.trackRun, wantH = C.wantH, wantT = C.wantT,
      wid = C.wid;

// APOCALYPSE — a long, low Soviet tank. The eight-bearing rip has a
// narrow tracked hull, a compact faceted turret and twin guns that do
// the visual work; the red remap is four small rear shoulder blocks.
// This branch is intentionally self-contained so its proportions do
// not inherit the rounded furniture used by the other vehicles.
var mmOff = 0.33, mmLen = len * 0.80;
if (wantH) {
  // The track belts are load-bearing dark masses, not a row of pale
  // wheel dots below a light hull. Keep them outside the armour skirts.
  for (var mmTrackSide = -1; mmTrackSide <= 1; mmTrackSide += 2)
    trackRun(cx + px * wid * mmOff * mmTrackSide,
             by - 1 + py * wid * mmOff * mmTrackSide,
             mmLen * 1.12, wid * 0.24, 4.75, '#787878',
             {top: '#383a39', side: '#272929', dark: '#171919', wheelScale: 1.12});
  chassis(cx, by - 1.05, mmLen * 0.95, wid * 0.58, 4.35, hull, dark, 4.35, 0.9);
  deckPlate(-0.35, mmLen * 0.70, wid * 0.37, 6.6, shade(hull, 1.06));
  // A low engine deck at the rear and a short front glacis step give
  // the hull the two hard planes visible in the source rip.
  isoBox(g, cx - fx * 5.9, by - 6.4 - fy * 5.9,
         mmLen * 0.30, wid * 0.40, 0.95, a, deck, dark);
  isoBox(g, cx + fx * 6.8, by - 4.2 + fy * 6.8,
         mmLen * 0.16, wid * 0.40, 0.72, a, shade(hull, 0.86), dark);
  for (var mmS = -1; mmS <= 1; mmS += 2) {
    // Armoured skirts cap the continuous tracks while leaving their
    // lower run exposed; the lower edge is almost black in the rip.
    isoBox(g, cx + px * wid * mmOff * mmS,
           by - 1.95 + py * wid * mmOff * mmS,
           mmLen * 0.90, 1.16, 2.65, a, shade(hull, 0.60), dark);
    // Two short structural ribs are neutral; house colour stays on
    // the four recognizable rear blocks.
    for (var mmR = -1; mmR <= 1; mmR += 2)
      isoBox(g, cx + fx * (mmR * mmLen * 0.24) + px * wid * (mmOff + 0.02) * mmS,
             by - 2.55 + fy * (mmR * mmLen * 0.24) + py * wid * (mmOff + 0.02) * mmS,
             mmLen * 0.12, 1.04, 0.58, a, shade(hull, 0.78), dark);
    // A forward cheek protects the track return and supports the
    // glacis; its remap plate is structural, not a floating red dot.
    isoBox(g, cx + fx * mmLen * 0.28 + px * wid * 0.27 * mmS,
           by - 4.15 + fy * mmLen * 0.28 + py * wid * 0.27 * mmS,
           mmLen * 0.24, 2.7, 1.55, a, shade(hull, 0.79), dark);
    isoBox(g, cx + fx * mmLen * 0.32 + px * wid * 0.28 * mmS,
           by - 5.58 + fy * mmLen * 0.32 + py * wid * 0.28 * mmS,
           mmLen * 0.15, 2.35, 0.42, a, plit, dark);
  }
  fenders(mmLen * 0.46, 3.35, mmOff, 0.22, 0.13);
  bumper(mmLen * 0.46, wid * 0.20, by - 1.45);
  lamp(cx + fx * mmLen * 0.42 + px * wid * 0.23,
       by - 5.05 + fy * mmLen * 0.42 + py * wid * 0.23);
  lamp(cx + fx * mmLen * 0.42 - px * wid * 0.23,
       by - 5.05 + fy * mmLen * 0.42 - py * wid * 0.23);
  exhaust(cx - fx * mmLen * 0.40 + px * wid * 0.18,
          by - 5.9 - fy * mmLen * 0.40 + py * wid * 0.18);

  // Road wheels show through below the skirt, but stay subordinate
  // to the continuous dark belt.
  if (flank > 0.14) {
    var mmHw = wid * 0.24 / 2, mmSt = Math.max(0.5, mmLen * 1.12 / 2 - mmHw);
    for (var mmW = -2; mmW <= 2; mmW++) {
      var mmU = mmW * mmSt * 0.46;
      var mmX = cx + fx * mmU + px * (wid * mmOff + mmHw * 0.94) * nearS;
      var mmY = by - 0.7 + fy * mmU + py * (wid * mmOff + mmHw * 0.94) * nearS - 4.75 * 0.46;
      g.fillStyle = '#171a1d';
      g.beginPath(); g.ellipse(mmX, mmY, 1.58, 1.34, 0, 0, 6.29); g.fill();
      g.fillStyle = '#777777';
      g.beginPath(); g.ellipse(mmX, mmY - 0.20, 0.84, 0.66, 0, 0, 6.29); g.fill();
      g.fillStyle = '#343434';
      g.beginPath(); g.ellipse(mmX, mmY - 0.25, 0.32, 0.26, 0, 0, 6.29); g.fill();
    }
    for (var mmE = -1; mmE <= 1; mmE += 2) {
      var mmEX = cx + fx * mmSt * mmE + px * (wid * mmOff + mmHw * 0.94) * nearS;
      var mmEY = by - 0.7 + fy * mmSt * mmE + py * (wid * mmOff + mmHw * 0.94) * nearS - 4.75 * 0.46;
      g.fillStyle = '#101216';
      g.beginPath(); g.ellipse(mmEX, mmEY, 1.98, 1.72, 0, 0, 6.29); g.fill();
      g.strokeStyle = '#777777'; g.lineWidth = 0.65;
      g.beginPath(); g.ellipse(mmEX, mmEY - 0.20, 1.02, 0.84, 0, 0, 6.29); g.stroke();
    }
  }

  // The four shoulder blocks are low and separated in both axes. They
  // carry the Soviet remap without turning the side skirt into a red
  // ribbon or a row of tall silos.
  // TWO DRUMS, NOT FOUR BLOCKS, AND THEY ARE THE SIZE OF DRUMS.
  // `mammoth-voxel.jpg` carries this tank's owner colour in exactly two places:
  // a broad RED BAND across the front of the turret, and TWO FAT RED CYLINDERS
  // sitting on the after deck, side by side and clear of everything — the SAM
  // packs, and the single loudest thing on the vehicle. Ours spent the same
  // budget on FOUR small shoulder blocks low on the skirts, which at map size
  // is four red pixels in a row and names nothing. Two, twice the size, up on
  // the deck where the reference puts them.
  var mmPods = [];
  for (mmS = -1; mmS <= 1; mmS += 2) {
    var mmCu = -mmLen * 0.30;
    var mmCv = mmS * wid * 0.26;
    mmPods.push([cx + fx * mmCu + px * mmCv,
                 by - 7.60 + fy * mmCu + py * mmCv]);
  }
  mmPods.sort(function (m, n) { return m[1] - n[1]; });
  for (i2 = 0; i2 < mmPods.length; i2++) {
    isoBox(g, mmPods[i2][0], mmPods[i2][1], mmLen * 0.25, 3.25, 3.10, a,
           dark, PEDGE);
    isoBox(g, mmPods[i2][0], mmPods[i2][1], mmLen * 0.23, 3.05, 2.80, a,
           plit, dark);
    isoBox(g, mmPods[i2][0] - fx * 0.10, mmPods[i2][1] - fy * 0.10,
           mmLen * 0.13, 1.50, 0.32, a, shade(panel, 1.22), dark);
  }
}
if (wantT) {
  var mmx = cx + fx * 0.25, mmy = by - RING;
  // Six hard armour planes: the roof is deliberately shorter than the
  // hull, and the rear corners pull in instead of bulging outward.
  var mmPlan = [[5.25, -1.75], [5.25, 1.75], [2.35, 2.70], [-3.55, 2.45],
                [-4.50, 1.15], [-4.50, -1.15], [-3.55, -2.45], [2.35, -2.70]];
  var mmGround = prism(mmx, mmy, mmPlan, 3.50, '#555550', dark);
  g.strokeStyle = 'rgba(19,23,23,.78)'; g.lineWidth = 0.62;
  g.beginPath();
  for (var mmP = 0; mmP < mmGround.length; mmP++) {
    var mmQ = mmGround[mmP];
    if (mmP === 0) g.moveTo(mmQ[0], mmQ[1] - 3.50); else g.lineTo(mmQ[0], mmQ[1] - 3.50);
  }
  g.closePath(); g.stroke();
  prism(mmx - fx * 0.38, mmy - 3.50 - fy * 0.38,
        [[4.20, -1.35], [4.20, 1.35], [1.65, 2.20], [-3.05, 2.00],
         [-3.80, 0.95], [-3.80, -0.95], [-3.05, -2.00], [1.65, -2.20]],
        0.70, '#74746a', dark);
  // A broad red face plate belongs to the front of the turret assembly;
  // otherwise the two rear packs were the only faction-colour volumes.
  isoBox(g, mmx + fx * 3.9, mmy - 2.9 + fy * 3.9,
         2.5, 4.9, 1.0, a, plit, dark);
  // Deep cheek plates are structural and the two small red plates are
  // the only colour on the turret besides the shoulder blocks.
  for (mmS = -1; mmS <= 1; mmS += 2)
    isoBox(g, mmx + px * 1.82 * mmS, mmy - 2.70 + py * 1.82 * mmS,
           2.20, 0.78, 0.68, a, shade(panel, 0.60), dark);
  isoBox(g, mmx - fx * 2.70, mmy - 3.72 - fy * 2.70,
         2.05, 1.42, 0.76, a, shade(hull, 0.58), dark);
  isoBox(g, mmx - fx * 2.82, mmy - 4.62 - fy * 2.82,
         1.18, 0.72, 0.20, a, shade(hull, 0.98), dark);
  g.strokeStyle = '#272c2d'; g.lineWidth = 1.0; g.lineCap = 'butt';
  g.beginPath();
  g.moveTo(mmx - fx * 5.8, mmy - 5.7 - fy * 5.8);
  g.lineTo(mmx - fx * 4.35, mmy - 6.35 - fy * 4.35);
  g.stroke();

  // The mantlets are square collars set into the front shoulder. The
  // guns overhang the hull by roughly one third, matching the real rip.
  var mmz = [mmx + fx * 5.25, mmy - 2.40 + fy * 5.25];
  for (var mmB = -1; mmB <= 1; mmB += 2) {
    isoBox(g, mmx + fx * 4.85 + px * 3.35 * mmB,
           mmy - 0.92 + fy * 4.85 + py * 3.35 * mmB,
           2.1, 1.18, 1.25, a, '#474747', dark);
    barrel(mmz[0] + px * 3.35 * mmB, mmz[1] + py * 3.35 * mmB,
           18.8, 0.92, 0.62, VACC.mammothGun);
  }
}
}

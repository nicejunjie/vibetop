// Iron Frontier — vehicles/flaktrack: the art for one unit.
// Called by bakeVehicle() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.




function drawFlaktrack(C) {
  var PEDGE = C.PEDGE, RING = C.RING, a = C.a, bumper = C.bumper, by = C.by, chassis = C.chassis,
      cx = C.cx, dark = C.dark, deck = C.deck, exhaust = C.exhaust, fx = C.fx, fy = C.fy, g = C.g,
      hull = C.hull, i2 = C.i2, lamp = C.lamp, len = C.len, panel = C.panel, pdark = C.pdark,
      prism = C.prism, puck = C.puck, px = C.px, py = C.py, sg = C.sg, trackRun = C.trackRun,
      wantH = C.wantH, wantT = C.wantT, wheelDisc = C.wheelDisc, wid = C.wid;

// FLAK TRACK — a HALF-TRACK, and the running gear is the whole point:
// two rubber tyres under a cream bonnet at the nose, a short track run
// under an olive armoured bed at the tail. Nothing else in the fleet
// is wheeled at one end and tracked at the other, so that mismatch is
// the identity even before the gun is read. Remap goes on the flank
// band that wraps the cream lower body and on the cab door.
var tOff = wid * 0.40;
if (wantH) {
  for (sg = -1; sg <= 1; sg += 2)                           // rear track run
    trackRun(cx - fx * 6.4 + px * tOff * sg, by - 1 - fy * 6.4 + py * tOff * sg,
             len * 0.44, wid * 0.32, 3.6);
  var fw = [];                                              // front tyres, one axle
  for (sg = -1; sg <= 1; sg += 2)
    fw.push([cx + fx * 9.8 + px * tOff * sg, by - 2.6 + fy * 9.8 + py * tOff * sg]);
  fw.sort(function (m, n) { return m[1] - n[1]; });
  for (i2 = 0; i2 < fw.length; i2++)
    wheelDisc(fw[i2][0], fw[i2][1], 3.1, 0.68, '#14161a', '#9aa1ac');

  chassis(cx, by - 1.0, len * 0.88, wid * 0.66, 4.0, hull, dark, 2.6);
  isoBox(g, cx - fx * 5.2, by - 5.0 - fy * 5.2, len * 0.44, wid * 0.64, 4.8,
         a, deck, dark);                                    // olive armoured bed
  isoBox(g, cx - fx * 5.2, by - 9.8 - fy * 5.2, len * 0.26, wid * 0.42, 1.1,
         a, panel, PEDGE);                                  // house-colour bed coaming
  isoBox(g, cx + fx * 5.6, by - 5.0 + fy * 5.6, len * 0.26, wid * 0.58, 4.2,
         a, shade(hull, 1.04), dark);                       // cab
  isoBox(g, cx + fx * 5.6, by - 9.2 + fy * 5.6, len * 0.22, wid * 0.50, 1.1,
         a, shade(hull, 1.10), dark);                       // cream cab roof
  var fwx = cx + fx * 8.0, fwy = by - 5.6 + fy * 8.0;
  isoBox(g, fwx, fwy, 1.3, wid * 0.52, 3.4, a, '#242a32', '#0f1216');  // windscreen
  g.fillStyle = 'rgba(214,220,228,.32)';
  g.beginPath();
  g.ellipse(fwx + fx * 0.4, fwy - 2.3 + fy * 0.4, 2.6, 1.1, 0, 0, 6.29); g.fill();
  for (sg = -1; sg <= 1; sg += 2) {
    // The band runs the LOWER flank only and stops short of the tail,
    // so the cream body it is painted on still reads. Wrapped over
    // the whole side (the first attempt) the half-track came back a
    // solid coloured brick with a lever on top.
    isoBox(g, cx + px * wid * 0.36 * sg + fx * 3.6,
           by - 2.5 + py * wid * 0.36 * sg + fy * 3.6,
           len * 0.24, 1.4, 1.8, a, panel, PEDGE);
    isoBox(g, cx + px * wid * 0.31 * sg + fx * 5.8,
           by - 6.6 + py * wid * 0.31 * sg + fy * 5.8,
           len * 0.15, 1.3, 2.4, a, panel, PEDGE);          // cab door panel
  }
  bumper(len * 0.42, wid * 0.22, by - 1.4);
  for (i2 = -1; i2 <= 1; i2 += 2)
    lamp(cx + fx * len * 0.40 + px * wid * 0.24 * i2,
         by - 3.8 + fy * len * 0.40 + py * wid * 0.24 * i2);
  exhaust(cx - fx * len * 0.40, by - 5.2 - fy * len * 0.40);
}
if (wantT) {
  // The gun is a slim flak cannon on an open pintle behind a small
  // pale shield, and it points STEEPLY UP — that raised barrel is
  // what tells an anti-air halftrack from a scout car at 1:1.
  // A flak cannon is SHORT, fat and steep — the opposite of a tank
  // gun. Drawn long and slim (the first attempt) it read as a crane
  // jib and the whole vehicle looked like a recovery truck. The pale
  // gun shield around it is the second half of the read: it is the
  // one bright vertical face on the unit.
  // In `soviet-flak-track.png` the mount is the ONE red thing on an
  // otherwise cream vehicle: a squat house-colour turret cone with a
  // short dark barrel poking steeply out of it. The previous pass had
  // a pale steel jib nearly as long as the hull and the whole vehicle
  // read as a recovery crane.
  var kx = cx - fx * 4.4, ky = by - RING - fy * 4.4;
  puck(kx, ky, 3.1, 2.4, pdark, panel, PEDGE);              // house-colour pintle ring
  prism(kx - fx * 0.6, ky - 2.4, [[2.4, -2.6], [2.4, 2.6], [-2.6, 2.1], [-2.6, -2.1]],
        3.6, panel, PEDGE);                                 // house-colour turret cone
  isoBox(g, kx - fx * 1.2, ky - 5.6 - fy * 1.2, 3.6, 5.4, 3.0,
         a, '#3d434c', '#14171c');                          // breech housing
  // STEEPER and HIGHER than one pass ago. "Gun raised >= 10 px above
  // the bed line" (unit-identity-reference.md 2.4) is the Flak
  // Track's whole read, and a shallow jib left its crown the same fat
  // box the IFV wears -- the two lightest vehicles in the game, and
  // the pair the gate scored at 0.709.
  //
  // And it is a FLAKVIERLING, not a rifle. [HTK] is a half-track
  // carrying a quad 2cm mount, and RA2's own plate shows a fat
  // multi-barrel cluster with a wide muzzle group — a shape nothing
  // else on the field has. One 2.0-wide tube (what was here) is 1 px
  // of gunmetal at zoom 1: correct height, no gun. Four tubes in a
  // 2x2 sheaf carry the same crown at four times the ink, and the
  // sheaf is what reads as anti-air.
  var gAlong = kx + fx * 0.8, gAlongY = ky - 7.2 + fy * 0.8;
  var gTipX = kx + fx * 5.2, gTipY = ky - 15.2 + fy * 5.2;   // 2026-09-10: ~45 deg as in flaktrack.png, not near-vertical
  var quad = [];
  for (i2 = -1; i2 <= 1; i2 += 2)
    for (sg = -1; sg <= 1; sg += 2)
      quad.push([px * 1.25 * sg + fx * 0.85 * i2, py * 1.25 * sg + fy * 0.85 * i2]);
  quad.sort(function (m, n) { return m[1] - n[1]; });       // far barrels first
  for (i2 = 0; i2 < quad.length; i2++) {
    var qx = quad[i2][0], qy = quad[i2][1];
    g.strokeStyle = '#15181c'; g.lineWidth = 3.0; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(gAlong + qx, gAlongY + qy); g.lineTo(gTipX + qx, gTipY + qy); g.stroke();
    g.strokeStyle = '#c3cad3'; g.lineWidth = 1.7;           // SILVER tube, as the sheet
    g.beginPath(); g.moveTo(gAlong + qx, gAlongY + qy); g.lineTo(gTipX + qx, gTipY + qy); g.stroke();
    g.strokeStyle = '#aab2bd'; g.lineWidth = 0.8;           // upper glint
    g.beginPath();
    g.moveTo(gAlong + qx - 0.7, gAlongY + qy - 0.5); g.lineTo(gTipX + qx - 0.7, gTipY + qy - 0.5); g.stroke();
    g.fillStyle = '#cdd4dc';                                // muzzle brake
    g.beginPath(); g.ellipse(gTipX + qx, gTipY + qy, 1.35, 1.15, 0, 0, 6.29); g.fill();
    outline(g, '#3a4048');
    g.fillStyle = '#15181c';
    g.beginPath(); g.ellipse(gTipX + qx, gTipY + qy - 0.2, 0.62, 0.55, 0, 0, 6.29); g.fill();
  }
  // the sheaf's clamp — one bar across all four, two thirds up, so the
  // cluster reads as ONE weapon rather than four loose rods
  var clT = 0.62;
  g.strokeStyle = panel; g.lineWidth = 2.4; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(gAlong + (gTipX - gAlong) * clT - px * 2.1, gAlongY + (gTipY - gAlongY) * clT - py * 2.1);
  g.lineTo(gAlong + (gTipX - gAlong) * clT + px * 2.1, gAlongY + (gTipY - gAlongY) * clT + py * 2.1);
  g.stroke();
  // the small pale shield, drawn LAST so it stands in front of the breech
  // ...and it grew with the breech behind it. A quad mount needs a
  // bigger shield than a single tube did, the reference draws one,
  // and it puts back the ordnance green the new gunmetal displaced
  // (`colour.vehicle.meanDist` reads the hue HISTOGRAM, so a unit
  // that gains 60 px of grey has to gain some of its own hue too).
  // (2026-09-10: the green gun shield is gone -- the sheet has none;
  // the mount is red and the gun silver, and that is the whole read)
  puck(kx - fx * 2.8, ky - 3.0 - fy * 2.8, 1.3, 2.0,        // ammo drum at the breech
       '#3d434c', '#7f8792', '#14171c');
}
}

// Iron Frontier — vehicles/teslatank: the art for one unit.
// Called by bakeVehicle() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.




function drawTeslatank(C) {
  var PEDGE = C.PEDGE, a = C.a, bumper = C.bumper, by = C.by, chassis = C.chassis, cx = C.cx,
      dark = C.dark, deckPlate = C.deckPlate, exhaust = C.exhaust, fenders = C.fenders, fx = C.fx,
      fy = C.fy, g = C.g, gEllipse = C.gEllipse, hull = C.hull, i2 = C.i2, lamp = C.lamp,
      len = C.len, panel = C.panel, pdark = C.pdark, plit = C.plit, puck = C.puck, px = C.px,
      py = C.py, sg = C.sg, tracks = C.tracks, wid = C.wid;

// TESLA TANK — a plain olive tracked hull whose whole identity stands
// on the deck: TWIN pale coil columns, each a stack of ring windings,
// flanking a house-colour core block, with a dark capacitor box at the
// tail. The blue-white at the coil tips is kept to a couple of pixels
// a side: at any size that reads across the field it swamps the owner
// colour and both players' tanks glow the same.
tracks(len * 1.00, 4.2, wid * 0.30, '#b0b7c2');
chassis(cx, by - 1.3, len * 0.86, wid * 0.76, 4.2, hull, dark, 3.2);
deckPlate(-0.8, len * 0.58, wid * 0.48, 6.8, shade(hull, 1.08));
// TWO plates a flank with a gap, not a bar: the Tesla Tank's own
// identity is the coil pair, so most of its remap belongs UP THERE
// (the feet and the cap below), and what stays on the hull is two
// countable plates. A single band down the skirt was the one surface
// it shares with the Rhino and the War Miner, which is exactly where
// paint buys nothing.
for (sg = -1; sg <= 1; sg += 2)
  for (i2 = -1; i2 <= 1; i2 += 2)
    isoBox(g, cx + px * wid * 0.375 * sg + fx * (i2 * 5.6 - 1.4),
           by - 3.2 + py * wid * 0.375 * sg + fy * (i2 * 5.6 - 1.4),
           len * 0.24, 1.7, 3.4, a, i2 > 0 ? plit : panel, PEDGE);
fenders(len * 0.42, 3.4);
bumper(len * 0.41, wid * 0.24, by - 1.5);
var drawTail5 = function () {
  // The capacitor bank. Built at full black (the first attempt) it was
  // the largest single mass on the tank and read as a crate strapped
  // to the engine deck, so it is mid-value and one size down.
  isoBox(g, cx - fx * 9.8, by - 4.8 - fy * 9.8, len * 0.17, wid * 0.42, 3.4,
         a, '#525965', '#191d22');
  for (i2 = -1; i2 <= 1; i2++)
    isoBox(g, cx - fx * (9.8 + i2 * 1.9), by - 9.0 - fy * (9.8 + i2 * 1.9),
           0.8, wid * 0.36, 0.8, a, '#8b939f', '#15181c');
  exhaust(cx - fx * len * 0.42 + px * wid * 0.22, by - 6.9 - fy * len * 0.42 + py * wid * 0.22);
};
var drawPod5 = function () {
  // THE COILS. Each is a stack of five thin ring windings on a stubby
  // base, capped by a chrome head — the same construction as the Tesla
  // Coil structure, one size down. Two fat pale cylinders (the first
  // attempt) read as fuel drums; it is the RIB COUNT that says coil.
  var sx5 = cx - fx * 3.6, sy5 = by - 5.8 - fy * 3.6;   // 2026-09-10: at the REAR, as RA2 Tesla Tank.png
  isoBox(g, sx5, sy5, len * 0.32, wid * 0.56, 2.0, a, shade(hull, 0.72), '#171a1f');   // the housing
  isoBox(g, sx5, sy5 - 2.0, len * 0.28, wid * 0.50, 1.1, a, shade(hull, 0.92), PEDGE);
  // the core block stands PROUD of the coils so it still reads from
  // above when the two columns overlap it side-on. Its house-colour
  // is now a CAP, not the whole column: a full-height coloured block
  // between two coils was the single largest mass on the tank.
  isoBox(g, sx5 - fx * 1.2, sy5 - 3.1 - fy * 1.2, len * 0.17, wid * 0.26, 2.8,
         a, shade(hull, 0.92), dark);
  isoBox(g, sx5 - fx * 1.2, sy5 - 5.9 - fy * 1.2, len * 0.16, wid * 0.24, 1.6,
         a, panel, PEDGE);
  isoBox(g, sx5 - fx * 1.2, sy5 - 7.5 - fy * 1.2, len * 0.15, wid * 0.22, 0.9,
         a, plit, PEDGE);
  // The pair is STAGGERED along the hull, not set abreast across it,
  // and that is a deliberate departure from the plan view. Our
  // isometric puts `px` at exactly 0 on the two broadside bearings
  // (a = 135 and 315 degrees), so two coils mounted abreast land in
  // the SAME screen columns there and stack into one tall mast —
  // which is what the audit was looking at when it scored the Tesla
  // Tank against the Mirage at 0.815. Offset fore-and-aft as well
  // and the gap survives all eight bearings, which is the whole
  // point of "gap >= 5 px so the pair reads as two"
  // (unit-identity-reference.md 2.4).
  var cols5 = [];
  for (sg = -1; sg <= 1; sg += 2)
    cols5.push([sx5 + px * wid * 0.37 * sg + fx * len * 0.10 * sg,
                sy5 - 2.6 + py * wid * 0.37 * sg + fy * len * 0.10 * sg]);
  cols5.sort(function (m, n) { return m[1] - n[1]; });
  // TEN windings, not seven, and each a shade taller. The spec is
  // "each column >= 9 px tall x 3 px wide" (2.4) and seven rings at
  // 1.05 measured barely over the deck furniture every other tank
  // carries; a coil column that does not CLEAR the hull is a texture,
  // not a spike (reference 1.3 rule 4). It buys the silhouette twice:
  // a vertical mass does not swing with the bearing the way a hull
  // does, so the Tesla Tank's own self-IoU rises with it.
  for (i2 = 0; i2 < cols5.length; i2++) {
    var kx5 = cols5[i2][0], ky5 = cols5[i2][1];
    puck(kx5, ky5, 2.1, 2.0, pdark, panel, PEDGE);                // colour foot
    for (var w5 = 0; w5 < 5; w5++)                                // FIVE fat SILVER windings: the sheet's coils are short stubby chrome drums
      puck(kx5, ky5 - 1.1 - w5 * 1.30, 2.15 - w5 * 0.06, 1.24,
           shade('#c6cdd6', 0.80), shade('#c6cdd6', 1.12), '#4a505a');
    puck(kx5, ky5 - 7.8, 0.8, 1.4, '#767d87', '#cfd6de', '#3d434b'); // head stem
    g.fillStyle = '#dcecff';                                       // small tip glow
    gEllipse(kx5, ky5 - 9.2, 0.85); g.fill();
  }
  g.strokeStyle = 'rgba(224,240,255,.72)'; g.lineWidth = 0.8;      // arc across the pair
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  for (var ka = 0; ka <= 4; ka++) {
    var kt = ka / 4;
    var akx = cols5[0][0] + (cols5[1][0] - cols5[0][0]) * kt;
    var aky = cols5[0][1] + (cols5[1][1] - cols5[0][1]) * kt
            - 8.9 - Math.sin(kt * 3.14) * 1.6 + (ka & 1 ? 1.5 : -1.5);
    if (!ka) g.moveTo(akx, aky + (ka & 1 ? -1.5 : 1.5)); else g.lineTo(akx, aky);
  }
  g.stroke();
};
if (fy > 0) { drawTail5(); drawPod5(); } else { drawPod5(); drawTail5(); }
lamp(cx + fx * len * 0.39 + px * wid * 0.24, by - 4.5 + fy * len * 0.39 + py * wid * 0.24);
}

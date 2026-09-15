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
tracks(len * 1.00, 4.2, wid * 0.30, '#555555');
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
           len * 0.18, 1.5, 2.5, a, shade(hull, i2 > 0 ? 0.94 : 1.10), PEDGE);
fenders(len * 0.42, 3.4, 0.40, 0.20, 0.13);
bumper(len * 0.41, wid * 0.24, by - 1.5);
var drawTail5 = function () {
  // The capacitor bank. Built at full black (the first attempt) it was
  // the largest single mass on the tank and read as a crate strapped
  // to the engine deck, so it is mid-value and one size down.
  isoBox(g, cx - fx * 9.8, by - 4.8 - fy * 9.8, len * 0.17, wid * 0.42, 3.4,
         a, '#525965', '#191d22');
  for (i2 = -1; i2 <= 1; i2++)
    isoBox(g, cx - fx * (9.8 + i2 * 1.9), by - 9.0 - fy * (9.8 + i2 * 1.9),
           0.8, wid * 0.36, 0.8, a, '#929292', '#15181c');
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
         a, shade(hull, 1.06), PEDGE);
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
  var heads5 = [];
  for (i2 = 0; i2 < cols5.length; i2++) {
    var kx5 = cols5[i2][0], ky5 = cols5[i2][1];
    // THE BUS BAR GOES BETWEEN THE ELECTRODES, AND IT GOES UNDER THE NEAR ONE.
    // Drawn after the loop from the coils' BASE points with a fixed offset, it
    // ended in mid-air short of the near column — the bar is anchored to the
    // heads themselves now, which cannot drift from them — and drawn after the
    // far coil but before the near one, so the near column occludes it the way
    // a real conduit passing behind it would.
    if (i2 === 1) {
      var h0 = heads5[0], h1 = [kx5, ky5 - 7.3];
      g.lineCap = 'butt';
      // NOT NEAR-BLACK. #141414 is 20/20/20 and snaps to pure black, so the bus
      // bar came out as a solid black stroke between the coils and read as a
      // gap in the sprite rather than as a conduit — the same fault as the guns
      // and the tracks. It is still the darkest thing up there, with room now
      // for its own lit edge to sit above it.
      g.strokeStyle = '#2e2e2e'; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(h0[0], h0[1]); g.lineTo(h1[0], h1[1]); g.stroke();
      g.strokeStyle = '#5c5c5c'; g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(h0[0], h0[1] - 0.6); g.lineTo(h1[0], h1[1] - 0.6); g.stroke();
    }
    heads5.push([kx5, ky5 - 7.3]);
    puck(kx5, ky5, 2.1, 2.0, pdark, panel, PEDGE);                // colour foot
    // PALE windings. The copper here was a fix for a real problem — the
    // original '#5e2a24'/'#7a3a30' snapped to #663333 and #993333, the RED
    // PLAYER'S OWN COLOUR, on a Soviet tank the blue player owns half the
    // time — but it overshot into a different error: #6b4318 bakes #663300,
    // and 148 pixels of it made the coil a BROWN POST that reads as wood.
    //
    // This file's own header asks for "TWIN PALE coil columns", and kit.js
    // carries '#e5e5e5' for this exact part, described as "pale coil
    // windings". Both were right and the implementation ignored them. Pale is
    // also FURTHER from the red player than copper is — it leaves the hue
    // question entirely rather than trying to sit 30 degrees off it.
    // A COIL NEEDS AN ELECTRODE. Five identical pale rings stacked to a thin
    // stem gave a smooth white cylinder with nothing on top — a beer can, and
    // at four of the eight facings that is exactly what the pair read as.
    // soviet-tesla-tank.png caps each column with a DARK head: the windings
    // stop, a black electrode housing sits on them, and the blue-white is only
    // the couple of pixels at the very tip. Four windings at a wider pitch
    // leaves room for that head without the column losing a single unit of
    // height — the clause this file argues for is that the coil CLEARS the
    // hull, and it still does (tip at -9.0 against -9.2 before).
    // THE PITCH IS WHAT SAYS COIL. Widening these to four rings at 1.45 to make
    // room for a head quantised the ribs away completely and left a smooth
    // white cylinder — a worse can than before. The winding count and pitch go
    // back to what actually renders as strap, and the electrode sits ON TOP of
    // them instead of taking their space.
    for (var w5 = 0; w5 < 5; w5++)                                // five windings of strap
      puck(kx5, ky5 - 1.1 - w5 * 1.30, 1.75 - w5 * 0.05, 1.16,
           shade('#b4b4b4', 0.82), shade('#e5e5e5', 1.10), '#3d3d3d');
    puck(kx5, ky5 - 7.3, 1.45, 1.4, '#333333', '#5c5c5c', '#232323'); // electrode head
    puck(kx5, ky5 - 8.6, 0.6, 1.1, '#5c5c5c', '#b4b4b4', '#2b2b2b');  // head stem
    g.fillStyle = '#c8d8ff';                                       // small tip glow
    gEllipse(kx5, ky5 - 9.6, 0.8); g.fill();
  }
  // A GREY WIRE BETWEEN TWO CANS IS A HANDBAG HANDLE. This was meant as a
  // lightning arc — a five-point zigzag — but at 0.8 px in rgba(237,237,237,.72)
  // the alternating offsets quantised away and what baked was one smooth pale
  // curve joining the two coil tops, in the STAND frame, at every bearing. A
  // tesla tank at rest is not arcing; what the rip shows between its columns is
  // a dark BUS BAR, the conduit that feeds them both. Drawn as a real box at
  // electrode height, it reads as machinery instead of as a carry handle, and
  // the blue-white stays where it belongs — the couple of pixels at each tip.

};
// The RA2 vehicle has one squat red power/turret assembly. Its two
// silver electrodes are small end fittings, not tall parallel masts.
var drawPodRA2 = function () {
  var tx = cx - fx * 2.2, ty = by - 6.2 - fy * 2.2;
  isoBox(g, tx, ty, len * 0.36, wid * 0.50, 2.35, a, '#292b2a', '#171918');
  isoBox(g, tx, ty - 2.35, len * 0.31, wid * 0.43, 2.65,
         a, shade(panel, 0.80), '#292929');
  isoBox(g, tx + fx * 1.55, ty - 5.0 + fy * 1.55,
         len * 0.19, wid * 0.40, 1.0, a, shade(panel, 1.08), '#292929');
  // Paired raised electrodes flank the red power housing. They are short
  // articulated insulators with dark conductive heads, not gun barrels.
  for (var er = -1; er <= 1; er += 2) {
    var lateral = wid * 0.245 * er;
    var bx5 = tx + fx * 0.8 + px * lateral;
    var by5 = ty - 4.2 + fy * 0.8 + py * lateral;
    isoBox(g, bx5, by5, len * 0.12, wid * 0.16, 2.4,
           a, '#888888', '#444444');                     // root at the power housing
    isoBox(g, bx5 + fx * 1.6, by5 - 2.7 + fy * 1.6,
           len * 0.14, wid * 0.14, 2.0,
           a, '#dddddd', '#777777');                     // forward-leaning ceramic arm
    var headx = bx5 + fx * 2.5;
    var heady = by5 - 5.2 + fy * 2.5;
    puck(headx, heady, 1.25, 1.5, '#444444', '#bbbbbb', '#333333');
    g.strokeStyle = '#eeeeee'; g.lineWidth = 0.95;
    for (var wr = 0; wr < 2; wr++) {
      var wy = by5 - 3.0 - wr * 1.1;
      g.beginPath(); g.moveTo(bx5 + fx * 1.6 - px * 1.4, wy + fy * 1.6 - py * 1.4);
      g.lineTo(bx5 + fx * 1.6 + px * 1.4, wy + fy * 1.6 + py * 1.4); g.stroke();
    }
    g.fillStyle = '#aaddff';
    gEllipse(headx, heady - 1.5, 0.55); g.fill();
  }
  // The red power housing stays proud of the conductors, not buried by
  // them; it is the visual root of the gun in the RA2 render.
  isoBox(g, tx - fx * 0.55, ty - 5.8 - fy * 0.55,
         len * 0.20, wid * 0.32, 1.25, a, shade(panel, 0.94), '#292929');
  // A dark transverse bus and paired porcelain heads sit on the
  // after edge of the red machinery, visibly connected to its base.
  isoBox(g, tx - fx * 2.55, ty - 4.35 - fy * 2.55,
         1.15, wid * 0.48, 0.95, a, '#343535', '#1d1e1e');
  for (var s5 = -1; s5 <= 1; s5 += 2) {
    var ex5 = tx - fx * 3.2 + px * wid * 0.205 * s5;
    var ey5 = ty - 4.4 - fy * 3.2 + py * wid * 0.205 * s5;
    isoBox(g, ex5, ey5, 1.4, 1.4, 2.15, a, '#9b9b9b', '#333333');
    puck(ex5, ey5 - 2.15, 0.85, 0.85, '#343434', '#bbbbbb', '#252525');
  }
};
if (fy > 0) { drawTail5(); drawPodRA2(); } else { drawPodRA2(); drawTail5(); }
lamp(cx + fx * len * 0.39 + px * wid * 0.24, by - 4.5 + fy * len * 0.39 + py * wid * 0.24);
}

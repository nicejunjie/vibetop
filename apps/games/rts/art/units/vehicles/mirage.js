// ─── vehicles/mirage ─── Iron Frontier unit art. Included into rts.html by tools/rts-build.py;
// every free identifier is a local of bakeVehicle() in rts.src.html — see art/units/README.md.

// MIRAGE TANK — a LOW WIDE tracked hull in neutral slate with one
// CONTINUOUS house-colour band sweeping the whole flank (the segmented
// skirt every other tank wears is wrong here: the reference shows an
// unbroken curve), and standing on the deck the thing that names it —
// a RIBBED WHITE EMITTER STACK of four pale plates with dark grooves
// between them, flanked by two dark swept wings and closed at the
// rear by a black vented cowl. No turret, and almost no gun: just a
// stubby muzzle under the stack's chin.
tracks(len * 1.00, 3.6, wid * 0.30, '#b0b7c2');
chassis(cx, by - 1.3, len * 0.84, wid * 0.74, 3.8, hull, dark, 3.4);
deckPlate(-0.8, len * 0.56, wid * 0.46, 5.9, shade(hull, 1.12));
// TWO plates a flank, and the glacis wrap is gone with the band that
// used to run the whole hull. The Mirage's identity is the EMITTER
// HOUSING, so that is where the rest of its remap now sits -- the
// ring at its foot and the housing's own bottom plate, below.
// Painting the full flank instead spent the whole budget on the one
// shape it shares with the Chrono Miner, its worst confusion on the
// field at 0.837 silhouette IoU.
for (sg = -1; sg <= 1; sg += 2)
  for (i2 = -1; i2 <= 1; i2 += 2)
    isoBox(g, cx + px * wid * 0.365 * sg + fx * i2 * 5.8,
           by - 3.4 + py * wid * 0.365 * sg + fy * i2 * 5.8,
           len * 0.42, 1.8, 4.2, a, i2 > 0 ? plit : panel, PEDGE);
fenders(len * 0.42, 3.2);
bumper(len * 0.41, wid * 0.24, by - 1.6);
// 2026-09-10 -- REBUILT AGAINST THE REAL RIP. `mirage.png`
// (File:CNCRA2 Mirage Tank.png, eight bearings) is NOT a ribbed
// emitter stack with a stub muzzle: it is a dark tank with a BOX
// TURRET carrying a LONG THIN GUN (the longest overhang on any Allied
// tank), and behind the turret a tall PALE UPRIGHT PANEL -- the
// projector -- standing as high as the turret again, as wide as the
// hull. Everything below the deck is unchanged; the three closures
// that drew the invented stack are replaced by the panel, the turret
// and the gun, drawn back-to-front by bearing.
var drawPanel = function () {
  var ppx = cx - fx * 7.6, ppy = by - 6.2 - fy * 7.6;
  isoBox(g, ppx, ppy, 5.2, wid * 0.72, 7.8, a, '#cfd5dd', '#2c323b');   // the projector: a thick pale BLOCK (rip), not a slab
  isoBox(g, ppx, ppy - 7.8, 5.6, wid * 0.76, 0.9, a, '#e9edf2', '#2c323b'); // lit top
  // one owner-colour band low across the slab, one VACC.mirage
  // (hologram green) strip up its forward face: the panel is the
  // Mirage's tell, so the two colours that name it sit there.
  isoBox(g, ppx, ppy - 1.2, 2.0, wid * 0.74, 1.4, a, panel, PEDGE);   // a thin band: the mirage was the roster's owner-colour maximum
  g.fillStyle = VACC.mirage;
  g.beginPath();
  g.moveTo(ppx + fx * 0.9 + px * wid * 0.20, ppy - 3.2 + fy * 0.9 + py * wid * 0.20);
  g.lineTo(ppx + fx * 0.9 - px * wid * 0.20, ppy - 3.2 + fy * 0.9 - py * wid * 0.20);
  g.lineTo(ppx + fx * 0.9 - px * wid * 0.20, ppy - 6.4 + fy * 0.9 - py * wid * 0.20);
  g.lineTo(ppx + fx * 0.9 + px * wid * 0.20, ppy - 6.4 + fy * 0.9 + py * wid * 0.20);
  g.closePath(); g.fill(); outline(g, '#123a20');
  exhaust(cx - fx * len * 0.42 + px * wid * 0.22, by - 5.4 - fy * len * 0.42 + py * wid * 0.22);
};
var drawTurret = function () {
  var mtx = cx + fx * 1.2, mty = by - 6.4 + fy * 1.2;
  prism(mtx, mty, [[4.6, -3.2], [4.6, 3.2], [-1.6, 4.2], [-4.6, 2.8],
                   [-4.6, -2.8], [-1.6, -4.2]],
        3.8, shade(hull, 1.12), dark);
  for (sg = -1; sg <= 1; sg += 2)                              // owner cheeks
    prism(mtx - fx * 0.6, mty - 0.6 - fy * 0.6,
          [[3.0, 3.1 * sg], [-3.6, 2.7 * sg], [-3.8, 4.4 * sg], [3.0, 4.8 * sg]],
          2.4, panel, PEDGE);
  prism(mtx - fx * 0.6, mty - 3.8 - fy * 0.6,                   // cap
        [[3.4, -2.2], [3.4, 2.2], [-1.2, 3.2], [-3.6, 2.0], [-3.6, -2.0], [-1.2, -3.2]],
        1.1, shade(hull, 1.24), dark);
  puck(mtx - fx * 2.2, mty - 4.9 - fy * 2.2, 1.2, 1.6,          // cupola
       shade(hull, 0.86), shade(hull, 1.20), dark);
  puck(mtx + fx * 4.2, mty - 0.4 + fy * 4.2, 1.6, 3.0,          // mantlet
       shade(hull, 0.80), shade(hull, 1.10), dark);
  // THE GUN. ~0.7 of the hull length past the mantlet: on the rip the
  // tube is a good half of the whole sprite's width at broadside.
  barrel(mtx + fx * 4.8, mty - 2.6 + fy * 4.8, 13.5, 1.7, 1.05, '#2a2e36');
  for (i2 = -1; i2 <= 1; i2 += 2)
    lamp(cx + fx * len * 0.38 + px * wid * 0.26 * i2,
         by - 4.2 + fy * len * 0.38 + py * wid * 0.26 * i2);
};
if (fy > 0) { drawPanel(); drawTurret(); }
else { drawTurret(); drawPanel(); }

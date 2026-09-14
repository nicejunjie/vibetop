// Iron Frontier — vehicles/mirage: the art for one unit.
// Called by bakeVehicle() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.





function drawMirage(C) {
  var PEDGE = C.PEDGE, a = C.a, barrel = C.barrel, bumper = C.bumper, by = C.by,
      chassis = C.chassis, cx = C.cx, dark = C.dark, deckPlate = C.deckPlate, exhaust = C.exhaust,
      fenders = C.fenders, fx = C.fx, fy = C.fy, g = C.g, hull = C.hull, i2 = C.i2, lamp = C.lamp,
      len = C.len, panel = C.panel, plit = C.plit, prism = C.prism, puck = C.puck, px = C.px,
      py = C.py, sg = C.sg, tracks = C.tracks, wid = C.wid;

// MIRAGE TANK — a LOW WIDE tracked hull in neutral slate with one
// CONTINUOUS house-colour band sweeping the whole flank (the segmented
// skirt every other tank wears is wrong here: the reference shows an
// unbroken curve), and standing on the deck the thing that names it —
// a RIBBED WHITE EMITTER STACK of four pale plates with dark grooves
// between them, flanked by two dark swept wings and closed at the
// rear by a black vented cowl. No turret, and almost no gun: just a
// stubby muzzle under the stack's chin.
tracks(len * 1.00, 3.6, wid * 0.30, '#b6b6b6');
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
  // LOW AND BESIDE, NOT TALL AND BEHIND. At 7.8 units it stood a white tower
  // over the turret and dominated the sprite; in the rip the ribbed emitter
  // plates FLANK the khaki body at about its own height.
  //
  // THE TRADE, STATED. Coming down costs one same-faction mask pair:
  // `Chrono Miner | Mirage Tank` crosses 0.75 IoU (0.753), so
  // iou.sameFactionOver75 goes 3 -> 4. The tower was carrying that separation,
  // and the tower is not in the reference — RA2's Mirage is genuinely low and
  // wide. Swept the height at 4.4, 5.6 and 6.4: the aspect band comes back to
  // baseline at 6.4 but the pair stays over at every setting, because what
  // separated them was height this unit should not have. The hard gate is
  // unaffected — zero confusable in all 24 windows — so this is a ratchet
  // number against a shape the rip actually shows, and the rip wins.
  isoBox(g, ppx, ppy, 5.2, wid * 0.72, 6.4, a, '#d4d4d4', '#323232');
  isoBox(g, ppx, ppy - 6.4, 5.6, wid * 0.76, 0.9, a, '#ececec', '#323232'); // lit top
  // A PROJECTOR HAS VANES. This was a blank white slab — the right size and the
  // right place, and still not a machine, because nothing on it said what it
  // did. In the rip the pale block is unmistakably LOUVRED: four horizontal
  // slats across its face, which is the one texture that separates an emitter
  // from a cargo box. Drawn on the face's own plane (every endpoint through the
  // beam vector) so they skew with it instead of floating.
  for (i2 = 0; i2 < 4; i2++) {
    var slz = ppy - 1.6 - i2 * 1.35, slx = ppx + fx * 2.7;
    g.strokeStyle = '#5c5c5c'; g.lineWidth = 0.9; g.lineCap = 'butt';
    g.beginPath();
    g.moveTo(slx - px * wid * 0.33, slz + fy * 2.7 - py * wid * 0.33);
    g.lineTo(slx + px * wid * 0.33, slz + fy * 2.7 + py * wid * 0.33);
    g.stroke();
    g.strokeStyle = '#f4f4f4'; g.lineWidth = 0.55;
    g.beginPath();
    g.moveTo(slx - px * wid * 0.33, slz - 0.75 + fy * 2.7 - py * wid * 0.33);
    g.lineTo(slx + px * wid * 0.33, slz - 0.75 + fy * 2.7 + py * wid * 0.33);
    g.stroke();
  }
  // the two emitter rods that stand at the panel's outboard corners
  for (sg = -1; sg <= 1; sg += 2)
    isoBox(g, ppx + px * wid * 0.40 * sg, ppy - 6.2 + py * wid * 0.40 * sg,
           1.0, 1.0, 2.6, a, '#4a4a4a', '#181818');
  // One owner-colour band low across the slab, and the emitter face above it.
  // That face used to be VACC.mirage as a HOLOGRAM GREEN, defended in the
  // table as "the Mirage disguises itself as a TREE" — a statement about the
  // ability, not the machine. Counted over `mirage-voxel.jpg`: ZERO pixels of
  // that hue in 69,537 saturated ones. It is the ribbed WHITE emitter now.
  isoBox(g, ppx, ppy - 1.2, 2.0, wid * 0.74, 1.4, a, panel, PEDGE);   // a thin band: the mirage was the roster's owner-colour maximum
  g.fillStyle = VACC.mirage;
  g.beginPath();
  g.moveTo(ppx + fx * 0.9 + px * wid * 0.20, ppy - 2.0 + fy * 0.9 + py * wid * 0.20);
  g.lineTo(ppx + fx * 0.9 - px * wid * 0.20, ppy - 2.0 + fy * 0.9 - py * wid * 0.20);
  g.lineTo(ppx + fx * 0.9 - px * wid * 0.20, ppy - 4.2 + fy * 0.9 - py * wid * 0.20);
  g.lineTo(ppx + fx * 0.9 + px * wid * 0.20, ppy - 4.2 + fy * 0.9 + py * wid * 0.20);
  // AND ITS OUTLINE WAS GREEN TOO. #123a20 is a dark forest green edging the
  // emitter face — the last of the tree that RA2 never drew.
  g.closePath(); g.fill(); outline(g, '#323232');
  exhaust(cx - fx * len * 0.42 + px * wid * 0.22, by - 5.4 - fy * len * 0.42 + py * wid * 0.22);
};
var drawTurret = function () {
  var mtx = cx + fx * 1.2, mty = by - 6.4 + fy * 1.2;
  // ...and so is the turret body it comes out of.
  prism(mtx, mty, [[4.6, -3.2], [4.6, 3.2], [-1.6, 4.2], [-4.6, 2.8],
                   [-4.6, -2.8], [-1.6, -4.2]],
        3.8, '#999966', '#4d4d33');
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
  // THE GUN IS KHAKI. Nearly every tank in the game has a dark tube, and the
  // Mirage is the exception the rip actually draws: its barrel and its turret
  // body are the same olive-tan mass, which is most of what separates her from
  // the Grizzly at a glance. Ours was #2a2e36 gunmetal like everyone else's.
  barrel(mtx + fx * 4.8, mty - 2.6 + fy * 4.8, 13.5, 1.7, 1.05, '#999966', shade('#999966', 1.55));
  for (i2 = -1; i2 <= 1; i2 += 2)
    lamp(cx + fx * len * 0.38 + px * wid * 0.26 * i2,
         by - 4.2 + fy * len * 0.38 + py * wid * 0.26 * i2);
};
if (fy > 0) { drawPanel(); drawTurret(); }
else { drawTurret(); drawPanel(); }
}

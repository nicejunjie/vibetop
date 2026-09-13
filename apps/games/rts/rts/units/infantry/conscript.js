// Iron Frontier — infantry/conscript: the art for one unit.
// Called by bakeInfantry() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.




function drawConscript(C) {
  var ACC = C.ACC, HEADX = C.HEADX, JACKET = C.JACKET, POUCH = C.POUCH, SLEEVE = C.SLEEVE, T = C.T,
      TURN = C.TURN, arms = C.arms, by = C.by, carbine = C.carbine, col = C.col, cx = C.cx,
      face = C.face, g = C.g, gt = C.gt, legs = C.legs, sd = C.sd;

// Read straight off the RA2 sprite (soviet-conscript-anim-f0): a plain
// STEEL helmet, a fat house-colour scarf filling the whole chest under
// the chin, a near-black jacket with the sleeves the same value as the
// jacket, and BROWN-MAROON trousers carrying a tan ammo pouch on the
// hip. Two earlier passes made him a house-colour helmet over a tan
// greatcoat, which is a different soldier: in the real sprite the
// helmet is grey and the SCARF is the only remapped mass.
legs(2.6, by - 12.6, 3.6, T.coat, 4.2);

g.save(); g.translate(gt.lean, gt.bob);
g.fillStyle = POUCH;                                          // tan hip pouch
g.beginPath(); g.roundRect(cx - 4.6, by - 13.0, 4.4, 3.2, 0.9); g.fill();
outline(g, shade(POUCH, 0.44));
g.fillStyle = shade(POUCH, 1.22);
g.fillRect(cx - 4.3, by - 12.8, 3.8, 0.9);

g.fillStyle = JACKET;                                         // dark jacket
g.beginPath();
g.moveTo(cx - 5.2, by - 18.4); g.lineTo(cx + 5.2, by - 18.4);
g.lineTo(cx + 4.7, by - 11.6); g.lineTo(cx - 4.7, by - 11.6);
g.closePath(); g.fill(); outline(g, shade(JACKET, 0.52));
g.fillStyle = shade(JACKET, 1.34);                            // lit left edge
g.fillRect(cx - 5.0, by - 18.2, 1.3, 6.4);
g.fillStyle = shade(JACKET, 0.66);                            // belt
g.fillRect(cx - 4.9, by - 13.2, 9.8, 1.5);

// The sleeves are a step LIGHTER than the jacket on purpose: at the
// jacket's own value they merged with the torso and the scarf read as
// a slab floating between two black bricks with no arms swinging.
// The tunic's sleeves are the tunic: RA2 remaps the Conscript down to
// the cuff (44.6% of the body), and drawing them in the jacket's grey
// left the house block looking like a bib pinned to a dark coat.
arms(5.5, by - 18.4, 2.9, 6.6, SLEEVE, function (i, x, y) {
  g.fillStyle = shade(SLEEVE, 0.62);                          // dark cuff, the sleeve's end
  g.beginPath(); g.roundRect(x - 1.5, y + 5.0, 3.0, 2.0, 0.8); g.fill();
});

// THE BLOCK. The scarf used to stop at the sternum; RA2's Conscript is
// house colour from the collar to the BELT, one mass, 44.6% of the body
// (unit-identity-reference.md §1.5). It spills over both shoulders and
// the dark jacket survives only as the sleeves and a rim down each
// flank — which is what a tunic worn OVER a uniform actually looks
// like. The rifle is slung up over the LEFT shoulder (as in the sprite)
// precisely so it does not lie across that mass.
g.fillStyle = col;
g.beginPath();
g.moveTo(cx - 4.0, by - 19.6); g.lineTo(cx + 4.0, by - 19.6);
g.lineTo(cx + 3.6, by - 15.4); g.lineTo(cx - 3.6, by - 15.4);
g.closePath(); g.fill(); outline(g, shade(col, 0.40));
// Shading a house-colour panel is a trap: the blue #4aa3db clips its
// blue channel above about f=1.3 and goes white-cyan, so a "lit" fold
// at 1.4 stops reading as the owner's colour at all. Folds stay inside
// 0.70..1.24 on every figure.
g.fillStyle = shade(col, 1.22);                               // lit fold on the tunic
g.fillRect(cx - 3.8, by - 19.4, 2.4, 3.8);
g.fillStyle = shade(col, 0.76);                               // shaded right fold
g.fillRect(cx + 1.4, by - 19.1, 1.9, 3.2);
g.fillStyle = shade(col, 0.64);                               // chin shadow
g.fillRect(cx - 4.8, by - 20.1, 9.6, 0.8);
carbine(cx - 2.6, by - 13.4 + gt.sw * 0.5, cx - 8.0, by - 24.8 + gt.sw * 0.5, 1.8);
face(by - 20.1);
// THE CAP, not a helmet. §2.2: "cap silhouette flat, not domed" — a
// Conscript and a GI are the same 13x27 blob and RA2 separates them on
// exactly two things, the leg hue and the headgear. So the GI keeps the
// pot dome and the Conscript gets a low FLAT crown with a forward peak,
// in near-black: different shape AND different value, at the one place
// on a 20px figure a player actually looks.
var CCAP = ACC, chy2 = by - 22.4;
var ccx = cx + sd * 1.1 / TURN + HEADX, ccw = 2.25 * (1 - 0.16 * sd);
g.fillStyle = CCAP;
g.beginPath(); g.roundRect(ccx - ccw, chy2 - 2.6, ccw * 2, 3.9, 1.9); g.fill();
outline(g, shade(CCAP, 0.44));
g.fillStyle = shade(CCAP, 0.52);                              // forward peak
g.beginPath();
g.moveTo(ccx - ccw, chy2 + 1.0); g.lineTo(ccx + ccw, chy2 + 1.0);
g.lineTo(ccx + ccw * 0.8, chy2 + 1.5); g.lineTo(ccx - ccw * 0.8, chy2 + 1.5);
g.closePath(); g.fill(); outline(g, shade(CCAP, 0.32));
g.fillStyle = shade(CCAP, 1.55);                              // lit flat crown
g.fillRect(ccx - ccw + 0.4, chy2 - 2.2, ccw * 0.9, 1.1);
g.restore();
}

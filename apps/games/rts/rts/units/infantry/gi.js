// Iron Frontier — infantry/gi: the art for one unit.
// Called by bakeInfantry() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.




function drawGi(C) {
  var T = C.T, arms = C.arms, by = C.by, carbine = C.carbine, col = C.col, cx = C.cx, face = C.face,
      g = C.g, gt = C.gt, helmet = C.helmet, legs = C.legs;

// GI ([E1]). The RA2 layout, and it is the OPPOSITE of what this branch
// used to draw: a GREY POT HELMET over a house-colour TORSO BLOCK over
// OLIVE legs (unit-identity-reference.md §1.5). The old pass had the
// colour on the helmet and a 4px chest sliver — 12-19% of the figure,
// which is the STRUCTURE budget applied to a man, and it left seven
// silhouette-identical soldiers with nothing to tell them apart
// (unit-redesign-plan.md §1). The torso is one block from the collar to
// the belt, the helmet is a distinct VALUE from both torso and legs,
// and the legs read olive — the only thing separating him from a
// Conscript, so nothing is allowed to sit on them.
legs(2.5, by - 12.0, 3.4, T.coat, 3.9);

g.save(); g.translate(gt.lean, gt.bob);
g.fillStyle = shade(T.coat, 1.06);                            // olive tunic (whole torso)
g.beginPath();
g.moveTo(cx - 5.1, by - 18.6); g.lineTo(cx + 5.1, by - 18.6);
g.lineTo(cx + 4.6, by - 10.0); g.lineTo(cx - 4.6, by - 10.0);
g.closePath(); g.fill(); outline(g, shade(T.coat, 0.5));
g.fillStyle = '#c9a94a';                                      // ammo pouch
g.beginPath(); g.roundRect(cx - 1.5, by - 11.8, 3.0, 2.0, 0.6); g.fill();

// THE BLOCK: collar to belt, full shoulder width, unbroken. Only two
// folds and a belt shadow cut it, and they stay inside 0.70..1.24 —
// above about f=1.3 the blue #4aa3db clips to white-cyan and stops
// reading as the owner's colour at all.
g.fillStyle = col;
g.beginPath();
g.moveTo(cx - 5.8, by - 20.0); g.lineTo(cx + 5.8, by - 20.0);
g.lineTo(cx + 5.2, by - 10.6); g.lineTo(cx - 5.2, by - 10.6);
g.closePath(); g.fill(); outline(g, shade(col, 0.40));
g.fillStyle = shade(col, 1.22);                               // lit left panel
g.fillRect(cx - 5.3, by - 19.5, 3.5, 7.9);
g.fillStyle = shade(col, 0.76);                               // shaded right fold
g.fillRect(cx + 2.0, by - 19.1, 2.8, 7.3);
g.fillStyle = shade(col, 0.62);                               // collar shadow
g.fillRect(cx - 5.6, by - 19.6, 11.2, 0.9);
g.fillStyle = shade(T.coat, 0.62);                            // webbing belt, under the block
g.fillRect(cx - 4.9, by - 12.7, 9.8, 1.15);
// The scarf is a COLLAR, not a bib, and that is what §2.1's "torso block
// >= 7w x 6h" needed. Drawn at by-20.1 x 1.2 it sat INSIDE the block's
// top rows and split them: the largest solid owner rectangle on the
// sprite was 8x5, one row short, because rows 8-10 of the bake were
// khaki down the middle. Raised and thinned it clears the block, which
// now measures 8x6. The block's own comment two lines up already said
// "collar to belt, full shoulder width, unbroken".
g.fillStyle = '#b09632';                                      // khaki collar scarf
g.beginPath(); g.roundRect(cx - 2.9, by - 20.7, 5.8, 0.95, 0.5); g.fill();

// The block spills over the SHOULDERS, as it does on the E1 sprite: the
// upper sleeve is remapped and the forearm is not, which is what takes
// a GI from a 19% figure to RA2's 30-45% band without painting a man
// who then reads as a plastic figure. The elbow line is the edge.
arms(5.5, by - 17.4, 2.9, 6.3, col);                          // house sleeves to the cuff
g.fillStyle = shade(T.coat, 1.02);                            // olive forearms crossing in
g.beginPath(); g.roundRect(cx - 4.5, by - 12.4, 3.4, 2.1, 1.0); g.fill();
g.beginPath(); g.roundRect(cx + 1.4, by - 14.0, 3.0, 2.0, 1.0); g.fill();
outline(g, shade(T.coat, 0.5));
carbine(cx - 5.2, by - 11.0 + gt.sw * 0.4, cx + 7.2, by - 15.6 - gt.sw * 0.4, 1.9);
face(by - 21.7);
helmet(by - 23.5, 3.15, ACCENT.rifle, 0.95, 0.72);               // grey pot, NOT house colour
g.restore();
}

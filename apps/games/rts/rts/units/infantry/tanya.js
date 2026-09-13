// Iron Frontier — infantry/tanya: the art for one unit.
// Called by bakeInfantry() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.




function drawTanya(C) {
  var ACC = C.ACC, T = C.T, arms = C.arms, by = C.by, col = C.col, cx = C.cx, face = C.face, g = C.g, gt = C.gt,
      legs = C.legs;

// TANYA, read off Tanya_animation.gif: shoulder-length BLACK hair on a
// bare head — the only unhelmeted figure on the field — bare arms, a
// house-colour top across the chest, olive combat trousers with pale
// thigh pouches, and a pistol in each hand held low. Twin pistols plus
// the bare dark head is the whole read at 1:1: hers is the only
// infantry silhouette with no helmet dome and nothing slung over a
// shoulder to break the outline.
legs(2.4, by - 11.8, 3.1, T.coat, 3.6);

g.save(); g.translate(gt.lean, gt.bob);
g.fillStyle = T.skin;                                         // bare shoulders + midriff
g.beginPath();
g.moveTo(cx - 4.4, by - 19.4); g.lineTo(cx + 4.4, by - 19.4);
g.lineTo(cx + 3.9, by - 11.0); g.lineTo(cx - 3.9, by - 11.0);
g.closePath(); g.fill(); outline(g, '#9a6f47');
g.fillStyle = shade(T.coat, 1.06);                            // trouser waistband
g.fillRect(cx - 4.1, by - 12.8, 8.2, 2.2);
g.fillStyle = '#2a2c32';                                      // belt
g.fillRect(cx - 4.2, by - 13.4, 8.4, 1.2);
g.fillStyle = '#c9a94a';
g.fillRect(cx - 0.8, by - 13.3, 1.7, 1.1);
for (var tp = -1; tp <= 1; tp += 2) {                         // pale thigh pouches
  g.fillStyle = '#9aa07a';
  g.beginPath(); g.roundRect(cx + tp * 3.1 - 1.4, by - 12.4, 2.8, 3.4, 0.9); g.fill();
  outline(g, '#4d5236');
  g.fillStyle = '#bcc19c';
  g.fillRect(cx + tp * 3.1 - 1.1, by - 12.2, 2.2, 0.9);
}

// TANYA IS THE EXCEPTION, and she is the exception ON PURPOSE. RA2 puts
// 29-45% house colour on an infantryman; Tanya carries **14.3%**, the
// lowest in the game (unit-identity-reference.md §1.4), because her
// read is SKIN — bare arms and a bare midriff under a short top — and
// paint over that would delete the one figure on the field who is not
// in uniform. So while every other soldier's block grew in this pass,
// hers was CUT back to a crop top and the midriff went bare.
g.fillStyle = col;
g.beginPath();
g.moveTo(cx - 5.0, by - 20.8); g.lineTo(cx + 5.0, by - 20.8);
g.lineTo(cx + 4.3, by - 16.3); g.lineTo(cx - 4.3, by - 16.3);
g.closePath(); g.fill(); outline(g, shade(col, 0.40));
g.fillStyle = shade(col, 1.22);                               // lit left panel
g.fillRect(cx - 4.8, by - 20.6, 3.4, 3.9);
g.fillStyle = shade(col, 0.76);                               // shaded right fold
g.fillRect(cx + 1.9, by - 20.2, 2.5, 3.4);
g.fillStyle = shade(col, 0.66);                               // collar shadow
g.fillRect(cx - 4.9, by - 20.7, 9.8, 0.8);
g.strokeStyle = '#2f3138'; g.lineWidth = 1.0; g.lineCap = 'butt';
g.beginPath();                                                // thin holster sling
g.moveTo(cx - 2.4, by - 20.6); g.lineTo(cx + 1.4, by - 15.4); g.stroke();

arms(5.1, by - 18.8, 2.2, 6.2, T.skin, function (i, x, y) {
  g.fillStyle = '#3a3d45';                                    // fingerless glove
  g.beginPath(); g.roundRect(x - 1.2, y + 5.5, 2.4, 2.0, 0.7); g.fill();
  // The pistol hangs MUZZLE-DOWN at her side, canted out from the
  // thigh. Held level it merged with the other hand into one dark bar
  // straight across the hips and read as a belt, not as two guns.
  // ...and canted OUT far enough to clear the hip: §2.1 wants each
  // pistol breaking the outline by >=2 px, and at i*1.3 they were
  // inside the arm's own silhouette and contributed nothing.
  var gxp = x + i * 1.1, gyp = y + 7.2;
  g.strokeStyle = '#1b1d22'; g.lineWidth = 1.8; g.lineCap = 'butt';
  g.beginPath();
  g.moveTo(gxp, gyp); g.lineTo(gxp + i * 2.4, gyp + 4.0); g.stroke();
  g.fillStyle = '#2b2e35';                                    // grip, canted back
  g.beginPath();
  g.moveTo(gxp - i * 1.3, gyp - 0.4); g.lineTo(gxp + i * 0.5, gyp - 0.4);
  g.lineTo(gxp + i * 0.9, gyp + 1.6); g.lineTo(gxp - i * 0.7, gyp + 1.6);
  g.closePath(); g.fill();
  g.fillStyle = '#a7afba';                                    // slide glint
  g.fillRect(gxp + i * 1.0 - 0.5, gyp + 1.0, 1.0, 2.6);
});

face(by - 22.0);
// THE HAIR STAYS A CAP, and that is a measured decision, not an
// oversight. Correcting her width (22x31 -> 18x31, against RA2's 13x26)
// leaves a narrow standing figure bracketed by two more of them — Crazy
// Ivan at 17x32 and the Spy at 16x35 — so the obvious move was to spend
// the one thing RA2 gives her and nobody else, a head of hair, as mask
// in the head rows. Run: taking the crown to 3.5 and the locks to the
// shoulder moved `tanya|ivan` the WRONG WAY, 0.773 -> 0.811, because
// Ivan's own head is a broad soft cap and a fuller head of hair walks
// her INTO it rather than out. Her narrower head is already carrying
// 0.04 of that separation. Reverted; do not reach for it again.
g.fillStyle = ACC;                                   // black hair, shoulder length
g.beginPath(); g.arc(cx, by - 23.1, 3.0, Math.PI, 0); g.fill();
g.fillRect(cx - 3.0, by - 23.3, 6.0, 1.2);
for (var hl = -1; hl <= 1; hl += 2) {                         // side locks to the collar
  g.beginPath();
  g.moveTo(cx + hl * 2.9, by - 23.4); g.lineTo(cx + hl * 3.2, by - 19.8);
  g.lineTo(cx + hl * 2.0, by - 20.1); g.lineTo(cx + hl * 2.15, by - 23.1);
  g.closePath(); g.fill();
}
outline(g, '#140d09');
g.fillStyle = shade(ACC, 1.95);                      // crown highlight
g.beginPath();
g.ellipse(cx - 1.05, by - 24.0, 1.45, 0.75, -0.35, 0, 6.29); g.fill();
g.restore();
}

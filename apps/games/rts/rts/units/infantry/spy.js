// Iron Frontier — infantry/spy: the art for one unit.
// Called by bakeInfantry() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.




function drawSpy(C) {
  var ACC = C.ACC, FA = C.FA, HEADX = C.HEADX, T = C.T, TURN = C.TURN, arms = C.arms, by = C.by, col = C.col,
      cx = C.cx, face = C.face, g = C.g, gt = C.gt, sd = C.sd;

// SPY ([SPY]), read off docs/ra2-ref/ra2-spy-RA2_Spy_Manual_Render: a
// man in a long OVERCOAT — the only civilian silhouette in the army.
// Bare dark head under a fedora, pale shirt strip and a dark tie down
// the coat's opening, black dress shoes, and he walks with a slight
// crouch, hands out at his sides. No helmet, no webbing, no weapon:
// the whole read is "that man is not dressed like the others".
//
// THE COAT IS THE HOUSE ZONE. §1.5's table gives the Spy
// `fedora / long coat / coat hem, no split legs / briefcase`, and the
// middle column of that table is headed "mid zone (HOUSE)" — RA2 remaps
// the coat, exactly as it remaps a GI's torso. He was drawn in a fixed
// charcoal suit with a house-colour TIE, which is a 2 px stripe, and he
// came in at **6.5% owner colour** — the lowest uniformed figure in the
// game and the only entry left in `hue.infantryBelowBudget`. The coat
// body is house colour now, over the same unbroken charcoal hem, with
// charcoal lapels, hat and shoes: three zones, the GI's own layout worn
// by a man in a hat. The tie went dark for the same reason a red star
// came off the Collective engineer's hat — a saturated note that used
// to be the owner's colour has to stop being it once the coat is.
// NO LEG SPLIT, and a HAT. §2.1 gives him "hat brim >= 7 px wide,
// >= 1.5x the head; coat hem one unbroken block >= 8 px wide, no
// vertical gap" — and he had neither: split trousers and a bare head,
// which is why his closest silhouette match on the field was TANYA at
// 0.875. Rule 9's second and third levers, both of them, on the one
// figure in the roster that is supposed to be a civilian.
// The hem TAPERS. Yuri's coat is the other unbroken hem in the roster
// and the two collapsed onto each other the moment the Spy lost his leg
// split (0.85 pairwise) — so the two coats have to be different COATS:
// a business suit is a straight, narrow, slightly tapered line, and
// Yuri's is a flared robe a third wider at the ankle.
// THE HEM IS THE SAME COAT, so it is the same zone. It was drawn in the
// drab instead, which left the house block stopping at the hip and a
// second garment continuing to the ankle — and it put the whole of his
// owner budget in the one band the sidebar looks hardest at. MEASURED
// (hem painted magenta, cameo re-baked and looked at): `cameoFor` crops
// an infantry plate to the TOP 72% of the bbox, so the hem is about a
// tenth of a plate row. Owner colour here is carried in full by the
// sprite, where §1.4's remap floor is measured and where a player tells
// friend from foe, and costs the build icon nothing.
// THE FEDORA IS DARK FELT and the coat is light camel, and that split
// is the whole read: every other pale infantryman on this board — the
// Engineer, the Chrono Legionnaire, the Rocketeer — wears a LIGHT head
// over a light body. A dark head over a light body belongs to nobody
// else, and it is what a hat is.
var SPY_FELT = '#37302a';
var shem = gt.swf * 0.6;                                       // the coat sways; no stride
g.fillStyle = shade(col, 0.88);
g.beginPath();
g.moveTo(cx - 4.0, by - 13.0); g.lineTo(cx + 4.0, by - 13.0);
g.lineTo(cx + 3.0 + shem, by - 1.4); g.lineTo(cx - 3.0 + shem, by - 1.4);
g.closePath(); g.fill(); outline(g, shade(col, 0.40));
g.fillStyle = shade(col, 1.16);                                // lit front of the hem
g.beginPath();
g.moveTo(cx - 3.7, by - 12.8); g.lineTo(cx - 1.1, by - 12.8);
g.lineTo(cx - 1.3 + shem, by - 1.6); g.lineTo(cx - 2.8 + shem, by - 1.6);
g.closePath(); g.fill();
g.fillStyle = shade(T.coat, 0.86);                             // ...and one felt vent at the
g.fillRect(cx - 0.6 + shem * 0.5, by - 9.0, 1.2, 7.4);         // back seam, so the skirt is
                                                               // still tailoring and not a tube
for (var ssh = -1; ssh <= 1; ssh += 2) {                       // dress shoes at the hem
  g.fillStyle = T.boot;
  g.beginPath();
  g.roundRect(cx + ssh * 1.5 - 1.4 + shem, by - 2.3, 2.8, 2.3, 0.8); g.fill();
}

g.save(); g.translate(gt.lean, gt.bob);
// The overcoat's SHOULDER LINE is padded and square — 1940s tailoring,
// and it is also what lets the fedora measure (see the hat below): the
// gate's body cut is 55% of the widest row, and until the shoulders
// beat the contact shadow the widest row was the shadow, which put the
// cut so low that a 7 px hat crown counted as body instead of spike.
g.fillStyle = col;                                             // the coat, skirted past the hip
g.beginPath();
g.moveTo(cx - 4.4, by - 19.9); g.lineTo(cx + 4.4, by - 19.9);
g.lineTo(cx + 3.8, by - 14.5); g.lineTo(cx - 3.8, by - 14.5);
g.closePath(); g.fill(); outline(g, shade(col, 0.40));
g.fillStyle = shade(col, 1.22);                                // lit shoulder fall (folds stay
g.beginPath();                                                 // inside 0.70..1.24: above ~1.3
g.moveTo(cx - 5.7, by - 20.2); g.lineTo(cx - 3.6, by - 20.2);  // #4aa3db clips to white-cyan)
g.lineTo(cx - 3.4, by - 10.0); g.lineTo(cx - 3.8, by - 10.0);
g.closePath(); g.fill();
g.fillStyle = shade(col, 0.76);                                // shaded right panel
g.fillRect(cx + 3.6, by - 19.8, 1.6, 9.6);
// THE OVERCOAT IS WORN OPEN, and its LAPELS are the large area §2.1
// actually names. "Fedora + long coat — a CIVILIAN silhouette" was
// being carried by a 4-unit shirt strip with a 2-unit tie down the
// middle of it, i.e. by about one visible pixel of white each side: the
// rest of the plate was an unbroken owner-blue slab, the same slab the
// G.I. wears, which is what made `GI | Spy` the worst pair in the
// Directorate sidebar at 55.4 against RA2's own closest-ever 58.5.
//
// A 1940s overcoat's front is two broad peaked lapels falling from the
// shoulder points to the waist, faced in the coat's own felt, with the
// shirt and tie in the V between them. Drawn at that size it is the
// whole visible chest — which is the point: the identity has to live in
// the LARGE areas, and this is the only large area he has that is not
// the house block. The house colour is untouched in AREA; it moves to
// the shoulders, the sleeves, the skirt and the hem, which is where an
// overcoat's cloth actually shows.
// The lapels reach the SHOULDER SEAMS. What was left of the pair after
// the hat, the camel and the case was the outline itself: two figures
// whose torsos carry house colour at the same width in the same place,
// which measures as one shape. Everything inboard of the sleeve is the
// coat turned back, so the house colour survives exactly where a coat
// shows it — the sleeves, the shoulder falls and the skirt.
g.fillStyle = shade(T.coat, 1.02);                             // near lapel, faced in camel
g.beginPath();
g.moveTo(cx - 5.9, by - 20.5); g.lineTo(cx - 0.8, by - 20.5);
g.lineTo(cx - 0.5, by - 11.8); g.lineTo(cx - 3.9, by - 11.8);
g.closePath(); g.fill(); outline(g, shade(T.coat, 0.46));
g.fillStyle = shade(T.coat, 0.84);                             // far lapel, one step back
g.beginPath();
g.moveTo(cx + 5.9, by - 20.5); g.lineTo(cx + 0.8, by - 20.5);
g.lineTo(cx + 0.5, by - 11.8); g.lineTo(cx + 3.9, by - 11.8);
g.closePath(); g.fill(); outline(g, shade(T.coat, 0.42));
g.fillStyle = shade(T.coat, 1.22);                             // the lapel ROLL — the fold
g.beginPath();                                                 // catches the light, and it is
g.moveTo(cx - 5.7, by - 20.4); g.lineTo(cx - 4.4, by - 20.4);  // what makes cloth read as cloth
g.lineTo(cx - 2.6, by - 12.0); g.lineTo(cx - 3.7, by - 12.0);
g.closePath(); g.fill();
// THE STORM FLAP, which is the one detail that says trench coat rather
// than dressing gown: a second layer of the same cloth buttoned over
// the right shoulder, its bottom edge a hard diagonal across the chest.
g.fillStyle = shade(T.coat, 0.94);
g.beginPath();
g.moveTo(cx + 0.5, by - 20.6); g.lineTo(cx + 6.0, by - 20.6);
g.lineTo(cx + 5.1, by - 14.0); g.lineTo(cx + 0.5, by - 15.6);
g.closePath(); g.fill(); outline(g, shade(T.coat, 0.46));
g.fillStyle = shade(T.coat, 1.14);                             // its lit top edge
g.fillRect(cx + 0.8, by - 20.5, 4.6, 0.9);
g.fillStyle = ACC;                                      // shirt front in the V
g.beginPath();
g.moveTo(cx - 1.4, by - 20.7); g.lineTo(cx + 1.4, by - 20.7);
g.lineTo(cx + 0.9, by - 13.4); g.lineTo(cx - 0.9, by - 13.4);
g.closePath(); g.fill(); outline(g, '#8d8a7e');
g.fillStyle = '#f4f1e8';                                       // lit collar wings
g.fillRect(cx - 2.4, by - 20.9, 4.8, 1.0);
g.fillStyle = '#22252c';                                       // dark tie
g.beginPath();
g.moveTo(cx - 0.7, by - 19.6); g.lineTo(cx + 0.7, by - 19.6);
g.lineTo(cx + 0.45, by - 14.8); g.lineTo(cx - 0.45, by - 14.8);
g.closePath(); g.fill(); outline(g, '#0e1014');
g.fillStyle = shade(T.coat, 0.66);                             // the coat's own collar,
g.fillRect(cx - 4.4, by - 21.1, 8.8, 1.3);                     // standing at the neck
g.fillStyle = shade(T.coat, 1.10);
g.fillRect(cx - 4.2, by - 21.0, 8.4, 0.5);
// ...and the BELT. A trench coat is belted, and the buckle is the one
// hard note on a soft garment.
g.fillStyle = shade(T.coat, 0.60);
g.fillRect(cx - 4.6, by - 12.4, 9.2, 1.5);
g.fillStyle = shade(T.coat, 1.16);
g.fillRect(cx - 4.4, by - 12.3, 8.8, 0.5);
g.fillStyle = '#8c7a4c';
g.fillRect(cx - 0.9, by - 12.6, 1.8, 1.9);

arms(6.2, by - 19.4, 2.6, 6.0, shade(T.coat, 1.06), function (i, x, y) {
  g.fillStyle = T.skin;                                        // bare hand, held out
  g.beginPath(); g.ellipse(x + i * 0.4, y + 6.4, 1.15, 1.3, 0, 0, 6.29); g.fill();
  outline(g, '#a5806a');
  g.fillStyle = shade(col, 0.80);                              // coat cuff, then a shirt
  g.fillRect(x - 1.4, y + 4.4, 2.8, 1.4);                      // cuff showing under it
  g.fillStyle = '#dfe3ea';
  g.fillRect(x - 1.0, y + 5.5, 2.0, 0.7);
  if (i > 0) {
    // THE BRIEFCASE (§1.5's prop for him). A flat tan case hanging off
    // the far hand, clear of the coat — the one thing on the field a
    // soldier would never be carrying, and it breaks the outline on the
    // side the hem does not.
    // Carried UP at the hip, and big. The sidebar crops him to a
    // portrait, so a case hanging at knee height is simply not in the
    // picture a player picks him out of — and this is §1.5's prop for
    // him, the one object on the field a soldier would never have.
    var bcx2 = x + 2.3, bcy = y + 5.6;
    g.strokeStyle = '#2a2d33'; g.lineWidth = 0.9; g.lineCap = 'round';
    g.beginPath(); g.arc(bcx2 - 0.4, bcy - 0.6, 1.4, Math.PI, 0.1); g.stroke();
    g.fillStyle = '#8d6a3e';
    g.beginPath(); g.roundRect(bcx2 - 3.1, bcy, 6.2, 4.6, 0.6); g.fill();
    outline(g, '#4a3617');
    g.fillStyle = '#ad8a55';                                    // lit lid
    g.fillRect(bcx2 - 2.9, bcy + 0.3, 5.8, 1.2);
    g.fillStyle = '#6b4e28';                                    // the seam round the shell
    g.fillRect(bcx2 - 2.9, bcy + 2.2, 5.8, 0.6);
    g.fillStyle = '#c9b06a';                                    // brass catch
    g.fillRect(bcx2 - 0.7, bcy + 1.8, 1.4, 1.4);
  }
});

face(by - 22.2);
// A BRIM SHADES A FACE. Every other man on this board shows the same
// lit tan patch in the same place under the same helmet line; the one
// in a hat should not, and the shadow is the reason to draw a brim at
// all. It also takes the last bright note out of the band where
// `GI | Spy` measures closest.
if (!FA.back) {
  g.fillStyle = 'rgba(28,22,16,.55)';
  g.beginPath();
  g.roundRect(cx + sd * 1.1 / TURN + HEADX - 2.5 * (1 - 0.16 * sd), by - 23.0,
              5.0 * (1 - 0.16 * sd), 2.4, 0.8); g.fill();
}
// THE FEDORA, redrawn to real hat proportions — and that is what makes
// it measure. `spikeOf('v')` calls a row BODY once it reaches 55% of the
// sprite's widest row and scores the SPIKE as the median width of what
// stands above that line. The brim is wide, so the brim is body; the run
// above it is the CROWN alone. At 5.8 units the crown was 5.6 screen px
// against a 7 px budget — and C2 read that as "reaching 7 needs a crown
// wide enough to be a bowler". It does not: a real fedora's crown is
// 0.60-0.70 of its brim (the brim is a 1-1.5 px lip round it), and 5.8
// over a 9.8 brim was 0.59 — a TOP HAT's proportion, a narrow tube on a
// wide plate. Crown 7.4 under a 12.0 brim is 0.62, which is a fedora,
// and it clears 7 px on screen.
//
// The other half of the sum is the CUT — 55% of the widest row — and the
// widest row on an infantryman is the CONTACT SHADOW (an rx-6.0 blob,
// ~12 px), not his shoulders. That put the cut at 6.6, so a 7 px crown
// would have counted as BODY and taken the spike to zero. Two changes
// pay for it: the overcoat's padded 1940s shoulder now beats the shadow,
// and the hat is drawn at its TRUE screen width.
//
// A HAT DOES NOT TURN WITH THE MAN. The body is under a `scale(TURN, 1)`
// that projects the shoulder line onto the body's depth as the figure
// turns away — but a brim and a crown are round in PLAN, so they present
// the same width from every compass bearing; only the head under them
// rotates. Drawn inside the squeeze, the fedora lost a quarter of itself
// at the three-quarter facings and the gate scored it there, at 5 px.
// The x terms divide by TURN for exactly the reason `carbine` and `wpn`
// do, and the sd foreshortening is gone with them.
var shx = cx + sd * 1.1 / TURN + HEADX;
var sbw = 5.8 / TURN;                                          // half-brim: 11.6 units across,
                                                               // 2.4x the head — §2.1 wants
                                                               // >=7 px of brim and >=1.5x
var scw = 3.8 / TURN;                                          // half-crown: 7.6 units, 0.66 of
                                                               // the brim — a fedora's own
                                                               // proportion, and >=7 px on screen
g.fillStyle = '#2f2620';                                       // short dark hair under it
g.beginPath(); g.ellipse(shx, by - 22.9, 2.5 * (1 - 0.16 * sd), 2.1, 0, Math.PI, 0); g.fill();
g.fillStyle = shade(SPY_FELT, 1.00);                           // crown — LOW and soft, so what
g.beginPath();                                                 // stands above the brim is
g.roundRect(shx - scw, by - 25.6, scw * 2, 3.1, 0.9); g.fill();// crown-width, not a tube
outline(g, shade(SPY_FELT, 0.55));
g.fillStyle = shade(SPY_FELT, 0.68);                           // the pinch crease, two dents in
g.fillRect(shx - scw * 0.80, by - 25.6, 0.9 / TURN, 1.6);      // the front of the crown: a
g.fillRect(shx + scw * 0.42, by - 25.6, 0.9 / TURN, 1.6);      // fedora, not a bowler
g.fillStyle = '#1c1e24';                                       // dark grosgrain hat band
g.fillRect(shx - scw, by - 23.5, scw * 2, 1.1);
g.fillStyle = shade(SPY_FELT, 1.18);                           // the brim, proud of the crown
g.beginPath(); g.ellipse(shx, by - 22.4, sbw, 1.35, 0, 0, 6.29); g.fill();
outline(g, shade(SPY_FELT, 0.55));
g.fillStyle = shade(SPY_FELT, 1.55);                           // lit crease along the crown
g.fillRect(shx - scw * 0.52, by - 25.2, 1.5 / TURN, 2.0);
g.restore();
}

// Iron Frontier — infantry/teslatrooper: the art for one unit.
// Called by bakeInfantry() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.




function drawTeslatrooper(C) {
  var ACC = C.ACC, FA = C.FA, T = C.T, TURN = C.TURN, arms = C.arms, by = C.by, col = C.col, cx = C.cx, g = C.g,
      gt = C.gt, legs = C.legs, sd = C.sd, state = C.state;

// TESLA TROOPER, read off soviet-tesla-trooper-frames: not a man in a
// uniform but a man inside a SUIT. Everything is one size class up —
// a SILVER carapace with rounded shoulder caps over a house-colour
// breastplate, a bare STEEL bowl helmet with no face under it, and steel
// greaves on the shins. The one asymmetry is the tesla gauntlet: a
// chunky steel glove with two prongs and a small spark arcing between
// them, carried on the leading hand.
//
// Bulk is drawn into the SILHOUETTE, not into the height: he is the
// same 20-odd px tall as the Conscript beside him but nearly half
// again as wide, which is what stops "armoured" reading as "giant".
for (var ti = -1; ti <= 1; ti += 2) {
  var tgait = gt.sw ? (ti === gt.sw ? 1.04 : 0.35) : 1;
  var th = cx + ti * 2.4 / TURN;
  var tk = cx + (ti * 3.1 * tgait + gt.swf * 0.3) / TURN;
  var tf = cx + (ti * 4.0 * tgait + gt.swf * 0.55) / TURN;
  g.fillStyle = '#424242';
  g.beginPath();
  g.moveTo(th - 2.35, by - 12.2); g.lineTo(th + 2.35, by - 12.2);
  g.lineTo(tk + 2.2, by - 6.3); g.lineTo(tk - 2.2, by - 6.3);
  g.closePath(); g.fill();
  g.fillStyle = '#c2c2c2';                            // steel knee socket
  g.beginPath(); g.roundRect(tk - 2.35, by - 7.1, 4.7, 2.7, 0.65); g.fill();
  g.fillStyle = '#363636';
  g.beginPath();
  g.moveTo(tk - 2.0, by - 5.5); g.lineTo(tk + 2.0, by - 5.5);
  g.lineTo(tf + 1.75, by - 2.0); g.lineTo(tf - 1.75, by - 2.0);
  g.closePath(); g.fill();
  g.fillStyle = '#c0c0c0';                            // shin greave seated on the leg
  g.beginPath();
  g.moveTo(tk - 2.3, by - 6.9); g.lineTo(tk + 2.3, by - 6.9);
  g.lineTo(tf + 2.1, by - 2.0); g.lineTo(tf - 2.1, by - 2.0);
  g.closePath(); g.fill();
  g.fillStyle = '#202020';
  g.beginPath(); g.roundRect(tf - 2.45, by - 2.7, 4.9, 2.7, 0.75); g.fill();
}

g.save(); g.translate(gt.lean, gt.bob);
// The chest is the broad owner-colour breastplate visible in the RA2
// reference. Steel stays on the outer shell, helmet and powered arms.
var TT_SHELL = '#d7d7d7';                                     // v 0.89 s 0.08
var TT_LIT = '#eaeaea';                                       // v 0.95 s 0.06
var TT_DK = '#c2c2c2';                                        // v 0.81 s 0.10 — still silver
var TT_EDGE = '#9f9f9f';
g.fillStyle = shade(col, 0.65);                               // equipment belt
g.beginPath(); g.roundRect(cx - 4.2, by - 13.9, 8.4, 3.4, 1.0); g.fill();
outline(g, '#42231f');
g.fillStyle = shade(col, 0.9);
g.fillRect(cx - 3.9, by - 13.7, 7.8, 0.9);

// The barrel chest. Two clipped corners top and bottom turn the slab
// into a rounded carapace — squared off it read as a sandwich board.
g.fillStyle = TT_SHELL;
g.beginPath();
g.moveTo(cx - 5.7, by - 21.6); g.lineTo(cx + 5.7, by - 21.6);
g.lineTo(cx + 7.4, by - 19.4); g.lineTo(cx + 6.8, by - 15.0);
g.lineTo(cx + 4.6, by - 13.6); g.lineTo(cx - 4.6, by - 13.6);
g.lineTo(cx - 6.8, by - 15.0); g.lineTo(cx - 7.4, by - 19.4);
g.closePath(); g.fill(); outline(g, TT_EDGE);

// Broad breastplate, framed by the silver shell rather than buried
// beneath it. Its top edge remains visible between the shoulder caps.
g.fillStyle = col;
g.beginPath();
g.moveTo(cx - 4.2, by - 20.0);
g.quadraticCurveTo(cx, by - 21.1, cx + 4.2, by - 20.0);
g.quadraticCurveTo(cx + 5.6, by - 17.8, cx + 4.4, by - 15.0);
g.quadraticCurveTo(cx + 2.8, by - 13.5, cx, by - 13.8);
g.quadraticCurveTo(cx - 3.8, by - 13.5, cx - 4.6, by - 15.7);
g.quadraticCurveTo(cx - 5.4, by - 18.1, cx - 4.2, by - 20.0);
g.closePath(); g.fill(); outline(g, '#713c38');
g.fillStyle = 'rgba(255,255,255,.22)';
g.beginPath();
g.moveTo(cx - 3.8, by - 19.2);
g.quadraticCurveTo(cx - 4.4, by - 16.4, cx - 2.7, by - 14.8);
g.lineTo(cx - 1.8, by - 15.0);
g.quadraticCurveTo(cx - 3.2, by - 17.0, cx - 2.8, by - 19.5);
g.closePath(); g.fill();

// The yoke's own modelling, kept INSIDE cx±4.8 — outside that the arms
// and the pauldron caps cover it, so a facet drawn there is invisible
// (this is the same measurement that killed the vertical plastron).
//
// It also has to survive ANTI-ALIASING, which at this size is most of
// the problem: the visible torso is ~9 px across, and a 2 px facet with
// a near-black line beside it comes out of the bake as a blend that
// measures BELOW v 0.70 however silver it looked in the source. So the
// facets are wide, every outline on the carapace and the arm plates is
// a MID grey rather than a dark one (that one change moved the chest
// 38.9% -> 45.6% silver on its own), and nothing dark is drawn inside
// the yoke: the neck shadow is a dim silver, and the joint down to the
// breastplate is the breastplate's own outline, not a stroke of its own.
g.fillStyle = TT_LIT;                                         // left shoulder frame
g.fillRect(cx - 6.3, by - 21.2, 2.0, 4.5);
g.fillStyle = TT_DK;                                          // right shoulder frame
g.fillRect(cx + 4.3, by - 20.9, 2.0, 4.3);
g.fillStyle = '#b6b6b6';                                      // neck shadow under the bowl
g.fillRect(cx - 3.6, by - 21.3, 7.2, 0.5);
g.strokeStyle = '#f1f1f1'; g.lineWidth = 1.0;                 // rim light round the shell
g.beginPath();
g.moveTo(cx - 4.6, by - 21.1); g.lineTo(cx - 6.6, by - 19.2);
g.lineTo(cx - 6.4, by - 15.2); g.stroke();
g.fillStyle = TT_DK;                                          // waist ring of the suit
g.fillRect(cx - 5.4, by - 14.0, 10.8, 0.6);
g.strokeStyle = '#666666'; g.lineWidth = 0.7;                 // shadow under the chest
g.beginPath();
g.moveTo(cx - 4.4, by - 13.9); g.lineTo(cx + 4.4, by - 13.9); g.stroke();

// Steel arms. The pauldrons are STEEL, not colour: the chest is
// already the biggest remapped mass on any figure in the game, and
// colouring the shoulders too took him past a third of the sprite.
// ELECTRICITY, DRAWN AS ELECTRICITY. Put RA2's Tesla Trooper plate next
// to ours and the gap is not subtle: RA2's is blue-white ARCS over a red
// ground, and ours had a blue-suited man with a helmet, shoulder pads
// and no electricity anywhere — the one small spark it did carry lived
// on the gauntlet, low on the figure, where the sidebar's portrait crop
// (top 72%) throws it away. A bolt is three passes over the same jagged
// path: a wide soft halo, a mid stroke, and a hot white core. One pass
// is a blue scribble; three read as a discharge at 1:1.
function bolt(pts, k) {
  var pass = [[2.2 * k, 'rgba(120,190,252,.32)'], [1.35 * k, '#2b96e0'], [0.75 * k, '#ffffff']];
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (var bp = 0; bp < 3; bp++) {
    g.lineWidth = pass[bp][0]; g.strokeStyle = pass[bp][1];
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (var bi = 1; bi < pts.length; bi++) g.lineTo(pts[bi][0], pts[bi][1]);
    g.stroke();
  }
}
var TT_STUD = [];                                             // the coil terminals, for the arc
arms(6.2, by - 19.6, 3.0, 6.8, '#929292', function (i, x, y) {
  // The cap is an ELLIPSE that hugs the shoulder, not a slab beside
  // it: as a rounded rectangle it stood clear of the torso on both
  // sides and the trooper walked around carrying two suitcases.
  g.fillStyle = ACC;
  g.beginPath();
  g.ellipse(x - i * 0.5, y + 0.3, 2.0, 1.8, 0, Math.PI, 0); g.fill();
  g.fillRect(x - i * 0.5 - 2.0, y + 0.3, 4.0, 1.3);
  outline(g, '#9f9f9f');
  // The cap's SKIRT is steel too. It carried a house band for a while,
  // to pay back what the tesla arc cost the chest; with the carapace
  // itself silver that band became a fifth horizontal stripe on a
  // figure that already had four, and §2.2's row is explicit —
  // "armoured pauldrons ... over a silver carapace". The owner colour
  // it was carrying moved down to the thigh plates.
  g.fillStyle = '#c3c3c3';
  g.fillRect(x - i * 0.5 - 2.0, y + 1.5, 4.0, 1.4);
  outline(g, '#919191');
  g.fillStyle = col;
  g.fillRect(x - i * 0.5 - 1.8, y + 1.5, 3.6, 0.8);
  g.fillStyle = '#f1f1f1';
  g.beginPath();
  g.ellipse(x - i * 0.5 - 0.6, y - 0.6, 1.15, 0.7, -0.3, 0, 6.29); g.fill();
  // A STEEL VAMBRACE down the forearm, which the block has claimed since
  // it was written ("Steel arms") and never drew — arms() was handed
  // T.coat and painted both sleeves navy. It cannot be fixed inside
  // arms(): that helper shades the far arm to 0.66 and the near one to
  // 0.76, so no base colour bright enough to survive 0.66 x and still be
  // silver exists. Drawn here at full value instead, it is both the
  // right thing for a powered suit and where §2.2's carapace budget
  // finds the rows the tesla arc takes off the chest.
  g.fillStyle = '#d3d3d3';
  g.beginPath(); g.roundRect(x - 2.0, y + 2.8, 4.0, 3.5, 1.1); g.fill();
  outline(g, '#9f9f9f');
  g.fillStyle = '#e1e1e1';
  g.fillRect(x - 1.6, y + 3.1, 1.4, 2.4);
  // A COIL TERMINAL on the cap — a ceramic insulator and a steel stud.
  // It sits BELOW the helmet crown on purpose: this man is the widest
  // trooper in the roster and deliberately not the tallest, so his
  // electricity is not allowed to buy height.
  g.fillStyle = '#747474';
  g.beginPath(); g.roundRect(x - i * 0.5 - 1.25, y - 1.4, 2.5, 1.4, 0.6); g.fill();
  g.fillStyle = '#d1d1d1';
  g.beginPath(); g.ellipse(x - i * 0.5, y - 1.6, 1.05, 0.72, 0, 0, 6.29); g.fill();
  TT_STUD.push([x - i * 0.5, y - 1.9]);
  if (i > 0) {
    // THE GAUNTLET. Bigger than a hand, ridged, with two prongs and
    // one small arc between them. The arc is deliberately tiny: a
    // glow big enough to see across the field washed out the chest
    // and made every trooper look like he was already firing.
    var gux = x + 2.0, guy = y + 2.8;
    g.fillStyle = shade(col, 0.82);                           // powered weapon shell
    g.beginPath(); g.roundRect(gux - 2.8, guy, 5.6, 4.4, 1.0); g.fill();
    outline(g, '#404040');
    g.fillStyle = shade(col, 1.16);                           // lit outer armour
    g.fillRect(gux - 2.4, guy + 0.3, 4.8, 1.2);
    g.fillStyle = '#bcbcbc';                                  // conductive end fitting
    g.fillRect(gux + 1.5, guy + 2.1, 1.6, 1.8);
    g.strokeStyle = '#cfcfcf'; g.lineWidth = 1.0; g.lineCap = 'round';
    for (var pr = -1; pr <= 1; pr += 2) {                     // two prongs
      g.beginPath();
      g.moveTo(gux + 2.6, guy + 1.7 + pr * 0.8);
      g.lineTo(gux + 5.0, guy + 1.7 + pr * 1.1); g.stroke();
    }
    bolt([[gux + 5.0, guy + 0.6], [gux + 5.7, guy + 1.1],
          [gux + 5.1, guy + 2.4], [gux + 5.0, guy + 2.8]], 0.85);
  } else {
    g.fillStyle = '#ababab';                                  // plain steel fist
    g.beginPath(); g.roundRect(x - 1.7, y + 5.5, 3.4, 2.8, 1.0); g.fill();
    outline(g, '#404040');
    g.fillStyle = col;                                        // ...with the same house cuff
    g.fillRect(x - 1.7, y + 5.4, 3.4, 1.3);
  }
});

// No face: the bowl comes down over it and the visor slot is the only
// opening. helmet() would put a house-colour cap here, which is what
// the chest is already doing — the head has to be the STEEL note.
var hby = by - 24.9;
g.fillStyle = ACC;
g.beginPath(); g.arc(cx, hby, 3.6, Math.PI, 0); g.fill();
g.fillRect(cx - 3.6, hby, 7.2, 2.0);
outline(g, '#4a4a4a');
g.fillStyle = '#f5f5f5';                                      // bright crown
g.beginPath();
g.ellipse(cx - 1.1, hby - 1.4, 1.7, 0.9, -0.35, 0, 6.29); g.fill();
if (!FA.back) {                                               // visor slot
  var thx = cx + sd * 1.2 / TURN;
  g.fillStyle = '#171717';
  g.beginPath(); g.roundRect(thx - 2.8 * (1 - 0.2 * sd), hby + 0.5, 5.6 * (1 - 0.2 * sd), 1.6, 0.6); g.fill();
  // The visor is LIT, not merely reflective: he is the only man on the
  // field with a power source strapped to him, and the slot is the
  // highest point of the portrait crop, so it is the cheapest place to
  // put a second note of the same blue-white.
  g.fillStyle = '#9fe0ff';
  g.fillRect(thx - 2.3 * (1 - 0.2 * sd), hby + 0.75, 3.4 * (1 - 0.2 * sd), 1.0);
  g.fillStyle = '#ffffff';
  g.fillRect(thx - 2.1 * (1 - 0.2 * sd), hby + 0.85, 1.2 * (1 - 0.2 * sd), 0.7);
} else {
  g.fillStyle = 'rgba(30,34,40,.5)';                          // nape of the bowl
  g.beginPath(); g.ellipse(cx, hby + 1.1, 2.9, 1.5, 0, 0, Math.PI); g.fill();
}
// A HOUSE-COLOUR GORGET at the neck. With the carapace silver the
// owner colour had all fallen below his waist, and the sidebar crops an
// infantry cameo to its top 72% — so a Tesla Trooper's plate would have
// been a grey man in a grey helmet. The ring sits at 0.21 of the
// figure's height, ABOVE §2.2's chest band, so it buys the team read
// back without spending any of the carapace budget.
g.fillStyle = shade(col, 0.98);                               // collar ring
g.fillRect(cx - 3.3, hby + 2.0, 6.6, 1.4);
g.fillStyle = shade(col, 1.24);
g.fillRect(cx - 3.1, hby + 2.1, 6.2, 0.5);

// THE ARC ACROSS THE CHEST, terminal to terminal, drawn LAST so it
// crackles in front of everything the way RA2's plate does.
//
// Routing it over the COLLAR instead was tried, because the strokes are
// opaque and the chest is his house block: across the chest the colour
// census puts him at 28.8% owner colour against 33.7% before, a fifth
// of the largest remapped mass on any figure in the game spent on a
// glow, and over the collar it would have covered steel and background
// instead. LOOKED AT, that version is worse art: at the collar line the
// bolt lands between the two steel pauldron caps and the steel collar
// ring and fuses with both, so what the cameo shows is a pale yoke
// across his shoulders — not a discharge. The read is the point, so the
// arc stays on the chest and the house block is paid back on the
// pauldrons, where §2.2's own three-block pattern (shoulders, chest,
// hips) puts it anyway.
//
// It stays UNDER the helmet crown: he is the widest trooper in the
// roster and deliberately not the tallest, and electricity is not
// allowed to buy him height.
if (state === 'cameo' && TT_STUD.length === 2) {
  var la = TT_STUD[0][0] < TT_STUD[1][0] ? TT_STUD[0] : TT_STUD[1];
  var ra = TT_STUD[0][0] < TT_STUD[1][0] ? TT_STUD[1] : TT_STUD[0];
  var mx0 = (la[0] + ra[0]) / 2, sp0 = (ra[0] - la[0]);
  if (sp0 > 3) {
    // FOUR reversals, not one dip. Three points drew a shallow V and the
    // eye filed it as a chevron on the suit — livery, not a discharge.
    // Lightning is recognised by its alternation, so the path crosses
    // its own baseline four times and drops one short fork.
    var ty0 = Math.min(la[1], ra[1]);
    bolt([[la[0], la[1]],
          [mx0 - sp0 * 0.30, ty0 + 2.0], [mx0 - sp0 * 0.13, ty0 - 0.1],
          [mx0 + sp0 * 0.06, ty0 + 2.3], [mx0 + sp0 * 0.26, ty0 + 0.3],
          [ra[0], ra[1]]], 1);
    bolt([[mx0 + sp0 * 0.06, ty0 + 2.3], [mx0 + sp0 * 0.15, ty0 + 3.8]], 0.7);
    // and the light it throws on the carapace under it, KEPT SHORT: an
    // additive wash over a house-colour chest lifts BOTH owners' bakes
    // toward the same blue, so the pixels stop differing and the census
    // stops counting them as owner colour at all.
    g.save();
    g.globalCompositeOperation = 'lighter';
    var twg = g.createLinearGradient(0, ty0, 0, ty0 + 3.2);
    twg.addColorStop(0, 'rgba(120,190,255,.14)');
    twg.addColorStop(1, 'rgba(120,190,255,0)');
    g.fillStyle = twg;
    g.fillRect(la[0] - 1, ty0, sp0 + 2, 3.2);
    g.restore();
  }
}
g.restore();
}

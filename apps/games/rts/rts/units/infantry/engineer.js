// Iron Frontier — infantry/engineer: the art for one unit.
// Called by bakeInfantry() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.




function drawEngineer(C) {
  var ACC = C.ACC, T = C.T, arms = C.arms, by = C.by, col = C.col, cx = C.cx, edge = C.edge, face = C.face,
      g = C.g, gt = C.gt, helmet = C.helmet, legs = C.legs, sov = C.sov;

// ENGINEER, read off the RA2 walk frames (engineer-frames.png): a hi-vis
// house-colour WAISTCOAT over a light work shirt, khaki trousers on a
// brown tool belt, and the tell no other infantryman has — a
// house-colour TOOLBOX swinging from one hand at hip height. RA2 shares
// one Engineer sprite between the armies, so only the headgear splits:
// the Directorate's amber hard hat (with the moulded crest ridge that
// names it at 1:1), the Collective's soft grey field cap.
var SHIRT = '#efece1';
// A PLANTED STANCE, wider than any soldier's. The Engineer, the Spy and
// Tanya are three same-size two-legged figures — RA2 cannot separate
// them as black shapes either (§1.2) — and the two levers §1.5 leaves
// are the leg split and the prop. His is the widest split on the field
// (a workman stands over his work); the Spy's is no split at all under a
// hard-tapered coat. That pair sat at 0.765 and it is 0.74 now.
//
// ...and the split is authored WIDER than it draws, because his STATURE
// no longer is. He used to be squeezed x1.22 (see the table), which
// multiplied a 3.5 split into a 4.3 one on screen; at his RA2-true
// 0.98 the same number came out as a rifleman's stance and took the
// last shape difference off a plain standing man. The split is stated
// in SCREEN terms here instead — 4.4 x 0.98 is the 4.3 it always drew.
legs(4.4, by - 12.2, 3.8, T.coat, 4.6);

g.save(); g.translate(gt.lean, gt.bob);
g.fillStyle = SHIRT;                                          // light work shirt
g.beginPath();
g.moveTo(cx - 5.0, by - 19.4); g.lineTo(cx + 5.0, by - 19.4);
g.lineTo(cx + 4.6, by - 10.6); g.lineTo(cx - 4.6, by - 10.6);
g.closePath(); g.fill(); outline(g, edge(SHIRT, 0.52));
// The waistcoat is TWO front panels with a thin strip of shirt showing
// between them — the gap is what makes it a hi-vis waistcoat and not a
// painted torso (rule 7: discreteness is itself a shape cue), and the
// shirt keeps him a workman rather than a soldier. The panels reach the
// belt now, because a 44.6%-remap Engineer is what §1.5 measures and
// two short bibs were carrying half of it.
// HI-VIS, not house paint. The panels are the same AREA they always
// were — his 40% remap is the highest of any infantryman and the field
// mean has 0.007 of headroom, so the area cannot be spent — but they are
// drawn a rung and a half UP the owner's own colour instead of at it.
// That is the whole trick of this pass: a pale owner tint is remapped
// pixels AND value >= 0.75 at the same time, so the vest pays into the
// hue budget and the value read at once. Sky blue against coral red at
// the two houses, which is further apart than the mid tones were.
var VEST = shade(col, 1.16), VLIT = shade(col, 1.38);
for (var ev = -1; ev <= 1; ev += 2) {
  g.fillStyle = VEST;
  g.beginPath();
  g.moveTo(cx + ev * 0.75, by - 19.9); g.lineTo(cx + ev * 5.3, by - 19.9);
  g.lineTo(cx + ev * 4.8, by - 11.4); g.lineTo(cx + ev * 1.0, by - 11.4);
  g.closePath(); g.fill(); outline(g, shade(col, 0.88));
  g.fillStyle = ev < 0 ? VLIT : shade(col, 0.96);             // lit / shaded panel
  g.fillRect(cx + (ev < 0 ? -5.0 : 2.4), by - 19.6, 2.6, 7.6);
}
// The tool belt is drawn OVER the waistcoat, not under it: buried, the
// panels lost their bottom edge and the figure read as one long bib.
g.fillStyle = '#6d5230';                                      // brown tool belt, over the panels
g.fillRect(cx - 3.4, by - 12.8, 6.8, 1.7);                    // ...but only across the middle,
g.fillStyle = '#c9a94a';                                      // so the waistcoat keeps its
g.fillRect(cx - 0.9, by - 12.6, 1.9, 1.3);                    // corners and its house colour
g.fillStyle = '#8d9099';                                      // spanner on the belt
g.fillRect(cx + 1.6, by - 12.6, 1.6, 1.3);
g.fillStyle = SHIRT;                                          // shirt at the left collar
g.beginPath();
g.moveTo(cx - 5.1, by - 19.7); g.lineTo(cx - 2.6, by - 19.7);
g.lineTo(cx - 3.9, by - 17.4); g.lineTo(cx - 5.1, by - 17.6);
g.closePath(); g.fill();

// The sleeves hang OUTSIDE the waistcoat (they were overlapping it and
// eating a third of its width), with a hi-vis strap over each shoulder
// — the waistcoat goes over the shoulders on the real garment, and it
// is where the last of his remap budget buys the most.
arms(5.7, by - 18.4, 2.8, 6.4, SHIRT, function (i, x, y) {
  g.fillStyle = shade(col, 1.16);                             // hi-vis shoulder strap
  g.beginPath(); g.roundRect(x - 1.6, y - 0.7, 3.2, 2.4, 0.8); g.fill();
  outline(g, shade(col, 0.88));
  g.fillStyle = shade(col, 1.38);
  g.fillRect(x - 1.3, y - 0.5, 2.6, 0.8);
  g.fillStyle = '#b58a52';                                    // tan work glove
  g.beginPath(); g.roundRect(x - 1.5, y + 5.6, 3.0, 2.2, 0.8); g.fill();
  outline(g, '#6d5027');
  if (i > 0) {                                                // the toolbox, hand-carried
    // THE TOOLBOX IS STATED IN SCREEN UNITS TOO, and for the same
    // reason as the leg split above: at x1.22 a 5.2-wide box drew 6.3,
    // and dropping to the RA2-true 0.98 left ONE column of it standing
    // outside his arm. The tell no other infantryman has cannot be one
    // pixel — §1.5 leaves exactly two levers for three same-size men
    // (the leg split and the prop) and this is the prop. It carries
    // house colour, so it pays its own way on the remap budget as well.
    var tbx = x + 1.0, tby = y + 7.4;
    g.strokeStyle = '#2a2d33'; g.lineWidth = 1.0; g.lineCap = 'round';
    g.beginPath(); g.arc(tbx, tby + 0.8, 2.2, Math.PI, 0.05); g.stroke();
    g.fillStyle = col;
    g.beginPath(); g.roundRect(tbx - 3.2, tby, 6.5, 4.7, 0.8); g.fill();
    outline(g, shade(col, 0.82));
    g.fillStyle = shade(col, 1.22);                           // lit lid
    g.fillRect(tbx - 3.0, tby + 0.3, 6.0, 1.1);
    g.fillStyle = shade(col, 0.86);                           // latch band
    g.fillRect(tbx - 3.1, tby + 2.6, 6.2, 1.0);
    g.fillStyle = '#8d9099';                                  // steel catch
    g.fillRect(tbx - 0.7, tby + 2.3, 1.4, 1.5);
  }
});

face(by - 21.6);
if (sov) {
  // A near-WHITE hard hat, and it used to be a soft grey field cap.
  // The cap was chosen so his silhouette was flat where every other
  // Collective head is a dome — but the Conscript now wears the flat
  // peaked cap RA2 gives him (ref §2.2), so "flat" no longer belongs to
  // the Engineer, and the two heads were converging. His identity is
  // INVERTED VALUE (§2.1: the only light-value soldier on the field),
  // so the head goes to the top of the value range and the shape goes
  // back to a hard hat, matching the Directorate Engineer it shares a
  // sprite with. Rule 10's one bright anchor, at the head.
  var CAP = '#eceadf';
  helmet(by - 23.3, 2.95, CAP, 1.05);
  g.fillStyle = edge(CAP, 0.78);                              // moulded crest ridge
  g.fillRect(cx - 0.7, by - 26.2, 1.4, 2.9);
  g.fillStyle = edge(CAP, 0.62);                              // brim shadow line
  g.fillRect(cx - 3.4, by - 22.6, 6.8, 0.65);
  // A brass badge, not a red star: on a BLUE-owned Collective engineer
  // a red star is a saturated OPPOSING hue on the figure's most-read
  // surface, and friend-or-foe is worth more than the badge.
  g.fillStyle = '#b8912e';
  g.beginPath(); g.ellipse(cx, by - 23.6, 0.85, 0.75, 0, 0, 6.29); g.fill();
} else {
  helmet(by - 23.3, 2.95, ACC, 1.05, 0.98);        // amber hard hat — hef keeps it HIGH-VIS: a
                                                   // hard hat is the brightest thing a worker wears
  g.fillStyle = edge(ACC, 0.72);                  // moulded crest ridge
  g.fillRect(cx - 0.7, by - 26.2, 1.4, 2.9);
  g.fillStyle = edge(ACC, 0.56);                  // brim shadow line
  g.fillRect(cx - 3.4, by - 22.6, 6.8, 0.65);
}
g.restore();
}

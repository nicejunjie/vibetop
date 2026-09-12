// ─── infantry/yuri ─── Iron Frontier unit art. Included into rts.html by tools/rts-build.py;
// every free identifier is a local of bakeInfantry() in rts.src.html — see art/units/README.md.

// YURI ([YURI]). No sprite rip exists on the wiki (ns:File searches for
// "Yuri RA2" / "Yuri Render" / "Yuri Cameo" return nothing), so this is
// built from the character as RA2 presents him — the ONE unit in the
// game that is not a soldier: a BALD head above a long high-collared
// coat, arms raised toward the temples, and a violet psychic glow at
// the head. Everything about the silhouette is deliberately un-military:
// no helmet dome, no weapon, a skirted coat instead of trousers.
//
// AND NO LEG SPLIT. unit-identity-reference.md §1.5 rule 9 names three
// levers on an infantryman, and the second is the presence or absence
// of the split: "Yuri and the Spy get a coat, which deletes the leg
// split entirely and is instantly readable." He was drawn with legs()
// and a skirt over the top, so two boots came out below the hem and the
// one thing that made him not-a-soldier was thrown away. The coat is
// now ONE unbroken block from the waist to the ankles — >=9 px wide
// with zero vertical gap over >=8 px of height, which is the §2.2
// budget — and it is drawn OUTSIDE the bob so the figure keeps its
// ground anchor with no legs to stand on.
var yhem = gt.swf * 0.7;                                       // the hem sways; it does not stride
g.fillStyle = shade(T.coat, 1.12);
g.beginPath();
g.moveTo(cx - 4.7, by - 16.0); g.lineTo(cx + 4.7, by - 16.0);
g.lineTo(cx + 6.6 + yhem, by - 1.4); g.lineTo(cx - 6.6 + yhem, by - 1.4);
g.closePath(); g.fill(); outline(g, shade(T.coat, 0.44));
g.fillStyle = shade(T.coat, 1.42);                             // lit left panel
g.beginPath();
g.moveTo(cx - 4.3, by - 15.8); g.lineTo(cx - 1.2, by - 15.8);
g.lineTo(cx - 1.4 + yhem, by - 1.6); g.lineTo(cx - 5.9 + yhem, by - 1.6);
g.closePath(); g.fill();
// The front SEAM, all the way down. Without it the hem is one flat
// wedge and the figure reads as a frock rather than a long coat — a
// coat is two panels that meet, and the meeting line is what says so.
g.fillStyle = 'rgba(0,0,0,.34)';
g.beginPath();
g.moveTo(cx - 0.7, by - 15.8); g.lineTo(cx + 0.7, by - 15.8);
g.lineTo(cx + 0.9 + yhem, by - 1.6); g.lineTo(cx - 0.9 + yhem, by - 1.6);
g.closePath(); g.fill();
// Two shoe caps at the very bottom of the hem, no gap above them: they
// say "there is a man in here" without reopening the split.
for (var ysh = -1; ysh <= 1; ysh += 2) {
  g.fillStyle = T.boot;
  g.beginPath();
  g.roundRect(cx + ysh * 2.4 - 1.7 + yhem, by - 2.4, 3.4, 2.4, 0.8); g.fill();
}
// THE HEM BAND. RA2's Yuri carries his 26.9% remap on a collar and a
// hem band ONLY (§1.5) — no torso block, because he has no torso zone:
// the coat is one block from collar to ankle, so the colour has to
// bracket it top and bottom instead of filling it. It is a BAND, ~2 px:
// at 3+ px it stopped reading as trim and turned the coat into a dress.
g.fillStyle = col;
g.beginPath();
g.moveTo(cx - 6.2 + yhem, by - 3.6); g.lineTo(cx + 6.2 + yhem, by - 3.6);
g.lineTo(cx + 6.6 + yhem, by - 1.4); g.lineTo(cx - 6.6 + yhem, by - 1.4);
g.closePath(); g.fill(); outline(g, shade(col, 0.40));
g.fillStyle = shade(col, 1.22);
g.fillRect(cx - 5.9 + yhem, by - 3.4, 4.2, 1.6);
g.fillStyle = shade(col, 0.76);
g.fillRect(cx + 2.4 + yhem, by - 3.3, 3.3, 1.5);

g.save(); g.translate(gt.lean, gt.bob);

g.fillStyle = shade(T.coat, 1.0);                              // torso
g.beginPath();
g.moveTo(cx - 4.4, by - 21.0); g.lineTo(cx + 4.4, by - 21.0);
g.lineTo(cx + 4.8, by - 15.2); g.lineTo(cx - 4.8, by - 15.2);
g.closePath(); g.fill(); outline(g, shade(T.coat, 0.42));
// The lapels are a V that meets at the waist, not two parallel straps —
// as two vertical bars they read as braces worn over a shirt.
g.fillStyle = col;
for (var yl = -1; yl <= 1; yl += 2) {
  g.beginPath();
  g.moveTo(cx + yl * 4.4, by - 20.9); g.lineTo(cx + yl * 1.5, by - 20.9);
  g.lineTo(cx + yl * 0.5, by - 15.4); g.lineTo(cx + yl * 3.9, by - 15.4);
  g.closePath(); g.fill(); outline(g, shade(col, 0.40));
  g.fillStyle = shade(col, yl < 0 ? 1.22 : 0.78);
  g.fillRect(cx + (yl < 0 ? -4.2 : 1.4), by - 20.6, 1.9, 4.9);
  g.fillStyle = col;
}

// Arms DOWN at the sides. RA2 raises them for the psychic attack; hands
// held at the temples in every frame buried the bald head, which is the
// entire silhouette read.
arms(4.7, by - 19.6, 2.1, 5.8, shade(T.coat, 0.90), function (i, x, y) {
  g.fillStyle = T.skin;                                        // bare hand
  g.beginPath(); g.ellipse(x + i * 0.3, y + 6.2, 1.05, 1.2, 0, 0, 6.29); g.fill();
  outline(g, '#a5806a');
  g.fillStyle = shade(T.coat, 0.70);                           // cuff
  g.fillRect(x - 1.0, y + 4.6, 2.0, 1.0);
});

// The high collar stands ABOVE the shoulder line, which is what makes
// the bald head sit in a notch rather than on a normal neck.
g.fillStyle = shade(T.coat, 0.76);
g.beginPath();
g.moveTo(cx - 5.4, by - 21.2); g.lineTo(cx - 3.0, by - 25.4);
g.lineTo(cx + 3.0, by - 25.4); g.lineTo(cx + 5.4, by - 21.2);
g.closePath(); g.fill(); outline(g, shade(T.coat, 0.38));
g.fillStyle = shade(col, 0.92);                                // the collar band — half his
g.fillRect(cx - 3.2, by - 25.5, 6.4, 1.5);                     // remap, and RA2 has him at
                                                               // 26.9% where we sat at 25.5

face(by - 24.0);
// The bald skull: skin, not a helmet, and drawn slightly larger than a
// helmet dome would be so the absence of a helmet is unmistakable.
var yhx = cx + sd * 1.1 / TURN + HEADX;
g.fillStyle = T.skin;
g.beginPath(); g.ellipse(yhx, by - 24.9, 2.7 * (1 - 0.16 * sd), 2.9, 0, Math.PI, 0); g.fill();
g.fillRect(yhx - 2.7 * (1 - 0.16 * sd), by - 24.9, 5.4 * (1 - 0.16 * sd), 1.3);
outline(g, '#a5806a');
g.fillStyle = 'rgba(255,255,255,.22)';                         // scalp highlight
g.beginPath(); g.ellipse(yhx - 0.9, by - 26.0, 1.3, 0.7, -0.35, 0, 6.29); g.fill();
if (!FA.back) {                                                // the dark goatee
  g.fillStyle = '#2b2028';
  g.beginPath(); g.ellipse(yhx + sd * 0.8, by - 22.4, 1.5 * (1 - 0.2 * sd), 1.5, 0, 0, 6.29); g.fill();
}
// Psychic aura at the temples: two violet motes, drawn additively so
// they read as light rather than as paint.
g.save();
g.globalCompositeOperation = 'lighter';
// Clear of the skull, not straddling it. Sat on the temple the additive
// glow landed half on the skin outline and summed to a PINK fringe
// — 0.2% of the sprite reading as the other owner's hue on a blue Yuri
// (the `hue.maxImpostor` trap the Conscript's trousers were caught by).
// Beside the head it sums over the background instead, and an aura
// floating off the temples is the better read anyway.
// ...and a little further out again, with a tighter halo. The additive
// blend is the whole trap here: wherever the glow lands on the figure it
// SUMS with the skin under it and the sum is pink — the other owner's
// hue on a blue Yuri. He is `hue.maxImpostor`'s top infantry entry and
// sits a thousandth under the game's worst (the Squid), so every pixel
// of overlap counts.
for (var ypi = -1; ypi <= 1; ypi += 2) {
  g.fillStyle = 'rgba(168,111,240,.26)';
  g.beginPath(); g.ellipse(yhx + ypi * 4.7, by - 24.8, 0.95, 0.95, 0, 0, 6.29); g.fill();
  g.fillStyle = ACCENT.yuri;
  g.beginPath(); g.ellipse(yhx + ypi * 4.7, by - 24.8, 0.55, 0.55, 0, 0, 6.29); g.fill();
}
g.restore();
g.restore();

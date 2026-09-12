// Iron Frontier unit art — infantry/desolator
// Spliced VERBATIM into apps/games/rts/rts.html between `// @@ART infantry/desolator` and
// `// @@END infantry/desolator` (one pair per @@PART below). Edit HERE, then
//     node apps/games/rts/tools/art-split.js inject
// — or edit rts.html and `extract`; rts-split.test.js fails while they differ.
// Every free identifier (the canvas `g`, the anchor, the helpers, `col`, `sov`…)
// is a local of the enclosing bake function: see apps/games/rts/art/units/README.md.

// @@PART main — inside bakeInfantry() in rts.html
// DESOLATOR ([DESO]), read off docs/ra2-ref/ra2-deso-RA2_Desolator_
// {Render,Manual_Render}. What actually identifies him at 1:1 is the
// SHOULDER: a fat cylindrical rad cannon carried on the leading
// shoulder with a glowing green muzzle disc pointing forward, so his
// silhouette is lopsided in a way nothing else on the field is. Under
// it, a charcoal hazard suit with house-colour plates on the chest,
// one shoulder and both thighs, a domed helmet with a green visor
// slit, and heavy black boots. Bulk one class above a Conscript.
legs(3.0, by - 12.2, 4.4, T.coat, 5.2);

g.save(); g.translate(gt.lean, gt.bob);
// THE PACK, first, so the shoulders sit in front of it. §2.2 asks for a
// "pack >= 5w x 8h ABOVE the shoulder line" and the figure never had
// one: without it he was a Guardian GI with a green light, and his
// closest silhouette match on the whole field was a GI. They sit just
// ABOVE the shoulder line and BELOW the helmet crown — raised level
// with the head they became the widest rows on the sprite, which made
// the gate score the helmet as his spike instead of the pack and took
// its measured thickness from 6 px to 4.
// ...and the way they came to meet §2.2's "pack >= 5w x 8h ABOVE the
// shoulder line" is the C4 note's trap read backwards. The gate scored 7
// rows of protrusion, not 8, and the obvious move — raise the tanks — is
// the one that makes it WORSE: at the profile facings the body is
// squeezed 0.66 but the tanks are not, so lifting them into the helmet's
// rows takes that band over the 55% body cut and the run gets SHORTER.
// Raising the HELMET a unit and dropping the tanks half of one buys the
// eighth row, because what is measured is the number of rows that stay
// NARROW, not how high the widest thing sits. Sweep: +2.0 -> 4 rows,
// +1.0 -> 6, 0 -> 7, -1.0 -> 8.
for (var dpk = -1; dpk <= 1; dpk += 2) {
  var pkx = cx + dpk * 4.0;
  g.fillStyle = shade(T.coat, dpk < 0 ? 1.40 : 1.10);
  g.beginPath(); g.roundRect(pkx - 2.1, by - 21.6, 4.2, 9.2, 1.6); g.fill();
  outline(g, shade(T.coat, 0.40));
  g.fillStyle = shade(T.coat, dpk < 0 ? 1.74 : 1.32);          // lit stave
  g.fillRect(pkx - 1.6, by - 21.0, 1.2, 7.8);
  g.fillStyle = shade(col, 0.90);                              // house band round the tank —
  g.fillRect(pkx - 2.1, by - 19.6, 4.2, 2.2);                  // the budget goes ON the named
  outline(g, shade(col, 0.42));                                // part (rule 6), as the Flak
  g.fillStyle = '#2a2e34';                                     // Trooper's breech band does
  g.beginPath(); g.ellipse(pkx, by - 21.6, 2.1, 1.0, 0, 0, 6.29); g.fill();
  // THE CANISTER CAP IS A LAMP. Put RA2's Desolator plate beside ours and
  // the difference is not a detail: RA2's is a green PICTURE — a
  // yellow-green radioactive wash over a hazmat rig — and ours was a
  // charcoal figure carrying ONE green dot. The whole signature sat on a
  // 4 px muzzle disc that the sidebar's portrait crop shrinks to nothing.
  // The isotope has to be visible on the man, and the only surface high
  // enough to survive that crop is the top of the tanks: everything from
  // by-20.4 down is overdrawn by the carapace and the waist ring, so a
  // sight glass on the tank BODY would be painted over and buy nothing
  // (tried first, measured, discarded). So each cap glows — two green
  // lamps at the top of the silhouette, left and right, which is the
  // first thing the eye finds on the plate and reads at 1:1 as well.
  g.fillStyle = 'rgba(77,224,74,.34)';                         // bloom off the cap
  g.beginPath(); g.ellipse(pkx, by - 21.9, 2.3, 1.5, 0, 0, 6.29); g.fill();
  g.fillStyle = ACCENT.desolator;                              // the isotope itself
  g.beginPath(); g.ellipse(pkx, by - 21.9, 1.45, 0.80, 0, 0, 6.29); g.fill();
  g.fillStyle = '#dcff7a';                                     // hot centre — RA2's glow is
  g.beginPath();                                               // YELLOW-green at its brightest
  g.ellipse(pkx - 0.35, by - 22.1, 0.70, 0.38, 0, 0, 6.29); g.fill();
}
g.strokeStyle = '#3a3f47'; g.lineWidth = 1.2; g.lineCap = 'round';
g.beginPath();                                                 // yoke across the tank tops
g.moveTo(cx - 4.0, by - 20.9); g.lineTo(cx + 4.0, by - 20.9); g.stroke();
for (var dtp = -1; dtp <= 1; dtp += 2) {                       // house-colour thigh plates
  g.fillStyle = shade(col, 0.86);
  g.beginPath(); g.roundRect(cx + dtp * 3.0 - 2.1, by - 13.0, 4.2, 3.4, 1.0); g.fill();
  outline(g, shade(col, 0.42));
  g.fillStyle = shade(col, 1.18);
  g.fillRect(cx + dtp * 3.0 - 1.7, by - 12.8, 3.4, 0.9);
}
g.fillStyle = '#5a5f69';                                       // suit waist ring
g.fillRect(cx - 5.4, by - 14.6, 10.8, 1.6);
g.fillStyle = '#7d8590';
g.fillRect(cx - 5.2, by - 14.5, 10.4, 0.6);

g.fillStyle = shade(T.coat, 1.04);                             // charcoal carapace
g.beginPath();
g.moveTo(cx - 5.3, by - 20.4); g.lineTo(cx + 5.3, by - 20.4);
g.lineTo(cx + 5.6, by - 15.0); g.lineTo(cx - 5.6, by - 15.0);
g.closePath(); g.fill(); outline(g, shade(T.coat, 0.44));
g.fillStyle = col;                                             // house-colour chest plate
g.beginPath();
g.moveTo(cx - 5.0, by - 20.3); g.lineTo(cx + 5.0, by - 20.3);
g.lineTo(cx + 3.6, by - 15.0); g.lineTo(cx - 3.6, by - 15.0);
g.closePath(); g.fill(); outline(g, shade(col, 0.40));
g.fillStyle = shade(col, 1.24);
g.fillRect(cx - 4.8, by - 20.2, 9.6, 1.2);
// rivets down the plate — the render's studded seam
g.fillStyle = 'rgba(20,22,26,.55)';
for (var drv = 0; drv < 3; drv++) g.fillRect(cx - 0.5, by - 19.0 - drv * 1.5, 1.0, 0.8);
// GREEN KEY LIGHT. What makes RA2's plate green is not one bright part,
// it is that the MAN IS LIT GREEN by what he is carrying. Drawn as a
// translucent wash it costs no owner colour at all — a tint over the
// house plate still differs between the two owners' bakes, so it stays
// remap to the colour census — and it costs no silhouette either, which
// is why it can be this broad where an outward bloom could not be.
// It has to FALL OFF, or it is a stripe and not a light: two flat bands
// put a hard green edge across his chest (looked at, and it read as
// painted-on livery). One gradient from the canisters down.
g.save();
g.globalCompositeOperation = 'lighter';
var dwg = g.createLinearGradient(0, by - 21.0, 0, by - 14.4);
dwg.addColorStop(0, 'rgba(46,150,44,.42)');
dwg.addColorStop(0.55, 'rgba(46,150,44,.20)');
dwg.addColorStop(1, 'rgba(46,150,44,0)');
g.fillStyle = dwg;
g.beginPath();
g.moveTo(cx - 5.3, by - 20.4); g.lineTo(cx + 5.3, by - 20.4);
g.lineTo(cx + 5.6, by - 15.0); g.lineTo(cx - 5.6, by - 15.0);
g.closePath(); g.fill();
g.restore();

arms(5.5, by - 18.4, 2.9, 5.6, shade(T.coat, 0.92), function (i, x, y) {
  // Suit pauldrons, in HOUSE colour, as the Manual_Render wears them.
  // They are also where the owner-colour budget the rad glow spent comes
  // back from: making the isotope visible added opaque non-remap pixels
  // and diluted his share from 30.6% to 29.6% (measured), and §1.4 wants
  // that block ON a named part rather than sprayed over the suit.
  g.fillStyle = shade(col, 0.92);
  g.beginPath(); g.ellipse(x - i * 0.4, y + 0.5, 2.1, 1.7, 0, Math.PI, 0); g.fill();
  g.fillRect(x - i * 0.4 - 2.1, y + 0.5, 4.2, 1.2);
  outline(g, shade(col, 0.40));
  g.fillStyle = shade(col, 1.20);
  g.beginPath(); g.ellipse(x - i * 0.4 - 0.6, y - 0.3, 1.1, 0.6, -0.3, 0, 6.29); g.fill();
  g.fillStyle = shade(col, 0.94);                              // armoured gauntlet
  g.beginPath(); g.roundRect(x - 1.6, y + 4.7, 3.2, 2.7, 0.9); g.fill();
  outline(g, shade(col, 0.42));
});

// The rad cannon on the leading shoulder. `wpn` keeps its true length
// through the body squeeze and swings it round with the facing.
wpn(function () {
  var gy0 = by - 19.4;
  g.fillStyle = '#5b6169';                                     // barrel body
  g.beginPath(); g.roundRect(cx - 0.4, gy0, 5.8, 3.4, 1.2); g.fill();
  outline(g, '#232629');
  g.fillStyle = '#7f868f';                                     // lit top of the tube
  g.fillRect(cx - 0.1, gy0 + 0.3, 5.2, 1.0);
  g.fillStyle = '#3d4249';                                     // cooling bands
  for (var db = 0; db < 3; db++) g.fillRect(cx + 1.0 + db * 1.4, gy0 + 0.3, 0.7, 2.8);
  g.fillStyle = '#2e3238';                                     // shoulder yoke
  g.beginPath(); g.roundRect(cx - 2.1, gy0 + 0.5, 2.1, 3.2, 0.9); g.fill();
  // the muzzle: a green disc with a soft bloom, his one loud surface
  // WIDE-MOUTHED, as §2.2 asks: "gun muzzle >= 4 px across (fat, not a
  // rifle)". The green disc measured 2.7 px at zoom 1 and was the one
  // hue on the field nobody else carries — too small to do either job.
  g.fillStyle = 'rgba(77,224,74,.22)';                         // outer bloom
  g.beginPath(); g.ellipse(cx + 6.0, gy0 + 1.7, 3.3, 3.3, 0, 0, 6.29); g.fill();
  g.fillStyle = 'rgba(77,224,74,.40)';
  g.beginPath(); g.ellipse(cx + 6.0, gy0 + 1.7, 2.5, 2.5, 0, 0, 6.29); g.fill();
  g.fillStyle = ACCENT.desolator;
  g.beginPath(); g.ellipse(cx + 6.0, gy0 + 1.7, 1.95, 2.05, 0, 0, 6.29); g.fill();
  outline(g, '#1f5c1e');
  g.fillStyle = '#dcff7a';                                     // a HOT core, not a highlight:
  g.beginPath();                                               // an emitter burns out yellow
  g.ellipse(cx + 5.9, gy0 + 1.6, 1.05, 1.10, 0, 0, 6.29); g.fill();
  // the ribbed feed hose running back to the pack
  g.strokeStyle = '#4a5058'; g.lineWidth = 1.1;
  g.beginPath(); g.moveTo(cx - 0.6, gy0 + 2.9);
  g.quadraticCurveTo(cx - 3.4, gy0 + 5.0, cx - 2.6, gy0 + 7.0); g.stroke();
});

// A sealed helmet, not a face: a domed shell with a green visor band. It
// stands a unit higher than it did — see the pack note above; the extra
// helmet-only band is what carries the pack's eighth row of protrusion.
g.fillStyle = shade(T.coat, 1.28);
var dhy = by - 23.3;
g.beginPath(); g.ellipse(cx + sd * 1.1 / TURN, dhy, 3.4 * (1 - 0.16 * sd), 3.5, 0, Math.PI, 0); g.fill();
g.fillRect(cx + sd * 1.1 / TURN - 3.4 * (1 - 0.16 * sd), dhy, 6.8 * (1 - 0.16 * sd), 1.9);
outline(g, shade(T.coat, 0.42));
if (!FA.back) {
  // A LIT FACEPLATE, not a slit. The helmet is the top of the portrait
  // crop and therefore the loudest real estate the cameo has; a 4.8x1.5
  // band there was a green pinstripe. RA2's rig glows out of the whole
  // faceplate, and the dome above it catches that light.
  g.fillStyle = 'rgba(77,224,74,.30)';                         // the dome catches it
  g.beginPath();
  g.ellipse(cx + sd * 1.1 / TURN, dhy + 0.2, 3.2 * (1 - 0.16 * sd), 2.6, 0, Math.PI, 0); g.fill();
  var dvx = cx + sd * 1.9 / TURN;
  g.fillStyle = 'rgba(77,224,74,.92)';                         // the faceplate
  g.beginPath(); g.roundRect(dvx - 2.7, dhy - 0.7, 5.4, 3.0, 1.1); g.fill();
  g.fillStyle = '#8bf07f';
  g.fillRect(dvx - 2.4, dhy - 0.4, 4.8, 1.3);
  g.fillStyle = '#dcff7a';                                     // glint on the glass
  g.fillRect(dvx - 2.2, dhy - 0.2, 1.8, 0.8);
  g.strokeStyle = shade(T.coat, 0.44); g.lineWidth = 0.8;      // the rubber seal round it
  g.beginPath(); g.roundRect(dvx - 2.7, dhy - 0.7, 5.4, 3.0, 1.1); g.stroke();
} else {
  g.fillStyle = shade(T.coat, 0.62);
  g.beginPath(); g.ellipse(cx, dhy + 1.3, 2.7, 1.5, 0, 0, Math.PI); g.fill();
}
g.fillStyle = shade(col, 1.0);                                 // house-colour crest
g.fillRect(cx + sd * 1.1 / TURN - 0.8, dhy - 3.6, 1.6, 3.2);
g.restore();

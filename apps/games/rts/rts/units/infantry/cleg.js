// ─── infantry/cleg ─── Iron Frontier unit art. Included into rts.html by tools/rts-build.py;
// every free identifier is a local of bakeInfantry() in rts.src.html — see art/units/README.md.

import { ACCENT, outline } from '../../bake/kit.js';
import { shade } from '../../bake/terrain.js';

export function drawCleg(C) {
  var FA = C.FA, HEADX = C.HEADX, T = C.T, TURN = C.TURN, arms = C.arms, by = C.by, col = C.col,
      cx = C.cx, g = C.g, gt = C.gt, legs = C.legs, sd = C.sd;

// CHRONO LEGIONNAIRE ([CLEG]), read off docs/ra2-ref/ra2-cleg-CC_Legion
// _Chrono_Legionnaire.png and the sprite animation. He is the PALEST
// figure on the field: bone-white plate over a light blue-grey suit,
// a full domed helmet with a dark faceplate and a breathing hose, and
// a heavy two-handed neutron rifle held ACROSS the body with a cold
// blue coil glowing on top of the receiver. Value alone separates him
// from every other man in the line-up before colour does.
// HOUSE COLOUR RIDES THE THIGH, not the chest. The sidebar crops an
// infantry cameo to its TOP 72% (`cameoFor`), so owner colour below
// about `by - 9` is carried in full by the sprite — where §1.4's remap
// floor is measured — and is barely in the plate at all. That is the
// whole trade this pass makes for him: the budget the shoulder shell
// gives up lands here and on the greaves, not on another chest slab.
legs(2.7, by - 12.0, 3.8, shade(T.coat, 0.94), 4.4, col);

g.save(); g.translate(gt.lean, gt.bob);
g.fillStyle = shade(T.coat, 0.80);                             // belt rig
g.fillRect(cx - 4.9, by - 14.2, 9.8, 1.5);
g.fillStyle = shade(T.coat, 1.34);
g.fillRect(cx - 4.7, by - 14.1, 9.4, 0.6);

g.fillStyle = shade(T.coat, 1.30);                             // bone-white torso plate
g.beginPath();
g.moveTo(cx - 5.0, by - 20.6); g.lineTo(cx + 5.0, by - 20.6);
g.lineTo(cx + 5.2, by - 14.4); g.lineTo(cx - 5.2, by - 14.4);
g.closePath(); g.fill(); outline(g, shade(T.coat, 0.52));
g.fillStyle = shade(T.coat, 1.44);                             // lit left half
g.fillRect(cx - 4.8, by - 20.4, 3.2, 5.8);
// THE POWERED-SUIT SHOULDERS ARE THE SUIT, NOT THE HOUSE BLOCK.
// §2.1 names his one feature "powered-suit shoulders with no neck, a
// COLLAR RING, and a long rifle held level", and §1.5's zone row for him
// reads "silver suit, RED TRIM". This yoke was neither: a solid
// owner-colour cape from shoulder point to sternum. Measured on the
// 60x48 plate the sidebar actually draws, it made him the BLUEST cameo
// in the Directorate — 61.9% of the plate's centre band in owner hue,
// against the G.I.'s 49.2% — which is why `GI | Chrono Legionnaire` and
// `Spy | Chrono Legionnaire` were two of that sidebar's eight worst
// pairs. The five worst were one picture: an owner-blue torso filling
// the middle of the frame, identity left to a small low-contrast prop.
//
// So the shell is ARMOUR: one continuous silver shoulder wrap, and the
// owner colour goes to the COLLAR RING §2.1 had already asked for
// (and which was not drawn), the pauldron rims, the knee bands and the
// thigh plates. Same clause, same shoulder line, opposite paint.
g.fillStyle = shade(T.coat, 1.50);                             // silver shoulder shell
g.beginPath();
g.moveTo(cx - 5.6, by - 20.7); g.lineTo(cx + 5.6, by - 20.7);
g.lineTo(cx + 3.4, by - 15.9); g.lineTo(cx - 3.4, by - 15.9);
g.closePath(); g.fill(); outline(g, shade(T.coat, 0.64));
g.fillStyle = shade(T.coat, 1.72);                             // lit crest
g.fillRect(cx - 5.4, by - 20.5, 3.4, 1.4);
g.fillStyle = shade(T.coat, 0.86);                             // shoulder seam, so the
g.fillRect(cx - 5.5, by - 17.2, 11.0, 0.7);                    // wrap reads as a plate
// THE COLLAR RING (§2.1), which the old yoke stood in for and which is
// the natural home for the house note on a sealed suit: a band round
// the neck line, drawn under the dome so the dome seats INTO it.
g.fillStyle = col;
g.beginPath(); g.roundRect(cx - 4.5, by - 21.3, 9.0, 2.3, 1.0); g.fill();
outline(g, shade(col, 0.40));
g.fillStyle = shade(col, 1.24);
g.fillRect(cx - 4.1, by - 21.1, 8.2, 0.8);
// ...and one trim band round each greave. He was the last uniformed
// trooper under §1.4's 20% floor at 19.4%, and "red trim" (§1.5) is
// exactly what a knee band is — it does not touch the bone-white plate
// that is his actual identity.
for (var clk = -1; clk <= 1; clk += 2) {
  g.fillStyle = shade(col, 0.94);
  g.beginPath(); g.roundRect(cx + clk * 2.7 - 2.0, by - 8.6, 4.0, 2.0, 0.6); g.fill();
  outline(g, shade(col, 0.44));
}
g.fillStyle = '#5f6a7a';                                       // chest vent slot
g.fillRect(cx - 1.6, by - 17.4, 3.2, 1.9);
g.fillStyle = ACCENT.cleg;
g.fillRect(cx - 1.3, by - 17.2, 1.1, 1.4);

// THE WIDEST ALLIED FOOT SILHOUETTE. §2.1 asks for a shoulder line
// >= 15 px — "powered-suit shoulders with no neck", >= 20% wider than a
// GI's 12 — and the suit was being drawn at a rifleman's 10.4, which is
// why his nearest silhouette match was the GI. The pauldrons are wide
// slabs now and the arms hang off them.
arms(6.3, by - 18.6, 2.9, 5.4, shade(T.coat, 1.24), function (i, x, y) {
  // The pauldron is the SHOULDER, so it is the suit's own material and
  // wears the house colour as a RIM — the same division the shell above
  // makes, and the reason the shoulder line still measures 20 px against
  // §2.1's 15: nothing here moved, only what it is painted in.
  g.fillStyle = shade(col, 0.88);                              // rim, one step proud
  g.beginPath(); g.roundRect(x - i * 0.35 - 2.2, y - 1.3, 4.4, 3.0, 1.0); g.fill();
  outline(g, shade(col, 0.42));
  g.fillStyle = shade(T.coat, 1.38);                           // silver slab pauldron
  g.beginPath(); g.roundRect(x - i * 0.35 - 1.85, y - 1.0, 3.7, 2.3, 0.8); g.fill();
  g.fillStyle = shade(T.coat, 1.66);
  g.fillRect(x - i * 0.35 - 1.6, y - 0.8, 3.2, 0.8);
  g.fillStyle = '#4b5361';                                     // dark glove
  g.beginPath(); g.roundRect(x - 1.3, y + 4.6, 2.6, 2.2, 0.8); g.fill();
});

// The neutron rifle: a long slab receiver with a glowing coil ring
// near the muzzle and a stubby emitter fork at the end.
// THE NEUTRON RIFLE, and it is NOT drawn through `wpn()` any more.
// `wpn` models a weapon that points along the facing — a shoulder tube,
// a rad cannon — so it gives the piece its full length back as the man
// turns to profile (`wl = (0.82 + 0.33*sd) / TURN`). The Chrono
// Legionnaire's rifle is held ACROSS the body, which is the opposite
// case: front-on you see all of it, end-on you see almost none. Under
// `wpn` it grew by half at the profile facings, and when §2.1's "rifle
// >= 9 px LONG" was finally enforced and it got longer still, that swing
// took his own cross-bearing self-IoU from 0.707 to 0.631 and handed him
// to the Rocketeer as a peer-vs-self failure. Drawn in body space it
// narrows WITH the shoulders, which is both what a rifle across a chest
// actually does and what keeps his eight bearings the same man.
// ...and it does not swap hands front-to-back either. `wpn`'s `GSIDE`
// mirror is right for a piece that points along the facing; a rifle held
// across the chest is BEHIND the man on the three rear facings, so which
// screen side it lands on there is arbitrary — and flipping it cost
// another 0.03 of self-IoU for nothing a player can see at 26 px. The
// outer `MIR` still swaps it left-for-right with the facing, so the
// muzzle always leads the way he is walking.
(function () {
  // Carried across the body and CANTED — the muzzle drops toward the
  // leading hip. Level, an 8-unit slab at waist height read as a belt.
  //
  // A LONG rifle, and that is the whole budget. §2.1 asks for a "rifle
  // >= 9 px LONG held horizontal"; the gate's `budget` field means the
  // THIN dimension, so the 9 had been entered as a demand for a NINE
  // PIXEL THICK weapon, which is a fence post. Corrected, the number is
  // an extent: the receiver runs 9.2 units (12 px) and the emitter fork
  // carries it another 2.6, so 9 columns of it stand clear of the body.
  //
  // THIS RIFLE IS WHY THE CHRONO LEGIONNAIRE IS THE ONE INFANTRYMAN
  // LEFT OUTSIDE THE RA2 ASPECT BAND, and it is a conflict between two
  // declared budgets rather than a fault in the art. He measures 28x30
  // (w:h 0.933) against RA2's 15x26 (0.577) — 62% too wide. Every route
  // to the band was built and MEASURED in the 2026-09-05 proportion
  // pass, and each one trades this gate for another:
  //
  //   STATURE [1.00,1.00], this rifle   23x35 r1.139 IN | spike 7/9 X
  //   ...with the rifle 15% longer      25x35 r1.238    | spike 9/9,
  //                                     but peerVsSelf.infantry 1 X
  //   ...longer rifle, [1.00,1.05]      25x38 r1.141 IN | peerVsSelf 1 X
  //   ...longer rifle, [0.95,1.02]      24x36 r1.156 IN | peerVsSelf 1 X
  //   height alone, [1.22,1.15]         28x41 r1.184 IN | peerVsSelf 1
  //                                     and a legibility confusable X
  //
  // The middle rows are this function's own trap, already recorded
  // above: the rifle is drawn in BODY space, so a longer one differs
  // MORE between the front-on and profile bearings, and his own
  // cross-bearing self-IoU falls (0.656 -> 0.617) until the Tesla
  // Trooper matches his outline better than he does — the exact
  // regression the last lengthening caused.
  //
  // And the arithmetic says no tuning fixes it. At his RA2-relative
  // height (RA2 puts him at 26 against the Conscript's 27; ours is 36,
  // so ~35) the +-20% band allows 24 px of width. `SPIKES.cleg.len = 9`
  // spends NINE of those on weapon standing clear of the body, leaving
  // 15 px for a man §2.1 calls the WIDEST Allied infantry — "shoulder
  // line >= 15 px, >= 20% wider than a GI's 12", which at our 1.38x
  // width scale is about 21 px. 15 < 21, so the two budgets cannot both
  // be met. The inconsistency is in the REFERENCE readings, not here:
  // RA2's own CLEG is 15 px wide IN TOTAL while carrying this rifle,
  // which proves its 9 px of rifle do not stand 9 columns clear of the
  // body — the gate reads §2.1's "9 px LONG" as a protrusion, and that
  // is stricter than the sprite the sentence cites.
  // So he stays wide, on purpose, and the debt is the aspect metric.
  // Re-reading `SPIKES.cleg.len` against the real CLEG rip is the fix;
  // do not shorten the rifle or stretch the man to bury it.
  var ry = by - 16.2;
  g.save();
  g.save();
  g.translate(cx, ry); g.rotate(0.30); g.translate(-cx, -ry);
  g.fillStyle = '#3f4753';
  g.beginPath(); g.roundRect(cx - 2.2, ry, 10.8, 2.2, 0.8); g.fill();
  outline(g, '#1c2026');
  g.fillStyle = '#7c8694';                                     // lit spine
  g.fillRect(cx - 1.9, ry + 0.25, 10.2, 0.8);
  g.fillStyle = '#272d36';                                     // grip
  g.beginPath(); g.roundRect(cx - 0.4, ry + 1.9, 1.6, 2.4, 0.5); g.fill();
  g.fillStyle = '#272d36';                                     // fore grip
  g.beginPath(); g.roundRect(cx + 4.2, ry + 1.9, 1.3, 1.8, 0.5); g.fill();
  // THE COIL IS CYAN. RA2's Chrono Legionnaire plate is dominated by one
  // colour that appears nowhere else in the game — the cold cyan of the
  // chrono beam, blazing off the muzzle across most of the picture. Ours
  // glowed in #cfe4f5, which is a pale blue-WHITE, and drawn `lighter`
  // over a bone-white suit it came out as plain white: the same note as
  // every muzzle flash on the field, carrying none of his identity. The
  // hue has to be real or the light is not his.
  g.save();                                                    // the coil, drawn as light
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgba(40,190,235,.34)';                        // bloom kept TIGHT: every
  g.beginPath();                                               // opaque pixel added here
  g.ellipse(cx + 6.8, ry + 1.0, 2.5, 2.4, 0, 0, 6.29); g.fill();  // dilutes his house block
  g.fillStyle = 'rgba(60,215,255,.55)';
  g.beginPath(); g.ellipse(cx + 6.8, ry + 1.0, 2.0, 1.9, 0, 0, 6.29); g.fill();
  g.fillStyle = '#4fdcff';                                     // the coil ring itself
  g.fillRect(cx + 6.2, ry - 0.6, 1.4, 3.4);
  g.fillStyle = '#e6fbff';                                     // its hot centre
  g.fillRect(cx + 6.45, ry + 0.1, 0.9, 1.9);
  g.restore();
  g.strokeStyle = '#9fb2c6'; g.lineWidth = 1.3;                // emitter fork
  g.beginPath();
  g.moveTo(cx + 8.4, ry + 1.1); g.lineTo(cx + 11.9, ry - 0.7);
  g.moveTo(cx + 8.4, ry + 1.1); g.lineTo(cx + 11.9, ry + 3.0); g.stroke();
  // ...and the charge standing between its prongs, which is what makes
  // the fork a chrono emitter rather than a bayonet.
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgba(60,215,255,.60)'; g.lineWidth = 1.8; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx + 11.5, ry - 0.2); g.lineTo(cx + 11.5, ry + 2.5); g.stroke();
  g.strokeStyle = '#cdf6ff'; g.lineWidth = 0.9;
  g.beginPath();
  g.moveTo(cx + 11.5, ry - 0.2); g.lineTo(cx + 11.1, ry + 1.2);
  g.lineTo(cx + 11.8, ry + 1.5); g.lineTo(cx + 11.5, ry + 2.5); g.stroke();
  g.restore();
  g.restore();
  g.restore();
}());

// A sealed dome, a dark faceplate and the hose down to the chest.
var chy = by - 22.3, chx = cx + sd * 1.1 / TURN + HEADX;
g.fillStyle = shade(T.coat, 1.5);
g.beginPath(); g.ellipse(chx, chy, 3.2 * (1 - 0.16 * sd), 3.3, 0, Math.PI, 0); g.fill();
g.fillRect(chx - 3.2 * (1 - 0.16 * sd), chy, 6.4 * (1 - 0.16 * sd), 1.8);
outline(g, shade(T.coat, 0.44));
g.fillStyle = shade(T.coat, 1.85);                             // lit crown
g.beginPath(); g.ellipse(chx - 1.0, chy - 1.5, 1.4, 0.75, -0.35, 0, 6.29); g.fill();
if (!FA.back) {
  g.fillStyle = '#2b323c';                                     // dark faceplate
  g.beginPath(); g.roundRect(chx + sd * 0.9 - 2.2, chy + 0.1, 4.4, 1.9, 0.7); g.fill();
  g.fillStyle = 'rgba(190,225,255,.55)';
  g.fillRect(chx + sd * 0.9 - 1.9, chy + 0.35, 1.6, 0.7);
  g.strokeStyle = '#616b79'; g.lineWidth = 1.1;                // breathing hose
  g.beginPath(); g.moveTo(chx + 2.2, chy + 1.8);
  g.quadraticCurveTo(chx + 4.2, chy + 3.6, chx + 3.0, chy + 5.4); g.stroke();
} else {
  g.fillStyle = shade(T.coat, 0.70);
  g.beginPath(); g.ellipse(chx, chy + 1.2, 2.5, 1.4, 0, 0, Math.PI); g.fill();
}
g.restore();
}

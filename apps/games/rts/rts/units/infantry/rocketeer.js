// ─── infantry/rocketeer ─── Iron Frontier unit art. Included into rts.html by tools/rts-build.py;
// every free identifier is a local of bakeInfantry() in rts.src.html — see art/units/README.md.

import { outline } from '../../bake/kit.js';
import { shade } from '../../bake/terrain.js';

export function drawRocketeer(C) {
  var FA = C.FA, HEADX = C.HEADX, T = C.T, TURN = C.TURN, ar = C.ar, arms = C.arms, by = C.by,
      carbine = C.carbine, col = C.col, cx = C.cx, face = C.face, g = C.g, gt = C.gt,
      helmet = C.helmet, sd = C.sd;

// ROCKETEER (Directorate). From the RA2 sprite and render: a grey
// pressure suit with a domed helmet and dark visor, a squat jet PACK
// on the back with a nozzle each side of the hips, legs hanging
// straight down together, and a compact machine gun across the chest.
// The house colour is the pack's twin tanks, the chest plate and the
// shin guards — as the sprite remaps them. The three "walk" frames are
// the jet flame: it flickers instead of striding, and drawUnit runs the
// cycle for as long as he is airborne.
// THE SUIT IS WHITE. RA2's Rocketeer is the whitest thing in the Allied
// roster — white armour against white cloud — and ours was a mid grey
// (#8d959f) carrying 34.6% owner colour, one of the highest on the
// board. Three passes tried to fix that with the VALUE LADDER and could
// not: a multiplier on `coat` moves almost nothing, because what you
// see of him is mostly owner colour and this suit const, neither of
// which the ladder touches. The lever is here.
var RS = '#ccd3db', RSD = shade(RS, 0.64), RSL = shade(RS, 1.22);
var fl = [5.2, 7.4, 6.2, 8.0, 5.6, 6.9][gt.ph], fw2 = [2.0, 2.5, 2.2, 2.6, 2.1, 2.4][gt.ph];
// jet flames first, behind the legs: white-blue core in an orange sheath
for (ar = -1; ar <= 1; ar += 2) {
  var jx = cx + ar * 4.6, jy = by - 8.4;
  g.fillStyle = 'rgba(255,140,40,.75)';
  g.beginPath(); g.moveTo(jx - fw2, jy); g.lineTo(jx + fw2, jy); g.lineTo(jx, jy + fl + 1.5); g.closePath(); g.fill();
  g.fillStyle = '#dff2ff';
  g.beginPath(); g.moveTo(jx - fw2 * 0.5, jy); g.lineTo(jx + fw2 * 0.5, jy); g.lineTo(jx, jy + fl * 0.72); g.closePath(); g.fill();
}
// legs hang together: two narrow trouser columns, boots toe-down
for (ar = -1; ar <= 1; ar += 2) {
  var lx = cx + ar * 1.7;
  g.fillStyle = shade(T.coat, ar < 0 ? 1.08 : 0.86);
  g.beginPath(); g.roundRect(lx - 1.6, by - 11.4, 3.2, 8.2, 1.0); g.fill(); outline(g, shade(T.coat, 0.46));
  g.fillStyle = col;                                          // house shin guard
  g.beginPath(); g.roundRect(lx - 1.4, by - 8.0, 2.8, 3.0, 0.6); g.fill();
  g.fillStyle = T.boot;
  g.beginPath(); g.roundRect(lx - 1.7, by - 3.6, 3.4, 3.6, 1.0); g.fill();
}
// jet nozzles at the hips
for (ar = -1; ar <= 1; ar += 2) {
  g.fillStyle = '#2b2f36';
  g.beginPath(); g.ellipse(cx + ar * 4.6, by - 8.6, 2.2, 1.3, 0, 0, 6.29); g.fill();
  g.fillStyle = '#6a717c';
  g.beginPath(); g.ellipse(cx + ar * 4.6, by - 9.0, 1.4, 0.7, 0, 0, 6.29); g.fill();
}
g.save(); g.translate(gt.lean * 0.4, 0);
// THE PACK IS THE HOUSE MASS, and it is now big enough to be one.
// §2.1 gives this unit exactly one identity feature — "AIR, not ground
// ... plus two pack tanks BEHIND the shoulders" — with a budget of
// "pack >= 4w x 6h and strictly below the helmet crown". It was drawn
// 3.2 units across, under the budget it is measured against, and the
// owner colour that should have been on it was on a full-width chest
// slab instead. So the tanks are proper pressure vessels: 4.6 across,
// 9.2 tall, banded, standing clear of the suit either side. They stay
// strictly below the crown (top at by-19.9 against a helmet at by-23.7).
for (ar = -1; ar <= 1; ar += 2) {
  var tx = cx + ar * 5.3;
  g.fillStyle = shade(col, 0.82);
  g.beginPath(); g.roundRect(tx - 2.3, by - 19.9, 4.6, 9.2, 1.8); g.fill(); outline(g, shade(col, 0.38));
  g.fillStyle = shade(col, 1.26);                             // lit barrel
  g.fillRect(tx - 1.8, by - 19.3, 1.5, 8.0);
  g.fillStyle = shade(col, 0.60);                             // strap bands round it
  g.fillRect(tx - 2.2, by - 17.4, 4.4, 0.9);
  g.fillRect(tx - 2.2, by - 13.6, 4.4, 0.9);
  g.fillStyle = '#3a3f47';                                    // steel cap
  g.beginPath(); g.ellipse(tx, by - 19.9, 2.3, 1.0, 0, 0, 6.29); g.fill();
  g.fillStyle = '#8b939d';
  g.beginPath(); g.ellipse(tx - 0.4, by - 20.1, 1.2, 0.5, 0, 0, 6.29); g.fill();
}
g.fillStyle = RS;                                             // suit torso
g.beginPath();
g.moveTo(cx - 5.2, by - 19.6); g.lineTo(cx + 5.2, by - 19.6);
g.lineTo(cx + 4.6, by - 11.0); g.lineTo(cx - 4.6, by - 11.0);
g.closePath(); g.fill(); outline(g, RSD);
g.fillStyle = RSL; g.fillRect(cx - 5.0, by - 19.4, 1.4, 8.0);  // lit edge
g.fillStyle = shade(RS, 0.6); g.fillRect(cx - 4.7, by - 12.6, 9.4, 1.4);   // harness belt
// ...and the CHEST is the pressure suit, with the house note cut into
// it as a chevron. §1.5's zone row for him reads "rounded dome / red
// chest plate / pack tanks", and this branch had taken that literally
// enough to paint the entire torso `col` and then hide most of it under
// white bands — a slab that measured as owner colour, read as neither,
// and put his 60x48 plate in the same picture as the G.I.'s: a
// house-coloured block filling the centre of the frame. The zone is
// still here and still on the chest; it is a BAND on armour now rather
// than armour on a band, and the mass it gave up went to the pack,
// which is the feature §2.1 actually names.
g.fillStyle = RSL;
g.beginPath();
g.moveTo(cx - 5.0, by - 19.5); g.lineTo(cx + 5.0, by - 19.5);
g.lineTo(cx + 4.4, by - 12.4); g.lineTo(cx - 4.4, by - 12.4);
g.closePath(); g.fill(); outline(g, shade(RS, 0.70));
g.fillStyle = shade(RS, 1.06); g.fillRect(cx + 0.4, by - 19.3, 4.0, 6.7);  // shaded far half
g.fillStyle = col;                                            // the chest chevron
g.beginPath();
g.moveTo(cx - 4.6, by - 19.4); g.lineTo(cx + 4.6, by - 19.4);
g.lineTo(cx + 4.2, by - 17.6); g.lineTo(cx, by - 16.0);
g.lineTo(cx - 4.2, by - 17.6);
g.closePath(); g.fill(); outline(g, shade(col, 0.42));
g.fillStyle = shade(col, 1.24); g.fillRect(cx - 4.4, by - 19.2, 3.0, 0.9);
g.fillStyle = shade(RS, 0.74);                                // the suit's own centre seam
g.fillRect(cx - 0.4, by - 15.8, 0.8, 3.3);
arms(5.6, by - 18.2, 3.0, 6.2, RS, function (i, x, y) {
  g.fillStyle = col;                                          // house-colour pauldron
  g.beginPath(); g.ellipse(x, y + 0.4, 2.2, 1.6, 0, 0, 6.29); g.fill();
  outline(g, shade(col, 0.42));
  g.fillStyle = shade(col, 1.22);
  g.beginPath(); g.ellipse(x - 0.5, y - 0.1, 1.1, 0.7, -0.3, 0, 6.29); g.fill();
});
g.fillStyle = '#3a3f47';                                      // gloves, hanging at his sides
g.beginPath(); g.roundRect(cx - 7.6, by - 12.2, 2.6, 2.2, 0.8); g.fill();
g.beginPath(); g.roundRect(cx + 5.2, by - 11.6, 2.6, 2.2, 0.8); g.fill();
// THE GUN COMES OFF THE CHEST. A dark weapon slashed diagonally across a
// torso is the G.I.'s single loudest shape, and this branch was drawing
// the same shape in the same place at the same value — which on a
// portrait-cropped 60x48 plate is most of what a glance gets, and is
// why `GI | Rocketeer` sat under RA2's bar with nothing else obviously
// wrong with either man. It is also wrong for the unit: §2.1 gives him
// "AIR, not ground", nothing about a weapon, and RA2's own plate shows
// him with the chest CLEAR and the gun down by the hip — port arms is a
// posture for a man who is standing on something.
carbine(cx + 1.4, by - 10.6, cx + 7.6, by - 8.4, 1.7);          // carried low, off the hip
face(by - 21.9);
helmet(by - 23.7, 3.3, '#aeb5bf', 0.95);                       // steel dome, not house colour
// A SEALED FLIGHT HELMET — there is no face in it. §2.1's read for him
// is "AIR, not ground", and the thing that says a man is not walking is
// that he has a flight helmet on: RA2's plate gives him a full mirrored
// visor wrapping the whole front of the dome, not the 2-unit letterbox
// band this drew. It matters more than its size suggests, because the
// sidebar crops an infantry cameo to a PORTRAIT — the head is a third
// of the picture — and measured on a 4x4 grid the entire top row of
// `GI | Rocketeer` was contributing 6% of the pair's distance, two
// bright domes over two bright plates. A dark visor is the one place on
// this figure where a large value change costs no owner colour at all.
if (!FA.back) {
  var vhx = cx + sd * 1.1 / TURN + HEADX, vw = 1 - 0.2 * sd;
  g.fillStyle = '#171d26';                                     // the visor, wrapped round
  g.beginPath();
  g.roundRect(vhx - 3.15 * vw, by - 24.0, 6.3 * vw, 3.4, 1.5); g.fill();
  g.fillStyle = '#0d1219';                                     // its dark lower half
  g.beginPath(); g.roundRect(vhx - 3.0 * vw, by - 22.4, 6.0 * vw, 1.7, 0.8); g.fill();
  g.fillStyle = 'rgba(150,205,255,.50)';                       // the sky in it, one hard streak
  g.beginPath();
  g.moveTo(vhx - 2.5 * vw, by - 23.5); g.lineTo(vhx - 0.5 * vw, by - 23.5);
  g.lineTo(vhx - 1.6 * vw, by - 21.9); g.lineTo(vhx - 2.7 * vw, by - 21.9);
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(210,235,255,.75)';
  g.fillRect(vhx - 2.4 * vw, by - 23.4, 1.1 * vw, 0.7);
  g.fillStyle = '#7d848f';                                     // the visor's steel surround
  g.fillRect(vhx - 3.2 * vw, by - 20.8, 6.4 * vw, 0.7);
}
g.restore();
}

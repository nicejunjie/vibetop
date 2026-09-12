// Iron Frontier — infantry/dog: the art for one unit.
// Called by bakeDog() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.





function bakeDog(col, fac, phase, dir, state) {

var s = unitCanvas(), g = s.g, cx = s.w / 2, by = s.h - UPAD;
g.translate(cx, by); g.scale(USC_I, USC_I); g.translate(-cx, -by);
// ...and the dog's own STATURE, about the same ground anchor, so coat,
// legs, tail and shadow all move together and the paws stay on the floor.
// The table has carried a `dog` row since it was written and NOTHING read
// it: the humanoid path applies STATURE, and a quadruped does not go
// through the humanoid path. It sat at [1.00, 1.00], so it looked like a
// deliberate "leave him alone" rather than the dead config it was. Setting
// it to anything at all moved not one pixel, which is a bad way to find
// out — the sweep that found this had to prove the EDIT had landed before
// it could trust its own null result.
var DSTA = STATURE.dog || STATURE._;
g.translate(cx, by); g.scale(DSTA[0], DSTA[1]); g.translate(-cx, -by);

var oct = INF_OCT[(((dir | 0) % 8) + 8) % 8];
var oa = oct * Math.PI / 4;
var hx = Math.sin(oa), fz = Math.cos(oa);
var MIR = hx < -0.01;
var sd = Math.abs(hx);                       // 0 = coming at you / going away, 1 = pure profile
var BACK = fz < -0.25;

var ST = DOG_SEQ[state] ? state : 'stand';
var nf = DOG_SEQ[ST], sph = (((phase | 0) % nf) + nf) % nf;

// Gait: a four-beat trot. The two diagonal pairs swing against each other
// and the spine lifts on the suspension frames, which is what stops a
// running dog reading as a sliding ornament.
var t = ST === 'walk' ? sph / nf * 6.2832 : 0;
var swA = ST === 'walk' ? Math.sin(t) : 0, swB = ST === 'walk' ? Math.sin(t + Math.PI) : 0;
// The suspension lift used `abs(sin(2t))`, and abs() is what made this a
// THREE-frame twitch instead of a six-frame trot. At six phases the stride
// `sin(t)` already gives phases 1 and 2 the same value (sin 60 = sin 120),
// and 4/5 likewise, and 0/3 are both zero — so the stride alone cannot
// separate them. `abs(sin(2t))` folds its own sign away and repeats on the
// same pairs, so nothing did. Measured: phases 0/3, 1/2 and 4/5 baked
// PIXEL-IDENTICAL, three distinct frames out of six.
// Dropping the abs and re-centring keeps the range and the two lifts per
// cycle a trot needs, while sin(2t) now takes +0.87 at phase 1 and -0.87 at
// phase 2 — the same trick the humanoid walk uses with `cf`, which is a
// quarter turn on the same cycle for exactly this reason (see THE WALK).
var bob = ST === 'walk' ? (1 + Math.sin(t * 2)) * 0.55 : 0;
// The leap: gather, launch (airborne, stretched), land.
var LEAP = ST === 'leap' ? sph : -1;
var air = LEAP === 1 ? 7.0 : (LEAP === 2 ? 2.2 : 0);
var stretch = LEAP === 1 ? 1.22 : (LEAP === 0 ? 0.86 : 1.0);

var TAN = '#a8763a', TANL = '#d09f5a', TAND = '#66421a';   // 2026-09-10: darker, browner; dog|tanya sat 0.0 over the friend-vs-foe floor
var BLK = '#22201c', BLKL = '#3d3830';
// The saddle is the animal's own black; the HOUSE colour is worn, never coat.
var SAD = '#26231e', SADD = '#141210', SADL = '#4a453c';
var HSE = col, HSED = shade(col, 0.60), HSEL = shade(col, 1.25);

shadowBlob(g, cx + (air ? 3 : 0), by, 8.2 * (0.55 + 0.45 * sd), 2.6);

if (MIR) { g.translate(cx, by); g.scale(-1, 1); g.translate(-cx, -by); }
g.translate(0, -air);

// The body's LENGTH is what foreshortens: head-on you see a chest and a
// face, in profile you see the whole animal. A shepherd is LOW — the
// barrel is about a quarter of the animal's length deep, and it sits high
// on long thin legs. Drawn any deeper it reads as a barrel on a table.
var L = (10.5 * (0.32 + 0.68 * sd)) * stretch;   // half-length, front is +x
var H = 3.7;                                     // half-depth of the barrel: a shepherd is deep-chested, not whippety
var bY = by - 9.4 - bob;                         // spine height above the ground
var W = 2.9 + 1.7 * (1 - sd);                    // chest width when seen end-on
var BL = Math.max(W, L * 0.92);                  // the drawn half-length

function leg(ox, sw, front) {
  var lx = cx + ox, ly = bY + H * 0.45;
  var kx = lx + sw * 2.2, ky = by - 3.4;
  var fxp = kx + sw * 1.3, fy = by - (ST === 'walk' ? Math.max(0, sw) * 1.5 : 0);
  g.strokeStyle = front ? TAN : TAND; g.lineWidth = 1.9; g.lineCap = 'round';
  g.beginPath(); g.moveTo(lx, ly); g.lineTo(kx, ky); g.lineTo(fxp, fy); g.stroke();
  g.strokeStyle = BLK; g.lineWidth = 1.7;         // black stockings, lower leg only
  g.beginPath(); g.moveTo(kx, ky + 0.5); g.lineTo(fxp, fy); g.stroke();
  g.lineWidth = 1;
}
// far pair first, then the barrel, then the near pair — the only way a
// quadruped reads as solid rather than as four sticks and a sausage.
leg(L * 0.52 - 1.2, swA, false);
leg(-L * 0.58 - 1.2, swB, false);

// Tail: HANGING, sabre-shaped, dark at the tip. A tail carried level and
// fluffed out behind is the strongest fox cue there is; a working
// shepherd's drops below the hocks and only the last third curves.
//
// ...and it is the TAIL, not the animal, that closed
// `size.infantryOutsideRA2Band`. The dog was the roster's last size
// outlier at 39 px broadside where the infantry group scale says 30 —
// +31% — and the obvious fix (shrink him) is a KNOWN DEAD END: a uniform
// STATURE shrink was tried at 0.94/0.90/0.84 and every row put
// `dog | tanya` under the friend-vs-foe floor at ZMIN (see
// docs/per-unit-art-log.md, "The dog's size and dog|tanya pull the same
// lever"). The way out is that the two gates read DIFFERENT quantities:
// the size gate reads the BBOX, and the CELL-96 legibility window reads
// an RMS over the MASS. The tail's last two pixels were 11 px of a 508 px
// animal — nearly free to the one and decisive to the other.
//
// So the reach came in from 1.34L to 1.17L (39 -> 37 px, dev +31% ->
// +24%) and the stroke went 2.6 -> 3.1 to put the lost mass back. The
// animal is not one pixel smaller: he now hangs a fuller tail more
// steeply, which is what a working shepherd's actually does. Measured:
// legibility.js output BYTE-IDENTICAL to before across all three windows,
// `dog | tanya` still 12.5 at zoom 1 and 9.5 at ZMIN.
//
// DO NOT let the reach back past 1.20L — 1.22L re-measures 38 px and puts
// the gate straight back into debt.
g.strokeStyle = TAND; g.lineWidth = 3.1; g.lineCap = 'round';
g.beginPath();
g.moveTo(cx - L * 0.92, bY + 0.4);
g.quadraticCurveTo(cx - L * 1.13, bY + 2.6 + swA * 0.5, cx - L * 1.17, bY + 6.4 + swA * 0.8);
g.stroke();
g.strokeStyle = BLK; g.lineWidth = 2.5;
g.beginPath();
g.moveTo(cx - L * 1.15, bY + 4.0 + swA * 0.5);
g.quadraticCurveTo(cx - L * 1.19, bY + 5.4 + swA * 0.7, cx - L * 1.17, bY + 6.6 + swA * 0.8);
g.stroke();
g.lineWidth = 1;

// Barrel of the body: deeper at the chest, tucked at the loin, so the
// silhouette has a waist instead of being one sausage.
var bcx = cx - L * 0.06;
function torso() {
  g.beginPath();
  g.moveTo(bcx - BL, bY + H * 0.05);
  g.quadraticCurveTo(bcx - BL * 0.55, bY - H * 1.12, bcx + BL * 0.30, bY - H * 1.00);
  g.quadraticCurveTo(bcx + BL * 0.98, bY - H * 0.92, bcx + BL, bY - H * 0.05);
  g.quadraticCurveTo(bcx + BL * 0.60, bY + H * 1.02, bcx - BL * 0.10, bY + H * 0.86);
  g.quadraticCurveTo(bcx - BL * 0.78, bY + H * 0.74, bcx - BL, bY + H * 0.05);
  g.closePath();
}
torso(); g.fillStyle = TAN; g.fill(); outline(g, TAND);
g.save(); torso(); g.clip();
g.fillStyle = TAND;                                            // belly in shadow
g.beginPath(); g.ellipse(bcx, bY + H * 0.92, BL * 0.95, H * 0.62, 0, 0, 6.29); g.fill();

// SADDLE — a German shepherd's black back marking. It follows the TOP of
// the back and drops onto the flank, so it is a marking on an animal
// rather than a lid on a bucket: the black mass over tan IS the breed.
g.fillStyle = SAD;
g.beginPath();
g.moveTo(bcx - BL, bY - H * 0.10);
g.quadraticCurveTo(bcx - BL * 0.5, bY - H * 1.20, bcx + BL * 0.34, bY - H * 1.05);
g.quadraticCurveTo(bcx + BL * 0.85, bY - H * 0.95, bcx + BL * 0.92, bY - H * 0.20);
g.quadraticCurveTo(bcx + BL * 0.30, bY + H * 0.24, bcx - BL * 0.30, bY - H * 0.08);
g.closePath(); g.fill();
g.strokeStyle = SADD; g.lineWidth = 0.9; g.stroke(); g.lineWidth = 1;
g.strokeStyle = SADL; g.lineWidth = 1.1;                       // one lit line along the spine
g.beginPath();
g.moveTo(bcx - BL * 0.82, bY - H * 0.62);
g.quadraticCurveTo(bcx - BL * 0.2, bY - H * 1.16, bcx + BL * 0.42, bY - H * 1.00);
g.stroke(); g.lineWidth = 1;
g.restore();

leg(L * 0.46 + 1.2, swB, true);
leg(-L * 0.52 + 1.2, swA, true);

// ---- neck + head ---------------------------------------------------
// The head is set FORWARD and low — a dog on the hunt carries it level
// with the spine, not up like a show pose. On the leap it is thrown out.
var hxo = L * 0.92 + (LEAP === 1 ? 2.2 : 0);
// ...and a HEAD NOD on `cos(t)`, which is the only term in this gait with
// the full cycle's period. Stride is sin(t) and lift is sin(2t), and both
// are ZERO at phases 0 and 3, so those two frames baked pixel-identical
// however the other two were tuned — a dog cannot be told apart from
// itself half a stride later. cos(t) is +1 and -1 there. This is the same
// job `cf` does in the humanoid walk, which the comment there calls "what
// keeps all six frames distinct".
var nod = ST === 'walk' ? Math.cos(t) * 0.75 : 0;
var hyo = bY - 3.6 - (LEAP >= 0 ? 1.6 : 0) + (ST === 'walk' ? bob * 0.4 + nod : 0);
g.strokeStyle = TAN; g.lineWidth = 4.2; g.lineCap = 'round';
g.beginPath(); g.moveTo(cx + L * 0.55, bY - H * 0.35); g.lineTo(cx + hxo - 1.2, hyo + 1.4); g.stroke();
g.lineWidth = 1;
// The house colour, all of it: a broad collar at the base of the neck and
// a harness strap over the withers. Small surfaces, but they are the only
// saturated pixels on the animal, so they still read at 1:1.
g.lineCap = 'butt';
g.strokeStyle = HSE; g.lineWidth = 2.6;
g.beginPath(); g.moveTo(cx + L * 0.60, bY - H * 0.98); g.lineTo(cx + L * 0.74, bY + H * 0.34); g.stroke();
g.strokeStyle = HSED; g.lineWidth = 0.8;
g.beginPath(); g.moveTo(cx + L * 0.71, bY - H * 0.96); g.lineTo(cx + L * 0.85, bY + H * 0.32); g.stroke();
g.strokeStyle = HSEL; g.lineWidth = 1.4;
g.beginPath(); g.moveTo(cx + L * 0.28, bY - H * 1.04); g.lineTo(cx + L * 0.38, bY + H * 0.08); g.stroke();
g.lineCap = 'round'; g.lineWidth = 1;

var hw = 2.8 + 1.1 * (1 - sd), hh = 2.9;   // a shepherd's head is a wedge, not a point
g.fillStyle = TAN;
g.beginPath(); g.ellipse(cx + hxo, hyo, hw, hh, 0, 0, 6.29); g.fill();
outline(g, TAND);
// Ears: two pricked triangles. Seen from behind they are the only thing
// that shows, which is what makes a going-away dog legible.
g.fillStyle = BACK ? TAND : TAN;
for (var e = 0; e < 2; e++) {
  var ex = cx + hxo - 0.8 + (e ? 1.9 : -1.0) * (0.35 + 0.65 * (1 - sd));
  g.beginPath();
  g.moveTo(ex - 1.1, hyo - 1.6); g.lineTo(ex + 0.2, hyo - 5.0); g.lineTo(ex + 1.3, hyo - 1.5);
  g.closePath(); g.fill(); outline(g, TAND);
  g.fillStyle = BLKL;
  g.beginPath(); g.moveTo(ex - 0.4, hyo - 2.0); g.lineTo(ex + 0.2, hyo - 4.2); g.lineTo(ex + 0.7, hyo - 2.0); g.closePath(); g.fill();
  g.fillStyle = BACK ? TAND : TAN;
}
if (!BACK) {
  // Muzzle: the black snout is the whole reason a dog reads as a dog.
  var mxo = cx + hxo + (1.6 + 1.4 * sd), myo = hyo + 0.9;
  // A shepherd's muzzle is long, BLOCKY and black-masked -- but only the
  // muzzle: mask the whole head and the dog loses its face and reads as a
  // black blob on a tan body.
  g.fillStyle = TAN;
  g.beginPath(); g.ellipse(mxo - 1.1, myo - 0.1, 2.1 + sd * 0.8, 1.5, 0, 0, 6.29); g.fill();
  outline(g, TAND);
  g.fillStyle = BLK;
  g.beginPath(); g.ellipse(mxo + (0.5 + sd * 0.5), myo + 0.15, 1.65 + sd * 0.6, 1.2, 0, 0, 6.29); g.fill();
  g.fillStyle = '#0d0b08';
  g.beginPath(); g.ellipse(mxo + (1.5 + sd * 0.9), myo - 0.05, 0.95, 0.85, 0, 0, 6.29); g.fill();
  // Open jaw on the leap: the bite is the frame that has to sell it.
  if (LEAP === 1) {
    g.fillStyle = '#7a2020';
    g.beginPath(); g.moveTo(mxo - 1.4, myo + 0.3); g.lineTo(mxo + 1.6, myo + 0.2); g.lineTo(mxo - 0.4, myo + 2.6); g.closePath(); g.fill();
    g.fillStyle = '#f2f0e6';
    g.beginPath(); g.moveTo(mxo - 0.2, myo + 0.6); g.lineTo(mxo + 1.3, myo + 0.5); g.lineTo(mxo + 0.5, myo + 1.7); g.closePath(); g.fill();
  }
  g.fillStyle = '#120e0a';                   // eye
  g.beginPath(); g.ellipse(cx + hxo + 0.6 * (0.4 + sd), hyo - 0.5, 0.65, 0.7, 0, 0, 6.29); g.fill();
}
return s;
}

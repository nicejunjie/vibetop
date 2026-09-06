#!/usr/bin/env node
/**
 * A CONTROL FOR `peerVsSelf`, WITH NO ART IN IT.
 *
 *   node apps/games/rts/tools/peer-vs-self-control.js
 *
 * `art-metrics.js`'s `peerVsSelf` asks "across every relative orientation, is a
 * peer's shape closer to mine than my own rotations are?", and its own comment
 * says it has "no threshold to tune" — which is true, and is exactly why it is
 * so easy to believe. This file runs the SAME arithmetic on shapes that cannot
 * have an art defect: plain filled rectangles.
 *
 * WHY IT EXISTS. The metric has been fixed once already. Until 2026-09-05 it
 * compared two different quantities — self over 28 DIFFERENT-bearing pairs
 * against peer over 8 SAME-bearing pairs — so rotating an elongated hull
 * collapsed the self term while the peer term stood still. That confound was
 * measured (corr(aspect, selfIoU) = -0.737) and removed by averaging both sides
 * over the same cross-bearing set, on the argument that "the aspect term
 * appears on both and cancels".
 *
 * IT DOES NOT CANCEL. What cancels is a unit's aspect being CONSTANT and large.
 * What survives is a unit's aspect CHANGING across bearings, and that is a
 * different property: the fix removed the static confound and left the variance
 * one. This file is the proof, and it is a proof rather than a correlation
 * because both sides are rectangles.
 *
 * THE MECHANISM, in one sentence: `self` is the mean dissimilarity WITHIN a
 * unit's own cloud of eight silhouettes, `peer` is the mean dissimilarity from
 * that cloud to another unit's; so a compact peer parked near the cloud's
 * CENTRE beats the cloud's own spread, for the same reason the mean distance
 * between two random points of a disc exceeds the mean distance from the disc
 * to its centre. It is a property of means. No art can be drawn that escapes
 * it, which is why the sweep in per-unit-art-log.md could not close the V3's
 * row even with the missile DELETED.
 *
 * WHAT IT PRINTS. Two blocks:
 *
 *  1. The V3's own eight measured aspect ratios, rebuilt as equal-area
 *     rectangles, against a peer of eight IDENTICAL rectangles at their mean.
 *     The margin comes out at -0.0786 against the V3's measured -0.0787 — the
 *     whole of that unit's failure, reproduced with no missile, no truck, no
 *     colour and no pixels of art.
 *
 *  2. A sweep of aspect swing. The sign flips at a swing of 1.0 — that is, at
 *     ANY directionality at all — so the only silhouette this row can be
 *     satisfied by is one that does not change when the unit turns. That is the
 *     opposite of what it is for, and it is the same complaint the 2026-09-05
 *     comment makes about the version it replaced: "it punished units for being
 *     DIRECTIONAL, which is the property that makes a silhouette readable".
 *     The magnitude fell; the sign did not move.
 *
 * WHAT THIS FILE DOES NOT DO. It does not change the metric. Repairing it moves
 * `peerVsSelf.naval` (5 rows) and `peerVsSelf.vehicle` (1) together, which is a
 * six-row change to a ratcheted gate and belongs to whoever owns that decision,
 * not to a pass scoped at one unit. What it does is make the arithmetic cheap
 * to re-run so the next pass does not spend another day drawing against it.
 */
'use strict';

/** One filled rectangle, in the same {w,h,d} shape `art-metrics.js` decodes to. */
function rect(w, h) { return { w, h, d: new Uint8Array(w * h).fill(1) }; }

/**
 * Silhouette IoU with both masks centred on their bbox centre — a VERBATIM copy
 * of `art-metrics.js`'s `iou()`. Copied rather than imported on purpose: this
 * file is a control, and a control that shares an implementation with the thing
 * it is checking can only ever agree with it.
 */
function iou(A, B) {
  const H = Math.max(A.h, B.h) + 4, W = Math.max(A.w, B.w) + 4;
  const ay = (H - A.h) >> 1, ax = (W - A.w) >> 1;
  const by = (H - B.h) >> 1, bx = (W - B.w) >> 1;
  const c = new Uint8Array(W * H);
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++)
    if (A.d[y * A.w + x]) c[(y + ay) * W + (x + ax)] |= 1;
  for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++)
    if (B.d[y * B.w + x]) c[(y + by) * W + (x + bx)] |= 2;
  let inter = 0, union = 0;
  for (let i = 0; i < c.length; i++) { const v = c[i]; if (v) { union++; if (v === 3) inter++; } }
  return union ? inter / union : 0;
}

/**
 * `art-metrics.js`'s `crossIoU`, on two arrays of eight masks: all 64 ordered
 * bearing pairs, minus the 8 identical ones when a unit is compared to itself.
 */
function crossIoU(P, Q, same) {
  let s = 0, n = 0;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    if (same && i === j) continue;
    s += iou(P[i], Q[j]); n++;
  }
  return s / n;
}

/** Eight equal-area rectangles at the given aspects — a "unit" that swings. */
function swinging(aspects, area) {
  return aspects.map((a) => {
    const h = Math.round(Math.sqrt(area / a));
    return rect(Math.max(1, Math.round(a * h)), Math.max(1, h));
  });
}
/** Eight identical rectangles at one aspect — a "unit" that does not. */
function compact(aspect, area) {
  const h = Math.round(Math.sqrt(area / aspect));
  const r = rect(Math.max(1, Math.round(aspect * h)), Math.max(1, h));
  return Array.from({ length: 8 }, () => r);
}

const AREA = 2400;                       // ~the V3's own mean opaque count
// The V3's eight MEASURED bbox aspects, octants 0-7 (art-metrics, 2026-09-06).
const V3_ASPECTS = [1.167, 0.867, 1.167, 1.455, 1.000, 0.557, 1.000, 1.455];

const R = (v) => (v >= 0 ? '+' : '') + v.toFixed(4);

function run() {
  const L = [];
  L.push('peerVsSelf control — filled rectangles, no art, art-metrics\' own arithmetic');
  L.push('');

  const mean = V3_ASPECTS.reduce((a, b) => a + b, 0) / V3_ASPECTS.length;
  const A = swinging(V3_ASPECTS, AREA);
  const B = compact(mean, AREA);
  const selfA = crossIoU(A, A, true);
  const peerAB = crossIoU(A, B, false);
  const selfB = crossIoU(B, B, true);

  L.push('  1. THE V3\'S OWN SWING, AS RECTANGLES');
  L.push(`     A = 8 rectangles at the V3's measured aspects ${Math.min(...V3_ASPECTS)}..${Math.max(...V3_ASPECTS)}`);
  L.push(`     B = 8 identical rectangles at their mean, ${mean.toFixed(3)} (${B[0].w}x${B[0].h})`);
  L.push('');
  L.push(`     cross(A,A)  self  = ${selfA.toFixed(4)}`);
  L.push(`     cross(A,B)  peer  = ${peerAB.toFixed(4)}`);
  L.push(`     margin A          = ${R(selfA - peerAB)}   ${peerAB > selfA ? 'A IS BEATEN BY B' : 'A is ok'}`);
  L.push(`     margin B          = ${R(selfB - peerAB)}   ${peerAB > selfB ? 'B is beaten' : 'B is ok'}`);
  L.push('');
  L.push('     The V3 measures -0.0787 in the game. Neither rectangle has a missile,');
  L.push('     a truck, a colour or a defect; the swing alone reproduces the row.');
  L.push('');

  L.push('  2. HOW MUCH DIRECTIONALITY IT TAKES TO FAIL');
  L.push('     A = 8 rectangles spread geometrically over `swing`, B = 8 at their mean.');
  L.push('');
  L.push('     swing   self      peer      margin');
  for (const s of [1.0, 1.1, 1.2, 1.4, 1.6, 1.8, 2.0, 2.4, 2.8]) {
    const asp = Array.from({ length: 8 }, (_, i) => Math.exp(Math.log(s) * (i / 7 - 0.5)));
    const m = asp.reduce((a, b) => a + b, 0) / asp.length;
    const sa = crossIoU(swinging(asp, AREA), swinging(asp, AREA), true);
    const ab = crossIoU(swinging(asp, AREA), compact(m, AREA), false);
    L.push(`     ${s.toFixed(1)}     ${sa.toFixed(4)}    ${ab.toFixed(4)}    ${R(sa - ab)}`
         + (ab > sa ? '   BEATEN' : ''));
  }
  L.push('');
  L.push('     The sign flips at the first step off 1.0. A silhouette that never');
  L.push('     changes as the unit turns is the only one this row cannot fault.');
  return L.join('\n');
}

module.exports = { rect, iou, crossIoU, swinging, compact, run, V3_ASPECTS, AREA };

if (require.main === module) console.log(run());

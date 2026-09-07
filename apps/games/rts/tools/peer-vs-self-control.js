#!/usr/bin/env node
/**
 * THE CONTROL FOR `peerVsSelf` — AND, SINCE 2026-09-06, ITS REGRESSION TEST.
 *
 *   node apps/games/rts/tools/peer-vs-self-control.js          # no browser, ~1s
 *   node apps/games/rts/tools/peer-vs-self-control.js --bite    # + a real bake
 *
 * `art-metrics.js`'s `peerVsSelf` asks whether a unit's eight silhouettes are
 * distinguishable from a peer's, and its own comment says it has "no threshold
 * to tune" — which is true, and is exactly why it was so easy to believe. This
 * file runs the SAME arithmetic on shapes that cannot have an art defect:
 * plain filled rectangles.
 *
 * ── WHY IT EXISTS ────────────────────────────────────────────────────────
 * The metric has been wrong twice, both times by measuring how much a hull
 * CHANGES SHAPE AS IT TURNS rather than whether two units look alike.
 *
 *   Until 2026-09-05 it compared two different quantities — self over 28
 *   DIFFERENT-bearing pairs against peer over 8 SAME-bearing pairs — so
 *   rotating an elongated hull collapsed the self term while the peer term
 *   stood still. Measured (corr(aspect, selfIoU) = -0.737) and removed by
 *   averaging both sides over the same cross-bearing set, on the argument that
 *   "the aspect term appears on both and cancels".
 *
 *   IT DID NOT CANCEL. What cancels is a unit's aspect being CONSTANT. What
 *   survives is a unit's aspect CHANGING across bearings, and that is a
 *   different property: the fix removed the static confound and left the
 *   variance one. This file was written to prove that, and it is a proof
 *   rather than a correlation because both sides are rectangles.
 *
 * THE MECHANISM, in one sentence: `self` is the mean dissimilarity WITHIN a
 * unit's own cloud of eight silhouettes, `peer` is the mean dissimilarity from
 * that cloud to another unit's; so a compact peer parked near the cloud's
 * CENTRE beats the cloud's own spread, for the same reason the mean distance
 * between two random points of a disc (0.905 R) exceeds the mean distance from
 * the disc to its centre (0.667 R). It is a property of means. No art can be
 * drawn that escapes it, which is why the sweep in per-unit-art-log.md could
 * not close the V3's row even with the missile DELETED.
 *
 * ── THE REPAIR THIS FILE NOW GUARDS ──────────────────────────────────────
 * The missing term was the PEER's own spread. `art-metrics.js` now counts the
 * unbiased two-sample kernel statistic over the two clouds of eight, with
 * silhouette IoU (the Jaccard kernel) as its kernel:
 *
 *     OLD:  flag if  cross(k,p) - self(k) > 0
 *     NEW:  flag if  self(k) + self(p) - 2*cross(k,p) < 0
 *
 * The old test is the new one with `self(p)` missing, which is precisely why a
 * spread cloud lost to a compact one: it was charged for its own spread and
 * given no credit for the peer's.
 *
 * A NOTE ON SIGN, because two conventions are in circulation and they differ
 * only by a minus. This file prints the OLD estimator the way `art-metrics.js`
 * TESTED it — `cross - self`, POSITIVE means flagged — so the V3's control
 * reads +0.0786 here. The first version of this file, the design-decisions
 * entry and the art-metrics block comment all quote the same measurement the
 * other way up, as `self - cross` = -0.0786 against the V3's measured -0.0787.
 * Same number, same conclusion; only "which way is bad" is reversed. The NEW
 * statistic is a squared distance, so NEGATIVE is the bad direction for it.
 *
 * ── WHAT IT PRINTS ───────────────────────────────────────────────────────
 *  1. THE CONTROL. The V3's own eight measured aspect ratios, rebuilt as equal-
 *     area rectangles, against a peer of eight IDENTICAL rectangles at their
 *     mean. The OLD margin comes out at +0.0786 against the V3's measured
 *     +0.0787 — the whole of that unit's failure, reproduced with no missile,
 *     no truck, no colour and no pixels of art. The NEW statistic must come
 *     out POSITIVE: rectangles differing only in aspect are not a defect, so
 *     a repair that still flags them is not a repair. THIS IS THE FIX'S OWN
 *     REGRESSION TEST and the script exits non-zero if it fails.
 *
 *  2. HOW MUCH DIRECTIONALITY IT TAKES TO FAIL. Both estimators over a sweep
 *     of aspect swing. The old one flips sign at a swing of 1.0 — that is, at
 *     ANY directionality at all — so the only silhouette it could be satisfied
 *     by is one that does not change when the unit turns; the opposite of what
 *     it is for, and the same complaint the 2026-09-05 comment makes about the
 *     version IT replaced. The new one never flips.
 *
 *  3. THE BITE. A metric that flags nothing is not a fix. Two rectangle
 *     "units" with the SAME swing, one a scaled near-copy of the other — a
 *     pair that really is confusable — swept from identical to plainly
 *     different, so the operating point is on the record rather than asserted.
 *     The script exits non-zero if the near-copy is NOT flagged.
 *
 *  4. `--bite` runs the real thing: `rts.html` re-baked through the `ART_HTML`
 *     override with one unit's art replaced by a scaled near-copy of a peer's,
 *     measured by `art-metrics.js` itself. Costs a browser, so it is opt-in.
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
 * That within-vs-cross convention is not a detail — it is exactly the unbiased
 * two-sample estimator's, which is why the repair below is one term and not a
 * new arithmetic.
 */
function crossIoU(P, Q, same) {
  let s = 0, n = 0;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    if (same && i === j) continue;
    s += iou(P[i], Q[j]); n++;
  }
  return s / n;
}

/** The OLD estimator's margin for P against peer Q. Positive => P was FLAGGED. */
function oldMargin(P, Q) { return crossIoU(P, Q, false) - crossIoU(P, P, true); }
/** The NEW estimator. Negative => the pair is FLAGGED as indistinguishable. */
function mmd2(P, Q) {
  return crossIoU(P, P, true) + crossIoU(Q, Q, true) - 2 * crossIoU(P, Q, false);
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
/** Mean same-bearing IoU — what `iou.sameFactionOver75` reads, for scale. */
function sameBearing(P, Q) {
  let s = 0; for (let o = 0; o < 8; o++) s += iou(P[o], Q[o]);
  return s / 8;
}

const AREA = 2400;                       // ~the V3's own mean opaque count
// The V3's eight MEASURED bbox aspects, octants 0-7 (art-metrics, 2026-09-06).
const V3_ASPECTS = [1.167, 0.867, 1.167, 1.455, 1.000, 0.557, 1.000, 1.455];

const R = (v) => (v >= 0 ? '+' : '') + v.toFixed(4);

function run() {
  const L = [];
  const fail = [];
  L.push('peerVsSelf control — filled rectangles, no art, art-metrics\' own arithmetic');
  L.push('');
  L.push('  OLD estimator:  cross(k,p) - self(k)                > 0  => flagged');
  L.push('  NEW estimator:  self(k) + self(p) - 2*cross(k,p)    < 0  => flagged');
  L.push('');

  // ── 1. the control ──────────────────────────────────────────────────────
  const mean = V3_ASPECTS.reduce((a, b) => a + b, 0) / V3_ASPECTS.length;
  const A = swinging(V3_ASPECTS, AREA);
  const B = compact(mean, AREA);
  const oldA = oldMargin(A, B);
  const newAB = mmd2(A, B);

  L.push('  1. THE CONTROL — THE V3\'S OWN SWING, AS RECTANGLES');
  L.push(`     A = 8 rectangles at the V3's measured aspects ${Math.min(...V3_ASPECTS)}..${Math.max(...V3_ASPECTS)}`);
  L.push(`     B = 8 identical rectangles at their mean, ${mean.toFixed(3)} (${B[0].w}x${B[0].h})`);
  L.push('');
  L.push(`     self(A) = ${crossIoU(A, A, true).toFixed(4)}   self(B) = ${crossIoU(B, B, true).toFixed(4)}   cross(A,B) = ${crossIoU(A, B, false).toFixed(4)}`);
  L.push('');
  L.push(`     OLD margin A      = ${R(oldA)}   ${oldA > 0 ? 'FLAGGED — the bug' : 'clean'}`);
  L.push(`     NEW mmd2(A,B)     = ${R(newAB)}   ${newAB < 0 ? 'FLAGGED — STILL BROKEN' : 'NEUTRAL — repaired'}`);
  L.push('');
  L.push('     The V3 measured +0.0787 in the game under the OLD estimator — the same');
  L.push('     figure the design-decisions entry quotes as -0.0787, self-minus-cross.');
  L.push('     Neither rectangle has a missile, a truck, a colour or a defect; the');
  L.push('     swing alone reproduced the row. Under the NEW estimator the same shapes');
  L.push('     are neutral, and the V3\'s row closed with no art change whatsoever.');
  L.push('');
  if (!(newAB > 0)) fail.push(`(1) the rectangle control is still flagged: mmd2 = ${R(newAB)}`);
  if (!(oldA > 0)) fail.push('(1) the OLD estimator no longer reproduces the bug — this control has gone stale');

  // ── 2. the swing sweep ──────────────────────────────────────────────────
  L.push('  2. HOW MUCH DIRECTIONALITY IT TAKES TO FAIL');
  L.push('     A = 8 rectangles spread geometrically over `swing`, B = 8 at their mean.');
  L.push('');
  L.push('     swing   self(A)   cross     OLD margin       NEW mmd2');
  let oldFlips = 0, newFlips = 0;
  for (const s of [1.0, 1.1, 1.2, 1.4, 1.6, 1.8, 2.0, 2.4, 2.8]) {
    const asp = Array.from({ length: 8 }, (_, i) => Math.exp(Math.log(s) * (i / 7 - 0.5)));
    const m = asp.reduce((a, b) => a + b, 0) / asp.length;
    const P = swinging(asp, AREA), Q = compact(m, AREA);
    const om = oldMargin(P, Q), nm = mmd2(P, Q);
    if (om > 0) oldFlips++;
    if (nm < 0) newFlips++;
    L.push(`     ${s.toFixed(1)}     ${crossIoU(P, P, true).toFixed(4)}    ${crossIoU(P, Q, false).toFixed(4)}    ${R(om)}${om > 0 ? '  FLAGGED' : '        '}    ${R(nm)}${nm < 0 ? '  FLAGGED' : ''}`);
  }
  L.push('');
  L.push(`     OLD flagged ${oldFlips}/9 rows — the sign flips at the first step off 1.0, so`);
  L.push('     the only silhouette it could not fault is one that does not change as');
  L.push(`     the unit turns. NEW flagged ${newFlips}/9. Swing is not a defect and the`);
  L.push('     repaired statistic does not treat it as one.');
  L.push('');
  if (newFlips) fail.push(`(2) the repaired statistic still faults pure swing on ${newFlips}/9 rows`);
  if (!oldFlips) fail.push('(2) the OLD estimator no longer faults pure swing — this control has gone stale');

  // ── 3. the bite ─────────────────────────────────────────────────────────
  L.push('  3. THE BITE — A PAIR THAT REALLY IS CONFUSABLE');
  L.push('     A as above; C = the SAME eight aspects at `scale` of A\'s linear size.');
  L.push('     Two units drawn off one base mesh at slightly different sizes is a real');
  L.push('     art failure, and it is what this row exists to catch. `sameBearing` is');
  L.push('     what `iou.sameFactionOver75` reads, printed so the two metrics\' bands');
  L.push('     can be seen to tile instead of being asserted to.');
  L.push('');
  L.push('     scale   sameBearing   OLD margin       NEW mmd2');
  let bit = 0, firesTo = 0;
  for (const sc of [1.00, 0.98, 0.96, 0.95, 0.93, 0.90, 0.85, 0.75]) {
    const C = swinging(V3_ASPECTS, AREA * sc * sc);
    const om = oldMargin(A, C), nm = mmd2(A, C);
    if (nm < 0) { bit++; firesTo = sameBearing(A, C); }
    L.push(`     ${sc.toFixed(2)}    ${sameBearing(A, C).toFixed(4)}        ${R(om)}${om > 0 ? '  FLAGGED' : '        '}    ${R(nm)}${nm < 0 ? '  FLAGGED' : ''}`);
  }
  L.push('');
  L.push(`     NEW flagged ${bit}/8 rows, down to a same-bearing overlap of ${firesTo.toFixed(4)}.`);
  L.push('     Below that `iou.sameFactionOver75` (ceiling 0.75) owns the band, so the');
  L.push('     gate is not blind between them. NOTE THE OLD ESTIMATOR IS SILENT HERE:');
  L.push('     it cannot flag a near-copy that swings the same way it does, which is');
  L.push('     the failure the swing artefact was hiding.');
  L.push('');
  if (!bit) fail.push('(3) the repaired statistic flags NO near-copy — a metric that bites nothing is not a fix');

  L.push('  ── on the shipped art ─────────────────────────────────────────────');
  L.push('     The repaired row\'s one surviving finding is Destroyer/Aegis at mmd2');
  L.push('     -0.0337, the only negative on the board against +0.0281 for the next');
  L.push('     closest pair. Their same-bearing IoU is 0.724 — UNDER the 0.75 ceiling,');
  L.push('     so no other metric in the gate sees them. Run with --bite for a real');
  L.push('     bake through ART_HTML.');

  if (fail.length) {
    L.push('');
    L.push('  FAILED:');
    for (const f of fail) L.push('    ' + f);
  }
  return { text: L.join('\n'), fail };
}

// ── 4. the real bake, through ART_HTML ────────────────────────────────────
/**
 * Re-bakes `rts.html` with `victim`'s art replaced by a `scale`d near-copy of
 * `donor`'s, and measures it with `art-metrics.js` ITSELF — not with this
 * file's copy of the arithmetic. Rectangles prove the metric does not fault
 * swing; this proves the metric, as the gate actually runs it, still goes red
 * on a unit that has genuinely become a look-alike.
 */
async function bite(opts) {
  const fs = require('fs'), path = require('path'), os = require('os');
  const o = Object.assign({ victim: 'mirage', donor: 'prismtank', fac: 'dir', scale: 0.96 }, opts);
  const RTS = path.join(__dirname, '..');
  const patch = `
<script>
(function(){
  var S = window.__rtsTest.spr(), SC = ${o.scale};
  // The victim keeps its own sheet cell and its own draw path; only the pixels
  // change, so every other metric still measures a real, composable sprite.
  function near(arr){ return arr.map(function(s){
    if(!s) return s;
    var c = document.createElement('canvas'); c.width = s.c.width; c.height = s.c.height;
    var g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    var w = s.c.width * SC, h = s.c.height * SC;
    g.drawImage(s.c, (s.c.width - w) / 2, (s.c.height - h) / 2, w, h);
    return { c: c, w: s.w, h: s.h };
  }); }
  for (var i = 0; i < 2; i++) S.unit[i]['${o.fac}']['${o.victim}'] = near(S.unit[i]['${o.fac}']['${o.donor}']);
})();
</script>
</body>`;
  const src = fs.readFileSync(path.join(RTS, 'rts.html'), 'utf8');
  if (src.indexOf('</body>') < 0) throw new Error('rts.html has no </body> to patch');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvs-bite-'));
  const html = path.join(dir, 'rts.html');
  fs.writeFileSync(html, src.replace('</body>', patch));
  process.env.ART_HTML = html;                 // read by art-metrics' SERVE map
  const AM = require('./art-metrics.js');
  try {
    const m = await AM.measure();
    const L = [];
    const g = (k) => m.metrics[k];
    L.push('');
    L.push('  4. THE BITE, FOR REAL — rts.html re-baked through ART_HTML');
    L.push(`     ${o.victim} <- ${o.donor}'s art at ${o.scale}x, measured by art-metrics.js itself`);
    L.push('');
    for (const k of [o.victim, o.donor]) {
      const u = m.detail.perUnit[k];
      L.push(`     ${k.padEnd(10)} nearestPeer=${String(u.nearestPeer).padEnd(12)} mmd2=${R(u.nearestPeerMMD2)}`
           + `  peersBeatingSelf=${u.peersBeatingSelf}  bestPeerIoU=${u.bestPeerIoU}`);
    }
    L.push('');
    L.push(`     peerVsSelf.total    ${g('peerVsSelf.total')}   (2 on the shipped art)`);
    L.push(`     peerVsSelf.vehicle  ${g('peerVsSelf.vehicle')}   (0 on the shipped art)`);
    L.push(`     iou.sameFactionOver75  ${g('iou.sameFactionOver75')}`);
    L.push('');
    const red = g('peerVsSelf.vehicle') > 0;
    L.push(`     ${red ? 'FIRES — the repaired row goes red on a manufactured look-alike.'
                       : 'DID NOT FIRE — the repaired row is blind to a manufactured look-alike.'}`);
    return { text: L.join('\n'), fail: red ? [] : ['(4) the real re-bake did not flag the near-copy'] };
  } finally { delete process.env.ART_HTML; fs.rmSync(dir, { recursive: true, force: true }); }
}

module.exports = { rect, iou, crossIoU, oldMargin, mmd2, swinging, compact,
                   sameBearing, run, bite, V3_ASPECTS, AREA };

if (require.main === module) (async () => {
  const r = run();
  console.log(r.text);
  let fail = r.fail;
  if (process.argv.includes('--bite')) {
    const b = await bite();
    console.log(b.text);
    fail = fail.concat(b.fail);
  }
  if (fail.length) process.exitCode = 1;
})();

// The `peerVsSelf` control, made STANDING.
//
// `tools/peer-vs-self-control.js` is where the art gate's peer-vs-self row was
// proven to be measuring an artefact of its own construction rather than any
// art defect: run on plain filled RECTANGLES — shapes that cannot carry an art
// defect — the old estimator reproduced the V3 Launcher's whole failure to four
// decimal places. A control that only gets run when somebody remembers it is
// how that estimator survived a repair and a month of art passes, so it is
// asserted here instead.
//
// This tier is HERMETIC and takes ~60ms: rectangles need no browser, no atlas
// and no Playwright, which is the point of having the control be rectangles.
// The real bake through `ART_HTML` (the control's `--bite`) needs a browser and
// stays opt-in; `rts-art.test.js` owns everything that does.
//
// The three assertions mirror the three things the repair has to be at once:
//   1. NEUTRAL on pure aspect swing  — that was the bug.
//   2. Still able to BITE            — a metric that flags nothing is not a fix.
//   3. The OLD estimator still fails the control it was caught by — otherwise
//      this file is asserting nothing and nobody would know.

const { test } = require("node:test");
const assert = require("node:assert");
const C = require("./peer-vs-self-control.js");

const V3 = C.V3_ASPECTS;
const AREA = C.AREA;
const swing = () => C.swinging(V3, AREA);
const mean = V3.reduce((a, b) => a + b, 0) / V3.length;

test("the repaired statistic is NEUTRAL on shapes that differ only by aspect swing", () => {
  // THE BUG, as its own regression test. A = eight rectangles at the V3's own
  // measured aspects; B = eight IDENTICAL rectangles at their mean. B sits at
  // the centre of A's cloud, and the old test compared A's within-cloud spread
  // against A's distance to that centre — the disc-vs-centre artefact — so A
  // lost. Nothing about A is a defect: it is a rectangle.
  const A = swing(), B = C.compact(mean, AREA);
  const now = C.mmd2(A, B);
  assert.ok(now > 0,
    "rectangles differing only in aspect swing are flagged as confusable: mmd2 = "
    + now.toFixed(4) + ". That is the bug the repair removed — see "
    + "apps/games/rts/tools/peer-vs-self-control.js");

  // ...and not merely on this one aspect set. The old estimator flipped sign at
  // the FIRST step off a swing of 1.0, i.e. at any directionality at all, which
  // is the property that makes a silhouette readable.
  for (const s of [1.1, 1.2, 1.4, 1.6, 1.8, 2.0, 2.4, 2.8]) {
    const asp = Array.from({ length: 8 }, (_, i) => Math.exp(Math.log(s) * (i / 7 - 0.5)));
    const m = asp.reduce((a, b) => a + b, 0) / asp.length;
    const v = C.mmd2(C.swinging(asp, AREA), C.compact(m, AREA));
    assert.ok(v > 0, `swing ${s} is faulted with no art in it: mmd2 = ${v.toFixed(4)}`);
  }
});

test("...and it STILL BITES on a pair that really is confusable", () => {
  // Same swing on both sides, one a scaled near-copy of the other: two units
  // drawn off one base mesh at slightly different sizes, which is a real art
  // failure and exactly what this row is for. A statistic that never fires is
  // not a repaired metric, it is a deleted one.
  const A = swing();
  const clone = C.swinging(V3, AREA);
  assert.ok(C.mmd2(A, clone) < 0,
    "an exact copy is not flagged — the statistic cannot fire at all");
  const near = C.swinging(V3, AREA * 0.96 * 0.96);
  assert.ok(C.mmd2(A, near) < 0,
    "a 0.96x near-copy is not flagged: mmd2 = " + C.mmd2(A, near).toFixed(4));
  // The operating point, pinned so a future change to `iou()` or to the bearing
  // set cannot quietly slide it. It must stay INSIDE the band that
  // `iou.sameFactionOver75` (ceiling 0.75) does not cover, or the gate goes
  // blind between the two metrics.
  const at = C.sameBearing(A, near);
  assert.ok(at > 0.75, `the bite point has fallen to same-bearing ${at.toFixed(4)}, `
    + "at or below iou.sameFactionOver75's own ceiling — the two metrics no longer tile");
});

test("the OLD estimator still fails this control, so the control is not stale", () => {
  // Trap 1 of the art plan's §5: "a test whose assertion is made true by the
  // very line the fix adds proves nothing". The inverse also holds — a control
  // that no longer reproduces the defect it was written for is decoration. So
  // the broken arithmetic is kept alongside the repaired one and asserted to be
  // still broken.
  const A = swing(), B = C.compact(mean, AREA);
  const then = C.oldMargin(A, B);
  assert.ok(then > 0,
    "the OLD estimator no longer flags the rectangle control, so this file is "
    + "no longer testing the repair: " + then.toFixed(4));
  // The published figure, to 4 dp: the V3 itself measured 0.0787.
  assert.ok(Math.abs(then - 0.0786) < 5e-4,
    "the control's headline number moved: " + then.toFixed(4) + " vs the recorded 0.0786");
  // AND IT CANNOT DISCRIMINATE, which is the part that made it unusable rather
  // than merely wrong. It fires on the rectangle control AND on a real
  // near-copy, so a red row never said which you had — and it ranks them the
  // wrong way round: a plain aspect swing scores +0.0786 above, while a 0.95x
  // near-copy of the same shapes, overlapping 0.90 at every bearing, scores
  // only +0.0105, and by 0.93 it has gone silent on the near-copy entirely.
  const nearOld = C.oldMargin(A, C.swinging(V3, AREA * 0.95 * 0.95));
  assert.ok(then > nearOld * 2,
    "the OLD estimator no longer ranks pure aspect swing (" + then.toFixed(4)
    + ") above a genuine near-copy (" + nearOld.toFixed(4) + ")");
  assert.ok(C.oldMargin(A, C.swinging(V3, AREA * 0.93 * 0.93)) < 0,
    "the OLD estimator was supposed to have gone silent on a 0.93x near-copy");
});

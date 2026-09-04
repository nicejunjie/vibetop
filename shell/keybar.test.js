/* Unit tests for keybar.js (VibeKeybar.compute) — run with
 *   node --test landing/keybar.test.js
 *
 * THE FIXTURES ARE NOT INVENTED. Each one is a viewport state RECORDED on the
 * reporting iPhone (installed PWA, portrait, no-keyboard height 894) via the
 * POST /api/client-debug field beacons, during the v1.19.63–.84 key-bar saga
 * (docs/design-decisions.md). If compute() is ever changed, it must keep
 * passing against these real states — they are the ground truth the previous
 * eight fixes each contradicted in a new way.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { compute, PAD } = require("./keybar.js");

const BAR_H = 50;

// Common device constants (beacon-measured): baseline 894, terminal app frame
// bottom 806 in the big-window regime, xterm's last row bottom ~798 (ttyd pads
// the frame by ~8px).
const BASE = { innerH: 894, baseH: 894, barH: BAR_H };

test("big-window regime: bar at keyboard top, full lift", () => {
  // beacon: ih 894, vvH 480, vvTop 0, frameB 806 — occlusion 376
  const r = compute({ ...BASE, vvTop: 0, vvH: 480, frameBottom: 806, contentBottom: 798 });
  assert.equal(r.kbUp, true);
  assert.equal(r.barTop, 430);                    // 480 - 50, flush above the keyboard
  assert.equal(r.lift, 798 + PAD - 430);          // 372: last row ends at the bar's top
  // and the lifted last row really sits at the bar's top edge:
  assert.equal(798 - r.lift + PAD, r.barTop);
});

test("shell-scrolled regime: same formula, lift 0 (frame already clear)", () => {
  // beacon: ih 655, vvH 508, vvTop 239 (ih+vvTop == 894), frameB 567 (806-239 —
  // in-flow rects shift up by vvTop). The frame sits fully above the keyboard.
  const r = compute({ ...BASE, innerH: 655, vvTop: 239, vvH: 508, frameBottom: 567, contentBottom: 559 });
  assert.equal(r.kbUp, true);
  assert.equal(r.barTop, 697);                    // 747 - 50: fixed elements shift with the scroll,
  assert.equal(r.lift, 0);                        // so this paints flush above the keyboard too
});

test("the v347 regression case: a big-window reading must NOT be pulled toward a scrolled-regime anchor", () => {
  // The live-now bug: anchor 753 (learned while shell-scrolled) clamped the
  // CORRECT big-window vvBottom 480 to 693 -> barTop 643 (mid-screen, under the
  // keyboard) and occlusion 163 (garbage — both in the manager log). compute()
  // has no anchor: the instantaneous reading must win untouched.
  const r = compute({ ...BASE, vvTop: 0, vvH: 480, frameBottom: 806, contentBottom: 798 });
  assert.equal(r.barTop, 430);
  assert.notEqual(r.barTop, 643);
  assert.notEqual(r.lift, 163);
});

test("fully-scrolled transient (keyboard closing): lift 0, no harm", () => {
  // beacon: ih 480, vvH 480, vvTop 414 (self-inconsistent per spec; iOS emits
  // it for <1s during the close animation), frameB 388.
  const r = compute({ ...BASE, innerH: 480, vvTop: 414, vvH: 480, frameBottom: 388, contentBottom: 380 });
  assert.equal(r.kbUp, true);                     // still below baseline mid-close
  assert.equal(r.lift, 0);                        // frame far above the bar -> nothing to lift
});

test("resume-poisoned baseline: without the persisted prior the bar stays down; with it, correct", () => {
  // A PWA resumed WITH the keyboard up measures the shrunken viewport at load.
  const poisoned = compute({ innerH: 480, baseH: 480, barH: BAR_H, vvTop: 0, vvH: 480, frameBottom: 806, contentBottom: 798 });
  assert.equal(poisoned.kbUp, false);             // degraded (no bar) — heals on first close
  const withPrior = compute({ innerH: 480, baseH: 894, barH: BAR_H, vvTop: 0, vvH: 480, frameBottom: 806, contentBottom: 798 });
  assert.equal(withPrior.kbUp, true);             // persisted baseline makes resume correct
  assert.equal(withPrior.barTop, 430);
  assert.equal(withPrior.lift, 372);
});

test("pinyin candidates row: vvH shrinks ~45 more, bar and lift shift together", () => {
  const plain = compute({ ...BASE, vvTop: 0, vvH: 480, frameBottom: 806, contentBottom: 798 });
  const cand = compute({ ...BASE, vvTop: 0, vvH: 435, frameBottom: 806, contentBottom: 798 });
  assert.equal(cand.barTop, plain.barTop - 45);
  assert.equal(cand.lift, plain.lift + 45);       // content follows the bar up, same turn
});

test("keyboard-open animation ramp: intermediates track, converge, never freeze", () => {
  // vvH ramps 894 -> 480; each instant must produce a bar/lift consistent with
  // THAT instant (no gate may reject an event — the v1.19.69 lesson).
  let prevLift = -1;
  for (const vvH of [894, 800, 700, 600, 508, 480]) {
    const r = compute({ ...BASE, vvTop: 0, vvH, frameBottom: 806, contentBottom: 798 });
    if (vvH >= 894 - 150) { assert.equal(r.kbUp, false); continue; }
    assert.equal(r.barTop, vvH - BAR_H);
    assert.equal(r.lift, Math.max(0, 802 - r.barTop));
    assert.ok(r.lift >= prevLift);                // monotone as the keyboard rises
    prevLift = r.lift;
  }
});

test("fresh terminal (one prompt line at the top): no lift, the prompt stays visible", () => {
  // contentBottom ~120 (tab bar + one row). The old design lifted by the frame
  // unconditionally and would have pushed a top-row prompt off-screen.
  const r = compute({ ...BASE, vvTop: 0, vvH: 480, frameBottom: 806, contentBottom: 120 });
  assert.equal(r.kbUp, true);
  assert.equal(r.lift, 0);
});

test("half-full terminal: lift only what the content needs", () => {
  const r = compute({ ...BASE, vvTop: 0, vvH: 480, frameBottom: 806, contentBottom: 500 });
  assert.equal(r.lift, 500 + PAD - 430);          // 74 — content bottom to bar top
});

test("content scan unavailable: fall back to the frame (over-lift beats under-lift)", () => {
  const r = compute({ ...BASE, vvTop: 0, vvH: 480, frameBottom: 806, contentBottom: null });
  assert.equal(r.lift, 806 - 430);                // 376
});

test("keyboard down: kbUp false, lift 0, nothing reserved", () => {
  const r = compute({ ...BASE, vvTop: 0, vvH: 894, frameBottom: 806, contentBottom: 798 });
  assert.equal(r.kbUp, false);
  assert.equal(r.lift, 0);
});

test("URL-bar collapse (~60px) is not a keyboard", () => {
  const r = compute({ ...BASE, vvTop: 0, vvH: 834, frameBottom: 806, contentBottom: 798 });
  assert.equal(r.kbUp, false);
});

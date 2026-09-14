'use strict';
// Pinch-zoom maths. The cases here are the ones a person finds by pinching a
// photo on a phone and noticing the picture slide out from under their fingers
// — which is exactly what a fixed-centre zoom plus a separate pan does.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('./pinch.js');

// Where a given image point currently appears on screen (centre-relative).
const screenOf = (ux, uy, s) => ({ x: s.px + s.z * ux, y: s.py + s.z * uy });
// ...and the inverse: what image point is under a screen point right now.
const imageAt = (x, y, s) => ({ ux: (x - s.px) / s.z, uy: (y - s.py) / s.z });

test('fingers twice as far apart zoom in twice', () => {
  const start = { ...P.pinchMetrics(-50, 0, 50, 0), z: 1, px: 0, py: 0 };
  const now = P.pinchMetrics(-100, 0, 100, 0);
  assert.equal(P.pinchStep(start, now).z, 2);
});

test('fingers half as far apart zoom back out', () => {
  const start = { ...P.pinchMetrics(-100, 0, 100, 0), z: 4, px: 0, py: 0 };
  const now = P.pinchMetrics(-50, 0, 50, 0);
  assert.equal(P.pinchStep(start, now).z, 2);
});

test('the point under the fingers stays under the fingers', () => {
  // THE invariant. Zooming about the box centre and panning by the midpoint
  // separately passes the two tests above and still feels broken, because the
  // picture drifts away from the hand doing the pinching.
  const start = { ...P.pinchMetrics(20, 10, 120, 110), z: 1.5, px: -30, py: 40 };
  const held = imageAt(start.cx, start.cy, start);        // what was grabbed
  const now = P.pinchMetrics(-40, 60, 160, 260);          // moved AND spread
  const after = P.pinchStep(start, now);
  const where = screenOf(held.ux, held.uy, after);
  assert.ok(Math.abs(where.x - now.cx) < 1e-9, `x drifted to ${where.x}, wanted ${now.cx}`);
  assert.ok(Math.abs(where.y - now.cy) < 1e-9, `y drifted to ${where.y}, wanted ${now.cy}`);
});

test('two fingers that keep their distance are a pure drag', () => {
  // People pan with two fingers without meaning to zoom; the separation wobbles
  // by a pixel and that must not feel like a zoom either.
  const start = { ...P.pinchMetrics(0, 0, 100, 0), z: 3, px: 10, py: 20 };
  const now = P.pinchMetrics(40, 70, 140, 70);            // translated by (40,70)
  const after = P.pinchStep(start, now);
  assert.equal(after.z, 3);
  assert.ok(Math.abs(after.px - 50) < 1e-9);
  assert.ok(Math.abs(after.py - 90) < 1e-9);
});

test('the zoom clamps, and the grabbed point stays put while it does', () => {
  // Pinching past the limit must not detach the picture from the fingers: the
  // clamped frame still has to anchor, or the image jumps when you hit the end.
  const start = { ...P.pinchMetrics(-50, 0, 50, 0), z: 5, px: 0, py: 0 };
  const held = imageAt(start.cx, start.cy, start);
  const now = P.pinchMetrics(-500, 0, 500, 0);            // 10x -> would be 50
  const after = P.pinchStep(start, now, 1, 6);
  assert.equal(after.z, 6);
  const where = screenOf(held.ux, held.uy, after);
  assert.ok(Math.abs(where.x - now.cx) < 1e-9);
});

test('pinching all the way shut stops at the minimum, not at zero or below', () => {
  const start = { ...P.pinchMetrics(-100, 0, 100, 0), z: 2, px: 5, py: 5 };
  assert.equal(P.pinchStep(start, P.pinchMetrics(0, 0, 1, 0), 1, 6).z, 1);
  // both fingers reported at the same pixel must not divide by zero
  const same = P.pinchMetrics(7, 7, 7, 7);
  assert.ok(same.dist > 0);
  assert.ok(Number.isFinite(P.pinchStep(start, same, 1, 6).z));
});

test('the midpoint is the midpoint, in both axes', () => {
  const m = P.pinchMetrics(-10, 4, 30, 24);
  assert.equal(m.cx, 10);
  assert.equal(m.cy, 14);
  assert.ok(Math.abs(m.dist - Math.hypot(40, 20)) < 1e-9);
});

test('both zoomable picture surfaces actually wire the pinch up', () => {
  // The maths passing proves nothing on its own: the bug reported was that two
  // fingers did nothing at all, which is a wiring bug, not an algebra one.
  const files = fs.readFileSync(
    path.join(__dirname, '..', 'apps', 'everyday', 'files', 'filesx.html'), 'utf8');
  const viewer = fs.readFileSync(
    path.join(__dirname, '..', 'apps', 'everyday', 'imageview', 'imageview.html'), 'utf8');
  for (const [name, src] of [['filesx.html', files], ['imageview.html', viewer]]) {
    assert.match(src, /src="\/pinch\.js"/, `${name} must load the shared module`);
    assert.match(src, /VibePinch\.pinchMetrics\(/, `${name} must measure the two fingers`);
    assert.match(src, /VibePinch\.pinchStep\(/, `${name} must drive the zoom from it`);
    // A second finger cannot be seen at all unless the page tracks pointers by
    // id — the original code kept a single `drag` object and overwrote it.
    assert.match(src, /pointerId/, `${name} must track pointers by id`);
  }
  // The browser steals a two-finger gesture unless the element opts out.
  assert.match(files, /\.ql-body img \{[^}]*touch-action: none/,
    'the Quick Look image must claim the gesture from the browser');
  assert.match(viewer, /\.stage \{[^}]*touch-action: none/);
});

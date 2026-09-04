const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, 'desktop.html'), 'utf8');

test('Claude and Codex compact limit bars retain relative reset countdowns', () => {
  const relativeFallbacks = src.match(/var mid\s*=\s*'· resets ' \+ (?:rtxt|reset);/g) || [];
  assert.equal(relativeFallbacks.length, 2,
    'both limit bars must prefer the relative countdown before exact-time-only text');
  const tightFallbacks = src.match(/var min\s*=\s*'· ' \+ (?:rtxt|reset);/g) || [];
  assert.equal(tightFallbacks.length, 2,
    'both bars must retain the countdown even at their tightest fit');
});

test('desktop independently checks the deployed build and cache-busts reloads', () => {
  assert.match(src, /fetch\('\/api\/update\?build=1', \{ cache: 'no-store' \}\)/);
  assert.match(src, /searchParams\.set\('vtbuild', Date\.now\(\)\)/);
});

test('desktop limit chips always show countdown and exact reset time', () => {
  assert.match(src, /grid-template-columns: repeat\(2, 360px\)/);
  const desktopFull = src.match(/!window\.matchMedia\('\(max-width: 680px\)'\)\.matches/g) || [];
  assert.equal(desktopFull.length, 2, 'Claude and Codex must both bypass compaction on desktop');
});

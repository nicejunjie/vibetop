const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'apph.js'), 'utf8');

function topClearanceClass(version, standalone) {
  const classes = new Set();
  const navigator = {
    userAgent: `Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/${version} Mobile/15E148 Safari/604.1`,
    standalone,
  };
  const matchMedia = () => ({ matches: standalone });
  const document = {
    readyState: 'loading',
    documentElement: {
      classList: {
        toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
      },
    },
    addEventListener() {},
  };
  const context = {
    window: { navigator, matchMedia }, navigator, matchMedia, document,
    localStorage: { getItem() { return null; } },
    location: { hash: '' },
    addEventListener() {}, setTimeout() {},
  };
  vm.runInNewContext(source, context, { filename: 'apph.js' });
  return classes.has('ios27-standalone');
}

test('top blur clearance applies only to iOS 27 installed web apps', () => {
  assert.equal(topClearanceClass('27.0', true), true);
  assert.equal(topClearanceClass('27.0', false), false);
  assert.equal(topClearanceClass('26.6.1', true), false);
});

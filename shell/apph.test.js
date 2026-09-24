const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'apph.js'), 'utf8');

function topEdgeClass(version, standalone) {
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

test('top-edge mitigation applies only to iOS 27 installed web apps', () => {
  assert.equal(topEdgeClass('27.0', true), true);
  assert.equal(topEdgeClass('27.0', false), false);
  assert.equal(topEdgeClass('26.6.1', true), false);
});

test('standalone height releases a transient oversize after the keyboard closes', () => {
  const listeners = {};
  const values = {};
  const root = {
    clientHeight: 894,
    classList: { toggle() {} },
    style: { setProperty(name, value) { values[name] = value; } },
  };
  const vv = { height: 894, addEventListener() {} };
  const navigator = { userAgent: 'iPhone Version/27.0', standalone: true };
  const win = { navigator, visualViewport: vv, innerWidth: 440,
    matchMedia() { return { matches: true }; }, addEventListener() {} };
  const doc = { readyState: 'loading', documentElement: root,
    addEventListener(name, fn) { listeners[name] = fn; } };
  const context = { window: win, navigator, document: doc,
    matchMedia: win.matchMedia, visualViewport: vv, screen: { height: 956 },
    location: { hash: '' }, localStorage: { getItem() { return null; } },
    addEventListener() {}, setTimeout() {},
  };
  vm.runInNewContext(source, context, { filename: 'apph.js' });
  listeners.DOMContentLoaded();
  assert.equal(values['--app-h'], '894px');

  // On resume, iOS can briefly include the 62px opaque status-bar strip.
  root.clientHeight = vv.height = 956;
  listeners.DOMContentLoaded();
  assert.equal(values['--app-h'], '956px');
  root.clientHeight = vv.height = 894;
  listeners.DOMContentLoaded();
  assert.equal(values['--app-h'], '894px');

  vv.height = 480; // keyboard only shrinks the visual viewport
  listeners.DOMContentLoaded();
  assert.equal(values['--app-h'], '894px');

  // iOS also has a shell-scrolled keyboard mode where clientHeight shrinks.
  root.clientHeight = 655;
  vv.height = 508;
  listeners.DOMContentLoaded();
  assert.equal(values['--app-h'], '894px');
});

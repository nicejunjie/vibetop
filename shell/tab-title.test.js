const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, 'desktop.html'), 'utf8');

function titleFn(stored) {
  const m = html.match(/var tabHost = '';[\s\S]*?\n  setTabTitle\(\);\n  function renderSysStats/);
  assert.ok(m, 'tab-title block present');
  const store = stored ? { 'vt:hostname': stored } : {};
  const ctx = { document: { title: 'Vibetop' },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } } };
  vm.runInNewContext(m[0].replace(/function renderSysStats$/, ''), ctx);
  return ctx;
}

test('the tab is titled with the host, not the focused app', () => {
  assert.equal(titleFn('moon-01').document.title, 'moon-01:vibetop');
  assert.equal(titleFn(null).document.title, 'Vibetop');
});

test('no code path titles the tab with an app label any more', () => {
  assert.equal(/document\.title\s*=[^;]*label/.test(html), false);
  assert.equal((html.match(/document\.title\s*=/g) || []).length, 1);
});

test('a heartbeat hostname updates and remembers the title, with or without system stats', () => {
  const ctx = titleFn(null);
  ctx.noteHostname('z20');
  assert.equal(ctx.document.title, 'z20:vibetop');
  assert.equal(titleFn('z20').document.title, 'z20:vibetop');
  assert.match(html, /noteHostname\(d\.hostname\);[^\n]*\n    if \(d\.system\) renderSysStats/);
  const server = fs.readFileSync(path.join(__dirname, '..', 'server', 'terminal-manager.py'), 'utf8');
  assert.equal((server.match(/"hostname": socket\.gethostname\(\),   # the tab title/g) || []).length, 2);
});

'use strict';
// The app registry is data the whole shell is built from — the Start menu, the
// taskbar, window titles and the desktop's own routing all read it. Nothing
// checked its SHAPE before it was a module; a typo in one entry showed up as a
// missing tile, at runtime, on whichever device happened to open the menu.
//
// These assert the contract every consumer relies on, not the contents: adding
// or renaming an app must not need a test edit, but breaking an entry must fail.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { APPS, ICON } = require('./appreg.js');

const ids = Object.keys(APPS);

test('every app carries what the menu and taskbar render', () => {
  assert.ok(ids.length >= 15, `expected the full inventory, got ${ids.length}`);
  for (const id of ids) {
    const a = APPS[id];
    assert.equal(typeof a.label, 'string', `${id}: label`);
    assert.ok(a.label.length, `${id}: label must not be empty`);
    assert.equal(typeof a.icon, 'string', `${id}: icon (emoji fallback) is required`);
    assert.ok(a.icon.length, `${id}: icon must not be empty`);
  }
});

test('an app is either a page or a client-side toggle, never neither', () => {
  for (const id of ids) {
    const a = APPS[id];
    const routable = typeof a.src === 'string' && a.src.startsWith('/');
    assert.ok(routable || a.toggle || a.hidden || a.section,
      `${id}: has no src, no toggle and no section — nothing could open it`);
    if (a.src !== undefined) assert.ok(a.src.startsWith('/'),
      `${id}: src must be a root-absolute URL (the web root is flat), got ${a.src}`);
  }
});

test('the SVG attach loop ran, and only onto apps that have an icon', () => {
  const withSvg = ids.filter((id) => APPS[id].svg);
  assert.ok(withSvg.length >= 10, 'the ICON -> APPS attach loop did not run');
  for (const id of withSvg) {
    assert.equal(APPS[id].svg, ICON[id], `${id}: svg must be its own ICON entry`);
    assert.match(APPS[id].svg, /^<svg/, `${id}: svg must be inline SVG markup`);
  }
  for (const id of Object.keys(ICON)) {
    assert.ok(ids.includes(id), `ICON has '${id}' but APPS does not — a dead icon`);
  }
});

test('hidden apps are registered but kept off the Start menu', () => {
  // video + imageview are opened by Files via postMessage, never launched. They
  // are in APPS only so the taskbar and window title can render them.
  const hidden = ids.filter((id) => APPS[id].hidden);
  assert.ok(hidden.includes('video'), 'the video player must stay registered');
  for (const id of hidden) assert.ok(APPS[id].src, `${id}: hidden apps still need a page`);
});

// The web root is FLAT and shell/install.sh deploys by WALKING the tree, so an
// APPS src that no source file produces is a 404 nobody sees until they click it.
// The deployed name is usually the basename, but the installer's RENDERED table
// renames a few (apps/utilities/services/index.html -> landing.html), so this
// reads that table rather than assuming — which is how it caught `home`.
test('every app src corresponds to a page the installer actually deploys', () => {
  const root = path.join(__dirname, '..');
  const found = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'tests') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) found.add(e.name);
    }
  };
  walk(path.join(root, 'shell'));
  walk(path.join(root, 'apps'));
  // …plus the installer's explicit renames.
  const sh = fs.readFileSync(path.join(root, 'shell', 'install.sh'), 'utf8');
  const table = sh.match(/RENDERED="\n([\s\S]*?)"/);
  assert.ok(table, 'could not find the RENDERED table in shell/install.sh');
  for (const line of table[1].trim().split('\n')) {
    const [, dst] = line.split('|');
    if (dst && dst.endsWith('.html')) found.add(dst.trim());
  }
  for (const id of ids) {
    const src = APPS[id].src;
    if (!src || src.endsWith('/')) continue;          // directory-served apps (ttyd, xpra…)
    const base = src.split('?')[0].split('#')[0].replace(/^\//, '');
    if (!base.endsWith('.html')) continue;
    assert.ok(found.has(base) || base === 'index.html',
      `${id}: src ${src} has no source page anywhere under shell/ or apps/`);
  }
});

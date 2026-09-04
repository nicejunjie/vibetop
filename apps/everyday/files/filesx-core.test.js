'use strict';
// The pure half of Files. These cases are the ones a human would have to click
// through a file manager to find — a name with no extension, a path with '..'
// past the root, a timestamp on a year boundary — and they cost nothing here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('./filesx-core.js');

// -- normPath: what the address bar accepts ---------------------------------

test('absolute, relative, ~ and . resolve against the folder in view', () => {
  assert.equal(C.normPath('/etc/hosts', '/home/j', '/home/j'), '/etc/hosts');
  assert.equal(C.normPath('docs', '/home/j', '/home/j'), '/home/j/docs');
  assert.equal(C.normPath('./docs', '/home/j', '/home/j'), '/home/j/docs');
  assert.equal(C.normPath('~', '/etc', '/home/j'), '/home/j');
  assert.equal(C.normPath('~/docs', '/etc', '/home/j'), '/home/j/docs');
});

test('.. climbs, and cannot climb past the root', () => {
  assert.equal(C.normPath('..', '/home/j/docs', '/home/j'), '/home/j');
  assert.equal(C.normPath('../..', '/home/j/docs', '/home/j'), '/home');
  // The bug this prevents: escaping to a path like '/..' that no server accepts.
  assert.equal(C.normPath('../../../../../..', '/home/j', '/home/j'), '/');
});

test('empty input is "no path", not the root', () => {
  // Returning '/' here would send a stray Enter in the address bar to the
  // filesystem root — a long way from where the user was standing.
  assert.equal(C.normPath('', '/home/j', '/home/j'), null);
  assert.equal(C.normPath('   ', '/home/j', '/home/j'), null);
  assert.equal(C.normPath(null, '/home/j', '/home/j'), null);
});

test('duplicate and trailing slashes collapse', () => {
  assert.equal(C.normPath('//home///j//', '/', '/home/j'), '/home/j');
  assert.equal(C.normPath('/', '/home/j', '/home/j'), '/');
});

// -- relParent: where a search hit actually lives ---------------------------

test('a hit in the current folder shows no parent, a deeper one shows the tail', () => {
  assert.equal(C.relParent('/home/j/a.txt', '/home/j'), '');
  assert.equal(C.relParent('/home/j/docs/a.txt', '/home/j'), 'docs');
  assert.equal(C.relParent('/home/j/docs/x/a.txt', '/home/j'), 'docs/x');
  // Outside the current folder entirely → the absolute dir, not a broken suffix.
  assert.equal(C.relParent('/etc/hosts', '/home/j'), '/etc');
});

test('relParent works from the root without doubling the slash', () => {
  assert.equal(C.relParent('/etc/hosts', '/'), 'etc');
});

// -- formatting -------------------------------------------------------------

test('sizes switch unit at the right boundary and keep one decimal while small', () => {
  assert.equal(C.fmtSize(0), '0 B');
  assert.equal(C.fmtSize(1023), '1023 B');
  assert.equal(C.fmtSize(1024), '1.0 KB');
  assert.equal(C.fmtSize(1024 * 1024), '1.0 MB');
  assert.equal(C.fmtSize(15 * 1024), '15 KB');          // >=10 loses the decimal
  assert.equal(C.fmtSize(1024 ** 4), '1.0 TB');
  assert.equal(C.fmtSize(1024 ** 5), '1024 TB');        // never runs off the unit table
});

test('relative times are injected a clock, so these are not a race', () => {
  const now = Date.UTC(2026, 5, 15, 12, 0, 0);
  const at = (secsAgo) => Math.floor(now / 1000) - secsAgo;
  assert.equal(C.fmtRel(at(10), false, false, now), 'just now');
  assert.equal(C.fmtRel(at(10), true, false, now), 'now');
  assert.equal(C.fmtRel(at(600), false, false, now), '10m ago');
  assert.equal(C.fmtRel(at(600), true, false, now), '10m');       // mobile: no " ago"
  assert.equal(C.fmtRel(at(7200), false, false, now), '2h ago');
  assert.equal(C.fmtRel(at(86400 * 3), false, false, now), '3d ago');
});

test('the exact-dates preference bypasses relative formatting entirely', () => {
  const now = Date.UTC(2026, 5, 15, 12, 0, 0);
  const ts = Math.floor(now / 1000) - 60;
  assert.notEqual(C.fmtRel(ts, false, true, now), '1m ago');
  assert.match(C.fmtRel(ts, false, true, now), /\d/);
});

test('permission bits render as rwx triplets', () => {
  assert.equal(C.fmtMode(0o755), 'rwxr-xr-x');
  assert.equal(C.fmtMode(0o644), 'rw-r--r--');
  assert.equal(C.fmtMode(0o000), '---------');
  assert.equal(C.fmtMode(0o777), 'rwxrwxrwx');
  assert.equal(C.fmtMode(0o100644), 'rw-r--r--');      // full st_mode, low 9 bits only
});

// -- type classification ----------------------------------------------------

test('a folder outranks any extension it happens to carry', () => {
  assert.equal(C.iconFor('my.pdf', true), '\u{1F4C1}');
  assert.equal(C.kindOf('my.pdf', true), 'Folder');
});

test('an unknown or absent extension still says something useful', () => {
  assert.equal(C.kindOf('README', false), 'File');
  assert.equal(C.kindOf('archive.xyz', false), 'XYZ file');
  assert.equal(C.kindOf('.bashrc', false), 'File');     // leading dot is not an extension
  assert.equal(C.iconFor('README', false), '\u{1F4C4}');
});

test('case does not decide the type', () => {
  assert.equal(C.iconFor('PHOTO.JPG', false), C.iconFor('photo.jpg', false));
  assert.equal(C.kindOf('DOC.PDF', false), C.kindOf('doc.pdf', false));
});

// -- the cross-language contract --------------------------------------------

test('the Office extension list matches the manager exactly', () => {
  // The client decides whether to OFFER "Edit in Office"; the server decides
  // whether to SERVE it. Drift means a file either offers an action that 404s
  // or hides one that would have worked. Nothing enforced this before.
  const py = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'server', 'terminal-manager.py'), 'utf8');
  const m = py.match(/OFFICE_RE = re\.compile\(\s*((?:r"[^"]*"\s*)+),?\s*(?:re\.I)?\s*\)/);
  assert.ok(m, 'could not find OFFICE_RE in server/terminal-manager.py');
  const serverPattern = m[1].replace(/r"|"|\s/g, '');
  const clientPattern = C.OFF_RE.source;
  const exts = (p) => new Set(p.replace(/^\\\.\(|\)\$$/g, '').split('|'));
  assert.deepEqual([...exts(clientPattern)].sort(), [...exts(serverPattern)].sort(),
    'filesx-core.js OFF_RE and terminal-manager.py OFFICE_RE list different extensions');
});

test('every KIND_MAP entry is a human phrase, not an extension echo', () => {
  for (const [ext, label] of Object.entries(C.KIND_MAP)) {
    assert.equal(typeof label, 'string');
    assert.ok(label.length > ext.length, `${ext}: "${label}" says nothing extra`);
  }
});

// -- name collision ---------------------------------------------------------

test('a taken name gains a counter before the extension, not after', () => {
  assert.equal(C.nextName('report.txt', 2), 'report (2).txt');
  assert.equal(C.nextName('report.txt', 3), 'report (3).txt');
  assert.equal(C.nextName('archive.tar.gz', 2), 'archive.tar (2).gz');
  assert.equal(C.nextName('README', 2), 'README (2)');
  assert.equal(C.nextName('.bashrc', 2), '.bashrc (2)');   // dot at 0 is not an extension
});

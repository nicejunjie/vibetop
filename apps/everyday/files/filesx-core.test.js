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

// -- gridStep: the arrow keys over a list or a grid of tiles ----------------

test('a flat list: Up/Down and Left/Right both walk the order and hold at the ends', () => {
  assert.equal(C.gridStep(2, 'ArrowDown', 1, 5), 3);
  assert.equal(C.gridStep(2, 'ArrowUp', 1, 5), 1);
  assert.equal(C.gridStep(2, 'ArrowRight', 1, 5), 3);
  assert.equal(C.gridStep(2, 'ArrowLeft', 1, 5), 1);
  assert.equal(C.gridStep(0, 'ArrowUp', 1, 5), 0);
  assert.equal(C.gridStep(4, 'ArrowDown', 1, 5), 4);
});

test('a grid: Up/Down move a whole line, Left/Right one tile', () => {
  // 4 per line, 10 tiles: lines are [0..3] [4..7] [8,9]
  assert.equal(C.gridStep(5, 'ArrowUp', 4, 10), 1);
  assert.equal(C.gridStep(1, 'ArrowDown', 4, 10), 5);
  assert.equal(C.gridStep(5, 'ArrowRight', 4, 10), 6);
  assert.equal(C.gridStep(4, 'ArrowLeft', 4, 10), 3);   // Left crosses to the previous line's end
});

test('a grid holds at the top and bottom lines instead of wrapping', () => {
  assert.equal(C.gridStep(2, 'ArrowUp', 4, 10), 2);
  assert.equal(C.gridStep(9, 'ArrowDown', 4, 10), 9);
  assert.equal(C.gridStep(0, 'ArrowLeft', 4, 10), 0);
  assert.equal(C.gridStep(9, 'ArrowRight', 4, 10), 9);
});

test('Down onto a short last line lands on its last tile, not nowhere', () => {
  // from tile 7 (line 2, column 4) there is no tile 11: Finder picks tile 9
  assert.equal(C.gridStep(7, 'ArrowDown', 4, 10), 9);
  assert.equal(C.gridStep(6, 'ArrowDown', 4, 10), 9);
});

test('with nothing selected any arrow picks the first item; an empty listing stays empty', () => {
  assert.equal(C.gridStep(-1, 'ArrowDown', 4, 10), 0);
  assert.equal(C.gridStep(-1, 'ArrowUp', 1, 10), 0);
  assert.equal(C.gridStep(-1, 'ArrowDown', 4, 0), -1);
  assert.equal(C.gridStep(3, 'ArrowDown', 4, 0), -1);
});

// -- retickRows: the listing's clock, when the folder itself never changes ---
//
// Files re-renders only when the DISK changes, so in a quiet folder every
// relative time froze at whatever it said when the folder was opened. These
// drive the real function over a minimal stand-in for the rendered rows.

function fakeRow(i, has) {
  const parts = {};
  if (has.mt) parts['.mt'] = { textContent: '', writes: 0 };
  if (has.meta) parts['.meta'] = { textContent: '', writes: 0 };
  for (const k of Object.keys(parts)) {
    const p = parts[k];
    Object.defineProperty(p, 'textContent', {
      get() { return p._t === undefined ? '' : p._t; },
      set(v) { p._t = v; p.writes++; },
    });
  }
  return { dataset: { i: String(i) }, parts, querySelector: (s) => parts[s] || null };
}
function fakeList(els) {
  return { querySelectorAll: (s) => (s === '.row' ? els : []) };
}

const T0 = 1_700_000_000;                       // the files' mtime, in seconds
const AT = (secs) => (T0 + secs) * 1000;        // wall clock, in ms

test('a row rendered as "just now" ages in place, without a re-render', () => {
  const rows = [{ name: 'a.txt', mtime: T0, size: 100, isDir: false }];
  const els = [fakeRow(0, { mt: true, meta: true })];
  const box = fakeList(els);

  C.retickRows(box, rows, { nowMs: AT(1) });
  assert.equal(els[0].parts['.mt'].textContent, 'just now');
  assert.equal(els[0].parts['.meta'].textContent, 'now · 100 B');

  // ...and ten minutes later the SAME node says so. This is the whole bug:
  // before retickRows nothing rewrote these until a file changed on disk.
  C.retickRows(box, rows, { nowMs: AT(600) });
  assert.equal(els[0].parts['.mt'].textContent, '10m ago');
  assert.equal(els[0].parts['.meta'].textContent, '10m · 100 B');
});

test('a label that has not changed is not rewritten', () => {
  // The tick runs every 30s forever; churning the DOM each time would fight
  // text selection and screen readers for no gain.
  const rows = [{ name: 'a.txt', mtime: T0, size: 100, isDir: false }];
  const els = [fakeRow(0, { mt: true, meta: true })];
  const box = fakeList(els);

  assert.equal(C.retickRows(box, rows, { nowMs: AT(600) }), 2);   // first paint
  assert.equal(C.retickRows(box, rows, { nowMs: AT(605) }), 0);   // still "10m"
  assert.equal(els[0].parts['.mt'].writes, 1);
  assert.equal(C.retickRows(box, rows, { nowMs: AT(660) }), 2);   // now "11m"
});

test('exact dates are skipped entirely — an absolute date never goes stale', () => {
  const rows = [{ name: 'a.txt', mtime: T0, size: 100, isDir: false }];
  const els = [fakeRow(0, { mt: true, meta: true })];
  assert.equal(C.retickRows(fakeList(els), rows, { exact: true, nowMs: AT(9e5) }), 0);
  assert.equal(els[0].parts['.mt'].writes, 0);
});

test('rows are found by dataset.i, not by position', () => {
  // The filter and the grid both leave the rendered elements out of step with
  // the array; indexing by position would put one file's time on another.
  const rows = [
    { name: 'old', mtime: T0 - 86400, size: 1, isDir: false },
    { name: 'new', mtime: T0, size: 1, isDir: false },
  ];
  const els = [fakeRow(1, { mt: true })];        // only the second row rendered
  C.retickRows(fakeList(els), rows, { nowMs: AT(60) });
  assert.equal(els[0].parts['.mt'].textContent, '1m ago');
});

test('a folder keeps its size half empty, and missing labels are tolerated', () => {
  const rows = [{ name: 'docs', mtime: T0, size: 4096, isDir: true }];
  const els = [fakeRow(0, { meta: true }), fakeRow(0, {})];   // one has no .mt
  C.retickRows(fakeList(els), rows, { nowMs: AT(3600) });
  assert.equal(els[0].parts['.meta'].textContent, '1h');      // no size for a dir
});

test('an empty listing and a row pointing past the array are no-ops', () => {
  assert.equal(C.retickRows(fakeList([]), [], { nowMs: AT(0) }), 0);
  const els = [fakeRow(7, { mt: true })];
  assert.equal(C.retickRows(fakeList(els), [{ mtime: T0, size: 1 }], { nowMs: AT(0) }), 0);
});

test('the Files page actually runs the tick on a timer', () => {
  // The unit above proves the function ages a label; this proves the page
  // calls it. The bug was never in the formatting — it was that nothing
  // re-ran it while the folder sat still.
  const html = fs.readFileSync(path.join(__dirname, 'filesx.html'), 'utf8');
  assert.match(html, /FilesxCore\.retickRows\(mainEl, rows, \{ exact: exactDates \}\)/);
  assert.match(html, /setInterval\(retick, RETICK_MS\)/);
  // and catches up the moment Files comes back to the front
  assert.match(html, /if \(on && !was\) \{ pollOnce\(\); retick\(\); \}/);
});

// -- an open preview follows the file, the way Quick Look does --------------

test('a preview reloads only when the bytes underneath it changed', () => {
  const w = { path: '/p/a.png', mtime: 100, size: 10 };
  assert.equal(C.previewReload(w, '/p/a.png', { ok: true, stat: { mtime: 100, size: 10 } }), null);
  assert.deepEqual(C.previewReload(w, '/p/a.png', { ok: true, stat: { mtime: 101, size: 10 } }),
    { path: '/p/a.png', mtime: 101, size: 10 });
  // size alone is enough: a rewrite inside one filesystem-timestamp tick is
  // exactly the case a "did the mtime move" check misses.
  assert.deepEqual(C.previewReload(w, '/p/a.png', { ok: true, stat: { mtime: 100, size: 11 } }),
    { path: '/p/a.png', mtime: 100, size: 11 });
});

test('a late answer about the PREVIOUS file never reloads the one on screen', () => {
  // The stat is in flight while the arrow keys walk the folder. Without the
  // path check, arrowing off a file just as its poll returns would repaint the
  // new preview with the old file's timestamp.
  const w = { path: '/p/b.png', mtime: 100, size: 10 };
  assert.equal(C.previewReload(w, '/p/a.png', { ok: true, stat: { mtime: 999, size: 99 } }), null);
});

test('a failed or missing stat says nothing at all', () => {
  // A file being rewritten can briefly stat as an error; blanking the preview
  // for that would be worse than showing it one second longer.
  const w = { path: '/p/a.png', mtime: 100, size: 10 };
  assert.equal(C.previewReload(w, '/p/a.png', { ok: false, code: 'enoent' }), null);
  assert.equal(C.previewReload(w, '/p/a.png', { ok: true }), null);
  assert.equal(C.previewReload(w, '/p/a.png', null), null);
  assert.equal(C.previewReload(null, '/p/a.png', { ok: true, stat: { mtime: 1, size: 1 } }), null);
});

test('the cache key is the content, so a reload is fetched and a reopen is not', () => {
  // Without this the <img> is re-pointed at a URL the browser already has and
  // the "refresh" shows the old picture.
  assert.equal(C.bustUrl('/api/file/image?path=%2Fa.png', 1700), '/api/file/image?path=%2Fa.png&v=1700');
  assert.equal(C.bustUrl('/x', 5), '/x?v=5');
  assert.equal(C.bustUrl('/x?a=1#toolbar=0', 5), '/x?a=1#toolbar=0&v=5');
  assert.equal(C.bustUrl('/x', undefined), '/x?v=0');
  // same bytes -> same URL -> the cache still works
  assert.equal(C.bustUrl('/x', 7), C.bustUrl('/x', 7));
});

test('a reader at the end of a growing file stays at the end', () => {
  // The reason to hold a text preview open at all is to watch something being
  // written, so this is the tail -f case.
  assert.equal(C.scrollAfterReload({ top: 900, clientH: 100, scrollH: 1000 },
                                   { top: 900, clientH: 100, scrollH: 1400 }), 1300);
  // "at the end" tolerates a few px of sub-pixel layout slack
  assert.equal(C.scrollAfterReload({ top: 897, clientH: 100, scrollH: 1000 },
                                   { top: 897, clientH: 100, scrollH: 1400 }), 1300);
});

test('a reader who scrolled up keeps their line', () => {
  assert.equal(C.scrollAfterReload({ top: 200, clientH: 100, scrollH: 1000 },
                                   { top: 200, clientH: 100, scrollH: 1400 }), 200);
  // ...but never past the end of a file that SHRANK under them
  assert.equal(C.scrollAfterReload({ top: 900, clientH: 100, scrollH: 2000 },
                                   { top: 900, clientH: 100, scrollH: 300 }), 200);
});

test('a preview shorter than its box asks for scrollTop 0, not a negative', () => {
  assert.equal(C.scrollAfterReload({ top: 0, clientH: 500, scrollH: 120 },
                                   { top: 0, clientH: 500, scrollH: 80 }), 0);
});

test('the Files page arms the watch for what it can follow, and not for media', () => {
  const html = fs.readFileSync(path.join(__dirname, 'filesx.html'), 'utf8');
  assert.match(html, /setInterval\(pvwTick, PVW_MS\)/);
  // every surface that can follow a file arms it...
  // call sites only (the declaration is `function pvwArm(`)
  assert.equal((html.match(/(?<!function )pvwArm\(/g) || []).length, 5,
    'each followable preview surface must arm the watch: QL image/pdf/text, the text overlay, the PDF overlay');
  // ...and every close disarms it, so a background timer cannot outlive the panel
  assert.match(html, /function qlStop\(\) \{\s*\n\s*pvwDisarm\(\);/);
  assert.match(html, /function closePreview\(\) \{\s*\n\s*pvwDisarm\(\);/);
  assert.match(html, /function closePdf\(\) \{\s*\n\s*pvwDisarm\(\);/);
  // Reloading a <video> mid-playback is an interruption, not a refresh: the
  // media branch must return before any arm.
  const media = html.match(/var isVid = QL_VID_RE\.test\(name\);[\s\S]*?\n    \}/);
  assert.ok(media, 'the Quick Look media branch must be present');
  assert.doesNotMatch(media[0], /pvwArm/, 'video and audio must not be auto-reloaded');
});

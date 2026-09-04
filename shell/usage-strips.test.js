const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The strips moved to usage-strips.js in v1.19.273; the build-check block did
// not — it is still inline in desktop.html. Read each from where it lives.
const src = fs.readFileSync(path.join(__dirname, 'usage-strips.js'), 'utf8');
const shell = fs.readFileSync(path.join(__dirname, 'desktop.html'), 'utf8');

test('Claude and Codex compact limit bars retain relative reset countdowns', () => {
  const relativeFallbacks = src.match(/var mid\s*=\s*'· resets ' \+ (?:rtxt|reset);/g) || [];
  assert.equal(relativeFallbacks.length, 2,
    'both limit bars must prefer the relative countdown before exact-time-only text');
  const tightFallbacks = src.match(/var min\s*=\s*'· ' \+ (?:rtxt|reset);/g) || [];
  assert.equal(tightFallbacks.length, 2,
    'both bars must retain the countdown even at their tightest fit');
});

test('desktop independently checks the deployed build and cache-busts reloads', () => {
  assert.match(shell, /fetch\('\/api\/update\?build=1', \{ cache: 'no-store' \}\)/);
  assert.match(shell, /searchParams\.set\('vtbuild', Date\.now\(\)\)/);
});

test('desktop limit chips always show countdown and exact reset time', () => {
  assert.match(shell, /grid-template-columns: repeat\(2, 360px\)/);   // CSS stays inline
  const desktopFull = src.match(/!window\.matchMedia\('\(max-width: 680px\)'\)\.matches/g) || [];
  assert.equal(desktopFull.length, 2, 'Claude and Codex must both bypass compaction on desktop');
});

// -- behaviour, driven through the REAL module in a vm sandbox --------------
//
// Same approach as coach.test.js: no jsdom, just enough DOM for the module to
// load, so the assertions run against the shipped source rather than a copy of
// its logic. The point of this block is the seam — these strips talk to the main
// shell script only through window globals, and that seam was silently broken.

const vm = require('node:vm');

// Comments are prose: "the `pushDesktop()` call" and "window.pushDesktop = ..."
// both look like code to a regex. Strip them before any structural analysis.
// …and string literals are prose too ("Turn off Claude Limit (all devices)").
const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
                .replace(/([^:])\/\/.*$/gm, '$1')
                .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
                .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');

function el(id) {
  const node = {
    id, innerHTML: '', style: {}, onclick: null, dataset: {},
    _classes: new Set(),
    get className() { return [...node._classes].join(' '); },
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, getBoundingClientRect: () => ({ width: 360, height: 20 }),
    appendChild() {}, removeChild() {}, remove() {},
  };
  node.classList = {
    add: (c) => node._classes.add(c),
    remove: (c) => node._classes.delete(c),
    toggle: (c, on) => (on === undefined ? (node._classes.has(c) ? node._classes.delete(c) : node._classes.add(c))
                                         : (on ? node._classes.add(c) : node._classes.delete(c))),
    contains: (c) => node._classes.has(c),
  };
  return node;
}

function load(source) {
  const nodes = {
    'cu-strip': el('cu-strip'), 'cx-strip': el('cx-strip'),
    'cu-x': el('cu-x'), 'cx-x': el('cx-x'), 'sm-util-parent': el('sm-util-parent'),
  };
  const rows = { claudeusage: el('row-claude'), codexusage: el('row-codex') };
  const posted = [];
  const document = {
    getElementById: (id) => nodes[id] || null,
    querySelector: (sel) => {
      const m = sel.match(/data-id="([a-z]+)"/);
      return m && !sel.includes('.cu-on') ? rows[m[1]] || null : null;
    },
    querySelectorAll: () => [],
    addEventListener() {}, createElement: () => el('new'),
    body: el('body'), documentElement: el('html'), hidden: false,
  };
  const sandbox = {
    document, console, Date, Math, JSON, String, Number, Object, Array,
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    fetch: (url, opt) => { posted.push({ url, opt }); return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.matchMedia = () => ({ matches: false, addEventListener() {} });
  sandbox.addEventListener = () => {};
  sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  vm.runInNewContext(source, sandbox, { filename: 'usage-strips.js' });
  return { sandbox, nodes, rows, posted };
}

test('loading the module defines all four shell callbacks and throws nothing', () => {
  const { sandbox } = load(src);
  for (const fn of ['applyServerClaudeUsage', 'toggleClaudeUsage',
                    'applyServerCodexUsage', 'toggleCodexUsage']) {
    assert.equal(typeof sandbox[fn], 'function', `${fn} must be published on window`);
  }
});

test('the server state drives the strip and the Start-menu row accent', () => {
  const { sandbox, nodes, rows } = load(src);
  const now = Math.floor(Date.now() / 1000);
  sandbox.applyServerClaudeUsage(true, {
    enabled: true, session: { pct: 42, reset: now + 3600 }, weekly: { pct: 10, reset: now + 86400 },
  });
  assert.ok(rows.claudeusage.classList.contains('cu-on'), 'the menu row must show it is on');
  assert.match(nodes['cu-strip'].innerHTML, /42/, 'the session percentage must render');
  sandbox.applyServerClaudeUsage(false, { enabled: false });
  assert.ok(!rows.claudeusage.classList.contains('cu-on'), 'turning it off must clear the accent');
});

// THE REGRESSION TEST — and note what it does NOT do. The original defect was a
// bare `pushDesktop()` call to a function that lived inside desktop.html's main
// IIFE and was never published, so it threw a ReferenceError into the .catch on
// the same line. That is invisible at runtime BY CONSTRUCTION: the catch cleared
// the same state the success path cleared, and the 5s heartbeat then pushed
// anyway. A sandbox test cannot see it either — defining `pushDesktop` in the
// sandbox makes the bare call work, which is precisely the fixed condition.
//
// So this checks the defect's SIGNATURE instead: a cross-file call written as a
// bare identifier. Both sides are derived (the module's own definitions vs. the
// names it calls), so it fails on the pre-fix source and needs no edit when the
// module changes. Verified red against the bare-call version.
test('the module never calls a shell function by bare name — only through window', () => {
  const defined = new Set([...code.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]));
  for (const m of code.matchAll(/var\s+([A-Za-z_$][\w$]*)\s*=\s*function/g)) defined.add(m[1]);
  const BUILTIN = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'typeof',
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'parseInt', 'parseFloat',
    'isNaN', 'String', 'Number', 'Boolean', 'Array', 'Object', 'Date', 'Math', 'JSON', 'RegExp',
    'Promise', 'fetch', 'encodeURIComponent', 'decodeURIComponent', 'requestAnimationFrame',
    'document', 'window', 'else', 'do', 'try', 'new', 'delete', 'void', 'in', 'of']);
  const bare = new Set();
  for (const m of code.matchAll(/(^|[^\w$.])([A-Za-z_$][\w$]*)\s*\(/gm)) {
    const name = m[2];
    if (defined.has(name) || BUILTIN.has(name)) continue;
    bare.add(name);
  }
  assert.deepEqual([...bare], [],
    `these are called by bare name but defined nowhere in this file: ${[...bare].join(', ')} — ` +
    `a cross-file call must be written window.<name>(...) or it is a ReferenceError ` +
    `that the surrounding .catch will swallow (see the header comment).`);
});

// The call itself must still happen: the whole point of the toggle pushing is that
// the OTHER devices update now rather than up to 5s later.
for (const [name, toggle, endpoint] of [
  ['Claude', 'toggleClaudeUsage', '/api/claude/usage'],
  ['Codex', 'toggleCodexUsage', '/api/desktop/ui'],
]) {
  test(`toggling the ${name} strip POSTs, then pushes the new state immediately`, async () => {
    const { sandbox, posted } = load(src);
    let pushed = 0;
    sandbox.pushDesktop = () => { pushed++; };
    sandbox[toggle]();
    assert.ok(posted.some((p) => p.url === endpoint), `expected a POST to ${endpoint}`);
    await new Promise((r) => setTimeout(r, 10));      // let the promise chain settle
    assert.equal(pushed, 1,
      'the toggle must push the new state at once, not wait up to 5s for the heartbeat');
  });
}

// The other half of the contract lives in desktop.html: usage-strips.js calls
// window.pushDesktop, so the shell must publish it. Derived from the module, so
// adding another cross-file call here fails until the shell publishes that too.
test('every window.* function the module calls is published by the shell', () => {
  const called = new Set([...code.matchAll(/window\.([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]));
  const selfPublished = new Set([...code.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)].map((m) => m[1]));
  const DOM = new Set(['matchMedia', 'addEventListener', 'removeEventListener', 'setTimeout',
                       'clearTimeout', 'fetch', 'getComputedStyle', 'requestAnimationFrame']);
  const needed = [...called].filter((n) => !selfPublished.has(n) && !DOM.has(n));
  assert.ok(needed.length, 'expected at least one cross-file call (window.pushDesktop)');
  for (const n of needed) {
    assert.match(shell, new RegExp(`window\\.${n}\\s*=`),
      `usage-strips.js calls window.${n}() but shell/desktop.html never publishes it — ` +
      `the call would be a silent no-op.`);
  }
});

test('the strips survive a shell that never published pushDesktop', () => {
  const { sandbox } = load(src);
  assert.doesNotThrow(() => sandbox.toggleClaudeUsage(), 'must not require pushDesktop to exist');
});

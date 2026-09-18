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

test('the reauth landing does not reload for ever (2026-09-12)', () => {
  // 1) vtreauth is stripped on load, like vtbuild: leaving it in the URL keeps
  //    the shell network-only under the SW, so a freshly deployed version is
  //    never re-cached and a post-re-login version mismatch reloads endlessly.
  assert.match(shell, /\['vtbuild', 'vtreauth'\]\.forEach/,
    'both vtbuild and vtreauth must be cleaned from the URL on load');
  // 2) the no-op-reload circuit breaker must gate the actual reload, not just
  //    the build poll — otherwise the SSE `hello` and SW `controllerchange`
  //    paths (both ungated) loop for ever against a stale cached shell.
  const doReload = shell.match(/function doReload\(\) \{[\s\S]*?\n  \}/);
  assert.ok(doReload, 'doReload() must be present');
  assert.match(doReload[0], /if \(pollRefreshBlocked\) \{[\s\S]*?return;/,
    'doReload must bail out once the breaker has tripped, so no trigger can loop');
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
    // Start-menu rows carry a `.sm-desc` line ("On — plan usage strip" / "Off");
    // it is the only place either strip can say anything to the user, so the
    // stub has to hand one back rather than null.
    querySelector: (sel) => (String(sel).indexOf('sm-desc') >= 0
      ? (node._desc || (node._desc = el(id + '-desc'))) : null),
    querySelectorAll: () => [],
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

function load(source, opts) {
  const reply = (opts && opts.reply) || { ok: true, status: 200 };
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
    // fetch RESOLVES on a 403 — that is the whole point of the refusal tests
    // below, so the stub must be able to answer with one.
    fetch: (url, opt) => { posted.push({ url, opt }); return Promise.resolve(
      Object.assign({ json: () => Promise.resolve({}) }, reply)); },
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

// A REFUSED toggle must not read as a flaky one. Claude-usage is operator-only
// (`_is_admin()`), so a 403 is the ORDINARY reply for every non-admin who clicks
// that row — and `fetch` resolves on it. With no `r.ok` the refusal ran the
// success path: the guard window was cleared, the optimistic ON state stayed up,
// and the next 5s heartbeat carried the server's unchanged value and flipped the
// row back OFF. The user saw a switch that does not stick; the reason was in the
// status code the code never read.
for (const [name, toggle, rowId] of [
  ['Claude', 'toggleClaudeUsage', 'claudeusage'],
  ['Codex', 'toggleCodexUsage', 'codexusage'],
]) {
  test(`a refused ${name} toggle reverts at once and says why`, async () => {
    const { sandbox, rows } = load(src, { reply: { ok: false, status: 403 } });
    sandbox.pushDesktop = () => {};
    sandbox[`applyServer${name}Usage`](false, { enabled: false });   // starts OFF
    assert.equal(rows[rowId].classList.contains('cu-on'), false);

    sandbox[toggle]();                                               // user turns it ON
    assert.equal(rows[rowId].classList.contains('cu-on'), true, 'optimistic while in flight');
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(rows[rowId].classList.contains('cu-on'), false,
      'the server refused, so the switch must go back NOW — not silently 5s later ' +
      'when a heartbeat happens to contradict it');
    assert.match(rows[rowId].querySelector('.sm-desc').textContent, /operator/i,
      'and a 403 must be reported as what it is: this feature is operator-only');
  });

  test(`an unreachable server also reverts the ${name} toggle`, async () => {
    const { sandbox, rows } = load(src, { reply: { ok: false, status: 500 } });
    sandbox.pushDesktop = () => {};
    sandbox[`applyServer${name}Usage`](false, { enabled: false });
    sandbox[toggle]();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(rows[rowId].classList.contains('cu-on'), false, 'a 500 is not a yes');
    assert.match(rows[rowId].querySelector('.sm-desc').textContent, /\S/,
      'and it must say something rather than leave the row looking idle');
  });
}

test('the strips survive a shell that never published pushDesktop', () => {
  const { sandbox } = load(src);
  assert.doesNotThrow(() => sandbox.toggleClaudeUsage(), 'must not require pushDesktop to exist');
});

// A five-day-old Codex reading rendered as "8121m ago" — minutes stayed the unit
// long past the point where anyone counts in them.
test('the reading age is shown in the unit a person would use', () => {
  const { sandbox, nodes } = load(src);
  const now = Math.floor(Date.now() / 1000);
  const base = { enabled: true, session: { pct: .4, reset: now + 3600 }, weekly: { pct: .1, reset: now + 86400 } };
  sandbox.applyServerCodexUsage(true, Object.assign({}, base, { ageSec: 8121 * 60 }));
  assert.match(nodes['cx-strip'].innerHTML, /5d ago/);
  assert.doesNotMatch(nodes['cx-strip'].innerHTML, /8121m/);
  sandbox.applyServerCodexUsage(true, Object.assign({}, base, { ageSec: 3 * 3600 + 20 }));
  assert.match(nodes['cx-strip'].innerHTML, /3h ago/);
  sandbox.applyServerCodexUsage(true, Object.assign({}, base, { ageSec: 7 * 60 }));
  assert.match(nodes['cx-strip'].innerHTML, /7m ago/);
  sandbox.applyServerClaudeUsage(true, Object.assign({}, base, { ageSec: 2 * 86400 + 3600 }));
  assert.match(nodes['cu-strip'].innerHTML, /2d ago/);
});

// When the account cannot be asked, the server says so in `note`; the strip
// shows it, beside the log-based numbers when there are any and instead of the
// "waiting" text when there are none.
test('a weekly-only Codex reading keeps the session slot so week stays aligned', () => {
  const { sandbox, nodes } = load(src);
  sandbox.applyServerCodexUsage(true, { enabled: true, session: null,
    weekly: { pct: .13, reset: Math.floor(Date.now() / 1000) + 86400 },
    note: 'account unreachable' });
  const html = nodes['cx-strip'].innerHTML;
  assert.match(html, /cu-lbl">week</);
  assert.match(html, /13%/);
  assert.match(html, /resets/);
  assert.match(html, /account unreachable/);
  assert.match(html, /cu-lbl">session<.*cu-pct">—<.*cu-lbl">week</);
  assert.doesNotMatch(html, /waiting for first/);
  assert.equal((html.match(/class="cu-seg"/g) || []).length, 2);
});

test('the Codex strip surfaces the server note', () => {
  const { sandbox, nodes } = load(src);
  const now = Math.floor(Date.now() / 1000);
  sandbox.applyServerCodexUsage(true, { enabled: true, note: 'Codex login expired — run codex to refresh',
    session: { pct: .4, reset: now + 3600 }, weekly: { pct: .1, reset: now + 86400 } });
  assert.match(nodes['cx-strip'].innerHTML, /login expired/);
  assert.match(nodes['cx-strip'].innerHTML, /40%/, 'the last numbers still show');
  sandbox.applyServerCodexUsage(true, { enabled: true, note: 'account unreachable' });
  assert.match(nodes['cx-strip'].innerHTML, /account unreachable/);
  assert.doesNotMatch(nodes['cx-strip'].innerHTML, /waiting for first/);
});

test('the strip ✕ is on the LEFT, the opposite side from every window close (2026-09-13)', () => {
  // Floating windows close at their top-RIGHT. The usage strip is full-width
  // and sits directly above them, so a ✕ in ITS top-right read as one of
  // theirs — except that it turns the feature off on every device the user
  // owns, not just this window. Opposite corner, opposite meaning.
  const x = shell.match(/\.cu-strip \.cu-x \{[^}]*\}/);
  assert.ok(x, '.cu-strip .cu-x rule must be present');
  assert.match(x[0], /\bleft:\s*\d/, 'the strip ✕ must be pinned to the left');
  assert.doesNotMatch(x[0], /\bright:\s*\d/, 'and never to the right');

  // The window close button it must not be confused with is still on the right:
  // it is the LAST control in a flex titlebar whose name flexes to fill.
  assert.match(shell, /\.win-titlebar \.wt-name \{ flex: 1 1 auto;/);
  assert.match(shell, /wt-min[\s\S]{0,80}wt-max[\s\S]{0,80}wt-close/,
    'close stays last in the titlebar control order (i.e. rightmost)');
});

test('the ✕ gutter is reserved on the side the ✕ is actually on', () => {
  // The ✕ is out of flow, so without padding on its own side the brand text
  // slides under it. Both paddings are checked because they were swapped as a
  // pair — 40px total either way, so no metric column moves.
  const base = shell.match(/\.cu-strip \{[^}]*\}/);
  assert.ok(base, '.cu-strip rule must be present');
  const pad = base[0].match(/padding:\s*(\d+)px\s+(\d+)px\s+(\d+)px\s+(\d+)px/);
  assert.ok(pad, '.cu-strip must set a four-value padding');
  assert.ok(+pad[4] >= 26, `left gutter must seat the ✕, got ${pad[4]}px`);
  assert.ok(+pad[2] <= 12, `right side no longer reserves a gutter, got ${pad[2]}px`);

  // ...and the narrowest-phone rule must not claw that gutter back.
  const narrow = shell.match(/@media \(max-width: 340px\) \{[\s\S]*?\n  \}/);
  assert.ok(narrow, 'the 340px media query must be present');
  assert.doesNotMatch(narrow[0], /\.cu-strip \{ padding-left/,
    'shrinking padding-left on a phone would put the brand under the ✕');
});

// ==========================================================================
// desktop.html — the shell's own two "states something it does not know" bugs.
//
// The shell's main script is one ~4,000-line IIFE that cannot be instantiated
// without most of a browser, so these tests lift the exact functions under test
// out of the SHIPPED file by name (brace-matched, not copied) and run that
// source in a sandbox with their free variables stubbed. It is the real code —
// change it and these see the change — without pretending to boot a desktop.
// ==========================================================================

// Brace-matched extraction. Every brace inside a string literal in these
// functions happens to be balanced ('{}' , {} ), so a plain counter is safe; if
// that ever stops being true this throws rather than extracting nonsense.
function cut(sig, { optional = false } = {}) {
  const i = shell.indexOf('\n  ' + sig);
  if (i < 0) {
    if (optional) return '';
    assert.fail(`desktop.html no longer contains "${sig}"`);
  }
  const start = shell.indexOf('{', i);
  let depth = 0;
  for (let j = start; j < shell.length; j++) {
    if (shell[j] === '{') depth++;
    else if (shell[j] === '}' && --depth === 0) return shell.slice(i, j + 1) + ';\n';
  }
  assert.fail(`unbalanced braces extracting ${sig}`);
}

function shellSandbox(parts, opts = {}) {
  opts = opts || {};
  const nodes = { 'wp-host': el('wp-host'), 'sys-warn': el('sys-warn') };
  nodes['sys-warn'].children = [];
  nodes['sys-warn'].appendChild = function (c) { nodes['sys-warn'].children.push(c); };
  Object.defineProperty(nodes['sys-warn'], 'innerHTML', {
    set(v) { if (v === '') nodes['sys-warn'].children.length = 0; }, get() { return ''; },
  });
  const stats = el('tb-stats');
  const rows = { sysstats: el('row-sysstats') };
  let stored = opts.sysStats === undefined ? '1' : opts.sysStats;
  const document = {
    getElementById: (id) => nodes[id] || null,
    querySelector(sel) {
      if (sel === '.tb-stats') return stats;
      const m = String(sel).match(/data-id="([a-z]+)"/);
      return m ? rows[m[1]] || null : null;
    },
    querySelectorAll: () => [],
    createElement: () => el('new'), addEventListener() {}, body: el('body'), hidden: false,
  };
  const posted = [];
  const prelude = `
    var terminalCount = 0, runningGlobal = [], lastResetEpoch = null;
    var INSTANCE_ID = 'i', openApps = [], active = null, persistTimer = null;
    var hbLastOkAt = 0, hbMissed = 0, hbHostLine = '';
    var sysStatsOverrideUntil = 0;
    function markMenuRunning() {} function clearAllLocal() {} function closeApp() {}
    function onDesktopResp() {}   // replaced by the real one when a test extracts it
    function pushDesktop() {} function noteHeartbeat() {} function renderHeartbeatAge() {}
    window.vibeCheckAuth = function () {};   // the real one re-checks the session cookie
    function hbAgeText() { return '?'; } function noteToggleRefusal() {}
    var VibeDeskState = { resetDecision: function () { return 'none'; },
                          closeTargetsFor: function () { return []; } };
  `;
  const sandbox = {
    document, console, Date, Math, JSON, String, Number, Object, Array, Promise,
    setTimeout, clearTimeout, Error,
    localStorage: { getItem: () => stored, setItem: (k, v) => { stored = v; }, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {} },
    fetch: (url, opt) => { posted.push({ url, opt }); return opts.reply === 'reject'
      ? Promise.reject(new Error('offline'))
      : Promise.resolve(Object.assign({ json: () => Promise.resolve({}) }, opts.reply || { ok: true, status: 200 })); },
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = () => {};
  vm.runInNewContext(prelude + parts, sandbox, { filename: 'desktop.html' });
  return { sandbox, nodes, stats, rows, posted, stored: () => stored };
}

// --- the disk-full banner --------------------------------------------------
// `renderWarnings(undefined)` coerces to [] — which is the ALL-CLEAR render. A
// heartbeat that simply did not carry `warnings` therefore wiped a live
// "disk 96% full" banner off the screen. Not knowing is not the same as nothing
// being wrong.
test('a heartbeat with no warnings key leaves a live warning banner alone', () => {
  const h = shellSandbox(cut('function onDesktopResp') + cut('function renderWarnings'));
  h.sandbox.onDesktopResp({ warnings: [{ id: 'disk', level: 'critical', text: 'disk 96% full' }] });
  assert.equal(h.nodes['sys-warn'].children.length, 1, 'the banner shows while the server reports it');

  h.sandbox.onDesktopResp({ running: [] });          // a reply that says nothing about warnings
  assert.equal(h.nodes['sys-warn'].children.length, 1,
    'a payload that does not mention warnings must not CLEAR them — the disk is still full, ' +
    'and the user just watched the alarm disappear on its own');

  h.sandbox.onDesktopResp({ warnings: [] });         // an explicit all-clear still clears
  assert.equal(h.nodes['sys-warn'].children.length, 0, 'an explicit empty list is an all-clear');
});

// --- the frozen taskbar ----------------------------------------------------
test('taskbar stats stop claiming to be live once the heartbeat stops', async () => {
  const parts = cut('function renderSysStats') + cut('function pushDesktop') +
    cut('function hbAgeText', { optional: true }) +
    cut('function renderHeartbeatAge', { optional: true }) +
    cut('function noteHeartbeat', { optional: true });
  const h = shellSandbox(parts, { reply: 'reject' });
  // One good beat's worth of figures, rendered exactly as the heartbeat does.
  h.sandbox.renderSysStats({ hostname: 'z20', uptime: '23h 27m', cpu_percent: 12 });
  const live = h.nodes['wp-host'].textContent;
  assert.match(live, /z20/);
  assert.match(live, /23h 27m/);

  await h.sandbox.pushDesktop();      // beat 1 fails
  assert.equal(h.nodes['wp-host'].textContent, live, 'one dropped beat is not worth a word');
  await h.sandbox.pushDesktop();      // beat 2 fails
  const shown = h.nodes['wp-host'].textContent;
  assert.notEqual(shown, live,
    '"up 23h 27m" is a clock. Once the heartbeat feeding it has stopped, leaving it ' +
    'unchanged states a measurement the shell no longer has.');
  assert.match(shown, /ago/,
    'and it must say how old the reading is, in the same idiom as the usage strips');
  assert.ok(h.stats.classList.contains('tb-stale'),
    'the taskbar figures beside it are just as frozen and must be marked too');
});

// --- a refused toggle ------------------------------------------------------
test('a refused System-Stats toggle goes back and says why', async () => {
  const parts = cut('function sysStatsOn') + cut('function applySysStats') +
    cut('function setSysStatsLocal') + cut('function noteToggleRefusal', { optional: true }) +
    cut('window.toggleSysStats = function');
  const h = shellSandbox(parts, { sysStats: '1', reply: { ok: false, status: 403 } });
  assert.equal(h.stored(), '1', 'starts on');
  h.sandbox.window.toggleSysStats();
  assert.equal(h.stored(), '0', 'optimistic while the POST is in flight');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(h.stored(), '1',
    'the server refused: the switch must return to the state the server is actually in, ' +
    'now — not be contradicted by a heartbeat 5s later, which reads as a broken toggle');
  assert.equal(h.stats.style.display, '', 'and the stats it hid must come back');
});

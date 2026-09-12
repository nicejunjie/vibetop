/* Tests for the service-worker fetch-routing rules (sw.js).
 *
 *   node --test shell/
 *
 * The SW decides, per request, between three behaviours:
 *   bypass    — live/auth paths: network only, never cached (/api, /tN, /browser…)
 *   shell     — a known shell page navigation: network-first, cacheable
 *   navigate  — any other HTML navigation: network-first, NEVER cached (so a
 *               deploy that didn't bump VERSION can't serve it stale)
 *   subresrc  — JS/CSS/icons: cache-first, stale-while-revalidate
 *
 * A miscategorised path is a real outage class: caching /cdn-cgi breaks Access
 * auth; caching /api serves stale data; bypassing the shell kills offline load.
 * Rather than restructure sw.js (and risk the PWA shell), this test parses the
 * LIVE BYPASS regex + PRECACHE array straight out of sw.js, so it tracks the
 * real source with no drift, and reconstructs the exact classification.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SRC = fs.readFileSync(path.join(__dirname, "sw.js"), "utf8");

// Pull the real literals out of sw.js. If its structure ever changes, these
// throw loudly (test failure) rather than silently testing nothing.
function extract() {
  const bypassM = SRC.match(/const BYPASS\s*=\s*(\/.*\/[a-z]*)\s*;/);
  assert.ok(bypassM, "could not find `const BYPASS = /.../;` in sw.js");
  // eslint-disable-next-line no-eval
  const BYPASS = (0, eval)(bypassM[1]);

  const precacheM = SRC.match(/const PRECACHE\s*=\s*(\[[\s\S]*?\]);/);
  assert.ok(precacheM, "could not find `const PRECACHE = [...]` in sw.js");
  // eslint-disable-next-line no-eval
  const PRECACHE = (0, eval)(precacheM[1]);

  // SHELL_PAGES mirrors sw.js: '/' or a precached *.html.
  const SHELL_PAGES = new Set(PRECACHE.filter((p) => p === "/" || p.endsWith(".html")));
  return { BYPASS, PRECACHE, SHELL_PAGES };
}

const { BYPASS, PRECACHE, SHELL_PAGES } = extract();

function classify(pathname, mode) {
  if (BYPASS.test(pathname)) return "bypass";
  if (mode === "navigate") return SHELL_PAGES.has(pathname) ? "shell" : "navigate";
  return "subresrc";
}

// -- live/auth paths must be bypassed (never cached) -----------------------

const MUST_BYPASS = [
  "/api/terminals/status",
  "/api/desktop",
  "/api/events",
  "/api/system/status",
  "/browser/",
  "/x11-display/",
  "/office/config",
  "/onlyoffice/healthcheck",
  "/t1/",
  "/t42/",
  "/terminals/",
  "/fileview/x.docx",
  "/services.json",
  "/cdn-cgi/access/logout",
];

for (const p of MUST_BYPASS) {
  test(`bypass: ${p}`, () => {
    assert.equal(classify(p, "navigate"), "bypass");
    assert.equal(classify(p, "no-cors"), "bypass");   // bypass regardless of mode
  });
}

// -- the wrapper page /files.html must NOT be bypassed (it's a shell page) --

test("/files.html is a cacheable shell page, not bypassed", () => {
  // FileBrowser owned /files/ and had to be bypassed; the native Files app is
  // just pages in the web root, so nothing under /files* is live any more.
  assert.equal(classify("/files.html", "navigate"), "shell");
});

// -- known shell pages: cached navigations ---------------------------------

test("every precached *.html (and /) classifies as a cacheable shell nav", () => {
  for (const p of PRECACHE) {
    if (p === "/" || p.endsWith(".html")) {
      assert.equal(classify(p, "navigate"), "shell", `${p} should be a shell nav`);
    }
  }
});

// -- non-shell HTML navigations: network-only, never cached ----------------

const NAVIGATE_NOCACHE = [
  "/update.html",
  "/config.html",
  "/loggedout.html",
];
for (const p of NAVIGATE_NOCACHE) {
  test(`non-shell HTML stays network-only (navigate branch): ${p}`, () => {
    assert.equal(classify(p, "navigate"), "navigate");
  });
}

// office-editor.html is ALSO never cached, but via the BYPASS branch: it shares
// the `/office` prefix with the xpra Office display. Different branch, same
// guarantee (network-only) — pin it so a future BYPASS edit can't silently start
// caching the editor shell.
test("office-editor.html is network-only (via the /office bypass prefix)", () => {
  assert.equal(classify("/office-editor.html", "navigate"), "bypass");
});

// -- static sub-resources: SWR cache ---------------------------------------

const SUBRESOURCES = [
  "/tab-sync.js",
  "/terminal-kbd.js",
  "/icons/icon-192.png",
  "/manifest.json",
];
for (const p of SUBRESOURCES) {
  test(`sub-resource is SWR-cached: ${p}`, () => {
    assert.equal(classify(p, "no-cors"), "subresrc");
  });
}

// -- precache list sanity --------------------------------------------------

test("PRECACHE includes the shell root and the static app pages", () => {
  for (const p of ["/", "/notes.html", "/monitor.html", "/upload.html", "/files.html"]) {
    assert.ok(PRECACHE.includes(p), `${p} missing from PRECACHE`);
  }
});

test("VERSION is bumped to a vNNN string", () => {
  const m = SRC.match(/const VERSION\s*=\s*['"](v\d+)['"]/);
  assert.ok(m, "sw.js VERSION must be a 'vNNN' literal");
});

// -- the shell's own script tags must survive an offline cold load ----------
//
// desktop.html loads its modules with plain <script src>, and the SW precaches
// the shell for offline/instant loads. A tag that is NOT in PRECACHE gets the
// cache-first sub-resource branch: fine while the network is up, a blank desktop
// when it isn't, and nothing anywhere says so. This test is the noise. It matters
// most when a module is EXTRACTED from desktop.html — the tag lands, the PRECACHE
// entry is forgotten, and only an offline user finds out.

test("every <script src> in desktop.html is precached", () => {
  const html = fs.readFileSync(path.join(__dirname, "desktop.html"), "utf8");
  const srcs = [...html.matchAll(/<script\s+src="(\/[^"?]+\.js)"/g)].map((m) => m[1]);
  assert.ok(srcs.length >= 5, `expected the shell's module tags, found ${srcs.length}`);
  for (const src of srcs) {
    assert.ok(PRECACHE.includes(src),
      `${src} is loaded by desktop.html but missing from sw.js PRECACHE — it would ` +
      `not be available offline. Add it to PRECACHE and bump VERSION.`);
  }
});

// shell/install.sh substitutes @TOKEN@ placeholders only for files in its RENDERED
// table. Move a block that contains one into a plain-copied .js and the literal
// ships to the browser, where it is not an error — just a string that is wrong
// forever (@SW_VERSION@ compared against a real version never matches).
test("no deployed shell script carries an unstamped @TOKEN@", () => {
  const files = fs.readdirSync(__dirname)
    .filter((f) => f.endsWith(".js") && !f.endsWith(".test.js"));
  assert.ok(files.length >= 5, "expected the shell's modules to be found");
  for (const f of files) {
    const src = fs.readFileSync(path.join(__dirname, f), "utf8");
    const tok = src.match(/@[A-Z_]{3,}@/);
    assert.ok(!tok, `shell/${f} contains the unstamped token ${tok && tok[0]} — ` +
      `install.sh only substitutes files in its RENDERED table.`);
  }
});

// Execute the actual worker: classification alone cannot prove that reauth
// avoids a cached shell on redirects, errors, or a stalled network.
//
// `Response` is a small stand-in that keeps what the worker built, so a test
// can tell the unreachable page from a network response; the trace ring's
// cache is the one cache a navigation may open.
class FakeResponse {
  constructor(body, init) { this.body = body; this.status = (init && init.status) || 200; this.headers = new Map(Object.entries((init && init.headers) || {})); this.type = 'basic'; }
  static error() { return { type: 'error', status: 0 }; }
}
function worker({ fetch, shellCache, setTimeout: st }) {
  const vm = require('node:vm');
  const handlers = {}, traced = [];
  const traceCache = { match: async () => undefined, put: async (k, r) => { traced.push(JSON.parse(r.body)); } };
  vm.runInNewContext(SRC, {
    URL, location: { origin: 'https://vibetop.test' }, Date, JSON, Object, Array, String, Promise, Error,
    self: { addEventListener: (name, fn) => { handlers[name] = fn; } },
    caches: { open(name) {
      if (name === 'vt-trace') return Promise.resolve(traceCache);
      if (!shellCache) assert.fail('reauth must never consult the shell cache');
      return Promise.resolve(shellCache);
    } },
    setTimeout: st || ((fn, ms) => { assert.fail('reauth must never time out to a cached shell'); }),
    Response: FakeResponse, fetch
  });
  return { handlers, traced };
}
function navigate(handlers, url) {
  let result;
  handlers.fetch({
    request: { method: 'GET', mode: 'navigate', url },
    respondWith(promise) { result = promise; },
    waitUntil() {}
  });
  return result;
}
const isUnreachablePage = (r) => r instanceof FakeResponse && /Vibetop can.t be reached/.test(r.body) && /\/reauth\.html\?vt=/.test(r.body);
const isHandoffPage = (r) => r instanceof FakeResponse && /location\.replace\("\/reauth\.html\?vt=/.test(r.body);

for (const outcome of ['redirect', 'error', 'pending']) {
  test(`vtreauth is network-only even when the network is ${outcome}`, async () => {
    let networkCalls = 0;
    const redirect = { type: 'opaqueredirect', status: 0 };
    const { handlers } = worker({ fetch() {
      networkCalls++;
      if (outcome === 'error') return Promise.reject(new Error('offline'));
      if (outcome === 'pending') return new Promise(() => {});
      return Promise.resolve(redirect);
    } });
    const result = navigate(handlers, 'https://vibetop.test/?vtreauth=123');
    assert.equal(networkCalls, 1);
    assert.ok(result);
    if (outcome === 'redirect') assert.equal(await result, redirect, 'the Access redirect passes straight through');
    // A sign-in navigation the network fails is a page with a Try again
    // button, never the browser's blank error page (a white screen on an
    // installed iOS web app).
    if (outcome === 'error') assert.ok(isUnreachablePage(await result), 'an unreachable page, not Response.error()');
  });
}

test('a navigation nobody can answer gets the unreachable page, and the worker keeps a trace of it', async () => {
  const empty = { match: async () => undefined, put: async () => {} };
  const { handlers, traced } = worker({
    fetch: () => Promise.reject(new Error('offline')), shellCache: empty,
    setTimeout: (fn, ms) => { assert.equal(ms, 2500); }        // the race never wins: the fetch rejects first
  });
  // A shell page with an empty cache (an evicted PWA store) and a page outside
  // the shell set: both were Response.error() before.
  for (const url of ['https://vibetop.test/', 'https://vibetop.test/update.html']) {
    const r = await navigate(handlers, url);
    assert.ok(isUnreachablePage(r), url + ' must render the unreachable page');
    assert.equal(r.headers.get('Cache-Control'), 'no-store');
  }
  await new Promise((r) => setImmediate(r));
  assert.ok(traced.some((ring) => ring.some((e) => e.p === '/' && e.how === 'error')), 'the failed navigation is in the trace ring');
});

test('a redirected shell navigation is handed to /reauth.html, a path the worker never answers', async () => {
  const empty = { match: async () => undefined, put: async () => {} };
  const { handlers, traced } = worker({
    fetch: () => Promise.resolve({ type: 'opaqueredirect', status: 0, redirected: false, ok: false }),
    shellCache: empty, setTimeout: () => {}
  });
  const r = await navigate(handlers, 'https://vibetop.test/');
  assert.ok(isHandoffPage(r), 'the browser gets a page that makes the next hop natively');
  assert.equal(r.headers.get('Cache-Control'), 'no-store');
  assert.equal(classify('/reauth.html', 'navigate'), 'bypass', '/reauth.html must never reach respondWith');
  await new Promise((r) => setImmediate(r));
  assert.ok(traced.some((ring) => ring.some((e) => e.p === '/' && e.how === 'handoff' && e.ty === 'opaqueredirect')));
  // A served shell page is traced as a network answer.
  const ok = worker({ fetch: () => Promise.resolve({ type: 'basic', status: 200, ok: true, redirected: false, clone() { return this; } }), shellCache: empty, setTimeout: () => {} });
  const page = await navigate(ok.handlers, 'https://vibetop.test/');
  assert.equal(page.status, 200);
  await new Promise((r) => setImmediate(r));
  assert.ok(ok.traced.some((ring) => ring.some((e) => e.p === '/' && e.how === 'net' && e.s === 200)));
});

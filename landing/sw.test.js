/* Tests for the service-worker fetch-routing rules (sw.js).
 *
 *   node --test landing/        (or: cd landing && node --test)
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
  "/files/",            // live FileBrowser SPA
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
  // The BYPASS regex uses `files/` (with slash) precisely so /files.html escapes it.
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

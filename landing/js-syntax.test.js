/* JS syntax guard — the JavaScript analogue of test_static.py's py_compile /
 * bash -n. Every deployed or nginx-sub_filter-injected script is compiled with
 * vm.Script (parse only, never run). A syntax error in injected JS silently
 * breaks the terminal keyboard / xpra Browser / FileBrowser UI at runtime with
 * no build step to catch it — this turns that into a test failure.
 *
 *   node --test landing/
 *
 * Also asserts the two try/catch-wrapped patch files keep their documented
 * graceful-degradation guard (an xpra/FileBrowser API change must not throw the
 * whole patch bundle).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const REPO = path.join(__dirname, "..");

// Deployed + injected scripts (repo-relative). Not .test.js (dev-only).
const SCRIPTS = [
  "landing/coach.js",
  "landing/vibe-modal.js",
  "landing/winmgr.js",
  "landing/apph.js",
  "landing/filebrowser-patches.js",
  "landing/sw.js",
  "browser/xpra-patches.js",
  "terminal/terminal-kbd.js",
  "terminal/lib/tab-sync.js",
];

for (const rel of SCRIPTS) {
  test(`parses: ${rel}`, () => {
    const src = fs.readFileSync(path.join(REPO, rel), "utf8");
    // Throws SyntaxError on malformed JS; compiling does not execute it.
    assert.doesNotThrow(() => new vm.Script(src, { filename: rel }));
  });
}

test("patch bundles are wrapped for graceful degradation", () => {
  for (const rel of ["browser/xpra-patches.js", "landing/filebrowser-patches.js"]) {
    const src = fs.readFileSync(path.join(REPO, rel), "utf8");
    assert.ok(/try\s*\{/.test(src) && /catch\s*\(/.test(src),
      `${rel} should keep its try/catch degradation guard`);
  }
});

// Inline <script> blocks of every deployed PAGE — the same parse-only guard one
// level up. Auto-discovered (readdirSync), so a new page (a game, a new app) is
// covered the day it lands with no registration step. A syntax error in a
// page's inline script previously shipped silently and broke that app at
// runtime; every ad-hoc pre-release `new Function()` check this repo's history
// shows is this test, made permanent.
const PAGE_DIRS = [
  ["landing", /\.html$/],
  ["terminal", /^terminals\.html$/],
];
for (const [dir, pat] of PAGE_DIRS) {
  const files = fs.readdirSync(path.join(REPO, dir)).filter((f) => pat.test(f)).sort();
  for (const f of files) {
    const rel = `${dir}/${f}`;
    test(`inline scripts parse: ${rel}`, () => {
      const src = fs.readFileSync(path.join(REPO, rel), "utf8");
      const blocks = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)];
      blocks.forEach((m, i) => {
        assert.doesNotThrow(() => new vm.Script(m[1], { filename: `${rel}#${i}` }));
      });
    });
  }
}

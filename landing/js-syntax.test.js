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

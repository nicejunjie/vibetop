/* JS syntax guard — the JavaScript analogue of test_static.py's py_compile /
 * bash -n. Every deployed or nginx-sub_filter-injected script is compiled with
 * vm.Script (parse only, never run). A syntax error in injected JS silently
 * breaks the terminal keyboard / xpra Browser UI at runtime with no build step
 * to catch it — this turns that into a test failure.
 *
 *   node --test landing/
 *
 * Also asserts the try/catch-wrapped patch bundle keeps its documented
 * graceful-degradation guard (an xpra API change must not throw the whole
 * bundle).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");

const REPO = path.join(__dirname, "..");

// Walk the grouped tree instead of listing files: a new shared module or
// app script is covered the day it lands, with no registration step (the same
// reason shell/install.sh deploys by walking). Injected scripts that live
// outside landing/ stay explicit — there are three and they are load-bearing.
function walk(dir, pat, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "art" && e.name !== "icons" && e.name !== "node_modules") walk(full, pat, out); }
    else if (pat.test(e.name)) out.push(path.relative(REPO, full));
  }
  return out;
}
const SCRIPTS = [
  ...["shell", "shared", "apps"].flatMap((d) => walk(path.join(REPO, d), /\.js$/))
      .filter((f) => !f.endsWith(".test.js")),
  "apps/everyday/browser/xpra-patches.js",
  "apps/everyday/terminal/terminal-kbd.js",
  "apps/everyday/terminal/lib/tab-sync.js",
].sort();
for (const rel of SCRIPTS) {
  test(`parses: ${rel}`, () => {
    const src = fs.readFileSync(path.join(REPO, rel), "utf8");
    // Throws SyntaxError on malformed JS; compiling does not execute it.
    if (rel.startsWith("apps/games/rts/rts/")) {
      // The RTS game is an ES-module tree (import/export), which vm.Script cannot
      // parse; `node --check` honours apps/games/rts/rts/package.json {"type":"module"}.
      const r = spawnSync(process.execPath, ["--check", path.join(REPO, rel)], { encoding: "utf8" });
      assert.equal(r.status, 0, r.stderr);
      return;
    }
    assert.doesNotThrow(() => new vm.Script(src, { filename: rel }));
  });
}

test("the xpra patch bundle is wrapped for graceful degradation", () => {
  for (const rel of ["apps/everyday/browser/xpra-patches.js"]) {
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
const PAGES = [
  ...["shell", "shared", "apps"].flatMap((d) => walk(path.join(REPO, d), /\.html$/)),
  "apps/everyday/terminal/terminals.html",
].sort();
{
  for (const rel of PAGES) {
    test(`inline scripts parse: ${rel}`, () => {
      const src = fs.readFileSync(path.join(REPO, rel), "utf8");
      const blocks = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)];
      blocks.forEach((m, i) => {
        assert.doesNotThrow(() => new vm.Script(m[1], { filename: `${rel}#${i}` }));
      });
    });
  }
}

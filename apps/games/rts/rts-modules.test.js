// Iron Frontier — the file list and its load order hold together.
//
// The game is 117 plain scripts, one per subsystem and one per unit, listed in
// load order in `rts.html`. That shape is deliberate: classic scripts load from
// `file://`, so the page can be opened by double-clicking it — no server, no
// build, no dependencies. ES modules cannot do that (a `file://` page has no
// origin and the browser refuses the import).
//
// The price of classic scripts is that hoisting is per file, not across files:
// a statement that RUNS while the page is loading may only call functions
// declared in an earlier file. Nothing but the browser would catch a violation,
// and it shows up as a bare ReferenceError on boot. This is that gate.
//
//     node --test apps/games/rts/rts-modules.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const RTS = __dirname;
const TREE = path.join(RTS, "rts");
const PAGE = path.join(RTS, "rts.html");
const B = require("./tools/lib/bundle-for-vm.js");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}
const ON_DISK = walk(TREE).map((p) => "rts/" + path.relative(TREE, p)).sort();

test("rts.html lists every file exactly once, and every listed file exists", () => {
  const order = B.loadOrder();
  assert.deepStrictEqual([...order].sort(), ON_DISK,
    "the page's script tags and the files on disk must be the same set — a file " +
    "left out is dead code, a file listed twice runs twice");
  assert.equal(new Set(order).size, order.length);
  assert.ok(order.length >= 100, `only ${order.length} scripts`);
});

test("the page is plain scripts — nothing to build, nothing to serve", () => {
  const html = fs.readFileSync(PAGE, "utf8");
  assert.equal([...html.matchAll(/<script>[\s\S]*?<\/script>/g)].length, 0,
    "no inline <script> block: the game lives in rts/**");
  assert.ok(!/type="module"/.test(html),
    "no ES modules: a module page cannot be opened from file://, which is the " +
    "whole reason these are classic scripts");
  const first = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.deepStrictEqual(first.slice(0, 2), ["gamescore.js", "vibe-modal.js"],
    "the two shared scripts load before the game");
});

test("no file uses import/export — they would not run as classic scripts", () => {
  const bad = [];
  for (const rel of ON_DISK) {
    const text = fs.readFileSync(path.join(RTS, rel), "utf8");
    for (const m of text.matchAll(/^(import|export)\b.*$/gm)) bad.push(`${rel}: ${m[0].trim()}`);
  }
  assert.deepStrictEqual(bad, []);
});

test("nothing calls a function at load time that a later file declares", () => {
  // The one ordering rule classic scripts impose. A violation is a bare
  // ReferenceError the moment the page opens.
  assert.deepStrictEqual(B.forwardCalls(), []);
});

test("no two files declare the same top-level name", () => {
  // They share one global scope, so a duplicate silently overwrites.
  const owner = new Map();
  const clash = [];
  for (const f of B.files) {
    for (const n of B.topLevelNames(f.body, f.rel)) {
      if (owner.has(n)) clash.push(`${n}: ${owner.get(n)} and ${f.rel}`);
      else owner.set(n, f.rel);
    }
  }
  assert.deepStrictEqual(clash, []);
  assert.ok(owner.size > 800, `only ${owner.size} top-level names`);
});

test("no top-level name collides with a browser global", () => {
  // At global scope a `var name` or `var status` would be assigning to
  // window.name / window.status, which are real, coerced-to-string properties.
  const HOST = ["name", "status", "open", "close", "focus", "blur", "top", "self", "parent",
    "length", "origin", "event", "history", "screen", "location", "navigator", "frames",
    "scrollX", "scrollY", "print", "stop", "find", "alert", "confirm", "prompt", "closed",
    "opener", "external", "menubar", "toolbar", "frameElement", "crypto", "performance",
    "caches", "document", "window", "customElements", "visualViewport", "speechSynthesis",
    "isSecureContext", "indexedDB", "localStorage", "sessionStorage", "innerWidth",
    "innerHeight", "outerWidth", "outerHeight", "screenX", "screenY", "devicePixelRatio",
    "matchMedia", "getSelection", "scroll", "scrollTo", "scrollBy", "fetch", "btoa", "atob"];
  const names = new Set();
  for (const f of B.files) for (const n of B.topLevelNames(f.body, f.rel)) names.add(n);
  assert.deepStrictEqual(HOST.filter((h) => names.has(h)), []);
});

test("69 unit-art files, each defining one draw function the bake code calls", () => {
  const units = ON_DISK.filter((f) => f.startsWith("rts/units/"));
  assert.equal(units.length, 69, "14 infantry + 15 vehicles + 2 aircraft + 9 ships + 29 structures");
  const byClass = {};
  for (const u of units) byClass[u.split("/")[2]] = (byClass[u.split("/")[2]] || 0) + 1;
  assert.deepStrictEqual(byClass, { infantry: 14, vehicles: 15, aircraft: 2, ships: 9, structures: 29 });

  const all = B.stripComments(B.source);
  const bad = [];
  for (const u of units) {
    const text = fs.readFileSync(path.join(RTS, u), "utf8");
    // One entry point per file; private helpers beside it are fine (the
    // duplicate-name gate above is what keeps those from colliding).
    const fns = [...text.matchAll(/^function ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
    const entry = fns.filter((n) => /^(draw|bake)[A-Z]/.test(n));
    if (entry.length !== 1) { bad.push(`${u}: ${entry.length} entry points (${entry.join(",") || "none"}) among ${fns.join(",")}`); continue; }
    const calls = all.split(entry[0] + "(").length - 1;
    if (calls < 2) bad.push(`${u}: ${entry[0]} is declared but never called`);
  }
  assert.deepStrictEqual(bad, []);
});

test("file basenames stay out of the flat web root's namespace", () => {
  // shell/install.sh deploys apps/games/rts/rts/** to /rts/**, keeping the
  // directory; every OTHER deployable is flattened to its basename. A collision
  // would make test_static.py's basename map resolve the wrong file.
  const REPO = path.join(RTS, "..", "..", "..");
  const flat = new Set();
  for (const dir of ["shell", "shared", "apps"]) {
    for (const f of walk(path.join(REPO, dir))) {
      const r = path.relative(REPO, f);
      if (r.includes("/art/") || r.includes("/tools/") || r.includes("/docs/") ||
          r.includes("/node_modules/") || r.startsWith("apps/games/rts/rts/") || r.endsWith(".test.js")) continue;
      flat.add(path.basename(f));
    }
  }
  const clash = ON_DISK.map((f) => path.basename(f)).filter((b) => flat.has(b));
  assert.deepStrictEqual([...new Set(clash)], []);
});

test("every file parses", () => {
  const bad = [];
  for (const rel of ON_DISK) {
    const r = spawnSync(process.execPath, ["--check", path.join(RTS, rel)], { encoding: "utf8" });
    if (r.status !== 0) bad.push(`${rel}: ${r.stderr.split("\n")[0]}`);
  }
  assert.deepStrictEqual(bad, []);
});

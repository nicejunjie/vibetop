// Iron Frontier — the module graph holds together.
//
// The game is a native ES-module tree: `rts.html` loads `rts/main.js` and the
// browser resolves every `import` itself. There is no build step and no
// bundler, so nothing checks the graph before a player does — a specifier that
// does not resolve, a module nobody imports, a unit whose draw function was
// never wired up, all fail (or silently do nothing) only in the browser.
// This is the gate that fails them here instead.
//
// It also pins the two shapes tools/lib/bundle-for-vm.js relies on to rebuild
// the program as one classic script for node's `vm` (rts.test.js): single-line
// imports and `export ` only ever as a declaration prefix.
//
//     node --test apps/games/rts/rts-modules.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const RTS = __dirname;
const TREE = path.join(RTS, "rts");
const ENTRY = path.join(TREE, "main.js");
const PAGE = path.join(RTS, "rts.html");
const B = require("./tools/lib/bundle-for-vm.js");

const IMPORT_LINE = /^import (?:\{[^}]*\} from )?'(\.\.?\/[\w./-]+\.js)';$/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}
const FILES = walk(TREE).sort();
const rel = (p) => path.relative(TREE, p);

test("rts.html loads the module entry and carries no inline script", () => {
  const html = fs.readFileSync(PAGE, "utf8");
  const tags = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
  assert.deepStrictEqual(
    tags,
    ['<script src="gamescore.js">', '<script src="vibe-modal.js">', '<script type="module" src="rts/main.js">'],
    "the page's script tags, in order: the two shared classic scripts then the module entry",
  );
  assert.equal([...html.matchAll(/<script>[\s\S]*?<\/script>/g)].length, 0,
    "no inline <script> block survives — the game lives in rts/**");
});

test("every module is reachable from main.js, and every import resolves", () => {
  const seen = new Set();
  const bad = [];
  (function visit(abs) {
    if (seen.has(abs)) return;
    seen.add(abs);
    for (const line of fs.readFileSync(abs, "utf8").split("\n")) {
      if (!line.startsWith("import ")) continue;
      const m = IMPORT_LINE.exec(line);
      if (!m) { bad.push(`${rel(abs)}: import is not a single canonical line: ${line}`); continue; }
      const target = path.resolve(path.dirname(abs), m[1]);
      if (!fs.existsSync(target)) { bad.push(`${rel(abs)}: imports ${m[1]}, which does not exist`); continue; }
      visit(target);
    }
  })(ENTRY);
  assert.deepStrictEqual(bad, []);
  const orphans = FILES.filter((f) => !seen.has(f)).map(rel);
  assert.deepStrictEqual(orphans, [], "a module nobody imports is dead code the browser never loads");
  assert.ok(FILES.length >= 100, `only ${FILES.length} modules — did part of the tree go missing?`);
});

test("every specifier is relative and carries its .js — the browser has no resolver", () => {
  const bad = [];
  for (const f of FILES) {
    for (const m of fs.readFileSync(f, "utf8").matchAll(/^import\b.*?from\s*'([^']+)'|^import\s*'([^']+)'/gm)) {
      const spec = m[1] || m[2];
      if (!spec.startsWith("./") && !spec.startsWith("../")) bad.push(`${rel(f)}: bare specifier ${spec}`);
      else if (!spec.endsWith(".js")) bad.push(`${rel(f)}: extensionless specifier ${spec}`);
    }
  }
  assert.deepStrictEqual(bad, []);
});

test("`export` is only ever a declaration prefix, which is what the vm bundler assumes", () => {
  const bad = [];
  for (const f of FILES) {
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      if (!line.startsWith("export")) continue;
      if (!/^export (var|let|const|function|class)\b/.test(line)) bad.push(`${rel(f)}: ${line.trim()}`);
    }
  }
  assert.deepStrictEqual(bad, [], "no export lists, no default exports, no re-exports");
});

test("no two modules declare the same top-level name", () => {
  // Legal in ESM, but tools/lib/bundle-for-vm.js flattens the tree into one
  // scope for the node harness, where a duplicate would silently merge.
  const b = B.bundle(ENTRY);
  assert.ok(b.names.size > 800, `only ${b.names.size} top-level names`);
  assert.equal(b.order.length, FILES.length, "every module is in the evaluation order exactly once");
});

test("69 unit-art modules, each exporting one draw function, each imported by its bake module", () => {
  const units = FILES.filter((f) => rel(f).startsWith("units/")).map(rel);
  assert.equal(units.length, 69, "14 infantry + 15 vehicles + 2 aircraft + 9 ships + 29 structures");
  const byClass = {};
  for (const u of units) byClass[u.split("/")[1]] = (byClass[u.split("/")[1]] || 0) + 1;
  assert.deepStrictEqual(byClass, { infantry: 14, vehicles: 15, aircraft: 2, ships: 9, structures: 29 });

  const importedSomewhere = new Set();
  for (const f of FILES) {
    for (const m of fs.readFileSync(f, "utf8").matchAll(/^import \{([^}]*)\} from '([^']+)';$/gm)) {
      if (!m[2].includes("units/")) continue;
      for (const n of m[1].split(",")) importedSomewhere.add(n.trim());
    }
  }
  const bad = [];
  for (const u of units) {
    const text = fs.readFileSync(path.join(TREE, u), "utf8");
    const exported = [...text.matchAll(/^export function ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
    if (exported.length !== 1) { bad.push(`${u}: exports ${exported.length} functions (${exported})`); continue; }
    if (!importedSomewhere.has(exported[0])) bad.push(`${u}: exports ${exported[0]}, which no bake module imports`);
  }
  assert.deepStrictEqual(bad, []);
});

test("module basenames stay out of the flat web root's namespace", () => {
  // shell/install.sh deploys apps/games/rts/rts/** to /rts/**, keeping the
  // directory; every OTHER deployable is flattened to its basename. Nothing
  // here may collide with those, or test_static.py's basename map resolves the
  // wrong file.
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
  const clash = FILES.map((f) => path.basename(f)).filter((b) => flat.has(b));
  assert.deepStrictEqual([...new Set(clash)], []);
});

test("the tree really loads as ES modules in node, and defines the test hooks", () => {
  // bundle-for-vm.js proves the CONCATENATION runs; this proves the actual
  // import graph does — link errors (a missing export, a cycle the spec
  // rejects) only show up on a real module load.
  const probe = `
    import { createRequire } from 'node:module';
    const require = createRequire(${JSON.stringify(__filename)});
    const { stubEl } = require('./tools/lib/vm-sandbox.js');
    const store = {};
    Object.assign(globalThis, {
      window: globalThis, devicePixelRatio: 1,
      addEventListener: () => {}, removeEventListener: () => {}, requestAnimationFrame: () => 0,
      localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
      document: { getElementById: () => stubEl(), createElement: () => stubEl(), querySelector: () => stubEl(), querySelectorAll: () => [], addEventListener: () => {}, removeEventListener: () => {} },
    });
    globalThis.performance = { now: () => 0 };
    await import(${JSON.stringify(ENTRY)});
    const missing = ['__rts', '__rtsTest', '__rtsSim', '__rtsTables', '__rtsNet']
      .filter((k) => typeof globalThis[k] === 'undefined');
    if (missing.length) { console.error('missing hooks: ' + missing.join(' ')); process.exit(1); }
    console.log('ok');
    process.exit(0);          // the booted game keeps listeners alive; nothing left to wait for
  `;
  const tmp = path.join(RTS, ".rts-modules-probe.mjs");
  fs.writeFileSync(tmp, probe);
  try {
    const r = spawnSync(process.execPath, [tmp], { encoding: "utf8", timeout: 120000 });
    assert.equal(r.status, 0, `native import failed:\n${r.stderr || r.stdout}`);
    assert.match(r.stdout, /ok/);
  } finally { fs.rmSync(tmp, { force: true }); }
});

test("every module parses as ESM", () => {
  const bad = [];
  for (const f of FILES) {
    const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" });
    if (r.status !== 0) bad.push(`${rel(f)}: ${r.stderr.split("\n")[0]}`);
  }
  assert.deepStrictEqual(bad, []);
});

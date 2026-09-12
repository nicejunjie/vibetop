// Iron Frontier — the unit-art split stays in sync.
//
// `art/units/<class>/<kind>.js` is where a unit's art is EDITED; rts.html is
// what RUNS, and carries the same lines between `// @@ART` / `// @@END`
// markers (tools/art-split.js explains why the split is textual). Two copies
// of 13k lines of art can drift in the one way that matters — someone fixes
// the Rhino in rhino.js and ships an rts.html that still draws the old one —
// so this gate fails the commit until `inject` or `extract` has been run.
//
//     node --test apps/games/rts/rts-split.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const AS = require("./tools/art-split.js");

const html = fs.readFileSync(AS.HTML, "utf8");

test("rts.html and art/units/ carry the same art (run art-split.js inject|extract)", () => {
  const r = AS.check(html);
  assert.ok(r.ok, "\n" + r.report);
  assert.ok(r.units >= 60, `only ${r.units} units marked — did a marker pair get deleted?`);
});

test("every marked region has a unit file, and every unit file has a marked region", () => {
  const want = AS.extract(html);
  const onDisk = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = require("path").join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".js")) onDisk.push(require("path").relative(AS.UNITS, p).replace(/\.js$/, ""));
    }
  })(AS.UNITS);
  assert.deepStrictEqual(onDisk.sort(), Object.keys(want).sort());
});

test("inject(extract(rts.html)) is the identity", () => {
  const files = AS.extract(html);
  assert.strictEqual(AS.inject(html, (u) => files[u]), html);
});

test("check catches a unit file that drifted from rts.html, in either direction", () => {
  const files = AS.extract(html);
  const unit = "vehicles/rhino";
  const drifted = { ...files, [unit]: files[unit].replace("barrel(", "barrel(/*wider*/") };
  const r = AS.check(html, (u) => drifted[u], () => 0);
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.stale.map((s) => s.unit), [unit]);
  assert.match(r.report, /art-split\.js (inject|extract)/);
  // a missing file is reported, not silently skipped
  const r2 = AS.check(html, (u) => (u === unit ? null : files[u]), () => 0);
  assert.strictEqual(r2.stale[0].why, "unit file missing");
});

test("a unit file with a syntax error is refused before it reaches rts.html", () => {
  const files = AS.extract(html);
  const bad = { ...files, "infantry/tanya": files["infantry/tanya"].replace("g.fill()", "g.fill(") };
  const errs = AS.syntaxErrors(bad);
  assert.strictEqual(errs.length, 1);
  assert.match(errs[0], /^infantry\/tanya#main:/);
  assert.deepStrictEqual(AS.syntaxErrors(files), []);
});

test("marker nesting and naming errors are loud", () => {
  const lines = html.split("\n");
  const i = lines.findIndex((s) => /\/\/ @@ART vehicles\/rhino$/.test(s));
  assert.ok(i > 0);
  // an @@END that names a different unit
  const j = lines.findIndex((s, k) => k > i && /\/\/ @@END vehicles\/rhino$/.test(s));
  const wrongEnd = lines.slice(); wrongEnd[j] = wrongEnd[j].replace("rhino", "lancer");
  assert.throws(() => AS.parse(wrongEnd.join("\n")), /closes vehicles\/rhino/);
  // a region never closed
  const open = lines.slice(); open.splice(j, 1);
  assert.throws(() => AS.parse(open.join("\n")), /opened inside vehicles\/rhino#main/);
});

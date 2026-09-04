// Iron Frontier — the unit-art regression gate.
//
// `rts.test.js` audits the SIMULATION. This file audits whether a player can
// tell one unit from another, which is a property of pixels and so needs a real
// browser and the page's own baked atlas. It is therefore OPT-IN, the same way
// this suite's slow simulation tier is: `./run-tests.sh` and the pre-commit
// hook discover the file and skip it in milliseconds, and nothing here touches
// Playwright unless you ask for it.
//
//     RTS_ART=1 node --test apps/games/rts/rts-art.test.js
//
// ── What it asserts, and why it is shaped as a RATCHET ────────────────────
// The game currently FAILS the targets in apps/games/rts/docs/unit-redesign-plan.md.
// A gate that is red forever gets disabled; a gate that asserts only what
// already passes is decoration. So every metric is compared against
// docs/art-baseline.json, and BOTH directions fail:
//
//   * worse than the baseline  -> a regression; fix the art.
//   * better than the baseline -> re-record the baseline, so the gain is the
//                                 new floor and cannot silently be given back.
//
// Alongside each baseline number the tool records the plan's TARGET, and the
// output prints the remaining debt on every run so it stays visible.
//
// ── The two traps this file is written around (plan §5) ───────────────────
// 1. "A test whose assertion is made true by the very line the fix adds proves
//    nothing." So the ratcheted metrics are ENSEMBLE properties — pairwise
//    separation, peer-vs-self counts, counts over a floor — not per-unit
//    numbers an art commit sets by construction. Per-unit measurements are
//    recorded under `detail` in the baseline for a human to read and are
//    deliberately NOT asserted.
// 2. "Headless numbers pass while the renderer throws." Numbers alone have
//    already been enough to let a whole field of look-alike tanks ship. So the
//    tool fails if any bake throws or the page logs an error, and it drives a
//    real match and screenshots a real rendered frame to
//    apps/games/rts/art/out/art-gate-frame.png — LOOK AT IT.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// Safe to require at module load: it pulls in nothing heavier than node
// builtins, and resolves Playwright lazily inside measure().
const AM = require("./tools/art-metrics.js");

// Opt-in, exactly like rts.test.js's `slow` tier.
const art = { skip: !process.env.RTS_ART && "set RTS_ART=1", timeout: 300000 };

// One browser run, shared by every test below.
let RUN = null;
function once() { return (RUN = RUN || AM.measure()); }

const BASE = fs.existsSync(AM.BASELINE)
  ? JSON.parse(fs.readFileSync(AM.BASELINE, "utf8"))
  : null;
const REL = (p) => path.relative(path.join(__dirname, "..", "..", ".."), p);
const RECORD = "node apps/games/rts/tools/art-metrics.js --record";

test("every unit declares an identity spike, and every declared spike is a unit", art, async () => {
  // The failure mode this removes is a SILENT gap: a unit added to UNITS with
  // no identity feature named for it, which then sails through every ensemble
  // metric because nothing ever looked for its spike.
  const m = await once();
  assert.deepEqual(m.missing, [],
    "units in the UNITS map with no SPIKES entry in tools/art-metrics.js — name the "
    + "identity feature and its pixel budget from unit-identity-reference.md §2:\n  "
    + m.missing.join(", "));
  assert.deepEqual(m.orphan, [],
    "SPIKES entries that name no unit (renamed or deleted from UNITS):\n  " + m.orphan.join(", "));
  assert.equal(Object.keys(AM.SPIKES).length, m.env.units,
    "SPIKES must cover the whole roster, one entry per unit");
});

test("no bake throws, the page logs nothing, and a real frame gets rendered", art, async () => {
  // plan §5's second trap. Every number in this file is fiction if the sprites
  // it measured came out of a page that was already on fire.
  const m = await once();
  assert.deepEqual(m.bakeErrors, [], "a sprite bake threw or came back empty:\n  "
    + m.bakeErrors.join("\n  "));
  assert.deepEqual(m.pageErrors, [], "the page logged errors while the art was measured:\n  "
    + m.pageErrors.join("\n  "));
  assert.equal(m.env.dpr, 1, "measure at DPR 1 — a baked logical px is a screen px only there");
  assert.equal(m.env.zoom, 1, "measure at zoom 1, the game's own starting zoom");
  assert.equal(m.env.sprites, m.env.units * 8, "every unit must yield all 8 bearings");
  assert.ok(m.env.scene.spawned >= 20, "the live set-piece must actually place units");
  assert.ok(fs.existsSync(AM.FRAME_PNG) && fs.statSync(AM.FRAME_PNG).size > 20000,
    `no real rendered frame at ${REL(AM.FRAME_PNG)} — numbers alone are not evidence`);
});

test("the art ratchet: measurements match the recorded baseline exactly", art, async () => {
  const m = await once();
  assert.ok(BASE, `no baseline at ${REL(AM.BASELINE)} — record one with:\n    ${RECORD}`);

  const worse = [], improved = [], unknown = [];
  for (const [k, v] of Object.entries(m.metrics)) {
    if (!(k in BASE.metrics)) { unknown.push(`${k} = ${v} (not in the baseline)`); continue; }
    const ref = BASE.metrics[k];
    if (Math.abs(v - ref) < 1e-9) continue;
    const t = AM.TARGETS[k];
    const aim = t ? `plan target ${t.dir === "down" ? "<=" : ">="} ${t.want}` : "no target declared";
    const line = `${k}: ${v} vs baseline ${ref}   (${aim}; remaining debt ${AM.debtOf(k, v)})`;
    (AM.better(k, v, ref) ? improved : worse).push(line);
  }
  for (const k of Object.keys(BASE.metrics))
    if (!(k in m.metrics)) unknown.push(`${k} is in the baseline but the tool no longer produces it`);

  const say = [];
  if (worse.length) say.push(
    "ART REGRESSION — these got WORSE than the recorded baseline:\n  " + worse.join("\n  ")
    + "\n\nThe unit roster is measurably harder to read than it was. Fix the art, or, if "
    + "the trade was deliberate, say so in the commit and re-record with:\n    " + RECORD);
  if (improved.length) say.push(
    "ART IMPROVED — these are BETTER than the recorded baseline:\n  " + improved.join("\n  ")
    + "\n\nThat is the point of the ratchet: bank it so it cannot be given back. Re-record with:"
    + "\n    " + RECORD);
  if (unknown.length) say.push(
    "The baseline and the tool disagree about which metrics exist:\n  " + unknown.join("\n  ")
    + "\nRe-record with:\n    " + RECORD);

  assert.equal(say.length, 0, "\n\n" + say.join("\n\n") + "\n");
});

test("the plan's remaining art debt is reported, not hidden", art, async () => {
  // Not a pass/fail on the targets — the game does not meet them yet and this
  // gate is not the place to pretend otherwise. It exists so that every run
  // prints how far short the roster still falls, and so that a metric can
  // never be added without someone stating what it is supposed to reach.
  const m = await once();
  const noTarget = Object.keys(m.metrics).filter((k) => !AM.TARGETS[k]);
  assert.deepEqual(noTarget, [],
    "a metric with no declared target in TARGETS — a number nobody has to justify:\n  "
    + noTarget.join(", "));
  console.log("\n" + AM.report(m) + "\n");
  const debt = Object.entries(m.metrics).filter(([k, v]) => AM.debtOf(k, v) > 0);
  console.log(`  ${debt.length} of ${Object.keys(m.metrics).length} metrics still short of the `
    + `plan's targets; baseline recorded ${BASE ? BASE.recorded : "?"}.`);
  console.log(`  Look at the frame: ${REL(AM.FRAME_PNG)}\n`);
});

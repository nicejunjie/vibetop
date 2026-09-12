# Iron Frontier (RTS) → a fully modular game: native ES modules, no build (plan, 2026-09-12)

## Outcome (2026-09-12) — done

Shipped as planned. `apps/games/rts/rts.html` is a tracked HTML+CSS page whose
only script is `<script type="module" src="rts/main.js">`, and the game is 117
native ES modules under `apps/games/rts/rts/` — 26 subsystem modules, 10 under
`bake/`, 12 under `ui/`, 69 unit-art modules under `units/<class>/<kind>.js`,
plus a dev-only `package.json` marker. Cross-module reads are plain imports
(live bindings); the ~46 cross-module *writes* go through generated `set<Name>()`
exports, which makes a missed one a parse error rather than a silent bug. The
sim↔ui import cycles were left in place: every edge carries only function
declarations, which ESM instantiates at link time.

Deleted: `rts.src.html`, `art/units/**`, `tools/rts-build.py`,
`rts-build.test.js`, the build tier in `run-tests.sh`, the build hook in
`shell/install.sh`. **The repo has no build step at all any more.** The game is
playable straight from a fresh checkout (`node apps/games/rts/tools/lib/serve-rts.js`,
or any static server rooted at `apps/games/rts/`), which was the user's actual
requirement. Delivery: `shell/install.sh` maps `rts/**` → `/rts/**` with
`install -D`; `shell/sw.js` BYPASSes `/rts/`.

**Both gates passed.** Simulation: 24 cells (6 seeds x both faction orders x two
difficulties x 30 game minutes) compared per game-minute by `stateHash` —
identical. Art: 107 sheets rendered from the real module page in headless
Chromium — byte-identical. They found one bug each that the other could not
see, both recorded in `docs/design-decisions.md`: the emitter slicing a setter's
right-hand side out of the wrong string (`setVLIFT( );` → the IFV painted
`rgb(NaN,NaN,NaN)`, invisible to a headless simulation), and the source-scanning
tests' naive comment stripper, which had been discarding 77% of the module build
before anything scanned it.

**Deliberately NOT done** (none of these block anything):

- `airsheet` still fails — it failed identically on the pre-split page. It was
  already broken and fixing it is unrelated work.
- `ui/render.js` and `ai.js` are still over 1,700 lines each. They are the two
  obvious candidates for a further split, but splitting them changes real code
  rather than moving it, so it does not belong in a pass whose acceptance
  criterion was byte-identical behaviour.
- The `events.js` sink that would cut the sim↔ui cycles remains optional. The
  cycles are safe as they stand; this is a redesign, to be done and verified on
  its own.


> **Note (2026-09-12, after the fact).** `apps/games/rts/tools/modularize/` — the
> acorn-based tool that performed the split — was **deleted once the split landed
> and both gates passed**: it was the repo's only third-party dependency outside
> the e2e suite, and the game it produced is now the source. It is recoverable
> from git history (commit a228c88) if the mapping ever needs re-deriving.

## Context

The user asked for per-unit art files, rejected the marker/sync scheme ("no duplication"),
then rejected the python build step that replaced it ("这不是垃圾么"), and stated the real
requirement: **"我需要的是个完全模块化的游戏"** and **"模块化，且不需要部署就可以通过 rts.html 直接玩"**.
Decisions taken with the user: **ES modules** (not classic scripts), and **every unit's art stays
its own module** (69 files), converted into real functions.

Today `apps/games/rts/rts.src.html` is HTML + one 23.9k-line inline IIFE (770 top-level
functions, 348 top-level vars, 1,118 names in one closure), spliced with 69 unit-art bodies by
`tools/rts-build.py` into a gitignored `rts.html`. Everything downstream (rts.test.js vm loader,
9 art tools with hard-coded route tables, e2e override, installer walk, service worker) assumes
one self-contained page. The docs' "no ES modules" rule (desktop/filesx split plans) was written
for 4k-line pages with no dependency graph; the RTS is the justified exception and the
design-decisions entry must say so.

Outcome: `apps/games/rts/rts.html` (tracked, HTML+CSS+`<script type="module" src="rts/main.js">`)
loads ~45 subsystem modules + 69 unit modules from `apps/games/rts/rts/**`, served as `/rts/**`.
Playable from the repo with `cd apps/games/rts && python3 -m http.server 8099` (or the dev server
helper), and from the deployed site. No build, no generated file, no duplication. Behaviour
proven identical: 24-cell `__rtsSim` per-minute `stateHash` diff empty, every art sheet PNG
byte-identical, `docs/art-baseline.json` untouched.

## Key facts that shape the design (verified)

- No top-level `let/const/class` in the closure → no TDZ hazards; ~110 top-level executed
  statements (prototype assignments, small IIFEs, `getElementById` bindings).
- **86 top-level vars are reassigned after declaration (~253 sites, ~150 cross-module)**;
  `G` has 604 reads / 12 writes. ESM bindings are live for reads; cross-module writes need
  owner-module setters. A missed write is a **parse error** (assignment to import), never silent.
- Every sim↔ui cross edge (`say`, `eva`, `sfx`, `mmPing`, `fire`, `damage`, `render`…) is a
  `function` declaration → ESM cycles are safe by spec (functions instantiated at link time).
- `rts.test.js` calls `load()` 17 times and needs **two independent instances in one process**
  (line 6563, BroadcastChannel lobby pair) → the node test loader cannot be a plain `import()`.
  `vm.SourceTextModule` exists only under `--experimental-vm-modules` (Node 25). Chosen: a
  zero-dependency concatenator that reproduces the closure in evaluation order (§5.1).
- Unit-art bodies: at most ~33 free identifiers each; only `VLIFT`/`NO_RIM` are enclosing-scope
  names a body writes that escape (closure-level vars → setters). Exactly 4 files have a depth-0
  `return` (dog/wall/gate = whole function bodies; `structures/shipyard` = a genuine early
  return out of `bakeBuilding`). 12 files `var`-declare a name that is also a hot local of their
  bake function (`base.js`→`a`, `factory.js`→`out`, `mcv.js`→`a,i`, …) — the tool must prove the
  bake does not read that name after the chain.
- `shell/install.sh:123` excludes `*/art/*`, `*/tools/*`, `*/docs/*`; `shell/js-syntax.test.js:28`
  skips dirs named `art`/`icons`; `test_static.py:309` drops `/art/` paths. **Runtime module
  paths must therefore avoid a directory named `art`** (the plan agent's `rts/art/…` would have
  been silently un-deployed) → bake modules live under `rts/bake/`, unit art under `rts/units/`.
- The two classic shared scripts (`gamescore.js`, `vibe-modal.js`) are already guarded with
  `window.vibeScores ? … : null` → the game plays without them (leaderboard/confirm absent).
- `npm view acorn` reachable (8.18.0). No root package.json (rule stays: no build/bundler); a
  dev-only `tools/modularize/package.json` with acorn is acceptable (tools/ is never deployed).
- nginx serves `.js` as `application/javascript` (valid for modules) with `no-cache, no-store`;
  sw.js is cache-first for non-precached sub-resources → `/rts/` must be added to its BYPASS.

## Target layout

`apps/games/rts/`
- `rts.html` — tracked page: HTML + CSS + `<script src="gamescore.js">`, `<script src="vibe-modal.js">`,
  `<script type="module" src="rts/main.js">`. URL `/rts.html` unchanged.
- `rts/package.json` — `{"type":"module"}` (lets `node --check` / node `import()` treat the tree as ESM; excluded from deploy).
- `rts/*.js` — one module per section of the closure, bodies verbatim, de-indented by 2:
  `opts.js`, `world.js` (constants + iso projection), `rng.js` (both PRNG streams + `setSeed`/`setBSeed`),
  `combat-tables.js`, `roster.js` (UNITS + IFV_MODES — named `roster` to avoid clashing with `units/`),
  `blds.js`, `geom.js`, `factions.js`, `supers.js`, `state.js` (G, state, difficulty, faction, headless,
  newState, **DIFF moved here from the AI section**), `mapgen.js`, `entities.js`, `path.js`, `combat.js`
  (hash, damage, boom, superweapon runtime, **fire**), `transport.js`, `ore.js`, `special.js`, `move.js`
  (movement + stepUnit/stepAircraft/stepGate), `neutral.js`, `production.js`, `ai.js`, `shroud.js`,
  `net.js` (lockstep, applyCmd, simStep), `watch.js`, `hooks.js` (window.__rts*), `main.js` (boot).
- `rts/bake/*.js` — `terrain.js` (SPR, mkCanvas, shade, VLIFT/NO_RIM + setters, cliffs…), `kit.js`
  (isoBox, ACCENT, facing math, prism/vault/gable/lattice/coolTower), `infantry.js`, `ships.js`,
  `vehicles.js`, `buildings.js`, `walls.js` (COL, applyHouse, wall/gate/explosions, artTop/artBox),
  `civ.js`, `states.js`, `bake.js` (bakeAll/bakeOwned).
- `rts/ui/*.js` — `screen.js` (cv/ctx/cam/zoom/sel/placing/resize/sx/sy), `save.js`, `audio.js`
  (synth+voices+music+eva), `hud.js` (say, updateHUD), `panel.js`, `cursors.js`, `input.js`,
  `render.js`, `minimap.js`, `menus.js`, `loop.js`.
- `rts/units/<class>/<kind>.js` × 69 — `infantry/` 14, `vehicles/` 15, `aircraft/` 2, `ships/` 9,
  `structures/` 29; each `export function drawX(C)` (dog/wall/gate export the whole bake function).
- Section line ranges live in `tools/modularize/sections.json` (hand-authored, ~50 lines); the
  split is regenerated from the monolith until the cut-over, so boundaries are a config change.
- Module basenames must be disjoint from the deployed flat-root set (`apph appreg coach deskstate
  filesx-core gamescore kbd-input keybar sw tab-sync terminal-kbd usage-strips vibe-modal winmgr
  xpra-patches`); a test asserts it.

## Shared mutable state — the one rule

Owner module: `export var G = null; export function setG(v) { G = v; }` (generated, under a
`// --- generated ---` banner at the end of the file). Reads stay verbatim everywhere (live
bindings). The tool rewrites only cross-module write sites, scope-resolved via acorn (not grep —
`bakeBuilding` shadows `rnd/rint` on purpose): `X = e;` → `setX(e);`, `X += e` → `setX(X + (e))`,
`X++` statement → `setX(X + 1)`; any assignment used as a value / destructuring / `for (X of…)`
head → the tool **refuses and lists the site**. Names whose writes are all in-module get no setter.
Rejected: one exported state object (`W.G`) — ~1,100 rewritten sites and every source-regex test.

## The refactor tool — `apps/games/rts/tools/modularize/` (dev-only, acorn + acorn-walk)

Inputs: `sections.json`, `units.json` (per unit: source path, destination, bake function,
export name, extraction class). Computes per section: declared top-level names; free identifiers
resolving to other sections (→ single-line `import { a, b } from './x.js';` headers, sorted);
cross-section writes (→ setters / refusals); load-time statement inventory and an
evaluation-order equivalence check (post-order DFS over main.js's import list vs. original source
order; only `var` values can be read too early — function bindings are exempt); Tarjan SCC over
the import graph (a cycle is an error only if an edge carries a load-time-read `var`).
Emits each module: banner comment, import headers, verbatim body de-indented by 2, `export `
prefixed on declarations other modules reference, generated setters. Idempotent: never reads its
own output; running twice yields byte-identical files. `--check` mode: zero refusals, zero order
violations. Unit bodies: prelude `var g = C.g, cx = C.cx, …` (exactly the computed free-local
set) + body byte-for-byte; context `var C = {…}` built once immediately before each dispatch
chain (vehicles: after `g = sc.g`); call sites `drawRhino(C);`, shipyard
`if (key === 'shipyard') return drawShipyard(C);`, dog/wall/gate become the exported function.
The 12 shadow cases get an explicit "does the bake read this name after the chain?" line in the
P0 report with human sign-off.

## Phases (each ends green, proven, committed)

**P0 — tool + analysis report** (risk: none shipped). Files: `tools/modularize/{package.json,
sections.json, units.json, index.js, lib/*}`; root `.gitignore` += `apps/games/rts/tools/modularize/node_modules/`.
Report: import edges, setter list + refusals, order check, SCC report, per-unit context keys and
extraction class, the 12 shadow answers. Gate: `./run-tests.sh` + `--check` clean.
Commit: `rts: an AST tool that can split the monolith — analysis only, nothing moves yet`.
Fan-out: one opus pair with the acceptance checklist (scope-resolved analysis; the
`bakeBuilding` rnd shadow reported as a shadow; extraction classes from the AST).

**P1 — the 69 unit bodies become real functions, still inside the monolith** (risk: medium).
Includes move to a top-level definitions block above `bakeAll` (so a missed context key is a
`ReferenceError` at `bakeAll()`, caught by `rts.test.js`'s load and the art gate). Build still on,
tools unchanged. Files: `art/units/**` (69), `rts.src.html` (call sites + 5 context constructions),
`art/units/README.md`, `art/README.md`. Gate: (a) + **(c) byte-identical sheet PNGs** + (d) + (e) + (g).
Commit: `rts: every unit's art is a real function taking one context object (69 files), pixel-identical`.
Fan-out: four opus agents in two pairs by class (infantry+aircraft 16, ships 9, vehicles 15,
structures 29); checklist: body byte-identical below the prelude, keys == tool's set, class
sheets hash-match, shadow cases answered.

**P2a — one static server for the art tools** (risk: low). New `tools/lib/serve-rts.js`
(serves `apps/games/rts/` with `shared/` fallback; `.js` → `text/javascript`; `no-store`;
`ART_HTML` overrides only `/rts.html`; also a CLI: `node apps/games/rts/tools/lib/serve-rts.js`
prints a URL — the "play from the repo" one-liner with the leaderboard scripts present).
Replace the route tables in `tools/{art-metrics,legibility,unit-probe,unit-compare,cameo-legibility,
cliff-seams,ra2-compare,ifv-compare,battle-frame,build-cycle,veh-toggle-check,walk-cycle}.js`
(fix walk-cycle's hardcoded ROOT); `tools/clause-checks/*`: `num()` throws on no-match.
Gate: (a) + (d) + each tool reproduces its previous output.
Commit: `rts: one static-file server for every art tool, instead of nine route tables`.

**P2b — THE CUT-OVER** (risk: high, one commit). Generated: `rts/**` (45 modules + 69 unit
modules + package.json). Rewritten: `rts.html` (tracked). Deleted: `rts.src.html`,
`rts-build.test.js`, `tools/rts-build.py`, `apps/games/rts/.gitignore` build lines, the
`run-tests.sh` build tier, the `install.sh` build hook. Edited:
- `shell/install.sh` walk: `case "$rel" in apps/games/rts/rts/*) dst="rts/${rel#apps/games/rts/rts/}";;`
  + `install -D`; `! -name 'package.json'`; dup check unchanged (dst paths are unique).
- `shell/sw.js`: BYPASS += `rts\/`; bump VERSION in P2c. `server/tests/test_static.py`:
  `served_from_disk` += `"rts"`; `_web_sources` skip `"/rts/rts/" in f`.
- `shell/js-syntax.test.js`: files under `apps/games/rts/rts/` → `spawnSync(node, ['--check', f])`.
- `rts.test.js`: `load()` runs `require('./tools/lib/bundle-for-vm.js').source` in the same vm
  sandbox (concatenates modules in ESM evaluation order, strips the canonical single-line
  `import` headers and `export ` prefixes, asserts no duplicate top-level names); `SRC` for the
  source-regex tests = the bundle text; the one regex change: `^ {4}(\w+): \[` → `^ {2}…` (VERSES);
  drop the "exactly one inline script block" assert.
- New `rts-modules.test.js`: one `type="module"` script tag and no inline block; every module
  reachable from main.js; every import relative, `.js`-suffixed, resolvable, single-line; no
  duplicate exports; exactly 69 unit modules each exporting one function, all imported; basenames
  disjoint from the flat-root set; `await import('./rts/main.js')` under a globalThis DOM stub
  really loads and defines `window.__rtsTest`.
- New `tools/sim-identity.js` (`--html <old>` | `--bundle`): 6 seeds × 2 faction orders × 2
  difficulties × 30 game minutes, per-minute `__rtsTest.hash(g)` + the `__rtsSim` return record as JSONL.
- e2e `rts-player.spec.js` + `rts-mp.spec.js`: with `VIBETOP_RTS_HTML`, also route `**/rts/**`
  to the working tree (`text/javascript`).
- Docs: root `CLAUDE.md` (code-map bullet loses its exception; RTS row), `shell/CLAUDE.md`,
  `docs/testing.md`, `apps/games/rts/docs/roadmap.md` rule 5, `art/README.md`,
  `rts/units/README.md` (moved from art/units), `docs/design-decisions.md` entry
  (Symptom → Cause → Fix → why the RTS is the exception to "no ES modules" → Verification →
  Rejected) + `python3 tools/gen-dd-toc.py`; save this plan as `docs/plans/rts-modular.md` at P0.
Gate: all of (a)–(g); **(b) sim diff empty and (c) PNG diff empty are the commit's licence**.
Commit: `rts: a fully modular game — native ES modules, no build step (rts.html loads rts/main.js)`.
Fan-out: generation is one agent running the tool; hand-written work in three lanes (harness /
deploy / docs), two opus pairs; rule: never hand-edit `rts/**` — fix the tool and re-run.

**P2c — release.** Bump `VERSION` + `shell/sw.js` VERSION, commit, push, then deploy (Update
path). Live: `curl -sI …/rts/main.js` content-type is JS; play a minute on `/rts.html` with an
empty console and zero 404s; `rts-player.spec.js` against the live host; `tools/doctor.sh`.
Commit: `v1.19.348: the RTS ships as ES modules, no build step (sw v610->v611)`.

**P3 — optional, later.** `events.js` sink for say/eva/sfx/mmPing; split `ui/render.js` and `ai.js`.

## Verification (run at the end of every phase)

- (a) `./run-tests.sh` green.
- (b) Sim identity: old = `git archive <pre-split sha>` + `rts-build.py` into a scratch dir;
  `node tools/sim-identity.js --html <old rts.html>` vs `--bundle`; `diff` of the JSONL empty.
- (c) Art identity: serve old and new on two ports; run `art/usheet.js` (roster, facings walk/stand/fire,
  states per kind), `vsheet.js`, `airsheet.js`, `fsheet.js`, `cmp.js`, `shot.js` with `RTS_PORT`/`RTS_OUT`;
  `sha256sum` diff empty. Plus `art-metrics.js --record` identical including `detail`.
- (d) `RTS_ART=1 node --test apps/games/rts/rts-art.test.js` green and `git diff --exit-code apps/games/rts/docs/art-baseline.json`.
- (e) `RTS_SLOW=1 node --test apps/games/rts/rts.test.js` green (replay-identity tests included).
- (f) `VIBETOP_BASE_URL=http://127.0.0.1 npx playwright test tests/e2e/tests/rts-player.spec.js`
  (+ `rts-mp.spec.js`, `rts-tablet.spec.js`), first with `VIBETOP_RTS_HTML=$PWD/apps/games/rts/rts.html`.
- (g) Human: `cd apps/games/rts && python3 -m http.server 8099 --bind 127.0.0.1`, open
  `http://127.0.0.1:8099/rts.html`, play a minute, console empty, zero 404s except the two shared
  scripts (guarded); then the same on the deployed site.

## Rejected

Bundler/build step (the thing being removed); one exported state object; an event sink in this
pass; `await import()` as the node test loader (two-instance test); `vm.SourceTextModule`
(experimental flag on every `node --test` run); `.mjs`; module dirs named `art/` (excluded by the
installer walk and the syntax test); classic `<script src>` globals (1,118 window globals, no
module boundary — user chose ESM).

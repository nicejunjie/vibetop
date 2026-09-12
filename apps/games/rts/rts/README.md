# `rts/` — the game

Iron Frontier's whole program, as native ES modules. `../rts.html` is tracked
HTML + CSS whose only script is `<script type="module" src="rts/main.js">`;
everything else is here. **There is no build step.** Save a file, reload the
page. It was a single 24.7k-line inline closure until 2026-09-12 — see the
entry in `docs/design-decisions.md` for why it changed and what was rejected.

## Layout

| Path | What |
|---|---|
| `main.js` | the entry point — imports for side effect, wires the boot |
| `*.js` | one module per subsystem: `opts` `world` `rng` `combat-tables` `roster` `blds` `geom` `factions` `supers` `state` `mapgen` `entities` `path` `combat` `transport` `ore` `special` `move` `neutral` `production` `ai` `shroud` `net` `watch` `hooks` |
| `bake/*.js` | sprite bakers: `terrain` `kit` `infantry` `ships` `vehicles` `buildings` `walls` `civ` `states` `bake` |
| `ui/*.js` | presentation: `dom` `screen` `save` `audio` `hud` `panel` `cursors` `input` `render` `minimap` `menus` `loop` |
| `units/<class>/<kind>.js` | 69 unit-art modules — `infantry/` `vehicles/` `aircraft/` `ships/` `structures/` |
| `package.json` | `{"type":"module"}`, dev-only. It exists so `node --check` treats the tree as ESM; the deploy walk excludes it and the browser never reads it. |

Deployed as `/rts/**` (`shell/install.sh` uses `install -D` so the nesting
survives the flat web root — a relative `import` resolves against the importing
module's own directory). `shell/sw.js` BYPASSes `/rts/`, so a deploy can never
serve a stale module under a freshly cached page.

## The two rules that keep the graph honest

**Reads are plain `import`. Writes go through a setter.** Module bindings are
live, so importing a variable is enough to *read* the owner's current value.
Assigning to an imported binding is a parse error ("assignment to constant"),
so any variable written from another module has a generated `set<Name>()`
exported beside it (~46 of them). Add a cross-module write and you add a setter
— you cannot forget, because the file will refuse to load rather than silently
alias.

**Cycles are allowed, but only across function declarations.** The sim and the
ui genuinely import each other (`damage` calls `sfx`; `applyCmd` reads `sel`),
and that is fine: ESM instantiates and hoists function declarations at link
time, before any module body evaluates. What is *not* fine is a cycle edge that
carries a top-level `const`, a class, or anything computed at evaluation time —
that is a TDZ crash at load. `rts-modules.test.js` guards this.

## How to add a module

1. Create `rts/<name>.js` (or under `bake/` / `ui/`) and `export` what others need.
2. Import it where it is used. If it must run at boot for its side effects and
   nobody imports it, add the import to `main.js`.
3. If another module has to *write* one of its variables, export a
   `set<Name>(v)` for it rather than exporting the variable as writable.
4. `node --check rts/<name>.js`, then `node --test apps/games/rts/rts-modules.test.js`.

## How to add a unit

1. `rts/units/<class>/<kind>.js`, exporting one `export function draw<Kind>(C)`.
   `C` is the single context object the baker hands in — pull the canvas,
   colours and geometry off it; do not reach for module-level state from a draw
   function, and do not import from `ui/`.
   (`dog`, `wall` and `gate` are the exceptions: they export their whole bake
   function, because their art is generated rather than drawn once.)
2. Register it where its class is baked (`bake/infantry.js`, `bake/vehicles.js`,
   `bake/ships.js`, `bake/buildings.js`).
3. Render it and look at it — `apps/games/rts/art/README.md` has the harness
   (`node art/one.js <kind> 4` for a single sprite). The colour and proportion
   rules are in `docs/ra2-art-plan.md`; the standing fidelity requirement is
   `apps/games/rts/docs/roadmap.md`, read it first.

## Running it

From the repo, no deploy, no build:

```bash
node apps/games/rts/tools/lib/serve-rts.js     # prints the URL; serves this tree
# or
cd apps/games/rts && python3 -m http.server 8099   # then open /rts.html
```

A `file://` open will **not** work: module loading is subject to CORS, so the
page needs an http origin. Any static server rooted at `apps/games/rts/` does.

## Tooling around the tree (`../tools/`)

| Tool | What it is for |
|---|---|
| `lib/serve-rts.js` | static server for this tree; the art harness and the play-from-repo CLI both use it |
| `lib/bundle-for-vm.js` | concatenates the tree into one classic script for node's `vm`. `rts.test.js` needs **two independent game instances in one process**, which `import()` cannot give (one module registry per specifier). Also exports `stripComments`, the real comment stripper the source-scanning tests use. |
| `lib/vm-sandbox.js` | the stub DOM that bundle runs against |
| `sim-identity.js` | the 24-cell simulation-identity harness (`--jobs`, default all cores) |

## Proving a change did not alter behaviour

Two gates, and you need both — a headless simulation never executes a draw path,
and an art sheet never plays a match.

```bash
# 1. simulation: 6 seeds x both faction orders x two difficulties x 30 game minutes,
#    hashed per game-minute. Record before, record after, diff.
node apps/games/rts/tools/sim-identity.js --jobs 8 > /tmp/sim-before.txt
#   ...make the change...
node apps/games/rts/tools/sim-identity.js --jobs 8 > /tmp/sim-after.txt
diff /tmp/sim-before.txt /tmp/sim-after.txt      # must be empty

# 2. art: render the sheets from the real page in headless Chromium, both times,
#    and compare the PNGs byte for byte (apps/games/rts/art/README.md).
```

The split itself was signed off exactly this way: 24 simulation cells identical
per-minute, 107 art sheets byte-identical. The art gate is not optional — it is
the only thing that caught an emitter bug that turned `VLIFT = 1;` into
`setVLIFT( );` and painted the IFV `rgb(NaN,NaN,NaN)` while every parse check
and the whole simulation gate stayed green. (`airsheet` fails on the old tree
too; it was already broken.)

And after any change a player can feel, run the real-click path —
`tests/e2e/tests/rts-player.spec.js` — because hooks bypass the input and
command layers by design.

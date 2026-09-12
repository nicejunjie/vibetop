# `rts/` — the game

Iron Frontier's whole program, as 117 plain `<script>` files. `../rts.html` is
tracked HTML + CSS that lists every one of them in load order; everything else
is here. **There is no build step and there are no dependencies.** Save a file,
reload the page — and "the page" can be the file on disk: **double-clicking
`apps/games/rts/rts.html` in a file manager opens and plays the game.** It was a
single 24.7k-line inline closure until 2026-09-12 — see the entry in
`docs/design-decisions.md` for why it changed and what was rejected.

## Layout

| Path | What |
|---|---|
| `main.js` | the last file loaded — wires the boot |
| `*.js` | one file per subsystem: `opts` `world` `rng` `combat-tables` `roster` `blds` `geom` `factions` `supers` `state` `mapgen` `entities` `path` `combat` `transport` `ore` `special` `move` `neutral` `production` `ai` `shroud` `net` `watch` `hooks` |
| `bake/*.js` | sprite bakers: `terrain` `kit` `infantry` `ships` `vehicles` `buildings` `walls` `civ` `states` `bake` |
| `ui/*.js` | presentation: `dom` `screen` `save` `audio` `hud` `panel` `cursors` `input` `render` `minimap` `menus` `loop` |
| `units/<class>/<kind>.js` | 69 unit-art files — `infantry/` `vehicles/` `aircraft/` `ships/` `structures/` |

There is no `import`, no `export` and no module wrapper anywhere. All 117 files
share **one global scope**, which is why `combat.js` can call `sfx()` from
`ui/audio.js` with no ceremony: it is just a function in scope. `rts.html` is
the single source of truth for load order — the `<script src="rts/…">` tags run
top to bottom, after the two shared scripts (`gamescore.js`, `vibe-modal.js`).

Deployed as `/rts/**` (`shell/install.sh` uses `install -D` so the nesting
survives the flat web root). `shell/sw.js` BYPASSes `/rts/`, so a deploy can
never serve a stale script under a freshly cached page.

## The one rule: load order

Hoisting is per file, not across files. A `function` declaration is available
everywhere *after* its file has run — so **a statement that runs while the page
loads may only call functions declared in an earlier file.** Calls inside
function bodies are always fine: event handlers, draw functions and helpers all
run long after every file has loaded.

That is the whole rule, and it bites exactly once in practice: something read at
load time must be defined early. `lsGet`/`lsSet` live in `rts/opts.js` (an early
file) rather than in `rts/ui/save.js` for precisely this reason — `ui/audio.js`
and `ui/input.js` read stored preferences at load time.

`rts-modules.test.js` enforces it, together with the rest of the contract:
`rts.html` lists every file exactly once, no file contains `import`/`export`,
no two files declare the same top-level name, and no top-level name shadows a
browser global (`name`, `status`, `open`, …).

## How to add a file

1. Create `rts/<name>.js` (or under `bake/` / `ui/`). Declare whatever you need
   at top level; other files see it.
2. Add `<script src="rts/<name>.js"></script>` to `rts.html` **in the right
   place** — after anything it calls at load time, before anything that calls
   *it* at load time. Grouped by area, the existing order is the guide.
3. `node --check rts/<name>.js`, then
   `node --test apps/games/rts/rts-modules.test.js`.

## How to add a unit

1. `rts/units/<class>/<kind>.js` declaring one `function draw<Kind>(C)`. `C` is
   the single context object the baker hands in — pull the canvas, colours and
   geometry off it; do not reach for global state from a draw function, and do
   not call into `ui/`.
   (`dog`, `wall` and `gate` are the exceptions: they declare their whole bake
   function, because their art is generated rather than drawn once.)
2. Add its `<script src>` tag to `rts.html` alongside its siblings.
3. Register it where its class is baked (`bake/infantry.js`, `bake/vehicles.js`,
   `bake/ships.js`, `bake/buildings.js`).
4. Render it and look at it — `apps/games/rts/art/README.md` has the harness
   (`node art/one.js <kind> 4` for a single sprite). The colour and proportion
   rules are in `docs/ra2-art-plan.md`; the standing fidelity requirement is
   `apps/games/rts/docs/roadmap.md`, read it first.

## Running it

Three ways, all equivalent, none of which need a deploy or a build:

- **Double-click `apps/games/rts/rts.html`** in a file manager (or
  `xdg-open apps/games/rts/rts.html`). Classic scripts load fine from `file://`;
  this is the reason they are classic scripts.
- Any static server rooted at `apps/games/rts/`:
  `node apps/games/rts/tools/lib/serve-rts.js` (prints the URL), or
  `cd apps/games/rts && python3 -m http.server 8099` and open `/rts.html`.
  The art harness needs this one — Playwright drives an http origin.
- The deployed site: `/rts.html`, with the tree at `/rts/**`.

## Tooling around the tree (`../tools/`)

| Tool | What it is for |
|---|---|
| `lib/serve-rts.js` | static server for this tree; the art harness and the play-from-repo CLI both use it |
| `lib/bundle-for-vm.js` | reads the script order out of `rts.html` and concatenates those files into one source for node's `vm`. `rts.test.js` needs **two independent game instances in one process**, which a single shared global scope in the test process cannot give. Also exports `stripComments` (the real comment stripper the source-scanning tests use) and `forwardCalls` (the load-order gate). |
| `lib/vm-sandbox.js` | the stub DOM that bundle runs against |
| `sim-identity.js` | the 24-cell simulation-identity harness (`--jobs`, default all cores); defaults to this checkout's game |

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

The split was signed off exactly this way, and so was the conversion to classic
scripts: 24 simulation cells identical per-minute, 107 art sheets byte-identical.
The art gate is not optional — it is the only thing that caught a bug that
turned `VLIFT = 1;` into a no-op and painted the IFV `rgb(NaN,NaN,NaN)` while
every parse check and the whole simulation gate stayed green. (`airsheet` fails
on the old tree too; it was already broken.)

And after any change a player can feel, run the real-click path —
`tests/e2e/tests/rts-player.spec.js` — because hooks bypass the input and
command layers by design.

# Unit art, one file per unit

Every unit's drawing code lives here, one file per unit, grouped the way the
bake functions in `rts.html` group them. **Edit the file, then splice it in:**

    node apps/games/rts/tools/art-split.js inject     # art/units -> rts.html
    node apps/games/rts/tools/art-split.js extract    # rts.html  -> art/units (if you edited the page instead)
    node apps/games/rts/tools/art-split.js check      # what rts-split.test.js runs

`rts.html` is still the only thing that runs, deploys, and gets loaded by the
tests and the art tools — nothing in the delivery path changed. These files
are **not** modules: each holds the body of one branch of a bake function,
de-indented, and `rts.html` carries the identical lines between
`// @@ART <class>/<kind>` and `// @@END <class>/<kind>`. `inject` refuses a
file that does not parse as a function body, and the test fails the commit
while the two copies differ (it tells you which side is newer). Why textual
rather than real modules: `docs/design-decisions.md`, "RTS unit art split".

## What a file can use

The body runs **inside** its bake function, so every free identifier is a
local of that function (or of the page's IIFE). The `@@PART` line in each file
names the function; the shared prelude just above the branch in `rts.html` is
where the helpers are defined. The ones every file leans on:

| Class | Function in `rts.html` | The locals you draw with |
|---|---|---|
| `infantry/` | `bakeInfantry(col, kind, fac, phase, dir, state)` | `g` (canvas), `cx`/`by` (foot anchor), `sp`/`gt` (walk pose), `sov`, `col`, `T` (tones); helpers `legs() arms() wpn() face() helmet() carbine() edge()`, `outline()`, `shade()` |
| `infantry/dog` | the whole of `bakeDog()` | its own function — the one file that is a complete function body |
| `vehicles/`, `aircraft/` | `bakeVehicle(col, kind, fac, anim)` → `frame(d, part, tv)` | `g`, `cx`/`by`, the facing (`fx fy px py`, `d`), `len`/`wid`, `hull`/`deck`/`dark`, `panel`/`pdark`/`plit`, `wantH`/`wantT` (hull vs turret pass), `sov`; helpers `chassis() tracks() wheels() prism() puck() barrel() deckPlate() fenders() hatch() lamp() exhaust() bumper() crate() stadium() polyPath() gEllipse()` |
| `ships/` | `bakeShip(col, kind, fac)` → `frame(d)` | `g`, `cx`/`by`, `L`/`W`, `plan`, `HULL`/`DECK`, `big`, `sov` |
| `structures/` | `bakeBuilding(key, col, fac, bph, bdir, dopen)` | `g`, `cx`/`cy`, `gw`/`gh` (plot), `col`, `fac`, `bph` (idle phase 0-1), `pad`/`head`; helpers `apron() pylon() plot()`, and the page's `extrude() isoBox() octCol() padSlab() gridSlab()` |
| `structures/wall`, `structures/gate` | the whole of `bakeWallSeg()` / `bakeGateSeg()` | complete function bodies |

Anything declared with `var` inside a file is hoisted to the bake function, so
two files in the same function must not reuse a name for different things.

## What stays in `rts.html` on purpose

- The per-kind **hull colour table** at the top of `bakeVehicle` / `bakeShip`
  and the `len`/`wid`/`RING`/`VSC` size tables — one shared block each; a
  colour or a size is set there, the file draws with it.
- The shared **aircraft prelude** (the body-of-revolution maths) and the
  `isAirKind` / `turreted` classification.
- The Nighthawk / APC / MCV arm of the vehicle chain is a `/* built below */`
  stub; their bodies are the `vehicles/nighthawk.js`, `vehicles/apc.js`,
  `vehicles/mcv.js` regions further down `frame()`.
- The 7-line fallback `else` of `bakeBuilding`, and every per-key `pad`/`head`
  tweak in its prelude.
- Sheet assembly after `frame()` (the Kirov's gondola layers, the IFV's
  turret sheets) — that is atlas plumbing, not art.

## Names

Files are named by the game's own `kind`/`key`, which is what the sim, the
tests and `docs/` use. Where one key serves two units the file says which:

| File | RA2 unit | Note |
|---|---|---|
| `infantry/gi` | GI | the chain's final `else` |
| `infantry/guardian-gi` | Guardian GI | `kind === 'rocket' && !sov` |
| `infantry/flak-trooper` | Flak Trooper | `kind === 'rocket'`, Soviet |
| `infantry/cleg` | Chrono Legionnaire | |
| `infantry/rocket` (none) | — | see the two above |
| `vehicles/lancer` | Grizzly Tank | |
| `vehicles/spectre` | Prism Tank | |
| `vehicles/mammoth` | Apocalypse Tank | |
| `vehicles/chronominer` / `warminer` | Chrono Miner / War Miner | both `kind === 'harv'`, split on `sov` |
| `aircraft/harrier` | Harrier **and** Hornet | one body, `kind` picks the paint |
| `aircraft/kirov` | Kirov Airship | |
| `ships/aegis` | Aegis Cruiser | |
| `ships/dread` | Dreadnought | |
| `ships/seascorp` | Sea Scorpion | |
| `ships/lcraft` | Amphibious Transport | |
| `ships/squid` | Giant Squid | |
| `structures/base` | Construction Yard | both factions in one file, branched on `fac` |
| `structures/sentry` | Pillbox (Allied) | `structures/sentrygun` is the Soviet Sentry Gun |
| `structures/depot` | Service Depot | |
| `structures/lab` | Battle Lab | |
| `structures/gapgen` | Gap Generator | |
| `structures/spysat` / `psisensor` | Spy Satellite Uplink / Psychic Sensor | |
| `structures/chrono` / `weather` / `curtain` / `nuke` | Chronosphere / Weather Control / Iron Curtain / Nuclear Silo | |

Every structure file draws **both factions** (`fac === 'dir'` Directorate /
`'col'` Collective) where the key exists for both.

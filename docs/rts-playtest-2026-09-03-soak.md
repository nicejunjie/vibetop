# Iron Frontier — soak pass (docs/rts-playtest.md §B)

144 headless matches, 30 game-minute cap each, invariants asserted **every tick**
(not every minute — see "harness" below). Repo untouched; everything lives in
`/home/junjie/.claude/jobs/dcf15416/tmp/play/`.

## 1. Run matrix

Base matrix as briefed — seeds 101/202/303/404/505/606 × both faction orders
(`dir`v`col`, `col`v`dir`) × {hard vs easy, normal vs normal} = **24 matches**.

`__rtsSim()` takes no map id, so it always plays `frontier`. I added a driver that
rebuilds its exact opening through `__rtsTest` with a map id (verified to reproduce
`__rtsSim` tick-for-tick on `frontier`), and ran the same 24-cell matrix on the other
five maps = **120 more matches**, 144 total.

| Map | Runs | Unresolved @30 min | Hard beat Easy | Median end | Range |
|---|---|---|---|---|---|
| frontier | 24 | 0 | 11/12 | 14.7 m | 10.8–23.2 |
| choke | 24 | 1 | 12/12 | 15.8 m | 10.4–29.2 |
| gems | 24 | 0 | 12/12 | 16.6 m | 10.7–28.7 |
| lake | 24 | 3 | 12/12 | 16.7 m | 10.7–28.9 |
| river | 24 | 0 | 11/12 | 17.2 m | 10.2–21.3 |
| tundra | 24 | 0 | 12/12 | 14.6 m | 10.3–24.2 |

- §B "match ends within 30 min on Hard vs Easy": **72/72 pass**; Hard won 70/72.
  Upsets: `s202 hard/easy dirvcol @frontier` (easy won 18:27), `s505 hard/easy colvdir @river` (easy won 17:17).
- Unresolved (both sides alive at 30:00), all `normal/normal`:
  `s606 dirvcol @choke`, `s101 dirvcol @lake`, `s202 colvdir @lake`, `s303 colvdir @lake`.
- Determinism confirmed against real chromium: `node parity.js` runs two cells in the
  node-vm loader *and* in a Playwright chromium page at `http://127.0.0.1:8121/rts.html`
  — **bit-identical** results, so the fast node path is legitimate.

## 2. Findings

| # | Severity | Invariant | Count | Worst example | Hypothesis (function) |
|---|---|---|---|---|---|
| 1 | **blocker** | B1 — unit holds an order > 60 s without moving or firing | 324 in 62/144 matches | `s303 hard/easy dirvcol @river` @14:31 — `rifle` id220 p0 (12.95,13.46) `order=attack@15,32`, no move/fire for **272 s**, `path=none noProg=0 crowd=17` | `stepUnit` move/attack branches + `moveAlong`/`advance`. **Two proven mechanisms, both permanent** (repros below). |
| 2 | **blocker** | (added) no AI superweapon ever fires | 14 SW buildings built, **0 firings in 144 matches**; only 1 ever charged | `s404 hard/easy colvdir @lake` — `curtain` built @19.2 m, match ended 27:16, `fired=0`; `nuke` built @22.7 m, charge 10 m | `aiProduce` gate (`lab` → ecoKey → `credits>6000` + `army>=group`) is not met before ~min 19, and charge is 7–10 min against a 15.9 min median match. `dir`'s `chrono`/`weather` were built **zero** times. |
| 3 | **major** | A3 — units stacked on one tile (stationary ≥5, or ≥3 vehicles) | 2042 in **144/144**; 65/144 matches reach a ≥10-unit stack | `s606 normal/normal dirvcol` @16:00 — **34 stationary units on tile 57,53** (17 flak + 17 conscript, all p1) | `aiTactics` writes the *identical* `stage.x/stage.y` (and `home.x/home.y`) into every unit's order — it never calls `orderUnitsTo`, so the ring spread is bypassed; and `moveAlong`'s separation only runs while a unit is following a path, so an arrived blob is never pushed apart. |
| 4 | **major** | (added) AI roster is 11 entries short | see §3 | `mcv` requires `depot`; `depot` is never in `aiProduce`'s `want` chain ⇒ the documented "rebuild the base from an MCV" path is **unreachable** | `aiProduce` — `engineer`, `tanya`, `ivan`, `drone`, `teslatank`, `depot` appear nowhere in it. |
| 5 | **major** | (added) AI army idles > 3 min with > 8 units while the enemy base stands | 20 in 17/144 | `s404 normal/normal colvdir @river` @10:00 — p1 `dir` has **23** armed units frozen 3 min; `posture=build army=58 attacking=false` | `stepAI` strategy block: `posture='attack'` needs `myArmy > theirArmy*0.95 + defenceValue(foe)*0.6`. A turtling enemy's defence value grows without bound and there is no fallback, so a 58-unit army sits in 'build'. Same cause as the 4 unresolved matches. |
| 6 | **major** | (added) Collective's second defence is itself | `sentrygun` built 0/144; `tesla` 456 | `aiProduce`: `def = FACTIONS.col.defence = 'tesla'` and `def2 = (fac==='col') ? 'tesla' : 'prism'` | `aiProduce`. `countBld(def)+countBld(def2)` double-counts Tesla Coils, so the 3/5-defence cap is really 1.5/2.5, and the cheap $500 Sentry Gun can never be picked. |
| 7 | minor | A4 — ground unit standing inside a building footprint | 125 in 36/144 | `s202 hard/easy colvdir` @5:00 — `rifle` id70 at (47.5,49.51) on tile 48,50 occupied by `sentry` id18 | `moveAlong` tests `tilePassable(nx,u.y)` and `tilePassable(u.x,ny)` but **never `(nx,ny)`**, so a diagonal step cuts the corner and lands inside a footprint. |
| 8 | minor | B2 — harvester idle > 45 s with reachable ore and a refinery | 12 in 3/144 (gems, river) | `s303 normal/normal colvdir @gems` @22:12 — harvester id21 `state=tomine cargo=0` still 46 s, `mineAt=31,36` while ore sits at 34,42, `noProg=38` | `stepHarvester` — the `noProg > 45` blacklist-and-retarget threshold is never reached because `advance()` is not called on every tick in this state. |
| 9 | minor | B8 — credits flat > 120 s while harvesters mine | 9 in 7/144 | `s202 normal/normal colvdir @choke` @15:41 — p0 `col` $212 unchanged 121 s with 1 harvester + refinery | `stepHarvester` round-trip after the near seams are mined out; correlates with a single surviving harvester. |
| 10 | minor | (added) unit lane holds paid items with no producer | 2 in 2/144 | `s101 normal/normal colvdir @gems` @16:07 — p1 `dir` lane `a` holds 1 paid item, no `airforce`, 181 s | `stepQueues` `continue`s the lane forever; no refund and `aiProduce` never rebuilds the Airforce Command. |
| 11 | nit | B6 — position off the map | 1 in 1/144 | `s606 normal/normal dirvcol` @17:00 — `flaktrack` id279 at **(58.4439, 63.4439)**, MAP=64 so 63 is the last tile | `moveAlong` has no `Math.max(0,Math.min(MAP-1,…))` clamp (`flyToward` does); the separation vector pushes a unit past the edge. |
| 12 | major *(test infra)* | (added) `__rtsSim` is not reproducible after the first call in a process | every 2nd+ call | seed 202 `normal/normal dirvcol`: 1st call ends 12:20 `over=-1`; every later call in the same process ends 30:00 `over=0` | module-level `pathQ` is only cleared by `newGame()` (line ~16982), never by `newState()`/`__rtsSim`. Leftover path requests holding *dead-match* units are executed in the new match. Any harness that loops seeds in one process silently produces garbage after run #1. |

### Proven repros for #1 (both permanent, both in `stepUnit`)

`node repro-emptypath.js` — **give-up test is dead code.** `astar` returns `null`
(unreachable). `advance()` refreshes `u.repathAt = g.tick` every 8 ticks while the unit
has no path, so the move branch's `g.tick - u.repathAt > 90` can never be true. Measured:
order held, `movedAt=-99`, `noProg=18000` after 5 game minutes and rising. The attack
branch was already fixed to use `noProg > 90`; the move branch was not.

`node repro-emptypath2.js` — **empty array is truthy.** Order a unit onto a blocked tile
whose relocated goal is the tile it already stands on: `astar` returns `[]`,
`runPathQueue` stores it. `moveAlong` returns false without clearing `u.path`;
`advance()` only re-requests when `!u.path`, and `[]` is truthy. Measured: `path=len0`,
`pi=0`, `repathAt=-999` (proving no repath was *ever* requested), `noProg=18000`,
order still held after 5 game minutes. This is the `path=0` signature seen in the matrix
(one example carried `noProg=3655`).

## 3. Roster coverage (144 matches, both factions, all 6 maps)

**Never built by either side:** `engineer`, `mcv`, `depot`.

| Faction | Units never built | Structures never built |
|---|---|---|
| Directorate (`dir`) | `engineer`, `tanya`, `mcv` | `depot`, `chrono`, `weather` |
| Collective (`col`) | `engineer`, `ivan`, `drone`, `teslatank`, `mcv` | `depot`, `sentrygun` |

Everything else appeared, but the distribution is a finding in itself:

- units: `conscript` 14085, `rifle` 10091, `flak` 2559, `lancer` 2534, `rocket` 2272,
  `rhino` 2043, `ifv` 1802, `flaktrack` 1327, `teslatrooper` 1324, `harvester` 1218,
  `rocketeer` 376, `harrier` 258, `v3` 117, `prismtank` 70, `mirage` 58, `mammoth` 47,
  `kirov` 31. Tier-3 armour is **0.5 %** of everything fielded — a player would say the
  AI never builds tanks.
- structures: `power` 1245, `factory` 991, `sentry` 724, `refinery` 586, `barracks` 562,
  `tesla` 456, `base` 288, `flakcannon` 197, `lab` 114, `patriot` 97, `airforce` 96,
  `radar` 81, `reactor` 28, `prism` 18, `curtain` 12, `purifier` 4, `nuke` 2.
  The Ore Purifier is `dir`'s `ecoKey` and sits on an `else if` rung *ahead of* the
  superweapon rung, so at 4 placements it is also what keeps `chrono`/`weather` at zero.

Invariants that never fired **and were proved live** by `node selftest.js` (so the zero
is "not observed", not "not wired"): `A2-mute-defence` (a sentry with a conscript in
range: 313 in-range ticks, 416 cooling ticks, target killed), `B7-aircraft-no-pad`
(a harrier keeps `pad=0` after its Airforce Command is killed and does not die).
Invariants that never fired and are **vacuous by coverage**: `B3-ready-unplaced`,
`X2-sw-clock-frozen`, `X6-no-rearm`, `A5-refinery-no-harvester`, `A6-brownout`,
`A8-hoard`, `X1-unit-lost-on-spawn`, and every `B6` structural check except `offmap`.

## 4. Invariants added beyond the doc

Beyond §B's nine, and beyond the five named in the brief (A1 idle army, A2 mute defence,
A3 tile stack, A5 refinery with no harvester, A6 brownout):

- **A4 `unit-in-building`** — a ground unit standing on a tile `g.occ` says is a building.
- **A8 `hoard`** — a side above $15 000 for 5 min (money the AI cannot spend).
- **X1 `unit-lost-on-spawn`** — a unit lane shifts a finished item but `side.made` does
  not rise in the same tick; `stepQueues` does `q.list.shift()` *before* `freeTileNear()`,
  which can return `null` and silently bin a paid unit. Checked every tick.
- **X2 `sw-clock-frozen`** — `sw.t` static > 60 s while the building stands and the power
  bar reads healthy (the "frozen superweapon clock" from the protocol preamble).
- **X3 `orphan-queue`** — a unit lane holding paid items with its producer destroyed.
- **X6 `no-rearm`** — an aircraft parked on its pad below full ammo, not rearming.
- **B6 extensions** — `hp <= 0` but alive, live entity missing from `g.byId`, position
  outside `[0, MAP-1]`, occupancy pointing at a dead/missing building.

Harness corrections worth carrying forward (each was producing a *false* finding before
it was fixed): idle timers are clamped by `u.born` (a fresh unit's `movedAt` is `-99`,
which read as "idle since tick 0"); the dead-entity scan runs on the sim's own reap tick
(`g.tick & 31 === 0`) because at a minute boundary dead entities are legitimately still
in the arrays; the flat-credits clock only starts once a refinery *and* a harvester both
exist, so the opening is not reported as a stalled economy; and A3 only counts units
stationary for 10 s, so a blob crossing a tile is not a finding.

## 5. Re-running the harness

Everything is in `/home/junjie/.claude/jobs/dcf15416/tmp/play/`:

```
node soakB.js <seed> <diffA> <diffB> <facA> <facB> <minutes> [out.json] [mapId]
bash matrix.sh          # the 24-cell briefed matrix   -> out/*.json
bash matrix-maps.sh     # the same 24 cells x 5 more maps -> out2/*.json
node agg2.js            # aggregates out/ + out2/: matrix, violations, roster
node parity.js          # node-vm vs Playwright chromium determinism check
node selftest.js        # proves the quiet detectors' inputs are live
node repro-emptypath.js # blocker #1, mechanism A (dead give-up test)
node repro-emptypath2.js# blocker #1, mechanism B (empty path array)
```

`soakB.js` installs its observer by replacing `g.over` with an accessor — the sim's own
`while (… && !g.over)` and `simStep`'s `if (!g.over)` read it once per tick after the
reap, which gives a per-tick hook without touching `landing/rts.html`. One process per
match is mandatory (finding #12). The full 144-match sweep takes ~4 minutes at 8-way
parallelism.

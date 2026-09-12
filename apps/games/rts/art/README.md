# rts art harness

Playwright renders of `apps/games/rts/rts.html` sprites. Nothing is built —
just serve the game directory (the page loads its ES modules from `rts/**`,
so the server's root must be `apps/games/rts/`):

    node apps/games/rts/tools/lib/serve-rts.js &          # prints the URL
    # or: cd apps/games/rts && python3 -m http.server 8099 --bind 127.0.0.1 &

Then, from anywhere (`RTS_PORT` / `RTS_URL` pick the server, `RTS_OUT` the output dir, default `apps/games/rts/art/out/`):

    node apps/games/rts/art/one.js power 4   # one structure, both factions x both player colours, zoomed
    node apps/games/rts/art/fsheet.js        # every structure
    node apps/games/rts/art/vsheet.js        # vehicles, 8 facings
    node apps/games/rts/art/usheet.js        # every unit
    node apps/games/rts/art/shot.js          # in-game 1:1 scene, as Directorate and as Collective
    node apps/games/rts/art/cmp.js           # each structure to its own PNG
    node apps/games/rts/art/airsheet.js      # air layer: Harrier/Kirov facings, Rocketeer, AA infantry (prints bbox aspects)

## Editing the art itself

Each unit's drawing code is its own ES module under
`apps/games/rts/rts/units/<class>/<kind>.js` (`infantry/`, `vehicles/`,
`aircraft/`, `ships/`, `structures/`), exporting one `drawX(C)` that takes a
single context object. `rts.html` — what everything above renders — loads them
through `rts/main.js`; there is nothing to build, so a saved edit is live on the
next reload. What a unit module may use, and the rest of the tree, is in
`apps/games/rts/rts/README.md`. (The old `art/units/**` tree and
`tools/rts-build.py` are gone.)

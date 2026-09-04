# rts art harness

Playwright renders of `apps/games/rts/rts.html` sprites. Serve the page first:

    cd landing && python3 -m http.server 8099 --bind 127.0.0.1 &

Then, from anywhere (`RTS_PORT` / `RTS_URL` pick the server, `RTS_OUT` the output dir, default `apps/games/rts/art/out/`):

    node apps/games/rts/art/one.js power 4   # one structure, both factions x both player colours, zoomed
    node apps/games/rts/art/fsheet.js        # every structure
    node apps/games/rts/art/vsheet.js        # vehicles, 8 facings
    node apps/games/rts/art/usheet.js        # every unit
    node apps/games/rts/art/shot.js          # in-game 1:1 scene, as Directorate and as Collective
    node apps/games/rts/art/cmp.js           # each structure to its own PNG
    node apps/games/rts/art/airsheet.js      # air layer: Harrier/Kirov facings, Rocketeer, AA infantry (prints bbox aspects)

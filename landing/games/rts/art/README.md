# rts art harness

Playwright renders of `landing/games/rts/rts.html` sprites. Serve the page first:

    cd landing && python3 -m http.server 8099 --bind 127.0.0.1 &

Then, from anywhere (`RTS_PORT` / `RTS_URL` pick the server, `RTS_OUT` the output dir, default `landing/games/rts/art/out/`):

    node landing/games/rts/art/one.js power 4   # one structure, both factions x both player colours, zoomed
    node landing/games/rts/art/fsheet.js        # every structure
    node landing/games/rts/art/vsheet.js        # vehicles, 8 facings
    node landing/games/rts/art/usheet.js        # every unit
    node landing/games/rts/art/shot.js          # in-game 1:1 scene, as Directorate and as Collective
    node landing/games/rts/art/cmp.js           # each structure to its own PNG
    node landing/games/rts/art/airsheet.js      # air layer: Harrier/Kirov facings, Rocketeer, AA infantry (prints bbox aspects)

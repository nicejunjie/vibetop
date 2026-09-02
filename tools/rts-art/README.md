# rts art harness

Playwright renders of `landing/rts.html` sprites. Serve the page first:

    cd landing && python3 -m http.server 8099 --bind 127.0.0.1 &

Then, from anywhere (`RTS_PORT` / `RTS_URL` pick the server, `RTS_OUT` the output dir, default `tools/rts-art/out/`):

    node tools/rts-art/one.js power 4   # one structure, both factions x both player colours, zoomed
    node tools/rts-art/fsheet.js        # every structure
    node tools/rts-art/vsheet.js        # vehicles, 8 facings
    node tools/rts-art/usheet.js        # every unit
    node tools/rts-art/shot.js          # in-game 1:1 scene, as Directorate and as Collective
    node tools/rts-art/cmp.js           # each structure to its own PNG
    node tools/rts-art/airsheet.js      # air layer: Harrier/Kirov facings, Rocketeer, AA infantry (prints bbox aspects)

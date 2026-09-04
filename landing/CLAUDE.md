# landing

Unified desktop UI and supporting static pages. Deployed via `./install.sh` (no sudo).

## Layout

One directory per Start-menu item. The **source tree is grouped; the web root
stays FLAT** — every page keeps the URL it always had (`/notes.html`, `/rts.html`,
`/landing.html`). Nothing outside `install.sh` knows where a file lives in the
repo, which is why this could be reorganised without touching a single URL, the
`sw.js` PRECACHE list, the `APPS` map, or an nginx location. **Keep it that way:**
move a file freely, but do not change what it deploys to.

```
shell/        the desktop itself + its modules and auth surfaces
  desktop.html   the shell at `/` (Start menu, iframe viewport, status bar,
                 server-side state via /api/desktop) — also holds the APPS registry
  sw.js         PWA service worker; its VERSION is BOTH the cache key and the
                deploy signal /api/events watches (see the root CLAUDE.md)
  manifest.json icons/ login.html loggedout.html
  winmgr.js coach.js apph.js keybar.js   (+ their .test.js)
shared/       used by MANY pages — vibe-modal.js (11), gamescore.js (5)
apps/<item>/  one per Start-menu app: services, notes, upload, monitor,
              tokenstats, update, config, video, imageview, x11launcher,
              files (files.html + filesx.html + filebrowser-patches.js), office
games/<item>/ minesweeper, solitaire, game2048, circuit, and rts/ — the game,
              its tests, its art pipeline (art/) and its docs (docs/) together
diagnostics/  rzdbg.html — cursor/hit-test probe, deliberately NOT in the sw
              shell set: network-only, so it can never be served stale
install.sh    deploys by WALKING the tree — see below
js-syntax.test.js   cross-cutting parse guard for every deployed/injected script
```

### install.sh deploys by walking, not by a list

Adding a page needs no install line, and deleting one cannot leave a file behind
in the web root. The old hand-written list had to be edited for both, and when
that was forgotten the web root kept serving a file the repo no longer had —
`mario.html` survived months that way, reachable long after Circuit Runner
replaced it. Only genuine exceptions are declared, in the `RENDERED` table:
a different destination name (`shell/desktop.html` → `index.html`,
`apps/services/index.html` → `landing.html`) or a `@TOKEN@` to stamp
(`@VERSION@`/`@SW_VERSION@`, `@APP_HOME@`).

Because the web root is flat, two grouped sources **can** collide on one URL —
something the old list made impossible by construction. `install.sh` checks for
duplicate destination basenames and fails loudly rather than letting one page
silently overwrite another at deploy time. `test_static.py` resolves pages by
basename through the same assumption.

## Updating

1. Edit the source file(s) here.
2. Run `./install.sh` (without sudo — sudo resolves `$HOME` to `/root/`).
   `DRY_RUN=1 ./install.sh` prints the full source → web-root plan without writing.
3. Reload the browser. No nginx reload needed — served as static files.

Full architecture: [`../docs/desktop.md`](../docs/desktop.md) (shell) and
[`../docs/apps.md`](../docs/apps.md) (apps). Index: [`../CLAUDE.md`](../CLAUDE.md).

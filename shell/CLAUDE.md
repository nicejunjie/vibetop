# shell

The desktop itself, and the installer that deploys the whole static web root
(shell + shared + every app page). Run `./install.sh` (no sudo).

## Layout

`apps/<section>/<item>/` mirrors the Start menu's **own sections** — the
categories are not invented here, they are the `section:` values in the `APPS`
map in `shell/desktop.html`. The **source tree is grouped; the web root stays
FLAT** — every page keeps the URL it always had (`/notes.html`, `/rts.html`,
`/landing.html`). Nothing outside `install.sh` knows where a file lives in the
repo. **Keep it that way:** move a file freely, but never change what it deploys to.

```
shell/        the desktop itself — NOT an app
  desktop.html   the shell at `/` (Start menu, iframe viewport, status bar,
                 server state via /api/desktop) — also holds the APPS registry
  sw.js         PWA service worker; its VERSION is BOTH the cache key and the
                deploy signal /api/events watches (see the root CLAUDE.md)
  manifest.json icons/ login.html loggedout.html
  winmgr.js coach.js apph.js keybar.js   (+ their .test.js)
  diagnostics/  rzdbg.html — cursor/hit-test probe, deliberately NOT in the sw
                shell set: network-only, so it can never be served stale
  install.sh    deploys the WHOLE static web root — see below
  js-syntax.test.js   cross-cutting parse guard for every deployed/injected script
shared/       used by MANY pages — vibe-modal.js (11), gamescore.js (5)
apps/
  everyday/   notes upload x11launcher files office video imageview
  games/      minesweeper solitaire game2048 circuit rts (game + art/ + docs/)
  utilities/  services monitor tokenstats
  system/     update config
```

Apps whose backend is more than a page still own a top-level sub-project
own an `install.sh`, an nginx fragment and a daemon inside their app directory.
The one exception is `server/` — the manager, which is the backend for EVERY app
and generates the global nginx site config, so it is not an app and does not live
under `apps/`.

### install.sh deploys by walking, not by a list

Adding a page needs no install line, and deleting one cannot leave a file behind
in the web root. The old hand-written list had to be edited for both, and when
that was forgotten the web root kept serving a file the repo no longer had —
`mario.html` survived months that way, reachable long after Circuit Runner
replaced it. Only genuine exceptions are declared, in the `RENDERED` table:
a different destination name (`shell/desktop.html` → `index.html`,
`apps/utilities/services/index.html` → `landing.html`) or a `@TOKEN@` to stamp
(`@VERSION@`/`@SW_VERSION@`, `@APP_HOME@`).

Because the web root is flat, two grouped sources **can** collide on one URL —
something the old list made impossible by construction. `install.sh` checks for
duplicate destination basenames and fails loudly rather than letting one page
silently overwrite another at deploy time. `test_static.py` resolves pages by
basename through the same assumption.

**The other half of the contract:** the manager's Update must redeploy when any
of these directories changes. `WEB_SOURCE_DIRS` in `terminal-manager.py` is
asserted against this installer's own walk by
`test_web_redeploy_trigger_covers_every_dir_the_installer_walks` — when `landing/`
was split, `touched("landing/")` silently matched nothing and an Update would
pull code it never installed. Add a directory here and the test tells you.

## Updating

1. Edit the source file(s) here.
2. Run `./install.sh` (without sudo — sudo resolves `$HOME` to `/root/`).
   `DRY_RUN=1 ./install.sh` prints the full source → web-root plan without writing.
3. Reload the browser. No nginx reload needed — served as static files.

Full architecture: [`../docs/desktop.md`](../docs/desktop.md) (shell) and
[`../docs/apps.md`](../docs/apps.md) (apps). Index: [`../CLAUDE.md`](../CLAUDE.md).

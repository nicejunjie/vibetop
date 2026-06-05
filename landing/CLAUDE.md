# landing

Unified desktop UI and supporting static pages. Deployed via `./install.sh` (no sudo).

## Files

- `desktop.html` — main desktop UI at `/` (tab bar, iframe viewport, status bar)
- `index.html` — old service listing page, preserved at `/landing.html` (Home tab)
- `notes.html` — scratchpad at `/notes.html` (Notes tab)
- `filebrowser-patches.js` — UI enhancements injected into FileBrowser via nginx `sub_filter`
- `install.sh` — copies files to `~/claude-web-www/`

## Updating

1. Edit the source file(s) here.
2. Run `./install.sh` (without sudo — sudo resolves `$HOME` to `/root/`).
3. Reload the browser. No nginx reload needed — served as static files.

Full architecture: [`../CLAUDE.md`](../CLAUDE.md).

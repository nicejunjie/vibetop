# server

**The backend for every app** — not just terminals. `terminal-manager.py` (~7k
lines) is a single stdlib `http.server` running as **root** on `127.0.0.1:7680`
that serves every `/api/*` route (notes, files, upload, office, browser/x11,
desktop registry, share, update, SSE `/api/events`) plus the auth handshake
(`/api/login`, `/api/authcheck`). The file is still named `terminal-manager.py`
because it lived in `terminal/` until 2026-09-03; the directory now says what it
is, and renaming the file is a separate change with its own import churn.

- `terminal-manager.py` — the server. New endpoints go here; `do_GET`/`do_POST`
  dispatch is a flat `if self.path == …` ladder.
- `system_status.py` · `claude_stats.py` · `codex_stats.py` ·
  `service_discovery.py` — heavy read-only collectors, imported as siblings.
- `install.sh` — generates the **global** nginx site config (a heredoc, not a
  checked-in file) and installs `vibetop-manager.service`. It also deploys the
  Terminal app, which is why it carries TWO directories: `APP_DIR` (here) and
  `TERM_APP_DIR` (`apps/everyday/terminal/`). The manager unit renders with the
  first, `vibetop-session@`/`vibetop-ttyd@` with the second.
- `tests/` — the whole manager suite (`cd server && python -m pytest tests/ -q`).

## Why this is not under `apps/`

Every other app owns its directory under `apps/<section>/<item>/`. The server is
not an app: it is what all of them talk to, and it generates the site config that
routes them. Putting it under `apps/` would recreate the exact naming lie that
`terminal/` used to be.

## The rule that keeps biting

**Root proxies, per-user daemons act.** The manager never touches a user's files
itself — it launches per-user `systemd-run` transient units and proxies bytes to
them (`apps/everyday/files/fileagent.py`, `vibetop-session` + ttyd, xpra,
FileBrowser). Unix permissions are the entire authorization fence, so anything
that reads or writes user data belongs in the per-user daemon, never here.

Full architecture: [`../docs/terminal.md`](../docs/terminal.md),
[`../docs/multi-user.md`](../docs/multi-user.md). Index:
[`../CLAUDE.md`](../CLAUDE.md).

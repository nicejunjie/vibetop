# Health check & operations

> First stop on a misbehaving host: `sudo ./tools/doctor.sh`.

## Health check

**`sudo ./tools/doctor.sh`** is the fastest first stop on a misbehaving host — a
read-only config diagnostic that codifies the gotchas below + `docs/design-
decisions.md` into PASS/WARN/FAIL checks with the one-line fix each (RestrictNamespaces
on the manager, `APP_USER` linger, dual-homed NICs, xpra version, unstamped units,
`KillMode=process`, D-Bus/xhost, disk, ACLs, nginx `-t`), plus two **agreement**
sections for the producer/consumer path pairs that drift silently — *Operator
identity* (proxy unit `User=` vs `VIBETOP_ADMINS`) and *Web root* (nginx `root` vs
where the installers deploy; injected-script resolution; orphaned `*www*` dirs;
deployed-vs-checkout `sw.js`). Where `smoke-test.sh`
asks "is it up?", doctor asks "is it configured to *stay* up?".

**It is multi-user aware, and that is load-bearing.** `MULTIUSER` is decided from
the deployed site's `auth_request /internal/authcheck`, and the shared
`vibetop-{browser-xpra,x11-xpra,x11-dbus,filebrowser}` units are then reported
**SKIP** with their per-user counts instead of FAIL — they're the legacy
single-user services, correctly inactive on a multi-user host (same distinction
`smoke-test.sh` draws). Likewise the OnlyOffice secret path comes from
`ONLYOFFICE_SECRET_FILE` in `/etc/vibetop/manager.env`, not a hardcoded
`$APP_HOME/.config/...`, and an unreadable `0700` secret dir reports SKIP, never
"missing". Before these, doctor printed **5 FAILs on a perfectly healthy `/opt`
host** — and a diagnostic that cries wolf is one people stop reading, so keep new
checks layout-aware. Then the manual probes:

```bash
systemctl status vibetop-manager vibetop-browser-xpra vibetop-x11-xpra vibetop-x11-dbus vibetop-filebrowser
docker ps --filter name=vibetop-onlyoffice                      # OnlyOffice container (office Edit)
curl -sI http://127.0.0.1/ http://127.0.0.1/t1/ http://127.0.0.1/browser/ http://127.0.0.1/x11-display/ http://127.0.0.1/files/
curl -s http://127.0.0.1/api/events --max-time 2 | head -1      # SSE auto-refresh stream (-> "retry: 5000")
curl -s http://127.0.0.1/onlyoffice/healthcheck                 # -> true when the doc server is up
curl -s http://127.0.0.1/api/system/status
curl -s http://127.0.0.1/api/terminals/status
curl -s http://127.0.0.1/api/ping                               # -> {"ok":true} (liveness; what the systemd watchdog probes)
curl -s http://127.0.0.1/api/metrics                            # self-metrics: requests/latency/errors, SSE clients, terminal churn, uptime
sudo systemctl status cloudflared
sudo tail -f /var/log/vibetop/manager.log                       # manager actions/errors (also: journalctl -u vibetop-manager)
```

The manager unit has a **liveness watchdog**: `WatchdogSec=60` in
`vibetop-manager.service` + a thread (`_watchdog_loop`) that pets it only while
a loopback `GET /api/ping` actually answers — so a *wedged* manager (stuck accept
loop, exhausted threads) is restarted, which the crash-only `Restart=on-failure`
would miss. `_sd_notify` is a dependency-free sd_notify (no-op without
`NOTIFY_SOCKET`, so local/test runs are unaffected).

**Backups** — `tools/backup.sh` tars the irreplaceable host-local state
(`~/.local/share/desktop-*`, terminal/notes/update data, FileBrowser DB, the
OnlyOffice secret, `~/Documents`) to `~/vibetop-backups`, keeping the newest 14.
`--dry-run` previews, `--install-timer` sets up a daily systemd timer, `--list`/
`--restore FILE` manage archives. None of this state is in git, so it's the one
thing a disk loss would take.

The manager logs via a `vibetop` Python logger to **both** journald (stderr) and a
self-rotating file `/var/log/vibetop/manager.log` (`RotatingFileHandler`,
~12 MB cap = 2 MB × 6, no logrotate/cron needed). It's **selective**: `INFO` on
real actions (terminal start/stop, `x/launch`, cross-device close, reset, update
outcome, SSE reload push) and `WARNING` on failures; the per-request HTTP access
log is at `DEBUG` (off by default). Raise verbosity with `LOG_LEVEL=DEBUG` in the
unit's environment. See `docs/design-decisions.md` for the rationale.

## Key operational commands

```bash
# Terminal operations
curl -X POST http://127.0.0.1/api/terminals/5/start  # start terminal 5
curl -X POST http://127.0.0.1/api/terminals/5/stop   # stop terminal 5
curl http://127.0.0.1/api/terminals/status            # list running terminals
sudo systemctl restart vibetop-manager             # restart manager API

# Browser operations
sudo systemctl restart vibetop-browser-xpra            # restart xpra + chromium
xpra info :99                                         # session info

# File manager
sudo systemctl restart vibetop-filebrowser         # restart file manager

# System status
curl http://127.0.0.1/api/system/status               # CPU, memory, uptime, GPU
curl http://127.0.0.1/api/health                       # service health checks

# Nginx after config changes
sudo nginx -t && sudo systemctl reload nginx

# Tunnel
sudo journalctl -u cloudflared -f
```


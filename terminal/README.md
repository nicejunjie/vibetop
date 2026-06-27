# vibetop

Browser-accessible persistent terminals (xterm.js → ttyd → vibetop-session)
behind nginx. Close the tab, reopen from any device, same shell still there.

## One-command deploy

Prerequisite: run on a Debian/Ubuntu host.

```bash
cd ~/vibe-coding/service-in-browser/terminal
sudo ./install.sh
```

Open `http://<host>/terminals/` for the tabbed UI.

The installer is idempotent — re-running it re-renders config and reloads.

## What it builds

- **`vibetop-manager.service`** — Python HTTP API on `127.0.0.1:7680`
  that starts/stops terminal instances on demand.
- **`vibetop-session@N.service`** (template) — `vibetop-session serve N`,
  a custom Python daemon that holds bash in a PTY with a 256KB ring buffer
  for screen state replay on reconnect. Started on demand by the manager.
- **`vibetop-ttyd@N.service`** (template) — ttyd on
  `127.0.0.1:$((7680+N))`, base path `/tN/`, connecting to the session
  daemon. Started on demand by the manager.
- An nginx site with a `map`-based regex location that routes `/tN/` to the
  correct port (supports up to 50 instances).
- A tabbed UI at `/terminals/` that dynamically creates/destroys terminals
  via the manager API.

## Dynamic provisioning

Terminals are created and destroyed on demand — no pre-provisioned instances.

- Click **+** in the tabbed UI → calls `POST /api/terminals/N/start` →
  starts session + ttyd services → loads terminal in iframe.
- Click **×** → calls `POST /api/terminals/N/stop` → stops services →
  removes iframe. Next "+" gives a clean shell.
- On page load, the UI queries `GET /api/terminals/status` to discover
  running terminals and opens tabs for them.

## Configurable knobs

All optional, set as env vars before running `./install.sh`:

| Var | Default | Meaning |
|---|---|---|
| `MAX_INSTANCES` | `50` | Max terminal slots in nginx map |
| `APP_USER` | invoking user | System user that owns the shells |
| `APP_DIR` | dir of `install.sh` | Where `ttyd-run.sh` and `vibetop-session` live |
| `BASE_PORT` | `7680` | Loopback port base; `tN` → `BASE_PORT+N`, manager on `BASE_PORT` |
| `NGINX_SITE_NAME` | `vibetop` | Filename under `sites-available` |
| `LANDING_DIR` | `~APP_USER/vibetop-www` | Where `terminals.html` is deployed |
| `INSTALL_DEPS` | `1` | apt-install ttyd, nginx, acl |
| `INSTALL_SYSTEMD` | `1` | Render & enable systemd units |
| `INSTALL_NGINX` | `1` | Write & enable the nginx site |
| `SCROLLBACK` | `50000` | xterm.js scrollback lines |
| `DRY_RUN` | `0` | Print actions without executing |

## Files written

```
/etc/systemd/system/vibetop-session@.service   # session daemon template
/etc/systemd/system/vibetop-ttyd@.service       # ttyd template
/etc/systemd/system/vibetop-manager.service     # terminal manager API
/etc/nginx/sites-available/vibetop              # nginx site (map + regex location)
/etc/nginx/sites-enabled/vibetop                # symlink
/etc/nginx/conf.d/vibetop-upgrade.conf          # $connection_upgrade map
~/vibetop-www/terminals.html                    # tabbed UI
```

## Operations

```bash
# Via API (preferred):
curl -X POST http://localhost/api/terminals/5/start
curl -X POST http://localhost/api/terminals/5/stop
curl http://localhost/api/terminals/status

# Via systemd (direct):
sudo systemctl restart vibetop-ttyd@2          # reconnect t2; shell untouched
sudo systemctl restart vibetop-session@2       # fresh shell for t2
sudo systemctl status vibetop-manager          # API server

journalctl -u vibetop-ttyd@2 -f
journalctl -u vibetop-session@2 -f
```

## Uninstall

```bash
sudo ./uninstall.sh
```

Stops and disables all instances and the manager, removes systemd units,
the nginx site, and the upgrade map. apt packages are left installed.

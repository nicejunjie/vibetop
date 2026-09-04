#!/usr/bin/env bash
# Install the vibetop Claude-usage proxy: an OPT-IN pass-through to
# api.anthropic.com that captures the Max-plan rate-limit response headers for
# the desktop's usage strip. Plan usage has no query API — the numbers only
# exist as headers on live API calls — so the proxy observes them in-flight.
#
# The service is installed but LEFT DISABLED: it only runs when the user turns
# the feature on (the manager's POST /api/claude/usage toggles the unit AND adds
# ANTHROPIC_BASE_URL to ~/.claude/settings.json so Claude Code routes here).
# Nothing routes through the proxy while the feature is off.
#
# The proxy runs in-place from the git checkout (ExecStart=$APP_DIR/...), like
# vibetop-manager, so this just renders the unit; an Update that changes the
# proxy code only needs a try-restart (done below, a no-op if not running).
#
# Configurable via env vars (all optional):
#   APP_USER         system user Claude Code runs as   (default: invoking user)
#   APP_DIR          repo checkout dir                 (default: repo root)
#   INSTALL_SYSTEMD  render the systemd unit           (default 1)
#   DRY_RUN          print actions without executing   (default 0)
set -euo pipefail

APP_USER="${APP_USER:-${SUDO_USER:-$(id -un)}}"
# The proxy runs as the OPERATOR (human admin whose Claude Code is observed), not
# APP_USER (which may be the `vibetop` service account). Default: first
# VIBETOP_ADMINS entry, else APP_USER (backward-compatible on a home install).
#
# VIBETOP_ADMINS normally lives in /etc/vibetop/manager.env (written by deploy.sh
# / migrate-to-opt.sh) and is NOT in this script's environment, so read it from
# there first — same lookup tools/smoke-test.sh does. Without this, a prod host
# (APP_USER=vibetop) silently renders User=vibetop, and the proxy then writes its
# capture into the SERVICE ACCOUNT's home while the manager reads the operator's:
# the usage strip freezes at whatever it held before the /opt migration, with
# `usage write failed: Permission denied` the only clue (in the proxy's journal).
VT_ENV_FILE="${VT_ENV_FILE:-/etc/vibetop/manager.env}"
if [ -z "${VIBETOP_ADMINS:-}" ] && [ -r "$VT_ENV_FILE" ]; then
    VIBETOP_ADMINS="$(sed -n 's/^[[:space:]]*VIBETOP_ADMINS=//p' "$VT_ENV_FILE" | head -1)"
fi
OPERATOR="${OPERATOR:-${VIBETOP_ADMINS:-$APP_USER}}"
OPERATOR="${OPERATOR%%,*}"
# APP_DIR = repo root (this script lives in <repo>/claude-usage/)
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
if ! id "$APP_USER" >/dev/null 2>&1; then
    echo "APP_USER '$APP_USER' does not exist on this system" >&2; exit 1
fi
if ! id "$OPERATOR" >/dev/null 2>&1; then
    echo "OPERATOR '$OPERATOR' does not exist on this system" >&2; exit 1
fi
INSTALL_SYSTEMD="${INSTALL_SYSTEMD:-1}"
DRY_RUN="${DRY_RUN:-0}"
UNIT=vibetop-claude-proxy.service

for arg in "$@"; do
    case "$arg" in
        --dry-run|-n) DRY_RUN=1 ;;
        --help|-h) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "unknown flag: $arg" >&2; exit 2 ;;
    esac
done

run() { if (( DRY_RUN )); then printf '+ %s\n' "$*"; else "$@"; fi; }
write_root() {
    local dest="$1"
    if (( DRY_RUN )); then echo "+ write -> $dest"; sed 's/^/    | /'
    else sudo tee "$dest" >/dev/null; fi
}

cat <<EOF
claude-usage install
  user     : $APP_USER
  operator : $OPERATOR    (proxy runs as them; capture lands in their ~/.local/share)
  repo dir : $APP_DIR
  proxy    : 127.0.0.1:7690 -> api.anthropic.com   (opt-in; unit stays disabled)
  systemd  : $INSTALL_SYSTEMD    dry run: $DRY_RUN
EOF

# Make the proxy executable in the checkout (git may not preserve +x on some paths).
run chmod +x "$APP_DIR/vibetop-claude-proxy"

if (( INSTALL_SYSTEMD )); then
    echo "== installing systemd unit (disabled until the feature is turned on) =="
    sed -e "s|@APP_USER@|$APP_USER|g" \
        -e "s|@OPERATOR@|$OPERATOR|g" \
        -e "s|@APP_DIR@|$APP_DIR|g" \
        "$APP_DIR/systemd/$UNIT" \
        | write_root "/etc/systemd/system/$UNIT"
    run sudo systemctl daemon-reload
    # Do NOT enable/start — opt-in. But if it's already running (feature on),
    # restart to pick up new proxy code. try-restart is a no-op when inactive.
    run sudo systemctl try-restart "$UNIT" 2>/dev/null || true

    # Post-condition: the identity we just rendered must actually be able to
    # store a capture. The proxy resolves ~/.local/share from its OWN uid, so a
    # wrong User= doesn't fail loudly — it relays fine and drops every write with
    # EACCES into its journal, while the strip serves the operator's last good
    # file forever. Verify here, where the mistake is made, instead of leaving it
    # for someone to notice a frozen percentage days later.
    if (( ! DRY_RUN )); then
        CAPTURE_DIR="$(getent passwd "$OPERATOR" | cut -d: -f6)/.local/share"
        if sudo -u "$OPERATOR" -H test -w "$CAPTURE_DIR" 2>/dev/null \
           || sudo -u "$OPERATOR" -H mkdir -p "$CAPTURE_DIR" 2>/dev/null; then
            echo "   capture path OK: $CAPTURE_DIR (writable by $OPERATOR)"
        else
            echo "!! WARNING: $OPERATOR cannot write $CAPTURE_DIR — the proxy will"  >&2
            echo "!!   relay traffic but silently drop every usage capture, and the" >&2
            echo "!!   desktop strip will freeze at its last value."                 >&2
            echo "!!   Is OPERATOR right? VIBETOP_ADMINS in $VT_ENV_FILE names the"  >&2
            echo "!!   human admin; it must NOT be the service account ($APP_USER)." >&2
        fi
    fi
else
    echo "== INSTALL_SYSTEMD=0 — skipping unit; try-restart to pick up code =="
    run sudo systemctl try-restart "$UNIT" 2>/dev/null || true
fi

echo "claude-usage install: done"

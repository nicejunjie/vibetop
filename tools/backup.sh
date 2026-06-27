#!/usr/bin/env bash
#
# vibetop-backup — archive the irreplaceable, host-local user data/state.
#
# Everything vibetop persists lives under the APP_USER's home and is NOT in git
# (it's per-host runtime state). A reinstall/redeploy keeps it, but a disk loss
# or a fat-fingered `rm` does not. This tars the small-but-precious set into a
# timestamped archive and prunes old ones. Idempotent, safe to run on a timer.
#
# What's included (each only if present, paths relative to the home dir):
#   .local/share/desktop-state.json          desktop windows + cross-device registry
#   .local/share/desktop-files-tabs.json     Files app folder tabs
#   .local/share/terminal-tab-names.json     terminal tab names
#   .local/share/vibetop-update-history.json per-host update log
#   .local/share/desktop-notes.md            legacy single note (safety net)
#   .local/share/desktop-notes/              all notes + index
#   .config/filebrowser/filebrowser.db       FileBrowser settings/users
#   .config/vibetop/onlyoffice.secret        OnlyOffice JWT secret (re-pairs the editor)
#   Documents/                               office docs created/edited in-app
#   Uploads/                                 only with --with-uploads (transient bulk)
#
# Usage:
#   tools/backup.sh                  # write one archive to ~/vibetop-backups, keep 14
#   tools/backup.sh --dry-run        # show what WOULD be archived
#   tools/backup.sh --with-uploads   # also include ~/Uploads (can be large)
#   tools/backup.sh --install-timer  # install+enable a daily systemd timer (needs sudo)
#   tools/backup.sh --list           # list existing backups
#   tools/backup.sh --restore FILE   # restore an archive over the home dir (prompts)
#
# Env overrides: APP_USER, BACKUP_DIR, KEEP (archives retained, default 14).
set -euo pipefail

APP_USER="${APP_USER:-${SUDO_USER:-$USER}}"
HOME_DIR="$(getent passwd "$APP_USER" | cut -d: -f6)"
[ -n "$HOME_DIR" ] || { echo "ERROR: cannot resolve home for user '$APP_USER'" >&2; exit 1; }
BACKUP_DIR="${BACKUP_DIR:-$HOME_DIR/vibetop-backups}"
KEEP="${KEEP:-14}"

DRY_RUN=0; WITH_UPLOADS=0; INSTALL_TIMER=0; DO_LIST=0; RESTORE_FILE=""

while [ $# -gt 0 ]; do
    case "$1" in
        -n|--dry-run)      DRY_RUN=1 ;;
        --with-uploads)    WITH_UPLOADS=1 ;;
        --install-timer)   INSTALL_TIMER=1 ;;
        --list)            DO_LIST=1 ;;
        --restore)         RESTORE_FILE="${2:-}"; shift ;;
        -h|--help)         sed -n '2,40p' "$0"; exit 0 ;;
        *) echo "unknown arg: $1" >&2; exit 2 ;;
    esac
    shift
done

# Candidate paths (relative to HOME_DIR). Order doesn't matter.
PATHS=(
    ".local/share/desktop-state.json"
    ".local/share/desktop-files-tabs.json"
    ".local/share/terminal-tab-names.json"
    ".local/share/vibetop-update-history.json"
    ".local/share/desktop-notes.md"
    ".local/share/desktop-notes"
    ".config/filebrowser/filebrowser.db"
    ".config/vibetop/onlyoffice.secret"
    "Documents"
)
(( WITH_UPLOADS )) && PATHS+=("Uploads")

# ---- --list ---------------------------------------------------------------
if (( DO_LIST )); then
    if [ -d "$BACKUP_DIR" ]; then
        ls -lh "$BACKUP_DIR"/vibetop-*.tar.gz 2>/dev/null || echo "(no backups in $BACKUP_DIR)"
    else
        echo "(no backup dir $BACKUP_DIR)"
    fi
    exit 0
fi

# ---- --restore ------------------------------------------------------------
if [ -n "$RESTORE_FILE" ]; then
    [ -f "$RESTORE_FILE" ] || { echo "ERROR: no such archive: $RESTORE_FILE" >&2; exit 1; }
    echo "About to restore '$RESTORE_FILE' OVER $HOME_DIR (existing files are overwritten)."
    echo "Archive contents:"
    tar tzf "$RESTORE_FILE" | sed 's/^/  /'
    read -r -p "Proceed? [y/N] " ans
    [ "$ans" = "y" ] || [ "$ans" = "Y" ] || { echo "aborted."; exit 0; }
    tar xzf "$RESTORE_FILE" -C "$HOME_DIR"
    echo "Restored. You may want: sudo systemctl restart vibetop-manager vibetop-filebrowser"
    exit 0
fi

# ---- --install-timer ------------------------------------------------------
if (( INSTALL_TIMER )); then
    SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
    svc=/etc/systemd/system/vibetop-backup.service
    tmr=/etc/systemd/system/vibetop-backup.timer
    echo "Installing daily backup timer running: $SELF  (as $APP_USER)"
    sudo tee "$svc" >/dev/null <<EOF
[Unit]
Description=vibetop user-data backup
[Service]
Type=oneshot
User=$APP_USER
Environment=APP_USER=$APP_USER BACKUP_DIR=$BACKUP_DIR KEEP=$KEEP
ExecStart=$SELF
EOF
    sudo tee "$tmr" >/dev/null <<EOF
[Unit]
Description=Run vibetop user-data backup daily
[Timer]
OnCalendar=daily
Persistent=true
RandomizedDelaySec=1800
[Install]
WantedBy=timers.target
EOF
    sudo systemctl daemon-reload
    sudo systemctl enable --now vibetop-backup.timer
    echo "Enabled. Next run: $(systemctl show -p NextElapseUSecRealtime --value vibetop-backup.timer 2>/dev/null || echo daily)"
    echo "Run once now with: sudo systemctl start vibetop-backup.service"
    exit 0
fi

# ---- the backup -----------------------------------------------------------
present=()
for p in "${PATHS[@]}"; do
    [ -e "$HOME_DIR/$p" ] && present+=("$p")
done
if [ ${#present[@]} -eq 0 ]; then
    echo "Nothing to back up (no state files exist yet under $HOME_DIR)."
    exit 0
fi

stamp="$(date +%Y%m%d-%H%M%S)"
archive="$BACKUP_DIR/vibetop-$stamp.tar.gz"

if (( DRY_RUN )); then
    echo "Would archive these (-> $archive):"
    printf '  %s\n' "${present[@]}"
    echo "Would keep the newest $KEEP archives in $BACKUP_DIR."
    exit 0
fi

mkdir -p "$BACKUP_DIR"
# -C HOME_DIR so paths in the tar are home-relative → restore with `tar xzf … -C ~`.
tar czf "$archive" -C "$HOME_DIR" "${present[@]}"
size="$(du -h "$archive" | cut -f1)"
echo "Wrote $archive ($size, ${#present[@]} item(s))."

# Prune: keep the newest $KEEP.
mapfile -t all < <(ls -1t "$BACKUP_DIR"/vibetop-*.tar.gz 2>/dev/null || true)
if [ "${#all[@]}" -gt "$KEEP" ]; then
    for old in "${all[@]:$KEEP}"; do
        rm -f "$old" && echo "Pruned old backup: $(basename "$old")"
    done
fi

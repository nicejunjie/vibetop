#!/usr/bin/env bash
#
# vibetop-backup — archive the irreplaceable, host-local user data/state.
#
# Nothing vibetop persists is in git (it's per-host runtime state). A reinstall
# or redeploy keeps it; a disk loss does not. This tars the small-but-precious
# set into a timestamped archive and prunes old ones. Idempotent, safe on a timer.
#
# IT IS MULTI-USER. Vibetop stores each person's state under THEIR OWN home
# (_ctx_home()), and keeps host-global state outside every home. This script
# used to archive one home picked from $SUDO_USER and nothing else — so an
# operator could hold a year of green daily archives and still lose every other
# user's notes and documents, the user registry (with its session-revocation
# epochs), the resource/idle/hints policies, the scheduled messages, the public
# share registry, and the production secrets. Run as root it now covers all of
# it; run unprivileged it covers the invoking user and says so.
#
# Per-user state (relative to each user's home, each only if present):
#   .local/share/desktop-state.json          desktop windows + cross-device registry
#   .local/share/desktop-files-tabs.json     Files app folder tabs
#   .local/share/terminal-tab-names.json     terminal tab names
#   .local/share/vibetop-update-history.json per-host update log (service account)
#   .local/share/vibetop-shares.json         public share registry (service account)
#   .local/share/desktop-notes.md            legacy single note (safety net)
#   .local/share/desktop-notes/              all notes + index
#   .config/vibetop/onlyoffice.secret        legacy home-install JWT secret
#   Documents/                               office docs created/edited in-app
#   Uploads/                                 only with --with-uploads (transient bulk)
#
# Host-global state (root runs only):
#   /var/lib/vibetop/users.json      user->slot map + session-revocation epochs
#   /var/lib/vibetop/resources.json  per-unit resource caps
#   /var/lib/vibetop/idle.json       idle-reap policy
#   /var/lib/vibetop/hints.json      feature-tip kill switch
#   /var/lib/vibetop/schedules.json  scheduled terminal messages
#   /opt/vibetop/etc/*.secret        session + OnlyOffice secrets (system layout)
#
# THE ARCHIVE IS SECRET-BEARING. A root run holds the session secret (forging it
# forges any user's cookie), the OnlyOffice JWT secret, and EVERY user's notes
# and documents. It is written 0600 into a 0700 BACKUP_DIR, which
# defaults to the invoking admin's ~/vibetop-backups — point BACKUP_DIR at
# encrypted storage before shipping these anywhere.
#
# Usage:
#   sudo tools/backup.sh             # every vibetop user + global state
#   tools/backup.sh                  # just the invoking user (no global state)
#   tools/backup.sh --user alice     # one named user
#   tools/backup.sh --dry-run        # show what WOULD be archived
#   tools/backup.sh --with-uploads   # also include ~/Uploads (can be large)
#   tools/backup.sh --install-timer  # install+enable a daily systemd timer (sudo)
#   tools/backup.sh --list           # list existing backups
#   sudo tools/backup.sh --restore FILE   # restore an archive (prompts)
#
# Env overrides: APP_USER, BACKUP_DIR, KEEP (archives retained, default 14).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/layout.sh
. "$HERE/lib/layout.sh"

MANIFEST_VERSION=2
APP_USER="${APP_USER:-${SUDO_USER:-$USER}}"
HOME_DIR="$(getent passwd "$APP_USER" | cut -d: -f6)"
[ -n "$HOME_DIR" ] || { echo "ERROR: cannot resolve home for user '$APP_USER'" >&2; exit 1; }
BACKUP_DIR="${BACKUP_DIR:-$HOME_DIR/vibetop-backups}"
KEEP="${KEEP:-14}"
IS_ROOT=0; [ "$(id -u)" -eq 0 ] && IS_ROOT=1

DRY_RUN=0; WITH_UPLOADS=0; INSTALL_TIMER=0; DO_LIST=0; RESTORE_FILE=""; ONE_USER=""

while [ $# -gt 0 ]; do
    case "$1" in
        -n|--dry-run)      DRY_RUN=1 ;;
        --with-uploads)    WITH_UPLOADS=1 ;;
        --install-timer)   INSTALL_TIMER=1 ;;
        --list)            DO_LIST=1 ;;
        --user)            ONE_USER="${2:-}"; shift ;;
        --restore)         RESTORE_FILE="${2:-}"; shift ;;
        -h|--help)         sed -n '2,57p' "$0"; exit 0 ;;
        *) echo "unknown arg: $1" >&2; exit 2 ;;
    esac
    shift
done

# Per-user candidate paths, relative to each home.
PATHS=(
    ".local/share/desktop-state.json"
    ".local/share/desktop-files-tabs.json"
    ".local/share/terminal-tab-names.json"
    ".local/share/vibetop-update-history.json"
    ".local/share/vibetop-shares.json"
    ".local/share/desktop-notes.md"
    ".local/share/desktop-notes"
    ".config/vibetop/onlyoffice.secret"
    "Documents"
)
(( WITH_UPLOADS )) && PATHS+=("Uploads")

VAR_DIR="${VIBETOP_STATE_DIR:-/var/lib/vibetop}"
GLOBAL_FILES=(users.json resources.json idle.json hints.json schedules.json)

# ---- which users -----------------------------------------------------------
# The registry is the authority: it lists everyone who has actually used
# vibetop. Add the service account unconditionally — the share registry and
# update history live in ITS home, not any human's.
vt_users() {
    if [ -n "$ONE_USER" ]; then printf '%s\n' "$ONE_USER"; return; fi
    if ! (( IS_ROOT )); then printf '%s\n' "$APP_USER"; return; fi
    {
        [ -r "$VAR_DIR/users.json" ] && sed -n 's/.*/&/p' "$VAR_DIR/users.json" \
            | grep -o '"[^"]*"[[:space:]]*:[[:space:]]*{' | sed 's/"\([^"]*\)".*/\1/'
        printf '%s\n' "$VT_SVC" "$APP_USER"
    } 2>/dev/null | sort -u | while read -r u; do
        [ -n "$u" ] || continue
        h="$(getent passwd "$u" | cut -d: -f6)"
        [ -n "$h" ] && [ -d "$h" ] && printf '%s\n' "$u"
    done
}

# ---- --list ----------------------------------------------------------------
if (( DO_LIST )); then
    if [ -d "$BACKUP_DIR" ]; then
        ls -lh "$BACKUP_DIR"/vibetop-*.tar.gz 2>/dev/null || echo "(no backups in $BACKUP_DIR)"
    else
        echo "(no backup dir $BACKUP_DIR)"
    fi
    exit 0
fi

# ---- --restore -------------------------------------------------------------
if [ -n "$RESTORE_FILE" ]; then
    [ -f "$RESTORE_FILE" ] || { echo "ERROR: no such archive: $RESTORE_FILE" >&2; exit 1; }
    # v1 archives are home-relative with no MANIFEST; v2 are users/<name>/… +
    # system/…. Detect rather than assume, so old archives still restore.
    #
    # `./MANIFEST`, NOT `MANIFEST`. The archive is written with `tar czf … -C
    # "$stage" .`, so every member is stored with a leading `./` — and the
    # anchored `^MANIFEST$` therefore NEVER matched. Every archive this host has
    # ever produced fell through to the legacy branch, which unpacks `users/` and
    # `system/` into one human's HOME and restores nothing at all: no
    # /var/lib/vibetop, no secrets, no manager.env, no second user. It then
    # printed "Restored." and exited 0. The v2 branch below had never once run.
    #
    # The same `./` bites the manifest read on the next line (GNU tar does not
    # normalise it for member selection), so that is anchored too. Both spellings
    # are accepted so an archive made by any future `tar` invocation still works.
    if tar tzf "$RESTORE_FILE" | grep -qE '^\./?MANIFEST$'; then
        if (( DRY_RUN )); then
            # `--dry-run --restore FILE` used to RESTORE: the restore block runs
            # before DRY_RUN is consulted anywhere, while the usage text
            # advertises the flag. An operator being careful got the destructive
            # form. Now it prints the plan and stops.
            echo "DRY RUN — nothing will be written. This restore would:"
            tar tzf "$RESTORE_FILE" | sed 's|^\./||' \
              | awk -F/ -v vd="$VAR_DIR" -v ve="$VT_ETC" -v vs="$(dirname "$VT_ENV_FILE")" '
                  /^users\/[^\/]+\/./{u[$2]++}
                  /^system\/var\/./{v++} /^system\/etc\/./{e++} /^system\/sysetc\/./{g++}
                  END{for(k in u) printf "  restore %-16s %d item(s) -> that user%s home\n",k,u[k],"\x27s";
                      if(v)printf "  restore %-16s %d file(s) -> %s\n","global state",v,vd;
                      if(e)printf "  restore %-16s %d file(s) -> %s (0600 root)\n","secrets",e,ve;
                      if(g)printf "  restore %-16s %d file(s) -> %s\n","manager config",g,vs}'
            echo "  and chown each restored tree to its user, re-tightening ~/.local and ~/.config to 0700."
            echo "Re-run without --dry-run to apply."
            exit 0
        fi
        (( IS_ROOT )) || { echo "ERROR: restoring a multi-user archive needs root (sudo)." >&2; exit 1; }
        echo "About to restore '$RESTORE_FILE'. Manifest:"
        tar xzOf "$RESTORE_FILE" ./MANIFEST 2>/dev/null \
            || tar xzOf "$RESTORE_FILE" MANIFEST 2>/dev/null \
            || echo "  (manifest unreadable)"
        echo
        echo "Existing files at those paths will be OVERWRITTEN."
        read -r -p "Proceed? [y/N] " ans
        [ "$ans" = "y" ] || [ "$ans" = "Y" ] || { echo "aborted."; exit 0; }
        tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
        tar xzf "$RESTORE_FILE" -C "$tmp" --numeric-owner
        for d in "$tmp"/users/*/; do
            [ -d "$d" ] || continue
            u="$(basename "$d")"
            h="$(getent passwd "$u" | cut -d: -f6)"
            if [ -z "$h" ] || [ ! -d "$h" ]; then
                # Keep JUST this user's data, not the whole staging tree. `trap -
                # EXIT` disarmed cleanup for the entire run, leaving the session
                # secret and every user's notes in /tmp indefinitely after a
                # disaster-recovery run — an unadvertised plaintext copy of the
                # credential that forges any user's cookie.
                _keep="${BACKUP_DIR}/unrestored-${u}-$(date +%Y%m%d-%H%M%S)"
                if mkdir -p "$_keep" 2>/dev/null && cp -a "$d." "$_keep/" 2>/dev/null; then
                    chmod 0700 "$_keep"
                    echo "  SKIP $u — no such user on this host (their data kept at $_keep)"
                else
                    echo "  SKIP $u — no such user on this host (data NOT preserved)"
                fi
                continue
            fi
            echo "  restoring $u -> $h"
            # --no-same-owner then an explicit chown: extracting as root with
            # tar's default --same-owner would stamp the STAGED intermediate
            # dirs' root ownership onto the live ~/.local/share and ~/.config.
            ( cd "$d" && tar cf - . ) | tar xf - -C "$h" --no-same-owner
            # `$u:$u`, not `$u`: a user-only chown leaves the GROUP as root
            # (the files arrived root-owned from --no-same-owner), so every
            # restored file ended up `alice:root` forever — and Documents/ files
            # written 0664 by OnlyOffice became group-root-writable.
            _grp="$(id -gn "$u" 2>/dev/null || echo "$u")"
            chown -R "$u:$_grp" "$h/.local" "$h/.config" "$h/Documents" "$h/Uploads" \
                2>/dev/null || true
            # The archive's intermediate dirs were staged 0755 under umask 022, and
            # tar RESETS an existing directory's mode — so a restore silently
            # relaxed every user's ~/.local and ~/.config from 0700 to 0755. On a
            # multi-user host that exposes one tenant's app-state listing to every
            # other, and Unix permissions are the whole isolation boundary here.
            for _priv in "$h/.local" "$h/.local/share" "$h/.config"; do
                [ -d "$_priv" ] && chmod 0700 "$_priv" 2>/dev/null || true
            done
        done
        if [ -d "$tmp/system/var" ]; then
            echo "  restoring global state -> $VAR_DIR"
            install -d -m 0700 -o root -g root "$VAR_DIR"
            cp -a "$tmp/system/var/." "$VAR_DIR/"
        fi
        if [ -d "$tmp/system/etc" ]; then
            echo "  restoring secrets -> $VT_ETC"
            install -d -m 0700 -o root -g root "$VT_ETC"
            cp -a "$tmp/system/etc/." "$VT_ETC/"
            chmod 0600 "$VT_ETC"/* 2>/dev/null || true
        fi
        if [ -d "$tmp/system/sysetc" ]; then
            _sysetc="$(dirname "$VT_ENV_FILE")"
            echo "  restoring manager config -> $_sysetc"
            install -d -m 0755 -o root -g root "$_sysetc"
            cp -a "$tmp/system/sysetc/." "$_sysetc/"
        fi
    else
        echo "About to restore legacy archive '$RESTORE_FILE' OVER $HOME_DIR."
        tar tzf "$RESTORE_FILE" | sed 's/^/  /'
        read -r -p "Proceed? [y/N] " ans
        [ "$ans" = "y" ] || [ "$ans" = "Y" ] || { echo "aborted."; exit 0; }
        tar xzf "$RESTORE_FILE" -C "$HOME_DIR"
    fi
    echo "Restored. Now: sudo systemctl restart vibetop-manager"
    echo "(per-user services are transient — they pick the new state up on next use)"
    exit 0
fi

# ---- --install-timer -------------------------------------------------------
if (( INSTALL_TIMER )); then
    SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
    svc=/etc/systemd/system/vibetop-backup.service
    tmr=/etc/systemd/system/vibetop-backup.timer
    # Run as ROOT, not as one human: the whole point is that it must reach every
    # user's home and the root-owned global state.
    echo "Installing daily backup timer running: $SELF  (as root, all users)"
    if (( DRY_RUN )); then
        echo "Would write $svc (oneshot, User=root, BACKUP_DIR=$BACKUP_DIR)."
        echo "Would write $tmr (OnCalendar=daily, Persistent=true)."
        echo "Would run: sudo systemctl daemon-reload && sudo systemctl enable --now vibetop-backup.timer"
        exit 0
    fi
    sudo tee "$svc" >/dev/null <<EOF
[Unit]
Description=vibetop user-data backup (all users + global state)
[Service]
Type=oneshot
User=root
Environment=BACKUP_DIR=$BACKUP_DIR KEEP=$KEEP
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

# ---- the backup ------------------------------------------------------------
mapfile -t USERS < <(vt_users)
[ ${#USERS[@]} -gt 0 ] || { echo "No vibetop users found."; exit 0; }

MODE="all-users"; (( IS_ROOT )) || MODE="single-user"
[ -n "$ONE_USER" ] && MODE="single-user"

# Collect (user, relpath) pairs that actually exist.
declare -a FOUND_USER=() FOUND_PATH=()
for u in "${USERS[@]}"; do
    h="$(getent passwd "$u" | cut -d: -f6)"
    for p in "${PATHS[@]}"; do
        [ -e "$h/$p" ] || continue
        # Unprivileged runs can only read their own home — don't claim otherwise.
        (( IS_ROOT )) || [ -r "$h/$p" ] || continue
        FOUND_USER+=("$u"); FOUND_PATH+=("$p")
    done
done
declare -a FOUND_GLOBAL=()
if (( IS_ROOT )) && [ -z "$ONE_USER" ]; then
    for f in "${GLOBAL_FILES[@]}"; do
        [ -e "$VAR_DIR/$f" ] && FOUND_GLOBAL+=("var/$f")
    done
    for f in "$VT_ETC"/*.secret; do
        [ -e "$f" ] && FOUND_GLOBAL+=("etc/$(basename "$f")")
    done
    # manager.env, which is NOT under $VT_ETC (/opt/vibetop/etc, the 0700 secrets
    # dir) but in /etc/vibetop — layout.sh calls it $VT_ENV_FILE, so take it from
    # there rather than re-deriving a path. It is the single authority for
    # VIBETOP_ADMINS (docs: "VIBETOP_ADMINS has ONE authority"), so an archive
    # without it restores a host on which _is_admin() silently falls back to the
    # service account: Claude-usage and Update quietly stop working for the real
    # admin, while the identity model looks correct everywhere else.
    # A SEPARATE prefix from etc/: those come from $VT_ETC and are restored 0600
    # into it. These live in a different directory and are world-readable config,
    # so folding them together would restore them to the wrong path AND mode.
    for f in "$VT_ENV_FILE" "$(dirname "$VT_ENV_FILE")/deploy.env"; do
        [ -e "$f" ] && FOUND_GLOBAL+=("sysetc/$(basename "$f")")
    done
fi

if [ ${#FOUND_PATH[@]} -eq 0 ] && [ ${#FOUND_GLOBAL[@]} -eq 0 ]; then
    echo "Nothing to back up (no vibetop state exists yet)."
    exit 0
fi

stamp="$(date +%Y%m%d-%H%M%S)"
archive="$BACKUP_DIR/vibetop-$stamp.tar.gz"

if (( DRY_RUN )); then
    echo "Would archive ($MODE, ${#USERS[@]} user(s)) -> $archive:"
    for i in "${!FOUND_PATH[@]}"; do
        printf '  users/%s/%s\n' "${FOUND_USER[$i]}" "${FOUND_PATH[$i]}"
    done
    [ ${#FOUND_GLOBAL[@]} -gt 0 ] && printf '  system/%s\n' "${FOUND_GLOBAL[@]}"
    (( IS_ROOT )) || echo "  (not root: other users' homes and global state are NOT covered)"
    echo "Would keep the newest $KEEP archives in $BACKUP_DIR."
    exit 0
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR" 2>/dev/null || true

# Stage into a 0700 temp tree so one tar carries users/<name>/… and system/…
# with ownership preserved. cp -a keeps mode/owner/times; --numeric-owner in the
# tar so a restore onto a host with different uids still lands correctly.
stage="$(mktemp -d)"; trap 'rm -rf "$stage"' EXIT
chmod 700 "$stage"
for i in "${!FOUND_PATH[@]}"; do
    u="${FOUND_USER[$i]}"; p="${FOUND_PATH[$i]}"
    h="$(getent passwd "$u" | cut -d: -f6)"
    mkdir -p "$stage/users/$u/$(dirname "$p")"
    cp -a "$h/$p" "$stage/users/$u/$p"
done
for g in ${FOUND_GLOBAL[@]+"${FOUND_GLOBAL[@]}"}; do
    mkdir -p "$stage/system/$(dirname "$g")"
    case "$g" in
        var/*) cp -a "$VAR_DIR/${g#var/}" "$stage/system/$g" ;;
        etc/*) cp -a "$VT_ETC/${g#etc/}"  "$stage/system/$g" ;;
        sysetc/*) cp -a "$(dirname "$VT_ENV_FILE")/${g#sysetc/}" "$stage/system/$g" ;;
    esac
done

{
    echo "manifest_version: $MANIFEST_VERSION"
    echo "created: $(date -Is)"
    echo "host: $(hostname)"
    echo "mode: $MODE"
    echo "with_uploads: $WITH_UPLOADS"
    echo "users:"
    printf '  - %s\n' "${USERS[@]}"
    echo "global:"
    if [ ${#FOUND_GLOBAL[@]} -eq 0 ]; then
        echo "  (none — not a root run)"
    else
        printf '  - %s\n' "${FOUND_GLOBAL[@]}"
    fi
} > "$stage/MANIFEST"

( umask 077; tar czf "$archive" -C "$stage" --numeric-owner . )
chmod 600 "$archive" 2>/dev/null || true
size="$(du -h "$archive" | cut -f1)"
echo "Wrote $archive ($size, $MODE, ${#USERS[@]} user(s), ${#FOUND_PATH[@]} user item(s), ${#FOUND_GLOBAL[@]} global item(s))."
(( IS_ROOT )) || echo "NOTE: not run as root — this covers ONLY $APP_USER. Use sudo for a complete backup."

# An UNATTENDED incomplete backup must not look like success.
#
# z20 ran a daily timer for months whose unit was written by an older version of
# this script: User=<a human>, so IS_ROOT was never true. Every run archived one
# user's home, skipped the other user entirely and every global item (including
# /etc/vibetop/manager.env), printed the NOTE above, and exited 0 — so the timer
# stayed green and `systemctl list-timers` showed a healthy daily backup. The
# only trace was one line in the journal that nobody reads. A backup you would
# discover to be empty at restore time is worse than no backup, because you
# stopped looking for one.
#
# Detected from our own CGROUP, which names the unit we are actually running in.
# The two obvious signals are both wrong here:
#   - `[ ! -t 1 ]` ("no TTY") also catches a piped interactive run and every test
#     harness, and an unprivileged `./tools/backup.sh` to grab your own data is
#     legitimate and must still exit 0.
#   - `$INVOCATION_ID` is INHERITED by every descendant of any systemd unit — and
#     in vibetop a Terminal IS a transient unit, so running this script from the
#     product's own terminal would spuriously fail.
_in_backup_unit=0
grep -qs 'vibetop-backup' /proc/self/cgroup && _in_backup_unit=1
if ! (( IS_ROOT )) && [ -z "$ONE_USER" ] && (( _in_backup_unit )); then
    echo "ERROR: unattended backup ran as $(id -un), not root, so it covered only" >&2
    echo "  $APP_USER and NO global state. This is an incomplete backup." >&2
    echo "  Fix the unit: sudo $0 --install-timer   (re-renders it with User=root)" >&2
    exit 1
fi

# Prune: keep the newest $KEEP.
mapfile -t all < <(ls -1t "$BACKUP_DIR"/vibetop-*.tar.gz 2>/dev/null || true)
if [ "${#all[@]}" -gt "$KEEP" ]; then
    for old in "${all[@]:$KEEP}"; do
        rm -f "$old" && echo "Pruned old backup: $(basename "$old")"
    done
fi

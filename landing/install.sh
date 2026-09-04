#!/usr/bin/env bash
# Install the desktop UI and landing page into the location nginx serves from.
# Override DST_DIR=... to write somewhere else.
set -euo pipefail

# Root is fine ONLY when the destination is stated explicitly (the system layout:
# deploy.sh runs this as the `vibetop` service account with DST_DIR=/opt/vibetop/
# vibetop-www). Without DST_DIR this script falls back to $HOME, and as root that
# is /root — files nginx will never serve. So in that case re-exec as the invoking
# human (legacy home install), or refuse.
if [ "$(id -u)" -eq 0 ] && [ -z "${DST_DIR:-}" ]; then
  if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != root ]; then
    echo "landing/install.sh: running as root with no DST_DIR — re-executing as \$SUDO_USER ($SUDO_USER) so files land in that user's home" >&2
    exec sudo -u "$SUDO_USER" -H "$0" "$@"
  fi
  echo "landing/install.sh: running as root with no DST_DIR — it would deploy to /root." >&2
  echo "Pass DST_DIR=<web root> (deploy.sh does this), or run it as your normal user." >&2
  exit 1
fi

DIR="$(dirname "$(readlink -f "$0")")"
DST_DIR="${DST_DIR:-$HOME/vibetop-www}"
DRY_RUN="${DRY_RUN:-0}"
case "${1:-}" in --dry-run|-n) DRY_RUN=1 ;; esac
run() { if [ "$DRY_RUN" = 1 ]; then printf '+ %s\n' "$*"; else "$@"; fi; }

# Refuse an empty/`/`-rooted destination (e.g. $HOME unset) — a `mkdir -p ""`
# or writes to `/` are never intended.
if [ -z "$DST_DIR" ] || [ "$DST_DIR" = "/" ]; then
  echo "DST_DIR is empty or '/' (is \$HOME set?) — refusing." >&2
  exit 1
fi

run mkdir -p "$DST_DIR"
# Stamp the release number (root VERSION file) AND the service-worker build
# (sw.js VERSION) into the Start-menu build tag so neither can drift from a
# hardcoded literal — and so the build number renders instantly on load with NO
# runtime dependency (it reflects the actual shell that was deployed, which is
# exactly what "did a fresh shell load?" wants to show).
VERSION="$(cat "$DIR/../VERSION" 2>/dev/null | tr -d ' \t\r\n')"
VERSION="${VERSION:-dev}"
SW_VERSION="$(grep -o "VERSION = 'v[0-9]\+'" "$DIR/shell/sw.js" 2>/dev/null | grep -o 'v[0-9]\+')"
SW_VERSION="${SW_VERSION:-?}"

# ---------------------------------------------------------------------------
# Source tree is GROUPED (shell/ shared/ apps/<item>/ games/<item>/), but the web
# root stays FLAT: every page keeps the URL it has always had (/notes.html,
# /rts.html, ...). Nothing outside this script knows where a file lives in the
# repo, which is exactly why the tree could be reorganised without touching a
# single URL, the sw.js PRECACHE list, the APPS map or an nginx location.
#
# Deployment is a WALK, not a hand-written list. The old list had to be edited
# for every added or removed page, and when that was forgotten the web root kept
# serving a file the repo no longer had (mario.html survived months that way,
# reachable at /mario.html long after Circuit Runner replaced it).
#
# RENDERED holds the handful of files that are not a plain copy: a different
# destination name, or a @TOKEN@ that must be stamped. Everything else is found.
# ---------------------------------------------------------------------------

# src-relative-to-$DIR | destination basename | stamp mode
RENDERED="
shell/desktop.html|index.html|version
diagnostics/rzdbg.html|rzdbg.html|version
apps/services/index.html|landing.html|copy
apps/files/files.html|files.html|apphome
apps/files/filebrowser-patches.js|filebrowser-patches.js|apphome
"

stamp_version() {   # $1=src $2=dst — release + service-worker build for the build tag
  sed -e "s/@VERSION@/$VERSION/g" -e "s/@SW_VERSION@/$SW_VERSION/g" "$1" > "$2"
  chmod 644 "$2"
}
stamp_apphome() {   # $1=src $2=dst
  # Multi-user: each user's FileBrowser is rooted at THEIR home, so the app's
  # "home" IS the FileBrowser root — stamp @APP_HOME@ empty (home = "/"). MUST
  # stamp here too: deploy.sh runs landing/install.sh AFTER files/install.sh, so a
  # raw copy would clobber files/install.sh's stamped copy with a literal @APP_HOME@.
  sed -e "s|@APP_HOME@||g" "$1" > "$2"
  chmod 644 "$2"
}

# Build src->dst for every deployable file: the special cases above, then a walk
# of the grouped tree for everything else. Tests, docs and the art pipeline are
# source-only and never reach the web root.
PLAN=""
while IFS='|' read -r src dst mode; do
  [ -z "$src" ] && continue
  PLAN="$PLAN$src|$dst|$mode
"
done <<EOF
$(printf '%s' "$RENDERED")
EOF

while IFS= read -r src; do
  [ -z "$src" ] && continue
  rel="${src#"$DIR"/}"
  case "$PLAN" in *"$rel|"*) continue ;; esac      # already handled above
  PLAN="$PLAN$rel|$(basename "$src")|copy
"
done <<EOF
$(find "$DIR/shell" "$DIR/shared" "$DIR/apps" "$DIR/games" "$DIR/diagnostics" \
        -type f \( -name '*.html' -o -name '*.js' -o -name '*.json' \) \
        ! -name '*.test.js' ! -path '*/art/*' ! -name 'services.example.json' | sort)
EOF

# A flat web root means two grouped sources CAN collide on one URL. The old
# hand-written list made that impossible by construction; a walk does not, so
# check it explicitly and fail loudly rather than let one page silently
# overwrite another at deploy time.
DUPES="$(printf '%s' "$PLAN" | awk -F'|' 'NF{print $2}' | sort | uniq -d)"
if [ -n "$DUPES" ]; then
  echo "landing/install.sh: two sources map to the same web-root name:" >&2
  for d in $DUPES; do
    echo "  $d  <-  $(printf '%s' "$PLAN" | awk -F'|' -v d="$d" '$2==d{printf "%s ", $1}')" >&2
  done
  echo "Rename one, or give it an explicit destination in RENDERED." >&2
  exit 1
fi

printf '%s' "$PLAN" | while IFS='|' read -r src dst mode; do
  [ -z "$src" ] && continue
  case "$mode" in
    version) if [ "$DRY_RUN" = 1 ]; then printf '+ render %s -> %s (@VERSION@ -> %s, @SW_VERSION@ -> %s)\n' "$src" "$dst" "$VERSION" "$SW_VERSION"
             else stamp_version "$DIR/$src" "$DST_DIR/$dst"; fi ;;
    apphome) if [ "$DRY_RUN" = 1 ]; then printf '+ render %s -> %s (@APP_HOME@ -> empty)\n' "$src" "$dst"
             else stamp_apphome "$DIR/$src" "$DST_DIR/$dst"; fi ;;
    *)       run install -m 644 "$DIR/$src" "$DST_DIR/$dst" ;;
  esac
done

# PWA icons + the favicon the browser probes for automatically at the web root.
run install -d -m 755 "$DST_DIR/icons"
run install -m 644 "$DIR/shell/icons/"*.png "$DST_DIR/icons/"
run install -m 644 "$DIR/shell/icons/favicon.ico" "$DST_DIR/favicon.ico"
run install -m 644 "$DIR/apps/services/services.example.json" "$DST_DIR/services.example.json"
# Seed services.json from the example only if the host doesn't already have one
# (it's host-local and gitignored — never overwrite the real list on re-install).
if [ ! -f "$DST_DIR/services.json" ]; then
  run install -m 644 "$DIR/apps/services/services.example.json" "$DST_DIR/services.json"
  echo "Created $DST_DIR/services.json (edit to list your host's services)"
fi
echo "Installed $(printf '%s' "$PLAN" | grep -c .) files -> $DST_DIR (desktop = index.html, PWA = sw.js + icons/)"

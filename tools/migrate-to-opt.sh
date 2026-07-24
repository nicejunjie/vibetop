#!/usr/bin/env bash
# migrate-to-opt.sh — relocate vibetop PRODUCTION out of the operator's home into
# a system tree /opt/vibetop owned by a dedicated no-login `vibetop` service
# account, while DEVELOPMENT stays in the operator's home checkout.
#
#   dev  : ~operator/vibe-coding/vibetop  (edit/commit/push — unchanged)
#   prod : /opt/vibetop/{app,www,etc,var} (vibetop-owned; manager runs here as root;
#          self-update git-pulls here as vibetop over HTTPS; secrets in etc/)
#
# The human admin (operator) is kept separate from APP_USER via VIBETOP_ADMINS so
# junjie stays the web-UI admin even though `vibetop` owns the code.
#
# Idempotent + reversible. Run as root ON THE HOST, from the operator's dev checkout
# AFTER the code it clones (admin-decouple + relocatable installers) is on origin/main.
#
#   sudo tools/migrate-to-opt.sh            # migrate
#   sudo tools/migrate-to-opt.sh --rollback # point prod back at the home checkout
#
# Env overrides: SVC_USER, ADMIN_USER, REPO_URL, MIGRATE_BRANCH, OPT.
set -euo pipefail

OPT="${OPT:-/opt/vibetop}"
# WWW must match what the installers default to ($APP_HOME/vibetop-www, i.e.
# $OPT/vibetop-www) — otherwise a later in-app Update (which doesn't pass
# LANDING_DIR/DST_DIR) re-renders the nginx root to vibetop-www and re-deploys
# there, silently orphaning any file an unchanged sub-project owns (this is how
# xpra-patches.js 404'd after the /opt move). Keep these in lockstep.
APP="$OPT/app"; WWW="$OPT/vibetop-www"; ETC="$OPT/etc"; VAR="$OPT/var"
SVC="${SVC_USER:-vibetop}"
REPO_URL="${REPO_URL:-https://github.com/nicejunjie/vibetop.git}"   # public → no key
BRANCH="${MIGRATE_BRANCH:-main}"
BK="/etc/vibetop/pre-opt-backup"

[ "$(id -u)" -eq 0 ] || { echo "must run as root" >&2; exit 1; }

# Dev tree + operator (admin) = this script's repo + the checkout owner.
DEV_DIR="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
ADMIN_USER="${ADMIN_USER:-$(stat -c %U "$DEV_DIR/terminal/terminal-manager.py")}"
ADMIN_HOME="$(getent passwd "$ADMIN_USER" | cut -d: -f6)"

# ---- rollback: repoint prod back at the home checkout ----------------------
if [ "${1:-}" = "--rollback" ]; then
  echo "== ROLLBACK: re-deploy from $DEV_DIR (operator $ADMIN_USER) =="
  rm -f /etc/vibetop/manager.env
  ( cd "$DEV_DIR" && env APP_USER="$ADMIN_USER" INSTALL_DEPS=0 ./terminal/install.sh )
  sudo -u "$ADMIN_USER" -H "$DEV_DIR/landing/install.sh"
  systemctl daemon-reload
  systemctl restart vibetop-manager
  nginx -t && systemctl reload nginx
  echo "== rolled back; manager execs from $DEV_DIR again =="
  exit 0
fi

echo "== migrate vibetop prod -> $OPT =="
echo "   service account : $SVC     admin/operator : $ADMIN_USER"
echo "   dev (unchanged) : $DEV_DIR"

# 1) service account (no login, home = /opt/vibetop)
if ! id "$SVC" >/dev/null 2>&1; then
  echo "-- creating system user $SVC"
  useradd --system --home-dir "$OPT" --shell /usr/sbin/nologin "$SVC"
fi
install -d -m 0755 -o "$SVC" -g "$SVC" "$OPT"

# 2) prod checkout (HTTPS, public repo — read-only, no key)
if [ ! -d "$APP/.git" ]; then
  echo "-- cloning $REPO_URL ($BRANCH) -> $APP"
  sudo -u "$SVC" git clone --branch "$BRANCH" "$REPO_URL" "$APP"
else
  echo "-- updating existing $APP to origin/$BRANCH"
  sudo -u "$SVC" git -C "$APP" fetch origin --prune
  sudo -u "$SVC" git -C "$APP" checkout "$BRANCH"
  sudo -u "$SVC" git -C "$APP" reset --hard "origin/$BRANCH"
fi
sudo -u "$SVC" git config --global --add safe.directory "$APP" 2>/dev/null || true
install -d -m 0755 -o "$SVC" -g "$SVC" "$WWW" "$VAR"
install -d -m 0700 -o root  -g root  "$ETC"

# 3) baseline the web root from the current live copy (completeness), then the
#    installers below re-stamp their own files authoritatively.
if [ -d "$ADMIN_HOME/vibetop-www" ]; then
  echo "-- seeding $WWW from $ADMIN_HOME/vibetop-www"
  rsync -a "$ADMIN_HOME/vibetop-www/" "$WWW/"
  chown -R "$SVC:$SVC" "$WWW"
fi

# 4) migrate secrets by COPY (preserve values → live sessions + OnlyOffice JWT stay valid)
OLD_OO="$ADMIN_HOME/.config/vibetop/onlyoffice.secret"
OLD_SS="/etc/vibetop/session.secret"
[ -s "$ETC/onlyoffice.secret" ] || { [ -s "$OLD_OO" ] && install -m 0600 -o root -g root "$OLD_OO" "$ETC/onlyoffice.secret" && echo "-- copied onlyoffice.secret -> $ETC"; }
[ -s "$ETC/session.secret" ]    || { [ -s "$OLD_SS" ] && install -m 0600 -o root -g root "$OLD_SS" "$ETC/session.secret" && echo "-- copied session.secret -> $ETC"; }

# 5) manager env: name the human admin + point secret paths at the system tree.
#    (Read by vibetop-manager.service via EnvironmentFile=-/etc/vibetop/manager.env)
install -d -m 0755 /etc/vibetop
cat > /etc/vibetop/manager.env <<EOF
# Written by migrate-to-opt.sh. Human admin(s) + secret paths for the /opt tree.
VIBETOP_ADMINS=$ADMIN_USER
ONLYOFFICE_SECRET_FILE=$ETC/onlyoffice.secret
SESSION_SECRET_FILE=$ETC/session.secret
EOF
chmod 0644 /etc/vibetop/manager.env
echo "-- wrote /etc/vibetop/manager.env (VIBETOP_ADMINS=$ADMIN_USER)"

# 6) back up the current units for rollback
install -d -m 0700 "$BK"
for u in vibetop-manager vibetop-session@ vibetop-ttyd@ vibetop-claude-proxy; do
  [ -f "/etc/systemd/system/$u.service" ] && cp -an "/etc/systemd/system/$u.service" "$BK/" 2>/dev/null || true
done

# 7) re-render everything FROM THE PROD TREE with the service identity + /opt paths.
#    Deps stay off (already installed); the claude-usage proxy is left running as-is
#    (its unit re-renders on the next normal deploy — don't disrupt a pinned session).
ENVV=(APP_USER="$SVC" APP_HOME="$OPT" LANDING_DIR="$WWW"
      VIBETOP_ADMINS="$ADMIN_USER"
      SECRET_FILE="$ETC/onlyoffice.secret" SESSION_SECRET_FILE="$ETC/session.secret"
      ONLYOFFICE_SECRET_FILE="$ETC/onlyoffice.secret" INSTALL_DEPS=0)

echo "-- landing (shell) -> $WWW (as $SVC)"
sudo -u "$SVC" -H env DST_DIR="$WWW" "$APP/landing/install.sh"
echo "-- browser (xpra-patches + helpers + snippet)"
( cd "$APP" && env "${ENVV[@]}" INSTALL_SYSTEMD=0 ./browser/install.sh )
echo "-- files (nginx snippet)"
( cd "$APP" && env "${ENVV[@]}" INSTALL_SYSTEMD=0 ./files/install.sh )
echo "-- office (snippet; container + secret untouched)"
( cd "$APP" && env "${ENVV[@]}" INSTALL_CONTAINER=0 ./office/install.sh )
echo "-- terminal (main nginx site: root -> $WWW + systemd units -> $APP)"
( cd "$APP" && env "${ENVV[@]}" ./terminal/install.sh )

# 8) reload systemd + swing the manager onto the /opt tree
echo "-- daemon-reload + restart vibetop-manager (now execs from $APP)"
systemctl daemon-reload
systemctl restart vibetop-manager
# Reload nginx only if the re-rendered config validates — but do NOT swallow a
# validation failure (the old `|| true` hid a broken site and still printed DONE,
# leaving nginx on the pre-migration config with no signal).
if nginx -t; then
  systemctl reload nginx
else
  echo "!! nginx -t FAILED after re-rendering the site — NOT reloading. Fix the" >&2
  echo "!! config above; nginx is still serving its previous configuration." >&2
fi

# 9) decommission legacy single-user orphans (multi-user uses per-user units)
for u in vibetop-session@1 vibetop-ttyd@1; do
  systemctl stop "$u.service" 2>/dev/null || true
done

echo ""
echo "== DONE =="
systemctl show vibetop-manager -p ExecStart --value | sed 's/^/   ExecStart: /'
echo "   prod: $APP   www: $WWW   secrets: $ETC   admin: $ADMIN_USER"
echo "   dev unchanged: $DEV_DIR   (rollback: sudo $0 --rollback)"

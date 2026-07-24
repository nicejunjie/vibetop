#!/usr/bin/env bash
# One-command deploy for vibetop: persistent ttyd terminals behind nginx.
#
# Usage:
#   ./install.sh                  # full install with defaults
#   ./install.sh --dry-run        # show what would happen, change nothing
#
# Configurable via env vars (all optional):
#   MAX_INSTANCES    max terminal slots in nginx map             (default 50)
#   APP_USER         system user that owns the shells            (default: invoking user)
#   APP_DIR          where ttyd-run.sh lives                     (default: script dir)
#   BASE_PORT        loopback port base; tN -> BASE_PORT+N       (default 7680)
#   X11_DISPLAY     xpra X display exported into terminal shells (default :98)
#   NGINX_SITE_NAME  filename under sites-available              (default vibetop)
#   LANDING_DIR      where the landing index.html goes           (default ~APP_USER/vibetop-www)
#   INSTALL_DEPS     install ttyd/nginx via apt                  (default 1)
#   INSTALL_SYSTEMD  render & enable systemd units               (default 1)
#   INSTALL_NGINX    write & enable nginx site                   (default 1)
#   SCROLLBACK       xterm.js scrollback lines                   (default 50000)
#   INSTALL_LANDING  write landing page (1=skip if exists, force=overwrite, 0=off) (default 0)
#   DRY_RUN          print actions without executing them        (default 0)

set -euo pipefail

MAX_INSTANCES="${MAX_INSTANCES:-50}"
APP_USER="${APP_USER:-${SUDO_USER:-$(id -un)}}"
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
BASE_PORT="${BASE_PORT:-7680}"
NGINX_SITE_NAME="${NGINX_SITE_NAME:-vibetop}"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
APP_UID="$(id -u "$APP_USER" 2>/dev/null || true)"
# xpra X display the session shells export (so X11 apps started from a terminal
# render on the X11 desktop). Matches browser/install.sh's X11_DISPLAY_NUM (:98).
X11_DISPLAY="${X11_DISPLAY:-:98}"
LANDING_DIR="${LANDING_DIR:-$APP_HOME/vibetop-www}"
INSTALL_DEPS="${INSTALL_DEPS:-1}"
INSTALL_SYSTEMD="${INSTALL_SYSTEMD:-1}"
INSTALL_NGINX="${INSTALL_NGINX:-1}"
SCROLLBACK="${SCROLLBACK:-50000}"
INSTALL_LANDING="${INSTALL_LANDING:-0}"
DRY_RUN="${DRY_RUN:-0}"
# TLS on the LAN: with multi-user login, a Linux password is POSTed to /api/login,
# so LAN clients must not use plain http. We serve https on :443 (self-signed by
# default; override with TLS_CERT/TLS_KEY) and redirect LAN http->https on the
# credential-entry pages only. Loopback (the cloudflared tunnel, which terminates
# TLS at Cloudflare's edge, and local tooling) and the Docker->host OnlyOffice
# callback stay on http. Disable with ENABLE_TLS=0 (then LAN logins are cleartext).
#
# Host-local deploy overrides: a root-owned /etc/vibetop/deploy.env (not in git)
# is sourced here so a host can persist a choice like ENABLE_TLS=0 across plain
# `./deploy.sh` runs (and in-app Updates) without re-passing the flag. Explicit
# env vars still win — the file should use `${VAR:-default}` assignment so it
# only sets a default when the var is unset (see the file the installer writes).
[ -r /etc/vibetop/deploy.env ] && . /etc/vibetop/deploy.env
ENABLE_TLS="${ENABLE_TLS:-1}"
TLS_DIR="${TLS_DIR:-/etc/vibetop/tls}"
TLS_CERT="${TLS_CERT:-$TLS_DIR/cert.pem}"
TLS_KEY="${TLS_KEY:-$TLS_DIR/key.pem}"

for arg in "$@"; do
    case "$arg" in
        --dry-run|-n) DRY_RUN=1 ;;
        --help|-h)
            sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
            exit 0 ;;
        *) echo "unknown flag: $arg" >&2; exit 2 ;;
    esac
done

if ! id "$APP_USER" >/dev/null 2>&1; then
    echo "APP_USER '$APP_USER' does not exist on this system" >&2
    exit 1
fi
if ! [ -f "$APP_DIR/ttyd-run.sh" ]; then
    echo "ttyd-run.sh not found under APP_DIR=$APP_DIR" >&2
    exit 1
fi

run() {
    if (( DRY_RUN )); then
        printf '+ %s\n' "$*"
    else
        "$@"
    fi
}

write_root() {
    local dest="$1"
    if (( DRY_RUN )); then
        echo "+ write -> $dest"
        sed 's/^/    | /'
    else
        sudo tee "$dest" >/dev/null
    fi
}
# Write an nginx conf from stdin only if it actually differs, and flag a single
# reload at the end. Skipping no-op writes means a re-run/self-update that
# doesn't change the config won't reload nginx — which would otherwise sever
# every live terminal/Browser WebSocket and force a reconnect storm.
NGINX_DIRTY=0
# Returns 1 when it changed the file. It's used in a pipe (subshell), so a global
# set inside wouldn't reach the parent — the caller captures the change as the
# pipe exit status:  <render> | nginx_write "$dest" || NGINX_DIRTY=1
nginx_write() {
    local dest="$1" tmp; tmp="$(mktemp)"; cat >"$tmp"
    if ! [ -s "$tmp" ]; then echo "nginx_write: refusing to write EMPTY config to $dest (upstream render failed?)" >&2; rm -f "$tmp"; return 0; fi
    if [ -f "$dest" ] && cmp -s "$tmp" "$dest"; then rm -f "$tmp"; return 0; fi
    if (( DRY_RUN )); then echo "+ nginx: would update $dest"; else sudo install -m 0644 "$tmp" "$dest"; fi
    rm -f "$tmp"; return 1
}

cat <<EOF
vibetop install
  max instances : $MAX_INSTANCES       (ports $((BASE_PORT+1))..$((BASE_PORT+MAX_INSTANCES)))
  user          : $APP_USER
  app dir       : $APP_DIR
  nginx site    : $NGINX_SITE_NAME
  landing dir   : $LANDING_DIR
  deps          : $INSTALL_DEPS    systemd: $INSTALL_SYSTEMD    nginx: $INSTALL_NGINX    landing: $INSTALL_LANDING
  dry run       : $DRY_RUN
EOF
echo

# 1. Dependencies ------------------------------------------------------------
if (( INSTALL_DEPS )); then
    echo "== installing apt packages =="
    run sudo apt-get update -qq
    run sudo apt-get install -y ttyd nginx acl
fi

# 2. ttyd-run.sh executable bit ---------------------------------------------
run chmod +x "$APP_DIR/ttyd-run.sh" "$APP_DIR/vibetop-session"

# 2b. World-readable copies of the per-user helper scripts -------------------
# Multi-user: a terminal runs AS the logged-in user via systemd-run, so the
# scripts it execs (vibetop-session, ttyd-run.sh) must be reachable by EVERY
# user — not inside the operator's 0750 home where the checkout lives (a
# non-owner gets 203/EXEC "Permission denied"). Install root-owned 0755 copies to
# a shared dir the manager execs from (TERM_HELPER_DIR). Re-copied on every deploy
# (incl. the in-app Update) so they track the checkout.
run sudo install -d -m 0755 /usr/local/lib/vibetop
run sudo install -m 0755 "$APP_DIR/vibetop-session" /usr/local/lib/vibetop/vibetop-session
run sudo install -m 0755 "$APP_DIR/ttyd-run.sh" /usr/local/lib/vibetop/ttyd-run.sh
# xdg-open shim: ahead of /usr/bin on PATH + used as $BROWSER in terminals, so a
# CLI "open a browser" (OAuth logins) opens in the user's vibetop Browser. Defers
# to the real /usr/bin/xdg-open outside vibetop terminals (no VIBETOP_SESSION).
run sudo install -m 0755 "$APP_DIR/xdg-open-shim.sh" /usr/local/bin/xdg-open

# 3. systemd unit templates --------------------------------------------------
if (( INSTALL_SYSTEMD )); then
    echo "== installing systemd unit templates =="
    for unit in vibetop-session@.service vibetop-ttyd@.service; do
        rendered="$(sed \
            -e "s|@APP_USER@|$APP_USER|g" \
            -e "s|@APP_DIR@|$APP_DIR|g" \
            -e "s|@BASE_PORT@|$BASE_PORT|g" \
            -e "s|@X11_DISPLAY@|$X11_DISPLAY|g" \
            -e "s|@APP_UID@|$APP_UID|g" \
            "$APP_DIR/systemd/$unit")"
        echo "$rendered" | write_root "/etc/systemd/system/$unit"
    done

    # Terminal manager API
    rendered="$(sed \
        -e "s|@APP_DIR@|$APP_DIR|g" \
        -e "s|@BASE_PORT@|$BASE_PORT|g" \
        "$APP_DIR/systemd/vibetop-manager.service")"
    echo "$rendered" | write_root "/etc/systemd/system/vibetop-manager.service"

    run sudo systemctl daemon-reload

    # 3b. PAM service for the manager's Linux-account login (/api/login). Without
    # this file, PAM's service name "vibetop" falls back to /etc/pam.d/other,
    # whose policy is host-dependent. Delegate to the host's standard stacks
    # (same effective policy as console login). Only auth+account are needed —
    # the manager calls pam_authenticate + pam_acct_mgmt, no session/password.
    printf '%s\n' \
        '# Managed by vibetop terminal/install.sh — Linux-account login for /api/login.' \
        'auth     include common-auth' \
        'account  include common-account' \
        | write_root "/etc/pam.d/vibetop"
fi

# 4. nginx config ------------------------------------------------------------
if (( INSTALL_NGINX )); then
    echo "== installing nginx config =="

    # Cache-buster for the injected terminal-kbd.js, derived from its CONTENT.
    # Editing the file changes the hash → the ?v= changes → browsers (and the
    # service worker) fetch the new copy. This makes "forgot to bump the version"
    # impossible — the whole reason a stale injected script could ever ship.
    KBD_VER=$([ -f "$APP_DIR/terminal-kbd.js" ] && md5sum "$APP_DIR/terminal-kbd.js" | cut -c1-10 || echo 0)
    # kbd-input.js — the DOM-free, unit-tested input/IME state machine terminal-kbd.js
    # depends on (must load BEFORE it). Same content-hash cache-buster convention.
    KBDIN_VER=$([ -f "$APP_DIR/lib/kbd-input.js" ] && md5sum "$APP_DIR/lib/kbd-input.js" | cut -c1-10 || echo 0)

    # 4a. $connection_upgrade map (only if not defined elsewhere)
    if sudo grep -rqsE 'map[[:space:]]+\$http_upgrade[[:space:]]+\$connection_upgrade' /etc/nginx/; then
        echo "   connection_upgrade map already defined elsewhere — skipping"
    else
        cat "$APP_DIR/nginx/vibetop-upgrade.conf" \
            | nginx_write "/etc/nginx/conf.d/vibetop-upgrade.conf" || NGINX_DIRTY=1
    fi

    # 4a2. TLS material (self-signed by default) + config fragments. Empty vars
    # when TLS is off, so the server block renders http-only unchanged.
    lan_map=""; tls_listen=""; tls_redirect_if=""
    if [ "$ENABLE_TLS" = 1 ]; then
        if ! sudo test -f "$TLS_CERT" || ! sudo test -f "$TLS_KEY"; then
            if [ "$TLS_CERT" = "$TLS_DIR/cert.pem" ] && [ "$TLS_KEY" = "$TLS_DIR/key.pem" ]; then
                if command -v openssl >/dev/null 2>&1; then
                    echo "   generating self-signed TLS cert -> $TLS_DIR (override with TLS_CERT/TLS_KEY)"
                    run sudo install -d -m 0755 "$TLS_DIR"
                    host_cn="$(hostname -f 2>/dev/null || hostname)"
                    sans="DNS:${host_cn},DNS:localhost,IP:127.0.0.1"
                    for ip in $(hostname -I 2>/dev/null || true); do
                        case "$ip" in *.*) sans="$sans,IP:$ip" ;; esac
                    done
                    if run sudo openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
                            -keyout "$TLS_KEY" -out "$TLS_CERT" \
                            -subj "/CN=${host_cn}" -addext "subjectAltName=${sans}" 2>/dev/null; then
                        run sudo chmod 600 "$TLS_KEY"
                    else
                        echo "   WARNING: cert generation failed — disabling TLS (LAN logins would be cleartext)"; ENABLE_TLS=0
                    fi
                else
                    echo "   WARNING: openssl not found — disabling TLS (LAN logins will be cleartext)"; ENABLE_TLS=0
                fi
            else
                echo "   WARNING: TLS_CERT/TLS_KEY not found — disabling TLS (provide a cert or unset the vars)"; ENABLE_TLS=0
            fi
        fi
    fi
    if [ "$ENABLE_TLS" = 1 ]; then
        lan_map="# Non-loopback (LAN) clients — used to upgrade cleartext logins to https.
map \$remote_addr \$vt_is_lan {
    default 1;
    127.0.0.1 0;
    ::1 0;
}

"
        tls_listen="    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    ssl_certificate $TLS_CERT;
    ssl_certificate_key $TLS_KEY;
    ssl_protocols TLSv1.2 TLSv1.3;
"
        # A LAN client on http reaching a credential-entry page -> https. \$vt_up
        # is 'http1' only for http + non-loopback, so the tunnel (loopback) and the
        # Docker->host OnlyOffice callback are never redirected. Injected into the
        # shell-entry and login locations only (not /api).
        tls_redirect_if="        set \$vt_up \"\$scheme\$vt_is_lan\";
        if (\$vt_up = \"http1\") { return 301 https://\$host\$request_uri; }
"
    else
        echo "   NOTE: TLS disabled — LAN logins send the Linux password over cleartext http."
    fi

    # 4b. Build port map for terminal routing
    map_entries=""
    for i in $(seq 1 "$MAX_INSTANCES"); do
        map_entries+="    ~^/t${i}(/|\$)  $((BASE_PORT + i));
"
    done

    site_config="${lan_map}# Terminal port map: /tN/ -> port BASE_PORT+N
map \$uri \$term_port {
    default \"\";
$map_entries}

server {
    listen 80 default_server;
    listen [::]:80 default_server;
$tls_listen    server_name _;

    # Don't advertise the nginx version in Server: / error pages.
    server_tokens off;

    root $LANDING_DIR;
    index index.html;

    location / {
        try_files \$uri \$uri/ =404;
        add_header Cache-Control 'no-cache, no-store' always;
        # Security headers on the shell/static HTML. frame-ancestors 'self'
        # blocks external sites from framing the desktop (clickjacking); the
        # desktop frames its own same-origin app pages, so it's unaffected.
        # (nginx drops INHERITED add_headers in any location that sets its own,
        # so these live here next to the existing Cache-Control rather than at
        # server scope where the proxy locations' own add_headers would void them.)
        add_header X-Content-Type-Options 'nosniff' always;
        add_header Referrer-Policy 'same-origin' always;
        add_header Content-Security-Policy \"frame-ancestors 'self'\" always;
    }

    # --- Auth gate (multi-user Option B) ---------------------------------
    # Every protected surface delegates to the manager's /api/authcheck: 200 for a
    # valid Linux session cookie (or an allowlisted public path), else 401. The
    # manager owns the public-path allowlist (login/health/OnlyOffice callbacks),
    # so nginx needs only this one internal endpoint + auth_request lines.
    # (Loopback admin tooling hits 127.0.0.1:$BASE_PORT directly, bypassing nginx
    # and this gate — watchdog/doctor/smoke-test are unaffected.)
    location = /internal/authcheck {
        internal;
        # auth_request runs this subrequest for EVERY protected request, and
        # nginx size-checks the main request's body against THIS location's
        # client_max_body_size (default 1M) even though the body is never
        # forwarded here (proxy_pass_request_body off). Without a raised limit,
        # any upload >1M gets the auth subrequest 413'd -> the whole request
        # 500s (\"auth request unexpected status: 413\"). /api/ already allows 5G,
        # so match it here; the body isn't sent to the manager regardless.
        client_max_body_size 5G;
        proxy_pass http://127.0.0.1:$BASE_PORT/api/authcheck;
        proxy_pass_request_body off;
        proxy_set_header Content-Length \"\";
        proxy_set_header X-Original-URI \$request_uri;
    }
    location @login { return 302 /login.html; }

    # The login page — public (no auth), but LAN clients are upgraded to https so
    # the password POST isn't sent in cleartext.
    location = /login.html {
$tls_redirect_if        add_header Cache-Control 'no-cache, no-store' always;
        try_files /login.html =404;
    }

    # The desktop shell entry. Unauthenticated -> login. (Static assets are served
    # by the prefix location / above and stay public; their DATA is gated at /api.)
    location = / {
$tls_redirect_if        auth_request /internal/authcheck;
        error_page 401 = @login;
        add_header Cache-Control 'no-cache, no-store' always;
        add_header X-Content-Type-Options 'nosniff' always;
        add_header Referrer-Policy 'same-origin' always;
        add_header Content-Security-Policy \"frame-ancestors 'self'\" always;
        try_files /index.html =404;
    }

    location = /terminals { return 301 /terminals/; }
    location = /terminals/ {
        auth_request /internal/authcheck;
        error_page 401 = @login;
        add_header Cache-Control 'no-cache, no-store' always;
        rewrite ^ /terminals.html break;
    }

    # On the LAN there's no Cloudflare in front, so the desktop's logout link
    # (/cdn-cgi/access/logout) reaches this origin and would 404. Serve a
    # friendly signed-out page instead. Over the tunnel Cloudflare handles
    # /cdn-cgi/* at its edge, so this block never runs there.
    location = /cdn-cgi/access/logout {
        add_header Cache-Control 'no-cache, no-store' always;
        rewrite ^ /loggedout.html break;
    }

    # Terminal manager & system status API
    location /api/ {
        # Gate on a valid session; the manager allowlists the public API paths
        # (login/health/OnlyOffice callbacks), so a 401 here is a real deny for a
        # browser XHR (JS reads the 401 and redirects to login itself).
        auth_request /internal/authcheck;
        proxy_pass http://127.0.0.1:$BASE_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;   # so a share link gets the right scheme
        client_max_body_size 5G;       # allow large /api/upload posts
        proxy_request_buffering off;   # stream upload body to the manager
        proxy_read_timeout 3600;

        # Status JSON is a few KB and polled every few seconds; gzip shrinks
        # it ~4x (nginx won't gzip proxied responses without gzip_proxied).
        gzip on;
        gzip_proxied any;
        gzip_types application/json;
        gzip_min_length 256;
    }

    # Public file-share links (Files app) -> manager. This is the ONE path meant to
    # be reachable WITHOUT auth (the /s/<token> capability is the gate). On the LAN
    # nginx is the only gate, so it just works; over the Cloudflare tunnel you must
    # add an Access Bypass app (rule Everyone) scoped to /s/ (see tunnel/README.md),
    # or the link hits the login page. Read-only downloads: buffering off so a large
    # file/zip streams straight through instead of spooling in nginx.
    location /s/ {
        proxy_pass http://127.0.0.1:$BASE_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_read_timeout 3600;
    }

    # Dynamic terminal routing: /tN/ -> the PER-USER ttyd port. The authcheck
    # subrequest resolves the logged-in user's terminal N (starting it on demand)
    # and returns it in X-Term-Port, which we route to. (The \$term_port map above
    # is retained but unused — routing is by identity now, not by N alone.)
    location ~ ^/t(\d+)/(.*)$ {
        auth_request /internal/authcheck;
        auth_request_set \$tport \$upstream_http_x_term_port;
        error_page 401 = @login;
        proxy_pass http://127.0.0.1:\$tport;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header Accept-Encoding \"\";
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
        proxy_buffering off;
        # Never let the browser cache the /tN/ page — it carries the sub_filter
        # injections (clipboard, reconnect, mobile kbd), so a stale cache means a
        # reload silently keeps old behaviour.
        add_header Cache-Control 'no-store' always;

        # ttyd's page is a single ~240KB HTML (xterm.js inlined), served
        # uncompressed because sub_filter needs a plain upstream body. Re-gzip
        # the filtered output to the client — on slow/mobile links the
        # uncompressed page was the terminal's whole time-to-content.
        # WebSocket frames are unaffected.
        gzip on;
        gzip_proxied any;
        gzip_types text/html text/javascript application/javascript text/css application/json;
        gzip_min_length 1024;

        sub_filter 'fontSize:13,' 'fontSize:13,scrollback:$SCROLLBACK,cursorStyle:\"bar\",cursorInactiveStyle:\"bar\",';
        sub_filter '</head>' '<script>(function(){var isMac=/Mac/.test(navigator.platform);var isTouch=window.matchMedia&&window.matchMedia(\"(pointer: coarse)\").matches;var blockTa=true;var _ec=document.execCommand.bind(document);document.execCommand=function(c){if(c===\"copy\"&&!window.__allowCopy)throw 0;return _ec.apply(document,arguments)};if(isTouch){document.addEventListener(\"focusin\",function(e){var t=e.target;if(blockTa&&t&&t.classList&&t.classList.contains(\"xterm-helper-textarea\")){var o=window.__termOverlay;if(window.__termArmed&&o&&document.activeElement!==o){window.__termBouncing=1;try{o.focus({preventScroll:true})}catch(_){try{o.focus()}catch(__){t.blur()}}window.__termBouncing=0}else{t.blur()}}},true)}function copySelection(){var t=window.term;if(!t||!t.hasSelection())return;var s=t.getSelection();if(!s)return;var ta=document.querySelector(\".xterm-helper-textarea\");if(ta){ta.value=s;blockTa=false;ta.select();try{window.__allowCopy=true;document.execCommand(\"copy\")}finally{window.__allowCopy=false;blockTa=true;ta.value=\"\"}}}var check=setInterval(function(){if(!window.term)return;clearInterval(check);var t=window.term;t.attachCustomKeyEventHandler(function(e){if(e.type!==\"keydown\")return true;var mod=isMac?e.metaKey:e.ctrlKey;if(!mod||e.shiftKey||e.altKey)return true;if(isMac&&e.ctrlKey)return true;if(e.key===\"c\"){if(t.hasSelection()){copySelection();t.clearSelection();e.preventDefault();return false}if(isMac){e.preventDefault();return false}return true}if(e.key===\"v\"||e.key===\"V\"){if(!isMac)return false;var ta=document.querySelector(\".xterm-helper-textarea\");if(ta){ta.value=\"\";ta.focus()}return true}return true})},100);document.addEventListener(\"auxclick\",function(e){if(e.button!==1)return;e.preventDefault();var ta=document.querySelector(\".xterm-helper-textarea\");if(ta){ta.value=\"\";ta.focus()}});function sendToBrowser(u){fetch(\"/api/browser/open\",{method:\"POST\",headers:{\"Content-Type\":\"application/json\"},body:JSON.stringify({url:u})});try{window.top.postMessage({type:\"switch-to-browser\"},\"*\")}catch(e){}}var wo=window.open;window.open=function(u){if(u&&(u.startsWith(\"http://\")||u.startsWith(\"https://\"))){sendToBrowser(u);return null}if(!u){return{opener:null,location:Object.defineProperty({},\"href\",{set:function(v){sendToBrowser(v)}})}}return wo.apply(this,arguments)}})();(function(){var RK=\"ttyd-recon-ts\",busy=false,tries=0,firstStuck=0;function fireEnter(){var ta=document.querySelector(\".xterm-helper-textarea\");if(ta){[\"keydown\",\"keyup\"].forEach(function(ty){ta.dispatchEvent(new KeyboardEvent(ty,{key:\"Enter\",code:\"Enter\",keyCode:13,which:13,bubbles:true,cancelable:true}))})}}function stuck(){var b=document.body;if(!b)return false;var d=b.querySelectorAll(\"div\");for(var i=0;i<d.length;i++){var t=d[i].textContent||\"\";if(t.length<120&&t.indexOf(\"Press\")!==-1&&t.indexOf(\"Reconnect\")!==-1)return true}return false}function attempt(){if(!stuck()){busy=false;tries=0;firstStuck=0;return}if(!firstStuck)firstStuck=Date.now();fireEnter();tries++;if(Date.now()-firstStuck>20000){var now=Date.now(),last=+(sessionStorage.getItem(RK)||0);if(now-last>30000){sessionStorage.setItem(RK,now);location.reload();return}}var delay=Math.min(8000,700*Math.pow(1.6,Math.min(tries,6)))+Math.random()*1000;setTimeout(attempt,delay)}function handle(){if(busy)return;busy=true;setTimeout(attempt,200)}function check(n){var t=(n&&n.textContent)||\"\";if(t.indexOf(\"Reconnect\")!==-1&&t.indexOf(\"Press\")!==-1)handle()}var obs=new MutationObserver(function(ms){ms.forEach(function(m){if(m.type===\"characterData\")check(m.target.parentNode);(m.addedNodes||[]).forEach(check)})});function startObs(){if(!document.body){setTimeout(startObs,50);return}obs.observe(document.body,{childList:true,subtree:true,characterData:true});if(stuck())handle()}startObs()})();</script><script src=\"/coach.js\"></script><script src=\"/kbd-input.js?v=${KBDIN_VER}\"></script><script src=\"/terminal-kbd.js?v=${KBD_VER}\"></script></head>';
        sub_filter_once off;
    }
    location ~ ^/t(\d+)$ { return 301 \$scheme://\$host/t\$1/; }

    # Sibling projects (e.g. vibetop-browser) drop /etc/nginx/snippets/vibetop-extras.d/*.conf
    # to add their own location blocks without modifying this file.
    include /etc/nginx/snippets/vibetop-extras.d/*.conf;
}
"
    run sudo install -d -m 0755 /etc/nginx/snippets/vibetop-extras.d
    echo "$site_config" | nginx_write "/etc/nginx/sites-available/$NGINX_SITE_NAME" || NGINX_DIRTY=1

    # 4c. Disable any other default_server site that would clash
    if [ -L "/etc/nginx/sites-enabled/default" ] \
        && [ "$(readlink -f /etc/nginx/sites-enabled/default 2>/dev/null || true)" \
             != "$(readlink -f /etc/nginx/sites-available/$NGINX_SITE_NAME 2>/dev/null || true)" ]; then
        echo "   disabling /etc/nginx/sites-enabled/default (was: $(readlink /etc/nginx/sites-enabled/default))"
        run sudo rm -f /etc/nginx/sites-enabled/default
        NGINX_DIRTY=1
    fi
    # Enable our site (idempotent); a (re)created symlink needs a reload too.
    if [ "$(readlink -f /etc/nginx/sites-enabled/$NGINX_SITE_NAME 2>/dev/null || true)" \
         != "$(readlink -f /etc/nginx/sites-available/$NGINX_SITE_NAME 2>/dev/null || true)" ]; then
        NGINX_DIRTY=1
    fi
    run sudo ln -sfn "/etc/nginx/sites-available/$NGINX_SITE_NAME" \
                     "/etc/nginx/sites-enabled/$NGINX_SITE_NAME"

    # Ensure the landing dir exists. The landing installer also creates it, but
    # the terminal installer can run first on a fresh machine (per the deploy
    # order), and these copies would otherwise fail with "No such file".
    run sudo install -d -o "$APP_USER" -g "$APP_USER" "$LANDING_DIR"

    # Let nginx (www-data) traverse into the landing dir even though $HOME is
    # 0750 — grant execute (traversal) on each ancestor it can't enter. This
    # MUST run for any nginx install (not just when we write the landing page),
    # or `/` 404s with "stat() … Permission denied".
    p="$LANDING_DIR"
    while p="$(dirname "$p")" && [ "$p" != "/" ] && [ -n "$p" ]; do
        if ! sudo -u www-data test -x "$p" 2>/dev/null; then
            run sudo setfacl -m u:www-data:x "$p"
        fi
    done

    # Pure tab-set reconciliation module loaded by terminals.html (<script src>).
    # Content-hash cache-buster, same convention as terminal-kbd.js — editing the
    # JS changes its hash → the ?v= changes → nginx + the service worker fetch the
    # new copy. Unit-tested in terminal/lib/tab-sync.test.js (node --test).
    if [ -f "$APP_DIR/lib/tab-sync.js" ]; then
        run sudo install -o "$APP_USER" -g "$APP_USER" -m 0644 \
            "$APP_DIR/lib/tab-sync.js" "$LANDING_DIR/tab-sync.js"
    fi
    SYNC_VER=$([ -f "$APP_DIR/lib/tab-sync.js" ] && md5sum "$APP_DIR/lib/tab-sync.js" | cut -c1-10 || echo 0)

    # Install terminals.html to the landing dir for /terminals/ route, stamping
    # the tab-sync.js cache-buster into its <script src="/tab-sync.js?v=@SYNC_VER@">.
    if [ -f "$APP_DIR/terminals.html" ]; then
        if (( DRY_RUN )); then
            echo "+ would render terminals.html (@SYNC_VER@ -> $SYNC_VER) -> $LANDING_DIR/terminals.html"
        else
            tmp_th="$(mktemp)"
            sed "s/@SYNC_VER@/$SYNC_VER/g" "$APP_DIR/terminals.html" > "$tmp_th"
            sudo install -o "$APP_USER" -g "$APP_USER" -m 0644 \
                "$tmp_th" "$LANDING_DIR/terminals.html"
            rm -f "$tmp_th"
        fi
    fi

    # kbd-input.js — the unit-tested input/IME state machine terminal-kbd.js uses.
    # Deploy it FIRST (the sub_filter loads it before terminal-kbd.js).
    if [ -f "$APP_DIR/lib/kbd-input.js" ]; then
        run sudo install -o "$APP_USER" -g "$APP_USER" -m 0644 \
            "$APP_DIR/lib/kbd-input.js" "$LANDING_DIR/kbd-input.js"
    fi
    # Mobile keyboard/dictation patch (loaded into /tN/ via the sub_filter
    # <script src>; a no-op on non-touch devices).
    if [ -f "$APP_DIR/terminal-kbd.js" ]; then
        run sudo install -o "$APP_USER" -g "$APP_USER" -m 0644 \
            "$APP_DIR/terminal-kbd.js" "$LANDING_DIR/terminal-kbd.js"
    fi

    if (( NGINX_DIRTY )); then
        if run sudo nginx -t; then
            run sudo systemctl reload nginx
        else
            echo "ERROR: generated nginx config failed validation — not reloading" >&2
            exit 1
        fi
    else
        echo "   nginx config unchanged — skipping reload"
    fi
fi

# 5. Landing page ------------------------------------------------------------
write_landing=0
case "$INSTALL_LANDING" in
    1)
        if [ -e "$LANDING_DIR/index.html" ]; then
            echo "== landing page already at $LANDING_DIR/index.html — skipping =="
        else
            write_landing=1
        fi ;;
    force) write_landing=1 ;;
    0) : ;;
    *) echo "INSTALL_LANDING must be 0, 1, or force (got: $INSTALL_LANDING)" >&2; exit 1 ;;
esac
if (( write_landing )); then
    # Only preps the dir + traversal ACLs; the page itself is deployed by landing/install.sh.
    echo "== preparing landing dir =="
    run sudo install -d -o "$APP_USER" -g "$APP_USER" -m 0755 "$LANDING_DIR"
    p="$LANDING_DIR"
    while p="$(dirname "$p")" && [ "$p" != "/" ] && [ -n "$p" ]; do
        if ! sudo -u www-data test -x "$p" 2>/dev/null; then
            run sudo setfacl -m u:www-data:x "$p"
        fi
    done
fi

# 6. Enable & start services -------------------------------------------------
if (( INSTALL_SYSTEMD )); then
    echo "== enabling terminal manager =="
    run sudo systemctl enable --now vibetop-manager.service

    # Start terminal 1 if nothing is running
    if ! systemctl is-active --quiet vibetop-ttyd@1.service 2>/dev/null; then
        echo "== starting terminal 1 =="
        run sudo systemctl start vibetop-session@1.service vibetop-ttyd@1.service
    fi

    # Stop and disable any pre-provisioned instances beyond what's running
    echo "== disabling pre-provisioned instances (now on-demand) =="
    for i in $(seq 1 99); do
        if systemctl is-enabled --quiet "vibetop-ttyd@$i.service" 2>/dev/null; then
            run sudo systemctl disable "vibetop-ttyd@$i.service" "vibetop-session@$i.service" 2>/dev/null || true
        fi
    done
fi

echo
echo "done. open http://<host>/terminals/"

#!/bin/sh
# vibetop xdg-open shim — installed as /usr/local/bin/xdg-open (ahead of
# /usr/bin on PATH) and set as $BROWSER inside vibetop terminals. When a CLI
# (e.g. an OAuth/login flow like Claude Code) asks to "open a browser", route the
# URL into THIS user's vibetop Browser app via the manager, so it opens under
# vibetop instead of failing/going nowhere. The manager identifies the user from
# the per-user token the terminal exports as VIBETOP_SESSION.
#
# Outside a vibetop terminal (no VIBETOP_SESSION) — or for a non-http(s) target —
# it defers to the real xdg-open, so system behaviour is unchanged everywhere else.
real=/usr/bin/xdg-open
url=$1

defer() {
    if [ -x "$real" ]; then
        exec "$real" "$@"
    fi
    exit 0
}

# The routing token: the terminal env (VIBETOP_SESSION) if present, else the
# per-user token file the manager drops for every vibetop user. The file makes
# routing GENERAL — it works from ANY of the user's processes (old terminals with
# no env, subshells, cron) without depending on an inherited env var.
token="${VIBETOP_SESSION:-}"
if [ -z "$token" ] && [ -r "${HOME:-/nonexistent}/.config/vibetop/browser.token" ]; then
    token=$(cat "${HOME}/.config/vibetop/browser.token" 2>/dev/null)
fi

# No token at all (a genuine non-vibetop user), or not an http(s) URL -> hand
# back to the real xdg-open so system behaviour is unchanged everywhere else.
if [ -z "$token" ]; then
    defer "$@"
fi
case $url in
    http://*|https://*) ;;
    *) defer "$@" ;;
esac

port=${VIBETOP_MGR_PORT:-7680}
if command -v curl >/dev/null 2>&1 && \
   curl -fsS -m 15 -X POST -H 'Content-Type: application/json' \
        -H "Cookie: vt_session=${token}" \
        --data "{\"url\":\"${url}\"}" \
        "http://127.0.0.1:${port}/api/browser/open" >/dev/null 2>&1; then
    printf '\n[vibetop] Opening in the Browser app:\n  %s\n\n' "$url" >&2
    exit 0
fi

# Fallback (manager unreachable / URL rejected): show the link so it's still usable.
printf '\n[vibetop] Open this URL in the Browser app:\n  %s\n\n' "$url" >&2
exit 0

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

# Not a vibetop terminal, or not an http(s) URL -> hand back to the real xdg-open.
if [ -z "${VIBETOP_SESSION:-}" ]; then
    defer "$@"
fi
case $url in
    http://*|https://*) ;;
    *) defer "$@" ;;
esac

port=${VIBETOP_MGR_PORT:-7680}
if command -v curl >/dev/null 2>&1 && \
   curl -fsS -m 15 -X POST -H 'Content-Type: application/json' \
        -H "Cookie: vt_session=${VIBETOP_SESSION}" \
        --data "{\"url\":\"${url}\"}" \
        "http://127.0.0.1:${port}/api/browser/open" >/dev/null 2>&1; then
    printf '\n[vibetop] Opened in the Browser app — switch to Browser to continue:\n  %s\n\n' "$url" >&2
    exit 0
fi

# Fallback (manager unreachable / URL rejected): show the link so it's still usable.
printf '\n[vibetop] Open this URL in the Browser app:\n  %s\n\n' "$url" >&2
exit 0

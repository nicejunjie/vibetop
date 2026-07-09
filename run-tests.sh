#!/usr/bin/env bash
#
# run-tests.sh — one command to run vibetop's whole regression suite.
#
# A DEV-ONLY tool: no installer runs it and it deploys nothing. It drives the
# hermetic tiers (no root/systemd/nginx/Docker needed):
#
#   * Python — terminal-manager endpoint contracts + pure logic + static/
#     integrity checks (terminal/tests/), loaded in-process.
#   * Python — the claude-usage proxy (claude-usage/tests/).
#   * JavaScript — service-worker routing, tab-sync, coach tips, terminal-kbd
#     key map, and a syntax guard over every injected/deployed script
#     (node's built-in runner, no deps).
#
#   ./run-tests.sh                # all hermetic tiers (CI + pre-commit)
#   ./run-tests.sh --live         # ALSO run the live-host smoke test (needs the
#                                 # deployed stack — see tools/smoke-test.sh)
#   ./run-tests.sh --live --base http://192.168.1.10
#
# Each runner self-skips (with a warning) if its tool isn't installed, so a box
# missing node or pytest still runs what it can. Exit 0 iff every suite passed.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

RUN_LIVE=0
BASE_ARGS=()
while [ $# -gt 0 ]; do
    case "$1" in
        --live) RUN_LIVE=1 ;;
        --base) BASE_ARGS+=(--base "${2:-}"); shift ;;
        --base=*) BASE_ARGS+=("$1") ;;
        --fast) : ;;   # accepted for symmetry with pre-commit; hermetic is the default
        -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "unknown arg: $1" >&2; exit 2 ;;
    esac
    shift
done

fail=0
hr() { printf '\033[1m── %s\033[0m\n' "$1"; }
ok() { printf '\033[32m✓ %s\033[0m\n' "$1"; }
no() { printf '\033[31m✗ %s\033[0m\n' "$1"; fail=1; }

# --- Python: terminal manager (endpoints + pure logic + static) -------------
if command -v python >/dev/null 2>&1 && python -m pytest --version >/dev/null 2>&1; then
    hr "pytest — terminal manager (terminal/tests)"
    if ( cd terminal && python -m pytest tests/ -q ); then ok "terminal manager"; else no "terminal manager"; fi

    hr "pytest — claude-usage proxy (claude-usage/tests)"
    if ( cd claude-usage && python -m pytest tests/ -q ); then ok "claude-usage proxy"; else no "claude-usage proxy"; fi
else
    echo "pytest unavailable — skipping Python suites." >&2
fi

# --- JavaScript: node's built-in runner -------------------------------------
if command -v node >/dev/null 2>&1; then
    hr "node --test — JS units (sw / tab-sync / coach / kbd / syntax)"
    # Discover every *.test.js outside .claude/ (worktrees carry stale copies).
    mapfile -t JS_TESTS < <(find browser landing terminal -name '*.test.js' \
        -not -path '*/.claude/*' 2>/dev/null | sort)
    if [ "${#JS_TESTS[@]}" -eq 0 ]; then
        no "no JS test files found"
    elif node --test "${JS_TESTS[@]}"; then ok "JS units"; else no "JS units"; fi
else
    echo "node unavailable — skipping JS suites." >&2
fi

# --- Optional: live-host smoke test -----------------------------------------
if [ "$RUN_LIVE" = 1 ]; then
    hr "smoke — live host (needs the deployed stack)"
    if ./tools/smoke-test.sh "${BASE_ARGS[@]}"; then ok "live smoke"; else no "live smoke"; fi
fi

echo
if [ "$fail" = 0 ]; then printf '\033[32mALL SUITES PASSED\033[0m\n'; else printf '\033[31mSOME SUITES FAILED\033[0m\n'; fi
exit "$fail"

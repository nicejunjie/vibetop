#!/usr/bin/env bash
# run.sh — install matrix: does `sudo ./deploy.sh` actually work on each distro?
#
# Boots one disposable KVM VM per distro (serially — each wants GBs of RAM),
# installs vibetop AS ROOT with no username, and runs tests/matrix/assert.sh
# inside the guest. Every assertion happens in the VM; only a result line and a
# per-distro log come back.
#
#   tests/matrix/run.sh                    # the supported set
#   tests/matrix/run.sh --all              # + experimental rows (Fedora, …)
#   tests/matrix/run.sh ubuntu-24.04 rocky-9
#   tests/matrix/run.sh --keep             # don't destroy a FAILING vm (debug)
#   VIBETOP_MATRIX_FULL=1 tests/matrix/run.sh   # heavy stack too
#
# Exit status: 0 = every SUPPORTED distro passed. An experimental row failing,
# or a box that can't be fetched, is reported but does NOT fail the run — the
# point is a truthful report, not a green tick.
#
# Requires libvirt/KVM + vagrant + vagrant-libvirt, and membership of `libvirt`.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGDIR="$HERE/logs"

# name              box                        tier
# tier: supported = must pass (fails the run) | experimental = report only
DISTROS='
ubuntu-24.04       cloud-image/ubuntu-24.04    supported
ubuntu-22.04       cloud-image/ubuntu-22.04    supported
debian-12          cloud-image/debian-12       supported
rocky-9            cloud-image/rocky-9         experimental
almalinux-9        almalinux/9                 experimental
fedora-43          cloud-image/fedora-43       experimental
'

KEEP=0; WANT_ALL=0; PICK=()
while [ $# -gt 0 ]; do
    case "$1" in
        --keep) KEEP=1 ;;
        --all)  WANT_ALL=1 ;;
        -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        -*) echo "unknown flag: $1" >&2; exit 2 ;;
        *) PICK+=("$1") ;;
    esac
    shift
done

command -v vagrant >/dev/null 2>&1 || { echo "vagrant not installed" >&2; exit 2; }
mkdir -p "$LOGDIR"

wanted() {   # wanted <name> <tier>
    if [ ${#PICK[@]} -gt 0 ]; then
        local p; for p in "${PICK[@]}"; do [ "$p" = "$1" ] && return 0; done
        return 1
    fi
    [ "$2" = supported ] || [ "$WANT_ALL" = 1 ]
}

declare -a ROWS=()
supported_failed=0

run_one() {   # run_one <name> <box> <tier>
    local name="$1" box="$2" tier="$3" log="$LOGDIR/$name.log" rc=0 result="" detail=""
    echo
    echo "════════════════════════════════════════════════════════════"
    echo "  $name   ($box, $tier)"
    echo "════════════════════════════════════════════════════════════"
    : > "$log"

    # Per-distro vagrant state + domain name so rows are independent and can be
    # run concurrently (one shared .vagrant/ would have them clobber each other's
    # machine id and destroy the wrong VM).
    local vg=(env "VIBETOP_BOX=$box" "VIBETOP_MATRIX_NAME=$name"
              "VAGRANT_DOTFILE_PATH=$HERE/.vagrant-$name")
    ( cd "$HERE" && "${vg[@]}" vagrant up --provider=libvirt ) >>"$log" 2>&1 || rc=$?

    if grep -q 'MATRIX_RESULT PASS' "$log"; then
        result=PASS
    elif grep -q 'MATRIX_RESULT FAIL' "$log"; then
        result=FAIL
        # Strip vagrant's "    default: " line prefix first — without it the awk
        # fields are shifted and the notes column comes out silently empty.
        detail="$(sed -n 's/.*MATRIX_CHECK //p' "$log" | awk '$2=="FAIL"{print $1}' | paste -sd, -)"
    elif grep -qiE "Box .* could not be found|The box you're attempting|could not be downloaded|404 Not Found" "$log"; then
        result=SKIP; detail="box unavailable"
    else
        result=FAIL; detail="provisioning did not complete (vagrant rc=$rc)"
    fi

    # Show the individual checks inline so the run is readable as it goes.
    sed -n 's/.*MATRIX_CHECK /  /p' "$log" || true
    echo "  -> $name: $result ${detail:+($detail)}   log: ${log#"$HERE"/}"

    ROWS+=("$name|$tier|$result|$detail")
    [ "$tier" = supported ] && [ "$result" = FAIL ] && supported_failed=1

    if [ "$result" = FAIL ] && [ "$KEEP" = 1 ]; then
        echo "  (--keep: VM left up. To poke at it:"
        echo "     cd $HERE && VIBETOP_BOX=$box VIBETOP_MATRIX_NAME=$name \\"
        echo "       VAGRANT_DOTFILE_PATH=$HERE/.vagrant-$name vagrant ssh)"
    else
        ( cd "$HERE" && "${vg[@]}" vagrant destroy -f ) >>"$log" 2>&1 || true
    fi
    return 0
}

while read -r name box tier; do
    [ -n "$name" ] || continue
    wanted "$name" "$tier" || continue
    run_one "$name" "$box" "$tier"
done <<< "$(printf '%s\n' "$DISTROS" | sed '/^[[:space:]]*$/d')"

echo
echo "════════════════════════════════════════════════════════════"
printf '  %-16s %-14s %-6s %s\n' DISTRO TIER RESULT NOTES
printf '  %-16s %-14s %-6s %s\n' "────────────────" "──────────────" "──────" "─────"
for row in "${ROWS[@]}"; do
    IFS='|' read -r n t r d <<< "$row"
    case "$r" in
        PASS) c=32 ;; FAIL) c=31 ;; *) c=33 ;;
    esac
    printf '  %-16s %-14s \033[%sm%-6s\033[0m %s\n' "$n" "$t" "$c" "$r" "$d"
done
echo "════════════════════════════════════════════════════════════"
echo "  logs: ${LOGDIR#"$HERE"/}/"

if [ "$supported_failed" = 1 ]; then
    echo "  a SUPPORTED distro failed"
    exit 1
fi
echo "  all supported distros passed"

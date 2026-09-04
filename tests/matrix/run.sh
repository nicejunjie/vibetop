#!/usr/bin/env bash
# run.sh — install matrix: does `sudo ./deploy.sh` actually work on each distro?
#
# Boots one disposable KVM VM per distro (serially — each wants GBs of RAM),
# installs vibetop AS ROOT with no username, and runs tests/matrix/assert.sh
# inside the guest. Every assertion happens in the VM; only a result line and a
# per-distro log come back.
#
#   tests/matrix/run.sh                    # the supported set
#   tests/matrix/run.sh --all              # + any experimental rows (none today)
#   tests/matrix/run.sh ubuntu-24.04 rocky-9
#   tests/matrix/run.sh --keep             # don't destroy a FAILING vm (debug)
#   VIBETOP_MATRIX_FULL=1 tests/matrix/run.sh   # heavy stack too
#   VIBETOP_MATRIX_TIMEOUT=20m tests/matrix/run.sh   # per-row hard deadline
#   tests/matrix/run.sh --all -j3                    # 3 rows at a time
#
# Rows are independent (per-distro VAGRANT_DOTFILE_PATH + libvirt domain name),
# so -j runs them concurrently. Size it by RAM, not cores: a FULL row wants ~8GB,
# so -j3 needs ~24GB. Oversubscribing swaps, and swapping causes flaky failures.
#
# Each row has a HARD per-row deadline (default 30m lean / 75m full). A row that
# stops making progress FAILS as "TIMED OUT" instead of hanging the run — an apt
# debconf prompt once blocked a row for 5h19m at zero load.
#
# Exit status: 0 = every SUPPORTED distro passed. All six rows (Ubuntu 22.04/
# 24.04, Debian 12, Rocky 9, AlmaLinux 9, Fedora 43) are supported, so any of
# them failing fails the run. A box that can't be fetched is SKIPped, not failed.
#
# NOTE: the RPM rows depend on third-party repos that move independently of this
# project — xpra.org (we pin 6.4.x; Fedora already ships 6.5.x), EPEL (ttyd,
# wmctrl, xdotool on EL9), and the vagrant box images (rockylinux/9 has already
# 404'd once when Rocky pruned old images). Those can turn red without any
# change here.
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
rocky-9            cloud-image/rocky-9         supported
almalinux-9        almalinux/9                 supported
fedora-43          cloud-image/fedora-43       supported
'

# Per-row hard deadline. A FULL row legitimately takes far longer (xpra +
# Chromium + LibreOffice + a ~2GB OnlyOffice image), so it gets a bigger budget.
# Override with VIBETOP_MATRIX_TIMEOUT (any `timeout` duration, e.g. 90m).
if [ "${VIBETOP_MATRIX_FULL:-0}" = "1" ]; then
    ROW_TIMEOUT="${VIBETOP_MATRIX_TIMEOUT:-75m}"
else
    ROW_TIMEOUT="${VIBETOP_MATRIX_TIMEOUT:-30m}"
fi

KEEP=0; WANT_ALL=0; JOBS=1; PICK=()
while [ $# -gt 0 ]; do
    case "$1" in
        --keep) KEEP=1 ;;
        --all)  WANT_ALL=1 ;;
        -j)     JOBS="${2:?-j needs a number}"; shift ;;
        -j*)    JOBS="${1#-j}" ;;
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
    local name="$1" box="$2" tier="$3" rc=0 result="" detail=""
    # SEPARATE `local` on purpose: bash expands a declaration's right-hand
    # sides BEFORE the new locals in the SAME command take effect, so the
    # one-liner form resolved $name to the caller's (empty) value and every
    # row logged to "$LOGDIR/.log" — one shared file that -j rows truncate
    # under each other, then grep for their own PASS/FAIL. (ShellCheck SC2318.)
    local log="$LOGDIR/$name.log"
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
    # HARD DEADLINE. An unattended installer can block forever on an interactive
    # prompt — an apt debconf dialog once held a row for 5h19m at zero load, with
    # no error, no timeout and no CPU to notice. A row that stops making progress
    # must fail, not hang, or the whole matrix is unusable unattended.
    # --kill-after gives vagrant a window to unwind after SIGTERM before SIGKILL.
    ( cd "$HERE" && timeout --kill-after=120 "$ROW_TIMEOUT" \
        "${vg[@]}" vagrant up --provider=libvirt ) >>"$log" 2>&1 || rc=$?

    # 124 = timeout fired (137 if it needed the KILL). Check FIRST: a timed-out
    # row may have written partial MATRIX_CHECK lines, and reporting those as a
    # real result would hide the hang.
    if [ "$rc" = 124 ] || [ "$rc" = 137 ]; then
        result=FAIL; detail="TIMED OUT after ${ROW_TIMEOUT} (no progress)"
    elif grep -q 'MATRIX_RESULT PASS' "$log"; then
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

    # Written to a file, not an array: with -j the row runs in a SUBSHELL, and a
    # `ROWS+=(...)` there would be discarded when it exits — the summary would
    # silently lose every parallel row.
    printf '%s|%s|%s|%s\n' "$name" "$tier" "$result" "$detail" > "$LOGDIR/$name.result"

    if [ "$result" = FAIL ] && [ "$KEEP" = 1 ]; then
        echo "  (--keep: VM left up. To poke at it:"
        echo "     cd $HERE && VIBETOP_BOX=$box VIBETOP_MATRIX_NAME=$name \\"
        echo "       VAGRANT_DOTFILE_PATH=$HERE/.vagrant-$name vagrant ssh)"
    else
        ( cd "$HERE" && "${vg[@]}" vagrant destroy -f ) >>"$log" 2>&1 || true
        # Fallback: after a timeout, vagrant may refuse to destroy ("kill any
        # ruby/vagrant processes") and leave the domain running with its disk
        # allocated. Reap it directly so a long matrix run can't strand VMs.
        # Machine is now named after the distro, so the domain is
        # <default_prefix><machine> = vibetop_matrix_<name>. The older
        # "<name>default" form is still reaped so a mixed-vintage host is clean.
        local dom="vibetop_matrix_${name}"
        if virsh -c qemu:///system dominfo "$dom" >/dev/null 2>&1 \
           || sudo -n virsh dominfo "$dom" >/dev/null 2>&1; then
            echo "  (forcing teardown of leftover domain $dom)"
            sudo -n virsh destroy "$dom" >/dev/null 2>&1 || true
            sudo -n virsh undefine "$dom" --remove-all-storage >/dev/null 2>&1 || true
        fi
        if sudo -n virsh dominfo "${dom}default" >/dev/null 2>&1; then
            sudo -n virsh destroy "${dom}default" >/dev/null 2>&1 || true
            sudo -n virsh undefine "${dom}default" --remove-all-storage >/dev/null 2>&1 || true
        fi
    fi
    return 0
}

SELECTED=()
while read -r name box tier; do
    [ -n "$name" ] || continue
    wanted "$name" "$tier" || continue
    SELECTED+=("$name|$box|$tier")
    rm -f "$LOGDIR/$name.result"
done <<< "$(printf '%s\n' "$DISTROS" | sed '/^[[:space:]]*$/d')"

if [ "$JOBS" -gt 1 ]; then
    echo "running ${#SELECTED[@]} rows, ${JOBS} at a time"
    echo "(each FULL row wants ~8GB RAM — size -j to the host, not the core count:"
    echo " swapping produces flaky failures, which is worse than running serially)"
fi
# vagrant-libvirt creates a SHARED management network ("vagrant-libvirt") on
# first use and removes it when the last machine goes away. Launching rows
# simultaneously makes each of them try to create it, and all but one lose:
#     Error occurred while creating new network: ... network 'vagrant-libvirt'
#     already exists with uuid ...
# The row dies before any MATRIX_CHECK, so it reports as a harness failure on a
# perfectly good distro. Let the FIRST row establish the network, then fan out.
first=1
for entry in "${SELECTED[@]}"; do
    IFS='|' read -r name box tier <<< "$entry"
    if [ "$JOBS" -le 1 ]; then
        run_one "$name" "$box" "$tier"
        continue
    fi
    while [ "$(jobs -rp | wc -l)" -ge "$JOBS" ]; do sleep 5; done
    run_one "$name" "$box" "$tier" &
    if [ "$first" = 1 ]; then
        first=0
        # Only the first launch needs to win the race; wait for the network to
        # exist (or for that row to finish) before releasing the others.
        for _ in $(seq 1 60); do
            virsh -c qemu:///system net-info vagrant-libvirt >/dev/null 2>&1 && break
            sudo -n virsh net-info vagrant-libvirt >/dev/null 2>&1 && break
            jobs -rp | grep -q . || break
            sleep 5
        done
    fi
done
wait

# Collect in the DISTROS order so the table reads the same however it was run.
for entry in "${SELECTED[@]}"; do
    IFS='|' read -r name _ tier <<< "$entry"
    if [ -r "$LOGDIR/$name.result" ]; then
        ROWS+=("$(cat "$LOGDIR/$name.result")")
        IFS='|' read -r _ rtier rres _ < "$LOGDIR/$name.result"
        [ "$rtier" = supported ] && [ "$rres" = FAIL ] && supported_failed=1
    else
        ROWS+=("$name|$tier|FAIL|no result file (row died before reporting)")
        [ "$tier" = supported ] && supported_failed=1
    fi
done

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

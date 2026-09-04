#!/usr/bin/env bash
# bootstrap.sh — one-line installer for Vibetop on a fresh Debian/Ubuntu or
# RHEL-family (Rocky/AlmaLinux/Fedora) host.
#
#   curl -fsSL https://raw.githubusercontent.com/nicejunjie/vibetop/main/bootstrap.sh | bash
#
# It installs git (if missing), clones — or updates — the repo into ~/vibetop,
# then runs ./deploy.sh (which self-installs every other dependency). This is
# the only step you can't do with the repo already in hand: it gets the repo
# onto the machine. Everything after is deploy.sh.
#
# Forward flags to deploy.sh after `-s --`, e.g. skip the heavy bits:
#   curl -fsSL <url>/bootstrap.sh | bash -s -- --no-office --no-browser
#
# Env overrides:
#   VIBETOP_DIR    where to clone        (default: $HOME/vibetop)
#   VIBETOP_REPO   git URL to clone from (default: the public GitHub repo)
#   VIBETOP_REF    branch / tag / commit (default: main)
set -euo pipefail

REPO="${VIBETOP_REPO:-https://github.com/nicejunjie/vibetop.git}"
REF="${VIBETOP_REF:-main}"
DIR="${VIBETOP_DIR:-$HOME/vibetop}"

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# --- Preconditions ----------------------------------------------------------
# Root is fine — vibetop installs like ordinary server software (root-owned code
# under /opt/vibetop, a no-login `vibetop` service account) and needs no username.
# People arrive afterwards by logging in with their own Linux accounts.
IS_ROOT=0; [ "$(id -u)" -eq 0 ] && IS_ROOT=1
# as_root — run a command with privilege, whichever way we have it.
as_root() { if [ "$IS_ROOT" = 1 ]; then "$@"; else sudo "$@"; fi; }
if [ "$IS_ROOT" = 1 ]; then
    # Never clone into /root: deploy.sh stages the checkout into /opt/vibetop/app
    # anyway, so land the source somewhere FHS-appropriate in the meantime.
    DIR="${VIBETOP_DIR:-/usr/local/src/vibetop}"
else
    command -v sudo >/dev/null 2>&1 || die "sudo is required but not installed."
fi

[ -r /etc/os-release ] || die "No /etc/os-release — cannot identify this distro."
. /etc/os-release
# Supported families, each proven green by the full-stack matrix (tests/matrix):
#   debian  -> Ubuntu 22.04/24.04, Debian 12
#   rhel    -> Rocky 9, AlmaLinux 9, Fedora 43
case " ${ID:-} ${ID_LIKE:-} " in
    *" debian "*|*" ubuntu "*|*" rhel "*|*" fedora "*|*" centos "*) ;;
    *) case "${ID:-}" in
           debian|ubuntu|fedora|rocky|almalinux|centos|rhel) ;;
           *) die "Unsupported distro: ${PRETTY_NAME:-unknown}.
       Vibetop installs on Debian/Ubuntu and RHEL-family (Rocky/Alma/Fedora).
       You can still install manually — see the README.";;
       esac ;;
esac

# Prime sudo once up front so the long deploy isn't interrupted by a prompt.
if [ "$IS_ROOT" = 0 ]; then
    say "checking sudo access (you may be prompted for your password)"
    sudo -v || die "sudo access is required."
fi

# --- git: needed to fetch the repo before deploy.sh exists ------------------
if ! command -v git >/dev/null 2>&1; then
    say "installing git"
    if command -v apt-get >/dev/null 2>&1; then
        as_root env DEBIAN_FRONTEND=noninteractive apt-get update -qq
        as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git ca-certificates
    elif command -v dnf >/dev/null 2>&1; then
        # git is NOT in the RHEL/Fedora cloud base images, and the in-app
        # Updater needs it, so this is not optional there.
        as_root dnf install -y git ca-certificates >/dev/null
    else
        die "no supported package manager (apt-get/dnf) found."
    fi
fi

# --- Clone, or update an existing checkout (idempotent / re-runnable) --------
if [ -d "$DIR/.git" ]; then
    say "updating existing checkout at $DIR"
    git -C "$DIR" fetch --tags --force origin "$REF"
    git -C "$DIR" checkout -q "$REF" 2>/dev/null || true
    git -C "$DIR" reset --hard -q FETCH_HEAD
elif [ -e "$DIR" ]; then
    die "$DIR exists but isn't a Vibetop checkout. Move it aside, or set VIBETOP_DIR=<path>."
else
    say "cloning $REPO -> $DIR"
    # The parent may not exist (e.g. /usr/local/src on a minimal image).
    mkdir -p "$(dirname "$DIR")" 2>/dev/null || as_root mkdir -p "$(dirname "$DIR")"
    # A full clone (not --depth) so the in-app Update app can `git log`/`pull`.
    git clone --branch "$REF" "$REPO" "$DIR"
fi

# The repo is owned by you (not root), so git won't trip its dubious-ownership
# guard during the in-app self-update.
git config --global --add safe.directory "$DIR" 2>/dev/null || true

# --- Hand off to the real installer -----------------------------------------
say "deploying the full stack — this installs all dependencies"
say "(heads up: pulls the ~2GB OnlyOffice image unless you passed --no-office)"
cd "$DIR"
exec ./deploy.sh "$@"

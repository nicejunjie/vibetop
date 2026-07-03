#!/usr/bin/env bash
# bootstrap.sh — one-line installer for Vibetop on a fresh Debian/Ubuntu host.
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
REPO_RAW="https://raw.githubusercontent.com/nicejunjie/vibetop/${REF}/bootstrap.sh"

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# --- Preconditions ----------------------------------------------------------
# Not root: the desktop runs as your user (terminals = your shell, Files = your
# ~), and landing/install.sh refuses root (or re-execs as your $SUDO_USER).
if [ "$(id -u)" -eq 0 ]; then
    die "Run this as a normal user with sudo, not as root.
       The Vibetop desktop runs as your user — its Terminal is your shell and
       Files is your home directory — so it can't be installed as root.
       On a root-only cloud box, create a user first, then re-run as them:
           adduser bob && usermod -aG sudo bob && su - bob
           curl -fsSL $REPO_RAW | bash"
fi

command -v sudo >/dev/null 2>&1 || die "sudo is required but not installed."

[ -r /etc/os-release ] || die "No /etc/os-release — Vibetop targets Debian/Ubuntu."
. /etc/os-release
case " ${ID:-} ${ID_LIKE:-} " in
    *" debian "*|*" ubuntu "*) ;;
    *) die "Vibetop installs are scoped to Debian/Ubuntu (found: ${PRETTY_NAME:-unknown}).
       You can still install manually — see the README.";;
esac

# Prime sudo once up front so the long deploy isn't interrupted by a prompt.
say "checking sudo access (you may be prompted for your password)"
sudo -v || die "sudo access is required."

# --- git: needed to fetch the repo before deploy.sh exists ------------------
if ! command -v git >/dev/null 2>&1; then
    say "installing git"
    sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git ca-certificates
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

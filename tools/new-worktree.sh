#!/usr/bin/env bash
# Start a task in its own checkout. The shared home checkout is never staged.
set -euo pipefail
name="${1:?usage: tools/new-worktree.sh NAME [PATH]}"
[[ "$name" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]*$ ]] || {
  echo "name must contain only letters, digits, _ or -" >&2; exit 2;
}
root="$(git rev-parse --show-toplevel)"
dest="${2:-$(dirname "$root")/vibetop-$name}"
git -C "$root" fetch origin main
git -C "$root" worktree add -b "work/$name" "$dest" origin/main
printf 'Worktree ready: %s\n' "$dest"

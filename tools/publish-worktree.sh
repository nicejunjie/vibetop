#!/usr/bin/env bash
# Push one reviewed commit series from an isolated worktree to main.
set -euo pipefail
git_dir="$(cd "$(git rev-parse --git-dir)" && pwd -P)"
common_dir="$(cd "$(git rev-parse --git-common-dir)" && pwd -P)"
if [ "$git_dir" = "$common_dir" ]; then
  echo "publish from an isolated worktree (tools/new-worktree.sh), not the shared checkout" >&2
  exit 2
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "worktree has staged, unstaged or untracked files" >&2
  exit 2
fi
git fetch origin main
if ! git merge-base --is-ancestor origin/main HEAD; then
  echo "origin/main moved; rebase and choose a fresh release number before pushing" >&2
  exit 1
fi
git push origin HEAD:main

# Bring the shared home checkout along. Releases are committed in worktrees, so
# nothing else ever moves home `main`; left alone it silently sits on an old
# release while later work is edited on top of it. Best effort: the push above
# already succeeded, so every refusal here is a warning, never a failure.
published="$(git rev-parse HEAD)"
home="$(dirname "$common_dir")"
[ "$(git -C "$home" rev-parse --git-dir 2>/dev/null)" = ".git" ] || exit 0
if [ "$(git -C "$home" symbolic-ref --quiet --short HEAD 2>/dev/null)" != main ]; then
  echo "note: $home is not on main; left as is" >&2
  exit 0
fi
if ! git -C "$home" merge-base --is-ancestor HEAD "$published"; then
  echo "note: $home main has commits that are not on origin/main; left as is" >&2
  exit 0
fi
# An edit in home that is byte-identical to what was just published is the
# copy a release was made from: dropping it loses nothing and lets the
# fast-forward through. Anything that differs is real work and is kept.
while IFS= read -r -d '' path; do
  if [ -f "$home/$path" ] && git -C "$home" cat-file -e "$published:$path" 2>/dev/null &&
     [ "$(git -C "$home" hash-object -- "$path")" = "$(git -C "$home" rev-parse "$published:$path")" ]; then
    git -C "$home" checkout --quiet HEAD -- "$path"
  fi
done < <(git -C "$home" diff --name-only -z HEAD)
if git -C "$home" merge --quiet --ff-only "$published"; then
  echo "home checkout $home fast-forwarded to $(git -C "$home" log --oneline -1)"
else
  echo "note: could not fast-forward $home (uncommitted edits overlap the release); update it by hand" >&2
fi

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

#!/usr/bin/env python3
"""Restart after an in-app update and restore the prior release if it cannot start.

Runs in a transient systemd unit, outside the manager being restarted. The
manager has already deployed the new files and returned its HTTP response.
"""
import os
import json
import pwd
import re
import subprocess
import sys
import tempfile
import time
import urllib.request


def run(argv, **kw):
    return subprocess.run(argv, check=True, timeout=180, **kw)


def healthy(port):
    for _ in range(15):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/ping", timeout=2) as r:
                if r.status == 200:
                    return True
        except (OSError, TimeoutError):
            pass
        time.sleep(2)
    return False


def restore(repo, user, before, changed):
    git = ["sudo", "-n", "-u", user, "-H", "git", "-C", repo]
    head = run(git + ["rev-parse", "HEAD"], capture_output=True,
               text=True).stdout.strip()
    if head != changed:
        raise RuntimeError("checkout moved again; refusing to overwrite it")
    dirty = run(git + ["status", "--porcelain",
                 "--untracked-files=no"], capture_output=True, text=True).stdout
    if dirty.strip():
        raise RuntimeError("checkout has new local edits; refusing to overwrite them")
    names = run(git + ["diff", "--name-only", before + ".." + changed],
                capture_output=True, text=True).stdout.splitlines()
    run(git + ["reset", "--hard", before])
    touched = lambda prefix: any(n.startswith(prefix) for n in names)
    env = dict(os.environ, APP_USER=user, INSTALL_DEPS="0", INSTALL_SYSTEMD="0")
    if any(touched(d) for d in ("shell/", "shared/", "apps/")):
        run(["sudo", "-n", "-u", user, "-H", os.path.join(repo, "shell/install.sh")])
    if touched("apps/everyday/browser/"):
        run([os.path.join(repo, "apps/everyday/browser/install.sh")], cwd=repo, env=env)
    if touched("server/") or touched("apps/everyday/terminal/"):
        run([os.path.join(repo, "server/install.sh")], cwd=repo, env=env)
    if touched("apps/everyday/office/"):
        run([os.path.join(repo, "apps/everyday/office/install.sh")], cwd=repo,
            env={**env, "INSTALL_CONTAINER": "0"})
    if touched("apps/everyday/files/"):
        run([os.path.join(repo, "apps/everyday/files/install.sh")], cwd=repo, env=env)
    if touched("apps/utilities/claude-usage/"):
        run([os.path.join(repo, "apps/utilities/claude-usage/install.sh")],
            cwd=repo, env=env)


def record_rollback(user, before, after):
    """Make a post-response rollback visible in the Update app's history."""
    home = pwd.getpwnam(user).pw_dir
    path = os.path.join(home, ".local/share/vibetop-update-history.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    try:
        with open(path) as f:
            entries = json.load(f)
        if not isinstance(entries, list):
            entries = []
    except (OSError, ValueError):
        entries = []
    entries.append({"time": int(time.time()), "event": "failed",
                    "message": f"manager restart failed; rolled back {after[:7]} to {before[:7]}"})
    fd, tmp = tempfile.mkstemp(prefix=".update-history-", dir=os.path.dirname(path))
    try:
        with os.fdopen(fd, "w") as f:
            os.fchmod(f.fileno(), 0o600)
            json.dump(entries[-200:], f)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def main():
    if len(sys.argv) != 6 or os.geteuid() != 0:
        raise SystemExit("usage: update-watchdog.py REPO APP_USER BEFORE AFTER PORT (as root)")
    repo, user, before, after, port_text = sys.argv[1:]
    if (not os.path.isabs(repo) or not re.fullmatch(r"[0-9a-f]{40}", before)
            or not re.fullmatch(r"[0-9a-f]{40}", after)
            or not port_text.isdecimal() or not 1 <= int(port_text) <= 65535):
        raise SystemExit("invalid update arguments")
    port = int(port_text)
    try:
        run(["systemctl", "restart", "vibetop-manager.service"])
        if healthy(port):
            print("update watchdog: manager healthy at", after, flush=True)
            return 0
    except (OSError, subprocess.SubprocessError) as e:
        print("update watchdog: restart failed:", e, flush=True)
    print("update watchdog: manager unhealthy; restoring", before, flush=True)
    try:
        restore(repo, user, before, after)
    except Exception:
        # A redeploy can fail independently of the code. Even then, starting
        # the old manager is better than leaving the API stopped.
        try:
            run(["systemctl", "restart", "vibetop-manager.service"])
        except (OSError, subprocess.SubprocessError):
            pass
        raise
    try:
        record_rollback(user, before, after)
    except (OSError, ValueError) as e:
        print("update watchdog: could not record rollback:", e, flush=True)
    run(["systemctl", "restart", "vibetop-manager.service"])
    if not healthy(port):
        raise RuntimeError("previous manager also failed health check")
    print("update watchdog: previous release restored", flush=True)
    return 1


if __name__ == "__main__":
    sys.exit(main())

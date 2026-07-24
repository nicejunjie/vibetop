#!/usr/bin/env python3
"""Mint a valid `vt_session` cookie for a user — the e2e test harness's way past
the PAM/Access login without a human.

It reuses the manager's OWN `_sign_session` (imported from terminal-manager.py) so
the token always matches the running server byte-for-byte, even if the signing
scheme changes. It reads the same session secret the manager uses
(`/etc/vibetop/session.secret`, overridable with VIBETOP_SESSION_SECRET_FILE), so
it MUST run somewhere that can read that secret — i.e. on the target host/container
(the e2e Docker image runs it via `docker exec`).

Usage:
    tools/mint-session-cookie.py [USER] [--ttl SECONDS] [--name-only|--value-only]

Output (default): the full Set-Cookie-style pair, e.g.  vt_session=<token>
  --value-only : just the token (no `vt_session=` prefix)
  --header     : a full `Cookie: vt_session=<token>` header line

Examples:
    tools/mint-session-cookie.py e2e
    VIBETOP_SESSION_SECRET_FILE=/tmp/secret tools/mint-session-cookie.py alice --value-only
"""
import argparse
import importlib.util
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_TERMINAL_DIR = os.path.join(os.path.dirname(_HERE), "terminal")


def _load_manager():
    # terminal-manager.py has a hyphen -> load by path. Its own dir must be on
    # sys.path so its `import system_status` (and siblings) resolve. Import is
    # side-effect-free (the server only starts under `if __name__ == '__main__'`).
    if _TERMINAL_DIR not in sys.path:
        sys.path.insert(0, _TERMINAL_DIR)
    path = os.path.join(_TERMINAL_DIR, "terminal-manager.py")
    spec = importlib.util.spec_from_file_location("terminal_manager", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    ap = argparse.ArgumentParser(description="Mint a vt_session cookie for e2e tests")
    ap.add_argument("user", nargs="?", default="e2e", help="username (default: e2e)")
    ap.add_argument("--ttl", type=int, default=None, help="token lifetime in seconds")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--value-only", action="store_true", help="print just the token")
    g.add_argument("--header", action="store_true", help="print a full Cookie: header line")
    args = ap.parse_args()

    mgr = _load_manager()
    # Allow the caller to point at a copied/mounted secret file (e.g. tests running
    # outside the container against a secret extracted from it).
    override = os.environ.get("VIBETOP_SESSION_SECRET_FILE")
    if override:
        mgr.SESSION_SECRET_FILE = override
        mgr._session_secret_cache = None

    ttl = args.ttl if args.ttl is not None else mgr.SESSION_TTL
    token = mgr._sign_session(args.user, ttl=ttl)

    if args.value_only:
        print(token)
    elif args.header:
        print(f"Cookie: {mgr.SESSION_COOKIE}={token}")
    else:
        print(f"{mgr.SESSION_COOKIE}={token}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""vibetop-fileagent — per-user file-operations daemon (Files-native, phase 1).

Runs AS the user (a `systemd-run` transient unit the manager starts on the
first /api/fs/* call — same launch pattern as vibetop-session). Unix
permissions are the ENTIRE authorization fence: this process can list/read
exactly what the user's own shell could, no more. The manager (root) only
ever proxies bytes between the authenticated HTTP request and this socket —
it performs no file operation itself. Design of record: docs/files-native.md.

Protocol: one JSON request per AF_UNIX connection, one JSON response, close
(the injector's short-connection shape). Requests/responses are single JSON
objects, UTF-8, request capped at 64KB.

Ops (phase 1 — read-only):
  {"op":"home"}                          -> {"ok":true, "home":"/home/u"}
  {"op":"list","path":"/abs/dir"}        -> {"ok":true, "path":..., "entries":[
        {"name","isDir","size","mtime","mode"} ...], "truncated":bool}
  {"op":"stat","path":"/abs/x"}          -> {"ok":true, "stat":{...entry, "path"}}
  {"op":"read","path":"/abs/f","max":N}  -> {"ok":true, "size":total,
        "truncated":bool, "binary":bool, "text":"..."}   (utf-8, replace)
Errors: {"ok":false, "error": str, "code": "enoent|eperm|eisdir|einval|..."}

The socket lives at the path given by --sock, owned by the user, mode 0600
(the root manager connects regardless; other users cannot). Exits after
IDLE_EXIT seconds without a request (systemd --collect reaps the unit), so
the idle-reaper story stays trivial.
"""
import errno
import json
import os
import socket
import stat as statmod
import sys
import time

IDLE_EXIT = int(os.environ.get("VIBETOP_FILEAGENT_IDLE", 900))
MAX_ENTRIES = 5000
MAX_READ = 1024 * 1024
MAX_REQ = 64 * 1024


def _errcode(e):
    return {
        errno.ENOENT: "enoent", errno.EACCES: "eperm", errno.EPERM: "eperm",
        errno.EISDIR: "eisdir", errno.ENOTDIR: "enotdir",
    }.get(getattr(e, "errno", None), "eio")


def _entry(name, st):
    return {
        "name": name,
        "isDir": statmod.S_ISDIR(st.st_mode),
        "size": st.st_size,
        "mtime": int(st.st_mtime),
        "mode": st.st_mode & 0o7777,
    }


def op_home(_req):
    return {"ok": True, "home": os.path.expanduser("~")}


def op_list(req):
    path = req.get("path") or ""
    if not path.startswith("/"):
        return {"ok": False, "error": "path must be absolute", "code": "einval"}
    entries = []
    truncated = False
    try:
        with os.scandir(path) as it:
            for de in it:
                if len(entries) >= MAX_ENTRIES:
                    truncated = True
                    break
                try:
                    st = de.stat(follow_symlinks=True)
                except OSError:
                    try:  # broken symlink etc — show it, with its own lstat
                        st = de.stat(follow_symlinks=False)
                    except OSError:
                        continue
                entries.append(_entry(de.name, st))
    except OSError as e:
        return {"ok": False, "error": str(e), "code": _errcode(e)}
    # Directories first, then case-insensitive natural-ish name order; the UI
    # re-sorts for other columns, but the default answer arrives ready to paint.
    entries.sort(key=lambda x: (not x["isDir"], x["name"].lower()))
    return {"ok": True, "path": path, "entries": entries, "truncated": truncated}


def op_stat(req):
    path = req.get("path") or ""
    if not path.startswith("/"):
        return {"ok": False, "error": "path must be absolute", "code": "einval"}
    try:
        st = os.stat(path)
    except OSError as e:
        return {"ok": False, "error": str(e), "code": _errcode(e)}
    out = _entry(os.path.basename(path.rstrip("/")) or "/", st)
    out["path"] = path
    return {"ok": True, "stat": out}


def op_read(req):
    path = req.get("path") or ""
    if not path.startswith("/"):
        return {"ok": False, "error": "path must be absolute", "code": "einval"}
    try:
        limit = min(int(req.get("max") or MAX_READ), MAX_READ)
    except (TypeError, ValueError):
        limit = MAX_READ
    try:
        size = os.path.getsize(path)
        with open(path, "rb") as f:
            data = f.read(limit + 1)
    except OSError as e:
        return {"ok": False, "error": str(e), "code": _errcode(e)}
    truncated = len(data) > limit
    data = data[:limit]
    binary = b"\x00" in data[:8192]
    return {"ok": True, "size": size, "truncated": truncated, "binary": binary,
            "text": "" if binary else data.decode("utf-8", "replace")}


OPS = {"home": op_home, "list": op_list, "stat": op_stat, "read": op_read}


def handle(conn):
    conn.settimeout(10)
    buf = bytearray()
    # Request ends at EOF (client half-closes) or a complete JSON line.
    while len(buf) <= MAX_REQ:
        try:
            chunk = conn.recv(65536)
        except socket.timeout:
            break
        if not chunk:
            break
        buf.extend(chunk)
        if b"\n" in chunk:
            break
    try:
        req = json.loads(bytes(buf).decode("utf-8", "replace"))
        fn = OPS.get(req.get("op"))
        resp = fn(req) if fn else {"ok": False, "error": "unknown op", "code": "einval"}
    except Exception as e:  # never die on a bad request
        resp = {"ok": False, "error": str(e), "code": "einval"}
    try:
        conn.sendall(json.dumps(resp).encode("utf-8"))
    except OSError:
        pass


def main():
    sock_path = None
    args = sys.argv[1:]
    if "--sock" in args:
        sock_path = args[args.index("--sock") + 1]
    if not sock_path:
        print("usage: fileagent.py --sock <path>", file=sys.stderr)
        return 2
    try:
        os.unlink(sock_path)
    except FileNotFoundError:
        pass
    srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    srv.bind(sock_path)
    os.chmod(sock_path, 0o600)      # owner (the user) + root only
    srv.listen(16)
    srv.settimeout(5)
    last = time.monotonic()
    try:
        while True:
            try:
                conn, _ = srv.accept()
            except socket.timeout:
                if time.monotonic() - last > IDLE_EXIT:
                    break           # idle — exit; the manager respawns on demand
                continue
            last = time.monotonic()
            with conn:
                handle(conn)
    finally:
        try:
            os.unlink(sock_path)
        except OSError:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())

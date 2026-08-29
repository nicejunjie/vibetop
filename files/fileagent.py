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

Ops (phase 2 — mutations; the request is JSON like above):
  {"op":"mkdir","path":"/abs/new"}       -> {"ok":true}
  {"op":"rename","path":"/abs/x","to":"newname"}       (same-directory)
  {"op":"move","src":["/abs/a",...],"dst":"/abs/dir"}  -> per-item results
  {"op":"copy","src":[...],"dst":"/abs/dir"}           -> per-item results
        (move/copy auto-suffix " (2)" on a name collision, macOS-style)
  {"op":"delete","paths":["/abs/a",...]}               -> per-item results
        (recursive; refuses "/" and the home root itself)

Streaming ops (a JSON HEADER LINE, then raw bytes on the same connection):
  upload:   client sends {"op":"upload","path":"/abs/dst","size":N}\n followed
            by exactly N raw bytes; agent writes to a same-directory temp file
            and renames into place on completion, then answers one JSON.
  download: client sends {"op":"download","path":"/abs/f"}\n; agent answers
            one JSON header line ({"ok":true,"size":N,"name":...}\n) followed
            by the raw bytes (nothing after a not-ok header).
  zip:      {"op":"zip","paths":[...]} -> same shape as download; the zip is
            built with `zip -r -` when available, else python zipfile, streamed.

Errors: {"ok":false, "error": str, "code": "enoent|eperm|eisdir|eexist|einval|..."}

The socket lives at the path given by --sock, owned by the user, mode 0600
(the root manager connects regardless; other users cannot). Exits after
IDLE_EXIT seconds without a request (systemd --collect reaps the unit), so
the idle-reaper story stays trivial.
"""
import errno
import json
import os
import shutil
import socket
import stat as statmod
import subprocess
import sys
import tempfile
import time
import zipfile

IDLE_EXIT = int(os.environ.get("VIBETOP_FILEAGENT_IDLE", 900))
MAX_ENTRIES = 5000
MAX_READ = 1024 * 1024
MAX_REQ = 256 * 1024
MAX_UPLOAD = int(os.environ.get("VIBETOP_FILEAGENT_MAXUP", 4 * 1024 * 1024 * 1024))


def _umask():
    """Read the process umask without permanently changing it."""
    m = os.umask(0o022)
    os.umask(m)
    return m


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


# ---- phase 2: mutations -----------------------------------------------------

def _abs_or_err(path):
    if not path or not path.startswith("/"):
        return None, {"ok": False, "error": "path must be absolute", "code": "einval"}
    return path, None


def _collide_free(dst):
    """macOS-style ' (2)' suffixing when the destination name is taken."""
    if not os.path.lexists(dst):
        return dst
    d, base = os.path.split(dst)
    stem, ext = os.path.splitext(base)
    if os.path.isdir(dst):
        stem, ext = base, ""
    n = 2
    while True:
        cand = os.path.join(d, f"{stem} ({n}){ext}")
        if not os.path.lexists(cand):
            return cand
        n += 1


def op_mkdir(req):
    path, err = _abs_or_err(req.get("path"))
    if err:
        return err
    try:
        os.makedirs(path, exist_ok=False)
    except OSError as e:
        return {"ok": False, "error": str(e),
                "code": "eexist" if getattr(e, "errno", None) == errno.EEXIST else _errcode(e)}
    return {"ok": True}


def op_rename(req):
    path, err = _abs_or_err(req.get("path"))
    if err:
        return err
    to = req.get("to") or ""
    if not to or "/" in to or to in (".", ".."):
        return {"ok": False, "error": "invalid new name", "code": "einval"}
    dst = os.path.join(os.path.dirname(path.rstrip("/")), to)
    if os.path.lexists(dst):
        return {"ok": False, "error": "name already exists", "code": "eexist"}
    try:
        os.rename(path, dst)
    except OSError as e:
        return {"ok": False, "error": str(e), "code": _errcode(e)}
    return {"ok": True, "path": dst}


def _bulk(req, one):
    """Run `one(src)` per item; report per-item results, ok iff all succeeded."""
    srcs = req.get("src") or req.get("paths") or []
    if not isinstance(srcs, list) or not srcs:
        return {"ok": False, "error": "no items", "code": "einval"}
    results, all_ok = [], True
    for s in srcs[:500]:
        p, err = _abs_or_err(s)
        if err:
            results.append({"path": s, "ok": False, "code": "einval"})
            all_ok = False
            continue
        r = one(p)
        results.append(r)
        all_ok = all_ok and r.get("ok", False)
    return {"ok": all_ok, "results": results}


def op_move(req):
    dst, err = _abs_or_err(req.get("dst"))
    if err:
        return err

    def one(p):
        target = _collide_free(os.path.join(dst, os.path.basename(p.rstrip("/"))))
        try:
            shutil.move(p, target)
            return {"path": p, "ok": True, "to": target}
        except (OSError, shutil.Error) as e:
            return {"path": p, "ok": False, "error": str(e), "code": _errcode(e)}
    return _bulk(req, one)


def op_copy(req):
    dst, err = _abs_or_err(req.get("dst"))
    if err:
        return err

    def one(p):
        target = _collide_free(os.path.join(dst, os.path.basename(p.rstrip("/"))))
        try:
            if os.path.isdir(p) and not os.path.islink(p):
                shutil.copytree(p, target, symlinks=True)
            else:
                shutil.copy2(p, target, follow_symlinks=False)
            return {"path": p, "ok": True, "to": target}
        except (OSError, shutil.Error) as e:
            return {"path": p, "ok": False, "error": str(e), "code": _errcode(e)}
    return _bulk(req, one)


def op_delete(req):
    home = os.path.realpath(os.path.expanduser("~"))

    def one(p):
        # A shell could rm -rf anything the user owns, but a UI mis-click must
        # not vaporize "/" or the home root itself.
        rp = os.path.realpath(p)
        if rp in ("/", home):
            return {"path": p, "ok": False, "error": "refusing to delete this directory",
                    "code": "einval"}
        try:
            if os.path.isdir(p) and not os.path.islink(p):
                shutil.rmtree(p)
            else:
                os.unlink(p)
            return {"path": p, "ok": True}
        except OSError as e:
            return {"path": p, "ok": False, "error": str(e), "code": _errcode(e)}
    return _bulk(req, one)


SEARCH_MAX = 200
SEARCH_TIMEOUT = 10


def op_search(req):
    """Bounded search under a directory. mode "names" (default): case-
    insensitive filename substring via `find`. mode "content": line matches
    via `rg` when available (fast, .gitignore-aware, 2MB file cap), else
    `grep -rnI`. Both capped at SEARCH_MAX results / SEARCH_TIMEOUT seconds —
    a search must never hang the agent or ship an unbounded payload."""
    root, err = _abs_or_err(req.get("path"))
    if err:
        return err
    q = (req.get("q") or "").strip()
    if not q or len(q) > 256:
        return {"ok": False, "error": "query required", "code": "einval"}
    mode = req.get("mode") or "names"
    results, truncated = [], False
    try:
        if mode == "content":
            if shutil.which("rg"):
                cmd = ["rg", "-n", "-S", "--no-heading", "--max-filesize", "2M",
                       "--max-count", "5", "-g", "!.git", "--fixed-strings", q, root]
            else:
                cmd = ["grep", "-rnI", "--exclude-dir=.git", "-F", q, root]
            r = subprocess.run(cmd, capture_output=True, text=True,
                               timeout=SEARCH_TIMEOUT, errors="replace")
            for line in r.stdout.splitlines():
                if len(results) >= SEARCH_MAX:
                    truncated = True
                    break
                parts = line.split(":", 2)
                if len(parts) == 3 and parts[1].isdigit():
                    results.append({"path": parts[0], "line": int(parts[1]),
                                    "text": parts[2].strip()[:300]})
        else:
            r = subprocess.run(["find", root, "-iname", f"*{q}*",
                               "-not", "-path", "*/.git/*"],
                              capture_output=True, text=True,
                              timeout=SEARCH_TIMEOUT, errors="replace")
            for line in r.stdout.splitlines():
                if len(results) >= SEARCH_MAX:
                    truncated = True
                    break
                if line and line != root:
                    results.append({"path": line, "isDir": os.path.isdir(line)})
    except subprocess.TimeoutExpired:
        truncated = True
    except (OSError, subprocess.SubprocessError) as e:
        return {"ok": False, "error": str(e), "code": "eio"}
    return {"ok": True, "results": results, "truncated": truncated, "mode": mode}


HASH_ALGOS = {"md5", "sha1", "sha256", "sha512"}


def op_hash(req):
    """Checksums for the info dialog (parity with the classic app's rows).
    Streams the file — any size — but one algo per call keeps each request
    snappy and lets the UI fill rows lazily like the classic Show links."""
    import hashlib
    path, err = _abs_or_err(req.get("path"))
    if err:
        return err
    algo = req.get("algo") or "sha256"
    if algo not in HASH_ALGOS:
        return {"ok": False, "error": "unknown algo", "code": "einval"}
    h = hashlib.new(algo)
    try:
        with open(path, "rb") as f:
            while True:
                chunk = f.read(1 << 20)
                if not chunk:
                    break
                h.update(chunk)
    except OSError as e:
        return {"ok": False, "error": str(e), "code": _errcode(e)}
    return {"ok": True, "algo": algo, "hex": h.hexdigest()}


OPS = {"home": op_home, "list": op_list, "stat": op_stat, "read": op_read,
       "mkdir": op_mkdir, "rename": op_rename, "move": op_move,
       "copy": op_copy, "delete": op_delete, "search": op_search,
       "hash": op_hash}


# ---- phase 2: streaming (upload / download / zip) ---------------------------

def _send_json(conn, obj):
    try:
        conn.sendall((json.dumps(obj) + "\n").encode("utf-8"))
    except OSError:
        pass


def stream_upload(conn, req, rest):
    """`rest` = bytes already read past the header line. Write to a temp file
    in the destination directory (same filesystem -> atomic rename)."""
    path, err = _abs_or_err(req.get("path"))
    if err:
        return _send_json(conn, err)
    try:
        size = int(req.get("size"))
    except (TypeError, ValueError):
        return _send_json(conn, {"ok": False, "error": "size required", "code": "einval"})
    if size < 0 or size > MAX_UPLOAD:
        return _send_json(conn, {"ok": False, "error": "size out of range", "code": "einval"})
    # Editor saves send the mtime they loaded; a mismatch means the file
    # changed underneath (another device, a shell) -> refuse, let the UI offer
    # reload-or-overwrite instead of silently clobbering.
    if req.get("ifMtime") is not None:
        try:
            cur = int(os.stat(path).st_mtime)
        except FileNotFoundError:
            cur = None
        except OSError as e:
            return _send_json(conn, {"ok": False, "error": str(e), "code": _errcode(e)})
        if cur is not None and cur != int(req["ifMtime"]):
            return _send_json(conn, {"ok": False, "error": "file changed on disk",
                                     "code": "econflict", "mtime": cur})
    d = os.path.dirname(path)
    if req.get("mkdirs"):
        try:
            os.makedirs(d, exist_ok=True)     # folder upload: create the chain
        except OSError as e:
            return _send_json(conn, {"ok": False, "error": str(e), "code": _errcode(e)})
    tmp = None
    got = 0
    try:
        fd, tmp = tempfile.mkstemp(prefix=".vtup-", dir=d)
        with os.fdopen(fd, "wb") as f:
            if rest:
                chunk = rest[:size]
                f.write(chunk)
                got = len(chunk)
            conn.settimeout(30)
            while got < size:
                data = conn.recv(min(1 << 20, size - got))
                if not data:
                    break
                f.write(data)
                got += len(data)
        if got != size:
            os.unlink(tmp)
            return _send_json(conn, {"ok": False, "error": f"short upload ({got}/{size})",
                                     "code": "eio"})
        # Overwriting keeps the ORIGINAL file's mode. mkstemp creates 0600, and
        # os.replace carries the temp file's bits onto the destination — so
        # saving an existing 0755 script in the editor silently un-executed it
        # and dropped group/other access. New files get the umask default.
        try:
            os.chmod(tmp, statmod.S_IMODE(os.stat(path).st_mode))
        except OSError:
            os.chmod(tmp, 0o666 & ~_umask())
        os.replace(tmp, path)
        tmp = None
        return _send_json(conn, {"ok": True, "size": got})
    except OSError as e:
        if tmp:
            try:
                os.unlink(tmp)
            except OSError:
                pass
        return _send_json(conn, {"ok": False, "error": str(e), "code": _errcode(e)})


def stream_download(conn, req):
    path, err = _abs_or_err(req.get("path"))
    if err:
        return _send_json(conn, err)
    try:
        size = os.path.getsize(path)
        f = open(path, "rb")
    except OSError as e:
        return _send_json(conn, {"ok": False, "error": str(e), "code": _errcode(e)})
    with f:
        _send_json(conn, {"ok": True, "size": size, "name": os.path.basename(path)})
        try:
            while True:
                chunk = f.read(1 << 20)
                if not chunk:
                    break
                conn.sendall(chunk)
        except OSError:
            pass


def stream_zip(conn, req):
    paths = req.get("paths") or []
    if not isinstance(paths, list) or not paths:
        return _send_json(conn, {"ok": False, "error": "no items", "code": "einval"})
    for p in paths:
        if not p.startswith("/") or not os.path.lexists(p):
            return _send_json(conn, {"ok": False, "error": f"missing: {p}", "code": "enoent"})
    base = os.path.basename(paths[0].rstrip("/")) if len(paths) == 1 else "files"
    _send_json(conn, {"ok": True, "name": base + ".zip"})
    # Stream python-zipfile straight onto the socket (size unknown up front).
    sock_file = conn.makefile("wb")
    try:
        with zipfile.ZipFile(sock_file, "w", zipfile.ZIP_DEFLATED) as zf:
            for p in paths:
                root = os.path.dirname(p.rstrip("/"))
                if os.path.isdir(p):
                    for dirpath, _dirs, files in os.walk(p):
                        for fn in files:
                            full = os.path.join(dirpath, fn)
                            try:
                                zf.write(full, os.path.relpath(full, root))
                            except OSError:
                                pass       # unreadable entry: skip, keep the archive
                else:
                    try:
                        zf.write(p, os.path.relpath(p, root))
                    except OSError:
                        pass
        sock_file.flush()
    except (OSError, ValueError):
        pass
    finally:
        try:
            sock_file.close()
        except OSError:
            pass



def handle(conn):
    conn.settimeout(10)
    buf = bytearray()
    # Header ends at the first newline (streaming ops carry raw bytes after
    # it) or EOF (plain JSON ops, client half-closes).
    while len(buf) <= MAX_REQ:
        try:
            chunk = conn.recv(65536)
        except socket.timeout:
            break
        if not chunk:
            break
        buf.extend(chunk)
        if b"\n" in buf:
            break
    nl = buf.find(b"\n")
    header = bytes(buf if nl < 0 else buf[:nl])
    rest = b"" if nl < 0 else bytes(buf[nl + 1:])
    try:
        req = json.loads(header.decode("utf-8", "replace"))
        op = req.get("op")
        if op == "upload":
            return stream_upload(conn, req, rest)
        if op == "download":
            return stream_download(conn, req)
        if op == "zip":
            return stream_zip(conn, req)
        fn = OPS.get(op)
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

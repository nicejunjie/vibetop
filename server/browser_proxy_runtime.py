"""Root lifecycle and bounded control RPC for isolated Browser Lite processes.

Root owns configuration and ingress sockets. It never opens website state files.
Only authenticated UI commands may start a runtime; ingress checks never start it.
"""
import collections
import contextlib
import errno
import http.client
import json
import os
from pathlib import Path
import pwd
import re
import secrets
import socket
import stat
import struct
import subprocess
import threading
import time
from urllib.parse import urlsplit


def directory(path, uid, gid, mode):
    """Parent is root-owned. Validate existing children without repairing them."""
    try:
        os.mkdir(path, mode)
    except FileExistsError:
        pass
    else:
        os.chown(path, uid, gid, follow_symlinks=False)
        os.chmod(path, mode, follow_symlinks=False)
    st = os.lstat(path)
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != uid or stat.S_IMODE(st.st_mode) != mode:
        raise PermissionError("Invalid Browser Lite directory")


def root_write(path, value):
    path = Path(path)
    temporary = path.with_name("." + path.name + "." + secrets.token_hex(12))
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb", closefd=False) as stream:
            stream.write(value)
            stream.flush()
            os.fsync(fd)
        os.replace(temporary, path)
    finally:
        os.close(fd)
        with contextlib.suppress(FileNotFoundError):
            temporary.unlink()


class Runtime:
    def __init__(self, authority, *, code="/opt/vibetop/browser-proxy",
                 run="/run/vibetop-browser-proxy", profiles="/var/lib/vibetop/browser-proxy-profiles",
                 units="/run/systemd/system", guard_user="vibetop-browser-egress",
                 prefix="vibetop-browser-proxy", execute=subprocess.run, revision=None):
        self.auth = authority
        self.code, self.run, self.profiles, self.units = map(Path, (code, run, profiles, units))
        self.guard_user, self.prefix, self.execute = guard_user, prefix, execute
        self.revision = revision
        if revision is not None and (not re.fullmatch(r"[a-f0-9]{64}", revision)
                or not self.code.is_absolute() or not re.fullmatch(r"/[A-Za-z0-9_./-]+", str(self.code))):
            raise ValueError("Invalid Browser Lite release identity")
        self.locks = collections.defaultdict(threading.RLock)
        self.ready = {}
        self.slots = threading.BoundedSemaphore(32)
        self.user_slots = collections.defaultdict(lambda: threading.BoundedSemaphore(2))

    def names(self, uid):
        base = self.prefix + "-" + str(uid)
        return {kind: base + "-" + kind for kind in ("rewrite", "egress")}

    def _systemctl(self, *args):
        result = self.execute(["systemctl", *args], capture_output=True, timeout=30)
        if result.returncode:
            raise RuntimeError("Browser Lite service operation failed")

    def prepare(self, claims):
        uid = claims["uid"]
        record = self.auth.realm_config(uid)
        pw = pwd.getpwuid(uid)
        if pw.pw_name != record["user"] or uid == 0:
            raise PermissionError("Invalid Browser Lite Linux identity")
        directory(self.run, 0, 0, 0o711)
        directory(self.profiles, 0, 0, 0o711)
        child, profile = self.run / str(uid), self.profiles / str(uid)
        directory(child, 0, 0, 0o711)
        directory(child / "control", uid, pw.pw_gid, 0o700)
        directory(profile, uid, pw.pw_gid, 0o700)
        egress_secret = secrets.token_hex(32)
        rewrite = {**record, "parentOrigin": self.auth.ui_origin, "revision": self.revision, "codePath": str(self.code),
                   "trustedAncestors": sorted(self.auth.main_origins),
                   "ingressIdentity": {key: record[key] for key in ("uid", "profile", "epoch")},
                   "stateFile": str(profile / "realms.jsonl"), "cookieFile": str(profile / "cookies.json"),
                   "controlSocket": str(child / "control/control.sock"),
                   "egressSocket": str(child / "egress.sock"), "egressSecret": egress_secret}
        guard = {"socket": str(child / "egress.sock"), "inheritedSocket": True,
                 "secret": egress_secret, "deniedDomains": sorted({self.auth.domain, urlsplit(self.auth.ui_origin).hostname,
                                          *(urlsplit(origin).hostname for origin in self.auth.main_origins)})}
        # rewrite.json is the commit marker: a failed unit write/reload must
        # leave a mismatched marker so the next authenticated UI retries setup.
        root_write(child / "egress.json", json.dumps(guard).encode())
        for name, source in self.unit_files(uid, pw.pw_gid).items():
            root_write(self.units / name, source.encode())
        self._systemctl("daemon-reload")
        root_write(child / "rewrite.json", json.dumps(rewrite).encode())

    def unit_files(self, uid, gid):
        child, profile, names = self.run / str(uid), self.profiles / str(uid), self.names(uid)
        # /run and /var/lib become empty, with only this runtime/profile bound
        # back. PrivatePIDs also prevents a compromised rewriter signalling the
        # same user's live terminals. AF_INET is needed only for private loopback.
        common = """NoNewPrivileges=yes
PrivateTmp=yes
PrivateDevices=yes
PrivatePIDs=yes
ProtectProc=invisible
ProcSubset=pid
ProtectHome=tmpfs
ProtectSystem=strict
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
RestrictRealtime=yes
LockPersonality=yes
CapabilityBoundingSet=
AmbientCapabilities=
UMask=0077
MemoryMax=2G
TasksMax=256
CPUQuota=200%
TemporaryFileSystem=/run:ro /var/lib:ro
InaccessiblePaths=-/opt/vibetop/app -/root
Restart=no
TimeoutStopSec=10
"""
        result = {}
        for kind in ("rewrite", "egress"):
            unit = names[kind]
            socket_name = "ingress" if kind == "rewrite" else "egress"
            owner = "SocketUser=root\nSocketGroup=www-data\nSocketMode=0660" if kind == "rewrite" else f"SocketUser={uid}\nSocketMode=0600"
            result[unit + ".socket"] = f"[Unit]\nDescription=Browser Lite {kind} socket ({uid})\n[Socket]\nListenStream={child}/{socket_name}.sock\n{owner}\nRemoveOnStop=yes\nService={unit}.service\n"
            service_user = str(uid) if kind == "rewrite" else self.guard_user
            network = "PrivateNetwork=yes\nRestrictAddressFamilies=AF_UNIX AF_INET AF_INET6\n" if kind == "rewrite" else "RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK\n"
            binds = f"BindPaths={profile}\nBindPaths={child}/control\nBindReadOnlyPaths={child}/egress.sock\n" if kind == "rewrite" else "BindReadOnlyPaths=/etc/resolv.conf\n"
            executable_root = self.code if self.revision else Path("/opt/vibetop/browser-proxy")
            code_bind = str(self.code) if self.revision else f"{self.code}:/opt/vibetop/browser-proxy"
            result[unit + ".service"] = (
                f"[Unit]\nDescription=Browser Lite {kind} ({uid})\nRequires={unit}.socket\nAfter={unit}.socket\nStartLimitIntervalSec=60\nStartLimitBurst=5\n"
                + (f"Requires={names['egress']}.socket\nAfter={names['egress']}.socket\n" if kind == "rewrite" else "")
                + f"[Service]\nType=simple\nUser={service_user}\n"
                + (f"Group={gid}\n" if kind == "rewrite" else "")
                + f"LoadCredential=config.json:{child}/{kind}.json\n"
                # Sync cookies can pass Node's 16 KiB header default (nginx allows 4 x 32k).
                + f"ExecStart=/usr/bin/node {'--max-http-header-size=65536 ' if kind == 'rewrite' else ''}{executable_root}/{'runtime' if kind == 'rewrite' else 'egress'}.cjs %d/config.json\n"
                + f"BindReadOnlyPaths={code_bind}\n"
                + common + network + binds)
        return result

    def _validate(self, claims):
        # Recheck under lifecycle lock; the caller may have authenticated before
        # a concurrent logout-all. No stale request can resurrect an old epoch.
        with self.auth.lock:
            lease = self.auth._lease(claims["lease"])
            if any(claims[key] != lease[key] for key in ("uid", "profile", "epoch")):
                raise ValueError("Browser session revoked")

    def ensure(self, claims):
        uid = claims["uid"]
        with self.locks[uid]:
            self._validate(claims)
            cached = self.ready.get(uid)
            if cached == (claims["epoch"], self.revision):
                # This is a trusted UI open, never a subresource hot path. Start
                # is idempotent and also recovers a crashed/OOM-killed daemon.
                # A crash loop trips systemd's start limit and fails the socket
                # too; start alone is then refused until the failure is reset.
                names = self.names(uid)
                self.execute(["systemctl", "reset-failed", *(names[key] + suffix for key in ("egress", "rewrite")
                              for suffix in (".socket", ".service"))], capture_output=True, timeout=30)
                self._systemctl("start", names["egress"] + ".socket", names["rewrite"] + ".socket", names["rewrite"] + ".service")
                return
            names = self.names(uid)
            # Manager restart must adopt its existing root-owned configuration,
            # not rotate the egress password beneath a running rewrite process.
            path = self.run / str(uid) / "rewrite.json"
            existing = None
            try:
                fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
                try:
                    st = os.fstat(fd)
                    if not stat.S_ISREG(st.st_mode) or st.st_uid != 0 or st.st_mode & 0o077 or st.st_size > 8192:
                        raise PermissionError("Invalid browser runtime configuration")
                    with os.fdopen(fd, "rb", closefd=False) as stream:
                        existing = json.load(stream)
                finally:
                    os.close(fd)
            except FileNotFoundError:
                pass
            identity = {key: claims[key] for key in ("uid", "profile", "epoch")}
            if (not existing or existing.get("ingressIdentity") != identity
                    or existing.get("revision") != self.revision or existing.get("codePath") != str(self.code)):
                # Always close old activation listeners before replacing config.
                # A failed rollover must not leave a cached dead-socket route.
                self.ready.pop(uid, None)
                if existing:
                    self._systemctl("stop", *(name + ".socket" for name in names.values()))
                    self._systemctl("stop", *(name + ".service" for name in names.values()))
                self.prepare(claims)
            self._systemctl("start", names["egress"] + ".socket", names["rewrite"] + ".socket", names["rewrite"] + ".service")
            self.ready[uid] = (claims["epoch"], self.revision)

    def route(self, claims):
        uid = claims["uid"]
        with self.locks[uid]:
            self._validate(claims)
            if not self.ready.get(uid) or self.ready[uid][0] != claims["epoch"]:
                # Adopt an already-authorized listener after manager restart.
                # This performs no start, unit creation, or profile access.
                for parent in (self.run, self.run / str(uid)):
                    try:
                        st = os.lstat(parent)
                    except FileNotFoundError as error:
                        raise ValueError("Browser session is not running") from error
                    if not stat.S_ISDIR(st.st_mode) or st.st_uid != 0 or st.st_mode & 0o022:
                        raise ValueError("Invalid browser runtime directory")
                try:
                    listener = os.lstat(self.run / str(uid) / "ingress.sock")
                except FileNotFoundError as error:
                    raise ValueError("Browser session is not running") from error
                if not stat.S_ISSOCK(listener.st_mode) or listener.st_uid != 0 or stat.S_IMODE(listener.st_mode) != 0o660:
                    raise ValueError("Browser session is not running")
                fd = os.open(self.run / str(uid) / "rewrite.json", os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
                try:
                    st = os.fstat(fd)
                    if not stat.S_ISREG(st.st_mode) or st.st_uid != 0 or st.st_mode & 0o077 or st.st_size > 8192:
                        raise ValueError("Invalid browser runtime configuration")
                    with os.fdopen(fd, "rb", closefd=False) as stream:
                        existing = json.load(stream)
                finally:
                    os.close(fd)
                if existing.get("ingressIdentity") != {key: claims[key] for key in ("uid", "profile", "epoch")}:
                    raise ValueError("Browser runtime identity changed")
                # Keep an old authorized listener working until a UI heartbeat
                # performs the release rollover under this user's lifecycle lock.
                self.ready[uid] = (claims["epoch"], existing.get("revision"))
            return str(self.run / str(uid) / "ingress.sock")

    def revoke(self, uid, revoke_main=lambda: None):
        with self.locks[uid]:
            revoke_main()
            self.auth.revoke_user(uid)
            self.ready.pop(uid, None)
            names = self.names(uid)
            # Stop both listeners first, so no queued connection can activate a
            # service again while logout is stopping its process.
            self._systemctl("stop", *(name + ".socket" for name in names.values()))
            self._systemctl("stop", *(name + ".service" for name in names.values()))

    def call(self, claims, command, body):
        if command not in ("open", "approve", "close", "heartbeat", "logins", "tabs") or not isinstance(body, dict):
            raise ValueError("Invalid browser control")
        uid = claims["uid"]
        slot = self.user_slots[uid]
        if not slot.acquire(blocking=False):
            raise RuntimeError("Browser control is busy")
        if not self.slots.acquire(blocking=False):
            slot.release()
            raise RuntimeError("Browser control is busy")
        try:
            with self.locks[uid]:
                self._validate(claims)
                if command == "open" or (command in ("heartbeat", "tabs") and self.ready.get(uid) != (claims["epoch"], self.revision)):
                    self.ensure(claims)
                authorization = {key: claims[key] for key in ("uid", "profile", "epoch", "lease")}
                authorization["relay"] = self.auth.mint("relay", claims["lease"], 7 * 86400)
                with self.auth.lock:
                    authorization["expires"] = self.auth._lease(claims["lease"])["exp"]
                data = json.dumps({**body, "authorization": authorization}, separators=(",", ":")).encode()
                status, result = self._exchange(uid, command, data)
                if status == 200 and "entry" in result:
                    permit = self.auth.entry_permit(result["entry"], claims["lease"])
                    result["entry"] += "&permit=" + permit
                return status, result
        finally:
            self.slots.release()
            slot.release()

    def revoke_device(self, token, *, expires=None):
        revoked = self.auth.revoke_session(token, expires=expires)
        for claims in revoked:
            uid = claims["uid"]
            with self.locks[uid]:
                # Try even before manager adoption; never start on logout.
                authorization = {key: claims[key] for key in ("uid", "profile", "epoch", "lease")}
                authorization.update(relay="revoked.revoked", expires=claims["exp"])
                try:
                    status, _ = self._exchange(uid, "revoke-lease", json.dumps({"authorization": authorization}).encode())
                    if status != 200:
                        raise RuntimeError("Browser lease revocation failed")
                except (OSError, ValueError, RuntimeError, http.client.HTTPException):
                    # If the daemon cannot acknowledge closing long-lived
                    # streams, close ingress and stop it. Other devices retain
                    # their valid leases and can reconnect to the saved profile.
                    self.ready.pop(uid, None)
                    names = self.names(uid)
                    self._systemctl("stop", *(name + ".socket" for name in names.values()))
                    self._systemctl("stop", *(name + ".service" for name in names.values()))

    def _exchange(self, uid, command, data):
        # "open" may carry the full Browser's cookies for one site (login sync).
        if len(data) > (160 * 1024 if command in ("open", "logins") else 96 * 1024 if command == "tabs"
                        else 20 * 1024 if command == "shortcuts" else 8192):
            raise ValueError("Browser control too large")
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
            sock.settimeout(20)
            deadline = time.monotonic() + 5
            while True:
                try:
                    sock.connect(str(self.run / str(uid) / "control/control.sock"))
                    break
                except OSError as error:
                    if command not in ("open", "heartbeat", "tabs") or error.errno not in (errno.ENOENT, errno.ECONNREFUSED) or time.monotonic() >= deadline:
                        raise
                    time.sleep(.05)
            peer = struct.unpack("3i", sock.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize("3i")))
            if peer[1] != uid:
                raise PermissionError("Browser control identity mismatch")
            def interrupt():
                with contextlib.suppress(OSError):
                    sock.shutdown(socket.SHUT_RDWR)
            timer = threading.Timer(20, interrupt)
            timer.daemon = True
            timer.start()
            try:
                sock.sendall((f"POST /{command} HTTP/1.1\r\nHost: control\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: {len(data)}\r\n\r\n").encode() + data)
                response = http.client.HTTPResponse(sock)
                response.begin()
                limit = 128 * 1024 if command == "tabs" else 65536
                raw = response.read(limit + 1)
                if len(raw) > limit or response.status not in (200, 409):
                    raise ValueError("Invalid browser control response")
                result = json.loads(raw)
                if not isinstance(result, dict):
                    raise ValueError("Invalid browser control response")
                return response.status, result
            finally:
                timer.cancel()

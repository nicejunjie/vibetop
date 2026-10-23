"""HTTPS UI handoff and nginx auth boundary for the Browser Lite rewriter."""
import collections
import errno
import http.client
import html
import hashlib
import json
import logging
import os
import re
import stat
import subprocess
import threading
import time
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from browser_proxy_auth import unique_cookie


UI_COOKIE = "__Host-vt_bl_ui"
_bridge = None
_lock = threading.Lock()
_failure_lock = threading.Lock()
_failure_until = 0.0


def configured(main_epoch):
    global _failure_until
    with _failure_lock:
        if time.monotonic() < _failure_until:
            raise RuntimeError("Browser Lite installation is unavailable")
        try:
            return _load_configured(main_epoch)
        except Exception as error:
            _failure_until = time.monotonic() + 60
            raise RuntimeError("Browser Lite installation is unavailable") from error


def _load_configured(main_epoch):
    """Optional installation, loaded only from a root-owned configuration."""
    global _bridge
    with _lock:
        if _bridge is not None:
            return _bridge
        path = os.environ.get("VIBETOP_BROWSER_PROXY_CONFIG", "/etc/vibetop/browser-proxy.json")
        try:
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        except FileNotFoundError:
            return None
        try:
            st = os.fstat(fd)
            if not stat.S_ISREG(st.st_mode) or st.st_uid != 0 or st.st_mode & 0o022 or st.st_size > 8192:
                raise PermissionError("Invalid Browser Lite installation configuration")
            with os.fdopen(fd, "rb", closefd=False) as stream:
                config_bytes = stream.read()
                config = json.loads(config_bytes)
        finally:
            os.close(fd)
        if config.get("enabled", True) is False:
            return None
        from browser_proxy_auth import BrowserAuthority
        from browser_proxy_store import IdentityStore
        from browser_proxy_runtime import Runtime
        from browser_proxy_release import validate, validate_ancestors
        code = Path(config["releasePath"])
        revision = config["revision"]
        if (not isinstance(revision, str) or not re.fullmatch(r"[a-f0-9]{64}", revision)
                or code != Path("/opt/vibetop-browser-proxy/releases") / revision
                or code.resolve(strict=True) != code):
            raise ValueError("Invalid Browser Lite installed release path")
        validate_ancestors(code)
        manifest = validate(code, node_version=subprocess.check_output(
            ["/usr/bin/node", "--version"], text=True, timeout=10).strip())
        if manifest["revision"] != revision:
            raise ValueError("Browser Lite configured revision does not match its release")
        store = IdentityStore("/var/lib/vibetop/browser-proxy")
        try:
            authority = BrowserAuthority(store.master, config["domain"], config["uiOrigin"],
                                         config["mainOrigins"], state=store.state, save=store.save, main_epoch=main_epoch)
            bridge = Bridge(authority, Runtime(authority, code=code, revision=revision))
            bridge.store = store
            bridge.config_digest = hashlib.sha256(config_bytes).hexdigest()
        except BaseException:
            store.close()
            raise
        _bridge = bridge
        return bridge


class Bridge:
    def __init__(self, authority, runtime):
        self.auth, self.runtime = authority, runtime
        self.asset_cache = collections.OrderedDict()
        self.asset_lock = threading.Lock()

    def asset(self, filename, revision=None):
        """Serve one internally consistent UI version across manager upgrades."""
        current = getattr(self.runtime, "revision", None)
        if revision is None or revision == current:
            return (self.runtime.code / filename).read_bytes()
        if not re.fullmatch(r"[a-f0-9]{64}", revision):
            raise FileNotFoundError("Unknown browser UI release")
        with self.asset_lock:
            if revision not in self.asset_cache:
                from browser_proxy_release import validate
                directory = self.runtime.code.parent / revision
                manifest = validate(directory)
                if manifest["revision"] != revision:
                    raise ValueError("Browser UI release identity mismatch")
                self.asset_cache[revision] = {name: (directory / name).read_bytes() for name in
                    ("wrapper.css", "wrapper.js", "ui-session.js", "trusted-controller.js")}
                while len(self.asset_cache) > 4:
                    self.asset_cache.popitem(last=False)
            self.asset_cache.move_to_end(revision)
            return self.asset_cache[revision][filename]

    def bootstrap(self, uid, user, token, claims, origin):
        ticket = self.auth.begin(uid, user, token, claims["exp"], origin, expected_epoch=claims.get("e", 0))
        return {"ticket": ticket, "origin": self.auth.ui_origin,
                "action": self.auth.ui_origin + "/__vt/bootstrap"}

    def cookies(self, lease_id):
        ui = self.auth.mint("ui", lease_id, 7 * 86400)
        content = self.auth.mint("content", lease_id, 7 * 86400)
        claims = self.auth.verify(ui, "ui")
        ttl = max(0, int(claims["exp"] - self.auth.now()))
        # Every realm host shares this registrable domain's cookie cap with the
        # sites' own sync cookies. Priority=High keeps these when Chromium evicts.
        return [("Set-Cookie", f"{UI_COOKIE}={ui}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age={ttl}; Priority=High"),
                ("Set-Cookie", f"__Secure-vt_browser_{claims['profile']}={content}; Domain={self.auth.domain}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age={ttl}; Priority=High")]

    def ingress(self, headers):
        if headers.get("X-Forwarded-Proto") != "https":
            raise ValueError("Browser Lite requires HTTPS")
        host = headers.get("Host", "")
        uid = self.auth.host_uid(host)
        uri = headers.get("X-Original-URI", "")
        if not uri.startswith("/") or uri.startswith("//") or len(uri) > 16384:
            raise ValueError("Invalid browser request")
        location = urlsplit(uri)
        query = parse_qs(location.query, keep_blank_values=True, max_num_fields=256)
        role, claims = None, None
        if location.path == "/__vt/entry":
            if headers.get("X-Original-Method") != "GET" or set(query) != {"ticket", "permit"} or any(len(v) != 1 for v in query.values()):
                raise ValueError("Invalid browser entry")
            claims = self.auth.consume_entry(query["permit"][0], host, query["ticket"][0],
                headers.get("Referer"), headers.get("Sec-Fetch-Dest"), headers.get("Sec-Fetch-Mode"))
            role = "entry"
        else:
            with self.auth.lock:
                profile = self.auth.state["profiles"].get(str(uid))
                if not profile:
                    raise ValueError("Unknown browser identity")
                name = "__Secure-vt_browser_" + profile["profile"]
            cookie = unique_cookie(headers.get("Cookie"), name)
            if cookie:
                claims, role = self.auth.verify(cookie, "content", uid), "auth"
            else:
                # Read only the explicit relay field, never any upstream query.
                # The rewriter independently checks the full engine descriptor.
                descriptor = location.path.split("/", 2)[1].split("!", 1)[0]
                pieces = descriptor.split("~")
                token = pieces[2] if len(pieces) == 3 else None
                if location.path.startswith("/__vt/") and len(query.get("cap", [])) == 1:
                    token = query["cap"][0]
                claims, role = self.auth.verify(token, "relay", uid), "relay"
        path = self.runtime.route(claims)
        fields = {"X-VT-Browser-Socket": path, "X-VT-Browser-Role": role,
                  **{"X-VT-Browser-" + key.title(): str(claims[key]) for key in ("uid", "profile", "epoch", "lease")},
                  "X-VT-Browser-Relay": self.auth.mint("relay", claims["lease"], 7 * 86400)}
        with self.auth.lock:
            fields["X-VT-Browser-Expires"] = str(self.auth._lease(claims["lease"])["exp"])
        # Domain auth cookies also reach another UID's content host. They must
        # be removed BEFORE nginx hands the request to any per-user process.
        # Only the engine's host-only synchronization cookies cross this boundary.
        cookie_parts = []
        engine_id = self.auth.realm_config(uid)["engineSessionId"]
        for part in headers.get("Cookie", "").split(";"):
            part = part.strip()
            if re.match(r"^__Host-[scw]+\|" + re.escape(engine_id) + r"\|", part) and "=" in part and all(0x21 <= ord(char) <= 0x7e for char in part):
                cookie_parts.append(part)
        fields["X-VT-Browser-Cookie"] = "; ".join(cookie_parts)
        if role == "entry":
            # Root consumed the one-use, UI-source-bound permit above. Restore
            # an evicted Domain cookie before the entry's 303 document request.
            fields["Set-Cookie"] = self.cookies(claims["lease"])[1][1]
        return fields

    _logins_cache = {}
    _logins_cache_lock = threading.Lock()
    LOGINS_CACHE_SECONDS = 30

    @classmethod
    def logins_digest(cls, uid, url):
        """A fingerprint of the full Browser's cookies for a site, fresh (no
        cache): the toolbar polls it after handing a Google sign-in to the
        Browser, and continues on its own when the site's logins change."""
        cookies = cls.browser_logins(uid, url, fresh=True)
        if not cookies:
            return ""
        material = "\n".join(sorted(f"{c.get('name', '')}={c.get('value', '')}" for c in cookies if isinstance(c, dict)))
        return hashlib.sha256(material.encode()).hexdigest()[:32]

    @classmethod
    def browser_logins(cls, uid, url, fresh=False):
        """The full Browser's cookies for this top-level site (never Google's).

        Read by browser_login_sync.py running AS THE USER: the root manager
        never opens a user's files itself. Any failure just means no sharing.
        Every cross-site hop asks; the answer for a site is kept for a few
        seconds, and a user without a Browser profile costs no subprocess."""
        try:
            parts = urlsplit(url if isinstance(url, str) else "")
            if parts.scheme not in ("http", "https") or not parts.hostname:
                return []
            import pwd
            from browser_login_sync import excluded, profile_dir
            if excluded(parts.hostname):
                return []
            user = pwd.getpwuid(uid)
            if not os.path.exists(os.path.join(profile_dir(user.pw_dir), "Default", "Cookies")):
                return []
            key, now = (uid, parts.hostname), time.monotonic()
            with cls._logins_cache_lock:
                cached = cls._logins_cache.get(key)
                if cached and cached[0] > now and not fresh:
                    return cached[1]
            script = str(Path(__file__).with_name("browser_login_sync.py"))
            done = subprocess.run(["/usr/bin/setpriv", f"--reuid={uid}", f"--regid={user.pw_gid}", "--init-groups", "--reset-env",
                                   "/usr/bin/python3", "-I", script, profile_dir(user.pw_dir), parts.hostname],
                                  capture_output=True, timeout=8, check=False, cwd="/")
            cookies = json.loads(done.stdout or b"[]") if done.returncode == 0 else []
            cookies = cookies if isinstance(cookies, list) else []
            with cls._logins_cache_lock:
                cls._logins_cache[key] = (now + cls.LOGINS_CACHE_SECONDS, cookies)
                if len(cls._logins_cache) > 256:
                    cls._logins_cache.pop(next(iter(cls._logins_cache)))
            return cookies
        except (OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
            logging.getLogger("vibetop").info("browser-lite login sync skipped: %s: %s", type(error).__name__, str(error)[:200])
            return []

    def share_logins(self, claims, result):
        """A link or redirect to another site arrives as an approval; give the
        runtime that site's Browser logins before the UI loads its entry."""
        url = result.get("url") if isinstance(result, dict) else None
        cookies = self.browser_logins(claims["uid"], url) if isinstance(url, str) else []
        if cookies:
            try:
                self.runtime.call(claims, "logins", {"url": url, "cookies": cookies})
            except (OSError, ValueError, RuntimeError, http.client.HTTPException) as error:
                logging.getLogger("vibetop").info("browser-lite login sync skipped: %s", type(error).__name__)

    def ui_claims(self, headers):
        if headers.get("Host") != urlsplit(self.auth.ui_origin).netloc or headers.get("X-Forwarded-Proto") != "https":
            raise ValueError("Invalid browser UI origin")
        return self.auth.verify(unique_cookie(headers.get("Cookie"), UI_COOKIE), "ui")

    @staticmethod
    def read_body(handler, content_type, limit=6144):
        if handler.headers.get("Transfer-Encoding") or len(handler.headers.get_all("Content-Length", [])) != 1:
            raise ValueError("Invalid browser request length")
        size = int(handler.headers["Content-Length"])
        if not 0 < size <= limit or handler.headers.get("Content-Type", "").split(";", 1)[0] != content_type:
            raise ValueError("Invalid browser request body")
        handler.connection.settimeout(15)
        data = handler.rfile.read(size)
        if len(data) != size:
            raise ValueError("Incomplete browser request")
        return data

    def reply(self, handler, status, body=b"", mime="application/json", headers=()):
        if not isinstance(body, bytes):
            body = json.dumps(body, separators=(",", ":")).encode()
        handler.send_response(status)
        for name, value in [("Content-Type", mime), ("Content-Length", str(len(body))),
                            ("Cache-Control", "no-store"), ("X-Content-Type-Options", "nosniff"),
                            ("Referrer-Policy", "origin"),
                            ("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-src https:; object-src 'none'; base-uri 'none'; frame-ancestors " + " ".join(sorted(self.auth.main_origins))), *headers]:
            handler.send_header(name, value)
        handler.end_headers()
        handler.wfile.write(body)

    def handle(self, handler):
        """Only nginx's separate UI/content locations use these internal routes."""
        try:
            if handler.path == "/__browser_proxy/status" and handler.command == "GET":
                from browser_proxy_release import PROTOCOL
                return self.reply(handler, 200, {"revision": self.runtime.revision, "protocol": PROTOCOL,
                                                 "configHash": getattr(self, "config_digest", None)})
            if handler.path == "/__browser_proxy/auth" and handler.command == "GET":
                return self.reply(handler, 200, headers=self.ingress(handler.headers).items())
            if handler.path != "/__browser_proxy/ui":
                return self.reply(handler, 404)
            if handler.headers.get("Host") != urlsplit(self.auth.ui_origin).netloc or handler.headers.get("X-Forwarded-Proto") != "https":
                raise ValueError("Invalid browser UI host")
            target = urlsplit(handler.headers.get("X-Original-URI", ""))
            if target.scheme or target.netloc or not target.path.startswith("/"):
                raise ValueError("Invalid browser UI path")
            if target.path == "/__vt/bootstrap" and handler.command == "POST":
                renewal = handler.headers.get("Origin") == self.auth.ui_origin
                if renewal:
                    self.check_post_origin(handler.headers)
                    data = json.loads(self.read_body(handler, "application/json"))
                    if not isinstance(data, dict):
                        raise ValueError("Invalid browser handoff")
                    ticket = data.get("ticket")
                else:
                    data = parse_qs(self.read_body(handler, "application/x-www-form-urlencoded").decode(), strict_parsing=True, max_num_fields=1)
                    if set(data) != {"ticket"} or len(data["ticket"]) != 1:
                        raise ValueError("Invalid browser handoff")
                    ticket = data["ticket"][0]
                lease = self.auth.redeem(ticket, handler.headers.get("Origin"), handler.headers.get("Sec-Fetch-Dest"), handler.headers.get("Sec-Fetch-Mode"))
                claims = self.auth.verify(self.auth.mint("ui", lease), "ui")
                self.runtime.ensure(claims)
                response_headers = self.cookies(lease)
                if not renewal:
                    response_headers.append(("Location", "/"))
                return self.reply(handler, 200 if renewal else 303, {"ok": True}, headers=response_headers)
            claims = self.ui_claims(handler.headers)
            if handler.command == "GET":
                assets = {"/": ("wrapper.html", "text/html; charset=utf-8"),
                          "/wrapper.css": ("wrapper.css", "text/css"),
                          "/wrapper.js": ("wrapper.js", "application/javascript"),
                          "/ui-session.js": ("ui-session.js", "application/javascript"),
                          "/controller.js": ("trusted-controller.js", "application/javascript")}
                if target.path == "/api/status":
                    return self.reply(handler, 200, {"ok": True}, headers=self.cookies(claims["lease"]))
                asset_path, asset_revision = target.path, None
                versioned = re.fullmatch(r"/__vt/assets/([a-f0-9]{64})(/[^/]+)", asset_path)
                if versioned:
                    asset_revision, asset_path = versioned.groups()
                if asset_path not in assets or (asset_revision is not None and asset_path == "/"):
                    return self.reply(handler, 404)
                filename, mime = assets[asset_path]
                try:
                    content = self.asset(filename, asset_revision)
                except FileNotFoundError:
                    return self.reply(handler, 404)
                if filename == "wrapper.html":
                    revision = getattr(self.runtime, "revision", None)
                    if revision:
                        for asset_path in ("/wrapper.css", "/wrapper.js", "/ui-session.js", "/controller.js"):
                            content = content.replace(('"' + asset_path + '"').encode(),
                                ('"/__vt/assets/' + revision + asset_path + '"').encode())
                    parents = html.escape(json.dumps(sorted(self.auth.main_origins)), quote=True)
                    # The profile id (not a secret) keys this user's saved tabs on a shared device.
                    profile = html.escape(str(claims.get("profile", "")), quote=True)
                    content = content.replace(b"<head>", ("<head><meta name=\"vt-main-origins\" content=\"" + parents + "\">"
                                                          "<meta name=\"vt-profile\" content=\"" + profile + "\">").encode(), 1)
                return self.reply(handler, 200, content, mime)
            self.check_post_origin(handler.headers)
            command = target.path.removeprefix("/api/")
            if command not in ("open", "approve", "close", "heartbeat", "tabs", "shortcuts", "prefs", "logins-check"):
                return self.reply(handler, 404)
            # Saved tabs (with back/forward lists) outgrow a control command;
            # the welcome-screen shortcut list is small but still over the base.
            body = json.loads(self.read_body(handler, "application/json",
                              96 * 1024 if command == "tabs" else 20 * 1024 if command == "shortcuts"
                              else 4 * 1024 if command == "prefs" else 6144))
            if command == "logins-check":
                url = body.get("url") if isinstance(body, dict) else None
                return self.reply(handler, 200, {"digest": self.logins_digest(claims["uid"], url) if isinstance(url, str) else ""},
                                  headers=self.cookies(claims["lease"]))
            if isinstance(body, dict):
                # Only the manager supplies cookies, never the client.
                body.pop("cookies", None)
                if body.pop("loginSync", None) is True and command == "open":
                    body["cookies"] = self.browser_logins(claims["uid"], body.get("url"))
            try:
                status, result = self.runtime.call(claims, command, body)
                if command == "approve" and status == 200:
                    self.share_logins(claims, result)
            except OSError as error:
                if command == "heartbeat" and error.errno in (errno.ENOENT, errno.ECONNREFUSED) and isinstance(body.get("clients"), list):
                    status, result = 200, {"expired": body["clients"]}
                else:
                    raise
            return self.reply(handler, status, result, headers=self.cookies(claims["lease"]))
        except (ValueError, KeyError, TypeError) as error:
            # Every credential failure reads "signed out" to the client; keep the
            # real reason, or an unrelated bug is indistinguishable from expiry.
            logging.getLogger("vibetop").info("browser-lite %s %s denied: %s: %s", handler.command, handler.headers.get("X-Original-URI", handler.path)[:120],
                         type(error).__name__, str(error)[:200])
            return self.reply(handler, 401, {"message": "Browser Lite sign-in has ended. Reopen it from Vibetop."})
        except (BrokenPipeError, ConnectionResetError):
            return
        except (OSError, RuntimeError, http.client.HTTPException):
            return self.reply(handler, 503, {"message": "Browser Lite is unavailable. Retry shortly."})

    def check_post_origin(self, headers):
        if headers.get("Origin") != self.auth.ui_origin or headers.get("Sec-Fetch-Site") != "same-origin":
            raise ValueError("Invalid browser UI request origin")

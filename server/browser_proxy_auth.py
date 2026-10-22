"""Root-only Browser Lite identity state; never reads a webpage profile.

The rewriter gets a realm key and stable engine ID, never these signing keys.
Callers serialize start/revoke with the same per-UID lifecycle lock.
"""
import base64
import hashlib
import hmac
import json
import re
import secrets
import threading
import time
from urllib.parse import parse_qs, urlsplit


def _encode(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", value):
        raise ValueError("Invalid capability encoding")
    raw = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    if _encode(raw) != value:
        raise ValueError("Noncanonical capability")
    return raw


def unique_cookie(header, name):
    values = [part.strip()[len(name) + 1:] for part in (header or "").split(";")
              if part.strip().startswith(name + "=")]
    return values[0] if len(values) == 1 else None


def trusted_host_conflicts(host, domain):
    """True when a trusted host is the realm parent or sits in its `bl-` namespace."""
    host = host.lower()
    return host == domain or (host.endswith("." + domain) and host.startswith("bl-"))


class BrowserAuthority:
    """Small persisted root identity database; capabilities are device-lease bound."""
    def __init__(self, master, domain, ui_origin, main_origins, *, state=None,
                 save=lambda state: None, main_epoch=lambda user: 0, now=time.time):
        if not isinstance(master, bytes) or len(master) < 32:
            raise ValueError("Invalid browser master key")
        if not re.fullmatch(r"[a-z0-9.-]+", domain):
            raise ValueError("Invalid browser domain")
        self.master, self.domain, self.ui_origin = master, domain, ui_origin
        self.main_origins = frozenset(main_origins)
        if not self.main_origins or any(urlsplit(origin).scheme != "https" for origin in [ui_origin, *self.main_origins]):
            raise ValueError("Browser Lite requires HTTPS origins")
        # Realm hosts are single-label `bl-…` names under `domain`, so a
        # free one-level wildcard certificate covers them. Trusted hosts may
        # share that parent domain but must never be mistakable for a realm.
        for origin in [ui_origin, *self.main_origins]:
            if trusted_host_conflicts(urlsplit(origin).hostname or "", domain):
                raise ValueError("Trusted UI and main hosts must not use the bl- realm namespace")
        self._persist, self.main_epoch, self.now = save, main_epoch, now
        self.failed = False
        self.state = state if state is not None else {"version": 1, "profiles": {}, "leases": {}, "handoffs": {}, "spent": {}}
        if self.state.get("version") != 1 or any(not isinstance(self.state.get(key), dict) for key in ("profiles", "leases", "handoffs", "spent")):
            raise ValueError("Invalid browser identity state")
        if not isinstance(self.state.setdefault("revoked", {}), dict):
            raise ValueError("Invalid browser revocation state")
        self.lock = threading.RLock()

    def _healthy(self):
        if self.failed:
            raise RuntimeError("Browser identity storage unavailable; restart after repair")

    def save(self, state):
        self._healthy()
        try:
            self._persist(state)
        except Exception:
            # An fsync failure has an ambiguous durable outcome. No new or old
            # credential may be accepted from this in-memory database afterwards.
            self.failed = True
            raise

    def _key(self, role, uid, profile):
        return hmac.digest(self.master, f"vibetop-browser-v1\0{role}\0{uid}\0{profile}".encode(), "sha256")

    def profile(self, uid, user):
        if type(uid) is not int or not 0 <= uid <= 4294967295 or not re.fullmatch(r"[a-z_][a-z0-9_-]{0,31}", user):
            raise ValueError("Invalid browser user")
        with self.lock:
            self._healthy()
            record = self.state["profiles"].get(str(uid))
            if record and record["user"] != user:
                raise ValueError("Linux user identity changed")
            if not record:
                record = {"uid": uid, "user": user, "profile": secrets.token_hex(16), "epoch": 0}
                self.state["profiles"][str(uid)] = record
                self.save(self.state)
            return dict(record)

    def realm_config(self, uid):
        self._healthy()
        record = self.state["profiles"][str(uid)]
        key = self._key("realm", uid, record["profile"])
        return {**record, "secret": key.hex(), "domain": self.domain,
                "engineSessionId": _encode(hmac.digest(key, b"engine", "sha256"))}

    def _collect(self):
        now = self.now()
        for name in ("leases", "handoffs", "spent", "revoked"):
            for key, record in list(self.state[name].items()):
                if record["exp"] <= now:
                    del self.state[name][key]

    def begin(self, uid, user, main_token, expires, main_origin, *, expected_epoch):
        if main_origin not in self.main_origins or not isinstance(main_token, str) or not main_token:
            raise ValueError("Invalid browser handoff source")
        with self.lock:
            self._healthy()
            self._collect()
            if type(expected_epoch) is not int or expected_epoch != self.main_epoch(user):
                raise ValueError("Main session revoked")
            record = self.profile(uid, user)
            expires = min(int(expires), int(self.now()) + 7 * 86400)
            if expires <= self.now():
                raise ValueError("Main session expired")
            session = hashlib.sha256(main_token.encode()).hexdigest()
            if session in self.state["revoked"]:
                raise ValueError("Main session revoked")
            lease_id = next((key for key, item in self.state["leases"].items()
                             if item["uid"] == uid and item["session"] == session and item["epoch"] == record["epoch"] and item["mainEpoch"] == expected_epoch), None)
            if lease_id is None:
                if len(self.state["leases"]) >= 4096:
                    raise ValueError("Too many browser sessions")
                lease_id = secrets.token_hex(16)
                self.state["leases"][lease_id] = {**record, "session": session, "exp": expires,
                                                 "mainEpoch": expected_epoch}
            if len(self.state["handoffs"]) >= 1024:
                raise ValueError("Too many pending browser sign-ins")
            ticket = secrets.token_urlsafe(32)
            self.state["handoffs"][hashlib.sha256(ticket.encode()).hexdigest()] = {
                "lease": lease_id, "origin": main_origin, "exp": int(self.now()) + 60}
            self.save(self.state)
            return ticket

    def _lease(self, lease_id):
        self._healthy()
        lease = self.state["leases"].get(lease_id)
        if not lease or lease["exp"] <= self.now():
            raise ValueError("Browser session expired")
        if self.state["revoked"].get(lease["session"], {}).get("exp", 0) > self.now():
            raise ValueError("Browser session revoked")
        profile = self.state["profiles"].get(str(lease["uid"]))
        if not profile or any(lease[key] != profile[key] for key in ("profile", "epoch", "user")) or lease["mainEpoch"] != self.main_epoch(lease["user"]):
            raise ValueError("Browser session revoked")
        return lease

    def redeem(self, ticket, origin, destination, mode):
        if not isinstance(ticket, str) or not re.fullmatch(r"[A-Za-z0-9_-]{43}", ticket):
            raise ValueError("Invalid browser handoff")
        with self.lock:
            digest = hashlib.sha256(ticket.encode()).hexdigest()
            handoff = self.state["handoffs"].get(digest)
            if not handoff or handoff["exp"] <= self.now():
                raise ValueError("Browser handoff expired")
            initial = origin == handoff["origin"] and destination == "iframe" and mode == "navigate"
            renewal = origin == self.ui_origin and destination == "empty" and mode in ("cors", "same-origin")
            if not (initial or renewal):
                raise ValueError("Invalid browser handoff context")
            self._lease(handoff["lease"])
            del self.state["handoffs"][digest]
            self.save(self.state)
            return handoff["lease"]

    def mint(self, role, lease_id, seconds=86400, **binding):
        if role not in ("ui", "content", "relay", "entry") or type(seconds) is not int or not 0 < seconds <= 7 * 86400:
            raise ValueError("Invalid browser purpose or lifetime")
        with self.lock:
            lease = self._lease(lease_id)
            claims = {"v": 1, "role": role, "uid": lease["uid"], "profile": lease["profile"],
                      "epoch": lease["epoch"], "lease": lease_id, "exp": min(int(self.now()) + seconds, lease["exp"])}
            if binding:
                if role != "entry" or set(binding) != {"host", "ticket"}:
                    raise ValueError("Invalid capability binding")
                claims.update(binding)
                claims["nonce"] = secrets.token_hex(16)
            payload = _encode(json.dumps(claims, sort_keys=True, separators=(",", ":")).encode())
            return payload + "." + _encode(hmac.digest(self._key(role, lease["uid"], lease["profile"]), payload.encode(), "sha256"))

    def verify(self, token, role, uid=None):
        if not isinstance(token, str) or len(token) > 2048 or token.count(".") != 1:
            raise ValueError("Invalid browser credential")
        try:
            payload, signature = token.split(".")
            claims = json.loads(_decode(payload))
            if not isinstance(claims, dict) or claims.get("v") != 1 or claims.get("role") != role or type(claims.get("uid")) is not int:
                raise ValueError("Invalid browser claims")
            if uid is not None and claims["uid"] != uid:
                raise ValueError("Browser user mismatch")
            if not isinstance(claims.get("profile"), str) or not re.fullmatch(r"[a-f0-9]{32}", claims["profile"]):
                raise ValueError("Invalid browser profile")
            expected = hmac.digest(self._key(role, claims["uid"], claims["profile"]), payload.encode(), "sha256")
            if not hmac.compare_digest(expected, _decode(signature)):
                raise ValueError("Invalid browser signature")
            with self.lock:
                lease = self._lease(claims.get("lease"))
                if any(claims.get(key) != lease[key] for key in ("uid", "profile", "epoch")) or type(claims.get("exp")) is not int or not self.now() < claims["exp"] <= lease["exp"]:
                    raise ValueError("Browser credential expired")
            return claims
        except (KeyError, TypeError, json.JSONDecodeError) as error:
            raise ValueError("Invalid browser credential") from error

    def host_uid(self, host):
        match = re.fullmatch(r"bl-u(0|[1-9][0-9]{0,9})-[a-f0-9]{32}\." + re.escape(self.domain), host or "")
        if not match or int(match[1]) > 4294967295:
            raise ValueError("Unknown browser host")
        return int(match[1])

    def entry_permit(self, entry, lease_id):
        url = urlsplit(entry)
        query = parse_qs(url.query, strict_parsing=True)
        if url.scheme != "https" or url.username or url.password or url.port or url.fragment or url.path != "/__vt/entry" or set(query) != {"ticket"} or len(query["ticket"]) != 1 or not re.fullmatch(r"[A-Za-z0-9_-]{43}", query["ticket"][0]):
            raise ValueError("Invalid daemon entry address")
        uid = self.host_uid(url.netloc)
        with self.lock:
            if uid != self._lease(lease_id)["uid"]:
                raise ValueError("Invalid daemon entry user")
        return self.mint("entry", lease_id, 60, host=url.netloc, ticket=hashlib.sha256(query["ticket"][0].encode()).hexdigest())

    def consume_entry(self, permit, host, ticket, referer, destination, mode):
        with self.lock:
            claims = self.verify(permit, "entry", self.host_uid(host))
            ref = urlsplit(referer or "")
            if ref.scheme + "://" + ref.netloc != self.ui_origin or destination != "iframe" or mode != "navigate" or claims.get("host") != host or claims.get("ticket") != hashlib.sha256(ticket.encode()).hexdigest():
                raise ValueError("Invalid browser entry context")
            digest = hashlib.sha256(permit.encode()).hexdigest()
            self._collect()
            if digest in self.state["spent"] or len(self.state["spent"]) >= 4096:
                raise ValueError("Browser entry already used")
            self.state["spent"][digest] = {"exp": claims["exp"]}
            self.save(self.state)
            return claims

    def revoke_session(self, main_token, *, expires=None):
        session = hashlib.sha256(main_token.encode()).hexdigest()
        with self.lock:
            self._healthy()
            self._collect()
            if expires is None:
                expires = max((lease["exp"] for lease in self.state["leases"].values() if lease["session"] == session), default=0)
            expires = min(int(expires), int(self.now()) + 7 * 86400)
            if expires <= self.now():
                return []
            if session not in self.state["revoked"] and len(self.state["revoked"]) >= 8192:
                raise RuntimeError("Browser revocation capacity reached")
            # A bootstrap may already have verified the main cookie before
            # logout acquired this lock. A durable tombstone prevents that
            # delayed request from recreating the device's revoked lease.
            self.state["revoked"][session] = {"exp": expires}
            revoked = []
            for key, lease in list(self.state["leases"].items()):
                if lease["session"] == session:
                    revoked.append({**lease, "lease": key})
                    del self.state["leases"][key]
            self.save(self.state)
            return revoked

    def revoke_user(self, uid):
        with self.lock:
            record = self.state["profiles"].get(str(uid))
            if record:
                record["epoch"] += 1
            for key, lease in list(self.state["leases"].items()):
                if lease["uid"] == uid:
                    del self.state["leases"][key]
            self.save(self.state)

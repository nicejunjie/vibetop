#!/usr/bin/env python3
"""Terminal manager & system status API.

Listens on 127.0.0.1:7680, proxied by nginx at /api/.
Runs as root so it can manage systemd units.

Endpoints:
  POST /api/terminals/{n}/start   — start session + ttyd for instance N
  POST /api/terminals/{n}/stop    — stop ttyd + session for instance N
  GET  /api/terminals/status      — {"running": [1, 3, 5, ...]}
  GET  /api/system/status         — CPU, memory, uptime, terminal count
"""

import base64
import ctypes
import ctypes.util
import hashlib
import hmac
import http.cookies
import http.server
import json
import logging
import logging.handlers
import mimetypes
import os
import pwd
import re
import secrets
import shlex
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import threading
import urllib.parse
import zipfile
from concurrent.futures import ThreadPoolExecutor

import system_status  # sibling module: /api/system/status data collection
import claude_stats   # sibling module: /api/claude/stats token/cost analytics
import service_discovery  # sibling module: /api/services/discover network-service scan

# ---- logging -----------------------------------------------------------------
# Selective + leveled: errors and significant events (terminal/app launches,
# reset, cross-device close, office save-back, deploys, SSE pushes) at INFO; the
# noisy per-request access log only at DEBUG (`LOG_LEVEL=DEBUG` on the unit).
# Emitted to stderr (systemd journal: `journalctl -u vibetop-manager`) AND a
# **self-rotating file** so logs stay bounded/cleaned without any external config:
# /var/log/vibetop/manager.log, ~2 MB × 5 = ~12 MB cap, oldest auto-pruned.
LOG_FILE = "/var/log/vibetop/manager.log"


def _setup_logging():
    lg = logging.getLogger("vibetop")
    if lg.handlers:                 # idempotent (the module is re-imported under pytest)
        return lg
    lg.setLevel(getattr(logging, os.environ.get("LOG_LEVEL", "INFO").upper(), logging.INFO))
    lg.propagate = False
    sh = logging.StreamHandler(sys.stderr)               # -> journald (it adds the timestamp)
    sh.setFormatter(logging.Formatter("%(levelname)s %(message)s"))
    lg.addHandler(sh)
    try:                                                 # bounded, self-cleaning file
        os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
        fh = logging.handlers.RotatingFileHandler(LOG_FILE, maxBytes=2_000_000, backupCount=5)
        fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s",
                                          "%Y-%m-%d %H:%M:%S"))
        lg.addHandler(fh)
    except OSError:
        pass                                             # no /var/log perms -> journal only
    return lg


log = _setup_logging()

# Upper bound on terminal instances. Reads MAX_INSTANCES so it can't drift from
# the installer's nginx port map (terminal/install.sh generates /tN/ routes for
# 1..MAX_INSTANCES); a hardcoded 50 here would reject terminals the nginx map
# happily routes when the installer is run with a higher MAX_INSTANCES.
try:
    MAX_INSTANCE = int(os.environ.get("MAX_INSTANCES", "50"))
except ValueError:
    MAX_INSTANCE = 50

# Tiny TTL memo for hot-path values that are cheap to go slightly stale but
# expensive to recompute (each forks a subprocess). /api/system/status and
# /api/terminals/status are polled every few seconds by every open client.
_cache_lock = threading.Lock()
_cache = {}  # key -> (value, expires_at_monotonic)


def _cached(key, ttl, producer):
    now = time.monotonic()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and hit[1] > now:
            return hit[0]
    # Produce outside the lock so a slow subprocess never blocks other handler
    # threads; a rare double-compute on concurrent misses is harmless.
    value = producer()
    with _cache_lock:
        _cache[key] = (value, time.monotonic() + ttl)
    return value


# ---- system-health warnings --------------------------------------------------
# A single, extensible producer of "something is wrong" alerts, surfaced as a red
# banner on EVERY client via the desktop heartbeat (see /api/desktop). It is the
# generic mechanism: to add a future warning (a wedged service, an overheating GPU,
# a failed backup…), append another block here that returns
#   {"id": <stable-slug>, "level": "warn"|"critical", "text": <human message>}
# The frontend keys dismissal on id+level, so an escalation (warn -> critical)
# re-surfaces even after the user dismissed the milder one. Kept cheap — this rides
# the 5s heartbeat (memoized ~5s); each check must be a fast syscall, no subprocess.
def _system_warnings():
    warns = []
    # Disk almost full: the operator's own workloads (not vibetop) can fill the
    # root FS; when they do, atomic state writes / terminals / saves fail in
    # confusing, intermittent ways. Surface it loudly BEFORE 100%. %/free match df.
    try:
        st = os.statvfs("/")
        used = st.f_blocks - st.f_bfree
        denom = used + st.f_bavail
        pct = round(100.0 * used / denom) if denom > 0 else 0
        free_gb = st.f_frsize * st.f_bavail / (1024 ** 3)
        if pct >= 95 or free_gb < 2:
            warns.append({"id": "disk", "level": "critical",
                          "text": "Disk almost full — %d%% used, %.1f GB free. "
                                  "Free space now; apps, terminals and saves may fail." % (pct, free_gb)})
        elif pct >= 90 or free_gb < 10:
            warns.append({"id": "disk", "level": "warn",
                          "text": "Low disk space — %d%% used, %.1f GB free." % (pct, free_gb)})
    except Exception:
        pass
    return warns


# ---- lightweight self-metrics ------------------------------------------------
# In-process counters surfaced at GET /api/metrics for self-diagnosis (the next
# weird sync/load bug should be answerable from data, not theory). Cheap: a dict
# behind a lock, bumped on the hot path. No external deps, no time series — a
# snapshot. The SSE /api/events stream is excluded from the latency average (it's
# long-lived by design and would dwarf everything).
_METRICS = {
    "requests_total": 0,           # every request, incl. /api/ping + SSE
    "request_seconds_total": 0.0,  # summed latency of non-SSE requests
    "request_counted": 0,          # denominator for the average (non-SSE)
    "in_flight": 0,                # gauge: requests currently being served
    "responses": {},               # status code -> count
    "errors_total": 0,             # responses with code >= 500
    "sse_clients": 0,              # gauge: open /api/events streams
    "terminals_started_total": 0,
    "terminals_stopped_total": 0,
}
_metrics_lock = threading.Lock()
_START_TIME = time.time()


def _metric_inc(key, n=1):
    with _metrics_lock:
        _METRICS[key] += n


def _list_running_terminals(user=None):
    # Running terminal instance numbers for `user` (per-user vibetop-uttyd-<user>-<N>
    # transient units). On the status hot path (every client polls this every few
    # seconds). A wedged systemd/D-Bus must not stall every poll behind it forever,
    # so cap the fork with a timeout and degrade to "none running" rather than raise.
    pat = ("vibetop-uttyd-%s-*" % _sanitize_unit(user)) if user else "vibetop-uttyd-*"
    try:
        out = subprocess.run(
            ["systemctl", "list-units", pat,
             "--no-pager", "--plain", "--no-legend", "--all"],
            capture_output=True, text=True, timeout=10,
        )
    except (subprocess.TimeoutExpired, OSError) as e:
        log.warning("list-units failed/timed out: %s", e)
        return []
    running = []
    who = re.escape(_sanitize_unit(user)) if user else r"[A-Za-z0-9_.-]+?"
    rx = re.compile(r"vibetop-uttyd-" + who + r"-(\d+)\.service")
    for line in out.stdout.strip().split("\n"):
        m = rx.search(line)
        if m and "running" in line:
            running.append(int(m.group(1)))
    return sorted(set(running))


def _app_user():
    """The non-root user that owns this install.

    The manager runs as root, so it can't rely on ~ or $HOME. Resolve the
    target user from $APP_USER, else from the owner of this script file.
    """
    env = os.environ.get("APP_USER") or os.environ.get("BROWSER_USER")
    if env:
        return env
    return pwd.getpwuid(os.stat(__file__).st_uid).pw_name


APP_USER = _app_user()


def _user_home(user):
    """Home directory for a Linux user. Multi-user (Option B): per-request state
    and file ops resolve under the *authenticated* user's real home. Overridable
    in tests (monkeypatched to a tmp dir)."""
    try:
        return pwd.getpwnam(user).pw_dir
    except KeyError:
        return os.path.expanduser(f"~{user}")


# Per-request identity. The server is threaded (one thread per request), so the
# authenticated user for the in-flight request lives in a thread-local set at the
# top of dispatch (_bind_request_user). The per-user path helpers and _chown_app
# read it, so a handler's on-disk effects land in THAT user's home. Falls back to
# APP_USER for cookieless loopback/admin requests (and unit tests that don't set
# a user).
_req_ctx = threading.local()


def _ctx_user():
    return getattr(_req_ctx, "user", None) or APP_USER


def _ctx_home():
    return _user_home(_ctx_user())


# Notes: multi-document. Each note is <notes_dir>/<id>.md; the index holds the tab
# list/order/names/active ({tabs:[{id,name}], active}). The legacy single-note file
# is migrated into tab "1" on first use (kept as a safety net). Per the request
# user's home (multi-user).
def _notes_legacy_file():
    return os.path.join(_ctx_home(), ".local/share/desktop-notes.md")


def _notes_dir():
    return os.path.join(_ctx_home(), ".local/share/desktop-notes")


def _notes_index_file():
    return os.path.join(_notes_dir(), "index.json")


_notes_lock = threading.Lock()
_NOTE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def _safe_note_id(nid):
    """A note id is safe iff it's [A-Za-z0-9_-]{1,64} — so it can only ever be a
    plain filename inside _notes_dir(), never a path-traversal (`../`, `/etc/...`).
    Pure function so it can be unit-tested in isolation."""
    return isinstance(nid, str) and bool(_NOTE_ID_RE.match(nid))


def _note_file(nid):
    return os.path.join(_notes_dir(), nid + ".md")


def _read_notes_index():
    """Tab index {tabs:[{id,name}], active}. Seeds a default and migrates the
    legacy single-note file into tab '1' on first use. Serialized by _notes_lock."""
    with _notes_lock:
        try:
            with open(_notes_index_file()) as f:
                data = json.load(f)
            if isinstance(data, dict) and isinstance(data.get("tabs"), list) and data["tabs"]:
                return data
        except (FileNotFoundError, json.JSONDecodeError, ValueError, OSError):
            pass
        os.makedirs(_notes_dir(), exist_ok=True)
        _chown_app(_notes_dir())
        if not os.path.exists(_note_file("1")):
            try:
                with open(_notes_legacy_file()) as f:
                    legacy = f.read()
            except (FileNotFoundError, OSError):
                legacy = ""
            _atomic_write(_note_file("1"), legacy)   # migrate; legacy file left intact
        data = {"tabs": [{"id": "1", "name": "Notes"}], "active": "1"}
        _atomic_write(_notes_index_file(), json.dumps(data))
        return data


def _write_notes_index(data):
    _atomic_write(_notes_index_file(), json.dumps(data))


# Files app tab set — shared across a user's devices (one set, loaded when the
# Files app opens, saved on change). Each entry is a FileBrowser browse URL.
# Per the request user's home (multi-user).
def _files_tabs_file():
    return os.path.join(_ctx_home(), ".local/share/desktop-files-tabs.json")


_files_tabs_lock = threading.Lock()


# Terminal tab names, keyed by instance number. Server-side so a rename shows up
# on every device of the same user.
def _tab_names_file():
    return os.path.join(_ctx_home(), ".local/share/terminal-tab-names.json")


_tab_names_lock = threading.Lock()


def _desktop_state_file():
    return os.path.join(_ctx_home(), ".local/share/desktop-state.json")
# Desktop state is a per-instance registry: {"instances": {id: {open, active, ts}},
# "reset_epoch": N}. The Start-menu "running" dots show the UNION of apps open
# across instances seen within DESKTOP_TTL (a heartbeat keeps an instance live);
# windows themselves are local to each instance. reset_epoch is bumped by
# /api/reset so every instance can detect a logout/reset and clear itself.
# Liveness window for the union. Must comfortably exceed browsers' background-tab
# timer throttling — Chrome drops hidden tabs to ~1 heartbeat/minute after 5min —
# or an idle/backgrounded machine ages out and its "running" dots wrongly go dark
# on other machines. 120s gives ~2x margin over the 60s throttle; the tradeoff is
# a machine that fully closed/slept still shows green for up to this long.
DESKTOP_TTL = 120         # seconds; an instance idle longer drops out of the union
DESKTOP_MAX_INSTANCES = 24
_SSE_MAX_CLIENTS = 64   # cap concurrent /api/events streams; each pins a thread for the client's lifetime
_desktop_lock = threading.Lock()
# Per-host update log (real history of THIS deployment's self-updates, seeded
# with a "deployed" baseline on first run) — not the git changelog.
UPDATE_HISTORY_FILE = os.path.expanduser(f"~{APP_USER}/.local/share/vibetop-update-history.json")
UPDATE_HISTORY_MAX = 200


# Upload drop zone. Per-user (~user/Uploads) unless _upload_dir() env pins a single
# shared dir for the whole host.
def _upload_dir():
    return os.environ.get("UPLOAD_DIR") or os.path.join(_ctx_home(), "Uploads")
# Public share links (Files app): {token: {rel, name, created, expires, hits}}.
# A share is a passwordless, read-only, capability URL (/s/<token>) reachable
# WITHOUT Cloudflare Access — the random token is the only gate — so the registry
# lives server-side (not a self-signed token) to allow listing + revocation, and
# every knob below is a safety fence. See docs/design-decisions.md.
# The registry is GLOBAL (one file), not per-user: the public /s/<token> handler
# has no session cookie, so it can't know a per-user home. Each entry records its
# OWNER instead, and both creation and serving fence to that owner's home.
SHARES_FILE = os.path.expanduser(f"~{APP_USER}/.local/share/vibetop-shares.json")


def _shares_file():
    return SHARES_FILE


_shares_lock = threading.Lock()
SHARE_DEFAULT_TTL_DAYS = 7          # a new link expires in a week unless told otherwise
SHARE_MAX = 500                    # cap the registry so it can't grow unbounded
# A shared FOLDER is served as an on-the-fly .zip. Bound it so a huge tree can't
# exhaust disk/time (env-overridable). Dotfiles/dot-dirs and symlink-escapes are
# skipped while zipping, same fence as a file share.
SHARE_ZIP_MAX_FILES = int(os.environ.get("SHARE_ZIP_MAX_FILES", "50000"))
SHARE_ZIP_MAX_BYTES = int(os.environ.get("SHARE_ZIP_MAX_BYTES", str(10 * 1024**3)))  # 10 GiB
# Shareable files are fenced to this root (+ no dotfiles); default = the OWNER's
# home, NOT FileBrowser's "/", so a public link can never publish /etc/* or a
# dot-secret. `user` = the share owner (create: the authenticated user; serve: the
# owner recorded in the entry). SHARE_ROOT env pins one shared root for the host.
def _share_root(user=None):
    return os.environ.get("SHARE_ROOT") or _user_home(user or _ctx_user())
# Optional public base (e.g. https://service.example.com); else derived from the
# request Host + X-Forwarded-Proto so the link matches how you reached the app.
SHARE_PUBLIC_BASE = os.environ.get("SHARE_PUBLIC_BASE", "").rstrip("/")
# Content-Types served INLINE (viewable in-browser). Everything else — notably
# text/html and image/svg+xml — is forced to an attachment download, so a shared
# file can never run JavaScript in the app's own origin (same-origin XSS guard).
SHARE_INLINE_TYPES = (
    "application/pdf", "text/plain",
    "image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/x-icon",
    "audio/", "video/",
)
# Host-local service definitions (gitignored). Each entry may carry a "key" and a
# "health" URL; those are added to /api/health so the Home Service page can show
# live dots without baking personal hostnames into the repo.
SERVICES_FILE = os.path.expanduser(f"~{APP_USER}/vibetop-www/services.json")
# The deployed service-worker file; its VERSION is the shell version. /api/events
# (SSE) watches it and pushes a 'reload' to every connected client when it changes
# (a deploy), so clients refresh without polling.
SW_FILE = os.path.expanduser(f"~{APP_USER}/vibetop-www/sw.js")
_SW_VER_RE = re.compile(r"VERSION\s*=\s*['\"]([^'\"]+)['\"]")


def _shell_version():
    try:
        with open(SW_FILE) as f:
            m = _SW_VER_RE.search(f.read(2000))
        if m:
            return m.group(1)
    except OSError:
        pass
    return "?"

# ---- Claude plan-usage strip (opt-in) --------------------------------------
# There is no API to *query* Max-plan usage; the numbers exist only as
# `anthropic-ratelimit-unified-*` response headers on live API calls. The opt-in
# vibetop-claude-proxy pass-through captures them to CLAUDE_USAGE_FILE. Turning
# the feature ON starts that proxy AND adds ANTHROPIC_BASE_URL to the user's
# Claude settings so Claude Code routes through it; OFF removes both. Nothing
# routes through the proxy while the feature is off.
CLAUDE_USAGE_FILE = os.path.expanduser(f"~{APP_USER}/.local/share/vibetop-claude-usage.json")
CLAUDE_SETTINGS_FILE = os.path.expanduser(f"~{APP_USER}/.claude/settings.json")
CLAUDE_PROXY_URL = "http://127.0.0.1:7690"
CLAUDE_PROXY_SERVICE = "vibetop-claude-proxy.service"
CLAUDE_USAGE_STALE_SEC = 15 * 60   # usage only refreshes on a real API call
_claude_lock = threading.Lock()


def _claude_settings_read():
    try:
        with open(CLAUDE_SETTINGS_FILE) as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _claude_usage_enabled():
    """Enabled == our proxy URL is wired into the user's Claude settings env."""
    env = _claude_settings_read().get("env")
    return isinstance(env, dict) and env.get("ANTHROPIC_BASE_URL") == CLAUDE_PROXY_URL


def _read_claude_usage():
    try:
        with open(CLAUDE_USAGE_FILE) as f:
            d = json.load(f)
        return d if isinstance(d, dict) else None
    except (OSError, ValueError):
        return None


def _claude_usage_payload(enabled=None):
    """The `/api/claude/usage` response shape: {enabled} + the latest captured
    numbers (session/weekly/status/stale/ageSec). Shared by the GET endpoint and
    the desktop heartbeat (which folds these numbers in when enabled), so both
    stay in lock-step. Pass `enabled` to avoid a redundant settings read when the
    caller already computed it."""
    out = {"enabled": _claude_usage_enabled() if enabled is None else enabled}
    u = _read_claude_usage()
    if u:
        age = int(time.time()) - int(u.get("updated") or 0)
        out.update({
            "session": u.get("session"), "weekly": u.get("weekly"),
            "status": u.get("status"),
            "representative": u.get("representative"),
            "updated": u.get("updated"),
            "ageSec": age, "stale": age > CLAUDE_USAGE_STALE_SEC,
        })
    return out


def _set_claude_usage_env(on):
    """Add/remove env.ANTHROPIC_BASE_URL in ~/.claude/settings.json, preserving
    everything else. On disable it only removes the key when it's *ours*, so a
    user's own ANTHROPIC_BASE_URL is never clobbered."""
    d = _claude_settings_read()
    env = d.get("env")
    if not isinstance(env, dict):
        env = {}
    if on:
        env["ANTHROPIC_BASE_URL"] = CLAUDE_PROXY_URL
    elif env.get("ANTHROPIC_BASE_URL") == CLAUDE_PROXY_URL:
        env.pop("ANTHROPIC_BASE_URL", None)
    if env:
        d["env"] = env
    else:
        d.pop("env", None)
    os.makedirs(os.path.dirname(CLAUDE_SETTINGS_FILE), exist_ok=True)
    _atomic_write(CLAUDE_SETTINGS_FILE, json.dumps(d, indent=2))


def _set_claude_usage(on):
    """Toggle the feature. ON: start the proxy, THEN route Claude to it. OFF:
    remove the env so NEW sessions stop routing, and disable the unit at boot —
    but DO NOT stop the running proxy. Any Claude session started while the
    feature was on is pinned to ANTHROPIC_BASE_URL for its whole life; killing
    the proxy out from under it gives ConnectionRefused on every request (learned
    the hard way — a test toggle-off broke the operator's own live session). The
    idle loopback proxy is harmless when nothing routes to it, and it's gone on
    the next reboot — by when no session is still pinned. Serialized so
    concurrent toggles can't interleave the steps."""
    with _claude_lock:
        if on:
            subprocess.run(["systemctl", "enable", "--now", CLAUDE_PROXY_SERVICE],
                           capture_output=True, text=True, timeout=30)
            _set_claude_usage_env(True)
        else:
            _set_claude_usage_env(False)
            # `disable` (NOT `disable --now`): stop it starting at boot, leave the
            # current process alive for sessions pinned to it.
            subprocess.run(["systemctl", "disable", CLAUDE_PROXY_SERVICE],
                           capture_output=True, text=True, timeout=30)
    log.info("claude usage enabled" if on else
             "claude usage disabled (proxy left running for pinned sessions)")

# ---- Office (Word/Excel/PPT) view & edit -----------------------------------
# View: convert to PDF with headless LibreOffice (cached) and serve it inline.
# Edit: open the file in the OnlyOffice web editor (Document Server, below).
OFFICE_RE = re.compile(
    r"\.(docx?|docm|dotx?|dotm|xlsx?|xlsm|xlsb|xltx?|xltm|pptx?|pptm|ppsx?|ppsm"
    r"|potx?|potm|odt|ods|odp|ott|ots|otp|rtf|csv|tsv)$", re.I)
# Office paths are per-user (multi-user): a logged-in user views/edits files under
# THEIR home. `user=None` resolves the current request's user (_ctx_user); the
# container callbacks pass the owning user explicitly (from the signed token).
def _office_home(user=None):
    return _user_home(user or _ctx_user())


def _office_cache_dir(user=None):
    return os.path.join(_office_home(user), ".cache", "vibetop-office")


# A LibreOffice user profile dedicated to headless conversion, kept separate
# from the interactive instance so a "View" never collides with an open "Edit".
def _office_convert_profile(user=None):
    return os.path.join(_office_cache_dir(user), "lo-convert-profile")

# OnlyOffice Document Server (web editor) — the fast in-browser Edit path.
# Runs in Docker on loopback; nginx proxies /onlyoffice/. The container reaches
# back to this manager (for the doc + save callback) via host.docker.internal.
ONLYOFFICE_PORT = os.environ.get("ONLYOFFICE_PORT", "8087")
# Loopback ports the /api/health probe checks. Read from env (fallbacks match the
# installer defaults) so they don't silently drift if a deploy overrides them.
def _port_env(name, default):
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default
BASE_PORT = _port_env("BASE_PORT", 7680)   # /tN/ -> BASE_PORT+N
XPRA_PORT = _port_env("XPRA_PORT", 14500)  # Browser (xpra HTML5)
FB_PORT = _port_env("FB_PORT", 8085)       # FileBrowser
# The X display for the X11 desktop — a SECOND xpra session, separate from the
# Browser's Chromium display (:99), so the Browser stays its own app. The Apps
# launcher runs GUI apps here, and terminal shells export it (so X11 apps started
# from a terminal show up as Apps tabs). Matches browser/install.sh's
# X11_DISPLAY_NUM.
X11_DISPLAY = os.environ.get("X11_DISPLAY", ":98")
ONLYOFFICE_SECRET_FILE = os.path.expanduser(f"~{APP_USER}/.config/vibetop/onlyoffice.secret")
ONLYOFFICE_HOST = os.environ.get("ONLYOFFICE_CALLBACK_HOST", "http://host.docker.internal")
# Extension -> OnlyOffice documentType.
_OO_CELL = {"xlsx", "xls", "xlsm", "xlsb", "xltx", "xltm", "ods", "ots", "csv", "tsv"}
_OO_SLIDE = {"pptx", "ppt", "pptm", "ppsx", "ppsm", "potx", "potm", "odp", "otp"}
# "New document" — blank templates (bundled in the repo) stamped into ~/Documents
# when the Office app is opened with no file. documentType -> (ext, label).
def _office_new_dir(user=None):
    return os.path.join(_office_home(user), "Documents")
OFFICE_NEW = {"word": ("docx", "Document"),
              "cell": ("xlsx", "Spreadsheet"),
              "slide": ("pptx", "Presentation")}
# Active editing sessions: rel-path -> document key. The key must stay stable
# for the whole session (it identifies the doc to the server, incl. forcesave),
# so we mint it at open and reuse it until the session closes — NOT re-derive
# from mtime, which changes every time we save back. Cleared on close.
_office_sessions = {}
_office_sessions_lock = threading.Lock()
_office_convert_lock = threading.Lock()

# The git checkout this manager runs from: <repo>/terminal/terminal-manager.py.
# The Update app pulls + redeploys from here.
REPO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TERMINAL_DIR = os.path.dirname(os.path.abspath(__file__))   # vibetop-session, ttyd-run.sh
# World-readable/executable copies of the per-user helper scripts. Multi-user: a
# terminal runs AS the logged-in user, so the scripts it execs (vibetop-session,
# ttyd-run.sh) must be reachable by every user — NOT inside the operator's 0750
# home where the checkout lives. terminal/install.sh copies them here (0755).
TERM_HELPER_DIR = "/usr/local/lib/vibetop"


def _term_helper(name):
    p = os.path.join(TERM_HELPER_DIR, name)
    return p if os.path.exists(p) else os.path.join(TERMINAL_DIR, name)


# ---- Per-user terminals (multi-user Phase 3) -------------------------------
# A terminal runs as the AUTHENTICATED user via a `systemd-run` transient unit, so
# each user gets a real shell in their own home. For (user, N): the session daemon
# and ttyd are units vibetop-uterm-<user>-<N> / vibetop-uttyd-<user>-<N>, the
# vibetop-session instance id is "<user>-<N>" (socket /tmp/vibetop-session-<id>.sock),
# and ttyd binds a PER-USER port so nginx can route /tN/ by identity (via authcheck).
USERS_REGISTRY = "/var/lib/vibetop/users.json"     # {user:{slot:k}} — root-owned
USER_TERM_BASE = _port_env("USER_TERM_BASE", 17000)
PER_USER_TERMS = 100                               # port span per user (>= MAX_INSTANCE)
_users_lock = threading.Lock()

# Per-unit resource caps for the systemd-run transient units (multi-user safety on
# a shared box). TasksMax defaults on (cheap fork-bomb protection, generous enough
# not to bother normal use); MemoryMax/CPUQuota are opt-in (empty = no cap) since a
# wrong memory cap OOM-kills a legit workload. All env-overridable.
USER_TASKS_MAX = os.environ.get("USER_TASKS_MAX", "4000")
USER_MEM_MAX = os.environ.get("USER_MEM_MAX", "")          # e.g. "4G"
USER_CPU_QUOTA = os.environ.get("USER_CPU_QUOTA", "")      # e.g. "400%"


def _resource_props():
    props = []
    for name, val in (("TasksMax", USER_TASKS_MAX), ("MemoryMax", USER_MEM_MAX),
                      ("CPUQuota", USER_CPU_QUOTA)):
        if val:
            props += ["--property", f"{name}={val}"]
    return props


def _workdir_props(pw):
    """A `systemd-run` transient unit defaults to WorkingDirectory=/, so a login
    shell (and any file dialog) starts in the filesystem root instead of the
    user's home — the "terminal opens in /" bug. Pin it to the user's home like
    SSH/login does. Falls back to no property (systemd's /) if the home is
    missing/unreadable, so a homeless account can still start a session."""
    home = pw.pw_dir
    if home and os.path.isdir(home):
        return ["--property", f"WorkingDirectory={home}"]
    return []


def _sanitize_unit(s):
    # A Linux login name is a safe subset of systemd unit chars; be defensive.
    return re.sub(r"[^A-Za-z0-9_.-]", "_", str(s))


def _read_users_registry():
    try:
        with open(USERS_REGISTRY) as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _user_slot(user):
    """Stable small-integer slot for a user (assigned on first use), carving a
    per-user terminal port block. Persisted in a root-owned registry."""
    with _users_lock:
        reg = _read_users_registry()
        ent = reg.get(user)
        if isinstance(ent, dict) and isinstance(ent.get("slot"), int):
            return ent["slot"]
        used = {e.get("slot") for e in reg.values() if isinstance(e, dict)}
        slot = 0
        while slot in used:
            slot += 1
        ent = ent if isinstance(ent, dict) else {}     # preserve token_epoch etc.
        ent["slot"] = slot
        reg[user] = ent
        try:
            os.makedirs(os.path.dirname(USERS_REGISTRY), exist_ok=True)
            _atomic_write(USERS_REGISTRY, json.dumps(reg))
        except OSError:
            pass
        return slot


def _user_token_epoch(user):
    """The user's session-token epoch (0 by default). A 'log out everywhere' bumps
    it; tokens embed the epoch at mint time and are rejected once it advances,
    invalidating every device signed in as that user. Cached ~5s so the
    per-request _verify_session stays cheap (a logout-everywhere takes effect
    within ~5s on other devices)."""
    def _read():
        ent = _read_users_registry().get(user)
        try:
            return int(ent.get("token_epoch", 0)) if isinstance(ent, dict) else 0
        except (TypeError, ValueError):
            return 0
    return _cached("token_epoch:" + user, 5.0, _read)


def _bump_token_epoch(user):
    """Invalidate every existing session for `user` (log out everywhere)."""
    with _users_lock:
        reg = _read_users_registry()
        ent = reg.get(user) if isinstance(reg.get(user), dict) else {}
        try:
            ent["token_epoch"] = int(ent.get("token_epoch", 0)) + 1
        except (TypeError, ValueError):
            ent["token_epoch"] = 1
        reg[user] = ent
        try:
            os.makedirs(os.path.dirname(USERS_REGISTRY), exist_ok=True)
            _atomic_write(USERS_REGISTRY, json.dumps(reg))
        except OSError:
            pass
    with _cache_lock:
        _cache.pop("token_epoch:" + user, None)


def _user_term_port(user, n):
    return USER_TERM_BASE + _user_slot(user) * PER_USER_TERMS + int(n)


def _wait_tcp(port, timeout=8.0):
    """Poll until 127.0.0.1:port accepts a connection (or timeout). Avoids a
    cold-start 502 when nginx would proxy to a service that isn't listening yet."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", int(port)), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.1)
    return False


def _term_instance(user, n):
    return f"{_sanitize_unit(user)}-{int(n)}"


def _term_units(user, n):
    tag = _term_instance(user, n)
    return f"vibetop-uterm-{tag}.service", f"vibetop-uttyd-{tag}.service"


def _provision_user(user):
    """One-time-ish setup so a user's terminal has a working runtime: linger keeps
    /run/user/<uid> alive (D-Bus/XDG for GUI apps + systemctl --user). Idempotent
    and best-effort — a plain shell works even if this fails."""
    try:
        subprocess.run(["loginctl", "enable-linger", user],
                       capture_output=True, text=True, timeout=15)
    except (OSError, subprocess.SubprocessError):
        pass


def _user_terminal_setenvs(user):
    # Export the user's OWN X11 display so a GUI app run from their terminal shows
    # up on their X11 Launcher (once that display is open). D-Bus/XDG are their own.
    envs = ["TERM=xterm-256color", "LANG=en_US.UTF-8"]
    try:
        uid = pwd.getpwnam(user).pw_uid
        envs += [f"DISPLAY=:{_user_xpra_display(user, 'x11')}",
                 f"DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/{uid}/bus",
                 f"XDG_RUNTIME_DIR=/run/user/{uid}"]
    except KeyError:
        pass
    return envs


def _start_user_terminal(user, n):
    """Launch the session daemon + ttyd for (user, N) as that user. Returns
    (ok, port_or_error)."""
    try:
        pw = pwd.getpwnam(user)
    except KeyError:
        return False, f"unknown user {user}"
    _provision_user(user)
    inst = _term_instance(user, n)
    port = _user_term_port(user, n)
    sess_unit, ttyd_unit = _term_units(user, n)
    base = (["systemd-run", "--collect", f"--uid={user}", f"--gid={pw.pw_gid}"]
            + _resource_props() + _workdir_props(pw))     # land the shell in ~, not /
    setenvs = []
    for e in _user_terminal_setenvs(user):
        setenvs += ["--setenv", e]
    try:
        r1 = subprocess.run(
            base + [f"--unit={sess_unit}"] + setenvs +
            [_term_helper("vibetop-session"), "serve", inst],
            capture_output=True, text=True, timeout=30)
        if r1.returncode != 0:
            return False, (r1.stderr or r1.stdout or "session start failed").strip()
        # Wait for the daemon to bind its socket before starting ttyd (which would
        # otherwise `attach` to a not-yet-existent socket and exit). Mirrors the
        # old ttyd unit's ExecStartPre.
        sock = f"/tmp/vibetop-session-{inst}.sock"
        for _ in range(50):
            if os.path.exists(sock):
                break
            time.sleep(0.1)
        r2 = subprocess.run(
            base + [f"--unit={ttyd_unit}"] + setenvs +
            [_term_helper("ttyd-run.sh"), inst, str(port), str(int(n))],
            capture_output=True, text=True, timeout=30)
        if r2.returncode != 0:
            subprocess.run(["systemctl", "stop", sess_unit],
                           capture_output=True, timeout=15)
            return False, (r2.stderr or r2.stdout or "ttyd start failed").strip()
        _wait_tcp(port)                 # so the first /tN/ hit doesn't 502
    except (OSError, subprocess.SubprocessError) as e:
        return False, str(e)
    return True, port


def _stop_user_terminal(user, n):
    sess_unit, ttyd_unit = _term_units(user, n)
    try:
        subprocess.run(["systemctl", "stop", ttyd_unit, sess_unit],
                       capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.SubprocessError) as e:
        return False, str(e)
    return True, None


# ---- Per-user Files (FileBrowser as the user, Phase 3b) --------------------
# One FileBrowser per user, run AS them via systemd-run, rooted at "/" (whole
# filesystem — same as the single-user Files app and consistent with the user's
# Terminal; Unix perms are the fence since it runs as them). The app OPENS at
# their real home (files.html anchors on /api/me) but can navigate the tree.
# Per-user port + DB. nginx routes /files/ to the user's port via authcheck.
FB_BIN = os.environ.get("FB_BIN", "/usr/local/bin/filebrowser")
FB_APP_BASE = _port_env("FB_APP_BASE", 18000)     # per-user FileBrowser port = base + slot


def _user_app_port(user, base):
    return base + _user_slot(user)


def _fb_unit(user):
    return f"vibetop-ufiles-{_sanitize_unit(user)}.service"


def _fb_db(home):
    return os.path.join(home, ".config", "filebrowser", "filebrowser.db")


def _run_as(user, argv, timeout=30):
    """Run argv as `user` (root -> setuid). Returns the CompletedProcess or None."""
    try:
        return subprocess.run(argv, user=user, capture_output=True, text=True,
                              timeout=timeout)
    except (OSError, subprocess.SubprocessError) as e:
        log.warning("run-as %s failed: %s", user, e)
        return None


def _provision_user_filebrowser(user, home, port):
    """First-run setup of the user's FileBrowser DB (as the user): init, an
    internal admin (noauth serves as it), and config (root=/, scope=/, baseurl,
    hidden dotfiles). Idempotent — safe to re-run."""
    db = _fb_db(home)
    try:
        os.makedirs(os.path.dirname(db), exist_ok=True)
        _chown_app(os.path.dirname(db), user)
        _chown_app(os.path.dirname(os.path.dirname(db)), user)
    except OSError:
        pass
    if not os.path.exists(db):
        _run_as(user, [FB_BIN, "-d", db, "config", "init"])
        _run_as(user, [FB_BIN, "-d", db, "users", "add", "admin",
                       secrets.token_hex(12), "--perm.admin"])
    # Root at "/" (whole filesystem) — the same model as the single-user Files app
    # and consistent with this user's Terminal: they run AS themselves, so Unix
    # permissions are the fence (SSH-equivalent trust). The app *opens* at their
    # real home (files.html anchors on /api/me), but they can navigate anywhere
    # their perms allow, and the address bar shows real paths (/home/you) instead
    # of "/". (Rooting at home instead showed home AS "/", which read as the same
    # "landed in /" bug as the terminal.)
    _run_as(user, [FB_BIN, "-d", db, "config", "set", "--address", "127.0.0.1",
                   "--port", str(port), "--baseurl", "/files", "--root", "/",
                   "--auth.method=noauth", "--hideDotfiles"])
    _run_as(user, [FB_BIN, "-d", db, "users", "update", "admin",
                   "--scope", "/", "--hideDotfiles"])


def _start_user_filebrowser(user):
    """Ensure the user's FileBrowser is running; return (ok, port_or_error)."""
    try:
        pw = pwd.getpwnam(user)
    except KeyError:
        return False, f"unknown user {user}"
    home = _user_home(user)
    port = _user_app_port(user, FB_APP_BASE)
    unit = _fb_unit(user)
    # Already running? (cheap check via the unit's active state)
    try:
        st = subprocess.run(["systemctl", "is-active", unit],
                            capture_output=True, text=True, timeout=10)
        if st.stdout.strip() == "active":
            return True, port
    except (OSError, subprocess.SubprocessError):
        pass
    if not os.path.exists(FB_BIN):
        return False, "filebrowser not installed"
    _provision_user_filebrowser(user, home, port)
    db = _fb_db(home)
    r = subprocess.run(
        ["systemd-run", "--collect", f"--uid={user}", f"--gid={pw.pw_gid}"]
        + _resource_props() + _workdir_props(pw) +
        [f"--unit={unit}", "--setenv", f"HOME={home}",
         FB_BIN, "-d", db, "-a", "127.0.0.1", "-p", str(port)],
        capture_output=True, text=True, timeout=30)
    if r.returncode != 0:
        return False, (r.stderr or r.stdout or "filebrowser start failed").strip()
    _wait_tcp(port)                     # so the first /files/ hit doesn't 502
    return True, port


# ---- Per-user Browser + X11 (xpra displays, Phase 3c) ----------------------
# Each user gets their OWN Browser xpra (Chromium desktop) and X11 xpra (bare
# desktop for GUI apps), run AS them via systemd-run, on per-user displays+ports
# from their slot. nginx routes /browser/ and /x11-display/ to the user's port via
# authcheck (X-App-Port). Display numbers avoid the legacy shared :98/:99.
BROWSER_DISP_BASE = _port_env("BROWSER_DISP_BASE", 200)
BROWSER_XPRA_BASE = _port_env("BROWSER_XPRA_BASE", 24500)
X11_DISP_BASE = _port_env("X11_DISP_BASE", 340)
X11_XPRA_BASE = _port_env("X11_XPRA_BASE", 24700)


def _user_xpra_display(user, kind):
    base = BROWSER_DISP_BASE if kind == "browser" else X11_DISP_BASE
    return base + _user_slot(user)


def _user_xpra_port(user, kind):
    base = BROWSER_XPRA_BASE if kind == "browser" else X11_XPRA_BASE
    return base + _user_slot(user)


def _xpra_unit(user, kind):
    tag = "ubrowser" if kind == "browser" else "ux11"
    return f"vibetop-{tag}-{_sanitize_unit(user)}.service"


def _start_user_xpra(user, kind):
    """Ensure the user's `kind` (browser|x11) xpra display is running; return
    (ok, port_or_error). Launched AS the user; snap Chromium (browser) lives in
    their own ~/snap profile."""
    try:
        pw = pwd.getpwnam(user)
    except KeyError:
        return False, f"unknown user {user}"
    disp, port = _user_xpra_display(user, kind), _user_xpra_port(user, kind)
    unit = _xpra_unit(user, kind)
    try:
        st = subprocess.run(["systemctl", "is-active", unit],
                            capture_output=True, text=True, timeout=10)
        if st.stdout.strip() == "active":
            _wait_tcp(port, 3)
            return True, port
    except (OSError, subprocess.SubprocessError):
        pass
    _provision_user(user)               # linger -> /run/user/<uid> for snap + xpra
    helper = _term_helper("xpra-app.sh")
    setenvs = ["--setenv", f"HOME={pw.pw_dir}",
               "--setenv", f"XDG_RUNTIME_DIR=/run/user/{pw.pw_uid}",
               "--setenv", "XPRA_PING_TIMEOUT=45"]
    r = subprocess.run(
        ["systemd-run", "--collect", f"--uid={user}", f"--gid={pw.pw_gid}"]
        + _resource_props() + _workdir_props(pw) + [f"--unit={unit}"] + setenvs +
        [helper, kind, str(disp), str(port)],
        capture_output=True, text=True, timeout=30)
    if r.returncode != 0:
        return False, (r.stderr or r.stdout or "xpra start failed").strip()
    _wait_tcp(port, timeout=20)          # xpra (Xorg + WM + child) is slower to bind
    return True, port


def _stop_user_xpra(user, kind):
    try:
        subprocess.run(["systemctl", "stop", _xpra_unit(user, kind)],
                       capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.SubprocessError):
        pass


# System-status readers (CPU/MEM/GPU/disk/net/processes) live in system_status.py
# and are reached via system_status.get_system_status(); the per-poll CPU/RAPL/
# disk/process snapshot globals moved there with them.


class _MultipartError(Exception):
    pass


def _chown_app(path, user=None):
    """chown `path` to `user` (default: the current request's authenticated user)
    when running as root. Best-effort — silently ignored on failure. Multi-user:
    per-user state lands in the requesting user's home and must be owned by them;
    cookieless/loopback requests fall back to APP_USER via _ctx_user()."""
    try:
        if os.geteuid() != 0:
            return
        pw = pwd.getpwnam(user or _ctx_user())
        os.chown(path, pw.pw_uid, pw.pw_gid)
    except Exception:
        pass


def _atomic_write(path, text):
    """Write `text` to `path` atomically: a temp file in the same dir + os.replace.
    A crash or a concurrent reader then never sees a truncated/half-written file
    (a plain open('w')+write/json.dump can be observed mid-write — which for the
    desktop registry would reset reset_epoch and drop every instance's state)."""
    d = os.path.dirname(path)
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".tmp-", suffix=".swp")
    try:
        with os.fdopen(fd, "w") as f:
            f.write(text)
        os.replace(tmp, path)   # atomic on the same filesystem
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    _chown_app(path)            # written by root; keep it owned by APP_USER


def _read_tab_names():
    """Terminal tab names as {str(n): name}; tolerant of a missing/corrupt file."""
    try:
        with open(_tab_names_file()) as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError, ValueError, OSError):
        return {}


def _write_tab_names(d):
    _atomic_write(_tab_names_file(), json.dumps(d))


def _read_desktop_state():
    """Load the desktop registry, tolerating a missing/old-format/corrupt file."""
    try:
        with open(_desktop_state_file()) as f:
            data = json.load(f)
        if not isinstance(data, dict):
            raise ValueError
    except (FileNotFoundError, json.JSONDecodeError, ValueError):
        data = {}
    if not isinstance(data.get("instances"), dict):
        data["instances"] = {}
    if not isinstance(data.get("reset_epoch"), int):
        data["reset_epoch"] = 0
    # close_targets: {appId: [instanceId,...]} — the live instances that should
    # close that app (cross-device close). An instance closes the app when it sees
    # its own id listed; it then reports an open-set without the app, and the
    # server prunes it out. Targeting by id (not a global flag) means reloading the
    # holding instance still closes it, and a stuck holder can't poison the app for
    # other devices.
    if not isinstance(data.get("close_targets"), dict):
        data["close_targets"] = {}
    return data


def _desktop_prune_targets(state, now):
    """Keep a close target only while its instance is still live AND still reports
    the app open. Honoring a close (reporting an open-set without the app) or going
    stale drops the instance out; an app with no targets left is removed."""
    insts = state["instances"]
    out = {}
    for app, ids in (state.get("close_targets") or {}).items():
        keep = [i for i in ids
                if isinstance(insts.get(i), dict)
                and (now - float(insts[i].get("ts", 0) or 0)) <= DESKTOP_TTL
                and app in (insts[i].get("open") or [])]
        if keep:
            out[app] = keep
    state["close_targets"] = out
    return out


def _write_desktop_state(data):
    _atomic_write(_desktop_state_file(), json.dumps(data))


def _desktop_cap(data):
    """Bound the registry to the most-recently-seen instances."""
    insts = data["instances"]
    if len(insts) > DESKTOP_MAX_INSTANCES:
        keep = sorted(insts.items(), key=lambda kv: kv[1].get("ts", 0),
                      reverse=True)[:DESKTOP_MAX_INSTANCES]
        data["instances"] = dict(keep)


def _desktop_union(data, now):
    """Apps open across instances seen within DESKTOP_TTL (order-preserving)."""
    seen = []
    for ent in data["instances"].values():
        try:
            if now - float(ent.get("ts", 0)) > DESKTOP_TTL:
                continue
        except (TypeError, ValueError):
            continue
        for app in ent.get("open", []):
            if app not in seen:
                seen.append(app)
    return seen


def _resolve_under_home(rel, user=None):
    """Map a FileBrowser-relative path to an absolute file under `user`'s home
    (default: the current request's user), refusing anything that escapes it
    (symlinks resolved). Returns None if the path is unsafe or not a regular file."""
    if not rel:
        return None
    rel = rel.lstrip("/")
    try:
        base = os.path.realpath(_office_home(user))
        full = os.path.realpath(os.path.join(base, rel))
    except ValueError:
        # Embedded NUL byte (or similar) in the path — realpath raises rather
        # than returning a string; treat as unsafe instead of 500-ing the handler.
        return None
    if full != base and not full.startswith(base + os.sep):
        return None
    if not os.path.isfile(full):
        return None
    return full


def _safe_share_target(rel, user=None):
    """Map a home-relative path to an absolute file OR directory under `user`'s
    share root (default: the current request's user) for public sharing, refusing
    anything unsafe. Stricter than _resolve_under_home: fenced to _share_root(user)
    AND rejects any dotfile / dot-directory component (~/.ssh, ~/.config/*, secrets)
    — those must never become a public link. Symlinks are resolved on both ends, so
    a symlink out of the fence is caught. Returns (abspath, kind) with kind in
    {"file","dir"}, or (None, None)."""
    if not rel:
        return (None, None)
    rel = rel.lstrip("/")
    # Reject a leading-dot in ANY segment of the requested path (pre-realpath, on
    # the user-supplied relative path — catches ".ssh/id_rsa", "a/.env", "..").
    for part in rel.replace("\\", "/").split("/"):
        if part.startswith("."):
            return (None, None)
    try:
        base = os.path.realpath(_share_root(user))
        full = os.path.realpath(os.path.join(base, rel))
    except ValueError:
        return (None, None)
    if full != base and not full.startswith(base + os.sep):
        return (None, None)
    # Also reject if realpath landed on any dot component (e.g. the target was a
    # symlink into a hidden dir).
    inside = full[len(base):].lstrip(os.sep)
    if any(p.startswith(".") for p in inside.split(os.sep) if p):
        return (None, None)
    if os.path.isfile(full):
        return (full, "file")
    if os.path.isdir(full):
        return (full, "dir")
    return (None, None)


class _ShareTooBig(Exception):
    """Raised while zipping a shared folder that exceeds SHARE_ZIP_MAX_* caps."""


def _read_shares():
    """Load the share registry, tolerating a missing/old-format/corrupt file."""
    try:
        with open(_shares_file()) as f:
            data = json.load(f)
        if not isinstance(data, dict):
            raise ValueError
    except (FileNotFoundError, json.JSONDecodeError, ValueError, OSError):
        data = {}
    return data


def _write_shares(data):
    _atomic_write(_shares_file(), json.dumps(data))


def _share_prune(reg, now=None):
    """Drop entries whose expiry has passed (expires==0 means never). Mutates and
    returns the registry. Any malformed entry is dropped too."""
    if now is None:
        now = time.time()
    for tok in list(reg.keys()):
        ent = reg.get(tok)
        if not isinstance(ent, dict) or "rel" not in ent:
            del reg[tok]
            continue
        exp = ent.get("expires", 0) or 0
        if exp and now >= exp:
            del reg[tok]
    return reg


def _office_user_env(user):
    """Environment for running headless LibreOffice as APP_USER (the View->PDF
    converter) — HOME for the LO profile, plus PATH/LANG."""
    try:
        pw = pwd.getpwnam(user)
    except KeyError:
        return None
    return {
        "HOME": pw.pw_dir,
        "PATH": "/usr/bin:/bin",
        "LANG": os.environ.get("LANG", "en_US.UTF-8"),
    }


# ---- OnlyOffice Document Server helpers -------------------------------------

def _onlyoffice_secret():
    try:
        with open(ONLYOFFICE_SECRET_FILE) as f:
            return f.read().strip()
    except OSError:
        return None


def _onlyoffice_doctype(ext):
    ext = ext.lower()
    if ext in _OO_CELL:
        return "cell"
    if ext in _OO_SLIDE:
        return "slide"
    return "word"


def _onlyoffice_sig(secret, user, rel):
    """Short HMAC over (user, path) — authorizes the doc/callback endpoints, which
    the container reaches unauthenticated (Cloudflare Access is edge-only). Binding
    the USER means a token minted for one user's file can't be replayed to read or
    overwrite another user's path."""
    msg = f"{user}\x00{rel}".encode()
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()[:32]


def _b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _jwt_sign(payload, secret):
    head = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    seg = f"{head}.{body}"
    sig = _b64url(hmac.new(secret.encode(), seg.encode(), hashlib.sha256).digest())
    return f"{seg}.{sig}"


def _jwt_verify(token, secret):
    try:
        head, body, sig = token.split(".")
        expect = _b64url(hmac.new(secret.encode(), f"{head}.{body}".encode(),
                                  hashlib.sha256).digest())
        if not hmac.compare_digest(expect, sig):
            return None
        pad = "=" * (-len(body) % 4)
        claims = json.loads(base64.urlsafe_b64decode(body + pad))
        # A JWT payload can decode to any JSON type (list/str/int). Callers do
        # claims.get(...), so only a dict is a valid result — anything else is
        # rejected rather than left to raise AttributeError downstream.
        return claims if isinstance(claims, dict) else None
    except Exception:
        return None


# ---- Auth: PAM login + signed session cookie -------------------------------
# vibetop's identity IS the host's Linux accounts (multi-user Option B): a user
# logs in with their real Linux username+password, authenticated via PAM (same
# stack as SSH/login), and everything then runs as that user. The manager runs as
# root, which PAM needs to read the shadow database. This is the auth foundation
# (Phase 1); per-user runtime routing lands in later phases.

SESSION_COOKIE = "vt_session"
SESSION_TTL = 7 * 24 * 3600                      # "remember me" for 7 days
SESSION_SECRET_FILE = "/etc/vibetop/session.secret"
PAM_SERVICE = os.environ.get("VIBETOP_PAM_SERVICE", "vibetop")
_USERNAME_RE = re.compile(r"^[a-z_][a-z0-9_-]{0,31}$")   # POSIX-ish login name
_session_secret_cache = None
_session_secret_lock = threading.Lock()


def _session_secret():
    """The HMAC key for session cookies. Read from a root-owned 0600 file, created
    on first use. Falls back to an ephemeral in-memory key if the path isn't
    writable (e.g. under pytest) — fine, it just invalidates cookies on restart."""
    global _session_secret_cache
    if _session_secret_cache:
        return _session_secret_cache
    with _session_secret_lock:
        if _session_secret_cache:
            return _session_secret_cache
        try:
            with open(SESSION_SECRET_FILE) as f:
                sec = f.read().strip()
            if sec:
                _session_secret_cache = sec
                return sec
        except OSError:
            pass
        sec = secrets.token_hex(32)
        try:
            os.makedirs(os.path.dirname(SESSION_SECRET_FILE), exist_ok=True)
            fd = os.open(SESSION_SECRET_FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w") as f:
                f.write(sec)
        except FileExistsError:                  # a racing process wrote it first
            try:
                with open(SESSION_SECRET_FILE) as f:
                    sec = f.read().strip() or sec
            except OSError:
                pass
        except OSError:
            pass                                 # not persistable — ephemeral key
        _session_secret_cache = sec
        return sec


def _sign_session(user, ttl=SESSION_TTL):
    """A session token = the OnlyOffice-style HS256 JWT over {u, e, exp}, signed
    with the session secret (reuses _jwt_sign so there's one signing primitive).
    `e` is the user's token epoch at mint time — a 'log out everywhere' bumps it,
    invalidating this and every other token for the user."""
    return _jwt_sign({"u": user, "e": _user_token_epoch(user),
                      "exp": int(time.time()) + int(ttl)}, _session_secret())


def _verify_session(token):
    """Return the username from a valid, unexpired, non-revoked session token."""
    claims = _jwt_verify(token, _session_secret())
    if not claims:
        return None
    try:
        if int(claims.get("exp", 0)) < int(time.time()):
            return None
    except (TypeError, ValueError):
        return None
    u = claims.get("u")
    if not (isinstance(u, str) and _USERNAME_RE.match(u)):
        return None
    # Session revocation: a token minted before the user's last "log out
    # everywhere" (its epoch < the current epoch) is rejected.
    try:
        if int(claims.get("e", 0)) < _user_token_epoch(u):
            return None
    except (TypeError, ValueError):
        return None
    return u


# --- PAM authentication via ctypes (no pip dependency; libpam is always present
# on Debian/Ubuntu). Single-shot: answer the password prompt(s), run auth +
# account management. Returns True only on PAM_SUCCESS for both. -------------
class _PamMessage(ctypes.Structure):
    _fields_ = [("msg_style", ctypes.c_int), ("msg", ctypes.c_char_p)]


class _PamResponse(ctypes.Structure):
    _fields_ = [("resp", ctypes.c_char_p), ("resp_retcode", ctypes.c_int)]


_PAM_CONV_FUNC = ctypes.CFUNCTYPE(
    ctypes.c_int, ctypes.c_int,
    ctypes.POINTER(ctypes.POINTER(_PamMessage)),
    ctypes.POINTER(ctypes.POINTER(_PamResponse)),
    ctypes.c_void_p)


class _PamConv(ctypes.Structure):
    _fields_ = [("conv", _PAM_CONV_FUNC), ("appdata_ptr", ctypes.c_void_p)]


def _pam_authenticate(username, password, service=None):
    """Authenticate `username`/`password` against PAM service `service`.
    Returns True on success. Any error (missing libpam, bad service, wrong creds)
    returns False — never raises."""
    service = (service or PAM_SERVICE)
    try:
        libpam = ctypes.CDLL(ctypes.util.find_library("pam") or "libpam.so.0")
        libc = ctypes.CDLL(ctypes.util.find_library("c") or "libc.so.6")
    except OSError:
        log.warning("PAM unavailable (libpam not loadable)")
        return False

    calloc = libc.calloc
    calloc.restype = ctypes.c_void_p
    calloc.argtypes = [ctypes.c_size_t, ctypes.c_size_t]
    strdup = libc.strdup
    strdup.restype = ctypes.c_void_p
    strdup.argtypes = [ctypes.c_char_p]

    pw_bytes = password.encode("utf-8", "surrogateescape")

    # PAM frees the response array + strings, so they must be malloc'd (calloc/
    # strdup), never Python-owned memory.
    @_PAM_CONV_FUNC
    def _conv(n_msg, messages, p_response, _app):
        buf = calloc(n_msg, ctypes.sizeof(_PamResponse))
        if not buf:
            return 5                              # PAM_BUF_ERR
        p_response[0] = ctypes.cast(buf, ctypes.POINTER(_PamResponse))
        for i in range(n_msg):
            style = messages[i].contents.msg_style
            if style in (1, 2):                   # PROMPT_ECHO_OFF / PROMPT_ECHO_ON
                p_response[0][i].resp = ctypes.cast(strdup(pw_bytes), ctypes.c_char_p)
                p_response[0][i].resp_retcode = 0
        return 0                                  # PAM_SUCCESS

    handle = ctypes.c_void_p()
    conv = _PamConv(_conv, None)
    pam_start = libpam.pam_start
    pam_start.restype = ctypes.c_int
    pam_start.argtypes = [ctypes.c_char_p, ctypes.c_char_p,
                          ctypes.POINTER(_PamConv), ctypes.POINTER(ctypes.c_void_p)]
    rc = pam_start(service.encode(), username.encode(), ctypes.byref(conv),
                   ctypes.byref(handle))
    if rc != 0:
        log.warning("pam_start failed (%s) for service %s", rc, service)
        return False
    try:
        for fn in ("pam_authenticate", "pam_acct_mgmt"):
            f = getattr(libpam, fn)
            f.restype = ctypes.c_int
            f.argtypes = [ctypes.c_void_p, ctypes.c_int]
            rc = f(handle, 0)
            if rc != 0:
                return False
        return True
    finally:
        pam_end = libpam.pam_end
        pam_end.restype = ctypes.c_int
        pam_end.argtypes = [ctypes.c_void_p, ctypes.c_int]
        pam_end(handle, rc)


def _authenticate(user, password):
    """Identity check seam — wraps PAM. Tests monkeypatch this to avoid real
    credentials."""
    return _pam_authenticate(user, password, PAM_SERVICE)


# Login brute-force lockout: per-username failed-attempt tracking. After
# LOGIN_MAX_FAILS failures within LOGIN_FAIL_WINDOW seconds, further attempts are
# refused (429) for the rest of the window — cheap defense on top of PAM (the
# server is threaded, so attempts would otherwise parallelize freely).
LOGIN_MAX_FAILS = int(os.environ.get("LOGIN_MAX_FAILS", "10"))
LOGIN_FAIL_WINDOW = int(os.environ.get("LOGIN_FAIL_WINDOW", "300"))
_login_fails = {}
_login_fails_lock = threading.Lock()


def _login_recent_fails(user, now):
    return [t for t in _login_fails.get(user, []) if now - t < LOGIN_FAIL_WINDOW]


def _login_locked(user, now=None):
    now = time.time() if now is None else now
    with _login_fails_lock:
        fails = _login_recent_fails(user, now)
        _login_fails[user] = fails
        return len(fails) >= LOGIN_MAX_FAILS


def _login_record_fail(user, now=None):
    now = time.time() if now is None else now
    with _login_fails_lock:
        fails = _login_recent_fails(user, now)
        fails.append(now)
        _login_fails[user] = fails
        if len(_login_fails) > 10000:      # bound the map against username spraying
            for k in [k for k, v in _login_fails.items() if not _login_recent_fails(k, now)]:
                _login_fails.pop(k, None)


def _login_clear(user):
    with _login_fails_lock:
        _login_fails.pop(user, None)


# Paths reachable WITHOUT a session — the allowlist that the nginx auth_request
# gate consults via /api/authcheck (X-Original-URI). Kept here (not in nginx) so
# it's one testable policy:
#   - login/logout/authcheck: the auth handshake itself
#   - ping/health/metrics: loopback liveness/diagnostics (also hit directly, but
#     harmless to allow through nginx too)
#   - office callback/doc: the OnlyOffice CONTAINER reaches these server-to-server
#     (no browser cookie); they're authorized by their own path HMAC + JWT
# /s/ share links are a separate nginx location with no auth_request, so they
# aren't listed here.
_PUBLIC_EXACT = frozenset({
    "/api/login", "/api/logout", "/api/authcheck",
    "/api/ping", "/api/health", "/api/metrics",
    # OnlyOffice CONTAINER endpoints (server-to-server, no browser cookie) — each is
    # its own HMAC+JWT-gated exact path, matched exactly (NOT startswith, so a
    # crafted /api/office/doc-anything can never ride the allowlist).
    "/api/office/callback", "/api/office/doc",
})


def _is_public_path(uri):
    """True if `uri` (an nginx X-Original-URI, may carry a query) is reachable
    without a session. Exact-match only. Pure function — unit-tested."""
    if not isinstance(uri, str):
        return False
    return uri.split("?", 1)[0] in _PUBLIC_EXACT


def _office_convert_to_pdf(src, user=None):
    """Convert `src` to PDF via headless LibreOffice **as `user`** (default: the
    current request's user), cached by realpath+mtime under that user's cache dir.
    Returns the cached PDF path, or None on failure. Serialized: LibreOffice locks
    its profile, so two conversions can't share one safely."""
    user = user or _ctx_user()
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        return None
    try:
        st = os.stat(src)
    except OSError:
        return None
    cache_dir = _office_cache_dir(user)
    key = hashlib.sha1(f"{src}:{int(st.st_mtime)}:{st.st_size}".encode()).hexdigest()
    cached = os.path.join(cache_dir, key + ".pdf")
    if os.path.isfile(cached):
        return cached
    with _office_convert_lock:
        if os.path.isfile(cached):       # another thread just made it
            return cached
        os.makedirs(cache_dir, exist_ok=True)
        _chown_app(cache_dir, user)
        _chown_app(os.path.dirname(cache_dir), user)
        env = _office_user_env(user)
        if env is None:
            return None
        try:
            p = subprocess.run(
                [soffice, "--headless", "--nologo", "--norestore",
                 "-env:UserInstallation=file://" + _office_convert_profile(user),
                 "--convert-to", "pdf", "--outdir", cache_dir, src],
                env=env, user=user, capture_output=True, text=True, timeout=120)
        except Exception:
            return None
        # LibreOffice writes <stem>.pdf into outdir; rename to the cache key.
        produced = os.path.join(cache_dir,
                                os.path.splitext(os.path.basename(src))[0] + ".pdf")
        if not os.path.isfile(produced):
            return None
        try:
            os.replace(produced, cached)
        except OSError:
            return None
        _chown_app(cached, user)
        return cached


def _git(args, timeout=60):
    """Run git in REPO_DIR as APP_USER (the repo owner — root trips git's
    dubious-ownership guard, and only APP_USER holds the credentials). Module
    level so both the request handler and startup seeding can use it."""
    cmd = ["sudo", "-n", "-u", APP_USER, "-H", "git", "-C", REPO_DIR] + list(args)
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return p.returncode == 0, (p.stdout + p.stderr).strip()
    except Exception as e:
        return False, str(e)


# Serializes the update-history read-modify-write so concurrent /api/update,
# /api/update/history/clear, and the startup seed can't lose entries or race the
# first-run baseline. Held only for the brief file read-modify-write — NOT across
# the long pull/redeploy (that's _update_run_lock below), so the frequently-polled
# GET /api/update (which calls _seed_update_history) never blocks behind a running
# update.
_update_lock = threading.Lock()

# Serializes the whole update OPERATION (git fetch/reset/stash/ff + redeploy) so
# two concurrent /api/update or /api/update/check passes can't run in one
# checkout at once (index.lock conflicts, half-applied trees). Separate from
# _update_lock so a long update doesn't stall version-info reads/history appends.
_update_run_lock = threading.Lock()


def _read_update_history():
    try:
        with open(UPDATE_HISTORY_FILE) as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _write_update_history(entries):
    try:
        _atomic_write(UPDATE_HISTORY_FILE, json.dumps(entries[-UPDATE_HISTORY_MAX:]))
    except Exception:
        pass


def _append_update_history(entry):
    with _update_lock:
        h = _read_update_history()
        h.append(entry)
        _write_update_history(h)


def _seed_update_history():
    """Write a 'deployed' baseline the first time the manager runs (≈ deploy
    time), so the per-host log starts from when this deployment came up."""
    with _update_lock:
        if os.path.exists(UPDATE_HISTORY_FILE):
            return
        ok, head = _git(["log", "-1", "--format=%h\t%s"])
        commit, subject = (head.split("\t", 1) + [""])[:2] if (ok and "\t" in head) else ("", "")
        _write_update_history([{"time": int(time.time()), "event": "deployed",
                                "to": commit, "subject": subject}])


_URL_BAD_CHARS = ('"', "'", ";", "`", "$", "(", ")", "\n", "\\")


def _valid_browser_url(url):
    """True if `url` is safe to hand to `chromium <url>` via a shell. Rejects
    anything that isn't http(s) or contains shell metacharacters — the command
    is built into an `su -c` string, so an unsanitized URL is a shell-injection
    vector. Kept as a pure function so it can be unit-tested in isolation."""
    if not url or not url.startswith(("http://", "https://")):
        return False
    return not any(c in url for c in _URL_BAD_CHARS)


_WIN_ID_RE = re.compile(r"^0x[0-9a-fA-F]{1,16}$")


def _valid_x_window_id(wid):
    """True if `wid` is a wmctrl window id (0x-prefixed hex). The id is passed
    to `wmctrl -i -a/-c <id>` as a subprocess argv element (not a shell string),
    but validating it keeps a malformed value from reaching wmctrl at all. Pure
    function so it can be unit-tested in isolation."""
    return bool(wid and _WIN_ID_RE.match(wid))


def _valid_launch_cmd(cmd):
    """True if `cmd` is acceptable to run on the xpra display. The command is the
    user's own shell command (they already have a terminal as this user, so this
    is no privilege escalation) — we only reject empty, over-long, or commands
    with NUL / newlines that would split the `su -c` string into extra commands."""
    if not cmd or len(cmd) > 1024:
        return False
    return "\n" not in cmd and "\r" not in cmd and "\x00" not in cmd


def _launch_prog(cmd):
    """The program token of a shell command, skipping a leading `env` and any
    VAR=val assignments (e.g. 'env FOO=1 eog x.jpg' -> 'eog', 'A=b /snap/bin/x'
    -> '/snap/bin/x'). Pure function — used to decide which D-Bus session a
    launched app gets (snap apps need the real user bus; others get the private
    apps bus)."""
    try:
        toks = shlex.split(cmd)
    except ValueError:
        toks = cmd.split()
    i = 0
    while i < len(toks):
        t = toks[i]
        if os.path.basename(t) == "env" or re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", t):
            i += 1
            continue
        break
    return toks[i] if i < len(toks) else ""


def _safe_upload_name(name):
    # Browsers may send "C:\\fakepath\\foo.jpg" or "../etc/passwd".
    # Strip any directory components and disallowed characters.
    name = (name or "").replace("\\", "/").split("/")[-1].strip()
    name = re.sub(r"[\x00-\x1f]", "", name)
    if not name or name in (".", ".."):
        name = "upload"
    return name[:255]


def _unique_path(path):
    if not os.path.exists(path):
        return path
    base, ext = os.path.splitext(path)
    for i in range(1, 10000):
        cand = f"{base}-{i}{ext}"
        if not os.path.exists(cand):
            return cand
    raise _MultipartError("destination exists, too many collisions")


def _open_unique(path):
    """Open `path` for exclusive write (O_EXCL), falling back to `path-1`,
    `path-2`, … on collision. Closes the _unique_path check-then-open TOCTOU:
    two concurrent uploads of the same name could both pick the same free path
    and one clobber the other. Returns (file-object, actual-path)."""
    base, ext = os.path.splitext(path)
    for i in range(0, 10000):
        cand = path if i == 0 else f"{base}-{i}{ext}"
        try:
            return os.fdopen(os.open(cand, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644), "wb"), cand
        except FileExistsError:
            continue
    raise _MultipartError("destination exists, too many collisions")


class _BoundaryReader:
    """Streams the body of one multipart part, stopping at the next boundary.
    Reads chunks from `src` while always holding back enough bytes to detect
    the boundary mid-chunk. On exhaustion, `done` becomes True and `next_term`
    tells the outer loop whether more parts follow (\\r\\n) or this was the
    closing boundary (--)."""
    def __init__(self, src, boundary):
        self._src = src
        self._sep = b"\r\n" + boundary
        self._buf = b""
        self.done = False
        self.next_term = b""
        self.leftover = b""   # bytes past the boundary; belong to next part

    def read(self, _size=-1):
        # Invariant: only return b"" when self.done is True (so callers like
        # shutil.copyfileobj loop until the part is fully drained).
        while not self.done:
            idx = self._buf.find(self._sep)
            if idx != -1:
                out = self._buf[:idx]
                tail = idx + len(self._sep)
                while len(self._buf) < tail + 2:
                    more = self._src.read(2)
                    if not more:
                        raise _MultipartError("unexpected EOF after boundary")
                    self._buf += more
                self.next_term = self._buf[tail:tail + 2]
                self.leftover = self._buf[tail + 2:]
                self._buf = b""
                self.done = True
                return out
            keep = len(self._sep)
            if len(self._buf) > keep:
                out = self._buf[:-keep]
                self._buf = self._buf[-keep:]
                return out
            chunk = self._src.read(65536)
            if not chunk:
                raise _MultipartError("unexpected EOF in part body")
            self._buf += chunk
        return b""


def _iter_multipart_files(src, boundary):
    """Yield (filename, file-like) for each file part in the multipart body."""
    # Discard prelude up to first boundary.
    buf = b""
    while True:
        chunk = src.read(65536)
        if not chunk:
            raise _MultipartError("empty body")
        buf += chunk
        idx = buf.find(boundary)
        if idx != -1:
            # Need 2 bytes after to know if it's the only/last boundary.
            while len(buf) < idx + len(boundary) + 2:
                more = src.read(2)
                if not more:
                    raise _MultipartError("truncated boundary")
                buf += more
            term = buf[idx + len(boundary):idx + len(boundary) + 2]
            if term == b"--":
                return  # empty form
            # Push remaining bytes back into a tiny in-memory stream so the
            # part header parser sees them along with the next read().
            leftover = buf[idx + len(boundary) + 2:]
            src = _PrependedReader(leftover, src)
            break

    while True:
        # Read headers up to blank line.
        headers = b""
        while b"\r\n\r\n" not in headers:
            chunk = src.read(4096)
            if not chunk:
                raise _MultipartError("truncated headers")
            headers += chunk
        head, _, rest = headers.partition(b"\r\n\r\n")
        src = _PrependedReader(rest, src)
        disposition = ""
        for line in head.split(b"\r\n"):
            if line.lower().startswith(b"content-disposition:"):
                disposition = line.decode("utf-8", "replace")
                break
        reader = _BoundaryReader(src, boundary)
        fn_match = re.search(r'filename="([^"]*)"', disposition)
        if fn_match:
            yield fn_match.group(1), reader
        # Drain anything the consumer didn't read (and drain non-file fields).
        while not reader.done:
            if not reader.read():
                break
        if reader.next_term == b"--":
            return
        # Carry over any bytes the reader buffered past the boundary so the
        # next part's headers see a contiguous stream.
        src = _PrependedReader(reader.leftover, src)


class _PrependedReader:
    """Wrap a stream so its first reads yield `head` before falling through."""
    def __init__(self, head, src):
        self._head = head
        self._src = src

    def read(self, size=-1):
        if self._head:
            if size < 0 or size >= len(self._head):
                out = self._head
                self._head = b""
                return out
            out = self._head[:size]
            self._head = self._head[size:]
            return out
        return self._src.read(size if size > 0 else 65536)


class _LimitedReader:
    """Cap reads from a socket-like stream at exactly Content-Length bytes.
    Without this, reads past the body length block forever on a keep-alive
    socket — there is no EOF signal until the client closes."""
    def __init__(self, src, length):
        self._src = src
        self._left = length

    def read(self, size=-1):
        if self._left <= 0:
            return b""
        if size is None or size < 0 or size > self._left:
            size = self._left
        data = self._src.read(size)
        self._left -= len(data)
        return data


class Handler(http.server.BaseHTTPRequestHandler):
    def _get_running_terminals(self):
        # 2s TTL, per-user: both /api/system/status and /api/terminals/status poll
        # this, and each miss forks `systemctl list-units`. Scoped to the request
        # user so each user sees only their own running terminals.
        user = _ctx_user()
        return _cached("running_terminals:" + user, 2.0,
                       lambda: _list_running_terminals(user))

    def _get_system_status(self):
        # Collection lives in system_status.py; inject the running-terminal
        # list and the shared _cached memoizer (terminal start/stop
        # invalidates its running_terminals entry). Guarded so an unexpected
        # /proc/sysfs hiccup degrades to a 200 with an error, not a 500.
        try:
            st = system_status.get_system_status(
                self._get_running_terminals(), _cached)
        except Exception as e:
            log.warning("system status collection failed: %s", e)
            return {"error": "status unavailable: %s" % e}
        # Multi-user: the top-processes list carries every user's process names —
        # a non-admin sees only their OWN processes (the operator sees all). CPU/
        # MEM/GPU aggregates stay visible to everyone (just hardware stats).
        if isinstance(st, dict) and st.get("processes") and _ctx_user() != APP_USER:
            me = _ctx_user()
            st = dict(st)
            st["processes"] = [p for p in st["processes"] if p.get("user") == me]
        return st

    def _read_body(self, max_len):
        """Read the request body bounded by Content-Length. Returns the bytes,
        or None if the header is missing/non-numeric/over `max_len` — so a bad
        header can't crash the handler thread (a bare `int(...)` raised
        ValueError) — and times out a stalled read (30s) instead of blocking the
        thread forever when a client's Content-Length exceeds what it sends."""
        try:
            length = int(self.headers.get("Content-Length", 0) or 0)
        except (TypeError, ValueError):
            return None
        if length < 0 or length > max_len:
            return None
        if length == 0:
            return b""
        try:
            self.connection.settimeout(30)
            return self.rfile.read(length)
        except (OSError, socket.timeout):
            return None
        finally:
            try:
                self.connection.settimeout(None)
            except OSError:
                pass

    def _csrf_ok(self):
        """Reject cross-site browser POSTs. State-changing endpoints (launch a
        command, reset, update, upload) have no application-layer auth — the trust
        model is Cloudflare Access + a trusted LAN. But that leaves them open to a
        CSRF: a malicious page the user visits can fetch() the LAN/origin manager
        (json.loads of the raw body sidesteps a CORS preflight, and the browser
        still attaches the user's Access cookie). So when a browser DOES send an
        Origin, require it to match this request's Host. Requests with no Origin
        (curl/the operational CLI, the OnlyOffice container's server-side
        callback, health tooling) are unaffected — they aren't browser contexts
        and aren't a CSRF vector."""
        origin = self.headers.get("Origin")
        if not origin:
            return True
        host = self.headers.get("Host", "")
        try:
            return urllib.parse.urlparse(origin).netloc == host
        except Exception:
            return False

    # ---- Auth (Phase 1): PAM login + session cookie ------------------------
    def _cookie_value(self, name):
        raw = self.headers.get("Cookie")
        if not raw:
            return None
        try:
            jar = http.cookies.SimpleCookie(raw)
        except http.cookies.CookieError:
            return None
        m = jar.get(name)
        return m.value if m else None

    def _session_user(self):
        """The authenticated Linux username for this request, or None."""
        tok = self._cookie_value(SESSION_COOKIE)
        return _verify_session(tok) if tok else None

    def _bind_request_user(self):
        """Bind this request's authenticated Linux user into the thread-local
        context so the per-user path helpers (_ctx_home) resolve under their home.
        Cookieless requests (loopback admin, the OnlyOffice container) fall back to
        APP_USER. Re-set per request so a keep-alive connection can't leak identity
        between requests on the same thread."""
        try:
            _req_ctx.user = self._session_user()
        except Exception:
            _req_ctx.user = None

    def _require_admin(self):
        """Guard for subsystems NOT yet made per-user (Browser/X11, Files-as-view,
        Claude-usage, Update). The gate admits every Linux user, but these still
        act as APP_USER — so a non-admin user calling them would act AS the
        operator (RCE/DoS/data). Restrict them to the operator (APP_USER) until
        each is per-user. Returns True if allowed; else writes 403 and returns
        False. Cookieless loopback/admin tooling (_ctx_user()==APP_USER) passes."""
        if _ctx_user() == APP_USER:
            return True
        log.warning("admin-only %s denied for user %s", self.path, _ctx_user())
        self._json(403, {"error": "this feature is available to the operator only "
                                  "(not yet per-user)"})
        return False

    def _req_is_https(self):
        # nginx forwards the original scheme; over the tunnel/TLS it's https.
        return self.headers.get("X-Forwarded-Proto", "").lower() == "https"

    def _handle_login(self):
        """POST {username,password} -> PAM auth -> set a signed 7-day cookie."""
        body = self._read_body(64 * 1024)
        if body is None:
            return self._json(400, {"error": "invalid or too-large body"})
        try:
            data = json.loads(body or b"{}")
        except ValueError:
            return self._json(400, {"error": "invalid json"})
        user = data.get("username", "")
        pw = data.get("password", "")
        if not isinstance(user, str) or not isinstance(pw, str) or not user or not pw:
            return self._json(400, {"error": "username and password required"})
        if _login_locked(user):
            log.warning("login locked (too many failures) for %r from %s",
                        user, self.address_string())
            time.sleep(0.5)
            return self._json(429, {"error": "too many failed attempts — "
                                             "try again in a few minutes"})
        ok = False
        if _USERNAME_RE.match(user) and len(pw) <= 1024:
            try:
                ok = bool(_authenticate(user, pw))
            except Exception as e:                # never let an auth backend error 500
                log.warning("auth backend error for %r: %s", user, e)
        if not ok:
            _login_record_fail(user)
            time.sleep(0.5)                       # per-attempt friction
            log.warning("failed login for %r from %s", user, self.address_string())
            return self._json(401, {"error": "invalid credentials"})
        _login_clear(user)                        # reset on success
        tok = _sign_session(user)
        cookie = (f"{SESSION_COOKIE}={tok}; Path=/; HttpOnly; SameSite=Lax; "
                  f"Max-Age={SESSION_TTL}")
        if self._req_is_https():
            cookie += "; Secure"
        payload = json.dumps({"ok": True, "user": user}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Set-Cookie", cookie)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)
        log.info("login ok: %s", user)

    def _clear_session_cookie(self, payload=b'{"ok": true}'):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Set-Cookie",
                         f"{SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def _handle_logout(self):
        # This device only: clear the vt_session cookie. Other devices/tokens for
        # the same user stay valid until they expire (stateless-cookie auth).
        self._clear_session_cookie()

    def _handle_logout_all(self):
        # Everywhere: bump the user's token epoch so EVERY issued session for them
        # is rejected on its next request (this device's cookie is cleared too).
        # Requires a valid session (never falls back to APP_USER) so an anonymous
        # request can't invalidate the operator.
        user = self._session_user()
        if not user:
            return self._json(401, {"error": "not signed in"})
        _bump_token_epoch(user)
        log.info("logout-all: %s (all sessions invalidated)", user)
        self._clear_session_cookie()

    def _ensure_user_terminal(self, user, n):
        """Return the per-user port for terminal N, starting the terminal (as the
        user) if it isn't already running. Idempotent + cheap on the hot path: the
        running set is cached ~2s, so only a genuine cold /tN/ triggers a start."""
        port = _user_term_port(user, n)
        running = _cached("running_terminals:" + user, 2.0,
                          lambda: _list_running_terminals(user))
        if n not in running:
            ok, res = _start_user_terminal(user, n)
            _cache.pop("running_terminals:" + user, None)
            if not ok:
                log.warning("authcheck: start terminal %s-%d failed: %s", user, n, res)
        return port

    def _ensure_user_filebrowser(self, user):
        """Return the user's FileBrowser port, starting it (as the user) on demand.
        Memoized ~5s so the hot /files/ path doesn't re-check systemd every request."""
        def _start():
            ok, res = _start_user_filebrowser(user)
            if not ok:
                log.warning("authcheck: start filebrowser for %s failed: %s", user, res)
                return None
            return res
        return _cached("fb_port:" + user, 5.0, _start)

    def _ensure_user_xpra(self, user, kind):
        """Return the user's `kind` (browser|x11) xpra port, starting it on demand.
        Memoized ~5s so the hot asset requests don't re-check systemd each time."""
        def _start():
            ok, res = _start_user_xpra(user, kind)
            if not ok:
                log.warning("authcheck: start %s xpra for %s failed: %s", kind, user, res)
                return None
            return res
        return _cached(f"xpra_port:{kind}:" + user, 5.0, _start)

    def _handle_authcheck(self):
        """nginx auth_request target. Allows public paths (the allowlist) through
        regardless of cookie; otherwise requires a valid session and returns the
        username in X-Vibetop-User. For a /tN/ request it also resolves (and
        cold-starts) the user's per-user terminal port in X-Term-Port, which nginx
        routes to. 401 when unauthenticated on a gated path."""
        orig = self.headers.get("X-Original-URI", "")
        if _is_public_path(orig):
            self.send_response(200)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        user = self._session_user()
        if not user:
            self.send_response(401)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        path = orig.split("?", 1)[0]
        # /fileview/ serves raw files as the nginx worker (APP_USER's tree, shared
        # embedded Browser) -> operator only until it's per-user (Phase 3c).
        if path.startswith("/fileview/") and user != APP_USER:
            self.send_response(403)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("X-Vibetop-User", user)
        m = re.match(r"/t(\d+)(?:/|$)", path)
        if m:
            n = int(m.group(1))
            if 1 <= n <= MAX_INSTANCE:
                try:
                    self.send_header("X-Term-Port", str(self._ensure_user_terminal(user, n)))
                except Exception as e:
                    log.warning("authcheck: term-port resolve failed: %s", e)
        elif path.startswith("/files/"):
            try:
                port = self._ensure_user_filebrowser(user)
                if port:
                    self.send_header("X-App-Port", str(port))
            except Exception as e:
                log.warning("authcheck: files-port resolve failed: %s", e)
        elif path.startswith("/browser/") or path.startswith("/x11-display/"):
            kind = "browser" if path.startswith("/browser/") else "x11"
            try:
                port = self._ensure_user_xpra(user, kind)
                if port:
                    self.send_header("X-App-Port", str(port))
            except Exception as e:
                log.warning("authcheck: %s-port resolve failed: %s", kind, e)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        self._bind_request_user()
        # The OnlyOffice container's save callback is a server-to-server POST
        # authenticated by its own path HMAC (t=) + a required JWT, not a browser
        # request — exempt it from the Origin/CSRF gate so a proxy that injected
        # an Origin can't 403 it and silently lose document saves.
        if self.path.split("?", 1)[0] != "/api/office/callback" and not self._csrf_ok():
            log.warning("rejected cross-origin POST to %s (Origin=%s Host=%s)",
                        self.path, self.headers.get("Origin"), self.headers.get("Host"))
            self._json(403, {"error": "cross-origin request rejected"})
            return
        if self.path == "/api/login":
            return self._handle_login()
        if self.path == "/api/logout":
            return self._handle_logout()
        if self.path == "/api/logout/all":
            return self._handle_logout_all()
        m = re.match(r"/api/terminals/(\d+)/(start|stop)$", self.path)
        if m:
            return self._handle_terminal(m)
        if self.path == "/api/terminals/names":
            return self._handle_tab_names_save()
        if self.path == "/api/browser/open":
            return self._handle_browser_open()
        if self.path == "/api/x/launch":
            return self._handle_x_launch()
        if self.path == "/api/x/activate":
            return self._x_window_action("-a")
        if self.path == "/api/x/close":
            return self._x_window_action("-c")
        if self.path.startswith("/api/office/callback"):
            return self._handle_office_callback()
        if self.path == "/api/office/forcesave":
            return self._handle_office_forcesave()
        if self.path == "/api/office/new":
            return self._handle_office_new()
        if self.path == "/api/notes":
            return self._handle_notes_save()
        if self.path == "/api/notes/tabs":
            return self._handle_notes_tabs()
        if self.path == "/api/files/tabs":
            return self._handle_files_tabs_save()
        if self.path == "/api/share":
            return self._handle_share_create()
        if self.path == "/api/share/revoke":
            return self._handle_share_revoke()
        if self.path == "/api/desktop":
            return self._handle_desktop_save()
        if self.path == "/api/desktop/close":
            return self._handle_desktop_close()
        if self.path == "/api/desktop/ui":
            return self._handle_desktop_ui()
        if self.path == "/api/reset":
            return self._handle_reset()
        if self.path == "/api/upload":
            return self._handle_upload()
        if self.path == "/api/upload/clear":
            return self._handle_upload_clear()
        if self.path == "/api/update/check":
            return self._handle_update_check()
        if self.path == "/api/update":
            return self._handle_update()
        if self.path == "/api/update/history/clear":
            if not self._require_admin():
                return
            with _update_lock:
                _write_update_history([])
            return self._json(200, {"ok": True})
        if self.path == "/api/claude/usage":
            # Reads/writes APP_USER's ~/.claude/settings.json + a single shared
            # proxy service -> operator only until per-user (else any user toggles
            # the admin's Claude proxy routing).
            if not self._require_admin():
                return
            raw = self._read_body(64 * 1024)
            if raw is None:
                return self._json(400, {"error": "invalid or too-large body"})
            try:
                data = json.loads(raw or b"{}")
            except ValueError:
                return self._json(400, {"error": "invalid json"})
            try:
                _set_claude_usage(bool(data.get("enabled")))
            except Exception as e:
                log.warning("claude usage toggle failed: %s", e)
                return self._json(500, {"error": str(e)})
            return self._json(200, {"ok": True, "enabled": _claude_usage_enabled()})
        self.send_error(404)

    def _handle_upload_clear(self):
        # Delete every regular file directly inside _upload_dir(). Subdirectories
        # are left alone (this endpoint is for clearing the quick-sync inbox,
        # not nuking arbitrary trees).
        if not os.path.isdir(_upload_dir()):
            self._json(200, {"ok": True, "removed": 0})
            return
        removed = 0
        for name in os.listdir(_upload_dir()):
            p = os.path.join(_upload_dir(), name)
            try:
                if os.path.isfile(p) and not os.path.islink(p):
                    os.remove(p)
                    removed += 1
            except OSError:
                pass
        self._json(200, {"ok": True, "removed": removed})

    def _handle_notes_save(self):
        # POST {id, content} — save one note's body. id defaults to "1" (legacy
        # single-note clients). temp+rename so a crash mid-save can't truncate it.
        body = self._read_body(1048576)
        if body is None:
            self._json(400, {"error": "invalid or too-large body (1MB max)"})
            return
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            self._json(400, {"error": "invalid json"})
            return
        nid = data.get("id") or "1"
        if not _safe_note_id(nid):
            return self._json(400, {"error": "bad note id"})
        content = data.get("content", "")
        if not isinstance(content, str):
            return self._json(400, {"error": "content must be a string"})
        os.makedirs(_notes_dir(), exist_ok=True)
        _chown_app(_notes_dir())
        _atomic_write(_note_file(nid), content)
        self._json(200, {"ok": True})

    def _handle_files_tabs_save(self):
        # POST {paths:[<FileBrowser URL>], active} — the Files app's shared tab set.
        body = self._read_body(65536)
        if body is None:
            return self._json(400, {"error": "invalid or too-large body"})
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            return self._json(400, {"error": "invalid json"})
        raw = data.get("paths")
        if not isinstance(raw, list):
            return self._json(400, {"error": "paths must be a list"})
        # Only keep real FileBrowser browse URLs (these become iframe src in the
        # wrapper, so reject anything that isn't a /files/files path).
        paths = [p for p in raw[:32]
                 if isinstance(p, str) and p.startswith("/files/files") and len(p) <= 2048]
        if not paths:
            paths = ["/files/files/"]
        active = data.get("active")
        if not isinstance(active, int) or active < 0 or active >= len(paths):
            active = 0
        with _files_tabs_lock:
            _atomic_write(_files_tabs_file(), json.dumps({"paths": paths, "active": active}))
        self._json(200, {"ok": True})

    def _handle_notes_tabs(self):
        # POST {tabs:[{id,name}], active} — the client owns the tab list; we store
        # it (order/names/active) and DELETE note files whose tab was closed.
        body = self._read_body(65536)
        if body is None:
            return self._json(400, {"error": "invalid or too-large body"})
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            return self._json(400, {"error": "invalid json"})
        raw = data.get("tabs")
        if not isinstance(raw, list) or not raw:
            return self._json(400, {"error": "tabs must be a non-empty list"})
        tabs, seen = [], set()
        for t in raw[:64]:
            if not isinstance(t, dict):
                continue
            nid = t.get("id")
            if not _safe_note_id(nid) or nid in seen:
                continue
            seen.add(nid)
            tabs.append({"id": nid, "name": (str(t.get("name") or "Note"))[:64]})
        if not tabs:
            return self._json(400, {"error": "no valid tabs"})
        active = data.get("active")
        if not (_safe_note_id(active) and active in seen):
            active = tabs[0]["id"]
        with _notes_lock:
            os.makedirs(_notes_dir(), exist_ok=True)
            _chown_app(_notes_dir())
            _write_notes_index({"tabs": tabs, "active": active})
            # A closed tab's note file is removed (the note is gone). The client
            # confirms before closing a non-empty note, so this isn't a surprise.
            try:
                for fn in os.listdir(_notes_dir()):
                    if fn.endswith(".md") and fn[:-3] not in seen:
                        try:
                            os.remove(os.path.join(_notes_dir(), fn))
                        except OSError:
                            pass
            except OSError:
                pass
        self._json(200, {"ok": True, "tabs": tabs, "active": active})

    def _handle_tab_names_save(self):
        # POST {n, name} — upsert (name null/empty clears). Server-side so the
        # rename propagates to every session, not just the browser that did it.
        body = self._read_body(65536)
        if body is None:
            return self._json(400, {"error": "invalid or too-large body"})
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            return self._json(400, {"error": "invalid json"})
        try:
            n = int(data.get("n"))
        except (TypeError, ValueError):
            return self._json(400, {"error": "bad terminal number"})
        name = data.get("name")
        with _tab_names_lock:
            names = _read_tab_names()
            if name:
                names[str(n)] = str(name)[:64]
            else:
                names.pop(str(n), None)
            _write_tab_names(names)
        self._json(200, {"ok": True, "names": names})

    def _handle_upload(self):
        # Parse multipart/form-data and stream each "file" part directly into
        # _upload_dir(). We don't use cgi.FieldStorage because it spools entire
        # uploads to memory/temp first; this hand-parser streams chunk-by-chunk
        # so multi-GB uploads stay flat in memory.
        ctype = self.headers.get("Content-Type", "")
        m = re.match(r'multipart/form-data;\s*boundary=(?:"([^"]+)"|([^;\s]+))', ctype)
        if not m:
            self._json(400, {"error": "expected multipart/form-data"})
            return
        boundary = ("--" + (m.group(1) or m.group(2))).encode()
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._json(411, {"error": "Content-Length required"})
            return
        if length <= 0:
            self._json(411, {"error": "Content-Length required"})
            return
        body = _LimitedReader(self.rfile, length)
        os.makedirs(_upload_dir(), exist_ok=True)
        _chown_app(_upload_dir())
        saved, total_bytes = [], 0
        partial = None  # file currently being written, if a part fails mid-copy
        try:
            for filename, src in _iter_multipart_files(body, boundary):
                safe = _safe_upload_name(filename)
                out, dst = _open_unique(os.path.join(_upload_dir(), safe))
                partial = dst
                with out:
                    shutil.copyfileobj(src, out)
                _chown_app(dst)
                size = os.path.getsize(dst)
                total_bytes += size
                saved.append({"name": os.path.basename(dst), "size": size})
                partial = None
        except _MultipartError as e:
            # Discard the half-written file, then drain the unread request body
            # so leftover bytes don't get parsed as the next request on a
            # keep-alive connection (which corrupts the following request).
            if partial:
                try:
                    os.remove(partial)
                except OSError:
                    pass
            try:
                while body.read(65536):
                    pass
            except Exception:
                pass
            self._json(400, {"error": str(e)})
            return
        except Exception as e:
            # A non-parse failure mid-copy (disk full, permission, I/O error).
            # Without this the partial file leaked and the thread died with no
            # response. Drop the partial and close the connection (the request
            # body is only partly consumed, so the keep-alive socket can't be
            # safely reused) after sending a 500.
            if partial:
                try:
                    os.remove(partial)
                except OSError:
                    pass
            log.warning("upload failed mid-copy: %s", e)
            self.close_connection = True
            try:
                self._json(500, {"error": "upload failed (server write error)"})
            except Exception:
                pass
            return
        self._json(200, {"ok": True, "saved": saved, "bytes": total_bytes,
                         "dir": _upload_dir()})

    def _handle_desktop_save(self):
        body = self._read_body(4096)
        if body is None:
            self._json(400, {"error": "invalid or too-large body"})
            return
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            self._json(400, {"error": "invalid json"})
            return
        # Upsert this instance's open-set into the registry (also its heartbeat)
        # and return the live cross-instance union + the reset epoch. Whitelist:
        # {instance: str, open: [str], active: str|null}; ids stored verbatim
        # (the client whitelists against its own APPS map on read).
        instance = data.get("instance")
        if not isinstance(instance, str) or not instance:
            self._json(400, {"error": "instance required"})
            return
        instance = instance[:64]
        open_apps = data.get("open", []) or []
        if not isinstance(open_apps, list):
            self._json(400, {"error": "open must be a list"})
            return
        open_apps = [str(x) for x in open_apps[:16]]
        active = data.get("active")
        if active is not None and not isinstance(active, str):
            self._json(400, {"error": "active must be a string or null"})
            return
        now = time.time()
        # Shell-tier polls folded onto this 5s heartbeat (consolidate within the
        # tier): the Claude-Usage flag, the terminal count for the Start-menu
        # badge, and (below) the taskbar system stats. All computed OUTSIDE
        # _desktop_lock and memoized, so folding them in doesn't lengthen the
        # lock or duplicate work across clients.
        cu = _claude_usage_enabled()
        nterm = len(self._get_running_terminals())
        with _desktop_lock:
            state = _read_desktop_state()
            state["instances"][instance] = {
                "open": open_apps, "active": active, "ts": now,
            }
            _desktop_cap(state)
            _desktop_prune_targets(state, now)
            _write_desktop_state(state)
            want_sys = state.get("sys_stats", True)
            resp = {"ok": True, "running": _desktop_union(state, now),
                    "reset_epoch": state["reset_epoch"],
                    "close_targets": state["close_targets"],
                    "sys_stats": want_sys,
                    "claude_usage": cu,
                    "terminals_running": nterm}
        if want_sys:   # taskbar stats only when the shared toggle is on
            resp["system"] = self._get_system_status()
        if cu:         # Claude-Usage numbers folded on too (retires the 30s poll)
            resp["claude"] = _claude_usage_payload(cu)
        # System-health warnings ride the heartbeat too, ALWAYS (independent of the
        # stats toggle) — a red banner must show even with the stats readout off.
        resp["warnings"] = _cached("sys_warnings", 5.0, _system_warnings)
        self._json(200, resp)

    def _handle_desktop_close(self):
        # POST {app} — close `app` on every live instance that currently has it
        # open. We record exactly those instance ids as targets; each closes the
        # app when it sees its own id, then reports an open-set without it and is
        # pruned out. (Targeting ids, not a global flag, means reloading the holder
        # still closes it and a stuck holder can't poison the app elsewhere.)
        body = self._read_body(4096)
        if body is None:
            return self._json(400, {"error": "invalid or too-large body"})
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            return self._json(400, {"error": "invalid json"})
        app = data.get("app")
        if not isinstance(app, str) or not app or len(app) > 64:
            return self._json(400, {"error": "app required"})
        now = time.time()
        with _desktop_lock:
            state = _read_desktop_state()
            insts = state["instances"]
            holders = [i for i, ent in insts.items()
                       if isinstance(ent, dict)
                       and (now - float(ent.get("ts", 0) or 0)) <= DESKTOP_TTL
                       and app in (ent.get("open") or [])]
            if holders:
                tg = state["close_targets"]
                tg[app] = sorted(set(tg.get(app, []) + holders))
            _desktop_prune_targets(state, now)
            _write_desktop_state(state)
            resp = {"ok": True, "close_targets": state["close_targets"]}
        log.info("desktop close %r on %d instance(s)", app, len(holders))
        self._json(200, resp)

    def _handle_desktop_ui(self):
        # POST {sysStats: bool} — a SHARED, cross-instance UI preference (whether
        # the taskbar system-stats readout shows). Stored on the desktop state so
        # every client converges on the same value via the 5s heartbeat.
        body = self._read_body(4096)
        if body is None:
            return self._json(400, {"error": "invalid or too-large body"})
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            return self._json(400, {"error": "invalid json"})
        with _desktop_lock:
            state = _read_desktop_state()
            if "sysStats" in data:
                state["sys_stats"] = bool(data["sysStats"])
            _write_desktop_state(state)
            resp = {"ok": True, "sys_stats": state.get("sys_stats", True)}
        self._json(200, resp)

    def _handle_reset(self):
        """Full 'fresh start' reset, wired to the desktop's logout button:
        stop every terminal (kills their background processes), clear the saved
        desktop layout, drop in-memory office edit sessions, and reset the
        Browser to a blank Chromium — so the next login starts clean."""
        result = {"terminals_stopped": [], "desktop_cleared": False,
                  "office_sessions_cleared": 0, "browser_reset": False}

        # 1. Stop THIS user's running terminals (per-user reset — a logout clears
        #    only the logging-out user's session, not other users' terminals).
        user = _ctx_user()
        try:
            running = _list_running_terminals(user)
        except Exception:
            running = []
        if running:
            units = []
            for n in running:
                s, t = _term_units(user, n)
                units += [t, s]
            # Hard clean slate: SIGKILL the whole cgroup first (hits every process
            # regardless of KillMode), then stop.
            try:
                subprocess.run(["systemctl", "kill", "--kill-whom=all",
                                "--signal=SIGKILL"] + units,
                               check=False, capture_output=True, text=True, timeout=30)
                subprocess.run(["systemctl", "stop", "--no-block"] + units,
                               check=False, capture_output=True, text=True, timeout=30)
            except (subprocess.TimeoutExpired, OSError) as e:
                log.warning("reset: stopping terminals timed out/failed: %s", e)
            result["terminals_stopped"] = running
        with _cache_lock:                      # so status reflects it at once
            _cache.pop("running_terminals:" + user, None)
        # Stop this user's FileBrowser too (fresh slate).
        try:
            subprocess.run(["systemctl", "stop", _fb_unit(user)],
                           check=False, capture_output=True, text=True, timeout=20)
        except (subprocess.TimeoutExpired, OSError):
            pass
        with _cache_lock:
            _cache.pop("fb_port:" + user, None)

        # 2. Clear the desktop registry and bump reset_epoch — every other live
        #    instance sees the epoch advance on its next heartbeat and tears its
        #    own desktop down too (the cross-instance logout/reset signal).
        try:
            with _desktop_lock:
                state = _read_desktop_state()
                state["instances"] = {}
                state["close_targets"] = {}
                state["reset_epoch"] = int(state.get("reset_epoch", 0)) + 1
                _write_desktop_state(state)
            result["desktop_cleared"] = True
        except Exception:
            pass

        # 3. Drop in-memory office edit sessions (user files left untouched).
        with _office_sessions_lock:
            result["office_sessions_cleared"] = len(_office_sessions)
            _office_sessions.clear()

        # 3b. Forget terminal tab names — the terminals are gone, so a fresh
        #     start shouldn't inherit old custom names.
        try:
            with _tab_names_lock:
                _write_tab_names({})
            result["tab_names_cleared"] = True
        except Exception:
            pass

        # 4. Reset THIS user's Browser xpra to a blank Chromium: stop it, wipe
        #    their session-restore files, and let it re-start on demand fresh.
        try:
            _stop_user_xpra(user, "browser")
            profile = os.path.join(_user_home(user), "snap", "chromium",
                                   "common", "xpra-profile", "Default")
            for name in ("Last Session", "Last Tabs", "Current Session", "Current Tabs"):
                try:
                    os.remove(os.path.join(profile, name))
                except OSError:
                    pass
            shutil.rmtree(os.path.join(profile, "Sessions"), ignore_errors=True)
            result["browser_reset"] = True
        except Exception:
            pass
        with _cache_lock:
            _cache.pop("xpra_port:browser:" + user, None)

        # 5. Stop THIS user's X11 xpra so every launched GUI app is gone too.
        try:
            _stop_user_xpra(user, "x11")
            result["apps_reset"] = True
        except Exception:
            pass
        with _cache_lock:
            _cache.pop("xpra_port:x11:" + user, None)

        log.info("reset: %s — %d terminal(s), browser_reset=%s apps_reset=%s",
                 user, len(result["terminals_stopped"]),
                 result.get("browser_reset"), result.get("apps_reset"))
        self._json(200, {"ok": True, **result})

    def _handle_browser_open(self):
        # Open a URL in THIS user's own Browser (Chromium on their per-user xpra
        # display, as them). No longer admin-only — it acts as the request user.
        body = self._read_body(4096)
        if body is None:
            self._json(400, {"error": "invalid or too-large body"})
            return
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            self._json(400, {"error": "invalid json"})
            return
        url = data.get("url", "")
        if not _valid_browser_url(url):
            self._json(400, {"error": "invalid url"})
            return
        user = _ctx_user()
        try:
            uid = pwd.getpwnam(user).pw_uid
        except KeyError:
            self._json(500, {"error": f"unknown user: {user}"})
            return
        self._ensure_user_xpra(user, "browser")     # make sure their display exists
        disp = _user_xpra_display(user, "browser")
        profile = os.path.join(_user_home(user), "snap", "chromium",
                               "common", "xpra-profile")
        # The URL is already validated (http(s) + no shell metacharacters incl.
        # backslash) before it reaches this `su -c` shell string. Reap the child in
        # a daemon thread so short-lived `chromium <url>` hand-offs don't pile up.
        proc = subprocess.Popen(
            ["su", "-", user, "-c",
             f'DISPLAY=:{disp} DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/{uid}/bus'
             f' /snap/bin/chromium --user-data-dir={profile} "{url}"'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        threading.Thread(target=proc.wait, daemon=True).start()
        self._json(200, {"ok": True, "url": url})

    # ---- X11 Launcher: run/list/switch GUI apps on the xpra display --------

    def _handle_x_launch(self):
        # POST {cmd} — run a GUI command on THIS user's own X11 xpra display, as
        # them (their own login shell, like opening a terminal — no escalation,
        # so no longer admin-only). No command allowlist by design (same as their
        # Terminal). Their display is started on demand if not already up.
        body = self._read_body(4096)
        if body is None:
            self._json(400, {"error": "invalid or too-large body"})
            return
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            self._json(400, {"error": "invalid json"})
            return
        cmd = (data.get("cmd") or "").strip()
        if not _valid_launch_cmd(cmd):
            self._json(400, {"error": "invalid command"})
            return
        user = _ctx_user()
        try:
            uid = pwd.getpwnam(user).pw_uid
        except KeyError:
            self._json(500, {"error": f"unknown user: {user}"})
            return
        self._ensure_user_xpra(user, "x11")          # start their display if needed
        disp = _user_xpra_display(user, "x11")
        prog = _launch_prog(cmd)
        # Per-user: use the user's own session bus for every app (the shared
        # private "apps bus" was single-user). Snap apps need it; GTK/GNOME apps
        # work but may pause ~25s on an xdg-desktop-portal activation timeout — a
        # known per-user degradation (a per-user private bus would restore ~0.2s).
        dbus_sock = f"/run/user/{uid}/bus"
        log.info("x/launch %r for %s (display :%d)", cmd, user, disp)
        # Login shell (-) so the user's PATH resolves bare names like `gimp`.
        # Reap in a daemon thread so short-lived launchers don't linger as zombies.
        shell_cmd = (f'DISPLAY=:{disp} '
                     f'DBUS_SESSION_BUS_ADDRESS=unix:path={dbus_sock} '
                     f'XDG_RUNTIME_DIR=/run/user/{uid} '
                     f'{cmd}')
        try:
            proc = subprocess.Popen(
                ["su", "-", user, "-c", shell_cmd],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
        except Exception as e:
            self._json(500, {"error": str(e)})
            return
        # Briefly watch for an immediate failure: a missing/mistyped command exits
        # fast with non-zero (127 = command not found), while a real GUI app keeps
        # running. This lets the launcher say "not installed?" right away instead
        # of leaving the progress bar spinning for 25s. The window itself surfaces
        # via the /api/x/windows poll, independent of this response.
        try:
            rc = proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            rc = None
        if rc is None:
            threading.Thread(target=proc.wait, daemon=True).start()  # still running → reap later
        elif rc != 0:
            log.warning("x/launch %r exited fast (rc=%d)", prog, rc)
            if rc == 127:
                msg = f"‘{prog}’ isn’t installed (or not in PATH)."
            else:
                msg = f"‘{prog}’ exited right away (code {rc}) — it may have failed to start."
            return self._json(400, {"error": msg})
        self._json(200, {"ok": True, "cmd": cmd})

    def _run_wmctrl(self, args):
        """Run wmctrl against THIS user's own X11 xpra display, as them. Returns the
        CompletedProcess, or None if it couldn't run."""
        user = _ctx_user()
        try:
            pw = pwd.getpwnam(user)
        except KeyError:
            return None
        if not shutil.which("wmctrl"):
            return None
        env = {
            "DISPLAY": f":{_user_xpra_display(user, 'x11')}",
            "DBUS_SESSION_BUS_ADDRESS": f"unix:path=/run/user/{pw.pw_uid}/bus",
            "HOME": pw.pw_dir, "PATH": "/usr/bin:/bin",
        }
        try:
            return subprocess.run(["wmctrl"] + args, env=env, user=user,
                                  capture_output=True, text=True, timeout=5)
        except Exception:
            return None

    def _handle_x_windows(self):
        # GET -> {"windows": [{"id", "title"}]} from `wmctrl -l` on THIS user's own
        # X11 display. Returns [] if their display isn't up yet (wmctrl fails).
        p = self._run_wmctrl(["-l"])
        wins = []
        if p and p.returncode == 0:
            for line in p.stdout.splitlines():
                parts = line.split(None, 3)
                if len(parts) < 3:
                    continue
                wid = parts[0]
                if not _valid_x_window_id(wid):
                    continue
                # Skip sticky WM/desktop pseudo-windows (desktop id -1).
                if parts[1] == "-1":
                    continue
                title = parts[3] if len(parts) == 4 else ""
                wins.append({"id": wid, "title": title})
        self._json(200, {"windows": wins})

    def _x_window_action(self, flag):
        # Raise/close a window on THIS user's own X11 display (per-user).
        body = self._read_body(4096)
        if body is None:
            return self._json(400, {"error": "invalid or too-large body"})
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            return self._json(400, {"error": "invalid json"})
        wid = (data.get("id") or "").strip()
        if not _valid_x_window_id(wid):
            return self._json(400, {"error": "invalid window id"})
        p = self._run_wmctrl(["-i", flag, wid])
        ok = bool(p and p.returncode == 0)
        self._json(200 if ok else 500, {"ok": ok})

    def _handle_office_preview(self):
        # GET /api/office/preview?path=<rel-to-home> — convert to PDF (cached)
        # and serve it inline so the shell can show it in a read-only viewer.
        q = urllib.parse.urlparse(self.path).query
        rel = urllib.parse.parse_qs(q).get("path", [""])[0]
        src = _resolve_under_home(rel)
        if not src or not OFFICE_RE.search(src):
            self._json(400, {"error": "not a viewable office file"})
            return
        pdf = _office_convert_to_pdf(src)
        if not pdf:
            self._json(500, {"error": "conversion failed (is LibreOffice installed?)"})
            return
        try:
            with open(pdf, "rb") as f:
                body = f.read()
        except OSError:
            self._json(500, {"error": "could not read converted pdf"})
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/pdf")
        self.send_header("Content-Length", str(len(body)))
        # Inline so the iframe renders it; private/short cache (the converter
        # already caches on disk by mtime).
        self.send_header("Content-Disposition", "inline")
        self.send_header("Cache-Control", "private, max-age=30")
        self.end_headers()
        try:
            self.wfile.write(body)
        except Exception:
            pass

    # ---- OnlyOffice web editor: config / doc-fetch / save-callback ----------

    def _handle_office_new(self):
        # POST {type} — create a blank document from a bundled template (in
        # ~/Documents) and return its path, so opening the Office app with no
        # file can start a new doc instead of a dead-end.
        body = self._read_body(65536)
        try:
            data = json.loads(body) if body else {}
        except Exception:
            data = {}
        spec = OFFICE_NEW.get(data.get("type") or "word")
        if not spec:
            return self._json(400, {"error": "unknown document type"})
        ext, label = spec
        tmpl = os.path.join(REPO_DIR, "office", "templates", f"new.{ext}")
        if not os.path.isfile(tmpl):
            return self._json(500, {"error": "blank template missing"})
        try:
            os.makedirs(_office_new_dir(), exist_ok=True)
            _chown_app(_office_new_dir())
            dst = _unique_path(os.path.join(
                _office_new_dir(), f"{label} {time.strftime('%Y-%m-%d %H%M')}.{ext}"))
            shutil.copyfile(tmpl, dst)
            _chown_app(dst)
        except OSError as e:
            return self._json(500, {"error": f"could not create document: {e}"})
        self._json(200, {"ok": True, "path": os.path.relpath(dst, _office_home())})

    def _handle_office_config(self):
        # GET ?path= -> the signed DocEditor config the editor page mounts. The
        # doc/callback URLs carry the owning user (u=) so the container's cookieless
        # callbacks resolve under the right home; the HMAC binds (user, path).
        owner = _ctx_user()
        rel = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("path", [""])[0]
        src = _resolve_under_home(rel, owner)
        secret = _onlyoffice_secret()
        if not src or not OFFICE_RE.search(src):
            return self._json(400, {"error": "not an office file"})
        if not secret:
            return self._json(500, {"error": "OnlyOffice is not configured on this host"})
        st = os.stat(src)
        skey = (owner, rel)
        with _office_sessions_lock:
            key = _office_sessions.get(skey)
            if not key:
                key = hashlib.sha1(
                    f"{src}:{int(st.st_mtime)}:{st.st_size}:{int(time.time())}".encode()
                ).hexdigest()[:22]
                _office_sessions[skey] = key
                # Bound the map: a session is normally popped on the close
                # callback, but a callback that never arrives (container/network
                # death) would leak an entry forever. Drop the oldest beyond the
                # cap (dicts preserve insertion order) so it can't grow without
                # limit. The dropped session just re-mints a key on next open.
                while len(_office_sessions) > 64:
                    _office_sessions.pop(next(iter(_office_sessions)))
        ext = os.path.splitext(src)[1].lstrip(".").lower()
        qp = urllib.parse.urlencode({"path": rel, "u": owner,
                                     "t": _onlyoffice_sig(secret, owner, rel)})
        cfg = {
            "document": {
                "fileType": ext, "key": key, "title": os.path.basename(src),
                "url": f"{ONLYOFFICE_HOST}/api/office/doc?{qp}",
                "permissions": {"edit": True, "download": True, "print": True},
            },
            "documentType": _onlyoffice_doctype(ext),
            "editorConfig": {
                "callbackUrl": f"{ONLYOFFICE_HOST}/api/office/callback?{qp}",
                "lang": "en", "mode": "edit",
                "user": {"id": "vibetop", "name": "Vibetop"},
                "customization": {"forcesave": True, "uiTheme": "theme-dark"},
            },
        }
        cfg["token"] = _jwt_sign(cfg, secret)
        self._json(200, cfg)

    def _handle_office_doc(self):
        # GET ?path=&u=&t= -> raw file bytes for the OnlyOffice container to load.
        # Cookieless (container->host): the owner comes from u=, authorized by the
        # HMAC over (u, path).
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        rel, owner, tok = q.get("path", [""])[0], q.get("u", [""])[0], q.get("t", [""])[0]
        src = _resolve_under_home(rel, owner)
        secret = _onlyoffice_secret()
        if (not src or not secret or not OFFICE_RE.search(src)
                or not hmac.compare_digest(_onlyoffice_sig(secret, owner, rel), tok)):
            return self.send_error(403)
        try:
            with open(src, "rb") as f:
                body = f.read()
        except OSError:
            return self.send_error(404)
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except Exception:
            pass

    def _handle_office_download(self):
        # GET ?path= -> the ORIGINAL office file as an attachment (the viewer
        # shows a PDF rendition, but Download should give the real .docx/.xlsx/…).
        # User-facing (behind Access), so no HMAC; just gated under ~ + OFFICE_RE.
        rel = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("path", [""])[0]
        src = _resolve_under_home(rel)
        if not src or not OFFICE_RE.search(src):
            return self.send_error(404)
        try:
            with open(src, "rb") as f:
                body = f.read()
        except OSError:
            return self.send_error(404)
        fn = os.path.basename(src)
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Content-Disposition",
                         "attachment; filename=\"%s\"; filename*=UTF-8''%s"
                         % (fn.replace('"', ''), urllib.parse.quote(fn)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except Exception:
            pass

    def _handle_office_callback(self):
        # POST ?path=&t= -> OnlyOffice save notifications. status 2/6 means the
        # edited document is ready; download it from the doc server and write back.
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        rel, owner, tok = q.get("path", [""])[0], q.get("u", [""])[0], q.get("t", [""])[0]
        src = _resolve_under_home(rel, owner)
        secret = _onlyoffice_secret()
        if (not src or not secret or not OFFICE_RE.search(src)
                or not hmac.compare_digest(_onlyoffice_sig(secret, owner, rel), tok)):
            return self._json(200, {"error": 1})
        body = self._read_body(1048576)
        try:
            data = json.loads(body) if body else {}
        except Exception:
            data = {}
        # The Document Server runs with JWT_ENABLED=true (office/install.sh), so
        # every callback carries a signed token (body field or Authorization
        # header). REQUIRE it — the body's url/status drive a file overwrite, so
        # an unsigned callback (even one that knew the path's t= HMAC) must not be
        # honored. Verify and use the decoded payload.
        auth = self.headers.get("Authorization", "")
        token = data.get("token") or (auth[7:] if auth.startswith("Bearer ") else "")
        if not token:
            log.warning("office: callback rejected (no JWT) for %s", rel)
            return self._json(200, {"error": 1})
        verified = _jwt_verify(token, secret)
        if verified is None:
            log.warning("office: callback JWT verify failed for %s", rel)
            return self._json(200, {"error": 1})
        data = verified.get("payload", verified)
        if not isinstance(data, dict):
            data = verified
        status = data.get("status")
        if status in (2, 6) and data.get("url"):
            self._office_save_back(data["url"], src, owner)
        # 2 = closed-with-changes (saved), 3 = save error, 4 = closed-no-changes.
        # The editing session has ended → drop the session key so a reopen gets a
        # fresh key (and loads the file from disk, not the server's stale cache).
        if status in (2, 3, 4):
            with _office_sessions_lock:
                _office_sessions.pop((owner, rel), None)
        self._json(200, {"error": 0})

    def _handle_office_forcesave(self):
        # POST {path} — ask OnlyOffice to save the document NOW (autosave + on
        # leaving the editor), which fires the callback (status 6) and writes back.
        body = self._read_body(65536)
        try:
            data = json.loads(body) if body else {}
        except Exception:
            data = {}
        rel = (data.get("path") or "").strip()
        with _office_sessions_lock:
            key = _office_sessions.get((_ctx_user(), rel))
        if key:
            self._onlyoffice_forcesave(key)
        self._json(200, {"ok": bool(key)})

    def _onlyoffice_forcesave(self, key):
        secret = _onlyoffice_secret()
        if not secret:
            return
        import urllib.request
        cmd = {"c": "forcesave", "key": key}
        cmd["token"] = _jwt_sign({"c": "forcesave", "key": key}, secret)
        try:
            req = urllib.request.Request(
                f"http://127.0.0.1:{ONLYOFFICE_PORT}/coauthoring/CommandService.ashx",
                data=json.dumps(cmd).encode(),
                headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=10) as r:
                r.read()
        except Exception as e:
            log.warning("office: forcesave failed: %s", e)

    def _office_save_back(self, url, dst, user=None):
        # The url OnlyOffice gives is its own public URL (…/onlyoffice/cache/…);
        # rewrite it to the local container so we don't loop back through the
        # tunnel/Access. Then download and atomically replace the file.
        import urllib.request
        u = urllib.parse.urlparse(url)
        path = u.path
        if path.startswith("/onlyoffice/"):
            path = path[len("/onlyoffice"):]
        local = f"http://127.0.0.1:{ONLYOFFICE_PORT}{path}"
        if u.query:
            local += "?" + u.query
        try:
            with urllib.request.urlopen(local, timeout=60) as r:
                body = r.read()
            # Unique temp in the dest dir: OnlyOffice can fire concurrent callbacks
            # (autosave + close) for the same file; mkstemp guarantees a distinct
            # name per write (thread idents are reused, so they could collide).
            fd, tmp = tempfile.mkstemp(dir=os.path.dirname(dst), prefix=".vibetmp-")
            try:
                with os.fdopen(fd, "wb") as f:
                    f.write(body)
                os.replace(tmp, dst)
            except BaseException:
                try: os.unlink(tmp)
                except OSError: pass
                raise
            _chown_app(dst, user)
        except Exception as e:
            log.warning("office: save-back failed from %s: %s", local, e)

    def _handle_terminal(self, m):
        n, action = int(m.group(1)), m.group(2)
        if n < 1 or n > MAX_INSTANCE:
            self._json(400, {"error": f"instance must be 1-{MAX_INSTANCE}"})
            return
        # Per-user: start/stop the terminal for THIS request's Linux user, running
        # as them (systemd-run --uid) in their own home.
        user = _ctx_user()
        if action == "start":
            ok, res = _start_user_terminal(user, n)
        else:
            ok, res = _stop_user_terminal(user, n)
        _cache.pop("running_terminals:" + user, None)
        if not ok:
            log.warning("terminal %s-%d %s failed: %s", user, n, action, res)
            self._json(500, {"error": str(res)})
            return
        log.info("terminal %s-%d %s", user, n, action)
        _metric_inc("terminals_started_total" if action == "start"
                    else "terminals_stopped_total")
        self._json(200, {"ok": True, "action": action, "instance": n})

    # ---- Update (git pull + redeploy) -------------------------------------
    def _git_as_user(self, args, timeout=60):
        """Run a git command in REPO_DIR as APP_USER. See module-level _git()."""
        return _git(args, timeout)

    def _update_version_info(self):
        ok, head = self._git_as_user(["log", "-1", "--format=%h\t%cd\t%s",
                                      "--date=short"])
        info = {"repo": REPO_DIR}
        try:  # release number (root VERSION file) — lets the shell show it live
            with open(os.path.join(REPO_DIR, "VERSION")) as f:
                info["version"] = f.read().strip()
        except OSError:
            pass
        # Date this version was cut = the last commit that touched the VERSION
        # file (the `vX.Y.Z:` bump), so the Start menu can show "v1.9.10 (2026-06-26)"
        # without hard-coding — fetched live like the version number itself.
        okv, vdate = self._git_as_user(["log", "-1", "--format=%cd",
                                        "--date=short", "--", "VERSION"])
        if okv and vdate.strip():
            info["version_date"] = vdate.strip()
        # Date THIS shell build was cut = the last commit that touched sw.js
        # (whose VERSION is the "build vN" shown in the tag). Distinct from
        # version_date (the release/VERSION-file bump): a shell-only build bumps
        # sw.js WITHOUT cutting a new release, so the build tag's date must track
        # sw.js — pairing it with version_date shows a stale date next to a newer
        # build number (e.g. "build v143 · <v1.11.4's date>").
        okb, bdate = self._git_as_user(["log", "-1", "--format=%cd",
                                        "--date=short", "--", "landing/sw.js"])
        if okb and bdate.strip():
            info["build_date"] = bdate.strip()
        if ok and "\t" in head:
            commit, date, subject = head.split("\t", 2)
            info.update({"commit": commit, "date": date, "subject": subject})
        else:
            info["error"] = head
        # Per-host update log — the REAL self-update events for this deployment
        # (newest first), seeded with a "deployed" baseline. Not the git changelog.
        _seed_update_history()
        info["history"] = list(reversed(_read_update_history()))
        return info

    def _handle_update_check(self):
        if not self._require_admin():       # host-wide git pull + redeploy -> operator only
            return
        with _update_run_lock:
            return self._handle_update_check_locked()

    def _handle_update_check_locked(self):
        """Fetch from GitHub and report whether newer commits exist — WITHOUT
        applying anything. 'git fetch' updates the remote-tracking ref only; the
        working tree and HEAD are untouched, so this is a read-only probe."""
        ok, out = self._git_as_user(["fetch", "--quiet", "origin", "main"],
                                    timeout=120)
        if not ok:
            self._json(200, {"ok": False,
                             "message": "Couldn't reach GitHub — check the host's network.",
                             "detail": (out or "")[:300]})
            return
        _, local = self._git_as_user(["rev-parse", "HEAD"])
        _, remote = self._git_as_user(["rev-parse", "origin/main"])
        commits = []
        if local and remote and local != remote:
            cok, cout = self._git_as_user(
                ["log", "--format=%h\x1f%s", local + "..origin/main"])
            if cok and cout:
                for line in cout.splitlines():
                    p = line.split("\x1f")
                    if len(p) == 2:
                        commits.append({"commit": p[0], "subject": p[1]})
        self._json(200, {"ok": True, "behind": len(commits), "commits": commits,
                         "local": (local or "")[:7], "remote": (remote or "")[:7]})

    def _handle_update(self):
        if not self._require_admin():       # git pull + root redeploy -> operator only
            return
        # Serialize the whole update against any other update/check so two
        # concurrent triggers (a double-tap, two devices) can't race git in one
        # checkout. Uses _update_run_lock (NOT _update_lock) so the brief
        # history-file lock — and thus the frequently-polled GET /api/update,
        # which seeds history — stays responsive during the multi-minute op.
        with _update_run_lock:
            return self._handle_update_locked()

    def _handle_update_locked(self):
        """Pull the latest from GitHub and redeploy whatever changed. Each step's
        output is returned as a log. The manager restarts itself (out-of-band) at
        the end only if its own file changed, so the new code takes effect."""
        steps = []          # not `log`: that name is the module-level logger

        def add(name, ok, out):
            steps.append({"name": name, "ok": bool(ok), "output": (out or "").strip()})
            return ok

        # force=true (from the Update app's "Discard local changes & update"
        # button) authorizes stashing local edits that would otherwise block the
        # fast-forward. Body is optional; absent/garbage => force stays False.
        # Body is optional; absent/garbage => force stays False. Read via
        # _read_body (Content-Length-bounded + 30s socket timeout) so a client
        # that sends a Content-Length then stalls can't pin this thread.
        force = False
        try:
            body = self._read_body(4096)
            if body:
                force = bool(json.loads(body).get("force"))
        except Exception:
            force = False

        _, before = self._git_as_user(["rev-parse", "HEAD"])

        ok, out = self._git_as_user(["fetch", "origin", "--prune"], timeout=120)
        add("git fetch", ok, out)
        if not ok:
            _append_update_history({"time": int(time.time()), "event": "failed",
                                    "message": (out or "")[:200]})
            self._json(200, {"ok": False, "log": steps,
                             "message": "git fetch failed — resolve it on the host"})
            return

        # A dirty working tree blocks a fast-forward. This is common when a host
        # was deployed by rsync (files copied in without committing). If the tree
        # ALREADY matches origin/main (identical content — the rsync case), the
        # local changes are redundant, so hard-reset onto origin/main. If they're
        # genuine host-local edits (not upstream), bail rather than clobber them.
        # --untracked-files=no: only TRACKED local modifications are worth
        # protecting here. Untracked files (stray experiment/backup files left in
        # a deploy tree) never block a fast-forward — git only refuses if an
        # incoming file would clobber one — and counting them as "dirty" made the
        # diff-vs-origin check below always read as "genuine local edits" whenever
        # the host was behind, so a host with any untracked cruft could never
        # self-update.
        dok, dirty = self._git_as_user(["status", "--porcelain", "--untracked-files=no"])
        if dok and dirty.strip():
            matches_upstream, _ = self._git_as_user(["diff", "--quiet", "origin/main"])
            if matches_upstream:
                ok, out = self._git_as_user(["reset", "--hard", "origin/main"])
                add("reset working tree to origin/main (local copy already upstream)", ok, out)
            elif force:
                # The user chose "Discard local changes & update". Stash the edits
                # (recoverable via `git stash list`/`pop` on the host) rather than
                # a destructive reset --hard, then fast-forward normally.
                sok, sout = self._git_as_user(
                    ["stash", "push", "--include-untracked",
                     "-m", "vibetop: auto-stash before update"])
                add("stash local changes (recoverable: 'git stash list' on host)", sok, sout)
                if not sok:
                    _append_update_history({"time": int(time.time()), "event": "failed",
                                            "message": "stash failed: " + (sout or "")[:160]})
                    self._json(200, {"ok": False, "log": steps,
                                     "message": "Could not stash local changes — resolve on the host."})
                    return
                ok, out = self._git_as_user(["merge", "--ff-only", "origin/main"], timeout=120)
                add("git pull", ok, out)
            else:
                add("git pull", False,
                    "working tree has local changes not in origin/main:\n" + dirty.strip())
                _append_update_history({"time": int(time.time()), "event": "failed",
                                        "message": "dirty working tree (local edits)"})
                # blocked=dirty + the file list lets the Update app show what's in
                # the way and offer the "Discard local changes & update" button.
                self._json(200, {"ok": False, "log": steps, "blocked": "dirty",
                                 "dirty": dirty.strip(),
                                 "message": "This host has local edits not in origin/main. "
                                            "Discard them (they'll be stashed, recoverable) and "
                                            "update, or resolve on the host."})
                return
        else:
            ok, out = self._git_as_user(["merge", "--ff-only", "origin/main"], timeout=120)
            add("git pull", ok, out)

        if not ok:
            log.warning("update: pull failed: %s", (out or "").strip()[:200])
            _append_update_history({"time": int(time.time()), "event": "failed",
                                    "message": (out or "")[:200]})
            self._json(200, {"ok": False, "log": steps,
                             "message": "update failed — resolve it on the host"})
            return
        _, after = self._git_as_user(["rev-parse", "HEAD"])

        changed = []
        if before and after and before != after:
            cok, cout = self._git_as_user(["diff", "--name-only",
                                           before + ".." + after])
            if cok:
                changed = [l for l in cout.splitlines() if l]

        if not changed:
            self._json(200, {"ok": True, "log": steps, "changed": [],
                             "message": "Already up to date."})
            return

        # Record this real update event in the per-host log (the commits pulled).
        nok, nlog = self._git_as_user(["log", "--format=%h\x1f%s", before + ".." + after])
        commits = []
        if nok and nlog:
            for line in nlog.splitlines():
                p = line.split("\x1f")
                if len(p) == 2:
                    commits.append({"commit": p[0], "subject": p[1]})
        _append_update_history({"time": int(time.time()), "event": "updated",
                                "from": (before or "")[:7], "to": (after or "")[:7],
                                "commits": commits})

        def deploy(name, argv, env_extra):
            env = dict(os.environ)
            env.update(env_extra)
            try:
                p = subprocess.run(argv, cwd=REPO_DIR, env=env,
                                   capture_output=True, text=True, timeout=300)
                add(name, p.returncode == 0, p.stdout + p.stderr)
            except Exception as e:
                add(name, False, str(e))

        touched = lambda prefix: any(c.startswith(prefix) for c in changed)
        # landing/ → static apps; run as APP_USER ($HOME must be the user's, set
        # by sudo -H). No login shell, so no MOTD banner in the output.
        if touched("landing/"):
            try:
                p = subprocess.run(
                    ["sudo", "-n", "-u", APP_USER, "-H",
                     os.path.join(REPO_DIR, "landing", "install.sh")],
                    cwd=REPO_DIR, capture_output=True, text=True, timeout=120)
                add("deploy desktop & apps", p.returncode == 0, p.stdout + p.stderr)
            except Exception as e:
                add("deploy desktop & apps", False, str(e))
        # browser/ and terminal/ touch nginx → run as root (manager is root) with
        # APP_USER passed in; skip apt/systemd, just redeploy files + reload nginx.
        base_env = {"APP_USER": APP_USER, "INSTALL_DEPS": "0", "INSTALL_SYSTEMD": "0"}
        if touched("browser/"):
            deploy("deploy browser", ["./browser/install.sh"], base_env)
        if touched("terminal/"):
            deploy("deploy terminal & nginx", ["./terminal/install.sh"], base_env)
        # office/ → just re-render the /onlyoffice/ nginx snippet. INSTALL_CONTAINER=0
        # keeps the live OnlyOffice container (an in-app update must not tear it down
        # — that drops open editors + ~1-2 min downtime); container/image changes
        # need a full deploy, same as systemd-unit changes for browser/terminal. The
        # bundled new-doc templates (office/templates/) need no step — the manager
        # reads them straight from the checkout.
        if touched("office/"):
            deploy("deploy office (nginx)", ["./office/install.sh"],
                   {**base_env, "INSTALL_CONTAINER": "0"})
        # files/ — or the FileBrowser patch JS. The patch JS lives under landing/
        # but its nginx ?v= cache-buster is computed by files/install.sh, so a
        # patch-only change MUST re-render the /files/ snippet too or the browser
        # keeps serving the old cached JS (stale ?v=). INSTALL_DEPS/SYSTEMD=0 keeps
        # it to config (idempotent) + nginx + a brief filebrowser restart.
        if touched("files/") or "landing/filebrowser-patches.js" in changed:
            deploy("deploy files & nginx", ["./files/install.sh"], base_env)
        # claude-usage/ — the opt-in usage proxy runs in-place from the checkout,
        # so install.sh (INSTALL_SYSTEMD=0) just re-renders nothing and try-restarts
        # the proxy IF it's running (feature on), picking up new proxy code.
        if touched("claude-usage/"):
            deploy("deploy claude-usage", ["./claude-usage/install.sh"], base_env)

        # Restart the manager out-of-band (via a transient timer so it survives
        # our own death) only if its code changed — after the response is sent.
        # Any .py directly under terminal/ is a manager module (terminal-manager.py
        # and its siblings like system_status.py); tests/ and the path-independent
        # vibetop-session are excluded.
        restart = any(c.startswith("terminal/") and c.endswith(".py")
                      and "/" not in c[len("terminal/"):] for c in changed)
        # A redeploy step (install.sh) can fail after the pull succeeded — the
        # code is on disk but not actually deployed (nginx not reloaded, units
        # not re-rendered). Surface that as ok:false so the Update app doesn't
        # report success (and reload onto a half-deployed shell), and log it as a
        # 'failed' event rather than the 'updated' recorded above.
        failed = [s["name"] for s in steps if not s["ok"]]
        deploy_ok = not failed
        if not deploy_ok:
            _append_update_history({"time": int(time.time()), "event": "failed",
                                    "message": "redeploy step(s) failed: "
                                               + ", ".join(failed)[:200]})
        log.info("update: %s..%s applied (%d file(s) changed, restart=%s, deploy_ok=%s)",
                 (before or "")[:7], (after or "")[:7], len(changed), restart, deploy_ok)
        self._json(200, {"ok": deploy_ok, "log": steps, "changed": changed,
                         "restart": restart and deploy_ok,
                         "failed": failed,
                         "message": (("Updated. Restarting the API to apply manager "
                                      "changes…" if restart else "Updated.") if deploy_ok
                                     else "Pulled new code, but a redeploy step failed — "
                                          "check the log and resolve on the host.")})
        # Only restart the manager if the redeploy actually succeeded — restarting
        # onto a half-deployed tree would compound the failure.
        if restart and deploy_ok:
            try:
                subprocess.Popen(
                    ["systemd-run", "--on-active=3",
                     "systemctl", "restart", "vibetop-manager.service"],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception:
                pass

    # ---- public share links (Files app) -------------------------------------
    def _share_url(self, token):
        """Public URL for a token: SHARE_PUBLIC_BASE if set, else derived from the
        request Host + X-Forwarded-Proto so the link matches how you reached the
        app (tunnel host over the tunnel, LAN IP on the LAN)."""
        if SHARE_PUBLIC_BASE:
            return SHARE_PUBLIC_BASE + "/s/" + token
        host = self.headers.get("Host", "") or "127.0.0.1"
        proto = self.headers.get("X-Forwarded-Proto") or "http"
        return "%s://%s/s/%s" % (proto, host, token)

    def _handle_share_create(self):
        # POST /api/share {path, ttl(days)} -> mint a public read-only link.
        raw = self._read_body(64 * 1024)
        if raw is None:
            return self._json(400, {"error": "invalid or too-large body"})
        try:
            data = json.loads(raw or b"{}")
        except ValueError:
            return self._json(400, {"error": "invalid json"})
        rel = (data.get("path") or "").strip()
        owner = _ctx_user()
        target, kind = _safe_share_target(rel, owner)
        if not target:
            return self._json(400, {"error": "not shareable: must be a file or folder "
                                             "under home, and not a dotfile"})
        ttl = data.get("ttl", SHARE_DEFAULT_TTL_DAYS)
        try:
            ttl = float(ttl)
        except (TypeError, ValueError):
            ttl = SHARE_DEFAULT_TTL_DAYS
        now = time.time()
        expires = 0 if ttl <= 0 else now + ttl * 86400
        token = secrets.token_urlsafe(16)          # 128-bit unguessable capability
        name = os.path.basename(target.rstrip("/")) or "share"
        with _shares_lock:
            reg = _read_shares()
            _share_prune(reg, now)
            if len(reg) >= SHARE_MAX:              # evict the oldest to bound the file
                oldest = min(reg, key=lambda t: reg[t].get("created", 0))
                del reg[oldest]
            reg[token] = {"rel": rel.lstrip("/"), "name": name, "kind": kind,
                          "owner": owner, "created": now, "expires": expires, "hits": 0}
            _write_shares(reg)
        log.info("share created: %s (%s) token=%s… expires=%s",
                 name, kind, token[:6], int(expires))
        return self._json(200, {"token": token, "url": self._share_url(token),
                                "name": name, "kind": kind, "expires": int(expires)})

    def _handle_share_list(self):
        # GET /api/share/list -> active shares (authed; for the manage UI).
        now = time.time()
        with _shares_lock:
            reg = _read_shares()
            _share_prune(reg, now)
            _write_shares(reg)
            me = _ctx_user()
            items = [{
                "token": tok,
                "url": self._share_url(tok),
                "name": ent.get("name", ""),
                "rel": ent.get("rel", ""),
                "kind": ent.get("kind", "file"),
                "created": int(ent.get("created", 0)),
                "expires": int(ent.get("expires", 0)),
                "hits": int(ent.get("hits", 0)),
            } for tok, ent in reg.items()
                if isinstance(ent, dict) and ent.get("owner", APP_USER) == me]
        items.sort(key=lambda x: x["created"], reverse=True)
        return self._json(200, {"shares": items})

    def _handle_share_revoke(self):
        # POST /api/share/revoke {token}
        raw = self._read_body(64 * 1024)
        if raw is None:
            return self._json(400, {"error": "invalid or too-large body"})
        try:
            data = json.loads(raw or b"{}")
        except ValueError:
            return self._json(400, {"error": "invalid json"})
        token = (data.get("token") or "").strip()
        removed = False
        with _shares_lock:
            reg = _read_shares()
            # Only the owner may revoke their own link.
            if token in reg and reg[token].get("owner", APP_USER) == _ctx_user():
                del reg[token]
                removed = True
            _share_prune(reg)
            _write_shares(reg)
        return self._json(200, {"ok": True, "removed": removed})

    def _share_safety_headers(self):
        # The file is served from the app's OWN origin, so neutralize any active
        # content: nosniff + a null/sandbox CSP mean a shared .html/.svg can't run
        # JS in-origin even if a browser tried to render it.
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'none'; sandbox")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cache-Control", "private, no-store")

    def _handle_share_serve(self):
        # GET/HEAD /s/<token>[?dl=1] -- PUBLIC, no auth; the token is the only gate.
        parsed = urllib.parse.urlparse(self.path)
        token = parsed.path[len("/s/"):].split("/")[0]
        if not re.match(r"^[A-Za-z0-9_-]{8,64}$", token or ""):
            return self.send_error(404)
        force_dl = "dl" in urllib.parse.parse_qs(parsed.query)
        now = time.time()
        ent = None
        with _shares_lock:
            reg = _read_shares()
            before = len(reg)
            _share_prune(reg, now)
            e = reg.get(token)
            changed = len(reg) != before
            if isinstance(e, dict):
                ent = dict(e)
                if not self.headers.get("Range"):    # count a fresh download, not each range
                    reg[token]["hits"] = int(e.get("hits", 0)) + 1
                    changed = True
            if changed:
                _write_shares(reg)
        if ent is None:
            return self.send_error(404)
        # Re-validate the target on every fetch (moved/replaced/now-dotfile -> 404),
        # fenced to the OWNER's home (this request is cookieless/public).
        owner = ent.get("owner", APP_USER)
        target, kind = _safe_share_target(ent.get("rel", ""), owner)
        if not target or kind != ent.get("kind", "file"):
            return self.send_error(404)
        if kind == "dir":
            return self._serve_share_zip(target, ent.get("name") or "share", owner)
        return self._serve_share_file(target, ent.get("name") or os.path.basename(target),
                                      force_dl, self.headers.get("Range"))

    def _serve_share_file(self, path, name, force_dl, range_hdr):
        try:
            size = os.path.getsize(path)
        except OSError:
            return self.send_error(404)
        ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
        inline = (not force_dl) and any(
            ctype == t or (t.endswith("/") and ctype.startswith(t))
            for t in SHARE_INLINE_TYPES)
        start, end, partial = 0, size - 1, False
        if range_hdr:
            m = re.match(r"bytes=(\d*)-(\d*)$", range_hdr.strip())
            if m and (m.group(1) or m.group(2)):
                if m.group(1) == "":
                    start, end = max(0, size - int(m.group(2))), size - 1
                else:
                    start = int(m.group(1))
                    end = int(m.group(2)) if m.group(2) else size - 1
                if start > end or start >= max(size, 1):
                    self.send_response(416)
                    self.send_header("Content-Range", "bytes */%d" % size)
                    self.end_headers()
                    return
                end = min(end, size - 1)
                partial = True
        length = end - start + 1
        self.send_response(206 if partial else 200)
        # inline only for the safe allowlist; everything else downloads as octet-stream
        self.send_header("Content-Type", ctype if inline else "application/octet-stream")
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        if partial:
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        self.send_header("Content-Disposition",
                         "%s; filename=\"%s\"; filename*=UTF-8''%s"
                         % ("inline" if inline else "attachment",
                            name.replace('"', ''), urllib.parse.quote(name)))
        self._share_safety_headers()
        self.end_headers()
        if self.command == "HEAD":
            return
        try:
            with open(path, "rb") as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = f.read(min(65536, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except (OSError, BrokenPipeError, ConnectionError):
            pass

    def _serve_share_zip(self, absdir, name, owner=None):
        # A shared FOLDER -> an on-the-fly .zip (built to a temp file on disk, then
        # streamed). Skips dotfiles/dot-dirs and any symlink escaping the owner's root.
        base = os.path.realpath(_share_root(owner))
        tmpdir = _office_cache_dir(owner)
        try:
            os.makedirs(tmpdir, exist_ok=True)
        except OSError:
            tmpdir = None
        fd, tmppath = tempfile.mkstemp(prefix=".share-", suffix=".zip", dir=tmpdir)
        os.close(fd)
        try:
            total = count = 0
            top = os.path.basename(absdir.rstrip("/")) or "share"
            with zipfile.ZipFile(tmppath, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as z:
                for root, dirs, files in os.walk(absdir):
                    dirs[:] = [d for d in dirs if not d.startswith(".")]
                    for fn in files:
                        if fn.startswith("."):
                            continue
                        p = os.path.join(root, fn)
                        if os.path.islink(p):
                            continue
                        rp = os.path.realpath(p)
                        if rp != base and not rp.startswith(base + os.sep):
                            continue            # escaped the fence
                        if not os.path.isfile(rp):
                            continue
                        try:
                            sz = os.path.getsize(rp)
                        except OSError:
                            continue
                        count += 1
                        total += sz
                        if count > SHARE_ZIP_MAX_FILES or total > SHARE_ZIP_MAX_BYTES:
                            raise _ShareTooBig()
                        try:
                            z.write(rp, os.path.join(top, os.path.relpath(p, absdir)))
                        except OSError:
                            continue
            zsize = os.path.getsize(tmppath)
            fn = (name or "share") + ".zip"
            self.send_response(200)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Length", str(zsize))
            self.send_header("Content-Disposition",
                             "attachment; filename=\"%s\"; filename*=UTF-8''%s"
                             % (fn.replace('"', ''), urllib.parse.quote(fn)))
            self._share_safety_headers()
            self.end_headers()
            if self.command == "HEAD":
                return
            with open(tmppath, "rb") as f:
                while True:
                    chunk = f.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
        except _ShareTooBig:
            self.send_error(413, "Folder too large to share as a zip")
        except (OSError, BrokenPipeError, ConnectionError):
            pass
        finally:
            try:
                os.unlink(tmppath)
            except OSError:
                pass

    def do_HEAD(self):
        self._bind_request_user()
        if self.path.startswith("/s/"):
            return self._handle_share_serve()
        self.send_error(404)

    def do_GET(self):
        self._bind_request_user()
        if self.path == "/api/authcheck":
            return self._handle_authcheck()
        if self.path == "/api/ping":
            # Trivial liveness probe (no side effects): the systemd watchdog and
            # any external monitor hit this to confirm the HTTP loop is answering.
            self._json(200, {"ok": True})
            return
        if self.path == "/api/me":
            # The authenticated principal for this request + their real home.
            # Front-ends that are static files (can't be stamped per-user) use
            # this to anchor on the logged-in user's home — notably files.html,
            # which opens the Files app at ~ (FileBrowser is rooted at /).
            user = _ctx_user()
            self._json(200, {"user": user, "home": _ctx_home()})
            return
        if self.path == "/api/terminals/status":
            self._json(200, {"running": self._get_running_terminals()})
            return
        if self.path == "/api/terminals/names":
            self._json(200, {"names": _read_tab_names()})
            return
        if self.path == "/api/x/windows":
            return self._handle_x_windows()
        if self.path.startswith("/api/office/config"):
            return self._handle_office_config()
        if self.path.startswith("/api/office/download"):
            return self._handle_office_download()
        if self.path.startswith("/api/office/doc"):
            return self._handle_office_doc()
        if self.path.startswith("/api/office/preview"):
            return self._handle_office_preview()
        if self.path == "/api/update" or self.path.startswith("/api/update?"):
            self._json(200, self._update_version_info())
            return
        if self.path == "/api/system/status":
            self._json(200, self._get_system_status())
            return
        if self.path == "/api/claude/usage":
            if not self._require_admin():   # discloses APP_USER's plan usage
                return
            self._json(200, _claude_usage_payload())
            return
        if self.path == "/api/claude/stats":
            try:
                self._json(200, claude_stats.get_stats(_office_home()))
            except Exception as e:
                log.warning("claude stats failed: %s", e)
                self._json(500, {"error": str(e)})
            return
        if self.path == "/api/share/list":
            return self._handle_share_list()
        if self.path == "/api/files/tabs":
            try:
                with open(_files_tabs_file()) as f:
                    data = json.load(f)
            except Exception:
                data = {}
            paths = data.get("paths") if isinstance(data, dict) else None
            if not isinstance(paths, list) or not paths:
                paths = ["/files/files/"]
            active = data.get("active") if isinstance(data, dict) else 0
            if not isinstance(active, int) or active < 0 or active >= len(paths):
                active = 0
            self._json(200, {"paths": paths, "active": active})
            return
        if self.path == "/api/notes" or self.path.startswith("/api/notes?"):
            # No id -> the tab index {tabs, active}; ?id=N -> {content} of note N.
            nid = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("id", [None])[0]
            if nid is None:
                self._json(200, _read_notes_index())
                return
            if not _safe_note_id(nid):
                self._json(400, {"error": "bad note id"})
                return
            try:
                with open(_note_file(nid)) as f:
                    content = f.read()
            except (FileNotFoundError, OSError):
                content = ""
            self._json(200, {"content": content})
            return
        if self.path.startswith("/api/desktop"):
            # GET /api/desktop?instance=<id>: this instance's own windows (for
            # restore) + the live cross-instance union (dots) + reset epoch.
            qs = urllib.parse.urlparse(self.path).query
            instance = urllib.parse.parse_qs(qs).get("instance", [""])[0][:64]
            now = time.time()
            # Claude usage reflects APP_USER's ~/.claude + a single shared proxy, so
            # only fold it for the operator (else it leaks the admin's plan usage to
            # every user). Non-admins get claude_usage:false and no numbers.
            cu = _claude_usage_enabled() and (_ctx_user() == APP_USER)
            nterm = len(self._get_running_terminals())   # Start-menu badge, folded on
            with _desktop_lock:
                state = _read_desktop_state()
                ent = state["instances"].get(instance) if instance else None
                if instance:
                    if not isinstance(ent, dict):
                        ent = {"open": [], "active": None}
                    ent["ts"] = now              # heartbeat: join the union now
                    state["instances"][instance] = ent
                    _desktop_cap(state)
                _desktop_prune_targets(state, now)
                if instance:
                    _write_desktop_state(state)
                want_sys = state.get("sys_stats", True)
                resp = {
                    "open": (ent or {}).get("open", []),
                    "active": (ent or {}).get("active"),
                    "running": _desktop_union(state, now),
                    "reset_epoch": state["reset_epoch"],
                    "close_targets": state["close_targets"],
                    "sys_stats": want_sys,
                    "claude_usage": cu,
                    "terminals_running": nterm,
                }
            if want_sys:   # taskbar stats folded onto the heartbeat
                resp["system"] = self._get_system_status()
            if cu:         # Claude-Usage numbers folded on too (retires the 30s poll)
                resp["claude"] = _claude_usage_payload(cu)
            resp["warnings"] = _cached("sys_warnings", 5.0, _system_warnings)   # red-banner alerts (always)
            self._json(200, resp)
            return
        if self.path == "/api/upload/list":
            files = []
            if os.path.isdir(_upload_dir()):
                for name in sorted(os.listdir(_upload_dir())):
                    p = os.path.join(_upload_dir(), name)
                    try:
                        st = os.stat(p)
                    except OSError:
                        continue
                    if not os.path.isfile(p) or os.path.islink(p):
                        continue
                    files.append({"name": name, "size": st.st_size,
                                  "mtime": int(st.st_mtime)})
            # Newest first — quick-sync users care about what just landed.
            files.sort(key=lambda f: f["mtime"], reverse=True)
            # Compute path relative to APP_USER's home so the client can deep-
            # link into FileBrowser (which is rooted at ~).
            home = os.path.expanduser(f"~{APP_USER}").rstrip("/") + "/"
            rel = _upload_dir()[len(home):] if _upload_dir().startswith(home) else None
            self._json(200, {"dir": _upload_dir(), "rel_to_home": rel, "files": files})
            return
        if self.path == "/api/health":
            self._json(200, self._check_health())
            return
        if self.path == "/api/services/discover":
            # Auto-discovered network services (listening non-loopback sockets +
            # /proc cmdlines). Host-wide info incl. other users' processes ->
            # operator only (a non-admin shouldn't enumerate the host's services).
            if not self._require_admin():
                return
            # Memoized ~5s: the scan shells out to `ss` + reads /proc, and every
            # open Services dashboard polls this.
            self._json(200, _cached("services_discover", 5.0,
                                    service_discovery.discover))
            return
        if self.path == "/api/events":
            return self._handle_events()
        if self.path == "/api/metrics":
            return self._handle_metrics()
        if self.path.startswith("/s/"):
            return self._handle_share_serve()
        self.send_error(404)

    def _handle_metrics(self):
        # Snapshot the in-process counters (see _METRICS). A plain JSON snapshot —
        # no time series — meant for `curl …/api/metrics | jq` and a future
        # external monitor. Cheap enough to poll.
        with _metrics_lock:
            counted = _METRICS["request_counted"]
            avg = (_METRICS["request_seconds_total"] / counted) if counted else 0.0
            data = {
                "uptime_seconds": round(time.time() - _START_TIME, 1),
                "requests_total": _METRICS["requests_total"],
                "requests_in_flight": _METRICS["in_flight"],
                "request_avg_seconds": round(avg, 4),
                "responses": {str(k): v for k, v in _METRICS["responses"].items()},
                "errors_total": _METRICS["errors_total"],
                "sse_clients": _METRICS["sse_clients"],
                "terminals_started_total": _METRICS["terminals_started_total"],
                "terminals_stopped_total": _METRICS["terminals_stopped_total"],
            }
        data["terminals_running"] = len(self._get_running_terminals())
        self._json(200, data)

    def _handle_events(self):
        # Cap concurrent streams: each holds a thread for the client's lifetime and
        # ThreadingHTTPServer has no connection limit, so an abusive client could
        # exhaust the pool. Reject past the cap with 503 (EventSource auto-retries).
        with _metrics_lock:
            if _METRICS["sse_clients"] >= _SSE_MAX_CLIENTS:
                over = True
            else:
                _METRICS["sse_clients"] += 1
                over = False
        if over:
            try:
                self.send_response(503)
                self.send_header("Content-Type", "text/plain")
                self.send_header("Retry-After", "10")
                self.send_header("Connection", "close")
                self.end_headers()
                self.wfile.write(b"too many event streams\n")
            except (OSError, ValueError):
                pass
            return
        try:
            self._events_stream()
        finally:
            with _metrics_lock:
                _METRICS["sse_clients"] -= 1

    def _events_stream(self):
        # Server-Sent Events: push a 'reload' when the deployed shell version
        # (sw.js VERSION) changes, so every connected client refreshes on deploy
        # with no client-side polling. X-Accel-Buffering:no disables nginx response
        # buffering for this stream (so no nginx config is needed); the ~18s pings
        # keep proxies from idling the connection out and detect a dead client.
        ver0 = _cached("shell_ver", 5.0, _shell_version)
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Accel-Buffering", "no")
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(f"retry: 5000\nevent: hello\ndata: {ver0}\n\n".encode())
            self.wfile.flush()
        except (OSError, ValueError):
            return
        last_ping = time.monotonic()
        while True:
            time.sleep(2)
            try:
                cur = _cached("shell_ver", 5.0, _shell_version)
                if cur != ver0 and cur != "?":
                    self.wfile.write(f"event: reload\ndata: {cur}\n\n".encode())
                    self.wfile.flush()
                    log.info("events: pushed reload %s->%s", ver0, cur)
                    return
                now = time.monotonic()
                if now - last_ping >= 18:
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
                    last_ping = now
            except (OSError, ValueError):
                return   # client disconnected / write failed

    def _check_health(self):
        import urllib.request, ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        checks = {
            "terminals": f"http://127.0.0.1:{BASE_PORT + 1}/t1/",
            "browser": f"http://127.0.0.1:{XPRA_PORT}/",
            "files": f"http://127.0.0.1:{FB_PORT}/files/",
        }
        # Merge host-local services (each with a "key" and a "health" URL).
        try:
            with open(SERVICES_FILE) as f:
                for s in json.load(f):
                    key, url = s.get("key"), s.get("health") or s.get("url")
                    if key and url:
                        checks[key] = url
        except Exception:
            pass
        # Probe concurrently — sequentially, one down service (2s timeout)
        # delays every dot behind it.
        def probe(name_url):
            name, url = name_url
            try:
                kw = {"timeout": 2}
                if url.startswith("https"):
                    kw["context"] = ctx
                with urllib.request.urlopen(url, **kw):
                    pass          # close the response so the socket isn't leaked
                return name, True
            except urllib.error.HTTPError:
                return name, True
            except Exception:
                return name, False
        with ThreadPoolExecutor(max_workers=8) as ex:
            return dict(ex.map(probe, checks.items()))

    def _json(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        # API responses are dynamic — never let a browser/SW cache them (a stale
        # cache of /api/update once kept the Update app showing an old version).
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        # Per-request access line — high volume (every client polls a few endpoints
        # every 5s), so keep it at DEBUG (LOG_LEVEL=DEBUG to turn it on).
        log.debug("%s %s", self.address_string(), fmt % args)

    def handle_one_request(self):
        # Wrap each request for the /api/metrics counters: total, in-flight gauge,
        # and summed latency. The long-lived SSE stream is excluded from the
        # latency sum (it would dwarf real request times) but still counts as a
        # request and as an sse_clients gauge entry (tracked in _handle_events).
        start = time.monotonic()
        with _metrics_lock:
            _METRICS["requests_total"] += 1
            _METRICS["in_flight"] += 1
        try:
            super().handle_one_request()
        finally:
            dt = time.monotonic() - start
            is_sse = getattr(self, "path", "") == "/api/events"
            with _metrics_lock:
                _METRICS["in_flight"] -= 1
                if not is_sse:
                    _METRICS["request_seconds_total"] += dt
                    _METRICS["request_counted"] += 1

    def log_request(self, code="-", size="-"):
        # Called by send_response/send_error for every reply — the one place that
        # sees the final status code. Tally it (and 5xx as errors) for /api/metrics,
        # then fall through to the default (DEBUG access line via log_message).
        try:
            c = int(code)
        except (TypeError, ValueError):
            c = 0
        with _metrics_lock:
            _METRICS["responses"][c] = _METRICS["responses"].get(c, 0) + 1
            if c >= 500:
                _METRICS["errors_total"] += 1
        super().log_request(code, size)


def _sd_notify(state):
    """Best-effort systemd sd_notify, no python-systemd dependency. A no-op when
    not run under systemd (NOTIFY_SOCKET unset), so local and test runs are
    unaffected. `state` is e.g. "READY=1" or "WATCHDOG=1"."""
    addr = os.environ.get("NOTIFY_SOCKET")
    if not addr:
        return
    if addr[0] == "@":                       # abstract namespace socket
        addr = "\0" + addr[1:]
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as s:
            s.connect(addr)
            s.sendall(state.encode())
    except OSError:
        pass


def _watchdog_loop(port):
    """Pet systemd's watchdog only while the manager is actually answering HTTP.

    systemd sets WATCHDOG_USEC when the unit has WatchdogSec=; we ping at half
    that period. Crucially the ping is gated on a real loopback GET /api/ping —
    so a *wedged* manager (accept loop stuck, thread pool exhausted, interpreter
    deadlocked) stops petting the dog and systemd restarts it, which a plain
    Restart=on-failure (crash-only) would never catch. A single slow probe is
    tolerated: the timeout (half-period) < WatchdogSec, so it takes two
    consecutive misses to trip — no spurious restart under a brief load spike."""
    import urllib.request
    usec = os.environ.get("WATCHDOG_USEC")
    if not usec:
        return                               # WatchdogSec= not set on the unit
    try:
        # Pet at a third of the window so two consecutive missed probes are
        # tolerated before WatchdogSec trips (no flap under a brief load spike).
        period = max(1.0, int(usec) / 1e6 / 3.0)
    except ValueError:
        return
    url = f"http://127.0.0.1:{port}/api/ping"
    while True:
        time.sleep(period)
        try:
            with urllib.request.urlopen(url, timeout=period) as r:
                if r.status == 200:
                    _sd_notify("WATCHDOG=1")
        except Exception:
            pass                             # missed ping → systemd notices if it persists


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else BASE_PORT
    # Threaded: a slow request (multi-GB upload, health probe, the 0.1s CPU
    # sample fallback) must not block the status polls every desktop client
    # sends — with the plain single-threaded HTTPServer an upload froze every
    # other endpoint for its whole duration. The _prev_* snapshot globals are
    # shared across threads; a rare concurrent-poll race only skews one
    # reading, which the next poll corrects.
    # Seed the per-host update log with a "deployed" baseline on first start
    # (≈ deploy time) so the history starts from when this deployment came up.
    _seed_update_history()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    log.info("terminal-manager listening on 127.0.0.1:%d (log level %s)",
             port, logging.getLevelName(log.level))
    _sd_notify("READY=1")                                 # Type=notify readiness (ignored otherwise)
    threading.Thread(target=_watchdog_loop, args=(port,), daemon=True).start()
    server.serve_forever()

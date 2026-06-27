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
import hashlib
import hmac
import http.server
import json
import logging
import logging.handlers
import os
import pwd
import re
import shlex
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import threading
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

import system_status  # sibling module: /api/system/status data collection

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


def _list_running_terminals():
    # On the status hot path (every client polls this every few seconds). A
    # wedged systemd/D-Bus must not stall every poll behind it forever, so cap
    # the fork with a timeout and degrade to "none running" rather than raising.
    try:
        out = subprocess.run(
            ["systemctl", "list-units", "vibetop-ttyd@*",
             "--no-pager", "--plain", "--no-legend"],
            capture_output=True, text=True, timeout=10,
        )
    except (subprocess.TimeoutExpired, OSError) as e:
        log.warning("list-units failed/timed out: %s", e)
        return []
    running = []
    for line in out.stdout.strip().split("\n"):
        m = re.search(r"vibetop-ttyd@(\d+)", line)
        if m and "running" in line:
            running.append(int(m.group(1)))
    return sorted(running)


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
# Notes: multi-document now. Each note is NOTES_DIR/<id>.md; NOTES_INDEX_FILE holds
# the tab list/order/names/active ({tabs:[{id,name}], active}) server-side (so a
# rename/new/reorder shows up on every device, like terminal tab names). NOTES_FILE
# is the LEGACY single-note file, migrated into tab "1" on first use (kept, not
# deleted, as a safety net).
NOTES_FILE = os.path.expanduser(f"~{APP_USER}/.local/share/desktop-notes.md")
NOTES_DIR = os.path.expanduser(f"~{APP_USER}/.local/share/desktop-notes")
NOTES_INDEX_FILE = os.path.join(NOTES_DIR, "index.json")
_notes_lock = threading.Lock()
_NOTE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def _safe_note_id(nid):
    """A note id is safe iff it's [A-Za-z0-9_-]{1,64} — so it can only ever be a
    plain filename inside NOTES_DIR, never a path-traversal (`../`, `/etc/...`).
    Pure function so it can be unit-tested in isolation."""
    return isinstance(nid, str) and bool(_NOTE_ID_RE.match(nid))


def _note_file(nid):
    return os.path.join(NOTES_DIR, nid + ".md")


def _read_notes_index():
    """Tab index {tabs:[{id,name}], active}. Seeds a default and migrates the
    legacy single-note file into tab '1' on first use. Serialized by _notes_lock."""
    with _notes_lock:
        try:
            with open(NOTES_INDEX_FILE) as f:
                data = json.load(f)
            if isinstance(data, dict) and isinstance(data.get("tabs"), list) and data["tabs"]:
                return data
        except (FileNotFoundError, json.JSONDecodeError, ValueError, OSError):
            pass
        os.makedirs(NOTES_DIR, exist_ok=True)
        _chown_app(NOTES_DIR)
        if not os.path.exists(_note_file("1")):
            try:
                with open(NOTES_FILE) as f:
                    legacy = f.read()
            except (FileNotFoundError, OSError):
                legacy = ""
            _atomic_write(_note_file("1"), legacy)   # migrate; legacy file left intact
        data = {"tabs": [{"id": "1", "name": "Notes"}], "active": "1"}
        _atomic_write(NOTES_INDEX_FILE, json.dumps(data))
        return data


def _write_notes_index(data):
    _atomic_write(NOTES_INDEX_FILE, json.dumps(data))


# Files app tab set — shared across devices (one set, loaded when the Files app
# opens, saved on change). Each entry is a FileBrowser browse URL (/files/files/…).
FILES_TABS_FILE = os.path.expanduser(f"~{APP_USER}/.local/share/desktop-files-tabs.json")
_files_tabs_lock = threading.Lock()
# Terminal tab names, keyed by instance number. Server-side (not per-browser
# localStorage) so a rename shows up in every session/device — terminal N is the
# same shared session everywhere.
TAB_NAMES_FILE = os.path.expanduser(f"~{APP_USER}/.local/share/terminal-tab-names.json")
_tab_names_lock = threading.Lock()
DESKTOP_STATE_FILE = os.path.expanduser(f"~{APP_USER}/.local/share/desktop-state.json")
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
_desktop_lock = threading.Lock()
# Per-host update log (real history of THIS deployment's self-updates, seeded
# with a "deployed" baseline on first run) — not the git changelog.
UPDATE_HISTORY_FILE = os.path.expanduser(f"~{APP_USER}/.local/share/vibetop-update-history.json")
UPDATE_HISTORY_MAX = 200
UPLOAD_DIR = os.environ.get(
    "UPLOAD_DIR", os.path.expanduser(f"~{APP_USER}/Uploads")
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

# ---- Office (Word/Excel/PPT) view & edit -----------------------------------
# View: convert to PDF with headless LibreOffice (cached) and serve it inline.
# Edit: open the file in the OnlyOffice web editor (Document Server, below).
OFFICE_RE = re.compile(
    r"\.(docx?|docm|dotx?|dotm|xlsx?|xlsm|xlsb|xltx?|xltm|pptx?|pptm|ppsx?|ppsm"
    r"|potx?|potm|odt|ods|odp|ott|ots|otp|rtf|csv|tsv)$", re.I)
OFFICE_HOME = os.path.expanduser(f"~{APP_USER}")
OFFICE_CACHE_DIR = os.path.join(OFFICE_HOME, ".cache", "vibetop-office")
# A LibreOffice user profile dedicated to headless conversion, kept separate
# from the interactive instance so a "View" never collides with an open "Edit".
OFFICE_CONVERT_PROFILE = os.path.join(OFFICE_CACHE_DIR, "lo-convert-profile")

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
# The X display for the Apps desktop — a SECOND xpra session, separate from the
# Browser's Chromium display (:99), so the Browser stays its own app. The Apps
# launcher runs GUI apps here, and terminal shells export it (so X11 apps started
# from a terminal show up as Apps tabs). Matches browser/install.sh's
# APPS_DISPLAY_NUM.
APPS_DISPLAY = os.environ.get("APPS_DISPLAY", ":98")
ONLYOFFICE_SECRET_FILE = os.path.expanduser(f"~{APP_USER}/.config/vibetop/onlyoffice.secret")
ONLYOFFICE_HOST = os.environ.get("ONLYOFFICE_CALLBACK_HOST", "http://host.docker.internal")
# Extension -> OnlyOffice documentType.
_OO_CELL = {"xlsx", "xls", "xlsm", "xlsb", "xltx", "xltm", "ods", "ots", "csv", "tsv"}
_OO_SLIDE = {"pptx", "ppt", "pptm", "ppsx", "ppsm", "potx", "potm", "odp", "otp"}
# "New document" — blank templates (bundled in the repo) stamped into ~/Documents
# when the Office app is opened with no file. documentType -> (ext, label).
OFFICE_NEW_DIR = os.path.join(OFFICE_HOME, "Documents")
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

# System-status readers (CPU/MEM/GPU/disk/net/processes) live in system_status.py
# and are reached via system_status.get_system_status(); the per-poll CPU/RAPL/
# disk/process snapshot globals moved there with them.


class _MultipartError(Exception):
    pass


def _chown_app(path):
    """Set ownership of `path` to APP_USER if running as root (the manager
    typically does). Best-effort — silently ignored on failure."""
    try:
        if os.geteuid() != 0:
            return
        pw = pwd.getpwnam(APP_USER)
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
        with open(TAB_NAMES_FILE) as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError, ValueError, OSError):
        return {}


def _write_tab_names(d):
    _atomic_write(TAB_NAMES_FILE, json.dumps(d))


def _read_desktop_state():
    """Load the desktop registry, tolerating a missing/old-format/corrupt file."""
    try:
        with open(DESKTOP_STATE_FILE) as f:
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
    _atomic_write(DESKTOP_STATE_FILE, json.dumps(data))


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


def _resolve_under_home(rel):
    """Map a FileBrowser-relative path to an absolute file under APP_USER's home,
    refusing anything that escapes it (symlinks resolved). Returns None if the
    path is unsafe or not a regular file."""
    if not rel:
        return None
    rel = rel.lstrip("/")
    try:
        base = os.path.realpath(OFFICE_HOME)
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


def _onlyoffice_sig(secret, rel):
    """Short HMAC over the path — authorizes the doc/callback endpoints, which
    the container reaches unauthenticated (Cloudflare Access is edge-only)."""
    return hmac.new(secret.encode(), rel.encode(), hashlib.sha256).hexdigest()[:32]


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


def _office_convert_to_pdf(src):
    """Convert `src` to PDF via headless LibreOffice, cached by realpath+mtime.
    Returns the cached PDF path, or None on failure. Serialized: LibreOffice
    locks its profile, so two conversions can't share one safely."""
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        return None
    try:
        st = os.stat(src)
    except OSError:
        return None
    key = hashlib.sha1(f"{src}:{int(st.st_mtime)}:{st.st_size}".encode()).hexdigest()
    cached = os.path.join(OFFICE_CACHE_DIR, key + ".pdf")
    if os.path.isfile(cached):
        return cached
    with _office_convert_lock:
        if os.path.isfile(cached):       # another thread just made it
            return cached
        os.makedirs(OFFICE_CACHE_DIR, exist_ok=True)
        _chown_app(OFFICE_CACHE_DIR)
        _chown_app(os.path.dirname(OFFICE_CACHE_DIR))
        env = _office_user_env(APP_USER)
        if env is None:
            return None
        try:
            p = subprocess.run(
                [soffice, "--headless", "--nologo", "--norestore",
                 "-env:UserInstallation=file://" + OFFICE_CONVERT_PROFILE,
                 "--convert-to", "pdf", "--outdir", OFFICE_CACHE_DIR, src],
                env=env, user=APP_USER, capture_output=True, text=True, timeout=120)
        except Exception:
            return None
        # LibreOffice writes <stem>.pdf into outdir; rename to the cache key.
        produced = os.path.join(OFFICE_CACHE_DIR,
                                os.path.splitext(os.path.basename(src))[0] + ".pdf")
        if not os.path.isfile(produced):
            return None
        try:
            os.replace(produced, cached)
        except OSError:
            return None
        _chown_app(cached)
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
        # 2s TTL: both /api/system/status and /api/terminals/status poll this,
        # and each miss forks `systemctl list-units`.
        return _cached("running_terminals", 2.0, _list_running_terminals)

    def _get_system_status(self):
        # Collection lives in system_status.py; inject the running-terminal
        # list and the shared _cached memoizer (terminal start/stop
        # invalidates its running_terminals entry). Guarded so an unexpected
        # /proc/sysfs hiccup degrades to a 200 with an error, not a 500.
        try:
            return system_status.get_system_status(
                self._get_running_terminals(), _cached)
        except Exception as e:
            log.warning("system status collection failed: %s", e)
            return {"error": "status unavailable: %s" % e}

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

    def do_POST(self):
        # The OnlyOffice container's save callback is a server-to-server POST
        # authenticated by its own path HMAC (t=) + a required JWT, not a browser
        # request — exempt it from the Origin/CSRF gate so a proxy that injected
        # an Origin can't 403 it and silently lose document saves.
        if not self.path.startswith("/api/office/callback") and not self._csrf_ok():
            log.warning("rejected cross-origin POST to %s (Origin=%s Host=%s)",
                        self.path, self.headers.get("Origin"), self.headers.get("Host"))
            self._json(403, {"error": "cross-origin request rejected"})
            return
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
        if self.path == "/api/desktop":
            return self._handle_desktop_save()
        if self.path == "/api/desktop/close":
            return self._handle_desktop_close()
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
            with _update_lock:
                _write_update_history([])
            return self._json(200, {"ok": True})
        self.send_error(404)

    def _handle_upload_clear(self):
        # Delete every regular file directly inside UPLOAD_DIR. Subdirectories
        # are left alone (this endpoint is for clearing the quick-sync inbox,
        # not nuking arbitrary trees).
        if not os.path.isdir(UPLOAD_DIR):
            self._json(200, {"ok": True, "removed": 0})
            return
        removed = 0
        for name in os.listdir(UPLOAD_DIR):
            p = os.path.join(UPLOAD_DIR, name)
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
        os.makedirs(NOTES_DIR, exist_ok=True)
        _chown_app(NOTES_DIR)
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
            _atomic_write(FILES_TABS_FILE, json.dumps({"paths": paths, "active": active}))
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
            os.makedirs(NOTES_DIR, exist_ok=True)
            _chown_app(NOTES_DIR)
            _write_notes_index({"tabs": tabs, "active": active})
            # A closed tab's note file is removed (the note is gone). The client
            # confirms before closing a non-empty note, so this isn't a surprise.
            try:
                for fn in os.listdir(NOTES_DIR):
                    if fn.endswith(".md") and fn[:-3] not in seen:
                        try:
                            os.remove(os.path.join(NOTES_DIR, fn))
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
        # UPLOAD_DIR. We don't use cgi.FieldStorage because it spools entire
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
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        _chown_app(UPLOAD_DIR)
        saved, total_bytes = [], 0
        partial = None  # file currently being written, if a part fails mid-copy
        try:
            for filename, src in _iter_multipart_files(body, boundary):
                safe = _safe_upload_name(filename)
                out, dst = _open_unique(os.path.join(UPLOAD_DIR, safe))
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
                         "dir": UPLOAD_DIR})

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
        with _desktop_lock:
            state = _read_desktop_state()
            state["instances"][instance] = {
                "open": open_apps, "active": active, "ts": now,
            }
            _desktop_cap(state)
            _desktop_prune_targets(state, now)
            _write_desktop_state(state)
            resp = {"ok": True, "running": _desktop_union(state, now),
                    "reset_epoch": state["reset_epoch"],
                    "close_targets": state["close_targets"]}
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

    def _handle_reset(self):
        """Full 'fresh start' reset, wired to the desktop's logout button:
        stop every terminal (kills their background processes), clear the saved
        desktop layout, drop in-memory office edit sessions, and reset the
        Browser to a blank Chromium — so the next login starts clean."""
        result = {"terminals_stopped": [], "desktop_cleared": False,
                  "office_sessions_cleared": 0, "browser_reset": False}

        # 1. Stop every running terminal (session + ttyd units).
        try:
            running = _list_running_terminals()
        except Exception:
            running = []
        if running:
            units = []
            for n in running:
                units += [f"vibetop-ttyd@{n}.service",
                          f"vibetop-session@{n}.service"]
            # Logout/reset = hard clean slate. The session unit is KillMode=process
            # (so a plain tab-close `stop` spares detached procs — ssh masters,
            # tmux, nohup), but logout must wipe them: SIGKILL the whole cgroup
            # first (`kill --kill-whom=all` hits every process regardless of
            # KillMode), then stop. (Killing the main pid can momentarily trip
            # Restart=always, but the immediate stop cancels it and the detached
            # procs are already dead — outcome is a clean slate either way.)
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
            _cache.pop("running_terminals", None)

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

        # 4. Reset the Browser to a blank Chromium. Stop the service first so
        #    Chromium is fully dead (and can't re-save its session on exit),
        #    wipe the session-restore files, then start it again —
        #    browser-loop.sh respawns Chromium with nothing to restore.
        if os.path.exists("/etc/systemd/system/vibetop-browser-xpra.service"):
            try:
                subprocess.run(
                    ["systemctl", "stop", "vibetop-browser-xpra.service"],
                    check=False, capture_output=True, text=True, timeout=30)
                profile = (f"/home/{APP_USER}/snap/chromium/common/"
                           "xpra-profile/Default")
                for name in ("Last Session", "Last Tabs",
                             "Current Session", "Current Tabs"):
                    try:
                        os.remove(os.path.join(profile, name))
                    except OSError:
                        pass
                shutil.rmtree(os.path.join(profile, "Sessions"),
                              ignore_errors=True)
                subprocess.run(
                    ["systemctl", "start", "--no-block",
                     "vibetop-browser-xpra.service"],
                    check=False, capture_output=True, text=True)
                result["browser_reset"] = True
            except Exception:
                pass

        # 5. Clear the Apps desktop — restart its xpra session so every launched
        #    GUI app (and any X11 app started from a terminal) is gone too.
        if os.path.exists("/etc/systemd/system/vibetop-apps-xpra.service"):
            try:
                subprocess.run(
                    ["systemctl", "restart", "--no-block",
                     "vibetop-apps-xpra.service"],
                    check=False, capture_output=True, text=True, timeout=30)
                result["apps_reset"] = True
            except Exception:
                pass

        log.info("reset: stopped %d terminal(s), browser_reset=%s apps_reset=%s",
                 len(result["terminals_stopped"]), result.get("browser_reset"),
                 result.get("apps_reset"))
        self._json(200, {"ok": True, **result})

    def _handle_browser_open(self):
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
        user = os.environ.get("BROWSER_USER", APP_USER)
        try:
            uid = pwd.getpwnam(user).pw_uid
        except KeyError:
            self._json(500, {"error": f"unknown user: {user}"})
            return
        profile = f"/home/{user}/snap/chromium/common/xpra-profile"
        # The URL is already validated (http(s) + no shell metacharacters incl.
        # backslash, see _valid_browser_url) before it reaches this `su -c`
        # shell string. Reap the child in a daemon thread so short-lived
        # `chromium <url>` invocations (which exit fast when handing off to the
        # already-running instance) don't pile up as zombies.
        proc = subprocess.Popen(
            ["su", "-", user, "-c",
             f'DISPLAY=:99 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/{uid}/bus'
             f' /snap/bin/chromium --user-data-dir={profile} "{url}"'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        threading.Thread(target=proc.wait, daemon=True).start()
        self._json(200, {"ok": True, "url": url})

    # ---- Apps launcher: run/list/switch GUI apps on the xpra display --------

    def _handle_x_launch(self):
        # POST {cmd} — run an arbitrary GUI command on the Browser's xpra display
        # as the app user (their own login shell, like opening a terminal). The
        # window then appears in the Browser canvas. X11 apps started from a
        # terminal share this same display (the session unit exports DISPLAY), so
        # they show up in /api/x/windows without going through here.
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
        user = os.environ.get("BROWSER_USER", APP_USER)
        try:
            uid = pwd.getpwnam(user).pw_uid
        except KeyError:
            self._json(500, {"error": f"unknown user: {user}"})
            return
        # Pick the D-Bus session per app:
        #  - snap apps (Firefox/Chromium/…) need the user's REAL session bus to
        #    run at all (snap confinement / io.snapcraft.SessionAgent); on a bare
        #    bus they exit immediately. They don't block on the portal anyway.
        #  - everything else (GTK/GNOME apps like eog/evince) gets the PRIVATE
        #    apps bus (vibetop-apps-dbus, no service activation) so they don't hang
        #    ~25s on xdg-desktop-portal/at-spi activation timeouts — ~0.2s instead.
        prog = _launch_prog(cmd)
        is_snap = prog.startswith("/snap/") or (
            os.path.basename(prog) != "" and
            os.path.exists(f"/snap/bin/{os.path.basename(prog)}"))
        dbus_sock = (f"/run/user/{uid}/bus" if is_snap
                     else f"/run/user/{uid}/vibetop-apps-bus")
        log.info("x/launch %r (bus=%s)", cmd, "user" if is_snap else "apps")
        # Login shell (-) so the user's PATH resolves bare names like `gimp`.
        # Reap in a daemon thread so short-lived launchers don't linger as zombies.
        shell_cmd = (f'DISPLAY={APPS_DISPLAY} '
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
        """Run wmctrl against the xpra display as the app user. Returns the
        CompletedProcess, or None if it couldn't run."""
        user = os.environ.get("BROWSER_USER", APP_USER)
        try:
            pw = pwd.getpwnam(user)
        except KeyError:
            return None
        if not shutil.which("wmctrl"):
            return None
        env = {
            "DISPLAY": APPS_DISPLAY,
            "DBUS_SESSION_BUS_ADDRESS": f"unix:path=/run/user/{pw.pw_uid}/bus",
            "HOME": pw.pw_dir, "PATH": "/usr/bin:/bin",
        }
        try:
            return subprocess.run(["wmctrl"] + args, env=env, user=user,
                                  capture_output=True, text=True, timeout=5)
        except Exception:
            return None

    def _handle_x_windows(self):
        # GET -> {"windows": [{"id", "title"}]} from `wmctrl -l` on the Apps
        # display. Lines look like `0x01400003  0 host  Title with spaces`
        # (id, desktop, client host, title). Chromium isn't here (it's on the
        # Browser's own display), so no filtering beyond the WM desktop sentinel.
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
            os.makedirs(OFFICE_NEW_DIR, exist_ok=True)
            _chown_app(OFFICE_NEW_DIR)
            dst = _unique_path(os.path.join(
                OFFICE_NEW_DIR, f"{label} {time.strftime('%Y-%m-%d %H%M')}.{ext}"))
            shutil.copyfile(tmpl, dst)
            _chown_app(dst)
        except OSError as e:
            return self._json(500, {"error": f"could not create document: {e}"})
        self._json(200, {"ok": True, "path": os.path.relpath(dst, OFFICE_HOME)})

    def _handle_office_config(self):
        # GET ?path= -> the signed DocEditor config the editor page mounts.
        rel = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("path", [""])[0]
        src = _resolve_under_home(rel)
        secret = _onlyoffice_secret()
        if not src or not OFFICE_RE.search(src):
            return self._json(400, {"error": "not an office file"})
        if not secret:
            return self._json(500, {"error": "OnlyOffice is not configured on this host"})
        st = os.stat(src)
        with _office_sessions_lock:
            key = _office_sessions.get(rel)
            if not key:
                key = hashlib.sha1(
                    f"{src}:{int(st.st_mtime)}:{st.st_size}:{int(time.time())}".encode()
                ).hexdigest()[:22]
                _office_sessions[rel] = key
                # Bound the map: a session is normally popped on the close
                # callback, but a callback that never arrives (container/network
                # death) would leak an entry forever. Drop the oldest beyond the
                # cap (dicts preserve insertion order) so it can't grow without
                # limit. The dropped session just re-mints a key on next open.
                while len(_office_sessions) > 64:
                    _office_sessions.pop(next(iter(_office_sessions)))
        ext = os.path.splitext(src)[1].lstrip(".").lower()
        qp = urllib.parse.urlencode({"path": rel, "t": _onlyoffice_sig(secret, rel)})
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
        # GET ?path=&t= -> raw file bytes for the OnlyOffice container to load.
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        rel, tok = q.get("path", [""])[0], q.get("t", [""])[0]
        src = _resolve_under_home(rel)
        secret = _onlyoffice_secret()
        if (not src or not secret or not OFFICE_RE.search(src)
                or not hmac.compare_digest(_onlyoffice_sig(secret, rel), tok)):
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
        rel, tok = q.get("path", [""])[0], q.get("t", [""])[0]
        src = _resolve_under_home(rel)
        secret = _onlyoffice_secret()
        if (not src or not secret or not OFFICE_RE.search(src)
                or not hmac.compare_digest(_onlyoffice_sig(secret, rel), tok)):
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
            self._office_save_back(data["url"], src)
        # 2 = closed-with-changes (saved), 3 = save error, 4 = closed-no-changes.
        # The editing session has ended → drop the session key so a reopen gets a
        # fresh key (and loads the file from disk, not the server's stale cache).
        if status in (2, 3, 4):
            with _office_sessions_lock:
                _office_sessions.pop(rel, None)
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
            key = _office_sessions.get(rel)
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

    def _office_save_back(self, url, dst):
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
            _chown_app(dst)
        except Exception as e:
            log.warning("office: save-back failed from %s: %s", local, e)

    def _handle_terminal(self, m):
        n, action = int(m.group(1)), m.group(2)
        if n < 1 or n > MAX_INSTANCE:
            self._json(400, {"error": f"instance must be 1-{MAX_INSTANCE}"})
            return
        units = [f"vibetop-session@{n}.service", f"vibetop-ttyd@{n}.service"]
        if action == "stop":
            units.reverse()
        try:
            subprocess.run(
                ["systemctl", action, "--no-block"] + units,
                check=True, capture_output=True, text=True, timeout=30,
            )
        except subprocess.CalledProcessError as e:
            log.warning("terminal %d %s failed: %s", n, action, (e.stderr or "").strip())
            self._json(500, {"error": (e.stderr or "").strip()})
            return
        except (subprocess.TimeoutExpired, OSError) as e:
            log.warning("terminal %d %s timed out/failed: %s", n, action, e)
            self._json(500, {"error": "systemctl timed out"})
            return
        log.info("terminal %d %s", n, action)
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

    def do_GET(self):
        if self.path == "/api/ping":
            # Trivial liveness probe (no side effects): the systemd watchdog and
            # any external monitor hit this to confirm the HTTP loop is answering.
            self._json(200, {"ok": True})
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
        if self.path == "/api/files/tabs":
            try:
                with open(FILES_TABS_FILE) as f:
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
                resp = {
                    "open": (ent or {}).get("open", []),
                    "active": (ent or {}).get("active"),
                    "running": _desktop_union(state, now),
                    "reset_epoch": state["reset_epoch"],
                    "close_targets": state["close_targets"],
                }
            self._json(200, resp)
            return
        if self.path == "/api/upload/list":
            files = []
            if os.path.isdir(UPLOAD_DIR):
                for name in sorted(os.listdir(UPLOAD_DIR)):
                    p = os.path.join(UPLOAD_DIR, name)
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
            rel = UPLOAD_DIR[len(home):] if UPLOAD_DIR.startswith(home) else None
            self._json(200, {"dir": UPLOAD_DIR, "rel_to_home": rel, "files": files})
            return
        if self.path == "/api/health":
            self._json(200, self._check_health())
            return
        if self.path == "/api/events":
            return self._handle_events()
        if self.path == "/api/metrics":
            return self._handle_metrics()
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
        # Track the open-stream gauge for /api/metrics around the stream's life.
        with _metrics_lock:
            _METRICS["sse_clients"] += 1
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

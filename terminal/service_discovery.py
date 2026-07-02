"""Auto-discovery of the host's network services from listening TCP sockets.

Powers the Services dashboard (manager `GET /api/services/discover`). The Home
Service page used to read a hand-maintained, gitignored `services.json`, which in
practice stayed the shipped example — so instead we scan `ss -tlnp` for services
listening on a non-loopback address and turn each into a card automatically. A
process listening on 0.0.0.0/:: is, by definition, a network service; loopback
-only sockets (incl. all of vibetop's own internals) are excluded.

Naming: the owning process's /proc/<pid>/cmdline is matched against a table of
well-known self-hosted apps (Ollama/Open WebUI, ThinLinc, Jupyter, Grafana, …);
unrecognized ones fall back to a port hint, then to `<proc> :<port>`.

Pure helpers (`parse_ss`, `classify`) are unit-tested in tests/; `discover()`
orchestrates the scan + /proc reads + URL building and is what the manager calls.
"""
import os
import re
import socket
import subprocess

# Ports we never surface: non-HTTP infrastructure + vibetop's own front door (80).
_SKIP_PORTS = {
    22, 25, 53, 67, 68, 111, 123, 143, 110, 389, 465, 587, 631, 636, 993, 995,
    5353, 323, 2049, 445, 139, 135, 3306, 5432, 6379, 27017, 11211, 9092, 2379,
    80,
}
# Backend daemons that listen but aren't user-facing web UIs (drop the noise).
_SKIP_PROCS = {
    "sshd", "master", "rpcbind", "rpc.statd", "rpc.mountd", "systemd-resolve",
    "systemd-resolved", "systemd-network", "cupsd", "cups-browsed",
    "avahi-daemon", "chronyd", "ntpd", "named", "dnsmasq", "postgres",
    "mysqld", "mariadbd", "redis-server", "memcached", "mongod", "smbd",
    "nmbd", "vsmagent", "vsmserver", "slapd", "exim4", "dovecot",
}
# cmdline substring -> (name, description, https). First match wins, so order
# specific-before-generic.
_RECOGNIZERS = [
    (re.compile(r"open-webui"),        ("Open WebUI", "Ollama chat UI", False)),
    (re.compile(r"\bollama\b"),        ("Ollama", "LLM API server", False)),
    (re.compile(r"tlwebaccess"),       ("ThinLinc Web Access", "Remote desktop (web client)", True)),
    (re.compile(r"tlwebadm"),          ("ThinLinc Web Admin", "ThinLinc administration", True)),
    (re.compile(r"jupyter-lab|jupyterlab"), ("JupyterLab", "Notebook workspace", False)),
    (re.compile(r"jupyter"),           ("Jupyter", "Notebook server", False)),
    (re.compile(r"streamlit"),         ("Streamlit app", "Streamlit dashboard", False)),
    (re.compile(r"code-server"),       ("code-server", "VS Code in the browser", False)),
    (re.compile(r"grafana"),           ("Grafana", "Metrics dashboards", False)),
    (re.compile(r"prometheus"),        ("Prometheus", "Metrics database", False)),
    (re.compile(r"syncthing"),         ("Syncthing", "File sync", True)),
    (re.compile(r"jellyfin"),          ("Jellyfin", "Media server", False)),
    (re.compile(r"\bplex\b|plexmediaserver"), ("Plex", "Media server", False)),
    (re.compile(r"home-?assistant|hass"), ("Home Assistant", "Smart home", False)),
    (re.compile(r"portainer"),         ("Portainer", "Docker management", False)),
    (re.compile(r"transmission"),      ("Transmission", "Torrent client", False)),
    (re.compile(r"http\.server"),      ("HTTP server", "Static file server", False)),
]
# When the cmdline is generic (nginx/node proxying an app), fall back to the port.
_PORT_HINTS = {
    11434: ("Ollama", "LLM API server", False),
    8501:  ("Streamlit app", "Streamlit dashboard", False),
    8888:  ("Jupyter", "Notebook server", False),
    8123:  ("Home Assistant", "Smart home", False),
    32400: ("Plex", "Media server", False),
    9000:  ("Web app", "", False),
    3000:  ("Web app", "", False),
}

_SS_LINE = re.compile(r'users:\(\("([^"]+)",pid=(\d+)')


def _is_loopback(bind):
    return bind.startswith("127.") or bind in ("::1", "[::1]")


def parse_ss(output):
    """Parse `ss -H -tlnp` text into [{bind, port, proc, pid}] for non-loopback
    listeners. Pure/testable — no scanning, no /proc reads."""
    out = []
    for line in output.splitlines():
        line = line.strip()
        if not line:
            continue
        cols = line.split()
        if len(cols) < 4:
            continue
        local = cols[3]                       # e.g. 0.0.0.0:8080, *:302, [::]:904
        host, _, port = local.rpartition(":")
        if not port.isdigit():
            continue
        if _is_loopback(host):
            continue
        proc, pid = "", None
        m = _SS_LINE.search(line)
        if m:
            proc, pid = m.group(1), int(m.group(2))
        out.append({"bind": host, "port": int(port), "proc": proc, "pid": pid})
    return out


_GENERIC = {"python", "python3", "node", "nodejs", "ruby", "perl", "java",
            "sh", "bash", "uvicorn", "gunicorn"}


def _effective_proc(proc, cmdline):
    """A daemon run under a generic interpreter (`python3 …/vsmagent`) reports
    the interpreter as its ss proc name — useless for naming/filtering. When the
    proc is a generic runtime, use the first real script/program token from the
    cmdline instead (basename, sans args)."""
    if proc in _GENERIC and cmdline:
        for tok in cmdline.split()[1:]:
            if tok.startswith("-"):
                continue
            base = os.path.basename(tok)
            if base and base not in _GENERIC:
                return base
    return proc


def classify(port, proc, cmdline):
    """Map a listener to (name, desc, https), or None if it should be hidden.
    `cmdline` is the full /proc/<pid>/cmdline (space-joined); `proc` the short
    name from ss."""
    if port in _SKIP_PORTS:
        return None
    eff = _effective_proc(proc, cmdline)
    if proc in _SKIP_PROCS or eff in _SKIP_PROCS:
        return None
    hay = (cmdline or "") + " " + (proc or "")
    for rx, hit in _RECOGNIZERS:
        if rx.search(hay):
            return hit
    if port in _PORT_HINTS:
        return _PORT_HINTS[port]
    label = eff or proc or "service"
    return (f"{label} :{port}", "", False)


def _lan_ip():
    """Best-effort primary LAN IP (the default-route source address)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
        finally:
            s.close()
    except OSError:
        return "127.0.0.1"


def _cmdline(pid):
    if not pid:
        return ""
    try:
        with open(f"/proc/{pid}/cmdline", "rb") as f:
            return f.read().replace(b"\x00", b" ").decode("utf-8", "replace").strip()
    except OSError:
        return ""


def discover():
    """Scan listening TCP sockets and return the network-service dashboard model:
    {lan_ip, services: [{name, desc, port, proc, url, health}]}. `health` is
    "up" (it is listening); the client renders a green dot. Deduped by port."""
    lan_ip = _lan_ip()
    try:
        out = subprocess.run(
            ["ss", "-H", "-tlnp"], capture_output=True, text=True, timeout=4
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return {"lan_ip": lan_ip, "services": []}
    services, seen = [], set()
    for row in parse_ss(out):
        port = row["port"]
        if port in seen:
            continue
        info = classify(port, row["proc"], _cmdline(row["pid"]))
        if info is None:
            continue
        seen.add(port)
        name, desc, https = info
        scheme = "https" if https else "http"
        services.append({
            "name": name,
            "desc": desc,
            "port": f":{port}",
            "proc": row["proc"],
            "url": f"{scheme}://{lan_ip}:{port}/",
            "health": "up",
        })
    services.sort(key=lambda s: int(s["port"][1:]))
    return {"lan_ip": lan_ip, "services": services}

"""Unit tests for service_discovery's pure helpers (parse_ss, classify,
_effective_proc). No `ss`/`/proc`/root needed — the scan is mocked by feeding
parse_ss captured output and calling classify directly."""
import os

import service_discovery as sd


# A representative `ss -H -tlnp` capture (mixed IPv4/IPv6, loopback, wildcard).
SS = """\
LISTEN 0 4096 127.0.0.53%lo:53 0.0.0.0:* users:(("systemd-resolve",pid=2030,fd=13))
LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=1,fd=3))
LISTEN 0 100 0.0.0.0:80 0.0.0.0:* users:(("nginx",pid=5714,fd=6))
LISTEN 0 5 *:302 *:* users:(("python3",pid=4047,fd=6))
LISTEN 0 4096 0.0.0.0:8080 0.0.0.0:* users:(("python3",pid=2887,fd=8))
LISTEN 0 511 0.0.0.0:8501 0.0.0.0:* users:(("nginx",pid=5714,fd=9))
LISTEN 0 5 [::]:904 [::]:* users:(("python3",pid=3963,fd=7))
LISTEN 0 4096 127.0.0.1:7680 0.0.0.0:* users:(("python3",pid=999,fd=1))
"""


def test_parse_ss_extracts_nonloopback_listeners():
    rows = sd.parse_ss(SS)
    ports = sorted(r["port"] for r in rows)
    # 53 and 7680 are loopback binds -> dropped; the rest kept (incl. * and [::]).
    assert ports == [22, 80, 302, 904, 8080, 8501]
    by_port = {r["port"]: r for r in rows}
    assert by_port[302]["bind"] == "*" and by_port[302]["proc"] == "python3"
    assert by_port[302]["pid"] == 4047
    assert by_port[904]["bind"] == "[::]"          # IPv6 wildcard parsed
    assert by_port[8080]["proc"] == "python3"


def test_parse_ss_ignores_blank_and_short_lines():
    assert sd.parse_ss("") == []
    assert sd.parse_ss("\n  \nLISTEN 0 1\n") == []


def test_classify_skips_infra_ports_and_procs():
    assert sd.classify(22, "sshd", "/sbin/sshd") is None      # proc denylist
    assert sd.classify(80, "nginx", "nginx: master") is None  # port denylist (vibetop)
    assert sd.classify(5432, "postgres", "postgres") is None  # port denylist


def test_classify_effective_proc_filters_daemon_under_interpreter():
    # vsmagent runs as `python3 …/vsmagent`; ss reports proc "python3", which is
    # NOT in the denylist — the effective-proc logic must catch the script name.
    cmd = "/opt/thinlinc/libexec/python3 /opt/thinlinc/sbin/vsmagent"
    assert sd.classify(904, "python3", cmd) is None
    cmd2 = "/opt/thinlinc/libexec/python3 /opt/thinlinc/sbin/vsmserver"
    assert sd.classify(9000, "python3", cmd2) is None


def test_classify_recognizers():
    name, desc, https = sd.classify(8080, "python3",
                                    "python3 /snap/open-webui/82/bin/open-webui serve")
    assert name == "Open WebUI" and https is False
    name, _, https = sd.classify(302, "python3",
                                 "/opt/thinlinc/libexec/python3 /opt/thinlinc/sbin/tlwebaccess")
    assert name == "ThinLinc Web Access" and https is True
    name, _, _ = sd.classify(8901, "python3", "python3 -m http.server 8901 --bind 0.0.0.0")
    assert name == "HTTP server"


def test_classify_port_hint_when_cmdline_generic():
    # nginx proxying a Streamlit app on 8501 — no recognizer match, port hint wins.
    name, _, _ = sd.classify(8501, "nginx", "nginx: master process")
    assert name == "Streamlit app"


def test_classify_fallback_uses_effective_script_name():
    name, desc, https = sd.classify(7777, "python3", "python3 /home/u/myapp.py --serve")
    assert name == "myapp.py :7777" and desc == "" and https is False


def test_effective_proc_prefers_script_over_interpreter():
    assert sd._effective_proc("python3", "python3 /x/vsmagent") == "vsmagent"
    assert sd._effective_proc("nginx", "nginx: master") == "nginx"     # not generic
    assert sd._effective_proc("python3", "") == "python3"              # no cmdline


def test_parse_ss_skips_nonnumeric_port():
    # A malformed local column whose ":tail" isn't a port must be dropped, not crash.
    rows = sd.parse_ss("LISTEN 0 128 0.0.0.0:notaport 0.0.0.0:*\n"
                       "LISTEN 0 128 0.0.0.0:8080 0.0.0.0:* users:((\"app\",pid=7,fd=3))\n")
    assert [r["port"] for r in rows] == [8080]


# ---------------------------------------------------------------------------
# discover() — the orchestration the pure helpers feed into: run ss, name each
# listener, dedup by port, sort, build the URL. Mocked at the ss/proc/lan-ip
# boundary so it's hermetic. Previously untested end-to-end.
# ---------------------------------------------------------------------------
def _stub_discover(monkeypatch, ss_out, cmdlines=None, lan_ip="192.168.1.10"):
    cmdlines = cmdlines or {}

    class _R:
        def __init__(self, stdout):
            self.stdout = stdout
    monkeypatch.setattr(sd.subprocess, "run", lambda *a, **k: _R(ss_out))
    monkeypatch.setattr(sd, "_cmdline", lambda pid: cmdlines.get(pid, ""))
    monkeypatch.setattr(sd, "_lan_ip", lambda: lan_ip)


def test_discover_names_dedupes_sorts_and_builds_urls(monkeypatch):
    ss_out = (
        'LISTEN 0 4096 127.0.0.1:7680 0.0.0.0:* users:(("python3",pid=999,fd=1))\n'   # loopback → drop
        'LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=1,fd=3))\n'             # infra → drop
        'LISTEN 0 4096 0.0.0.0:8080 0.0.0.0:* users:(("python3",pid=20,fd=8))\n'      # Open WebUI
        'LISTEN 0 5 *:302 *:* users:(("python3",pid=30,fd=6))\n'                      # ThinLinc (https)
        'LISTEN 0 4096 0.0.0.0:8080 0.0.0.0:* users:(("python3",pid=21,fd=9))\n'      # dup port 8080
    )
    cmdlines = {
        20: "python3 /snap/open-webui/82/bin/open-webui serve",
        30: "/opt/thinlinc/libexec/python3 /opt/thinlinc/sbin/tlwebaccess",
        21: "python3 /snap/open-webui/82/bin/open-webui serve",
    }
    _stub_discover(monkeypatch, ss_out, cmdlines)
    r = sd.discover()
    assert r["lan_ip"] == "192.168.1.10"
    # 302 sorts before 8080; the second 8080 is deduped away.
    assert [s["port"] for s in r["services"]] == [":302", ":8080"]
    thinlinc, webui = r["services"]
    assert thinlinc["name"] == "ThinLinc Web Access"
    assert thinlinc["url"] == "https://192.168.1.10:302/"     # https recognizer
    assert webui["name"] == "Open WebUI"
    assert webui["url"] == "http://192.168.1.10:8080/"        # plain http
    assert all(s["health"] == "up" for s in r["services"])


def test_discover_empty_when_ss_fails(monkeypatch):
    def boom(*a, **k):
        raise OSError("ss not found")
    monkeypatch.setattr(sd.subprocess, "run", boom)
    monkeypatch.setattr(sd, "_lan_ip", lambda: "10.0.0.1")
    r = sd.discover()
    assert r == {"lan_ip": "10.0.0.1", "services": []}


def test_cmdline_reads_and_degrades_gracefully():
    assert sd._cmdline(None) == ""                 # no pid
    assert sd._cmdline(2_147_483_646) == ""        # non-existent pid → OSError → ""
    mine = sd._cmdline(os.getpid())                # our own /proc/self/cmdline
    assert "python" in mine.lower() or mine != ""  # the read path returns something


def test_lan_ip_falls_back_to_loopback_on_error(monkeypatch):
    class _BadSock:
        def __init__(self, *a, **k):
            raise OSError("no network")
    monkeypatch.setattr(sd.socket, "socket", _BadSock)
    assert sd._lan_ip() == "127.0.0.1"


def test_lan_ip_returns_default_route_source(monkeypatch):
    class _FakeSock:
        def __init__(self, *a, **k):
            self.connected = None
        def connect(self, addr):
            self.connected = addr
        def getsockname(self):
            return ("192.168.1.10", 54321)
        def close(self):
            pass
    monkeypatch.setattr(sd.socket, "socket", lambda *a, **k: _FakeSock())
    assert sd._lan_ip() == "192.168.1.10"

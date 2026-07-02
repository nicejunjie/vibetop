"""Unit tests for service_discovery's pure helpers (parse_ss, classify,
_effective_proc). No `ss`/`/proc`/root needed — the scan is mocked by feeding
parse_ss captured output and calling classify directly."""
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

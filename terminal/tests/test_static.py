"""Static / integrity checks — cheap guards for whole classes of deploy-time
regressions that unit tests miss:

  * every Python file byte-compiles (syntax);
  * every shell script passes `bash -n` (+ shellcheck errors if installed);
  * every @PLACEHOLDER@ in an nginx/systemd template is stamped by some
    install.sh (the "landing must also stamp @APP_HOME@" bug class);
  * every sw.js PRECACHE entry maps to a real source file (a phantom entry
    404s the offline install);
  * each landing/*.html parses and its relative asset refs resolve.

Pure stdlib, no root/services. Repo-root discovered from this file's path.
"""
import glob
import os
import py_compile
import re
import shutil
import subprocess

import pytest

_REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _walk(patterns, root=_REPO):
    out = []
    for pat in patterns:
        for p in glob.glob(os.path.join(root, pat), recursive=True):
            if "/.claude/" not in p and "/node_modules/" not in p:
                out.append(p)
    return sorted(set(out))


def _python_files():
    files = _walk(["**/*.py"])
    # The two extensionless Python programs (no .py, so glob misses them).
    for extra in ("terminal/vibetop-session", "claude-usage/vibetop-claude-proxy"):
        p = os.path.join(_REPO, extra)
        if os.path.isfile(p):
            files.append(p)
    return files


def _shell_files():
    return _walk(["*.sh", "**/*.sh"])


# ---- Python byte-compiles --------------------------------------------------

def test_all_python_compiles():
    errors = []
    for p in _python_files():
        try:
            py_compile.compile(p, doraise=True)
        except py_compile.PyCompileError as e:
            errors.append(f"{p}: {e}")
    assert not errors, "Python syntax errors:\n" + "\n".join(errors)


# ---- XML config files (D-Bus busconfig etc.) are well-formed ---------------
# Guards the "evince opens slowly again" bug class: a `--` (double-hyphen) inside
# an XML comment makes expat reject the ENTIRE file, so dbus-daemon fails to start
# the private activation-free bus and GNOME apps silently fall back to the slow
# real bus. The monkeypatched x/launch unit test can't see this — only parsing the
# real file does. Any XML-ish .conf (busconfig / <?xml) must parse.

def _xmlish_conf_files():
    out = []
    for p in _walk(["**/*.conf"]):
        try:
            head = open(p, encoding="utf-8", errors="replace").read(200)
        except OSError:
            continue
        if "<!DOCTYPE busconfig" in head or head.lstrip().startswith("<?xml"):
            out.append(p)
    return out


def test_xml_config_files_are_well_formed():
    import xml.dom.minidom
    errors = []
    for p in _xmlish_conf_files():
        try:
            xml.dom.minidom.parse(p)
        except Exception as e:                       # noqa: BLE001 — report any parse failure
            errors.append(f"{p}: {e}")
    assert not errors, (
        "Malformed XML config (a '--' inside an XML comment is the usual cause):\n"
        + "\n".join(errors))


def test_x11_dbus_template_ready_for_listen_injection():
    """The private X11 D-Bus template must be usable by _ensure_user_x11_dbus exactly
    as the manager renders it: a per-user <listen> is injected after <busconfig>, then
    dbus-daemon is started with --config-file=<that> (NOT --address, which dbus 1.16
    ignores when a config-file is given). Guards BOTH shipped bugs at once — the '--'
    XML-comment parse failure AND the missing <listen> — plus the design invariant
    (a session bus with deliberately NO <servicedir>, so portal/a11y fail fast)."""
    import xml.dom.minidom
    p = os.path.join(_REPO, "browser", "dbus", "x11-dbus.conf")
    assert os.path.isfile(p), "browser/dbus/x11-dbus.conf must exist"
    tpl = open(p, encoding="utf-8").read()
    assert "<busconfig>" in tpl, "template needs a <busconfig> anchor for injection"
    base = xml.dom.minidom.parseString(tpl)          # raises if the '--' comment bug returns
    # Check parsed ELEMENTS (not substrings — the comment mentions <servicedir>/<listen>).
    assert not base.getElementsByTagName("servicedir"), (
        "template must NOT declare a <servicedir> element — the whole point is "
        "activation-free so GNOME/GTK portal/a11y lookups fail fast instead of ~25s")
    assert not base.getElementsByTagName("listen"), (
        "template must not hardcode a <listen> element (the socket path is per-user)")
    # Render exactly like _ensure_user_x11_dbus does and require valid, dbus-usable XML.
    rendered = tpl.replace(
        "<busconfig>", "<busconfig>\n  <listen>unix:path=/run/user/1000/vibetop-x11-bus</listen>", 1)
    dom = xml.dom.minidom.parseString(rendered)
    assert dom.getElementsByTagName("listen"), "rendered config must contain <listen>"
    assert dom.getElementsByTagName("type"), "rendered config must set <type>session</type>"


# ---- Shell scripts ---------------------------------------------------------

def test_all_shell_scripts_parse():
    errors = []
    for p in _shell_files():
        r = subprocess.run(["bash", "-n", p], capture_output=True, text=True)
        if r.returncode != 0:
            errors.append(f"{p}: {r.stderr.strip()}")
    assert not errors, "bash -n failures:\n" + "\n".join(errors)


def test_shellcheck_finds_no_errors():
    if not shutil.which("shellcheck"):
        pytest.skip("shellcheck not installed")
    errors = []
    for p in _shell_files():
        # Severity 'error' only — style/info warnings shouldn't fail the suite,
        # but a real error (bad syntax, undefined behaviour) should.
        r = subprocess.run(["shellcheck", "-S", "error", p],
                           capture_output=True, text=True)
        if r.returncode != 0:
            errors.append(f"{p}:\n{r.stdout.strip()}")
    assert not errors, "shellcheck errors:\n" + "\n".join(errors)


# ---- @PLACEHOLDER@ stamping invariant --------------------------------------

_TOKEN_RE = re.compile(r"@[A-Z0-9_]+@")


def _template_files():
    return _walk(["*/nginx/*", "*/systemd/*"])


def _installers():
    return _walk(["*/install.sh", "install.sh"])


def test_every_template_placeholder_is_stamped():
    stamped = set()
    for inst in _installers():
        with open(inst) as f:
            stamped |= set(_TOKEN_RE.findall(f.read()))
    unstamped = {}
    for tmpl in _template_files():
        with open(tmpl) as f:
            toks = set(_TOKEN_RE.findall(f.read()))
        missing = toks - stamped
        if missing:
            unstamped[os.path.relpath(tmpl, _REPO)] = sorted(missing)
    assert not unstamped, ("template placeholders no install.sh stamps "
                           "(would ship literally): %r" % unstamped)


def test_filebrowser_patch_home_stamped_in_both_installers():
    # Documented gotcha: filebrowser-patches.js carries @APP_HOME@ and lives
    # under landing/, but its cache-buster is computed by files/install.sh — so
    # BOTH files/install.sh and landing/install.sh must stamp @APP_HOME@ or one
    # clobbers the other's stamped copy with a literal placeholder.
    patch = os.path.join(_REPO, "landing", "filebrowser-patches.js")
    if "@APP_HOME@" not in open(patch).read():
        pytest.skip("filebrowser-patches.js no longer uses @APP_HOME@")
    for inst in ("files/install.sh", "landing/install.sh"):
        with open(os.path.join(_REPO, inst)) as f:
            assert "@APP_HOME@" in f.read(), f"{inst} must stamp @APP_HOME@"


# ---- Service-worker PRECACHE integrity -------------------------------------

def _sw_precache():
    src = open(os.path.join(_REPO, "landing", "sw.js")).read()
    m = re.search(r"const PRECACHE\s*=\s*\[(.*?)\]", src, re.S)
    assert m, "could not find PRECACHE in sw.js"
    return re.findall(r"'([^']+)'", m.group(1))


def _resolve_precache(entry):
    """Map a deployed web-root path to its landing/ source file."""
    if entry == "/":
        return os.path.join(_REPO, "landing", "desktop.html")   # served as index.html
    if entry == "/landing.html":
        return os.path.join(_REPO, "landing", "index.html")     # Services dashboard
    return os.path.join(_REPO, "landing", entry.lstrip("/"))


def test_sw_version_parses():
    src = open(os.path.join(_REPO, "landing", "sw.js")).read()
    assert re.search(r"const VERSION\s*=\s*'v\d+'", src), "sw.js VERSION malformed"


def test_every_precache_entry_has_a_source_file():
    missing = [e for e in _sw_precache() if not os.path.isfile(_resolve_precache(e))]
    assert not missing, "PRECACHE entries with no source file: %r" % missing


# ---- HTML integrity --------------------------------------------------------

def test_landing_html_parses_and_local_refs_resolve():
    import html.parser

    class P(html.parser.HTMLParser):
        def __init__(self):
            super().__init__()
            self.refs = []
        def handle_starttag(self, tag, attrs):
            d = dict(attrs)
            for key in ("src", "href"):
                v = d.get(key)
                if v:
                    self.refs.append(v)

    broken = []
    for htmlf in _walk(["landing/*.html"]):
        text = open(htmlf).read()
        p = P()
        p.feed(text)                        # raises on malformed markup
        for ref in p.refs:
            # Only relative same-dir asset refs must exist in landing/. Skip
            # schemes, protocol-relative, absolute web-root paths (served from
            # the web root / other apps), anchors and data URIs.
            if (ref.startswith(("http://", "https://", "//", "/", "#", "data:",
                                "mailto:", "blob:"))
                    or ":" in ref.split("/")[0]):
                continue
            ref = ref.split("?")[0].split("#")[0]
            if not ref:
                continue
            if not os.path.isfile(os.path.join(_REPO, "landing", ref)):
                broken.append(f"{os.path.basename(htmlf)} -> {ref}")
    assert not broken, "landing HTML relative refs that don't resolve: %r" % broken


def test_subfilter_injected_scripts_exist():
    # The nginx sub_filter injects these by ?v=<hash>; a missing file means a
    # 404 for injected JS (broken terminal keyboard / xpra / filebrowser UI).
    for rel in ("browser/xpra-patches.js", "landing/filebrowser-patches.js",
                "terminal/terminal-kbd.js", "landing/coach.js",
                "terminal/lib/tab-sync.js"):
        assert os.path.isfile(os.path.join(_REPO, rel)), f"missing {rel}"

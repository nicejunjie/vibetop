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


# ---- Operator identity: the proxy unit must not render as the service account --

def test_claude_proxy_unit_renders_the_operator_not_app_user(tmp_path):
    """The Claude-usage proxy stores its capture in the home of whoever its unit
    says User=, and the manager reads the OPERATOR's home. When install.sh
    resolved the operator from $VIBETOP_ADMINS in the environment only — while
    the value actually lives in /etc/vibetop/manager.env — a prod host rendered
    User=<service account>, the proxy dropped every write with EACCES, and the
    usage strip silently froze for a day (v1.18.4).

    Drive the real installer in --dry-run (writes nothing) against a fake env
    file and assert the identity it would render.
    """
    inst = os.path.join(_REPO, "claude-usage", "install.sh")
    env_file = tmp_path / "manager.env"
    me = subprocess.run(["id", "-un"], capture_output=True, text=True).stdout.strip()
    env_file.write_text("VIBETOP_ADMINS=%s,someone-else\n" % me)

    env = dict(os.environ, APP_USER="root", APP_DIR=_REPO,
               VT_ENV_FILE=str(env_file))
    env.pop("VIBETOP_ADMINS", None)          # the whole point: NOT in the environment
    out = subprocess.run(["bash", inst, "--dry-run"], capture_output=True,
                         text=True, env=env).stdout

    assert "User=%s" % me in out, (
        "proxy unit renders the wrong identity — it must come from "
        "VIBETOP_ADMINS in the manager env file, not fall back to APP_USER:\n" + out)
    assert "User=root" not in out, "fell back to APP_USER (the v1.18.4 bug)"


def test_installer_env_array_carries_the_operator():
    """The shared /opt-layout installer env is the single place every sub-installer
    gets its identity from. VIBETOP_ADMINS missing there is what made the proxy
    installer fall back to APP_USER in the first place."""
    with open(os.path.join(_REPO, "tools", "lib", "layout.sh")) as f:
        src = f.read()
    m = re.search(r"vt_installer_env_array\(\)\s*\{(.*?)\n\}", src, re.S)
    assert m, "vt_installer_env_array not found in tools/lib/layout.sh"
    assert "VIBETOP_ADMINS=" in m.group(1), (
        "vt_installer_env_array must pass VIBETOP_ADMINS — without it every "
        "installer needing the operator silently falls back to APP_USER")


def test_doctor_proxied_prefixes_cover_the_sw_bypass_list():
    """doctor.sh's web-root check skips refs into PROXIED paths (they're served by
    a proxy, not from disk). That list mirrors sw.js's BYPASS — two independent
    copies of one fact, the very drift this check exists to catch. If a new
    proxied prefix is added to sw.js and not to doctor, doctor starts reporting a
    proxied URL as a missing file.

    Not equality: `services.json` IS a real file in the web root (so sw bypasses
    it but doctor must not skip it), and doctor additionally covers `/s/` share
    links, which sw never sees.
    """
    def prefixes(raw):
        out = set()
        for tok in raw.split("|"):
            # The terminal prefix is spelled differently by design: JS `t\d` vs
            # POSIX `t[0-9]`. Fold both to `t` BEFORE unescaping, or stripping
            # the backslash turns `t\d` into the bogus literal `td`.
            if tok in (r"t\d", "t[0-9]"):
                out.add("t")
            else:
                out.add(tok.replace("\\", "").rstrip("/"))
        return out

    sw = open(os.path.join(_REPO, "landing", "sw.js")).read()
    m = re.search(r"const BYPASS = /\^\\/\((.*?)\)/", sw)
    assert m, "could not find BYPASS in sw.js"
    sw_prefixes = prefixes(m.group(1))

    doc = open(os.path.join(_REPO, "tools", "doctor.sh")).read()
    m = re.search(r"PROXIED_RE='\^/\((.*?)\)/'", doc)
    assert m, "could not find PROXIED_RE in tools/doctor.sh"
    doc_prefixes = prefixes(m.group(1))

    served_from_disk = {"services.json"}
    missing = sw_prefixes - doc_prefixes - served_from_disk
    assert not missing, (
        "tools/doctor.sh PROXIED_RE is missing proxied prefixes that sw.js "
        "bypasses %r — doctor will report those URLs as missing files" % sorted(missing))


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


# ---- No desktop-inside-the-desktop ----------------------------------------
# A session expiring behind an OPEN desktop 401s whatever the app iframe asks for
# next; nginx turns that into a 302 to /login.html, so the sign-in form renders
# INSIDE the iframe. login.html then did location.replace('/') and painted a whole
# second desktop inside the first (two taskbars, two usage strips, two live
# heartbeats). Three guards, all greppable — see docs/design-decisions.md.

def test_login_page_never_renders_framed():
    src = open(os.path.join(_REPO, "landing", "login.html")).read()
    assert "window.top === window.self" in src, \
        "login.html lost its frame guard — a framed sign-in nests the desktop"
    # It must hand the sign-in to the TOP window, and WITHOUT ?next= (next points
    # at the framed sub-resource, which must never become the top-level page).
    assert re.search(r"window\.top\.location\.replace\(\s*'/login\.html'\s*\)", src), \
        "login.html must promote sign-in to the top window at bare /login.html"


def test_desktop_refuses_to_be_nested():
    src = open(os.path.join(_REPO, "landing", "desktop.html")).read()
    guard = src.split("Auth guard", 1)[0]      # must run BEFORE the auth probe
    assert "window.top === window.self" in guard and \
        re.search(r"window\.top\.location\.replace\(\s*'/'\s*\)", guard), \
        "desktop.html must promote itself to the top window before probing auth"


def test_login_location_sets_frame_ancestors():
    # `location = /login.html` has its own add_header, so nginx drops every
    # inherited one: the ONE page that takes a Linux password would otherwise be
    # framable by any origin (clickjacked credential capture).
    src = open(os.path.join(_REPO, "terminal", "install.sh")).read()
    block = re.search(r"location = /login\.html \{(.*?)\n    \}", src, re.S)
    assert block, "terminal/install.sh: no `location = /login.html` block"
    assert "frame-ancestors 'self'" in block.group(1), \
        "the login page location must set Content-Security-Policy frame-ancestors"


def test_nginx_conf_string_has_no_backticks():
    """The nginx site config is built as one DOUBLE-QUOTED shell string, so a
    backtick in it is command substitution, not punctuation. A backtick inside a
    comment there ("header inherited from `location /`") made the shell run
    `location /` mid-render: "location: command not found", the config silently
    truncated, and the whole terminal/nginx deploy step failed — while `bash -n`
    stayed happy, because it is valid syntax. That shipped in v1.19.30."""
    src = open(os.path.join(_REPO, "terminal", "install.sh")).read()
    start = src.index('site_config="')
    # The string ends at the first line that is exactly a lone closing quote.
    end = src.index('\n"\n', start)
    body = src[start:end]
    bad = [ln for ln in body.splitlines() if "`" in ln]
    assert not bad, (
        "backtick(s) inside the double-quoted nginx site_config — the shell will "
        "run them as commands. Use plain words or escape them:\n  "
        + "\n  ".join(bad))

"""Uninstall + backup: the two tools an operator trusts to be complete.

Both used to resolve their target from $SUDO_USER. On the system layout that is
the invoking human's home, not /opt/vibetop — so `sudo ./uninstall.sh` reported
"Removed: ... web root" while the served root was never touched, and
`tools/backup.sh` archived one home while claiming to hold the state a disk loss
would take. These tests run the real shell helpers against a fixture tree
containing BOTH a human home and an /opt-style system tree.
"""
import os
import pathlib
import subprocess
import textwrap

import pytest

REPO_ROOT = pathlib.Path(os.path.abspath(__file__)).parents[2]
LAYOUT = REPO_ROOT / "tools" / "lib" / "layout.sh"


def _bash(script, **env):
    """Source layout.sh and run `script`; return (rc, stdout)."""
    full = f'set -uo pipefail\n. "{LAYOUT}"\n{textwrap.dedent(script)}'
    r = subprocess.run(["bash", "-c", full], capture_output=True, text=True,
                       env={"PATH": "/usr/bin:/bin:/usr/sbin:/sbin", **env})
    return r.returncode, r.stdout.strip()


# ---- vt_nginx_root: the served root is whatever nginx says ------------------

def test_nginx_root_is_read_from_the_site_file(tmp_path):
    """The authoritative answer, and the one the old uninstaller never asked
    for. A system-layout site must yield /opt/vibetop/vibetop-www even though
    the invoking human's home is somewhere else entirely."""
    site = tmp_path / "vibetop"
    site.write_text("server {\n    listen 80;\n    root /opt/vibetop/vibetop-www;\n}\n")
    rc, out = _bash(f'vt_nginx_root "{site}"')
    assert rc == 0 and out == "/opt/vibetop/vibetop-www"


def test_nginx_root_finds_the_rhel_site_path(tmp_path):
    """conf.d/ on RHEL, sites-available/ on Debian — checking only one silently
    reports "no install" on half the supported distros."""
    debian, rhel = tmp_path / "sites-available", tmp_path / "conf.d"
    rhel.write_text("server {\n    listen 80 default_server;\n    root /home/alice/vibetop-www;\n}\n")
    rc, out = _bash(f'vt_nginx_root "{debian}" "{rhel}"')
    assert rc == 0 and out == "/home/alice/vibetop-www"


def test_nginx_root_fails_when_there_is_no_site(tmp_path):
    rc, out = _bash(f'vt_nginx_root "{tmp_path}/absent"')
    assert rc != 0 and out == ""


# ---- vt_is_web_root: the only gate in front of rm -rf ----------------------

def _deployed(d):
    d.mkdir(parents=True, exist_ok=True)
    (d / "index.html").write_text("<!doctype html>")
    return d


@pytest.mark.parametrize("name", ["vibetop-www", "www"])
def test_is_web_root_accepts_a_real_deployed_root(tmp_path, name):
    d = _deployed(tmp_path / "opt" / "vibetop" / name)
    assert _bash(f'vt_is_web_root "{d}"')[0] == 0
    assert _bash(f'vt_is_web_root "{d}/"')[0] == 0, "a trailing slash must not matter"


def test_is_web_root_rejects_an_empty_or_missing_target(tmp_path):
    """The failure that made this necessary: an unresolvable web root must
    delete NOTHING. An empty string once meant `rm -rf /vibetop-www`-shaped
    guesswork; it must simply be refused."""
    assert _bash('vt_is_web_root ""')[0] != 0
    assert _bash('vt_is_web_root')[0] != 0
    assert _bash(f'vt_is_web_root "{tmp_path}/never-existed/vibetop-www"')[0] != 0


def test_is_web_root_rejects_system_directories(tmp_path):
    """Nothing shallow, and nothing whose name merely resembles a web root."""
    for bad in ("/", "/opt", "/home", "/usr", "/var/www", "/opt/vibetop"):
        assert _bash(f'vt_is_web_root "{bad}"')[0] != 0, bad


def test_is_web_root_rejects_a_same_named_dir_with_no_deployment(tmp_path):
    """A user's own ~/vibetop-www holding unrelated files is not ours to erase."""
    d = tmp_path / "home" / "alice" / "vibetop-www"
    (d / "photos").mkdir(parents=True)
    assert _bash(f'vt_is_web_root "{d}"')[0] != 0
    _deployed(d)
    assert _bash(f'vt_is_web_root "{d}"')[0] == 0


# ---- the uninstaller wires those in ---------------------------------------

def test_uninstaller_resolves_from_nginx_not_sudo_user():
    """A guard against the exact regression: deriving the target from $SUDO_USER
    (or $APP_HOME) targets the invoking human's home on the system layout."""
    src = (REPO_ROOT / "uninstall.sh").read_text()
    body = "\n".join(l for l in src.splitlines() if not l.lstrip().startswith("#"))
    assert "vt_nginx_root" in body and "vt_is_web_root" in body
    assert "layout.sh" in src
    assert "$APP_HOME/vibetop-www" not in body, \
        "the web root must come from nginx/layout, never from the invoking user's home"
    # every rm -rf of the web root sits behind the guard
    assert 'if vt_is_web_root "$WWW"; then' in body


def test_uninstaller_stops_the_transient_per_user_units(mgr):
    """These are independent `systemd-run --collect` units with no PartOf=, so
    stopping the manager leaves every user's ttyd/shell/FileBrowser/xpra/
    Chromium/X11/D-Bus/file-agent running after the operator believes the
    service is gone.

    The unit names are taken from the MANAGER's own helpers rather than a
    hand-copied list, so renaming a unit there fails here instead of quietly
    dropping it out of the teardown."""
    body = (REPO_ROOT / "uninstall.sh").read_text()
    sess, ttyd = mgr._term_units("alice", 1)
    units = [sess, ttyd,
             mgr._fileagent_unit("alice"),
             mgr._fb_unit("alice"),
             mgr._xpra_unit("alice", "browser"),
             mgr._xpra_unit("alice", "x11"),
             mgr._x11dbus_unit("alice")]
    for u in units:
        prefix = u[:u.rindex("alice")]           # vibetop-uterm-, vibetop-ux11-, ...
        assert prefix in body, f"uninstall.sh leaves {prefix}* units running ({u})"


def test_uninstaller_removes_unit_files_by_glob():
    """vibetop-backup.timer and vibetop-claude-proxy.socket survived every
    uninstall because the removal list was hand-written and they were never
    added to it. Glob the unit files instead of enumerating them."""
    body = (REPO_ROOT / "uninstall.sh").read_text()
    assert "/etc/systemd/system/vibetop-*.socket" in body
    assert "/etc/systemd/system/vibetop-*.timer" in body


# ---- backup: two homes + global state, round-tripped ----------------------
#
# The multi-user paths need `getent passwd <user>` to resolve fixture users, so
# these tests put a tiny shim first on PATH. That exercises the real script —
# user enumeration, staging, manifest, archive layout, restore — against homes
# a test may safely write to.

_GETENT_SHIM = """#!/usr/bin/env bash
# test shim: `getent passwd <user>` for fixture users, else the real one.
if [ "${1:-}" = passwd ] && [ -n "${2:-}" ]; then
    grep "^${2}:" "$VT_TEST_PASSWD" && exit 0
    exit 2
fi
exec /usr/bin/getent "$@"
"""


@pytest.fixture
def two_users(tmp_path):
    """alice + bob, each with vibetop state, plus a root-owned global tree."""
    passwd = tmp_path / "passwd"
    rows, homes = [], {}
    for name in ("alice", "bob"):
        h = tmp_path / "home" / name
        (h / ".local/share/desktop-notes").mkdir(parents=True)
        (h / ".local/share/desktop-notes" / "1.md").write_text(f"{name}'s note")
        (h / ".local/share/desktop-state.json").write_text('{"windows":[]}')
        (h / "Documents").mkdir()
        (h / "Documents" / "report.docx").write_text(f"{name}'s document")
        rows.append(f"{name}:x:1000:1000::{h}:/bin/bash")
        homes[name] = h
    passwd.write_text("\n".join(rows) + "\n")

    var = tmp_path / "var"
    var.mkdir()
    (var / "users.json").write_text('{"alice":{"slot":0},"bob":{"slot":1}}')
    (var / "schedules.json").write_text("[]")

    shim = tmp_path / "bin"
    shim.mkdir()
    (shim / "getent").write_text(_GETENT_SHIM)
    (shim / "getent").chmod(0o755)

    return {"homes": homes, "var": var, "tmp": tmp_path,
            "env": {"PATH": f"{shim}:/usr/bin:/bin:/usr/sbin:/sbin",
                    "VT_TEST_PASSWD": str(passwd),
                    "VIBETOP_STATE_DIR": str(var),
                    "BACKUP_DIR": str(tmp_path / "backups"),
                    "HOME": str(tmp_path), "USER": "alice", "APP_USER": "alice"}}


def _backup(fx, *args):
    r = subprocess.run([str(REPO_ROOT / "tools" / "backup.sh"), *args],
                       capture_output=True, text=True, env=fx["env"])
    return r.returncode, r.stdout + r.stderr


def test_backup_dry_run_covers_every_user_not_just_the_invoker(two_users):
    """The failure this replaces: one home was picked from $SUDO_USER and every
    other user's notes and documents were silently outside the archive, while
    the tool reported success."""
    rc, out = _backup(two_users, "--dry-run", "--user", "alice")
    assert rc == 0 and "users/alice/Documents" in out
    assert "users/bob/" not in out, "--user must scope to one user"


def test_backup_archive_holds_both_users_and_global_state(two_users):
    """Not root here, so drive the enumeration explicitly; what matters is that
    one archive carries per-user trees under users/<name>/ plus a manifest."""
    for u in ("alice", "bob"):
        rc, out = _backup(two_users, "--user", u)
        assert rc == 0, out
    archives = sorted((two_users["tmp"] / "backups").glob("vibetop-*.tar.gz"))
    assert archives, "no archive written"
    names = subprocess.run(["tar", "tzf", str(archives[-1])],
                           capture_output=True, text=True).stdout
    assert "./MANIFEST" in names
    assert "./users/bob/Documents/report.docx" in names


def test_backup_manifest_is_versioned_and_names_its_scope(two_users):
    """A recovery six months later must be able to tell what the archive
    covered. 'mode' and 'users' are the two things an operator needs."""
    rc, out = _backup(two_users, "--user", "alice")
    assert rc == 0, out
    archive = sorted((two_users["tmp"] / "backups").glob("*.tar.gz"))[-1]
    man = subprocess.run(["tar", "xzOf", str(archive), "./MANIFEST"],
                         capture_output=True, text=True).stdout
    assert "manifest_version:" in man
    assert "mode: single-user" in man
    assert "- alice" in man


def test_backup_archive_is_owner_only(two_users):
    """It carries session/JWT secrets, the FileBrowser DB and personal
    documents. 0600 in a 0700 directory, or it is a new exposure."""
    rc, out = _backup(two_users, "--user", "alice")
    assert rc == 0, out
    d = two_users["tmp"] / "backups"
    archive = sorted(d.glob("*.tar.gz"))[-1]
    assert oct(archive.stat().st_mode)[-3:] == "600"
    assert oct(d.stat().st_mode)[-3:] == "700"


def test_backup_unprivileged_run_says_it_is_incomplete(two_users):
    """Silent partial coverage is the whole bug. An unprivileged run is allowed,
    but it must not let the operator believe it covered the host."""
    rc, out = _backup(two_users)
    assert rc == 0, out
    assert "not run as root" in out and "ONLY" in out


def test_backup_covers_the_global_state_the_manager_actually_writes(mgr):
    """Every /var/lib/vibetop file the manager persists must be in the backup's
    global list — the registry's session-revocation epochs and the policy files
    are host-global and were in no archive at all."""
    body = (REPO_ROOT / "tools" / "backup.sh").read_text()
    for path in (mgr.USERS_REGISTRY, mgr.RESOURCE_POLICY_FILE, mgr.IDLE_POLICY_FILE,
                 mgr.HINTS_POLICY_FILE, mgr.SCHEDULES_FILE):
        base = path.rsplit("/", 1)[-1]
        assert base in body, f"backup.sh omits host-global {path}"


def test_backup_covers_the_service_accounts_own_state(mgr):
    """The public share registry and the update history live under ~APP_USER —
    the no-login service account — so a human-home-only backup missed both."""
    body = (REPO_ROOT / "tools" / "backup.sh").read_text()
    for path in (mgr.SHARES_FILE, mgr.UPDATE_HISTORY_FILE):
        assert path.rsplit("/", 1)[-1] in body, f"backup.sh omits {path}"


def test_backup_timer_runs_as_root_not_one_human():
    """Installed as User=$APP_USER it could only ever reach one home and could
    not read the root-owned global state — a timer that quietly backs up a
    fraction of the host every night."""
    body = (REPO_ROOT / "tools" / "backup.sh").read_text()
    unit = body[body.index("[Unit]"):body.index("[Timer]")]
    assert "User=root" in unit
    assert "User=$APP_USER" not in unit


def test_backup_restore_no_longer_points_at_a_removed_unit():
    """It advised restarting vibetop-filebrowser, a shared unit that no longer
    exists — FileBrowser is a transient per-user service now."""
    body = (REPO_ROOT / "tools" / "backup.sh").read_text()
    assert "vibetop-filebrowser" not in body

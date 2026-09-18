"""A file root later TRUSTS must never be owned by a tenant.

`_atomic_write` chowns its result to the request user by default, which is right
for per-user state in that user's own home and wrong for anything the manager
subsequently acts on as root.

The share registry shipped without the override. `/s/<token>` is deliberately
cookieless -- that is what a share link is -- so `_handle_share_serve` reads the
entry's `owner` field to decide whose home to serve from, and `_serve_share_file`
opens that path AS ROOT. Every share endpoint rewrites the registry, `list`
included, so simply opening the Share UI once transferred ownership of that
root-trusted file to the tenant who did it. A 0600 file its owner can rewrite in
place, naming any `owner` it likes, reachable over an unauthenticated URL.

`_write_schedules` had the identical trust shape and already did it correctly,
with a docstring saying why -- so this is asserted for EVERY such registry rather
than for the one that happened to be wrong.
"""
import inspect


def _atomic_writes(src):
    """Every `_atomic_write(...)` call in the source, as full (multi-line) text.

    Enumerated by balanced parens rather than a regex: several of these calls
    span three lines with nested json.dumps(...), and a line-based match silently
    reads the wrong call's arguments.
    """
    out, k = [], 0
    while True:
        start = src.find("_atomic_write(", k)
        if start < 0:
            return out
        depth, j = 0, start + len("_atomic_write")
        while j < len(src):
            if src[j] == "(":
                depth += 1
            elif src[j] == ")":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        out.append(src[start:j + 1])
        k = j + 1


def _call_mentioning(src, needle):
    hits = [c for c in _atomic_writes(src) if needle in c]
    assert hits, f"no _atomic_write call mentions {needle!r}"
    return hits


def test_the_share_registry_is_written_root_owned(mgr):
    """The one that was actually broken."""
    src = inspect.getsource(mgr._write_shares)
    assert 'owner="root"' in src, (
        "the share registry tells the COOKIELESS /s/ handler whose home to serve "
        "from, and is then opened as root — it must not be chown'd to whichever "
        "tenant last touched the Share UI")
    assert "chmod" in src and "0o600" in src


def test_every_root_trusted_registry_pins_its_owner(mgr):
    """The whole class, not just the instance that was found.

    Each of these is host-global state the manager reads back and ACTS ON as
    root: port slots and session-revocation epochs, the resource caps applied to
    every transient unit, the idle-reap policy, the scheduled-message registry
    whose `user` key picks whose PTY to write to. None may be tenant-owned.
    """
    src = inspect.getsource(mgr)
    for name in ("USERS_REGISTRY", "RESOURCE_POLICY_FILE", "IDLE_POLICY_FILE",
                 "HINTS_POLICY_FILE", "SCHEDULES_FILE"):
        for call in _call_mentioning(src, name):
            assert 'owner="root"' in call, (
                f"{name} is written without owner=\"root\": {call[:120]}… — "
                "it is only safe today because /var/lib/vibetop is 0700 root, "
                "which is one permission change away from the share bug")


def test_the_operators_claude_settings_stay_the_operators(mgr):
    """A `~` path meaning "the human operator's home" must resolve to OPERATOR,
    never to the request user — the documented trap. Chowning it to a second
    admin would break the operator's own `claude` CLI outside vibetop."""
    call = _call_mentioning(inspect.getsource(mgr), "CLAUDE_SETTINGS_FILE")[0]
    assert "owner=OPERATOR" in call, call[:160]


def test_per_user_state_still_defaults_to_the_request_user(mgr):
    """The counterweight: pinning owners everywhere would be its own bug. Notes,
    tab order and desktop state live in the REQUESTING user's home under
    _ctx_home(), and must keep the default chown or they land root-owned in a
    user's home and their own tools cannot touch them."""
    src = inspect.getsource(mgr)
    for needle in ("_notes_index_file()", "_tab_order_file(user)",
                   "_desktop_state_file()"):
        for call in _call_mentioning(src, needle):
            assert "owner=" not in call, (
                f"per-user state must keep the default chown: {call[:120]}")

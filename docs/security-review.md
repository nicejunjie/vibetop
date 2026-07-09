# Security review — terminal-manager.py

A focused audit of the manager's authentication/authorization-critical paths.
**No vulnerabilities were found**; this documents the trust model and the guards
so the next person doesn't re-derive it (or weaken it by accident). Last
reviewed 2026-06-26.

## The trust boundary (read this first)

**The entire authorization boundary is the perimeter — Cloudflare Access (over
the tunnel) and network trust (on the LAN). Past it, an authenticated user has
full code execution as `APP_USER`, by design.** That's not a bug to fix; it's
what the product *is*: the Terminal runs arbitrary shell as `APP_USER`, and the
X11 Launcher (`POST /api/x/launch`) runs any command on the X11 display. There
is no privilege escalation to defend against between "can reach the app" and "can
run code as the user" — those are the same capability.

Consequences worth keeping in mind:

- **nginx listens on `:80` `default_server` on all interfaces.** On the LAN there
  is no Cloudflare in front, so **any device on the LAN can reach the full
  manager API → full `APP_USER` RCE.** The LAN is therefore a trusted network in
  this design. Do **not** expose `:80` (or the host) to an untrusted network
  without Access/another authenticating proxy in front.
- **Keep Cloudflare Access enabled** on the tunnel hostname. It is the only thing
  authenticating remote users. The Access *Bypass* rules for icons/manifest
  (`tunnel/README.md`) are intentionally limited to static, non-sensitive assets.
- The manager binds `127.0.0.1` only; it's reachable solely through nginx. Good —
  keep it loopback.

Given that boundary, the input validators below are **defense-in-depth against
injection/traversal bugs**, *not* an authorization layer. They stop a malformed
or hostile *input* from doing something worse than the user could already do
intentionally (e.g. inject a second shell command, escape the home dir, or forge
a request the container makes unauthenticated).

## Audited surfaces & verdicts

| Surface | Guard | Verdict |
|---|---|---|
| `chromium <url>` via `su -c` (`/api/browser/open`) | `_valid_browser_url` — must be `http(s)://`, rejects shell metachars `(' " \` $ ; ) \n` | ✅ injection-safe; unit-tested |
| GUI launch (`/api/x/launch`) | `_valid_launch_cmd` — rejects only empty / >1024 / `\n\r\0` | ✅ correct for the model (arbitrary cmd is intended; NUL/newline can't split the `su -c` string into extra commands) |
| `wmctrl -i -a/-c <id>` | `_valid_x_window_id` — `^0x[0-9a-fA-F]{1,16}$`, passed as argv (not shell) | ✅ belt-and-suspenders |
| Office file access (`/api/office/*`) | `_resolve_under_home` — `realpath` then prefix-check vs `realpath(HOME)`; **symlink escapes resolved**; regular-file only | ✅ traversal-safe; tested incl. `../` and symlink-style escapes |
| Office View/Edit/download file type | `OFFICE_RE` (extension allowlist) | ✅ |
| Office doc bytes + save callback (container → manager, **unauthenticated** path) | per-path HMAC-SHA256 `t=` (`_onlyoffice_sig`, `hmac.compare_digest`) **and** HS256 JWT on the callback | ✅ secret-gated; constant-time compare; SSRF in the save-back URL is gated behind the HMAC+JWT |
| OnlyOffice editor config JWT | `_jwt_sign`/`_jwt_verify` — **always recomputes HS256, ignores the header `alg`** | ✅ no alg-confusion / `alg:none`; tampering + wrong-secret + malformed all tested |
| Note ids | `_safe_note_id` — `[A-Za-z0-9_-]{1,64}` | ✅ can only name a file inside `NOTES_DIR` |
| Upload filenames | `_safe_upload_name` — strips dirs (`\` and `/`), control chars, `.`/`..` | ✅ writes stay in `UPLOAD_DIR`; `_open_unique` (O_EXCL) closes the check-then-open TOCTOU |
| OnlyOffice JWT secret at rest | `~/.config/vibetop/onlyoffice.secret`, `chmod 0600`, owned by `APP_USER` | ✅ |
| Self-update `{force:true}` | `git stash --include-untracked` (recoverable), not `reset --hard` | ✅ no unrecoverable data loss; runs as `APP_USER` |

All of the above are covered by `terminal/tests/test_manager.py` (the scariest
regressions — a traversal escape, an injection bypass, a JWT/HMAC forgery — fail
the suite).

## Observations (not vulnerabilities)

- `/api/metrics` and `/api/ping` (added alongside this review) expose only
  counters/`{"ok":true}` — no paths, secrets, or PII — and sit behind the same
  perimeter as `/api/system/status`.
- `_handle_office_download` has no HMAC by design (it's the user-facing Download
  button, behind Access) and is gated under `HOME` + `OFFICE_RE`. Fine.

## Recommendations

1. **Never expose the host's `:80` to an untrusted network** without an
   authenticating proxy — it is full RCE-as-user by design (see the boundary).
2. **Keep Cloudflare Access on** the tunnel hostname; it is the remote auth.
3. Treat the LAN as trusted (it already is, structurally). If that ever stops
   being true, put auth in front of `:80`.
4. Keep `onlyoffice.secret` at `0600`; rotating it just requires restarting the
   manager and the OnlyOffice container.

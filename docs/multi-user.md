# Multi-user — options (Option B implemented on the `multi-user` branch)

> **Status update:** **Option B is implemented** on the `multi-user` branch — vibetop
> as a web remote-desktop for the host's *real Linux users* (PAM login; each user runs
> as themselves in their real `$HOME`; Unix-permission = SSH-equivalent isolation).
> Done + validated live: Linux-account login (PAM) + nginx `auth_request` gate + LAN
> TLS (Phase 1); per-user state + office (Phase 2); **per-user terminals** (a shell as
> the user, Phase 3), **per-user Files** (FileBrowser as the user, rooted at their home,
> Phase 3b), and **per-user Browser + X11** (each user's own xpra display + snap
> Chromium, Phase 3c); brute-force lockout, per-unit resource caps, per-user telemetry
> scoping, and two-scope logout (this device / all devices) (Phase 4). The only
> subsystems still operator-only (they act on the whole host) are **Claude-usage** and
> **Update** — deliberately admin-gated. See the multi-user entries in
> `docs/design-decisions.md` for the how/why and the hard-won fixes (the 203/EXEC
> helper-script relocation; the "widen authN, lock down authZ in the same pass" rule).
> The options table below is the original decision framing, kept for context.

The rest of this doc is the original design framing. Vibetop was **single-user to
the bone** —
everything runs as one `APP_USER`, and the security model is "anyone past
Cloudflare Access is trusted and gets a shell as that user" (a Terminal ≡ SSH as
`APP_USER`). "Multi-user" is therefore not one feature; the right design depends
entirely on **how much you trust the users**, which sets the required isolation
level.

## What's already in our favor

- **Identity is nearly free over the tunnel.** Cloudflare Access authenticates
  each person and passes a signed JWT (`Cf-Access-Jwt-Assertion`) carrying their
  email. The manager can validate it against Cloudflare's public keys and know
  *who* is connected — no login system to build.
  - Caveat: it must **validate the JWT**, not trust a raw header, or a LAN client
    could spoof identity.
  - **On the LAN there is no Access in front → no identity.** LAN multi-user needs
    its own auth/login layer.
- **The manager runs as root and already provisions on demand** (terminals; the
  second xpra `:98` app-display). A root orchestrator handing out per-user
  resources fits the existing grain.

## The options (isolation axis)

| Option | Isolation | Who it's for | Effort |
|---|---|---|---|
| **A. Soft namespacing** — one OS user; app keys state (notes, layout, terminal sets, uploads) by identity | **None** (shared FS + processes; every Terminal is still a shell as `APP_USER`) | A few **trusted** people who just want their own notes/workspace, not security | Moderate, no new services |
| **B. Real OS users** — map each identity → a Linux user; run their terminals / Browser xpra / FileBrowser **as that user** | **Real** (Unix perms) | Multiple real people; semi-trusted; a lean product | **Large** — per-user services, port/routing scheme, LAN auth |
| **C. Container/VM per user** — each tenant gets their own stack | **Strong** | True multi-tenant **SaaS**, untrusted users | Largest — orchestration, images, quotas, cost |
| **D. N independent instances + edge routing** — run several single-user vibetops (separate OS users/ports), route by identity | Real (each is a whole separate stack) | A **handful of known** users, without rewriting vibetop | Moderate ops, low code |

## What "real isolation" (B/C) actually requires, per resource

Each per-user resource must be re-provisioned per identity:

- **Terminals** — `vibetop-session@N` / `vibetop-ttyd@N` run **as the mapped
  user**, on a per-user number/port block; nginx must route `/tN/` by *who* you
  are (today the `map` keys only on `N`).
- **Browser** — today one shared xpra `:99` as `APP_USER`; multi-user needs a
  display **per user** (the `:98` app-display proves the pattern, but it's a
  service per user).
- **Files** — the easy win: **FileBrowser has native multi-user** (accounts +
  per-user scope rooted at their home), so drop `--auth.method=noauth`.
- **Office** — OnlyOffice callbacks would write files **as the owning user**
  instead of `APP_USER` (paths are already JWT/HMAC-scoped).
- **State** — per-user desktop/notes land naturally in each user's own
  `~/.local/share` once they run as separate OS users.

## Filesystem layout (where things install)

Today's layout is **single-user-shaped and wrong for multi-user**: the shared,
**root-run** code lives inside one user's home (`~/vibetop` checkout, served from
`~/vibetop-www`, secret in `~/.config/vibetop`). That's fine while that user *is*
the trusted operator, but the moment other people get real shells (B/C/D) it's a
**privilege-escalation hole** — a tenant could edit `terminal-manager.py` (runs as
**root**) or `desktop.html`/`apph.js` (served to *everyone*) and own the box or all
tenants. So the governing rule is: **shared/root-owned things move out of every
home into one system tree; only per-user state stays in homes.**

### Two places, conceptually

**1. One shared tree — `/opt/vibetop/`, root-owned, not tenant-writable:**

```
/opt/vibetop/
├── app/     # the git checkout — code, install scripts, unit + nginx templates
│            #   (manager runs from here as root; in-app Update git-pulls here)
├── www/     # static shell + JS  (nginx root)          [today: ~/vibetop-www]
├── etc/     # config + secrets   (onlyoffice.secret, x11-dbus.conf)
│            #                                           [today: ~/.config/vibetop, /etc/vibetop]
└── var/     # shared mutable data (FileBrowser accounts DB) + logs
             #                                           [today: /var/log/vibetop, ~/.config/filebrowser]
```

One path to back up, to `chown root`, and to reason about. This also tidies the
*single-user* install, which is currently spread across `~/vibetop`,
`~/vibetop-www`, `~/.config/vibetop`, `/etc/vibetop`, and `/var/log/vibetop`.

**2. Each user's `$HOME`** — their private state (`~/.local/share/desktop-*`,
notes, files-tabs, `~/Documents`, `~/Uploads`), owned by them. This is **not**
scatter to eliminate — it **is** the isolation: "personal stuff in `$HOME`, owned
by that user" is the whole security boundary in B/C, enforced by Unix perms.
Per-user services (terminals, Browser xpra display) run **as that user** and write
only there.

### The only bits that must live outside the tree — and they're just pointers

Systemd and nginx dictate where their configs go (true for *every* service). Keep
the real files in the tree and let the OS dirs reference them, so `/etc` holds no
vibetop *content* — only links back into `/opt/vibetop`:

- `/etc/systemd/system/vibetop-*.service` → **symlinks** into
  `/opt/vibetop/app/systemd/` (systemd follows symlinked units).
- `/etc/nginx/…` → a one-line `include /opt/vibetop/app/nginx/*.conf;`.

Everything else (ttyd, xpra, chromium snap, the FileBrowser binary,
Docker/OnlyOffice) is apt/snap-managed system packages — not vibetop's to place.

### How much relocation each option needs

- **A (soft namespacing, one trusted OS user):** the `/opt` move is *optional* —
  there's still one trusted user who owns the code; you mainly key state by identity.
- **B / D (real per-user isolation):** the `/opt/vibetop` + symlink/include
  relocation is **mandatory** — it's the boundary that stops tenant X from tampering
  with root-run code or tenant Y's data.
- **C (container/VM per user):** "shared" and "per-user" collapse — each tenant gets
  the whole `/opt/vibetop` + home inside their own image, so the split matters per
  image rather than per path.

## The two questions that fork the whole design

1. **Trust model** — trusted few (→ A) · real isolation, semi-trusted (→ B) ·
   untrusted / product (→ C) · a handful of known users, avoid a rewrite (→ D).
2. **Access path** — tunnel only (identity free from Access JWT) · **LAN too**
   (requires adding a real auth/login layer to the manager) · both.

Answer these first when we revisit; everything downstream (routing, provisioning,
auth) follows from them.

---

# Identity model as implemented

Vibetop runs each of the host's **real Linux users** as themselves (Option B, implemented — `docs/multi-user.md`). Three distinct identities in `terminal/terminal-manager.py`, do not conflate them:

- **`APP_USER`** — the service/code owner that runs deploys and owns the checkout (`vibetop` on prod). Only appears as the request user on a cookieless loopback call (trusted local tooling).
- **`OPERATOR` / `ADMIN_USERS`** — the *human* admin(s), named in **`VIBETOP_ADMINS`** (comma-separated, loaded from `/etc/vibetop/manager.env`; defaults to `[APP_USER]` so a home-owned single-user install behaves as before). `OPERATOR = ADMIN_USERS[0]`. `_is_admin()` gates the operator-only surfaces (**Claude-usage**, **Update**) — everything else is per-user.
- **The per-request authenticated user** — `_ctx_user()` (from a per-request thread-local set by the session cookie). **All per-user state and file ops resolve under `_ctx_home()`** = that user's real `$HOME`, so notes/desktop/files-tabs/uploads/office land in each user's own `~/.local/share` etc. by construction.

> **Operator-vs-service-account trap:** any `~`-path that semantically means *"the human operator's home"* (Claude usage/settings, `~/.claude`) must use **`OPERATOR`**, not `APP_USER` — after `APP_USER=vibetop` those pointed at the empty `/opt/vibetop`. The proxy unit's `User=` must also be `@OPERATOR@`. See `docs/design-decisions.md`.
>
> **`VIBETOP_ADMINS` has ONE authority: `/etc/vibetop/manager.env`.** Every installer receives it through `vt_installer_env_array` (`tools/lib/layout.sh`), which reads it from that file — **do not add another resolver**. An installer that resolves the operator on its own falls back to `APP_USER` when the variable isn't in its environment, which is silent (it renders a valid unit that writes to the wrong home) and re-applies on every deploy: that is exactly how the Claude-usage proxy came to run as `vibetop` and freeze the usage strip for a day (v1.18.4/.5). Guards: `tools/doctor.sh` §*Operator identity* compares the deployed `User=` against `VIBETOP_ADMINS` and scans the proxy journal since the unit last started; `claude-usage/install.sh` probes that the operator can write their `~/.local/share` right after rendering; `test_static.py::test_claude_proxy_unit_renders_the_operator_not_app_user` + `::test_installer_env_array_carries_the_operator` pin both ends.

**Auth (LAN + tunnel, one gate).** nginx `auth_request` on every protected location delegates to the manager's **`GET /api/authcheck`** (`location = /internal/authcheck` → `/api/authcheck`, passing `X-Original-URI`): 200 (with `X-Vibetop-User`) for a valid session, 401 otherwise. A **public-path allowlist** (`_is_public_path` — login/logout/authcheck, static shell assets, `/s/` shares) is kept in the manager (not nginx) so it's testable. Login: **`POST /api/login {username,password}`** → **PAM** (`_pam_authenticate` via `ctypes`/`libpam`, stdlib-only; PAM service `vibetop` = `/etc/pam.d/vibetop`) → a signed **`vt_session`** cookie (HMAC over user+expiry+token-epoch, 7-day, `HttpOnly`/`SameSite=Lax`/`Secure` on https). Brute-force **lockout** after repeated failures + per-attempt sleep. **`/api/logout`** clears this device's cookie; **`/api/logout-all`** bumps the user's **token epoch** so every issued session for them is rejected (stateless-cookie revocation). Session secret at `/etc/vibetop/session.secret`.

**Per-user runtime — services run AS the logged-in user via `systemd-run` transient units** (`--collect --uid=<user> --gid=<gid>`, per-user resource caps, `WorkingDirectory=<home>`), on per-user port blocks (`_user_slot`/`_user_term_port`):
- **Terminals** — `/tN/` authcheck resolves the user's per-user ttyd port, cold-starts the terminal as them if needed (`_ensure_user_terminal`), and returns it in **`X-Term-Port`**; nginx `auth_request_set $tport $upstream_http_x_term_port` routes there. So **terminal N is shared across *that user's own* devices, not across users**.
- **Files** — one FileBrowser per user (`_ensure_user_filebrowser`, `--auth.method=noauth`, run as them, rooted at `/`), started on demand; port returned to nginx like terminals.
- **Browser / X11** — each user gets their **own** xpra display + snap Chromium (`_ensure_user_xpra(user, kind)`), not the one shared `:99`/`:98`. `_provision_user` runs `loginctl enable-linger` so `/run/user/<uid>` exists for snap+xpra.
- **Stale-port self-heal (xpra + FileBrowser).** Each per-user service's TCP port is **baked into its transient unit's `ExecStart` at creation**, so a port-scheme change (or a wedged service) leaves an `active` unit on the OLD port while nginx routes to the NEW one → `/browser/`, `/x11-display/`, `/files/` **502**. `systemctl restart` does NOT fix it (re-runs the baked args). So `_start_user_xpra`/`_start_user_filebrowser` reuse an `active` unit **only if `_wait_tcp(expected_port)` succeeds**; otherwise they stop + reset-failed + recreate it on the correct port. (`docs/design-decisions.md`; guarded by `test_stale_{xpra,filebrowser}_on_wrong_port_*` + the e2e `surface-health.spec.js`.)
- **The 203/EXEC trap:** per-user helper scripts must live *outside* the operator's `$HOME` (a home is `0750`, so the target user's `systemd-run` process can't exec a script under it → status 203/EXEC) — the minimum reason the `/opt/vibetop` move is mandatory for real per-user isolation.

With `VIBETOP_ADMINS` unset (a home-owned single-operator install) all three identities collapse onto one user — the degenerate case the defaults preserve.


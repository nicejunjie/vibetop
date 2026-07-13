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

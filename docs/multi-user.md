# Multi-user — options (roadmap, NOT yet implemented)

Status: **design notes to revisit.** Vibetop today is **single-user to the bone** —
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

## The two questions that fork the whole design

1. **Trust model** — trusted few (→ A) · real isolation, semi-trusted (→ B) ·
   untrusted / product (→ C) · a handful of known users, avoid a rewrite (→ D).
2. **Access path** — tunnel only (identity free from Access JWT) · **LAN too**
   (requires adding a real auth/login layer to the manager) · both.

Answer these first when we revisit; everything downstream (routing, provisioning,
auth) follows from them.

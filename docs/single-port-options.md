# Single-port access — options

Goal: forward only one port on the router (or none) and still reach all
LAN services (terminals, browser-in-browser, and any other apps on the host).

## Option A: nginx reverse-proxy everything (single port 80/443)

Extend the existing nginx site so every service sits under one URL:

```
/                 → landing page (existing)
/t1/ .. /t50/     → ttyd terminals (dynamic, on-demand)
/browser/         → xpra Chromium (existing)
/app-a/           → 127.0.0.1:8501  (an HTTP+WS app)
/app-b/           → 127.0.0.1:8080  (with WS)
/app-c/           → ???  (see caveat below)
```

Router forwards port 80 (or 443 with TLS) only.

**Tradeoffs**

- **Plain HTTP+WS apps**: easy — most behave well behind a reverse proxy.
  Some need a base-path setting so assets resolve under the sub-path (e.g.
  Streamlit's `--server.baseUrlPath`, or an app-specific `BASE_URL` env).
  Usually ~10 lines of nginx each.
- **Apps with their own VNC/WebSocket backend or hardcoded URLs**: not easy.
  A web client that opens a WebSocket to a separate TLS backend (e.g. a
  remote-desktop gateway) needs the proxy to handle both the HTTP root and
  the WS upgrade, and the JS may have hardcoded URLs or origin checks. Often
  easier to leave such an app on its own port (or use its native client).
- If exposing externally, **add TLS** (Let's Encrypt + nginx) — running
  auth-less terminals/browser on plain HTTP over the internet is asking
  for it.

## Option B: Tailscale (or WireGuard) — no port forwarding at all

Install Tailscale on myhost and on each client device. Each device gets a
stable `100.x.y.z` IP on a private overlay network. From any client,
hit `http://myhost:80/`, `http://myhost:8080/`, etc. — they all work because
you're "on the LAN" virtually.

**Tradeoffs**

- **No router config** — Tailscale punches through NAT, no inbound port
  needed.
- **Encrypted by default** (WireGuard under the hood).
- Every device that wants access needs the Tailscale client (free up to
  100 devices).
- Doesn't help if you need to share with someone who can't install
  Tailscale.

## Option C: Cloudflare Tunnel

Run `cloudflared` on myhost — it makes an outbound connection to
Cloudflare and exposes services at `https://something.yourdomain.com/`.
No port forwarding, free TLS, optional Cloudflare Access for auth.

**Tradeoffs**

- Best path if you want **public** URLs without exposing your home IP.
- Requires a domain on Cloudflare (free tier works).
- Cloudflare sits in the middle (TLS terminates there).
- Can do path-based or hostname-based routing.

## Recommendation

| Want | Pick |
|---|---|
| Stop forwarding multiple ports, devices stay yours | **B (Tailscale)** |
| Public URLs, share with anyone without a client | **C (Cloudflare Tunnel)** |
| Everything under one URL/port on existing forward | **A (nginx reverse proxy)** |

A and B/C are not mutually exclusive — you can run nginx reverse-proxy
*and* expose it via Tailscale or Cloudflare Tunnel. The real choice is
between **forward a port + TLS yourself (A)**, **overlay network (B)**,
or **outbound tunnel + Cloudflare in the middle (C)**.

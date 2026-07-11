# vibetop-tunnel

Cloudflare Tunnel exposing myhost's nginx at `https://service.example.com/`,
behind Cloudflare Access (one-time email PIN + Google login).

No port forwarding. No public IP exposed. TLS terminated by Cloudflare.

## Prerequisites

- Domain `example.com` already on Cloudflare (free tier OK).
- A Cloudflare account with `example.com` in it.
- `cloudflared` installed on myhost (this project's `install.sh` did that).

## One-time setup (interactive — has to happen in your browser)

These steps need a browser logged into your Cloudflare account.

### 1. Authenticate cloudflared

```bash
cloudflared tunnel login
```

Opens a Cloudflare URL (or prints it if no DE). Pick `example.com`,
authorize. Drops a cert at `~/.cloudflared/cert.pem`.

### 2. Create the tunnel

```bash
cloudflared tunnel create myhost
```

Prints a UUID and writes `~/.cloudflared/<UUID>.json`. Keep that
UUID — you'll paste it into config.yml below.

### 3. Move credentials and config to /etc/cloudflared

```bash
sudo install -d -m 0755 /etc/cloudflared
sudo install -m 0600 ~/.cloudflared/<UUID>.json /etc/cloudflared/

# render config.yml from the template (replace UUID)
UUID=<paste UUID here>
sudo sed "s|@TUNNEL_UUID@|$UUID|g" \
    ~/vibe-coding/service-in-browser/tunnel/config.yml.template \
    > /tmp/cloudflared-config.yml
sudo install -m 0644 /tmp/cloudflared-config.yml /etc/cloudflared/config.yml
rm /tmp/cloudflared-config.yml
```

### 4. Route DNS to the tunnel

```bash
cloudflared tunnel route dns myhost service.example.com
```

This creates a CNAME `service.example.com -> <UUID>.cfargotunnel.com`
in Cloudflare's DNS. Verify in the Cloudflare dashboard → DNS for
example.com.

### 5. Install + start as a system service

```bash
sudo cloudflared service install
sudo systemctl status cloudflared
```

`cloudflared service install` reads `/etc/cloudflared/config.yml` and
sets up a systemd unit running cloudflared as root. It auto-starts.

Verify the tunnel is up:

```bash
cloudflared tunnel list
sudo systemctl status cloudflared
```

The tunnel "myhost" should show `1 active connection(s)` (or 4 — Cloudflare
opens multiple for HA).

### 6. Set up Cloudflare Access (auth)

Now wrap the tunnel with auth.

1. Go to [one.dash.cloudflare.com](https://one.dash.cloudflare.com) →
   pick your account → **Access → Applications**.
2. **Add an application** → **Self-hosted**.
3. **Name**: `myhost`
4. **Application domain**: `service.example.com` (full hostname
   match, no path).
5. **Identity providers**: enable both:
   - **One-time PIN** (built-in, no setup needed; users type any email,
     get a 6-digit code).
   - **Google**: requires a one-time setup under
     **Settings → Authentication → Login methods → Add new** → Google.
     Cloudflare gives you instructions to create OAuth credentials in
     Google Cloud Console — ~5 minutes.
6. **Create an Access policy**:
   - Action: **Allow**
   - Rule: **Emails** → list the email addresses allowed (or
     **Emails ending in** for a domain).
7. Save.

Visit `https://service.example.com/` — you'll get Cloudflare's
login screen first. After auth, the request flows through the tunnel
to myhost's nginx, and you see the landing page.

### 7. (Optional) Let the icons/manifest bypass Access

Access guards **every** path by default, including the favicon and PWA icons.
Browsers fetch those (for a tab/bookmark/favorite icon) in a context **without**
your Access cookie, so they get the login page instead of the image — the site
shows **no icon in Safari favorites** etc. The assets aren't sensitive, so add a
second Access application that **bypasses** auth for just them:

- **Access → Applications → Add → Self-hosted**, name it e.g. `public assets`.
- Scope it to these paths on your hostname (Access matches the most specific path
  first, so they win over the main app; everything else stays protected):
  `/favicon.ico`, `/apple-touch-icon.png`, `/manifest.json`, `/icons/*`
- Add one policy with Action **Bypass**, rule **Everyone**.

(Equivalently via the API: `POST /accounts/<id>/access/apps` with
`type:"self_hosted"`, those paths as `destinations` (`{type:"public",uri:...}`),
and a `{decision:"bypass",include:[{everyone:{}}]}` policy.)

### 8. (Required for public file-share links) Bypass Access for `/s/*`

The Files app's **Share** action mints a passwordless, read-only link
(`https://<host>/s/<token>`). Over the tunnel Access guards every path, so without
a bypass the recipient — who has no Access account — just hits the login page. Add a
self-hosted Access app exactly like §7, scoped to the share path:

- **Access → Applications → Add → Self-hosted**, name it e.g. `file shares`.
- Scope it to `/s/*` on your hostname (more specific than the main app, so it wins;
  everything else stays protected).
- Add one policy with Action **Bypass**, rule **Everyone**.

Security note: this makes **only** `/s/<token>` public — the random 128-bit token is
the gate, and the manager fences shares to files/folders under your home (never
dotfiles), serves them read-only, and lets you expire/revoke them from the Share
dialog's **Manage links**. On the LAN there's no Cloudflare in front, so share links
work with no extra setup. (Skip this if you only use vibetop on the LAN.)

## After setup

The cloudflared systemd unit keeps the tunnel up. If myhost reboots, the
tunnel reconnects automatically.

To make config changes, edit `/etc/cloudflared/config.yml` and
`sudo systemctl restart cloudflared`.

Logs: `sudo journalctl -u cloudflared -f`.

## Public URLs (after setup)

- `https://service.example.com/` — landing page
- `https://service.example.com/t1/` .. `/t4/` — terminals
- `https://service.example.com/browser/` — browser-in-browser

`example.com` and `www.example.com` are untouched and free for
other things.

## Troubleshooting

**Tunnel won't start**: `journalctl -u cloudflared -n 50`. Common
issues are wrong UUID in config.yml or wrong path to the
credentials JSON.

**DNS doesn't resolve**: check Cloudflare dashboard → DNS → there
should be a CNAME `service` → `<UUID>.cfargotunnel.com` (proxied).

**Access prompts but won't let me in**: check the application's policy
in the Zero Trust dashboard — make sure your email matches the rule.

**WebSocket disconnects**: cloudflared handles WS by default. If you
see frequent drops on terminals or the browser, bump
`originRequest.keepAliveTimeout` higher in config.yml.

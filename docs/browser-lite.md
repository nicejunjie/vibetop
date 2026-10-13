# Browser Lite (experimental)

Browser Lite runs a separate Chromium on the server and sends a structured
DOM, styles and subsequent changes to the client. Text selection, typing and
scrolling use native browser controls. The website's JavaScript runs remotely;
it does not execute in the Vibetop desktop. This is separate from the existing
xpra Browser and uses a separate website profile, so first use requires signing
into websites again.

Open **Browser Lite** from Start, or `/browser-lite.html`. Enter an HTTP/HTTPS
address or search. Images are off initially; **Show images** loads nearby images.
Images over 256 KiB require **Load image**, with an 8 MiB hard resource limit.
The footer counts decoded page data, not compressed on-the-wire traffic.

## Supported experiment

Ordinary text pages, links/buttons, remote dynamic DOM, plain forms, text/password
inputs, checkbox/radio and select, back/forward/reload and local scrolling.
Client reload attaches to the existing remote page. After a cold device restart,
the last device page can be resumed; an active page requires explicit takeover. A copied tab takes over that
page; the old view stops sending input and shows a Take over / New page choice.
It never automatically fights the new owner. Each device has its own page and
viewport. The account's Lite pages share website cookies but not DOM state.

Canvas, media, WebGL, rich contenteditable editors, nested frames, shadow DOM,
inline SVG, uploads/downloads and complex drag/gesture interaction are not
supported. They show placeholders. OAuth flows relying on popups may fail:
ordinary target=_blank opens in the current Lite page. **Open in Browser** opens
only the URL in the original Browser; it does not copy Lite cookies or form data.
Unsupported pages are not silently switched to another app.

Three server pages per Linux user are allowed. **Sessions** lists and closes
pages, including pages from other devices. Pages expire after an hour without
client requests; the empty agent exits after 15 minutes. Ordinary logout preserves
server pages just like Browser, but all API access requires logging in again.
Logout everywhere and Reset stop Lite pages; website cookies/profile remain.
Browser/daemon crash does not preserve unfinished form state. Reconnect restores
only the last address and persistent website profile.

## Runtime installation

The manager stays stdlib-only. A per-user asynchronous worker uses pinned
Playwright 1.63.0 and matching Chromium under `/opt/vibetop/browser-lite`:

```sh
sudo INSTALL_DEPS=1 PREFLIGHT_USER=junjie apps/everyday/browser-lite/install.sh
```

This installs dependencies, installs a scoped AppArmor userns exception if needed,
and runs the Chromium sandbox preflight as the actual nonroot user with the same
service limits. Both `chromium_sandbox=True` and namespace/seccomp diagnostics
are checked. A failed preflight never falls back to `--no-sandbox`.

Normal deploy/Update uses `INSTALL_DEPS=0`; it does not download dependencies.
Absent optional runtime does not break other apps. Backend changes restart only
Lite units. Profiles live under each user's
`~/.local/share/vibetop/browser-lite/profile`. The private Unix socket lives under
`/run/vibetop/browser-lite/<uid>/agent.sock`; every root proxy connection verifies
SO_PEERCRED. Default caps: 2 GiB memory, 200% CPU, 256 tasks, or stricter configured
limits. SELinux paths reuse helper labels; sandbox preflight must still pass on
that distribution. Only Ubuntu 26.04 has been validated during initial work.

The optional uninstall script stops Lite units and removes only Lite runtime and
its AppArmor profile. It keeps user website profiles. Removing the source/menu
entry is a separate normal release.

## Protocol and isolation

`POST /api/browser-lite/{session,action,updates,ack,resource,pages}` runs after the
manager's normal session/CSRF gate. Root only proxies bounded JSON to the user's
agent. No arbitrary evaluation, Linux identity, socket path or resource URL is
accepted by these HTTP routes. Long-poll and resource/action concurrency are
limited per user and globally. CDP is private Playwright IPC, never public TCP.

A remote init-script collector maintains stable per-document node IDs. Mutation
notifications trigger a bounded graph scan at most twice per second; only changed
records are sent. It does not repeatedly transmit outerHTML or per-node computed
styles. Baselines are progressive 256 KiB chunks with an 8 MiB/20,000-node ceiling.
CSS comes from CDP stylesheet data and preserves ordinary imports/media ordering;
layer/supports imports degrade explicitly. Relative resource references resolve
against the originating stylesheet, not Vibetop. Resources must have actually been loaded by Chromium in the current document.
Their bodies come from CDP, not an authenticated HTTP replay that could change
SameSite/private-network semantics. Missing bodies remain placeholders; no
arbitrary request API or direct client fallback is used.

Session, daemon generation, document epoch and attachment ownership fence actions
and resource responses. ACK is issued only after the frame applied data. Missing
sequences request a new baseline. Pending patches have a 2 MiB cap; overflow pauses
with a recovery message instead of infinite full-snapshot churn. An action sequence
cache prevents repeating completed side effects. Page actions are serialized,
including filling a field before Enter. IME composition remains local until the
completed input event. Password values are not included in DOM snapshots.

Client content is reconstructed with a tag/attribute whitelist inside an
opaque-origin `sandbox="allow-scripts"` frame. Its head-first CSP allows exactly
the committed renderer's SHA-256 script hash, inline styles and blob/data images
and fonts; connect, objects, nested frames, forms and base URLs are forbidden.
Only the trusted toolbar can call authenticated APIs. Source window + per-frame
random channel checks protect the message bridge. Assets become blob URLs inside
the frame. The remote website can affect its own collector or DOM, but that does
not grant it desktop/API/script privileges.

This authenticated remote browser deliberately retains the user's existing
Browser network reach, including LAN sites. URL validation is **not** advertised
as public-only SSRF isolation. It runs as the user, never as root, and cannot use
the manager as an arbitrary privileged fetcher.

## Verification

```sh
python -m pytest server/tests/test_browser_lite.py
PLAYWRIGHT_BROWSERS_PATH=/opt/vibetop/browser-lite/browsers \
  /opt/vibetop/browser-lite/venv/bin/python tests/e2e/browser-lite.py --public
# Test-only matching WebKit must first be installed under the path used by the test.
PLAYWRIGHT_BROWSERS_PATH=/opt/vibetop/browser-lite/browsers \
  /opt/vibetop/browser-lite/venv/bin/python tests/e2e/browser-lite.py --engine webkit
```

The E2E fixture runs remote JS, trusted click, fill/Enter, select/check, authenticated
image, scroll, refresh and duplicated-tab ownership, and verifies opaque origin,
script CSP and blocked external requests. Tests use independent temporary
profiles, not the operator's live Browser. Browser-engine automation does not
substitute for a real iPhone check. Bandwidth findings must include initial styles,
fonts/images and ongoing data; no fixed savings percentage is promised.

After editing `browser-lite-renderer.js`, regenerate the committed frame:

```sh
python3 apps/everyday/browser-lite/backend/render_frame.py
```

A hermetic test checks its exact hash and source bytes. The static installer
excludes backend files and frame templates; only the generated frame is deployed.

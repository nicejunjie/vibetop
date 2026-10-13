# Browser Lite rewrite experiment

Browser Lite loads websites through a per-user backend and renders rewritten
HTML, CSS and JavaScript in the browser running Vibetop. Images are enabled by
default. The UI stays inside Vibetop. It uses sibling HTTPS hosts on an existing
domain; website code never runs on the main Vibetop origin.

**This implementation is not yet a released, fully compatible browser.** Public
site tests cover Wikipedia, GitHub and CodeMirror. Google search currently hits a
network CAPTCHA also reproduced by direct Chromium. Popup login, full native
history and broader worker/window relationships remain release gates. Network module workers now pass controlled startup and graph checks.
Eval/Function-created imports and virtual worker URLs still fail; generated imports can attempt direct client requests.
Data-URL workers also remain unrewritten; cross-realm Blob error timing and
workers created in unbridged blank/srcdoc documents need dedicated fixes.
Do not rely on complete backend routing yet. Mobile
WebKit testing uses emulation, not a physical iOS device.

## Latest worker regression results (2026-10-13)

The constructor prerequisite now matches native Chromium and mobile-emulated
WebKit for argument conversion/order/early abort, invalid options without source
upload or origin mapping, malformed URLs, revoked Blobs, failed preparation and
termination. Upload/map counts come from the fixture server with positive
controls. Uppercase/whitespace Blob URLs, UTF-8 binary/string Blobs, and classic
and module failure paths are covered. The classic-worker network subset passes in both engines. Gateway
interaction/image/upload/download/navigation checks and 47 optional-chain cases
also pass in both. The repository suite passes 1292 manager tests (one skip),
7 usage tests and 719 JavaScript tests; the latest proxy suite passes 181 tests; the latest packaged suite passes 183 tests. Slow/lost-response UI checks
pass in desktop Chromium (latency and bandwidth limits) and mobile-emulated
WebKit (fixture latency); tab state and session retry recover in both.

The latest source worker matrix has 40 cases and passes 37 through the proxy
in both engines. Native Chromium passes all 40. Native WebKit produces all 40
expected values but intermittently reports an access-control page error for the
deliberately denied cross-origin entry redirect (also seen through the proxy).
The earlier immutable package passed 34 of its 37 worker cases. The remaining
three failures are eval imports, Function imports and WorkerLocation. Chromium
records two direct-origin request attempts from generated imports. Network
module coverage includes cycles, early cyclic exports, dependency-first fetch,
redirect identity, cross-origin CORS, credentials, UTF-8, transferables,
import.meta-derived URLs and native rejected-promise behavior. The packaged TLS
frontdoor passes real-page loading, in-place sign-in renewal, manager/daemon
restarts and per-device logout in both engines. The legacy non-realm gateway
still fails child-first messaging in both engines, also reproduced with the old
bundle; this is a known existing failure, not a passing suite.

Astra and actual Claude Code agreed the bounded network-module design. Claude's
implementation follow-up **does not approve the increment**: preprocessing can
fail after a successful preflight parse; whitespace can disguise absolute
imports; data/blob/generated-code imports and shadowed helper bindings need
containment. The actual processor now throws on graph parse failure, and URL
normalization uses native absolute URL parsing and exact relative prefixes.
The graph path now parses as a module without regex comment stripping.
Worker-specific CSP covers classic, module and uploaded workers and their
children. Script/connect/worker hosts are restricted to proxy hosts, with an
explicit WebSocket connect source. Helper bindings and local reassignment are
rejected using the exact processed source; unsupported graph schemes reject.
Helpers themselves are not the security boundary: a deliberately overwritten
global helper causes an attempted import that Chromium reports as CSP-blocked.
The test records that separately from unblocked requests.

The 17-case containment/socket suite passes both native baselines and the latest
immutable proxy package in Chromium and mobile WebKit. It covers text/binary
WebSockets, virtual socket URL, constructor/brand exceptions, generated-code and
non-network graph denial, a nested classic child, header-like source and helper
tampering. No unblocked direct-origin request occurs. `worker-src 'none'` was
rejected after it broke normal module dependencies in WebKit; admitting proxy
worker hosts while enforcing the policy on every child passes the same cases.
Claude review of the latest policy/socket changes remains pending. Page
import-map normalization and object-valued specifiers remain open findings;
classic generated-code support, WorkerLocation and broader CSP fidelity remain
release blockers. Astra's next-increment plan is in
[worker location](plans/browser-lite-worker-location.md).
No production activation or release approval.

## Installation architecture

- Node 22 and frozen pnpm dependencies form an immutable, content-verified bundle.
- Build as the nonroot APP_USER service account, with package scripts disabled.
- Root publishes under `/opt/vibetop-browser-proxy/releases/<revision>`; all
  ancestors are root-owned. Reuse of installed dependencies is offline.
- Root metadata lives under `/var/lib/vibetop/browser-proxy`; per-user website
  state lives under `/var/lib/vibetop/browser-proxy-profiles/<uid>`.
- Each rewriter runs as its Linux user with private PID/network namespaces; a
  separate egress account enforces destination restrictions. Root holds ingress
  sockets and authorizes requests; it does not stream website bodies.
- The tested systemd runtime uses PrivatePIDs and the other isolation directives
  in `server/browser_proxy_runtime.py`. Verify support before release on another
  host; a listening manager alone does not prove those runtime features work.

The install entry is `apps/everyday/browser-lite/install.sh`. An ordinary Update
uses `INSTALL_DEPS=0`: it skips an absent/disabled optional installation and
otherwise builds against the installed verified dependency tree. A changed lock
file fails explicitly and requires an intentional dependency upgrade.

Reserve `*.realms.example.com` exclusively for website realms. The UI and main
Vibetop hosts must sit outside that wildcard; startup rejects overlapping trusted
origins. This uses a subdomain of the existing domain, not a new domain purchase.
Provision its HTTPS certificate and routing before activation.

First installation is an administrator action, after HTTPS tunnel/DNS routing
and the access boundary have been reviewed. A configuration file contains:

```json
{
  "domain": "realms.example.com",
  "uiOrigin": "https://browser-lite.example.com",
  "mainOrigins": ["https://vibetop.example.com"],
  "localHosts": ["host.lan"]
}
```

`INSTALL_DEPS=1 APP_USER=vibetop PNPM_JS=/path/to/pnpm.cjs` plus `--config` selects
an explicit first installation. pnpm must be version 10.18.3. The installer adds
release identity fields; do not manufacture them manually. Production activation
has not yet been performed for this branch.

## Upgrade, failure and recovery

Lite updates patch only their managed parts of the actual installed nginx site;
all other bytes must remain identical. OnlyOffice callback hosts remain allowed.
The normal installer uses the same generator and deployment lock.

Before replacing config/site, the installer writes a durable recovery journal at
`/var/lib/vibetop/browser-proxy-deploy/pending.json`. It validates nginx before
committing the release config. Only changed nginx content triggers a reload.
Update stages Lite last and schedules the manager restart out-of-band. The
watchdog checks the hash of the configuration loaded by the manager and that the
manager process identity changed before confirming activation. A plain ping is
insufficient. Existing per-user rewrite processes roll to the new release on
trusted UI heartbeat/open; unrelated terminals, Browser xpra and X11 are untouched.

A pending activation prevents another installer from overwriting its snapshot.
If the watchdog has stopped, inspect its log and repair any error from `nginx -t`,
then run the installer with `--recover`. Rolling back a `pending-restart` record
requires the additional explicit `--force` flag; do not use it while its watchdog
is still running. A failed recovery retains the journal for retry. `doctor.sh`
reports a remaining journal. Recovery never rolls back identity or website data.

`uninstall.sh` disables the rewrite routing and stops only its own sockets and
services. It retains profiles, identity, immutable releases and an `enabled:false`
host policy, so later full installs cannot accidentally expose the desktop on
former website hosts. Re-enabling is an explicit `INSTALL_DEPS=1` action.

## Verification

See [rewrite plan](plans/browser-lite-rewrite.md) for remaining acceptance gates
and [end-to-end tests](../tests/e2e/browser-proxy/README.md) for exact commands.
Coverage includes root/runtime isolation, TLS handoff and renewal, images,
per-device logout, reconnect/restart, real WebSockets, forms/uploads/downloads,
slow-network and lost-response behavior, immutable release rollover, interrupted
activation, offline build/publication and uninstall preservation. Tests that
simulate service callbacks are identified separately from real process tests.

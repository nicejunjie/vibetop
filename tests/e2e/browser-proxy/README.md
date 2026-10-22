# Browser Lite rewriting tests

This work is not deployed and must not receive real website credentials yet.
The gateway and UI use ancestor-context realms and one-use navigation
transactions. Installer, privacy and broader compatibility release gates remain
open; passing these tests does not declare the product ready.

The runtime dependencies are pinned in
`apps/everyday/browser-lite/proxy/pnpm-lock.yaml`: Rammerhead commit
`ee5fbb7837f5fe752c4b82c18184f42449678d5b`, Hammerhead 31.6.2, pnpm 10.18.3.
After installing frozen dependencies, run `node build-engine.cjs` from that
proxy directory. It verifies upstream patch anchors and builds the patched engine.
Do not modify generated node_modules artifacts directly. Preserve dependency
license notices in any runtime bundle.

## Controlled integration tests

`gateway-fixture.cjs` creates three owned upstream sites, a temporary HTTPS ingress,
a private Unix gateway socket, and an egress guard limited to those sites. It
listens only on loopback and deletes its temporary state on shutdown. No Vibetop
profile, user session or terminal is touched. The driver launches and stops it.

On this host, run sequentially (they use the same fixture ports):

```sh
VT_REALM_TEST=1 /opt/vibetop/browser-lite/venv/bin/python tests/e2e/browser-proxy/check-gateway.py chromium
VT_REALM_TEST=1 /opt/vibetop/browser-lite/venv/bin/python tests/e2e/browser-proxy/check-gateway.py webkit
/opt/vibetop/browser-lite/venv/bin/python tests/e2e/browser-proxy/check-ui.py chromium --slow --drop-responses
/opt/vibetop/browser-lite/venv/bin/python tests/e2e/browser-proxy/check-ui.py webkit --drop-responses
/opt/vibetop/browser-lite/venv/bin/python tests/e2e/browser-proxy/check-history.py chromium --slow
/opt/vibetop/browser-lite/venv/bin/python tests/e2e/browser-proxy/check-history.py webkit
/opt/vibetop/browser-lite/venv/bin/python tests/e2e/browser-proxy/check-history-boundaries.py chromium
/opt/vibetop/browser-lite/venv/bin/python tests/e2e/browser-proxy/check-history-boundaries.py webkit
/opt/vibetop/browser-lite/venv/bin/python tests/e2e/browser-proxy/check-history-retry.py chromium
/opt/vibetop/browser-lite/venv/bin/python tests/e2e/browser-proxy/check-history-retry.py webkit
/opt/vibetop/browser-lite/venv/bin/python tests/e2e/browser-proxy/check-optional-chain.py chromium
/opt/vibetop/browser-lite/venv/bin/python tests/e2e/browser-proxy/check-optional-chain.py webkit
```

The driver uses a loopback CONNECT proxy to resolve only the fixture namespace;
no `/etc/hosts` modification is needed. The reserved example.com suffix avoids
WebKit treating `.vt-proxy.test` as third-party in raw native iframe cookie tests.

The tests exercise image loading, native per-origin storage, JS/HttpOnly cookies,
CORS denial, modules, nested/blank frames, transferable messages, classic/blob
workers, actual uploaded/downloaded bytes, Unicode/binary WebSockets and navigation. Unexpected page errors
and client requests escaping to original hosts fail the suite. The one expected
WebKit CORS rejection is identified narrowly by its request path.

History tests use the actual toolbar and application History API. They check
unsaved input and document identity, cloned state, repeated URLs, tab isolation,
rapid Back/Forward, scroll and fragments, Reload, and Retry while an HTML response
is held. Cross-document Back currently reopens a GET and loses the previous
document's live state; this remains a compatibility gate. These WebKit UI/history
tests use iPhone 13 emulation, not a physical iOS device.

The optional-chain corpus compares native evaluation with server rewriting,
client dynamic evaluation, and a dedicated worker. It also requires identical
server/client generated source, module-local `window` bindings, and actual
cross-origin postMessage and Location.replace routing (including grouped calls,
tags and call/apply/bind). The pinned WebKit has native grouped-call/tag behavior
that differs from Chromium and standard reference semantics. Three exact native
deviations are checked and reported separately; the rewritten results must match
the standard results. This is not a claim of physical Safari certification.

## Actual root/nginx/systemd integration

These create and remove only their own temporary units and directories. Browser
processes run as SUDO_USER with their sandbox enabled. Existing Vibetop sessions
are not restarted.

```sh
sudo -n python3 tests/e2e/browser-proxy/check-nginx.py
sudo -n python3 tests/e2e/browser-proxy/check-runtime.py
sudo -n python3 tests/e2e/browser-proxy/check-frontdoor.py chromium
sudo -n python3 tests/e2e/browser-proxy/check-frontdoor.py webkit
```

The frontdoor test includes public Wikipedia and its images, UI-cookie renewal
without replacing the UI Document, root-manager and daemon restart recovery, and
two independently signed-in devices with logout of only one. The runtime test
asserts resource routing immediately after manager restart, before heartbeat.
Run `node --test *.test.cjs` in the proxy directory for the additional actual
root-mode WebSocket tests, including expiry and per-device logout of open sockets.

## Public website acceptance

Start `node tests/e2e/browser-proxy/public-harness.cjs`, saving its JSON stdout to a
private file. This creates a nonroot transient systemd unit with PrivateNetwork,
ProtectHome and private Unix sockets; a separate checked egress guard reaches
public websites. The test browser uses an explicit loopback proxy that permits
only fixture physical hosts, so a missed rewrite cannot escape to the original
website. Stop the harness with SIGINT; it removes its unit and temporary state.

```sh
/opt/vibetop/browser-lite/venv/bin/python tests/e2e/browser-proxy/check-public.py chromium /tmp/vt-public-harness.log
/opt/vibetop/browser-lite/venv/bin/python tests/e2e/browser-proxy/check-public.py webkit /tmp/vt-public-harness.log
```

These search Wikipedia and check the article portrait, open a GitHub README, edit
CodeMirror's preview and submit a Google search. They report each failed site and
exit nonzero if any required action fails. CAPTCHA, throttling and missing search
results are failures, not skipped passes. Screenshots go to `/tmp/vt-acceptance-*`.
Do not repeatedly hammer a site after it returns a throttle; investigate using
controlled regression fixtures instead. No actual accounts are used.

The older `origin-fixture.cjs`, `check-origins.py` and `engine.patch` are historical
feasibility artifacts, not current acceptance or deployment instructions.

## Immutable bundle and version rollover

Build as the service account (never root), using an explicitly supplied pinned
pnpm 10.18.3 entry point for the first download. Normal rebuilds use `--reuse`
with a verified root-owned bundle and do not access the network:

```sh
python3 apps/everyday/browser-lite/build-release.py /path/to/new-stage --download --pnpm-js /path/to/pnpm.cjs
python3 apps/everyday/browser-lite/build-release.py /path/to/another-stage --reuse /path/to/root-owned-bundle
sudo -n env VT_BROWSER_RELEASE=/path/to/root-owned-bundle python3 tests/e2e/browser-proxy/check-release-rollover.py
sudo -n env VT_BROWSER_RELEASE=/path/to/root-owned-bundle python3 tests/e2e/browser-proxy/check-frontdoor.py chromium
sudo -n env VT_BROWSER_RELEASE=/path/to/root-owned-bundle python3 tests/e2e/browser-proxy/check-frontdoor.py webkit
```

The rollover test uses only disposable units and no public website requests. It
checks real process replacement in both directions, read-only adoption before
heartbeat, stable profile identity and expired client lanes after replacement.
Frontdoor WebKit uses iPhone 13 emulation, not a physical iOS device.

## Activation and installer failures

```sh
python3 tests/e2e/browser-proxy/check-activation.py
sudo -n env VT_BROWSER_RELEASE=/path/to/root-owned-bundle python3 tests/e2e/browser-proxy/check-installer.py
```

The first test runs a private real nginx, rejects an invalid candidate, injects
reload/manager failures and checks rollback still serves the previous page. Its
manager selection callback is simulated. The second runs the real offline
service-account builder and root publisher using private paths under /run. It
checks repeated installation is a no-op and uninstall retains profiles and the
main-host guard. It simulates service callbacks, never touches live nginx or
production unit state. Combine these with the real frontdoor/runtime checks;
none alone establishes deployment readiness.


`probe-github-native.py` diagnoses the mobile GitHub resize-loop finding using
unrewritten site code. It removes embedding headers only in a disposable browser
context and delays asset requests by 250 ms. It reports page errors and does not
label them a passing acceptance result. The same ResizeObserver error was
observed natively under this delay; do not infer a proxy regression from that
message alone or globally suppress it in the public-site test.


Worker network and module coverage:

```sh
/opt/vibetop/browser-lite/venv/bin/python tests/e2e/browser-proxy/check-workers.py chromium
/opt/vibetop/browser-lite/venv/bin/python tests/e2e/browser-proxy/check-workers.py webkit
```

The default includes module-worker startup, eval/Function-created imports and
WorkerLocation; it currently exits nonzero on those four compatibility gaps. `--network-only` explicitly limits the scope to the classic-worker network
subset (excluding generated code and WorkerLocation): fetch/XHR, cookies/credentials, allowed and denied CORS, relative and
cross-origin/nested dynamic imports, typed-array Blob sources and binary transfer.
Both engines pass that subset. Context-level request observation includes worker
requests; an escaped request fails the check. Fixtures share ports with the other
gateway checks, so run them sequentially.

Use `check-workers.py chromium --native` (or `webkit --native`) for the matching
unrewritten baseline. Its opt-in HTTP resolver allows only the three owned
fixture hostnames. All 15 native cases pass in both engines, including the four
currently failing proxied cases. This baseline does not count as proxy acceptance.

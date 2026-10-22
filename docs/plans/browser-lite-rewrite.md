# Browser Lite: client-rendered server rewriting

Status: implementation research; not production-ready or deployed.

The user requires a usable browser within Vibetop, with images enabled and
original interactive webpage capabilities. The DOM mirror does not satisfy this.
The replacement preserves webpage JavaScript and renders it in the client browser;
the server handles network access and rewriting. The old xpra Browser stays intact.

Astra planning and two actual Claude Code reviews agreed to the per-origin
server-rewriting prototype. Claude withdrew its earlier per-site recommendation:
site isolation is not the same as the browser's origin security boundary.

Use existing `nicejunjie.com` infrastructure. A new registrable domain is not
required. Each profile and original scheme/host/port maps to a distinct single-label
`bl-...nicejunjie.com` hostname. Never execute upstream scripts on Vibetop's origin.
Before connecting sibling proxy origins, protect authenticated Vibetop GET/POST/WS
requests against sibling requests and cookie injection. The main app must not
relax `document.domain`. Parent frames sandbox untrusted documents without top
navigation or popup escape.

## Evidence so far

- Official Scramjet-App 1.1.0: Google homepage and interactive search submission
  run in Chromium and WebKit, including cross-site iframe embedding. One WebKit
  cold start failed; race investigation remains. Google search returns CAPTCHA
  on this server's exit IP, so search-results acceptance is not passed.
- Rammerhead at ee5fbb7 / Hammerhead 31.6.2: Google homepage works on both engines.
  Patched an absent CSS descriptor crash in modern WebKit. Search reaches CAPTCHA;
  stock storage synchronization and postMessage still have compatibility errors.
- Per-origin Rammerhead fixture: native cross-origin DOM/Cookie/storage reads
  are denied; images, local interaction, same-origin fetch and cross-origin
  navigation work. WebKit strips task-script Referer paths: inject an explicit
  document URL and validate it against the physical host instead.
- The test harness's arbitrary Session method dispatch cannot be exposed to
  untrusted pages; replace it with validated command dispatch.
- Server Cookie jar must validate client-cookie writes against the mapped original
  URL, not client-supplied cookie domains. Request Origin derives from the actual
  browser Origin/Referer, never from a forgeable URL descriptor or global session
  Referer state.

## Remaining release gates

1. Complete three-origin regression matrix: same-site and cross-site frames,
   Domain/Path/HttpOnly/SameSite cookies, CORS, service endpoints and malicious
   descriptors; user/profile separation.
2. Pin dependency graph and patches; implement public-only DNS-pinned outbound
   connections, redirect checks, resource limits and per-user nonroot runtime.
3. Reviewed auth bootstrap and revocation, new-origin resources, persistence,
   history/tabs, popups, downloads/uploads, clipboard, workers, media, editors.
4. Vibetop integration under the existing Browser Lite app identity; migration
   cannot silently mix old DOM workers with the replacement frontend.
5. Real website task matrix, slow-network reconnect/cache measurements, desktop
   Chromium and mobile WebKit automation, then real iPhone validation. Automated
   WebKit does not stand in for a real-device result.
6. Actual Claude code review, required repository checks, versioned release,
   surgical deployment that preserves live terminal/Browser/X11 sessions.

No production readiness is claimed by the fixture or baseline timing results.

## 2026-10-13 executable compatibility and security review

Current Chromium/WebKit fixtures exercise upload/download bytes, native storage,
CORS rejection, default images, same-origin nested frames, about:blank children,
message transfer options, and classic/blob worker imports. Modern private member
syntax must survive both transformation and AST regeneration. Actual Wikipedia
search/article, GitHub README navigation and CodeMirror preview editing have
passed on WebKit; Chromium GitHub and CodeMirror passed, and Wikipedia's image
check was corrected to wait for the portrait load instead of asserting immediately.
Google search reaches CAPTCHA; validation/worker repairs are still underway, so
Google search is not accepted. Nothing in this update is deployed.

Actual Claude Code implementation review found cookie sync-name forgery, wrong
credentials enum, internal header forwarding, on-link global IPv6 egress, and
origin-map exhaustion. Corrections use __Host sync cookies, the engine's named
credentials enum, explicit header stripping and jar-only Cookie forwarding,
dynamic local-prefix exclusion, and stateless host verification with bounded
cache. Main HTTPS auth now requires __Host-vt_session and rejects duplicates;
release must disclose that old HTTPS login cookies require reauthentication.
The protected API preserves external Host ports. These edits remain unreleased.

Astra's follow-up audit withdrew the earlier assumption that a JS-visible document
context token can prove ancestor identity. A B top page can exchange tokens with
B nested under A. The ordinary HTTP request carries no WindowProxy proof.
Claude's independent follow-up agrees conditionally with physical context origins:
map (uid, profile, original origin, virtual top site, ancestor-tainted bit) into the
host. Wrong or unknown source realm never grants authenticated cookie use or
executes a document/worker. Each ordinary mapping inherits the source's top site
and taint; only the trusted wrapper can enter a main-page context. A one-use
navigation transaction preserves method/body and source site through redirects;
challenge and execution tokens are separate and POST dispatch is at most once.
The revised request realms and trusted navigation transactions are implemented
and covered by the controlled browser fixtures. Production authentication,
persistence and deployment remain incomplete and block real-account use.

The trusted wrapper needs a dedicated sibling host, within existing nicejunjie.com,
source WindowProxy checks, controlled history and popup messaging. Proxy egress
must reject our proxy/main hosts. Realm records need persistence or authenticated
self-describing context recovery; the current origin-only LRU is insufficient for
that revision. Omitted Referer never upgrades cookie permission. Cookie-authenticated
no-referrer cross-origin resources need careful policy handling. Cross-context
same-original-origin windows become additionally isolated, a compatibility cost.

Do not claim arbitrary browser equivalence: WebAuthn/passkeys, FedCM, payments and
some OAuth/COOP flows depend on the real origin/top-level browser. Native page code
can also write parent-domain cookies: __Host protects the main session identity,
but cookie flooding remains a shared-domain availability risk. These are product
architecture boundaries, not missing unit tests. A usable release must address
unsupported flows explicitly rather than silently failing or calling the current
prototype complete.

## Integrated context tests and browser UI (2026-10-13)

Chromium and WebKit now pass the context-aware fixture, including ordinary and
typed-array Blob workers, native message-origin spoofing rejection, wrong-target
message confidentiality, mixed explicit/wildcard message ordering, inherited
about:blank message delivery, cross-origin POST bytes/initiator/one dispatch, and a
307 POST → 303 GET redirect chain which does not restore Strict cookies.
The CSS matrix checks A document → CDN stylesheet → authenticated A image, a
tainted B frame's denied A credentials, and rejection of a copied main-context
stylesheet URL before it can launder image requests. Contextual responses use
no-store; fixed engine scripts use content-versioned URLs.

The worker fix registers rewritten code on its own document host so Blob worker
dependencies acquire a verifiable Referer. Registrations are realm-bound, bounded
and briefly retryable. WebKit synchronous POST lacks Fetch Metadata; its exact
browser-controlled Origin is required instead. Typed-array/response Blob paths
must also be rewritten, not assumed to have passed the engine's string Blob hook.
Module/nested workers, original CSP/COEP semantics and worker virtual URL behavior
still need work; they are not accepted merely because classic worker tests pass.

Actual Claude review agreed with the worker isolation design and identified
missing raw-Blob rewriting, COEP propagation, per-realm quotas, transient reverse
origin lookup caching and the runtime's old registry. Raw-Blob processing,
quotas, lookup caching and runtime selection have been corrected. Astra found
stale epoch entries, message FIFO, redirects and in-flight body accounting gaps;
those now have implementation fixes and regression coverage. Another actual
Claude implementation review is pending.

The trusted UI controller is shared by the test harness and new browser interface.
It serializes address changes and approvals using acknowledged server epochs,
checks message source/origin/epoch, and revokes closed tabs. Address bar, tab state
retention, close, back/forward have passed desktop UI tests. Back/forward currently
reopen URLs; native BFCache/form-state equivalence is not claimed. Mobile/slow-link
UI tests and the secure sibling-host bootstrap remain release gates.

The isolated public harness now defaults to realm mode with durable host records
and own-domain egress denial. Wikipedia search/portrait, GitHub README and
CodeMirror editing passed Chromium again through this mode. Google still reaches
the exit-IP challenge and reports solveSimpleChallenge undefined; it remains a
failed acceptance case. These results are not a deployment or readiness claim.

## Control recovery and mobile validation (2026-10-13)

Actual Claude's navigation review agreed with the transaction architecture but
found lost-response epoch wedges, abandoned tabs, global quota starvation,
redirect-origin taint and one-use tickets in native history. The control socket
now has a bounded serialized operation ledger; identical retries return the
recorded result without repeating open/approval mutations. The trusted UI retains
an unacknowledged command until recovery, has batched lease heartbeats, and uses
best-effort pagehide cleanup except for BFCache. Lease expiry also reclaims tabs.
Per-tab navigation/body limits prevent one tab consuming the shared allowance;
approval starts a fresh dispatch deadline. Fetch redirect-taint is tracked
separately from the initiating origin used for cookie policy.

Mobile WebKit UI passes address/tabs/state-retention/close/back/forward and
deliberately lost open + approval responses, with one upstream POST. Chromium
passes the UI at 250 ms RTT and 100 KiB/s down. A WebKit dynamic iframe initially
omitted the trusted Referer: the wrapper explicitly uses origin-only referrers,
sets src for the first load, then uses native Location.replace on later opens.
Native hardware-back and form-state fidelity still require additional work.

The per-origin message probe's automatic reply remains an origin-discovery
channel. Astra recommends a trusted broker for managed windows; a guessed-origin
filter alone is not a complete privacy fix. This remains a release issue.

## Agreed production integration and current implementation

Use nginx for streaming HTTP/uploads/WebSockets and root only for identity,
service startup and bounded control JSON. Main authenticated POST
`/api/browser-lite/bootstrap` issues a short-lived one-use handoff submitted by
form POST to `browser-lite.nicejunjie.com/__vt/bootstrap`. The redemption checks
the exact main Origin and iframe navigation, then sets host-only HttpOnly Secure
`__Host-vt_bl_ui`. Only this trusted UI host serves the wrapper and its
`/api/{open,approve,close,heartbeat,status}` controls, with exact-origin CSRF checks.

Content hosts `bl-u<uid>-<hash>.nicejunjie.com` use nginx auth_request to a dedicated
internal root endpoint. Before startup/routing root verifies HTTPS, host UID,
purpose, profile, current authorization epoch and expiry. Duplicate credentials
fail closed. Only a validated integer UID determines the fixed Unix socket path.
Relay capabilities cannot provision a runtime or reopen a closed/revoked listener.
An existing authorized systemd listener may activate crash recovery; Astra reviewed
and agreed to this precise boundary. The user gateway still
performs all realm/source, cookie, CORS and upstream checks after ingress auth.

Root-owned `/var/lib/vibetop/browser-proxy/` stores identity metadata and a master
key, never webpage cookie/realm data. Derive separate UI, content-auth, relay,
entry-ingress and realm keys; the daemon receives only its realm key and stable
engine ID, never any authentication signing key. A root-owned systemd socket
passes ingress FD 3 to the daemon, so the user cannot substitute its socket path.
Root decorates control-result entry URLs with a short-lived entry-ingress permit
bound to exact Host and hash of the gateway's one-use ticket. This authenticates
the first content request before its Domain content cookie exists. Root approval
does not replace gateway ticket consumption. Stable realm keys are independent
of authorization epoch, preserving website local storage after logout-all.

Use per-user rewrite service (PrivateNetwork, PrivatePIDs, hidden home and other
runtime directories, no capabilities, read-only code,
only its profile/run directory writable) plus a guard under a separate service
identity so compromised same-UID code cannot control the network-enabled guard.
Guard config is root-maintained. Both services have resource limits. nginx may
traverse a dedicated ingress directory and connect to its 0660 socket; control
remains private and root verifies Unix peer UID. Root never streams webpage bytes.
Logout-all raises authorization epoch first, then stops only that user's Lite
services to terminate existing streams; website profile is retained.

Implemented separate stable Hammerhead session ID and expiring relay
capabilities in an explicit proxy descriptor field, preserving cookies/storage
across daemon restarts while allowing capability renewal. Do not put proxy auth
in the original site's query or replay POSTs after restart. Validate 24h expiry,
renewal, logout revocation, restart recovery and cookie-omit resource requests.

Implementation files: server/browser_proxy{,_auth,_store,_runtime,_nginx}.py and
manager route dispatch; server/install.sh nginx main-host guard; Browser Lite launcher;
proxy runtime/capability/gateway. Test the actual generated nginx streaming and
WebSocket paths, bootstrap, cross-user/purpose rejection and expiry before any
Cloudflare mutation. Then configure existing-domain wildcard DNS/TLS and narrowly
scoped Access routing, run real-host acceptance, and release with normal version,
commit/push and surgical deploy steps. Preserve terminal/xpra/X11 processes.

2026-10-13 integration evidence and remaining gates:

- Actual disposable systemd services pass FD ownership, UID/epoch mismatch,
  private PID/network/home isolation, upstream HTTPS, daemon restart, root-manager
  adoption and logout checks. Egress additionally needs AF_NETLINK for Node's
  local-interface inspection and a read-only resolver bind when /run is hidden.
- Actual disposable nginx passes auth separation, forged-header replacement,
  3 MiB upload without sending the body to root, immediate streaming, WebSocket
  upgrade, UI routing and one-use entry rejection. Platform cookies are filtered
  at root/nginx before any per-user process; only the current stable engine's
  host-only sync cookies are forwarded.
- Chromium passes the full TLS main launcher → UI → root auth → isolated
  rewriter path using Wikipedia, including images enabled by default, UI cookie
  renewal without replacing its Document, manager/daemon restart recovery and
  independent device logout. Native fetch must be bound to Window for renewal;
  the launcher must name the iframe before insertion for form targeting.
- WebKit also passes the full frontdoor flow. A first test using unknown `.test`
  suffixes dropped host-only sibling cookies while accepting the parent Domain
  cookie; a minimal prefix probe ruled out general `__Host-` support failure.
  Changing only the local CONNECT-resolved test hosts to siblings under
  `vt-browser.example.com` makes the unchanged authentication flow pass. Use
  known public-suffix structure for browser same-site tests, as production does.
- Root identity writes are atomic/fsynced and locked to one manager. Persistence
  errors disable authorization. Per-device logout stores bounded, expiring main
  token-hash tombstones and closes its active streams; raw unverified cookies
  cannot create tombstones. UI-only control is bounded per UID and globally.
- Actual Claude review `/tmp/vt-claude-root-implementation-review.json` withheld
  release agreement pending logout hardening, seamless root adoption, cookie
  filtering and install/backup/uninstall coverage. Fixes are in progress; obtain
  re-review and test the restart gap itself, not only heartbeat recovery.
- Installer/deploy/uninstall integration, live wildcard/Access configuration,
  Google search acceptance, broader worker/popup/history behavior and the
  previously listed browsing/privacy gates are still incomplete. Nothing in this
  branch has been deployed or represented as production-ready.

Additional 2026-10-13 feature evidence:

- Clean full-frontdoor runs pass on both engines after removal of diagnostic
  cookie probes. Root unit/authorization suites pass 263 tests; proxy unit suite
  passes 92 before the new WebSocket regression cases.
- Chromium slow-network UI at 250 ms latency, 100 KiB/s download and 50 KiB/s
  upload passes tab state, navigation, expiry recovery and deliberately lost open
  and POST-approval responses; the original form reaches upstream exactly once.
- New real browser WebSocket tests uncovered missing Fetch Metadata and a second
  Hammerhead authorization pass. Both engines now echo Unicode and binary frames
  through the rewriter, with upstream original Origin and authenticated cookies.
  Actual root-mode sockets additionally pass per-device revocation and expiry.
- Wikipedia search/portrait, GitHub file navigation and CodeMirror editing pass.
  Google homepage renders, but search encounters a network challenge. Direct
  native Chromium reproduces the same CAPTCHA and `solveSimpleChallenge is not
  defined`; this is not evidence of a proxy-specific rewrite defect. Search
  result acceptance remains failed, and no CAPTCHA is solved automatically.
- Astra installer review and actual Claude review agree on staged immutable
  releases but require dependency integrity, private pnpm copy-mode store,
  root-verified artifacts, explicit runtime revision rollover, revision-pinned
  UI assets and atomic nginx/config rollback before implementation is complete.
  The main static collector now excludes the entire proxy source tree.

Release and message follow-up, 2026-10-13:

- Zero-probe postMessage mapping passes both engines for direct parent/child,
  first-contact sibling, native transfer/error semantics and former-probe silence.
  Grandparent first contact and self-navigation taint changes remain gaps.
- Proxy suite now passes 97 tests. Fresh frozen dependency build and offline
  reuse build produce identical bundle hashes. Root publication copies without
  following source links and verifies its private copy; real publication and
  service-account module loading pass. This is not yet an installed product.
- Actual disposable systemd upgrade and rollback pass: ingress adopts old code
  read-only, UI heartbeat switches versions, profile identity remains stable,
  old client lanes expire. Chromium and mobile-emulated WebKit frontdoor tests
  pass using an immutable root-owned bundle and revision-pinned UI assets.
- configured() now requires an explicit validated releasePath/revision; the
  pending installer must write those fields last and restart the manager. The
  old Playwright installer has not yet been replaced. Do not deploy this branch
  before that transaction, rollback and optional-uninstalled behavior are tested.

- Claude release review found fail-open logout-all on unavailable configuration,
  repeated failed tree hashing, and an early rollover commit marker. Fixed with
  main-epoch revocation fallback, bounded 503 plus 60-second failure cache, and
  rewrite.json publication after successful unit reload. Actual injected reload
  failure now recovers on retry, and process cmdline proves the selected bundle.
- Installed bundles will live at `/opt/vibetop-browser-proxy/releases/<revision>`
  with root-owned ancestors. `/opt/vibetop` belongs to the service account, so it
  cannot provide the claimed immutable parent-directory boundary.
- WebKit's stylesheet CSP console warning was isolated to Playwright screenshot
  capture: an otherwise empty strict-CSP page has no errors until screenshot(),
  for both caret settings. Frontdoor checks style errors before capture; no
  production CSP relaxation is needed for a test-tool-injected stylesheet.

- Actual Claude follow-up (`/tmp/vt-claude-release-fixes-review.json`) found no
  blockers in the reviewed release corrections. Its additional root-umask and
  stale-ready-cache findings are fixed and tested: publication explicitly sets
  readable modes, and interrupted rollover clears cached routing. This review
  does not approve the unfinished installer or broader browser feature gaps.
- Latest complete repository regression: 1,269 Python tests passed, one skipped;
  seven usage tests and 718 JavaScript tests passed. Subsequent small review fixes
  passed 92 targeted tests plus the real interrupted-upgrade/rollback test.
- Existing terminal 1–4, xpra Browser and X11 PIDs still match the pre-work
  baseline. No production deployment, Cloudflare change or commit was performed.

Astra installer planning follow-up:

- A proxy-only update must schedule the existing out-of-band manager restart:
  configured() caches the bridge, so changing JSON alone leaves the old release
  selected. Do not restart the parent manager from its installer child process.
- Prefer generating the main-host map, default-host guard and optional independent
  Browser Lite server blocks in one nginx site file, with optional blocks rendered
  using include_main_map=False. One atomic site-file replacement avoids pretending
  multiple renames are an atomic nginx transaction.
- Extract a genuinely side-effect-free nginx renderer before adding candidate
  output mode: server/install.sh currently mutates installation state before it
  reaches the rendering block, so an early exit there is not a dry run.
- Publish verified bundle first; validate candidate full nginx configuration;
  switch root config/site, reload nginx once, restart manager out-of-band, verify
  health. On activation failure restore prior config/site and refresh manager.
  Never restore master/state/profiles as part of code rollback.
- Final post-review frontdoor reruns passed Chromium and mobile-emulated WebKit.

Installer implementation follow-up:

- `server/install.sh --render-only` exits before mutations; real nginx parse
  tests replace mutating tools with failures. Normal main-site writes share the
  Lite installation lock and reject an unfinished activation journal.
- Actual Lite activation patches the installed site rather than re-rendering its
  unrelated settings. Removing managed additions must reproduce the original
  main-site bytes. OnlyOffice callback hostnames remain allowed.
- New install-proxy.py replaces the legacy Playwright install entry. Absent
  optional installs skip without mutation; updates build offline as APP_USER,
  publish a verified root copy, then activate the config/site transaction.
- Update stages Lite last and schedules its out-of-band manager restart for
  proxy-only changes too. The watchdog checks loaded config hash and retains
  exact previous config/releases for rollback. Source rollback never rebuilds
  Lite over its journal snapshot. A stale transaction has an explicit --recover
  command and a doctor warning.
- Actual isolated installer test builds twice as the service account (97 proxy
  tests per build), publishes as root, verifies first activation and second
  no-op, then uninstalls while preserving profile data and the main-host guard.
  Service callbacks are simulated in this test; separate check-activation.py
  exercises real private nginx parsing/reload failures, and frontdoor/runtime
  tests exercise real isolated manager/rewriter processes.
- Full live Cloudflare activation and remaining browser compatibility gates are
  still outstanding. This implementation is under Claude follow-up review.

Installer review corrections:

- A failed Update's source redeploy skips Lite; its previous immutable config
  has already been restored. It cannot create a second deferred transaction with
  no watchdog. Update resolves/refuses old pending activation before any git work.
- Both main-site installation and Lite-only activation now call the same site
  patcher with hostname/FQDN; a byte-identity regression prevents rewrite churn.
- Confirmation requires changed manager PID/start time as well as loaded config
  hash. The 75-second adoption deadline accommodates the 60-second failed-load
  cache. Explicit pending rollback requires --recover --force after the watchdog
  has stopped. Build/install process groups have bounded timeout and kill grace.
- Uninstall retains enabled:false configuration so a later full install retains
  the strict host policy. Ordinary Update skips it; re-enable is explicit.

Installer review outcome and validation:

- Actual Claude final review (`/tmp/vt-claude-installer-final-review.json`) agrees
  B1–B3 are fixed and found no remaining blocking defect in the reviewed
  installer/Update layer. This is not approval of the unfinished whole browser.
- Its remaining lazy-cache rollback concern is addressed by scheduling a manager
  refresh after a failed Update has restored both config and source and replied;
  API/watchdog regression tests pass (23). A recoveryRestart response field makes
  that refresh explicit without misreporting the failed Update as successful.
- Complete regression before that small follow-up: 1,292 manager Python tests
  passed, one skipped; seven usage tests and 718 JavaScript tests passed. The
  final actual Chromium and mobile-emulated WebKit frontdoor runs passed, as did
  offline APP_USER build/root publication/no-op/uninstall preservation.
- No production deployment or Cloudflare changes. Terminal 1–4, Browser xpra and
  X11 PIDs still match the original baseline. Remaining work includes popup/login,
  native history/worker compatibility, domain ingress acceptance and publication.

### Same-document history implementation plan (2026-10-13)

Astra reviewed the current wrapper/controller/gateway. The new owned `/history`
fixture reproduces draft loss after toolbar Back in Chromium; the prior UI test
only checked the heading and therefore passed. iframe session history is joint
with the host and other tabs: native `history.go` is not an independent tab API.

Implement a bounded per-Document journal with original application state kept in
native `history.state`, no metadata envelope. Captured rewritten replaceState
performs native URL/serialization validation before journal mutation; private
structured clones preserve Maps, Dates, BigInts and cycles. push appends (even
same URL) and discards Forward, replace edits only the current entry. Toolbar and
site back/forward/go send scoped commands, with go(0) handled as reload. Traversal
restores native state/URL, dispatches a scoped synthetic popstate, and restores
scroll only for auto mode; new navigation/user input cancels pending restoration.

Controller binds state snapshots to the frame WindowProxy, physical origin,
server tabId/epoch, and a fresh attach nonce echoed by the currently live Document.
The nonce is a stale-message filter, not a navigation/cookie authority. This is
necessary because same-origin full-document navigation can retain an epoch.
Snapshots contain IDs/URLs/index, never application state. URL polling alone must
not append history entries. Interleaved tabs must not navigate the host or each
other. Cross-document replay, hash/hardware navigation and complete native event
semantics remain explicit release gates.

Acceptance: draft and document identity; same-URL push; replace; forward branch
truncation; structured clone/errors; popstate reentrancy; auto/manual scroll;
interleaved tabs; stale messages after same-origin document replacement, Chromium
and mobile WebKit. Actual Claude reviewed the plan before implementation and
reviewed the implementation repeatedly. Its findings led to explicit target slots
for Back/Reload, preservation across lost responses and Retry, cancellation of
stale approvals, and recovery before processing old-document navigation. Target
slots retain their URL so expiry during a failed Back cannot replace A with B.
The controlled tests now cover delayed HTML, late load events, lost successful
control responses, and expiry during recovery as well as ordinary traversal.
The separately reproduced optional-chain crash in mobile GitHub is fixed.
Public mobile acceptance still reports a ResizeObserver loop during rendering;
history test passes do not close that gate.

### Optional-chain compatibility repair (2026-10-13)

Astra proposed immutable per-evaluation reference carriers, preserving native
`?.` short-circuiting rather than lifting keys/arguments into temporary scopes.
Actual Claude reviewed and agreed after parser own-token retention, explicit
eval/postMessage adapter effects, grouped/tagged references, native delete tails,
and a captured-call route inside the existing method instrumentation were made
explicit. Generated AST nodes skip reinstrumentation while original keys,
arguments and prefixes continue through the normal transformer.

Implementation review caught grouped call/apply/bind effects, optional grouped
method routing, delete-of-call values, computed super keys, and module-local
`window` shadowing. Each has a controlled regression. Cross-origin navigation and
messaging are tested through the real gateway, not just mocked helper functions.
The same source factory is injected into server/client builds; workers use the
header's native-call fallback. Generic worker capability limitations remain.

The current corpus has 47 browser cases plus additional Node scope/concurrency
and repeated-processing checks. Chromium and iPhone-emulated WebKit pass server,
client and dedicated-worker execution and generated-source parity. Three native
WebKit grouped-call/tag deviations are reported explicitly. GitHub's mobile
file-list crash is fixed; public-site acceptance also waits for hydration and
the actual README URL/content, preventing earlier false positives from the
repository landing page. Final implementation review and broader product gates
remain separate from these tests.


Latest follow-up validation (2026-10-13):

- Tagged eval.call/apply and modules shadowing one through four global aliases
  pass real Chromium and mobile WebKit routing checks. Bare optional eval avoids
  double processing. The repeatable engine build succeeds; the fresh offline
  bundle passes all 160 included proxy tests.
- Desktop Wikipedia search/images, GitHub README/Back, and CodeMirror editing
  pass. Mobile Wikipedia/images and CodeMirror pass. Mobile GitHub completes the
  README/Back journey but remains FAIL because of a ResizeObserver-loop error.
  Native WebKit at the same viewport initially did not reproduce it. A later
  test-only embedded native page with 250 ms asset delays did report the same
  error while loading the README. This establishes a native timing-sensitive
  reproduction, not a clean acceptance pass. Keep the diagnostic error visible.
- Mobile lost-response UI recovery and delayed Back/Reload/expiry Retry pass.
  Chromium slow-network state-preserving history passes.
- Actual Claude follow-up review was attempted but returned its session-limit
  message; it is pending, not an approval. No popup implementation starts before
  the requested review agreement. No production deployment has occurred.

- Fresh immutable bundle `ce85c75c1f4865c48b7f2c36be6a282ab14f85d2d4bc51b1f781fe4a74cca143`
  passes Chromium and mobile WebKit full TLS frontdoor tests: in-place renewal,
  manager/daemon restart, and independent device logout. Release upgrade,
  rollback, read-only adoption, interrupted update recovery, and profile identity
  also pass. Mobile history boundary and UI recovery checks pass. Production
  terminal, Browser and X11 PIDs still match the saved baseline.


### Worker compatibility follow-up (2026-10-13)

The new owned worker matrix reproduced a no-op import URL helper. The worker
bootstrap and both script-header copies now delegate dynamic imports to the
existing script origin mapper. Both engines pass the explicitly scoped classic
network subset: API fetch/XHR with credentials or omission, CORS allow/deny,
relative/cross-origin/nested imports, typed-array Blob sources and binary transfer.
The 47-case script/routing matrix also passes in both engines after this change.
The repository suite remains green (1,292 manager tests, 7 usage tests, 719 JS
tests); 158 source proxy tests and 160 fresh-bundle tests pass. Bundle revision:
`4661257fa35c2038dddd7784552f5a426d6ed286ca6f0b4b844f5b91dfe6587a`.

The default worker test deliberately remains failing in both engines for four
confirmed cases: module-worker bootstrap calls forbidden importScripts;
eval-created imports and Function-created imports are not rewritten; and
WorkerLocation exposes the physical proxy location. Chromium's context request
monitor records two original-site requests from generated imports, denied by the
test proxy. WebKit rejects those imports without emitting observed requests.
Do not describe all worker traffic as backend-routed while this remains open.
The module-worker plan must cover or explicitly retain these gates; implementation
awaits actual Claude review, currently unavailable due to its session quota.
No production deployment or real-account login tests have occurred.


Native worker baseline (2026-10-13): `check-workers.py --native` passes all
15 cases in Chromium and mobile WebKit, including the four failing proxied cases.
The opt-in test HTTP proxy forwards only the three owned fixture hostnames,
without rewriting source. This confirms the failures belong to Browser Lite
rather than invalid test expectations or unsupported native browser APIs.

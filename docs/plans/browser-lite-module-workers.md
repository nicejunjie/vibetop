# Browser Lite: dedicated module-worker compatibility repair

Status: reviewed design, not implemented by this document. Claude's revised review conditionally agrees to the bounded network-module increment once the three corrections below are written; this revision incorporates all three (redirect serialization, registered resource flag, hoisted helper delegates), plus its hashbang/runtime-host clarifications. The independent constructor repair is agreed. Implementation still requires its acceptance gates; later worker features retain separate review gates. No implementation or deployment is authorized by this document. Scope is dedicated Worker; do not infer SharedWorker or ServiceWorker support from a shared library implementation.

## Confirmed behavior and release gates

The owned `tests/e2e/browser-proxy/check-workers.py` fixture establishes the current state:

- Classic-worker fetch, XHR, CORS allow/deny and binary transfer work in Chromium and mobile-emulated WebKit.
- The repaired 11-case classic network subset, including direct/nested/cross-origin/typed-Blob dynamic imports, passes with `--network-only` in both engines. Both full realm gateway suites and the repository/proxy suites also pass; they do not supersede the default worker failures below.
- A `{type:'module'}` worker fails because the injected Hammerhead header calls native `importScripts`. That API exists in module workers but must throw there; testing its existence/native-looking toString is not a valid worker-type test.
- Worker eval-created and Function-created dynamic imports bypass processing. The context-level monitor observed two requests to the original `http://c.source-three.test` host; the test proxy denied them. This is a confirmed routing gap, not just a hypothetical compatibility limit.
- WorkerLocation exposes the physical HTTPS proxy URL. Worker script-header `getLocation`, `getEval` and `processScript` identity fallbacks do not provide general worker virtualization.

Keep these as separate failing gates. A successful static module-worker message alone must not be described as complete worker support or complete server-routed worker networking.

## Existing implementation seams

- `client-bridge.js` supplies `vibetopCreateWorker`, converts options once before routing and prepares canonical Blob bytes through `/__vt/worker`. Its error path is reviewed and tested.
- `modern-script-patch.cjs` invokes that hook after native new/missing-argument guards and supplies the original base and URL-mapping callback. The callback still emits classic script mode; module graph serialization is pending.
- `worker-origin-patch.cjs` patches worker URL mapping and the dynamic-import helper delegated by both header copies. The main agent is modifying this file; implementation must rebase on that result rather than overwrite it.
- `gateway.cjs` processes uploaded source again, including typed-array Blob sources that bypass HH's string-only Blob hook, and stores processed bytes in `WorkerStore`.
- `processing/script/header.js` and its client-bundle copy inject the importScripts bootstrap. The active Rammerhead `addJSDiskCache` replacement is patched by `build-engine.cjs` to use `vtCacheKey` plus source; inspect that override, not only HH's unused source-text cache.
- `worker-hammerhead.js` initializes fetch/XHR/importScripts interception and obtains context from a proxied location or `__get$WorkerSettings`. It does not include the full window-side dynamic script processor.

## Graph-wide module bootstrap: reconciled review conditions

The original entry-only `m` proposal is withdrawn. It gives the entry an `sm` URL while a self-import/cycle receives an `s` URL, creating another module-map identity. Claude correctly identified that blocker. Its proposed flagged static launcher avoids that particular duplicate, but changes entry redirect acceptance and native WorkerLocation. Claude's revised review accepts the following graph-wide alternative subject to the concrete conditions incorporated here and differential tests.

Keep the original proxied entry URL and call the real native Worker with `type:'module'`. Define reserved descriptor flag `m` as **worker ESM graph processing**, not “entry”. Use the same canonical `sm` descriptor for the entry, all static imports/re-exports and all dynamic imports within that worker graph. This includes module graphs entered by `import()` from a classic worker; the classic worker entry and `importScripts` resources remain classic. Register a named `RESOURCE_TYPES` entry for `m` in the pinned server, client and worker copies, including their parse and stringify/rebuild paths. Generate the combined script/module flag string through the shared serializer in its defined order; `sm` in this plan is notation, not permission to concatenate a literal string. A parse-then-rebuild must retain both flags. Test all three copies and the content-type token rebuild explicitly. Never embed an opaque graph identifier in the resource-type string: the existing parser searches for individual flag characters.

Every graph module receives the same first static side-effect import:

```js
import "https://<worker-context-physical-host>/__vt/worker-module-runtime/<revision>.mjs?<canonical-configuration>";
// Processed original module, with its static graph intact.
```

The runtime is a self-contained trusted ESM asset: synchronous initialization, no top-level await, and no upstream dependencies. All modules import the **identical absolute runtime URL**, including CDN dependencies. Derive its host from the initiating document origin decoded from the frozen tuple's validated realm-context component and map it under that unchanged context. In the server resolver this must not use the current CDN request's host or origin. The resulting runtime fetch is same-origin to the worker even when the importing module is on a CDN; verify that behavior in both engines. Native module-map deduplication initializes it once; a global readiness guard also makes reuse safe in a classic worker that is already initialized. This runtime URL must not be rewritten into an upstream script or receive another bootstrap import.

A first static runtime import in each module ensures initialization before site dependency execution, including cyclic graphs. Fetching/compiling the graph precedes evaluation; those requests must already have valid server-rewritten URLs. Do not use an inline entry-body initializer, fetch/eval module loader, or asynchronous launcher as a substitute. A runtime failure must fail the worker rather than run site code with identity fallbacks.

### Canonical descriptor: concrete implementation contract

Before loading a network worker, its constructor produces one canonical graph routing tuple: existing HH session ID, signed realm-context component, tab-token component, relay component, `sm` mode, and normalized UTF-8 module charset. No new worker token or mutable per-profile “current worker” is required for this increment. Each worker has its own native module map; simultaneous workers may use the same canonical tuple. The tuple is routing metadata, never permission to use an upstream jar or another realm.

1. Capture the complete existing `windowId = context~tab~relay` from the normalized entry proxy URL. Preserve it through the graph. On `m` requests, `RealmOrigins.map` and the server import resolver take these validated incoming components from request-local state; do not substitute the freshly minted root `req.vtRelayCapability` while emitting dependency URLs. Authentication still independently validates the actual request. Do not widen root token grammar or add another `~` field.
2. The worker runtime obtains the same tuple from its canonical runtime import URL/configuration and explicitly initializes the installed mapper/settings with it. The worker dynamic-import helper uses this frozen tuple, `sm`, and the same charset rule. Do not recover a new relay from `/__vt/map` or change worker-global settings per imported module. The client constructor, server static resolver, worker helper and server redirect Location serializer must share the canonical field/flag rules.
3. Use one UTF-8 representation for all module descriptors and decode module responses as UTF-8, including contradictory upstream charset labels. Do not inherit a document charset or a classic script's charset. Establish the exact serializer representation with a unit test and require byte-for-byte URL equality; “equivalent” descriptors are insufficient for native module maps.
4. Preserve original URL query/fragment identity and resolve imports from each module's final original response URL after redirects. If a helper is handed an already proxied graph URL, parse/validate it and retain the tuple instead of nesting a proxy URL or dropping `m`. Self-import via literal, `import.meta.url` and virtual location must converge where native behavior converges. This is not a requirement to merge a directly requested URL and a distinct redirecting URL: preserve native requested-URL module identities.
5. Relay renewal affects later newly created workers, not existing graph URLs. A still-authenticated request may continue using the frozen descriptive token, but a cookie-less expired/revoked relay request must fail normal authorization. Never silently mint a new module identity to rescue it; explicit worker reconstruction is the recovery boundary. Record this lifetime limitation.
6. Canonical runtime configuration has fixed field order/encoding and includes the stable session/context/tab/relay, processing revision and graph mode required for initialization. Its bytes remain public and invariant. Do not include a per-module original URL, per-request nonce/time, or entry-only marker in the runtime URL. Native entry location distinguishes a module entry from a classic entry; graphs dynamically imported by a classic worker reuse existing classic initialization rather than changing `importScripts` behavior.

7. Treat HTTP `Location` rewriting as a fourth generator. Patch the `location` response transform / `resolveAndGetProxyUrl` path and its `contentInfo.contentTypeUrlToken` rebuild so every redirect retains the registered graph flag, complete frozen incoming window tuple and normalized UTF-8 charset. The current pinned path rebuilds known flags and passes no charset; changing only source import resolvers is insufficient. Maintain native redirect origin/CORS checks and final-response base resolution. A direct request and a different URL that redirects to it can remain separate module-map entries, as natively; require preservation of routing fields, not collapsing those request URLs.

Implementation must prove this contract across all four URL generators **before** advertising module support. If pinned HH cannot carry the frozen tuple/UTF-8 mode through every graph edge without leaking mutable settings between requests, that remains a blocker; do not substitute entry-only marking. Module-Blob virtual source metadata is deferred to its own phase and must not create different runtime URLs within one graph.

### Admission, immutable asset and native loader boundaries

The `m` flag grants no origin/credentials/jar/realm permissions. Unlike the withdrawn entry-only design, it is valid on permitted module dependencies as well as worker entries. Require native worker-entry provenance for `Sec-Fetch-Dest: worker` and the already authorized script/module provenance for dependencies. Capture both engines' actual metadata first; do not require every `m` request to have destination `worker`. Confirm same-origin entry loading and cross-origin entry-redirect rejection while allowing native CORS-authorized dependencies. Resource-only hosts remain unable to become worker/document realms merely by adding a flag.

Place the revisioned runtime under `/__vt/worker-module-runtime/<revision>.mjs`, admitted in the gateway's exact immutable static-asset branch before cookie-only controls, and through root's existing `?cap=` relay handling. It may be served on authorized resource-only hosts as public bytes, but the generated graph uses one canonical worker-context host. It exposes no user source, WorkerStore data, jar, control endpoint or runtime provisioning. Reject unknown revisions/path variants; use JavaScript MIME, nosniff and package-pinned bytes. No public extension to `/__vt/map` is implied. Validate descriptive configuration against the actual native worker physical origin/context before initialization.

Graph requests retain native credentials/CORS behavior. Do not force `include`, and do not treat descriptor credentials as authorization. Cookie-less fallback remains no-jar. Cache benefits from revisioned bytes must be measured: relay-bearing URLs and changing leases can prevent reuse.

### CSP: existing gap, not a preserved guarantee

Current `framePolicies` extracts framing restrictions only. `gateway.cjs` replaces upstream CSP with rewritten `frame-ancestors` plus a sandbox directive; upstream `script-src`, `connect-src`, `worker-src`, eval/Function restrictions and other directives are **not preserved**. The earlier text assuming a complete rewritten policy was incorrect.

This bounded worker change neither repairs CSP fidelity nor authorizes a further relaxation. Preserve current framing/sandbox checks, add no blanket `unsafe-eval`, and record native-vs-proxy CSP probes as a separate known gap. Do not claim that upstream eval bans currently prevent generated worker code, or that the egress guard prevents direct client-browser requests. The already observed generated-code requests to original hosts remain real failures.

A proxy-owned network-containment CSP would be a separately reviewed mitigation, not native upstream-CSP preservation. It must cover document, network-worker and Blob-worker policy inheritance; validate exact legal host-source syntax and allowed script/connect/worker destinations. Do not implement Claude's tentative broad domain/unsafe-eval policy as an incidental bootstrap fix. Full CSP preservation and containment are explicit follow-up gates, with their scope and failures reported rather than hidden by `--network-only`.

## Header, runtime and active cache processing

Patch both server and client header generators. Module-local `var` declarations are hoisted, so `typeof __get$` cannot discover global helpers. An assigned alias such as `var __get$ = self.__get$` is also insufficient: a cyclic dependency can call an exported function before its defining module body assigns that alias.

Generate **hoisted function declarations** for worker instruction helpers. Each delegate reads the installed helper on `self` when called, checks readiness/callability, then forwards every argument and the required receiver using the runtime's native calling machinery. Do not depend on a module-body-assigned dispatch table, `var` alias, or a `let`/`const` binding still in its temporal dead zone. Do not change an instruction's direct-eval handling, return value, thrown exception or receiver semantics merely to make the delegate. Missing runtime/helpers must produce a clear initialization error, never identity fallback. The runtime's first static import ensures it has executed before any site module body, including a cyclic body that calls another module's hoisted export; the delegates must already be callable at that point. Window modules retain their window-specific branch.

Preserve a leading hashbang as the very first source characters: insert the runtime import and helper header after the complete hashbang line, before original import requests. Cover no-newline hashbang input and transform idempotence. Do not prepend a comment/header before `#!`.

The module runtime **must not install the classic importScripts wrapper**. That wrapper maps URLs before native invocation and can perform network I/O or throw a mapping error instead of the native TypeError. Leave native `importScripts` intact for a module entry. A runtime imported by an already initialized classic worker reuses that state and preserves the existing classic wrapper. Known graph headers never attempt an importScripts bootstrap. Do not infer module-worker type from `typeof importScripts` or native-looking toString.

Every graph source still uses the shared parser/transforms, including the optional-chain repair. Static imports, bindings, cycles and top-level await remain native. Build a worker-safe runtime; do not load the DOM/window bundle.

The active cache is Rammerhead's replacement patched by `build-engine.cjs`, currently keyed by `req.vtCacheKey` plus source. Gateway currently supplies physical host, session, relay and original URL. Extend that actual key to cover the complete canonical window tuple (including tab), normalized resource kind/charset and transform/runtime revision; include the final original base when redirects change it. Use the frozen graph relay instead of the freshly minted per-request relay for graph entries. A hit must not reuse another tab's rewritten URLs or a classic header. Measure hits and byte size; do not promise an improvement before measurement. Keep private processed source separate from the public immutable asset.

## URL, imports and options

- Preserve native static imports/exports, bindings, cycles, top-level await and native dynamic-import promises; do not concatenate a dependency graph or fetch/eval module source.
- Resolve each static specifier against that module's final original response URL after redirects, not the worker entry URL or only its origin. Dynamic import uses the containing module's original base. Test two modules with identical text under different directories.
- Keep bare specifiers native: document import maps are not automatically worker import maps. Do not silently resolve a bare worker specifier through the page's map.
- Preserve query strings/fragments and module identity consistently. Graph-mode metadata must not produce accidental duplicate instances of the same dependency or escape into the upstream URL.
- Before URL mapping, Blob reads or preparation POSTs, preserve the constructor/new check, convert the URL to DOMString, then normalize options exactly once: credentials, name, type, with immediate conversion/enum checking at each step. Native fixtures observe `url, credentials, name, name value, type`. Throwing getters, invalid enums, non-object options and Symbol conversions must fail before proxy side effects. Pass a fresh plain dictionary to native Worker, never re-read the original. Preserve native default/undefined/null behavior using the fixture. The repaired invalid-type Blob case now performs zero preparation POSTs in both native and proxied tests.
- Retain real native module-loader CORS and the original credentials mode (`omit`, `same-origin`, `include`) through the graph. Do not force include to recover the proxy auth cookie. Cookie-less relay fallback remains no-jar; possession of a URL/flag does not authorize private upstream data.
- Resource hosts, originating document context, native Origin/Referer/Fetch Metadata and the egress guard stay authoritative. A copied module-entry flag must not promote a resource-only host to a worker realm. Cross-origin entry rejection must match the native browser boundary.
- A dynamic import's async fulfillment/rejection and namespace behavior remain native. The current synchronous origin-mapping helper can introduce blocking on first mapping; preload discovered origins where practical and record that cost rather than claiming a completely asynchronous mapper.

## Later phase: Blob and typed-array module workers (separate review gate)

Do not rely on HH's Blob string hook. Decode completed native Blob bytes as UTF-8 regardless of the Blob MIME charset; for the existing synchronous XHR reader, use a verified UTF-8 overrideMimeType because window synchronous XHR cannot return an ArrayBuffer. Bound the read/preparation size and document main-thread blocking. Read the completed native Blob bytes and apply canonical server processing, as the existing classic upload path already does. Pass worker kind and original Blob URL/base information explicitly; do not infer module status from whether the source happens to contain `import` syntax. Strip/reconcile an existing HH header before adding the correct one, with an idempotence test.

For module Blobs, prefer returning prepared source bytes to the authenticated creator and constructing a native local Blob/object URL there. Extend the existing same-physical-origin authenticated POST preparation route with a module preparation mode; bound both request and response size. The result contains processed module source plus its first static runtime import. It does not become a cookie-less GET capability for private uploaded source.

This avoids a credentials trap: `{type:'module', credentials:'omit'}` will not send the proxy cookie to the current uploaded-source GET URL. Making private WorkerStore bytes public under a relay token, or forcing native include, is not an acceptable fix. The local prepared Blob keeps the entry source local; its trusted runtime import is public-only and explicitly relay-authenticated.

Module-Blob routing configuration must agree with the graph-wide canonical tuple above and verify the native Blob physical origin. A Blob-specific runtime URL used only by the entry would reintroduce multiple runtime identities: do not ship that shortcut. How original virtual Blob identity becomes available before dependency evaluation, without contaminating every module URL/cache or changing native Blob resolution, is an explicit later-phase design gate. Source bytes/private controls never go in runtime URLs; routing metadata is not authorization.

Keep native Blob-relative resolution behavior: do not silently use the creator document origin as the base where native Blob module imports would reject. Test relative, root-relative and absolute specifiers against the native engine. Absolute permitted imports still use normal proxy mapping/CORS.

Track internally created object URLs and cleanup after a safe point verified in both engines, and on termination/failure. Preserve original Blob revocation timing as far as possible; do not revoke a site's URL or read a revoked/foreign Blob by a server fetch fallback. A temporary Blob relocation changes its native opaque URL; virtual URL reporting is a separate gate below.

The current classic HTTPS WorkerStore path remains separate and retains its exact-realm, size and TTL protections. In particular, do not reintroduce the missing-Origin/Referer provenance failure that previously affected classic Blob importScripts.

## Constructor failure prerequisite (independent bounded increment)

A revoked Blob currently throws synchronously from proxy preparation, while both native engines construct a Worker then emit an asynchronous error. After completing all native argument/option conversions, catch **only preparation failures**. Create an empty Blob in the same physical origin, immediately revoke its new object URL, and pass that URL plus the normalized options to native Worker. This uses the verified native asynchronous failure path without running unprocessed source. Do not catch/rewrite native constructor exceptions, revoke the site's URL, or fall back to its unprocessed source. Emit a bounded diagnostic.

Before accepting this path, test both engines' `onerror`/event listener delivery, terminate-before-error, no upstream request/no source execution, classic and module types, and zero preparation calls after invalid options. Ordinary native SecurityError and constructor errors must retain their timing. Classic string-Blob double-processing/header idempotence is an accompanying regression gate, not evidence that the later module-Blob design is complete.

## Required generated-code and virtual-location gates

These are confirmed independent defects, not solved by static bootstrap. Add explicit acceptance probes before claiming general dedicated-worker compatibility:

1. Direct eval, indirect eval, Function and relevant async/generator constructors that create import expressions. Test literal and runtime-built specifiers, relative and cross-origin imports, and nested generated code. No context-level request may reach an original host.
2. Direct eval must still see its lexical scope; optional eval stays indirect. Merely overriding global eval with a wrapper is not sufficient. Native CSP eval/Function prohibitions are a separate currently unpreserved policy gate; test and report them without claiming the bootstrap repairs them.
3. A future repair should reuse a worker-safe bundle of the pinned shared script processor/parser and transformations, plus worker-specific runtime hooks. It must operate synchronously where eval/Function semantics demand it. Do not import the DOM-dependent bundle, fetch unprocessed code directly, or silently use identity `__proc$Script` fallbacks. Exact implementation of this follow-up requires its own reviewed change; module startup work must not claim it already exists.
4. Test `self.location`, `location.href/origin`, string conversion, `new URL(..., location.href)`, `import.meta.url` in entry and each dependency, and `new URL('./asset', import.meta.url)`. Compare original URL/base behavior and redirects against native fixtures. Runtime internally retains the native physical URL for routing.
5. `import.meta.url` rewriting must be an AST operation scoped to the actual module's original response URL, not textual replacement or the worker entry URL. WorkerLocation is not automatically fixed by the window-side Location wrapper; assess its property descriptors and return-object behavior before selecting an adapter. For relocated Blob modules, report the original virtual Blob identity without inventing an HTTP base.
6. Record errors, name, immediate postMessage delivery, transfer detachment and terminate-before-start behavior so a bootstrap change does not hide a startup/lifecycle regression.

The module-bootstrap patch may be reviewed/tested as a bounded increment. Production claims and release approval must explicitly account for the still-failing generated-code routing and location gates; `--network-only` is not a substitute for the default matrix.

## Acceptance matrix and order

1. Baseline native vs proxied Chromium/mobile WebKit: current default `check-workers.py` and context-wide network monitor. Preserve the known classic successes.
2. Network module entry with static, transitive, cyclic and top-level-await dependencies; first dependency performs fetch before entry body. Add a cycle in which B's module body calls a hoisted exported function from A before A's body runs, and that function performs an instrumented property access and dynamic import. Assert runtime/helpers already active, native results, and no importScripts bootstrap call. Include hashbang-first/header-idempotence cases.
3. Relative dynamic imports in multiple module directories, redirects, repeated imports and module identity; compare the exact client-entry/server-static/worker-dynamic URLs including session/window/relay/charset. Test server/client/worker resource-type parse/stringify round trips. Redirected static and dynamic dependencies must each import a relative sibling while preserving the graph flag, frozen window tuple and UTF-8 through Location rewriting. Do not equate native direct-vs-redirect identities. Test self-import and cycles back to entry, concurrent workers/tabs, relay renewal mid-graph, and identical text under different bases. Compare each engine to its recorded native baseline: Chromium self-import once, pinned WebKit twice; no additional proxy-induced copy. Real CORS allow/deny and each credentials mode require upstream cookie observations.
4. Module sources from string, typed arrays and composed Blobs; omit-credentials Blob startup; Blob-relative rejection and absolute imports; revoked Blob and wrong-realm preparation negative cases.
5. Native TypeError from site-authored importScripts in a module worker, syntax/load failures, immediate message queue, termination and binary transfer.
6. Generated-code and virtual-location probes above remain default tests, including the two already observed original-host request escapes.
7. Adversarial source/realm metadata, resource-only hosts, copied relay capabilities, logged-out leases and public runtime requests cannot retrieve private uploaded source or jar-backed data.
8. Build twice and verify patch idempotence, server/client header parity, immutable asset packaging and cache separation. Run existing worker, optional-chain and frontdoor regressions.

Implement only after agreement on the relevant increment: constructor conversion/error prerequisite -> canonical graph serialization/admission/cache tests -> network-module runtime/header bootstrap -> graph/source-base/identity tests -> separately reviewed Blob preparation -> generated-code/location/CSP follow-up gates. The revised Claude review conditionally accepts the network-module design with the three corrections now incorporated here; passing implementation tests remains necessary, and this agreement does not cover the later phases. No changes to SharedWorker or ServiceWorker admission are included; the existing serviceworker rejection remains.

## Primary references

- [HTML: module-worker example and the importScripts restriction](https://html.spec.whatwg.org/multipage/workers.html#module-worker-example).
- [HTML: worker creation and processing model](https://html.spec.whatwg.org/multipage/workers.html#worker-processing-model).
- [ECMAScript: cyclic module evaluation](https://tc39.es/ecma262/multipage/ecmascript-language-scripts-and-modules.html#sec-cyclic-module-records).

These sources establish platform semantics; the acceptance suite must still verify the pinned Chromium and WebKit behavior and the project's actual rewritten headers.


Native worker baseline (2026-10-13): `check-workers.py --native` passes all
15 cases in Chromium and mobile WebKit, including the four failing proxied cases.
The opt-in test HTTP proxy forwards only the three owned fixture hostnames,
without rewriting source. This confirms the failures belong to Browser Lite
rather than invalid test expectations or unsupported native browser APIs.


Additional native probes (2026-10-13): constructor conversion order and errors,
cyclic/TLA modules, and dependency fetch before entry execution are now covered.
Chromium self-import evaluates the entry once. Pinned native WebKit evaluates it
twice, reproduced in two independent runs; the test explicitly reports this
native deviation and compares with that engine baseline. This does not permit
an additional copy caused by entry-only proxy metadata.


Constructor prerequisite agreement (2026-10-13): actual Claude reviewed the
bounded constructor/failure repair and agreed with these adopted conditions.
Native new/missing-argument guards stay first; URL and option conversions finish
before proxy work. Validate URL syntax against the original document base after
option conversion, throwing a synchronous SyntaxError DOMException on failure.
Catch only origin mapping and Blob preparation, never coercion, syntax checks or
the final native Worker call. Failed preparation yields a fresh native empty
Blob URL revoked before the single native Worker call. Capture console at bridge
startup and log only failure stage plus original scheme/origin, never source or
physical URLs/tokens. Test zero map/upload requests for invalid options, both
native error-handler APIs, termination, cross-origin SecurityError and syntax
errors. The later reconciled graph-wide module plan is agreed with the conditions recorded above; its implementation is still pending.

Constructor implementation review closure (2026-10-13): actual Claude's first
implementation review found a raw Blob-prefix normalization bypass and two test
gaps. The bridge now classifies/reads canonical parsed Blob URLs; the fixture
server measures uploads/maps with successful-upload controls; classic and module
failure paths are exercised separately. Diagnostics use the initiating original
origin. Both engines pass the expanded 13-case classic subset plus constructor,
normalization and failure checks. Native baselines pass. Claude's follow-up
explicitly agrees this bounded implementation, after reading the final code and
logs. The 20-case default matrix still fails four module graphs, two generated
imports and WorkerLocation. Data-URL workers, cross-realm Blob timing and
unbridged blank/srcdoc constructors remain separate unresolved release gates.
Fresh bundle tests: 160 pass, revision
`de77bd1a3ef595153636320d65f6e00bd8d4bd42043ad4713051c944f2188b88`.
No production activation has occurred.

Module foundation review (2026-10-13): actual Claude agrees the bounded resource
flag registration and active-cache-key change. Three parser/serializer copies
retain `m`; the cache now separates complete window/tab identity, resource kind
and charset. The actual Rammerhead cache test proves two tabs retain their own
rewritten imports and repeat requests still hit cache. The schema tag is not a
content-derived transform revision: the current cache is process-local. Before
persistent caching or the module runtime is introduced, include its actual
revision. Upstream Service-Worker-Allowed header variation remains an existing
cache input gap; service-worker registration is rejected.

This does not implement Context content-type reconstruction, redirect tuple or
UTF-8 preservation, client constructor graph mode, graph headers or the module
runtime. Client/worker unit coverage executes their resource tables; complete
URL builder parity still belongs to the integration step. Native fixtures now
cover an early-call dependency cycle without the WebKit entry-self-import bug,
static/dynamic redirected dependencies, module importScripts TypeError, and a
hashbang. The importScripts negative uses a fresh cross-origin URL and counts
any forbidden mapping at fixture ingress. Redirect URL identity/CORS checks and
no-newline hashbang/idempotence remain next-step tests.

Both engines pass the expanded native 24-case matrix. The proxy full matrix
fails eleven cases (the same seven prior failures plus four new module probes).
Gateway and history suites pass both engines. Fresh bundle: 165 tests pass,
revision `686c570f8cbdb44f15097c26b7d20777ec4852a344e567362a7a37a5c5147e17`.

UI regression follow-up: the actual desktop UI passes 250 ms CDP latency,
100 KiB/s download / 50 KiB/s upload and lost open/approve responses. Mobile
WebKit passes 250 ms fixture ingress/control latency plus lost responses (no
bandwidth emulation claim). The old `--slow` harness unconditionally called
Chromium-only CDP; it now injects fixture delay for WebKit, including synchronous
requests. Both runs exercise address/tabs/retained state, closing tabs, back and
forward, expiry/retry and POST recovery. Desktop/mobile screenshots inspected.
Repository suite remains green: 1292 manager tests plus one skip, 7 usage tests,
719 JavaScript tests. Module runtime/redirect integration remains unfinished.

Redirect prerequisite implementation (2026-10-13): Context now retains the
registered module field and rebuilds its content-type token; Location emits
UTF-8 for graph redirects. Module decoding locks UTF-8 priority even when the
previous charset already equals UTF-8. Tests run the actual decoder/encoder with
both UTF-16 BOMs and both absent and UTF-8 response labels, plus classic charset
regressions. Realm mapping validates the signed context, strict tab/relay fields
and exact graph flag combination before registering an origin, then preserves
the incoming tuple. Classic mappings still use renewed relays. Gateway rejects
bare/mixed module flags.

Real Chromium/mobile WebKit fetch probes follow a 307 through actual Context,
gateway and realm mapping, retaining session, full window tuple, module flag
and UTF-8. Mislabelled windows-1252 Chinese/emoji source remains intact; bare m
and mixed sma receive 403. These probes fetch rewritten source, not execute a
module worker. Classic-worker and gateway browser regressions pass both engines.
The actual Rammerhead processor rejects a throwing import resolver without
returning raw source or writing a partial cache entry.

First Claude review identified the equal-value charset-priority defect; this was
fixed while that review ran. Follow-up review covers that fix and its additional
validation/test findings. Module runtime, hoisted header helpers, client/static/
worker graph edge integration and reference-derived flags remain unfinished.

Claude follow-up explicitly agrees the bounded redirect prerequisite: the BOM
blocker and all listed low-severity findings are closed. Review was read-only;
browser execution above was performed separately. Latest verification: 169
source proxy tests; 170 packaged tests before the additional raw-source-failure
regression was added; repository 1292 manager tests plus one skip, 7 usage tests,
719 JavaScript tests. Package revision:
`892e0b94ba3fa61de2d7d458c8d03b6f5585344e5d619437beaa0b31a838d605`.
Upstream response charset labels are still echoed over rewritten UTF-8 bytes;
module decoding and fetch.text ignore them, but header normalization should be
included when graph runtime integration lands. No production activation.


### Runtime integration and review follow-up (2026-10-13)

The graph-wide runtime and hoisted lexical delegates now execute network module
workers in both Chromium and mobile-emulated WebKit. The pre-follow-up matrix
is 37 native passes, 34 proxy passes, and three explicit failures (generated
imports via eval/Function and WorkerLocation). Both immutable-package browser
runs reproduce these results. Runtime package revision
`e5fc9a50e4fb7e87173621ac5f7b6140359ccbb9a99c8bd95e1cb6eb74bc7e64`
passes 178 packaged unit tests and both TLS frontdoor lifecycle suites. It has
not been activated and predates the corrections below.

Actual Claude follow-up refused bounded implementation approval. It found that
HH's regex preprocessing can invalidate a valid template literal after the
preflight parse, leaving a raw-source fallback. Strict graph processing now
throws at the actual parser-result branch; two template payload regressions
pass. It also found whitespace/embedded-newline absolute import specifiers
mistaken for bare names. Server/client static imports and window/worker dynamic
helpers now use exact relative prefixes or native absolute URL parsing.

Still open: data/blob import preparation, generated code, helper-name shadowing
and worker CSP containment; these are release blockers, not merely omitted
features. A focused Claude re-review of the parser and normalization fixes is
pending. New browser probes compare spaced static imports, tab/newline dynamic
imports and native rejection of `.foo`. Do not infer full increment agreement
from earlier prerequisite approvals.


### Module containment correction (2026-10-13, review pending)

The second actual Claude review accepted the strict failure branch and string
normalization direction, but found script/module grammar mismatch, mutable URL
lookup, page object-specifier normalization and import-map inconsistency. The
strict path now bypasses regex preprocessing, uses module grammar and transforms
the exact parsed text. Client/worker normalizers use captured nativeMethods.URL;
checked patch upgrades replace old guards rather than stacking them.

Module responses now use the active gateway response hook to emit proxy-only
CSP. The inherited forced transform alone was insufficient because installHooks
overrides it; browser probes caught that immediately. Reserved helper bindings
(including nested destructuring, parameters and catch/import bindings) and
non-network static graph imports are rejected. Dynamic unsupported schemes
produce native rejected import promises. No unsafe-eval/data/blob allowances.

The 11-case containment suite passes in Chromium and mobile WebKit, with zero
direct-origin request attempts or page errors. It includes successful ordinary
and cross-origin modules, preserved template text, HTML-comment-shaped grammar,
eval/Function/data/blob/string-timer denial and binding/static-data rejection.
Native baselines prove string timers execute without the policy. Chromium
rejects the HTML-comment-shaped grammar case natively; WebKit accepts it. Both
proxy expectations record that engine difference explicitly.

Source unit suite: 180 passes. Full source worker matrix: 37/40 values match;
classic eval/Function imports and WorkerLocation remain failing. Native WebKit
and proxy WebKit intermittently report the denied entry-redirect access-control
error as a page error even with worker.onerror.preventDefault; do not hide it.
Page import-map/object-specifier findings remain unresolved. Current containment
review is pending, and no package or production activation includes these fixes.


### All-worker containment and WebSocket follow-up (2026-10-13)

Claude accepted the strict parser/scheme fixes, then reproduced hidden bindings
inside header-like comments, local reassignment, mutable global helpers and an
unrestricted classic child. Binding checks now parse exact original source and
reject reserved assignment/update targets. Mutable JS helpers remain explicitly
outside the security boundary; CSP must hold even when they are changed.

All dedicated worker entry responses, including uploaded classic Blob workers,
now receive proxy-only script/connect/worker policy. WebKit applies worker-src
to module dependencies, so `worker-src none` was experimentally rejected. Proxy
hosts are admitted instead, and nested workers receive the same restrictions.
Classic eval/Function cases still fail compatibility tests but now generate zero
direct-origin attempts in the full matrix. WebKit's denied-redirect page error
remains recorded independently.

A new WebSocket probe found workers lacked the window WebSocket sandbox. The
worker bootstrap now wraps the native constructor, maps the target with the
WebSocket resource descriptor, preserves wss transport on mapped physical URLs,
and exposes original socket.url after native receiver validation. Native/proxy
checks cover text and binary echo, instance/static properties, malformed URLs,
empty fragments, protocols, Symbol/throwing conversion and getter brand errors.

17 containment/socket probes pass in both native engines and the immutable
package. Chromium reports one deliberately tampered-helper request with native
requestfailed `csp`; tests require every such attempted direct request to be
explicitly CSP-blocked. WebKit reports none. Source suite: 181; package suite:
183. Current test package (not activated):
`2ecd3b506e1e17579ab3aefcf442f0a433d8701fcdfa38d51e26a29fd070fb01`.
Runtime/cache identity now covers processor implementation as well as emitted
runtime bytes, preventing reuse after a parser-only correction. Latest actual
Claude review, including next WorkerLocation plan, is pending.

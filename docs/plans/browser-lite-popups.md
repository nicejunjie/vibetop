# Browser Lite: managed popups and login windows

Status: proposed implementation plan; requires actual Claude Code review before implementation. This document authorizes no deployment. The first implementation covers popups opened by the main document of a Browser Lite tab. Nested third-party iframe openers require a later, separately verified binding path.

## Outcome and constraints

Support common `window.open` login flows inside Browser Lite: synchronously return a real WindowProxy, permit an initial same-origin loading document, navigate through an identity provider, return to a same-origin callback, notify the opener, and close. Images and original page JavaScript remain enabled.

The trusted UI owns sibling content iframes. Preserve its current sandbox exactly: `allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-pointer-lock`. Do not add popup/top-navigation escape permissions, merge physical realms, relax original SOP, or introduce another domain. Keep terminals and the existing xpra Browser untouched.

Chromium and WebKit probes with this sandbox established:

- A preloaded same-physical-origin sibling iframe provides a real WindowProxy that can be returned and written synchronously.
- Native sibling `location.href` assignment by the sandboxed opener throws SecurityError; trusted UI navigation succeeds.
- A manually assigned `opener` property does not survive cross-document navigation.
- An injected close function can request UI removal; removing the iframe makes the retained WindowProxy's native `closed` true.
- A UI-owned sibling survives navigation of the opener. An opener-owned descendant does not, so it is not the primary design.

This is a managed-window implementation, not creation of a native auxiliary top-level browsing context. `top`/`parent`, browsing-context-group/COOP behavior and browser popup-policy details are not made equivalent by assigning `opener`.

## Existing extension points

- `apps/everyday/browser-lite/proxy/wrapper.js`: tab creation, selection, popup policy, heartbeat and teardown.
- `trusted-controller.js`: serialized/idempotent control operations, entry activation, source/origin checks, document attach nonce, navigation epochs.
- `client-bridge.js`: current `window.open` returns null; replace its behavior and the related `_blank` link handling.
- `gateway.cjs`: control ledger, tabs/tab tokens, one-use entries, main-navigation cookie provenance and navigation transactions.
- `runtime.cjs`, `server/browser_proxy.py`, `server/browser_proxy_runtime.py`: explicit command allowlists and authenticated control forwarding.
- New narrowly scoped modules: `managed-popups.js` for trusted UI coordination, `popup-bridge.js` for content-side handles, `popup-state.cjs` for server lifecycle validation, and `session-storage.js` for logical-tab storage semantics. Build/export lists must include them without publishing server code as static content.

## Phase 1: prepare, bind, return and close real windows

### Server state and commands

Each popup has its own existing control-ledger lane (`clientId`, monotonically increasing `operation`) and logical `tabId`. Its reservation records owner lease, opener tab and epoch, inherited physical realm, reservation ID, expiry, name/noopener policy and state. Reservation IDs are correlation identifiers, not standalone authorization capabilities.

States: `RESERVING -> LOADING -> BINDING -> READY -> CLAIMED -> LIVE -> CLOSED`, with terminal `EXPIRED` and `CANCELLED` paths.

Add these commands through the same authenticated UI POST surface:

| Command | Request and result |
| --- | --- |
| `popup-reserve` | Popup lane identity plus `openerTabId/openerEpoch`. Validate same lease and live main-document opener; return reservation metadata and the standard signed-entry result for an inert blank document on the opener's actual physical realm. |
| `popup-claim` | Reservation ID, validated opener identity, target/name/features and optional initial URL. Consume the reservation once; duplicate ledger operation returns the same outcome. An empty URL keeps the initial document. |
| `popup-navigate` | Popup lane identity, authenticated initiating tab/epoch, destination and assign/replace intent. Validate the registered relationship and target epoch, then issue the normal one-use entry/navigation transaction. |

Reuse `close` and `heartbeat`. Root validates all returned entry URLs before issuing its entry permit. These commands cannot provision a missing runtime: a live opener is required. Root adds identity/lease headers; content cookies or page-provided descriptors do not authorize commands.

The blank entry is a dedicated gateway response, not a fetch of the opener's homepage. Its virtual URL is `about:blank`; original origin and relative-URL base inherit from the opener. It runs the normal engine/bootstrap before being exposed, but contains no upstream content or root/private-control secret.

Allow one unused spare per active main document, at most four unused spares per UI lease, and count all spares against the existing 128-tab ceiling. Bound unused reservation lifetime (initial proposal: 120 seconds), renew only through a live opener heartbeat, and cancel on opener epoch change. Already claimed windows survive ordinary opener navigation. New document attachment prepares a replacement spare asynchronously; opening must not perform a synchronous network round trip.

### Binding protocol

1. UI creates and navigates a hidden slot; it records the actual slot and opener WindowProxy objects.
2. UI sends a random binding nonce and exact identities to both endpoints using exact native target origins. The grant includes the opener's current controller attach nonce/document identity as well as navigation epoch.
3. The dedicated blank slot introduces itself to the opener. The opener obtains the actual WindowProxy from native `event.source`; both endpoints validate native source/origin and the pending grant.
4. UI verifies the two registered endpoints completed the binding and sends READY. Do not expose a provisional handle.

Indexed `parent.frames` access is permitted only to deliver this introduction. Use stable physical frame slots, not names supplied by the webpage. Do not reorder/reparent loaded iframes. On removal, an opaque inert placeholder can preserve other indices; do not reuse an old slot generation while a relationship can reference it. Timeout or an index mismatch cancels the binding rather than guessing a target.

This is a dedicated, preauthorized blank-slot handshake. It must not add an automatic reply/probe to arbitrary website windows, which would disclose recipient origins.

`window.open` synchronously parses its arguments/features, applies popup policy, copies sessionStorage as specified below, consumes one READY grant, sends its claim and returns the actual WindowProxy. With no ready grant or failed policy it returns null. If an asynchronous claim definitively fails, close the slot and surface the failure in the UI; never leave an apparently live inert window forever. Retry an uncertain response with the same ledger operation.

Capture native user activation locally and verify activation again in the UI. Replace the current single `popupUsed` flag with a bounded per-gesture policy so a second genuine click is not automatically blocked merely because transient activation remains true. Page-provided `isTrusted` or activation booleans are not authority. Subsequent navigation of an existing permitted popup does not require another gesture.

### Names and basic behavior

- Omitted/empty URL creates the usable inherited blank document. `document.write` and reads are genuinely same-origin operations, not facade methods.
- `_blank` consumes a fresh slot. A READY/live known name in the current lease's opener relationship group returns the same WindowProxy; do not search names across devices or all profile tabs.
- `_self`, `_parent` and `_top` refer to the logical website hierarchy, never the trusted UI or Vibetop shell. First-phase main-document handling resolves these to the relevant content tab.
- `noopener` does not expose an opener relationship/return handle; `noreferrer` implies noopener and suppresses upstream Referer. Named-target behavior must follow these feature rules rather than accidentally reusing an opener-enabled window.
- Target `close()` requests UI closure of its own registered slot. Opener-side close is allowed only for a verified managed relationship. Remove the real iframe, revoke tab state and observe native `closed`; do not synthesize a fake Window object.
- Closing the opener does not close live popup tabs. An already held opener reference becomes closed naturally. Restoring a closed opener reference in a later popup Document is a known platform boundary: a removed WindowProxy cannot be sent through structured clone. Do not substitute an unrelated reused slot or fabricate a Window.

## Phase 2: managed navigation and OAuth return

Hook HH's property setters/location wrappers and both ordinary/captured-method call paths. Maintain private WeakMaps of registered WindowProxy and associated native Location/HH LocationWrapper objects. Cover `p.location=u`, `p.location.href=u`, a previously captured Location's href assignment, and permitted `replace`/`assign` uses. Optional-chain and grouped-call instrumentation must reach the same hook.

The hook delegates permitted writes to the trusted UI controller. It does not change browser SOP: cross-origin reads still throw, and method/property access such as cross-origin `assign`/`reload` must not become readable solely because the window is managed. Do not return a facade containing the target's current URL or use an origin-probing handshake. Unknown/unregistered targets retain existing native/HH behavior. Raw native bypass attempts remain sandbox-blocked.

Initial script-initiated navigation must not use toolbar `open(url)` with its default `sourceOrigin=null`. Server state derives the initiator from the verified opener tab/epoch. Cross-site initial requests therefore get the correct Lax/Strict treatment; webpage-supplied origin claims are ignored. Subsequent opener-directed navigation similarly derives the initiating document, and popup self-navigation uses the existing navigation transaction path. Redirect taint and exact POST replay remain intact.

Before any original script in each new popup Document, restore a genuine opener WindowProxy using trusted relationship/bootstrap metadata and stable UI slot identity. Do not treat slot indices or JS-visible relationship tokens as authorization. Assigning opener is only API compatibility; it must never grant cookies, a new realm or root control access. Honor disowning/noopener decisions. Do not pretend this creates native COOP browsing-context-group semantics.

Extend the existing zero-probe postMessage resolver with verified managed-opener/popup relations. Map the application's expected original targetOrigin to the appropriate physical origin and send once to the real WindowProxy. A recipient navigation race should make the native exact-origin send drop, not cause a wildcard retry.

An A -> provider B -> callback A flow may perform a native same-origin callback into its opener only when current realm mapping really makes both windows same physical origin. Never merge tainted/nested realms to make a callback work.

Links and named forms must eventually use the same managed-target registry. A targeted POST is captured and replayed with original bytes through the existing transaction machinery, at most once; do not emulate it by GET. First ship/testing milestones can separate scripted GET OAuth from form-target support, but do not label the latter supported before its tests pass.

## SessionStorage: exact current-origin clone, then independent state

### Why a separate adapter is needed

Native sibling iframes of the same physical origin share the real top-level page's sessionStorage. That is not the native new-window model. An OAuth callback deleting its own state must not delete the opener's copy. The existing native-storage bypass must not be reused unchanged for managed logical tabs.

Add a client-only sessionStorage adapter for Browser Lite content; leave localStorage behavior unchanged. Do not send storage values to root, the control APIs, another original origin or the trusted UI. This adapter provides logical-tab semantics, not an authorization boundary between scripts that are already same-origin.

### Namespace, synchronous API and durability

Namespace by `(UI instance ID, logical tab ID, actual physical realm)`. UI instance ID is a fresh trusted-UI lifetime identifier; logical tab ID stays stable across document navigation epochs. The physical realm, including its taint/context separation, remains the real native storage boundary. Never replace it with only a registrable domain or original-site string.

Use the captured native sessionStorage of that physical origin as backing. Each namespace contains a versioned, ordered string-key/string-value map in one serialized record. Read the current backing record for each operation and commit mutations synchronously using native setItem; this gives same-origin frames in one logical tab immediate consistency without awaiting messages, and preserves data across A -> B -> A navigation and reload. A failed native write leaves the previous record intact and surfaces QuotaExceededError; no silent fallback to shared storage.

Expose a stable Storage-compatible object per Document: length/key/getItem/setItem/removeItem/clear, property access/deletion/enumeration, string coercion and standard receiver checks. Capture native methods before wrapping. `Storage.prototype.getItem.call(managedStorage, key)` must work through a receiver-aware shim; calls with native localStorage still delegate to the captured native method. Prefer adapting the existing HH StorageWrapper mechanics if its caching, internal exposure and unload-only persistence can be avoided; do not blindly enable its shared top-same-domain wrapper.

Same-original-origin descendant frames within a logical tab use that tab's namespace only where existing physical realm policy permits. Different logical tabs/popup IDs get separate namespaces. Storage events go only to other same-namespace Documents, not the mutator, another tab or another physical realm; their URL/storageArea fields must reflect the virtual Document and its adapter. Internal backing-record events must not leak serialized namespace data through the public event stream.

The native quota is physically shared by these virtual namespaces, unlike independent top-level tabs. Keep atomic failures explicit and include quota behavior in compatibility tests; do not claim identical per-tab quota capacity.

### Clone timing and independence

1. Reserve the same-physical-origin blank slot with its own empty namespace and installed adapter.
2. During `window.open`, before returning the handle or running site-authored blank-page code, synchronously snapshot the opener's current namespace using captured adapter operations.
3. Write a distinct destination namespace record atomically, even when the source map is empty. Mark initialization complete so a later visit cannot lazily re-copy a changed parent.
4. Only after successful initialization expose the handle and proceed with claim/navigation. Copy failure cancels the slot and reports failure; do not fall back to sharing the parent map.
5. Subsequent mutations, clear and delete affect only their respective maps. A -> B -> A returns to the popup's A copy, not the opener's then-current A state.
6. Existing named-popup reuse does not clone again. Noopener/noreferrer and independent toolbar-created tabs start with fresh storage. New same-origin descendants of the popup share the popup namespace.

Lifecycle cleanup removes only that UI instance/logical tab's records when reachable at the same physical origin. On other origins, retain an explicit namespace tombstone/expiry strategy for bounded eventual cleanup; do not clear an origin's entire native sessionStorage. Do not change storage identity halfway through a running legacy Document. The adapter activates before original scripts in new Documents; there is no reliable attribution of old shared raw keys to individual tabs, so do not invent a cross-tab migration.

### Explicit multi-origin cloning boundary for review

Native auxiliary-window creation can copy the opener's entire multi-origin session-storage shed. The above synchronous algorithm precisely clones the opener's **current physical realm**, which covers the initial A -> B -> A login fixture. It does not claim atomic cloning of every origin previously visited by the opener, or an independently active cross-origin child.

A cannot synchronously read B's native storage without violating SOP. Copying B on its first later visit from the then-current parent, or sharing a parent namespace until first write, is not an opening-time snapshot and is rejected. A broader design would require a separately reviewed multi-origin snapshot coordination mechanism; asynchronous snapshots must not be advertised as an atomic native clone. Claude review must explicitly accept this bounded first phase or require that extension before the relevant multi-origin workflows are declared supported.

## Phase 3: acceptance and release decision

Run each fixture in Chromium and mobile-emulated WebKit, then test actual available login workflows without recording credentials or tokens. Owned fixtures prove behavior, not a claim that every identity provider permits embedding.

1. Synchronous real handle identity, blank-page write, captured Location assignment, actual provider navigation, same-origin callback and close.
2. A -> B -> A callbacks through both `opener.postMessage` and `opener.callback()`, including wrong targetOrigin and navigation races.
3. Storage source snapshot visible immediately, subsequent parent and popup mutations independent, callback deletion leaves parent state intact, reload/return preserves child state, named reuse does not re-clone, noopener starts empty.
4. Storage key coercion, reserved names, enumeration, prototype method calls, quota failure and same-tab storage events; negative tests for cross-tab/cross-realm visibility. Add a multi-origin-shed example that remains explicitly outside first-phase conformance rather than passing through shared state.
5. Named reuse, _blank, features, close from each permitted party, opener navigation/closure, timeout, missing spare, repeated genuine clicks and automatic popup rejection.
6. Lost reserve/claim/navigate responses retry the same operation; one slot/one upstream navigation; old epoch, another lease/device, forged relation and replayed binding messages fail.
7. Native cross-origin reads remain denied; unrelated tabs cannot acquire navigation authority; stale slot indices never identify replacement content; initial cross-site cookie and redirect-taint positive/negative tests.
8. Targeted form POST preserves bytes, Origin/Referer policy and at-most-once dispatch when that subphase is implemented.
9. A nested third-party iframe's unregistered open request is not promoted to a main opener. Its eventual support requires verified descendant WindowProxy registration and existing tainted-context policy, not a page-supplied context token.
10. No new native top-level windows; Vibetop shell URL/history unchanged; no terminal/xpra lifecycle changes; normal history and optional-chain regression suites remain green.

Implement in order: lifecycle/blank fixture -> storage adapter and synchronous clone -> location/opener/navigation -> callback and adversarial matrix -> targeted forms and nested-opener extension. Obtain actual Claude Code agreement on this plan first. Each milestone is a testable increment; do not announce complete native-popup equivalence or general login compatibility merely because the first fixture passes.

# Dedicated worker location and generated-code next increments

Astra supplied this read-only plan on 2026-10-13; implementation awaits actual
Claude review. Do not infer approval from the prior module-worker reviews.

## First increment: native WorkerLocation adapter

Preserve the real WorkerLocation object. Capture native prototype getters and
toString before page code, call them first for brand validation, then expose the
frozen original entry URL fields. Astra native probes found all relevant getters
configurable in current Chromium and pinned WebKit. Preserve identity,
instanceof, read-only writes, extracted getters and illegal receiver behavior.

Before installing, change every engine-internal physical URL read (HH getLocation,
resolveUrl, origin mapping and runtime context validation) to captured native
getters. Otherwise virtual location can cause recursive or wrong-host routing.
The read inventory is: vtMapWorkerOrigin, WebSocket base calculation, runtime
context validation, HH getLocation/resolveUrl/forceLocation, and getAjaxProxyUrl's
sameOriginCheck used for CORS/credentials. Add a static regression that fails for
new unclassified self.location reads in the patched worker bundle. Only wrap
WorkerLocation.prototype.toString; never Function.prototype.toString globally.
Getter source-string fidelity may be recorded as a deviation.

Network entries derive their original URL from the actual proxy entry after
redirects. Uploaded Blob entries need original Blob identity passed through the
preparation flow and stored as validated, self-asserted WorkerStore metadata; do not fabricate it
from the creator origin. Validate Blob metadata as a blob URL with the original
realm origin and UUID shape, JSON-encode it, and carry it through the existing
__getWorkerSettings$ channel. It is asserted by the same site realm, not a trusted
authority. import.meta.url remains an independent AST concern.

Test all URL fields, stringification, destructuring, native brand and descriptors,
strict/non-strict writes, redirects and Blob identity in both engines, alongside
fetch/XHR/import/socket routing regressions, relative sockets in Blob workers
and relative nested workers. ErrorEvent.filename and error.stack may still expose
physical URLs and must remain documented deviations. SharedWorker is explicitly
denied by server admission; this plan targets DedicatedWorker only.

## Later increment: generated code

Build a synchronous worker-safe processor from pinned parser/transform sources.
Do not introduce a server round trip or replace direct eval with an interpreter
or wrapper that loses lexical scope. Separate Script, FunctionBody and
async/generator modes; validate exact input, parameter/body conversion order,
completion values and native exceptions. Non-string eval returns unchanged.
Native-differential probes must establish import bases for direct/indirect eval
and each Function constructor from entries and dependencies.

The current policy intentionally rejects eval/Function/string timers. Real native
support requires an explicit reviewed change to worker string compilation policy;
adding a processor alone is insufficient. Keep proxy-only script/connect and
unsupported-scheme restrictions. JS helpers are not a security boundary because
site code can overwrite them; browser CSP and server authorization remain that
boundary. This is not yet full upstream CSP fidelity.

Astra initially suggested worker-src none, but actual WebKit module tests show
it blocks ordinary module dependencies. Current policy instead admits only proxy
worker hosts and applies the policy to all classic/module/uploaded descendants.
A module-to-classic-child probe proves the child cannot compile unprocessed code.
Do not restore worker-src none without resolving that engine behavior.

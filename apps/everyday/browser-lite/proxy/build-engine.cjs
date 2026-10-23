'use strict';
// Build the pinned MIT Rammerhead sources with narrowly checked compatibility
// patches. Refuse changed upstream anchors instead of silently shipping a partial
// patch after a dependency update.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.dirname(require.resolve('rammerhead/package.json'));
const source = path.join(root, 'src/build.js');
let build = fs.readFileSync(source, 'utf8');
function replaceOne(haystack, needle, replacement) {
  if (haystack.split(needle).length !== 2) throw new Error('Upstream patch anchor changed: ' + needle);
  return haystack.replace(needle, () => replacement);
}
build = replaceOne(build, "require('dotenv-flow').config();", '');
// Uglify's default directive compression drops function-local "use strict" and
// changes an extracted host-method wrapper's receiver from undefined to Window.
build = replaceOne(build,
  "UglifyJS.minify(fs.readFileSync(path.join(__dirname, './client', fileName), 'utf8'))",
  "UglifyJS.minify(fs.readFileSync(path.join(__dirname, './client', fileName), 'utf8'), {compress:{directives:false}})");
build = replaceOne(build,
  'while (w !== w.top && w.parent["%hammerhead"]) w = w.parent;',
  'while (w !== w.top) { try { if (!w.parent["%hammerhead%"]) break; w = w.parent; } catch(e) { break; } }');
// Bootstrap must use native parent/top before the global engine substitutions.
// Otherwise a nested page reads rammerheadParent before assigning it.
build = replaceOne(build,
  'window.rammerheadParent = window.rammerheadTop === window ? window : window.parent;',
  'window.rammerheadParent = window.rammerheadTop === window ? window : window["parent"];');
build = replaceOne(build,
  'var i=0,w=window; while (w !== window.top) {i++;w=w.parent}',
  'var i=0,w=window.rammerheadTop; while (w !== window["top"]) {i++;w=w.parent}');
build = replaceOne(build,
  '        // disable saving to localStorage as we are using a completely different implementation',
  `        // WebKit exposes some CSS properties without own descriptors.
        .replace('if (testDivDescriptor.configurable)', 'if (testDivDescriptor && testDivDescriptor.configurable)')
        .replace('!testDivDescriptor.configurable || !propertySetterIsCalled_1', '!testDivDescriptor || !testDivDescriptor.configurable || !propertySetterIsCalled_1')
        // Real-origin mode uses browser-native storage, already profile-separated.
        .replace('this.storageSandbox.attach(window);', 'if (!window.vibetopNativeOriginStorage) this.storageSandbox.attach(window);')
        .replace('this.storageSandbox.dispose();', 'if (!window.vibetopNativeOriginStorage) this.storageSandbox.dispose();')
        // about:blank/srcdoc children are initialized from a task template and
        // never request our bridge script; inherit the parent's native storage.
        .replace('contentWindow.eval.call(contentWindow, taskScript);', 'if (this.window.vibetopNativeOriginStorage) {contentWindow.vibetopNativeOriginStorage = true; contentWindow.vibetopMessageOrigin = this.window.vibetopMessageOrigin;} contentWindow.eval.call(contentWindow, taskScript);')
        // TestCafe's upload emulation serializes files over a control RPC. Real
        // browser file inputs and FormData already stream the original bytes.
        .replace('this.upload.attach(window);', 'if (!window.vibetopNativeOriginStorage) this.upload.attach(window);')
        .replace('this.overrideFilesInHTMLInputElement();', 'if (!window.vibetopNativeOriginStorage) this.overrideFilesInHTMLInputElement();')
        .replace('this.overrideValueInHTMLInputElement();', 'if (!window.vibetopNativeOriginStorage) this.overrideValueInHTMLInputElement();')
        .replace('this.overrideRequiredInHTMLInputElement();', 'if (!window.vibetopNativeOriginStorage) this.overrideRequiredInHTMLInputElement();')
        .replace('ElementSandbox.prototype.addFileInputInfo = function (el) {', 'ElementSandbox.prototype.addFileInputInfo = function (el) { if (window.vibetopNativeOriginStorage) return;')
        // WebKit reports cross-origin frameElement probes even when caught.
        .replace('function getFrameElement(win) {', 'function getFrameElement(win) { if (win === window.rammerheadTop) return null;')
        .replace('documentLocation = nativeMethods.contentDocumentGetter.call(iframe).location.href;', 'var frameUrl = nativeMethods.getAttribute.call(iframe, "src"); if (!frameUrl || new URL(frameUrl, window.location.href).origin === window.location.origin) { var frameDoc = nativeMethods.contentDocumentGetter.call(iframe); documentLocation = frameDoc && frameDoc.location.href; }')
        // The inline iframe bootstraps run in a fresh srcdoc/child document before
        // its engine exists, so rammerheadParent is still undefined there. This
        // runs after the window.parent substitution and restores the native parent.
        // Otherwise the child's scripts call an undefined __get$, and obfuscated
        // retry loops (Cloudflare's jsd on x.com) spin forever and hang the page.
        .replace('parentHammerhead = window.rammerheadParent[', 'parentHammerhead = window.parent[')
        .replace('sandbox = window.rammerheadParent[', 'sandbox = window.parent[')
        // disable saving to localStorage as we are using a completely different implementation`);
// Apply only the storage wrapper opt-out to the source; retain ordinary engine
// behavior for diagnostic baseline pages which do not enable real-origin mode.
const clientFile = path.join(root, 'src/client/rammerhead.js');
let client = fs.readFileSync(clientFile, 'utf8');
const anchor = '        fixCrossWindowLocalStorage();';
if (client.includes(anchor)) {
  client = replaceOne(client, anchor, '        if (!window.vibetopNativeOriginStorage) fixCrossWindowLocalStorage();');
  fs.writeFileSync(clientFile, client);
}
const storageAnchor = '    function fixCrossWindowLocalStorage() {';
if (!client.includes('if (!hammerhead.storages) return;')) {
  client = replaceOne(client, storageAnchor, storageAnchor + '\n        if (!hammerhead.storages) return;');
  fs.writeFileSync(clientFile, client);
}
const shuffleAnchor = '    function addUrlShuffling() {';
if (!client.includes('if (window.vibetopNativeOriginStorage) return;')) {
  client = replaceOne(client, shuffleAnchor, shuffleAnchor + '\n        if (window.vibetopNativeOriginStorage) return;');
  fs.writeFileSync(clientFile, client);
}
// Each URL property read (link.href, img.src) builds a proxy URL and parses it
// twice, ~50 us. Vite's preload helper reads every <link>'s href for every
// dependency of every dynamic import: Yahoo Finance spent over 1 s of its
// page load on it, and its search box missed its start-up. For an absolute
// stored value the result depends on that value only, so cache it.
const getterAnchor = `                const originalGet = desc.get;
                desc.get = function () {
                    return urlRewrite(originalGet.call(this));
                };`;
if (!client.includes('vtUrlGetterCache')) {
  client = replaceOne(client, getterAnchor, `                const originalGet = desc.get;
                const vtUrlGetterCache = new Map();
                desc.get = function () {
                    const raw = hammerhead.nativeMethods.getAttribute.call(this, attr);
                    if (typeof raw !== 'string' || !/^https?:\\/\\//i.test(raw)) return urlRewrite(originalGet.call(this));
                    let value = vtUrlGetterCache.get(raw);
                    if (value === undefined) {
                        value = urlRewrite(originalGet.call(this));
                        if (vtUrlGetterCache.size >= 4096) vtUrlGetterCache.clear();
                        vtUrlGetterCache.set(raw, value);
                    }
                    return value;
                };`);
  fs.writeFileSync(clientFile, client);
}
// Test automation normally accepts invalid certificates. A user browser must
// authenticate the upstream TLS endpoint, including connections through CONNECT.
const engineRequire = Module.createRequire(path.join(root, 'package.json'));
// A processed module contains resolved origin/context URLs. Reusing it under
// another source URL/context and replacing all import hosts corrupts isolation.
const cacheFile=path.join(root,'src/util/addJSDiskCache.js');
let cacheSource=fs.readFileSync(cacheFile,'utf8');
if(!cacheSource.includes('const cacheKey = ctx.req.vtCacheKey')) {
  cacheSource=replaceOne(cacheSource,'    let processedScript = await cacheGet(script);',
    "    const cacheKey = ctx.req.vtCacheKey ? ctx.req.vtCacheKey + '\\0' + script : script;\n    let processedScript = await cacheGet(cacheKey);");
  cacheSource=replaceOne(cacheSource,'await cacheSet(script, processedScript);','await cacheSet(cacheKey, processedScript);');
  cacheSource=replaceOne(cacheSource,'} else processedScript = updateScriptImportUrls(',
    '} else if (!ctx.req.vtCacheKey) processedScript = updateScriptImportUrls(');
  fs.writeFileSync(cacheFile,cacheSource);
}
cacheSource=fs.readFileSync(cacheFile,'utf8');
if(!cacheSource.includes('ctx.req.vtProcessModule ?')) {
  cacheSource=replaceOne(cacheSource,'processedScript = processScript(',
    'processedScript = ctx.req.vtProcessModule ? ctx.req.vtProcessModule(script, urlReplacer) : processScript(');
  fs.writeFileSync(cacheFile,cacheSource);
}
// The cache key omits the tab token (script-cache-key.cjs): store it as a
// placeholder and give each hit the requesting tab's own token.
cacheSource=fs.readFileSync(cacheFile,'utf8');
if(!cacheSource.includes('vtCacheTabMark')) {
  cacheSource=replaceOne(cacheSource,'    let processedScript = await cacheGet(cacheKey);',
    "    const vtTab = ctx.req.vtCacheTab && globalThis.vtCacheTabMark ? ctx.req.vtCacheTab : '';\n    let processedScript = await cacheGet(cacheKey);\n    if (processedScript && vtTab) processedScript = processedScript.split(globalThis.vtCacheTabMark).join(vtTab);");
  cacheSource=replaceOne(cacheSource,'await cacheSet(cacheKey, processedScript);',
    'await cacheSet(cacheKey, vtTab ? processedScript.split(vtTab).join(globalThis.vtCacheTabMark) : processedScript);');
  fs.writeFileSync(cacheFile,cacheSource);
}
// Large scripts are rewritten on worker threads when the runtime installed
// them (script-workers.cjs); null means "do it here", as before.
cacheSource=fs.readFileSync(cacheFile,'utf8');
if(!cacheSource.includes('globalThis.vtProcessScriptAsync')) {
  cacheSource=replaceOne(cacheSource,'ctx.req.vtProcessModule(script, urlReplacer) : processScript(',
    'ctx.req.vtProcessModule(script, urlReplacer) : (globalThis.vtProcessScriptAsync && await globalThis.vtProcessScriptAsync(script, urlReplacer, ctx.destRes.headers[BUILTIN_HEADERS.serviceWorkerAllowed], ctx.nativeAutomation)) || processScript(');
  fs.writeFileSync(cacheFile,cacheSource);
}
require('./worker-module-patch.cjs').patchWorkerModuleKind(engineRequire);
require('./modern-script-patch.cjs').patchModernScripts(engineRequire);
require('./optional-chain-patch.cjs').patchOptionalChains(engineRequire);
require('./worker-origin-patch.cjs').patchWorkerOrigins(engineRequire);
require('./hls-patch.cjs').patchHlsPlaylists(engineRequire);
require('./youtube-adblock.cjs').patchYoutubeAds(engineRequire);
require('./template-patch.cjs').patchTemplates(engineRequire);
require('./srcset-patch.cjs').patchSrcset(engineRequire);
require('./svg-href-patch.cjs').patchSvgHref(engineRequire);
require('./realm-root-url-patch.cjs').patchRealmRootUrls(engineRequire);
require('./top-level-patch.cjs').patchTopLevel(engineRequire);
require('./popup-patch.cjs').patchPopupMethods(engineRequire);
require('./zstd-patch.cjs').patchZstd(engineRequire);
require('./cookie-perf-patch.cjs').patchClientCookiePerformance(engineRequire);
// Rammerhead's in-memory script cache dropped the lookup result (no return),
// so every script was rewritten on every load. ChatGPT's 18 MB of chunks
// cost ~2 s of single-threaded rewriting each and stalled the whole proxy.
{
  const cacheClass=engineRequire.resolve('rammerhead/src/classes/RammerheadJSMemCache.js');
  let code=fs.readFileSync(cacheClass,'utf8');
  if(!code.includes('return this.lru.get(key);'))fs.writeFileSync(cacheClass,replaceOne(code,'    this.lru.get(key);','    return this.lru.get(key);'));
}
// Rammerhead's last-resort handler rethrows any non-network error, so one
// unexpected exception in a single request killed the runtime and every tab
// (and repeated crashes tripped systemd's start limit). Log and keep serving;
// only a burst of failures, a sign of a broken process, still exits.
{
  const guard=engineRequire.resolve('rammerhead/src/util/addMoreErrorGuards.js');
  let code=fs.readFileSync(guard,'utf8');
  if(!code.includes('vtRecentErrors')) {
    code=replaceOne(code,"process.on('uncaughtException', (err) => {","const vtRecentErrors = [];\nprocess.on('uncaughtException', (err) => {");
    code=replaceOne(code,"        console.error('About to throw: ' + err.message);\n        throw err;",
      "        console.error('Recovered from an unexpected error: ' + String(err && err.message).slice(0, 200) + ' ' + String(err && err.stack || '').split('\\n')[1]);\n"+
      "        const now = Date.now();\n        while (vtRecentErrors.length && now - vtRecentErrors[0] > 60000) vtRecentErrors.shift();\n"+
      "        vtRecentErrors.push(now);\n        if (vtRecentErrors.length > 20) { console.error('Too many unexpected errors; exiting'); process.exit(70); }");
    fs.writeFileSync(guard,code);
  }
}
const {patchCookieWire,hardenCookieWire,boundSyncCookieLifetime} = require('./cookie-wire-patch.cjs');
for (const [file, isClient] of [['client/hammerhead.js',true],['utils/cookie.js',false]]) {
  const target = engineRequire.resolve('testcafe-hammerhead/lib/' + file);
  const code = fs.readFileSync(target,'utf8');
  fs.writeFileSync(target,boundSyncCookieLifetime(hardenCookieWire(patchCookieWire(code,isClient),isClient),isClient));
}
for (const file of ['request-pipeline/request-options.js', 'request-pipeline/destination-request/agent.js']) {
  const target = engineRequire.resolve('testcafe-hammerhead/lib/' + file);
  let code = fs.readFileSync(target, 'utf8');
  const from = file.endsWith('request-options.js') ? 'this.rejectUnauthorized = false;' : 'rejectUnauthorized: false,';
  const to = from.replace('false', 'true');
  if (!code.includes(to)) { code = replaceOne(code, from, to); fs.writeFileSync(target, code); }
}
require('./tunnel-pool-patch.cjs').patchTunnelPool(engineRequire);
// Resolve dependencies using Node, rather than assuming a nested npm layout.
build = build.replace(/path\.join\(__dirname, '\.\.\/node_modules\/testcafe-hammerhead\/([^']+)'\)/g,
  (_match, file) => 'require.resolve(' + JSON.stringify('testcafe-hammerhead/' + file) + ')');
const compiled = new Module(source, module);
compiled.filename = source;
compiled.paths = Module._nodeModulePaths(path.dirname(source));
compiled._compile(build, source);
const builtClient = fs.readFileSync(path.join(root, 'src/client/hammerhead.js'), 'utf8');
for (const needle of ['parentHammerhead = window.parent[', 'sandbox = window.parent['])
  if (builtClient.split(needle).length !== 2) throw new Error('Iframe bootstrap patch missing: ' + needle);
console.log('Built pinned Rammerhead with Vibetop compatibility patches');

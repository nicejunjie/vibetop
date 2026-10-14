'use strict';
// Hammerhead's client cookie sandbox re-syncs every sync cookie on each
// document.cookie read, and each re-applied cookie first probes the native jar
// (write a dummy cookie, read the whole jar, delete it). Pages that poll
// cookies (claude.ai's Datadog RUM) froze the shared renderer for 30s+. Two
// behavior-preserving shortcuts:
// - Once a document's native jar accepts cookies it keeps accepting them, so
//   the probe result is remembered (the size and file: checks still run).
// - A sync whose input (the native cookie string) is byte-identical to the
//   previous sync, under a second ago, would re-apply the same cookies; skip it.
const fs=require('node:fs');
const CANSET_FROM="            return false;\r\n\t        var clientCookie = \"key\".concat(nativeMethods.mathRandom.call(nativeMethods.math), \"=value\");";
const CANSET_TO="            return false;\r\n\t        if (this.vtCookiesWork) return true;\r\n\t        var clientCookie = \"key\".concat(nativeMethods.mathRandom.call(nativeMethods.math), \"=value\");";
const CANSET_END_FROM="        return !documentCookieIsEmpty;";
const CANSET_END_TO="        return this.vtCookiesWork = !documentCookieIsEmpty;";
const SYNC_FROM="CookieSandboxProxyStrategy.prototype.syncCookie = function (gettingCookies) {\r\n\t        if (gettingCookies === void 0) { gettingCookies = false; }\r\n\t        var cookies = nativeMethods.documentCookieGetter.call(this.document);";
const SYNC_TO=SYNC_FROM+"\r\n\t        var vtNow = nativeMethods.dateNow();\r\n\t        if (cookies === this.vtSyncedCookies && vtNow - this.vtSyncedAt < 1000) return;\r\n\t        this.vtSyncedCookies = cookies; this.vtSyncedAt = vtNow;";
function patchSource(code) {
  if(code.includes('this.vtCookiesWork'))return code;
  for(const [from,to] of [[CANSET_FROM,CANSET_TO],[CANSET_END_FROM,CANSET_END_TO],[SYNC_FROM,SYNC_TO]]) {
    if(code.split(from).length!==2)throw new Error('Cookie performance patch anchor changed: '+from.slice(0,60));
    code=code.replace(from,()=>to);
  }
  return code;
}
function patchClientCookiePerformance(engineRequire) {
  const file=engineRequire.resolve('testcafe-hammerhead/lib/client/hammerhead.js');
  fs.writeFileSync(file,patchSource(fs.readFileSync(file,'utf8')));
}
module.exports={patchClientCookiePerformance,patchSource};

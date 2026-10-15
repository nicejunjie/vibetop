'use strict';
// Serialized as a tuple instead of joining untrusted fields with a delimiter.
// A rewritten source embeds its full routing descriptor, including the tab.
// A tab gets a fresh random token on every navigation, so keying on it made
// every reload a cold rewrite. The key omits it (the context, host, type and
// relay stay); the cached source stores it as a placeholder and each hit puts
// back the requesting tab's token (see build-engine.cjs).
function cacheTab(windowId) {
  const tab=String(windowId||'').split('~')[1]||'';
  return /^[A-Za-z0-9_-]{16,}$/.test(tab)?tab:'';
}
function scriptCacheKey({physical,sessionId,windowId,resourceType,charset,destination,relay}) {
  const tab=cacheTab(windowId),stable=tab?String(windowId).split('~').map((part,index)=>index===1?'*':part).join('~'):windowId;
  return JSON.stringify(['vt-script-v3',physical,sessionId,stable||'',resourceType||'',charset||'',destination,relay||'']);
}
module.exports={scriptCacheKey,cacheTab};

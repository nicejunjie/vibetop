'use strict';
// Serialized as a tuple instead of joining untrusted fields with a delimiter.
// A rewritten source embeds its full routing descriptor, including the tab.
function scriptCacheKey({physical,sessionId,windowId,resourceType,charset,destination,relay}) {
  return JSON.stringify(['vt-script-v2',physical,sessionId,windowId||'',resourceType||'',charset||'',destination,relay||'']);
}
module.exports={scriptCacheKey};

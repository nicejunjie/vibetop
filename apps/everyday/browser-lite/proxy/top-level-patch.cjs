'use strict';
// A Browser Lite tab is an iframe inside Lite's UI, so a page saw
// window.top !== window.self, a parent in another origin, and the UI as its
// document.referrer. Sites read that as "embedded" and change: claude.ai
// switches to its embedded mode with no sidebar. A real tab is top-level, so
// emulate it for page code:
// - `x.top` and `x.parent` are instrumented like `location`. For a window in
//   this tab, top is the tab's root page and the root's parent is itself, so
//   page code can no longer reach Lite's UI through them either.
// - document.referrer is '' when the native referrer is not a proxied page
//   (the tab was opened from the UI), as for a typed address.
// The tab root is found natively: walk up while location.ancestorOrigins are
// realms of this user (bl-u<uid>-…, same parent domain). Without
// ancestorOrigins (Firefox) the native values stay.
// Hammerhead's own code is not processed, and its window.top/window.parent
// were already redirected by Rammerhead's build, so the engine is unaffected.
// Bracket access below keeps Rammerhead's `window.top` substitutions off it.
const fs=require('node:fs');
function tabRoot() {
  if (window.vibetopTabRoot !== void 0) return window.vibetopTabRoot;
  var root = null;
  try {
    var here = window["location"], ancestors = here.ancestorOrigins, m = /^(bl-u\d+-)[^.]+(\..+)$/.exec(here.hostname);
    if (ancestors && m) {
      var w = window, i = 0;
      while (i < ancestors.length) {
        var o = String(ancestors[i]);
        if (o.indexOf('https://' + m[1]) !== 0 || o.slice(-m[2].length) !== m[2] || o.slice(8).indexOf('/') !== -1) break;
        w = w["parent"]; i++;
      }
      root = w;
    }
  } catch (e) { root = null; }
  Object.defineProperty(window, 'vibetopTabRoot', {value: root, configurable: true});
  return root;
}
const ACCESSORS=" top: { condition: isWindow, get: function (owner) { var r = vtTabRoot(); return r || owner[\"top\"]; }, set: function (owner, value) { try { owner[\"top\"] = value; } catch (e) {} return value; } },"+
  " parent: { condition: isWindow, get: function (owner) { var r = vtTabRoot(); return r && owner === r ? r : owner[\"parent\"]; }, set: function (owner, value) { owner[\"parent\"] = value; return value; } },";
function patchTopLevel(engineRequire) {
  const lib=name=>engineRequire.resolve('testcafe-hammerhead/lib/'+name);
  const marker='/* vt-top-level */';
  const edit=(code,from,to,file)=>{
    if(code.split(from).length!==2)throw new Error('Top-level patch anchor changed: '+file+': '+JSON.stringify(from));
    return code.replace(from,()=>to);
  };
  const server=lib('processing/script/instrumented.js');
  let code=fs.readFileSync(server,'utf8');
  if(!code.includes(marker)) fs.writeFileSync(server,edit(code,"    'location',\n];","    'location',\n    'top',\n    'parent',\n]; "+marker,server));
  const client=lib('client/hammerhead.js');
  code=fs.readFileSync(client,'utf8');
  if(!code.includes(marker)) {
    code=edit(code,"    'location',\r\n\t];","    'location', 'top', 'parent',\r\n\t]; "+marker+" var vtTabRoot = "+tabRoot.toString().replace(/\n\s*/g,' ')+";",client);
    code=edit(code,'set: PropertyAccessorsInstrumentation._setLocation,\r\n\t        },','set: PropertyAccessorsInstrumentation._setLocation,\r\n\t        },'+ACCESSORS,client);
    code=edit(code,"var referrer = getDestinationUrl(nativeMethods.documentReferrerGetter.call(this));",
      "var vtNativeReferrer = nativeMethods.documentReferrerGetter.call(this); if (vtNativeReferrer && !parseProxyUrl(vtNativeReferrer)) return ''; var referrer = getDestinationUrl(vtNativeReferrer);",client);
    fs.writeFileSync(client,code);
  }
}
module.exports={patchTopLevel,tabRoot};

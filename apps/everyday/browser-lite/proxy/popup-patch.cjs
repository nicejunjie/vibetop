'use strict';
// Popup windows (client-bridge.js): the opener's w.close() and w.focus() must
// reach Browser Lite, but the engine routes only postMessage/replace/assign
// calls through __call$. Add close and focus to the instrumented methods, in
// the server list and the client bundle (the minified bundle is built from it).
const fs=require('node:fs');
function patchPopupMethods(engineRequire) {
  const lib=name=>engineRequire.resolve('testcafe-hammerhead/lib/'+name);
  const marker='/* vt-popup-methods */';
  const edit=(code,from,to,file)=>{
    if(code.split(from).length!==2)throw new Error('Popup patch anchor changed: '+file+': '+JSON.stringify(from));
    return code.replace(from,()=>to);
  };
  const server=lib('processing/script/instrumented.js');
  let code=fs.readFileSync(server,'utf8');
  if(!code.includes(marker))fs.writeFileSync(server,edit(code,"    'assign',\n];","    'assign',\n    'close',\n    'focus',\n]; "+marker,server));
  const client=lib('client/hammerhead.js');
  code=fs.readFileSync(client,'utf8');
  if(!code.includes(marker)) {
    code=edit(code,"    'assign',\r\n\t];","    'assign', 'close', 'focus',\r\n\t]; "+marker,client);
    // __call$ looks every instrumented method up in this table; a missing
    // entry throws. These never apply: the call falls through to the method.
    code=edit(code,"            },\r\n\t        };\r\n\t        if (settings$1.nativeAutomation)",
      "            },\r\n\t        };\r\n\t        this.methodWrappers.close = { condition: function () { return false; }, method: function () {} };\r\n\t        this.methodWrappers.focus = this.methodWrappers.close;\r\n\t        if (settings$1.nativeAutomation)",client);
    fs.writeFileSync(client,code);
  }
}
module.exports={patchPopupMethods};

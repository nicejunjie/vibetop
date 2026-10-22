'use strict';
// parse5 keeps a <template>'s children in `content`, not `childNodes`, so the
// engine's HTML walk never rewrote them. Ad-block-evasion proxies (drivenmove's
// "adproxy") ship their markup in templates and clone it in with native DOM
// methods taken from another frame: every <img> pixel then loaded straight
// from the ad server, bypassing the proxy. Walk template contents too.
const fs=require('node:fs');
function patchTemplates(engineRequire) {
  const file=engineRequire.resolve('testcafe-hammerhead/lib/utils/parse5.js');
  let code=fs.readFileSync(file,'utf8');
  if(code.includes('vt-template-content'))return;
  const from='    if (el.childNodes)\n        el.childNodes.forEach(child => walkElements(child, processor));\n}';
  if(code.split(from).length!==2)throw new Error('Template patch anchor changed: '+file);
  code=code.replace(from,()=>'    if (el.childNodes)\n        el.childNodes.forEach(child => walkElements(child, processor));\n'
    +'    /* vt-template-content */ if (el.content && el.content.childNodes)\n        el.content.childNodes.forEach(child => walkElements(child, processor));\n}');
  fs.writeFileSync(file,code);
}
module.exports={patchTemplates};

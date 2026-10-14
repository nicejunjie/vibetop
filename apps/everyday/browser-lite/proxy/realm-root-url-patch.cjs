'use strict';
// Hammerhead maps a URL that a page resolved against the proxy's own origin
// ("/cdn/x.js" -> https://<realm>/cdn/x.js) back to the site's origin, but it
// compares the URL's port with the proxy port as strings: realms report "443",
// while a parsed https URL has port "". The check never matched, so such URLs
// were proxied with the realm itself as the destination and failed (ChatGPT's
// import.meta.resolve("/cdn/assets/...") chunk loader on iPhone).
const fs=require('node:fs');
const FROM='parsedUrl.port === proxyPort) {';
const TO="(parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80')) === (proxyPort || (proxyServerProtocol === 'https:' ? '443' : '80'))) { /* vt-realm-root-port */";
function patchRealmRootUrls(engineRequire) {
  for(const name of ['client/hammerhead.js','client/worker-hammerhead.js']) {
    const file=engineRequire.resolve('testcafe-hammerhead/lib/'+name);
    const code=fs.readFileSync(file,'utf8');
    if(code.includes('/* vt-realm-root-port */'))continue;
    if(code.split(FROM).length!==2)throw new Error('Realm root URL patch anchor changed: '+file);
    fs.writeFileSync(file,code.replace(FROM,()=>TO));
  }
}
module.exports={patchRealmRootUrls};

'use strict';
const fs = require('node:fs');
const http = require('node:http');
const {BrowserGateway} = require('./gateway.cjs');
const {OriginRegistry} = require('./origin-policy.cjs');
const {RealmOrigins} = require('./realm-origins.cjs');
const {Capabilities} = require('./capability.cjs');
const {createEgressRelay} = require('./egress-relay.cjs');
const {controlError}=require('./control-errors.cjs');
async function main(config) {
  const registry = config.legacyOrigins?new OriginRegistry(config):new RealmOrigins(config);
  if (config.origins && config.legacyOrigins) registry.restore(config.origins);
  const authority = new Capabilities(config);
  const relay = await createEgressRelay(config.egressSocket,config.egressSecret);
  // Rewrite large scripts off the request thread (script-workers.cjs).
  const {engineRequire}=require('./engine.cjs');
  globalThis.vtProcessScriptAsync=require('./script-workers.cjs').createScriptWorkers({
    processPath:engineRequire.resolve('testcafe-hammerhead/lib/processing/script/index.js'),
    size:Math.max(1,Math.min(4,require('node:os').availableParallelism()-1))});
  const gateway = new BrowserGateway({registry,authority,externalProxy:relay.url,parentOrigin:config.parentOrigin,cookieFile:config.cookieFile,
    engineSessionId:config.engineSessionId,relayCapability:config.relayCapability,
    ingressIdentity:config.ingressIdentity,trustedAncestors:config.trustedAncestors});
  if(config.ingressIdentity) {
    if(process.env.LISTEN_FDS!=='1'||Number(process.env.LISTEN_PID)!==process.pid)throw new Error('Root-owned ingress socket is required');
    await gateway.listen({fd:3});
  } else await gateway.listen(config.proxySocket);
  const control = http.createServer(async (req,res) => {
    res.setHeader('Content-Type','application/json');
    let body;
    try {
      if (req.method !== 'POST' || !['/open','/approve','/close','/heartbeat','/revoke-lease','/logins','/tabs','/shortcuts','/prefs'].includes(req.url)) { res.writeHead(404);res.end('{}');return; }
      let size=0;const chunks=[];
      for await (const chunk of req) {
        size+=chunk.length;
        // An "open" may carry one site's logins from the full Browser.
        if (size > (['/open','/logins'].includes(req.url) ? 160 * 1024 : req.url==='/tabs' ? 96 * 1024 : req.url==='/shortcuts' ? 20 * 1024 : req.url==='/prefs' ? 4 * 1024 : 8192)) { res.writeHead(413);res.end('{}');return; }
        chunks.push(chunk);
      }
      body = JSON.parse(Buffer.concat(chunks));
      res.end(JSON.stringify(gateway.control(req.url.slice(1),body)));
    } catch(error) { res.writeHead(409);res.end(JSON.stringify(controlError(error,body))); }
  });
  control.requestTimeout = 15000;
  // Private user-owned control directory; remove only the stale socket name,
  // never follow or open it. systemd retains the separate root ingress socket.
  try{fs.unlinkSync(config.controlSocket);}catch(error){if(error.code!=='ENOENT')throw error;}
  await new Promise((resolve,reject)=>{
    control.once('error',reject);control.listen(config.controlSocket,resolve);
  });
  fs.chmodSync(config.controlSocket,0o600);
  console.log('Browser proxy ready');
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal,async()=>{
    control.closeAllConnections();control.close();await gateway.close();await relay.close();process.exit();
  });
}
if (require.main === module) main(JSON.parse(fs.readFileSync(process.argv[2],'utf8')))
  .catch(error=>{console.error(error.message);process.exit(1)});
module.exports = {main};

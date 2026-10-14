'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {hammerhead}=require('./engine.cjs');
const {BrowserGateway}=require('./gateway.cjs');
const {RealmOrigins}=require('./realm-origins.cjs');
test('unusual redirect and link targets never throw out of URL mapping',async()=>{
  const registry=new RealmOrigins({uid:1000,profile:'a'.repeat(32),secret:'test',domain:'realms.proxy.example.com'});
  const identity={uid:1000,profile:'a'.repeat(32),epoch:1};
  const gateway=new BrowserGateway({registry,ingressIdentity:identity,engineSessionId:'stableTestEngine',
    externalProxy:'http://browser:secret@127.0.0.1:9',parentOrigin:'https://ui.proxy.example.com'});
  const urls=hammerhead('utils/url');
  const lease={...identity,lease:'b'.repeat(32),relay:'test.relay',expires:Math.floor(Date.now()/1000)+60};
  const map=target=>registry.scope.run({authorization:lease},()=>urls.getProxyUrl(target,{sessionId:gateway.session.id}));
  // Booking's App Store redirect: other schemes pass through untouched.
  assert.equal(map('itms-appss://apps.apple.com/app/id367003839'),'itms-appss://apps.apple.com/app/id367003839');
  // Embedded credentials are dropped, not fatal.
  const stripped=map('https://user:pass@example.com/path');
  assert.ok(stripped.includes('https://example.com/path') && !stripped.includes('user:pass'),stripped);
  // Garbage maps to a blank page instead of throwing.
  assert.ok(map('https://[bad').includes('about:blank'));
  assert.ok(map('https://example.com/ok').includes('realms.proxy.example.com'));
  await gateway.close();
});

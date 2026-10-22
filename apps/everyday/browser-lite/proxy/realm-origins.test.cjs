'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {RealmOrigins}=require('./realm-origins.cjs');
const {mainContext}=require('./realm-policy.cjs');
test('simultaneous page rewrites preserve each asynchronous document context',async()=>{
 const registry=new RealmOrigins({uid:1000,profile:'a'.repeat(32),secret:'test',domain:'proxy.example.com'});
 const a=registry.map('https://a.example',{context:mainContext('https://a.example')});
 const b=registry.map('https://b.example',{context:mainContext('https://b.example')});
 const results=await Promise.all([a,b].map(record=>registry.scope.run({req:{vtRealm:record}},async()=>{
  await new Promise(resolve=>setImmediate(resolve));return registry.map('https://cdn.example/style.css');
 })));
 assert.notEqual(results[0].physical,results[1].physical);
 assert.equal(results[0].context.documentOrigin,'https://a.example');
 assert.equal(results[1].context.documentOrigin,'https://b.example');
 const child=registry.scope.run({req:{vtRealm:a}},()=>registry.map('https://b.example',{resourceType:'i'}));
 assert.equal(child.resourceOnly,false);assert.equal(child.context.tainted,true);
});
test('simultaneous device leases never use a shared mutable relay token',async()=>{
 const registry=new RealmOrigins({uid:1000,profile:'a'.repeat(32),secret:'test',domain:'proxy.example.com'});
 const mapped=await Promise.all(['device-a.token','device-b.token'].map(relay=>registry.scope.run({authorization:{relay}},async()=>{
  await new Promise(resolve=>setImmediate(resolve));return registry.map('https://a.example');
 })));
 assert.equal(mapped[0].physical,mapped[1].physical);
 assert.equal(mapped[0].windowId.split('~')[2],'device-a.token');assert.equal(mapped[1].windowId.split('~')[2],'device-b.token');
});
test('module mapping freezes graph identity across relay renewal and CDN origins',async()=>{
 const registry=new RealmOrigins({uid:1000,profile:'a'.repeat(32),secret:'test',domain:'proxy.example.com'});
 registry.relayCapability='original.relay';
 const owner=registry.map('https://a.example');
 const windowId=owner.windowId.replace('~~','~tab-a~');
 const resourceType=require('./engine.cjs').hammerhead('utils/url').getResourceTypeString({isScript:true,isWorkerModule:true});
 const results=await Promise.all(['renewed-a.relay','renewed-b.relay'].map(vtRelayCapability=>registry.scope.run({req:{vtRealm:owner,vtWindowId:windowId,vtRelayCapability}},async()=>{
  await new Promise(resolve=>setImmediate(resolve));
  return [registry.map('https://cdn.example/dependency.js',{resourceType}),registry.map('https://a.example/redirect.js',{resourceType})];
 })));
 for(const mappings of results)for(const mapped of mappings)assert.equal(mapped.windowId,windowId);
 const other=registry.map('https://b.example',{context:mainContext('https://b.example')});
 assert.throws(()=>registry.scope.run({req:{vtRealm:other}},()=>registry.map('https://cdn.example',{resourceType,windowId})),/Invalid worker module context/);
 for(const invalid of ['',owner.windowId,windowId+'~extra'])
  assert.throws(()=>registry.scope.run({req:{vtRealm:owner}},()=>registry.map('https://cdn.example',{resourceType,windowId:invalid})),/Invalid worker module context/);
});
test('invalid module tuples leave no registry records and classic mapping renews relay',()=>{
 const registry=new RealmOrigins({uid:1000,profile:'a'.repeat(32),secret:'test',domain:'proxy.example.com'});
 registry.relayCapability='old.relay';const owner=registry.map('https://a.example');
 const context=owner.windowId.split('~')[0],incoming=context+'~tab-a~old.relay';
 const kind=require('./engine.cjs').hammerhead('utils/url').getResourceTypeString({isScript:true,isWorkerModule:true});
 registry.scope.run({req:{vtRealm:owner,vtWindowId:incoming,vtRelayCapability:'new.relay'}},()=>{
  const before=registry.realms.records.size;
  for(const windowId of [context+'~tab-a~',context+'~tab!bad~relay',context+'~tab-a~bad/relay'])
   assert.throws(()=>registry.map('https://never.example',{resourceType:kind,windowId}),/Invalid worker module context/);
  for(const resourceType of ['m','sma','smi'])assert.throws(()=>registry.map('https://never.example',{resourceType,windowId:incoming}),/Invalid worker module context/);
  assert.equal(registry.realms.records.size,before);
  assert.equal(registry.map('https://cdn.example',{resourceType:kind,windowId:context+'~explicit~old.relay'}).windowId,context+'~explicit~old.relay');
  assert.equal(registry.map('https://cdn.example',{resourceType:'s'}).windowId,context+'~tab-a~new.relay');
 });
});

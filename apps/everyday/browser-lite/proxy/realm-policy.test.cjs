'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {RealmRegistry,mainContext,childContext,authorizeResource,authorizeChild,cookieContext}=require('./realm-policy.cjs');
const options={uid:1000,profile:'a'.repeat(32),secret:'secret',domain:'proxy.example.com'};
const A='https://a.example',B='https://b.example';
test('hypothetical message destinations do not store browsing history or consume realm capacity',()=>{
 const r=new RealmRegistry({...options,maxRecords:1}),a=r.register(A,mainContext(A));
 for(let i=0;i<1000;i++) {
  const origin=`https://target-${i}.example`,context=childContext(a.context,origin);
  const target=r.describe(origin,context);
  assert.equal(target.origin,origin);assert.equal(target.resourceOnly,false);
  assert.equal(r.original(target.physical),null);
 }
 assert.equal(r.records.size,1);
 assert.equal(r.describe(A,a.context).physical,a.physical);
});
test('CSS keeps the owning document context, while a foreign iframe taints descendants',()=>{
 const r=new RealmRegistry(options),a=r.register(A,mainContext(A));
 const css=r.register(B,a.context),image=r.register(A,css.context);
 assert.equal(css.resourceOnly,true);assert.equal(image.physical,a.physical);
 assert.equal(authorizeResource(css,image),true);assert.equal(cookieContext(image),'strict');
 const bframe=r.register(B,childContext(a.context,B));
 const aframe=r.register(A,childContext(bframe.context,A));
 assert.equal(authorizeChild(a,bframe),true);assert.equal(cookieContext(aframe),'none');
 assert.notEqual(bframe.physical,css.physical);assert.notEqual(aframe.physical,a.physical);
});
test('a cross-site child cannot launder privilege through first-party CSS or copied context tokens',()=>{
 const r=new RealmRegistry(options),a=r.register(A,mainContext(A));
 const b=r.register(B,childContext(a.context,B)),topB=r.register(B,mainContext(B));
 const css=r.register('https://cdn.example',topB.context);
 assert.equal(authorizeResource(b,topB),false);assert.equal(authorizeResource(b,css),false);
 assert.equal(authorizeChild(b,topB),false);
 const copied=r.recover(new URL(css.physical).host,css.origin,r.contextToken(topB.context));
 assert.equal(authorizeResource(b,copied),false);
 assert.equal(authorizeChild(css,r.register(A,childContext(css.context,A))),false);
});
test('same-origin CSS and workers reuse document origin and context survives restart',()=>{
 const r=new RealmRegistry(options),a=r.register(A,mainContext(A));
 assert.equal(r.register(A+'/worker.js',a.context).physical,a.physical);
 const fresh=new RealmRegistry(options);
 assert.equal(fresh.recover(new URL(a.physical).host,A,r.contextToken(a.context)).physical,a.physical);
 assert.throws(()=>fresh.recover(new URL(a.physical).host,B,r.contextToken(a.context)));
 assert.equal(fresh.records.size,1);
 assert.throws(()=>fresh.readContext(r.contextToken(a.context)+'x'));
 const other=new RealmRegistry({...options,profile:'b'.repeat(32)});
 assert.throws(()=>other.readContext(r.contextToken(a.context)));
});
test('origin-only source proof survives restart and a partial unacknowledged append',()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'vt-realms-')),stateFile=path.join(directory,'hosts.jsonl');
 try {
  const r=new RealmRegistry({...options,stateFile}),a=r.register(A,mainContext(A));
  const css=r.register(B,a.context);
  fs.appendFileSync(stateFile,'{"origin":"unfinished');
  const restored=new RealmRegistry({...options,stateFile});
  assert.equal(authorizeResource(restored.original(css.physical),restored.original(a.physical)),true);
  restored.register('https://third.example',a.context);
  assert.equal(new RealmRegistry({...options,stateFile}).records.size,3);
  assert.equal(fs.statSync(stateFile).mode & 0o777,0o600);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

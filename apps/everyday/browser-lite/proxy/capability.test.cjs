'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {Capabilities} = require('./capability.cjs');
test('proxy capabilities bind purpose, role, profile, user, epoch and expiry', () => {
  let now = Date.now();
  const options = {secret:'test-only',uid:1000,profile:'a'.repeat(32),epoch:1,now:()=>now};
  const authority = new Capabilities(options);
  const token = authority.sign('relay',60);
  assert.equal(authority.verify(token,'relay'),true);
  assert.equal(authority.verify(token,'auth'),false);
  for (const override of [{uid:1001},{profile:'b'.repeat(32)},{epoch:2},{secret:'different'}])
    assert.equal(new Capabilities({...options,...override}).verify(token,'relay'),false);
  assert.equal(authority.verify('A'+token.slice(1),'relay'),false);
  now += 61000;
  assert.equal(authority.verify(token,'relay'),false);
});
test('engine identity survives capability expiry and epoch changes, without being a capability',()=>{
 const options={secret:'stable-realm-key',uid:1000,profile:'a'.repeat(32),epoch:1};
 const first=new Capabilities(options),next=new Capabilities({...options,epoch:2});
 assert.equal(first.engineSessionId(),next.engineSessionId());
 assert.equal(first.verify(first.engineSessionId(),'relay'),false);
 assert.notEqual(first.engineSessionId(),new Capabilities({...options,uid:1001}).engineSessionId());
});

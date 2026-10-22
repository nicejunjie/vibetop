'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {OriginRegistry}=require('./origin-policy.cjs');
const {framePolicies}=require('./frame-policy.cjs');
function registry(){return new OriginRegistry({uid:1000,profile:'a'.repeat(32),secret:'test',domain:'proxy.example.com'});}
const chrome='https://ui.example.com',site='https://site.example';
test('DENY permits only browser chrome, SAMEORIGIN also permits original self',()=>{
 const r=registry();
 assert.deepEqual(framePolicies({'x-frame-options':'DENY'},site,r,chrome),['frame-ancestors '+chrome]);
 assert.deepEqual(framePolicies({'x-frame-options':'SAMEORIGIN'},site,r,chrome),['frame-ancestors '+chrome+' '+r.register(site)]);
});
test('CSP overrides XFO and retains intersection of multiple policies',()=>{
 const r=registry(),partner=r.register('https://partner.example');
 assert.deepEqual(framePolicies({'x-frame-options':'DENY','content-security-policy':["frame-ancestors 'self' https://partner.example", "frame-ancestors 'none'"]},site,r,chrome),[
 'frame-ancestors '+chrome+' '+r.register(site)+' '+partner,'frame-ancestors '+chrome]);
});
test('wildcard original hosts do not permit unrelated proxy siblings',()=>{
 const r=registry(),allowed=r.register('https://child.allowed.example');r.register('https://evil.example');
 assert.deepEqual(framePolicies({'content-security-policy':'frame-ancestors https://*.allowed.example'},site,r,chrome),['frame-ancestors '+chrome+' '+allowed]);
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {OriginRegistry,useCookieJar,uniqueCookie,requestOrigin}=require('./origin-policy.cjs');
const options={uid:1000,profile:'a'.repeat(32),secret:Buffer.alloc(32,7),domain:'proxy.example'};
test('scheme, host, port and profile have real separate origins',()=>{
 const r=new OriginRegistry(options);
 const urls=['https://accounts.google.com/','https://www.google.com/','http://www.google.com/','https://www.google.com:8443/'];
 const mapped=urls.map(x=>r.register(x));assert.equal(new Set(mapped).size,4);
 const other=new OriginRegistry({...options,profile:'b'.repeat(32)});
 assert.notEqual(other.register(urls[0]),mapped[0]);
 assert.equal(r.register('https://www.google.com:443/foo'),mapped[1]);
});
test('Host A cannot serve B even when URL descriptor is forged',()=>{
 const r=new OriginRegistry(options);const a=new URL(r.register('https://a.example/')).host;
 r.register('https://b.example/');
 assert.equal(r.verify(a,'https://a.example/private'),true);
 assert.equal(r.verify(a,'https://b.example/private'),false);
 assert.equal(r.verify('unknown.proxy.example','https://b.example/'),false);
});
test('origin floods cannot permanently exhaust a profile or invalidate old hosts',()=>{
 const r=new OriginRegistry({...options,limit:16});const first=r.register('https://first.example');
 for(let i=0;i<5000;i++)r.register('https://site'+i+'.example');
 assert.equal(r.byOrigin.size,16);assert.equal(r.verify(new URL(first).host,'https://first.example/path'),true);
 assert.ok(r.register('https://fresh.example'));assert.equal(r.register('https://first.example'),first);
});
test('relay never reads a private jar, regardless of descriptor',()=>{
 for(const credentials of [undefined,0,1,2])assert.equal(useCookieJar({role:'relay',credentials,sourceOrigin:'https://a.test',targetOrigin:'https://a.test'}),false);
 assert.equal(useCookieJar({role:'auth',credentials:1,sourceOrigin:'https://a.test',targetOrigin:'https://b.test'}),false);
 assert.equal(useCookieJar({role:'auth',credentials:0,sourceOrigin:'https://a.test',targetOrigin:'https://b.test'}),true);
 assert.equal(useCookieJar({role:'auth',credentials:2,sourceOrigin:'https://a.test',targetOrigin:'https://a.test'}),false);
});
test('duplicate auth cookies fail closed',()=>{
 assert.equal(uniqueCookie('auth=one; auth=two','auth'),null);
 assert.equal(uniqueCookie('other=x; auth=one','auth'),'one');
});
test('actual physical Origin wins, URL claims are not an input',()=>{
 const r=new OriginRegistry(options), a=r.register('https://a.example'), b=r.register('https://b.example');
 assert.equal(requestOrigin({origin:a,referer:b+'/invented'},r),'https://a.example');
 assert.equal(requestOrigin({origin:'null',referer:a},r),'null');
 assert.equal(requestOrigin({referer:a+'/'},r),'https://a.example');
 assert.equal(requestOrigin({},r),'null');
});

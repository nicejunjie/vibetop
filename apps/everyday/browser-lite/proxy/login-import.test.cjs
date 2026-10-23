'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {hammerhead}=require('./engine.cjs');
const {importLogins}=require('./login-import.cjs');
const Cookies=hammerhead('session/cookies');
const NOW=Date.UTC(2026,9,13);
const cookie=(name,value,extra={})=>({name,value,domain:'chatgpt.com',path:'/',hostOnly:false,secure:true,httpOnly:true,sameSite:'lax',updated:NOW-1000,...extra});
const header=jar=>jar.getHeader({url:'https://chatgpt.com/',hostname:'chatgpt.com'})||'';
test('missing logins are imported and sent to the site',()=>{
  const jar=new Cookies();
  assert.equal(importLogins(jar,'https://chatgpt.com/',[cookie('session','abc')],{now:NOW}),1);
  assert.match(header(jar),/session=abc/);
  assert.equal(jar._findCookieSync('chatgpt.com','/','session').httpOnly,true);
});
test("Lite's own cookies win unless the Browser changed them since the last sync",()=>{
  const jar=new Cookies();
  importLogins(jar,'https://chatgpt.com/',[cookie('cf_bm','lite')],{now:NOW});
  assert.equal(importLogins(jar,'https://chatgpt.com/',[cookie('cf_bm','browser',{updated:NOW-5000})],{lastSync:NOW,now:NOW+1}),0);
  assert.match(header(jar),/cf_bm=lite/);
  assert.equal(importLogins(jar,'https://chatgpt.com/',[cookie('cf_bm','fresh',{updated:NOW+500})],{lastSync:NOW,now:NOW+1000}),1);
  assert.match(header(jar),/cf_bm=fresh/);
});
test('cookies for other sites, expired cookies and malformed ones are ignored',()=>{
  const jar=new Cookies();
  const rejected=[cookie('a','1',{domain:'evil.example'}),cookie('b','2',{domain:'other.chatgpt.com',hostOnly:true}),
    cookie('c','3',{expires:NOW-1}),cookie('d;x','4'),cookie('e','5\r\n'),cookie('f','6',{path:'nope'}),null,'x'];
  assert.equal(importLogins(jar,'https://chatgpt.com/',rejected,{now:NOW}),0);
  assert.equal(importLogins(jar,'ftp://chatgpt.com/',[cookie('g','7')],{now:NOW}),0);
  assert.equal(importLogins(jar,'https://www.chatgpt.com/',[cookie('h','8')],{now:NOW}),1);
});
test('force re-adopts the Browser session even when Lite rotated its own (Google)',()=>{
  const jar=new Cookies();
  const google=(name,value,extra={})=>cookie(name,value,{domain:'google.com',...extra});
  importLogins(jar,'https://www.google.com/',[google('__Secure-1PSIDTS','browser-v1')],{now:NOW});
  // Lite rotates its own copy to a value Google issued it later (newer than the
  // last sync) -- the default guard would keep Lite's copy...
  importLogins(jar,'https://www.google.com/',[google('__Secure-1PSIDTS','lite-rotated',{updated:NOW+5000})],{lastSync:NOW,now:NOW+1});
  assert.match(jar.getHeader({url:'https://www.google.com/',hostname:'www.google.com'})||'',/__Secure-1PSIDTS=lite-rotated/);
  // ...but on the next Google open, force makes Lite re-adopt the full
  // Browser's current value even though it is "older" than Lite's copy.
  assert.equal(importLogins(jar,'https://www.google.com/',[google('__Secure-1PSIDTS','browser-v2',{updated:NOW+100})],{lastSync:NOW+10000,now:NOW+2,force:true}),1);
  assert.match(jar.getHeader({url:'https://www.google.com/',hostname:'www.google.com'})||'',/__Secure-1PSIDTS=browser-v2/);
  // An unchanged value is still a no-op under force (no needless churn).
  assert.equal(importLogins(jar,'https://www.google.com/',[google('__Secure-1PSIDTS','browser-v2',{updated:NOW+100})],{lastSync:0,now:NOW+3,force:true}),0);
});

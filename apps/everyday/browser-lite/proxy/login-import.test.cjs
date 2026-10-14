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

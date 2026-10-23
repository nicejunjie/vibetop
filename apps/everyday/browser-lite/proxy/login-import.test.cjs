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
test("a cookie Lite earned since the last sync survives a runtime restart",()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const {SyncTimes}=require('./login-import.cjs');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vt-sync-')),file=path.join(dir,'login-sync.json');
  try {
    const jar=new Cookies(),url='https://www.google.com/';
    const google=(value,updated)=>[cookie('__Secure-1PSIDTS',value,{domain:'google.com',updated})];
    // First open carries the full Browser's session.
    let times=new SyncTimes(file);
    importLogins(jar,url,google('browser',NOW-1000),{lastSync:times.get('google.com'),now:NOW});times.set('google.com',NOW);
    // Google then refreshes Lite's own copy on a Lite request.
    importLogins(jar,url,google('lite-fresh',NOW+10),{now:NOW+10});
    // Lite restarts: the sync time is read back from disk, so the full
    // Browser's unchanged (older) copy does not roll Lite back.
    times=new SyncTimes(file);
    assert.equal(times.get('google.com'),NOW);
    assert.equal(importLogins(jar,url,google('browser',NOW-1000),{lastSync:times.get('google.com'),now:NOW+20}),0);
    assert.match(jar.getHeader({url,hostname:'www.google.com'})||'',/__Secure-1PSIDTS=lite-fresh/);
    // A fresh sign-in in the full Browser (changed after the last sync) still wins.
    assert.equal(importLogins(jar,url,google('browser-new',NOW+50),{lastSync:times.get('google.com'),now:NOW+60}),1);
    assert.equal((fs.statSync(file).mode&0o777),0o600);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

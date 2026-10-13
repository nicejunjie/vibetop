'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {CookieStore}=require('./cookie-store.cjs');
test('restart restores separate cookie partitions, expiry and HttpOnly attributes',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'vt-cookie-test-')),file=path.join(directory,'cookies.json');
 try {
  const store=new CookieStore({file}),main=store.get('main'),third=store.get('https://top.example');
  main.setByServer('https://a.example','session=private;Secure;HttpOnly;SameSite=Strict;Path=/');
  third.setByServer('https://a.example','session=partition;Secure;SameSite=None;Path=/');
  const restored=new CookieStore({file});
  assert.equal(restored.get('main').getHeader({url:'https://a.example'}),'session=private');
  assert.equal(restored.get('main').getClientString('https://a.example'),'');
  assert.equal(restored.get('https://top.example').getHeader({url:'https://a.example'}),'session=partition');
  assert.equal(fs.statSync(file).mode&0o777,0o600);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('cookie limits apply across partitions and preserve newest state',()=>{
 const store=new CookieStore({maxCookies:2});
 store.get('main').setByServer('https://a.example','old=1;Path=/');
 store.get('b').setByServer('https://b.example','new=2;Path=/');
 store.get('c').setByServer('https://c.example','newest=3;Path=/');
 assert.equal(store.get('main').getHeader({url:'https://a.example'}),null);
 assert.equal(store.get('c').getHeader({url:'https://c.example'}),'newest=3');
});

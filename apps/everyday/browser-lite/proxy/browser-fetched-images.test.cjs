'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
// Run the bridge's hook against stub browser classes.
function load() {
  const source=fs.readFileSync(path.join(__dirname,'client-bridge.js'),'utf8');
  const start=source.indexOf('  (function hookBrowserFetchedImages() {');
  const end=source.indexOf('\n  })();',start)+8;
  assert.ok(start>0&&end>start,'hook missing from client-bridge.js');
  class MediaMetadata {constructor(init={}){this._artwork=init.artwork||[];this.title=init.title;}
    get artwork(){return this._artwork;} set artwork(v){this._artwork=v;}}
  class Notification {constructor(title,options){this.title=title;this.options=options;}}
  const shown=[];
  class ServiceWorkerRegistration {showNotification(title,options){shown.push(options);return Promise.resolve();}}
  const window={MediaMetadata,Notification,ServiceWorkerRegistration};
  const engine={utils:{url:{parseProxyUrl:u=>u.startsWith('https://realm/')?{}:null,resolveUrlAsDest:u=>new URL(u,'https://site.example/').href,getProxyUrl:u=>'https://realm/'+u}}};
  vm.runInNewContext(source.slice(start,end),{window,engine,Proxy,Reflect,Object,Array,String,URL});
  return {window,shown};
}
test('media session artwork is proxied, in the constructor and the setter',()=>{
  const {window}=load();
  const meta=new window.MediaMetadata({title:'t',artwork:[{src:'/p.png',sizes:'150x150'},{src:'data:image/png;base64,AA'}]});
  assert.ok(meta instanceof window.MediaMetadata);
  assert.deepEqual(meta.artwork.map(a=>a.src),['https://realm/https://site.example/p.png','data:image/png;base64,AA']);
  assert.equal(meta.artwork[0].sizes,'150x150');
  meta.artwork=[{src:'https://cdn.example/q.png'}];
  assert.equal(meta.artwork[0].src,'https://realm/https://cdn.example/q.png');
});
test('notification icons are proxied once',()=>{
  const {window,shown}=load();
  const n=new window.Notification('hi',{icon:'https://cdn.example/i.png',body:'x',badge:'https://realm/https://cdn.example/b.png'});
  assert.equal(n.options.icon,'https://realm/https://cdn.example/i.png');
  assert.equal(n.options.badge,'https://realm/https://cdn.example/b.png');
  assert.equal(n.options.body,'x');
  new window.ServiceWorkerRegistration().showNotification('hi',{image:'/big.jpg'});
  assert.equal(shown[0].image,'https://realm/https://site.example/big.jpg');
});

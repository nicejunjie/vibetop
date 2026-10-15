'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {engineRequire}=require('./engine.cjs');
const root=path.dirname(engineRequire.resolve('rammerhead/package.json'));
const client=fs.readFileSync(path.join(root,'src/client/rammerhead.js'),'utf8');
// Run the built client's element getter fix against stub elements.
function load() {
  const start=client.indexOf('    function fixElementGetter() {');
  const end=client.indexOf('\n    function ',start+10);
  assert.ok(start>=0&&end>start,'fixElementGetter missing from the built client');
  const counts={get:0,parse:0};
  const classes={};
  for(const name of ['HTMLAnchorElement','HTMLAreaElement','HTMLBaseElement','HTMLEmbedElement','HTMLFormElement','HTMLFrameElement','HTMLIFrameElement','HTMLImageElement','HTMLInputElement','HTMLLinkElement','HTMLMediaElement','HTMLModElement','HTMLObjectElement','HTMLQuoteElement','HTMLScriptElement','HTMLSourceElement','HTMLTrackElement']) {
    const C=function(attrs){this.attrs=attrs;};
    for(const attr of ['href','src','action','cite','data'])Object.defineProperty(C.prototype,attr,{configurable:true,
      get(){counts.get++;const raw=this.attrs[attr];return raw==null?'':'proxied:'+raw;},set(){}});
    classes[name]=C;
  }
  const hammerhead={nativeMethods:{getAttribute(attr){return this.attrs[attr]??null;}},
    utils:{url:{parseProxyUrl(url){counts.parse++;return url.startsWith('proxied:')?{destUrl:url.slice(8)}:null;}}}};
  const ctx=vm.createContext({window:classes,hammerhead,console,Object,Map});
  vm.runInContext(client.slice(start,end)+'\nfixElementGetter();',ctx);
  return {classes,counts};
}
test('absolute URL attributes are resolved once per stored value',()=>{
  const {classes,counts}=load();
  const links=[1,2,3].map(()=>new classes.HTMLLinkElement({href:'https://a.example/x.css'}));
  for(let i=0;i<50;i++)for(const link of links)assert.equal(link.href,'https://a.example/x.css');
  assert.equal(counts.get,1);assert.equal(counts.parse,1);
  links[0].attrs.href='https://a.example/y.css';
  assert.equal(links[0].href,'https://a.example/y.css');
  assert.equal(links[1].href,'https://a.example/x.css');
  assert.equal(counts.get,2);
});
test('relative, empty and missing values are never cached',()=>{
  const {classes,counts}=load();
  const a=new classes.HTMLAnchorElement({href:'#top'}),img=new classes.HTMLImageElement({});
  for(let i=0;i<3;i++){assert.equal(a.href,'#top');assert.equal(img.src,'');}
  assert.equal(counts.get,6);
});
test('each element class and attribute keeps its own cache',()=>{
  const {classes}=load();
  const raw='https://a.example/frame';
  const frame=new classes.HTMLIFrameElement({src:raw}),script=new classes.HTMLScriptElement({src:raw});
  assert.equal(frame.src,raw);assert.equal(script.src,raw);
});

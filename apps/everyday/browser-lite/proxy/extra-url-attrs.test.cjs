'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {hammerhead,engineRequire}=require('./engine.cjs');
require('./gateway.cjs');
test('the server page pass rewrites posters, captions and responsive preloads, and drops ping',()=>{
  const parse5=engineRequire(engineRequire.resolve('parse5',{paths:[engineRequire.resolve('testcafe-hammerhead/package.json')]}));
  const DomProcessor=hammerhead('processing/dom'),Adapter=hammerhead('processing/dom/parse5-dom-adapter');
  const {walkElements}=hammerhead('utils/parse5');
  const root=parse5.parse('<!doctype html><body><video poster="https://cdn.example/p.jpg"><track src="/cc.vtt"></video>'
    +'<link rel="preload" as="image" imagesrcset="https://cdn.example/a.jpg 1x, https://cdn.example/b.jpg 2x">'
    +'<a href="/x" ping="https://track.example/p">x</a><img src="data:image/gif;base64,R0lG"></body>');
  const processor=new DomProcessor(new Adapter(false,{},()=>{},()=>{}));
  const replacer=(url)=>'https://realm.example/S/'+new URL(url,'https://site.example/').href;
  walkElements(root,el=>processor.processElement(el,replacer));
  const html=parse5.serialize(root);
  assert.match(html,/poster="https:\/\/realm\.example\/S\/https:\/\/cdn\.example\/p\.jpg"/);
  assert.match(html,/poster-hammerhead-stored-value="https:\/\/cdn\.example\/p\.jpg"/);
  assert.match(html,/<track src="https:\/\/realm\.example\/S\/https:\/\/site\.example\/cc\.vtt"/);
  assert.match(html,/imagesrcset="https:\/\/realm\.example\/S\/https:\/\/cdn\.example\/a\.jpg 1x, https:\/\/realm\.example\/S\/https:\/\/cdn\.example\/b\.jpg 2x"/);
  assert.doesNotMatch(html,/ping=/);
  assert.match(html,/src="data:image\/gif/);
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createRequire}=require('node:module');
const {engineRequire,hammerhead}=require('./engine.cjs');
test('served SVG <use href> is proxied; local #id references stay',()=>{
  const {parseFragment,serialize}=createRequire(engineRequire.resolve('testcafe-hammerhead/package.json'))('parse5');
  const Adapter=hammerhead('processing/dom/parse5-dom-adapter'),DomProcessor=hammerhead('processing/dom');
  const walk=hammerhead('utils/parse5').walkElements;
  const root=parseFragment('<svg><use href="/cdn/icons.svg#x"></use><use href="#local"></use><a href="/a"></a></svg>');
  const replacer=url=>'https://realm.test/proxy/https://site.test'+url;
  const processor=new DomProcessor(new Adapter(false,null,null,replacer));
  for(const node of root.childNodes)walk(node,el=>processor.processElement(el,replacer));
  const html=serialize(root);
  assert.match(html,/<use href="https:\/\/realm\.test\/proxy\/https:\/\/site\.test\/cdn\/icons\.svg#x" href-hammerhead-stored-value="\/cdn\/icons\.svg#x">/);
  assert.match(html,/<use href="#local" href-hammerhead-stored-value="#local">/);
  // SVG <a> keeps the ordinary href rule (processed once).
  assert.equal((html.match(/https:\/\/site\.test\/a"/g)||[]).length,1);
});
test('the client engine rewrites SVG href in setAttribute and restores it in getAttribute',()=>{
  const client=fs.readFileSync(engineRequire.resolve('testcafe-hammerhead/lib/client/hammerhead.js'),'utf8');
  assert.ok(client.includes("loweredAttr === 'href' && ['a', 'image'].indexOf(tagName) === -1"));
  assert.ok(client.includes("(loweredAttr === 'href' || loweredAttr === 'xlink:href') && isSVGElement(el) ||"));
  assert.ok(client.includes('IS_SVG_ELEMENT_WITH_HREF_ATTR'));
});

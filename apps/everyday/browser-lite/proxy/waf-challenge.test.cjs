'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {hammerhead,engineRequire}=require('./engine.cjs');
require('./gateway.cjs');
function processed(html) {
  const parse5=engineRequire(engineRequire.resolve('parse5',{paths:[engineRequire.resolve('testcafe-hammerhead/package.json')]}));
  const DomProcessor=hammerhead('processing/dom'),Adapter=hammerhead('processing/dom/parse5-dom-adapter');
  const {walkElements}=hammerhead('utils/parse5');
  const root=parse5.parse(html);
  const processor=new DomProcessor(new Adapter(false,{},()=>{},()=>{}));
  walkElements(root,el=>processor.processElement(el,url=>'https://realm.example/S/'+new URL(url,'https://site.example/').href));
  return parse5.serialize(root);
}
test('Alibaba Cloud WAF challenge scripts never run; engine scripts still do',()=>{
  // Shape of xueqiu.com's challenge page: marker meta, then its scripts.
  const html=processed('<textarea id="renderData" style="display:none">{"_waf_x":"y"}</textarea><!doctype html><html><head>'
    +'<script class="self-removing-script-hammerhead-shadow-ui" src="https://realm.example/hammerhead.js"></script>'
    +'<meta name="aliyun_waf_aa" content="1"><script>for(;;){}</script><script src="/u21pn7x6/r8lw5pzu/psk8uqfi"></script></head><body></body></html>');
  const scripts=[...html.matchAll(/<script[^>]*>/g)].map(m=>m[0]);
  assert.equal(scripts.filter(s=>s.includes('type="text/vt-blocked-challenge"')).length,2,html);
  assert.ok(scripts.find(s=>s.includes('hammerhead.js'))&&!scripts.find(s=>s.includes('hammerhead.js')).includes('vt-blocked'));
});
test('ordinary pages keep their scripts',()=>{
  const html=processed('<!doctype html><html><head><meta name="description" content="x"><script>1</script></head><body></body></html>');
  assert.ok(!html.includes('vt-blocked-challenge'));
});

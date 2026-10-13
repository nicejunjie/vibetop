'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {engineRequire,hammerhead}=require('./engine.cjs');
const {scriptCacheKey}=require('./script-cache-key.cjs');
const urls=hammerhead('utils/url');
for(const bundle of ['server','client/hammerhead.js','client/worker-hammerhead.js']) {
  test(bundle+' retains worker module kind through parse and rebuild',()=>{
    let parse=urls.parseResourceType,stringify=urls.getResourceTypeString;
    if(bundle!=='server') {
      const source=fs.readFileSync(engineRequire.resolve('testcafe-hammerhead/lib/'+bundle),'utf8');
      const start=source.indexOf('var RESOURCE_TYPES = ['),end=source.indexOf('function makeShortOrigin',start);
      assert.ok(start>=0 && end>start);
      const name=bundle==='client/hammerhead.js'?'parseResourceType$1':'parseResourceType';
      ({parse,stringify}=vm.runInNewContext(source.slice(start,end)+';({parse:'+name+',stringify:getResourceTypeString})'));
    }
    const kind=stringify({isScript:true,isWorkerModule:true});
    assert.equal(kind,'sm');
    assert.equal(parse(kind).isWorkerModule,true);
    assert.equal(parse(kind).isScript,true);
    assert.equal(stringify(parse(kind)),kind);
    assert.equal(stringify(parse('s')),'s');
    const proxy=urls.getProxyUrl('https://site.example/a.js?x=1#part',{
      proxyHostname:'proxy.example',proxyPort:443,proxyProtocol:'https:',
      sessionId:'session',windowId:'context~tab~relay',resourceType:kind,charset:'utf-8'});
    const parsed=urls.parseProxyUrl(proxy);
    assert.equal(parsed.windowId,'context~tab~relay');
    assert.equal(parsed.charset,'utf-8');assert.equal(stringify(parse(parsed.resourceType)),kind);
    assert.equal(parsed.destUrl,'https://site.example/a.js?x=1#part');
  });
}
test('processed script cache separates tabs, module mode, charset, base and relay',()=>{
  const base={physical:'https://proxy.example',sessionId:'s',windowId:'ctx~tab-a~relay',resourceType:'s',charset:'utf-8',destination:'https://site.example/a.js',relay:'relay'};
  const key=scriptCacheKey(base);
  for(const [field,value] of Object.entries({physical:'https://other.example',sessionId:'other',windowId:'ctx~tab-b~relay',resourceType:'sm',charset:'windows-1252',destination:'https://site.example/b.js',relay:'renewed'}))
    assert.notEqual(scriptCacheKey({...base,[field]:value}),key,field);
  assert.equal(scriptCacheKey({...base}),key);
  assert.notEqual(scriptCacheKey({...base,physical:'x\0y',sessionId:'z'}),scriptCacheKey({...base,physical:'x',sessionId:'y\0z'}));
});
test('actual Rammerhead cache never returns another tab’s processed imports',async()=>{
  const path=require('node:path');
  const installCache=require(path.join(path.dirname(require.resolve('rammerhead/package.json')),'src/util/addJSDiskCache.js'));
  const stored=new Map();let hits=0,rewrites=0;
  await installCache({get:key=>{const value=stored.get(key);if(value)hits++;return value;},set:(key,value)=>stored.set(key,value)});
  const processor=hammerhead('processing/resources/script');
  const source='import {value} from "./dependency.js"; export {value};';
  async function process(tab) {
    const destination='https://site.example/module.js',windowId='context~'+tab+'~relay';
    const ctx={req:{vtCacheKey:scriptCacheKey({physical:'https://proxy.example',sessionId:'session',windowId,resourceType:'s',charset:'utf-8',destination,relay:'relay'})},destRes:{headers:{}},nativeAutomation:false};
    return processor.processResource(source,ctx,null,url=>{rewrites++;return urls.getProxyUrl(new URL(url,destination).href,{proxyHostname:'proxy.example',proxyPort:443,proxyProtocol:'https:',sessionId:'session',windowId,resourceType:'s',charset:'utf-8'});});
  }
  const a=await process('tab-a'),b=await process('tab-b');
  assert.match(a,/context~tab-a~relay/);assert.doesNotMatch(a,/context~tab-b~relay/);
  assert.match(b,/context~tab-b~relay/);assert.doesNotMatch(b,/context~tab-a~relay/);
  const before=rewrites;assert.equal(await process('tab-a'),a);
  assert.equal(rewrites,before);assert.equal(hits,1);assert.equal(stored.size,2);
});
test('module response and redirect reconstruction retain flags and force UTF-8',()=>{
  const Context=hammerhead('request-pipeline/context');
  const transforms=hammerhead('request-pipeline/header-transforms/transforms');
  const kind=urls.getResourceTypeString({isScript:true,isWorkerModule:true});
  const proxy=urls.getProxyUrl('https://site.example/start.js',{proxyHostname:'proxy.example',proxyPort:443,proxyProtocol:'https:',sessionId:'session',windowId:'context~tab~relay',resourceType:kind,charset:'windows-1252'});
  for(const label of ['windows-1252','utf-8'])for(const statusCode of [200,302,307]) {
    const parsed=Context._flattenParsedProxyUrl(urls.parseProxyUrl(proxy));
    const ctx=Object.assign(Object.create(Context.prototype),parsed,{
      req:{method:'GET',headers:{}},destRes:{statusCode,headers:{'content-type':'application/javascript; charset='+label,...(statusCode===200?{}:{location:'./final/dep.js?x=1#part'})}},
      session:{handleFileDownload(){throw new Error('unexpected download');}},
      toProxyUrl(destination,cross,resourceType,charset){return urls.getProxyUrl(destination,{proxyHostname:'proxy.example',proxyPort:443,proxyProtocol:'https:',sessionId:parsed.sessionId,windowId:parsed.windowId,resourceType,charset});}
    });
    ctx.buildContentInfo();
    assert.equal(ctx.contentInfo.contentTypeUrlToken,kind);
    assert.equal(ctx.contentInfo.charset.get(),'utf-8');
    ctx.contentInfo.charset.fromBOM(Buffer.from([255,254]));
    assert.equal(ctx.contentInfo.charset.get(),'utf-8','module UTF-8 overrides conflicting BOM');
    if(statusCode!==200) {
      const redirected=urls.parseProxyUrl(transforms.responseTransforms.location(ctx.destRes.headers.location,ctx));
      assert.equal(redirected.resourceType,kind);assert.equal(redirected.charset,'utf-8');
      assert.equal(redirected.windowId,'context~tab~relay');
      assert.equal(redirected.destUrl,'https://site.example/final/dep.js?x=1#part');
    }
  }
});
test('classic scripts retain response charset and BOM precedence',()=>{
  const Context=hammerhead('request-pipeline/context');
  const ctx=Object.assign(Object.create(Context.prototype),{
    dest:{isScript:true,charset:'utf-8'},req:{method:'GET',headers:{}},
    destRes:{statusCode:200,headers:{'content-type':'application/javascript; charset=windows-1252'}}
  });
  ctx.buildContentInfo();assert.equal(ctx.contentInfo.contentTypeUrlToken,'s');
  assert.equal(ctx.contentInfo.charset.get(),'windows-1252');
  ctx.contentInfo.charset.fromBOM(Buffer.from([255,254]));
  assert.equal(ctx.contentInfo.charset.get(),'utf-16le');
});
test('module decoding ignores both UTF-16 BOMs even with an already UTF-8 label',async()=>{
  const Context=hammerhead('request-pipeline/context');
  const {decodeContent,encodeContent}=hammerhead('processing/encoding');
  for(const contentType of ['application/javascript','application/javascript; charset=utf-8'])for(const bom of [[255,254],[254,255]]) {
    const ctx=Object.assign(Object.create(Context.prototype),{dest:{isScript:true,isWorkerModule:true,charset:'utf-8'},req:{method:'GET',headers:{}},destRes:{statusCode:200,headers:{'content-type':contentType}}});
    ctx.buildContentInfo();const bytes=Buffer.from([...bom,65,0]);
    const decoded=await decodeContent(bytes,'',ctx.contentInfo.charset);
    assert.equal(decoded,bytes.toString('utf8'));
    assert.equal(ctx.contentInfo.charset.isFromBOM(),false);
    assert.deepEqual(await encodeContent(decoded,'',ctx.contentInfo.charset),Buffer.from(decoded,'utf8'));
  }
});
test('failed module URL rewriting rejects instead of caching or returning raw source',async()=>{
  const path=require('node:path');
  const installCache=require(path.join(path.dirname(require.resolve('rammerhead/package.json')),'src/util/addJSDiskCache.js'));
  const stored=new Map();await installCache({get:key=>stored.get(key),set:(key,value)=>stored.set(key,value)});
  const processor=hammerhead('processing/resources/script');
  await assert.rejects(processor.processResource('import "./private.js";',{
    req:{vtCacheKey:'rejected-graph'},destRes:{headers:{}},nativeAutomation:false
  },null,()=>{throw new Error('Invalid worker module context');}),/Invalid worker module context/);
  assert.equal(stored.size,0);
});
test('module headers preserve hashbangs and reprocessing does not duplicate bindings',()=>{
 const {processModule}=require('./worker-module-runtime.cjs');
 for(const source of ['#!/usr/bin/env node','#!/usr/bin/env node\nexport const value=1;','export function early(){return ({location:1})?.location;}']) {
  const first=processModule(source,url=>url,'https://proxy.example/runtime.mjs');
  const second=processModule(first,url=>url,'https://proxy.example/runtime.mjs');
  assert.equal(second,first);
  if(source.startsWith('#!'))assert.ok(first.startsWith('#!/usr/bin/env node\n'));
  assert.equal(first.split('import {chain as __vtChain,').length,2);
  assert.doesNotMatch(first,/importScripts\(/);
  assert.match(first,/function __get\$\(\)/);
 }
});
test('unmarked requests cannot inherit module mode from the Referer',()=>{
 const Context=hammerhead('request-pipeline/context');
 const referer={sessionId:'session',windowId:'context~tab~relay',dest:{isScript:true,isWorkerModule:true,protocol:'https:',hostname:'site.example',host:'site.example',partAfterHost:'/module.js'}};
 const ctx=Object.assign(Object.create(Context.prototype),{req:{url:'/raw.js'}});
 const result=ctx._getDestFromReferer(referer);
 assert.equal(result.dest.isWorkerModule,false);
 assert.equal(referer.dest.isWorkerModule,true);
});
test('module preparation rejects syntax the shared processor cannot parse',()=>{
 const {processModule}=require('./worker-module-runtime.cjs');
 assert.throws(()=>processModule('import { broken',url=>url,'https://proxy.example/runtime.mjs'),SyntaxError);
});
test('reprocessing dynamic imports is idempotent and module base retains the file',()=>{
 const {processModule}=require('./worker-module-runtime.cjs');
 const source='export function load(u){return import(u);}';
 for(const base of ['https://site.example/a/file.js','https://site.example/b/file.js']) {
  const first=processModule(source,u=>u,'https://proxy.example/runtime.mjs',base);
  const second=processModule(first,u=>u,'https://proxy.example/runtime.mjs',base);
  assert.equal(second,first);
  assert.ok(first.includes(base));
 }
});
test('module hashbang stripping accepts every JavaScript line terminator',()=>{
 const {processModule}=require('./worker-module-runtime.cjs');
 for(const ending of ['\r','\r\n','\u2028','\u2029']) {
  const output=processModule('#!/usr/bin/env node'+ending+'export const value=1;',u=>u,'https://proxy.example/runtime.mjs');
  assert.ok(output.startsWith('#!/usr/bin/env node'+ending+'/*vt-worker-module-start*/'));
 }
});
test('unsupported modern module syntax cannot fall through as raw source',()=>{
 const {processModule}=require('./worker-module-runtime.cjs');
 for(const source of ['import x from "./x.json" with {type:"json"};','import("./x.json",{with:{type:"json"}});','const r=/x/v;','@decorator class X {}','using resource = open();'])
  assert.throws(()=>processModule(source,u=>u,'https://proxy.example/runtime.mjs'),SyntaxError,source);
});

// These parse successfully before HH's regex preprocessing, but not after it.
// A preflight parser alone therefore cannot prevent unprocessed imports.
test('module comment-like template text is preserved and imports are rewritten',()=>{
 const {processModule}=require('./worker-module-runtime.cjs');
 for(const source of [
  'const s=`//# sourceMappingURL=x`;\nimport("https://direct.example/x.mjs");',
  'const s=`\n<!-- x`;\nimport("https://direct.example/x.mjs");'
 ]) {const out=processModule(source,u=>u,'https://proxy.example/runtime.mjs','https://site.example/entry.js');assert.ok(out.includes('const s=`'));assert.ok(out.includes('__get$ProxyUrl(\"https://direct.example/x.mjs\"'));}

});

test('module grammar preserves HTML-comment-shaped expressions and rewrites following imports',()=>{
 const {processModule}=require('./worker-module-runtime.cjs');
 for(const source of ['let a=1,b=1;a <!--b;import("https://direct.example/x.mjs");','let a=1,b=1;a\n<!--b;import("https://direct.example/x.mjs");']) {
  const out=processModule(source,u=>u,'https://proxy.example/runtime.mjs','https://site.example/entry.js');
  assert.ok(out.includes('__get$ProxyUrl("https://direct.example/x.mjs"'));
 }
});
test('module helper bindings are rejected in nested patterns and parameters',()=>{
 const {processModule}=require('./worker-module-runtime.cjs');
 for(const source of ['{let __get$ProxyUrl=u=>u;}','const {x:__vtChain}={};','function f(__get$Loc){}','try{}catch(__get$Eval){}','import {x as __get$} from "./x.js";'])
  assert.throws(()=>processModule(source,u=>u,'https://proxy.example/runtime.mjs'),/reserved worker helper binding/);
});

test('static module imports cannot introduce unprocessed non-network graphs',()=>{
 const {processModule}=require('./worker-module-runtime.cjs');
 for(const value of ['data:text/javascript,export default 1','blob:https://site.example/id','javascript:alert(1)'])
  assert.throws(()=>processModule('import '+JSON.stringify(value)+';',u=>u,'https://proxy.example/runtime.mjs'),/module scheme is not supported/);
});

test('helper checks inspect header-like source and reject delegate reassignment',()=>{
 const {processModule}=require('./worker-module-runtime.cjs');
 for(const source of ['/*hammerhead|script|start*/{let __get$ProxyUrl=u=>u;}/*hammerhead|script|processing-header-end*/','__get$ProxyUrl=u=>u;','({x:__get$Loc}={x:1});','__vtChain++;','for(__get$ of [x]){}','for(__get$Loc in {}){}'])
  assert.throws(()=>processModule(source,u=>u,'https://proxy.example/runtime.mjs'),/reserved worker helper binding/);
});

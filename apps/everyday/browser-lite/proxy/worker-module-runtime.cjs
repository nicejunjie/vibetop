'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const {engineRequire,hammerhead}=require('./engine.cjs');
const {createChainRuntime}=require('./optional-chain.cjs');
const {normalizeModuleSpecifier}=require('./module-specifier.cjs');
const instructions=hammerhead('processing/script/instruction');
const hhRequire=require('node:module').createRequire(engineRequire.resolve('testcafe-hammerhead/package.json'));
const {parse}=hhRequire('acorn-hammerhead');
const {processScript}=hammerhead('processing/script');
const helpers=Object.values(instructions).filter(name=>!['__swScopeHeaderValue','__getWorkerSettings$'].includes(name));
function installModuleHelpers() {
 const apply=Reflect.apply;
 Object.assign(self,{
  '__get$Loc':l=>l,'__set$Loc':(l,v)=>v,
  '__get$':(o,p,optional)=>optional && o==null?undefined:o[p],
  '__set$':(o,p,v)=>(o[p]=v),
  '__call$':(o,p,a,optional)=>optional && o[p]==null?undefined:apply(o[p],o,a),
  '__get$Eval':e=>e,'__proc$Script':s=>s,'__proc$Html':s=>s,
  '__get$PostMessage':function(w,p){return arguments.length===1?w.postMessage:p;},
  '__get$ProxyUrl':(u,b)=>self.__vtWorkerProxyUrl(u,b),
  '__rest$Array':(a,i)=>Array.prototype.slice.call(a,i),
  '__rest$Object':(o,p)=>{const n={};for(const k of Object.keys(o))if(!p.includes(k))n[k]=o[k];return n;},
  '__arrayFrom$':r=>r && !Array.isArray(r) && typeof r[Symbol.iterator]==='function'?Array.from(r):r
 });
}
const worker=fs.readFileSync(engineRequire.resolve('testcafe-hammerhead/lib/client/worker-hammerhead.js'),'utf8');
const source=`if(typeof DedicatedWorkerGlobalScope==='undefined' || !(self instanceof DedicatedWorkerGlobalScope))throw new Error('Browser Lite module runtime requires a dedicated worker');
const config=new URL(import.meta.url);
const physical=new URL(self.__vtWorkerRouting?self.__vtWorkerRouting.physicalHref:self.location.href);
const tuple=self.__vtWorkerRouting?self.__vtWorkerRouting.sessionId+'*'+self.__vtWorkerRouting.windowId:physical.pathname.split('/')[1].split('!')[0];
if(config.origin!==physical.origin || tuple!==config.searchParams.get('session')+'*'+config.searchParams.get('window') || config.searchParams.get('cap')!==config.searchParams.get('window').split('~')[2])throw new Error('Browser Lite worker runtime context mismatch');
if(!self.__vtWorkerRuntimeReady){self.__vtModuleEntry=true;${worker}}
if(self.__vtModuleEntry)(${installModuleHelpers.toString()})();
const chain=(${createChainRuntime.toString()})(function(mode,o,p){return mode===1?self.__get$(o,p):mode===2?self.__get$Eval(o[p]):mode===3?self.__get$PostMessage(o):o[p];},function(o,p,a,fn){return Reflect.apply(fn,o,a);},function(s,a){return self.__proc$Script(s,a);});
const nativeApply=Reflect.apply;
function dispatch(name,args){if(typeof self[name]!=='function')throw new Error('Browser Lite worker helper unavailable');return nativeApply(self[name],self,args);}
export {chain,dispatch};
`;
// Cache identity covers preparation as well as the emitted runtime. A parser
// fix must invalidate graph source cached by an older processor.
const revision=crypto.createHash('sha256').update(source).update(fs.readFileSync(__filename))
 .update(fs.readFileSync(require.resolve('./modern-script-patch.cjs')))
 .update(fs.readFileSync(require.resolve('./module-specifier.cjs'))).digest('hex');
const runtimePath='/__vt/worker-module-runtime/'+revision+'.mjs';
function runtimeUrl(physical,sessionId,windowId) {
 const query=new URLSearchParams({session:sessionId,window:windowId,cap:windowId.split('~')[2]});
 return physical+runtimePath+'?'+query;
}
function rejectHelperBindings(ast) {
 const reserved=new Set([...helpers,'__vtChain']);
 function binding(node) {
  if(!node)return;
  if(node.type==='Identifier' && reserved.has(node.name))throw new SyntaxError('Browser Lite reserved worker helper binding');
  if(node.type==='RestElement')binding(node.argument);
  if(node.type==='AssignmentPattern')binding(node.left);
  if(node.type==='ArrayPattern')node.elements.forEach(binding);
  if(node.type==='ObjectPattern')node.properties.forEach(p=>binding(p.type==='RestElement'?p.argument:p.value));
 }
 function visit(node) {
  if(!node || typeof node!=='object')return;
  if(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type) && node.source) {
   const value=normalizeModuleSpecifier(node.source.value);
   if(value!==null && !/^(?:\/|\.\/|\.\.\/|https?:)/.test(value))throw new SyntaxError('Browser Lite module scheme is not supported');
  }
  if(['AssignmentExpression','ForInStatement','ForOfStatement'].includes(node.type))binding(node.left);
  if(node.type==='UpdateExpression')binding(node.argument);
  if(node.type==='VariableDeclarator' || /^(?:Function|Class)(?:Declaration|Expression)$/.test(node.type))binding(node.id);
  if(/^(?:FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(node.type))node.params.forEach(binding);
  if(node.type==='CatchClause')binding(node.param);
  if(/^Import.*Specifier$/.test(node.type))binding(node.local);
  for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value && typeof value==='object')visit(value);
 }
 visit(ast);
}
function processModule(source,resolver,runtime,baseUrl) {
 resolver.vtStrictModule=true;
 if(baseUrl)resolver.vtModuleBase=baseUrl;
 const match=source.match(/^#![^\r\n\u2028\u2029]*(?:\r\n|[\r\n\u2028\u2029]|$)/),hashbang=match?(match[0]+(/[\r\n\u2028\u2029]$/.test(match[0])?'':'\n')):'';
 const original=(match?source.slice(match[0].length):source).replace(/^\/\*vt-worker-module-start\*\/[\s\S]*?\/\*vt-worker-module-end\*\/\n?/,'');
 // Inspect bindings with the same module grammar used by strict processing.
 // The processor itself parses and emits this exact text without regex stripping.
 const ast=parse(original,{ecmaVersion:13,sourceType:'module'});
 rejectHelperBindings(ast);
 const body=processScript(original,false,false,resolver);
 let dispatchName='__vtModuleDispatch';while(body.includes(dispatchName))dispatchName+='_';
 const delegates=helpers.map(name=>`function ${name}(){return ${dispatchName}(${JSON.stringify(name)},arguments);}`).join('\n');
 return hashbang+'/*vt-worker-module-start*/import {chain as __vtChain,dispatch as '+dispatchName+'} from '+JSON.stringify(runtime)+';\n'+delegates+'\n/*vt-worker-module-end*/\n'+body;
}
module.exports={source,revision,runtimePath,runtimeUrl,processModule};

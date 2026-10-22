'use strict';
const fs=require('node:fs');
const {createChainRuntime,createChainTransformer,selectWindowReference}=require('./optional-chain.cjs');
function patchOptionalChains(engineRequire){
  const resolve=path=>engineRequire.resolve('testcafe-hammerhead/lib/'+path);
  function patch(file,from,to){
    const source=fs.readFileSync(file,'utf8');if(source.includes(to))return;
    if(source.split(from).length!==2)throw new Error('Optional chain anchor changed: '+from);
    fs.writeFileSync(file,source.replace(from,()=>to));
  }
  function block(file,name,anchor,body){
    const start='/* vt-'+name+'-start */',end='/* vt-'+name+'-end */';
    const source=fs.readFileSync(file,'utf8'),replacement=start+'\n'+body+'\n'+end+'\n';
    if(source.includes(start)){
      if(source.split(start).length!==2 || source.split(end).length!==2)throw new Error('Duplicate chain patch');
      fs.writeFileSync(file,source.slice(0,source.indexOf(start))+replacement+source.slice(source.indexOf(end)+end.length).replace(/^\n/,''));
    }else patch(file,anchor,replacement+anchor);
  }
  const client=resolve('client/hammerhead.js');
  patch(client,'PropertyAccessorsInstrumentation._error = function (msg) {\r\n\t        throw new Error(msg);',
    'PropertyAccessorsInstrumentation._error = function (msg) {\r\n\t        throw new TypeError(msg);');
  for(const file of [client,resolve('processing/script/transform.js')]){
    block(file,'chain-transform','function findTransformer(node, parent) {',
      'var vtChainTransformer = ('+createChainTransformer.toString()+')(findTransformer);');
    patch(file,'function findTransformer(node, parent) {',
      'function findTransformer(node, parent) { if (node.vtChainGenerated) return null; if (vtChainTransformer.condition(node,parent)) return vtChainTransformer;');
  }
  const read='function(mode,owner,key){return mode===1?window.__get$(owner,key):mode===2?window.__get$Eval(owner[key]):mode===3?window.__get$PostMessage(owner):owner[key];}';
  block(client,'chain-window','this._propertyAccessorsInstrumentation.attach(window);',
    'nativeMethods.objectDefineProperty(window,"__vtChain",{configurable:true,value:('+createChainRuntime.toString()+')('+read+',function(owner,key,args,fn){return window.__vtCallCaptured(owner,key,args,fn);},function(src,isApply){return window.__proc$Script(src,isApply);})});');
  block(client,'chain-call','nativeMethods.objectDefineProperty(window, SCRIPT_PROCESSING_INSTRUCTIONS.callMethod, {',`
    var vtNativeApply=Reflect.apply;
    nativeMethods.objectDefineProperty(window,"__vtCallCaptured",{configurable:true,value:function(owner,key,args,fn){
      if(typeof fn!=="function")return vtNativeApply(fn,owner,args);
      if(typeof key==="string" && shouldInstrumentMethod(key) && _this.methodWrappers[key].condition(owner))return _this.methodWrappers[key].method(owner,args);
      return vtNativeApply(fn,owner,args);
    }});
  `);
  const fallbackRead='function(mode,owner,key){return mode===1?__get$(owner,key):mode===2?__get$Eval(owner[key]):mode===3?__get$PostMessage(owner):owner[key];}';
  const header=`if(typeof __vtChain==='undefined')var __vtChain=typeof window!=='undefined'&&window?window.__vtChain:(${createChainRuntime.toString()})(${fallbackRead},(function(){var apply=Reflect.apply;return function(owner,key,args,fn){return apply(fn,owner,args);};})(),function(src,isApply){return __proc$Script(src,isApply);});\n`;
  for(const [file,anchor,decl] of [[client,'function add$1(code,','var'],[resolve('processing/script/header.js'),'function add(code,','const']]){
    block(file,'chain-header',anchor,'var vtChainHeader='+JSON.stringify(header)+';');
    patch(file,anchor+' isStrictMode, swScopeHeaderValue, nativeAutomation, workerSettings)',anchor+' isStrictMode, swScopeHeaderValue, nativeAutomation, workerSettings, windowReference)');
    const previous=decl+' header = targetHeader.replace("/*hammerhead|script|processing-header-end*/",vtChainHeader+"/*hammerhead|script|processing-header-end*/")';
    const globalPrevious=decl+' header = targetHeader.replace(/\\bwindow\\b/g,"globalThis.window").replace("/*hammerhead|script|processing-header-end*/",(code.includes("__vtChain")?vtChainHeader:"")+"/*hammerhead|script|processing-header-end*/")';
    const source=fs.readFileSync(file,'utf8');
    patch(file,source.includes(globalPrevious)?globalPrevious:source.includes(previous)?previous:decl+' header = targetHeader',
      decl+' header = targetHeader.replace("/*hammerhead|script|processing-header-end*/",(code.includes("__vtChain")?vtChainHeader:"")+"/*hammerhead|script|processing-header-end*/").replace(/\\bwindow\\b/g,function(){return windowReference || "window";})');
  }
  for(const file of [client,resolve('processing/script/index.js')]){
    block(file,'chain-global-reference','function processScript(src,','var vtSelectWindowReference='+selectWindowReference.toString()+';');
    patch(file,'function postprocess(processed, withHeader, bom, strictMode, swScopeHeaderValue, nativeAutomation, workerSettings)',
      'function postprocess(processed, withHeader, bom, strictMode, swScopeHeaderValue, nativeAutomation, workerSettings, windowReference)');
    patch(file,'postprocess(processed, withHeader, bom, isStrictMode(ast), swScopeHeaderValue, nativeAutomation, workerSettings)',
      'postprocess(processed, withHeader, bom, isStrictMode(ast), swScopeHeaderValue, nativeAutomation, workerSettings, vtSelectWindowReference(ast))');
    const add=file===client?'add$1':'(0, header_1.add)';
    patch(file,add+'(processed, strictMode, swScopeHeaderValue, nativeAutomation, workerSettings)',
      add+'(processed, strictMode, swScopeHeaderValue, nativeAutomation, workerSettings, windowReference)');
  }
}
module.exports={patchOptionalChains};

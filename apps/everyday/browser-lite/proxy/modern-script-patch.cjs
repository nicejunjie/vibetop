'use strict';
const fs=require('node:fs');
const {createRequire}=require('node:module');
function patchModernScripts(engineRequire) {
  const hhRequire=createRequire(engineRequire.resolve('testcafe-hammerhead/package.json'));
  function patch(file,from,to) {
    let source=fs.readFileSync(file,'utf8');
    if(source.includes(to))return;
    if(source.split(from).length!==2)throw new Error('Modern JS patch anchor changed: '+from);
    fs.writeFileSync(file,source.replace(from,()=>to));
  }
  const client=engineRequire.resolve('testcafe-hammerhead/lib/client/hammerhead.js');
  // Enforce strict graph processing at the actual parser result, after all
  // inherited preprocessing. A separate preflight parse is insufficient.
  patch(engineRequire.resolve('testcafe-hammerhead/lib/processing/script/index.js'),
    'if (!ast)\n        return src;',
    "if (!ast) { if (resolver && resolver.vtStrictModule) throw new SyntaxError('Browser Lite module preprocessing failed'); return src; }");
  patch(engineRequire.resolve('testcafe-hammerhead/lib/processing/script/index.js'),
    'const { bom, preprocessed } = preprocess(src);\n    const withoutHtmlComments = removeHtmlComments(preprocessed);\n    const { ast, isObject } = analyze(withoutHtmlComments);',
    "const vtStrict = !!(resolver && resolver.vtStrictModule);\n    const { bom, preprocessed } = vtStrict ? {bom:'',preprocessed:src} : preprocess(src);\n    const withoutHtmlComments = vtStrict ? preprocessed : removeHtmlComments(preprocessed);\n    const { ast, isObject } = vtStrict ? {ast:(0, acorn_hammerhead_1.parse)(withoutHtmlComments,{ecmaVersion:13,sourceType:'module'}),isObject:false} : analyze(withoutHtmlComments);");
  // Acorn's inherited optional flag is used by old HH transforms, but printing
  // it adds guards that were never present in the source (a?.b.c -> a?.b?.c).
  // Retain the token on each member separately in both parser copies.
  for(const file of [client,hhRequire.resolve('acorn-hammerhead/lib/expression.js')])
    patch(file,'node.optional = optional || node.object.optional;',
      'node.optional = optional || node.object.optional; node.vtOwnOptional = optional;');
  // Rammerhead's global .top substitution must not change this browser-native
  // cross-origin WindowProxy type probe into an inaccessible custom property.
  patch(client,'return !!instance.top;','return !!instance["top"];');
  for(const file of [client,engineRequire.resolve('testcafe-hammerhead/lib/processing/script/index.js')])
    patch(file,'allowImportExportEverywhere: true,','allowImportExportEverywhere: true, allowAwaitOutsideFunction: true,');
  // Hold a message until its sender's origin is known (see client-bridge.js).
  patch(client,'var data = MessageSandbox._getMessageData(e);\r\n\t        if (data.type !== MessageType.Service) {',
    'var data = MessageSandbox._getMessageData(e);\r\n\t        if (data.type !== MessageType.Service) { if (window.vibetopMessageGate && window.vibetopMessageGate(e, originListener, this)) return null;');
  patch(client,'return data.originUrl;',
    'return window.vibetopMessageOrigin ? window.vibetopMessageOrigin(origin) : origin;');
  patch(client,"return fastApply(contentWindow, 'postMessage', args);",
    "if (this.window.vibetopPostMessage) return this.window.vibetopPostMessage(contentWindow,args,targetUrl); return nativeMethods.postMessage.call(contentWindow,args[0],targetUrl,args[2]);");
  // An extracted native postMessage retains its source Window when called
  // without a Window receiver. The old wrapper incorrectly sent to the caller.
  patch(client,'return methodCallInstrumentation._messageSandbox.postMessage(this, args);',
    'return methodCallInstrumentation._messageSandbox.postMessage(isWindow(this) ? this : (win || window), args);');
  patch(client,'return postMessageFn;\r\n\t                return function () {',
    'return postMessageFn;\r\n\t                return function () { "use strict";');
  // Retain the native no-new/missing-argument guards above this block. The
  // bridge converts all arguments before invoking the routing callback.
  {
    let source=fs.readFileSync(client,'utf8');
    const replacement=`if (window.vibetopCreateWorker) return window.vibetopCreateWorker(args[0],args[1],urlResolver.getBaseUrl(document),function(url,type){ return getProxyUrl(url,{resourceType:stringifyResourceType({isScript:true,isWorkerModule:type==='module'}),charset:type==='module'?'utf-8':undefined}); }); var scriptURL=args[0]; if(typeof scriptURL==="symbol")throw new TypeError("Worker URL cannot be a Symbol"); scriptURL=getProxyUrl(String(scriptURL),{resourceType:stringifyResourceType({isScript:true})}); return new nativeMethods.Worker(scriptURL,args[1]); /* vt-worker-constructor */`;
    if(!source.includes(replacement)) {
      const pattern=/(?:if \(window\.vibetopCreateWorker\) )?return window\.vibetopCreateWorker[\s\S]*?\/\* vt-worker-constructor \*\/|var scriptURL = args\[0\];[\s\S]*?return worker;/g;
      if([...source.matchAll(pattern)].length!==1)throw new Error('Worker constructor patch anchor changed');
      fs.writeFileSync(client,source.replace(pattern,()=>replacement));
    }
  }
  patch(client,'MessageSandbox.prototype._onMessage = function (e) {',
    'MessageSandbox.prototype._onMessage = function (e) { if (isMessageEvent(e) && nativeMethods.messageEventOriginGetter.call(e) !== this.window.location.origin) return;');
  patch(client,'MessageSandbox.prototype.sendServiceMsg = function (msg, targetWindow, ports) {',
    'MessageSandbox.prototype.sendServiceMsg = function (msg, targetWindow, ports) { try { if (targetWindow.location.origin !== this.window.location.origin) return false; } catch (_) { return false; }');
  for(const file of [client,engineRequire.resolve('testcafe-hammerhead/lib/processing/script/node-builder.js')])
    patch(file,'function createGetProxyUrlMethodCall(arg, baseUrl) {',
      "function createGetProxyUrlMethodCall(arg, baseUrl) { if (arg.type === 'CallExpression' && arg.callee.type === 'Identifier' && arg.callee.name === '__get$ProxyUrl') return arg;");
  for(const file of [client,engineRequire.resolve('testcafe-hammerhead/lib/processing/script/transformers/dynamic-import.js')]) {
    const source=fs.readFileSync(file,'utf8');
    const start=source.indexOf("name: 'dynamic-import',"),end=source.indexOf('run:',start);
    if(start<0 || end<start)throw new Error('Dynamic import transformer anchor changed');
    const before=source.slice(start,end);
    const condition="condition: function (node) { return !(node.source.type === 'CallExpression' && node.source.callee.type === 'Identifier' && node.source.callee.name === '__get$ProxyUrl'); },";
    if(!before.includes(condition)) {
      const old=file===client?'condition: function () { return true; },':'condition: () => true,';
      if(before.split(old).length!==2)throw new Error('Dynamic import condition anchor changed');
      patch(file,before,before.replace(old,()=>condition));
    }
  }
  const transform=engineRequire.resolve('testcafe-hammerhead/lib/processing/script/transform.js');
  patch(transform,"resolver ? (0, url_1.parseProxyUrl)(resolver('./')).destUrl : ''",
    "resolver ? (resolver.vtModuleBase || (0, url_1.parseProxyUrl)(resolver('./')).destUrl) : ''");
  patch(client,"resolver ? parseProxyUrl$1(resolver('./')).destUrl : ''",
    "resolver ? (resolver.vtModuleBase || parseProxyUrl$1(resolver('./')).destUrl) : ''");

  for(const file of [client,transform]) {
    const marker = 'node.property.type === "PrivateIdentifier"';
    if (!fs.readFileSync(file,'utf8').includes(marker)) {
      const anchor = 'function findTransformer(node, parent) {';
      patch(file,anchor,anchor + ' if (node.type === "MemberExpression" && node.property.type === "PrivateIdentifier") return null;');
    }
    const fieldGuard = 'if (parent && parent.type === "PropertyDefinition" && parent.key === node && !parent.computed) return null;';
    if (!fs.readFileSync(file,'utf8').includes(fieldGuard)) {
      const anchor = 'function findTransformer(node, parent) {';
      patch(file,anchor,anchor + ' ' + fieldGuard);
    }
  }
  for(const file of [client,hhRequire.resolve('esotope-hammerhead')]) {
    const oldMember="_.js += ($expr.optional ? '?.' : '.') + $prop.name;";
    const privateMember="_.js += ($expr.optional ? '?.' : '.') + ($prop.type === 'PrivateIdentifier' ? '#' : '') + $prop.name;";
    patch(file,fs.readFileSync(file,'utf8').includes(oldMember)?oldMember:privateMember,
      "_.js += (($expr.vtOwnOptional === undefined ? $expr.optional : $expr.vtOwnOptional) ? '?.' : '.') + ($prop.type === 'PrivateIdentifier' ? '#' : '') + $prop.name;");
    // The same conditional also appears for optional calls. Replace every
    // unpatched occurrence with a checked count, retaining builder-created ASTs.
    let generator=fs.readFileSync(file,'utf8');
    if(generator.includes('if ($expr.optional)')) {
      if(generator.split('if ($expr.optional)').length!==3)throw new Error('Optional generator patch anchor changed');
      generator=generator.replaceAll('if ($expr.optional)','if ($expr.vtOwnOptional === undefined ? $expr.optional : $expr.vtOwnOptional)');
      fs.writeFileSync(file,generator);
    }
    // Async generator methods: the generator wrote either "*" or "async ",
    // never both, so a regenerated `async *m(){await x}` became a syntax
    // error (TradingView's chart never started).
    patch(file,"_.js += exprJs + '*' + keyJs;","_.js += exprJs + ($expr.value.async ? 'async ' : '') + '*' + keyJs;");
    patch(file,"keyJs = '*' + keyJs;","keyJs = ($val.async ? 'async ' : '') + '*' + keyJs;");
    patch(file,"_.js += exprJs + keyJs + '=' + _.optSpace;",
      "if (!$val) { _.js += exprJs + keyJs + ';'; return; }\n        _.js += exprJs + keyJs + '=' + _.optSpace;");
  }
  const normalizeSpecifier=require('./module-specifier.cjs').normalizeModuleSpecifier.toString();
  for(const [file,anchor,variable] of [
    [client,'function getProxyUrlLiteral(source, resolver) {','source.value'],
    [engineRequire.resolve('testcafe-hammerhead/lib/processing/script/node-builder.js'),'function getProxyUrlLiteral(source, resolver) {','source.value'],
    [client,'value: function (url, baseUrl) {','url']
  ]) {
    const old=anchor+' if (typeof '+variable+' === "string" && !/^(?:[./]|[a-zA-Z][a-zA-Z0-9+.-]*:)/.test('+variable+')) return '+(variable==='url'?'url':'source')+';';
    const replacement=anchor+' if(typeof '+variable+' === "string") { var vtSpecifier=('+normalizeSpecifier+')('+variable+(file===client?',nativeMethods.URL':'')+'); if(vtSpecifier===null)return '+(variable==='url'?'url':'source')+'; '+variable+'=vtSpecifier; }';
    const current=fs.readFileSync(file,'utf8');
    const begin=current.indexOf(anchor);
    const tail=variable==='url'?'var storedBaseUrl =':file===client?'var proxyUrl = resolver':'const proxyUrl = resolver';
    const finish=current.indexOf(tail,begin);
    if(begin<0 || finish<begin || current.indexOf(anchor,begin+anchor.length)!==-1)throw new Error('Module normalizer patch anchor changed');
    const prior=current.slice(begin,finish);
    if(!prior.startsWith(anchor))throw new Error('Module normalizer patch changed');
    fs.writeFileSync(file,current.slice(0,begin)+replacement+'\n    '+current.slice(finish));
  }
  patch(client,'MessageSandbox.prototype.postMessage = function (contentWindow, args) {',
    'MessageSandbox.prototype.postMessage = function (contentWindow, args) { if (args[1] && typeof args[1] === "object") { var options = args[1]; args[1] = options.targetOrigin || getOriginHeader(); args[2] = options.transfer; }');
  const rewrite=require('./import-map.cjs').rewriteImportMap;
  patch(client,'DomProcessor.prototype._processScriptElement = function (script, urlReplacer) {',
    'DomProcessor.prototype._processScriptElement = function (script, urlReplacer) { if ((this.adapter.getAttr(script,"type") || "").trim().toLowerCase() === "importmap") { try { this.adapter.setScriptContent(script, ('+rewrite.toString()+')(this.adapter.getScriptContent(script),urlReplacer)); } catch(e) {} return; }');
}
module.exports={patchModernScripts};

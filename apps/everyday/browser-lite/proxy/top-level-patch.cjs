'use strict';
// A Browser Lite tab is an iframe inside Lite's UI, so a page saw
// window.top !== window.self, a parent in another origin, and the UI as its
// document.referrer. Sites read that as "embedded" and change: claude.ai
// switches to its embedded mode with no sidebar. A real tab is top-level, so
// emulate it for page code:
// - `x.top` and `x.parent` are instrumented like `location`. For a window in
//   this tab, top is the tab's root page and the root's parent is itself, so
//   page code can no longer reach Lite's UI through them either.
// - document.referrer is '' when the native referrer is not a proxied page
//   (the tab was opened from the UI), as for a typed address.
// The tab root is found natively: walk up while location.ancestorOrigins are
// realms of this user (bl-u<uid>-…, same parent domain). Without
// ancestorOrigins (Firefox) the native values stay.
// Hammerhead's own code is not processed, and its window.top/window.parent
// were already redirected by Rammerhead's build, so the engine is unaffected.
// Bracket access below keeps Rammerhead's `window.top` substitutions off it.
const fs=require('node:fs');
function tabRoot() {
  if (window.vibetopTabRoot !== void 0) return window.vibetopTabRoot;
  var root = null;
  try {
    var here = window["location"], ancestors = here.ancestorOrigins, m = /^(bl-u\d+-)[^.]+(\..+)$/.exec(here.hostname);
    if (ancestors && m) {
      var w = window, i = 0;
      while (i < ancestors.length) {
        var o = String(ancestors[i]);
        if (o.indexOf('https://' + m[1]) !== 0 || o.slice(-m[2].length) !== m[2] || o.slice(8).indexOf('/') !== -1) break;
        w = w["parent"]; i++;
      }
      root = w;
    }
  } catch (e) { root = null; }
  Object.defineProperty(window, 'vibetopTabRoot', {value: root, configurable: true});
  return root;
}
const ACCESSORS=" top: { condition: isWindow, get: function (owner) { var r = vtTabRoot(); return r || owner[\"top\"]; }, set: function (owner, value) { try { owner[\"top\"] = value; } catch (e) {} return value; } },"+
  " parent: { condition: isWindow, get: function (owner) { var r = vtTabRoot(); return r && owner === r ? r : owner[\"parent\"]; }, set: function (owner, value) { owner[\"parent\"] = value; return value; } },";
// Bare `top` and `parent` (not `x.top`) are free identifiers that the
// instrumentation above never sees: `for (o = window; o !== top; o = o.parent)`
// (LiveIntent's ID module, loaded by Prebid on weather.com) compared the native
// top with the instrumented parent, never matched, and grew an array until the
// tab ran out of memory, freezing all of Vibetop on iPhone. Rewrite them to
// __vt$top(top) / __vt$parent(parent). The helper maps only the native window
// to the tab root, so a local variable named `top` passes through unchanged.
function vtTopParentTransformer(Syntax) {
  var NAMES = {top: '__vt$top', parent: '__vt$parent'};
  return {
    name: 'vt-top-parent-get',
    nodeReplacementRequireTransform: false,
    nodeTypes: Syntax.Identifier,
    condition: function (node, parent) {
      if (!parent || !Object.prototype.hasOwnProperty.call(NAMES, node.name)) return false;
      var t = parent.type;
      if (t === Syntax.VariableDeclarator && parent.id === node) return false;
      if ((t === Syntax.AssignmentExpression || t === Syntax.AssignmentPattern) && parent.left === node) return false;
      if ((t === Syntax.FunctionExpression || t === Syntax.FunctionDeclaration || t === Syntax.ClassDeclaration || t === Syntax.ClassExpression) && parent.id === node) return false;
      if ((t === Syntax.FunctionExpression || t === Syntax.FunctionDeclaration || t === Syntax.ArrowFunctionExpression) && parent.params.indexOf(node) !== -1) return false;
      if (t === Syntax.MemberExpression && parent.property === node && !parent.computed) return false;
      if ((t === Syntax.Property || t === Syntax.MethodDefinition || t === 'PropertyDefinition') && parent.key === node && !parent.computed) return false;
      if (t === Syntax.Property && parent.shorthand) return false;
      if (t === Syntax.UpdateExpression || t === Syntax.RestElement || t === Syntax.ArrayPattern || t === Syntax.ObjectPattern) return false;
      if (t === Syntax.LabeledStatement || t === Syntax.BreakStatement || t === Syntax.ContinueStatement || t === Syntax.CatchClause) return false;
      if (t === Syntax.ExportSpecifier || t === Syntax.ImportSpecifier || t === Syntax.ImportDefaultSpecifier || t === Syntax.ImportNamespaceSpecifier) return false;
      if ((t === Syntax.ForInStatement || t === Syntax.ForOfStatement) && parent.left === node) return false;
      if (t === Syntax.UnaryExpression && (parent.operator === 'typeof' || parent.operator === 'delete')) return false;
      if (t === Syntax.CallExpression && parent.callee.type === Syntax.Identifier && (parent.callee.name === '__vt$top' || parent.callee.name === '__vt$parent')) return false;
      return true;
    },
    run: function (node) {
      return {type: Syntax.CallExpression, callee: {type: Syntax.Identifier, name: NAMES[node.name]}, arguments: [{type: Syntax.Identifier, name: node.name}], optional: false};
    }
  };
}
// Page-visible helpers for the rewritten identifiers, defined on every window
// the client runs in (bracket access: see the note at the top).
const HELPERS=" try { Object.defineProperty(window, '__vt$top', {configurable: true, value: function (v) { var r = vtTabRoot(); return r && v === window[\"top\"] ? r : v; }});"+
  " Object.defineProperty(window, '__vt$parent', {configurable: true, value: function (v) { var r = vtTabRoot(); return r && window === r && v === window[\"parent\"] ? r : v; }}); } catch (e) {}";
function patchTopLevel(engineRequire) {
  const lib=name=>engineRequire.resolve('testcafe-hammerhead/lib/'+name);
  const marker='/* vt-top-level */';
  const edit=(code,from,to,file)=>{
    if(code.split(from).length!==2)throw new Error('Top-level patch anchor changed: '+file+': '+JSON.stringify(from));
    return code.replace(from,()=>to);
  };
  const server=lib('processing/script/instrumented.js');
  let code=fs.readFileSync(server,'utf8');
  if(!code.includes(marker)) fs.writeFileSync(server,edit(code,"    'location',\n];","    'location',\n    'top',\n    'parent',\n]; "+marker,server));
  const transformers=lib('processing/script/transformers/index.js');
  code=fs.readFileSync(transformers,'utf8');
  if(!code.includes('vt-top-parent-get'))
    fs.writeFileSync(transformers,edit(code,"    location_get_1.default,\n","    location_get_1.default,\n    ("+vtTopParentTransformer.toString()+")(esotope_hammerhead_1.Syntax),\n",transformers));
  const client=lib('client/hammerhead.js');
  code=fs.readFileSync(client,'utf8');
  if(!code.includes(marker)) {
    code=edit(code,"    'location',\r\n\t];","    'location', 'top', 'parent',\r\n\t]; "+marker+" var vtTabRoot = "+tabRoot.toString().replace(/\n\s*/g,' ')+";",client);
    code=edit(code,'set: PropertyAccessorsInstrumentation._setLocation,\r\n\t        },','set: PropertyAccessorsInstrumentation._setLocation,\r\n\t        },'+ACCESSORS,client);
    code=edit(code,"var referrer = getDestinationUrl(nativeMethods.documentReferrerGetter.call(this));",
      "var vtNativeReferrer = nativeMethods.documentReferrerGetter.call(this); if (vtNativeReferrer && !parseProxyUrl(vtNativeReferrer)) return ''; var referrer = getDestinationUrl(vtNativeReferrer);",client);
    fs.writeFileSync(client,code);
  }
  if(!code.includes('vt-top-parent-get')) {
    const list=/forOfTransformer,(\r?\n\t    )transformer\$9,/;
    if(code.split(list).length!==3)throw new Error('Top-level patch anchor changed: '+client+': transformer list');
    code=code.replace(list,(_m,gap)=>'forOfTransformer,'+gap+'transformer$9, ('+vtTopParentTransformer.toString()+')(Syntax_1),');
    code=edit(code,"]; "+marker,"]; "+marker+HELPERS,client);
    fs.writeFileSync(client,code);
  }
}
module.exports={patchTopLevel,tabRoot,vtTopParentTransformer};

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {engineRequire}=require('./engine.cjs');
const acorn=engineRequire('acorn-hammerhead');
// A page's history.back()/go() reaches the wrapper through each tab's onHistory
// callback, which calls the wrapper's history() traversal. newTab once took a
// "history" option that shadowed that function, so every page-initiated back
// (X's own back arrow, for one) threw "history is not a function".
function bindings(node,out=new Set()) {
  if(!node||typeof node!=='object')return out;
  if(node.type==='Identifier'&&node.__binding)out.add(node.name);
  for(const value of Object.values(node))if(value&&typeof value==='object')bindings(value,out);
  return out;
}
function mark(pattern) {
  if(!pattern)return;
  if(pattern.type==='Identifier')pattern.__binding=true;
  else if(pattern.type==='ObjectPattern')for(const p of pattern.properties)mark(p.type==='RestElement'?p.argument:p.value);
  else if(pattern.type==='ArrayPattern')for(const p of pattern.elements)mark(p);
  else if(pattern.type==='AssignmentPattern')mark(pattern.left);
  else if(pattern.type==='RestElement')mark(pattern.argument);
}
function walk(node,visit) {
  if(!node||typeof node!=='object')return;
  visit(node);
  for(const value of Object.values(node))if(value&&typeof value==='object')walk(value,visit);
}
test('no function that calls history() shadows the wrapper traversal',()=>{
  const source=fs.readFileSync(path.join(__dirname,'wrapper.js'),'utf8');
  const ast=acorn.parse(source,{ecmaVersion:2022});
  let traversal=0;const shadowing=[];
  walk(ast,node=>{
    if(node.type==='FunctionDeclaration'&&node.id?.name==='history')traversal++;
    if(/Function/.test(node.type)&&!(node.type==='FunctionDeclaration'&&node.id?.name==='history')) {
      for(const param of node.params)mark(param);
      walk(node.body,inner=>{if(inner.type==='VariableDeclarator')mark(inner.id);});
      let calls=false;walk(node.body,inner=>{if(inner.type==='CallExpression'&&inner.callee.type==='Identifier'&&inner.callee.name==='history')calls=true;});
      if(calls&&node.params.some(param=>bindings(param).has('history')))shadowing.push(node.id?.name||'(anonymous)');
    }
  });
  assert.equal(traversal,1,'the wrapper history() traversal is missing');
  assert.deepEqual(shadowing,[]);
  assert.ok(/onHistory:delta=>history\(delta,tab\)/.test(source),'tabs no longer route page history requests to history()');
});

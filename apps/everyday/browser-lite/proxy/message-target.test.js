'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const target=require('./message-target.js');
const base={documentOrigin:'https://a.example',physicalOrigin:'https://a.proxy.example'};
test('exact native message destinations use only sender-known relationships',()=>{
 assert.equal(target({...base,expected:'/',samePhysical:true}),base.physicalOrigin);
 assert.equal(target({...base,expected:'https://b.example',known:()=>({original:'https://b.example',physical:'https://b.proxy.example'})}),'https://b.proxy.example');
 assert.equal(target({...base,expected:'https://a.example',parent:()=>({original:'https://a.example',physical:'https://parent.proxy.example'})}),'https://parent.proxy.example');
 assert.equal(target({...base,expected:'https://b.example',child:origin=>{assert.equal(origin,'https://b.example');return 'https://child.proxy.example';}}),'https://child.proxy.example');
});
test('unresolved, stale, opaque and failed mappings use an undeliverable exact origin',()=>{
 const discard='https://vibetop-discard.invalid';
 assert.equal(target({...base,expected:'https://b.example',samePhysical:true}),discard);
 assert.equal(target({...base,expected:'chrome-extension://opaque'}),discard);
 assert.equal(target({...base,expected:'https://ui.proxy.example'}),discard);
 assert.equal(target({...base,expected:'https://b.example',known:()=>({original:'https://c.example',physical:'https://c.proxy.example'})}),discard);
 assert.equal(target({...base,expected:'https://b.example',child:()=>{throw new Error('offline');}}),discard);
 assert.throws(()=>target({...base,expected:'not a URL'}),{name:'SyntaxError'});
 assert.equal(target({...base,expected:'*',known:()=>{throw new Error('must not probe');}}),'*');
});
test('a popup or its opener resolves through the top relation, after child and sibling',()=>{
 assert.equal(target({...base,expected:'https://b.example',top:origin=>{assert.equal(origin,'https://b.example');return 'https://top.proxy.example';}}),'https://top.proxy.example');
 assert.equal(target({...base,expected:'https://b.example',child:()=>null,sibling:()=>null,top:()=>'https://top.proxy.example'}),'https://top.proxy.example');
 assert.equal(target({...base,expected:'https://b.example',child:()=>'https://child.proxy.example',top:()=>{throw new Error('not consulted');}}),'https://child.proxy.example');
});

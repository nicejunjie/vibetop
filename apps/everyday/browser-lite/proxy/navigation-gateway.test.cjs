'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BrowserGateway}=require('./gateway.cjs');
const {RealmOrigins}=require('./realm-origins.cjs');
const {NavigationTransactions}=require('./navigation.cjs');
function gateway() {
 const g=Object.create(BrowserGateway.prototype);
 Object.assign(g,{registry:new RealmOrigins({uid:1000,profile:'a'.repeat(32),secret:'test',domain:'proxy.example.com'}),
  tabs:new Map(),tabTokens:new Map(),tickets:new Map(),admissions:new Map(),navigations:new NavigationTransactions()});
 g.url=(destination,options)=>g.registry.register(destination,options.context)+'/page/'+encodeURIComponent(destination);
 return g;
}
test('new epoch revokes an approved POST before its delayed entry can execute',()=>{
 const g=gateway();g.open('https://a.example',{tabId:'one'});
 const owner={tabId:'one',epoch:1,sourceOrigin:'https://a.example'};
 const challenge=g.navigations.capture({...owner,url:'https://b.example',method:'POST',body:Buffer.from('value=1')});
 const opened=g.approveNavigation(challenge,owner);
 const entryTicket=new URL(opened.entry).searchParams.get('ticket');
 const entry=g.tickets.get(entryTicket);assert.equal(entry.epoch,2);
 const execution=entry.execution;
 g.admissions.set('old',[{...entry}]);
 g.open('https://c.example',{tabId:'one',epoch:3});
 assert.equal(g.tickets.has(entryTicket),false);assert.equal(g.admissions.has('old'),false);
 assert.throws(()=>g.navigations.dispatch(execution.ticket,execution.owner));
 assert.equal(g.navigations.bytes,0);
});
test('invalid destination does not partly advance a live tab',()=>{
 const g=gateway();g.open('https://a.example',{tabId:'one'});const prior=g.tabs.get('one');
 assert.throws(()=>g.open('file:///private',{tabId:'one',epoch:2}));
 assert.equal(g.tabs.get('one'),prior);assert.equal(g.tabTokens.get(prior.token),prior);
});

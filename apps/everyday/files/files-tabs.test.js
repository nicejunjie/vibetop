'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const html = fs.readFileSync(__dirname + '/files.html', 'utf8');
function harness() {
  const requests = [];
  const c = vm.createContext({
    _loaded: true, _saving: false, _suppress: false, _rev: 1,
    _lastSaved: 'parent', _pushStreak: 0, current: 'parent', adopted: [],
    stateStr() { return c.current; }, renderTabs() {}, norm: p => p,
    reconcile(s) { c.adopted.push(s); c.current = JSON.stringify({paths: s.paths, active: s.active}); c._lastSaved = c.current; },
    fetch(url, options) { return new Promise((resolve, reject) => requests.push({url, options, resolve, reject})); }
  });
  for (const name of ['persist', 'tick']) {
    const start = html.indexOf('  function ' + name + '(');
    const end = html.indexOf('\n  }', start) + 4;
    vm.runInContext(html.slice(start, end), c);
  }
  const reply = async (i, data, status = 200) => {
    requests[i].resolve({status, json: () => Promise.resolve(data)});
    for (let n = 0; n < 10; n++) await Promise.resolve();
  };
  return {c, requests, reply};
}
test('a tab read finishing after folder navigation cannot restore the parent', async () => {
  const {c, reply} = harness();
  c.tick();
  c.current = 'child';
  await reply(0, {paths: ['parent'], active: 0, rev: 1});
  assert.equal(c.current, 'child');
  assert.equal(c.adopted.length, 0);
});
test('tab saves serialize and flush navigation with the acknowledged revision', async () => {
  const {c, requests, reply} = harness();
  c.current = JSON.stringify({paths: ['child'], active: 0});
  c.persist();
  c.current = JSON.stringify({paths: ['grandchild'], active: 0});
  c.persist(); c.tick();
  assert.equal(requests.length, 1);
  await reply(0, {rev: 2});
  assert.equal(requests.length, 2);
  assert.deepEqual(JSON.parse(requests[1].options.body), {paths: ['grandchild'], active: 0, rev: 2});
});
test('a failed save waits for the next tick instead of retrying in a loop', async () => {
  const {c, requests, reply} = harness();
  c.current = JSON.stringify({paths: ['child'], active: 0});
  c.persist();
  requests[0].reject(new Error('offline'));
  for (let n = 0; n < 10; n++) await Promise.resolve();
  assert.equal(c._saving, false);
  assert.equal(requests.length, 1);
});
test('a refused tab save remains pending and cannot pull the old directory back', async () => {
  const {c, requests, reply}=harness();
  c.current=JSON.stringify({paths:['child'],active:0});c.persist();
  await reply(0,{rev:999},500);
  assert.equal(c._rev,1);assert.equal(c._lastSaved,null);
  c._pushStreak=5;c.tick();
  assert.equal(requests[1].options.method,'POST');assert.equal(c.adopted.length,0);
});
test('hidden directory tabs load only when selected, including paths changed remotely', () => {
  const made=[];
  const c=vm.createContext({seq:0,HOME:'/home/test',tabs:[],active:null,location:{origin:'https://test'},
    framesEl:{appendChild(f){made.push(f);}},
    document:{createElement(){return {src:'',setAttribute(){},classList:{toggle(){}},contentWindow:{location:{pathname:'blank'},postMessage(){}}};}},
    tabUrl:p=>'/filesx.html#'+p,encPath:p=>p,renderTabs(){},persist(){},focusActive(){}});
  for(const name of ['makeTab','show','navigateTab']){
    const start=html.indexOf('  function '+name+'('),end=html.indexOf('\n  }',start)+4;vm.runInContext(html.slice(start,end),c);
  }
  const a=c.makeTab('/a'),b=c.makeTab('/b');c.tabs.push(a,b);assert.equal(a.frame.src,'');assert.equal(b.frame.src,'');
  c.show(a);assert.equal(a.frame.src,'/filesx.html#/a');assert.equal(b.frame.src,'');
  c.navigateTab(b,'/new');assert.equal(b.frame.src,'');c.show(b);assert.equal(b.frame.src,'/filesx.html#/new');
});

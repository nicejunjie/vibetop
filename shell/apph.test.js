const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'apph.js'), 'utf8');

function topEdgeClass(version, standalone) {
  const classes = new Set();
  const navigator = {
    userAgent: `Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/${version} Mobile/15E148 Safari/604.1`,
    standalone,
  };
  const matchMedia = () => ({ matches: standalone });
  const document = {
    readyState: 'loading',
    documentElement: {
      classList: {
        toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
      },
    },
    addEventListener() {},
  };
  const context = {
    window: { navigator, matchMedia }, navigator, matchMedia, document,
    localStorage: { getItem() { return null; } },
    location: { hash: '' },
    addEventListener() {}, setTimeout() {}, clearTimeout() {},
  };
  vm.runInNewContext(source, context, { filename: 'apph.js' });
  return classes.has('ios27-standalone');
}

test('top-edge mitigation applies only to iOS 27 installed web apps', () => {
  assert.equal(topEdgeClass('27.0', true), true);
  assert.equal(topEdgeClass('27.0', false), false);
  assert.equal(topEdgeClass('26.6.1', true), false);
});

test('standalone height releases a transient oversize after the keyboard closes', () => {
  const listeners = {};
  const values = {};
  const root = {
    clientHeight: 894,
    classList: { toggle() {} },
    style: { setProperty(name, value) { values[name] = value; } },
  };
  const vv = { height: 894, addEventListener() {} };
  const navigator = { userAgent: 'iPhone Version/27.0', standalone: true };
  const win = { navigator, visualViewport: vv, innerWidth: 440,
    matchMedia() { return { matches: true }; }, addEventListener() {} };
  const doc = { readyState: 'loading', documentElement: root,
    addEventListener(name, fn) { listeners[name] = fn; } };
  const context = { window: win, navigator, document: doc,
    matchMedia: win.matchMedia, visualViewport: vv, screen: { height: 956 },
    location: { hash: '' }, localStorage: { getItem() { return null; } },
    addEventListener() {}, setTimeout() {}, clearTimeout() {},
  };
  vm.runInNewContext(source, context, { filename: 'apph.js' });
  listeners.DOMContentLoaded();
  assert.equal(values['--app-h'], '894px');

  // On resume, iOS can briefly include the 62px opaque status-bar strip.
  root.clientHeight = vv.height = 956;
  listeners.DOMContentLoaded();
  assert.equal(values['--app-h'], '956px');
  root.clientHeight = vv.height = 894;
  listeners.DOMContentLoaded();
  assert.equal(values['--app-h'], '894px');

  vv.height = 480; // keyboard only shrinks the visual viewport
  listeners.DOMContentLoaded();
  assert.equal(values['--app-h'], '894px');

  // iOS also has a shell-scrolled keyboard mode where clientHeight shrinks.
  root.clientHeight = 655;
  vv.height = 508;
  listeners.DOMContentLoaded();
  assert.equal(values['--app-h'], '894px');
});


function edgeHarness(version = '27.0') {
  const events = {}, paints = [], classes = new Set(), timers = new Map();
  let clock = 0, nextId = 0;
  const edge = {style:{display:''}}, values = {};
  const navigator = {userAgent:'iPhone Version/'+version,standalone:false};
  const mode = {matches:false};
  const root = {clientHeight:800,classList:{toggle(n,on){on?classes.add(n):classes.delete(n);}},style:{setProperty(n,v){values[n]=v;}}};
  const doc = {readyState:'loading',hidden:false,documentElement:root,
    getElementById(){return edge;},addEventListener(n,fn){events[n]=fn;}};
  const win = {navigator,innerWidth:390,matchMedia:()=>mode};
  vm.runInNewContext(source, {window:win,navigator,document:doc,matchMedia:win.matchMedia,
    screen:{height:844},location:{hash:''},localStorage:{getItem(){return null;}},
    addEventListener(n,fn){events[n]=fn;},
    setTimeout(fn,delay){const id=++nextId;timers.set(id,{fn,at:clock+delay});return id;},
    clearTimeout(id){timers.delete(id);},requestAnimationFrame(fn){paints.push(fn);}});
  function advance(ms) {
    const until=clock+ms;
    while(true){const entry=[...timers].filter(([,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!entry)break;clock=entry[1].at;timers.delete(entry[0]);entry[1].fn();}
    clock=until;
  }
  return {events,paints,classes,edge,values,navigator,mode,doc,advance};
}
test('resume re-detects installed mode and coalesces lifecycle/viewport refreshes', () => {
  const h=edgeHarness();
  assert.equal(h.classes.has('ios27-standalone'),false);
  h.mode.matches=true; // independent from navigator.standalone
  h.events.pageshow();h.events.focus();h.events.resize();
  assert.equal(h.classes.has('ios27-standalone'),true);
  assert.equal(h.values['--app-h'],'800px');
  h.advance(119);assert.equal(h.edge.style.display,'');
  h.advance(1);assert.equal(h.edge.style.display,'none');assert.equal(h.paints.length,1);
  h.paints.shift()();assert.equal(h.edge.style.display,'none');
  h.paints.shift()();assert.equal(h.edge.style.display,'');
  h.advance(1800);assert.equal(h.paints.length,0,'height settling does not repeatedly remove the edge');
});
test('edge restores without animation frames, and stale callbacks cannot disturb a new cycle', () => {
  const h=edgeHarness();h.navigator.standalone=true;
  h.events.pageshow();h.advance(120);
  const old=h.paints.shift();assert.equal(h.edge.style.display,'none');
  h.advance(250);assert.equal(h.edge.style.display,'');
  h.events['vibetop:wake']();h.advance(120);assert.equal(h.edge.style.display,'none');
  old();assert.equal(h.edge.style.display,'none');assert.equal(h.paints.length,1);
  h.paints.shift()();h.paints.shift()();assert.equal(h.edge.style.display,'');
});
test('hiding or navigating away restores a pending edge synchronously', () => {
  const h=edgeHarness();h.navigator.standalone=true;
  h.events.pageshow();h.advance(120);h.paints.shift()();
  h.doc.hidden=true;h.events.visibilitychange();assert.equal(h.edge.style.display,'');
  h.paints.shift()();h.advance(2000);assert.equal(h.paints.length,0);
  h.doc.hidden=false;h.events.visibilitychange();h.advance(120);
  assert.equal(h.edge.style.display,'none');h.events.pagehide();assert.equal(h.edge.style.display,'');
});
test('ordinary Safari and earlier iOS never toggle the edge', () => {
  for(const version of ['26.6','27.0']) {
    const h=edgeHarness(version);h.navigator.standalone=version==='26.6';
    h.events.pageshow();h.events.resize();h.advance(2000);
    assert.equal(h.edge.style.display,'');assert.equal(h.paints.length,0);
  }
});

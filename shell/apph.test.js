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
  // The shell does not grow into it.
  root.clientHeight = vv.height = 956;
  listeners.DOMContentLoaded();
  assert.equal(values['--app-h'], '870px');
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

// A launch iOS performs while the app is hidden can leave the web view covering
// the whole screen for the page's life (field report 2026-11-11: terminal 721pt
// tall instead of 659, usage strips behind the status bar).
function coverHarness(opts) {
  const values = {}, store = Object.assign({}, opts.store), ticks = [];
  const classes = new Set();
  const root = { clientHeight: opts.h, classList: { toggle(n, on) { on ? classes.add(n) : classes.delete(n); } },
    style: { setProperty(n, v) { values[n] = v; } } };
  const vv = { height: opts.h, addEventListener() {} };
  const navigator = { userAgent: opts.ua || 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Version/27.0.1 Mobile/15', standalone: true };
  const win = { navigator, visualViewport: vv, innerWidth: opts.w || 440, innerHeight: opts.h,
    matchMedia() { return { matches: true }; } };
  const body = { appendChild() {} };
  const doc = { readyState: 'complete', hidden: false, documentElement: root, body,
    createElement() { return { style: {}, parentNode: body,
      getBoundingClientRect() { return { height: opts.sat || 0 }; } }; },
    getElementById() { return null; }, addEventListener() {} };
  vm.runInNewContext(source, { window: win, navigator, document: doc, matchMedia: win.matchMedia,
    visualViewport: vv, screen: { height: opts.screen || 956, width: 440 }, location: { hash: '' },
    localStorage: { getItem(k) { return k in store ? store[k] : null; }, setItem(k, v) { store[k] = String(v); } },
    addEventListener() {}, setTimeout() {}, clearTimeout() {},
    setInterval(fn) { ticks.push(fn); } }, { filename: 'apph.js' });
  return { values, classes, store, root, vv, win, tick() { ticks.forEach(fn => fn()); } };
}
test('a full-screen web view: the shell moves below the status bar', () => {
  const h = coverHarness({ h: 956, sat: 62 });
  assert.equal(h.values['--app-top'], '86px');
  assert.equal(h.values['--app-h'], '870px');
});
test('with no safe-area report, the bar height learned on a normal launch is used', () => {
  const normal = coverHarness({ h: 894 });
  assert.equal(normal.values['--app-h'], '894px');
  assert.equal(normal.store['vt:statusbar-h'], '62');
  const covered = coverHarness({ h: 956, store: normal.store });
  assert.equal(covered.values['--app-h'], '870px');
});
test('the cover is found and released with no event at all (watchdog)', () => {
  const h = coverHarness({ h: 894 });
  h.root.clientHeight = h.vv.height = h.win.innerHeight = 956;
  h.tick();
  assert.equal(h.values['--app-top'], '86px');
  assert.equal(h.values['--app-h'], '870px');
  h.root.clientHeight = h.vv.height = h.win.innerHeight = 894;
  h.tick();
  assert.equal(h.values['--app-top'], '0px');
  assert.equal(h.values['--app-h'], '894px');
});
test('no cap in landscape, off iOS, or with nothing known about the bar', () => {
  // landscape iPhone: full height is legitimate, there is no status bar
  const land = coverHarness({ h: 440, w: 956, sat: 0, store: { 'vt:statusbar-h': '62' } });
  assert.equal(land.values['--app-h'], '440px');
  const android = coverHarness({ h: 956, sat: 30, ua: 'Mozilla/5.0 (Linux; Android 16) Chrome/140 Mobile' });
  assert.equal(android.values['--app-h'], '956px');
  const unknown = coverHarness({ h: 956 });
  assert.equal(unknown.values['--app-h'], '956px');
});
test('the keyboard does not look like a covered status bar', () => {
  const h = coverHarness({ h: 894 });
  h.vv.height = 480; h.tick();
  assert.equal(h.values['--app-h'], '894px');
});
test('a normal launch gets no top offset, and the page carries the offset rule', () => {
  const h = coverHarness({ h: 894, sat: 0 });
  assert.equal(h.values['--app-top'], '0px');
  const html = fs.readFileSync(path.join(__dirname, 'desktop.html'), 'utf8');
  assert.match(html, /body \{ margin-top: var\(--app-top, 0px\); \}/);
  assert.match(html, /html \{ height: calc\(var\(--app-h, 100svh\) \+ var\(--app-top, 0px\)\); \}/);
});
test('a page never reloads itself over this state (reloads were logged not to clear it)', () => {
  assert.equal(/location\.reload/.test(source), false);
});
test('the strip behind the status bar is filled only while the shell is offset', () => {
  const h = coverHarness({ h: 956, sat: 62 });
  assert.equal(h.classes.has('under-statusbar'), true);
  h.root.clientHeight = h.vv.height = h.win.innerHeight = 894;
  h.tick();
  assert.equal(h.classes.has('under-statusbar'), false);
  const html = fs.readFileSync(path.join(__dirname, 'desktop.html'), 'utf8');
  assert.match(html, /html\.under-statusbar #ios27-top-edge \{[^}]*height: calc\(var\(--app-top, 0px\) \+ 11px\)[^}]*background-clip: text/);
});
test('the blur clearance applies only on iOS 27 and only in the full-screen state', () => {
  const old = coverHarness({ h: 956, sat: 62, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Version/26.4 Mobile/15' });
  assert.equal(old.values['--app-top'], '62px');
  assert.equal(old.values['--app-h'], '894px');
  const normal = coverHarness({ h: 894, sat: 0 });
  assert.equal(normal.values['--app-top'], '0px');
  assert.equal(normal.values['--app-h'], '894px');
});

// The permanent fix for the full-screen launch: taking viewport-fit=cover off and
// putting it back makes iOS apply the status-bar inset (device experiment
// 2026-11-26: 956/62 -> 894/0 -> 894/0).
function healHarness(opts = {}) {
  const timers = []; let clock = 0; const sent = [];
  const meta = { content: 'width=device-width,initial-scale=1,viewport-fit=cover' };
  const history = [];
  Object.defineProperty(meta, 'content', {
    get() { return this._c; }, set(v) { this._c = v; history.push(/viewport-fit=(\w+)/.exec(v)[1]); } });
  meta._c = 'width=device-width,initial-scale=1,viewport-fit=cover';
  const root = { clientHeight: 956, classList: { toggle() {} }, style: { setProperty() {} } };
  const vv = { height: 956, addEventListener() {} };
  const navigator = { userAgent: opts.ua || 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Version/27.2 Mobile/15', standalone: true };
  const win = { navigator, visualViewport: vv, innerWidth: opts.w || 440, innerHeight: 956,
    matchMedia() { return { matches: true }; } };
  const body = { appendChild() {}, getBoundingClientRect() { return { top: 0, bottom: 0 }; } };
  const doc = { readyState: 'complete', hidden: !!opts.hidden, documentElement: root, body,
    createElement() { return { style: {}, parentNode: body, getBoundingClientRect() { return { height: 62 }; } }; },
    querySelector() { return meta; }, getElementById() { return null; }, addEventListener() {} };
  // iOS responds to the meta: with `auto` the layout drops to 894 and, once the
  // inset has been applied, it stays there when `cover` comes back.
  const responds = opts.responds !== false;
  function sync() { if (responds && /viewport-fit=auto/.test(meta._c)) root.clientHeight = vv.height = win.innerHeight = 894; }
  vm.runInNewContext(source, { window: win, navigator, document: doc, matchMedia: win.matchMedia,
    visualViewport: vv, screen: { height: 956, width: 440 }, location: { hash: '' },
    localStorage: { getItem() { return null; }, setItem() {} },
    fetch(url, o) { sent.push(JSON.parse(o.body).guard); return { catch() {} }; },
    Date, addEventListener() {}, setInterval() {},
    setTimeout(fn, ms) { timers.push({ fn, at: clock + (ms || 0) }); return timers.length; },
    clearTimeout() {} }, { filename: 'apph.js' });
  function advance(ms) {
    const until = clock + ms;
    for (;;) {
      sync();
      const due = timers.filter(t => t.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers.splice(timers.indexOf(due), 1); clock = due.at; due.fn();
    }
    clock = until;
  }
  return { history, sent, root, advance, meta };
}
test('a full-screen launch is healed by toggling viewport-fit, and cover is restored', () => {
  const h = healHarness();
  h.advance(599);
  assert.deepEqual(h.history, [], 'not before the state has persisted for a moment');
  h.advance(3000);
  assert.deepEqual(h.history, ['auto', 'cover']);
  assert.equal(h.root.clientHeight, 894);
  assert.match(h.meta.content, /viewport-fit=cover/);
  const whys = h.sent.flat().map(e => e.why).filter(w => /^heal/.test(w));
  assert.deepEqual(whys, ['heal-before', 'heal-ok']);
  h.advance(20000);
  assert.deepEqual(h.history, ['auto', 'cover'], 'healed once, never toggled again');
});
test('if iOS does not respond, the heal gives up after three tries and cover is left on', () => {
  const h = healHarness({ responds: false });
  h.advance(60000);
  assert.deepEqual(h.history, ['auto', 'cover', 'auto', 'cover', 'auto', 'cover']);
  assert.match(h.meta.content, /viewport-fit=cover/);
  assert.equal(h.sent.flat().filter(e => e.why === 'heal-failed').length, 3);
});
test('no heal while hidden, in landscape, or off iOS', () => {
  for (const opts of [{ hidden: true }, { w: 2000 }, { ua: 'Mozilla/5.0 (Linux; Android 16) Chrome/140 Mobile' }]) {
    const h = healHarness(opts);
    h.advance(10000);
    assert.deepEqual(h.history, [], JSON.stringify(opts));
  }
});
test('the on-device experiment code is gone', () => {
  assert.equal(/vfExperiment|vfRuler|vfexp-ruler/.test(source), false);
});

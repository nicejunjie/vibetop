const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(__dirname + '/desktop.html', 'utf8');
const start = html.indexOf('(function autoRefresh()');
const end = html.indexOf('\n})();', start);
const source = html.slice(start, end) + '\nwindow.testRefresh = doReload;\n})();';

test('a stalled update offers retry and continuation without a reload loop', () => {
  const timers = [], navigation = [], nodes = [];
  let stopped = false;
  function element() {
    return {children:[], events:{}, parentNode:null, setAttribute(){},
      appendChild(n) { n.parentNode=this; this.children.push(n); },
      addEventListener(name, fn) { this.events[name]=fn; },
      remove() { this.parentNode=null; }};
  }
  const body=element();
  const location={href:'https://vibetop.test/',replace:url=>navigation.push(url),reload:()=>assert.fail('unexpected reload')};
  const window={location,addEventListener(){},stop(){stopped=true;}};
  const storage=new Map();
  vm.runInNewContext(source, {window,location,URL,navigator:{},history:{replaceState(){}},
    document:{body,createElement(){const n=element();nodes.push(n);return n;},addEventListener(){}},
    sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    setTimeout:(fn,ms)=>timers.push({fn,ms}),setInterval(){},clearInterval(){},Date,console});
  window.testRefresh();
  const banner=nodes[0];
  timers.find(t=>t.ms===1200).fn();
  assert.equal(navigation.length,1);
  assert.ok(new URL(navigation[0]).searchParams.has('vtbuild'));
  timers.find(t=>t.ms===12000).fn();
  assert.match(banner.textContent,/longer than expected/);
  assert.deepEqual(banner.children.map(n=>n.textContent),['Retry','Continue for now']);
  banner.children[0].events.click(); assert.equal(navigation.length,2);
  banner.children[1].events.click();
  assert.ok(stopped); assert.equal(banner.parentNode,null);
  window.testRefresh(); assert.equal(nodes.length,3,'continuing must not immediately recreate the banner');
});

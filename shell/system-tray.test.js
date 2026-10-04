const test = require('node:test');
const assert = require('node:assert/strict');
const tray = require('./system-tray.js');

function dom() {
  const nodes = {};
  const stats = { style: { setProperty(name, value) { this[name] = value; } }, children: [],
    querySelectorAll: () => stats.children.slice(),
    appendChild(el) { nodes[el.id] = el; stats.children.push(el); },
  };
  function element(id) {
    return { id, style: {}, textContent: '',
      remove() { delete nodes[this.id]; stats.children.splice(stats.children.indexOf(this), 1); },
    };
  }
  for (const id of ['cpu-n', 'cpu-u', 'cpu-tn', 'cpu-tu', 'mem-ut']) nodes[id] = element(id);
  return { nodes, stats, document: { querySelector: () => stats,
    getElementById: (id) => nodes[id] || null, createElement: () => element('') } };
}
const gpu = (id, percent = 42) => ({ id, name: 'Radeon', percent, temp: 61,
  vram_used_gb: 5, vram_total_gb: 24, integrated: false });

for (const count of [0, 1, 2, 3]) {
  test(`${count} GPUs render the right row count within the same height budget`, () => {
    const h = dom();
    tray.render({ cpu_percent: 23.6, cpu_temp: 52, memory_used_gb: 31.7,
      memory_total_gb: 64, gpus: Array.from({ length: count }, (_, i) => gpu(`0000:0${i}:00.0`)) }, h.document);
    assert.equal(h.stats.children.length, count * 8);
    const font = parseFloat(h.stats.style.fontSize);
    const lineHeight = parseFloat(h.stats.style.lineHeight);
    assert.ok((count + 1) * font * lineHeight + count <= 38, 'rows cannot overflow the 38px tray');
    assert.equal(h.nodes['cpu-n'].textContent, '24');
    assert.equal(h.nodes['mem-ut'].textContent, '32/64');
    if (count) {
      assert.equal(h.nodes['tray-gpu-0-label'].textContent, count === 1 ? 'GPU' : 'GPU1');
      assert.equal(h.nodes['tray-gpu-0-vram'].textContent, '5/24');
    }
    if (count === 2) assert.equal(font, 11);
    if (count === 1) assert.equal(font, 11);
  });
}

test('one/two/one transitions update rows, restore font size, and clear removed devices', () => {
  const h = dom();
  tray.render({ gpus: [gpu('a')] }, h.document);
  assert.equal(h.stats.style.fontSize, '11px');
  tray.render({ gpus: [gpu('b', 92), gpu('a', 12)] }, h.document);
  assert.equal(h.stats.style.fontSize, '11px');
  assert.equal(h.nodes['tray-gpu-0-n'].textContent, '12');
  assert.equal(h.nodes['tray-gpu-1-n'].textContent, '92');
  tray.render({ gpus: [gpu('b', 33)] }, h.document);
  assert.equal(h.stats.style.fontSize, '11px');
  assert.equal(h.stats.children.length, 8);
  assert.equal(h.nodes['tray-gpu-0-n'].textContent, '33');
  assert.equal(h.nodes['tray-gpu-1-n'], undefined);
});

test('PCI identity keeps the GPU rows stable when discovery order and utilization change', () => {
  const h = dom();
  tray.render({ gpus: [gpu('0000:07:00.0', 90), gpu('0000:03:00.0', 10)] }, h.document);
  const first = h.nodes['tray-gpu-0-label'];
  tray.render({ gpus: [gpu('0000:03:00.0', 50), gpu('0000:07:00.0', 0)] }, h.document);
  assert.equal(h.nodes['tray-gpu-0-label'], first, 'ordinary polls must reuse nodes');
  assert.match(first.title, /0000:03:00.0/);
  assert.equal(h.nodes['tray-gpu-0-n'].textContent, '50');
  assert.equal(h.nodes['tray-gpu-1-n'].textContent, '0');
});

test('integrated GPU does not add a fourth row when discrete GPUs are present', () => {
  const integrated = { ...gpu('c'), integrated: true };
  assert.deepEqual(tray.displayGpus({ gpus: [integrated, gpu('b'), gpu('a')] }).map(g => g.id), ['a', 'b']);
  assert.deepEqual(tray.displayGpus({ gpus: [integrated] }).map(g => g.id), []);
});

test('missing sensors stay unknown while idle readings remain zero', () => {
  const h = dom();
  tray.render({ gpus: [gpu('a')] }, h.document);
  tray.render({ gpus: [{ id: 'a', name: 'Radeon', integrated: false }] }, h.document);
  assert.equal(h.nodes['tray-gpu-0-n'].textContent, '--');
  assert.equal(h.nodes['tray-gpu-0-u'].style.visibility, 'hidden');
  assert.equal(h.nodes['tray-gpu-0-tn'].textContent, '--');
  assert.equal(h.nodes['tray-gpu-0-vram'].textContent, '--');
  tray.render({ gpus: [{ ...gpu('a', 0), temp: 0 }] }, h.document);
  assert.equal(h.nodes['tray-gpu-0-n'].textContent, '0');
  assert.equal(h.nodes['tray-gpu-0-u'].style.visibility, '');
});

test('older managers retain the single GPU row; an empty inventory removes it', () => {
  const h = dom();
  tray.render({ gpu_percent: 7, gpu_temp: 32, gpu_vram_used_gb: 2, gpu_vram_total_gb: 24 }, h.document);
  assert.equal(h.nodes['tray-gpu-0-n'].textContent, '7');
  tray.render({ gpus: [], gpu_percent: 7 }, h.document);
  assert.equal(h.stats.children.length, 0);
});

test('names are text and tooltip content, never injected HTML', () => {
  const h = dom();
  tray.render({ gpus: [{ ...gpu('a'), name: '<img src=x onerror=alert(1)>' }] }, h.document);
  assert.equal(h.nodes['tray-gpu-0-label'].textContent, 'GPU');
  assert.equal(h.nodes['tray-gpu-0-label'].title, '<img src=x onerror=alert(1)> · a');
});

test('large RAM capacities reserve stable room for all digits', () => {
  const h = dom();
  tray.render({ memory_used_gb: 124, memory_total_gb: 125, gpus: [gpu('a'), gpu('b')] }, h.document);
  assert.equal(h.stats.style['--tray-memory-width'], '7ch');
  assert.equal(h.nodes['mem-ut'].textContent, '124/125');
  tray.render({ memory_used_gb: 9, memory_total_gb: 125, gpus: [gpu('a'), gpu('b')] }, h.document);
  assert.equal(h.stats.style['--tray-memory-width'], '7ch');
});

 test('unclassified devices never become discrete GPUs when inventory fails', () => {
   const h = dom();
   tray.render({gpus: [gpu('a'), {...gpu('b'), integrated: true}]}, h.document);
   tray.render({gpus: [{id: 'a'}, {id: 'b'}]}, h.document);
   assert.equal(h.stats.children.length, 0);
   assert.deepEqual(tray.displayGpus({gpus: [gpu('a'), {id:'b'}]}).map(g => g.id), ['a']);
 });

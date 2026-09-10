/* Execute the real inline guard: it must work even when Access blocks scripts. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(__dirname + '/desktop.html', 'utf8');
const source = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .find(m => m[1].includes('/* Auth guard.'))[1];
const flush = () => new Promise(resolve => setImmediate(resolve));
const response = (status = 200, type = 'basic', contentType = 'application/json') => ({
  status, type, headers: { get: () => contentType }
});

function setup({ loading = false, framed = false, hidden = false, reply = response() } = {}) {
  let now = 0, nextId = 0;
  const calls = [], timeouts = new Map(), intervals = [], listeners = {};
  const listen = (scope, event, fn) => {
    const key = scope + ':' + event;
    (listeners[key] ||= []).push(fn);
  };
  const link = { href: '', focused: false,
    addEventListener: (event, fn) => listen('link', event, fn),
    focus() { this.focused = true; } };
  const dialog = { shown: 0,
    addEventListener: (event, fn) => listen('dialog', event, fn),
    showModal() { this.shown++; } };
  const document = {
    hidden, readyState: loading ? 'loading' : 'complete',
    addEventListener: (event, fn) => listen('document', event, fn),
    getElementById: id => id === 'auth-expired' ? dialog : link
  };
  const window = { document, addEventListener: (event, fn) => listen('window', event, fn) };
  window.top = framed ? {} : window;
  window.self = window;
  const sandbox = {
    window, document, AbortController, Date: { now: () => now },
    fetch(url, options) {
      calls.push({ url, options });
      return typeof reply === 'function' ? reply(options) : Promise.resolve(reply);
    },
    setTimeout(fn, delay) { timeouts.set(++nextId, { fn, delay }); return nextId; },
    clearTimeout(id) { timeouts.delete(id); },
    setInterval(fn, delay) { intervals.push({ fn, delay }); },
    // Old guard silently gave up after vt:reauth had been set. Storage must no
    // longer control recovery, including browsers where accessing it throws.
    get sessionStorage() { throw new Error('storage unavailable'); },
    location: { replace() { assert.fail('expiry must not automatically navigate'); } }
  };
  vm.runInNewContext(source, sandbox);
  return { calls, timeouts, intervals, dialog, link, document, window,
    reply(value) { reply = value; },
    advance(ms) { now += ms; },
    emit(scope, event, value) { for (const fn of listeners[scope + ':' + event] || []) fn(value); }
  };
}

test('a session expiring AFTER a healthy load shows one actionable prompt', async () => {
  const h = setup();
  await flush();
  assert.equal(h.dialog.shown, 0);
  assert.equal(h.calls[0].url, '/api/me');
  assert.equal(h.calls[0].options.redirect, 'manual');
  assert.equal(h.calls[0].options.cache, 'no-store');
  assert.equal(h.calls[0].options.credentials, 'same-origin');
  h.reply(response(0, 'opaqueredirect'));
  h.advance(30000);
  assert.equal(h.intervals[0].delay, 30000);
  h.intervals[0].fn();
  await flush();
  assert.equal(h.dialog.shown, 1);
  assert.equal(h.window.vibeAuthExpired, true);
  assert.equal(h.link.focused, true);
  assert.equal(h.link.href, '/?vtreauth=30000');
  h.advance(30000);
  h.intervals[0].fn();
  h.emit('window', 'focus');
  await flush();
  assert.equal(h.dialog.shown, 1);
  assert.equal(h.calls.length, 2);
  h.emit('link', 'click');
  assert.equal(h.link.href, '/?vtreauth=60000', 'explicit retries get a fresh network URL');
  let prevented = false;
  h.emit('dialog', 'cancel', { preventDefault() { prevented = true; } });
  assert.equal(prevented, true, 'Escape must not hide the only recovery action');
});

for (const [scope, event] of [['document', 'visibilitychange'], ['window', 'focus'],
  ['window', 'pageshow'], ['window', 'online']]) {
  test('checks auth when returning via ' + event, async () => {
    const h = setup();
    await flush();
    h.advance(60000);
    h.reply(response(401));
    h.emit(scope, event);
    await flush();
    assert.equal(h.dialog.shown, 1);
  });
}

for (const reply of [response(401), response(403), response(0, 'opaqueredirect'),
  response(200, 'basic', 'text/html; charset=utf-8')]) {
  test('recognizes expired auth on initial load: ' + JSON.stringify(reply), async () => {
    const h = setup({ reply });
    await flush();
    assert.equal(h.dialog.shown, 1);
  });
}

test('network and server errors recover without claiming the session expired', async () => {
  const h = setup({ reply: () => Promise.reject(new TypeError('Failed to fetch')) });
  await flush();
  for (const status of [429, 500, 502, 503, 200]) {
    h.advance(30000);
    h.reply(response(status));
    h.window.vibeCheckAuth();
    await flush();
    assert.equal(h.dialog.shown, 0);
  }
  h.advance(30000);
  h.reply(response(401));
  h.window.vibeCheckAuth();
  await flush();
  assert.equal(h.dialog.shown, 1);
});

test('hidden pages wait until shown and wake events coalesce', async () => {
  const h = setup({ hidden: true });
  await flush();
  assert.equal(h.calls.length, 0);
  h.document.hidden = false;
  h.emit('document', 'visibilitychange');
  h.emit('window', 'pageshow');
  h.emit('window', 'focus');
  await flush();
  h.emit('window', 'online');
  await flush();
  assert.equal(h.calls.length, 1);
});

test('a hung request is aborted and cannot strand future checks', async () => {
  const h = setup({ reply: options => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
  }) });
  await flush();
  h.advance(6000);
  h.window.vibeCheckAuth();
  await flush();
  assert.equal(h.calls.length, 1, 'only one probe in flight');
  const timeout = [...h.timeouts.values()][0];
  assert.equal(timeout.delay, 10000);
  timeout.fn();
  await flush();
  assert.equal(h.calls[0].options.signal.aborted, true);
  assert.equal(h.dialog.shown, 0);
  assert.equal(h.timeouts.size, 0);
  h.reply(response(401));
  h.window.vibeCheckAuth();
  await flush();
  assert.equal(h.dialog.shown, 1);
});

test('a fast auth failure waits for the dialog markup to be parsed', async () => {
  const h = setup({ loading: true, reply: response(401) });
  await flush();
  assert.equal(h.dialog.shown, 0);
  h.document.readyState = 'interactive';
  h.emit('document', 'DOMContentLoaded');
  assert.equal(h.dialog.shown, 1);
});

test('a nested desktop leaves reauthentication to the top window', async () => {
  const h = setup({ framed: true });
  await flush();
  assert.equal(h.calls.length, 0);
  assert.equal(h.intervals.length, 0);
});

/* Isolated browser regression: the real shell + SW, with a local Access stand-in.
 * No VM, running Vibetop host, credentials, or Cloudflare account required.
 * Run: node --test tests/e2e/auth-expiry.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium, webkit, devices, expect } = require('@playwright/test');

const root = path.resolve(__dirname, '../..');
const sw = fs.readFileSync(path.join(root, 'shell/sw.js'), 'utf8');
const build = sw.match(/const VERSION = '(v\d+)'/)[1];
const desktop = fs.readFileSync(path.join(root, 'shell/desktop.html'), 'utf8')
  .replaceAll('@SW_VERSION@', build).replaceAll('@VERSION@', 'test');

async function fixture() {
  const state = { mode: 'authed', requests: [], streams: new Set(), meChecks: 0 };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://' + req.headers.host);
    const pathname = url.pathname;
    state.requests.push({ method: req.method, pathname, search: url.search });
    res.setHeader('Cache-Control', 'no-store');
    const html = body => { res.setHeader('Content-Type', 'text/html'); res.end(body); };
    const json = body => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
    if (pathname === '/access-login') return html('<h1>Cloudflare sign-in stand-in</h1><a href="/access-complete">Sign in</a>');
    if (pathname === '/access-complete') {
      state.mode = 'authed';
      res.writeHead(302, { Location: state.origin + '/' });
      return res.end();
    }
    if (pathname === '/api/me') state.meChecks++;
    if (state.mode === 'cached-expired' && pathname === '/' && !url.searchParams.has('vtreauth')) {
      req.socket.destroy(); // navigation falls back to the cached shell
      return;
    }
    if (state.mode === 'down' && pathname === '/') {
      req.socket.destroy(); // the sign-in navigation itself fails
      return;
    }
    if (state.mode === 'expired' || state.mode === 'cached-expired') {
      // Different hostname = cross-origin redirect, as with cloudflareaccess.com.
      res.writeHead(302, { Location: state.origin.replace('127.0.0.1', 'localhost') + '/access-login' });
      return res.end();
    }
    if (pathname === '/api/me' && state.mode === 'unavailable') {
      res.writeHead(503);
      return res.end('Temporarily unavailable');
    }
    if (pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('event: hello\ndata: ' + build + '\n\n');
      state.streams.add(res);
      req.on('close', () => state.streams.delete(res));
      return;
    }
    if (pathname === '/api/me') return json({ user: 'test', name: 'Test User', via_access: true });
    if (pathname === '/api/update') return json({ version: 'test', build });
    if (pathname.startsWith('/api/desktop')) return json({ open: [], running: [], reset_epoch: 0 });
    if (pathname.startsWith('/api/')) return json({});
    if (pathname === '/') return html(desktop);
    if (pathname === '/test-app.html') return html('<h1>Open app</h1><textarea aria-label="Unsaved draft">keep this draft</textarea>');
    // Serve the shell's actual modules and icons. No installer or host writes.
    for (const dir of ['shell', 'shared']) {
      const file = path.resolve(root, dir, '.' + pathname);
      if (!file.startsWith(path.join(root, dir) + path.sep)) continue;
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
      const types = { '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png' };
      res.setHeader('Content-Type', types[path.extname(file)] || 'text/html');
      return res.end(fs.readFileSync(file));
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise(resolve => server.listen(0, resolve));
  state.origin = 'http://127.0.0.1:' + server.address().port;
  state.close = async () => {
    for (const stream of state.streams) stream.end();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  };
  return state;
}

for (const [name, engine, options] of [
  ['desktop Chromium', chromium, { viewport: { width: 1280, height: 800 } }],
  ['iPhone WebKit', webkit, devices['iPhone 13 Mini']]
]) {
  test(name + ': expiry, prompt, top-level sign-in and recovery through the SW', { timeout: 60000 }, async t => {
    const host = await fixture();
    t.after(() => host.close());
    const browser = await engine.launch({ headless: true });
    t.after(() => browser.close());
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install();
    await page.goto(host.origin);
    await expect(page.locator('#start-btn')).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    // Keep a loaded app and unsaved input in place while auth fails.
    await page.evaluate(() => {
      const frame = document.createElement('iframe');
      frame.id = 'test-app'; frame.src = '/test-app.html';
      document.body.appendChild(frame);
      sessionStorage.setItem('vt:reauth', '1'); // stale latch from an older build
    });
    await expect(page.frameLocator('#test-app').getByRole('textbox')).toHaveValue('keep this draft');
    await expect(page.locator('#auth-expired')).not.toBeVisible();

    // An outage must retry without producing a false expired-session prompt.
    host.mode = 'unavailable';
    let before = host.meChecks;
    await page.clock.fastForward(31000);
    await expect.poll(() => host.meChecks).toBeGreaterThan(before);
    await expect(page.locator('#auth-expired')).not.toBeVisible();

    host.mode = 'expired';
    before = host.meChecks;
    await page.clock.fastForward(31000);
    await expect.poll(() => host.meChecks).toBeGreaterThan(before);
    const dialog = page.getByRole('dialog', { name: 'Session expired' });
    const signIn = dialog.getByRole('link', { name: 'Sign in again' });
    await expect(dialog).toBeVisible();
    await expect(signIn).toBeFocused();
    await expect(page.frameLocator('#test-app').getByRole('textbox')).toHaveValue('keep this draft');
    assert.equal(page.url(), host.origin + '/', 'no automatic navigation on expiry');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    const box = await signIn.boundingBox();
    assert.ok(box.height >= 44 && box.x >= 0 && box.x + box.width <= page.viewportSize().width);
    assert.ok(box.y >= 0 && box.y + box.height <= page.viewportSize().height);
    const screenshot = path.join('/tmp', 'vibetop-auth-expiry-' + (engine === chromium ? 'desktop' : 'iphone') + '.png');
    await page.screenshot({ path: screenshot });
    t.diagnostic('Prompt screenshot: ' + screenshot);

    await signIn.click();
    await expect(page.getByRole('heading', { name: 'Cloudflare sign-in stand-in' })).toBeVisible();
    assert.ok(host.requests.some(r => r.pathname === '/' && r.search.includes('vtreauth=')),
      'the sign-in link must reach the network despite a cached shell');
    assert.equal(page.frames().length, 1, 'sign-in must replace the top-level page');
    await page.getByRole('link', { name: 'Sign in', exact: true }).click();
    await expect(page.locator('#start-btn')).toBeVisible();
    await expect(page.locator('#auth-expired')).not.toBeVisible();
    assert.equal(page.url(), host.origin + '/');
    assert.ok(!host.requests.some(r => /^\/api\/(reset|logout)/.test(r.pathname)),
      'reauthentication must not reset the desktop or log out persistent sessions');
    // Recovered: the guard posts what it and the worker witnessed (the expiry
    // probe, the sign-in, the redirected navigation) to /api/clientlog, once.
    const posted = () => host.requests.filter(r => r.method === 'POST' && r.pathname === '/api/clientlog').length;
    await expect.poll(posted).toBe(1);
    // A second expiry on a cached cold load must also recover, including when
    // Access blocks the external scripts the cached page tries to refresh.
    host.mode = 'cached-expired';
    await page.reload();
    await expect(dialog).toBeVisible();
    await signIn.click();
    await expect(page.getByRole('heading', { name: 'Cloudflare sign-in stand-in' })).toBeVisible();
    await page.getByRole('link', { name: 'Sign in', exact: true }).click();
    await expect(page.locator('#start-btn')).toBeVisible();
    await expect.poll(posted).toBe(2);                   // the second expiry's witness
    // A sign-in navigation the network cannot answer is a page with a way
    // forward, never the browser's blank error page.
    host.mode = 'down';
    await page.goto(host.origin + '/?vtreauth=9');
    await expect(page.getByRole('heading', { name: /Vibetop can.t be reached/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Try again' })).toBeVisible();
    // WebKit reports expected cross-origin Access rejections from SW background
    // refreshes as pageerrors. Keep allowing ONLY that precise network failure.
    assert.deepEqual(errors.filter(message => !/^\/localhost:\d+\/access-login due to access control checks\.$/.test(message)), []);
  });
}

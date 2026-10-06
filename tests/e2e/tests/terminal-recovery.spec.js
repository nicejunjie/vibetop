// Exercise real ttyd/xterm with failed startup, not just the presence of a canvas.
const { test, expect } = require('@playwright/test');
const { backendOnly } = require('../helpers');

test.describe('terminal startup recovery (backend)', () => {
  backendOnly(test);
  test('clean WebSocket close reconnects promptly without a synthetic Enter', async ({ page }) => {
    const start = await page.request.post('/api/terminals/1/start');
    expect(start.ok()).toBeTruthy();
    await page.addInitScript(() => {
      const Native = window.WebSocket;
      window.__testPtyOutput = false;
      window.__testEnter = 0;
      function WS(url, protocols) {
        const ws = protocols === undefined ? new Native(url) : new Native(url, protocols);
        window.__testSocket = ws;
        ws.addEventListener('message', e => {
          const data = e.data;
          if ((typeof data === 'string' && data.length > 1 && data[0] === '0') ||
              (data instanceof ArrayBuffer && data.byteLength > 1 && new Uint8Array(data)[0] === 48))
            window.__testPtyOutput = true;
        });
        const send = ws.send.bind(ws);
        ws.send = data => { if (data === '0\r') window.__testEnter++; return send(data); };
        return ws;
      }
      WS.prototype = Native.prototype;
      for (const key of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) WS[key] = Native[key];
      window.WebSocket = WS;
    });
    await page.goto('/t1/');
    await page.waitForFunction(() => window.__testPtyOutput && window.__testSocket.readyState === 1);
    await Promise.all([
      page.waitForEvent('framenavigated', { predicate: f => f === page.mainFrame(), timeout: 4000 }),
      page.evaluate(() => window.__testSocket.close(1000)),
    ]);
    await page.waitForFunction(() => window.__testPtyOutput && window.__testSocket.readyState === 1);
    expect(await page.evaluate(() => window.__testEnter)).toBe(0);
    await expect(page.locator('#vt-connection')).toHaveCount(0);
  });
  for (const failure of ['token fetch', 'WebSocket handshake']) {
    test(`recovers from a stalled ${failure} and displays actual PTY output`, async ({ page }) => {
      test.setTimeout(45000);
      const start = await page.request.post('/api/terminals/1/start');
      expect(start.ok()).toBeTruthy();
      let blockedRequest;
      if (failure === 'token fetch') {
        let first = true;
        await page.route('**/t1/token', route => {
          if (first) { first = false; blockedRequest = route; return; } // deliberately leave request pending
          return route.continue();
        });
      } else {
        await page.addInitScript(() => {
          if (sessionStorage.getItem('test-stalled-ws')) return;
          sessionStorage.setItem('test-stalled-ws', '1');
          class Stalled extends EventTarget {
            constructor() { super(); this.readyState = 0; }
            send() {}
            close() {}
          }
          Object.assign(Stalled, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
          window.WebSocket = Stalled;
        });
      }
      await page.goto('/t1/');
      await expect(page.locator('#vt-connection')).toContainText('Connecting', { timeout: 6000 });
      await expect.poll(() => page.evaluate(() => {
        const t = window.term;
        if (!t) return false;
        for (let i = 0; i < t.buffer.active.length; i++) {
          if (t.buffer.active.getLine(i).translateToString().trim()) return true;
        }
        return false;
      }), { timeout: 25000 }).toBe(true);
      await expect(page.locator('#vt-connection')).toHaveCount(0);
      if (blockedRequest) await blockedRequest.abort().catch(() => {});
    });
  }
});

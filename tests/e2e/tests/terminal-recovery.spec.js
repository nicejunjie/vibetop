// Exercise real ttyd/xterm with failed startup, not just the presence of a canvas.
const { test, expect } = require('@playwright/test');
const { backendOnly } = require('../helpers');

test.describe('terminal startup recovery (backend)', () => {
  backendOnly(test);
  for (const closeCode of [1000, undefined]) {
    test(`WebSocket close ${closeCode ?? 'without status'} reconnects promptly without a synthetic Enter`, async ({ page }) => {
      const start = await page.request.post('/api/terminals/1/start');
      expect(start.ok()).toBeTruthy();
      await page.addInitScript(() => {
        const Native = window.WebSocket;
        window.__testPtyOutput = false;
        window.__testGeneration = Math.random();
        window.__testSocketCount = 0;
        window.__testEnter = 0;
        function WS(url, protocols) {
          const ws = protocols === undefined ? new Native(url) : new Native(url, protocols);
          window.__testSocket = ws;
          window.__testSocketCount++; window.__testPtyOutput = false;
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
      const previous = await page.evaluate(() => ({generation: window.__testGeneration, count: window.__testSocketCount}));
      await page.evaluate(code => code == null ? window.__testSocket.close() : window.__testSocket.close(code), closeCode);
      await page.waitForFunction(old => window.__testPtyOutput && window.__testSocket.readyState === 1 &&
        (window.__testGeneration !== old.generation || window.__testSocketCount > old.count), previous, {timeout: 4000});
      expect(await page.evaluate(() => window.__testEnter)).toBe(0);
      await expect(page.locator('#vt-connection')).toHaveCount(0);
    });
  }
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

// Real xterm with synthetic PTY output: avoids resizing any live user shell.
test.describe('terminal history reading anchor (backend)', () => {
  backendOnly(test);
  test('keeps the same passage through repaint and reload with trimmed replay', async ({ page }) => {
    const start = await page.request.post('/api/terminals/1/start');
    expect(start.ok()).toBeTruthy();
    let connections = 0;
    await page.routeWebSocket('**/t1/ws*', ws => {
      const first = connections++ === 0 ? 0 : 20;
      let sent = false;
      ws.onMessage(() => {
        if (sent) return;
        sent = true;
        const lines = Array.from({length:500 - first}, (_, i) => 'history passage ' + (i + first));
        ws.send(Buffer.from('2{}'));
        ws.send(Buffer.from('0\x1b[3J\x1b[2J\x1b[H' + lines.join('\r\n') + '\r\n'));
      });
    });
    await page.goto('/t1/');
    await page.waitForFunction(() => window.term && window.term.buffer.active.baseY > 200);
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      window.dispatchEvent(new WheelEvent('wheel'));
      window.term.scrollToLine(120);
    });
    await page.waitForTimeout(100);
    await page.evaluate(() => window.term.scrollToLine(0));
    const topLine = () => page.evaluate(() => {
      const b = window.term.buffer.active;
      return b.getLine(b.viewportY).translateToString(true);
    });
    await expect.poll(topLine).toBe('history passage 120');
    await page.reload();
    await page.waitForFunction(() => window.term && window.term.buffer.active.baseY > 200);
    await expect.poll(topLine).toBe('history passage 120');
  });
});

// Exercise real ttyd/xterm with failed startup, not just the presence of a canvas.
const { test, expect } = require('@playwright/test');
const { backendOnly } = require('../helpers');

test.describe('terminal startup recovery (backend)', () => {
  backendOnly(test);
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

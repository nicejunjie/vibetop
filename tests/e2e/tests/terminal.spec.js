// @ts-check
// Terminal: opening it should cold-start a per-user ttyd and boot xterm.js. We
// assert the xterm surface appears inside the nested /tN/ iframe (proof the whole
// chain works: authcheck -> per-user ttyd port -> nginx route -> ttyd -> xterm),
// and that the manager reports a running terminal for the user. xterm renders to a
// canvas, so we don't read cell text — the surface + API status is the signal.
const { test, expect } = require('@playwright/test');
const { openAppFrame, backendOnly } = require('../helpers');

test.describe('terminal app (backend)', () => {
  backendOnly(test);

  test('opening Terminal boots ttyd + xterm and the manager reports it running', async ({ page, baseURL }) => {
    await page.goto('/');
    await openAppFrame(page, 'terminal');
    // desktop -> #frame-terminal -> terminals.html -> the active /tN/ iframe.
    const term = page.frameLocator('#frame-terminal').frameLocator('iframe').first();
    await expect(term.locator('.xterm')).toBeVisible({ timeout: 25_000 });

    // The manager should now report a running terminal for this user.
    await expect.poll(async () => {
      const r = await page.request.get(baseURL + '/api/terminals/status');
      if (!r.ok()) return 0;
      const j = await r.json();
      const running = j.running || j.terminals || [];
      return Array.isArray(running) ? running.length : Object.keys(running || {}).length;
    }, { timeout: 15_000, intervals: [1000, 1500] }).toBeGreaterThan(0);
  });
});

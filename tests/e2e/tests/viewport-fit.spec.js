// @ts-check
// The shell must always end exactly at the visible viewport's bottom edge, on
// every device — and correct itself when it doesn't.
//
// This is the class of bug that produced "the bottom is cut off after the
// Cloudflare login" and "the keyboard adds blank space at the bottom": iOS has
// several height metrics and each has been caught lying (`svh` freezes after a
// cross-origin login; the running max that works around it can only grow, so one
// over-read leaves the shell too tall for the rest of the orientation). Rather
// than trust any single metric, apph.js asserts the invariant continuously.
//
// Note what this CANNOT cover: an installed standalone PWA behind Cloudflare
// Access, which is where the original reports came from — Playwright is never
// standalone and the harness has no Access. That is exactly why the watchdog also
// self-REPORTS: a device we cannot drive tells the manager what it measured.

const { test, expect } = require('@playwright/test');

const geom = (page) => page.evaluate(() => {
  const vv = window.visualViewport;
  return {
    shellBottom: Math.round(document.body.getBoundingClientRect().bottom),
    visibleBottom: Math.round(vv ? vv.offsetTop + vv.height : document.documentElement.clientHeight),
    taskbarBottom: Math.round(document.getElementById('taskbar').getBoundingClientRect().bottom),
    kbInset: getComputedStyle(document.documentElement).getPropertyValue('--kb-inset').trim(),
  };
});

test.describe('shell fits the visible viewport', () => {
  test('the shell ends exactly at the visible bottom, and nothing is reserved without a keyboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1200);
    const g = await geom(page);
    expect(Math.abs(g.shellBottom - g.visibleBottom)).toBeLessThanOrEqual(2);
    expect(Math.abs(g.taskbarBottom - g.visibleBottom)).toBeLessThanOrEqual(2);
    // --kb-inset must stay 0 with no keyboard, or every device loses screen space.
    expect(g.kbInset === '' || g.kbInset === '0px').toBeTruthy();
  });

  test('a shell that is too tall self-corrects and reports it', async ({ page }) => {
    test.slow();
    const reports = [];
    page.on('request', (r) => {
      if (r.method() !== 'POST' || !r.url().includes('/api/desktop')) return;
      const d = r.postData();
      if (d && d.includes('viewport')) reports.push(JSON.parse(d).viewport);
    });
    await page.goto('/');
    await page.waitForTimeout(1500);

    // Break it the way the real bug does: a shell taller than the screen, so the
    // taskbar and the app's last rows fall off the bottom.
    await page.evaluate(() => {
      document.documentElement.style.setProperty(
        '--app-h', (document.documentElement.clientHeight + 220) + 'px');
    });
    await page.waitForTimeout(300);
    const broken = await geom(page);
    expect(broken.taskbarBottom).toBeGreaterThan(broken.visibleBottom + 100);   // genuinely off-screen

    // No reload, no gesture, no user action: it heals itself.
    await expect.poll(async () => (await geom(page)).shellBottom - (await geom(page)).visibleBottom,
                      { timeout: 12_000, intervals: [500, 750, 1000] }).toBeLessThanOrEqual(2);
    const healed = await geom(page);
    expect(healed.taskbarBottom).toBeLessThanOrEqual(healed.visibleBottom + 2);

    // ...and the device tells the server what it measured, so a phone we cannot
    // drive is still diagnosable.
    await expect.poll(() => reports.length, { timeout: 12_000, intervals: [1000] }).toBeGreaterThan(0);
    expect(reports[0].drift).toBeGreaterThan(100);
    expect(reports[0]).toHaveProperty('clientH');
    expect(reports[0]).toHaveProperty('vvH');
  });
});

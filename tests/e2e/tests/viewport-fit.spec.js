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

  // The regression that ate the terminal (v1.19.12): the keyboard reservation was
  // measured as `body.getBoundingClientRect().height + kbInset`, but `* {
  // box-sizing: border-box }` means that rect ALREADY includes the padding — so
  // the inset was counted twice and fed straight back in. iOS fires 2-3 resize
  // events per keyboard raise, so the reservation grew on each one and the app
  // area collapsed to a third of the screen with a black band above the key bar.
  //
  // No real soft keyboard is needed to catch it, and none is available here: the
  // bug is a feedback loop, so it shows up as NON-IDEMPOTENCE. Occlude a stubbed
  // visual viewport once, then fire the event repeatedly WITHOUT changing any
  // geometry — a correct reservation is identical every time.
  test('the keyboard reservation is idempotent (no ratchet on repeated events)', async ({ page }) => {
    const KB = 320;                       // pretend keyboard height, in CSS px
    await page.addInitScript((kb) => {
      // Shrink ONLY the visual viewport, which is what a soft keyboard does — a
      // real page resize would shrink the layout viewport too and hide the bug.
      const real = window.visualViewport;
      const et = new EventTarget();
      const fake = {
        get height() { return (real ? real.height : innerHeight) - window.__fakeKb; },
        get width() { return real ? real.width : innerWidth; },
        get offsetTop() { return 0; },
        get offsetLeft() { return 0; },
        get scale() { return 1; },
        addEventListener: et.addEventListener.bind(et),
        removeEventListener: et.removeEventListener.bind(et),
        dispatchEvent: et.dispatchEvent.bind(et),
      };
      window.__fakeKb = 0;
      window.__kbHeight = kb;
      Object.defineProperty(window, 'visualViewport', { get: () => fake, configurable: true });
    }, KB);

    await page.goto('/');
    await page.waitForTimeout(1200);
    const before = await geom(page);
    expect(before.kbInset === '' || before.kbInset === '0px').toBeTruthy();

    // Raise the "keyboard", then fire the resize the way iOS does — several times,
    // with nothing else changing.
    const insets = await page.evaluate(async () => {
      const seen = [];
      window.__fakeKb = window.__kbHeight;
      for (let i = 0; i < 4; i++) {
        window.visualViewport.dispatchEvent(new Event('resize'));
        await new Promise((r) => setTimeout(r, 120));
        seen.push(getComputedStyle(document.documentElement)
          .getPropertyValue('--kb-inset').trim());
      }
      return seen;
    });

    // Every pass must agree. (Whether the shell classifies this as "keyboard up"
    // at all depends on the lane's geometry — if it reserves nothing, that is
    // consistent too. What must never happen is a value that keeps growing.)
    expect(new Set(insets).size).toBe(1);
    const px = parseInt(insets[0], 10) || 0;
    expect(px).toBeLessThan(KB + 200);         // never more than the keyboard + the key bar
    const g = await geom(page);
    expect(g.shellBottom - g.visibleBottom).toBeGreaterThanOrEqual(0);   // nothing above the keyboard is wasted
    expect(px === 0 || g.taskbarBottom <= g.visibleBottom + 2).toBeTruthy();
  });
});

// @ts-check
// Focus is a GLOBAL, single-owner resource, and every other spec in this suite
// drives ONE app. That blind spot shipped a bug three times: a merely VISIBLE
// Browser window answered the shell's "you are on screen" pump by calling
// window.focus() from inside its iframe, 150ms after every app switch, so a
// click in Files selected the file and the Space that followed went to the
// Browser (v1.19.362). No single-app test can see that — the app under test
// behaves perfectly; another app reaches over and takes the keyboard.
//
// So this spec asserts the invariant no app owns: after clicking inside one
// app, with EVERY other app also open, the keys must still arrive there. Run it
// with VIBETOP_E2E_FULL=1 (VM) to include the Browser/xpra — the lean VM does
// not install it, which is exactly why the bug survived a VM run.
//
// HONEST LIMIT — read before trusting this green. It does NOT reproduce the
// v1.19.362 steal: measured in the FULL VM against the UNFIXED xpra-patches.js
// (with a real, connected xpra client and the legacy pump posted straight at
// the Browser frame), headless Chromium simply refuses a background iframe's
// window.focus(), so top-level focus never moved and this spec passed either
// way. A test that cannot fail on the broken build guards nothing.
// THE guard for that bug is hermetic: "a merely VISIBLE browser window does not
// grab the keyboard" in apps/everyday/browser/xpra-patches.test.js, which
// drives the patch file directly and was verified failing on the unfixed file.
// What this spec is still worth: it is the only place several apps are open at
// once, so it catches cross-app regressions that headless CAN express. To make
// it bite on focus theft it would need a headed browser (Xvfb) with real
// top-level focus semantics.
const { test, expect } = require('@playwright/test');
const { openApp, openAppFrame, backendOnly } = require('../helpers');

const DESKTOP = 'desktop-chromium';
const FOCUS_DIR = '/tmp/vibetop-e2e-crossfocus';
const ONE_PX_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test.describe('cross-app focus — no app may take the keyboard from the one you clicked', () => {
  backendOnly(test);
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== DESKTOP, `one browser is enough — ${DESKTOP}`);
  });

  test('Space reaches Files with the other apps open beside it', async ({ page }) => {
    // Window mode: this is where the shell pumps every VISIBLE window, which is
    // the signal the Browser used to over-read.
    await page.addInitScript(() => { try { localStorage.setItem('vibetop:wm', '1'); } catch (e) {} });
    await page.goto('/');

    const frame = await openAppFrame(page, 'files');
    const listing = frame.contentFrame().frameLocator('iframe.active');
    await page.evaluate(async ({ dir, b64 }) => {
      await fetch('/api/fs/op', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'mkdir', path: dir })
      });
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      await fetch('/api/fs/upload?path=' + encodeURIComponent(dir + '/a-picture.png'),
                  { method: 'POST', body: bin });
    }, { dir: FOCUS_DIR, b64: ONE_PX_PNG });
    await listing.locator('body').evaluate((_b, dir) => { location.hash = '#' + dir; }, FOCUS_DIR);
    await expect(listing.locator('.row[data-i]').first()).toBeVisible({ timeout: 20_000 });

    // Open every other app that this deployment actually has, so each one is a
    // VISIBLE window alongside Files. The Browser is the one that mattered; it
    // is absent from a lean VM, hence the guard.
    for (const id of ['notes', 'terminal', 'browser']) {
      const present = await page.evaluate(
        (i) => !!document.querySelector(`.sm-item[data-id="${i}"]`), id);
      if (!present) continue;
      try { await openApp(page, id); } catch (e) { /* not installed here */ }
      await page.waitForTimeout(1500);
    }

    // Back to Files with ONE click on a file IN THE BACKGROUND WINDOW — that
    // click is what activates the app, and activation is what pumps every
    // visible window. Activating Files some other way first (the Start menu,
    // the taskbar) and only then clicking makes this the harmless "second
    // click" case, which never triggered the pump at all: the first version of
    // this spec did exactly that and passed against the unfixed build.
    await listing.locator('.row[data-i]').first().click({ force: true });
    await expect(listing.locator('.row.sel')).toHaveCount(1, { timeout: 8_000 });

    // Long enough to outlast a deferred steal (the xpra one fired at 150ms).
    await page.waitForTimeout(1200);
    await page.keyboard.press(' ');
    await expect(listing.locator('.ql.open')).toBeVisible({ timeout: 8_000 });
  });
});

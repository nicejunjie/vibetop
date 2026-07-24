// @ts-check
// Files app: confirms the FileBrowser SPA loads inside the nested iframe AND that
// filebrowser-patches.js ran (its injected address bar appears). That the app
// settles at all is the live signal that the desktop-side rAF fix (#9) isn't
// hanging it. Deep nesting (desktop -> #frame-files -> fbtab -> FileBrowser), so
// waits are generous. Backend/patch behavior -> one browser.
const { test, expect } = require('@playwright/test');
const { openAppFrame, backendOnly } = require('../helpers');

test.describe('files app (backend/patches)', () => {
  backendOnly(test);

  test('FileBrowser loads and the injected address bar appears', async ({ page }) => {
    await page.goto('/');
    await openAppFrame(page, 'files');
    // desktop iframe -> files.html -> the FileBrowser tab iframe (named "fbtab").
    const fb = page.frameLocator('#frame-files').frameLocator('iframe[name="fbtab"]').first();
    // filebrowser-patches.js injects #fb-addr-input once FileBrowser has mounted.
    await expect(fb.locator('#fb-addr-input')).toBeVisible({ timeout: 25_000 });
    // And it reflects a real path (non-empty).
    await expect(fb.locator('#fb-addr-input')).not.toHaveValue('', { timeout: 10_000 });
  });
});

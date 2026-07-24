// @ts-check
// First smoke suite for the vibetop desktop shell. Runs against a real instance
// across desktop-chromium / desktop-firefox / mobile-webkit / mobile-chrome (see
// playwright.config.js). Every test starts authenticated via the injected
// vt_session cookie (global-setup). These deliberately cover the SHELL UI — the
// canvas apps (Browser/xpra, terminals) are asserted at the API/postMessage seam,
// never by pixel-clicking a remote canvas (driving the shared xpra display wedges
// it for real users — a known trap).

const { test, expect } = require('@playwright/test');
const { openStartMenu, openApp, openAppFrame, html5DragReorder } = require('../helpers');

test.describe('desktop shell (authenticated)', () => {
  test('loads the desktop with the Start button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#start-btn')).toBeVisible();
    await expect(page.locator('#taskbar')).toBeVisible();
  });

  test('cookie authenticates at the API too (/api/me is the e2e user)', async ({ page, baseURL }) => {
    const res = await page.request.get(baseURL + '/api/me');
    expect(res.ok()).toBeTruthy();
    const me = await res.json();
    expect(me.user).toBe(process.env.VIBETOP_E2E_USER || 'e2e');
  });

  test('Start menu opens and lists everyday apps', async ({ page }) => {
    await page.goto('/');
    await openStartMenu(page);
    await expect(page.locator('#startmenu .sm-item[data-id="notes"]')).toBeVisible();
    await expect(page.locator('#startmenu .sm-item[data-id="terminal"]')).toBeVisible();
  });

  test('opening an app adds a taskbar button; closing removes it', async ({ page }) => {
    await page.goto('/');
    await openApp(page, 'notes');
    const btn = page.locator('#task-apps .task-app[data-id="notes"]');
    await expect(btn).toBeVisible();
    await btn.locator('.close').click();
    await expect(btn).toHaveCount(0);
  });

  test('notes autosave survives a full reload', async ({ page }) => {
    const stamp = 'e2e note ' + Date.now();
    await page.goto('/');
    const frame = await openAppFrame(page, 'notes');
    const editor = frame.contentFrame().locator('#editor');
    // Generous timeout: the notes iframe can be a beat slower to paint its editor
    // on a mobile viewport (render-race — the same assert is instant on desktop).
    await expect(editor).toBeVisible({ timeout: 15_000 });
    await expect(editor).toBeEnabled({ timeout: 15_000 });
    await editor.click();
    await editor.fill(stamp);
    // Autosave is debounced ~800ms; give it room, then hard-reload the whole shell.
    await page.waitForTimeout(1600);
    await page.reload();

    const frame2 = await openAppFrame(page, 'notes');
    const editor2 = frame2.contentFrame().locator('#editor');
    await expect(editor2).toHaveValue(stamp, { timeout: 10_000 });
  });
});

// Drag-to-reorder is desktop-only (HTML5 DnD is a no-op on touch), so scope this to
// the mouse projects. Exercises the renderTaskbar in-place fix (a background app's
// button must survive pointerdown so the drag isn't detached mid-gesture).
test.describe('taskbar drag-reorder (desktop only)', () => {
  test.skip(({ isMobile }) => isMobile, 'HTML5 drag-and-drop is desktop-only');

  test('reordering two taskbar apps changes their order', async ({ page }) => {
    await page.goto('/');
    await openApp(page, 'notes');
    await openApp(page, 'upload');

    const ids = async () =>
      page.locator('#task-apps .task-app').evaluateAll((els) => els.map((e) => e.dataset.id));
    const before = await ids();
    expect(before).toEqual(expect.arrayContaining(['notes', 'upload']));

    await html5DragReorder(page,
      '#task-apps .task-app[data-id="notes"]',
      '#task-apps .task-app[data-id="upload"]');

    await expect
      .poll(async () => (await ids()).join(','), { timeout: 8000 })
      .not.toBe(before.join(','));
  });
});

test.describe('mobile layout (webkit / chrome)', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile-only layout checks');

  test('taskbar stays in the visible viewport and Start menu opens', async ({ page }) => {
    await page.goto('/');
    const taskbar = page.locator('#taskbar');
    await expect(taskbar).toBeVisible();
    // The taskbar must sit within the visual viewport (100svh body) — not pushed
    // below the fold by the URL bar.
    const box = await taskbar.boundingBox();
    const vh = page.viewportSize().height;
    expect(box.y + box.height).toBeLessThanOrEqual(vh + 2);

    await openStartMenu(page);
    await expect(page.locator('#startmenu')).toBeVisible();
  });
});

test.describe('auth gate (anonymous)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('without a session the desktop is not served', async ({ page }) => {
    const resp = await page.goto('/');
    // Over the LAN nginx auth_request 401/302s an unauthenticated gated path. Either
    // way the desktop Start button must NOT be reachable anonymously.
    const status = resp ? resp.status() : 0;
    const startVisible = await page.locator('#start-btn').isVisible().catch(() => false);
    expect(startVisible).toBeFalsy();
    expect(status === 401 || status === 403 || status === 302 || page.url().includes('login')).toBeTruthy();
  });
});

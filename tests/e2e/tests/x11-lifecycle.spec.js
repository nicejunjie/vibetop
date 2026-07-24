// @ts-check
// X11 Launcher app lifecycle — two of this session's fixes:
//   1) a GUI app launched onto the display must appear FAST (the private-bus
//      regression: on the wrong D-Bus bus a GNOME/GTK app hangs ~40s on the
//      xdg-desktop-portal / at-spi activation timeout), and
//   2) closing the WHOLE X11 Launcher must close its GUI windows — so a terminal
//      blocked on a foreground app returns instead of hanging forever.
//
// It uses the CORRECT "usable window" metric: /api/x/windows (= `wmctrl -l`, the
// WM-managed top-level list), NOT `xdotool --class`, which matches a premature
// window at ~0.5s and hid the 40s hang from me twice this session (the measurement
// trap now documented in docs/qa-charter.md, watchlist #1).
//
// Needs the live X11 stack (browser/install.sh: xpra + wmctrl + an X app); it
// self-skips where that isn't deployed (the lean --no-browser VM). Run it against a
// full-stack instance (deploy without --no-browser) or the real host via
// VIBETOP_BASE_URL.
const { test, expect } = require('@playwright/test');
const { openAppFrame, backendOnly } = require('../helpers');

const CANDIDATE_APPS = ['xlogo', 'xeyes', 'xclock', 'xterm'];   // first one installed wins

async function xWindows(request, baseURL) {
  const r = await request.get(baseURL + '/api/x/windows');
  if (!r.ok()) return null;
  const j = await r.json().catch(() => null);
  return j && Array.isArray(j.windows) ? j.windows : null;
}

async function closeAllWindows(request, baseURL) {
  const ws = (await xWindows(request, baseURL)) || [];
  for (const w of ws) {
    await request.post(baseURL + '/api/x/close', { data: { id: w.id } }).catch(() => {});
  }
  await expect.poll(async () => ((await xWindows(request, baseURL)) || []).length,
    { timeout: 8000 }).toBe(0);
}

test.describe('X11 launcher app lifecycle', () => {
  backendOnly(test);

  test.beforeEach(async ({ page, baseURL }) => {
    // Only where the X11 stack is deployed. 404 = the /x11-display/ nginx location
    // isn't configured (browser stack absent) → skip the whole spec.
    const probe = (await page.request.get(baseURL + '/x11-display/')).status();
    test.skip(probe === 404, 'X11 stack not deployed (--no-browser)');
  });

  test('a GUI app launches fast, and closing the launcher closes it', async ({ page, baseURL }) => {
    test.slow();   // xpra cold-start + app launch
    await page.goto('/');

    // Opening the X11 Launcher cold-starts THIS user's X11 xpra display.
    await openAppFrame(page, 'x11launcher');
    await expect.poll(async () => (await page.request.get(baseURL + '/x11-display/')).status(),
      { timeout: 45000 }).toBe(200);

    // Start from a clean display so the close-assertion is unambiguous.
    await closeAllWindows(page.request, baseURL);

    // Launch the first available trivial GUI app; skip if none is installed.
    let launched = null;
    for (const cmd of CANDIDATE_APPS) {
      const r = await page.request.post(baseURL + '/api/x/launch', { data: { cmd } });
      if (r.status() === 200) { launched = cmd; break; }
    }
    test.skip(!launched, `no test X11 app installed (${CANDIDATE_APPS.join('/')}) — apt install x11-apps`);

    // It must become a WM-managed window within a few seconds. A ~40s appearance
    // (wrong D-Bus bus) blows this timeout — that's the private-bus regression guard.
    await expect.poll(async () => ((await xWindows(page.request, baseURL)) || []).length,
      { timeout: 12000, intervals: [400, 700, 1000] }).toBeGreaterThan(0);

    // Close the WHOLE launcher (taskbar ×) — must close its GUI windows so a
    // foreground-blocked terminal would return (closeApp → closeAllXWindows).
    await page.locator('#task-apps .task-app[data-id="x11launcher"] .close').click();
    await expect.poll(async () => ((await xWindows(page.request, baseURL)) || []).length,
      { timeout: 12000 }).toBe(0);
  });
});

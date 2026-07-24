// @ts-check
// Full-surface health: as the logged-in user, EVERY per-user app endpoint must
// actually serve (HTTP 200 with real content), not a 502/500. This is the guard
// for the whole class of "an app silently broke after a change" — nothing else in
// the suite opens Browser/X11/Files AS a real user and asserts they render.
//
// Concretely it would have caught this session's three 502s: a per-user port-scheme
// change left the xpra + FileBrowser transient units listening on their OLD baked-in
// ports while nginx routed to the NEW ones, so /browser/, /x11-display/ and /files/
// all 502'd for a logged-in user while the desktop shell + terminals still worked.
// (Watchlist: docs/qa-charter.md — "every per-user app serves".)
const { test, expect } = require('@playwright/test');
const { backendOnly } = require('../helpers');

// Poll an endpoint until it reaches `want`. Per-user services COLD-START on the
// first authenticated hit (FileBrowser/ttyd in a few seconds; the xpra displays in
// ~20s), so a slow first response isn't a failure — but a genuinely down/misrouted
// service (the 502 class) never reaches 200 and fails.
async function reaches(request, baseURL, path, want = 200, timeout = 30000) {
  await expect
    .poll(async () => (await request.get(baseURL + path)).status(),
          { timeout, intervals: [500, 1000, 1500, 2000] })
    .toBe(want);
}

test.describe('every per-user app serves (no silent 502/500)', () => {
  backendOnly(test);

  test('the desktop shell renders (Start button)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#start-btn')).toBeVisible();
  });

  // Core per-user surfaces — present in every deploy (incl. the lean --no-browser VM).
  for (const path of ['/files/', '/terminals/', '/t1/']) {
    test(`${path} → 200 as the logged-in user`, async ({ page, baseURL }) => {
      await reaches(page.request, baseURL, path, 200);
      const body = await (await page.request.get(baseURL + path)).text();
      expect(body.length, `${path} body length`).toBeGreaterThan(80);
      expect(body, `${path} is not an nginx error page`)
        .not.toMatch(/502 Bad Gateway|500 Internal Server|<center>nginx/i);
    });
  }

  // Browser + X11 xpra displays — only where the browser stack is deployed. A 404 =
  // the nginx location isn't configured (stack absent, e.g. --no-browser) → skip;
  // anything else (200, or a transient 502 during cold-start) must settle to 200.
  for (const path of ['/browser/', '/x11-display/']) {
    test(`${path} → 200 where the xpra stack is deployed`, async ({ page, baseURL }) => {
      test.slow();   // xpra Xorg + WM + child cold-start is slow
      const probe = (await page.request.get(baseURL + path)).status();
      test.skip(probe === 404, `${path} not configured (browser stack not deployed)`);
      await reaches(page.request, baseURL, path, 200, 60000);
      const body = await (await page.request.get(baseURL + path)).text();
      // The real xpra HTML5 client, not an error page served with a 200.
      expect(body.toLowerCase(), `${path} looks like the xpra client`).toContain('xpra');
    });
  }
});

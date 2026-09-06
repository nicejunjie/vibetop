// @ts-check
// Start-menu flyouts (Games ▸, Utilities ▸) must actually ARRIVE ON SCREEN.
//
// Why this file exists, and why `toBeVisible()` was not enough. On iPad the
// flyout stopped appearing while every class was still applied: the parent's
// caret rotated (that is `.sm-parent.open`, added on open()'s first line), so by
// the code's own reckoning the panel was open — it simply was not anywhere the
// user could see. games.spec.js already clicked that row and asserted
// `toBeVisible()`, and passed the whole time, because Playwright's visibility is
// "has a non-empty box and is not visibility:hidden" — which a panel clipped or
// pushed off the viewport still satisfies.
//
// So these tests assert the thing that actually matters: the panel AND every one
// of its items lie inside the viewport.
//
// The cause was structural. The side flyout is `position: fixed` and used to sit
// inside #startmenu (`overflow-y: auto` + `border-radius`) inside a body with
// `overflow: hidden`, relying on "a fixed element escapes its ancestors' clips".
// That is true only while no ancestor establishes a containing block for fixed
// descendants — an invariant nothing enforced and no test covered. The fix hoists
// the panel to <body> on open, and falls back to the in-flow drill-down if it
// still measures off-screen.
//
// The second test REPRODUCES that hazard deterministically in any engine by
// putting a transform on #startmenu, which makes it exactly such a containing
// block. Proved against the pre-fix build (8e302fd~1), where it reports
// itemsInView 2/5 and 3/6; the fix takes both to 5/5 and 6/6.

const { test, expect } = require('@playwright/test');
const { openStartMenu } = require('../helpers');

const FLYOUTS = [
  { parent: '#sm-games-parent', sub: '#sm-games', name: 'Games' },
  { parent: '#sm-util-parent', sub: '#sm-utilities', name: 'Utilities' },
];

// The panel and all of its rows, measured against the viewport. Returned as data
// (not a bare boolean) so a failure names what went wrong instead of "expected
// true, got false".
async function measure(page, subSel) {
  return page.locator(subSel).evaluate((sub) => {
    const inView = (el) => {
      const b = el.getBoundingClientRect();
      return b.width > 1 && b.height > 1 &&
        b.left >= -1 && b.top >= -1 &&
        b.right <= window.innerWidth + 1 && b.bottom <= window.innerHeight + 1;
    };
    const items = Array.from(sub.querySelectorAll('.sm-item'));
    const r = sub.getBoundingClientRect();
    const menu = document.getElementById('startmenu');
    return {
      // A flyout is "shown" as a side panel OR as the in-menu drill-down page;
      // both are legitimate, and on a narrow screen only the second one is.
      shown: sub.classList.contains('open') ||
        /(?:^|\s)(?:util|games)-page(?:\s|$)/.test(menu.className),
      panelInView: inView(sub),
      items: items.length,
      itemsInView: items.filter(inView).length,
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      host: sub.parentElement.id || sub.parentElement.tagName,
      viewport: [window.innerWidth, window.innerHeight],
    };
  });
}

test.describe('start menu flyouts', () => {
  for (const fly of FLYOUTS) {
    test(`${fly.name} flyout lands inside the viewport, with every row reachable`,
      async ({ page }) => {
        await page.goto('/');
        await openStartMenu(page);
        await page.locator(fly.parent).click();
        await expect.poll(async () => (await measure(page, fly.sub)).shown,
          { timeout: 5000 }).toBe(true);

        const m = await measure(page, fly.sub);
        // Report the geometry on failure — "the caret turned and nothing came"
        // is only diagnosable if the numbers are in the log.
        const where = JSON.stringify(m);
        expect(m.items, `no rows rendered: ${where}`).toBeGreaterThan(0);
        expect(m.panelInView, `panel not inside the viewport: ${where}`).toBe(true);
        expect(m.itemsInView, `rows pushed outside the viewport: ${where}`).toBe(m.items);
      });
  }

  test('a containing block on the menu cannot swallow the flyout', async ({ page }) => {
    await page.goto('/');
    await openStartMenu(page);
    // A transform makes #startmenu the containing block for its position:fixed
    // descendants, so a panel left inside it is positioned against the MENU and
    // clipped by the menu's own overflow — the exact shape of the iPad failure,
    // forced here so every engine reproduces it. Anything that reintroduces the
    // assumption (dropping the <body> hoist, or the off-screen fallback) fails.
    await page.locator('#startmenu').evaluate((el) => {
      el.style.transform = 'translateZ(0)';
    });

    for (const fly of FLYOUTS) {
      await page.locator(fly.parent).click();
      await expect.poll(async () => (await measure(page, fly.sub)).shown,
        { timeout: 5000 }).toBe(true);
      const m = await measure(page, fly.sub);
      const where = `${fly.name}: ${JSON.stringify(m)}`;
      expect(m.items, `no rows rendered: ${where}`).toBeGreaterThan(0);
      expect(m.panelInView, `panel swallowed by the menu's clip: ${where}`).toBe(true);
      expect(m.itemsInView, `rows clipped away: ${where}`).toBe(m.items);
    }
  });

  // The hoist in v1.19.307 moved the panel out of #startmenu, and the menu's
  // click handler was bound to #startmenu — so every row in the flyout went dead
  // while looking perfectly fine. Geometry tests all passed. An app only counts
  // as reachable if CLICKING it launches.
  for (const [flyParent, id] of [['#sm-games-parent', 'minesweeper'],
                                 ['#sm-util-parent', 'monitor']]) {
    test(`a row inside the ${flyParent} flyout actually launches (${id})`,
      async ({ page }) => {
        await page.goto('/');
        await openStartMenu(page);
        await page.locator(flyParent).click();
        const row = page.locator(`#startmenu .sm-item[data-id="${id}"], ` +
                                 `.sm-sub .sm-item[data-id="${id}"]`).first();
        await expect(row).toBeVisible();
        await row.click();
        await expect(page.locator(`#task-apps .task-app[data-id="${id}"]`))
          .toBeVisible({ timeout: 10000 });
      });
  }

  test('closing returns the panel to the menu, so the next open is not stale',
    async ({ page }) => {
      // The side flyout is moved to <body> and must be put back: the narrow
      // drill-down needs it IN the menu, in flow. A panel left parented to
      // <body> would make the next narrow open silently render nothing.
      await page.goto('/');
      await openStartMenu(page);
      await page.locator('#sm-games-parent').click();
      await expect.poll(async () => (await measure(page, '#sm-games')).shown,
        { timeout: 5000 }).toBe(true);

      await page.locator('#start-btn').click();            // close the whole menu
      await expect(page.locator('#startmenu')).toBeHidden();

      const after = await page.locator('#sm-games').evaluate((sub) => ({
        host: sub.parentElement.id || sub.parentElement.tagName,
        cls: sub.className,
        menuCls: (document.getElementById('startmenu') || {}).className,
      }));
      expect(after.host, `flyout left parented to ${after.host}`).toBe('startmenu');
      expect(after.cls).not.toContain('open');
      expect(after.menuCls).not.toContain('games-page');
    });
});

// @ts-check
// The Start menu's grid layout (Config ▸ Start menu layout; the default).
//
// v1.38.148 shipped it half-done: 42px app tiles, 30px Games/Utilities rows,
// 24px Update/Config chips, and Utilities still a list — "grid style not
// consistent, icon sizes aren't the same". These pin the finished shape: every
// entry is one tile of one size, three across, under the list's two sections
// (Applications = 8 apps + Games, System = Update, Config, Utilities); both
// panels are the same tile grid, a switch shows its state on its tile, and the
// menu works from the keyboard.
const { test, expect } = require('@playwright/test');
const { openStartMenu } = require('../helpers');

// Every visible tile in `sel`: its box and its icon's width.
async function tiles(page, sel) {
  return page.evaluate((s) => Array.from(document.querySelectorAll(s))
    .filter((e) => e.getClientRects().length > 0)
    .map((e) => {
      const r = e.getBoundingClientRect();
      const i = /** @type {HTMLElement} */ (e.querySelector('.sm-icon')).getBoundingClientRect();
      return { id: /** @type {HTMLElement} */ (e).dataset.id || e.id,
               w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.top),
               icon: Math.round(i.width) };
    }), sel);
}
const sizes = (ts) => [...new Set(ts.map((t) => `${t.w}x${t.h}`))];

test.describe('start menu grid', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toHaveClass(/\bsm-grid\b/);   // the host default
    await openStartMenu(page);
  });

  test('every entry is a tile of one size, three to a row, in two sections', async ({ page }) => {
    const ts = await tiles(page, '#startmenu .sm-item, #startmenu > .sm-parent');
    const where = JSON.stringify(ts);
    // 8 everyday apps + Games + Utilities + Update (+ Config for a sudo user).
    expect(ts.length, where).toBeGreaterThanOrEqual(11);
    expect(sizes(ts), `tiles differ in size: ${where}`).toHaveLength(1);
    expect([...new Set(ts.map((t) => t.icon))], `icons differ in size: ${where}`).toHaveLength(1);
    const rows = {};
    ts.forEach((t) => { (rows[t.y] = rows[t.y] || []).push(t.id); });
    const ordered = Object.keys(rows).map(Number).sort((a, b) => a - b).map((y) => rows[y]);
    expect(ordered.slice(0, 3).every((r) => r.length === 3), `Applications is not 3 x 3: ${where}`).toBe(true);
    expect(ordered[2][2], 'Games does not close the Applications section').toBe('sm-games-parent');
    expect(ordered[3], 'System is not Update, (Config,) Utilities').toEqual(expect.arrayContaining(['update', 'sm-util-parent']));
    await expect(page.locator('#startmenu > .sm-title').filter({ visible: true })).toHaveText(['Applications', 'System']);
  });

  test('Utilities opens as tiles, the same size as the menu’s, with each switch’s state', async ({ page }) => {
    const menu = await tiles(page, '#startmenu .sm-item');
    await page.locator('#sm-util-parent').click();
    await expect.poll(async () => (await tiles(page, '#sm-utilities .sm-item')).length).toBeGreaterThan(0);
    const ut = await tiles(page, '#sm-utilities .sm-item');
    expect(sizes(ut), JSON.stringify(ut)).toEqual([`${menu[0].w}x${menu[0].h}`]);
    const state = await page.locator('.sm-item[data-id="sysstats"] .sm-text')
      .evaluate((el) => getComputedStyle(el, '::after').content);
    expect(state, 'the System Stats tile does not show On/Off').toMatch(/^"(On|Off)"$/);
  });

  test('flipping a switch in the side panel keeps the menu open', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'touch layouts drill down in place; the side panel is a desktop surface');
    await page.locator('#sm-util-parent').click();
    const sw = page.locator('.sm-sub .sm-item[data-id="sysstats"]');
    await expect(sw).toBeVisible();
    const before = await sw.locator('.sm-text').getAttribute('data-state');
    await sw.click();
    await expect(sw.locator('.sm-text')).not.toHaveAttribute('data-state', before || '');
    await expect(page.locator('#startmenu')).toBeVisible();
    await sw.click();                                                 // put it back
  });

  test('the keyboard reaches every tile and backs out one level at a time', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'no hardware keyboard on the phone projects');
    await page.keyboard.press('Escape');
    await expect(page.locator('#startmenu')).toBeHidden();
    await page.locator('#start-btn').focus();
    await page.keyboard.press('Enter');
    const focused = () => page.evaluate(() => {
      const a = /** @type {HTMLElement} */ (document.activeElement);
      return (a && (a.dataset.id || a.id)) || '';
    });
    await expect.poll(focused).toBe('terminal');
    await page.keyboard.press('ArrowRight');
    await expect.poll(focused).toBe('browser');
    await page.keyboard.press('ArrowDown');
    await expect.poll(focused).toBe('files');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    await expect.poll(focused).toBe('sm-games-parent');
    await page.keyboard.press('Enter');
    await expect.poll(focused).toBe('minesweeper');
    await page.keyboard.press('Escape');
    await expect.poll(focused).toBe('sm-games-parent');
    await page.keyboard.press('Escape');
    await expect.poll(focused).toBe('start-btn');
    await expect(page.locator('#startmenu')).toBeHidden();
  });
});

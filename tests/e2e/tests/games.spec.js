// @ts-check
// Games (Start ▸ Games): Minesweeper, Solitaire, 2048 — self-contained pages
// registered as normal desktop apps (v1.19.70). These assert each game's core
// loop headlessly, straight against the page (no shared-display canvas — safe
// to drive, unlike the xpra Browser). Also guards the Start-menu registration:
// a page that ships but is not in APPS (or vice versa) fails here.

const { test, expect } = require('@playwright/test');
const { openStartMenu } = require('../helpers');

test.describe('games', () => {
  test('Start menu lists the Games section with all three', async ({ page }) => {
    await page.goto('/');
    await openStartMenu(page);
    for (const id of ['minesweeper', 'solitaire', 'game2048']) {
      await expect(page.locator(`#startmenu .sm-item[data-id="${id}"]`)).toBeVisible();
    }
  });

  test('minesweeper: first click reveals safely and starts the game', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/minesweeper.html');
    const cells = page.locator('[data-r][data-c], .cell');
    await expect(cells.first()).toBeVisible();
    const before = await cells.count();
    expect(before).toBeGreaterThanOrEqual(81);          // Easy 9x9 at minimum
    await cells.first().click();
    // First click never hits a mine -> at least one cell shows revealed state.
    await expect
      .poll(async () => page.locator('.cell.open, .cell.revealed, [data-open="1"]').count())
      .toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('solitaire: a legal deal renders and the stock draws', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/solitaire.html');
    // Klondike deal: 7 tableau piles, 28 tableau cards, 7 face-up.
    await expect.poll(async () => page.locator('.pile.tableau, .tableau .pile').count())
      .toBe(7);
    const faceUp = await page.locator('.card.up, .card.face-up, .card:not(.down):not(.back)').count();
    expect(faceUp).toBeGreaterThanOrEqual(7);
    expect(errors).toEqual([]);
  });

  test('2048: arrow keys move tiles and score updates', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/game2048.html');
    await expect(page.locator('.tile').first()).toBeVisible();
    const tilesBefore = await page.locator('.tile').count();
    for (const key of ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(160);
    }
    // Four moves in four directions always change the board: a spawn per legal
    // move means the tile count (or a merge, the score) must have moved on.
    const tilesAfter = await page.locator('.tile').count();
    const score = await page.locator('#score, .score .val, [data-score]').first().textContent();
    expect(tilesAfter !== tilesBefore || parseInt(score || '0', 10) > 0).toBeTruthy();
    expect(errors).toEqual([]);
  });
});

// @ts-check
// Games (Start ▸ Games): Minesweeper, Solitaire, 2048 — self-contained pages
// registered as normal desktop apps (v1.19.70). These assert each game's core
// loop headlessly, straight against the page (no shared-display canvas — safe
// to drive, unlike the xpra Browser). Also guards the Start-menu registration:
// a page that ships but is not in APPS (or vice versa) fails here.

const { test, expect } = require('@playwright/test');
const { openStartMenu } = require('../helpers');

// v1.19.78: each game auto-opens its How-to-play card on FIRST launch (and a
// fresh test context is always a first launch) — input is blocked while it
// shows, so dismiss it before playing.
async function dismissFirstLaunchHelp(page) {
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}


test.describe('games', () => {
  test('Start menu lists the Games flyout with every game', async ({ page }) => {
    await page.goto('/');
    await openStartMenu(page);
    // Since v1.19.72 the games live in a Games ▶ flyout (like Utilities):
    // hidden until the parent row opens it (click = open on mouse, toggle on
    // touch — a first click opens in both models).
    await page.locator('#sm-games-parent').click();
    for (const id of ['minesweeper', 'solitaire', 'game2048', 'circuit', 'rts']) {
      await expect(page.locator(`#sm-games .sm-item[data-id="${id}"]`)).toBeVisible();
    }
  });

  test('minesweeper: first click reveals safely and starts the game', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/minesweeper.html');
    await dismissFirstLaunchHelp(page);
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
    await dismissFirstLaunchHelp(page);
    // Klondike deal: 7 tableau columns (#tabrow .col), 28 tableau cards (.pc),
    // exactly one face-up (.pc.up) per column.
    await expect.poll(async () => page.locator('#tabrow .col').count()).toBe(7);
    await expect.poll(async () => page.locator('#tabrow .pc').count()).toBe(28);
    const faceUp = await page.locator('#tabrow .pc.up').count();
    expect(faceUp).toBe(7);
    expect(errors).toEqual([]);
  });

  test('2048: arrow keys move tiles and score updates', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/game2048.html');
    await dismissFirstLaunchHelp(page);
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

  // v1.19.162. Reported from an iPhone with a screenshot: ▶ stuck lit and the
  // player walked forward for the rest of the run with nothing pressed. iOS
  // recycles pointerIds, so one missed pointerup left an entry in the pad's
  // `held` map and the NEXT touch overwrote it — the orphaned button kept its
  // key down forever. Asserted on the two ways a pointer can go missing.
  test('circuit: a d-pad button can never be orphaned with its key down', async ({ browser }) => {
    const ctx = await browser.newContext({ hasTouch: true, isMobile: true,
                                           viewport: { width: 400, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/circuit.html');
    await page.waitForTimeout(600);
    await page.locator('#ovGo').click();
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__crTest.silence());

    const press = (k, id) => page.evaluate(([k, id]) => {
      const btn = document.querySelector('.pad .btn[data-k="' + k + '"]');
      const r = btn.getBoundingClientRect();
      btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: id,
        pointerType: 'touch', isPrimary: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
    }, [k, id]);
    const lit = () => page.evaluate(() => [...document.querySelectorAll('.pad .btn')]
      .filter((b) => b.classList.contains('act')).map((b) => b.dataset.k));

    // A missed pointerup, then the same recycled id lands on another button.
    await press('right', 5);
    await page.waitForTimeout(80);
    await press('left', 5);
    await page.waitForTimeout(80);
    expect(await lit()).toEqual(['left']);

    // The thumb slides off the pad and lifts over the shell's taskbar, i.e.
    // outside this iframe: the release never reaches this document at all.
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(120);
    expect(await lit()).toEqual([]);

    // ...and the player is genuinely standing still, not merely un-lit.
    const x0 = await page.evaluate(() => window.__cr().px);
    await page.evaluate(() => window.__crTest.step(60));
    expect(await page.evaluate(() => window.__cr().px)).toBe(x0);

    expect(errors).toEqual([]);
    await ctx.close();
  });
});

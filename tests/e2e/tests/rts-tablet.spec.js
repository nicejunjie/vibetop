// @ts-check
// Iron Frontier on a tablet.
//
// The page used to be gated by `(hover: none) and (pointer: coarse)` — which is
// every touch screen, so it showed "Desktop only" on an iPad: a device with room
// for the whole UI and a touch layer (select, order, drag-pan, pinch-zoom) that
// already worked. The gate now measures SIZE, because size is what a phone
// actually lacks, and a two-finger tap supplies the one input touch had no way
// to express: the right mouse button.
//
// Both halves are asserted here because each is invisible to the other: the gate
// is CSS, the right-click is JS, and a regression in either one leaves a game
// that looks fine and cannot be played.

const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.goto('/rts.html');
  await page.waitForFunction(() => !!window.__rts, null, { timeout: 15000 });
  await page.locator('#ovA').click();                  // the title card's "Start"
  await expect
    .poll(async () => page.evaluate(() => window.__rts().state), { timeout: 12000 })
    .toBe('play');
}

const gateShown = (page) => page.evaluate(() =>
  getComputedStyle(document.getElementById('nomob')).display !== 'none');

test.describe('rts on a tablet', () => {
  test('the phone gate is lifted and the match runs', async ({ page }) => {
    await page.goto('/rts.html');
    await page.waitForFunction(() => !!window.__rts, null, { timeout: 15000 });
    expect(await gateShown(page), 'the "too small" gate is covering the game')
      .toBe(false);
    await boot(page);                                   // and it actually plays
    expect((await page.evaluate(() => window.__rts())).state).toBe('play');
  });

  // Two fingers are a pinch OR a right-click, told apart on release: a quick tap
  // that never travelled is the button, anything else stays pinch/pan.
  //
  // Proving the ORDER path fires without reading unit internals: with nothing
  // selected, the right button is the only input that produces "Select something
  // first" — a one-finger tap on empty ground just clears the selection, in
  // silence. So that line appearing IS the right-click, and its absence after a
  // two-finger DRAG is the pinch still being a pinch.
  async function twoFinger(page, dx, dy) {
    return page.evaluate(async ([dx, dy]) => {
      const cv = document.querySelector('canvas');
      const r = cv.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const ev = (type, id, x, y) => cv.dispatchEvent(new PointerEvent(type, {
        pointerId: id, pointerType: 'touch', isPrimary: id === 1,
        clientX: x, clientY: y, bubbles: true, cancelable: true }));
      ev('pointerdown', 1, cx - 20, cy);
      ev('pointerdown', 2, cx + 20, cy);
      if (dx || dy) {
        ev('pointermove', 1, cx - 20 + dx, cy + dy);
        ev('pointermove', 2, cx + 20 + dx, cy + dy);
      }
      await new Promise((res) => setTimeout(res, 60));
      ev('pointerup', 1, cx - 20 + dx, cy + dy);
      ev('pointerup', 2, cx + 20 + dx, cy + dy);
    }, [dx, dy]);
  }
  const tips = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('#tip .ev')).map((e) => e.textContent).join(' | '));

  test('a two-finger tap is the right mouse button', async ({ page }) => {
    await boot(page);
    await twoFinger(page, 0, 0);
    await expect.poll(() => tips(page), { timeout: 4000 })
      .toContain('Select something first');
  });

  test('a two-finger drag stays a pinch, and orders nothing', async ({ page }) => {
    await boot(page);
    await twoFinger(page, 60, 40);
    await page.waitForTimeout(600);
    expect(await tips(page), 'a pinch/pan was mistaken for a right-click')
      .not.toContain('Select something first');
  });
});

// The gate must still stop a PHONE — the reason it existed.
test.describe('rts on a phone', () => {
  test.use({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
  test('the gate still covers the game', async ({ page }) => {
    await page.goto('/rts.html');
    await page.waitForFunction(() => !!document.getElementById('nomob'), null, { timeout: 15000 });
    expect(await gateShown(page), 'a phone got through the size gate').toBe(true);
  });
});

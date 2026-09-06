// @ts-check
// Reordering the terminal tab strip — specifically, reaching the END of it.
//
// The drop target used to come from `e.target.closest('.tab')`, and both the
// dragover and drop handlers returned when that was null. But `.tabs` is
// `flex: 1 1 auto`: past the last tab there is a wide empty runway and the "+"
// button, and every pixel of that hit-tests to the STRIP, not to a tab. So the
// natural gesture for "put this last" — drag it past everything — did nothing
// and the tab snapped back. Measured on the shipped build before the fix, with
// six tabs across a 1217px strip:
//
//   drop on last tab's right half  -> [3,8,7,6,5,1]   MOVED
//   drop on the + button           -> [1,3,8,7,6,5]   no change
//   drop in empty space after tabs -> [1,3,8,7,6,5]   no change
//
// i.e. the end of the strip was reachable only through a 60px sliver. The drop
// is now resolved by sweeping tab midpoints against the pointer's x, so the
// runway and the "+" both mean "the end". These tests aim at the runway on
// purpose: an implementation that goes back to reading e.target passes a
// midpoint-of-the-last-tab test and fails these.

const { test, expect } = require('@playwright/test');

const order = (page) => page.evaluate(
  () => [...document.querySelectorAll('#tabs .tab')].map((t) => +t.dataset.n));

// Native HTML5 drag-and-drop, driven by real mouse input so the browser's own
// drag machinery runs (dispatching synthetic DragEvents would test nothing but
// our listeners).
async function dragTo(page, fromIndex, x) {
  const b = await page.locator('#tabs .tab').nth(fromIndex).boundingBox();
  const y = b.y + b.height / 2;
  const sx = b.x + b.width / 2;
  await page.mouse.move(sx, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(sx + (x - sx) * i / 10, y);
  await page.waitForTimeout(150);            // let the last dragover land
  const marks = await page.evaluate(() => [...document.querySelectorAll('#tabs .tab')]
    .map((t) => t.dataset.n + (t.classList.contains('drag-over-left') ? '<'
      : t.classList.contains('drag-over-right') ? '>' : '')).join(' '));
  await page.mouse.up();
  await page.waitForTimeout(300);
  return marks;
}

test.describe('terminal tab strip', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/terminals/');
    await page.waitForSelector('#tabs .tab', { timeout: 30000 });
    // Three tabs make "first", "middle" and "last" distinct positions.
    while ((await page.locator('#tabs .tab').count()) < 3) {
      const n = await page.locator('#tabs .tab').count();
      await page.locator('#add-btn').click();
      await expect.poll(() => page.locator('#tabs .tab').count(),
        { timeout: 30000 }).toBeGreaterThan(n);
    }
    await page.waitForTimeout(500);
  });

  test('a tab dropped in the empty runway past the last one goes to the end',
    async ({ page }) => {
      const before = await order(page);
      const strip = await page.locator('#tabs').boundingBox();
      const marks = await dragTo(page, 0, strip.x + strip.width - 40);
      const after = await order(page);
      expect(after, `dropped past the end and nothing moved (caret was "${marks}")`)
        .toEqual([...before.slice(1), before[0]]);
      // and the caret said so before the drop
      expect(marks, 'no drop caret while over the runway').toContain('>');
    });

  test('the "+" button is the end of the strip too', async ({ page }) => {
    const before = await order(page);
    const add = await page.locator('#add-btn').boundingBox();
    await dragTo(page, 0, add.x + add.width / 2);
    expect(await order(page)).toEqual([...before.slice(1), before[0]]);
  });

  test('dropping between two tabs still inserts there', async ({ page }) => {
    const before = await order(page);
    const third = await page.locator('#tabs .tab').nth(2).boundingBox();
    await dragTo(page, 0, third.x + 8);            // left half of the 3rd tab
    const moved = before.slice(1);
    moved.splice(1, 0, before[0]);                 // [b,c,...] -> [b,a,c,...]
    expect(await order(page)).toEqual(moved);
  });

  test('a tab dragged to where it already is does not move, and shows no caret',
    async ({ page }) => {
      const before = await order(page);
      const strip = await page.locator('#tabs').boundingBox();
      const last = before.length - 1;
      const marks = await dragTo(page, last, strip.x + strip.width - 40);
      expect(await order(page)).toEqual(before);
      expect(marks, 'a caret promised a reorder that would change nothing')
        .not.toMatch(/[<>]/);
    });
});

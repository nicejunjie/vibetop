// @ts-check
// The taskbar clock: present and legible at every width, phones included.
//
// It lives in the taskbar's flex-shrink:0 zone so a long tab list scrolls UNDER
// it rather than shoving it off-screen — the layout bug the stats block was
// already designed around. Below 736px that stops applying, because there the
// whole bar is one horizontal scroller by design; the clock costs scroll distance
// instead of visible tab room, which is why it is shown on phones too.

const { test, expect } = require('@playwright/test');

const clock = (page) => page.evaluate(() => {
  const el = document.getElementById('tb-clock');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const power = document.getElementById('tb-logout-wrap').getBoundingClientRect();
  const bar = document.getElementById('taskbar').getBoundingClientRect();
  return {
    shown: getComputedStyle(el).display !== 'none' && r.width > 0 && r.height > 0,
    time: (document.getElementById('tb-clock-t') || {}).textContent,
    date: (document.getElementById('tb-clock-d') || {}).textContent,
    leftOfPower: r.right <= power.left + 1,
    // Fits the bar's height — a two-row clock must not push the taskbar taller.
    fitsBarHeight: r.height <= bar.height + 1,
    insideBar: r.left >= bar.left - 1 && r.right <= bar.right + 1,
    // The divider between the stats and the clock. It is the only shrinkable item
    // in an overflowing taskbar, so on phones flexbox used to collapse it to 0.
    sepWidth: document.getElementById('tb-clock-sep').getBoundingClientRect().width,
  };
});

test('shows the time and date on every width, phones included', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(600);
  const c = await clock(page);
  expect(c).not.toBeNull();
  expect(c.shown).toBe(true);
  expect(c.time).toMatch(/\d{1,2}:\d{2}/);          // locale may append AM/PM
  expect(c.date).toMatch(/\w/);
  expect(c.leftOfPower).toBe(true);                  // trailing edge, before ⏻
  expect(c.fitsBarHeight).toBe(true);
  expect(c.sepWidth).toBeGreaterThanOrEqual(1);      // divider survives a narrow bar
});

test('a taskbar full of apps scrolls under the clock instead of pushing it off', async ({ page, viewport }) => {
  // Wide layout only. At <=736px the whole bar is one horizontal scroller by
  // design ("on phones the taskbar scrolls as one unit"), so everything trailing
  // scrolls with it — the clock AND the ⏻ button, which has always behaved that
  // way. That is a pre-existing taskbar decision, not something the clock changed.
  test.skip(!!viewport && viewport.width <= 736, 'narrow layout scrolls the whole bar by design');
  await page.goto('/');
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const strip = document.getElementById('task-apps');
    for (let i = 0; i < 24; i++) {
      const b = document.createElement('div');
      b.className = 'task-app';
      b.textContent = 'Filler app ' + i;
      strip.appendChild(b);
    }
  });
  await page.waitForTimeout(200);
  const c = await clock(page);
  expect(c.shown).toBe(true);
  expect(c.insideBar).toBe(true);
  expect(c.leftOfPower).toBe(true);
});

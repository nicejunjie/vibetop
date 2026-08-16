// @ts-check
// The taskbar clock: present and legible on desktop/tablet, absent on phones.
//
// Both halves matter. It lives in the taskbar's flex-shrink:0 zone so a long tab
// list scrolls UNDER it rather than shoving it off-screen — the layout bug the
// stats block was already designed around. And it is hidden below 736px on
// purpose: the phone's own status bar shows the time a centimetre above the
// taskbar, so a second clock would only cost tab room where there is least of it.
// A breakpoint is exactly the kind of thing that regresses silently.

const { test, expect } = require('@playwright/test');

const clock = (page) => page.evaluate(() => {
  const el = document.getElementById('tb-clock');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const bar = document.getElementById('taskbar').getBoundingClientRect();
  const power = document.getElementById('tb-logout-wrap').getBoundingClientRect();
  return {
    shown: getComputedStyle(el).display !== 'none' && r.width > 0,
    time: (document.getElementById('tb-clock-t') || {}).textContent,
    date: (document.getElementById('tb-clock-d') || {}).textContent,
    insideBar: r.left >= bar.left - 1 && r.right <= bar.right + 1,
    leftOfPower: r.right <= power.left + 1,
  };
});

test('phones hide it — the OS status bar already shows the time', async ({ page, isMobile, viewport }) => {
  test.skip(!viewport || viewport.width > 736, 'not a phone-width lane');
  await page.goto('/');
  await page.waitForTimeout(600);
  const c = await clock(page);
  expect(c).not.toBeNull();
  expect(c.shown).toBe(false);
});

test('desktop and tablet show it, next to the power button, inside the bar', async ({ page, viewport }) => {
  test.skip(!!viewport && viewport.width <= 736, 'phone-width lane hides it by design');
  await page.goto('/');
  await page.waitForTimeout(600);
  const c = await clock(page);
  expect(c.shown).toBe(true);
  expect(c.time).toMatch(/\d{1,2}:\d{2}/);          // locale may add AM/PM
  expect(c.date).toMatch(/\w/);
  expect(c.insideBar).toBe(true);                    // never clipped out of the taskbar
  expect(c.leftOfPower).toBe(true);                  // trailing edge, before ⏻
});

test('a taskbar full of apps scrolls under the clock instead of pushing it off', async ({ page, viewport }) => {
  test.skip(!!viewport && viewport.width <= 736, 'phone-width lane hides it by design');
  await page.goto('/');
  await page.waitForTimeout(600);
  // Fill the tab strip well past the bar's width without opening real apps.
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

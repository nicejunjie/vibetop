// @ts-check
// Super Vibe Bros (Start ▸ Games ▸ 🍄) — a side-scrolling platformer, one
// self-contained page. A canvas game cannot be asserted from the DOM, so the
// page exposes read-only hooks the tests drive instead:
//   __mario()            a state snapshot (position, velocity, score, mode…)
//   __marioBuild(i)      a level's tile grid + spawns, for the geometry audit
//   __marioTest.place()  put the player somewhere, to SET UP a situation
//   __marioSpriteWarnings  any pixel row that is not its declared width
//
// The situations are set up rather than played into: reaching a goomba by
// holding → and hoping is luck, and a test that depends on luck is noise.

const { test, expect } = require('@playwright/test');
const { openStartMenu } = require('../helpers');

// A full-speed jump clears roughly 7 tiles level and 6 while climbing 3. The
// audit budget is deliberately tighter, so a level is never merely *barely*
// possible.
const MAX_DX = 5, MAX_UP = 3;

async function boot(page) {
  await page.goto('/mario.html');
  await page.waitForFunction(() => !!window.__mario, null, { timeout: 15000 });
  await page.locator('#helpX').click();               // first-launch how-to card
  await page.locator('#ovGo').click();                // the title card
  await expect
    .poll(async () => page.evaluate(() => window.__mario().state), { timeout: 12000 })
    .toBe('play');
}
const snap = (page) => page.evaluate(() => window.__mario());
const place = (page, x, y) => page.evaluate(([a, b]) => window.__marioTest.place(a, b), [x, y]);
const ents = (page) => page.evaluate(() => window.__marioTest.ents());

test.describe('mario', () => {
  test('Start menu lists it in the Games flyout', async ({ page }) => {
    await page.goto('/');
    await openStartMenu(page);
    await page.locator('#sm-games-parent').click();
    await expect(page.locator('#sm-games .sm-item[data-id="mario"]')).toBeVisible();
  });

  test('every sprite row is its declared width', async ({ page }) => {
    await page.goto('/mario.html');
    await page.waitForFunction(() => !!window.__marioSpriteWarnings);
    // A row one character short silently shifts every pixel to its right —
    // invisible in a diff, obvious on screen.
    expect(await page.evaluate(() => window.__marioSpriteWarnings)).toEqual([]);
  });

  test('every level can actually be finished', async ({ page }) => {
    await page.goto('/mario.html');
    await page.waitForFunction(() => !!window.__marioBuild, null, { timeout: 15000 });
    const count = await page.evaluate(() => window.__marioLevelCount);
    expect(count).toBe(4);

    for (let i = 0; i < count; i++) {
      const L = await page.evaluate((k) => window.__marioBuild(k), i);
      const SOLID = new Set(L.T.SOLID);
      const at = (x, y) => (x < 0 || x >= L.w || y < 0 || y >= L.h) ? 0 : L.tiles[y * L.w + x];
      // A foothold needs two tiles of headroom and cannot be the ceiling.
      const standable = (x, y) => y >= 2 &&
        (SOLID.has(at(x, y)) || at(x, y) === L.T.PLAT) &&
        !SOLID.has(at(x, y - 1)) && !SOLID.has(at(x, y - 2));

      // Two numbers per column: where you can LAND (a moving platform at its
      // lowest) and where you can LEAVE from (the same platform at its highest).
      const enter = new Array(L.w).fill(null), exit = new Array(L.w).fill(null);
      for (let x = 0; x < L.w; x++) {
        for (let y = 0; y < L.h; y++) {
          if (at(x, y) === L.T.LAVA) break;
          if (standable(x, y)) { enter[x] = y; exit[x] = y; break; }
        }
      }
      L.spawns.filter((s) => s.type === 'plat').forEach((s) => {
        const w = s.w || 3;
        const x0 = s.dx ? s.min : s.x, x1 = s.dx ? s.max + w - 1 : s.x + w - 1;
        const lo = s.dy ? Math.max(s.min, s.max) : s.y;
        const hi = s.dy ? Math.min(s.min, s.max) : s.y;
        for (let x = x0; x <= x1; x++) {
          if (enter[x] === null || enter[x] < lo) enter[x] = lo;
          if (exit[x] === null || exit[x] > hi) exit[x] = hi;
        }
      });

      const bad = [];
      let last = null;
      for (let x = L.start; x <= Math.min(L.w - 1, L.flagX); x++) {
        if (enter[x] === null) continue;
        if (last !== null) {
          const dx = x - last.x, up = last.y - enter[x];
          if (dx > 1 && (dx > MAX_DX || up > MAX_UP)) {
            bad.push(`${L.name}: x${last.x} -> x${x} is ${dx} across, ${up} up`);
          }
        }
        last = { x, y: exit[x] };
      }
      expect(bad, `world ${L.name} has a jump nobody can make`).toEqual([]);
      expect(enter[L.flagX], `world ${L.name} flagpole has no ground`).not.toBeNull();
      expect(enter[L.start], `world ${L.name} start has no ground`).not.toBeNull();

      // every warp lands on real ground (a room built past the level width is
      // silently dropped by the builder — the pipe then leads nowhere)
      for (const k of Object.keys(L.warps)) {
        const t = L.warps[k];
        expect(t.x, `${L.name} warp ${k} leaves the level`).toBeLessThan(L.w);
        expect(enter[t.x], `${L.name} warp ${k} lands in the void`).not.toBeNull();
      }
    }
  });

  test('it walks, runs and jumps', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await boot(page);

    // measured on the empty opening stretch — the first goomba is at tile 22
    await place(page, 3, 13);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(900);
    const walk = Math.abs((await snap(page)).vx);
    await page.keyboard.up('ArrowRight');
    await place(page, 3, 13);
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(900);
    const run = Math.abs((await snap(page)).vx);
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('ArrowRight');
    expect(walk).toBeGreaterThan(1.4);
    expect(run).toBeGreaterThan(walk * 1.3);

    // holding jump goes higher than tapping it. Sampled per animation frame in
    // the page: round-tripping every 45ms misses the apex and reports a third
    // of the real height.
    const apex = async (ms) => {
      await place(page, 3, 13);
      await page.waitForTimeout(250);
      await page.evaluate(() => {
        window.__trace = [];
        const t = () => {
          window.__trace.push(window.__mario().py);
          if (window.__trace.length < 90) requestAnimationFrame(t);
        };
        requestAnimationFrame(t);
      });
      await page.keyboard.down('Space');
      await page.waitForTimeout(ms);
      await page.keyboard.up('Space');
      await page.waitForTimeout(1500);
      const tr = await page.evaluate(() => window.__trace);
      return tr[0] - Math.min.apply(null, tr);
    };
    const tap = await apex(60), hold = await apex(600);
    expect(hold).toBeGreaterThan(tap + 15);
    expect(hold).toBeGreaterThan(55);            // a full jump clears four tiles
    expect(errors).toEqual([]);
  });

  test('blocks pay out and a mushroom makes you big', async ({ page }) => {
    await boot(page);
    await place(page, 16, 13);
    const before = (await snap(page)).coins;
    await page.keyboard.down('Space');
    await page.waitForTimeout(500);
    await page.keyboard.up('Space');
    await page.waitForTimeout(700);
    expect((await snap(page)).coins).toBe(before + 1);
    expect(await page.evaluate(() => window.__marioTest.tile(16, 9))).toBe(4);  // used

    await place(page, 21, 13);
    await page.keyboard.down('Space');
    await page.waitForTimeout(500);
    await page.keyboard.up('Space');
    await page.waitForTimeout(500);
    expect((await ents(page)).some((e) => e.type === 'mushroom')).toBe(true);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(1400);
    await page.keyboard.up('ArrowRight');
    await expect.poll(async () => (await snap(page)).big, { timeout: 5000 }).toBe(true);
  });

  test('stomping a goomba scores, walking into one costs the power-up', async ({ page }) => {
    await boot(page);
    // the goomba at tile 40 — open sky above it. Dropping on the FIRST one
    // means landing on the ? block row it walks under.
    await place(page, 36, 13);
    await page.waitForTimeout(500);
    const goo = (await ents(page)).filter((e) => e.type === 'goomba' && !e.gone && e.x > 560)[0];
    expect(goo, 'a goomba to land on').toBeTruthy();
    const before = (await snap(page)).score;
    await place(page, goo.x / 16, 8);
    await expect.poll(async () => (await snap(page)).score, { timeout: 5000 })
      .toBeGreaterThan(before);

    await page.evaluate(() => { window.__marioTest.give('big'); });
    await place(page, 40, 13);
    const lives = (await snap(page)).lives;
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(1800);
    await page.keyboard.up('ArrowRight');
    const s = await snap(page);
    expect(s.big).toBe(false);
    expect(s.lives).toBe(lives);
  });

  test('the flagpole ends the level and the next world loads', async ({ page }) => {
    test.slow();
    await boot(page);
    await place(page, 198, 13);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(1200);
    await page.keyboard.up('ArrowRight');
    await expect.poll(async () => (await snap(page)).state, { timeout: 8000 })
      .toMatch(/clear/);
    await expect(page.locator('#overlay.show')).toBeVisible({ timeout: 15000 });
    await page.locator('#ovGo').click();
    await expect.poll(async () => (await snap(page)).level, { timeout: 12000 }).toBe('1-2');
  });

  test('every world boots and plays', async ({ page }) => {
    await boot(page);
    for (const i of [1, 2, 3]) {
      await page.evaluate((k) => window.__marioTest.level(k), i);
      await expect.poll(async () => (await snap(page)).state, { timeout: 10000 }).toBe('play');
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(1200);
      await page.keyboard.up('ArrowRight');
      expect((await snap(page)).state).toMatch(/play|dead/);
    }
  });
});

// The on-screen pad is the ONLY way to play on a phone: if a button is too
// small or does not latch while held, the game is unplayable there.
test.describe('mario on touch', () => {
  test.skip(({ hasTouch }) => !hasTouch, 'touch lanes only');

  test('the pad shows, its buttons are real targets, and holding one walks', async ({ page }) => {
    await page.goto('/mario.html');
    await page.waitForFunction(() => !!window.__mario, null, { timeout: 15000 });
    await page.locator('#helpX').click();
    await page.locator('#ovGo').click();
    await expect.poll(async () => (await snap(page)).state, { timeout: 12000 }).toBe('play');
    await expect(page.locator('#pad')).toBeVisible();

    for (const k of ['left', 'right', 'jump', 'run', 'down']) {
      const box = await page.locator(`.pad .btn[data-k="${k}"]`).boundingBox();
      expect(box, `${k} button`).toBeTruthy();
      expect(box.width, `${k} button width`).toBeGreaterThanOrEqual(50);
      expect(box.height, `${k} button height`).toBeGreaterThanOrEqual(50);
    }

    // A tap is press+release inside one frame; hold it with raw pointer events.
    const x0 = (await snap(page)).px;
    await page.dispatchEvent('.pad .btn[data-k="right"]', 'pointerdown',
                             { pointerId: 1, isPrimary: true, bubbles: true });
    await page.waitForTimeout(900);
    const moved = (await snap(page)).px - x0;
    await page.dispatchEvent('.pad .btn[data-k="right"]', 'pointerup',
                             { pointerId: 1, isPrimary: true, bubbles: true });
    expect(moved).toBeGreaterThan(40);

    const y0 = (await snap(page)).py;
    await page.dispatchEvent('.pad .btn[data-k="jump"]', 'pointerdown',
                             { pointerId: 2, isPrimary: true, bubbles: true });
    await page.waitForTimeout(260);
    const y1 = (await snap(page)).py;
    await page.dispatchEvent('.pad .btn[data-k="jump"]', 'pointerup',
                             { pointerId: 2, isPrimary: true, bubbles: true });
    expect(y1).toBeLessThan(y0 - 15);
  });
});

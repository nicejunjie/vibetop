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
  if (await page.locator('#helpOv.show').isVisible()) await page.locator('#helpX').click();
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
    expect(count).toBe(5);

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
        // bottom-up: the walking surface is the LOWEST foothold in a column,
        // not the first brick or cloud you meet coming down from the sky.
        for (let y = L.h - 1; y >= 0; y--) {
          if (at(x, y) === L.T.LAVA) continue;
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

      // A water level is swum, not walked: footholds do not gate progress
      // there, and its coral pillars would read as unjumpable steps.
      // A water level is swum, not walked: footholds gate nothing there, and
      // its coral pillars would read as unjumpable steps.
      if (L.theme === 'water') {
        expect(enter[L.flagX], `world ${L.name} flagpole has no ground`).not.toBeNull();
        continue;
      }
      const bad = [];
      let last = null;
      if (L.theme === 'water') { expect(enter[L.flagX]).not.toBeNull(); continue; }
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
      if (L.checkpoint) {
        // STATIC ground, not a moving platform that happens to pass overhead:
        // every respawn past the checkpoint starts here, and 1-3's sat over a
        // chasm — you lost the rest of your lives without touching a key.
        let solidUnder = false;
        for (let y = 2; y < L.h; y++) if (SOLID.has(at(L.checkpoint, y))) { solidUnder = true; break; }
        expect(solidUnder, `world ${L.name} checkpoint x=${L.checkpoint} has no ground`).toBe(true);
      }

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
    await page.evaluate(() => window.__marioTest.clear());
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

    // Fresh level, then walk into a LIVE goomba from three tiles away. Walking
    // right for a fixed time from a fixed tile and hoping to meet one is a
    // race against wherever the enemies happen to have got to.
    await page.evaluate(() => window.__marioTest.level(0));
    await expect.poll(async () => (await snap(page)).state, { timeout: 10000 }).toBe('play');
    await page.evaluate(() => window.__marioTest.give('big'));
    await page.waitForTimeout(500);
    // the FIRST goomba: open ground either side of it, so three tiles to its
    // left is three tiles of walking and not a pipe in the way
    const live = (await ents(page)).filter((e) => e.type === 'goomba' && !e.gone && e.x < 560)[0];
    expect(live, 'a goomba to walk into').toBeTruthy();
    await place(page, live.x / 16 - 3, 13);
    const lives = (await snap(page)).lives;
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(1500);
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

  test('lava kills outright, whatever size you are', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__marioTest.level(4));       // the castle
    await expect.poll(async () => (await snap(page)).state, { timeout: 10000 }).toBe('play');
    await page.evaluate(() => window.__marioTest.give('fire'));
    expect((await snap(page)).big).toBe(true);
    await place(page, 22, 13);                                    // into the first pool
    // A mushroom buys you one enemy hit; it does not buy you a swim in lava.
    // Timing matters: the old behaviour SHRANK you and gave 110 frames of
    // invulnerability, so "you die eventually" passed either way. Death has to
    // be immediate.
    await page.waitForTimeout(400);
    expect((await snap(page)).state).toBe('dead');
  });

  test('finishing drains the clock into the score, visibly', async ({ page }) => {
    test.slow();
    await boot(page);
    await place(page, 198, 13);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(1200);
    await page.keyboard.up('ArrowRight');

    // The drain is fast; two samples a second apart can straddle it entirely,
    // so watch the whole sequence and require an intermediate reading.
    const seen = [];
    for (let i = 0; i < 120; i++) {
      seen.push(await snap(page));
      if (await page.locator('#overlay.show').isVisible()) break;
      await page.waitForTimeout(120);
    }
    const draining = seen.filter((s) => s.state === 'clearing');
    expect(draining.length, 'the clear sequence runs').toBeGreaterThan(0);
    expect(draining.filter((s) => s.time > 0 && s.time < 400).length,
           'the clock is seen counting down').toBeGreaterThan(0);
    expect(draining[draining.length - 1].score).toBeGreaterThan(draining[0].score);
    expect((await snap(page)).time).toBe(0);
  });

  test('running out of lives offers a continue at the world you died in', async ({ page }) => {
    test.slow();
    await boot(page);
    await page.evaluate(() => window.__marioTest.level(3));       // world 1-4
    await expect.poll(async () => (await snap(page)).state, { timeout: 10000 }).toBe('play');

    // x=58 is real void in 1-4 — the mushroom trees end at 55 and the ground
    // resumes at 60. Dropping at 40 lands ON a tree, which is not a death.
    for (let i = 0; i < 5; i++) {
      await place(page, 58, 4);
      for (let j = 0; j < 60; j++) {
        await page.waitForTimeout(150);
        if (await page.locator('#overlay.show').isVisible()) break;
        if ((await snap(page)).state === 'intro') break;
      }
      if (await page.locator('#overlay.show').isVisible()) break;
      await page.waitForTimeout(2000);
    }
    await expect(page.locator('#overlay.show')).toBeVisible();
    await expect(page.locator('#ovTitle')).toHaveText(/Game over/);
    await expect(page.locator('#ovAlt')).toHaveText(/1-4/);
    await page.locator('#ovAlt').click();
    await expect.poll(async () => (await snap(page)).level, { timeout: 10000 }).toBe('1-4');
    const s = await snap(page);
    expect(s.lives).toBe(3);
    expect(s.score).toBe(0);
  });

  test('one flagpole advances exactly one world', async ({ page }) => {
    test.slow();
    await boot(page);
    await place(page, 198, 13);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(1200);
    await page.keyboard.up('ArrowRight');
    await expect(page.locator('#overlay.show')).toBeVisible({ timeout: 25000 });
    // 'clearing' was not a terminal state, so its final branch re-ran every
    // frame: one flagpole advanced the world four times in 66ms and dumped you
    // straight on the victory card with 1-2..1-4 never loaded.
    await expect(page.locator('#ovTitle')).toHaveText(/1-1 cleared/);
    await page.waitForTimeout(1500);
    await expect(page.locator('#ovTitle')).toHaveText(/1-1 cleared/);
  });

  test('the castle hazards actually exist', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__marioTest.level(4));
    await expect.poll(async () => (await snap(page)).state, { timeout: 10000 }).toBe('play');
    // The firebars were positioned in pixels and then drawn as tiles, putting
    // every one of them thousands of pixels off screen; the cannons' countdown
    // was cancelled out by the entity loop's shared tick, so none ever fired.
    await place(page, 11, 13);
    await page.waitForTimeout(600);
    const bar = (await ents(page)).filter((e) => e.type === 'firebar')[0];
    const s = await snap(page);
    expect(bar, 'a firebar near the start of the castle').toBeTruthy();
    expect(bar.x - s.camx).toBeGreaterThan(-40);
    expect(bar.x - s.camx).toBeLessThan(s.vw + 40);

    await place(page, 46, 13);
    await expect
      .poll(async () => (await ents(page)).some((e) => e.type === 'bill'), { timeout: 8000 })
      .toBe(true);
  });

  test('a bumped block bounces the item on it instead of eating it', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__marioTest.clear());
    await place(page, 21, 13);
    await page.keyboard.down('Space');
    await page.waitForTimeout(500);
    await page.keyboard.up('Space');
    await page.waitForTimeout(900);
    expect((await ents(page)).some((e) => e.type === 'mushroom')).toBe(true);
    // The mushroom walks onto the bricks either side; bumping one from below —
    // the natural thing to do — used to delete it for 200 points.
    await place(page, 22, 13);
    await page.keyboard.down('Space');
    await page.waitForTimeout(500);
    await page.keyboard.up('Space');
    await page.waitForTimeout(700);
    expect((await ents(page)).some((e) => e.type === 'mushroom')).toBe(true);
  });

  test('New closes whatever card is open', async ({ page }) => {
    await page.goto('/mario.html');
    await page.waitForFunction(() => !!window.__mario, null, { timeout: 15000 });
    await expect(page.locator('#overlay.show')).toBeVisible();
    await page.locator('#newBtn').click();
    // It used to start the level BEHIND the card — and the touch pad is hidden
    // while a card is up, so on a phone the game ran and could not be played.
    await expect(page.locator('#overlay.show')).toBeHidden();
    expect(await page.evaluate(() => document.body.classList.contains('carded'))).toBe(false);
  });

  test('the water world swims', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__marioTest.level(2));
    await expect.poll(async () => (await snap(page)).state, { timeout: 10000 }).toBe('play');
    expect((await snap(page)).level).toBe('1-3');
    expect((await ents(page)).some((e) => e.type === 'cheep')).toBe(true);
    await page.evaluate(() => window.__marioTest.clear());   // physics, not fish

    // you sink, but slowly — swimming is not falling
    await place(page, 6, 8);
    await page.waitForTimeout(400);
    const a = (await snap(page)).py;
    await page.waitForTimeout(1200);
    const b = (await snap(page)).py;
    expect(b).toBeGreaterThan(a + 8);
    expect(b - a).toBeLessThan(130);

    // one stroke per PRESS: `undefined <= 0` is false, and swimCool was only
    // ever assigned inside the branch it gated — so swimming up never worked
    // at all until it was initialised.
    await place(page, 6, 8);
    await page.waitForTimeout(300);
    const c = (await snap(page)).py;
    const apexP = page.evaluate(() => new Promise((res) => {
      let best = 1e9, i = 0;
      const t = () => { const y = window.__mario().py; if (y < best) best = y;
        if (++i < 45) requestAnimationFrame(t); else res(best); };
      requestAnimationFrame(t);
    }));
    await page.waitForTimeout(60);
    await page.keyboard.press('Space');
    expect(await apexP).toBeLessThan(c - 18);

    // holding it does not fly you upward
    await place(page, 6, 8);
    await page.waitForTimeout(300);
    const d = (await snap(page)).py;
    await page.keyboard.down('Space');
    await page.waitForTimeout(1500);
    await page.keyboard.up('Space');
    expect((await snap(page)).py).toBeGreaterThan(d - 45);

    // and the flag is on dry land you walk out onto
    await page.evaluate(() => window.__marioTest.clear());
    await place(page, 172, 12);
    await expect.poll(async () => (await snap(page)).onGround, { timeout: 5000 }).toBe(true);
  });

  test('the beanstalk grows, climbs and leads somewhere', async ({ page }) => {
    test.slow();
    await boot(page);
    await page.evaluate(() => window.__marioTest.clear());
    await place(page, 128, 13);
    await page.keyboard.down('Space');
    await page.waitForTimeout(500);
    await page.keyboard.up('Space');
    await expect
      .poll(async () => page.evaluate(() => window.__marioTest.tile(128, 4)), { timeout: 8000 })
      .toBe(25);                                             // T_VINE

    await place(page, 128, 9);                               // on the used block
    await page.waitForTimeout(300);
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(500);
    expect((await snap(page)).mode).toBe('climb');
    await page.waitForTimeout(4000);
    await page.keyboard.up('ArrowUp');
    await page.waitForTimeout(1200);
    expect((await snap(page)).px).toBeGreaterThan(3800);      // coin heaven
  });

  test('the springboard beats a jump', async ({ page }) => {
    await boot(page);
    expect((await ents(page)).some((e) => e.type === 'spring')).toBe(true);
    await page.evaluate(() => window.__marioTest.clear());
    await place(page, 155, 5);
    // Full gravity used to eat the launch the moment you let go of the button,
    // making the springboard weaker than an ordinary jump.
    const top = await page.evaluate(() => new Promise((res) => {
      let best = 1e9, i = 0;
      const t = () => { const y = window.__mario().py; if (y < best) best = y;
        if (++i < 160) requestAnimationFrame(t); else res(best); };
      requestAnimationFrame(t);
    }));
    expect(top).toBeLessThan(130);                           // the ground is 208
  });

  test('a beanstalk is scenery, not a hazard, and gives no free jump', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__marioTest.clear());
    await place(page, 128, 13);
    await page.keyboard.down('Space');
    await page.waitForTimeout(500);
    await page.keyboard.up('Space');
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.__marioTest.give('big'));

    // The vine entity is a ZERO-SIZE box, so overlap() reduced to "is this
    // point inside the player" and hitPlayer fell through to hurt(): hopping
    // beside your own beanstalk cost a power-up to nothing on screen.
    await place(page, 127.6, 9);
    await page.waitForTimeout(200);
    const lives = (await snap(page)).lives;
    for (let i = 0; i < 6; i++) {
      await page.keyboard.down('Space');
      await page.waitForTimeout(220);
      await page.keyboard.up('Space');
      await page.waitForTimeout(400);
    }
    const s = await snap(page);
    expect(s.big).toBe(true);
    expect(s.lives).toBe(lives);

    // climbing left onGround stale-true, so stepping off granted a free jump
    await place(page, 128, 9);
    await page.waitForTimeout(200);
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(900);
    await page.keyboard.up('ArrowUp');
    expect((await snap(page)).mode).toBe('climb');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(120);
    const off = (await snap(page)).py;
    await page.keyboard.down('Space');
    await page.waitForTimeout(260);
    const after = (await snap(page)).py;
    await page.keyboard.up('Space');
    await page.keyboard.up('ArrowRight');
    expect(after).toBeGreaterThan(off - 10);
  });

  test('a coin in the sea is still the sea', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__marioTest.level(2));
    // read the spawn at the FIRST play frame — you sink from there
    let start = null;
    for (let i = 0; i < 80; i++) {
      const q = await snap(page);
      if (q.state === 'play') { start = q; break; }
      await page.waitForTimeout(60);
    }
    expect(start.py, 'world 1-3 starts you swimming, not on the sea floor').toBeLessThan(190);

    await page.evaluate(() => window.__marioTest.clear());
    await place(page, 28, 8);
    await page.waitForTimeout(300);
    // A coin overwrites its water tile, and collecting it leaves T_EMPTY —
    // neither is a water tile, so the swim branch switched OFF inside every
    // coin cell: splash, drop two tiles at land gravity, splash again, at
    // every coin in the level, forever.
    const trace = await page.evaluate(() => new Promise((res) => {
      const a = []; let n = 0;
      const t = () => { a.push(+window.__mario().vy.toFixed(2));
        if (++n < 150) requestAnimationFrame(t); else res(a); };
      requestAnimationFrame(t);
    }));
    expect(Math.max.apply(null, trace), 'land gravity would reach 4.6').toBeLessThanOrEqual(2.0);
  });

  test('an enemy that hits a wall turns around', async ({ page }) => {
    await boot(page);
    // collideX zeroes vx on contact, so the `vx = -vx` that follows negated
    // zero: every enemy and item that touched a wall stopped there for good.
    // The goomba beside the second pipe in 1-1 stood still for its whole life.
    await place(page, 36, 13);
    await page.waitForTimeout(400);
    const before = (await ents(page)).filter((e) => e.type === 'goomba' && e.x > 560)[0];
    expect(before, 'the goomba by the pipe').toBeTruthy();
    await page.waitForTimeout(2500);
    const after = (await ents(page)).filter((e) => e.type === 'goomba' && e.x > 560)[0];
    expect(after).toBeTruthy();
    expect(after.x).toBeGreaterThan(before.x + 30);
  });

  test('the whole game can be finished', async ({ page }) => {
    test.slow();
    await boot(page);
    // Five flagpoles, five cards, then the victory screen. Every other test
    // checks a piece; nobody had ever run the arc end to end.
    const flags = { '1-1': 200, '1-2': 186, '1-3': 178, '1-4': 189, '1-5': 166 };
    for (let w = 0; w < 5; w++) {
      const here = (await snap(page)).level;
      expect(flags[here], `unexpected world ${here}`).toBeDefined();
      await page.evaluate(() => window.__marioTest.clear());
      await page.evaluate((x) => window.__marioTest.place(x - 2, 13), flags[here]);
      await page.waitForTimeout(300);
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(1400);
      await page.keyboard.up('ArrowRight');
      await expect(page.locator('#overlay.show')).toBeVisible({ timeout: 30000 });
      if (w < 4) {
        await expect(page.locator('#ovTitle')).toHaveText(/cleared/);
        await page.locator('#ovGo').click();
        await expect.poll(async () => (await snap(page)).state, { timeout: 12000 }).toBe('play');
      } else {
        await expect(page.locator('#ovTitle')).toHaveText(/kingdom/i);
        expect((await snap(page)).state).toBe('win');
      }
    }
  });

  test('a level clear stays on stage', async ({ page }) => {
    test.slow();
    await boot(page);
    // Pause first, so the pause card leaves a second button behind.
    await page.keyboard.press('KeyP');
    await expect(page.locator('#overlay.show')).toBeVisible();
    await expect(page.locator('#ovAlt')).toBeVisible();
    await page.locator('#ovGo').click();
    await expect.poll(async () => (await snap(page)).state, { timeout: 8000 }).toBe('play');

    await page.evaluate(() => window.__marioTest.clear());
    await place(page, 198, 13);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(1400);
    await page.keyboard.up('ArrowRight');
    await expect(page.locator('#overlay.show')).toBeVisible({ timeout: 30000 });

    // `.card .btns button { display: block }` out-specified the UA's [hidden]
    // rule, so this card inherited the PAUSE card's "Restart world" button —
    // still wired to the pause handler.
    await expect(page.locator('#ovTitle')).toHaveText(/cleared/);
    await expect(page.locator('#ovAlt')).toBeHidden();

    // walkoffStep had no collideX and kept running through 'clearing', so the
    // player walked through the end wall — in 1-1, seven tiles into the sealed
    // bonus room, with the camera following and the secret on screen.
    const L = await page.evaluate(() => window.__marioBuild(0));
    const s = await snap(page);
    expect(s.px / 16, 'the player walked past the castle').toBeLessThan(L.castleX + 4);
    expect(s.camx / 16, 'the camera followed past the castle').toBeLessThan(L.castleX + 7);
  });

  test('the water level cannot be skimmed along the surface', async ({ page }) => {
    await page.goto('/mario.html');
    await page.waitForFunction(() => !!window.__marioBuild, null, { timeout: 15000 });
    // Every stalactite used to start at row 3, leaving row 2 clear for all 167
    // water columns: a bot holding right and tapping jump crossed the whole
    // level in 39s without touching one piece of coral.
    const worst = await page.evaluate(() => {
      const L = window.__marioBuild(2);
      const SOLID = new Set(L.T.SOLID);
      let run = 0, worst = 0;
      for (let x = 0; x < 160; x++) {
        if (SOLID.has(L.tiles[2 * L.w + x])) run = 0;
        else { run++; if (run > worst) worst = run; }
      }
      return worst;
    });
    expect(worst, 'longest clear run along the surface').toBeLessThanOrEqual(30);
  });

  test('every world boots and plays', async ({ page }) => {
    await boot(page);
    for (const i of [1, 2, 3, 4]) {
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
    if (await page.locator('#helpOv.show').isVisible()) await page.locator('#helpX').click();
    await page.locator('#ovGo').click();
    await expect.poll(async () => (await snap(page)).state, { timeout: 12000 }).toBe('play');
    await expect(page.locator('#pad')).toBeVisible();

    for (const k of ['left', 'right', 'up', 'down', 'jump', 'run']) {
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

  test('▲ on the pad climbs a vine', async ({ page }) => {
    // The pad had no UP at all, and the vine grab reads IN.up only — so the
    // beanstalk, coin heaven and its 1-up were unreachable on a phone while
    // the help card advertised them to everyone.
    await page.goto('/mario.html');
    await page.waitForFunction(() => !!window.__mario, null, { timeout: 15000 });
    if (await page.locator('#helpOv.show').isVisible()) await page.locator('#helpX').click();
    await page.locator('#ovGo').click();
    await expect.poll(async () => (await snap(page)).state, { timeout: 12000 }).toBe('play');
    await expect(page.locator('.pad .btn[data-k="up"]')).toBeVisible();

    await page.evaluate(() => window.__marioTest.clear());
    await page.evaluate(() => window.__marioTest.place(128, 13));
    await page.dispatchEvent('.pad .btn[data-k="jump"]', 'pointerdown',
                             { pointerId: 1, isPrimary: true, bubbles: true });
    await page.waitForTimeout(500);
    await page.dispatchEvent('.pad .btn[data-k="jump"]', 'pointerup',
                             { pointerId: 1, isPrimary: true, bubbles: true });
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.__marioTest.place(128, 9));
    await page.waitForTimeout(300);
    await page.dispatchEvent('.pad .btn[data-k="up"]', 'pointerdown',
                             { pointerId: 2, isPrimary: true, bubbles: true });
    await page.waitForTimeout(600);
    const mode = (await snap(page)).mode;
    await page.dispatchEvent('.pad .btn[data-k="up"]', 'pointerup',
                             { pointerId: 2, isPrimary: true, bubbles: true });
    expect(mode).toBe('climb');
  });
});

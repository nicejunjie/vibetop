// @ts-check
// Circuit Runner (Start ▸ Games ▸ 🤖) — a side-scrolling platformer, one
// self-contained page. A canvas game cannot be asserted from the DOM, so the
// page exposes read-only hooks the tests drive instead:
//   __cr()            a state snapshot (position, velocity, score, mode…)
//   __crBuild(i)      a level's tile grid + spawns, for the geometry audit
//   __crTest.place()  put the player somewhere, to SET UP a situation
//   __crSpriteWarnings  any pixel row that is not its declared width
//
// The situations are set up rather than played into: reaching a goomba by
// holding → and hoping is luck, and a test that depends on luck is noise.

const { test, expect } = require('@playwright/test');
const { openStartMenu } = require('../helpers');
const { BOT } = require('../circuit-bot');

// A full-speed jump clears roughly 7 tiles level and 6 while climbing 3. The
// audit budget is deliberately tighter, so a level is never merely *barely*
// possible.
// A standing jump measures 4.63 tiles, so a four-tile step — every pipe
// in the game — is legal; five is not.
const MAX_DX = 5, MAX_UP = 4;

async function boot(page) {
  await page.goto('/circuit.html');
  await page.waitForFunction(() => !!window.__cr, null, { timeout: 15000 });
  if (await page.locator('#helpOv.show').isVisible()) await page.locator('#helpX').click();
  await page.locator('#ovGo').click();                // the title card
  await expect
    .poll(async () => page.evaluate(() => window.__cr().state), { timeout: 12000 })
    .toBe('play');
}
const snap = (page) => page.evaluate(() => window.__cr());
const place = (page, x, y) => page.evaluate(([a, b]) => window.__crTest.place(a, b), [x, y]);
const ents = (page) => page.evaluate(() => window.__crTest.ents());

test.describe('circuit', () => {
  test('Start menu lists it in the Games flyout', async ({ page }) => {
    await page.goto('/');
    await openStartMenu(page);
    await page.locator('#sm-games-parent').click();
    await expect(page.locator('#sm-games .sm-item[data-id="circuit"]')).toBeVisible();
  });

  test('every tile READS against the sky it is drawn over', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__crTest.silence());
    // Eyeballing a palette is how a staircase shipped at 1.02:1 against the sky
    // and how the block you strike ended up invisible. Measure it: average the
    // tile's opaque pixels and compare luminance with its own sector's sky.
    const TILES = { ground: 1, brick: 2, cache: 3, used: 4, stone: 5, pipe: 6,
                    coin: 10, structural: 13, catwalk: 16, hover: 22 };
    const rows = await page.evaluate((TILES) => {
      const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      const lum = (r, g, b) => 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      const out = [];
      const levels = { overworld: 0, underground: 1, water: 2, castle: 4 };
      for (const theme of Object.keys(levels)) {
        window.__crTest.level(levels[theme]);
        window.__crTest.step(120);
        for (const name of Object.keys(TILES)) {
          const c = window.__crTile(TILES[name]);
          const d = c.getContext('2d').getImageData(0, 0, 16, 16).data;
          const ls = [];
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 40) continue;
            ls.push(lum(d[i], d[i + 1], d[i + 2]));
          }
          const n = ls.length;
          if (!n) { out.push({ theme, name, ratio: 0, note: 'nothing drawn at all' }); continue; }
          const s = hex(window.__crThemeSky(theme));
          const sl = lum(s[0], s[1], s[2]) + 0.05;
          ls.sort((a, b) => a - b);
          const dark = ls[Math.floor(ls.length * 0.15)] + 0.05;
          const light = ls[Math.floor(ls.length * 0.85)] + 0.05;
          const cr = (a, b) => Math.max(a, b) / Math.min(a, b);
          out.push({ theme, name, ratio: +Math.max(cr(dark, sl), cr(light, sl)).toFixed(2) });
        }
      }
      return out;
    }, TILES);

    const bad = rows.filter((r) => r.ratio < 2.2)
      .map((r) => `${r.theme}/${r.name} = ${r.ratio}:1${r.note ? ' (' + r.note + ')' : ''}`);
    expect(bad, 'tiles that do not read against their own sky').toEqual([]);
  });

  test('every sprite row is its declared width', async ({ page }) => {
    await page.goto('/circuit.html');
    await page.waitForFunction(() => !!window.__crSpriteWarnings);
    // A row one character short silently shifts every pixel to its right —
    // invisible in a diff, obvious on screen.
    expect(await page.evaluate(() => window.__crSpriteWarnings)).toEqual([]);
  });

  test('every level can actually be finished', async ({ page }) => {
    await page.goto('/circuit.html');
    await page.waitForFunction(() => !!window.__crBuild, null, { timeout: 15000 });
    const count = await page.evaluate(() => window.__crLevelCount);
    expect(count).toBe(5);

    for (let i = 0; i < count; i++) {
      const L = await page.evaluate((k) => window.__crBuild(k), i);
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
          // `dx > 1` used to gate this whole check, on the assumption that the
          // NEXT column is always walkable. A pillar rising seven tiles in the
          // very next column is exactly the case that assumption misses — and
          // it made world 1-2 unfinishable while the audit passed.
          if (up > MAX_UP || (dx > 1 && dx > MAX_DX)) {
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

      // Every block that pops a RISING item needs room above it. One in the
      // 1-1 bonus room had a single tile: the item came out jammed against
      // the ceiling, where a big player cannot even stand.
      const jammed = [];
      for (const key of Object.keys(L.contents)) {
        const what = L.contents[key];
        if (what !== 'power' && what !== 'star' && what !== '1up') continue;
        const [bx, by] = key.split(',').map(Number);
        if (SOLID.has(at(bx, by - 1))) jammed.push(`${what} at ${bx},${by}: solid above`);
        else if (SOLID.has(at(bx, by - 2))) jammed.push(`${what} at ${bx},${by}: 1 tile of room`);
      }
      expect(jammed, `world ${L.name} has an unreachable power-up`).toEqual([]);

      // every warp lands on real ground (a room built past the level width is
      // silently dropped by the builder — the pipe then leads nowhere)
      for (const k of Object.keys(L.warps)) {
        const t = L.warps[k];
        expect(t.x, `${L.name} warp ${k} leaves the level`).toBeLessThan(L.w);
        expect(enter[t.x], `${L.name} warp ${k} lands in the void`).not.toBeNull();
      }
    }
  });

  test('the walk cycle actually animates, and small poses exist', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__crTest.clear());
    await place(page, 3, 13);
    await page.waitForTimeout(200);
    await page.keyboard.down('ArrowRight');
    // drawBody's transition branch read `if (!big)`, which is true for every
    // frame a SMALL player is ever drawn: he rendered pS_idle and nothing else
    // — no walk cycle, no jump, no skid, no swim, no climb. He slid.
    const poses = await page.evaluate(() => new Promise((res) => {
      const seen = {}; let n = 0;
      const t = () => { seen[window.__cr().pose] = 1;
        if (++n < 120) requestAnimationFrame(t); else res(Object.keys(seen)); };
      requestAnimationFrame(t);
    }));
    await page.keyboard.up('ArrowRight');
    expect(poses.filter((k) => /walk/.test(k)).length,
           `poses seen while walking: ${poses.join(',')}`).toBeGreaterThanOrEqual(3);

    await place(page, 3, 13);
    await page.waitForTimeout(200);
    await page.keyboard.down('Space');
    await page.waitForTimeout(200);
    expect((await snap(page)).pose).toBe('pS_jump');
    await page.keyboard.up('Space');
  });

  test('a jump clears a four-tile obstacle', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__crTest.clear());
    // A standing jump measured 3.90 tiles and 1-1's pipes are 4 tiles tall:
    // every ordinary obstacle in the game was JUST out of reach.
    await place(page, 45, 13);
    await page.waitForTimeout(300);
    await page.keyboard.down('Space');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(450);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(400);
    await page.keyboard.up('Space');
    await page.waitForTimeout(900);
    const s = await snap(page);
    expect(s.onGround, 'landed').toBe(true);
    expect(s.py, 'standing on the pipe is y=129, the ground is y=193').toBeLessThan(150);
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
          window.__trace.push(window.__cr().py);
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
    // The discrete apex is 74px (v0 4.95, rise gravity 0.16). This sampler is
    // lossy — it reads once per animation frame and the lanes disagree by a
    // few px — so assert what matters: four tiles is 64px, and it clears them.
    // The functional check is 'a jump clears a four-tile obstacle', which
    // actually lands on the pipe.
    expect(hold, 'four tiles is 64px — clear it with margin').toBeGreaterThan(66);
    expect(hold, 'but not a moon jump').toBeLessThan(96);
    expect(errors).toEqual([]);
  });

  test('blocks pay out and a mushroom makes you big', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__crTest.clear());
    await place(page, 16, 13);
    const before = (await snap(page)).coins;
    await page.keyboard.down('Space');
    await page.waitForTimeout(500);
    await page.keyboard.up('Space');
    await page.waitForTimeout(700);
    expect((await snap(page)).coins).toBe(before + 1);
    expect(await page.evaluate(() => window.__crTest.tile(16, 9))).toBe(4);  // used

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
    await page.evaluate(() => window.__crTest.level(0));
    await expect.poll(async () => (await snap(page)).state, { timeout: 10000 }).toBe('play');
    await page.evaluate(() => window.__crTest.give('big'));
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
    await expect.poll(async () => (await snap(page)).level, { timeout: 12000 }).toBe('02');
  });

  test('lava kills outright, whatever size you are', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__crTest.level(4));       // the castle
    await expect.poll(async () => (await snap(page)).state, { timeout: 10000 }).toBe('play');
    await page.evaluate(() => window.__crTest.give('fire'));
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
    await page.evaluate(() => window.__crTest.level(3));       // world 1-4
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
    await expect(page.locator('#ovAlt')).toHaveText(/04/);
    await page.locator('#ovAlt').click();
    await expect.poll(async () => (await snap(page)).level, { timeout: 10000 }).toBe('04');
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
    await expect(page.locator('#ovTitle')).toHaveText(/01 clear/);
    await page.waitForTimeout(1500);
    await expect(page.locator('#ovTitle')).toHaveText(/01 clear/);
  });

  test('the castle hazards actually exist', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__crTest.level(4));
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
    await page.evaluate(() => window.__crTest.clear());
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
    await page.goto('/circuit.html');
    await page.waitForFunction(() => !!window.__cr, null, { timeout: 15000 });
    await expect(page.locator('#overlay.show')).toBeVisible();
    await page.locator('#newBtn').click();
    // It used to start the level BEHIND the card — and the touch pad is hidden
    // while a card is up, so on a phone the game ran and could not be played.
    await expect(page.locator('#overlay.show')).toBeHidden();
    expect(await page.evaluate(() => document.body.classList.contains('carded'))).toBe(false);
  });

  test('the water world swims', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__crTest.level(2));
    await expect.poll(async () => (await snap(page)).state, { timeout: 10000 }).toBe('play');
    expect((await snap(page)).level).toBe('03');
    expect((await ents(page)).some((e) => e.type === 'cheep')).toBe(true);
    await page.evaluate(() => window.__crTest.clear());   // physics, not fish

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
      const t = () => { const y = window.__cr().py; if (y < best) best = y;
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
    await page.evaluate(() => window.__crTest.clear());
    await place(page, 172, 12);
    await expect.poll(async () => (await snap(page)).onGround, { timeout: 5000 }).toBe(true);
  });

  test('the beanstalk grows, climbs and leads somewhere', async ({ page }) => {
    test.slow();
    await boot(page);
    await page.evaluate(() => window.__crTest.clear());
    await place(page, 128, 13);
    await page.keyboard.down('Space');
    await page.waitForTimeout(500);
    await page.keyboard.up('Space');
    await expect
      .poll(async () => page.evaluate(() => window.__crTest.tile(128, 4)), { timeout: 8000 })
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
    await page.evaluate(() => window.__crTest.clear());
    await place(page, 155, 5);
    // Full gravity used to eat the launch the moment you let go of the button,
    // making the springboard weaker than an ordinary jump.
    const top = await page.evaluate(() => new Promise((res) => {
      let best = 1e9, i = 0;
      const t = () => { const y = window.__cr().py; if (y < best) best = y;
        if (++i < 160) requestAnimationFrame(t); else res(best); };
      requestAnimationFrame(t);
    }));
    expect(top).toBeLessThan(130);                           // the ground is 208
  });

  test('fire throws on the press, even while already holding run', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__crTest.clear());
    await page.evaluate(() => { window.__crTest.give('fire'); window.__crTest.place(6, 13); });
    await page.waitForTimeout(400);
    const balls = () => page.evaluate(() =>
      window.__crTest.ents().filter((e) => e.type === 'fireball').length);

    // Shift and X are BOTH run keys, and firing was a rising edge on the run
    // FLAG — so running with Shift held and tapping X to throw did nothing.
    // You got a fireball when you released and pressed again, which in
    // practice is the moment you land.
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(400);
    await page.keyboard.down('Space');
    await page.waitForTimeout(200);
    const before = await balls();
    await page.keyboard.down('KeyX');
    await page.waitForTimeout(120);
    await page.keyboard.up('KeyX');
    await page.waitForTimeout(120);
    const after = await balls();
    const s = await snap(page);
    await page.keyboard.up('Space');
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('ShiftLeft');
    expect(after).toBeGreaterThan(before);
    expect(s.onGround, 'it should fire in mid-air, not on landing').toBe(false);
  });

  test('a power-up rests on the block it came out of', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { window.__crTest.clear(); window.__crTest.give('big'); });
    await place(page, 21, 13);
    await page.keyboard.down('Space');
    await page.waitForTimeout(500);
    await page.keyboard.up('Space');
    await page.waitForTimeout(1600);
    const fl = (await ents(page)).find((e) => e.type === 'flower');
    expect(fl, 'a big player gets a flower').toBeTruthy();
    // spawnItem was handed ty-1 and then lifted the item another whole tile;
    // the flower has no gravity to fall back, so it hung in the air.
    // The block is row 9 (y=144), so resting on it is y=128.
    expect(Math.abs(fl.y - 128), `flower y=${fl.y}, on-block is 128`).toBeLessThan(3);
  });

  test('a beanstalk is scenery, not a hazard, and gives no free jump', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__crTest.clear());
    await place(page, 128, 13);
    await page.keyboard.down('Space');
    await page.waitForTimeout(500);
    await page.keyboard.up('Space');
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.__crTest.give('big'));

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
    await page.evaluate(() => window.__crTest.level(2));
    // read the spawn at the FIRST play frame — you sink from there
    let start = null;
    for (let i = 0; i < 80; i++) {
      const q = await snap(page);
      if (q.state === 'play') { start = q; break; }
      await page.waitForTimeout(60);
    }
    expect(start.py, 'world 1-3 starts you swimming, not on the sea floor').toBeLessThan(190);

    await page.evaluate(() => window.__crTest.clear());
    await place(page, 28, 8);
    await page.waitForTimeout(300);
    // A coin overwrites its water tile, and collecting it leaves T_EMPTY —
    // neither is a water tile, so the swim branch switched OFF inside every
    // coin cell: splash, drop two tiles at land gravity, splash again, at
    // every coin in the level, forever.
    const trace = await page.evaluate(() => new Promise((res) => {
      const a = []; let n = 0;
      const t = () => { a.push(+window.__cr().vy.toFixed(2));
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
    const flags = { '01': 200, '02': 186, '03': 178, '04': 189, '05': 166 };
    for (let w = 0; w < 5; w++) {
      const here = (await snap(page)).level;
      expect(flags[here], `unexpected world ${here}`).toBeDefined();
      await page.evaluate(() => window.__crTest.clear());
      await page.evaluate((x) => window.__crTest.place(x - 2, 13), flags[here]);
      await page.waitForTimeout(300);
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(1400);
      await page.keyboard.up('ArrowRight');
      await expect(page.locator('#overlay.show')).toBeVisible({ timeout: 30000 });
      if (w < 4) {
        await expect(page.locator('#ovTitle')).toHaveText(/clear/);
        await page.locator('#ovGo').click();
        await expect.poll(async () => (await snap(page)).state, { timeout: 12000 }).toBe('play');
      } else {
        await expect(page.locator('#ovTitle')).toHaveText(/network/i);
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

    await page.evaluate(() => window.__crTest.clear());
    await place(page, 198, 13);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(1400);
    await page.keyboard.up('ArrowRight');
    await expect(page.locator('#overlay.show')).toBeVisible({ timeout: 30000 });

    // `.card .btns button { display: block }` out-specified the UA's [hidden]
    // rule, so this card inherited the PAUSE card's "Restart world" button —
    // still wired to the pause handler.
    await expect(page.locator('#ovTitle')).toHaveText(/clear/);
    await expect(page.locator('#ovAlt')).toBeHidden();

    // walkoffStep had no collideX and kept running through 'clearing', so the
    // player walked through the end wall — in 1-1, seven tiles into the sealed
    // bonus room, with the camera following and the secret on screen.
    const L = await page.evaluate(() => window.__crBuild(0));
    const s = await snap(page);
    expect(s.px / 16, 'the player walked past the castle').toBeLessThan(L.castleX + 4);
    expect(s.camx / 16, 'the camera followed past the castle').toBeLessThan(L.castleX + 7);
  });

  test('the water level cannot be skimmed along the surface', async ({ page }) => {
    await page.goto('/circuit.html');
    await page.waitForFunction(() => !!window.__crBuild, null, { timeout: 15000 });
    // Every stalactite used to start at row 3, leaving row 2 clear for all 167
    // water columns: a bot holding right and tapping jump crossed the whole
    // level in 39s without touching one piece of coral.
    const worst = await page.evaluate(() => {
      const L = window.__crBuild(2);
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

  test('a bot can play every world from start to flag', async ({ page }) => {
    test.slow();
    test.setTimeout(240_000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await boot(page);
    await page.evaluate(() => window.__crTest.silence());

    const report = [];
    for (let lv = 0; lv < 5; lv++) {
      let best = null;
      for (let attempt = 1; attempt <= 3 && (!best || !best.ok); attempt++) {
        await page.evaluate((k) => window.__crTest.level(k), lv);
        await page.waitForTimeout(250);
        await page.evaluate(() => {
          window.__crTest.setLives(99);
          window.__crTest.step(120);
        });
        const r = await page.evaluate(BOT, { levelIdx: lv, seed: attempt * 7919 });
        if (!best || r.reachedX > best.reachedX) best = r;
      }
      report.push(`world ${lv + 1}: ` + (best.ok
        ? 'reached the flag'
        : `only tile ${Math.round(best.reachedX)} of ${best.flagX}` +
          (best.stuck ? ` (stuck at ${Math.round(best.stuck.x)})` : '') +
          (best.deathAt.length ? ` deaths at ${best.deathAt.slice(0, 6).join(',')}` : '')));
      expect(best.ok, report[report.length - 1]).toBe(true);
    }
    expect(errors, 'errors during the playthrough').toEqual([]);
  });

  test('the water world has an open channel end to end', async ({ page }) => {
    await page.goto('/circuit.html');
    await page.waitForFunction(() => !!window.__crBuild, null, { timeout: 15000 });
    // A swimming level is not walked, so footholds mean nothing there. Flood
    // fill the passable cells from the start and require the flag to be in
    // the same region — with two clear rows, so a BIG player also fits.
    const r = await page.evaluate(() => {
      const L = window.__crBuild(2);
      const SOLID = new Set(L.T.SOLID);
      const at = (x, y) => (x < 0 || x >= L.w || y < 0 || y >= L.h) ? 1 : L.tiles[y * L.w + x];
      const open = (x, y) => !SOLID.has(at(x, y)) && !SOLID.has(at(x, y + 1));
      const seen = new Set(); const q = []; let maxX = L.start;
      for (let y = 0; y < L.h - 1; y++) {
        if (open(L.start, y)) { q.push([L.start, y]); seen.add(L.start * 100 + y); }
      }
      while (q.length) {
        const [x, y] = q.pop();
        if (x > maxX) maxX = x;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= L.w || ny < 0 || ny >= L.h - 1) continue;
          const k = nx * 100 + ny;
          if (seen.has(k) || !open(nx, ny)) continue;
          seen.add(k); q.push([nx, ny]);
        }
      }
      return { maxX, flagX: L.flagX };
    });
    expect(r.maxX, `the channel stops at tile ${r.maxX} of ${r.flagX}`)
      .toBeGreaterThanOrEqual(r.flagX);
  });

  test('every world boots and plays', async ({ page }) => {
    await boot(page);
    for (const i of [1, 2, 3, 4]) {
      await page.evaluate((k) => window.__crTest.level(k), i);
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
test.describe('circuit on touch', () => {
  test.skip(({ hasTouch }) => !hasTouch, 'touch lanes only');

  test('the pad shows, its buttons are real targets, and holding one walks', async ({ page }) => {
    await page.goto('/circuit.html');
    await page.waitForFunction(() => !!window.__cr, null, { timeout: 15000 });
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

  test('the controls fit whatever room there is, and landscape mode works', async ({ page }) => {
    await page.goto('/circuit.html');
    await page.waitForFunction(() => !!window.__cr, null, { timeout: 15000 });
    if (await page.locator('#helpOv.show').isVisible()) await page.locator('#helpX').click();
    await page.locator('#ovGo').click();
    await expect.poll(async () => (await snap(page)).state, { timeout: 12000 }).toBe('play');

    // Inside the desktop shell a landscape phone leaves ~228px of play area
    // once the usage strip, the taskbar and the game's own bar are gone; the
    // fixed 190px d-pad cross ran off the bottom.
    for (const h of [Math.min(260, page.viewportSize().height), page.viewportSize().height]) {
      await page.setViewportSize({ width: page.viewportSize().width, height: h });
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => {
        const out = { inner: window.innerHeight, bad: [], small: [] };
        document.querySelectorAll('.pad .btn').forEach((b) => {
          const x = b.getBoundingClientRect();
          if (x.y < 0 || x.y + x.height > out.inner + 1) out.bad.push(b.dataset.k);
          if (x.width < 34) out.small.push(b.dataset.k + ':' + Math.round(x.width));
        });
        return out;
      });
      expect(r.bad, `controls cut off at height ${h}`).toEqual([]);
      expect(r.small, `controls too small at height ${h}`).toEqual([]);
    }

    // and the toolbar itself must not overflow a narrow phone
    const over = await page.evaluate(() => {
      let max = 0;
      document.querySelectorAll('.bar > *').forEach((e) => {
        const b = e.getBoundingClientRect();
        if (b.width && b.x + b.width > max) max = b.x + b.width;
      });
      return Math.round(max) - window.innerWidth;
    });
    expect(over, 'the toolbar overflows the window by this many px').toBeLessThanOrEqual(1);

    // the landscape button: on a device with no Fullscreen API it rotates the
    // whole app instead, which is the only thing that works on iOS.
    await expect(page.locator('#fsBtn')).toBeVisible();
    const before = (await snap(page)).vw;
    await page.locator('#fsBtn').click();
    await page.waitForTimeout(900);
    const rotated = await page.evaluate(() => document.body.classList.contains('rotated'));
    const full = await page.evaluate(() => !!(document.fullscreenElement ||
                                              document.webkitFullscreenElement));
    expect(rotated || full, 'neither rotated nor fullscreen').toBe(true);
    if (rotated && page.viewportSize().height > page.viewportSize().width) {
      expect((await snap(page)).vw, 'the view should widen in landscape').toBeGreaterThan(before);
    }
    await page.locator('#fsBtn').click();
    await page.waitForTimeout(600);
  });

  test('▲ on the pad climbs a vine', async ({ page }) => {
    // The pad had no UP at all, and the vine grab reads IN.up only — so the
    // beanstalk, coin heaven and its 1-up were unreachable on a phone while
    // the help card advertised them to everyone.
    await page.goto('/circuit.html');
    await page.waitForFunction(() => !!window.__cr, null, { timeout: 15000 });
    if (await page.locator('#helpOv.show').isVisible()) await page.locator('#helpX').click();
    await page.locator('#ovGo').click();
    await expect.poll(async () => (await snap(page)).state, { timeout: 12000 }).toBe('play');
    await expect(page.locator('.pad .btn[data-k="up"]')).toBeVisible();

    await page.evaluate(() => window.__crTest.clear());
    await page.evaluate(() => window.__crTest.place(128, 13));
    await page.dispatchEvent('.pad .btn[data-k="jump"]', 'pointerdown',
                             { pointerId: 1, isPrimary: true, bubbles: true });
    await page.waitForTimeout(500);
    await page.dispatchEvent('.pad .btn[data-k="jump"]', 'pointerup',
                             { pointerId: 1, isPrimary: true, bubbles: true });
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.__crTest.place(128, 9));
    await page.waitForTimeout(300);
    await page.dispatchEvent('.pad .btn[data-k="up"]', 'pointerdown',
                             { pointerId: 2, isPrimary: true, bubbles: true });
    await page.waitForTimeout(600);
    const mode = (await snap(page)).mode;
    await page.dispatchEvent('.pad .btn[data-k="up"]', 'pointerup',
                             { pointerId: 2, isPrimary: true, bubbles: true });
    expect(mode).toBe('climb');
  });

  // ---- the feel of the controls --------------------------------------- //

  test('a tap is a real hop, and holding is a much bigger one', async ({ page }) => {
    // There was no floor under the jump at all: a one-frame tap cleared 1.08
    // tiles and a held press 4.63, a 4x spread off the same button. A quick tap
    // barely left the ground, which is why nothing about the control read as
    // proportional.
    await boot(page);
    const r = await page.evaluate(() => {
      const T = window.__crTest;
      function hop(hold) {
        T.clear(); T.input({});
        for (let i = 0; i < 6; i++) T.step();
        const y0 = window.__cr().py;
        let peak = 0;
        for (let f = 0; f < 80; f++) {
          T.input(f < hold ? { jump: 1 } : {});
          T.step();
          const s = window.__cr();
          peak = Math.max(peak, y0 - s.py);
          if (s.onGround && f > 4 && peak > 0) break;
        }
        return peak / 16;
      }
      return { tap: hop(1), hold: hop(60) };
    });
    expect(r.tap, 'the shortest possible hop, in tiles').toBeGreaterThan(2.2);
    expect(r.hold, 'a fully held jump, in tiles').toBeGreaterThan(4.4);
    expect(r.hold - r.tap, 'holding must still buy real height').toBeGreaterThan(1.5);
  });

  test('you can start at any sector from the title card', async ({ page }) => {
    await page.goto('/circuit.html');
    await page.waitForFunction(() => !!window.__cr, null, { timeout: 15000 });
    await expect(page.locator('#ovPick')).toBeVisible();
    expect(await page.locator('#ovPick .pb').count(), 'one chip per sector').toBe(5);

    await page.locator('#ovPick .pb[data-lv="3"]').click();
    await page.waitForTimeout(400);
    await page.evaluate(() => { window.__crTest.silence(); window.__crTest.step(160); });
    const s = await snap(page);
    expect(s.level, 'picking 04 starts sector 04').toBe('04');
    expect(s.state, 'and it is playable').toBe('play');
    // a fresh run that begins there, not a cheat into the middle of another one
    expect(s.lives).toBe(3);
    expect(s.score).toBe(0);
    expect(s.coins).toBe(0);

    // and it must not sit next to Resume on a paused run, where it would read
    // as "abandon this"
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(300);
    await expect(page.locator('#ovPick')).toBeHidden();
  });

  test('a direction never stays down after you let go', async ({ page }) => {
    // "Sometimes a direction gets stuck — I've taken my finger off and it keeps
    // walking." The release handlers were on the pad, and the pad is
    // display:none behind any card, so lifting your finger during a death, a
    // pause or an app switch delivered the pointerup somewhere else entirely
    // and the key stayed down. Proven against the pre-fix build: a released key
    // coasts ~11px while friction bleeds the speed off and ends at 0, a stuck
    // one runs 59px and is still moving — so this judges the SPEED, not the
    // distance.
    await boot(page);
    const r = await page.evaluate(() => {
      const T = window.__crTest; T.silence();
      const pad = document.getElementById('pad');
      const down = (k, id) => {
        const el = document.querySelector('.pad .btn[data-k="' + k + '"]');
        const b = el.getBoundingClientRect();
        const ev = new PointerEvent('pointerdown',
          { clientX: b.left + b.width / 2, clientY: b.top + b.height / 2,
            pointerId: id, bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'target', { value: el });
        pad.dispatchEvent(ev);
      };
      const up = (t, id) => t.dispatchEvent(
        new PointerEvent('pointerup', { pointerId: id, bubbles: true, cancelable: true }));
      function trial(release) {
        T.level(0); T.input({}); T.step(150); T.clear(); T.place(40, 13); T.step(6);
        down('right', 31); T.step(25);
        const moving = Math.abs(window.__cr().vx) > 0.5;
        release();
        T.step(60);
        return { moving, vx: Math.abs(window.__cr().vx) };
      }
      return {
        onPad:  trial(() => up(pad, 31)),
        offPad: trial(() => up(document.body, 31)),
        card:   trial(() => { document.body.classList.add('carded');
                              up(document.body, 31);
                              document.body.classList.remove('carded'); })
      };
    });
    for (const k of ['onPad', 'offPad', 'card']) {
      expect(r[k].moving, k + ': holding ▶ should walk').toBe(true);
      expect(r[k].vx, k + ': speed after releasing').toBeLessThan(0.05);
    }
  });

  test('every button gives a haptic tick where the browser has one', async ({ page }) => {
    // navigator.vibrate is the only web API for this. iOS Safari does not
    // implement it, so on an iPhone this is a no-op and there is no web way to
    // reach the Taptic Engine — the test asserts we ASK, not that it buzzes.
    await boot(page);
    const r = await page.evaluate(() => {
      let buzz = 0;
      navigator.vibrate = () => { buzz++; return true; };
      const pad = document.getElementById('pad');
      ['jump', 'run', 'left', 'right', 'up', 'down'].forEach(k => {
        const el = document.querySelector('.pad .btn[data-k="' + k + '"]');
        const b = el.getBoundingClientRect();
        const ev = new PointerEvent('pointerdown',
          { clientX: b.left + b.width / 2, clientY: b.top + b.height / 2,
            pointerId: 5, bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'target', { value: el });
        pad.dispatchEvent(ev);
        document.querySelectorAll('.pad .btn.act').forEach(x => x.classList.remove('act'));
      });
      const padOnly = buzz;
      document.getElementById('pauseBtn')
        .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      return { padOnly, total: buzz };
    });
    expect(r.padOnly, 'all six pad buttons should tick').toBe(6);
    expect(r.total, 'and the top-bar buttons too').toBeGreaterThan(6);
  });

  test('a near-miss on the pad still presses the button', async ({ page }) => {
    // The buttons are circles with gaps, and elementFromPoint honours
    // border-radius — so a thumb on the corner of A's box, or in the gap
    // between A and B, hit nothing at all and the press vanished.
    await boot(page);
    const landed = await page.evaluate(() => {
      const rc = (n) => document.querySelector('.pad .btn[data-k="' + n + '"]')
                                .getBoundingClientRect();
      const A = rc('jump'), B = rc('run');
      const pts = [[A.left + 5, A.top + 5], [A.left + A.width / 2, (B.bottom + A.top) / 2]];
      return pts.map(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        const ev = new PointerEvent('pointerdown',
          { clientX: x, clientY: y, pointerId: 91, bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'target', { value: el || document.body });
        document.getElementById('pad').dispatchEvent(ev);
        const act = document.querySelector('.pad .btn.act');
        const k = act ? act.dataset.k : null;
        document.querySelectorAll('.pad .btn.act').forEach(b => b.classList.remove('act'));
        return k;
      });
    });
    for (const k of landed) expect(k, 'a near-miss must land on a button').toBeTruthy();
  });

  test('holding A repeats — and gets no more than fast tapping would', async ({ page }) => {
    // One action per press is right for a keyboard, where releasing and pressing
    // again costs nothing. On a touch screen it means lifting your thumb off a
    // button you cannot see and finding it again for every hop. Holding now
    // repeats — but it must not become free flight: a held button may only earn
    // what a player tapping at the cadence limit already earns.
    await boot(page);
    const r = await page.evaluate(() => {
      const T = window.__crTest;
      function hops(input, frames) {
        T.clear(); T.input({}); T.step(8);
        let n = 0, wasG = window.__cr().onGround;
        for (let f = 0; f < frames; f++) {
          T.input(typeof input === 'function' ? input(f) : input);
          T.step();
          const g = window.__cr().onGround;
          if (wasG && !g) n++;
          wasG = g;
        }
        return n;
      }
      const out = {};
      out.held = hops({ jump: 1 }, 300);
      out.once = hops(f => (f < 5 ? { jump: 1 } : {}), 300);
      out.idle = hops({}, 300);
      // water: a held button must not beat a perfect tapper by much
      T.level(2); T.input({}); T.step(140); T.clear();
      function rise(input) {
        T.place(20, 10); T.input({}); T.step(6);
        const y0 = window.__cr().py;
        let best = 0;
        for (let f = 0; f < 240; f++) {
          T.input(typeof input === 'function' ? input(f) : input);
          T.step();
          best = Math.max(best, y0 - window.__cr().py);
        }
        return best;
      }
      out.swimHeld = rise({ jump: 1 });
      out.swimTap = rise(f => ({ jump: f % 10 < 2 }));
      out.swimIdle = rise({});
      return out;
    });
    expect(r.held, 'holding A should keep hopping').toBeGreaterThanOrEqual(4);
    expect(r.once, 'one press is still exactly one jump').toBe(1);
    expect(r.idle, 'no input, no jumping').toBe(0);
    expect(r.swimHeld, 'holding A should swim up').toBeGreaterThan(r.swimIdle + 10);
    expect(r.swimHeld, 'held must not beat a fast tapper by more than a stroke')
      .toBeLessThan(r.swimTap * 1.6 + 8);
  });

  test('the pad buttons are big enough to hit without looking', async ({ page }) => {
    // 62px shrank to 42 on a landscape phone with a narrow gutter — under the
    // 44px that is the smallest thing a thumb reliably finds, and you are not
    // looking at your thumbs while you play.
    await boot(page);
    for (const vp of [{ width: 667, height: 375 }, { width: 844, height: 390 },
                      { width: 390, height: 844 }]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(250);
      const r = await page.evaluate(() => {
        const pad = document.getElementById('pad');
        const A = document.querySelector('.pad .btn[data-k="jump"]').getBoundingClientRect();
        const press = (x, y) => {
          const el = document.elementFromPoint(x, y);
          if (!el) return null;
          const ev = new PointerEvent('pointerdown',
            { clientX: x, clientY: y, pointerId: 77, bubbles: true, cancelable: true });
          Object.defineProperty(ev, 'target', { value: el });
          pad.dispatchEvent(ev);
          const act = document.querySelector('.pad .btn.act');
          const k = act ? act.dataset.k : null;
          document.querySelectorAll('.pad .btn.act').forEach(b => b.classList.remove('act'));
          return k;
        };
        let slack = 0;
        for (let d = 2; d < 100; d += 2) {
          if (press(A.left - d, A.top + A.height / 2)) slack = d; else break;
        }
        // .pad is pointer-events:auto so a near-miss can reach the handler at
        // all; it must not therefore swallow the picture. Two probes: the middle
        // of the screen, and — when the two clusters are far enough apart to
        // leave real space between them — the point halfway between.
        const D = document.querySelector('.pad .dpad').getBoundingClientRect();
        const AB = document.querySelector('.pad .ab').getBoundingClientRect();
        const gap = AB.left - D.right;
        const Bb = document.querySelector('.pad .btn[data-k="run"]').getBoundingClientRect();
        return { size: A.width, slack, gap,
                 abTall: A.height > A.width * 1.2 && Bb.height > Bb.width * 1.2,
                 centre: press(window.innerWidth / 2, window.innerHeight / 2),
                 between: gap > A.width * 2
                   ? press((D.right + AB.left) / 2, A.top + A.height / 2) : null };
      });
      const at = vp.width + 'x' + vp.height;
      expect(r.size, 'button width at ' + at).toBeGreaterThanOrEqual(56);
      expect(r.abTall, 'A and B are pills, taller than they are wide, at ' + at).toBe(true);
      expect(r.slack, 'slack outside the button at ' + at).toBeGreaterThanOrEqual(24);
      expect(r.centre, 'the pad must not swallow the picture at ' + at).toBe(null);
      expect(r.between, 'a tap between the clusters presses nothing at ' + at +
                        ' (gap ' + Math.round(r.gap) + 'px)').toBe(null);
    }
  });

  test('landing on an enemy never costs a life', async ({ page }) => {
    // A stomp landed, sounded, awarded — and then the SAME enemy hurt you on
    // the next frame. Every other stomp outcome moves the enemy's box away (a
    // goomba flattens to 6px, a koopa drops into a shell) but a winged koopa
    // only loses the wings, so you bounced up still inside it and "rising" read
    // as "not stomping". 19 of 396 drops ended in damage, every one a para.
    await boot(page);
    const r = await page.evaluate(() => {
      const T = window.__crTest;
      function drop(kind, dx, up, push) {
        T.clear(); T.give('big'); T.setLives(9);
        T.spawn(kind, 45, 12);
        T.place(45, 13 - up); T.input({}); T.step(1); T.nudge(dx);
        for (let f = 0; f < 80; f++) {
          T.input(push > 0 ? { right: 1 } : (push < 0 ? { left: 1 } : {}));
          T.step();
          const s = window.__cr();
          const e = T.entsFull().find(x => x.type === kind);
          if (!e || e.gone || e.shell || e.flat) return 'stomp';
          if (!s.big) return 'HURT';
          if (s.onGround && f > 6) return 'beside';
        }
        return 'timeout';
      }
      const out = { stomp: 0, hurt: 0, bad: [] };
      for (const kind of ['goomba', 'koopa', 'koopaRed', 'para'])
        for (let dx = -10; dx <= 10; dx += 2)
          for (const push of [0, -1, 1])
            for (const up of [3, 5, 7]) {
              const res = drop(kind, dx, up, push);
              if (res === 'stomp') out.stomp++;
              else if (res === 'HURT') {
                out.hurt++;
                if (out.bad.length < 6) out.bad.push(kind + ' dx=' + dx + ' push=' + push);
              }
            }
      return out;
    });
    expect(r.hurt, 'hurt while dropping onto an enemy: ' + r.bad.join(', ')).toBe(0);
    expect(r.stomp, 'the sweep must actually connect').toBeGreaterThan(150);
  });

  // ---- the hidden treasure -------------------------------------------- //

  test('the Warp Zone: an invisible block, a beanstalk, three pipes', async ({ page }) => {
    // Reached along a road of brick in the first cut, which the playthrough bot
    // walked immediately: it jumps constantly, so it bumps every invisible
    // block on its path by accident. A vine cannot be taken by accident.
    await boot(page);
    const r = await page.evaluate(() => {
      const T = window.__crTest, out = {};
      T.level(1); T.input({}); T.step(140); T.clear();
      out.before = T.tile(178, 10);
      T.place(178, 13); T.input({}); T.step(6);
      for (let i = 0; i < 40; i++) { T.input({ jump: i < 30 }); T.step(); }
      out.after = T.tile(178, 10);
      T.step(200);
      out.vine = 0;
      for (let y = 1; y <= 9; y++) if (T.tile(178, y) === 25) out.vine++;
      T.place(180, 13); T.input({}); T.step(4);
      out.climbed = false;
      for (let i = 0; i < 500; i++) {
        T.input({ up: 1, left: i < 26, jump: i < 30 });
        T.step();
        if (window.__cr().mode === 'climb') out.climbed = true;
        if (window.__cr().px > 3000) break;
      }
      out.arrived = Math.round(window.__cr().px / 16);
      T.input({}); T.step(20);
      T.place(225, 10); T.input({}); T.step(6);
      out.sectorBefore = window.__cr().level;
      for (let i = 0; i < 120; i++) { T.input({ down: 1 }); T.step(); }
      out.sectorAfter = window.__cr().level;
      return out;
    });
    expect(r.before, 'the warp block is invisible until struck').toBe(18);
    expect(r.after, 'striking it spends the block').not.toBe(18);
    expect(r.vine, 'the beanstalk must be climbable height').toBeGreaterThanOrEqual(5);
    expect(r.climbed, 'you can climb it').toBe(true);
    expect(r.arrived, 'the top puts you in the Warp Zone').toBeGreaterThan(205);
    expect(r.sectorBefore).toBe('02');
    expect(r.sectorAfter, 'the middle pipe skips ahead a sector').toBe('04');
  });

  test('nothing you can reach with your head is dead masonry', async ({ page }) => {
    // "In the original there are no hard rocks, but I have seen many hard rocks
    // that I can't jump to hit." The underground and the castle were built out
    // of a castle-brick tile that DRAWS as a masonry wall and answers nothing:
    // 206 of them overhead in sector 02 and 212 in sector 05, the stage-2
    // ceiling among them. In the original that ceiling is ordinary brick — you
    // bump it, and as a big player you break it.
    //
    // The rule: anything brick-looking overhead must be hittable, and anything
    // that is genuinely indestructible must not wear a brick's face. The hard
    // block (a plain slab) is allowed to be solid; it reads as solid.
    await boot(page);
    const bad = await page.evaluate(() => {
      const HARD = 5, CASTLE_BRICK = 13;
      const out = [];
      for (let i = 0; i < window.__crLevelCount; i++) {
        const L = window.__crBuild(i), S = new Set(L.T.SOLID);
        const at = (x, y) => (x < 0 || y < 0 || x >= L.w || y >= L.h) ? 0 : L.tiles[y * L.w + x];
        const solid = (x, y) => S.has(at(x, y));
        const BUMP = new Set([L.T.BRICK, L.T.Q, L.T.HIDDEN, 4]);
        for (let x = 0; x < L.w; x++) for (let y = 0; y < L.h; y++) {
          const t = at(x, y);
          if (!S.has(t) || BUMP.has(t) || t === HARD) continue;
          if (t !== CASTLE_BRICK) continue;      // only the brick-faced tiles
          if (solid(x, y + 1)) continue;         // not the underside of anything
          let reach = false;                     // can a head actually get here?
          for (let R = y + 2; R <= y + 5 && !reach; R++)
            for (let dx = -2; dx <= 2 && !reach; dx++) {
              if (!solid(x + dx, R) || solid(x + dx, R - 1) || solid(x + dx, R - 2)) continue;
              let clear = true;
              for (let yy = y + 1; yy < R; yy++) if (solid(x, yy)) { clear = false; break; }
              if (clear) reach = true;
            }
          if (reach) out.push(L.name + ' (' + x + ',' + y + ')');
        }
      }
      return out;
    });
    expect(bad.slice(0, 12), 'brick-faced blocks overhead that ignore a bump (' +
           bad.length + ' total)').toEqual([]);
  });

  test('the floor never looks like the brick you can hit', async ({ page }) => {
    // In the underground theme `ground` and `brick` were literally the same
    // hex, which did not matter while the structure was a separate masonry
    // tile — but once the ceiling and the pillars became brick, the whole
    // sector read as one wall of cyan and you could not tell what to hit.
    await boot(page);
    const rows = [];
    for (let lv = 0; lv < 5; lv++) {
      await page.evaluate(l => { window.__crTest.level(l); window.__crTest.step(150); }, lv);
      rows.push(await page.evaluate(() => {
        const px = (t) => {
          const c = window.__crTile(t);
          if (!c) return null;
          const d = c.getContext('2d').getImageData(0, 0, 16, 16).data, out = [];
          for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 8) out.push([d[i], d[i+1], d[i+2]]);
          return out;
        };
        const lum = (c) => {
          const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
          return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
        };
        const sig = (t) => {
          const a = px(t);
          if (!a || !a.length) return null;
          const L = a.map(lum).sort((x, y) => x - y);
          const m = [0, 0, 0];
          a.forEach(c => { m[0] += c[0]; m[1] += c[1]; m[2] += c[2]; });
          return { lo: L[Math.floor(L.length * 0.15)], hi: L[Math.floor(L.length * 0.85)],
                   rgb: m.map(v => v / a.length) };
        };
        const g = sig(1), br = sig(2);
        if (!g || !br) return null;
        return { name: window.__cr().level,
                 dl: Math.abs(g.hi - br.hi) + Math.abs(g.lo - br.lo),
                 dc: Math.sqrt(g.rgb.reduce((s, v, i) => s + (v - br.rgb[i]) ** 2, 0)) };
      }));
    }
    for (const r of rows) {
      if (!r) continue;
      expect(r.dl > 0.04 || r.dc > 28,
        'sector ' + r.name + ': floor vs brick — luminance gap ' + r.dl.toFixed(3) +
        ', colour distance ' + r.dc.toFixed(1)).toBe(true);
    }
  });

  test('the stage-2 ceiling and its pillars are brick you can break', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const T = window.__crTest, out = {};
      T.level(1); T.input({}); T.step(140); T.clear();
      out.ceiling = T.tile(20, 1);
      // a pillar hangs down to head height; small bumps it, big breaks it
      T.place(28, 13); T.input({}); T.step(6);
      for (let f = 0; f < 60; f++) { T.input({ jump: f < 40 }); T.step(); }
      out.smallPillar = T.tile(28, 8);
      T.level(1); T.input({}); T.step(140); T.clear(); T.give('big');
      T.place(28, 13); T.input({}); T.step(6);
      for (let f = 0; f < 60; f++) { T.input({ jump: f < 40 }); T.step(); }
      out.bigPillar = T.tile(28, 8);
      out.state = window.__cr().state;
      return out;
    });
    expect(r.ceiling, 'the ceiling should be brick, not dead masonry').toBe(2);
    expect(r.smallPillar, 'a small player bumps a pillar without breaking it').toBe(2);
    expect(r.bigPillar, 'a big player breaks it').not.toBe(2);
    expect(r.state).toBe('play');
  });

  test('every hidden block can actually be struck', async ({ page }) => {
    // The first version of this test counted hidden blocks and multi-coin
    // bricks in the built map. It was satisfied by construction by the same
    // commit that added them, and it was green on a build where three of them
    // could never be hit at all. What matters is reachability, so measure that.
    //
    // A hidden block is only solid to a RISING player (collideY), so the ONLY
    // way to spend one is a head-bump from underneath: there has to be
    // somewhere to stand 2-5 rows below it (a full jump lifts a small player's
    // head 4.63 tiles) with a clear column between. A struck block becomes
    // solid, so a chain of them is a staircase you build as you climb; water
    // and a springboard also put you places the terrain alone cannot.
    await boot(page);
    const bad = await page.evaluate(() => {
      const out = [];
      for (let i = 0; i < window.__crLevelCount; i++) {
        const L = window.__crBuild(i), S = new Set(L.T.SOLID);
        const at = (x, y) => (x < 0 || y < 0 || x >= L.w || y >= L.h) ? 0 : L.tiles[y * L.w + x];
        const solid = (x, y) => S.has(at(x, y));
        const stand = (x, y) => solid(x, y) || at(x, y) === L.T.PLAT ||
                                at(x, y) === L.T.CLOUD || at(x, y) === L.T.HIDDEN;
        const springs = L.spawns.filter(s => s.type === 'spring');
        const sprung = (x, y) => springs.some(s => Math.abs(s.x - x) <= 2 && y >= 4 && y <= 11);
        const wet = (x, y) => {
          for (let yy = y; yy < L.h; yy++) {
            const t = at(x, yy);
            if (t === L.T.WATER || t === L.T.SURF) return true;
            if (solid(x, yy)) return false;
          }
          return false;
        };
        for (let x = 0; x < L.w; x++) for (let y = 0; y < L.h; y++) {
          if (at(x, y) !== L.T.HIDDEN) continue;
          let ok = wet(x, y) || sprung(x, y);
          for (let R = y + 2; R <= y + 5 && !ok; R++)
            for (let dx = -2; dx <= 2 && !ok; dx++) {
              const sx = x + dx;
              if (!stand(sx, R) || solid(sx, R - 1) || solid(sx, R - 2)) continue;
              let clear = true;
              for (let yy = y + 1; yy < R; yy++) if (solid(x, yy)) { clear = false; break; }
              if (clear) ok = true;
            }
          if (!ok) out.push(L.name + ' (' + x + ',' + y + ') ' + (L.contents[x + ',' + y] || '?'));
        }
      }
      return out;
    });
    expect(bad, 'invisible blocks nothing can get underneath: ' + bad.join(', ')).toEqual([]);
  });

  test('you can ride a moving platform at any speed', async ({ page }) => {
    // Both vertical platforms in sector 04 are dy 1.1 and both sit over a
    // bottomless pit, and both dropped the player through: platformCollide
    // compared the player's PREVIOUS bottom against the platform's CURRENT
    // top, and the error grew with the platform's speed until it beat the
    // 2px tolerance. Verified failing on the pre-fix build first.
    //
    // Note the relevel inside the loop: __crTest.clear() deliberately KEEPS
    // platforms, so a loop that only calls clear() stacks a new platform each
    // pass and measures against the first one. That harness bug made the same
    // sweep read as an unstable size threshold three times before I spotted it.
    await boot(page);
    const r = await page.evaluate(() => {
      const T = window.__crTest, out = {};
      [-1.3, -1.1, -1.0, -0.9, -0.5, 0.5, 0.9, 1.0, 1.1, 1.3].forEach(D => {
        T.level(0); T.input({}); T.step(140);
        T.clear(); T.place(60, 8);
        T.spawn('plat', 60, 10, { dx: 0, dy: D, min: 2, max: 12, w: 3 });
        let landed = false, worst = 0;
        for (let f = 0; f < 600; f++) {
          T.input({}); T.step();
          const s = window.__cr();
          const pl = T.entsFull().find(x => x.type === 'plat');
          if (!pl) break;
          if (s.onGround) landed = true;
          if (landed) worst = Math.max(worst, (s.py + 16) - pl.y);
        }
        out['dy ' + D] = Math.round(worst * 10) / 10;
      });
      return out;
    });
    for (const [k, gap] of Object.entries(r)) {
      expect(gap, 'gap between the player and the platform at ' + k).toBeLessThan(4);
    }
  });

  test('the axe cannot be jumped over, and the castle 1-up survives', async ({ page }) => {
    // The axe was tested at the player's CENTRE tile, so any ordinary jump from
    // the end of the bridge carried you straight over it: the sector cleared
    // with the boss still pacing, no collapse and no 5000 points, off the
    // commonest input in the game. And an item rolls right by default, which
    // posted the castle's hidden 1-up into the lava pool two tiles away — it
    // lived 50 frames, most of them above the player's own head.
    await boot(page);
    const r = await page.evaluate(() => {
      const T = window.__crTest, out = {};
      T.level(4); T.input({}); T.step(140);
      T.place(156, 12); T.input({}); T.step(12);
      for (let f = 0; f < 120; f++) { T.input({ right: 1, run: 1, jump: f < 30 }); T.step(); }
      out.axeTile = T.tile(159, 12);
      out.bossAlive = T.ents().some(e => e.type === 'boss' && !e.gone);
      T.level(4); T.input({}); T.step(140); T.clear();
      T.place(37, 12); T.step(10); T.place(37, 8); T.input({});
      for (let f = 0; f < 50; f++) { T.input({ jump: f < 40 }); T.step(); }
      let life = 0;
      for (let f = 0; f < 500; f++) {
        T.input({}); T.step();
        if (T.ents().some(e => e.type === 'oneup')) life = f; else if (life) break;
      }
      out.oneupLife = life;
      return out;
    });
    expect(r.axeTile, 'running and jumping off the bridge must take the axe').not.toBe(17);
    expect(r.oneupLife, 'frames the castle 1-up survives').toBeGreaterThan(150);
  });

  test('every pipe that leads somewhere is entered from on top', async ({ page }) => {
    // `warps` was a pipe you drop into and `exitPipes` one you walk out of
    // sideways — an implementation split showing through to the player. In
    // every bonus room the only way out was to walk into the side of the pipe;
    // standing on it and pressing down, the gesture the genre teaches and the
    // one this game itself teaches at its very first warp pipe, did nothing.
    await boot(page);
    const r = await page.evaluate(() => {
      const T = window.__crTest, out = [];
      for (let i = 0; i < window.__crLevelCount; i++) {
        const L = window.__crBuild(i);
        const all = [];
        for (const k in L.warps) all.push([k, 'warp']);
        for (const k in (L.exits || {})) all.push([k, 'exit']);
        all.forEach(([k, kind]) => {
          const [cx, cy] = k.split(',').map(Number);
          T.level(i); T.input({}); T.step(140); T.clear();
          T.place(cx + 1, cy);
          T.input({}); T.step(8);
          const before = window.__cr();
          for (let f = 0; f < 160; f++) { T.input({ down: 1 }); T.step(); }
          const after = window.__cr();
          out.push({ where: L.name + ' ' + kind + ' (' + k + ')',
                     moved: Math.abs(after.px - before.px) > 32 ||
                            after.level !== before.level });
        });
      }
      return out;
    });
    expect(r.length, 'the game should have pipes that lead somewhere').toBeGreaterThan(5);
    const dead = r.filter(x => !x.moved).map(x => x.where);
    expect(dead, 'pipes that ignore ▼ from on top: ' + dead.join(', ')).toEqual([]);
  });

  test('and no pipe swallows you when you merely walk into it', async ({ page }) => {
    // Making ▼-on-top work was not enough on its own: a bonus room's exit pipe
    // grabbed you the instant you touched its side, so you were pulled through
    // before you ever got the chance to jump on it, and the game still played
    // as "walk into the pipe". Entering is one gesture now, the one the game
    // teaches at its first warp pipe.
    await boot(page);
    const swallowed = await page.evaluate(() => {
      const T = window.__crTest, out = [];
      for (let i = 0; i < window.__crLevelCount; i++) {
        const L = window.__crBuild(i);
        const all = [];
        for (const k in L.warps) all.push([k, 'warp']);
        for (const k in (L.exits || {})) all.push([k, 'exit']);
        all.forEach(([k, kind]) => {
          const [cx, cy] = k.split(',').map(Number);
          T.level(i); T.input({}); T.step(140); T.clear();
          T.place(cx - 3, cy + 2);
          T.input({}); T.step(8);
          const before = window.__cr();
          for (let f = 0; f < 120; f++) { T.input({ right: 1 }); T.step(); }
          const after = window.__cr();
          if (Math.abs(after.px - before.px) > 200 || after.level !== before.level)
            out.push(L.name + ' ' + kind + ' (' + k + ')');
        });
      }
      return out;
    });
    expect(swallowed, 'pipes that swallow you from the side: ' + swallowed.join(', '))
      .toEqual([]);
  });

  test('the Warp Zone keeps what you are carrying', async ({ page }) => {
    // Every other pipe in the game is a same-level warp and preserves your
    // power-up. The cross-sector pipes went through beginLevel(i, false), which
    // only restores big/fire on a resume — so you walked in as Fire and arrived
    // small, which made taking the secret strictly worse than not. And you must
    // pass sector 02's checkpoint to reach the vine, so fromCheckpoint was
    // always set and your first death landed mid-way through a sector you had
    // never seen.
    await boot(page);
    const r = await page.evaluate(() => {
      const T = window.__crTest;
      T.level(1); T.input({}); T.step(140); T.clear();
      T.give('fire'); T.setLives(4);
      const before = window.__cr();
      T.place(225, 10); T.input({}); T.step(6);
      for (let i = 0; i < 140; i++) { T.input({ down: 1 }); T.step(); }
      const after = window.__cr();
      return { before, after, startTile: Math.round(after.px / 16),
               dest: window.__crBuild(3) };
    });
    expect(r.before.fire).toBe(true);
    expect(r.after.level, 'the pipe skips a sector').toBe('04');
    expect(r.after.fire, 'a warp must not strip your power-up').toBe(true);
    expect(r.after.big).toBe(true);
    expect(r.after.lives, 'and must not cost a life').toBe(r.before.lives);
    expect(r.startTile, 'you arrive at the sector start, not at its checkpoint')
      .toBeLessThan(r.dest.checkpoint);
  });
});

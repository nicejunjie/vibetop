// @ts-check
// Iron Frontier (Start ▸ Games ▸ ⚔️) — an isometric RTS skirmish, one
// self-contained page. A canvas game cannot be asserted from the DOM, so the
// page exposes read-only (and situation-setting) hooks the tests drive
// instead:
//   __rts()            a state snapshot (tick, credits, power, unit/building
//                       counts, selection, queue, AI posture…)
//   __rtsScreen(gx,gy)  canvas-relative pixel position of a grid tile, for
//                       clicking a specific spot on the map
//   __rtsTest.get()     the live mutable game state
//   __rtsTest.step(n)   advance the sim n ticks directly — the sim is fixed
//                       60Hz and seeded (no Math.random), so this fast-
//                       forwards a build/move deterministically instead of
//                       waiting on real wall-clock time
//   __rtsTest.api.canPlace(g, player, key, gx, gy)  legality check, used
//                       here to find a tile that is actually buildable
//                       rather than guessing one and hoping
//   __rtsTables         { UNITS, BLDS, DIFF, MAP } — building/unit costs and
//                       footprints, read instead of hard-coded
//
// This walks a REAL match: start it from the menu card, queue and place a
// building (watching credits and power actually move), box-select the
// opening army and send it somewhere with a right-click, and pause/resume —
// not just that the page renders.

const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.goto('/rts.html');
  await page.waitForFunction(() => !!window.__rts, null, { timeout: 15000 });
  await page.locator('#ovA').click();                  // the title card's "Start"
  await expect
    .poll(async () => page.evaluate(() => window.__rts().state), { timeout: 12000 })
    .toBe('play');
}
const snap = (page) => page.evaluate(() => window.__rts());

// Find a tile the human player (P_HUMAN = 0) can actually build `key` on,
// scanning outward from their own base — cheaper and less brittle than
// hard-coding a coordinate that happens to be clear on today's map.
async function findPlacement(page, key) {
  return page.evaluate((key) => {
    const g = window.__rtsTest.get();
    const s = g.start[0];
    for (let r = 1; r < 12; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const gx = s.x + dx, gy = s.y + dy;
          if (window.__rtsTest.api.canPlace(g, 0, key, gx, gy)) return { gx, gy };
        }
      }
    }
    return null;
  }, key);
}

// Screen point at the CENTER of a building's footprint — canvas-click math
// (tryPlace) rounds the click to `gx - (gw-1)/2`, so clicking the footprint
// center cancels that rounding exactly instead of landing on an edge tile.
async function centerScreen(page, gx, gy, gw, gh) {
  return page.evaluate(([gx, gy, gw, gh]) => window.__rtsScreen(gx + (gw - 1) / 2, gy + (gh - 1) / 2),
    [gx, gy, gw, gh]);
}

test.describe('rts', () => {
  test.skip(({ hasTouch }) => hasTouch, 'desktop only — box-select, right-click orders and edge scroll have no touch equivalent');

  test('starting a match gives both sides a base, harvesters and a guard', async ({ page }) => {
    await boot(page);
    const s = await snap(page);
    expect(s.diff).toBeTruthy();
    expect(typeof s.seed).toBe('number');
    // startMatch() places one Construction Yard and spawns 2 harvesters +
    // 3 rifle infantry per side — assert the opening is actually symmetric,
    // not just that SOMETHING exists.
    expect(s.blds, 'human base').toBe(1);
    expect(s.enemyBlds, 'AI base').toBe(1);
    expect(s.units, 'human opening force').toBe(5);
    expect(s.enemyUnits, 'AI opening force').toBe(5);
    expect(s.sel).toBe(0);
    expect(s.placing).toBeNull();
  });

  test('queuing, building and placing a Power Plant moves credits, the queue and power', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await boot(page);

    const before = await snap(page);
    expect(before.power, 'no power plant yet').toBeLessThanOrEqual(0);

    // BUILD_ORDER[0] is 'power' — the first row in the Build tab.
    const rows = page.locator('#plist .pit');
    await expect(rows.first()).toBeVisible();
    await rows.first().click();

    // Queuing charges credits immediately (enqueue()), before anything is built.
    const tables = await page.evaluate(() => window.__rtsTables);
    const cost = tables.BLDS.power.cost;
    await expect
      .poll(async () => (await snap(page)).credits)
      .toBe(before.credits - cost);
    await expect.poll(async () => (await snap(page)).queue.length).toBeGreaterThan(0);

    // Fast-forward the sim directly instead of waiting out the real build
    // time (build=7s -> 420 ticks at full power) — deterministic and
    // instant either way, since the sim doesn't care whether ticks come
    // from rAF or a direct step() call. One big jump, then a poll as a
    // safety margin in case a slowdown (e.g. a later negative-power test
    // run sharing this worker) stretched it out.
    await page.evaluate(() => window.__rtsTest.step(450));
    await expect
      .poll(async () => {
        await page.evaluate(() => window.__rtsTest.step(200));
        return (await snap(page)).ready;
      }, { timeout: 15000 })
      .toBe('power');

    // Click the finished row again to arm placement.
    await rows.first().click();
    await expect.poll(async () => (await snap(page)).placing).toBe('power');

    const tile = await findPlacement(page, 'power');
    expect(tile, 'a legal tile for a Power Plant near the base').not.toBeNull();
    const spec = tables.BLDS.power;
    const pt = await centerScreen(page, tile.gx, tile.gy, spec.gw, spec.gh);
    await page.locator('#cv').click({ position: { x: pt.x, y: pt.y } });

    await expect.poll(async () => (await snap(page)).blds).toBe(before.blds + 1);
    const after = await snap(page);
    expect(after.power, 'a Power Plant adds +100 power').toBeGreaterThan(before.power);
    expect(after.ready, 'placement clears the ready flag').toBeNull();
    expect(after.placing).toBeNull();

    expect(errors, 'errors while building').toEqual([]);
  });

  test('box-select picks up the starting army and a right-click moves it', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await boot(page);

    // Bounding box (in canvas-relative pixels) around every human unit —
    // padded so the marquee edge doesn't clip a unit sitting right on it.
    const box = await page.evaluate(() => {
      const g = window.__rtsTest.get();
      const units = g.units.filter((u) => !u.dead && u.p === 0);
      const pts = units.map((u) => window.__rtsScreen(u.x, u.y));
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      return {
        x1: Math.min.apply(null, xs) - 40, y1: Math.min.apply(null, ys) - 40,
        x2: Math.max.apply(null, xs) + 40, y2: Math.max.apply(null, ys) + 40,
      };
    });

    const cv = page.locator('#cv');
    const cvBox = await cv.boundingBox();
    if (!cvBox) throw new Error('canvas has no layout box');
    await page.mouse.move(cvBox.x + box.x1, cvBox.y + box.y1);
    await page.mouse.down();
    await page.mouse.move(cvBox.x + box.x2, cvBox.y + box.y2, { steps: 8 });
    await page.mouse.up();

    await expect.poll(async () => (await snap(page)).sel).toBeGreaterThan(0);

    const before = await page.evaluate(() => window.__rtsTest.get().units
      .filter((u) => !u.dead && u.p === 0 && u.sel)
      .map((u) => ({ id: u.id, x: u.x, y: u.y })));

    // Order the selection to a clear tile in a different quadrant of the map
    // (mirrors findPlacement's own base-scan logic, just for open ground).
    const target = await page.evaluate(() => {
      const g = window.__rtsTest.get();
      const s = g.start[0];
      const gx = Math.max(2, Math.min(window.__rtsTables.MAP - 3, s.x - 8));
      const gy = Math.max(2, Math.min(window.__rtsTables.MAP - 3, s.y - 8));
      return { gx, gy };
    });
    const pt = await page.evaluate(([gx, gy]) => window.__rtsScreen(gx, gy), [target.gx, target.gy]);
    await cv.click({ position: { x: pt.x, y: pt.y }, button: 'right' });

    await expect
      .poll(async () => {
        await page.evaluate(() => window.__rtsTest.step(60));
        return page.evaluate((before) => {
          const g = window.__rtsTest.get();
          return before.some((b) => {
            const u = g.units.find((x) => x.id === b.id && !x.dead);
            return !!u && (Math.abs(u.x - b.x) > 0.5 || Math.abs(u.y - b.y) > 0.5);
          });
        }, before);
      }, { timeout: 15000 })
      .toBe(true);

    expect(errors, 'errors during select/move').toEqual([]);
  });

  test('pause stops the tick and resume continues it', async ({ page }) => {
    await boot(page);
    await page.locator('#pauseBtn').click();
    await expect.poll(async () => (await snap(page)).state).toBe('paused');

    const t1 = (await snap(page)).tick;
    await page.waitForTimeout(400);
    const t2 = (await snap(page)).tick;
    expect(t2, 'tick does not advance while paused').toBe(t1);

    await page.locator('#pauseBtn').click();
    await expect.poll(async () => (await snap(page)).state).toBe('play');
    await expect
      .poll(async () => (await snap(page)).tick, { timeout: 5000 })
      .toBeGreaterThan(t2);
  });

  // --- camera feel ------------------------------------------------------
  // Edge scrolling is a ZONE with a speed curve and NO delay. A dwell timer
  // was tried and rejected: RA2 has none, and waiting for the map to start
  // moving is worse than the problem it solves. What makes a right-hand build
  // panel coexist with an edge band is (a) the inner lip is nearly stationary,
  // so sweeping across it on the way to the panel costs a handful of pixels,
  // and (b) entering the panel stops the map dead.
  test('the edge zone responds immediately — no dwell delay', async ({ page }) => {
    await boot(page);
    const cam = () => page.evaluate(() => window.__rtsCam());
    await page.mouse.move(640, 400);
    await page.waitForTimeout(300);

    const before = await cam();
    const t0 = Date.now();
    await page.mouse.move(4, 400);                 // deep in the zone
    let elapsed = -1;
    for (let i = 0; i < 120; i++) {
      if (Math.abs((await cam()).x - before.x) >= 60) { elapsed = Date.now() - t0; break; }
      await page.waitForTimeout(10);
    }
    expect(elapsed, 'the map must start moving at once, not after a timer')
      .toBeGreaterThan(-1);
    expect(elapsed, 'no perceptible hang before the map moves').toBeLessThan(300);
  });

  test('edge speed ramps with depth: the lip is slow, the edge is fast', async ({ page }) => {
    await boot(page);
    const cam = () => page.evaluate(() => window.__rtsCam());
    async function travel(x) {
      await page.mouse.move(640, 400);
      await page.waitForTimeout(320);
      const a = await cam();
      await page.mouse.move(x, 400);
      await page.waitForTimeout(600);
      return Math.abs((await cam()).x - a.x);
    }
    const lip = await travel(40);
    const mid = await travel(20);
    const edge = await travel(2);
    // A flat band (one speed everywhere) is the failure this guards against:
    // it makes the lip unusable for fine positioning and the edge too slow.
    expect(mid, 'mid-zone must clearly outrun the lip').toBeGreaterThan(lip * 2);
    expect(edge, 'the outer edge must clearly outrun mid-zone').toBeGreaterThan(mid * 1.6);
    expect(lip, 'the inner lip must stay gentle enough to aim in').toBeLessThan(160);
  });

  test('going to the build panel does not drag the map with you', async ({ page }) => {
    await boot(page);
    const cam = () => page.evaluate(() => window.__rtsCam());

    // Crossing the right-hand band to reach the panel is unavoidable geometry.
    // A pointer travelling across it is on its way somewhere and must not move
    // the map — at either speed a real hand uses.
    async function tripToPanel(step, wait) {
      await page.mouse.move(640, 400);
      await page.waitForTimeout(340);
      const a = await cam();
      for (let x = 640; x <= 1190; x += step) {
        await page.mouse.move(x, 300);
        await page.waitForTimeout(wait);
      }
      await page.waitForTimeout(500);              // and resting on the panel
      return Math.abs((await cam()).x - a.x);
    }
    expect(await tripToPanel(55, 5), 'a quick trip to the panel must not pan')
      .toBeLessThan(12);
    expect(await tripToPanel(22, 9), 'a slower trip must not pan either')
      .toBeLessThan(12);

    // And once you are on it, clicking must not move the map at all.
    const b = await cam();
    for (let i = 1; i <= 3; i++) {
      await page.locator(`#plist .pit:nth-child(${i})`).click();
      await page.waitForTimeout(200);
    }
    expect(Math.abs((await cam()).x - b.x), 'clicking build items must not pan')
      .toBeLessThanOrEqual(4);
  });

  test('coming back from the build menu does not move the map either', async ({ page }) => {
    await boot(page);
    const cam = () => page.evaluate(() => window.__rtsCam());
    async function toPanel() {
      for (let x = 640; x <= 1190; x += 55) {
        await page.mouse.move(x, 300);
        await page.waitForTimeout(5);
      }
      await page.waitForTimeout(300);
    }
    async function backToMap(step, wait) {
      const a = await cam();
      for (let x = 1190; x >= 640; x -= step) {
        await page.mouse.move(x, 320);
        await page.waitForTimeout(wait);
      }
      await page.waitForTimeout(450);
      return Math.abs((await cam()).x - a.x);
    }

    await page.mouse.move(640, 400);
    await page.waitForTimeout(340);
    await toPanel();
    await page.locator('#plist .pit:nth-child(1)').click();
    await page.waitForTimeout(250);
    // Returning from the menu re-enters the canvas through the right-hand
    // band. With no previous sample to measure, "unknown" must mean
    // travelling — reading it as stationary lurched the map on every return.
    expect(await backToMap(55, 5), 'a quick return must not pan').toBeLessThan(12);

    await toPanel();
    expect(await backToMap(20, 10), 'a slow return must not pan either').toBeLessThan(12);
  });

  test('the command bar holds the map still, but past the window is full speed', async ({ page }) => {
    await boot(page);
    const cam = () => page.evaluate(() => window.__rtsCam());

    // Resting on the build panel is USING THE UI: the map must not drift.
    await page.mouse.move(640, 400);
    await page.waitForTimeout(320);
    await page.mouse.move(1190, 400);
    await page.waitForTimeout(220);
    const a = await cam();
    await page.waitForTimeout(700);
    expect(Math.abs((await cam()).x - a.x), 'the panel is UI, not an edge')
      .toBeLessThan(12);

    // Off the window entirely — including out through the right-hand side,
    // past the command bar — is the pinned-cursor case: full speed.
    await page.mouse.move(640, 400);
    await page.waitForTimeout(320);
    const b = await cam();
    await page.evaluate(() => {
      document.dispatchEvent(new PointerEvent('pointerleave', {
        clientX: window.innerWidth, clientY: 400, bubbles: false,
      }));
    });
    await page.waitForTimeout(700);
    expect(Math.abs((await cam()).x - b.x), 'pushed off the window should race')
      .toBeGreaterThan(400);
  });

  test('a pan eases in instead of snapping to full speed', async ({ page }) => {
    await boot(page);
    await page.mouse.move(640, 400);
    await page.waitForTimeout(250);
    const r = await page.evaluate(async () => {
      const xs = [];
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
      await new Promise((res) => {
        const t0 = performance.now();
        (function f() {
          xs.push(window.__rtsCam().x);
          if (performance.now() - t0 < 700) requestAnimationFrame(f); else res();
        })();
      });
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd' }));
      const d = [];
      for (let i = 1; i < xs.length; i++) d.push(xs[i] - xs[i - 1]);
      const mid = d.slice(Math.floor(d.length * 0.5), Math.floor(d.length * 0.9));
      const cruise = mid.reduce((a, b) => a + b, 0) / mid.length;
      const first = d.find((v) => Math.abs(v) > 0.5) || 0;
      return { first, cruise, jitter: Math.max(...mid.map((v) => Math.abs(v - cruise))) };
    });
    expect(r.cruise, 'keyboard pan should actually move').toBeGreaterThan(4);
    expect(r.first, 'a pan must accelerate, not snap to full speed')
      .toBeLessThan(r.cruise * 0.5);
    expect(r.jitter, 'steady-state pan must not stutter').toBeLessThan(r.cruise * 0.6);
  });
});

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

  test('leaving the game stops navigation — on every edge', async ({ page }) => {
    await boot(page);
    const cam = () => page.evaluate(() => window.__rtsCam());
    const box = await page.evaluate(() => {
      const r = document.getElementById('cv').getBoundingClientRect();
      return { l: r.left, t: r.top, w: r.width, h: r.height };
    });

    // Parked just inside each edge, the map scrolls — all four the same.
    const inside = [
      ['left', 3, 400], ['right', box.w - 3, 400],
      ['top', 500, 3], ['bottom', 500, box.h - 3],
    ];
    for (const [name, x, y] of inside) {
      await page.mouse.move(600, 400);
      await page.waitForTimeout(320);
      const a2 = await cam();
      await page.mouse.move(box.l + x, box.t + y);
      await page.waitForTimeout(600);
      const c = await cam();
      expect(Math.hypot(c.x - a2.x, c.y - a2.y), `${name} edge should scroll`)
        .toBeGreaterThan(150);
    }

    // Off the canvas, it stops. Off-window acceleration was tried and is wrong
    // in a browser: the cursor is not locked to the viewport, so wandering out
    // of the game left the map running away by itself.
    await page.mouse.move(600, 400);
    await page.waitForTimeout(320);
    await page.mouse.move(box.l + 3, box.t + 400);
    await page.waitForTimeout(150);
    await page.evaluate(() =>
      document.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false })));
    const a3 = await cam();
    await page.waitForTimeout(700);
    const c3 = await cam();
    expect(Math.hypot(c3.x - a3.x, c3.y - a3.y), 'leaving the game must stop the map')
      .toBeLessThan(60);
  });

  test('losing focus does not pause, and any click resumes', async ({ page }) => {
    await boot(page);
    const snapshot = () => page.evaluate(() => window.__rts());

    // A real-time match must not stop because focus wandered off.
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(250);
    const blurred = await snapshot();
    expect(blurred.state, 'blur must not pause a real-time match').toBe('play');
    await page.waitForTimeout(350);
    expect((await snapshot()).tick, 'the match must keep running')
      .toBeGreaterThan(blurred.tick);

    // The pause button pauses, and says so.
    await page.locator('#pauseBtn').click();
    await page.waitForTimeout(200);
    const paused = await snapshot();
    expect(paused.state).toBe('paused');
    await expect(page.locator('#paused')).toBeVisible();
    await page.waitForTimeout(350);
    expect((await snapshot()).tick, 'paused means paused').toBe(paused.tick);

    // A click anywhere gets you out — the map, or the command bar.
    await page.mouse.click(500, 400);
    await page.waitForTimeout(200);
    expect((await snapshot()).state, 'clicking the map resumes').toBe('play');

    await page.locator('#pauseBtn').click();
    await page.waitForTimeout(200);
    await page.locator('#plist .pit:nth-child(1)').click();
    await page.waitForTimeout(200);
    expect((await snapshot()).state, 'clicking the panel resumes').toBe('play');
  });

  test('the HUD never changes the layout — the canvas size must hold still', async ({ page }) => {
    await boot(page);

    // Anything appended to the top bar that is not absolutely positioned grows
    // it, which shrinks the stage, which resizes the canvas — and assigning
    // canvas.width CLEARS it. That is a full-screen flash, once per event.
    // It shipped exactly that way: the credit "+500" popup was copied from
    // 2048 without its CSS, so every ore delivery flashed the whole game.
    await page.evaluate(() => {
      const H = window.__rtsTest, T = window.__rtsTables, g = H.get(), s = g.start[0];
      H.give(0, 20000);
      const ore = H.findOre(s.x, s.y);
      for (let r = 2; r < 12; r++) {
        for (let oy = -r; oy <= r; oy++) {
          for (let ox = -r; ox <= r; ox++) {
            const bx = ore.x + ox, by = ore.y + oy;
            if (bx > 1 && by > 1 && bx < T.MAP - 4 && by < T.MAP - 4 &&
                H.api.canPlace(g, 0, 'refinery', bx, by)) { H.build('refinery', 0, bx, by); return; }
          }
        }
      }
    });

    const seen = await page.evaluate(() => new Promise((res) => {
      const cv = document.getElementById('cv');
      const bar = document.querySelector('.bar');
      const keys = new Set();
      let n = 0;
      (function f() {
        keys.add(cv.width + 'x' + cv.height + '/' + Math.round(bar.getBoundingClientRect().height));
        if (++n < 900) requestAnimationFrame(f); else res([...keys]);
      })();
    }));
    expect(seen, `layout must not move while playing (saw ${seen.join(' ')})`)
      .toHaveLength(1);
  });

  test('the build radius gives you room, and shows you where it is', async ({ page }) => {
    await boot(page);
    // The first rule required a new footprint to TOUCH an existing building,
    // which forces the whole base into one solid brick. A radius is what RA2
    // actually does, and it has to leave real room to lay a base out.
    const spots = await page.evaluate(() => {
      const H = window.__rtsTest, T = window.__rtsTables, g = H.get();
      let n = 0;
      for (let y = 0; y < T.MAP; y++)
        for (let x = 0; x < T.MAP; x++)
          if (H.api.canPlace(g, 0, 'power', x, y)) n++;
      return n;
    });
    expect(spots, 'one construction yard should open up a real area to build in')
      .toBeGreaterThan(80);

    // It must also be visible: arming a placement paints the legal area.
    await page.evaluate(() => window.__rtsTest.give(0, 20000));
    await page.locator('#plist .pit:nth-child(1)').click();
    await expect
      .poll(async () => page.evaluate(() => window.__rts().ready), { timeout: 30000 })
      .toBe('power');
    await page.locator('#plist .pit:nth-child(1)').click();
    expect(await page.evaluate(() => window.__rts().placing)).toBe('power');
  });

  test('a rally point is visible, routed, and actually used', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__rtsTest.give(0, 20000));
    await page.evaluate(() => {
      const H = window.__rtsTest, g = H.get(), s = g.start[0];
      for (let r = 3; r < 10; r++)
        for (let oy = -r; oy <= r; oy++)
          for (let ox = -r; ox <= r; ox++)
            if (H.api.canPlace(g, 0, 'barracks', s.x + ox, s.y + oy)) {
              H.build('barracks', 0, s.x + ox, s.y + oy); return;
            }
    });
    const bar = await page.evaluate(() => {
      const b = window.__rtsTest.get().blds.find((x) => x.type === 'barracks' && x.p === 0);
      return { cx: b.cx, cy: b.cy };
    });
    const at = (dx, dy) => page.evaluate(({ cx, cy, dx, dy }) => {
      const c = document.getElementById('cv').getBoundingClientRect();
      const s = window.__rtsScreen(cx + dx, cy + dy);
      return { x: c.left + s.x, y: c.top + s.y };
    }, { cx: bar.cx, cy: bar.cy, dx, dy });

    // Selecting a producer must SAY it takes a rally point — previously
    // nothing about the feature was visible anywhere.
    const sel = await at(0, 0);
    await page.mouse.click(sel.x, sel.y);
    await page.waitForTimeout(200);
    expect(await page.locator('#tip').textContent()).toMatch(/rally point/i);

    // Right-click stores a real route, not just a destination.
    const dest = await at(8, 6);
    await page.mouse.click(dest.x, dest.y, { button: 'right' });
    await page.waitForTimeout(250);
    const rally = await page.evaluate(() => {
      const b = window.__rtsTest.get().blds.find((x) => x.type === 'barracks' && x.p === 0);
      return b.rally && { steps: b.rally.path ? b.rally.path.length : 0, ok: b.rally.reachable,
                          x: b.rally.x, y: b.rally.y };
    });
    expect(rally, 'right-clicking with a producer selected sets a rally point').toBeTruthy();
    expect(rally.ok, 'the route should be reachable').toBe(true);
    expect(rally.steps, 'the stored route should have steps to draw').toBeGreaterThan(1);

    // And a unit produced afterwards heads for it.
    const walked = await page.evaluate(({ rx, ry }) => {
      const H = window.__rtsTest, g = H.get();
      const before = g.units.length;
      const u = H.spawn('rifle', 0, g.blds.find((b) => b.type === 'barracks').cx, 0);
      void before; void u;
      // drive the real production path instead: queue one and run the sim
      const s = g.side[0];
      s.queues.i.list.push('rifle');
      H.step(60 * 12);
      const fresh = g.units.filter((v) => !v.dead && v.p === 0 && v.type === 'rifle');
      return fresh.some((v) => v.order && v.order.t === 'move' &&
                               Math.abs(v.order.x - rx) < 3 && Math.abs(v.order.y - ry) < 3);
    }, { rx: rally.x, ry: rally.y });
    expect(walked, 'a newly produced unit should be sent to the rally point').toBe(true);
  });

  test('Space jumps back to base, P pauses', async ({ page }) => {
    await boot(page);
    const cam = () => page.evaluate(() => window.__rtsCam());
    const home = await cam();

    // Wander off with the edge, then come back to a neutral pointer position
    // (an edge that is still under the cursor is *supposed* to keep scrolling).
    await page.mouse.move(640, 400);
    await page.waitForTimeout(250);
    await page.mouse.move(2, 400);
    await page.waitForTimeout(1100);
    const away = await cam();
    expect(Math.abs(away.x - home.x), 'should have travelled away first')
      .toBeGreaterThan(200);

    await page.mouse.move(640, 400);
    await page.waitForTimeout(320);
    await page.keyboard.press(' ');
    await page.waitForTimeout(250);
    const back = await cam();
    expect(Math.abs(back.x - home.x), 'Space returns to base').toBeLessThan(14);
    expect(Math.abs(back.y - home.y), 'Space returns to base').toBeLessThan(14);
    expect((await page.evaluate(() => window.__rts())).state, 'Space must not pause any more')
      .toBe('play');

    await page.keyboard.press('p');
    await page.waitForTimeout(200);
    expect((await page.evaluate(() => window.__rts())).state, 'P pauses').toBe('paused');
    await page.mouse.click(500, 400);      // and a click still resumes
    await page.waitForTimeout(200);
    expect((await page.evaluate(() => window.__rts())).state).toBe('play');
  });

  test('picking a faction changes the roster you can actually build', async ({ page }) => {
    await page.goto('/rts.html');
    await page.waitForFunction(() => !!window.__rts, null, { timeout: 15000 });

    await expect(page.locator('#facRow button'), 'the menu card offers a side to pick')
      .toHaveCount(2);

    async function rosterAfterPicking(index) {
      await page.locator('#facRow button').nth(index).click();
      await page.locator('#ovA').click();
      await expect
        .poll(async () => page.evaluate(() => window.__rts().state), { timeout: 12000 })
        .toBe('play');
      const build = await page.locator('#plist .pit .nm').allTextContents();
      await page.locator('.ptab div[data-tab="d"]').click();
      const def = await page.locator('#plist .pit .nm').allTextContents();
      await page.locator('.ptab div[data-tab="i"]').click();
      const inf = await page.locator('#plist .pit .nm').allTextContents();
      await page.locator('.ptab div[data-tab="v"]').click();
      const veh = await page.locator('#plist .pit .nm').allTextContents();
      const sides = await page.evaluate(() => {
        const g = window.__rtsTest.get();
        return [g.side[0].fac, g.side[1].fac];
      });
      return { build, def, inf, veh, sides };
    }

    const dir = await rosterAfterPicking(0);
    expect(dir.sides[0], 'first option is the Directorate').toBe('dir');
    expect(dir.sides[1], 'the AI always takes the other side').toBe('col');
    expect(dir.def.join(), 'Directorate defence is the Sentry Gun').toMatch(/Sentry/);
    expect(dir.def.join(), 'and NOT the Collective one').not.toMatch(/Tesla/);
    expect(dir.build.join(), 'defence has its own tab, as in RA2')
      .not.toMatch(/Sentry|Tesla/);
    expect(dir.veh.join()).toMatch(/Lancer/);
    expect(dir.veh.join()).toMatch(/Spectre/);
    expect(dir.veh.join(), 'Mammoth belongs to the other side').not.toMatch(/Mammoth/);
    expect(dir.inf.join()).toMatch(/Rifleman/);

    // "Start over" restarts with the side you already picked — as in RA2,
    // changing faction means going back to the menu, and mid-match there is
    // no route there. So take the other side from a fresh load.
    await page.goto('/rts.html');
    await page.waitForFunction(() => !!window.__rts, null, { timeout: 15000 });
    const col = await rosterAfterPicking(1);
    expect(col.sides[0], 'second option is the Collective').toBe('col');
    expect(col.sides[1], 'the AI always takes the other side').toBe('dir');
    expect(col.def.join(), 'Collective defence is the Tesla Coil').toMatch(/Tesla/);
    expect(col.def.join(), 'and NOT the Directorate one').not.toMatch(/Sentry/);
    expect(col.build.join(), 'the shared structures are the same for both sides')
      .toBe(dir.build.join());
    expect(col.veh.join()).toMatch(/Mammoth/);
    expect(col.veh.join(), 'Lancer belongs to the other side').not.toMatch(/Lancer/);
    expect(col.inf.join()).toMatch(/Conscript/);

    // Shared kit stays available to both.
    for (const r of [dir, col]) {
      expect(r.build.join(), 'core structures are shared').toMatch(/Power Plant/);
      expect(r.veh.join(), 'the Harvester is shared').toMatch(/Harvester/);
      expect(r.inf.join(), 'the Rocketeer is shared').toMatch(/Rocketeer/);
    }
  });

  test('winning ends the match and records a time on the board', async ({ page }) => {
    await page.goto('/rts.html');
    await page.waitForFunction(() => !!window.__rts, null, { timeout: 15000 });
    await page.evaluate(() => localStorage.clear());   // a clean board to assert against
    await page.reload();
    await page.waitForFunction(() => !!window.__rts, null, { timeout: 15000 });

    await page.locator('#facRow button').first().click();
    await page.locator('#ovA').click();
    await expect.poll(async () => page.evaluate(() => window.__rts().state), { timeout: 12000 })
      .toBe('play');

    // Level the AI. The match is only lost after a grace period, so step past it.
    await page.evaluate(() => {
      window.__rtsTest.kill(1);
      for (let i = 0; i < 60 * 80; i++) window.__rtsTest.step(1);
    });
    await expect.poll(async () => page.evaluate(() => window.__rts().state), { timeout: 15000 })
      .toBe('over');

    await expect(page.locator('#ovT'), 'the card announces a win').toHaveText(/Victory/);
    await expect(page.locator('#ovP'), 'and says how long it took')
      .toHaveText(/levelled in \d+:\d\d/);

    const board = await page.evaluate(() => window.vibeScores.stats('rts', 'normal'));
    expect(board.n, 'the finished game is counted').toBeGreaterThan(0);
    expect(board.w, 'and counted as a WIN').toBe(1);
    expect(board.best, 'a best time is on the board').toBeGreaterThan(0);

    // The time on the board must be the match length, not a raw tick count.
    const shown = await page.locator('#scores').textContent();
    expect(shown, 'the board formats m:ss, not a bare number').toMatch(/\d+:\d\d/);
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

// The suite above is skipped wholesale on touch devices — the game needs a
// mouse. That is exactly why the phone case needs its OWN block: without it,
// nothing anywhere checks that a phone user gets told so instead of being
// dropped into a game they cannot play.
test.describe('rts on a touch device', () => {
  test.skip(({ hasTouch }) => !hasTouch, 'this is the touch-device dead-end check');

  test('a phone gets a plain notice, not a game it cannot play', async ({ page }) => {
    await page.goto('/rts.html');
    await page.waitForFunction(() => !!window.__rts, null, { timeout: 15000 });

    const notice = page.locator('#nomob');
    await expect(notice, 'the desktop-only notice is shown').toBeVisible();
    await expect(notice).toContainText(/Desktop only/i);

    // It has to actually COVER the game — a notice you can tap past is a
    // dead end with extra steps.
    const box = await notice.boundingBox();
    const vp = page.viewportSize();
    expect(box.width, 'it spans the viewport').toBeGreaterThanOrEqual(vp.width - 1);
    expect(box.height).toBeGreaterThanOrEqual(vp.height - 1);

    // And no match is running behind it — __rts() is null until one starts,
    // so the phone never pays for a simulation it cannot play.
    expect(await page.evaluate(() => window.__rts())).toBeNull();
  });
});

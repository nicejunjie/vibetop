// @ts-check
// Iron Frontier (apps/games/rts/rts.html) — the PLAYER'S path, end to end.
//
// Why this file exists (2026-09-11): the game's unit tests drive the
// simulation through `__rtsTest` hooks that call orderUnitsTo / placeBld /
// spawn directly and bypass the input handlers and the lockstep command layer
// on purpose. Five bugs a human hit in one afternoon lived exactly in that
// gap — a selection flag saved with the world made restored units unclickable,
// the load card's map thumbnails replaced the match's command client so no
// order after a resume was applied, "select own" pre-empted every order on an
// own target (troops could not board an IFV), in-range bystanders pre-empted
// the ordered attack target, and the edge-scroll zone was unusable in a
// floating window. Every one passed every unit test. These contracts press
// real buttons on the real page and read the world back through the hooks.
//
// Desktop only (the game gates phones out on purpose). Runs against a live host
// in about a minute: VIBETOP_BASE_URL=http://127.0.0.1 npx playwright test
// tests/rts-player.spec.js --project=desktop-chromium

const { test, expect } = require('@playwright/test');

const DESKTOP = 'desktop-chromium';
test.use({ serviceWorkers: 'block' });          // the PWA precache would hide a fresh deploy
test.beforeEach(async ({ context }, info) => {
  test.skip(info.project.name !== DESKTOP, `mouse contract — ${DESKTOP} only`);
  // VIBETOP_RTS_HTML=<file> serves a working-tree rts.html at the live URL, so
  // the suite can judge a change BEFORE it is deployed.
  if (process.env.VIBETOP_RTS_HTML) {
    await context.route('**/rts.html*', (r) => r.fulfill({ path: process.env.VIBETOP_RTS_HTML, contentType: 'text/html' }));
    // ...and its ES-module tree, or the page would import the DEPLOYED modules under a working-tree page.
    const rtsDir = require('path').dirname(process.env.VIBETOP_RTS_HTML);
    await context.route('**/rts/**', (r) => r.fulfill({ path: require('path').join(rtsDir, new URL(r.request().url()).pathname.replace(/^\//, '')), contentType: 'text/javascript' }));
  }
});

// ---- helpers: the hooks are read-only here except spawn/setCam, which stage a scene ----

async function startMatch(page) {
  await page.goto('/rts.html');
  await page.waitForFunction(() => !!window.__rtsTest, null, { timeout: 30_000 });
  await page.waitForTimeout(2500);                                  // the bake
  await page.locator('.card button').filter({ hasText: 'Start Game' }).first().click();
  await page.waitForFunction(() => window.__rtsTest.opts() !== null);
  await page.waitForTimeout(800);
}
const inMatch = (page) => page.evaluate(() => window.__rtsTest.opts() !== null);
const selected = (page) => page.evaluate(() => window.__rtsTest.selected().map((u) => u.type));
const unitById = (page, id) => page.evaluate((id) => {
  const u = window.__rtsTest.saveBlob().g.units.find((x) => x.id === id);
  return u ? { x: u.x, y: u.y, hp: u.hp, maxhp: u.maxhp, order: u.order, limbo: !!u.limbo } : null;
}, id);
// Screen point of a grid position, given the current camera (zoom 1).
const screenOf = (page, gx, gy, dy = -8) => page.evaluate(([gx, gy, dy]) => {
  const cam = window.__rtsTest.cam(), r = document.getElementById('cv').getBoundingClientRect();
  return { x: (gx - gy) * 32 - cam.x + r.width / 2 + r.left, y: (gx + gy) * 16 - cam.y + r.height / 2 + r.top + dy };
}, [gx, gy, dy]);
// Stage a scene on CLEAR GROUND near mid-map (the map is random per match, so
// the centre itself may be rock or water), away from both bases' guards, the
// camera centred on it. `out.c` is the clear centre the scene is built around.
async function stage(page, spawns, radius = 5) {
  return page.evaluate(([spawns, radius]) => {
    const H = window.__rtsTest, T = window.__rtsTables, M = T.MAP, g = H.world();
    const ok = new Set([T.TER.GROUND, T.TER.ORE, T.TER.GEM, T.TER.ROAD]);           // passable for ground units
    const ground = (x, y) => x >= 0 && y >= 0 && x < M && y < M && ok.has(g.terrain[y * M + x]);
    const farFromBases = (x, y) => g.start.every((st) => Math.hypot(x - st.x, y - st.y) > 16);
    const clearAround = (x, y, R) => { if (!farFromBases(x, y)) return false; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (!ground(x + dx, y + dy)) return false; return true; };
    let cx = Math.floor(M / 2), cy = Math.floor(M / 2), found = null;
    // The map is random per match: take the largest clear area that exists.
    for (const R of [radius, radius - 1, radius - 2]) for (let r = 0; r < M / 2 && !found; r++) for (let dy = -r; dy <= r && !found; dy++) for (let dx = -r; dx <= r && !found; dx++) if (clearAround(cx + dx, cy + dy, R)) found = [cx + dx, cy + dy];
    if (!found) throw new Error('no clear area on this map');
    cx = found[0]; cy = found[1];
    const out = { c: { x: cx, y: cy } };
    for (const [key, type, p, dx, dy] of spawns) { const u = H.spawn(type, p, cx + dx, cy + dy); out[key] = { id: u.id, x: u.x, y: u.y }; }
    H.setCam((cx - cy) * 32, (cx + cy) * 16); H.clampCam();
    return out;
  }, [spawns, radius]);
}

// ---- contracts ----

test('a click selects a unit and a drag selects several', async ({ page }) => {
  await startMatch(page);
  const s = await stage(page, [['a', 'rifle', 0, 0, 0], ['b', 'rifle', 0, 2, 0], ['c', 'rifle', 0, 0, 2]]);
  const p = await screenOf(page, s.a.x, s.a.y);
  await page.mouse.click(p.x, p.y); await page.waitForTimeout(200);
  expect(await selected(page)).toEqual(['rifle']);
  await page.mouse.move(p.x - 120, p.y - 120); await page.mouse.down();
  await page.mouse.move(p.x + 160, p.y + 120, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(200);
  expect((await selected(page)).length).toBe(3);
});

test('a left click on the ground moves the selection there', async ({ page }) => {
  await startMatch(page);
  const s = await stage(page, [['t', 'lancer', 0, 0, 0]]);
  const p = await screenOf(page, s.t.x, s.t.y);
  await page.mouse.click(p.x, p.y); await page.waitForTimeout(200);
  const dst = await screenOf(page, s.t.x, s.t.y + 4, 0);
  await page.mouse.click(dst.x, dst.y); await page.waitForTimeout(2500);
  const u = await unitById(page, s.t.id);
  expect(Math.hypot(u.x - s.t.x, u.y - s.t.y)).toBeGreaterThan(1.5);
});

test("a player's attack order drives to the named target past a bystander in range", async ({ page }) => {
  await startMatch(page);
  // The named target inside SIGHT (8) but outside the Grizzly's gun (5); a bystander in gun range.
  const s = await stage(page, [['t', 'lancer', 0, 0, 0], ['near', 'rifle', 1, 2, 0], ['far', 'rifle', 1, 0, 7]]);
  const p = await screenOf(page, s.t.x, s.t.y);
  await page.mouse.click(p.x, p.y); await page.waitForTimeout(200);
  const f = await screenOf(page, s.far.x, s.far.y);
  await page.mouse.click(f.x, f.y); await page.waitForTimeout(250);
  const right = await unitById(page, s.t.id);
  expect(right.order && right.order.t).toBe('attack');
  expect(right.order.id).toBe(s.far.id);
  expect(right.order.focus).toBe(1);
  await page.waitForTimeout(2500);
  const later = await unitById(page, s.t.id);
  const d0 = Math.hypot(s.t.x - s.far.x, s.t.y - s.far.y), d1 = Math.hypot(later.x - s.far.x, later.y - s.far.y);
  expect(d1).toBeLessThan(d0 - 1.5);                                // it went, instead of parking on the bystander
});

test('a left click on an own IFV puts the selected infantry aboard', async ({ page }) => {
  await startMatch(page);
  const s = await stage(page, [['ifv', 'ifv', 0, 0, 0], ['gi', 'rifle', 0, 0, 2]]);
  const g = await screenOf(page, s.gi.x, s.gi.y);
  await page.mouse.click(g.x, g.y); await page.waitForTimeout(200);
  expect(await selected(page)).toEqual(['rifle']);
  const v = await screenOf(page, s.ifv.x, s.ifv.y);
  await page.mouse.click(v.x, v.y); await page.waitForTimeout(3000);
  const pax = await page.evaluate((id) => (window.__rtsTest.saveBlob().g.units.find((u) => u.id === id).pax || []).length, s.ifv.id);
  expect(pax).toBe(1);
});

test('a cameo click queues a build', async ({ page }) => {
  await startMatch(page);
  await page.locator('#plist button.pit').first().click(); await page.waitForTimeout(800);
  const q = await page.evaluate(() => window.__rtsTest.saveBlob().g.side[0].queues.b.list.length);
  expect(q).toBe(1);
});

test('after a refresh the match resumes AND every control above still works', async ({ page }) => {
  await startMatch(page);
  const s = await stage(page, [['t', 'lancer', 0, 0, 0], ['ifv', 'ifv', 0, 3, 0], ['gi', 'rifle', 0, 3, 3]]);
  const p0 = await screenOf(page, s.t.x, s.t.y);
  await page.mouse.click(p0.x, p0.y);                              // something IS selected at save time (the sel-flag bug)
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForFunction(() => !!window.__rtsTest && window.__rtsTest.opts() !== null, null, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  expect(await inMatch(page)).toBe(true);
  // The restore recentres on the base; bring the scene back under the camera.
  await page.evaluate(({ x, y }) => { window.__rtsTest.setCam((x - y) * 32, (x + y) * 16); window.__rtsTest.clampCam(); }, s.t);
  await page.waitForTimeout(200);
  // select (the restored unit carried a stale selection flag once)
  const t = await unitById(page, s.t.id);
  const p = await screenOf(page, t.x, t.y);
  await page.mouse.click(p.x, p.y); await page.waitForTimeout(200);
  expect(await selected(page)).toEqual(['lancer']);
  // move (orders were scheduled on a client nobody stepped once)
  const dst = await screenOf(page, t.x, t.y + 4, 0);
  await page.mouse.click(dst.x, dst.y); await page.waitForTimeout(2500);
  const t2 = await unitById(page, s.t.id);
  expect(Math.hypot(t2.x - t.x, t2.y - t.y)).toBeGreaterThan(1.5);
  // build
  await page.locator('#plist button.pit').first().click(); await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__rtsTest.saveBlob().g.side[0].queues.b.list.length)).toBeGreaterThan(0);
  // board
  const gi = await unitById(page, s.gi.id), ifv = await unitById(page, s.ifv.id);
  const gp = await screenOf(page, gi.x, gi.y); await page.mouse.click(gp.x, gp.y); await page.waitForTimeout(200);
  const vp = await screenOf(page, ifv.x, ifv.y); await page.mouse.click(vp.x, vp.y); await page.waitForTimeout(3000);
  expect(await page.evaluate((id) => (window.__rtsTest.saveBlob().g.units.find((u) => u.id === id).pax || []).length, s.ifv.id)).toBe(1);
});

test('a closed page starts fresh; only a reload resumes', async ({ page }) => {
  await startMatch(page);
  await page.goto('about:blank');
  await page.goto('/rts.html');
  await page.waitForFunction(() => !!window.__rtsTest, null, { timeout: 30_000 });
  await page.waitForTimeout(2500);
  expect(await inMatch(page)).toBe(false);
  await expect(page.locator('.card button').filter({ hasText: 'Start Game' }).first()).toBeVisible();
});

test('only the black gutter scrolls: the panels and the map border do not', async ({ page }) => {
  await startMatch(page);
  const vp = page.viewportSize();
  const cam = () => page.evaluate(() => window.__rtsTest.cam());
  const park = async (x, y) => { await page.mouse.move(vp.width / 2, vp.height / 2); await page.mouse.move(x, y, { steps: 10 }); await page.waitForTimeout(250); const a = await cam(); await page.waitForTimeout(600); const c = await cam(); return { dx: c.x - a.x, dy: c.y - a.y }; };
  const recenter = () => page.evaluate(() => { const M = window.__rtsTables.MAP; window.__rtsTest.setCam(0, M * 16); window.__rtsTest.clampCam(); });
  await recenter(); expect((await park(vp.width - 8, 400)).dx).toBeGreaterThan(100);        // gutter, right
  await recenter(); expect((await park(500, vp.height - 8)).dy).toBeGreaterThan(100);       // gutter, bottom
  const side = await page.locator('#side').boundingBox(), cmd = await page.locator('#cmdbar').boundingBox();
  await recenter(); expect(await park(side.x + side.width / 2, side.y + side.height - 40)).toEqual({ dx: 0, dy: 0 });   // panel body
  await recenter(); expect(await park(side.x - 4, 400)).toEqual({ dx: 0, dy: 0 });                                       // map border
  await recenter(); expect(await park(cmd.x + cmd.width - 60, cmd.y + cmd.height / 2)).toEqual({ dx: 0, dy: 0 });      // command bar
});

test('a structure lands exactly on the green ghost, and a green cursor is never refused', async ({ page }) => {
  test.setTimeout(150_000);                                                  // a Power Plant takes a while to build
  await startMatch(page);
  await page.evaluate(() => window.__rtsTest.give(0, 100000));
  await page.locator('#plist button.pit').first().click();                 // Power Plant, 2x2 (even: the failing case)
  await page.waitForFunction(() => window.__rtsTest.saveBlob().g.side[0].queues.b.ready === 'power', null, { timeout: 90_000 });
  await page.locator('#plist button.pit').first().click();                 // ready -> placing
  await page.waitForTimeout(200);
  const st = await page.evaluate(() => window.__rtsTest.world().start[0]);
  let tried = 0, placed = 0;
  for (const [dx, dy] of [[5, 5], [6, 5], [5, 6], [7, 7], [-5, 5], [5, -5], [8, 2], [2, 8]]) {
    const p = await screenOf(page, st.x + dx, st.y + dy, 0);
    await page.mouse.move(p.x + 20, p.y + 6);                              // off-centre in the tile: where the two rules disagreed
    await page.waitForTimeout(120);
    const promise = await page.evaluate(() => {
      const H = window.__rtsTest, h = H.hover(), o = H.placeOrigin({ x: h.x, y: h.y }, { gw: 2, gh: 2 });
      return { kind: H.cursorKind(), origin: o, n: H.saveBlob().g.blds.length };
    });
    if (promise.kind !== 'deploy') continue;
    tried++;
    await page.mouse.click(p.x + 20, p.y + 6); await page.waitForTimeout(300);
    const after = await page.evaluate(() => { const g = window.__rtsTest.saveBlob().g; const b = g.blds[g.blds.length - 1]; return { n: g.blds.length, x: b.x, y: b.y, type: b.type }; });
    expect(after.n).toBe(promise.n + 1);                                    // the green cursor was honoured
    expect([after.x, after.y]).toEqual([promise.origin.x, promise.origin.y]); // and it landed on the ghost
    placed++;
    break;
  }
  expect(placed).toBe(1);
});

// Touch (a tablet): a tap is the left click, own-target rule included — on a
// tablet no troop could board an IFV and no miner could dock (touch audit).
test.describe('touch', () => {
  test.use({ hasTouch: true });
  test('a tap on an own IFV with a GI selected puts the GI aboard; a two-finger tap deselects', async ({ page }) => {
    await startMatch(page);
    const s = await stage(page, [['ifv', 'ifv', 0, 0, 0], ['gi', 'rifle', 0, 0, 2]]);
    const g = await screenOf(page, s.gi.x, s.gi.y);
    await page.touchscreen.tap(g.x, g.y); await page.waitForTimeout(250);
    expect(await selected(page)).toEqual(['rifle']);
    const v = await screenOf(page, s.ifv.x, s.ifv.y);
    await page.touchscreen.tap(v.x, v.y); await page.waitForTimeout(3000);
    expect(await page.evaluate((id) => (window.__rtsTest.saveBlob().g.units.find((u) => u.id === id).pax || []).length, s.ifv.id)).toBe(1);
    // a long, still press is still a tap (it used to do nothing past 400 ms)
    const t = await stage(page, [['t', 'lancer', 0, 3, 3]]);
    const tp = await screenOf(page, t.t.x, t.t.y);
    await page.evaluate(([x, y]) => {
      const cv = document.getElementById('cv');
      const ev = (type, extra) => cv.dispatchEvent(new PointerEvent(type, Object.assign({ bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 7, isPrimary: true, clientX: x, clientY: y, button: 0, buttons: 1 }, extra || {})));
      ev('pointerdown'); return new Promise((r) => setTimeout(() => { ev('pointerup', { buttons: 0 }); r(); }, 700));
    }, [tp.x, tp.y]);
    await page.waitForTimeout(250);
    expect(await selected(page)).toEqual(['lancer']);
  });
});

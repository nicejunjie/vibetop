// @ts-check
// Iron Frontier — the TWO-PLAYER path: two tabs of one browser joined by the
// lobby's BroadcastChannel, pressing the real buttons.
//
// Why (2026-09-11 two-player audit): the lockstep unit tests run two clients
// in one page over an in-memory bus and were green while a real match desynced
// after 2.5 minutes (a lazy sprite bake reseeded the SIM's RNG on first draw),
// a closed tab froze the survivor for ever, "Restart" turned a network match
// into a skirmish, and a pause stopped the other player's game behind a lag
// message. Everything here is what the two humans see.
//
// Desktop only. Against a live host:
//   VIBETOP_BASE_URL=http://127.0.0.1 npx playwright test tests/rts-mp.spec.js --project=desktop-chromium
// To check a working-tree rts.html BEFORE deploying it, point VIBETOP_RTS_HTML
// at the file: the page is served from disk at the same URL.
// RTS_MP_SOAK=1 adds a four-minute desync soak with orders from both seats.

const { test, expect } = require('@playwright/test');

const DESKTOP = 'desktop-chromium';
test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ context }, info) => {
  test.skip(info.project.name !== DESKTOP, `two-tab contract — ${DESKTOP} only`);
  if (process.env.VIBETOP_RTS_HTML) {
    await context.route('**/rts.html*', (r) => r.fulfill({ path: process.env.VIBETOP_RTS_HTML, contentType: 'text/html' }));
  }
});

async function openGame(context) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.errors = errors;
  await page.goto('/rts.html');
  await page.waitForFunction(() => !!window.__rtsTest, null, { timeout: 30_000 });
  await page.waitForTimeout(2500);                                  // the bake
  return page;
}
const mode = (page, label) => page.locator('#mpRow button').filter({ hasText: label }).first().click();
const card = (page) => page.evaluate(() => ({
  t: document.getElementById('ovT').textContent,
  p: document.getElementById('ovP').textContent,
  a: document.getElementById('ovA').textContent,
  shown: document.getElementById('ov').classList.contains('show'),
}));
const st = (page) => page.evaluate(() => {
  const g = window.__rtsTest.world(), c = window.__rtsNet.active();
  return { state: window.__rtsNet.state(), tick: g ? g.tick : -1, mp: !!(g && g.mp), ai: !!(g && g.ai),
           desync: c ? c.desync : null, me: window.__rtsNet.seat().me, stalled: window.__rtsNet.stalled() };
});
const hashOf = (page) => page.evaluate(() => window.__rtsTest.hash());
const started = (page) => page.evaluate(() => window.__rtsNet.mp().started);

// Host in one tab, Join in the other, the guest presses Join on the record card.
async function startMp(context) {
  const p1 = await openGame(context);
  await mode(p1, 'Host');
  await p1.locator('#ovA').click();
  const p2 = await openGame(context);
  await mode(p2, 'Join');
  await expect(p2.locator('#ovA')).toHaveText('Join match');
  await p2.locator('#ovA').click();
  await expect(p2.locator('#ovT')).toHaveText('Host found', { timeout: 10_000 });
  await p2.locator('#ovA').click();
  await p1.waitForFunction(() => window.__rtsNet.mp().started, null, { timeout: 10_000 });
  await p2.waitForFunction(() => window.__rtsNet.mp().started, null, { timeout: 10_000 });
  await p1.waitForTimeout(1500);
  return { p1, p2 };
}
// A click on open ground in the middle of the view, which resumes a pause.
const clickMap = (page) => page.mouse.click(400, 300);

test('the lobby: Join hides the host\'s choices, both see the record, the seats agree', async ({ context }) => {
  const p1 = await openGame(context);
  await mode(p1, 'Join');
  for (const id of ['#facRow', '#mapWrap', '#setWrap']) await expect(p1.locator(id)).toBeHidden();
  await expect(p1.locator('#mpNote')).toBeVisible();
  await expect(p1.locator('#ovA')).toHaveText('Join match');
  await mode(p1, 'Host');
  for (const id of ['#facRow', '#mapWrap', '#setWrap']) await expect(p1.locator(id)).toBeVisible();
  await expect(p1.locator('#ovA')).toHaveText('Start Game');
  await p1.locator('#ovA').click();
  const host = await card(p1);
  expect(host.p).toMatch(/you play (Directorate|Collective) against/);
  const p2 = await openGame(context);
  await mode(p2, 'Join');
  await p2.locator('#ovA').click();
  await expect(p2.locator('#ovT')).toHaveText('Host found', { timeout: 10_000 });
  const guest = await card(p2);
  expect(guest.p).toMatch(/you play (Directorate|Collective) against/);
  expect(guest.a).toBe('Join');
  await p2.locator('#ovA').click();
  await p1.waitForFunction(() => window.__rtsNet.mp().started, null, { timeout: 10_000 });
  await p1.waitForTimeout(3000);
  const a = await st(p1), b = await st(p2);
  expect([a.me, b.me]).toEqual([0, 1]);
  expect(a.mp && b.mp).toBe(true);
  expect(a.ai || b.ai).toBe(false);
  expect(a.desync).toBeNull(); expect(b.desync).toBeNull();
  expect(p1.errors).toEqual([]); expect(p2.errors).toEqual([]);
});

test('Options and Help in a two-player match: no Restart, no Save/Load, speed locked, nobody paused', async ({ context }) => {
  const { p1, p2 } = await startMp(context);
  await p1.locator('#optBtn').click();
  await expect(p1.locator('#gameRow')).toBeHidden();
  await expect(p1.locator('#slotList button')).toHaveCount(0);
  await expect(p1.locator('#slotList')).toContainText('not available in a two-player match');
  await expect(p1.locator('#gspdSl')).toBeDisabled();
  expect((await st(p1)).state).toBe('play');
  const t0 = (await st(p2)).tick;
  await p2.waitForTimeout(1500);
  expect((await st(p2)).tick).toBeGreaterThan(t0 + 30);              // the peer kept playing
  await p1.locator('#ovA').click();                                   // back to the match
  await p1.locator('#helpBtn').click();
  expect((await st(p1)).state).toBe('play');
  expect((await st(p2)).state).toBe('play');
  await p1.locator('#hvClose').click();
});

test('a pause is shared and named; either tab resumes both; a stalled peer shows a banner, not silence', async ({ context }) => {
  const { p1, p2 } = await startMp(context);
  await p1.keyboard.press('p');
  await expect(p2.locator('#paused')).toBeVisible({ timeout: 3000 });
  await expect(p2.locator('#paused b')).toHaveText('Paused by the other player');
  await expect(p1.locator('#paused span')).toContainText('other player is waiting');
  expect((await st(p1)).state).toBe('paused'); expect((await st(p2)).state).toBe('paused');
  await clickMap(p2);                                                 // the OTHER side resumes
  await expect(p1.locator('#paused')).toBeHidden({ timeout: 3000 });
  expect((await st(p1)).state).toBe('play'); expect((await st(p2)).state).toBe('play');
  // The barrier: stop p2 stepping without telling p1 (a remote-style pause
  // is not echoed), and p1 must say so within a second, persistently.
  await p2.evaluate(() => window.__rtsNet.pause(true, true));
  await expect(p1.locator('#stall')).toBeVisible({ timeout: 4000 });
  await p1.waitForTimeout(2500);
  await expect(p1.locator('#stall')).toBeVisible();
  await p2.evaluate(() => window.__rtsNet.pause(false, true));
  await expect(p1.locator('#stall')).toBeHidden({ timeout: 4000 });
});

test('the peer closes its tab: the survivor wins by default instead of waiting for ever', async ({ context }) => {
  const { p1, p2 } = await startMp(context);
  await p2.close();
  await expect(p1.locator('#ovT')).toHaveText('Victory', { timeout: 5000 });
  await expect(p1.locator('#ovP')).toContainText('left the match');
  expect((await st(p1)).state).toBe('over');
  expect(p1.errors).toEqual([]);
});

test('a third tab pressing Host during a match is told the browser is busy', async ({ context }) => {
  const { p1 } = await startMp(context);
  const p3 = await openGame(context);
  await mode(p3, 'Host');
  await p3.locator('#ovA').click();
  await expect(p3.locator('#ovP')).toContainText('already under way', { timeout: 5000 });
  expect((await st(p1)).state).toBe('play');
});

test('four minutes of orders from both seats: no desync, and no render state on the units', async ({ context }) => {
  test.skip(!process.env.RTS_MP_SOAK, 'RTS_MP_SOAK=1 to run the four-minute soak');
  test.setTimeout(6 * 60_000);
  const { p1, p2 } = await startMp(context);
  const play = (page) => page.evaluate(() => {
    const g = window.__rtsTest.world(), me = window.__rtsNet.seat().me;
    const mine = g.units.filter((u) => !u.dead && u.p === me && !u.air).slice(0, 5).map((u) => u.id);
    const M = window.__rtsTables.MAP;
    if (mine.length) window.__rtsNet.emit('move', { u: mine, x: 8 + Math.floor(Math.random() * (M - 16)), y: 8 + Math.floor(Math.random() * (M - 16)), queue: 0, ore: 0 });
    window.__rtsNet.emit('queue', { k: 'power', lane: 'b' });
  });
  for (let i = 0; i < 48; i++) {
    await play(p1); await play(p2);
    await p1.waitForTimeout(5000);
    const a = await st(p1), b = await st(p2);
    expect(a.desync, `p1 desync at round ${i}`).toBeNull();
    expect(b.desync, `p2 desync at round ${i}`).toBeNull();
  }
  expect(await hashOf(p1)).toBe(await hashOf(p2));
  const leaked = await p1.evaluate(() => window.__rtsTest.world().units.some((u) => 'trkAt' in u));
  expect(leaked).toBe(false);
  expect(p1.errors).toEqual([]); expect(p2.errors).toEqual([]);
});

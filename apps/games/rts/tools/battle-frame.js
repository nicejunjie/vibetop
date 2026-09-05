#!/usr/bin/env node
/**
 * battle-frame.js — stage a fight and photograph it.
 *
 * Every other tool in this directory measures art AT REST: unit-compare.js
 * puts a cameo beside a sprite beside RA2's plate, art-metrics.js bakes eight
 * bearings of an idle unit, legibility.js compares those bakes. None of them
 * can see the art a player actually spends the match looking at — muzzle
 * flashes, tracers, impacts, the fires on a damaged hull, wrecks, health bars,
 * the whole thing composited over terrain at play zoom.
 *
 * `apps/games/rts/docs/playtest.md` opens by saying exactly this: "Code audits and
 * sprite sheets do not find what a player finds in minute twelve of a real
 * match." This is the smallest tool that closes that gap for ART — a set-piece
 * you can stage in one command and LOOK at.
 *
 *   node apps/games/rts/tools/battle-frame.js
 *   node apps/games/rts/tools/battle-frame.js --shots 6 --zoom 1.4
 *
 * Writes apps/games/rts/art/out/battle-N.png and prints any page error. It uses
 * the SIM API (`__rtsTest.spawn` / `orderAttack`) to place the fixture, which
 * playtest.md permits for staging — it is human-style INPUT that must go
 * through the real mouse and keyboard, not fixture setup.
 *
 * Two traps it already accounts for:
 *   * `begin()` must run first, and the menu classes must come off, or `spawn`
 *     silently returns null and you photograph an empty map (`G` is null until
 *     a match exists).
 *   * with no structures on either side the win condition fires within a few
 *     seconds and every later frame is the victory dialog, so the fixture
 *     gives BOTH sides a building purely to keep the match alive.
 */
const path = require('path'), fs = require('fs'), http = require('http');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const RTS = path.resolve(__dirname, '..');
const OUT = path.join(RTS, 'art', 'out');

function playwright() {
  try { return require('playwright'); }
  catch (e) { return require(path.join(ROOT, 'tests', 'e2e', 'node_modules', 'playwright')); }
}
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const SHOTS = Number(arg('--shots', 4)), ZOOM = Number(arg('--zoom', 1));

// The two sides of the set-piece. Deliberately mixed: tracked, wheeled and
// foot on both sides, so one frame carries most of the combat vocabulary.
const BLUE = ['lancer', 'rhino', 'mammoth', 'rifle', 'rifle', 'teslatrooper'];
const RED  = ['rhino', 'mirage', 'flaktrack', 'conscript', 'conscript', 'desolator'];

(async () => {
  const srv = http.createServer((rq, rp) => {
    let f = rq.url.split('?')[0]; if (f === '/') f = '/rts.html';
    const cands = [path.join(RTS, f), path.join(ROOT, f), path.join(ROOT, 'shared', f)];
    const hit = cands.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
    if (!hit) { rp.writeHead(404); return rp.end(); }
    rp.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : 'text/html' });
    rp.end(fs.readFileSync(hit));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const { chromium } = playwright();
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
  const errs = [];
  pg.on('pageerror', (e) => errs.push(String(e)));
  pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto(`http://127.0.0.1:${port}/rts.html#nomob`, { waitUntil: 'load' });
  await pg.waitForFunction(() => window.__rtsTest && window.__rtsTest.derived, null, { timeout: 30000 });

  const staged = await pg.evaluate(({ BLUE, RED, ZOOM }) => {
    const T = window.__rtsTest;
    document.querySelectorAll('.show').forEach((e) => e.classList.remove('show'));
    document.body.classList.remove('atmenu');
    T.begin(7, 'normal', null, false, true);          // 5th arg: renderer ON
    // Keep the match ALIVE: with no structures the victory check fires in
    // about three seconds and every frame after the first is a dialog.
    T.build('power', 0, 34, 40); T.build('power', 1, 62, 40);
    const mk = (list, p, x0) => list.map((t, i) =>
      T.spawn(t, p, x0 + (i % 3) * 3, 44 + Math.floor(i / 3) * 3)).filter(Boolean);
    const blue = mk(BLUE, 0, 42), red = mk(RED, 1, 52);
    T.centerOn(49, 46); T.zoom(ZOOM);
    for (const u of blue) T.orderAttack([u], red[0]);
    for (const u of red) T.orderAttack([u], blue[0]);
    return { blue: blue.length, red: red.length };
  }, { BLUE, RED, ZOOM });

  fs.mkdirSync(OUT, { recursive: true });
  const written = [];
  for (let s = 0; s < SHOTS; s++) {
    await pg.waitForTimeout(1200);
    await pg.evaluate(() => window.__rtsTest.render && window.__rtsTest.render());
    const el = await pg.$('canvas');
    const f = path.join(OUT, `battle-${s}.png`);
    await el.screenshot({ path: f });
    written.push(path.relative(ROOT, f));
  }
  console.log(`staged ${staged.blue} v ${staged.red} at zoom ${ZOOM}`);
  console.log(written.map((f) => '  ' + f).join('\n'));
  console.log(errs.length ? 'PAGE ERRORS:\n  ' + errs.slice(0, 6).join('\n  ') : 'page errors: NONE');
  console.log('\n  Now LOOK at them. Numbers cannot tell you a muzzle flash is at the breech.');
  if (errs.length) process.exitCode = 1;
  await b.close(); srv.close();
})();

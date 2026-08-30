// @ts-check
// An automated player, for tests/e2e/tests/mario.spec.js.
//
// It reads the level's tile grid and the live entity list and plays a world
// start-to-flag by stepping the PHYSICS directly — no rendering, no waiting on
// animation frames — so five levels take about ninety seconds instead of ten
// minutes. It runs permanently starred, because enemies are a skill question
// and geometry is a correctness question: a run that ends early means the
// level cannot be traversed, not that the bot is bad at Mario. Pits and lava
// still kill it, and those ARE geometry failures.
//
// It exists because world 1-2 shipped with two seven-tile pillars rising off
// the floor — unfinishable — and every static check I had passed it. The
// foothold audit only compared columns more than one apart, and the
// "whole game can be finished" test teleports to each flag.

const BOT = function (arg) {
  const levelIdx = arg.levelIdx, seed = arg.seed;
  const T = window.__crBuild(levelIdx);
  const SOLID = new Set(T.T.SOLID);
  const at = (x, y) => (x < 0 || x >= T.w || y < 0 || y >= T.h) ? 0 : window.__crTest.tile(x, y);
  const solid = (x, y) => SOLID.has(at(x, y));
  const stand = (x, y) => solid(x, y) || at(x, y) === T.T.PLAT;

  let rng = seed || 1;
  const rand = () => (rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  const water = T.theme === 'water';
  let best = 0, bestAt = 0, stuckAt = null, deaths = 0, jumpHold = 0, waitFrames = 0;
  let dying = false; const deathAt = [];
  const MAX = 60 * 240;                       // four minutes of game time

  for (let i = 0; i < MAX; i++) {
    const s = window.__cr();
    if (s.state === 'clear' || s.state === 'clearing' || s.state === 'cleared') {
      return { ok: true, reachedX: s.px / 16, flagX: T.flagX, deaths, deathAt, steps: i };
    }
    if (s.state !== 'play') {                 // dying / intro: just let it run
      if (s.state === 'dead' && !dying) { deaths++; deathAt.push(Math.round(s.px / 16)); }
      if (s.state === 'intro' && dying) { best = 0; bestAt = i; }   // fresh life
      dying = s.state === 'dead';
      window.__crTest.input({});
      window.__crTest.step(1);
      continue;
    }
    const fx = Math.floor(s.px / 16), fy = Math.floor((s.py + (s.big ? 30 : 15) - 2) / 16);
    if (s.px > best) { best = s.px; bestAt = i; }
    if (i - bestAt > 60 * 12) {               // twelve seconds with no progress
      stuckAt = { x: best / 16, y: fy, state: s.state, big: s.big };
      break;
    }

    if (i % 240 === 0) window.__crTest.give('star');
    const inp = { right: true, run: true };

    if (water) {
      // Align to an open channel BEFORE swimming into it. Scanning only two
      // columns ahead let it nose straight into the stalactite one column
      // ahead and sit there.
      const myRow = Math.floor((s.py + 8) / 16);
      const clear = (x, y) => !solid(x, y) && !solid(x, y + 1);
      let want = -1, bestD = 99;
      for (let y = 2; y < T.h - 2; y++) {
        if (!clear(fx + 1, y) || !clear(fx + 2, y)) continue;
        const d = Math.abs(y - myRow);
        if (d < bestD) { bestD = d; want = y; }
      }
      if (want < 0) want = myRow;
      const rise = myRow > want || s.py > (T.h - 4) * 16;
      inp.jump = rise && (i % 10 < 2);
      inp.right = Math.abs(myRow - want) <= 1;      // line up, then go
    } else {
      const speed = Math.abs(s.vx);
      // A WALL is solid AT FOOT LEVEL and continues upward. A block floating
      // three tiles overhead is scenery, not an obstacle — treating it as one
      // made the bot jump at nothing and land on enemies while still rising.
      let wall = 0, wallD = 99;
      const reach = 2 + Math.ceil(speed);
      for (let d = 1; d <= reach; d++) {
        if (!solid(fx + d, fy)) continue;
        let h = 1;
        while (h < 6 && solid(fx + d, fy - h)) h++;
        wall = h; wallD = d;
        break;
      }
      // a gap: no floor within four rows for this column
      let gap = 0;
      for (let d = 1; d <= 4; d++) {
        let has = false;
        for (let down = 1; down <= 4; down++) if (stand(fx + d, fy + down)) has = true;
        if (!has) { gap = d; break; }
      }
      // the nearest thing ahead that can hurt us
      let foeD = 999;
      for (const e of window.__crTest.ents()) {
        if (e.gone) continue;
        if (['goomba', 'koopa', 'koopaRed', 'para', 'bill', 'piranha', 'podoboo',
             'cheep', 'blooper'].indexOf(e.type) < 0) continue;
        const dx = e.x - s.px, dy = Math.abs(e.y - s.py);
        if (dx > 0 && dy < 44 && dx < foeD) foeD = dx;
      }

      if (wall >= 3 && wallD <= 2) inp.run = false;    // do not slam into it

      if (s.onGround) {
        if (wall > 0 && wallD <= Math.max(2, Math.ceil(speed) + 1)) {
          jumpHold = wall >= 4 ? 28 : wall >= 2 ? 20 : 12;
        } else if (gap && gap <= 2) {
          jumpHold = 28;
        } else if (foeD > 18 && foeD < 46) {
          jumpHold = 14;                                // hop onto it
        }
      }
      if (jumpHold > 0) { inp.jump = true; jumpHold--; }
      if (!s.onGround && s.vy < 0 && wall > 0 && wallD <= 2) inp.jump = true;

      // wedged: back off and take a run-up
      if (i - bestAt > 100 && s.onGround) {
        if (waitFrames <= 0) waitFrames = 30 + Math.floor(rand() * 30);
        inp.right = false; inp.left = true; inp.jump = false; inp.run = false;
        waitFrames--;
        if (waitFrames <= 0) jumpHold = 28;
      }
    }
    window.__crTest.input(inp);
    window.__crTest.step(1);
  }
  const s = window.__cr();
  return { ok: false, reachedX: best / 16, flagX: T.flagX, deaths, deathAt,
           stuck: stuckAt, state: s.state };
};

module.exports = { BOT };

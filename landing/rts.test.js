// Iron Frontier (landing/rts.html) — logic, content and balance audit.
//
// A canvas RTS cannot be checked from the DOM, and "it boots and nothing
// throws" is coverage of the renderer, not of the game. So this suite loads
// the real page script into a vm with a minimal DOM stub and then drives the
// simulation directly through the hooks the page exposes (__rtsTest,
// __rtsSim, __rtsTables).
//
// The content audits below exist because this repo has shipped a level that
// could not be finished and a field that was read before it was assigned:
// when correctness is a property of DATA, the test has to read the data and
// do the arithmetic.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = path.join(__dirname, "rts.html");

// ---- the smallest DOM that lets the page boot -------------------------- //
function stubCtx() {
  const noop = () => {};
  return {
    fillStyle: "", strokeStyle: "", lineWidth: 1, font: "", textAlign: "left",
    globalAlpha: 1, globalCompositeOperation: "source-over",
    fillRect: noop, strokeRect: noop, clearRect: noop, fillText: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    fill: noop, stroke: noop, arc: noop, ellipse: noop, roundRect: noop, clip: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop, arcTo: noop, rect: noop,
    save: noop, restore: noop, scale: noop, translate: noop, setTransform: noop,
    drawImage: noop, putImageData: noop,
    getImageData: () => ({ data: [] }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createLinearGradient: () => ({ addColorStop: noop }),
    measureText: () => ({ width: 10 }),
  };
}
function stubEl() {
  const el = {
    style: {}, dataset: {}, textContent: "", innerHTML: "", className: "",
    width: 800, height: 600, _terr: null,
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    addEventListener: () => {}, removeEventListener: () => {},
    appendChild: () => {}, removeChild: () => {}, setAttribute: () => {},
    getAttribute: () => "b", setPointerCapture: () => {},
    getContext: () => stubCtx(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  };
  el.querySelector = () => stubEl();
  el.querySelectorAll = () => [];
  return el;
}

function load() {
  const html = fs.readFileSync(SRC, "utf8");
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(blocks.length, 1, "expected exactly one inline script block");

  const store = {};
  const win = {
    devicePixelRatio: 1,
    addEventListener: () => {}, removeEventListener: () => {},
    requestAnimationFrame: () => 0,          // never start the render loop
    performance: { now: () => 0 },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    setTimeout: () => 0,
    Math, JSON, Date, isNaN, parseInt, parseFloat,
    Float32Array, Int32Array, Uint8Array,
  };
  const doc = {
    getElementById: () => stubEl(),
    createElement: () => stubEl(),
    querySelector: () => stubEl(),
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  win.window = win;
  win.document = doc;
  win.globalThis = win;
  vm.createContext(win);
  vm.runInContext(blocks[0], win, { filename: "rts.html" });
  return win;
}

const W = load();
const T = W.__rtsTables;
const API = W.__rtsTest.api;

// ---------------------------------------------------------------- content //

test("every unit and structure declares the fields the sim reads", () => {
  // An object literal IS the type declaration in a codebase without types:
  // a field some path reads but the literal never sets reads as undefined,
  // and `undefined <= 0` is false — a branch that can never run.
  const unitFields = ["name", "em", "cost", "build", "cls", "hp", "spd", "sight",
    "armour", "dmg", "rate", "rng", "splash", "wh", "cap", "mine", "w", "h", "desc"];
  for (const [k, u] of Object.entries(T.UNITS)) {
    for (const f of unitFields) {
      assert.ok(f in u, `UNITS.${k} is missing "${f}"`);
    }
    assert.ok(u.cost > 0 && u.hp > 0 && u.spd > 0, `UNITS.${k} has a nonsense stat`);
  }
  const bldFields = ["name", "em", "cost", "build", "gw", "gh", "hp", "power", "sight", "makes", "desc", "armour"];
  for (const [k, b] of Object.entries(T.BLDS)) {
    for (const f of bldFields) {
      assert.ok(f in b, `BLDS.${k} is missing "${f}"`);
    }
    assert.ok(b.gw > 0 && b.gh > 0 && b.hp > 0, `BLDS.${k} has a nonsense footprint`);
  }
});

test("the counter triangle closes — nothing is unanswerable", () => {
  // RA2 model: damage * VERSES[warhead][armour]. Every warhead a shooter uses
  // must exist in the table, every armour class on the field must have a
  // weapon that hits it at full strength (structures: 65%+, RA2 deliberately
  // makes buildings tough), and no unit may be the best answer to everything.
  const armed = Object.entries(T.UNITS).filter(([, u]) => u.dmg > 0);
  assert.ok(armed.length >= 3, "need a real roster to have counters at all");
  const group = (cls) => ["none", "flak", "plate"].includes(cls) ? "inf" : ["light", "medium", "heavy"].includes(cls) ? "veh" : "bld";
  const best = (u, cls) => Math.max(T.verses(u.wh, cls), u.w2 && u.w2.use === group(cls) ? T.verses(u.w2.wh, cls) : 0);
  for (const [name, u] of armed) {
    assert.ok(u.wh && T.VERSES[u.wh], `${name} deals damage but its warhead ${u.wh} is not in VERSES`);
    if (u.w2) assert.ok(T.VERSES[u.w2.wh], `${name}.w2 warhead ${u.w2.wh} is not in VERSES`);
    assert.ok(T.ARMOURS.includes(u.armour), `${name} has a non-RA2 armour class ${u.armour}`);
  }
  for (const [name, b] of Object.entries(T.BLDS)) {
    assert.ok(T.ARMOURS.includes(b.armour), `${name} has a non-RA2 armour class ${b.armour}`);
    if (b.dmg > 0) assert.ok(T.VERSES[b.wh], `${name} fires an unknown warhead ${b.wh}`);
  }
  const onField = new Set([...Object.values(T.UNITS).map((u) => u.armour), ...Object.values(T.BLDS).map((b) => b.armour)]);
  for (const cls of onField) {
    const need = ["wood", "steel", "concrete"].includes(cls) ? 0.65 : 1.0;
    const counters = armed.filter(([, u]) => best(u, cls) >= need);
    assert.ok(counters.length > 0, `nothing counters armour class "${cls}"`);
  }
  for (const [name, u] of armed) {
    const bestAtAll = ["none", "heavy"].every(
      (cls) => armed.every(([n2, u2]) => n2 === name || best(u, cls) >= best(u2, cls))
    );
    assert.ok(!bestAtAll, `${name} is the best answer to everything — no counter play`);
  }
});

test("both factions are complete and genuinely different", () => {
  const F = W.__rtsTables.FACTIONS;
  assert.ok(F && F.dir && F.col, "two factions must exist");

  for (const [key, f] of Object.entries(F)) {
    // Each side must be able to field a full game on its own.
    assert.ok(T.UNITS[f.inf], `${key} names a missing infantry unit`);
    assert.ok(T.UNITS[f.tank], `${key} names a missing tank`);
    assert.ok(T.BLDS[f.defence], `${key} names a missing defence`);
    assert.equal(T.UNITS[f.inf].fac, key, `${key}'s infantry must belong to it`);
    assert.equal(T.UNITS[f.tank].fac, key, `${key}'s tank must belong to it`);
    assert.equal(T.BLDS[f.defence].fac, key, `${key}'s defence must belong to it`);

    const units = Object.entries(T.UNITS).filter(([, u]) => !u.fac || u.fac === key);
    const blds = Object.entries(T.BLDS).filter(([, b]) => !b.fac || b.fac === key);
    assert.ok(units.some(([, u]) => u.cap > 0), `${key} has no harvester`);
    assert.ok(units.some(([, u]) => u.cls === "i" && u.dmg > 0), `${key} has no infantry`);
    assert.ok(units.some(([, u]) => u.cls === "v" && u.dmg > 0), `${key} has no combat vehicle`);
    for (const need of ["base", "power", "refinery", "barracks", "factory"]) {
      assert.ok(blds.some(([k]) => k === need), `${key} cannot build a ${need}`);
    }
    // Every armour class must still have an answer WITHIN this faction —
    // an asymmetry that leaves one side unable to deal with vehicles is a
    // broken matchup, not flavour.
    for (const cls of ["none", "heavy"]) {
      assert.ok(units.some(([, u]) => u.dmg > 0 && (T.verses(u.wh, cls) >= 1.0 || (u.w2 && T.verses(u.w2.wh, cls) >= 1.0))),
        `${key} has nothing that counters ${cls}`);
    }
  }

  // They must actually differ, or the choice is cosmetic.
  const dirOnly = Object.values(T.UNITS).filter((u) => u.fac === "dir").length;
  const colOnly = Object.values(T.UNITS).filter((u) => u.fac === "col").length;
  assert.ok(dirOnly >= 2 && colOnly >= 2, "each side needs its own units");
  assert.notEqual(F.dir.defence, F.col.defence, "the defences must differ");

  // The RA2 identities should be visible in the numbers: the Grizzly is the
  // fast cheap tank, the Rhino the tougher harder-hitting one (rules.ini).
  const lancer = T.UNITS[F.dir.tank], mammoth = T.UNITS[F.col.tank];
  assert.ok(lancer.spd > mammoth.spd, "the Directorate tank should be faster");
  assert.ok(lancer.cost < mammoth.cost, "the Directorate tank should be cheaper");
  assert.ok(mammoth.hp > lancer.hp, "the Collective tank should be tougher");
  assert.ok(mammoth.dmg > lancer.dmg, "the Collective tank should hit harder");
  assert.ok(T.UNITS[F.col.inf].cost < T.UNITS[F.dir.inf].cost,
    "Collective infantry should be the cheaper body");
});

test("difficulty tiers are ordered, and none of them cheat", () => {
  const { easy, normal, hard } = T.DIFF;
  assert.ok(easy.react > normal.react && normal.react > hard.react,
    "harder AI must react faster");
  assert.ok(hard.expand >= normal.expand && normal.expand >= easy.expand,
    "harder AI must expand at least as much");
  assert.equal(easy.focus, false, "easy must not focus-fire");
  assert.equal(hard.harass, true, "hard should harass");
  assert.ok(easy.opening > normal.opening && normal.opening > hard.opening,
    "an easier AI must give the player more time before the first wave");
  // The cheat check: no difficulty may carry an income or vision multiplier.
  for (const [name, cfg] of Object.entries(T.DIFF)) {
    for (const k of Object.keys(cfg)) {
      assert.ok(!/credit|income|money|vision|sight|reveal/i.test(k),
        `difficulty "${name}" carries a cheat knob: ${k}`);
    }
  }
});

// ------------------------------------------------------------------- map //

function freshMap(seed) {
  const g = API.newState(seed, "normal");
  return g;
}

// Flood fill over passable tiles (rock blocks, ore does not).
function reachable(g, sx, sy) {
  const N = T.MAP;
  const seen = new Uint8Array(N * N);
  const q = [[sx, sy]];
  seen[sy * N + sx] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const i = ny * N + nx;
      if (seen[i] || g.terrain[i] === 1) continue;   // 1 = T_ROCK
      seen[i] = 1;
      q.push([nx, ny]);
    }
  }
  return seen;
}

test("every generated map is playable from both starts", () => {
  // The lesson from the unfinishable Mario level: a map is data, and data has
  // no assertions. Walk it and do the arithmetic.
  for (const seed of [1, 2, 7, 42, 1337, 99991, 2 ** 31 - 1]) {
    const g = freshMap(seed);
    const N = T.MAP;
    const [a, b] = g.start;

    const fromA = reachable(g, a.x, a.y);
    assert.equal(fromA[b.y * N + b.x], 1,
      `seed ${seed}: the two starts cannot reach each other — the match cannot be decided`);

    // Each start must be able to reach ore, or it has no economy at all.
    for (const s of g.start) {
      const seen = reachable(g, s.x, s.y);
      let ore = 0;
      for (let i = 0; i < N * N; i++) if (g.terrain[i] === 2 && seen[i]) ore += g.ore[i];
      assert.ok(ore > 3000,
        `seed ${seed}: start ${s.x},${s.y} can only reach ${Math.round(ore)} ore`);
    }

    // A yard needs clear ground at the start tile.
    for (const s of g.start) {
      for (let y = s.y - 1; y <= s.y + 1; y++) {
        for (let x = s.x - 1; x <= s.x + 1; x++) {
          assert.equal(g.terrain[y * N + x], 0,
            `seed ${seed}: the build pad at ${s.x},${s.y} is not clear`);
        }
      }
    }
  }
});

test("the map is fair — both halves carry the same ore", () => {
  for (const seed of [3, 11, 500, 60013]) {
    const g = freshMap(seed);
    const N = T.MAP;
    // The generator mirrors by 180° rotation; ore at (x,y) must match
    // (N-1-x, N-1-y), so neither start opens richer than the other.
    let near0 = 0, near1 = 0;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const amt = g.ore[y * N + x];
        if (!amt) continue;
        const d0 = Math.hypot(x - g.start[0].x, y - g.start[0].y);
        const d1 = Math.hypot(x - g.start[1].x, y - g.start[1].y);
        if (d0 < 20) near0 += amt;
        if (d1 < 20) near1 += amt;
      }
    }
    const skew = Math.abs(near0 - near1) / Math.max(near0, near1);
    assert.ok(skew < 0.02,
      `seed ${seed}: one start opens with ${(skew * 100).toFixed(1)}% more ore`);
  }
});

// ------------------------------------------------------------- pathfinding //

test("pathfinding reaches, routes around rock, and fails honestly", () => {
  const g = freshMap(4242);
  const N = T.MAP;

  const p = API.astar(g, 5, 5, 20, 20);
  assert.ok(Array.isArray(p) && p.length > 0, "no path across open ground");
  const last = p[p.length - 1];
  assert.deepEqual([last.x, last.y], [20, 20], "path does not end at the goal");
  // Steps must be adjacent — a path that teleports is not a path.
  let prev = { x: 5, y: 5 };
  for (const step of p) {
    assert.ok(Math.abs(step.x - prev.x) <= 1 && Math.abs(step.y - prev.y) <= 1,
      "path jumps more than one tile");
    assert.notEqual(g.terrain[step.y * N + step.x], 1, "path crosses rock");
    prev = step;
  }

  // Walled-off goal: must return null rather than wander forever.
  const g2 = freshMap(5);
  for (let y = 30; y <= 36; y++) {
    for (let x = 30; x <= 36; x++) {
      const edge = y === 30 || y === 36 || x === 30 || x === 36;
      if (edge) g2.terrain[y * N + x] = 1;
    }
  }
  assert.equal(API.astar(g2, 5, 5, 33, 33), null,
    "a sealed goal must report failure, not a bogus path");
});

// --------------------------------------------------------------- economy //

test("a harvester actually converts ore into credits", () => {
  // Drive the real loop: park a refinery next to ore, give it one harvester,
  // and let it run. This is the whole economy in one assertion — if it fails,
  // no amount of AI tuning matters.
  const H = W.__rtsTest;
  const g = H.begin(777, "normal");
  const start = g.start[0];

  const ore = H.findOre(start.x, start.y);
  assert.ok(ore, "no ore within reach of the start — map generation is broken");

  // Refinery adjacent to the patch, on ground the placer accepts.
  let ref = null;
  for (let r = 2; r < 10 && !ref; r++) {
    for (let oy = -r; oy <= r && !ref; oy++) {
      for (let ox = -r; ox <= r && !ref; ox++) {
        const bx = ore.x + ox, by = ore.y + oy;
        if (bx < 1 || by < 1 || bx > T.MAP - 4 || by > T.MAP - 4) continue;
        let clear = true;
        for (let y = by; y < by + 2 && clear; y++) {
          for (let x = bx; x < bx + 3; x++) {
            if (g.terrain[y * T.MAP + x] !== 0) { clear = false; break; }
          }
        }
        if (clear) ref = H.build("refinery", 0, bx, by);
      }
    }
  }
  assert.ok(ref, "could not seat a refinery near the ore");

  const before = H.credits(0);
  const oreBefore = H.ore(ore.x, ore.y);
  const h = H.spawn("harvester", 0, ref.x, ref.y + 3);
  assert.ok(h, "harvester did not spawn");

  H.step(60 * 90);                              // 90 seconds

  assert.ok(H.ore(ore.x, ore.y) < oreBefore,
    "the ore patch was never touched — the harvester never mined");
  assert.ok(H.credits(0) > before,
    `90s with a harvester and a refinery earned nothing (${before} -> ${H.credits(0)})`);
});

// ---------------------------------------------------- determinism + balance //

test("extra production buildings always speed up what they make", () => {
  // The discount matches RA2's MultipleFactory=0.8, cumulative, capped at six.
  // The BEHAVIOUR deliberately does not match RA2, whose real implementation
  // makes a *second* factory slower at these values — every extra building
  // here must strictly help, or the whole reason to build one is gone.
  const H = W.__rtsTest;
  const g = H.begin(31337, "normal");
  const s = g.start[0];

  function place(type) {
    for (let r = 3; r < 16; r++) {
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          if (H.api.canPlace(g, 0, type, s.x + ox, s.y + oy)) {
            H.build(type, 0, s.x + ox, s.y + oy);
            return true;
          }
        }
      }
    }
    return false;
  }

  H.build("base", 0, s.x - 1, s.y - 1);
  const seen = [];
  for (let n = 1; n <= 8; n++) {
    if (!place("factory")) break;
    seen.push(H.buildFactor(0, "v"));
  }
  assert.ok(seen.length >= 7, `needed room for 7 factories, placed ${seen.length}`);

  assert.equal(seen[0], 1, "one factory is the baseline");
  for (let i = 1; i < 6; i++) {
    assert.ok(seen[i] < seen[i - 1],
      `factory ${i + 1} must be faster than ${i} (${seen[i]} vs ${seen[i - 1]})`);
  }
  // RA2's numbers, to two decimals.
  assert.ok(Math.abs(seen[1] - 0.8) < 0.001, `two factories should be 0.80, got ${seen[1]}`);
  assert.ok(Math.abs(seen[2] - 0.64) < 0.001, `three should be 0.64, got ${seen[2]}`);
  assert.ok(Math.abs(seen[5] - 0.32768) < 0.001, `six should be 0.328, got ${seen[5]}`);
  // capped at six, like the original
  assert.equal(seen[6], seen[5], "the seventh factory adds nothing (cap of six)");

  // and the barracks lane is independent of the factory lane
  assert.equal(H.buildFactor(0, "i"), 1, "factories must not speed up infantry");
});

// Every test below this point runs a full headless AI-vs-AI match via
// __rtsSim — that's real per-tick simulation cost (pathfinding, AI planning,
// combat) multiplied by however many seeds a test plays, and it is what
// blew the suite's runtime past four minutes. They stay real (not deleted,
// not weakened) but move to an opt-in tier so `./run-tests.sh` and the
// pre-commit hook — which must stay fast on every commit — don't pay for
// them; run them explicitly with RTS_SLOW=1.
const slow = { skip: !process.env.RTS_SLOW && "set RTS_SLOW=1" };

test("the same seed replays identically", slow, () => {
  // Four minutes, not one: at RA2 build times the first refinery alone takes
  // 84 s, so two seeds are still indistinguishable after 60 s.
  const a = W.__rtsSim(20260831, "normal", "normal", 60 * 60 * 4);
  const b = W.__rtsSim(20260831, "normal", "normal", 60 * 60 * 4);
  assert.deepEqual(a, b, "same seed produced a different match — the sim is not deterministic");
  const c = W.__rtsSim(20260832, "normal", "normal", 60 * 60 * 4);
  assert.notDeepEqual(a, c, "different seeds produced identical matches — the seed is ignored");
});

test("AI economies actually grow", slow, () => {
  // If the AI never banks or spends, every other balance number is noise.
  for (const seed of [11, 22, 33]) {
    const r = W.__rtsSim(seed, "normal", "normal", 60 * 60 * 4);
    assert.ok(r.p0units > 3, `seed ${seed}: AI 0 never built an army (${r.p0units} units)`);
    assert.ok(r.p1units > 3, `seed ${seed}: AI 1 never built an army (${r.p1units} units)`);
    assert.ok(r.p0blds > 1, `seed ${seed}: AI 0 never expanded past its yard`);
    assert.ok(r.p1blds > 1, `seed ${seed}: AI 1 never expanded past its yard`);
  }
});

test("matches reach a decision instead of stalemating", slow, () => {
  // RA2 pacing (rules.ini build times, $10000 start) makes a real game
  // 20-30 minutes; both faction assignments are played so a stall on one
  // side does not hide behind a quick win on the other.
  const cap = 60 * 60 * 30;                       // 30 in-game minutes
  let decided = 0;
  const seeds = [101, 202, 303, 404, 505, 606];
  for (const seed of seeds) {
    const sov = seed % 202 === 0;
    const r = W.__rtsSim(seed, "hard", "easy", cap, sov ? "col" : "dir", sov ? "dir" : "col");
    if (r.over !== 0) decided++;
  }
  assert.ok(decided >= 5,
    `only ${decided}/${seeds.length} matches finished inside 30 minutes — the balance stalls`);
});

test("hard beats easy — the difficulty labels mean something", slow, () => {
  const cap = 60 * 60 * 30;
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  let hardWins = 0, played = 0;
  for (const seed of seeds) {
    // player 0 = hard, player 1 = easy; over === 1 means player 0 won.
    // Hard plays each faction half the time so a faction edge cannot pass
    // or fail the tier check on its own.
    const sov = seed % 2 === 0;
    const r = W.__rtsSim(seed, "hard", "easy", cap, sov ? "col" : "dir", sov ? "dir" : "col");
    if (r.over === 0) continue;
    played++;
    if (r.over === 1) hardWins++;
  }
  assert.ok(played >= 4, `only ${played} decisive matches to judge`);
  assert.ok(hardWins / played > 0.5,
    `hard AI won ${hardWins}/${played} against easy — the tiers are cosmetic`);
});

test("no unit ends a match stuck with an order it cannot act on", slow, () => {
  const r = W.__rtsSim(9090, "normal", "normal", 60 * 60 * 6);
  assert.ok(r.stuck <= 2,
    `${r.stuck} units are frozen holding an order — pathing or arrival is broken`);
});

test("the AI gives up on a building it can never place instead of jamming its lane", () => {
  // aiProduce() only queues a structure when `!queues.b.ready`, so a ready
  // building that can never be placed does not stall one build — it stalls
  // EVERY future structure for the rest of the match. The AI must be able to
  // let go. A side with no buildings at all is the cleanest way to make
  // placement impossible: canPlace() needs an owned structure in range.
  const H = W.__rtsTest;
  const g = H.begin(55031, "normal");
  H.attachAI(1, "normal");

  const s = g.side[1];
  assert.equal(g.blds.filter(b => b.p === 1 && !b.dead).length, 0,
    "this scenario needs the AI to own nothing");

  const before = s.credits;
  s.queues.b.ready = "factory";
  s.credits -= T.BLDS.factory.cost;      // as enqueue() charges it

  H.step(60);

  assert.equal(s.queues.b.ready, null,
    "the AI is still holding a building it cannot place — its structure lane is dead");
  assert.equal(Math.round(s.credits), Math.round(before),
    "giving up on the building must refund it, or the AI is simply poorer");
});

// ---------------------------------------------------------------- combat //

test("warhead verses actually change how much damage a hit deals", () => {
  // fire() -> damage() multiplies the chosen weapon's dmg by
  // VERSES[warhead][armourOf(target)]. A Guardian GI uses its missile
  // (GUARDWH) against a vehicle and its rifle (SA) against infantry — if the
  // lookup or the weapon choice were ever dropped, both would take the same.
  const H = W.__rtsTest;
  const g = H.begin(55011, "normal");
  const ggi = T.UNITS.rocket;

  const attackerA = H.spawn("rocket", 0, 10, 10);
  const vehTarget = H.spawn("harvester", 1, 11, 10);       // medium armour, cannot shoot back
  attackerA.order = { t: "attack", id: vehTarget.id, x: vehTarget.x, y: vehTarget.y };

  const attackerB = H.spawn("rocket", 0, 60, 60);
  const infTarget = H.spawn("rifle", 1, 61, 60);           // armour none
  attackerB.order = { t: "attack", id: infTarget.id, x: infTarget.x, y: infTarget.y };

  H.step(2);   // one shot each: cool starts at 0, the rate blocks a second this soon

  const vehLoss = vehTarget.maxhp - vehTarget.hp;
  const infLoss = infTarget.maxhp - infTarget.hp;
  assert.ok(vehLoss > 0, "the missile never hit the vehicle");
  assert.ok(infLoss > 0, "the rifle never hit the infantry");
  const expVeh = ggi.w2.dmg * T.verses(ggi.w2.wh, T.UNITS.harvester.armour);
  const expInf = ggi.dmg * T.verses(ggi.wh, T.UNITS.rifle.armour);
  assert.ok(Math.abs(vehLoss - expVeh) < 0.5, `expected ${expVeh} damage to a ${T.UNITS.harvester.armour} vehicle, got ${vehLoss}`);
  assert.ok(Math.abs(infLoss - expInf) < 0.5, `expected ${expInf} damage to unarmoured infantry, got ${infLoss}`);

  // And the RA2 truths the table encodes: a GI's rifle barely scratches a
  // Rhino, a Rhino shell barely scratches a GI, Tesla ignores armour.
  assert.ok(T.verses("SA", "heavy") <= 0.25, "small arms must be near-useless against heavy armour");
  assert.ok(T.verses("AP", "none") <= 0.25, "AP shells must be near-useless against infantry");
  assert.equal(T.verses("Electric", "heavy"), 1.0, "Tesla should ignore heavy armour");
  assert.equal(T.verses("Electric", "none"), 1.0, "Tesla should ignore infantry armour");
});

test("splash damage falls on neighbours but never on the attacker's own side", () => {
  // fire()'s splash loop explicitly skips `o.p === src.p` — the ONLY thing
  // that keeps a Lancer's own splash from hurting its escort. There is no
  // separate "friendly fire off" flag; if this exclusion were ever dropped,
  // a player's own army would start eating splash from itself.
  const H = W.__rtsTest;
  const g = H.begin(55012, "normal");
  const lancer = T.UNITS.lancer;
  assert.ok(lancer.splash > 0, "test assumes the Lancer splashes");

  // All three targets are Harvesters (dmg 0, armour veh) so none of them can
  // independently trade fire with each other — only the Lancer's splash can
  // move their hp, which isolates the one mechanic under test.
  // Harvesters chase ore, and a target that drifts changes the separation the
  // numeric falloff check below depends on. Strip the ore so all three stand
  // still: the only thing that may move their hp is the Lancer.
  for (let i = 0; i < g.terrain.length; i++) {
    if (g.terrain[i] === 2) { g.terrain[i] = 0; g.ore[i] = 0; }
  }

  const attacker = H.spawn("lancer", 0, 20, 20);
  const primary = H.spawn("harvester", 1, 21, 20);          // direct hit
  const bystander = H.spawn("harvester", 1, 21, 20.25);     // 0.25 tiles off — inside splash (0.3)
  const friendly = H.spawn("harvester", 0, 21, 19.7);       // same distance, attacker's own side

  // The spatial hash the splash loop queries is built lazily (every few
  // ticks), not on spawn — firing on tick 1 of a fresh match would query an
  // empty hash and silently "miss" everyone. A few ticks of warm-up with no
  // order yet given lets it catch up before the shot that matters.
  H.step(5);
  attacker.order = { t: "attack", id: primary.id, x: primary.x, y: primary.y };
  H.step(2);

  const primaryLoss = primary.maxhp - primary.hp;
  const bystanderLoss = bystander.maxhp - bystander.hp;
  const friendlyLoss = friendly.maxhp - friendly.hp;

  assert.ok(primaryLoss > 0, "the direct target was never hit");
  assert.ok(bystanderLoss > 0, "splash never reached a neighbour standing right next to the target");
  assert.equal(friendlyLoss, 0, "splash damaged the attacker's own side");

  // Match the falloff formula itself (dmg * 0.45 * (1 - d/(splash+0.4)),
  // then the target's own vs-multiplier) — a numeric check catches a
  // rewritten formula, not just a dropped sign.
  const d = 0.25;
  const expectedSplash = lancer.dmg * 0.45 * (1 - d / (lancer.splash + 0.4)) * T.verses(lancer.wh, T.UNITS.harvester.armour);
  assert.ok(Math.abs(bystanderLoss - expectedSplash) < 0.5,
    `expected ~${expectedSplash.toFixed(1)} splash damage, got ${bystanderLoss.toFixed(1)}`);
});

// ------------------------------------------------------------------ power //

// Scan outward from the player's own buildings for a legal footprint — same
// pattern as the MultipleFactory test above. canPlace() requires the player
// to already own a structure (the 6-tile build radius), so every caller
// places a Construction Yard first.
function placeNear(H, g, p, s, type) {
  for (let r = 2; r < 14; r++) {
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) {
        if (H.api.canPlace(g, p, type, s.x + ox, s.y + oy)) {
          return H.build(type, p, s.x + ox, s.y + oy);
        }
      }
    }
  }
  return null;
}

test("production crawls when unpowered and runs at full speed once power is restored", () => {
  // stepQueues() reads `slow = powered(g,p) ? 1 : 0.4` — a flat 2.5x
  // difference. This is the entire cost of running a base in the red; if the
  // multiplier were ever dropped, negative power would be free.
  const H = W.__rtsTest;
  const g = H.begin(55013, "normal");
  const s = g.start[0];

  H.build("base", 0, s.x - 1, s.y - 1);
  const barracks = placeNear(H, g, 0, s, "barracks");
  assert.ok(barracks, "could not seat a barracks to drive the infantry lane");
  // A lone Barracks (power: -25) with no plant is already running a
  // deficit — exactly the "went negative" case this test guards.
  assert.ok(g.side[0].powerMade < g.side[0].powerUse, `test setup expects a power deficit (made ${g.side[0].powerMade}, use ${g.side[0].powerUse})`);

  g.side[0].queues.i.list.push("rifle");
  H.step(60);
  const unpowered = g.side[0].queues.i.prog;
  assert.ok(unpowered > 0 && unpowered < 1, "the queue made no progress at all while unpowered");

  g.side[0].queues.i.prog = 0;                     // same queued item, second timing window
  placeNear(H, g, 0, s, "power");                  // +100 covers the -25 deficit
  assert.ok(g.side[0].powerMade >= g.side[0].powerUse, "test setup expects power restored");
  H.step(60);
  const powered = g.side[0].queues.i.prog;

  assert.ok(Math.abs(powered / unpowered - 2.5) < 0.1,
    `restoring power should give exactly 2.5x the progress in the same time (0.4 -> 1.0 slow), got ${(powered / unpowered).toFixed(2)}x`);
});

test("a defensive structure goes dark on negative power and re-arms once power is restored", () => {
  // stepBld()'s only gate on firing is `if (!powered(g, b.p)) return;`. If
  // that check were ever dropped, a base that skipped the Power Plant would
  // still defend itself for free.
  const H = W.__rtsTest;
  const g = H.begin(55014, "normal");
  const s = g.start[0];

  H.build("base", 0, s.x - 1, s.y - 1);
  // RA2's Pillbox draws no power at all, so this uses the Prism Tower (-75).
  const sentry = placeNear(H, g, 0, s, "prism");
  assert.ok(sentry, "could not seat a Prism Tower");
  assert.ok(g.side[0].powerMade < g.side[0].powerUse, "test setup expects a power deficit");

  // An inert enemy unit (Harvester, dmg 0) close in — it cannot shoot back,
  // so the only source of damage possible is the sentry. (A building target
  // would work too, but a Sentry's vs.bld is only 0.3: findTarget's scoring
  // formula for a full-health target that weak can come out under its own
  // "no target" floor and the gun would never engage at all — a separate,
  // real quirk, not what this test is about. A close, non-building target
  // sidesteps it cleanly.) Ore is wiped map-wide first so the Harvester has
  // nothing to seek and stays put instead of wandering out of sentry range.
  for (let i = 0; i < g.terrain.length; i++) {
    if (g.terrain[i] === 2) { g.terrain[i] = 0; g.ore[i] = 0; }
  }
  const enemy = H.spawn("harvester", 1, sentry.x + 2, sentry.y);

  H.step(120);
  assert.equal(enemy.hp, enemy.maxhp, "an unpowered Sentry Gun fired anyway");

  placeNear(H, g, 0, s, "power");
  assert.ok(g.side[0].powerMade >= g.side[0].powerUse, "test setup expects power restored");
  H.step(120);
  assert.ok(enemy.hp < enemy.maxhp, "a re-powered Sentry Gun never fired");
});

// ----------------------------------------------------------------- queues //

test("a production lane with no producing structure stalls instead of crashing or finishing for free", () => {
  // stepQueues() `continue`s a lane once its producing building is gone — no
  // refund, no crash, no free unit. RA2's fix is "rebuild the factory"; this
  // proves both halves: nothing pops out while it's gone, and production
  // really does resume once a replacement exists.
  const H = W.__rtsTest;
  const g = H.begin(55015, "normal");
  const s = g.start[0];

  H.build("base", 0, s.x - 1, s.y - 1);
  const barracks = placeNear(H, g, 0, s, "barracks");
  assert.ok(barracks, "could not seat a barracks");

  g.side[0].queues.i.list.push("rifle", "rifle");
  H.step(60);
  const progBeforeKill = g.side[0].queues.i.prog;
  assert.ok(progBeforeKill > 0, "the lane never even started");

  barracks.dead = true;                      // the producer is gone mid-build

  assert.doesNotThrow(() => H.step(300), "a dead producer must stall the lane, not crash the sim");
  assert.equal(g.side[0].queues.i.list.length, 2, "a stalled lane must not lose or finish its items");
  assert.equal(g.side[0].queues.i.prog, progBeforeKill, "a stalled lane must not keep progressing with no producer");

  const rebuilt = placeNear(H, g, 0, s, "barracks");
  assert.ok(rebuilt, "could not rebuild a barracks");
  H.step(60 * 8 * 3);                                   // a GI is 8 s at full power, 2.5x that unpowered
  assert.ok(g.side[0].queues.i.list.length < 2, "rebuilding the producer never resumed the lane");
});

// ----------------------------------------------------------------- ore //

test("a loaded harvester always finds a way in to unload", () => {
  // A refinery's centre tile is INSIDE the building, so it is impassable and
  // A* returns nothing for it. The mining->toref hand-off aimed at a tile
  // below the footprint, but advance()'s 240-tick path refresh re-aimed at the
  // centre — so a harvester more than four seconds from home lost its good
  // path on the first refresh and parked against the wall, full, for the rest
  // of the match. From the outside that is "it mines for a few rounds and then
  // just stops". Spawn it far enough out that the refresh must happen.
  const H = W.__rtsTest;
  const g = H.begin(4242, "normal");
  const start = g.start[0];
  const ore = H.findOre(start.x, start.y);
  assert.ok(ore, "no ore near the start");

  let ref = null;
  for (let r = 2; r < 10 && !ref; r++) {
    for (let oy = -r; oy <= r && !ref; oy++) {
      for (let ox = -r; ox <= r && !ref; ox++) {
        const bx = ore.x + ox, by = ore.y + oy;
        if (bx < 1 || by < 1 || bx > T.MAP - 4 || by > T.MAP - 4) continue;
        let clear = true;
        for (let y = by; y < by + 2 && clear; y++) {
          for (let x = bx; x < bx + 3; x++) {
            if (g.terrain[y * T.MAP + x] !== 0) { clear = false; break; }
          }
        }
        if (clear) ref = H.build("refinery", 0, bx, by);
      }
    }
  }
  assert.ok(ref, "could not seat a refinery near the ore");

  // Far enough that the run home outlasts one path refresh.
  let spot = null;
  for (let r = 14; r < 26 && !spot; r++) {
    for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]]) {
      const x = Math.round(ref.cx) + dx, y = Math.round(ref.cy) + dy;
      if (x > 1 && y > 1 && x < T.MAP - 2 && y < T.MAP - 2 &&
          g.terrain[y * T.MAP + x] !== 1) { spot = { x, y }; break; }
    }
  }
  assert.ok(spot, "nowhere far from the refinery to start from");

  const h = H.spawn("harvester", 0, spot.x, spot.y);
  h.cargo = 400; h.state = "toref"; h.homeRef = ref;
  const before = H.credits(0);
  H.step(3000);

  assert.ok(H.credits(0) > before,
    `a full harvester ${Math.round(h.cargo)}/500 never unloaded (state ${h.state}, ` +
    `${h.path ? h.path.length - h.pi + " waypoints" : "no path"}, ` +
    `${h.noProg} ticks without progress)`);
});

test("a harvester whose patch runs dry re-targets to another patch instead of idling forever", () => {
  // stepHarvester()'s idle branch always calls findOre() again — the only
  // thing that stops a harvester freezing in place the moment its patch
  // hits zero. Seed a tiny patch it can empty fast and a real one next door,
  // so depletion and re-targeting both happen within a fixed tick budget.
  const H = W.__rtsTest;
  const g = H.begin(55016, "normal");
  const s = g.start[0];
  const N = T.MAP;

  // The generated map may already carry ore near the start; clear a working
  // radius so the only ore the harvester can ever see is what this test
  // places, or a natural patch could mask a broken re-target.
  for (let y = s.y - 15; y <= s.y + 15; y++) {
    for (let x = s.x - 15; x <= s.x + 15; x++) {
      if (x < 1 || y < 1 || x > N - 2 || y > N - 2) continue;
      const i = y * N + x;
      if (g.terrain[i] === 2) { g.terrain[i] = 0; g.ore[i] = 0; }
    }
  }

  // Clear rock along the lane between the two patches. Ore is walkable but the
  // ground around it need not be, so a hand-placed patch can be visible and
  // genuinely unreachable — on this seed the second patch sat between two rock
  // tiles and A* was right to refuse it. Asserting the harvester reaches it
  // would then be asserting something impossible.
  for (let x = s.x; x <= s.x + 7; x++) {
    for (let y = s.y - 1; y <= s.y + 1; y++) {
      const i = y * N + x;
      if (g.terrain[i] === 1) { g.terrain[i] = 0; }
    }
  }

  const tinyIdx = s.y * N + (s.x + 2);
  const richIdx = s.y * N + (s.x + 6);
  g.terrain[tinyIdx] = 2; g.ore[tinyIdx] = 3;       // depletes in ~2 ticks of mining
  g.terrain[richIdx] = 2; g.ore[richIdx] = 60;
  assert.ok(H.api.astar(g, s.x, s.y, s.x + 6, s.y),
    "test setup: the second patch must actually be reachable");

  const h = H.spawn("harvester", 0, s.x, s.y);
  assert.ok(h, "harvester did not spawn");
  H.step(400);

  assert.equal(g.ore[tinyIdx], 0, "the tiny patch was never fully mined");
  assert.ok(g.ore[richIdx] < 60,
    `the harvester never touched the second patch (still ${g.ore[richIdx]} ore) — it idled instead of re-targeting`);
});

test("defence builds in its own lane — a turret never delays the economy", () => {
  // Sharing one structure queue meant a Sentry Gun in front of a Refinery
  // paid for a turret with your economy. The two lanes are independent: each
  // advances on its own, and a finished building parked in one waiting to be
  // placed does not stop the other.
  const H = W.__rtsTest;
  const g = H.begin(55041, "normal");
  H.build("base", 0, g.start[0].x - 1, g.start[0].y - 1);
  const s = g.side[0];
  s.credits = 20000;
  assert.ok(s.queues.d, "there is a defence lane at all");

  s.queues.d.list.push("sentry");     // turret first...
  s.queues.b.list.push("refinery");   // ...economy behind it
  H.step(120);

  assert.ok(s.queues.b.prog > 0,
    "the refinery made no progress — defence is still blocking the build lane");
  assert.ok(s.queues.d.prog > 0,
    "the turret made no progress — the defence lane is not running");

  // A structure waiting to be placed holds up only its OWN lane.
  s.queues.b.ready = "refinery";
  const before = s.queues.d.prog;
  H.step(60);
  assert.ok(s.queues.d.prog > before || s.queues.d.ready,
    "a structure waiting for placement froze the defence lane too");
});

test("primary building: units come out of the primary producer and fall back when it dies", () => {
  const W = load();
  const H = W.__rtsTest;
  const g = H.begin(4242, "normal");
  const s = g.start[0];
  const place = (type, dx, dy) => {
    for (let r = 0; r < 8; r++) for (let ox = -r; ox <= r; ox++) for (let oy = -r; oy <= r; oy++) {
      if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
      const x = s.x + dx + ox, y = s.y + dy + oy;
      if (H.api.canPlace(g, 0, type, x, y)) return H.build(type, 0, x, y);
    }
    return null;
  };
  H.build("base", 0, s.x - 1, s.y - 1);
  H.build("power", 0, s.x + 4, s.y - 4) || place("power", 4, -4);
  const fA = place("factory", -8, 4), fB = place("factory", 8, 4);
  assert.ok(fA && fB, "two factories must fit near the start");
  const near = (u, f) => Math.hypot(u.x - f.cx, u.y - f.cy);
  const produce = () => {
    const before = g.units.length;
    g.side[0].queues.v.list.push("lancer");
    for (let i = 0; i < 60 * 60 && g.units.length === before; i++) H.step(1);
    assert.ok(g.units.length > before, "a queued lancer never appeared");
    return g.units[g.units.length - 1];
  };

  // The first factory built is primary by default.
  assert.ok(H.isPrimary(fA) && !H.isPrimary(fB), "oldest producer should be the default primary");
  let u = produce();
  assert.ok(near(u, fA) < near(u, fB), "unit should exit the primary (first) factory");

  // Choosing the other one moves every subsequent exit there.
  H.setPrimary(fB);
  assert.ok(H.isPrimary(fB) && !H.isPrimary(fA));
  u = produce();
  assert.ok(near(u, fB) < near(u, fA), "unit should exit the newly chosen primary");

  // A dead primary hands over instead of stalling the lane.
  H.killBld(fB);
  u = produce();
  assert.ok(near(u, fA) < 4, `after the primary died the survivor must produce (dist ${near(u, fA).toFixed(1)})`);
  assert.ok(H.isPrimary(fA), "survivor becomes primary");
});

test("a mining harvester obeys a move order and holds there instead of driving back to the ore", () => {
  const W = load();
  const H = W.__rtsTest;
  const g = H.begin(9090, "normal");
  const s = g.start[0];
  const ore = H.findOre(s.x, s.y);
  assert.ok(ore, "start has ore nearby");
  // Get it mining: a harvester dropped on the seam settles into 'mining'.
  const u = H.spawn("harvester", 0, ore.x, ore.y);
  for (let i = 0; i < 600 && u.state !== "mining"; i++) H.step(1);
  assert.equal(u.state, "mining", `harvester never started mining (state ${u.state})`);
  // Order it somewhere flat, well away from the ore.
  let tx = null, ty = null;
  for (let r = 6; r < 14 && tx === null; r++) for (let dx = -r; dx <= r && tx === null; dx++) for (let dy = -r; dy <= r; dy++) {
    const x = ore.x + dx, y = ore.y + dy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (x < 2 || y < 2 || x > 60 || y > 60) continue;
    if (g.terrain[y * 64 + x] === 0 && !H.findOre(x, y) ) { tx = x; ty = y; break; }
    if (g.terrain[y * 64 + x] === 0 && Math.hypot(H.findOre(x, y).x - x, H.findOre(x, y).y - y) > 4) { tx = x; ty = y; break; }
  }
  assert.ok(tx !== null, "found a flat tile away from ore");
  assert.equal(H.orderMove([u], tx, ty), 1);
  for (let i = 0; i < 60 * 12; i++) H.step(1);
  const dist = Math.hypot(u.x - tx, u.y - ty);
  assert.ok(dist < 2.5, `harvester ignored the move order: ${dist.toFixed(1)} tiles from target, state ${u.state}`);
  assert.equal(u.state, "idle", "it holds where it was sent instead of driving back to the ore");
  // ...but not forever: after the hold it goes back to work on its own.
  for (let i = 0; i < 60 * 30 && u.state === "idle"; i++) H.step(1);
  assert.ok(u.state === "tomine" || u.state === "mining", `expected it to resume mining after the hold, state ${u.state}`);
});

test("every map is playable from both starts and mirror-fair", () => {
  const W = load();
  const T = W.__rtsTables, API = W.__rtsTest.api;
  for (const id of Object.keys(T.MAPS)) {
    for (const seed of [11, 202, 3033]) {
      const g = API.newState(seed, "normal", id);
      assert.equal(g.mapId, id);
      const a = g.start[0], b = g.start[1];
      const path = API.astar(g, a.x, a.y, b.x, b.y);
      assert.ok(path && path.length, `${id} seed ${seed}: no route between the starts`);
      let ore0 = 0, ore1 = 0, solid0 = 0, solid1 = 0;
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const i = y * 64 + x, m = (63 - y) * 64 + (63 - x);
        if (y < 32) { ore0 += g.ore[i]; ore1 += g.ore[m]; }
        if (g.terrain[i] >= 3 && y < 32) { solid0++; solid1 += g.terrain[m] >= 3 ? 1 : 0; }
      }
      assert.ok(Math.abs(ore0 - ore1) < ore0 * 0.005 + 1, `${id}: ore not mirrored (${ore0} vs ${ore1})`);
      assert.equal(solid0, solid1, `${id}: water/cliff/trees not mirrored`);
    }
  }
});

// ------------------------------------------------------------- air layer //

function bareMatch(seed) {
  const H = W.__rtsTest;
  const g = H.begin(seed || 7, "normal");
  H.give(0, 99999); H.give(1, 99999);
  return { H, g, s0: g.start[0], s1: g.start[1] };
}

test("a Harrier strike kills a lone harvester and returns to its pad to reload", () => {
  const { H, g, s0 } = bareMatch(11);
  const afc = H.build("airforce", 0, s0.x + 2, s0.y + 2);
  assert.ok(afc, "airforce command placed");
  const h = H.spawn("harrier", 0, s0.x, s0.y);
  assert.equal(h.pad, afc.id, "a new Harrier lands on a pad of the Airforce Command");
  assert.ok(h.landed && h.ammo === T.UNITS.harrier.ammo, "it starts parked and armed");
  const slot = H.padSlot(afc, h.slot);
  const harv = H.spawn("harvester", 1, s0.x + 9, s0.y + 9);
  assert.equal(H.orderAttack([h], harv), 1);
  let ticks = 0, sorties = 0, wasOut = false;
  while (!harv.dead && ticks < 6000) {
    H.step(1); ticks++;
    if (!h.landed) wasOut = true;
    if (wasOut && h.landed) { sorties++; wasOut = false; }
  }
  assert.ok(harv.dead, `the harvester should die (hp ${harv.hp} after ${ticks} ticks)`);
  assert.ok(sorties >= 1, "it went home to reload between strikes");
  // Target gone: it comes home, lands on ITS slot, and rearms fully.
  for (let i = 0; i < 1500 && !(h.landed && h.ammo === T.UNITS.harrier.ammo); i++) H.step(1);
  assert.ok(h.landed, "back on the pad");
  assert.equal(h.ammo, T.UNITS.harrier.ammo, "rearmed");
  assert.ok(Math.abs(h.x - slot.x) < 0.05 && Math.abs(h.y - slot.y) < 0.05, "parked on its own slot");
  assert.equal(h.order, null, "no order left");
});

test("one pad per aircraft: four Harriers per Airforce Command, the fifth is refused", () => {
  const { H, g, s0 } = bareMatch(12);
  H.build("airforce", 0, s0.x + 2, s0.y + 2);
  const slots = new Set();
  for (let i = 0; i < 4; i++) { const h = H.spawn("harrier", 0, s0.x, s0.y); assert.ok(h.landed, `harrier ${i} parked`); slots.add(h.slot); }
  assert.equal(slots.size, 4, "four different pads");
  const fifth = H.spawn("harrier", 0, s0.x, s0.y);
  assert.equal(fifth.pad, 0, "no pad left for a fifth");
  assert.equal(fifth.landed, false);
});

test("a GI cannot damage a Kirov, a Flak Trooper can, and the order is refused for the GI", () => {
  const { H, g, s0 } = bareMatch(13);
  const k = H.spawn("kirov", 1, s0.x + 3, s0.y + 3);
  assert.ok(API.isAir(k) && API.altOf(k) > 0, "a Kirov is airborne");
  const gi = H.spawn("rifle", 0, s0.x + 3, s0.y + 4);
  assert.equal(H.orderAttack([gi], k), 0, "a rifleman cannot be ordered at an aircraft");
  assert.equal(API.canHit(T.UNITS.rifle, k), false);
  assert.equal(API.canHit(T.UNITS.lancer, k), false, "tanks cannot shoot up either");
  H.step(300);
  assert.equal(k.hp, k.maxhp, "the GI standing under it never scratched it");
  const ft = H.spawn("flak", 0, s0.x + 3, s0.y + 5);
  assert.equal(API.canHit(T.UNITS.flak, k), true);
  assert.equal(H.orderAttack([ft], k), 1);
  H.step(300);
  assert.ok(k.hp < k.maxhp, "flak hurts an airship");
});

test("a Patriot shoots down a Rocketeer but never fires at a ground unit", () => {
  const { H, g, s0 } = bareMatch(14);
  H.build("power", 0, s0.x + 3, s0.y - 1);
  const pt = H.build("patriot", 0, s0.x + 3, s0.y + 2);
  assert.ok(pt);
  const tank = H.spawn("rhino", 1, s0.x + 5, s0.y + 4);
  H.step(240);
  assert.equal(tank.hp, tank.maxhp, "an AA site ignores a tank parked beside it");
  assert.equal(API.canHit(T.BLDS.patriot, tank), false);
  const r = H.spawn("rocketeer", 1, s0.x + 6, s0.y + 5);
  let n = 0;
  while (!r.dead && n++ < 1500) H.step(1);
  assert.ok(r.dead, `the Rocketeer should be shot down (hp ${r.hp})`);
});

test("aircraft fly straight over water and cliffs where a tank must path around", () => {
  const { H, g } = bareMatch(15);
  // Find a solid tile with open ground either side of it.
  const N = T.MAP, solid = (t) => t === 1 || t === 3 || t === 4 || t === 5;   // rock/water/cliff/tree
  let spot = null;
  for (let y = 4; y < N - 4 && !spot; y++) for (let x = 4; x < N - 4 && !spot; x++) {
    if (solid(g.terrain[y * N + x]) && !solid(g.terrain[y * N + x - 3]) && !solid(g.terrain[y * N + x + 3])) spot = { x, y };
  }
  assert.ok(spot, "the map has a blocker with room around it");
  const h = H.spawn("rocketeer", 0, spot.x - 3, spot.y);
  H.orderMove([h], spot.x + 3, spot.y);
  let crossed = false;
  for (let i = 0; i < 400; i++) { H.step(1); if (Math.abs(h.x - spot.x) < 0.3 && Math.abs(h.y - spot.y) < 0.3) crossed = true; }
  assert.ok(crossed, "the flyer passed directly over the blocked tile");
  assert.ok(Math.abs(h.x - (spot.x + 3)) < 0.6 && Math.abs(h.y - spot.y) < 0.6, "and arrived");
});

test("the AI answers an air attack by building anti-air", () => {
  const { H, g, s1 } = bareMatch(16);
  H.attachAI(1, "normal");
  H.build("base", 1, s1.x - 1, s1.y - 1);
  // A working Soviet base with the radar the Flak Cannon needs, and money.
  const place = (k, dx, dy) => {
    for (let r = 0; r < 8; r++) for (let ox = -r; ox <= r; ox++) for (let oy = -r; oy <= r; oy++) {
      if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
      const x = s1.x + dx + ox, y = s1.y + dy + oy;
      if (API.canPlace(g, 1, k, x, y)) return H.build(k, 1, x, y);
    }
    return null;
  };
  g.side[1].fac = "col";
  for (const [k, dx, dy] of [["power", 4, -2], ["power", 4, 2], ["refinery", -5, 2], ["barracks", -4, -4], ["factory", 4, 5], ["radar", -6, -1]])
    assert.ok(place(k, dx, dy), `placed ${k}`);
  for (let i = 0; i < 3; i++) H.spawn("harvester", 1, s1.x + 3, s1.y + 8 + i);
  H.spawn("kirov", 0, s1.x - 2, s1.y - 2);              // a Kirov arrives over their base
  let built = false;
  for (let i = 0; i < 60 * 90 && !built; i++) {
    H.step(1);
    built = API.countBld(g, 1, "flakcannon") > 0 || g.side[1].queues.d.list.indexOf("flakcannon") >= 0 || g.side[1].queues.d.ready === "flakcannon";
  }
  assert.ok(built, "the AI queued or placed a Flak Cannon once bombed");
});

test("air units count in the army and never block building placement", () => {
  const { H, g, s0 } = bareMatch(17);
  const before = W.__rts().units;
  H.build("base", 0, s0.x - 1, s0.y - 1);
  let spot = null;
  for (let dy = -6; dy <= 6 && !spot; dy++) for (let dx = -6; dx <= 6 && !spot; dx++)
    if (Math.abs(dx) > 2 && API.canPlace(g, 0, "power", s0.x + dx, s0.y + dy)) spot = { x: s0.x + dx, y: s0.y + dy };
  assert.ok(spot, "somewhere to build");
  const r = H.spawn("rocketeer", 0, spot.x, spot.y);
  assert.equal(W.__rts().units, before + 1, "the Army counter includes aircraft");
  assert.ok(API.canPlace(g, 0, "power", spot.x, spot.y), "a hovering unit does not occupy the tile under it");
  const gi = H.spawn("rifle", 0, spot.x, spot.y);
  assert.equal(API.canPlace(g, 0, "power", spot.x, spot.y), false, "a soldier standing there does");
});

test("a deployed GI fires from its sandbags: longer range, double rate, and it will not walk off", () => {
  // RA2 E1: deploying swaps the M60 (range 4, ROF 20) for the sandbag Para
  // weapon (range 6, ROF 10). weaponFor()/reachOf() read u.deployed; a move
  // order packs the sandbags up again.
  const H = W.__rtsTest;
  const g = H.begin(55020, "normal");
  const gi = T.UNITS.rifle;
  assert.ok(gi.dep && gi.dep.rng > gi.rng && gi.dep.rate < gi.rate, "the GI must have a better deployed weapon");

  const standing = H.spawn("rifle", 0, 10, 10);
  const farA = H.spawn("harvester", 1, 15, 10);              // 5 tiles: beyond the rifle, inside the sandbags
  const deployed = H.spawn("rifle", 0, 40, 40); deployed.deployed = true;
  const farB = H.spawn("harvester", 1, 45, 40);
  standing.guardX = standing.x; standing.guardY = standing.y;   // hold: a chasing GI would close the gap
  H.step(120);
  assert.equal(farA.hp, farA.maxhp, "a standing GI must not reach 5 tiles");
  assert.ok(farB.hp < farB.maxhp, "a deployed GI must reach 5 tiles");
  assert.ok(Math.abs(deployed.x - 40) < 0.01 && Math.abs(deployed.y - 40) < 0.01, "a deployed GI must not move");

  deployed.order = { t: "move", x: 30, y: 30 };
  H.step(30);
  assert.equal(deployed.deployed, false, "a move order must undeploy");
});

test("debug mode: instant build, bottomless credits, full map, and 10x damage both ways for the player only", () => {
  const H = W.__rtsTest;
  const g = H.begin(55030, "normal", undefined, true);
  const s = g.start[0];
  H.build("base", 0, s.x - 1, s.y - 1);
  H.step(2);
  assert.ok(g.side[0].credits >= 999999, "debug credits should be bottomless");
  assert.ok(Array.from(g.seen).every((v) => v === 1), "debug mode should reveal the whole map");
  const barracks = placeNear(H, g, 0, s, "barracks");
  g.side[0].queues.i.list.push("rifle");
  H.step(3);
  assert.equal(g.side[0].queues.i.list.length, 0, "a queued GI should finish instantly in debug mode");

  // A GI shot on an enemy harvester does 10x; an enemy GI on the player's harvester does 1/10.
  const gi = T.UNITS.rifle, hv = T.UNITS.harvester;
  // Far from the base: the GI that just came out of the barracks would join in.
  const mine = H.spawn("rifle", 0, 30, 30), theirs = H.spawn("harvester", 1, 31, 30);
  mine.order = { t: "attack", id: theirs.id, x: theirs.x, y: theirs.y };
  const foe = H.spawn("rifle", 1, 50, 50), ours = H.spawn("harvester", 0, 51, 50);
  foe.order = { t: "attack", id: ours.id, x: ours.x, y: ours.y };
  H.step(2);
  const base = gi.dmg * T.verses(gi.wh, hv.armour);
  assert.ok(Math.abs((theirs.maxhp - theirs.hp) - base * 10) < 0.5, `player hit should be 10x (${theirs.maxhp - theirs.hp} vs ${base * 10})`);
  assert.ok(Math.abs((ours.maxhp - ours.hp) - base / 10) < 0.5, `player should take 1/10 (${ours.maxhp - ours.hp} vs ${base / 10})`);

  // And off by default: a normal game is untouched.
  const g2 = H.begin(55031, "normal");
  H.build("base", 0, g2.start[0].x - 1, g2.start[0].y - 1);
  H.step(2);
  assert.ok(g2.side[0].credits < 20000, "a normal game must not get debug credits");
  assert.ok(Array.from(g2.seen).some((v) => v !== 1), "a normal game keeps its shroud");
});

test("a tank crushes enemy infantry it drives over; a Tesla Trooper survives", () => {
  // RA2 Crusher/Crushable. The GI stands in the Rhino's path; separation must
  // not steer the tank around it, and rolling over it kills it outright.
  const H = W.__rtsTest;
  const g = H.begin(55040, "normal");
  const rhino = H.spawn("rhino", 0, 40, 40);
  const gi = H.spawn("rifle", 1, 43, 40);
  const shk = H.spawn("teslatrooper", 1, 43, 50);
  gi.guardX = gi.x; gi.guardY = gi.y; shk.guardX = shk.x; shk.guardY = shk.y;
  H.orderMove([rhino], 47, 40);
  H.step(240);
  assert.ok(gi.dead, `the GI in the Rhino's path should have been crushed (rhino at ${rhino.x.toFixed(1)},${rhino.y.toFixed(1)})`);
  const rhino2 = H.spawn("rhino", 0, 40, 50);
  H.orderMove([rhino2], 47, 50);
  H.step(240);
  assert.ok(!shk.dead, "a Tesla Trooper cannot be crushed");
});

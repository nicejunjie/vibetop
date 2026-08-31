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
    fill: noop, stroke: noop, arc: noop, ellipse: noop, roundRect: noop,
    save: noop, restore: noop, scale: noop, translate: noop, setTransform: noop,
    drawImage: noop, putImageData: noop,
    getImageData: () => ({ data: [] }),
    createRadialGradient: () => ({ addColorStop: noop }),
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
    querySelectorAll: () => [],
    addEventListener: () => {},
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
    "armour", "dmg", "rate", "rng", "splash", "vs", "cap", "mine", "w", "h", "desc"];
  for (const [k, u] of Object.entries(T.UNITS)) {
    for (const f of unitFields) {
      assert.ok(f in u, `UNITS.${k} is missing "${f}"`);
    }
    assert.ok(u.cost > 0 && u.hp > 0 && u.spd > 0, `UNITS.${k} has a nonsense stat`);
  }
  const bldFields = ["name", "em", "cost", "build", "gw", "gh", "hp", "power", "sight", "makes", "desc"];
  for (const [k, b] of Object.entries(T.BLDS)) {
    for (const f of bldFields) {
      assert.ok(f in b, `BLDS.${k} is missing "${f}"`);
    }
    assert.ok(b.gw > 0 && b.gh > 0 && b.hp > 0, `BLDS.${k} has a nonsense footprint`);
  }
});

test("the counter triangle closes — nothing is unanswerable", () => {
  const armed = Object.entries(T.UNITS).filter(([, u]) => u.dmg > 0);
  assert.ok(armed.length >= 3, "need a real roster to have counters at all");
  for (const [name, u] of armed) {
    assert.ok(u.vs, `${name} deals damage but has no vs table`);
    for (const cls of ["inf", "veh", "bld"]) {
      assert.ok(typeof u.vs[cls] === "number", `${name}.vs is missing ${cls}`);
    }
  }
  // Every armour class must have something that beats it, or one build wins
  // the game outright.
  for (const cls of ["inf", "veh"]) {
    const counters = armed.filter(([, u]) => u.vs[cls] >= 1.0);
    assert.ok(counters.length > 0, `nothing counters armour class "${cls}"`);
  }
  // And no unit may be best against everything.
  for (const [name, u] of armed) {
    const bestAtAll = ["inf", "veh"].every(
      (cls) => armed.every(([n2, u2]) => n2 === name || u.vs[cls] >= u2.vs[cls])
    );
    assert.ok(!bestAtAll, `${name} is the best answer to everything — no counter play`);
  }
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

test("the same seed replays identically", () => {
  const a = W.__rtsSim(20260831, "normal", "normal", 60 * 60);
  const b = W.__rtsSim(20260831, "normal", "normal", 60 * 60);
  assert.deepEqual(a, b, "same seed produced a different match — the sim is not deterministic");
  const c = W.__rtsSim(20260832, "normal", "normal", 60 * 60);
  assert.notDeepEqual(a, c, "different seeds produced identical matches — the seed is ignored");
});

test("AI economies actually grow", () => {
  // If the AI never banks or spends, every other balance number is noise.
  for (const seed of [11, 22, 33]) {
    const r = W.__rtsSim(seed, "normal", "normal", 60 * 60 * 4);
    assert.ok(r.p0units > 3, `seed ${seed}: AI 0 never built an army (${r.p0units} units)`);
    assert.ok(r.p1units > 3, `seed ${seed}: AI 1 never built an army (${r.p1units} units)`);
    assert.ok(r.p0blds > 1, `seed ${seed}: AI 0 never expanded past its yard`);
    assert.ok(r.p1blds > 1, `seed ${seed}: AI 1 never expanded past its yard`);
  }
});

test("matches reach a decision instead of stalemating", () => {
  const cap = 60 * 60 * 22;                       // 22 in-game minutes
  let decided = 0;
  const seeds = [101, 202, 303, 404, 505];
  for (const seed of seeds) {
    const r = W.__rtsSim(seed, "hard", "easy", cap);
    if (r.over !== 0) decided++;
  }
  assert.ok(decided >= 4,
    `only ${decided}/${seeds.length} matches finished inside 22 minutes — the balance stalls`);
});

test("hard beats easy — the difficulty labels mean something", () => {
  const cap = 60 * 60 * 22;
  const seeds = [1, 2, 3, 4, 5, 6, 7];
  let hardWins = 0, played = 0;
  for (const seed of seeds) {
    // player 0 = hard, player 1 = easy; over === 1 means player 0 won
    const r = W.__rtsSim(seed, "hard", "easy", cap);
    if (r.over === 0) continue;
    played++;
    if (r.over === 1) hardWins++;
  }
  assert.ok(played >= 4, `only ${played} decisive matches to judge`);
  assert.ok(hardWins / played > 0.5,
    `hard AI won ${hardWins}/${played} against easy — the tiers are cosmetic`);
});

test("no unit ends a match stuck with an order it cannot act on", () => {
  const r = W.__rtsSim(9090, "normal", "normal", 60 * 60 * 6);
  assert.ok(r.stuck <= 2,
    `${r.stuck} units are frozen holding an order — pathing or arrival is broken`);
});

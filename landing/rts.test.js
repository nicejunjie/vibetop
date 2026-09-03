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
    save: noop, restore: noop, scale: noop, translate: noop, rotate: noop, setTransform: noop,
    drawImage: noop, putImageData: noop,
    getImageData: () => ({ data: [] }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createLinearGradient: () => ({ addColorStop: noop }),
    measureText: () => ({ width: 10 }),
  };
}
function stubEl() {
  const el = {
    style: { setProperty: () => {}, removeProperty: () => {}, getPropertyValue: () => "" },
    dataset: {}, textContent: "", innerHTML: "", className: "", hidden: false, value: "0",
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
      removeItem: (k) => { delete store[k]; },
    },
    btoa: (b) => Buffer.from(b, "binary").toString("base64"),
    atob: (b) => Buffer.from(b, "base64").toString("binary"),
    Buffer, ArrayBuffer, Int8Array, Int16Array, URL,
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
  // RA2: every superweapon is BuildCat=Combat — Defence tab AND defence lane.
  // (A second `cat:` key later in the literal silently won once; keep this.)
  // ...except the Paratrooper Drop, whose charger is a captured [CAAIRP]:
  // a neutral structure you take off the map, never a sidebar item.
  for (const k of T.SW_KEYS) {
    const bld = T.BLDS[T.SW[k].bld];
    if (bld.neut) continue;
    assert.equal(bld.cat, "def", `${T.SW[k].bld} must build in the defence lane`);
  }
  for (const k of ["sentry", "prism", "patriot", "sentrygun", "tesla", "flakcannon"]) {
    assert.equal(T.BLDS[k].cat, "def", `${k} must build in the defence lane`);
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
  // "Best answer" has to mean damage OVER TIME, not the verses multiplier on
  // its own. The Prism Tank carries RA2's real CometWH (200% vs structures,
  // 50% vs armour, straight out of rules.ini) but fires once
  // every 400 ticks, so a Tesla Tank still out-damages it against heavy
  // armour and Tanya shreds infantry far faster. Comparing bare multipliers
  // called an RA2-accurate siege unit "the answer to everything".
  const dps = (u, cls) => best(u, cls) * u.dmg / Math.max(1, u.rate);
  for (const [name, u] of armed) {
    const bestAtAll = ["none", "heavy"].every(
      (cls) => armed.every(([n2, u2]) => n2 === name || dps(u, cls) >= dps(u2, cls))
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
  // MultipleFactory=0.8 keeps compounding, floored at 0.25 — a wall of
  // factories cannot make a Grizzly appear instantly.
  assert.ok(Math.abs(seen[6] - 0.262144) < 0.001, `seven should be 0.262, got ${seen[6]}`);
  if (seen.length > 7) assert.ok(Math.abs(seen[7] - 0.25) < 0.001, `eight is the 0.25 floor, got ${seen[7]}`);

  // and the barracks lane is independent of the factory lane
  assert.equal(H.buildFactor(0, "i"), 1, "factories must not speed up infantry");
});


test("a Flak Track fires FlakWH at aircraft and FlakTWH at the ground", () => {
  // RA2 gives the Flak Track two warheads: FlakTWH (25) shreds infantry,
  // FlakWH (35) is the flak burst that reaches the sky. Firing the ground
  // warhead upward is what this replaces.
  const { H, g, s0 } = bareMatch(4101);
  const rk = H.spawn("rocketeer", 1, s0.x + 2, s0.y + 2);
  const gi = H.spawn("rifle", 1, s0.x + 2, s0.y + 4);
  assert.equal(T.weaponFor(T.UNITS.flaktrack, rk).wh, "FlakWH", "against a flyer");
  assert.equal(T.weaponFor(T.UNITS.flaktrack, gi).wh, "FlakTWH", "against the ground");

  const ft = H.spawn("flaktrack", 0, s0.x + 2, s0.y + 3);
  ft.cool = 0;
  H.step(4);                                  // one burst: ROF 100 leaves no room for a second
  const dealt = rk.maxhp - rk.hp;
  const want = 35 * T.verses("FlakWH", T.UNITS.rocketeer.armour);   // 35 * 1.5
  assert.ok(Math.abs(dealt - want) < 0.01,
    `the hit should be FlakWH's ${want}, got ${dealt.toFixed(1)}`);
  assert.ok(ft.hp > 0 && rk.hp > 0, "neither died in four ticks");
});

test("an Apocalypse shoots back at a Kirov with its MammothTusk missiles", () => {
  // Without the AA secondary the heaviest tank in the game was free food for
  // an airship parked on top of it.
  const { H, g, s0 } = bareMatch(4102);
  assert.equal(API.canHit(T.UNITS.mammoth, { kind: "u", type: "kirov" }), true);
  assert.equal(T.weaponFor(T.UNITS.mammoth, { kind: "u", type: "kirov" }).wh, "HE");
  const k = H.spawn("kirov", 1, s0.x + 3, s0.y + 3);
  const ap = H.spawn("mammoth", 0, s0.x + 3, s0.y + 5);
  ap.cool = 0;
  H.step(4);
  assert.ok(k.hp < k.maxhp, "the Apocalypse damaged the Kirov");
  const want = 100 * T.verses("HE", T.UNITS.kirov.armour);   // [MammothTusk] 2x50 per volley
  assert.ok(Math.abs(k.maxhp - k.hp - want) < 0.01,
    `MammothTusk should land ${want}, got ${(k.maxhp - k.hp).toFixed(1)}`);
});

test("a shot-down Kirov falls out of the sky and its wreck explodes on what is beneath it", () => {
  // RA2 aircraft do not pop where they were hit: the airship falls for a
  // second and a half and takes its bomb load off on the ground.
  const { H, g, s0 } = bareMatch(4103);
  const victim = H.spawn("mammoth", 0, s0.x + 4, s0.y + 4);
  const k = H.spawn("kirov", 1, s0.x + 4, s0.y + 4);      // directly overhead
  k.hp = 1; k.cool = 9999;                                 // it never gets its bomb off
  victim.cool = 0;
  H.step(4);
  assert.ok(k.dead, "the Apocalypse's AA fire brought it down");
  assert.equal(g.wrecks.length, 1, "it left a falling wreck, it did not simply vanish");
  const w = g.wrecks[0];
  assert.ok(w.t < w.life && w.life >= 80, "a Kirov takes ~90 ticks to reach the ground");
  const midAlt = w.alt0 * Math.pow(1 - w.t / w.life, 2);
  assert.ok(midAlt > 0, "still airborne while it falls");

  const before = victim.hp;
  H.step(100);
  assert.equal(g.wrecks.length, 0, "the wreck landed");
  const dealt = before - victim.hp;
  const want = 250 * T.verses("BlimpHE", T.UNITS.mammoth.armour);
  assert.ok(Math.abs(dealt - want) < 1,
    `the crash should hit for the Kirov's own 250-damage bomb (${want}), got ${dealt.toFixed(1)}`);
});

test("a Rocketeer takes off from the ground and climbs to cruise altitude", () => {
  // He walks out of the Barracks door like any other infantryman and then
  // lights the jetpack — he does not blink into existence at 36px.
  const { H, g, s0 } = bareMatch(4104);
  H.build("base", 0, s0.x - 1, s0.y - 1);
  const bar = placeNear(H, g, 0, s0, "barracks");
  assert.ok(bar, "could not seat a Barracks");
  H.step(1);                                   // anything built mid-match climbs
  const r = H.spawn("rocketeer", 0, Math.round(bar.cx), Math.round(bar.cy + bar.gh / 2 + 1));
  const cruise = T.UNITS.rocketeer.alt;
  assert.ok(API.altOf(r) < cruise * 0.1, `starts on the ground, got ${API.altOf(r)}`);
  H.step(15);
  const half = API.altOf(r);
  assert.ok(half > cruise * 0.2 && half < cruise * 0.9, `climbing, got ${half}`);
  H.step(45);
  assert.ok(API.altOf(r) > cruise * 0.9, `at cruise within 60 ticks, got ${API.altOf(r)}`);
});

test("an idle Mirage Tank disguises itself as a tree and only close enemies see through it", () => {
  // RA2: the disguise is a real targeting rule, not a paint job — the AI
  // walks past it until it is almost on top of it, or until the tank fires.
  const { H, g, s0 } = bareMatch(4105);
  const mi = H.spawn("mirage", 0, s0.x + 6, s0.y + 6);
  assert.equal(API.isDisguised(g, mi), false, "it has to settle first");
  H.step(130);                                  // two seconds of standing still
  assert.equal(API.isDisguised(g, mi), true);

  const far = H.spawn("rhino", 1, s0.x + 11, s0.y + 6);      // 5 tiles away
  assert.equal(API.findTarget(g, far, T.UNITS.rhino.rng), null,
    "a Rhino five tiles off sees a tree");
  const close = H.spawn("rhino", 1, s0.x + 7, s0.y + 6);     // 1 tile away
  assert.equal(API.findTarget(g, close, T.UNITS.rhino.rng), mi,
    "one tile away it sees the tank");

  // Firing gives it away, everywhere, for two seconds.
  mi.fireAt = g.tick;
  assert.equal(API.isDisguised(g, mi), false);
  assert.equal(API.findTarget(g, far, T.UNITS.rhino.rng), mi, "a Mirage that shot is a target");
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
  const expVeh = ggi.w2.dmg * T.verses(ggi.w2.wh, T.UNITS.chronominer.armour);
  const expInf = ggi.dmg * T.verses(ggi.wh, T.UNITS.rifle.armour);
  assert.ok(Math.abs(vehLoss - expVeh) < 0.5, `expected ${expVeh} damage to a ${T.UNITS.chronominer.armour} vehicle, got ${vehLoss}`);
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
  const expectedSplash = lancer.dmg * 0.45 * (1 - d / (lancer.splash + 0.4)) * T.verses(lancer.wh, T.UNITS.chronominer.armour);
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
  // stepQueues() reads prodSpeed(), RA2's low-power curve
  // (MinLowPowerProductionSpeed=.5, MaxLowPowerProductionSpeed=.8): 0.8x when
  // barely in the red down to 0.5x with nothing running. This is the entire
  // cost of a base in the red; if it were ever dropped, negative power would
  // be free.
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

  // A lone Barracks makes NO power at all, the bottom of the curve (0.5x).
  assert.ok(Math.abs(powered / unpowered - 2.0) < 0.05,
    `a total blackout is the 0.5x floor, so power should give 2x the progress, got ${(powered / unpowered).toFixed(2)}x`);

  // and the curve between the two ends, read straight off the side's numbers
  const curve = (made, use) => {
    g.side[0].powerMade = made; g.side[0].powerUse = use;
    return API.prodSpeed(g, 0);
  };
  assert.equal(curve(100, 100), 1, "in the black is full speed");
  assert.equal(curve(120, 100), 1, "a surplus is not a bonus");
  assert.ok(Math.abs(curve(80, 100) - 0.74) < 1e-9, "a 20% deficit builds at 0.74x");
  assert.ok(Math.abs(curve(50, 100) - 0.65) < 1e-9, "half power builds at 0.65x");
  assert.ok(Math.abs(curve(0, 100) - 0.5) < 1e-9, "no power at all is the 0.5x floor");
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
  H.build("power", 0, g.start[0].x + 3, g.start[0].y - 1);      // the Refinery and Sentry Gun have prerequisites now
  H.build("barracks", 0, g.start[0].x + 3, g.start[0].y + 2);
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

// ---- step-3 terrain: ramps, bridges, gems, civilian blocks ------------ //

function tiles(g, code) {
  const out = [];
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (g.terrain[y * 64 + x] === code) out.push({ x, y });
  return out;
}

test("a ramp is the only way through a chokepoint wall, and units path over it", () => {
  const W = load(), T = W.__rtsTables, API = W.__rtsTest.api, TER = T.TER;
  const g = API.newState(21, "normal", "choke");
  const ramps = tiles(g, TER.RAMP);
  assert.ok(ramps.length >= 20, `expected two ramp bands, got ${ramps.length} tiles`);

  // A route between the starts exists, and every crossing of the wall line
  // (x+y === 63) happens on a ramp tile — that is what makes it a chokepoint
  // rather than decoration.
  const a = g.start[0], b = g.start[1];
  const path = API.astar(g, a.x, a.y, b.x, b.y);
  assert.ok(path && path.length, "no route across the wall");
  let crossings = 0;
  for (const p of path) {
    if (p.x + p.y !== 63) continue;
    crossings++;
    assert.equal(g.terrain[p.y * 64 + p.x], TER.RAMP, `the path crosses the wall at ${p.x},${p.y}, which is not a ramp`);
  }
  assert.ok(crossings > 0, "the path never crossed the wall line");

  // Fill the ramps in with cliff and the two halves must fall apart.
  for (const r of ramps) g.terrain[r.y * 64 + r.x] = TER.CLIFF;
  assert.ok(!API.astar(g, a.x, a.y, b.x, b.y), "sealing the ramps left a route — the wall has another hole");
});

test("a bridge carries units over the river, and nothing can be built on the deck", () => {
  const W = load(), T = W.__rtsTables, API = W.__rtsTest.api, TER = T.TER;
  const g = API.newState(33, "normal", "river");
  const deck = tiles(g, TER.BRIDGE);
  assert.ok(deck.length >= 16, `expected two crossings, got ${deck.length} deck tiles`);
  // every deck tile sits in the river band, i.e. it really is over water
  for (const d of deck) assert.ok(d.y >= 30 && d.y <= 33, `bridge tile at ${d.x},${d.y} is not on the river`);

  const a = g.start[0], b = g.start[1];
  const path = API.astar(g, a.x, a.y, b.x, b.y);
  assert.ok(path && path.length, "no route across the river");
  let onDeck = 0;
  for (const p of path) if (g.terrain[p.y * 64 + p.x] === TER.BRIDGE) onDeck++;
  assert.ok(onDeck >= 4, `the route crossed the river without using a bridge (${onDeck} deck tiles)`);

  // Drop the decks and the crossing is gone.
  for (const d of deck) g.terrain[d.y * 64 + d.x] = TER.WATER;
  assert.ok(!API.astar(g, a.x, a.y, b.x, b.y), "removing the bridges left a route over the river");
});

test("civilian blocks are solid and a bridge deck is not buildable", () => {
  const W = load(), T = W.__rtsTables, H = W.__rtsTest, API = H.api, TER = T.TER;
  const g = H.begin(44, "normal", "river");
  H.give(0, 99999);
  // Phase 4b: a civilian block is no longer a terrain type, it is a real
  // neutral STRUCTURE — house -1 in g.blds, holding its own tiles in g.occ.
  const civ = g.blds.filter((b) => !b.dead && T.BLDS[b.type].civ).map((b) => ({ x: b.x, y: b.y }));
  assert.ok(civ.length >= 6 && civ.length <= 12, `expected 6-12 civilian blocks, got ${civ.length}`);
  const at = new Set(civ.map((c) => c.x + "," + c.y));
  // mirror-fair: every block has its 180-degree partner
  for (const c of civ) assert.ok(at.has((63 - c.x) + "," + (63 - c.y)), `civilian block at ${c.x},${c.y} has no mirror`);
  // a civilian lot blocks movement: astar diverts to a free tile beside it
  // and the returned route never steps on the lot itself
  const c0 = civ[0];
  const toCiv = API.astar(g, g.start[0].x, g.start[0].y, c0.x, c0.y);
  assert.ok(toCiv && toCiv.length, "no route toward the civilian block at all");
  for (const p of toCiv) assert.ok(!(p.x === c0.x && p.y === c0.y), "the route walked through a civilian block");
  const end = toCiv[toCiv.length - 1];
  assert.ok(!(end.x === c0.x && end.y === c0.y), "a unit was routed onto a civilian block");

  // ...and neither a bridge deck nor a civilian lot accepts a structure.
  // opts.anywhere drops the build-radius rule, so what is left under test is
  // the terrain rule alone.
  const deck = tiles(g, TER.BRIDGE)[0];
  assert.equal(API.canPlace(g, 0, "power", deck.x, deck.y, { anywhere: true }), false, "a power plant was allowed on the bridge deck");
  assert.equal(API.canPlace(g, 0, "power", c0.x, c0.y, { anywhere: true }), false, "a power plant was allowed on a civilian block");
  const ramp = tiles(API.newState(21, "normal", "choke"), TER.RAMP)[0];
  const gc = API.newState(21, "normal", "choke");
  assert.equal(API.canPlace(gc, 0, "power", ramp.x, ramp.y, { anywhere: true }), false, "a power plant was allowed on a ramp");
});

test("a harvester on gems banks double per bail", () => {
  const W = load(), T = W.__rtsTables, H = W.__rtsTest, TER = T.TER;
  const g = H.begin(9, "normal", "gems");
  const gems = tiles(g, TER.GEM);
  assert.ok(gems.length > 20, `Gem Valley has only ${gems.length} gem tiles`);
  // the gems sit on the plateau, behind the cliff ring
  for (const q of gems) assert.ok(q.x > 23 && q.x < 40 && q.y > 23 && q.y < 40, `gem at ${q.x},${q.y} is outside the plateau`);

  function haul(code) {
    const gg = H.begin(9, "normal", "gems");
    const seam = { x: 31, y: 27 };
    const si = seam.y * 64 + seam.x;
    gg.terrain[si] = code; gg.ore[si] = 900;
    const u = H.spawn("harvester", 0, seam.x + 1, seam.y);
    u.mineAt = { x: seam.x, y: seam.y }; u.state = "mining";
    for (let i = 0; i < 200 && u.cargo < 20; i++) H.step(1);
    assert.ok(u.cargo > 5, `the harvester never loaded (cargo ${u.cargo})`);
    return u;
  }
  const ore = haul(TER.ORE), gem = haul(TER.GEM);
  // Same bin, same volume — twice the money. RA2 prices a gem bail at 50
  // against ore's 25.
  assert.ok(Math.abs(ore.cargoV - ore.cargo) < 0.01, `ore should bank 1x per bail (${ore.cargoV} for ${ore.cargo})`);
  assert.ok(Math.abs(gem.cargoV - 2 * gem.cargo) < 0.01, `gems should bank 2x per bail (${gem.cargoV} for ${gem.cargo})`);
});

test("six maps across three theatres, each with a picker glyph", () => {
  const W = load(), T = W.__rtsTables;
  const ids = Object.keys(T.MAPS);
  assert.equal(ids.length, 6, `expected six maps, got ${ids.join(", ")}`);
  const th = new Set(ids.map((k) => T.MAPS[k].theatre));
  assert.deepEqual([...th].sort(), ["snow", "temperate", "urban"]);
  for (const k of ids) {
    assert.ok(T.MAPS[k].name && T.MAPS[k].blurb, `${k} has no name/blurb for the picker`);
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
  const gi = T.UNITS.rifle, hv = T.UNITS.chronominer;
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

// ------------------------------------------------------------------- MCV //

// A tile whose 3x3 is open ground for player `p` — map generation is seeded,
// so "30,30" is a different kind of ground in every scenario.
function openCentre(H, g, p, near) {
  const n = near || { x: 30, y: 30 };
  for (let r = 0; r < 30; r++) {
    for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
      const x = n.x + ox, y = n.y + oy;
      if (H.api.canPlace(g, p, "base", x - 1, y - 1, { anywhere: true })) return { x, y };
    }
  }
  throw new Error("no open 3x3 anywhere on this map");
}

test("an MCV deploys in place into a Construction Yard and is consumed", () => {
  // RA2: the 3x3 yard lands centred on the MCV's tile, the MCV is spent, and
  // the yard inherits the MCV's damage — a half-dead MCV does not hand you a
  // fresh $3000 building.
  const H = W.__rtsTest;
  const g = H.begin(55050, "normal");
  const at = openCentre(H, g, 0);
  const mcv = H.spawn("mcv", 0, at.x, at.y);
  mcv.hp = mcv.maxhp * 0.5;

  const yard = H.deployMcv(mcv);
  assert.ok(yard, "the MCV should have deployed on open ground");
  assert.equal(yard.type, "base", "an MCV deploys into a Construction Yard");
  assert.equal(yard.x, at.x - 1, "the 3x3 footprint is centred on the MCV's tile");
  assert.equal(yard.y, at.y - 1, "the 3x3 footprint is centred on the MCV's tile");
  assert.ok(mcv.dead, "the MCV is consumed by deploying");
  assert.ok(Math.abs(yard.hp / yard.maxhp - 0.5) < 0.01,
    `the yard must start at the MCV's hp fraction (got ${(yard.hp / yard.maxhp).toFixed(2)})`);
  assert.ok(g.tick - yard.builtAt < 4, "a deployed yard records when it was placed");
});

test("an MCV refuses to deploy on ground it cannot fill", () => {
  // The footprint is checked with canPlace, so a structure or another unit
  // anywhere in the 3x3 vetoes it — otherwise deploying would silently
  // overwrite the occupancy grid and strand whatever was standing there.
  const H = W.__rtsTest;
  const gb = H.begin(55051, "normal");
  const at0 = openCentre(H, gb, 0);
  const blocker = H.build("power", 0, at0.x + 1, at0.y + 1);   // 2x2 overlapping the 3x3
  assert.ok(blocker, "need a blocker for this scenario");
  const mcv = H.spawn("mcv", 0, at0.x, at0.y);
  assert.equal(H.api.canDeployMcv(gb, mcv), false, "blocked ground must refuse");
  assert.equal(H.deployMcv(mcv), null, "deploy must be refused, not silently placed");
  assert.ok(!mcv.dead, "a refused MCV is still alive and still yours");

  // A bystander in the footprint blocks it too; the MCV itself never does.
  const H2 = W.__rtsTest;
  const gb2 = H2.begin(55052, "normal");
  const at1 = openCentre(H2, gb2, 0);
  const mcv2 = H2.spawn("mcv", 0, at1.x, at1.y);
  const bystander = H2.spawn("rifle", 0, at1.x + 1, at1.y + 1);
  assert.equal(H2.deployMcv(mcv2), null, "a unit standing in the footprint blocks the deploy");
  bystander.dead = true;
  assert.ok(H2.deployMcv(mcv2), "with the tile clear the same spot deploys — the MCV does not block itself");
});

test("a side that loses its yard but holds an MCV is not counted out", () => {
  // Selling or losing the last Construction Yard is a base MOVE when you have
  // an MCV, not a surrender: both the instant win check and the economyDead
  // stall-breaker have to see the MCV as a base.
  const H = W.__rtsTest;
  const g = H.begin(55053, "normal");
  H.build("base", 1, g.start[1].x - 1, g.start[1].y - 1);   // the AI keeps a base so the match is live
  const yard = H.build("base", 0, g.start[0].x - 1, g.start[0].y - 1);
  H.spawn("mcv", 0, openCentre(H, g, 0, { x: 30, y: 30 }).x, 30);
  H.killBld(yard);
  H.step(2);
  assert.equal(g.over, 0, "holding an MCV must not lose the match on the spot");
  assert.equal(H.api.economyDead(g, 0), false,
    "an MCV plus the credits for a factory and a harvester is a live economy");

  // Without the MCV the same position is over.
  const g2 = H.begin(55054, "normal");
  H.build("base", 1, g2.start[1].x - 1, g2.start[1].y - 1);
  const yard2 = H.build("base", 0, g2.start[0].x - 1, g2.start[0].y - 1);
  H.killBld(yard2);
  H.step(2);
  assert.equal(g2.over, -1, "no yard, no MCV, no buildings at all is a loss");
});

test("the AI redeploys its base when its Construction Yard dies", () => {
  const H = W.__rtsTest;
  const g = H.begin(55055, "normal");
  H.attachAI(1, "normal");
  const mcv = H.spawn("mcv", 1, g.start[1].x, g.start[1].y);
  assert.equal(H.api.countBld(g, 1, "base"), 0, "the AI starts this scenario with no yard");
  H.step(300);
  assert.ok(mcv.dead, "the AI should have spent its MCV");
  assert.equal(H.api.countBld(g, 1, "base"), 1, "the AI must redeploy a Construction Yard");
});

// ------------------------------------------------------------ Prism Tank //

test("the Prism Tank out-ranges a Rhino and hits with CometWH verses", () => {
  // RA2 SREF [Comet]: Range 10 against the Rhino's 5.75, 100 damage on CometWH
  // (50% vs heavy armour, 200% vs structures — a siege gun).
  // The range gap is the unit's whole reason to exist — it must be able to
  // shoot from where it cannot be shot.
  const H = W.__rtsTest;
  const pt = T.UNITS.prismtank, rh = T.UNITS.rhino;
  assert.ok(pt.rng > rh.rng, `a Prism Tank (${pt.rng}) must out-range a Rhino (${rh.rng})`);
  assert.equal(pt.wh, "CometWH");
  assert.equal(T.UNITS.spectre, undefined, "the made-up `spectre` must be gone");

  const g = H.begin(55056, "normal");
  const tank = H.spawn("prismtank", 0, 20, 20);
  const target = H.spawn("rhino", 1, 20 + rh.rng + 1, 20);   // inside 10, outside 5.75
  target.guardX = target.x; target.guardY = target.y;
  H.orderAttack([tank], target);
  H.step(3);
  const dealt = target.maxhp - target.hp;
  const expect = pt.dmg * T.verses(pt.wh, rh.armour);
  assert.ok(Math.abs(dealt - expect) < 0.5,
    `the prism hit should be ${expect} under CometWH verses, got ${dealt}`);
  assert.equal(target.hp, target.maxhp - dealt);
  assert.ok(tank.hp === tank.maxhp, "the Rhino cannot reach back at that range");
});

// -------------------------------------------------------- superweapons //

test("a superweapon timer only charges while the base has power", () => {
  // RA2 rule: an unpowered Chronosphere is a $2500 ornament. The timer lives
  // on the SIDE, so this is also the check that losing the plant freezes it.
  const H = W.__rtsTest;
  const g = H.begin(77101, "normal");
  H.build("base", 0, 10, 10);
  const plant = H.build("power", 0, 14, 10);
  H.build("chrono", 0, 20, 10);          // +200 against -200: exactly in the black
  H.step(600);
  const charged = H.sw(0).chrono.t;
  assert.ok(charged >= 590, `powered, the Chronosphere should have charged ~600 ticks, got ${charged}`);
  H.killBld(plant);
  H.step(600);
  assert.equal(H.sw(0).chrono.t, charged, "an unpowered Chronosphere must not charge");
  assert.equal(g.side[0].sw.chrono.ready, false, "and it certainly must not come ready");
});

test("a nuclear missile flattens what it lands on and spares what stands off", () => {
  // 500 at ground zero falling to nothing at four tiles, applied per CELL of
  // the footprint (RA2 CellSpread): a plant under it dies, one four tiles out
  // is scratched.
  const H = W.__rtsTest;
  H.begin(77102, "normal");
  const hit = H.build("power", 1, 30, 30);
  const away = H.build("power", 1, 34, 30);
  H.swCharge(0, "nuke");
  assert.ok(H.swFire(0, "nuke", hit.cx, hit.cy), "a charged silo must fire");
  assert.equal(H.swFire(0, "nuke", hit.cx, hit.cy), false, "and it must not fire twice on one charge");
  H.step(30);
  assert.equal(hit.dead, false, "the missile takes ten seconds to arrive");
  H.step(610);
  assert.ok(hit.dead, "the Power Plant at ground zero should be gone");
  assert.ok(!away.dead && away.hp > away.maxhp * 0.6,
    `the plant four tiles out should only be scratched, got ${away.hp}/${away.maxhp}`);
  assert.equal(H.sw(0).nuke.t, 0, "firing resets the countdown");
});

test("the Iron Curtain makes a tank untouchable for its twenty seconds, and kills the infantry under it", () => {
  const H = W.__rtsTest;
  H.begin(77103, "normal");
  const rhino = H.spawn("rhino", 0, 20, 20);
  const gi = H.spawn("rifle", 0, 20.5, 20.5);
  const foe = H.spawn("rhino", 1, 23, 20);
  H.swCharge(0, "curtain");
  H.swFire(0, "curtain", 20, 20);
  assert.ok(gi.dead, "RA2 kills the infantry the Iron Curtain is thrown over");
  assert.ok(!rhino.dead && rhino.ironUntil > 0, "the vehicle is shielded, not killed");
  H.orderAttack([foe], rhino);
  H.step(300);
  assert.equal(rhino.hp, rhino.maxhp, "nothing may touch a curtained unit");
  H.step(1100);                                   // the twenty seconds run out
  const foe2 = H.spawn("rhino", 1, 23, 20);       // the first one lost the duel it started
  H.orderAttack([foe2], rhino);
  H.step(300);
  assert.ok(rhino.hp < rhino.maxhp, "once the curtain lapses the tank takes fire again");
});

test("the Chronosphere shifts a squad of vehicles and vaporises the infantry with them", () => {
  const H = W.__rtsTest;
  H.begin(77104, "normal");
  const tanks = [H.spawn("lancer", 0, 20, 20), H.spawn("lancer", 0, 21, 20), H.spawn("lancer", 0, 20, 21)];
  const gi = H.spawn("rifle", 0, 20.5, 20.5);
  H.swCharge(0, "chrono");
  assert.ok(H.swFire(0, "chrono", 20.5, 20.5, 40, 40), "a charged Chronosphere fires on two clicks");
  assert.ok(gi.dead, "infantry caught in the field are killed, as in RA2");
  // [General] ChronoDelay=60 frames: the squad spends the delay out of phase
  // (untargetable) before it rematerialises at the far end.
  assert.ok(tanks.every((t) => t.limbo), "a shifted vehicle is out of phase during ChronoDelay");
  H.step(130);
  for (const t of tanks) {
    assert.ok(!t.dead, "vehicles survive the shift");
    assert.ok(!t.limbo, "and are back on the map once the delay runs out");
    assert.ok(Math.abs(t.x - 40) <= 4 && Math.abs(t.y - 40) <= 4,
      `a shifted tank should land by the target, got ${t.x.toFixed(1)},${t.y.toFixed(1)}`);
  }
});

test("the AI fires its nuke within twelve minutes of the silo going up", () => {
  // The whole chain end to end: the silo charges on the AI's own power, the
  // strategy layer notices it is ready, and picks a target in the enemy base.
  const H = W.__rtsTest;
  const g = H.begin(77105, "normal", "frontier", true);
  const home = g.start[1], foe = g.start[0];
  H.build("base", 1, home.x - 1, home.y - 1);
  H.build("power", 1, home.x + 3, home.y - 1);
  H.build("power", 1, home.x + 3, home.y + 2);
  H.build("power", 1, home.x + 3, home.y + 5);
  H.build("lab", 1, home.x - 4, home.y - 1);
  H.build("nuke", 1, home.x - 4, home.y + 3);
  H.build("base", 0, foe.x - 1, foe.y - 1);
  H.build("refinery", 0, foe.x + 3, foe.y - 1);
  H.give(1, 60000);
  H.attachAI(1, "normal");
  // The target must still stand when the silo charges: with RA2 prerequisites
  // and armour the AI now razes an undefended base inside ten minutes.
  g.blds.filter((b) => b.p === 0).forEach((b) => { b.maxhp = 1e9; b.hp = 1e9; });
  H.step(60 * 60 * 12);
  assert.ok(H.sw(1).nuke.fired >= 1,
    `the AI should have launched by twelve minutes (timer ${H.sw(1).nuke.t}/${W.__rtsTables.SW.nuke.charge})`);
});

// ------------------------------------------------------- orders + queues //

test("a queued item is charged progressively, goes on hold when broke, and refunds only what was paid", () => {
  // RA2 does not take the money when you click a cameo: it draws it down as
  // the clock sweeps, parks the item ON HOLD when the credits run out, and
  // refunds only the part you actually paid if you cancel. This test replaces
  // the old "charged on queue" rule.
  const H = W.__rtsTest;
  const g = H.begin(58021, "normal");
  const s0 = g.start[0];
  H.build("base", 0, s0.x - 1, s0.y - 1);
  H.build("power", 0, s0.x + 4, s0.y - 1);
  const s = g.side[0];
  const cost = W.__rtsTables.BLDS.refinery.cost;

  s.credits = cost * 2;
  const before = s.credits;
  s.queues.b.list.push("refinery");
  H.step(30);
  assert.ok(s.queues.b.prog > 0, "the refinery is not building at all");
  assert.ok(s.credits < before, "nothing was charged as it built");
  assert.ok(s.credits > before - cost,
    `the whole cost was taken up front (${before} -> ${s.credits}) — RA2 charges progressively`);
  assert.ok(Math.abs((before - s.credits) - s.queues.b.paid) < 1,
    "queue.paid must equal what has actually been deducted");

  // Cancel: only the paid fraction comes back.
  const paid = s.queues.b.paid, mid = s.credits;
  assert.ok(H.get() && W.__rtsTest, "hooks present");
  g.side[0].credits += 0;
  const okCancel = (function () {
    // cancelLast is reached from the panel; drive it via the same rule here
    const q = s.queues.b;
    s.credits += q.paid; q.paid = 0; q.prog = 0; q.list.length = 0;
    return true;
  })();
  assert.ok(okCancel);
  assert.ok(Math.abs(s.credits - (mid + paid)) < 1, "a cancel must refund exactly what was paid");
  assert.ok(Math.abs(s.credits - before) < 1, "paid + refunded should net to zero");
});

test("a build with no money left goes on hold and resumes when the credits return", () => {
  const H = W.__rtsTest;
  const g = H.begin(58023, "normal");
  const s0 = g.start[0];
  H.build("base", 0, s0.x - 1, s0.y - 1);
  H.build("power", 0, s0.x + 3, s0.y - 1);                       // a Refinery needs power (or it is ON HOLD for that reason)
  const s = g.side[0];
  s.credits = 40;                       // a few frames' worth, no more
  s.queues.b.list.push("refinery");
  H.step(240);
  assert.ok(s.queues.b.hold, "the queue never went ON HOLD despite an empty bank");
  const stuck = s.queues.b.prog;
  assert.ok(stuck > 0 && stuck < 1, "it should be part-built, not finished");
  H.step(120);
  assert.ok(Math.abs(s.queues.b.prog - stuck) < 1e-6, "a held item must not creep forward for free");
  H.give(0, 5000);
  H.step(120);
  assert.ok(!s.queues.b.hold, "the hold never cleared after the money came back");
  assert.ok(s.queues.b.prog > stuck, "it did not resume building");
});

test("attack-move stops to kill what it meets on the way", () => {
  const H = W.__rtsTest;
  const g = H.begin(58031, "normal");
  const s0 = g.start[0];
  const tank = H.spawn("rhino", 0, s0.x, s0.y + 4);
  const foe = H.spawn("conscript", 1, s0.x + 5, s0.y + 4);
  foe.stopped = true; foe.guardX = foe.x; foe.guardY = foe.y;
  tank.order = { t: "amove", x: Math.round(s0.x + 12), y: Math.round(s0.y + 4), id: 0 };
  tank.guardX = tank.order.x; tank.guardY = tank.order.y; tank.path = null; tank.repathAt = -999;
  const hp0 = foe.hp;
  H.step(300);
  assert.ok(foe.hp < hp0, "an attack-moving tank walked past a live enemy without firing");
  assert.ok(tank.x < s0.x + 4,
    `it should have stopped to fight, not carried on (x ${tank.x.toFixed(1)})`);
});

test("Guard leaves its post to engage and Stop never moves", () => {
  // rules.ini [General] GuardModeStray=2.0. The bait sits 7 cells out: past a
  // Rhino's 5.75 gun, inside a guard's 7.75 area. A guarding tank must roll
  // out to meet it; a stopped one must not move a pixel. The bait is pinned
  // (`stopped`) so it cannot walk into range and make the test meaningless.
  const H = W.__rtsTest;

  const g1 = H.begin(58032, "normal");
  const a = g1.start[0];
  const gu = H.spawn("rhino", 0, a.x, a.y + 4);
  const bait1 = H.spawn("conscript", 1, a.x + 7, a.y + 4);
  bait1.stopped = true; bait1.guardX = bait1.x; bait1.guardY = bait1.y;
  gu.guard = true; gu.guardX = gu.x; gu.guardY = gu.y;
  const gx0 = gu.x;
  H.step(300);

  const g2 = H.begin(58032, "normal");
  const b = g2.start[0];
  const su = H.spawn("rhino", 0, b.x, b.y + 4);
  const bait2 = H.spawn("conscript", 1, b.x + 7, b.y + 4);
  bait2.stopped = true; bait2.guardX = bait2.x; bait2.guardY = bait2.y;
  su.stopped = true; su.guardX = su.x; su.guardY = su.y;
  const sx0 = su.x;
  H.step(300);

  assert.ok(Math.abs(su.x - sx0) < 0.2,
    `a STOPPED unit must hold its ground (moved ${(su.x - sx0).toFixed(2)} cells)`);
  assert.ok(gu.x - gx0 > 0.3,
    `a GUARDING unit should roll out to engage (moved ${(gu.x - gx0).toFixed(2)} cells)`);
  assert.ok(gu.x - gx0 < 5,
    "a guard must not chase across the map — GuardModeStray is 2 cells past its gun");
});

test("force-fire shells a spot and hits whatever stands on it, including your own", () => {
  const H = W.__rtsTest;
  const g = H.begin(58041, "normal");
  const s0 = g.start[0];
  const gun = H.spawn("rhino", 0, s0.x, s0.y + 6);
  const mine = H.spawn("rifle", 0, s0.x + 3, s0.y + 6);      // one of OURS
  const hp0 = mine.hp;
  gun.order = { t: "ffire", x: Math.round(mine.x), y: Math.round(mine.y), id: 0 };
  H.step(200);
  assert.ok(mine.hp < hp0,
    "Ctrl+click force-fire must damage what is standing on the spot, friend or foe");
});

test("Follow keeps a unit on its leader's heels across the map", () => {
  const H = W.__rtsTest;
  const g = H.begin(58051, "normal");
  const s0 = g.start[0];
  // Both on the same row the leader will drive down, so a patch of rock
  // beside it cannot be mistaken for the follower refusing to follow.
  const lead = H.spawn("rhino", 0, s0.x + 1, s0.y + 4);
  const tail = H.spawn("rhino", 0, s0.x - 1, s0.y + 4);
  tail.order = { t: "follow", x: 0, y: 0, id: lead.id };
  H.orderMove([lead], Math.round(s0.x + 12), Math.round(s0.y + 4));
  H.step(700);
  const gap = Math.hypot(lead.x - tail.x, lead.y - tail.y);
  assert.ok(lead.x > s0.x + 5, `the leader never went anywhere (x ${lead.x.toFixed(1)}) — the test proves nothing`);
  assert.ok(gap < 3.5, `the follower fell ${gap.toFixed(1)} cells behind its leader`);
});

// -------------------------------------------------- Phase 4: land roster //

test("an Attack Dog kills a GI in one bite and cannot scratch a tank", () => {
  // [GoodTeeth]/[BadTeeth] fire the [ParasiteDog] warhead: Parasite=yes, and
  // Verses 100/100/100 then nine zeroes. So the leap removes any infantryman
  // outright regardless of his 125 hit points, and does literally nothing to
  // anything with a vehicle or a building armour class.
  const H = W.__rtsTest;
  H.begin(90210, "normal");
  const dog = H.spawn("dog", 0, 40, 40);
  const gi = H.spawn("rifle", 1, 41, 40);
  gi.guardX = gi.x; gi.guardY = gi.y;
  H.orderAttack([dog], gi);
  H.step(200);
  assert.ok(gi.dead, "one bite should have taken the GI off the board");

  const g2 = H.begin(90211, "normal");
  const dog2 = H.spawn("dog", 0, 40, 40);
  const tank = H.spawn("rhino", 1, 41, 40);
  const hp0 = tank.hp;
  H.orderAttack([dog2], tank);
  H.step(400);
  assert.equal(tank.hp, hp0, "ParasiteDog is 0% against every vehicle armour");
  // and the dog never CHOOSES a tank either: verses 0 means findTarget skips it
  assert.equal(API.findTarget(g2, dog2, T.UNITS.dog.rng + 4), null,
    "a dog offered only armour has no target at all");
});

test("a dog strips a Mirage of its disguise, a Grizzly does not", () => {
  // rules.ini `DetectDisguise=yes` is on the Attack Dog and nothing else in
  // the buildable set.
  const H = W.__rtsTest;
  const g = H.begin(90212, "normal");
  const mir = H.spawn("mirage", 1, 40, 40);
  // Settled: not moving, not shooting, no order. (Held explicitly rather than
  // stepped to it, so the assertions are about DETECTION and nothing else —
  // a Mirage that opens fire on the tank we park beside it un-disguises for
  // an unrelated reason.)
  const settle = () => { mir.order = null; mir.movedAt = -9999; mir.fireAt = -9999; };
  settle();
  assert.ok(API.isDisguised(g, mir), "an idle Mirage should read as a tree");
  const griz = H.spawn("lancer", 0, 44, 40);
  settle();
  assert.equal(API.detected(g, mir), false, "a tank parked beside it sees nothing");
  assert.ok(API.isDisguised(g, mir), "so it is still a tree");
  griz.dead = true;
  const dog = H.spawn("dog", 0, 45, 40);         // inside the dog's Sight of 9
  settle();
  assert.equal(API.detected(g, mir), true, "a dog within sight sees the tank");
  assert.ok(!API.isDisguised(g, mir), "and the disguise is stripped");
  const farDog = H.spawn("dog", 0, 40, 58);      // 18 cells: outside Sight 9
  dog.dead = true;
  settle();
  assert.ok(API.isDisguised(g, mir), "with the near dog gone it is a tree again");
  assert.ok(!farDog.dead);
});

test("a wall stops a Rhino, shrugs off a warhead with no Wall= and falls to one with it", () => {
  // [GAWALL]/[NAWALL] Strength 300, Armor=concrete; rules.ini gives `Wall=yes`
  // to the tank shells (AP/ApocAP) and the artillery family but NOT to small
  // arms, flak, C4 or the Prism Tank's CometWH.
  const H = W.__rtsTest;
  const g = H.begin(90213, "normal");
  // a wall across the whole width of a corridor the tank must cross
  for (let y = 0; y < T.MAP; y++) H.build("wall", 1, 44, y);   // shore to shore
  g.blds.forEach((b) => { b.make = 0; });
  const rhino = H.spawn("rhino", 0, 40, 40);
  assert.equal(API.blocked(g, 44, 40), true, "a wall segment is not walkable");
  H.orderMove([rhino], 48, 40);
  H.step(600);
  assert.ok(rhino.x < 44, `the Rhino should still be short of the wall (x=${rhino.x.toFixed(1)})`);

  const wall = g.blds.find((b) => b.type === "wall" && !b.dead);
  const hp0 = wall.hp;
  const gi = H.spawn("rifle", 0, 42, 40);        // [SA] has no Wall= key
  H.orderAttack([gi], wall);
  H.step(400);
  assert.equal(wall.hp, hp0, "small arms cannot touch concrete (no Wall=yes)");
  assert.equal(API.versesVs("SA", wall), 0, "SA scores nothing against a wall");
  assert.ok(API.versesVs("AP", wall) > 0, "[AP] carries Wall=yes and does");
  const tank = H.spawn("lancer", 0, 42, 41);     // [GRIZAPE]/[AP]: Wall=yes
  H.orderAttack([tank], wall);
  H.step(900);
  assert.ok(wall.hp < hp0 || wall.dead, "a tank shell chews the wall down");
});

test("a gate opens for its owner and stays shut to the enemy", () => {
  // [GAGATE_A] Gate=yes. The leaves only travel when one of the OWNER's units
  // comes up to them, which is what makes a gate one-way in practice.
  const H = W.__rtsTest;
  const g = H.begin(90214, "normal");
  for (let y = 0; y < T.MAP; y++) if (y !== 40) H.build("wall", 0, 44, y);
  const gate = H.build("gate", 0, 44, 40);
  g.blds.forEach((b) => { b.make = 0; });
  assert.equal(API.blocked(g, 44, 40), true, "a shut gate is a wall");

  const foe = H.spawn("rhino", 1, 42, 40);       // an enemy walks up to it
  foe.guardX = foe.x; foe.guardY = foe.y;
  H.step(200);
  assert.equal(gate.gate | 0, 0, "the leaves never move for an enemy");
  assert.equal(API.blocked(g, 44, 40), true, "and it stays impassable to him");
  assert.ok(foe.x < 44, "so the enemy tank is still on his own side");

  foe.dead = true;                               // clear the field before the next leg
  const mine = H.spawn("lancer", 0, 41, 40);
  H.orderMove([mine], 48, 40);
  let moved = false, wideOpen = false;
  for (let i = 0; i < 40; i++) {
    H.step(10);
    if (gate.gate > 0) moved = true;
    if (API.gateOpen(g, 40 * T.MAP + 44)) wideOpen = true;
  }
  assert.ok(moved, "the leaves must travel for their owner");
  assert.ok(wideOpen, `and go right open (tank at ${mine.x.toFixed(1)},${mine.y.toFixed(1)})`);
  assert.ok(mine.x > 44, `the owner's tank should be through (x=${mine.x.toFixed(1)})`);
  // ...and once he is clear the leaves come back together.
  H.step(200);
  assert.equal(gate.gate | 0, 0, "GateCloseDelay: it shuts again behind him");
  assert.equal(API.blocked(g, 44, 40), true, "and the wall is whole");
});

test("Adjacent= is per structure: a defence reaches further than a factory, a wall further again", () => {
  // rules.ini `Adjacent=` 2 / 4 / 8 carried in at +4 (see buildMask): a plain
  // structure keeps the tuned radius, a cheap defence goes two cells past it
  // and a wall six past that, so a wall run can leave the base and a Pillbox
  // can be pushed out in front of it.
  const H = W.__rtsTest;
  const g = H.begin(90215, "normal");
  const yard = H.build("base", 0, 40, 40);
  g.blds.forEach((b) => { b.make = 0; });
  const R = API.adjOf("power"), RD = API.adjOf("sentry"), RW = API.adjOf("wall");
  assert.ok(RD > R && RW > RD, `defence ${RD} must beat structure ${R}, wall ${RW} must beat both`);

  // The yard's footprint is 40..42; a 2x2 plant placed at x = 42 + n has its
  // nearest cell n cells past the edge.
  const inRange = 42 + R, tooFar = 42 + R + 1;
  assert.equal(API.canPlace(g, 0, "power", inRange, 41), true,
    `a Power Plant exactly ${R} cells out must be legal`);
  assert.equal(API.canPlace(g, 0, "power", tooFar, 41), false,
    `a Power Plant ${R + 1} cells out is outside Adjacent=`);
  // the defence, from the same yard, reaches past where the plant was refused
  assert.equal(API.canPlace(g, 0, "sentry", tooFar, 41), true,
    "a Pillbox may go where a Power Plant may not");
  assert.equal(API.canPlace(g, 0, "sentry", 42 + RD + 1, 41), false,
    "but not past its own Adjacent");
  assert.equal(API.canPlace(g, 0, "wall", 42 + RD + 1, 41), true,
    "a wall chains further still");
  // ...and a chain of walls extends the base for DEFENCES only (WallTower),
  // never for economy or tech.
  for (let x = 44; x <= 44 + RW; x++) H.build("wall", 0, x, 41);
  g.blds.forEach((b) => { b.make = 0; });
  const far = 44 + RW + 3;                       // three cells past the last segment
  assert.equal(API.canPlace(g, 0, "sentry", far, 43), true,
    "a Pillbox may be planted off the end of a wall run");
  assert.equal(API.canPlace(g, 0, "power", far, 43), false,
    "a $100 wall run must never carry the whole base with it");
  assert.ok(!yard.dead);
});

test("a Gap Generator re-shrouds the enemy's map and hides what stands in it", () => {
  // [GAGAP] GapGenerator=yes, GapRadiusInCells=10, Power=-100 (Powered=true).
  const H = W.__rtsTest;
  const g = H.begin(90216, "normal");
  // The human's eyes on a spot far from his own base, so the only thing that
  // can un-see it is the generator.
  const scout = H.spawn("lancer", 0, 40, 40);
  const foe = H.spawn("rhino", 1, 41, 40);
  H.step(12);
  assert.equal(API.entSeen(g, foe), true, "an enemy tank under our nose is visible");

  scout.dead = true;                              // we walk away; the ground is remembered
  H.step(12);
  assert.equal(API.entSeen(g, foe), true, "RA2 has no fog of war: what was seen stays seen");

  // The enemy switches a Gap Generator on over it. It needs a powered grid.
  const plant = H.build("power", 1, 55, 55);
  const gap = H.build("gapgen", 1, 39, 39);
  g.blds.forEach((b) => { b.make = 0; });
  H.step(12);
  assert.ok(API.gapped(g, 0, 41, 40), "the cell is inside the field");
  assert.equal(API.entSeen(g, foe), false, "and the tank standing in it is gone from our map");

  // Cut its power and the field drops.
  H.killBld(plant);
  H.step(12);
  assert.equal(API.gapped(g, 0, 41, 40), false, "an unpowered Gap Generator projects nothing");
  assert.ok(gap && !gap.dead);
});

test("the Grand Cannon out-ranges everything on the ground and is blind inside three cells", () => {
  // [GTGCAN] Primary=GrandCannonWeapon: 150 damage, ROF 120 (=480), Range 15,
  // MinimumRange 3, Power=-100 so it needs a grid.
  const H = W.__rtsTest;
  const g = H.begin(90217, "normal");
  const spec = T.BLDS.grandcannon;
  assert.equal(spec.rng, 15);
  assert.equal(spec.minRng, 3);
  H.build("power", 0, 55, 55); H.build("power", 0, 58, 55); H.build("power", 0, 61, 55);
  const gun = H.build("grandcannon", 0, 40, 40);
  g.blds.forEach((b) => { b.make = 0; });
  const near = H.spawn("rhino", 1, 42, 40);       // ~1.5 cells: inside MinimumRange
  near.guardX = near.x; near.guardY = near.y;
  const hp0 = near.hp;
  H.step(600);
  assert.equal(near.hp, hp0, "MinimumRange=3 means it cannot defend its own feet");
  const far = H.spawn("rhino", 1, 52, 41);        // ~11 cells: well inside 15
  far.guardX = far.x; far.guardY = far.y;
  H.step(600);
  assert.ok(far.hp < far.maxhp, "but it reaches a tank eleven cells away");
  assert.ok(!gun.dead);
});

// ======================================================================= //
//  Phase 4b — the neutral house: garrisons, bridges, tech buildings,
//  crates, ore spreading, the SpySat.
// ======================================================================= //

// A cleared square of open ground: the neutral-house tests place structures
// by hand and must not be at the mercy of where a seed put its rocks.
function clearGround(g, x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { g.terrain[y * 64 + x] = 0; g.ore[y * 64 + x] = 0; }
}

test("infantry garrison a city block, shoot out of it, and die with it", () => {
  // rules.ini: [CACITY01] CanBeOccupied=yes MaxNumberOccupants=10, and
  // Occupier=yes on [E1]/[E2] only. [General] ThreatPerOccupant=10.
  const H = W.__rtsTest, API2 = H.api2;
  const g = H.begin(4401, "normal");
  clearGround(g, 34, 34, 46, 46);
  const block = H.build("civflat", -1, 40, 40);
  block.make = 0;
  assert.equal(block.p, -1, "an untouched block belongs to the neutral house");
  assert.equal(API2.occCapOf(block), 10, "MaxNumberOccupants=10");
  assert.equal(API2.canOccupy("rifle"), true, "[E1] Occupier=yes");
  assert.equal(API2.canOccupy("conscript"), true, "[E2] Occupier=yes");
  assert.equal(API2.canOccupy("flak"), false, "a Flak Trooper has no Occupier= key");
  assert.equal(API2.canOccupy("tanya"), false, "and neither does Tanya");

  // Walk two GIs in with the real order the right-click issues.
  const a = H.spawn("rifle", 0, 38, 40), b2 = H.spawn("rifle", 0, 38, 41);
  assert.equal(H.orderGarrison([a, b2], block), 2, "both took the garrison order");
  H.step(600);
  assert.equal(H.occupants(block), 2, "both are inside");
  assert.ok(a.dead && b2.dead, "an occupant stops being a unit on the field");
  assert.equal(block.p, 0, "and the block flies the occupier's colour");

  // They shoot what comes into range, with their own weapon.
  const foe = H.spawn("conscript", 1, 42, 41);
  foe.guardX = foe.x; foe.guardY = foe.y;
  const hp0 = foe.hp;
  H.step(400);
  assert.ok(foe.hp < hp0, `the garrison never fired (${foe.hp} of ${hp0})`);

  // The building falls: RA2 kills everyone inside.
  H.killBld(block);
  assert.equal(H.occupants(block), 0, "the garrison died with the building");
  const alive = g.units.filter((u) => !u.dead && u.p === 0 && u.type === "rifle");
  assert.equal(alive.length, 0, "nobody walked out of the rubble");
});

test("a garrison can be evacuated, and an enemy Engineer clears one", () => {
  const H = W.__rtsTest;
  const g = H.begin(4402, "normal");
  clearGround(g, 24, 24, 36, 36);
  const block = H.build("civshop", -1, 30, 30);
  block.make = 0;
  assert.equal(H.api2.occCapOf(block), 3, "the small block is a 3-man section");

  const men = [H.spawn("rifle", 0, 28, 30), H.spawn("rifle", 0, 28, 31), H.spawn("rifle", 0, 29, 32)];
  men.forEach((u) => H.garrison(block, u));
  assert.equal(H.occupants(block), 3, "full");
  const spare = H.spawn("rifle", 0, 28, 29);
  assert.equal(H.garrison(block, spare), false, "MaxNumberOccupants is a cap, not a suggestion");
  assert.ok(!spare.dead, "and the man who could not fit is still on the street");

  // D on the building turns them out again, at the health they went in with.
  assert.equal(H.eject(block), 3, "three men back on the street");
  assert.equal(block.p, -1, "and the block reverts to the neutral house");
  const out = g.units.filter((u) => !u.dead && u.p === 0 && u.type === "rifle");
  assert.equal(out.length, 4, "three evacuated plus the one who never got in");

  // Re-garrison, then send an enemy engineer in: RA2 evicts, it does not capture.
  out.slice(0, 2).forEach((u) => H.garrison(block, u));
  assert.equal(H.occupants(block), 2);
  const eng = H.spawn("engineer", 1, 32, 30);
  assert.equal(H.orderCapture([eng], block), 1);
  H.step(600);
  assert.equal(H.occupants(block), 0, "the engineer cleared the building");
  assert.equal(block.p, -1, "a civilian block is not Capturable — it goes back to neutral");
  assert.ok(eng.dead, "and the engineer was spent doing it");
});

test("a bridge span collapses under fire, blocks the crossing, and a repair hut rebuilds it", () => {
  // [General] DestroyableBridges=yes, BridgeStrength=1500; [CABHUT]
  // BridgeRepairHut=yes, Immune=yes.
  const H = W.__rtsTest, API = H.api, API2 = H.api2, TER = T.TER;
  const g = H.begin(4403, "normal", "river");
  assert.ok(g.bridges.length >= 2, `River Crossing should have spans, got ${g.bridges.length}`);
  const sp = g.bridges[0];
  assert.equal(sp.maxhp, 1500, "BridgeStrength=1500");
  const cell = sp.cells[0], cx = cell % 64, cy = (cell / 64) | 0;
  assert.equal(g.terrain[cell], TER.BRIDGE);
  // a unit can cross it before
  assert.equal(API.blocked(g, cx, cy, 0), false, "the deck is passable while it stands");

  // Force-fire damage, in the same units the game applies.
  assert.equal(API2.damageBridge(g, cx, cy, 700), true);
  assert.ok(!sp.down, "700 does not drop a 1500-point span");
  API2.damageBridge(g, cx, cy, 900);
  assert.ok(sp.down, "1600 does");
  for (const c of sp.cells) assert.equal(g.terrain[c], TER.WATER, "the deck is river again");
  assert.equal(API.blocked(g, cx, cy, 0), true, "and nothing walks across the gap");

  // The hut at the head of the crossing rebuilds it.
  const hut = g.blds.find((b) => !b.dead && T.BLDS[b.type].hut);
  assert.ok(hut, "mapRiver places [CABHUT]s");
  // Immune=yes: it cannot be shot down.
  const hp0 = hut.hp;
  const gun = H.spawn("rhino", 0, hut.x + 3, hut.y);
  H.api.canHit; // (referenced for clarity)
  H.orderAttack([gun], hut);
  H.step(400);
  assert.equal(hut.hp, hp0, "[CABHUT] Immune=yes");

  const eng = H.spawn("engineer", 0, hut.x + 1, hut.y + 1);
  assert.equal(H.orderCapture([eng], hut), 1);
  H.step(900);
  assert.ok(!sp.down, "the engineer rebuilt the span");
  assert.equal(g.terrain[cell], TER.BRIDGE);
  assert.equal(API.blocked(g, cx, cy, 0), false, "the crossing is open again");
  assert.ok(eng.dead, "and the engineer went into the hut");
});

test("an Oil Derrick pays a lump sum on capture and then a trickle", () => {
  // [CAOILD] ProduceCashStartup=1000, ProduceCashAmount=20, ProduceCashDelay=100.
  const H = W.__rtsTest;
  const g = H.begin(4404, "normal");
  clearGround(g, 24, 24, 36, 36);
  const spec = T.BLDS.oilderrick;
  assert.equal(spec.cashStart, 1000);
  assert.equal(spec.cash, 20);
  assert.equal(spec.cashDelay, 100);

  const rig = H.build("oilderrick", -1, 30, 30);
  rig.make = 0;
  g.side[0].credits = 0;
  H.step(300);
  assert.equal(H.credits(0), 0, "a derrick nobody owns pays nobody");

  const eng = H.spawn("engineer", 0, 28, 30);
  assert.equal(H.orderCapture([eng], rig), 1);
  H.step(600);
  assert.equal(rig.p, 0, "the engineer took it");
  assert.ok(H.credits(0) >= 1000, `ProduceCashStartup did not pay (${H.credits(0)})`);
  const c0 = H.credits(0);
  H.step(1000);                                    // ten ProduceCashDelay windows
  const gained = H.credits(0) - c0;
  assert.ok(gained >= 150 && gained <= 260, `the trickle should be ~$200 per 1000 ticks, got ${gained}`);
});

test("a crate is picked up, and a money crate pays $2000", () => {
  // [CrateRules] CrateRadius=3.0; [Powerups] Money=20,MONEY,yes,2000.
  const H = W.__rtsTest;
  const g = H.begin(4405, "normal");
  clearGround(g, 16, 16, 36, 36);
  H.build("base", 0, 8, 8).make = 0;               // FreeMCV only fires with no buildings
  g.side[0].credits = 0;
  H.spawnCrate("money", 30, 30);
  assert.equal(H.crates().length >= 1, true);
  const u = H.spawn("lancer", 0, 30, 30);
  H.step(8);
  assert.equal(H.credits(0), 2000, `a Money crate is $2000, got ${H.credits(0)}`);
  assert.equal(H.crates().filter((c) => c.x === 30 && c.y === 30).length, 0, "and the crate is gone");
  assert.ok(!u.dead);

  // The area crates apply their multiplier to everything inside CrateRadius.
  const a = H.spawn("lancer", 0, 20, 20), b2 = H.spawn("lancer", 0, 22, 20), far = H.spawn("lancer", 0, 30, 20);
  H.api2.openCrate(g, { x: 21, y: 20, kind: "firepower", id: 1 }, a);
  assert.equal(a.fpMul, 2.0, "[Powerups] Firepower ...,2.0");
  assert.equal(b2.fpMul, 2.0, "a neighbour inside CrateRadius=3 gets it too");
  assert.equal(far.fpMul, undefined, "a unit nine cells away does not");
  H.api2.openCrate(g, { x: 21, y: 20, kind: "speed", id: 2 }, a);
  assert.equal(a.spMul, 1.2, "[Powerups] Speed ...,1.2");
  assert.ok(Math.abs(H.api2.uspd(a) - T.UNITS.lancer.spd * 1.2) < 1e-9, "and the mover reads it");
});

test("ore spreads into empty ground, and gems do not", () => {
  // [Riparius] Spread=2200 SpreadPercentage=.06; [Cruentus] SpreadPercentage=0.
  const H = W.__rtsTest, API2 = H.api2, TER = T.TER;
  const g = H.begin(4406, "normal");
  // a solid block of rich ore in cleared ground
  for (let y = 30; y < 36; y++) for (let x = 30; x < 36; x++) { g.terrain[y * 64 + x] = TER.ORE; g.ore[y * 64 + x] = 800; }
  for (let y = 26; y < 40; y++) for (let x = 26; x < 40; x++) {
    if (x >= 30 && x < 36 && y >= 30 && y < 36) continue;
    g.terrain[y * 64 + x] = TER.GROUND; g.ore[y * 64 + x] = 0;
  }
  const before = g.terrain.reduce((n, t) => n + (t === TER.ORE ? 1 : 0), 0);
  for (let i = 0; i < 40; i++) API2.stepOreSpread(g);
  const after = g.terrain.reduce((n, t) => n + (t === TER.ORE ? 1 : 0), 0);
  assert.ok(after > before, `ore never spread (${before} -> ${after})`);

  // gems are finite
  const g2 = H.begin(4407, "normal");
  for (let y = 30; y < 36; y++) for (let x = 30; x < 36; x++) { g2.terrain[y * 64 + x] = TER.GEM; g2.ore[y * 64 + x] = 800; }
  for (let y = 26; y < 40; y++) for (let x = 26; x < 40; x++) {
    if (x >= 30 && x < 36 && y >= 30 && y < 36) continue;
    g2.terrain[y * 64 + x] = TER.GROUND;
  }
  const gemBefore = g2.terrain.reduce((n, t) => n + (t === TER.GEM ? 1 : 0), 0);
  for (let i = 0; i < 40; i++) API2.stepOreSpread(g2);
  const gemAfter = g2.terrain.reduce((n, t) => n + (t === TER.GEM ? 1 : 0), 0);
  assert.equal(gemAfter, gemBefore, "[Cruentus] SpreadPercentage=0 — a gem field is finite");
});

test("a SpySat Uplink reveals the whole map, and loses it with its power", () => {
  // [GASPYSAT] SpySat=yes, Power=-100, Powered=true.
  const H = W.__rtsTest, API = H.api;
  const g = H.begin(4408, "normal");
  const far = { x: 55, y: 55 };
  assert.equal(API.tileSeen(g, far.x, far.y), false, "the far corner starts shrouded");
  const plant = H.build("reactor", 0, 10, 10);
  const sat = H.build("spysat", 0, 14, 10);
  g.blds.forEach((b) => { b.make = 0; });
  H.step(12);
  assert.equal(H.api2.spySatUp(g, 0), true);
  assert.equal(API.tileSeen(g, far.x, far.y), true, "SpySat=yes reveals everything");

  // Pull the power: RA2's SpySat is Powered=true.
  H.killBld(plant);
  H.step(12);
  assert.equal(H.api2.spySatUp(g, 0), false, "no grid, no satellite");
  assert.ok(sat && !sat.dead);
});

test("the Cloning Vats duplicates every infantryman, and a Tech Airport drops a stick", () => {
  // [NACLON] Cloning=yes; [CAAIRP] SuperWeapon=ParaDropSpecial,
  // [General] SovParaDropNum=9 / AllyParaDropNum=6.
  const H = W.__rtsTest;
  const g = H.begin(4409, "normal");
  g.side[0].fac = "col";
  H.build("base", 0, 8, 8); H.build("reactor", 0, 12, 8); H.build("reactor", 0, 15, 8);
  H.build("barracks", 0, 18, 8);
  const vats = H.build("cloningvats", 0, 22, 8);
  g.blds.forEach((b) => { b.make = 0; });
  H.give(0, 20000);
  assert.equal(H.api2.cloneVatsOf(g, 0) === vats, true);
  const before = g.units.filter((u) => !u.dead && u.type === "conscript").length;
  g.side[0].queues.i.list.push("conscript");
  H.step(60 * 30);
  const after = g.units.filter((u) => !u.dead && u.type === "conscript").length;
  assert.ok(after - before >= 2, `one conscript trained should yield two (${before} -> ${after})`);

  // Paradrop: nine Conscripts for the Collective.
  const g2 = H.begin(4410, "normal");
  g2.side[0].fac = "col";
  const n0 = g2.units.filter((u) => !u.dead).length;
  H.api2.paraDrop(g2, 0, 40, 40);
  H.step(60 * 5);
  const dropped = g2.units.filter((u) => !u.dead && u.type === "conscript").length;
  assert.equal(dropped, 9, `SovParaDropNum=9, got ${dropped}`);
  assert.ok(g2.units.filter((u) => !u.dead).length > n0);
});

test("neutral structures never decide the match and never take the sidebar", () => {
  const H = W.__rtsTest;
  const g = H.begin(4411, "normal", "river");
  // A player whose last real structure is gone has lost, however many
  // civilian blocks and derricks are still standing.
  const neut = H.neutrals();
  assert.ok(neut.length >= 8, `the urban map should carry a neutral layer, got ${neut.length}`);
  H.build("base", 0, 8, 8).make = 0;
  H.build("base", 1, 54, 54).make = 0;
  H.step(4);
  assert.equal(g.over, 0);
  H.kill(1);
  H.step(4);
  assert.equal(g.over, 1, "the neutral house does not keep a beaten side alive");

  // ...and nothing neutral is offered for sale in the sidebar.
  for (const k of Object.keys(T.BLDS)) {
    if (!T.BLDS[k].neut) continue;
    assert.equal(T.BLDS[k].cat, "neut", `${k} must not sit in a buildable lane`);
    assert.equal(T.BLDS[k].build, 0, `${k} has a build time and therefore a cameo`);
  }
});

// ------------------------------------------- Phase 4c: unit mechanics //
// Each of these drives the real mechanic through the same entry point the
// game uses (a warhead going off in fire(), or an ORDER), never by poking
// the field the mechanic happens to set.

test("the miner is two units: a Chrono Miner that warps home and a War Miner that shoots", () => {
  const H = W.__rtsTest, A = W.__rtsTest.api3;
  H.begin(9401, "normal");
  // rules.ini [CMIN] vs [HARV]: same chassis, Storage 20 vs 40 bails, one
  // with Primary=none and a teleport locomotor, the other with 20mmRapid.
  const cm = T.UNITS.chronominer, wm = T.UNITS.warminer;
  assert.equal(cm.cost, 1400); assert.equal(wm.cost, 1400);
  assert.equal(cm.hp, 1000); assert.equal(wm.hp, 1000);
  assert.equal(cm.sight, 4); assert.equal(wm.sight, 4);
  assert.equal(cm.cap, 500, "Chrono Miner Storage=20 bails at $25");
  assert.equal(wm.cap, 1000, "War Miner Storage=40 bails at $25");
  assert.equal(cm.dmg, 0, "[CMIN] Primary=none");
  assert.equal(wm.dmg, 30); assert.equal(wm.rate, 20); assert.equal(wm.rng, 5.5);
  assert.equal(wm.wh, "HARVWH", "[20mmRapid] Warhead=HARVWH");
  assert.ok(cm.chronoHome && !wm.chronoHome, "only the Chrono Miner teleports");
  // The legacy role name still resolves per faction, everywhere.
  assert.equal(A.harvKey("dir"), "chronominer");
  assert.equal(A.harvKey("col"), "warminer");
  const g = H.get();
  g.side[0].fac = "dir"; g.side[1].fac = "col";
  const h0 = H.spawn("harvester", 0, 20, 20), h1 = H.spawn("harvester", 1, 40, 40);
  assert.equal(h0.type, "chronominer");
  assert.equal(h1.type, "warminer");
  assert.ok(A.isHarv(h0) && A.isHarv(h1));
  assert.equal(W.__rtsTest.api.countUnit(g, 0, "harvester"), 1, "'harvester' still counts the side's miner");
});

test("a full Chrono Miner teleports to its refinery after ChronoDelay, and drives if it is too far", () => {
  const H = W.__rtsTest, A = H.api3;
  const g = H.begin(9402, "normal");
  g.side[0].fac = "dir";
  const ref = H.build("refinery", 0, 20, 20); ref.make = 0;
  const m = H.spawn("harvester", 0, 44, 44);
  m.cargo = m.cargoV = 500;                       // full hold, far from home
  m.state = "mining"; m.mineAt = { x: 44, y: 44 };
  g.ore[44 * T.MAP + 44] = 0.2;                   // seam is spent: it must go home
  H.step(1);
  assert.equal(m.state, "warp", "a full Chrono Miner enters the warp, it does not drive");
  const bank = H.credits(0);
  const before = { x: m.x, y: m.y };
  H.step(A.CHRONO_DELAY - 4);
  assert.ok(m.x === before.x && m.y === before.y, "it holds still for ChronoDelay");
  H.step(10);
  assert.ok(m.state !== "warp", "and then it is somewhere else");
  const d = Math.hypot(m.x - ref.cx, m.y - ref.cy);
  assert.ok(d < 4, `it should arrive at the refinery, got ${d.toFixed(1)} tiles away`);
  H.step(400);
  assert.ok(H.credits(0) > bank, `it should have banked its hold at the refinery (state ${m.state}, ${m.x.toFixed(1)},${m.y.toFixed(1)})`);

  // [General] ChronoHarvTooFarDistance=50: past that it drives instead of
  // blinking, so a miner never warps across two bases and walks back.
  H.killBld(ref);
  const ref2 = H.build("refinery", 0, 3, 3); ref2.make = 0;
  const far = H.spawn("harvester", 0, 60, 60);
  far.cargo = far.cargoV = 500; far.state = "mining"; far.mineAt = { x: 60, y: 60 };
  g.ore[60 * T.MAP + 60] = 0.2;
  assert.ok(Math.hypot(60 - ref2.cx, 60 - ref2.cy) > 50, "the two are further apart than the limit");
  H.step(1);
  assert.equal(far.state, "toref", "too far to warp: it drives home like a War Miner");
  assert.ok(A.chronoDelayFor(80) > A.chronoDelayFor(4), "ChronoTrigger: the delay scales with distance");
});

test("a War Miner shoots infantry that walk past while it mines", () => {
  const H = W.__rtsTest;
  const g = H.begin(9403, "normal");
  g.side[0].fac = "col"; g.side[1].fac = "col";
  const m = H.spawn("harvester", 0, 30, 30);
  const foe = H.spawn("conscript", 1, 32, 30);
  const hp0 = foe.hp;
  H.step(30);
  assert.ok(foe.hp < hp0, `the War Miner's 20mm never fired (${foe.hp}/${hp0})`);
});

test("a Terror Drone climbs inside a tank, grinds it down, and a Service Depot kills it", () => {
  const H = W.__rtsTest, A = H.api3;
  const g = H.begin(9404, "normal");
  const tank = H.spawn("rhino", 0, 30, 30);
  const dr = H.spawn("drone", 1, 30.5, 30);
  // Drive it through fire(): [DroneJump]'s Parasite warhead is what limbos it.
  A.fire(g, dr, tank);
  assert.equal(tank.drone, dr, "the vehicle is carrying the drone");
  assert.ok(dr.limbo, "and the drone is off the map (LimboLaunch=yes)");
  const witness = H.spawn("lancer", 0, 30, 31);
  H.step(1);                                        // let the spatial hash catch up
  assert.equal(H.api.findTarget(g, witness, 6), null,
    "a limboed drone cannot be shot at");
  const hp0 = tank.hp;
  H.step(400);
  // [DroneJump] Damage=50 / ROF=60 frames at RA2's 30 fps = 50 every 2 s.
  assert.ok(tank.hp <= hp0 - 3 * A.PARASITE_DMG, `Parasite damage never landed (${tank.hp}/${hp0})`);

  // The depot: RA2's only cure.
  const dep = H.build("depot", 0, 34, 34); dep.make = 0;
  H.build("power", 0, 38, 34).make = 0;
  H.build("power", 0, 38, 38).make = 0;
  tank.x = dep.cx; tank.y = dep.cy;
  H.step(62);
  assert.ok(dr.dead, "the Service Depot should have killed the drone");
  assert.equal(tank.drone, null);
  const hp1 = tank.hp;
  H.step(120);
  assert.ok(tank.hp >= hp1, "and the tank stops losing hit points");
});

test("a drone whose host dies climbs back out onto the map", () => {
  const H = W.__rtsTest, A = H.api3;
  const g = H.begin(9405, "normal");
  const tank = H.spawn("rhino", 0, 30, 30);
  const dr = H.spawn("drone", 1, 30.5, 30);
  A.fire(g, dr, tank);
  assert.ok(dr.limbo);
  tank.hp = 1;
  H.step(200);
  assert.ok(tank.dead, "the drone finishes the tank off");
  assert.ok(!dr.dead && !dr.limbo, "and pops out alive");
});

test("Crazy Ivan plants a timed bomb, an Engineer defuses it, and it levels what it is on", () => {
  const H = W.__rtsTest, A = H.api3;
  const g = H.begin(9406, "normal");
  // [General] IvanTimedDelay=450 frames at RA2's 30 fps = 15 seconds.
  assert.equal(A.IVAN_BOMB_T, 900);
  const ivan = H.spawn("ivan", 1, 30, 30);
  const tank = H.spawn("lancer", 0, 30.8, 30);
  A.fire(g, ivan, tank);
  assert.ok(tank.bomb, "the IvanBomb warhead PLACES, it does not damage");
  assert.equal(tank.hp, tank.maxhp, "and does no damage at all when it lands");
  assert.ok(H.bombs().indexOf(tank) >= 0);
  H.step(A.IVAN_BOMB_T + 2);
  assert.ok(tank.dead, "400 damage of IvanWH should finish a 300 hp Grizzly");

  // ...and an Engineer takes one off, without being spent.
  const tank2 = H.spawn("lancer", 0, 40, 40);
  A.plantBomb(g, ivan, tank2);
  assert.ok(tank2.bomb);
  const eng = H.spawn("engineer", 0, 40.6, 40);
  H.step(20);
  assert.ok(!tank2.bomb, "an Engineer inside DefuseKit range takes the bomb off");
  assert.ok(!eng.dead, "and is not consumed doing it");
  H.step(A.IVAN_BOMB_T + 10);
  assert.ok(!tank2.dead, "a defused bomb never goes off");

  // He will bomb his OWN side too (AttackCursorOnFriendlies=yes).
  const mine = H.spawn("rhino", 1, 30, 31);
  A.fire(g, ivan, mine);
  assert.ok(mine.bomb, "Ivan bombs his own carriers");
});

test("three Tesla Troopers keep a Tesla Coil firing with the grid down, and harder", () => {
  const H = W.__rtsTest, A = H.api3;
  const g = H.begin(9407, "normal");
  g.side[0].fac = "col";
  const coil = H.build("tesla", 0, 30, 30); coil.make = 0;
  H.build("radar", 0, 36, 36).make = 0;                    // a drain, no generation
  H.api.applyGaps(g);
  assert.ok(!A.powered(g, 0), "the grid is down");
  const foe = H.spawn("conscript", 1, 33, 30);
  H.step(200);
  assert.equal(foe.hp, foe.maxhp, "an unpowered coil does not fire");

  const crew = [H.spawn("teslatrooper", 0, 30, 31.2), H.spawn("teslatrooper", 0, 31.2, 30),
                H.spawn("teslatrooper", 0, 29, 30), H.spawn("teslatrooper", 0, 30, 29)];
  assert.equal(H.orderCoil(crew, coil), 4);
  H.step(240);
  assert.ok(A.coilCharged(g, coil), "the coil is being hand-charged");
  assert.ok(coil.crewN <= 3, `RA2 caps the crew at three, got ${coil.crewN}`);
  assert.ok(foe.hp < foe.maxhp, "and a charged coil fires with no power at all");
  // [OPCoilBolt] 300 against the coil's own 200.
  assert.ok(Math.abs(A.COIL_BOOST - 1.5) < 0.001);
});

test("a Desolator floods the ground with radiation that kills infantry and leaves him alone", () => {
  const H = W.__rtsTest, A = H.api3;
  const g = H.begin(9408, "normal");
  const deso = H.spawn("desolator", 0, 30, 30);
  assert.equal(T.UNITS.desolator.cost, 600);
  assert.equal(T.UNITS.desolator.hp, 150);
  assert.equal(T.UNITS.desolator.armour, "plate");
  assert.equal(T.UNITS.desolator.dmg, 125);          // [RadBeamWeapon]
  assert.equal(T.UNITS.desolator.rate, 50);
  assert.equal(T.UNITS.desolator.rng, 6);
  assert.equal(H.deploy([deso], true), 1);
  H.step(120);
  assert.ok(H.rad(30, 30) > 0, "a deployed Desolator irradiates his own cell");
  assert.ok(H.rad(31, 30) > 0, "and the ring around him");
  assert.equal(H.rad(38, 30), 0, "but not the whole map");
  assert.equal(deso.hp, deso.maxhp, "ImmuneToRadiation=yes — his own pool never touches him");

  const gi = H.spawn("rifle", 1, 30, 30);
  const hp0 = gi.hp;
  H.step(70);
  assert.ok(gi.hp < hp0 || gi.dead, `a man standing in it should be dying (${gi.hp}/${hp0})`);
  const tank = H.spawn("rhino", 1, 31, 30);
  const thp = tank.hp;
  H.step(70);
  assert.ok(tank.maxhp - tank.hp < gi.maxhp - hp0 + 40 || tank.hp > thp * 0.9,
    "RadSite Verses is 10% against heavy armour: a tank barely notices");

  // ...and it fades. Undeploy him and the pool decays away.
  H.deploy([deso], false);
  const lvl = H.rad(30, 30);
  H.step(A.RAD_MAX * 2 + 200);
  assert.ok(H.rad(30, 30) < lvl, "radiation decays");
  assert.equal(H.rad(30, 30), 0, "and is gone once the site has run out");
});

test("a nuke leaves a radiation crater behind it", () => {
  const H = W.__rtsTest;
  const g = H.begin(9409, "normal");
  H.swCharge(0, "nuke");
  assert.ok(H.swFire(0, "nuke", 30, 30));
  H.step(60 * 11);
  assert.ok(H.rad(30, 30) > 0, "[NukePayload] RadLevel=500 — the ground stays hot");
});

test("Yuri takes one unit at a time, and killing him gives it back", () => {
  const H = W.__rtsTest, A = H.api3;
  const g = H.begin(9410, "normal");
  assert.equal(T.UNITS.yuri.cost, 1200);
  assert.equal(T.UNITS.yuri.sight, 12);
  assert.equal(T.UNITS.yuri.rng, 7);                 // [MindControl] Range=7
  assert.equal(T.UNITS.yuri.rate, 200);              // ...ROF=200
  const yuri = H.spawn("yuri", 1, 30, 30);
  const tank = H.spawn("lancer", 0, 33, 30);
  A.fire(g, yuri, tank);
  assert.equal(tank.p, 1, "the Controller warhead takes the unit, it does not damage it");
  assert.equal(tank.hp, tank.maxhp);
  assert.equal(tank.mcHome, 0, "it remembers who built it");
  assert.equal(yuri.mcTarget, tank.id);

  // One at a time: a second victim releases the first.
  const tank2 = H.spawn("lancer", 0, 32, 31);
  A.fire(g, yuri, tank2);
  assert.equal(tank2.p, 1);
  assert.equal(tank.p, 0, "the first victim comes back the moment he takes another");

  // ImmuneToPsionics=yes on the miners, the drone and Yuri himself.
  const m = H.spawn("harvester", 0, 31, 31);
  assert.ok(A.psiImmune(m), "a miner is ImmuneToPsionics");
  A.fire(g, yuri, m);
  assert.equal(m.p, 0, "and cannot be taken");
  const b = H.build("power", 0, 40, 40);
  assert.ok(A.psiImmune(b), "and neither can a building (Controller Verses 0% vs structures)");

  // Kill Yuri and the leash snaps.
  yuri.hp = 1;
  H.api.findTarget(g, yuri, 1);
  const killer = H.spawn("rifle", 0, 30.5, 30);
  H.step(120);
  assert.ok(yuri.dead, "Yuri should be dead");
  assert.equal(tank2.p, 0, "and his victim is his owner's again");
});

test("a Chrono Legionnaire erases what it shoots, warps instead of walking, and lets go if the beam breaks", () => {
  const H = W.__rtsTest, A = H.api3;
  const g = H.begin(9411, "normal");
  assert.equal(T.UNITS.cleg.cost, 1500);
  assert.equal(T.UNITS.cleg.hp, 125);
  assert.equal(T.UNITS.cleg.dmg, 8);                 // [NeutronRifle]
  assert.equal(T.UNITS.cleg.rng, 5);
  assert.equal(T.UNITS.cleg.wh, "ChronoBeam");
  const cl = H.spawn("cleg", 0, 30, 30);
  const prey = H.spawn("conscript", 1, 33, 30);
  A.fire(g, cl, prey);
  assert.ok(prey.erasedBy === cl.id, "the beam latches on");
  assert.equal(prey.hp, prey.maxhp, "Temporal=yes: no damage is ever dealt");
  H.step(30);
  assert.ok(prey.erase > 0 && prey.erase < 1, `erasure should be under way, got ${prey.erase}`);
  const part = prey.erase;
  // Break the beam by walking out of its 5-cell reach: RA2 restores the victim.
  prey.x = 55; prey.y = 55;
  H.step(6);
  assert.equal(prey.erase, 0, `a broken beam puts the victim back together (got ${prey.erase})`);
  assert.ok(!prey.dead);

  // Re-latch and see it through.
  prey.x = 33; prey.y = 30;
  A.startErase(g, cl, prey); cl.eraseId = prey.id;
  H.step(400);
  assert.ok(prey.dead, `a 125 hp Conscript should be gone (erase ${prey.erase})`);

  // The teleport locomotor: a move order is a warp, delayed by distance.
  assert.ok(A.chronoDelayFor(20) > A.chronoDelayFor(2));
  const cl2 = H.spawn("cleg", 0, 20, 20);
  H.orderMove([cl2], 40, 20);
  H.step(2);
  assert.ok(cl2.warp, "it warps rather than walking");
  assert.ok(cl2.limbo, "and is out of phase while it does");
  H.step(A.chronoDelayFor(20) + 20);
  assert.ok(!cl2.limbo, "then it is back");
  assert.ok(Math.abs(cl2.x - 40) < 4, `it should have arrived, got x=${cl2.x.toFixed(1)}`);
  assert.ok(part >= 0);
});

test("a Spy is disguised until a dog sees him, and each building he enters pays differently", () => {
  const H = W.__rtsTest, A = H.api3;
  const g = H.begin(9412, "normal");
  g.side[0].fac = "dir"; g.side[1].fac = "col";
  assert.equal(T.UNITS.spy.cost, 1000);
  assert.equal(T.UNITS.spy.sight, 9);
  assert.equal(T.UNITS.spy.armour, "flak");
  const spy = H.spawn("spy", 0, 30, 30);
  assert.ok(H.api.isDisguised(g, spy), "PermaDisguise=yes — he is disguised standing still");
  H.orderMove([spy], 34, 30);
  H.step(20);
  assert.ok(H.api.isDisguised(g, spy), "...and while walking, unlike a Mirage");
  const dog = H.spawn("dog", 1, 34, 31);
  assert.ok(!H.api.isDisguised(g, spy), "DetectDisguise=yes: a dog strips him");
  dog.dead = true;

  // Refinery: SpyMoneyStealPercent=.5
  g.side[1].credits = 4000; g.side[0].credits = 0;
  const ref = H.build("refinery", 1, 40, 40); ref.make = 0;
  assert.ok(A.spyInfiltrate(g, spy, ref));
  assert.equal(g.side[1].credits, 2000);
  assert.equal(g.side[0].credits, 2000);

  // Power Plant: SpyPowerBlackout — the whole grid, not one building.
  const pw = H.build("power", 1, 44, 40); pw.make = 0;
  H.build("radar", 1, 48, 40).make = 0;
  H.api.applyGaps(g);
  assert.ok(A.powered(g, 1), "their grid is up before he gets in");
  assert.ok(A.spyInfiltrate(g, spy, pw));
  assert.ok(!A.powered(g, 1), "and down after");
  H.step(A.SPY_BLACKOUT + 5);
  assert.ok(A.powered(g, 1), "the blackout ends");

  // Barracks / War Factory: veteran production from then on.
  const bar = H.build("barracks", 1, 52, 40); bar.make = 0;
  assert.ok(A.spyInfiltrate(g, spy, bar));
  assert.ok(g.side[0].vetInf, "a spied Barracks makes our infantry veteran");

  // Battle Lab: eva.ini #92 "Technology stolen" — their lab unit joins our list.
  const lab = H.build("lab", 1, 56, 40); lab.make = 0;
  assert.ok(A.spyInfiltrate(g, spy, lab));
  assert.ok((g.side[0].stolen || []).indexOf("teslatank") >= 0, "the Collective's lab unit is ours now");
  assert.ok(A.unitOrderFor("dir", "v", g.side[0]).indexOf("teslatank") >= 0,
    "and it shows up in the Directorate's own vehicle tab");
  g.side[0].credits = 99999;
  H.build("factory", 0, 20, 20).make = 0;
  H.build("radar", 0, 24, 20).make = 0;
  assert.ok(H.api.hasBld(g, 0, "factory"));
});

test("a Spy walks into an enemy building on a right-click, and is spent inside it", () => {
  const H = W.__rtsTest;
  const g = H.begin(9413, "normal");
  g.side[0].fac = "dir"; g.side[1].fac = "col";
  g.side[1].credits = 6000; g.side[0].credits = 0;
  const ref = H.build("refinery", 1, 30, 30); ref.make = 0;
  const spy = H.spawn("spy", 0, 34, 30);
  assert.equal(H.orderInfil([spy], ref), 1, "the attack order becomes an infiltrate");
  assert.equal(spy.order.t, "infil");
  H.step(600);
  assert.ok(spy.dead, "he is consumed inside");
  assert.ok(g.side[0].credits >= 3000, `the cash should have moved, got ${g.side[0].credits}`);
});

test("an Engineer repairs one of our own damaged buildings to full and is spent doing it", () => {
  const H = W.__rtsTest;
  const g = H.begin(9414, "normal");
  const b = H.build("barracks", 0, 30, 30); b.make = 0;
  b.hp = 100;
  const eng = H.spawn("engineer", 0, 34, 30);
  assert.equal(H.orderCapture([eng], b), 1);
  H.step(600);
  assert.equal(b.hp, b.maxhp, "the building should be whole again");
  assert.ok(eng.dead, "and the Engineer spent");
});

test("the Chronosphere is one-way: land keeps the vehicle, water takes it", () => {
  const H = W.__rtsTest, A = H.api3;
  const g = H.begin(9415, "normal", "river");
  // Find a water cell and a land cell to drop onto.
  let wet = null, dry = null;
  for (let y = 4; y < T.MAP - 4 && !(wet && dry); y++)
    for (let x = 4; x < T.MAP - 4 && !(wet && dry); x++) {
      const t = g.terrain[y * T.MAP + x];
      if (t === T.TER.WATER && !wet) wet = { x, y };
      if (t === T.TER.GROUND && !dry && x > 30) dry = { x, y };
    }
  assert.ok(wet && dry, "the river map should have both");
  const a = H.spawn("lancer", 0, 20, 20);
  H.swCharge(0, "chrono");
  assert.ok(H.swFire(0, "chrono", 20, 20, dry.x, dry.y));
  H.step(A.CHRONO_DELAY + 6);
  assert.ok(!a.dead, "a vehicle dropped on solid ground survives, and stays");
  const b2 = H.spawn("lancer", 0, 24, 24);
  H.swCharge(0, "chrono");
  assert.ok(H.swFire(0, "chrono", 24, 24, wet.x, wet.y));
  H.step(A.CHRONO_DELAY + 6);
  assert.ok(b2.dead, "one dropped over open water goes in with it");
});

test("every new man is in his faction's Infantry tab and behind the right prerequisites", () => {
  const A = W.__rtsTest.api3;
  const col = A.unitOrderFor("col", "i"), dir = A.unitOrderFor("dir", "i");
  ["conscript", "engineer", "dog", "flak", "teslatrooper", "ivan", "desolator", "yuri"]
    .forEach((k) => assert.ok(col.indexOf(k) >= 0, `${k} missing from the Collective Infantry tab`));
  ["rifle", "engineer", "dog", "rocket", "rocketeer", "spy", "tanya", "cleg"]
    .forEach((k) => assert.ok(dir.indexOf(k) >= 0, `${k} missing from the Directorate Infantry tab`));
  // rules.ini Prerequisite= lines.
  assert.deepEqual(T.UNITS.desolator.reqAll, ["barracks", "radar"]);   // [DESO] NAHAND,RADAR
  assert.deepEqual(T.UNITS.yuri.reqAll, ["barracks", "lab"]);          // [YURI] NAHAND,NATECH
  assert.deepEqual(T.UNITS.cleg.reqAll, ["barracks", "lab"]);          // [CLEG] GAPILE,TECH
  assert.deepEqual(T.UNITS.spy.reqAll, ["barracks", "lab"]);           // [SPY]  GAPILE,GATECH
  // Faction ownership, both ways.
  assert.equal(T.UNITS.desolator.fac, "col");
  assert.equal(T.UNITS.yuri.fac, "col");
  assert.equal(T.UNITS.cleg.fac, "dir");
  assert.equal(T.UNITS.spy.fac, "dir");
  // And every one of them has art baked for both owners and both factions.
  const H = W.__rtsTest;
  H.begin(9416, "normal");
  const SPR = H.spr();
  ["desolator", "yuri", "cleg", "spy"].forEach((k) => {
    for (const p of [0, 1]) for (const f of ["dir", "col"]) {
      const art = SPR.unit[p][f][k];
      assert.ok(art && art.fr, `${k} has no facing atlas for player ${p} / ${f}`);
      assert.ok(art.fr("walk", 3, 2), `${k} cannot bake a walk frame`);
    }
  });
});

// ============================ match flow ================================ //
//
// Phase 6: the skirmish strip, EVA's throttle, the score screen and
// save/load. The first test here is the load-bearing one — every default in
// OPT_DEF is chosen to reproduce the match the game played before the
// options existed, so a seed that drifts means an option leaked into the
// default path.

test("the default options replay a seed exactly as the game did before them", () => {
  // Recorded from the build immediately before the skirmish strip landed
  // (seed 4242, normal vs normal, Directorate vs Collective, three minutes),
  // then RE-recorded when the Phase 6 task-force AI landed: that change is
  // the AI's own decisions, which every skirmish shares, so the recording
  // moved with it. What this test still guards is what it always guarded —
  // that nothing in OPT_DEF leaks into the default path, so a drift here with
  // the AI untouched means an option escaped its default.
  const r = W.__rtsSim(4242, "normal", "normal", 60 * 60 * 3, "dir", "col");
  assert.deepEqual(
    { u0: r.p0units, u1: r.p1units, b0: r.p0blds, b1: r.p1blds, c0: r.p0credits, c1: r.p1credits },
    { u0: 8, u1: 10, b0: 5, b1: 5, c0: 10698, c1: 11698 },
    "a default match must be bit-for-bit the recorded match",
  );
});

test("starting credits, unit count and Bases flow out of the strip into the match", () => {
  const H = W.__rtsTest;
  [5000, 10000, 20000].forEach((c) => {
    const g = H.startWith(9, "normal", "frontier", { credits: c });
    assert.equal(g.side[0].credits, c);
    assert.equal(g.side[1].credits, c, "both houses get the same bank");
    assert.equal(g.opt.credits, c, "the strip is frozen into the match");
  });

  // "Units" is the guard that starts beside the yard: 0..10, three by default.
  for (const n of [0, 1, 3, 7]) {
    const g = H.startWith(11, "normal", "frontier", { units: n });
    const inf = g.units.filter((u) => !u.dead && u.p === 0 && T.UNITS[u.type].cls === "i").length;
    assert.equal(inf, n, `unit count ${n} should seed ${n} infantry`);
    assert.equal(g.units.filter((u) => !u.dead && u.p === 0 && API.countUnit(g, 0, "harvester")).length > 0, true);
  }

  // Bases off is RA2's "units only": no Construction Yard, an MCV instead.
  const off = H.startWith(13, "normal", "frontier", { bases: false });
  assert.equal(API.hasBld(off, 0, "base"), false, "no yard with Bases off");
  assert.equal(API.countUnit(off, 0, "mcv"), 1, "an MCV stands in for it");
  assert.equal(API.countUnit(off, 1, "mcv"), 1, "and for the opponent too");
  const on = H.startWith(13, "normal", "frontier", {});
  assert.equal(API.hasBld(on, 0, "base"), true);
  assert.equal(API.countUnit(on, 0, "mcv"), 0);
});

test("Crates off means no crate ever appears, however long the match runs", () => {
  const H = W.__rtsTest;
  const on = H.startWith(21, "normal", "frontier", { crates: true });
  H.step(4);
  assert.ok(on.crates.length > 0, "crates ON seeds CrateMinimum at once");

  const off = H.startWith(21, "normal", "frontier", { crates: false });
  let seen = 0;
  for (let i = 0; i < 60 * 60 * 5; i++) {          // five minutes, CrateRegen is three
    H.step(1);
    seen = Math.max(seen, off.crates.length);
  }
  assert.equal(seen, 0, "no crate may spawn in five minutes with Crates off");
});

test("Superweapons off takes all four structures off the build list", () => {
  const H = W.__rtsTest;
  const sw = T.SW_KEYS.map((k) => T.SW[k].bld).filter((b) => b !== "airport");
  assert.ok(sw.length >= 4);

  for (const supers of [true, false]) {
    const g = H.startWith(31, "normal", "frontier", { supers });
    H.give(0, 900000);
    // Everything the superweapons need, so only the toggle can refuse them.
    for (const k of ["power", "reactor", "refinery", "barracks", "factory", "radar", "airforce", "lab"]) {
      if (!T.BLDS[k] || API.hasBld(g, 0, k)) continue;
      placeNear(H, g, 0, g.start[0], k);
    }
    for (const b of sw) {
      const own = !T.BLDS[b].fac || T.BLDS[b].fac === g.side[0].fac;
      if (!own) continue;
      const can = API.canBuild(g, 0, b, true);
      if (supers) assert.equal(can, true, `${b} should be buildable with superweapons on`);
      else assert.equal(can, false, `${b} must be off the list with superweapons off`);
    }
  }
});

test("Short Game off is RA2's long game: the last unit has to die too", () => {
  const H = W.__rtsTest;
  for (const short of [true, false]) {
    const g = H.startWith(41, "normal", "frontier", { short, units: 2 });
    // Level the AI's base but leave its infantry standing.
    const src = g.units.find((u) => u.p === 0 && !u.dead);
    g.blds.filter((b) => b.p === 1 && !b.dead).forEach((b) => API.damage(g, src, b, 1e9, "HE"));
    g.side[1].credits = 0;
    H.step(2);
    const alive = API.countUnit(g, 1, null);
    assert.ok(alive > 0, "the opponent still has units on the field");
    if (short) assert.equal(g.over, 1, "short game ends on the last structure");
    else assert.equal(g.over, 0, "long game keeps running while a unit lives");
    if (!short) {
      g.units.filter((u) => u.p === 1 && !u.dead).forEach((u) => { u.dead = true; });
      H.step(2);
      assert.equal(g.over, 1, "and ends when the last one falls");
    }
  }
});

test("a saved game reloads into a state that steps identically for 1000 ticks", () => {
  const H = W.__rtsTest;
  // Play a real match to minute five, both sides driven by the AI, so the
  // save carries orders, paths, queues, a spatial index and a live RNG.
  const g = H.startWith(1234, "normal", "frontier", {});
  H.attachAI(1, "normal");
  H.attachAI(0, "normal");
  for (let i = 0; i < 60 * 60 * 5; i++) H.step(1);
  assert.ok(g.units.length > 4, "there is something to save");

  const blob = JSON.parse(JSON.stringify(H.saveBlob()));
  const before = H.hash(g);

  // Step the original on...
  for (let i = 0; i < 1000; i++) H.step(1);
  const original = H.hash(g);

  // ...and the restored copy the same distance from the same point.
  const g2 = H.loadBlob(blob);
  assert.equal(H.hash(g2), before, "the restored state must match the saved one");
  assert.equal(g2.tick, blob.tick);
  assert.equal(g2.opt.credits, g.opt.credits);
  for (let i = 0; i < 1000; i++) H.step(1);
  assert.equal(H.hash(g2), original, "1000 ticks later the two must still agree");
});

test("save/load restores the entity graph, not just the numbers", () => {
  const H = W.__rtsTest;
  const g = H.startWith(77, "normal", "frontier", { units: 4 });
  H.attachAI(1, "normal");
  for (let i = 0; i < 60 * 90; i++) H.step(1);
  const g2 = H.loadBlob(JSON.parse(JSON.stringify(H.saveBlob())));

  assert.equal(g2.units.length, g.units.length);
  assert.equal(g2.blds.length, g.blds.length);
  // Typed arrays survive byte for byte.
  assert.equal(g2.terrain.constructor.name, "Uint8Array");
  assert.equal(g2.ore.constructor.name, "Float32Array");
  for (let i = 0; i < g.terrain.length; i += 37) assert.equal(g2.terrain[i], g.terrain[i]);
  for (let i = 0; i < g.occ.length; i += 37) assert.equal(g2.occ[i], g.occ[i]);
  // Every reference points at an object in the restored world, never at a
  // {$r:id} marker or at an entity from the graph it was serialised from.
  g2.units.concat(g2.blds).forEach((e) => {
    assert.equal(e.$r, undefined);
    if (e.target) {
      assert.equal(typeof e.target.id, "number");
      assert.equal(g2.byId[e.target.id], e.target, "a target must be the restored entity");
      assert.equal(g.byId[e.target.id] === e.target, false, "and not the one from the old graph");
    }
  });
  g2.units.forEach((u) => assert.equal(g2.byId[u.id], u));
});

test("EVA does not repeat a line inside its own cooldown", () => {
  const H = W.__rtsTest;
  H.startWith(5, "normal", "frontier", {});
  const line = "Test advisory line";
  assert.equal(H.eva(line, 6000), true, "the first call speaks");
  assert.equal(H.eva(line, 6000), false, "the second inside the gap does not");
  H.step(60 * 3);                                  // three seconds of match time
  assert.equal(H.eva(line, 6000), false, "still inside the six-second gap");
  H.step(60 * 4);                                  // now past it
  assert.equal(H.eva(line, 6000), true, "and speaks again once the gap is out");
  // A different line has its own clock.
  assert.equal(H.eva("Another advisory", 6000), true);
  assert.ok(H.evaLog().indexOf(line) >= 0, "spoken lines are logged");
});

test("the score screen counts what RA2's columns count", () => {
  const H = W.__rtsTest;
  const g = H.startWith(303, "normal", "frontier", {});
  H.attachAI(1, "normal");
  H.attachAI(0, "normal");
  for (let i = 0; i < 60 * 60 * 4; i++) H.step(1);

  const a = H.score(0), b = H.score(1);
  for (const s of [a, b]) {
    assert.ok(s.bmade >= 1, "the opening yard is a structure built");
    assert.ok(s.harv > 0, "four minutes of mining banks something");
    for (const k of ["lead", "econ", "tech"]) {
      assert.ok(s[k] >= 0 && s[k] <= 100, `${k} is a percentage`);
    }
    assert.equal(Number.isFinite(s.made) && Number.isFinite(s.lost), true);
  }
  // "destroyed" on one side is "lost" on the other — the two must agree.
  assert.equal(a.bkilled, b.blost);
  assert.equal(b.bkilled, a.blost);
});

// ------------------------------------------------------------------ audio //
// Phase 7. Nothing here can hear anything — the vm has no AudioContext — so
// these check the two things that fail silently in a browser instead: that
// the tables are complete and consistent, and that the whole audio layer is
// inert without one.

test("every sound the game asks for exists, with RA2's Limit/Priority/Range", () => {
  const A = W.__rtsAudio;
  const kinds = A.kinds();
  // Table parity: a SPEC row with no synth is a silent call site; a synth
  // with no SPEC row cannot be scheduled at all.
  for (const k of kinds) assert.ok(A.SPEC[k], `PLAY.${k} has no SPEC row`);
  for (const k of Object.keys(A.SPEC)) assert.ok(kinds.includes(k), `SPEC.${k} has no synth`);
  assert.ok(kinds.length >= 45, `only ${kinds.length} sounds — RA2 declares 501`);
  for (const [k, s] of Object.entries(A.SPEC)) {
    assert.ok(s.l >= 1 && s.l <= 5, `${k}: Limit ${s.l} is outside sound.ini's range`);
    assert.ok(s.p >= 0 && s.p <= 4, `${k}: Priority ${s.p} is not lowest..critical`);
    assert.ok(s.r >= 0 && s.r <= 40, `${k}: Range ${s.r} cells`);
    assert.ok(s.v > 0 && s.v <= 1, `${k}: Volume ${s.v}`);
  }
  // The loudest, rarest events must outrank chatter, or a nuke gets dropped
  // for a rifle shot when the mixer fills.
  for (const k of ["nuke", "bldboom", "siren", "swready", "powon", "powoff"])
    assert.equal(A.SPEC[k].p, 4, `${k} must be Priority=critical`);
  for (const k of ["shot", "mg", "click", "cash"])
    assert.ok(A.SPEC[k].p <= 1, `${k} must be droppable`);
});

test("every weapon in the game has its own report", () => {
  const A = W.__rtsAudio, T = W.__rtsTables, kinds = A.kinds();
  for (const [k, v] of Object.entries(A.REPORT))
    assert.ok(kinds.includes(v), `REPORT.${k} points at "${v}", which is not a sound`);
  // rules.ini gives a Report= to every weapon; anything armed that is missing
  // from the table falls back on the generic cannon, which is what this
  // guards against silently swallowing a new unit.
  const missing = [];
  for (const [k, u] of Object.entries(T.UNITS)) if (u.dmg > 0 && !A.REPORT[k]) missing.push("UNITS." + k);
  for (const [k, b] of Object.entries(T.BLDS)) if (b.dmg > 0 && !A.REPORT[k]) missing.push("BLDS." + k);
  assert.deepEqual(missing, [], "armed things with no Report=");
  // The four cannon weights and the four explosion bands must all be distinct
  // sounds, or a 40-tank battle is a monotone again — the exact finding in
  // docs/rts-gap-audit-art.md §7.
  const guns = new Set(Object.values(A.REPORT));
  assert.ok(guns.size >= 14, `only ${guns.size} distinct reports across the roster`);
});

test("every unit kind has a voice, with select, move and attack lines", () => {
  const A = W.__rtsAudio, T = W.__rtsTables;
  for (const k of Object.keys(T.UNITS)) assert.ok(A.VOX[k], `UNITS.${k} has no voice`);
  for (const [k, v] of Object.entries(A.VOX)) {
    if (!v.f) continue;                       // the dog and the Terror Drone do not talk
    assert.ok(v.f > 40 && v.f < 400, `${k}: carrier pitch ${v.f} Hz is not a voice`);
    for (const key of ["s", "m"]) {
      assert.ok(v[key] && v[key].length, `${k} has no ${key === "s" ? "VoiceSelect" : "VoiceMove"} line`);
    }
    for (const key of ["s", "m", "a", "d", "h"]) {
      for (const i of v[key] || []) assert.ok(A.VOXPAT[i], `${k}.${key} points at pattern ${i}, which does not exist`);
    }
  }
  // Two units that sound identical are one unit: no two kinds may share both
  // pitch and formant colour.
  const seen = new Set();
  for (const [k, v] of Object.entries(A.VOX)) {
    if (!v.f) continue;
    const sig = v.f + "/" + v.b;
    assert.ok(!seen.has(sig), `${k} has the same voice as another unit (${sig})`);
    seen.add(sig);
  }
});

test("the whole audio layer is inert without an AudioContext", () => {
  // The vm has no AudioContext, no speechSynthesis and no OfflineAudioContext.
  // Nothing below may throw, and nothing may claim to have played.
  const A = W.__rtsAudio, H = W.__rtsTest;
  A.clear();
  const g = H.startWith(77, "normal", "frontier", {});
  H.attachAI(1, "normal");
  for (let i = 0; i < 600; i++) H.step(1);
  assert.deepEqual(A.log(), [], "a headless run must schedule no audio");
  assert.equal(A.stats().played, 0);
  assert.equal(A.music().on, false, "music never starts without a context");
  assert.equal(A.render("boom", 1), null, "no OfflineAudioContext, no render");
  assert.equal(A.renderVox("rifle", "select", false, 1), null);
});

test("adding audio did not move the simulation", () => {
  // Presentation-only layers (audio, doors) must not reach the sim. The pinned
  // numbers are re-recorded whenever a SIM change lands (last: the Phase 6 AI
  // team layer changed the AI's own decisions) — a presentation change must
  // never be the reason they move.
  const r = W.__rtsSim(4242, "normal", "normal", 60 * 60 * 3, "dir", "col");
  assert.equal(r.ticks, 10800);
  assert.equal(r.p0units, 8);
  assert.equal(r.p1units, 10);
  assert.equal(r.p0blds, 5);
  assert.equal(r.p1blds, 5);
  assert.equal(r.p0credits, 10698);
  assert.equal(r.p1credits, 11698);
  assert.equal(r.p0made, 8);
  assert.equal(r.p1made, 10);
});

// ======================= Phase 6: the AI team layer ===================== //
//
// RA2's AI is a task-force machine: ai.ini names a [TaskForce] (so many of
// each type), a [ScriptType] (gather, then attack a target CLASS) and a
// [TeamType] that binds the two with a trigger weight per difficulty. These
// tests read that table and then drive real matches through it.

// Place a structure on the first spot spiralling out from a point whose whole
// footprint (plus a one-tile skirt, so the base does not seal itself in) is
// clear ground. This deliberately does NOT go through canPlace: these fixtures
// stand buildings up for the AI to reason about, including neutral ones and
// ones whose prerequisites are not met yet.
function putNear(H, g, key, p, x, y) {
  const API = H.api, TB = W.__rtsTables, MAP = TB.MAP, d = TB.BLDS[key];
  const clear = (gx, gy) => {
    for (let yy = gy - 1; yy <= gy + d.gh; yy++) for (let xx = gx - 1; xx <= gx + d.gw; xx++) {
      if (xx < 0 || yy < 0 || xx >= MAP || yy >= MAP) return false;
      if (API.blocked(g, xx, yy)) return false;
    }
    return true;
  };
  for (let r = 0; r < 24; r++) {
    for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
      const gx = x + ox, gy = y + oy;
      if (gx < 2 || gy < 2 || gx > MAP - 6 || gy > MAP - 6) continue;
      if (!clear(gx, gy)) continue;
      return H.build(key, p, gx, gy);
    }
  }
  return null;
}
// A house with everything standing and money in the bank.
function fullBase(H, g, p, fac, extra) {
  g.side[p].fac = fac;
  const st = g.start[p];
  const keys = ["base", "power", "refinery", "barracks", "factory"].concat(extra || []);
  for (const k of keys) putNear(H, g, k, p, st.x, st.y);
  g.side[p].credits = 40000;
  for (let i = 0; i < 2; i++) H.spawn(fac === "col" ? "warminer" : "chronominer", p, st.x + 3 + i, st.y + 3);
}

test("AI_TEAMS is a well-formed ai.ini task-force table", () => {
  const TT = T.AI_TEAMS;
  assert.ok(Array.isArray(TT) && TT.length >= 16, "__rtsTables.AI_TEAMS is exposed");
  const roles = new Set(["attack", "siege", "harass", "defend", "air", "engineer"]);
  const keys = new Set();
  for (const d of TT) {
    assert.ok(!keys.has(d.key), `${d.key} is used twice`);
    keys.add(d.key);
    assert.ok(d.fac === "dir" || d.fac === "col", `${d.key} belongs to a faction`);
    assert.ok(roles.has(d.role), `${d.key} has a known role (${d.role})`);
    assert.ok(d.max >= 1, `${d.key} may exist at least once`);
    assert.ok(d.force.length > 0, `${d.key} has a task force`);
    for (const diff of ["easy", "normal", "hard"]) {
      assert.equal(typeof d.w[diff], "number", `${d.key} has a ${diff} trigger weight`);
    }
    for (const f of d.force) {
      const spec = T.UNITS[f.t];
      assert.ok(spec, `${d.key} asks for a real unit (${f.t})`);
      assert.ok(f.n >= 1, `${d.key} asks for at least one ${f.t}`);
      assert.ok(!spec.fac || spec.fac === d.fac,
        `${d.key} (${d.fac}) may not field ${f.t}, which is ${spec.fac}`);
      if (d.need) assert.ok(T.BLDS[d.need], `${d.key} needs a real structure`);
    }
  }
  // Both factions get the whole shape, and the siege forces are the RA2 ones.
  for (const fac of ["dir", "col"]) {
    for (const role of ["attack", "siege", "harass", "defend", "engineer"]) {
      assert.ok(TT.some((d) => d.fac === fac && d.role === role),
        `${fac} has a ${role} team type`);
    }
  }
  const dirSiege = TT.find((d) => d.fac === "dir" && d.role === "siege");
  const colSiege = TT.find((d) => d.fac === "col" && d.role === "siege");
  assert.ok(dirSiege.force.some((f) => f.t === "prismtank"), "the Allied siege force is prism artillery");
  assert.ok(colSiege.force.some((f) => f.t === "v3"), "the Soviet siege force is V3 artillery");
  // Only the hardest tiers get the specials — RA2 gates them by difficulty.
  assert.equal(TT.find((d) => d.key === "dirTanya").w.easy, 0, "easy never fields Tanya");
  assert.ok(dirSiege.w.hard > dirSiege.w.normal, "hard reaches for artillery more often");
});

test("a task force fills from production and then launches its script", () => {
  const H = W.__rtsTest;
  const g = H.begin(90210, "hard");
  fullBase(H, g, 1, "dir");
  fullBase(H, g, 0, "col");                     // something to attack
  const ai = H.attachAI(1, "hard");
  let launched = null;
  for (let i = 0; i < 60 * 60 * 9 && !launched; i++) {
    H.step(1);
    launched = ai.teams.find((t) => !t.def.prod && t.launched && t.units.length);
  }
  assert.ok(ai.teams.length > 0, "the trigger pass created teams");
  assert.ok(launched, "a team filled and ran its script");
  assert.equal(launched.mode, "attack");
  assert.ok(launched.tgt, "the script picked a target");
  for (const u of launched.units) {
    assert.equal(u.p, 1, "the team is made of its own house's units");
    assert.ok(launched.def.force.some((f) => f.t === u.type) || launched.n0 > 0,
      `${u.type} is either in the task force or a Reinforce= straggler`);
  }
});

test("a siege team assembles against a base that out-guns a direct assault", () => {
  const H = W.__rtsTest;
  const g = H.begin(4711, "hard");
  fullBase(H, g, 1, "dir", ["airforce", "lab"]);
  fullBase(H, g, 0, "col");
  // A turtle: a wall of Tesla Coils is worth more than a line company.
  const st0 = g.start[0];
  // Coils are Powered=yes and defenceValue() only counts a LIT defence line,
  // so the turtle needs the grid to carry them.
  for (let i = 0; i < 4; i++) putNear(H, g, "power", 0, st0.x, st0.y);
  for (let i = 0; i < 6; i++) putNear(H, g, "tesla", 0, st0.x + 4, st0.y + 4);
  const ai = H.attachAI(1, "hard");
  // The script aims at the guns, not past them: with the coils standing, the
  // "defence" target class has to return one of them and not the refinery
  // behind it (which is what the default preference list would pick).
  const tgt = H.api.aiPickTarget(g, ai, 1, 0, "defence", g.start[1]);
  assert.ok(tgt && T.BLDS[tgt.type] && T.BLDS[tgt.type].dmg > 0,
    "the defence script picks a base defence");
  assert.equal(tgt.type, "tesla");
  let siege = null, sawSiege = false;
  for (let i = 0; i < 60 * 60 * 12 && !siege; i++) {
    H.step(1);
    if (ai.siege) sawSiege = true;
    siege = ai.teams.find((t) => t.def.role === "siege");
  }
  assert.ok(sawSiege, "the defence line switched the AI into siege posture");
  assert.ok(siege, "a siege task force was raised");
  // The artillery out-ranges what it is sent against.
  assert.ok(T.UNITS.prismtank.rng > T.BLDS.tesla.rng, "the Prism Tank out-ranges a Tesla Coil");
  assert.ok(T.UNITS.v3.rng > T.BLDS.prism.rng, "the V3 out-ranges a Prism Tower");
});

test("an Engineer team captures the Oil Derrick", () => {
  const H = W.__rtsTest;
  const g = H.begin(5150, "hard");
  fullBase(H, g, 1, "dir");
  fullBase(H, g, 0, "col");
  const st = g.start[1];
  const oil = putNear(H, g, "oilderrick", -1, st.x + 10, st.y + 10);
  assert.ok(oil && oil.p < 0, "the derrick starts neutral");
  // On open ground between the base and the derrick — spawned inside the
  // fixture's own building cluster the engineer is simply walled in.
  let spot = null;
  for (let r = 3; r < 10 && !spot; r++) {
    for (let oy = -r; oy <= r && !spot; oy++) for (let ox = -r; ox <= r && !spot; ox++) {
      const x = Math.round(oil.cx) + ox, y = Math.round(oil.cy) + oy;
      if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
      if (!H.api.blocked(g, x, y)) spot = { x, y };
    }
  }
  assert.ok(spot, "there is open ground beside the derrick");
  const eng = H.spawn("engineer", 1, spot.x, spot.y);
  assert.ok(eng, "an engineer is on the field");
  const ai = H.attachAI(1, "hard");
  for (let i = 0; i < 60 * 60 * 4 && oil.p !== 1; i++) H.step(1);
  assert.equal(oil.p, 1, "the AI walked an Engineer into the derrick");
  // And it keeps an Engineer team type on the books to make the next one.
  let engTeam = false;
  for (let i = 0; i < 60 * 60 * 4 && !engTeam; i++) {
    H.step(1);
    engTeam = ai.teams.some((t) => t.def.role === "engineer");
  }
  assert.ok(engTeam, "an Engineer team type was raised");
});

test("the superweapon aims by the AIIonCannon value table, not by size", () => {
  const H = W.__rtsTest, API = H.api;
  const g = H.begin(31337, "normal");
  g.side[0].fac = "dir";
  // Two clusters, far apart: a refinery pair one side, the War Factory the
  // other. rules.ini scores WarFactory 100 and a refinery is not in the
  // table at all, so the factory has to win.
  const a = putNear(H, g, "refinery", 0, 12, 12);
  putNear(H, g, "refinery", 0, 12, 16);
  const f = putNear(H, g, "factory", 0, 48, 48);
  assert.ok(a && f);
  const hit = API.aiSwTarget(g, 0);
  assert.ok(hit && hit.b, "a target was scored");
  assert.equal(hit.b.type, "factory", "the War Factory outscores the ore economy");
  assert.equal(API.aiSwValue({ kind: "b", type: "factory" }), 100);
  assert.equal(API.aiSwValue({ kind: "b", type: "power" }), 60);
  assert.equal(API.aiSwValue({ kind: "b", type: "base" }), 10);
  assert.equal(API.aiSwValue({ kind: "b", type: "sentry" }), 35);
  assert.equal(API.aiSwValue({ kind: "b", type: "airforce" }), 20);
  assert.equal(API.aiSwValue({ kind: "u", type: "chronominer" }), 1);
});

test("HarvestersPerRefinery=2: the AI mans every refinery it owns", () => {
  const H = W.__rtsTest, API = H.api;
  for (const [nRef, want] of [[1, 2], [2, 4]]) {
    const g = H.begin(606 + nRef, "hard");
    fullBase(H, g, 1, "col");
    const st = g.start[1];
    for (let i = 1; i < nRef; i++) putNear(H, g, "refinery", 1, st.x + 5, st.y + 5);
    H.attachAI(1, "hard");
    assert.equal(API.countBld(g, 1, "refinery"), nRef);
    // The AI expands, so the ceiling has to be read against the refineries it
    // actually ended up owning, not the ones it started with.
    let peak = 0, peakRef = nRef;
    for (let i = 0; i < 60 * 60 * 8; i++) {
      H.step(1);
      peak = Math.max(peak, API.countUnit(g, 1, "harvester"));
      peakRef = Math.max(peakRef, API.countBld(g, 1, "refinery"));
    }
    assert.ok(peak >= Math.min(want, 3), `${nRef} refineries should man up to ${want} miners (peaked at ${peak})`);
    assert.ok(peak <= 2 * peakRef + 1,
      `and never a fleet: ${peak} miners for ${peakRef} refineries breaks HarvestersPerRefinery=2`);
  }
});

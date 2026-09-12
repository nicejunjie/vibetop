// Iron Frontier — production.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.
















// --------------------------------------------------------------------- //
//  Production queues
// --------------------------------------------------------------------- //
function canBuild(g, p, key, isBld) {
  var s = g.side[p];
  if (!isBld && key === 'harvester') key = harvKey(s.fac);
  var spec = isBld ? BLDS[key] : UNITS[key];
  if (!spec) return false;
  if (!isBld && spec.spawned) return false;      // TechLevel=-1: it comes off a deck, not off a list
  // The faction gate and "do you have the shed" are ONE question in RA2:
  // [HTNK] Prerequisite=NAWEAP. Hold a Soviet War Factory — built or taken
  // — and the Rhino is yours; hold only an Allied one and it is not.
  // A Spy's stolen blueprint is the single exception to "of that faction"
  // ([General] eva.ini #92 Technology stolen) — he brings the plans, not
  // the assembly hall, so the shed itself is still required.
  var stolen = !isBld && !!(s.stolen && s.stolen.indexOf(key) >= 0);
  if (!hasFacBld(g, p, producerOf(spec, isBld), stolen ? null : spec.fac)) return false;
  // Skirmish "Superweapons" off: RA2 sets DisableableFromShell=yes on all
  // four [*Special] sections, which takes the STRUCTURE off the build list.
  if (isBld && !g.opt.supers && swBld(key)) return false;
  if (s.credits < spec.cost) return false;
  if (!reqMet(g, p, spec)) return false;
  if (!isBld && spec.max && countUnit(g, p, key) + queuedCount(s, key) >= spec.max) return false;
  if (isBld && spec.max && countBld(g, p, key) + queuedCount(s, key) >= spec.max) return false;
  // The producing structure was checked at the top (hasFacBld above); the
  // only thing left that depends on it is the pad count.
  // One aircraft per pad: four Harriers per Airforce Command, as in RA2.
  if (!isBld && spec.cls === 'a') return countUnit(g, p, key) + queuedCount(s, key) < padCapacity(g, p);
  return true;
}

function queuedCount(s, key) {
  var n = 0; for (var l in s.queues) s.queues[l].list.forEach(function (k) { if (k === key) n++; }); return n;
}

function hasBld(g, p, type) {
  for (var i = 0; i < g.blds.length; i++) {
    if (!g.blds[i].dead && g.blds[i].p === p && g.blds[i].type === type) return true;
  }
  return false;
}

function countBld(g, p, type) {
  var n = 0;
  for (var i = 0; i < g.blds.length; i++) {
    if (!g.blds[i].dead && g.blds[i].p === p && g.blds[i].type === type) n++;
  }
  return n;
}

function countUnit(g, p, type, cls) {
  var n = 0, role = type === 'harvester';                     // "how many miners" spans both types
  for (var i = 0; i < g.units.length; i++) {
    var cu = g.units[i];
    if (cu.dead || cu.p !== p) continue;
    if (type && (role ? !isHarv(cu) : cu.type !== type)) continue;
    if (cls && UNITS[cu.type].cls !== cls) continue;
    n++;
  }
  return n;
}

var QUEUE_MAX = 30;

// Defence has its OWN construction lane. Sharing one structure queue meant
// a Sentry Gun held up the Refinery behind it — you paid for a turret with
// your economy. Both still need the Construction Yard, and each holds its
// own finished building waiting to be placed.
function isBldLane(l) { return l === 'b' || l === 'd'; }

function laneOfBld(key) { return BLDS[key] && BLDS[key].cat === 'def' ? 'd' : 'b'; }

function readyLane(s) { return s.queues.b.ready ? 'b' : (s.queues.d.ready ? 'd' : null); }

function enqueue(g, p, key, lane) {
  var s = g.side[p];
  if (!isBldLane(lane) && key === 'harvester') key = harvKey(s.fac);
  var q = s.queues[lane];
  if (q.list.length >= QUEUE_MAX) return false;
  var spec = isBldLane(lane) ? bspecOf(g, key, p) : UNITS[key];
  if (s.credits < spec.cost) return false;
  // RA2 charges PROGRESSIVELY (see stepQueues): nothing is deducted here.
  // The affordability test stays because both callers already report
  // "Insufficient funds" against it, and starting something you cannot pay
  // a single frame of is a worse first experience than being told no.
  q.list.push(key);
  // eva.ini #52 EVA_Building / #66 EVA_Training: RA2 names the LANE, not
  // the item — "Building" for anything from the Construction Yard,
  // "Training" for anything out of a Barracks.
  if (p === ME && !headless) {
    if (isBldLane(lane)) eva('Building', 6000);
    else if (lane === 'i') eva('Training', 6000);
  }
  return true;
}

// Cancelling refunds exactly what has been PAID so far (RA2 rule): an item
// still waiting in the queue has cost nothing, the one building has cost
// `q.paid`, and a finished structure waiting for a spot has cost all of it.
// Returns the amount refunded (0 for an item that had cost nothing yet),
// or false when there was nothing to cancel.
function cancelLast(g, p, lane, key) {
  var q = g.side[p].queues[lane], back = 0;
  for (var i = q.list.length - 1; i >= 0; i--) {
    if (q.list[i] === key) {
      if (i === 0) { back = q.paid || 0; g.side[p].credits += back; q.paid = 0; q.prog = 0; q.hold = false; q.pause = false; }
      q.list.splice(i, 1);
      if (p === ME) eva('Cancelled', 3000);                // eva.ini #51
      return back;
    }
  }
  if (isBldLane(lane) && q.ready === key) {
    back = bspecOf(g, key, p).cost; g.side[p].credits += back; q.ready = null;
    if (p === ME) eva('Cancelled', 3000);                  // eva.ini #51
    return back;
  }
  return false;
}

// RA2 low-power penalty (rules.ini MinLowPowerProductionSpeed=.5,
// MaxLowPowerProductionSpeed=.8, LowPowerPenaltyModifier=1): a base barely
// in the red still builds at 0.8x and one with no power at all at 0.5x —
// a curve on the size of the deficit, not the flat 0.4x this used to be.
function prodSpeed(g, p) {
  var s = g.side[p];
  if (s.powerUse === 0 || s.powerMade >= s.powerUse) return 1;
  return 0.8 - 0.3 * Math.min(1, (s.powerUse - s.powerMade) / s.powerUse);
}

// Everything that happens the moment a finished unit reaches the apron.
// Split out of stepQueues so the door sequence can hold it inside the bay
// for the opening ticks and then release it at the mouth.
function emitUnit(g, key, p, lane, src, sp) {
  var s = g.side[p];
  var nu = spawnUnit(g, key, p, sp.x, sp.y);   // an aircraft lands on its pad in spawnUnit
  // RA2: a Spy who got into their Barracks / War Factory makes
  // every unit that comes out of ours a veteran from then on.
  if ((UNITS[key].cls === 'i' && s.vetInf) || (UNITS[key].cls !== 'i' && s.vetVeh)) nu.rank = 1;
  if (src.rally) { nu.order = { t: 'move', x: src.rally.x, y: src.rally.y, id: 0 };
                   requestPath(g, nu, src.rally.x, src.rally.y);
                   nu.guardX = src.rally.x; nu.guardY = src.rally.y; }
  else if (!nu.air) {
    // No rally: step off the door onto a tile nobody stands on, as
    // RA2 units do — the soak found 54 conscripts on one tile.
    var aside = standSpot(g, sp.x, sp.y);
    if (aside && (aside.x !== sp.x || aside.y !== sp.y)) {
      nu.order = { t: 'move', x: aside.x, y: aside.y, id: 0 };
      nu.guardX = aside.x; nu.guardY = aside.y; requestPath(g, nu, aside.x, aside.y);
    }
  }
  // [NACLON] Cloning=yes: a second, free copy of every infantryman
  // steps out of the Vats' own door. Vehicles are not cloned.
  if (lane === 'i') {
    var cv = cloneVatsOf(g, p);
    if (cv) {
      var csp = freeTileNear(g, Math.round(cv.cx), Math.round(cv.cy + cv.gh / 2 + 1));
      if (csp) spawnUnit(g, key, p, csp.x, csp.y);
    }
  }
  if (p === ME) { sfx('ready'); eva('Unit ready', 3000); }
  return nu;
}

function stepQueues(g, p) {
  var s = g.side[p];
  var slow = prodSpeed(g, p);                  // low power = slower production
  for (var lane in s.queues) {
    var q = s.queues[lane];
    if (!q.list.length) continue;
    if (isBldLane(lane) && q.ready) continue;  // one finished structure waits for placement
    var key = q.list[0];
    var spec = isBldLane(lane) ? bspecOf(g, key, p) : UNITS[key];   // byFac cost/build: a Tesla Reactor is $600/25 s, not the Allied plant's
    // A lane with no producing structure left stalls (and refunds nothing —
    // same as RA2: rebuild the factory and it resumes).
    if (lane === 'i' && !hasBld(g, p, 'barracks')) continue;
    if (lane === 'v' && !hasBld(g, p, 'factory')) continue;
    if (lane === 'a' && !hasBld(g, p, 'airforce')) continue;
    if (lane === 'n' && !hasBld(g, p, 'shipyard')) continue;
    // A prerequisite lost mid-build (the Radar behind a queued coil) puts the
    // item ON HOLD with a reason, instead of a silent stall at 0%.
    if (!reqMet(g, p, spec)) {
      if (!q.hold) { q.hold = true; if (p === ME && !headless) { say('On hold — ' + spec.name + ' needs ' + reqName(spec, s.fac), true); eva('On hold', 8000); } }
      continue;
    }
    if (isBldLane(lane) && !hasBld(g, p, 'base')) continue;
    // RA2's right-click on the building cameo: the first puts it ON HOLD
    // (a player's choice, unlike `hold`, which the bank sets and clears),
    // the second cancels. A left click resumes.
    if (q.pause) continue;

    // ---- RA2 progressive charging -----------------------------------
    // RA2 does not take the money when you click a cameo; it draws it down
    // as the clock sweeps, and an item that runs out of money goes ON HOLD
    // at whatever fraction it reached until the credits come back.
    var dp = slow / (spec.build * 60 * buildFactor(g, p, lane));
    if (g.debug && p === P_HUMAN) dp = 1;                      // debug mode: instant build
    dp = Math.min(dp, 1 - q.prog);
    if (dp > 0) {
      var due = spec.cost * dp;
      if (due > 0.0001 && s.credits < due) {
        // Spend whatever is left this tick and stall on the rest.
        var afford = Math.max(0, s.credits);
        dp *= afford / due; due = afford;
        if (!q.hold) {
          q.hold = true;
          if (p === ME && !headless) { say('On hold — ' + spec.name + ' is waiting for credits', true); eva('On hold', 8000); }
        }
      } else if (q.hold) {
        q.hold = false;
        if (p === ME && !headless) say('Building resumed — ' + spec.name);
      }
      if (due > 0) { s.credits -= due; q.paid = (q.paid || 0) + due; }
      q.prog += dp;
    }
    if (q.prog >= 1) {
      q.paid = 0; q.hold = false;
      if (isBldLane(lane)) { q.prog = 0; q.list.shift(); q.ready = key; if (p === ME) { sfx('built'); eva('Construction complete', 3000); } }
      else {
        var src = producerFor(g, p, lane);
        if (src) {
          var sp = lane === 'a' ? { x: Math.round(src.cx), y: Math.round(src.cy) }
                  : lane === 'n' ? dockSpot(g, src)
                                : freeTileNear(g, Math.round(src.cx), Math.round(src.cy + src.gh / 2 + 1));
          // No free tile at the door: the unit waits in the factory (RA2
          // does the same) instead of being shifted out and silently lost.
          if (!sp) { q.prog = 1; continue; }
          q.prog = 0; q.list.shift();
          // RA2 does not teleport the unit onto the apron: the factory door
          // opens, the vehicle rolls out of the mouth, the door shuts. This
          // is SIMULATION, not presentation: it decides the tick the unit
          // exists on and the tile it steps to. It was gated on !headless,
          // so no hermetic test ever ran the branch two real tabs run — and
          // real tabs desynced ~2.5 min into any match that produced a unit
          // (two-player audit, 2026-09-11). Headless runs it too now.
          if (DOORED[src.type] && !src.hold && src.make <= 0 && !src.sell) {
            src.hold = { key: key, p: p, lane: lane, x: sp.x, y: sp.y };
            src.door = DOOR_T;
          } else emitUnit(g, key, p, lane, src, sp);
        }
      }
    }
  }
}

function producerType(lane) {
  return lane === 'i' ? 'barracks' : (lane === 'v' ? 'factory'
       : (lane === 'a' ? 'airforce' : (lane === 'n' ? 'shipyard' : 'base')));
}

// Extra production buildings shorten build time. The DISCOUNT matches RA2's
// MultipleFactory=0.8 — cumulative, floored at 0.25 — but the BEHAVIOUR
// deliberately does not: RA2's actual implementation is, per ModEnc,
// "rather irrational", and at values between 0.5 and 1.0 a second factory
// makes you SLOWER, needing three before you gain anything. Here every
// additional building of a type always speeds up what it makes, down to
// the floor.
//   1x  2x    3x    4x    5x    6x     7x     8x+
//   1  0.80  0.64  0.51  0.41  0.328  0.262  0.25
var FACTORY_STEP = 0.8, FACTORY_FLOOR = 0.25;

function buildFactor(g, p, lane) {
  var n = countBld(g, p, producerType(lane));
  return n <= 1 ? 1 : Math.max(FACTORY_FLOOR, Math.pow(FACTORY_STEP, n - 1));
}

// Round-robin across the buildings that can make this, so a second factory
// is also a second exit — units from one queue no longer all pile out of
// the same door.
function producersOf(g, p, lane) {
  var want = producerType(lane), list = [];
  for (var i = 0; i < g.blds.length; i++) {
    var b = g.blds[i];
    if (!b.dead && b.p === p && b.type === want) list.push(b);
  }
  return list;
}

// RA2 primary building: every unit of a lane comes out of ONE chosen
// producer (so a rally point and a defended exit mean something), not a
// round-robin over all of them. The first producer built is primary until
// the player picks another; a dead primary hands over to the oldest survivor.
function producerFor(g, p, lane) {
  var list = producersOf(g, p, lane);
  if (!list.length) return null;
  var s = g.side[p], id = s.primary && s.primary[lane];
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  if (!s.primary) s.primary = { i: 0, v: 0, a: 0 };
  s.primary[lane] = list[0].id;
  return list[0];
}

function isPrimary(g, b) {
  var m = BLDS[b.type].makes;
  if (m !== 'i' && m !== 'v' && m !== 'a') return false;
  return producerFor(g, b.p, m) === b;
}

function setPrimary(g, b) {
  var m = BLDS[b.type].makes;
  if (m !== 'i' && m !== 'v' && m !== 'a') return false;
  var s = g.side[b.p];
  if (!s.primary) s.primary = { i: 0, v: 0, a: 0 };
  s.primary[m] = b.id;
  return true;
}

// The k-th distinct passable tile on a spiral around (x,y): one cell per
// unit, as RA2 lays a group out at its destination. `taken` is a set the
// caller keeps across one group order.
// `zone` (optional) keeps a fleet's spread inside ONE body of water: a spot
// two cells away across a spit is not a spot a Destroyer can take up.
function spreadSpot(g, x, y, taken, mv, zone) {
  for (var k = 0; k < 400; k++) {
    var r = k === 0 ? 0 : 0.9 + Math.sqrt(k) * 0.8, a = k * 2.399;
    var cx = Math.max(0, Math.min(MAP - 1, Math.round(x + Math.cos(a) * r)));
    var cy = Math.max(0, Math.min(MAP - 1, Math.round(y + Math.sin(a) * r)));
    var key = cx + ',' + cy;
    if (taken[key] || !tilePassable(g, cx, cy, undefined, mv)) continue;
    if (zone && g.wzone[idx(cx, cy)] !== zone) continue;
    taken[key] = true; return { x: cx, y: cy };
  }
  return { x: x, y: y };
}

// A passable tile near (x,y) with no ground unit already standing on it.
// `used` (optional) is a set of "x,y" keys already handed out this tick, for
// callers that place several units before the neighbour index is rebuilt.
function standSpot(g, x, y, used) {
  for (var r = 0; r < 7; r++) {
    for (var oy = -r; oy <= r; oy++) for (var ox = -r; ox <= r; ox++) {
      if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
      var nx = x + ox, ny = y + oy;
      if (!inMap(nx, ny) || blocked(g, nx, ny)) continue;
      if (used && used[nx + ',' + ny]) continue;
      var taken = false;
      near(nx, ny, 0.6, function (o) { if (o.kind === 'u' && !o.dead && !o.air) taken = true; });
      if (!taken) return { x: nx, y: ny };
    }
  }
  return null;
}

function freeTileNear(g, x, y) {
  for (var r = 0; r < 8; r++) {
    for (var oy = -r; oy <= r; oy++) for (var ox = -r; ox <= r; ox++) {
      if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
      var nx = x + ox, ny = y + oy;
      if (inMap(nx, ny) && !blocked(g, nx, ny)) return { x: nx, y: ny };
    }
  }
  return null;
}

// The same two searches for a hull: open water, and open water with no ship
// already sitting on it. A ship built with nowhere to float waits in the
// yard exactly as a tank waits behind a blocked factory door.
function freeWaterNear(g, x, y, r0) {
  for (var r = (r0 || 0); r < 10; r++) {
    for (var oy = -r; oy <= r; oy++) for (var ox = -r; ox <= r; ox++) {
      if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
      var nx = x + ox, ny = y + oy;
      if (inMap(nx, ny) && !blocked(g, nx, ny, undefined, MV_NAVAL)) return { x: nx, y: ny };
    }
  }
  return null;
}

function waterSpot(g, x, y, used) {
  for (var r = 0; r < 9; r++) {
    for (var oy = -r; oy <= r; oy++) for (var ox = -r; ox <= r; ox++) {
      if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
      var nx = x + ox, ny = y + oy;
      if (!inMap(nx, ny) || blocked(g, nx, ny, undefined, MV_NAVAL)) continue;
      if (used && used[nx + ',' + ny]) continue;
      var taken = false;
      near(nx, ny, 0.7, function (o) { if (o.kind === 'u' && !o.dead && !o.air) taken = true; });
      if (!taken) return { x: nx, y: ny };
    }
  }
  return null;
}

// art.ini [GAYARD] `DockingOffset0=384,-128,0`: the slipway is off the
// yard's near-left face. A new hull is launched from the first clear water
// cell out from there, so it appears at the DOOR and not on the roof.
function dockSpot(g, b) {
  return waterSpot(g, Math.round(b.cx - b.gw / 2 - 0.5), Math.round(b.cy + b.gh / 2 + 0.5))
      || waterSpot(g, Math.round(b.cx), Math.round(b.cy));
}

// Build radius, RA2-style: `Adjacent=` on the structure BEING PLACED says
// how many cells out from one of your own buildings it may go. rules.ini
// gives 2 to almost everything, 4 to the four cheap defences (Pillbox,
// Sentry Gun, Patriot, Flak Cannon) and 8 to walls and gates — which is
// exactly what lets a wall chain run away from the base.
//
// A single global radius (6 for everything, what this used to be) is a
// compromise between those and matches none of them: it let a Construction
// Yard be dropped six cells into open ground and would not let a wall run
// further than a power plant. Requiring the footprint to TOUCH (Adjacent=0)
// is the other failure — it forces every base into a solid brick.
//
// RA2 measures Adjacent from the footprint EDGE in cells, so a 3x3 yard with
// Adjacent=2 opens a 7x7 pad. The number below is that edge distance.
//
// SCALE, and why it is not literally rules.ini's. RA2's own numbers are
// 2 / 4 / 8; dropped in as-is they cost the hard AI two matches in twelve
// (8/12 against a 11/12 baseline, six seeds x both faction assignments,
// `soakB.js`). Bisected: `Adjacent=4` on the defences alone was worth two of
// those and the 2 another one — this game's base scale was tuned around a
// flat radius of 6 through the 2026-09-03 playtests, and RA2's absolute
// cell counts are simply a different map scale. What the roadmap item is
// actually about is the RATIO — a defence reaches further than a factory,
// and a wall reaches further again — so the RA2 values are carried in at
// +4: 2 -> 6 (unchanged from the tuned radius), 4 -> 8, 8 -> 12. Measured
// back at 11/12 with identical match lengths.
var ADJ_DEFAULT = 6;                            // rules.ini Adjacent=2

function adjOf(key) { var d = BLDS[key]; return d && d.adj !== undefined ? d.adj : ADJ_DEFAULT; }

// Cached buildable mask, rebuilt when the structure set changes. Keyed by
// (player, adjacency) because the radius now depends on WHAT is being built.
var maskCache = [{}, {}], maskKey = ['', ''];

function buildMask(g, p, key) {
  var sig = '';
  for (var i = 0; i < g.blds.length; i++) {
    var b = g.blds[i];
    if (!b.dead && b.p === p) sig += b.id + ',' + b.x + ',' + b.y + ';';
  }
  if (maskKey[p] !== sig) { maskCache[p] = {}; maskKey[p] = sig; }
  var r = adjOf(key), def = BLDS[key] && BLDS[key].cat === 'def';
  var ck = r + (def ? 'D' : '');
  if (maskCache[p][ck]) return maskCache[p][ck];
  var m = new Uint8Array(MAP * MAP);
  for (var j = 0; j < g.blds.length; j++) {
    var bb = g.blds[j];
    if (bb.dead || bb.p !== p) continue;
    // [General] WallTower=GACTWR: a wall segment is a base tile for DEFENCES
    // (this is RA2's wall-creep), never for economy or tech — otherwise a
    // $100 chain of concrete would let you drop a Battle Lab anywhere.
    if (BLDS[bb.type].wall && !def) continue;
    var x0 = Math.max(0, bb.x - r), x1 = Math.min(MAP - 1, bb.x + bb.gw - 1 + r);
    var y0 = Math.max(0, bb.y - r), y1 = Math.min(MAP - 1, bb.y + bb.gh - 1 + r);
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) m[y * MAP + x] = 1;
  }
  maskCache[p][ck] = m;
  return m;
}

// opts.anywhere: skip the "near one of your buildings" test — an MCV
// deploys wherever it stands, which is the whole point of owning one when
// your base is gone. opts.ignore: a unit that does not block the footprint
// (the deploying MCV itself is standing on the centre tile).
function canPlace(g, p, key, gx, gy, opts) {
  var d = bspecFor(key, keyFac(g, p, key, true));
  var mask = buildMask(g, p, key), inRange = !!(opts && opts.anywhere);
  // [GAYARD]/[NAYARD] `WaterBound=yes`: the whole footprint must be OPEN
  // WATER, and RA2 only ever lays one against a shore — so at least one
  // cell of the ring round the plot has to be dry land you could stand a
  // crane on. A yard in the middle of a lake is not a shipyard, it is a raft.
  if (d.water && !waterPlot(g, gx, gy, d.gw, d.gh)) return false;
  for (var y = gy; y < gy + d.gh; y++) {
    for (var x = gx; x < gx + d.gw; x++) {
      if (!inMap(x, y)) return false;
      var i = idx(x, y);
      // Clear ground or a road only: a ramp is a slope, a bridge is a deck
      // over water and a civilian lot is someone else's — all walkable, none
      // of them buildable.
      if (!d.water && !buildableT(g.terrain[i])) return false;
      if (g.occ[i] !== 0) return false;
      for (var k = 0; k < g.units.length; k++) {          // not on top of a unit
        var u = g.units[k];
        if (opts && opts.ignore === u) continue;
        if (!u.dead && !u.air && Math.round(u.x) === x && Math.round(u.y) === y) return false;
      }
      if (mask[i]) inRange = true;
    }
  }
  return inRange;
}

// The water half of canPlace: every footprint cell deep water, and a dry
// cell somewhere in the ring around it.
function waterPlot(g, gx, gy, gw, gh) {
  var x, y, shore = false;
  for (y = gy; y < gy + gh; y++) for (x = gx; x < gx + gw; x++) {
    if (!inMap(x, y) || g.terrain[idx(x, y)] !== T_WATER) return false;
  }
  for (y = gy - 1; y <= gy + gh; y++) for (x = gx - 1; x <= gx + gw; x++) {
    if (y > gy - 1 && y < gy + gh && x > gx - 1 && x < gx + gw) continue;
    if (!inMap(x, y)) continue;
    var t = g.terrain[idx(x, y)];
    if (t !== T_WATER && t !== T_BRIDGE) { shore = true; break; }
  }
  return shore;
}

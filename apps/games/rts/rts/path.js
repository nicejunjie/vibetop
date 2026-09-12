// Iron Frontier — path.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.

import { BLDS } from './blds.js';
import { moverOf } from './geom.js';
import { GATE_T } from './move.js';
import { idx, inMap } from './state.js';
import { MAP, terrPass } from './world.js';

// --------------------------------------------------------------------- //
//  Passability + pathfinding (A* on the tile grid, with a per-frame
//  budget so a mass move order can never stall the frame).
// --------------------------------------------------------------------- //
// [GAGATE_A] Gate=yes: the leaves are apart, so the cell is walkable. It
// only ever gets there because one of its OWNER's units came close enough
// (stepGate), which is what makes a gate one-way in practice — an enemy
// column stands at a shut gate exactly as it stands at a wall.
export function gateOpen(g, i) {
  var id = g.occ[i];
  if (!id) return false;
  var b = g.byId[id];
  return !!(b && !b.dead && BLDS[b.type].gate && b.gate >= GATE_T);
}

// `p` = who is trying to walk here. A player's OWN gate is always passable
// to him whatever the leaves are doing, because it opens as he arrives —
// without that, pathing would refuse to route through a shut gate and the
// column would never come close enough to trigger it, so a gate in your own
// wall would wall YOU in. Called with no `p` (crowding, placement, the
// renderer) it is the strict physical test.
function ownGate(g, i, p) {
  var b = g.byId[g.occ[i]];
  return !!(b && !b.dead && BLDS[b.type].gate && b.p === p);
}

export function blocked(g, x, y, p, mv) {
  if (!inMap(x, y)) return true;
  var i = idx(x, y);
  if (!terrPass(g.terrain[i], mv)) return true;
  if (g.occ[i] === 0) return false;
  if (gateOpen(g, i)) return false;
  return !(p !== undefined && ownGate(g, i, p));
}

export var pathQ = [];

// Do NOT drop the current path here. Clearing it on request meant a unit
// stopped dead until the queue reached it, so an AI that re-tasked often
// (a FAST one) had an army that stood still — reaction speed became a
// handicap. The old path stays valid until the new one replaces it.
export function requestPath(g, u, tx, ty) {
  if (u.air) return;                          // aircraft do not path
  for (var i = 0; i < pathQ.length; i++) {
    if (pathQ[i].u === u) { pathQ[i].tx = tx; pathQ[i].ty = ty; return; }
  }
  pathQ.push({ u: u, tx: tx, ty: ty });
}

export function runPathQueue(g, budget) {
  var n = 0;
  while (pathQ.length && n < budget) {
    var r = pathQ.shift(); n++;
    if (r.u.dead) continue;
    var pth = astar(g, Math.round(r.u.x), Math.round(r.u.y), r.tx, r.ty, r.u.p, moverOf(r.u));
    // `[]` (goal is the unit's own tile) is truthy: it left a unit holding a
    // path it could never finish and an order it could never drop.
    r.u.path = pth && pth.length ? pth : null;
    r.u.pi = 0;
  }
}

// Binary-heap A*. Returns an array of {x,y} or null when unreachable.
export function astar(g, sx, sy, tx, ty, p, mv) {
  sx = Math.max(0, Math.min(MAP - 1, sx)); sy = Math.max(0, Math.min(MAP - 1, sy));
  if (!inMap(tx, ty)) return null;
  if (sx === tx && sy === ty) return [];

  // If the goal is blocked, walk out to the nearest free tile near it.
  if (blocked(g, tx, ty, p, mv)) {
    var best = null, bd = 1e9;
    for (var r = 1; r <= 4 && !best; r++) {
      for (var oy = -r; oy <= r; oy++) for (var ox = -r; ox <= r; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
        var nx = tx + ox, ny = ty + oy;
        if (blocked(g, nx, ny, p, mv)) continue;
        var dd = (nx - sx) * (nx - sx) + (ny - sy) * (ny - sy);
        if (dd < bd) { bd = dd; best = { x: nx, y: ny }; }
      }
      if (best) break;
    }
    if (!best) return null;
    tx = best.x; ty = best.y;
    if (sx === tx && sy === ty) return [];
  }

  var N = MAP * MAP;
  var came = new Int32Array(N).fill(-1);
  var gs = new Float32Array(N).fill(Infinity);
  var closed = new Uint8Array(N);
  var heap = [], hn = 0;

  function h(x, y) {
    var dx = Math.abs(x - tx), dy = Math.abs(y - ty);
    return (dx + dy) + (1.4142 - 2) * Math.min(dx, dy);
  }
  function push(node, f) {
    heap[hn] = { i: node, f: f }; var c = hn++;
    while (c > 0) {
      var par = (c - 1) >> 1;
      if (heap[par].f <= heap[c].f) break;
      var t = heap[par]; heap[par] = heap[c]; heap[c] = t; c = par;
    }
  }
  function pop() {
    var top = heap[0]; heap[0] = heap[--hn]; heap.length = hn;
    var c = 0;
    for (;;) {
      var l = c * 2 + 1, r = l + 1, m = c;
      if (l < hn && heap[l].f < heap[m].f) m = l;
      if (r < hn && heap[r].f < heap[m].f) m = r;
      if (m === c) break;
      var t = heap[m]; heap[m] = heap[c]; heap[c] = t; c = m;
    }
    return top;
  }

  var si = idx(sx, sy), ti = idx(tx, ty);
  gs[si] = 0; push(si, h(sx, sy));
  var guard = 0;
  while (hn > 0 && guard++ < 9000) {
    var cur = pop().i;
    if (cur === ti) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    var cxx = cur % MAP, cyy = (cur / MAP) | 0;
    for (var d = 0; d < 8; d++) {
      var ax = [1, -1, 0, 0, 1, 1, -1, -1][d], ay = [0, 0, 1, -1, 1, -1, 1, -1][d];
      var nx2 = cxx + ax, ny2 = cyy + ay;
      if (!inMap(nx2, ny2)) continue;
      var ni = idx(nx2, ny2);
      if (closed[ni]) continue;
      if (blocked(g, nx2, ny2, p, mv) && ni !== ti) continue;
      // no corner-cutting through two blocked orthogonals
      if (ax && ay && blocked(g, cxx + ax, cyy, p, mv) && blocked(g, cxx, cyy + ay, p, mv)) continue;
      var step = (ax && ay) ? 1.4142 : 1;
      var ng = gs[cur] + step;
      if (ng < gs[ni]) { gs[ni] = ng; came[ni] = cur; push(ni, ng + h(nx2, ny2)); }
    }
  }
  if (came[ti] === -1 && ti !== si) return null;

  var out = [], node = ti;
  while (node !== si && node !== -1) {
    out.push({ x: node % MAP, y: (node / MAP) | 0 });
    node = came[node];
  }
  out.reverse();
  return out;
}

// --- generated ---
// ESM import bindings are read-only, so a write from another module goes
// through the owner. Reads stay verbatim everywhere: the binding is live.
export function setPathQ(v) { pathQ = v; }

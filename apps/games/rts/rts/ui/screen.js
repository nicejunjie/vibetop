// Iron Frontier — ui/screen.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.

import { G } from '../state.js';
import { DPR, HSTEP, MAP, TH, TW, T_BRIDGE, T_ROAD, gridAt, worldX, worldY } from '../world.js';
import { ctx, cv, cvH, cvW, setCvH, setCvW, stage } from './dom.js';

export var cam = { x: 0, y: 0 };

export var zoom = 1;                       // mouse-wheel zoom, about the cursor

// ZMIN 0.55 was the single thing voiding every other art measurement.
// unit-identity-reference.md R1: RA2 authored its identity spikes at a 2 px
// floor for a renderer that NEVER scales — RA2 has no zoom at all — so at 0.55
// an RA2-faithful 2 px feature is 1.1 device px and smears away. Measured with
// tools/legibility.js, which composites each unit at the size it is actually
// drawn, on the game's ground, and compares pictures rather than alpha masks:
//
//     ZMIN   threshold   infantry min   pairs under the friend-vs-foe floor
//     0.55      19.1         17.0                   4
//     0.65      22.6         21.4                   2
//     0.75      24.5         25.7                   0
//     0.85      28.5         30.1                   0
//
// 0.75 is the measured minimum that clears every pair; the plan guessed 0.85
// and that costs more view than it needs to. R1's other two options were tried
// first and are not enough on their own — every spike IS authored past the
// 3.64 px floor now, and ivan|spy, ivan|yuri, tanya|spy and conscript|tanya
// still sat under the floor at 0.55.
//
// The cost is real and bounded: the player still sees ~1.8x RA2's field of
// view at full zoom-out (against 3.3x before), and the minimap carries the
// strategic overview exactly as it does in RA2.
var ZMIN = 0.75, ZMAX = 2.0;

// Screen px -> the unzoomed screen space that sx()/sy() work in.
export function unzoom(px, py) {
  return { x: (px - cvW / 2) / zoom + cvW / 2, y: (py - cvH / 2) / zoom + cvH / 2 };
}

export function setZoom(z, px, py) {
  z = Math.max(ZMIN, Math.min(ZMAX, z));
  if (z === zoom) return;
  var before = screenToGrid(px, py);
  zoom = z;
  var after = screenToGrid(px, py);
  // Keep the tile under the cursor under the cursor.
  cam.x += worldX(before.x, before.y) - worldX(after.x, after.y);
  cam.y += worldY(before.x, before.y) - worldY(after.x, after.y);
  clampCam();
}

export var sel = [];                       // selected entities (units and/or one building)

export var groups = {};                    // ctrl+N control groups

export var placing = null;                 // structure key awaiting a click

export var hoverTile = { x: 0, y: 0 };

export var panel = 'b';

export function resize() {
  var r = stage.getBoundingClientRect();
  setCvW(Math.max(200, Math.floor(r.width)));
  setCvH(Math.max(160, Math.floor(r.height)));
  var w = Math.floor(cvW * DPR), h = Math.floor(cvH * DPR);
  // Writing canvas.width CLEARS the canvas even when the value is identical,
  // so a no-op resize costs a blank frame. Only touch it on a real change.
  if (cv.width === w && cv.height === h) return;
  cv.width = w; cv.height = h;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

export function centerOn(gx, gy) {
  cam.x = worldX(gx, gy);
  cam.y = worldY(gx, gy);
}

// The map floats in a black void the camera may scroll into, as RA2's does,
// so ANY point on the map's edge can be brought to the centre of the screen
// with void beyond it. The clamp is in GRID space: the limit follows the
// diamond's four edges, a few cells out, rather than its bounding box —
// a box lets the centre reach the box's corners, which are nothing but
// void (a full black screen, tried and rejected), while a fixed 260 px
// world margin pinned the diamond's corners against the view.
export function clampCam() {
  var m = Math.max(4, (cvH / zoom) / TH / 3);        // cells past the edge: ~9 at 900 px
  var gx = cam.x / TW + cam.y / TH, gy = cam.y / TH - cam.x / TW;   // inverse of worldX/worldY
  gx = Math.max(-m, Math.min(MAP + m, gx));
  gy = Math.max(-m, Math.min(MAP + m, gy));
  cam.x = worldX(gx, gy); cam.y = worldY(gx, gy);
}

export var APRON = 16;                                 // how far the terrain runs past the border

export function sx(gx, gy) { return worldX(gx, gy) - cam.x + cvW / 2; }

export function sxF(gx, gy) { return worldX(gx, gy) - cam.x + cvW / 2; }

// Which of the four neighbours carry a road, for the connector set. A road
// that runs off the board keeps going into the apron rather than stopping
// dead in a kerb.
function roadAt(xx, yy) {
  if (xx < 0 || yy < 0 || xx >= MAP || yy >= MAP) return 1;
  var t = G.terrain[yy * MAP + xx];
  return (t === T_ROAD || t === T_BRIDGE) ? 1 : 0;
}

export function roadMask(x, y) {
  return roadAt(x, y - 1) | (roadAt(x + 1, y) << 1) | (roadAt(x, y + 1) << 2) | (roadAt(x - 1, y) << 3);
}

// Screen height of the ground under a point, in pixels. Flat everywhere on
// a map with no plateau, so the common case costs one array read.
function hPx(gx, gy) {
  if (!G || !G.hiAny) return 0;
  var x = Math.round(gx), y = Math.round(gy);
  if (x < 0 || y < 0 || x >= MAP || y >= MAP) return 0;
  var i = y * MAP + x, h = G.hf[i];
  if (!h && !G.hgx[i] && !G.hgy[i]) return 0;
  return HSTEP * (h + G.hgx[i] * (gx - x) + G.hgy[i] * (gy - y));
}

// EVERYTHING on a tile rides its height: units, structures, trees, decals,
// shots, explosions. That is the whole point of folding it into sy().
export function sy(gx, gy) { return worldY(gx, gy) - cam.y + cvH / 2 - hPx(gx, gy); }

export function syFlat(gx, gy) { return worldY(gx, gy) - cam.y + cvH / 2; }

export function screenToGrid(px, py) {
  var u = unzoom(px, py);
  return gridFromW(u.x, u.y);
}

// The same inverse from ALREADY-UNZOOMED coordinates, so pickAtW can ask
// "which tile is under this pixel" with the identical rounding the movement
// orders use. One implementation, or the two drift.
export function gridFromW(ux, uy) {
  var wx = ux - cvW / 2 + cam.x, wy = uy - cvH / 2 + cam.y;
  var p = gridAt(wx, wy);
  // Inverting a raised tile: add the height back and re-project. Two passes
  // settle it because height is constant over a plateau's interior.
  if (G && G.hiAny) { p = gridAt(wx, wy + hPx(p.x, p.y)); p = gridAt(wx, wy + hPx(p.x, p.y)); }
  return p;
}

// --- generated ---
// ESM import bindings are read-only, so a write from another module goes
// through the owner. Reads stay verbatim everywhere: the binding is live.
export function setGroups(v) { groups = v; }
export function setPanel(v) { panel = v; }
export function setPlacing(v) { placing = v; }
export function setSel(v) { sel = v; }

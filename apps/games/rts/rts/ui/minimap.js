// Iron Frontier — ui/minimap.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.

import { COL } from '../bake/buildings.js';
import { powered } from '../entities.js';
import { hasBld } from '../production.js';
import { entSeen } from '../shroud.js';
import { G, idx } from '../state.js';
import { MAP, ME } from '../world.js';
import { sfx } from './audio.js';
import { cvH, cvW, mctx, mini } from './dom.js';
import { terrCol } from './render.js';
import { screenToGrid } from './screen.js';

// --------------------------------------------------------------------- //
//  Radar. RA2's radar is not a top-down plan: it is the SAME isometric
//  frame as the battlefield, so north-east on the radar is north-east on
//  screen and the viewport marker is the literal quad of what you can see.
//  A square plan forced you to rotate the map in your head on every glance.
//  The projection below is worldX/worldY scaled to fit 184 px across; the
//  2:1 diamond is 92 px tall, so it is centred with letterbox above and
//  below rather than stretched (RA2 letterboxes non-square maps too).
// --------------------------------------------------------------------- //
export var MM_PX = 184;

var mmK = MM_PX / (2 * MAP);                       // radar px per half-tile

var mmOX = MM_PX / 2, mmOY = (MM_PX - MAP * mmK) / 2;

function mmX(gx, gy) { return mmOX + (gx - gy) * mmK; }

function mmY(gx, gy) { return mmOY + (gx + gy) * mmK / 2; }

export function mmToGrid(px, py) {
  var a = (px - mmOX) / mmK;                       // gx - gy
  var b = (py - mmOY) * 2 / mmK;                   // gx + gy
  return { x: (b + a) / 2, y: (b - a) / 2 };
}

function mmQuad(g, x0, y0, x1, y1) {               // a grid rect as its diamond
  g.beginPath();
  g.moveTo(mmX(x0, y0), mmY(x0, y0));
  g.lineTo(mmX(x1, y0), mmY(x1, y0));
  g.lineTo(mmX(x1, y1), mmY(x1, y1));
  g.lineTo(mmX(x0, y1), mmY(x0, y1));
  g.closePath();
}

var lastRadar = null;

// RA2: the radar is dark until you own a powered radar-class structure — and
// a dark radar is not a picture that happens to be black, it is a panel that
// does not work. This lived inline in drawMini, so the BLANKING was gated and
// the INPUT was not: with the panel reading "RADAR OFFLINE" a click still
// jumped the camera and a right-click still ordered units to a spot the
// player could not see. One function now answers for both.
export function radarUp() {
  return !!G && (G.debug
    || ((hasBld(G, ME, 'radar') || hasBld(G, ME, 'airforce')) && powered(G, ME)));
}

export function drawMini() {
  var radarOn = radarUp();
  // RA2 chirps when the radar comes up and drops when the grid does.
  if (lastRadar !== null && radarOn !== lastRadar) sfx(radarOn ? 'radaron' : 'radaroff');
  lastRadar = radarOn;
  if (!radarOn) {
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.fillStyle = '#0b0e14'; mctx.fillRect(0, 0, MM_PX, MM_PX);
    mctx.fillStyle = '#3a4456'; mctx.font = 'bold 11px system-ui'; mctx.textAlign = 'center';
    mctx.fillText(hasBld(G, ME, 'radar') || hasBld(G, ME, 'airforce') ? 'RADAR OFFLINE' : 'NO RADAR', 92, 96);
    mctx.textAlign = 'left'; miniDirty = 0;
    return;
  }
  // Terrain is only redrawn a few times a second — it barely changes. It is
  // painted once into a MAP x MAP pixel buffer and then blitted through the
  // isometric matrix, which is thousands of times cheaper than stroking one
  // diamond per tile every pass.
  if (--miniDirty <= 0) {
    miniDirty = 12;
    if (!mini._src) {
      mini._src = document.createElement('canvas');
      mini._src.width = MAP; mini._src.height = MAP;
      mini._sctx = mini._src.getContext('2d');
      mini._img = mini._sctx.createImageData(MAP, MAP);
    }
    var px32 = mini._img.data, ci = {};
    for (var y = 0; y < MAP; y++) for (var x = 0; x < MAP; x++) {
      var ti = idx(x, y), o = ti * 4;
      if (!G.seen[ti]) { px32[o] = px32[o + 1] = px32[o + 2] = 0; px32[o + 3] = 255; continue; }
      var col = terrCol(G.terrain[ti], G.theatre), rgb = ci[col];
      if (!rgb) {
        // terrCol returns '#rrggbb'; parse once per distinct colour per pass.
        var h = col.charAt(0) === '#' ? parseInt(col.slice(1), 16) : 0;
        rgb = ci[col] = [(h >> 16) & 255, (h >> 8) & 255, h & 255];
      }
      px32[o] = rgb[0]; px32[o + 1] = rgb[1]; px32[o + 2] = rgb[2]; px32[o + 3] = 255;
    }
    mini._sctx.putImageData(mini._img, 0, 0);
  }
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.fillStyle = '#080b11'; mctx.fillRect(0, 0, MM_PX, MM_PX);
  // (x,y) -> (mmOX + k(x-y), mmOY + k/2 (x+y)) is exactly this matrix.
  mctx.setTransform(mmK, mmK / 2, -mmK, mmK / 2, mmOX, mmOY);
  mctx.imageSmoothingEnabled = false;          // RA2's radar is hard pixels
  mctx.drawImage(mini._src, -0.5, -0.5);
  mctx.imageSmoothingEnabled = true;
  mctx.setTransform(1, 0, 0, 1, 0, 0);

  var i;
  for (i = 0; i < G.blds.length; i++) {
    var b = G.blds[i];
    if (b.dead || !entSeen(G, b)) continue;
    mctx.fillStyle = COL[b.p];
    mmQuad(mctx, b.x, b.y, b.x + b.gw, b.y + b.gh);
    mctx.fill();
  }
  for (i = 0; i < G.units.length; i++) {
    var u = G.units[i];
    if (u.dead || !entSeen(G, u)) continue;
    mctx.fillStyle = u.p === ME ? '#8ad0ff' : '#ff9098';
    mctx.fillRect(mmX(u.x, u.y) - 1.2, mmY(u.x, u.y) - 1.2, 2.4, 2.4);
  }
  // An incoming superweapon flashes its target on the minimap.
  if (G.mmFlash && ((G.tick >> 3) & 1)) {
    var fx = mmX(G.mmFlash.x, G.mmFlash.y), fy = mmY(G.mmFlash.x, G.mmFlash.y);
    mctx.strokeStyle = '#ff4a4a'; mctx.lineWidth = 2;
    mctx.beginPath(); mctx.arc(fx, fy, 8, 0, 6.29); mctx.stroke();
    mctx.beginPath(); mctx.arc(fx, fy, 3, 0, 6.29); mctx.stroke();
  }

  // The viewport marker is the four screen corners run through the same
  // projection, so it is the true quad of what is on screen — including
  // whatever the zoom is doing.
  var tl = screenToGrid(0, 0), br = screenToGrid(cvW, cvH);
  var tr = screenToGrid(cvW, 0), bl = screenToGrid(0, cvH);
  mctx.strokeStyle = 'rgba(255,255,255,.55)'; mctx.lineWidth = 1;
  mctx.beginPath();
  mctx.moveTo(mmX(tl.x, tl.y), mmY(tl.x, tl.y));
  mctx.lineTo(mmX(tr.x, tr.y), mmY(tr.x, tr.y));
  mctx.lineTo(mmX(br.x, br.y), mmY(br.x, br.y));
  mctx.lineTo(mmX(bl.x, bl.y), mmY(bl.x, bl.y));
  mctx.closePath(); mctx.stroke();
}

var miniDirty = 0;

// --- generated ---
// ESM import bindings are read-only, so a write from another module goes
// through the owner. Reads stay verbatim everywhere: the binding is live.
export function setLastRadar(v) { lastRadar = v; }

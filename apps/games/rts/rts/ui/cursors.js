// Iron Frontier — ui/cursors.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.


















// --------------------------------------------------------------------- //
//  Cursors — RA2 has no single pointer. It has an ANIMATED cursor per
//  intent, and the cursor is how the game tells you what a click will do
//  before you make it: green chevrons mean "walk here", a red reticle means
//  "kill that", a barred circle means "not there". Five CSS keywords cannot
//  say any of that, so the set is drawn here into 32x32 canvases and hung
//  on #cv as `cursor: url(data:...) hx hy, auto`.
//
//  Two frames-per-second details matter: the hotspot is the pixel the click
//  lands on (the arrow's tip, a reticle's centre), and the animated ones
//  (move, attack, force-fire, attack-move) swap their data URL on a timer,
//  which is also what re-evaluates the hover context — so a cursor that
//  changes because you pressed Ctrl updates without moving the mouse.
// --------------------------------------------------------------------- //
var CUR_SZ = 32;

function curCanvas() {                      // raw 32x32: a DPR-scaled canvas
  var c = document.createElement('canvas'); // would export a 64px cursor
  c.width = CUR_SZ; c.height = CUR_SZ;
  return { c: c, g: c.getContext('2d') };
}

// Every stroke is laid twice — a fat black pass, then the colour — so the
// cursor reads on snow, on ore and on a Rhino alike.
function ink(g, w, col) {
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.lineWidth = w + 2.4; g.strokeStyle = 'rgba(0,0,0,.82)'; g.stroke();
  g.lineWidth = w; g.strokeStyle = col; g.stroke();
}

function inkFill(g, col) {
  g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.82)'; g.stroke();
  g.fillStyle = col; g.fill();
}

// One arm of RA2's four-way move cursor: a chevron sitting `r` from the
// centre, its tip `len` further out (negative len points it inward).
function chevron(g, cx, cy, a, r, len, wid) {
  var ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux;
  g.beginPath();
  g.moveTo(cx + ux * r + px * wid, cy + uy * r + py * wid);
  g.lineTo(cx + ux * (r + len), cy + uy * (r + len));
  g.lineTo(cx + ux * r - px * wid, cy + uy * r - py * wid);
}

function ring(g, r, col, w) { g.beginPath(); g.arc(16, 16, r, 0, 6.2832); ink(g, w || 2, col); }

function curArrow(g) {                       // the plain select pointer
  g.beginPath();
  g.moveTo(2, 1); g.lineTo(2, 20.5); g.lineTo(6.6, 16); g.lineTo(9.8, 23);
  g.lineTo(13, 21.5); g.lineTo(10, 14.8); g.lineTo(16, 14.4); g.closePath();
  inkFill(g, '#f2f6ff');
}

function curFour(g, f, col, inward, pip) {   // move / attack-move / deploy
  var r = inward ? 14 - f * 1.6 : 7.6 + f * 1.6;
  for (var i = 0; i < 4; i++) {
    chevron(g, 16, 16, i * Math.PI / 2, r, inward ? -4.8 : 4.8, 4);
    ink(g, 1.8, col);
  }
  if (pip) { g.beginPath(); g.arc(16, 16, 2, 0, 6.2832); inkFill(g, col); }
}

function curReticle(g, f, col, dot, arms) {  // attack / force-fire
  var r = 12 - f * 1.1, L = 4.2;
  for (var i = 0; i < 4; i++) {
    var qx = (i & 1) ? 1 : -1, qy = (i & 2) ? 1 : -1;
    g.beginPath();
    g.moveTo(16 + qx * r, 16 + qy * (r - L));
    g.lineTo(16 + qx * r, 16 + qy * r);
    g.lineTo(16 + qx * (r - L), 16 + qy * r);
    ink(g, 1.8, col);
  }
  var a0 = arms ? 8.4 : 5.4, a1 = arms ? 3.4 : 2.6;
  g.beginPath();
  g.moveTo(16 - a0, 16); g.lineTo(16 - a1, 16); g.moveTo(16 + a1, 16); g.lineTo(16 + a0, 16);
  g.moveTo(16, 16 - a0); g.lineTo(16, 16 - a1); g.moveTo(16, 16 + a1); g.lineTo(16, 16 + a0);
  ink(g, 1.4, col);
  if (dot) { g.beginPath(); g.arc(16, 16, 1.7, 0, 6.2832); inkFill(g, col); }
}

function curBolt(g, col) {
  g.beginPath();
  g.moveTo(19.5, 3); g.lineTo(9, 18); g.lineTo(15, 18); g.lineTo(12.5, 29);
  g.lineTo(23, 13.5); g.lineTo(17, 13.5); g.closePath();
  inkFill(g, col || '#ffd24a');
}

var CUR_DRAW = {
  select:   { hx: 2, hy: 1, n: 1, d: function (g) { curArrow(g); } },
  move:     { hx: 16, hy: 16, n: 3, d: function (g, f) { curFour(g, f, '#7ef0a0', false, true); } },
  nomove:   { hx: 16, hy: 16, n: 1, d: function (g) {
                ring(g, 9, '#ff5a62', 2.6);
                g.beginPath(); g.moveTo(9.6, 9.6); g.lineTo(22.4, 22.4); ink(g, 2.6, '#ff5a62'); } },
  attack:   { hx: 16, hy: 16, n: 3, d: function (g, f) { curReticle(g, f, '#ff4a52', false, false); } },
  ffire:    { hx: 16, hy: 16, n: 3, d: function (g, f) { curReticle(g, f, '#ffa93a', true, true); } },
  amove:    { hx: 16, hy: 16, n: 3, d: function (g, f) {
                curFour(g, f, '#ffb454', false, false); ring(g, 3.6, '#ff6a5a', 1.6); } },
  guard:    { hx: 16, hy: 16, n: 1, d: function (g) {
                ring(g, 6.2, '#9ee6ff', 1.9);
                for (var i = 0; i < 4; i++) {
                  var a = i * Math.PI / 2 + Math.PI / 4;
                  g.beginPath();
                  g.moveTo(16 + Math.cos(a) * 9.8, 16 + Math.sin(a) * 9.8);
                  g.lineTo(16 + Math.cos(a) * 14, 16 + Math.sin(a) * 14);
                  ink(g, 1.8, '#9ee6ff');
                }
                g.beginPath(); g.arc(16, 16, 1.7, 0, 6.2832); inkFill(g, '#9ee6ff'); } },
  deploy:   { hx: 16, hy: 16, n: 2, d: function (g, f) {
                curFour(g, f, '#ffd24a', true, false);
                g.beginPath(); g.rect(12.5, 12.5, 7, 7); ink(g, 1.8, '#ffd24a'); } },
  enter:    { hx: 16, hy: 16, n: 1, d: function (g) {
                g.beginPath(); g.moveTo(24, 5); g.lineTo(28, 5); g.lineTo(28, 27); g.lineTo(24, 27);
                ink(g, 2.2, '#7ef0a0');
                g.beginPath(); g.moveTo(5, 16); g.lineTo(20, 16);
                g.moveTo(14.5, 10.5); g.lineTo(20.5, 16); g.lineTo(14.5, 21.5);
                ink(g, 2.4, '#7ef0a0'); } },
  sell:     { hx: 16, hy: 16, n: 1, d: function (g) {
                g.beginPath();
                g.moveTo(8, 9); g.lineTo(4, 9); g.lineTo(4, 23); g.lineTo(8, 23);
                g.moveTo(24, 9); g.lineTo(28, 9); g.lineTo(28, 23); g.lineTo(24, 23);
                ink(g, 2, '#ffd24a');
                g.font = 'bold 21px Georgia, "Times New Roman", serif';
                g.textAlign = 'center'; g.textBaseline = 'middle';
                g.lineJoin = 'round'; g.lineWidth = 4.6; g.strokeStyle = 'rgba(0,0,0,.85)';
                g.strokeText('$', 16, 16.5);
                g.fillStyle = '#ffd24a'; g.fillText('$', 16, 16.5); } },
  // The same wrench the in-world repair sprite is drawn from (wrenchPath),
  // so the cursor and the thing turning over the building are one tool.
  repair:   { hx: 16, hy: 16, n: 1, d: function (g) {
                wrenchPath(g, 16, 16, 1, 0, 'handle'); ink(g, 4.4, '#cfe4ff');
                wrenchPath(g, 16, 16, 1, 0, 'jaw'); ink(g, 4, '#cfe4ff'); } },
  power:    { hx: 16, hy: 16, n: 1, d: function (g) { curBolt(g, '#ffd24a'); } },
  waypoint: { hx: 9, hy: 27, n: 1, d: function (g) {
                g.beginPath(); g.moveTo(9, 28); g.lineTo(9, 4); ink(g, 2.2, '#e8eef8');
                g.beginPath(); g.moveTo(10.2, 5); g.lineTo(24, 9.5); g.lineTo(10.2, 14); g.closePath();
                inkFill(g, '#7ef0a0'); } },
  chrono:   { hx: 16, hy: 16, n: 3, d: function (g, f) {
                g.beginPath();
                for (var t = 0; t <= Math.PI * 4; t += 0.14) {
                  var rr = 1.2 + t * 1.02, a = t + f * 0.5;
                  var x = 16 + Math.cos(a) * rr, y = 16 + Math.sin(a) * rr;
                  if (t === 0) g.moveTo(x, y); else g.lineTo(x, y);
                }
                ink(g, 2, '#9ad8ff'); } },
  nuke:     { hx: 16, hy: 16, n: 2, d: function (g, f) {
                ring(g, 12 - f, '#ffe45a', 2);
                for (var i = 0; i < 3; i++) {
                  var a = -Math.PI / 2 + i * 2.0944, w = 0.46;
                  g.beginPath();
                  g.moveTo(16 + Math.cos(a - w) * 2.6, 16 + Math.sin(a - w) * 2.6);
                  g.arc(16, 16, 8, a - w, a + w);
                  g.lineTo(16 + Math.cos(a + w) * 2.6, 16 + Math.sin(a + w) * 2.6);
                  g.closePath(); inkFill(g, '#ffe45a');
                }
                g.beginPath(); g.arc(16, 16, 1.8, 0, 6.2832); inkFill(g, '#ffe45a'); } },
  storm:    { hx: 16, hy: 16, n: 2, d: function (g, f) { ring(g, 12 - f, '#c8b6ff', 2); curBolt(g, '#e6dcff'); } },
  curtain:  { hx: 16, hy: 16, n: 2, d: function (g, f) {
                ring(g, 12 - f, '#ff9a6a', 2);
                g.beginPath();
                g.moveTo(16, 6); g.lineTo(23, 9.5); g.lineTo(23, 17);
                g.quadraticCurveTo(23, 23, 16, 26.5);
                g.quadraticCurveTo(9, 23, 9, 17); g.lineTo(9, 9.5); g.closePath();
                inkFill(g, '#ff9a6a'); } }
};

var CURSORS = null;

function buildCursors() {
  if (CURSORS || headless) return;
  CURSORS = {};
  for (var k in CUR_DRAW) {
    var spec = CUR_DRAW[k], frames = [];
    for (var f = 0; f < spec.n; f++) {
      var o = curCanvas();
      try { spec.d(o.g, f); frames.push(o.c.toDataURL()); } catch (e) { frames.push(''); }
    }
    CURSORS[k] = { hx: spec.hx, hy: spec.hy, f: frames };
  }
}

var curKind = 'select', curFrameN = 0, curApplied = '';

function applyCursor() {
  if (headless || !cv) return;
  buildCursors();
  var c = CURSORS && (CURSORS[curKind] || CURSORS.select);
  if (!c || !c.f.length || !c.f[0]) return;
  var url = c.f[c.f.length > 1 ? curFrameN % c.f.length : 0];
  var css = 'url(' + url + ') ' + c.hx + ' ' + c.hy + ', auto';
  if (css === curApplied) return;
  curApplied = css; cv.style.cursor = css;
}

// What a click WOULD do, right now, given the hover, the modifiers and any
// armed mode. Called from pointermove and from the animation timer, so a
// cursor that changes only because Ctrl went down still updates.
function pickCursor() {
  if (headless || !cv) return;
  var k = 'select';
  if (pan) {                          // middle/right-drag: grabbing the map
    if (curApplied !== 'grabbing') { curApplied = 'grabbing'; cv.style.cursor = 'grabbing'; }
    curKind = 'select'; return;
  }
  if (!G || (state !== 'play' && state !== 'paused')) k = 'select';
  else if (swMode) k = swMode.key === 'chrono' ? 'chrono'
                      : (swMode.key === 'nuke' ? 'nuke'
                      : (swMode.key === 'storm' ? 'storm'
                      : (swMode.key === 'para' ? 'deploy' : 'curtain')));
  else if (placing) {
    var pd = bspecFor(placing, keyFac(G, ME, placing, true));
    var po = placeOrigin(hoverTile, pd);
    k = canPlace(G, ME, placing, po.x, po.y) ? 'deploy' : 'nomove';
  }
  else if (cmdMode === 'sell' || cmdMode === 'repair' || cmdMode === 'power') {
    // The mode cursor is a promise: only over one of your own structures.
    var mh = (mouse.in && !drag) ? pickAt(mouse.x, mouse.y) : null;
    k = (mh && mh.kind === 'b' && mh.p === ME) ? cmdMode : 'nomove';
  }
  else {
    var hov = (mouse.in && !drag) ? pickAt(mouse.x, mouse.y) : null;
    var units = [];
    for (var i = 0; i < sel.length; i++) if (sel[i].kind === 'u' && !sel[i].dead && sel[i].p === ME) units.push(sel[i]);
    if (cmdMode === 'follow') k = (hov && hov.p === ME && hov.kind === 'u' && units.length) ? 'guard' : 'nomove';
    // A selected Barracks / War Factory takes a rally point from a click on
    // the map: the cursor has to say so (it stayed `select`, so the one
    // affordance was invisible until tried — audit).
    else if (!units.length && !hov && sel.length && sel.every(function (b) {
               return b.kind === 'b' && b.p === ME && !b.dead && (BLDS[b.type].makes === 'i' || BLDS[b.type].makes === 'v');
             }) && inMap(hoverTile.x, hoverTile.y)) k = 'waypoint';
    else if (!units.length) k = 'select';
    else if ((mod.ctrl && mod.shift) || cmdMode === 'amove') k = 'amove';
    else if (mod.ctrl) k = 'ffire';
    else if (hov && !hov.dead && hov.p !== ME) {
      var cap = hov.kind === 'b' && units.some(function (u) { return UNITS[u.type].capture; })
                && !(BLDS[hov.type].civ && !occCount(hov));
      // RA2's ENTER cursor: a GI or Conscript over a city block with room in it.
      var gar = hov.kind === 'b' && garrisonable(G, hov, ME) &&
                units.some(function (u) { return canOccupy(u.type); });
      // A Spy over an enemy structure gets the same ENTER cursor a captor does.
      var spyIn = hov.kind === 'b' && !neutral(hov.p) && !BLDS[hov.type].wall && !BLDS[hov.type].gate &&
                  !BLDS[hov.type].neut && units.some(function (u) { return UNITS[u.type].infil; });
      k = (cap || gar || spyIn) ? 'enter'
        : (units.some(function (u) { return canHit(UNITS[u.type], hov, u); }) ? 'attack' : 'nomove');
    }
    // Our own garrisoned block: the enter cursor still applies (reinforce it).
    else if (hov && hov.kind === 'b' && hov.p === ME && garrisonable(G, hov, ME) &&
             units.some(function (u) { return canOccupy(u.type); })) k = 'enter';
    // Our own Tesla Coil under a Tesla Trooper, or a damaged building under
    // an Engineer: both are RA2's ENTER. Ivan over anything is ATTACK.
    else if (hov && hov.kind === 'b' && hov.p === ME &&
             ((hov.type === 'tesla' && units.some(function (u) { return UNITS[u.type].coiler; })) ||
              (hov.hp < hov.maxhp && !BLDS[hov.type].hut && units.some(function (u) { return UNITS[u.type].capture; })))) k = 'enter';
    // Our own transport with room in it, under a unit that fits: RA2's ENTER.
    else if (hov && hov.kind === 'u' && hov.p === ME && paxCapOf(hov) &&
             units.some(function (u) { return canBoard(G, hov, u); })) k = 'enter';
    // A miner over our own Ore Refinery. RA2 shows the ENTER cursor here:
    // docking is action 0x03 Enter, which is why both miners carry a
    // `VoiceEnter=` line. Ours fell through to `select`, so the one cue the
    // player had said the refinery was NOT an order target — and it was
    // reported in exactly those words: "refinery isn't an end point".
    // The order had already been wired; nothing on screen ever said so.
    else if (hov && hov.kind === 'b' && hov.p === ME && hov.type === 'refinery' &&
             units.some(function (u) { return isHarv(u); })) k = 'enter';
    // A vehicle over our Service Depot, a pad aircraft over its Airforce
    // Command: both are ENTER (the click sends them in — rightOrder's wantsOwn).
    else if (hov && hov.kind === 'b' && hov.p === ME && hov.type === 'depot' &&
             units.some(function (u) { return UNITS[u.type].cls === 'v' && !u.air; })) k = 'enter';
    else if (hov && hov.kind === 'b' && hov.p === ME && hov.type === 'airforce' &&
             units.some(function (u) { return UNITS[u.type].ammo && u.pad; })) k = 'enter';
    else if (hov && hov.p === ME && !hov.bomb && units.some(function (u) { return UNITS[u.type].ivan; })) k = 'attack';
    else if (hov && hov.p === ME) k = 'select';
    else if (!inMap(hoverTile.x, hoverTile.y)) k = 'nomove';
    else if (pathMode || mod.shift) k = 'waypoint';
    // ...and over the DOCK a refinery draws, with a miner selected. Same
    // cell the right-click below turns into a dock order, so the one cue the
    // game gives cannot disagree with what the click will do.
    else if (units.some(function (u) { return isHarv(u); }) &&
             dockAt(G, ME, hoverTile.x, hoverTile.y)) k = 'enter';
    // Each selected mover asks its OWN class: a Destroyer over the shore
    // is barred, a Grizzly over the bay is barred, and a mixed selection
    // shows MOVE if anything in it can actually go there.
    else if (units.some(function (u) {
               return u.air || terrPass(G.terrain[idx(hoverTile.x, hoverTile.y)], moverOf(u));
             })) k = 'move';
    else k = 'nomove';
  }
  if (k !== curKind) { curKind = k; curFrameN = 0; }
  applyCursor();
}

// 6.7 fps: RA2's cursors are slow, deliberate loops, not a flicker. The
// same beat re-reads the hover context, so a cursor that changes because
// Ctrl went down updates without the mouse moving.
if (typeof setInterval === 'function') setInterval(function () { curFrameN++; pickCursor(); }, 150);

// --- generated ---
// ESM import bindings are read-only, so a write from another module goes
// through the owner. Reads stay verbatim everywhere: the binding is live.
function setCurApplied(v) { curApplied = v; }

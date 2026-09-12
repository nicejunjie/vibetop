// Iron Frontier — ui/input.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.

import { BLDS } from '../blds.js';
import { bspecFor, bspecOfB, eliteOf, isHarv, ucap, vetFire, vetRofU } from '../combat-tables.js';
import { boom, damage, entX, entY, near } from '../combat.js';
import { MAKE_T, killBld } from '../entities.js';
import { keyFac } from '../factions.js';
import { altOf, canHit, hullZone, isAir, isNaval, moverOf, navReach } from '../geom.js';
import { entById } from '../move.js';
import { cmd, idsOf } from '../net.js';
import { canOccupy, damageBridge, garrisonable, occCount } from '../neutral.js';
import { dockAt } from '../ore.js';
import { astar, requestPath } from '../path.js';
import { canPlace, countBld, freeTileNear, isPrimary, producersOf, setPrimary, spreadSpot } from '../production.js';
import { UNITS, ifvSpec } from '../roster.js';
import { entSeen } from '../shroud.js';
import { G, headless, idx, inMap, state } from '../state.js';
import { canBoard, paxCapOf, paxCount } from '../transport.js';
import { GUARD_STRAY, ME, T_WATER, neutral, oreT, terrPass } from '../world.js';
import { eva, resumeAudio, sfx, unitAck } from './audio.js';
import { pickCursor, setCurApplied } from './cursors.js';
import { IS_TOUCH, cv, cvH, cvW, mini } from './dom.js';
import { say, swCancel, swClickMap, swMode, updateHover } from './hud.js';
import { cardStack, closeBoard, closeHelp, closeOptions, eatResumeClick, hv, lv, mmss, optOpen, ov, setEatResumeClick, showOptions, togglePause } from './menus.js';
import { MM_PX, mmToGrid, radarUp } from './minimap.js';
import { hideTip, ptip, selectTab, showTip } from './panel.js';
import { VX0, VX1, VY0, VY1, render } from './render.js';
import { lsGet } from './save.js';
import { cam, centerOn, clampCam, gridFromW, groups, hoverTile, placing, screenToGrid, sel, setPlacing, setSel, setZoom, sx, sy, unzoom, zoom } from './screen.js';

// --------------------------------------------------------------------- //
//  Input
// --------------------------------------------------------------------- //
var keys = {};

// Held modifiers, kept as their own record: the cursor has to know that
// Ctrl is down even when the mouse has not moved, and a right-click order
// reads the same three flags the cursor drew itself from.
export var mod = { ctrl: false, shift: false, alt: false };

function readMod(e) { mod.ctrl = !!(e.ctrlKey || e.metaKey); mod.shift = !!e.shiftKey; mod.alt = !!e.altKey; }

export var drag = null, pan = null, marq = document.getElementById('marq');

export var mouse = { x: -1, y: -1, in: false };

var lastClickT = 0, lastClickType = null;

export var views = {};                     // keyboard.ini View1..4 camera bookmarks

window.addEventListener('keydown', function (e) {
  if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  keys[e.key.toLowerCase()] = true;
  readMod(e); pickCursor();

  if (e.key === 'Escape') {
    // The card opened LAST closes first (help or the leaderboard can sit
    // over the Options card when opened by key).
    var top = cardStack.length ? cardStack[cardStack.length - 1] : null;
    if (top === 'help' && hv.classList.contains('show')) { closeHelp(); return; }
    if (top === 'lb' && lv.classList.contains('show')) { closeBoard(); return; }
    if (ov.classList.contains('show')) { if (optOpen) closeOptions(); return; }
    if (hv.classList.contains('show')) { closeHelp(); return; }
    if (lv.classList.contains('show')) { closeBoard(); return; }
    if (swCancel()) return;
    if (cmdMode) { cmdMode = null; refreshCmdbar(); pickCursor(); say('Mode cancelled'); return; }
    if (pathMode) { pathMode = false; refreshCmdbar(); say('Waypoint mode off'); return; }
    if (placing) { setPlacing(null); wallDrag = null; cv.classList.remove('placing'); pickCursor(); say('Placement cancelled'); return; }
    if (sel.length) { clearSel(); return; }
    // keyboard.ini Options=27: with nothing left to cancel, Esc IS the
    // in-game menu, exactly as it is in RA2.
    if (state === 'play' || state === 'paused') showOptions();
    return;
  }
  // keyboard.ini CenterOnRadarEvent=32 (Space) and CenterBase=72 (H) are
  // two different keys in RA2: Space answers "where did that explosion
  // happen", H answers "take me home". They used to both go home.
  if (e.key === ' ') {
    e.preventDefault();
    if (G && G.radarEvent) { centerOn(G.radarEvent.x, G.radarEvent.y); clampCam(); camVel.x = camVel.y = 0; say('Last radar event'); }
    else { goHome(); say('Nothing on the radar yet — showing your base'); }
    return;
  }
  if (e.key.toLowerCase() === 'h') { goHome(); return; }
  // keyboard.ini CenterView=12 — numpad 5 centres on the SELECTION, which is
  // the one thing Space (last radar event) and H (your base) do not do.
  if (e.code === 'Numpad5' && state === 'play') {
    e.preventDefault();
    var live = sel.filter(function (o) { return !o.dead; });
    if (!live.length) { say('Nothing selected to centre on', true); sfx('no'); return; }
    var mx = 0, my = 0;
    live.forEach(function (o) { mx += entX(o); my += entY(o); });
    centerOn(mx / live.length, my / live.length); clampCam();
    camVel.x = camVel.y = 0;
    say(live.length === 1 ? 'Centred on your selection'
                          : 'Centred on ' + live.length + ' selected units');
    return;
  }
  // keyboard.ini AllToCheer=67 (C) — plain C, since Ctrl+C is ScreenCapture.
  if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey && state === 'play') {
    if (!G) return;
    G.cheerUntil = G.tick + 100;
    say('The army cheers'); sfx('click');
    return;
  }
  // keyboard.ini Delete=46 — self-destruct the selection. RA2 asks nothing.
  if (e.key === 'Delete' && state === 'play') {
    var dl = sel.filter(function (o) { return !o.dead && o.p === ME; });
    if (!dl.length) { say('Nothing selected to destroy', true); return; }
    cmd('destroy', { u: idsOf(dl) });
    return;
  }
  // keyboard.ini SidebarUp/SidebarDown: PageUp/PageDown scroll the build
  // list, Home/End jump to its ends. The arrows are the camera here (they
  // are in RA2 too), so the page keys are the ones that reach the sidebar.
  if (/^(PageUp|PageDown|Home|End)$/.test(e.key) && (state === 'play' || state === 'paused')) {
    var pl = document.getElementById('plist');
    if (pl) {
      e.preventDefault();
      var page = Math.max(60, pl.clientHeight - 24);
      if (e.key === 'PageUp') pl.scrollTop -= page;
      else if (e.key === 'PageDown') pl.scrollTop += page;
      else if (e.key === 'Home') pl.scrollTop = 0;
      else pl.scrollTop = pl.scrollHeight;
      return;
    }
  }
  // keyboard.ini ScreenCapture=579 (Ctrl+C). RA2 wrote a .pcx beside the
  // game; the browser equivalent is to hand the canvas over as a PNG.
  if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C') && !e.shiftKey) {
    e.preventDefault(); screenCapture(); return;
  }
  // keyboard.ini View1..4=112..115 (F1-F4), SetView1..4=624..627 (Ctrl+F1-F4).
  if (/^F[1-4]$/.test(e.key) && G) {
    e.preventDefault();
    var vn = e.key.charAt(1);
    if (e.ctrlKey || e.metaKey) { views[vn] = { x: cam.x, y: cam.y, z: zoom }; say('View ' + vn + ' saved'); sfx('click'); }
    else if (views[vn]) { cam.x = views[vn].x; cam.y = views[vn].y; setZoom(views[vn].z, cvW / 2, cvH / 2); clampCam(); camVel.x = camVel.y = 0; say('View ' + vn); }
    else say('View ' + vn + ' is empty — Ctrl+F' + vn + ' saves this one', true);
    return;
  }
  var units0 = sel.filter(function (u) { return u.kind === 'u' && !u.dead; });
  if (units0.length && (e.key === 's' || e.key === 'S' || e.key === 'g' || e.key === 'G')) {
    // RA2 keeps StopObject (S) and GuardObject (G) apart: Stop drops the
    // order and roots the unit — it fires at what walks into range but
    // never moves — while Guard makes it defend the post it is standing
    // on, straying up to GuardModeStray cells to engage and walking back.
    cmd('hold', { u: idsOf(units0), kind: e.key.toLowerCase() === 'g' ? 'guard' : 'stop', sfx: 0 });
    return;
  }
  if ((units0.length || sel.some(function (o) { return o.kind === 'b' && !o.dead; })) && (e.key === 'd' || e.key === 'D')) { unitsCmd('deploy'); return; }   // D also evacuates a held building, like the button
  if (units0.length && (e.key === 'x' || e.key === 'X')) {
    // Scatter: each unit steps one or two tiles away from the group centre.
    cmd('scatter', { u: idsOf(units0) });
    return;
  }
  if (e.key.toLowerCase() === 'p') { if (state === 'play' || state === 'paused') togglePause(); return; }

  // ---- keyboard.ini's sidebar keys -------------------------------------
  // Q/W/E/R pick the four tabs, T is TypeSelect, K/L are the Repair and
  // Sell toggles, Z is PlanningMode. These are unambiguous now that W/A/S/D
  // no longer pan the camera — a letter key does ONE thing.
  var lk = e.key.toLowerCase();
  if (state === 'play' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    var TABK = { q: 'b', w: 'd', e: 'i', r: 'v' };
    if (TABK[lk]) { selectTab(TABK[lk]); return; }
    if (lk === 't') { selectSameType(); return; }
    if (lk === 'k') { setCmdMode('repair'); return; }
    if (lk === 'l') { setCmdMode('sell'); return; }
    if (lk === 'z') { pathMode = !pathMode; say(pathMode ? 'Waypoint mode: clicks queue stops' : 'Waypoint mode off'); refreshCmdbar(); pickCursor(); return; }
    if (lk === 'n') { nextObject(); return; }         // keyboard.ini NextObject=78
    if (lk === 'f') {                                  // keyboard.ini Follow=70
      if (!units0.length) { say('Select the units that should follow first', true); sfx('no'); return; }
      setCmdMode('follow'); return;
    }
  }

  // keyboard.ini teams: TeamSelect_1..10 = 1..9,0 · TeamCreate = Ctrl+digit
  // · TeamAddSelect = Shift+digit · TeamCenter = Alt+digit.
  if (/^[0-9]$/.test(e.key) && state === 'play') {
    var tk = e.key === '0' ? '10' : e.key;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      groups[tk] = sel.filter(function (u) { return !u.dead && u.kind === 'u'; });
      say('Team ' + tk + ': ' + groups[tk].length + ' unit' + (groups[tk].length === 1 ? '' : 's')); refreshCmdbar();
    } else if (e.altKey) {
      e.preventDefault();
      var gc = (groups[tk] || []).filter(function (u) { return !u.dead; });
      if (gc.length) { centerOn(gc[0].x, gc[0].y); clampCam(); camVel.x = camVel.y = 0; say('Team ' + tk); }
      else say('Team ' + tk + ' is empty', true);
    } else if (e.shiftKey) {
      // Shift+digit ADDS the current selection to the team (TeamAddSelect).
      var add = sel.filter(function (u) { return !u.dead && u.kind === 'u'; });
      var cur = (groups[tk] || []).filter(function (u) { return !u.dead; });
      add.forEach(function (u) { if (cur.indexOf(u) < 0) cur.push(u); });
      groups[tk] = cur;
      say('Team ' + tk + ' now ' + cur.length + ' unit' + (cur.length === 1 ? '' : 's')); refreshCmdbar();
    } else if (groups[tk]) {
      clearSel();
      groups[tk] = groups[tk].filter(function (u) { return !u.dead; });
      groups[tk].forEach(function (u) { u.sel = true; sel.push(u); });
      unitAck(sel, 'select');
      if (sel.length) { centerSelIfOffscreen(); say('Team ' + tk + ': ' + sel.length + ' selected'); }
    }
  }
});

// keyboard.ini NextObject=78 (N): step through everything you own, one
// object per press, centring on each. RA2's way of finding the harvester
// that has wandered off or the tank left behind at the last battle.
var nextIdx = 0;

function nextObject() {
  if (!G) return;
  var own = [];
  G.units.forEach(function (u) { if (!u.dead && u.p === ME) own.push(u); });
  G.blds.forEach(function (b) { if (!b.dead && b.p === ME) own.push(b); });
  if (!own.length) { say('Nothing left to cycle through', true); return; }
  nextIdx = (nextIdx + 1) % own.length;
  var o = own[nextIdx];
  clearSel(); o.sel = true; sel.push(o);
  centerOn(o.kind === 'b' ? o.cx : o.x, o.kind === 'b' ? o.cy : o.y);
  clampCam(); camVel.x = camVel.y = 0;
  say((nextIdx + 1) + '/' + own.length + ' · ' + describe(o));
  sfx('click');
}

window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; readMod(e); pickCursor(); });

// A pointer that starts a marquee must survive leaving the canvas, and any
// lost pointer has to clear it — pointerup alone is not enough (house rule).
var RIGHT_SLOP = 5;                           // px of travel a right-click may have and still be a click

function endPan() {
  if (!pan) return;
  var p = pan; pan = null;
  setCurApplied(''); pickCursor();
  // A click, not a drag: RIGHT_SLOP px of hand-shake still counts as a click,
  // but once the map has actually moved it stays navigation and nothing is
  // ordered — a jittery right-click must never send an army somewhere.
  if (p.right && !p.moved && Math.abs(mouse.x - p.x0) <= RIGHT_SLOP && Math.abs(mouse.y - p.y0) <= RIGHT_SLOP &&
      G && state === 'play') { clearSel(); refreshCmdbar(); }   // RA2: a still right-click deselects
}

function endDrag() {
  endPan();
  if (!drag) return;
  var d = drag; drag = null;
  marq.style.display = 'none';
  if (!G || state !== 'play') return;
  var w = Math.abs(d.x2 - d.x1), h = Math.abs(d.y2 - d.y1);
  if (w < 5 && h < 5) { leftClick(d.x2, d.y2, d.shift, d.ctrl); return; }
  boxSelect(Math.min(d.x1, d.x2), Math.min(d.y1, d.y2), w, h, d.shift);
}

// RA2's mouse (2026-09-10, on request): the LEFT button both selects and
// orders -- click one of your own to select it, click anything else with a
// selection to order it there (move / attack / harvest / enter, all in
// rightOrder, whose name is now historical); the RIGHT button only looks
// around (drag) and, without moving, deselects. Modifiers as before: Shift
// adds to a selection or queues an order, Ctrl force-fires.
// A left click on one of your OWN things is a SELECT — unless the selection
// has an order for it, which the cursor already announces: ENTER over a
// transport with room, a garrisonable block, a Tesla Coil under a Trooper,
// a damaged building under an Engineer, a refinery under a miner; ATTACK
// for Crazy Ivan. The same tests as pickCursor's own-target branches, so
// the click does what the cursor showed. Before this, "select own" won and
// troops could not be put into an IFV at all (2026-09-11). Shift still
// ADDS the own unit to the selection, as it always did.
export function ownTargetOrder(e, units) {
  if (!e || e.dead || e.p !== ME || !units.length) return false;
  if (!e.bomb && units.some(function (u) { return UNITS[u.type].ivan; })) return true;
  if (e.kind === 'u') return !!paxCapOf(e) && units.some(function (u) { return u !== e && canBoard(G, e, u); });
  if (garrisonable(G, e, ME) && units.some(function (u) { return canOccupy(u.type); })) return true;
  if (e.type === 'tesla' && units.some(function (u) { return UNITS[u.type].coiler; })) return true;
  if (e.hp < e.maxhp && !BLDS[e.type].hut && units.some(function (u) { return UNITS[u.type].capture; })) return true;
  if (e.type === 'refinery' && units.some(function (u) { return isHarv(u); })) return true;
  // The two rungs of rightOrder's wantsOwn the first cut of this rule
  // missed (audit): a vehicle into the Service Depot, a plane home.
  if (e.type === 'depot' && units.some(function (u) { return UNITS[u.type].cls === 'v' && !u.air; })) return true;
  if (e.type === 'airforce' && units.some(function (u) { return UNITS[u.type].ammo && u.pad; })) return true;
  return false;
}

function leftClick(px, py, shift, ctrl) {
  var e = pickAt(px, py);
  var mine = sel.filter(function (u) { return u.kind === 'u' && u.p === ME && !u.dead; });
  var own = sel.some(function (u) { return u.p === ME && !u.dead; });
  if (cmdMode === 'amove' && own) { rightOrder(px, py, shift, ctrl); return; }   // the mode decides, not what is under the click
  // Sell / repair / power / follow: the click is the mode's, never an order —
  // a tap on the ground in Sell mode used to march the selection there.
  if (cmdMode) { clickSelect(px, py, shift); return; }
  if (e && e.p === ME && !(ctrl && own) && !(!shift && ownTargetOrder(e, mine))) { clickSelect(px, py, shift); return; }
  if (own) { rightOrder(px, py, shift, ctrl); return; }
  clickSelect(px, py, shift);
}

// ---- Touch: one finger taps (select own / order at) or drags to pan; two
// fingers pinch-zoom about their midpoint. No box-select on touch; RA2 was
// never a touch game, but the shell is used on phones and tablets.
var touches = {}, touchN = 0, tg = null;

var TWO_SLOP = 14;        // px of drift a two-finger TAP may have and stay a tap

var twoDead = false;      // a third finger joined: this gesture is not a right-click

function touchPts() { var a = []; for (var k in touches) a.push(touches[k]); return a; }

// What the RIGHT MOUSE BUTTON does, reachable without a mouse. Same order of
// precedence as the pointerdown handler's `e.button === 2` branch: cancel a
// superweapon, else cancel a placement, else issue the order.
function touchRight(px, py) {
  if (swCancel()) return;
  if (placing) { setPlacing(null); wallDrag = null; cv.classList.remove('placing'); say('Placement cancelled'); return; }
  if (cmdMode) { cmdMode = null; refreshCmdbar(); pickCursor(); say('Mode cancelled'); return; }
  if (G && state === 'play') { clearSel(); refreshCmdbar(); }
}

function touchTap(px, py) {
  if (swMode) { swClickMap(px, py); return; }
  if (placing) { tryPlace(px, py); return; }
  // A tap IS the left click, own-target rule included — this used to
  // re-implement "tap own = select" and so no troop could board an IFV and
  // no miner could dock from a tablet (touch audit, 2026-09-11).
  leftClick(px, py, false, false);
}

function touchDown(e, px, py) {
  touches[e.pointerId] = { x: px, y: py }; touchN++;
  try { cv.setPointerCapture(e.pointerId); } catch (err) {}
  var pts = touchPts();
  if (touchN === 1) tg = { mode: 'tap', x0: px, y0: py, t0: performance.now(), lx: px, ly: py };
  else if (touchN === 2) {
    var dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
    var mx0 = (pts[0].x + pts[1].x) / 2, my0 = (pts[0].y + pts[1].y) / 2;
    // Two fingers are a pinch OR a right-click, and which one is not known
    // until they lift: a TAP (quick, and the pair never really moved) is the
    // right button, anything else is pinch/pan. So the origin and a moved flag
    // ride along, and touchUp decides.
    tg = { mode: 'pinch', d0: Math.sqrt(dx * dx + dy * dy) || 1, z0: zoom,
           mx: mx0, my: my0, mx0: mx0, my0: my0, d00: Math.sqrt(dx * dx + dy * dy) || 1,
           t0: performance.now(), moved: false };
  } else { tg = null; twoDead = true; }   // 3+ fingers: not a right-click
}

function touchMove(e, px, py) {
  if (!touches[e.pointerId]) return;
  touches[e.pointerId].x = px; touches[e.pointerId].y = py;
  if (!tg) return;
  if (tg.mode === 'pinch') {
    var pts = touchPts(); if (pts.length < 2) return;
    var dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    var mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
    // TWO_SLOP of hand-shake still counts as a tap — two fingers never land
    // and lift perfectly still, and a right-click that needs a steady hand is
    // a right-click that misses.
    if (Math.abs(mx - tg.mx0) + Math.abs(my - tg.my0) > TWO_SLOP ||
        Math.abs(d - tg.d00) > TWO_SLOP) tg.moved = true;
    setZoom(tg.z0 * d / tg.d0, mx, my);
    cam.x -= (mx - tg.mx) / zoom; cam.y -= (my - tg.my) / zoom; clampCam();
    tg.mx = mx; tg.my = my;
    return;
  }
  if (tg.mode === 'tap' && Math.abs(px - tg.x0) + Math.abs(py - tg.y0) > 9) tg.mode = 'pan';
  if (tg.mode === 'pan') {
    cam.x -= (px - tg.lx) / zoom; cam.y -= (py - tg.ly) / zoom; clampCam();
    camVel.x = camVel.y = 0;
  }
  tg.lx = px; tg.ly = py;
}

function touchUp(e, px, py) {
  if (!touches[e.pointerId]) return;
  delete touches[e.pointerId]; touchN = Math.max(0, touchN - 1);
  if (tg && tg.mode === 'tap' && G && state === 'play') touchTap(px, py);   // a still finger is a tap, however long it rested
  // Two-finger tap = right click, fired on the FIRST lift and at the midpoint
  // the pair landed on — not at this finger, which is off to one side of what
  // the player was pointing at. tg is replaced on the line below, so the
  // second finger coming up cannot fire it again.
  else if (tg && tg.mode === 'pinch' && !tg.moved && !twoDead &&
           performance.now() - tg.t0 < 400) touchRight(tg.mx0, tg.my0);
  tg = touchN === 1 ? { mode: 'pan', lx: touchPts()[0].x, ly: touchPts()[0].y, x0: -99, y0: -99, t0: 0 } : null;
  if (!touchN) twoDead = false;
}

cv.addEventListener('pointerup', function (e) {
  if (e.pointerType !== 'touch') return;
  var r = cv.getBoundingClientRect(); touchUp(e, e.clientX - r.left, e.clientY - r.top);
});

cv.addEventListener('pointercancel', function (e) {
  if (e.pointerType !== 'touch') return;
  delete touches[e.pointerId]; touchN = Math.max(0, touchN - 1); tg = null;
});

cv.addEventListener('pointerdown', function (e) {
  resumeAudio();
  if (eatResumeClick) { setEatResumeClick(false); return; }   // it un-paused; that is all it does
  if (!G || (state !== 'play' && state !== 'paused')) return;
  var r = cv.getBoundingClientRect();
  var px = e.clientX - r.left, py = e.clientY - r.top;
  if (e.pointerType === 'touch') { e.preventDefault(); touchDown(e, px, py); return; }
  if (e.button === 0) {
    if (swMode) { swClickMap(px, py); return; }
    if (placing) { tryPlace(px, py); return; }
    drag = { x1: px, y1: py, x2: px, y2: py, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
  } else if (e.button === 1) {
    e.preventDefault();                       // middle-drag pans the map
    pan = { x: px, y: py };
    pickCursor();
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
  } else if (e.button === 2) {
    e.preventDefault();
    if (swCancel()) return;
    if (placing) {
      var ranWall = !!wallDrag;
      setPlacing(null); wallDrag = null; cv.classList.remove('placing');
      say(ranWall ? 'Wall finished' : 'Placement cancelled'); return;
    }
    // The right button only LOOKS: a drag pans, and a click that never
    // travelled deselects (see endPan). Orders are the left button's.
    pan = { x: px, y: py, x0: px, y0: py, right: true, moved: false,
            shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
    pickCursor();
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
  }
});

cv.addEventListener('pointermove', function (e) {
  var r = cv.getBoundingClientRect();
  var nx = e.clientX - r.left, ny = e.clientY - r.top;
  if (e.pointerType === 'touch') { touchMove(e, nx, ny); return; }
  // Decide drag-vs-click HERE: the camera loop only runs on a frame, so a
  // fast flick could finish between frames and be mistaken for a click.
  if (pan && pan.right && !pan.moved &&
      (Math.abs(nx - pan.x0) > RIGHT_SLOP || Math.abs(ny - pan.y0) > RIGHT_SLOP)) pan.moved = true;
  // (Pointer speed for the edge band is measured at the document level —
  // see trackPageMouse — because the band now lives at the WINDOW edges.)
  mouse.x = nx; mouse.y = ny; mouse.in = true;
  var hovE = drag ? null : pickAt(nx, ny);
  updateHover(hovE, nx, ny);
  // Right-click would do nothing: an enemy aircraft with no AA in the selection.
  var noAir = !!(hovE && hovE.p !== ME && isAir(hovE) && sel.length &&
                 !sel.some(function (u) { return u.kind === 'u' && canHit(UNITS[u.type], hovE, u); }));
  if (cv.classList.contains('noair') !== noAir) cv.classList.toggle('noair', noAir);
  readMod(e);
  var gp = screenToGrid(mouse.x, mouse.y);
  hoverTile.x = Math.round(gp.x); hoverTile.y = Math.round(gp.y);
  pickCursor();
  if (wallDrag) dragWall(mouse.x, mouse.y);
  if (drag) {
    drag.x2 = mouse.x; drag.y2 = mouse.y;
    marq.style.display = 'block';
    marq.style.left = Math.min(drag.x1, drag.x2) + 'px';
    marq.style.top = Math.min(drag.y1, drag.y2) + 'px';
    marq.style.width = Math.abs(drag.x2 - drag.x1) + 'px';
    marq.style.height = Math.abs(drag.y2 - drag.y1) + 'px';
  }
});

cv.addEventListener('pointerup', function (e) { wallDrag = null; endDrag(e); });

// (No double-click deploy: the double-click is "select all of this type",
// and one gesture that ALSO unpacked every MCV planted a Construction Yard
// from a select-all — audit, 2026-09-11. D and the Deploy button deploy.)
cv.addEventListener('pointercancel', endDrag);

cv.addEventListener('lostpointercapture', endDrag);

cv.addEventListener('pointerleave', function () { mouse.in = false; updateHover(null); });

cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

cv.addEventListener('wheel', function (e) {
  e.preventDefault();
  var r = cv.getBoundingClientRect();
  setZoom(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX - r.left, e.clientY - r.top);
}, { passive: false });

// The game is an iframe inside the desktop shell: a pointer released over
// the parent's taskbar never reaches us, and a tab switch must not leave
// the camera scrolling forever.
window.addEventListener('blur', function () {
  // Drop held input so nothing is stuck down, but do NOT pause: a real-time
  // match that stops because the cursor wandered off is worse than one that
  // keeps running, and pausing is what the pause button is for.
  keys = {}; mod.ctrl = mod.shift = mod.alt = false; endDrag(); mouse.in = false; pickCursor();
});

export function clearSel() { sel.forEach(function (u) { u.sel = false; }); setSel([]); }

// ---- RA2's command bar + the three sidebar toggles ---------------------
// ui.ini's [AdvancedCommandBar] is six buttons — Team01, Team02,
// TypeSelect, Deploy, Guard, PlanningMode — and Sell / Repair / Power are
// the three TOGGLES on the sidebar itself, under the radar.
//
// SCATTER is the seventh, added by hand. An earlier pass cut it on the
// grounds that RA2 gives it no button, only the X key — which left the one
// panic command in the game reachable only by a key you have to already
// know. It is back, next to Guard, because those two are the same kind of
// order (what the selection does when it is not being driven) and a player
// looking for one is looking for the other. Stop stays keyboard-only: S is
// Guard's neighbour in meaning, and the bar is a row you scan, not a list.
//
// The bar itself lives at the BOTTOM OF THE SCREEN across the battlefield,
// not in the corner of the build menu — see the #cmdbar CSS.
export var cmdMode = null;          // 'sell' | 'repair' | 'power' | null

export var pathMode = false;        // waypoint mode: right-clicks queue

var cmdbar = document.getElementById('cmdbar');

var sbtools = document.getElementById('sbtools');

var CMD_TIP = {
  t1:     ['Team 1', 'Click to select · Shift-click (or hold) to assign', 'Ctrl+1 assigns, 1 recalls'],
  t2:     ['Team 2', 'Click to select · Shift-click (or hold) to assign', 'Ctrl+2 assigns, 2 recalls'],
  same:   ['Select same type', 'Every unit of this type on screen', 'Hotkey T'],
  deploy: ['Deploy', 'An MCV unfolds; GIs dig in behind sandbags', 'Hotkey D'],
  guard:  ['Guard', 'Hold this post, engage within ' + GUARD_STRAY + ' cells, then return', 'Hotkey G · S stops dead instead'],
  stop:   ['Stop', 'Stop dead — fire at what comes into range, never move', 'Hotkey S'],
  amove:  ['Attack-move', 'Then click where to advance: fights whatever it meets on the way', 'Ctrl+Shift-click does the same'],
  scatter: ['Scatter', 'Break formation — every unit steps clear of the group', 'Hotkey X'],
  path:   ['Planning mode', 'Clicks queue waypoints (or hold Shift)', 'Hotkey Z'],
  sell:   ['Sell', 'Click one of your structures for half its cost', 'Hotkey L'],
  repair: ['Repair', 'Click a structure to start or stop repairs', 'Hotkey K'],
  power:  ['Power', 'Click a structure to switch its power off or on', 'Frees the drain; the building goes dark']
};

function setCmdMode(m) {
  cmdMode = cmdMode === m ? null : m;
  pickCursor();
  say(cmdMode === 'sell' ? 'Sell: click one of your structures (Esc cancels)'
    : cmdMode === 'repair' ? 'Repair: click one of your structures to start or stop repairs (Esc cancels)'
    : cmdMode === 'power' ? 'Power: click one of your structures to switch it off or on (Esc cancels)'
    : cmdMode === 'follow' ? 'Follow: click the friendly unit to shadow (Esc cancels)'
    : cmdMode === 'amove' ? 'Attack-move: click where to advance (Esc cancels)' : 'Mode cancelled');
  refreshCmdbar();
}

function selectSameType() {
  var first = sel.filter(function (e) { return e.kind === 'u'; })[0];
  if (!first) { say('Select a unit first', true); return; }
  clearSel();
  G.units.forEach(function (u) {
    if (u.dead || u.p !== ME || u.type !== first.type) return;
    var ux = sx(u.x, u.y), uy = sy(u.x, u.y);
    if (ux < VX0 || uy < VY0 || ux > VX1 || uy > VY1) return;
    u.sel = true; sel.push(u);
  });
  say('All visible ' + UNITS[first.type].name + 's: ' + sel.length); sfx('click');
}

function teamCmd(n, assign) {
  if (assign) {
    groups[n] = sel.filter(function (u) { return !u.dead && u.kind === 'u'; });
    say('Team ' + n + ' set: ' + groups[n].length + ' unit' + (groups[n].length === 1 ? '' : 's')); sfx('click');
  } else if (groups[n] && groups[n].length) {
    clearSel();
    groups[n] = groups[n].filter(function (u) { return !u.dead; });
    groups[n].forEach(function (u) { u.sel = true; sel.push(u); });
    if (sel.length) { centerSelIfOffscreen(); say('Team ' + n + ': ' + sel.length + ' selected'); }
  } else say('Team ' + n + ' is empty — select units and Shift-click T' + n + ' to assign', true);
  refreshCmdbar();
}

function unitsCmd(kind) {
  var us = sel.filter(function (u) { return u.kind === 'u' && !u.dead; });
  if (kind === 'deploy') {
    // A garrisoned building is deployed INTO; D turns it out again, exactly
    // as RA2 evacuates a held structure.
    var held = sel.filter(function (e) { return e.kind === 'b' && !e.dead && e.p === ME && occCount(e); });
    if (held.length) { cmd('evac', { b: idsOf(held) }); return; }
  }
  if (!us.length) { say('Select some units first', true); return; }
  if (kind === 'deploy') {
    // A loaded transport is deployed by putting its load DOWN — RA2's
    // Unload, on the same key. A Nighthawk has to touch down first.
    var loaded = us.filter(function (u) { return paxCount(u) > 0; });
    if (loaded.length) { cmd('unload', { u: idsOf(loaded) }); return; }
    // An MCV unfolds into a Construction Yard; a GI digs in. Same key, same
    // button, as RA2 — the unit decides which "deploy" it means.
    var mcvs = us.filter(function (u) { return UNITS[u.type].deploysInto; });
    if (mcvs.length) { cmd('mcv', { u: idsOf(mcvs) }); return; }
    var gis = us.filter(function (u) { return UNITS[u.type].dep || UNITS[u.type].deployRad; });
    if (!gis.length) { say('Only GIs, Desolators and MCVs can deploy', true); return; }
    cmd('dig', { u: idsOf(gis), on: gis.some(function (u) { return !u.deployed; }) ? 1 : 0 });
    return;
  }
  if (kind === 'scatter') cmd('scatter', { u: idsOf(us) });
  else cmd('hold', { u: idsOf(us), kind: kind, sfx: 1 });
}

export function sellBld(g, b, local) {
  if (b.sell) return;                               // already coming down
  // RA2 sells a structure by playing its BUILD-UP BACKWARDS: it stops
  // working, folds itself away over the same ~2.5s, and only then does the
  // money land. `make` carries the countdown so every "inert while it runs"
  // path already written for the MAKE applies unchanged.
  b.sel = false; b.sell = true; b.door = 0; b.hold = null; b.repair = false;
  b.make = headless ? 0 : MAKE_T;
  if (local !== false) { sfx('sell'); eva('Structure sold', 2000); }   // before the MAKE_T=0 shortcut, which used to skip it
  if (b.make <= 0) { finishSell(g, b); return; }
}

export function finishSell(g, b) {
  var refund = Math.round(bspecOfB(g, b).cost * 0.5);
  g.side[b.p].credits += refund; b.sell = false; b.make = 0; killBld(g, b, true); b.sel = false;
  if (b.p === ME) say('Sold ' + bspecOfB(g, b).name + ' for $' + refund);
}

function cmdButtons() {
  var a = [];
  [cmdbar, sbtools].forEach(function (box) {
    if (!box) return;
    var bs = box.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) a.push(bs[i]);
  });
  return a;
}

export function refreshCmdbar() {
  var bs = cmdButtons();
  for (var i = 0; i < bs.length; i++) {
    var c = bs[i].getAttribute('data-cmd');
    if (!c) continue;
    bs[i].classList.toggle('on', c === cmdMode || (c === 'path' && pathMode));
    if (c[0] === 't' && /^\d$/.test(c[1])) bs[i].classList.toggle('has', !!(groups[c[1]] && groups[c[1]].length));
  }
}

function onCmdClick(e) {
  var b = e.target.closest('button'); if (!b || !G || state !== 'play') return;
  // A clicked button KEEPS focus, and the browser then re-activates it on
  // Space and Enter — so Space, which is "jump to the last radar event",
  // would silently fire the last command a second time (click Deploy, tap
  // Space, and the GIs you just dug in pack straight back up). The bar is
  // a mouse surface; the keyboard belongs to the game.
  b.blur();
  resumeAudio();
  var c = b.getAttribute('data-cmd');
  if (c === 'same') selectSameType();
  else if (c === 'path') { pathMode = !pathMode; say(pathMode ? 'Waypoint mode: clicks queue stops' : 'Waypoint mode off'); refreshCmdbar(); }
  else if (c[0] === 't' && /^\d$/.test(c[1])) teamCmd(c[1], e.shiftKey || e.ctrlKey);
  else if (c === 'guard' || c === 'stop' || c === 'scatter' || c === 'deploy') unitsCmd(c);
  else if (c === 'sell' || c === 'repair' || c === 'power' || c === 'amove') setCmdMode(c);
}

// The tooltip is drawn, not the browser's — same panel as the build items.
// A touch HOLD on a button (450 ms, no lift): runs `fn` and eats the click
// that follows the lift. Mouse and pen are untouched.
var HOLD_MS = 450;

export function wireHold(b, fn) {
  var timer = null;
  b.addEventListener('pointerdown', function (ev) {
    if (ev.pointerType !== 'touch') return;
    clearTimeout(timer);
    timer = setTimeout(function () { timer = null; b._lp = true; fn(); }, HOLD_MS);
  });
  var stop = function () { if (timer) { clearTimeout(timer); timer = null; } };
  b.addEventListener('pointerup', stop); b.addEventListener('pointercancel', stop); b.addEventListener('pointerleave', stop);
}

// A tip opened by a hold stays until the next touch lands somewhere else.
document.addEventListener('pointerdown', function (ev) { if (ev.pointerType === 'touch' && ptip && ptip.style.display !== 'none' && !(ev.target && ev.target.closest && ev.target.closest('.pit, #cmdbar button, #sbtools button'))) hideTip(); }, true);

function wireCmdTips(box) {
  if (!box) return;
  box.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b && b._lp) { b._lp = false; return; }      // a hold already acted
    onCmdClick(e);
  });
  var bs = box.querySelectorAll('button');
  for (var i = 0; i < bs.length; i++) (function (b) {
    var c = b.getAttribute('data-cmd'), t = CMD_TIP[c];
    if (!t) return;
    b.addEventListener('pointerenter', function (ev) {
      if (ev.pointerType === 'touch') return;      // touch: hold shows the tip instead
      showTip(b, t[0], [{ t: t[1] }, { t: t[2], c: '#8f9bae' }]);
    });
    b.addEventListener('pointerleave', function (ev) { if (ev.pointerType !== 'touch') hideTip(); });
    // Hold a team button to ASSIGN (Shift-click has no finger); hold any
    // other button for its tip.
    wireHold(b, function () {
      if (c[0] === 't' && /^\d$/.test(c[1]) && G && state === 'play') teamCmd(c[1], true);
      else showTip(b, t[0], [{ t: t[1] }, { t: t[2], c: '#8f9bae' }]);
    });
  })(bs[i]);
}

wireCmdTips(cmdbar); wireCmdTips(sbtools);

// Centre on the construction yard; if it is gone, on anything else still
// standing, then on any surviving unit. Losing your yard should not also
// lose you the ability to find what is left of your army.
function goHome() {
  if (!G) return;
  var i, best = null;
  for (i = 0; i < G.blds.length; i++) {
    var b = G.blds[i];
    if (b.dead || b.p !== ME) continue;
    if (b.type === 'base') { best = { x: b.cx, y: b.cy }; break; }
    if (!best) best = { x: b.cx, y: b.cy };
  }
  if (!best) {
    for (i = 0; i < G.units.length; i++) {
      var u = G.units[i];
      if (!u.dead && u.p === ME) { best = { x: u.x, y: u.y }; break; }
    }
  }
  if (!best) return;
  centerOn(best.x, best.y);
  clampCam();
  camVel.x = camVel.y = 0;
}

export function pickAt(px, py) {
  var uz = unzoom(px, py); return pickAtW(uz.x, uz.y);
}

// The same pick, in already-unzoomed space. Split out so a test can hand it
// the exact screen point a grid cell projects to, which is the only way to
// check the footprint geometry without driving a browser.
export function pickAtW(px, py) {
  var best = null, bd = 1e9;
  var i, e, ex, ey, d;
  for (i = 0; i < G.units.length; i++) {
    e = G.units[i];
    if (e.dead || !entSeen(G, e)) continue;
    ex = sx(e.x, e.y); ey = sy(e.x, e.y) - altOf(e) - (e.air ? 6 : 0);
    d = (ex - px) * (ex - px) + (ey - py) * (ey - py);
    if (d < 22 * 22 && d < bd) { bd = d; best = e; }
  }
  if (best) return best;
  // A BUILDING IS A FOOTPRINT, NOT A CIRCLE. This used to test a screen-space
  // circle of radius max(gw,gh)*22 about the centre — but a footprint
  // projects to an isometric DIAMOND, and its anti-diagonal corners fall far
  // outside any circle that fits the near ones: for a 3x3 the corner is
  // (1.5 - -1.5) * TW/2 = 96 px out against a 66 px radius. MEASURED with a
  // hover sweep on a live page, the far corners of a 3x3 Service Depot and a
  // 4x3 Ore Refinery picked NOTHING — two corners of every building in the
  // game were dead to clicks and to hover alike, which reads as "my click did
  // nothing" and is indistinguishable from a broken order.
  //
  // Now the clicked PIXEL is inverted to a tile and tested against the
  // footprint rectangle, which is the shape the building actually occupies.
  var gp = gridFromW(px, py);
  for (i = 0; i < G.blds.length; i++) {
    e = G.blds[i];
    if (e.dead || !entSeen(G, e)) continue;
    if (BLDS[e.type].wall) continue;         // [GAWALL] Selectable=no
    if (Math.abs(gp.x - e.cx) > e.gw / 2 || Math.abs(gp.y - e.cy) > e.gh / 2) continue;
    ex = sx(e.cx, e.cy); ey = sy(e.cx, e.cy);
    d = (ex - px) * (ex - px) + (ey - py) * (ey - py);
    if (d < bd) { bd = d; best = e; }        // nearest centre breaks any overlap
  }
  return best;
}

export function clickSelect(px, py, shift) {
  var e = pickAt(px, py);
  if (cmdMode === 'follow') {
    // keyboard.ini Follow=70 (F): pick the friendly unit to shadow.
    var fus = sel.filter(function (u) { return u.kind === 'u' && !u.dead && u.p === ME; });
    if (!e || e.p !== ME || e.kind !== 'u') { say('Follow: click one of your own units', true); sfx('no'); return; }
    cmd('follow', { u: idsOf(fus), id: e.id });
    cmdMode = null; refreshCmdbar(); pickCursor();
    return;
  }
  if (cmdMode) {
    if (e && e.kind === 'b' && e.p === ME) {
      // rules.ini `Unsellable=yes` / `ClickRepairable=no`: a captured tech
      // building or a held city block is neither sold nor patched up.
      if (BLDS[e.type].neut && cmdMode !== 'power') {
        say(bspecOfB(G, e).name + ' is not yours to sell or repair — it came with the map', true);
        eva('Unable to comply', 5000); sfx('no');               // eva.ini #47
      }
      else if (cmdMode === 'sell') { if (e.type === 'base' && countBld(G, ME, 'base') < 2) say('Cannot sell your only Construction Yard', true); else cmd('sell', { id: e.id }); }
      // RA2's power toggle: the structure stops drawing (or making) power
      // and stops working. Cheap way to ride out a brown-out.
      else if (cmdMode === 'power') cmd('power', { id: e.id });
      else if (BLDS[e.type].norep) { say(BLDS[e.type].name + ' cannot be repaired — build a new segment', true); sfx('no'); }
      else cmd('repair', { id: e.id });
    } else say('Click one of your structures', true);
    return;
  }
  if (!e) { if (!shift) clearSel(); return; }
  if (e.p !== ME) { say(describe(e) + ' — enemy'); return; }

  // Double-click on a unit selects every visible one of that type.
  var now = performance.now();
  if (e.kind === 'u' && lastClickType === e.type && now - lastClickT < 380) {
    clearSel();
    G.units.forEach(function (u) {
      if (u.dead || u.p !== ME || u.type !== e.type) return;
      var ux = sx(u.x, u.y), uy = sy(u.x, u.y);
      if (ux < VX0 || uy < VY0 || ux > VX1 || uy > VY1) return;
      u.sel = true; sel.push(u);
    });
    say('All visible ' + UNITS[e.type].name + 's: ' + sel.length);
    unitAck(sel, 'select');
    lastClickT = 0; lastClickType = null;
    return;
  }
  lastClickT = now; lastClickType = e.kind === 'u' ? e.type : null;

  // RA2: clicking the production building you already have selected makes
  // it the primary one for its lane.
  if (e.kind === 'b' && e.sel && !shift && sel.length === 1) {
    var mk = BLDS[e.type].makes;
    if (mk === 'i' || mk === 'v') {
      if (isPrimary(G, e)) { say(describe(e)); return; }
      setPrimary(G, e); sfx('click'); eva('Primary building selected', 2000);
      say(BLDS[e.type].name + ' is now primary — new ' + (mk === 'i' ? 'infantry' : 'vehicles') + ' come out here');
      return;
    }
  }

  if (!shift) clearSel();
  if (!e.sel) { e.sel = true; sel.push(e); }
  else if (shift) {                                   // RA2: Shift on a selected unit drops it
    e.sel = false; var si = sel.indexOf(e); if (si >= 0) sel.splice(si, 1);
    say(describe(e) + ' — removed from the selection'); refreshCmdbar(); return;
  }
  say(describe(e));
  if (e.kind === 'u') unitAck([e], 'select');   // RA2 VoiceSelect — the line the game never had
  else sfx('click');                            // a structure clicks
}

export function describe(e) {
  if (e.kind === 'b') {
    var d = BLDS[e.type];
    var t = d.em + ' ' + d.name + ' — ' + Math.ceil(e.hp) + '/' + d.hp + ' hp';
    if (d.makes === 'i' || d.makes === 'v') {
      if (producersOf(G, e.p, d.makes).length > 1)
        t += isPrimary(G, e) ? ' · PRIMARY' : ' · click again to make it primary';
      t += e.rally ? ' · rally set (click the map to move it)'
                   : ' · click the map to set a rally point';
    }
    return t;
  }
  var u = UNITS[e.type];
  var extra = isHarv(e) ? ' — ' + Math.round(e.cargo) + '/' + ucap(G, e) + ' ore'
            : u.ammo ? ' — ' + e.ammo + '/' + u.ammo + ' missiles' + (e.landed ? ', on pad' : '') : '';
  // A transport says what it is carrying, and an IFV says what that turns
  // its gun into ([FV] HasTurretTooltips=yes).
  if (u.pax) {
    extra += ' — ' + paxCount(e) + '/' + u.pax + ' aboard';
    if (paxCount(e)) extra += ' (' + UNITS[e.pax[0].type].name +
                              (paxCount(e) > 1 ? ' +' + (paxCount(e) - 1) : '') + ')';
    if (u.ifv) extra += ' · ' + ifvSpec(e).n;
    if (e.landed) extra += ' · landed';
  }
  return u.em + ' ' + u.name + ' — ' + Math.ceil(e.hp) + '/' + u.hp + ' hp' + extra;
}

function boxSelect(x, y, w, h, shift) {
  if (!shift) clearSel();
  var got = 0;
  G.units.forEach(function (u) {
    if (u.dead || u.p !== ME || u.sel) return;
    var ux = sx(u.x, u.y), uy = sy(u.x, u.y) - altOf(u);
    ux = (ux - cvW / 2) * zoom + cvW / 2; uy = (uy - cvH / 2) * zoom + cvH / 2;   // to screen px
    if (ux >= x && ux <= x + w && uy >= y && uy <= y + h) { u.sel = true; sel.push(u); got++; }
  });
  if (sel.length) { say(sel.length + ' selected'); unitAck(sel, 'select'); }
  else if (got === 0) say('Nothing selected');
}

function centerSelIfOffscreen() {
  if (!sel.length) return;
  var u = sel[0];
  var ux = sx(u.x, u.y), uy = sy(u.x, u.y);
  if (ux < VX0 + 40 || uy < VY0 + 40 || ux > VX1 - 40 || uy > VY1 - 40) centerOn(u.x, u.y);
}

// Move / harvest order for a group. Harvesters sent onto ore mine that
// seam; sent anywhere else they go there and HOLD (see stepHarvester).
export function orderUnitsTo(g, units, gx, gy, opts) {
  opts = opts || {};
  var onOre = oreT(g.terrain[idx(gx, gy)]), n = 0, taken = {}, held = 0, wet = 0;
  units.forEach(function (u, i) {
    // RA2: a deployed GI given a move order stands up and walks.
    if (u.deployed && !opts.queue) u.deployed = false;
    // A hull will not accept an order into a body of water it is not in.
    // Taking it and never arriving is worse than refusing it: the ship
    // re-paths for the rest of the match and the player never learns why.
    if (!navReach(g, u, gx, gy)) { wet++; return; }
    // Shift-click queues a waypoint behind the current order (RA2 waypoint
    // mode); a plain order replaces the whole queue.
    if (opts.queue && u.order) { (u.wp || (u.wp = [])).push({ x: gx, y: gy }); n++; return; }
    u.wp = null; u.guard = false; u.stopped = false;
    if (onOre && isHarv(u)) {
      u.order = { t: 'harvest', x: gx, y: gy, id: 0 };
      u.mineAt = { x: gx, y: gy }; u.state = 'tomine'; u.path = null; u.forcedDock = false;
      u.noProg = 0; u.bestD = 1e9; u.stallAt = g.tick;
      requestPath(g, u, gx, gy);
      n++;
      return;
    }
    // One destination cell per unit (the old six-per-ring put the first
    // six on the exact target tile — ten Rhinos arrived as one pile).
    var sp = u.air ? { x: gx, y: gy }
           : spreadSpot(g, gx, gy, taken, moverOf(u), isNaval(u) && !UNITS[u.type].amph ? hullZone(g, u) : 0);
    var tx = sp.x, ty = sp.y;
    u.order = { t: 'move', x: tx, y: ty, id: 0 };
    u.guardX = tx; u.guardY = ty; u.repathAt = -999; u.path = null;
    if (isHarv(u)) { u.state = 'idle'; u.mineAt = null; u.noProg = 0; u.forcedDock = false; }
    requestPath(g, u, tx, ty);
    n++;
  });
  if (opts.voice && n) unitAck(units, onOre ? 'harvest' : 'move');
  if (wet && !n && !headless) { say(g.terrain[idx(gx, gy)] === T_WATER ? 'No sea route — that water is not joined to ours' : 'A ship cannot go ashore', true); sfx('no'); }
  return n;
}

// ---- RA2's three "go and fight" orders ---------------------------------
// Attack-move: advance on a spot and engage whatever is met on the way,
// resuming the advance when the road is clear again. RA2 lists AttackMove
// in ui.ini's command bar; here it is Ctrl+Shift+right-click.
export function orderAmove(g, units, gx, gy) {
  var taken = {}, n = 0, wet = 0;
  units.forEach(function (u) {
    if (!navReach(g, u, gx, gy)) { wet++; return; }
    var sp = u.air ? { x: gx, y: gy }
           : spreadSpot(g, gx, gy, taken, moverOf(u), isNaval(u) && !UNITS[u.type].amph ? hullZone(g, u) : 0);
    u.wp = null; u.guard = false; u.stopped = false;
    u.order = { t: 'amove', x: sp.x, y: sp.y, id: 0 };
    u.guardX = sp.x; u.guardY = sp.y; u.repathAt = -999; u.path = null; u.rtb = false;
    if (isHarv(u)) { u.state = 'idle'; u.mineAt = null; u.forcedDock = false; }
    requestPath(g, u, sp.x, sp.y);
    n++;
  });
  if (wet && !n && !headless) { say(g.terrain[idx(gx, gy)] === T_WATER ? 'No sea route — that water is not joined to ours' : 'A ship cannot go ashore', true); sfx('no'); }
  return n;
}

// Force-fire at a patch of ground (RA2 Ctrl+click): the unit closes to
// weapon range and keeps shooting the spot until told otherwise. This is
// how you flush a Mirage, break a bridge or shell your own repair bay.
export function orderFFire(g, units, gx, gy) {
  var n = 0;
  units.forEach(function (u) {
    var d = UNITS[u.type];
    if (!(d.dmg > 0) || d.ammo) return;              // no gun, or a pad aircraft
    u.wp = null; u.guard = false; u.stopped = false;
    u.order = { t: 'ffire', x: gx, y: gy, id: 0 };
    u.guardX = gx; u.guardY = gy; u.repathAt = -999; u.path = null;
    requestPath(g, u, gx, gy);
    n++;
  });
  return n;
}

// Follow (keyboard.ini Follow=70, F): stay with a friendly unit, fighting
// opportunistically, until it dies or a new order arrives.
export function orderFollow(g, units, tgt) {
  var n = 0;
  units.forEach(function (u) {
    if (u === tgt) return;
    u.wp = null; u.guard = false; u.stopped = false;
    u.order = { t: 'follow', x: 0, y: 0, id: tgt.id };
    u.repathAt = -999; u.path = null; n++;
  });
  return n;
}

// Firing at bare ground: there is no entity to hand `fire()`, so the shot
// and its splash are resolved here against whatever is standing on the
// spot — friend or foe, exactly as RA2's force-fire does.
export function fireGround(g, u, gx, gy) {
  var d = UNITS[u.type];
  // ground fire is always the primary weapon — but an elite one still
  // fires its `ElitePrimary=`, so this bypass of weaponFor has to make the
  // same swap the other two fire paths get for free.
  var spec = eliteOf((u.deployed && d.dep) ? d.dep : d, u);
  u.cool = spec.rate * vetRofU(u);             // [General] VeteranROF=0.6, as both real fire paths do
  u.fireAt = g.tick;
  if (!headless) {
    g.shots.push({ x: u.x, y: u.y, tx: gx, ty: gy, t: 0, life: spec.bomb ? 14 : 7, id: g.nextId++,
                   tesla: u.type === 'tesla', beam: u.type === 'prism' || u.type === 'prismtank',
                   rocket: spec.splash > 0.2, bomb: !!spec.bomb, alt: altOf(u), talt: 0 });
    boom(g, gx, gy, 8 + (spec.splash || 0) * 9);
  }
  sfx(u.type === 'rifle' ? 'shot' : 'cannon');
  var r = Math.max(0.7, spec.splash || 0);
  // `Burst=` is a property of the weapon, not of who it is pointed at: a
  // force-fired Apocalypse still puts two shells on the spot. fire() has
  // always multiplied it in; this path did not, which only became visible
  // once [120mmx]'s Burst stopped being folded into its `dmg`.
  var gAmt = spec.dmg * (spec.burst || 1) * vetFire(u.rank) * (u.fpMul || 1);
  near(gx, gy, r + 1, function (o) {
    if (o.dead || isAir(o) || !canHit(spec, o)) return;
    var ox = o.kind === 'b' ? o.cx : o.x, oy = o.kind === 'b' ? o.cy : o.y;
    var dd = Math.sqrt((ox - gx) * (ox - gx) + (oy - gy) * (oy - gy));
    if (dd > r) return;
    damage(g, u, o, gAmt * (1 - 0.5 * dd / (r + 0.4)), spec.wh);
  });
  // Force-firing at a bridge deck is how RA2 drops a span.
  damageBridge(g, gx, gy, gAmt);
}

// Next queued waypoint, if any, becomes the order when one completes.
export function nextWaypoint(g, u) {
  if (!u.wp || !u.wp.length) return false;
  var w = u.wp.shift();
  if (w.attack) {                                     // a Shift-queued attack (RA2 waypoint mode)
    var at = entById(g, w.attack);
    if (at && !at.dead && orderAttack(g, [u], at, false, true)) return true;
  }
  u.order = { t: 'move', x: w.x, y: w.y, id: 0 }; u.guardX = w.x; u.guardY = w.y;
  u.path = null; u.repathAt = -999; requestPath(g, u, w.x, w.y);
  return true;
}

// An enter-class order (board, garrison, capture) with no route: drop it
// and say so, as the move order does — never a man frozen for the match.
export function giveUpEnter(g, u, what) {
  u.order = null; u.noProg = 0; u.guardX = u.x; u.guardY = u.y;
  if (u.p === ME && !headless) { say('Can’t reach ' + what, true); sfx('no'); }
}

export function rightOrder(px, py, shift, ctrl) {
  if (!sel.length) { say('Select something first — left-drag a box over your units'); return; }
  var gp = screenToGrid(px, py);
  var gx = Math.round(gp.x), gy = Math.round(gp.y);
  if (!inMap(gx, gy)) return;

  // A selected production building takes a rally point instead.
  var bsel = sel.filter(function (e) { return e.kind === 'b'; });
  if (bsel.length && sel.length === bsel.length) {
    // Only the two production buildings actually use a rally point; setting
    // one on a power plant would be a click that silently does nothing.
    var prod = bsel.filter(function (b) {
      var m = BLDS[b.type].makes; return m === 'i' || m === 'v';
    });
    if (!prod.length) {
      say(bsel.some(function (b) { return b.type === 'airforce'; })
          ? 'Aircraft return to their pads — an Airforce Command takes no rally point'
          : 'Only the Barracks and War Factory take a rally point', true);
      eva('Unable to comply', 5000);                            // eva.ini #47
      sfx('no');
      return;
    }
    cmd('rally', { b: idsOf(prod), x: gx, y: gy });
    return;
  }

  var tgt = pickAt(px, py);
  var units = sel.filter(function (u) { return u.kind === 'u'; });
  if (!units.length) return;

  // Ctrl+Shift = attack-move; Ctrl alone = force-fire (RA2's modifiers).
  if ((ctrl && shift) || cmdMode === 'amove') {
    cmdMode = null; refreshCmdbar(); pickCursor();
    cmd('amove', { u: idsOf(units), x: gx, y: gy }); return;
  }
  if (ctrl) {
    if (tgt && !tgt.dead) cmd('attack', { u: idsOf(units), id: tgt.id, force: 1 });
    else cmd('ffire', { u: idsOf(units), x: gx, y: gy });
    return;
  }

  // RA2's Enter mission on a TRANSPORT: right-click one of our own hulls
  // with room in it and everything selected that will fit climbs aboard.
  // A Nighthawk sets down where it is so they can reach it.
  if (tgt && !tgt.dead && tgt.kind === 'u' && tgt.p === ME && paxCapOf(tgt) && tgt !== units[0]) {
    // The intent is resolved here (is there room, does anything fit); the
    // boarding itself is a command, re-checked against the world it lands in.
    var fits = paxCapOf(tgt) - paxCount(tgt) <= 0 ||
               units.some(function (u) { return canBoard(G, tgt, u); });
    if (fits) { cmd('enter', { u: idsOf(units), id: tgt.id }); return; }
  }
  // Our own things can be given orders too: a Tesla Trooper hand-charges a
  // coil, an Engineer patches a damaged building, and Crazy Ivan is happy to
  // bomb anything at all ([IVAN] AttackCursorOnFriendlies=yes).
  if (tgt && !tgt.dead && tgt.p === ME) {
    var wantsOwn = units.some(function (u) {
      var ud = UNITS[u.type];
      return (ud.coiler && tgt.kind === 'b' && tgt.type === 'tesla') ||
             (ud.capture && tgt.kind === 'b' && tgt.hp < tgt.maxhp && !BLDS[tgt.type].hut) ||
             (ud.ivan && !tgt.bomb) ||
             // A miner sent to a refinery, and a damaged vehicle sent to a
             // Service Depot. Both mechanics already existed and neither had
             // an ORDER that reached them: a right-click on your own building
             // fell through to a plain `move` onto tiles the building
             // occupies, so the unit stopped several cells short and nothing
             // happened. Measured: a miner told to move to its refinery ended
             // 4.0 cells away, state 'idle', never docked; a damaged vehicle
             // sent to a depot stopped 3.0 cells off the pad and was never
             // repaired, because the depot only treats what is touching it.
             (isHarv(u) && tgt.kind === 'b' && tgt.type === 'refinery') ||
             (ud.cls === 'v' && !u.air && tgt.kind === 'b' && tgt.type === 'depot') ||
             // A pad aircraft sent home. RA2 lets you recall a plane at any
             // time; ours had no rung at all, so the click fell through to a
             // plain `move` — which is then discarded for an aircraft already
             // in its pad cycle, leaving `order: null` and no feedback.
             // MEASURED twice before the fix. With EMPTY racks the auto-return
             // masks it (`u.ammo <= 0 && pad`); with missiles left the order is
             // the only thing that can send it home.
             (ud.ammo && u.pad && tgt.kind === 'b' && tgt.type === 'airforce');
    });
    if (wantsOwn) { cmd('own', { u: idsOf(units), id: tgt.id }); return; }
  }
  // Reinforcing a block we already hold is an order to our own building,
  // which the attack path would refuse — handled before it.
  if (tgt && tgt.kind === 'b' && tgt.p === ME && garrisonable(G, tgt, ME) &&
      units.some(function (u) { return canOccupy(u.type); })) {
    cmd('garrison', { u: idsOf(units), id: tgt.id });
    return;
  }
  if (tgt && tgt.p !== ME && !tgt.dead) {
    cmd('attack', { u: idsOf(units), id: tgt.id, force: 0, queue: (!!shift || pathMode) ? 1 : 0 });
    return;
  }
  // The DOCK a refinery draws, clicked with a miner selected. Reached only
  // when the pick found nothing — the apron is ordinary ground, so a tank
  // sent there still drives there, and a unit standing on it is still the
  // thing you clicked. Shift/waypoint mode keeps queueing moves, matching
  // the cursor above.
  if (!tgt && !shift && !pathMode) {
    var dref = dockAt(G, ME, gx, gy);
    if (dref && units.some(function (u) { return isHarv(u); })) {
      cmd('own', { u: idsOf(units), id: dref.id });
      return;
    }
  }
  // The NO cursor is a promise too (audit, 2026-09-11): a cell no selected
  // mover can enter is refused here, not accepted and quietly re-homed to
  // the nearest passable cell with "Moving" as the confirmation.
  if (!units.some(function (u) { return u.air || terrPass(G.terrain[idx(gx, gy)], moverOf(u)); })) {
    say('Cannot go there', true); sfx('no'); return;
  }
  cmd('move', { u: idsOf(units), x: gx, y: gy, queue: !!shift || pathMode,
                ore: oreT(G.terrain[idx(gx, gy)]) ? 1 : 0 });
}

// Attack (or capture) order for a group. Units whose weapon cannot reach
// the target — a rifleman told to shoot a Kirov — are left alone rather
// than marched under it. Returns how many took the order.
// `focus`: a PLAYER's order (via the command layer). RA2 gives it exclusive
// aim — see the combat step. The AI's own waves set their orders directly
// and keep the loose "shoot what is in range on the way" rule.
export var attackMission = 'attack';         // what the last orderAttack turned into, for the message

export function orderAttack(g, units, tgt, force, focus, queue) {
  var n = 0;
  attackMission = 'attack';
  units.forEach(function (u) {
    // Shift: behind the current order (RA2 waypoint mode), as a move does.
    if (queue && u.order) { (u.wp || (u.wp = [])).push({ x: entX(tgt), y: entY(tgt), attack: tgt.id }); n++; return; }
    u.guard = false; u.stopped = false;
    if (UNITS[u.type].capture && tgt.kind === 'b' && !force) {
      u.order = { t: 'capture', x: 0, y: 0, id: tgt.id }; u.repathAt = -999; attackMission = 'capture';
      requestPath(g, u, Math.round(tgt.cx), Math.round(tgt.cy)); n++; return;
    }
    // An Occupier told to "attack" a garrisonable block moves IN instead —
    // the same right-click RA2 uses, with the same enter cursor.
    if (canOccupy(u.type) && tgt.kind === 'b' && !force && garrisonable(g, tgt, u.p)) {
      u.order = { t: 'garrison', x: 0, y: 0, id: tgt.id }; u.repathAt = -999; attackMission = 'garrison';
      requestPath(g, u, Math.round(tgt.cx), Math.round(tgt.cy)); n++; return;
    }
    // [SPY] Infiltrate=yes — a Spy told to "attack" an enemy structure walks
    // into it instead. Never a wall, never a neutral block.
    if (UNITS[u.type].infil && tgt.kind === 'b' && !force && tgt.p !== u.p && !neutral(tgt.p) &&
        !BLDS[tgt.type].wall && !BLDS[tgt.type].gate && !BLDS[tgt.type].neut) {
      u.order = { t: 'infil', x: 0, y: 0, id: tgt.id }; u.repathAt = -999; attackMission = 'infil';
      requestPath(g, u, Math.round(tgt.cx), Math.round(tgt.cy)); n++; return;
    }
    if (!canHit(UNITS[u.type], tgt, u)) return;
    u.order = { t: 'attack', x: 0, y: 0, id: tgt.id, force: force ? 1 : 0, focus: focus ? 1 : 0 };
    u.guardX = tgt.kind === 'b' ? tgt.cx : tgt.x;
    u.guardY = tgt.kind === 'b' ? tgt.cy : tgt.y;
    u.repathAt = -999; u.rtb = false;
    requestPath(g, u, Math.round(u.guardX), Math.round(u.guardY));
    n++;
  });
  return n;
}

// A rally point stores the ROUTE, not just the destination: seeing the line
// bend around a cliff is the difference between "units gather there" and
// "units gather there, the long way round". Computed once, on set.
export function makeRally(g, b, gx, gy) {
  var from = freeTileNear(g, Math.round(b.cx), Math.round(b.cy + b.gh / 2 + 1)) ||
             { x: Math.round(b.cx), y: Math.round(b.cy) };
  var path = astar(g, from.x, from.y, gx, gy);
  return { x: gx, y: gy, from: from, path: path, reachable: !!path };
}

// RA2 wall laying: ONE wall comes off the yard, and from then on you hold
// the button and drag a line — every cell the cursor crosses takes another
// $100 out of the bank until you let go, cancel, or run out. The cameo
// stays READY the whole time, so a perimeter is one purchase and one drag.
var wallDrag = null, wallFree = false;

function laySeg(gx, gy, key) {
  key = key || placing;
  var d = BLDS[key];
  if (!canPlace(G, ME, key, gx, gy)) return false;
  if (!wallFree && G.side[ME].credits < d.cost) {
    // Read-only affordability test: the drag has to STOP here and now, so
    // it cannot wait two ticks for the command to land. The deduction
    // itself still happens once, inside applyCmd.
    say('Insufficient funds — ' + d.name.toLowerCase() + ' needs $' + d.cost, true);
    sfx('no'); setPlacing(null); wallDrag = null; cv.classList.remove('placing');
    return false;
  }
  cmd('wall', { k: key, x: gx, y: gy, free: wallFree ? 1 : 0 });
  wallFree = false;
  return true;
}

// Every cell on the line from the last segment to here (RA2 lays the whole
// run, not just the cell you happened to be over when the frame ticked).
function dragWall(px, py) {
  if (!wallDrag) return;
  var gp = screenToGrid(px, py);
  var gx = Math.round(gp.x), gy = Math.round(gp.y);
  var x = wallDrag.x, y = wallDrag.y, guard = 0;
  while ((x !== gx || y !== gy) && guard++ < 64) {
    if (Math.abs(gx - x) >= Math.abs(gy - y)) x += gx > x ? 1 : -1;
    else y += gy > y ? 1 : -1;
    if (!placing) return;
    laySeg(x, y);
    wallDrag.x = x; wallDrag.y = y;
  }
}

// RA2 walls only *join* when they touch, so two pieces a few cells apart are
// two posts and a gap. Rather than make the art bridge thin air, a segment
// laid in line with one of your own walls fills the run between them — the
// pieces link at a distance, which is what "one wall" means when you place
// it by clicking rather than dragging.
var WALL_LINK = 10;

export function linkWall(gx, gy, key) {
  key = key || placing;
  if (!key || !BLDS[key] || !BLDS[key].wall) return 0;
  var best = null, bd = 1e9;
  for (var i = 0; i < G.blds.length; i++) {
    var b = G.blds[i];
    if (b.dead || b.p !== ME || !BLDS[b.type].wall) continue;
    var dx = gx - b.x, dy = gy - b.y;
    if (dx === 0 && dy === 0) continue;
    // In line: same row, same column, or a true diagonal.
    if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) continue;
    var n = Math.max(Math.abs(dx), Math.abs(dy));
    if (n < 2 || n > WALL_LINK || n >= bd) continue;
    bd = n; best = { x: b.x, y: b.y, sx: Math.sign(dx), sy: Math.sign(dy), n: n };
  }
  if (!best) return 0;
  var laid = 0;
  for (var k = 1; k < best.n; k++) {
    var cx2 = best.x + best.sx * k, cy2 = best.y + best.sy * k;
    if (!canPlace(G, ME, key, cx2, cy2)) continue;
    if (!laySeg(cx2, cy2, key)) break;
    laid++;
  }
  return laid;
}

// THE placement origin, shared by the ghost footprint, the deploy/nomove
// cursor and the click itself. tryPlace used to round AFTER subtracting the
// half-footprint while the ghost rounded BEFORE, so for any even footprint
// (Power Plant, Radar, Barracks, Refinery…) the building landed one cell
// from the green ghost over ~75% of a tile, and a green cursor could be
// refused with "can't build there" (audit, 2026-09-11).
export function placeOrigin(gp, d) {
  return { x: Math.round(gp.x) - Math.floor((d.gw - 1) / 2), y: Math.round(gp.y) - Math.floor((d.gh - 1) / 2) };
}

function tryPlace(px, py) {
  var gp = screenToGrid(px, py);
  var d = bspecFor(placing, keyFac(G, ME, placing, true));
  var po = placeOrigin(gp, d), gx = po.x, gy = po.y;
  if (d.wall) {
    // The queued segment is the paid one; the drag charges for the rest.
    wallFree = true;
    if (!laySeg(gx, gy)) {
      if (placing) { say('Can’t build there — needs clear ground inside the green area', true); sfx('no'); }
      return;
    }
    wallDrag = { x: gx, y: gy };      // the ready flag is cleared by the wall command
    var linked = linkWall(gx, gy);    // in line with one of ours: close the gap
    say(linked ? 'Wall joined — ' + (linked + 1) + ' sections laid'
               : 'Drag to run the wall — right click when you are done', false, 200);
    return;
  }
  if (!canPlace(G, ME, placing, gx, gy)) {
    say('Can’t build there — needs clear ground inside the green area', true);
    sfx('no');
    return;
  }
  cmd('place', { k: placing, x: gx, y: gy });
  setPlacing(null);                       // the ghost goes now; the building lands on its tick
  cv.classList.remove('placing');
}

// Hovering the command bar or the top bar means you are operating the UI,
// not navigating — so the map stops immediately. This is what makes a
// right-hand panel coexist with edge scrolling (C&C does the same); the
// few pixels the pointer earns crossing the slow inner lip never land.
// `mouse.in` is the CANVAS hover (cursor, tooltips); the edge band reads
// pageMouse, which only leaving the window clears — see trackPageMouse.
document.getElementById('side').addEventListener('pointerenter', function () { mouse.in = false; });

document.querySelector('.bar').addEventListener('pointerenter', function () { mouse.in = false; });

document.addEventListener('pointerleave', function () { mouse.in = false; pageMouse.in = false; });

// Minimap click jumps the camera.
function miniJump(e) {
  var r = mini.getBoundingClientRect();
  // The radar is isometric, so a click has to come back through the same
  // projection — a linear x/y read would land a whole quadrant away.
  var gp = mmToGrid((e.clientX - r.left) / r.width * MM_PX, (e.clientY - r.top) / r.height * MM_PX);
  centerOn(gp.x, gp.y);
  clampCam();
}

mini.addEventListener('pointerdown', function (e) {
  // A dark radar takes no input at all — see radarUp().
  if (!G || !radarUp()) return;
  if (e.button !== 0) return;                     // the right button never orders (2026-09-10)
  miniJump(e);
  try { mini.setPointerCapture(e.pointerId); } catch (err) {}
});

// RA2 scrubs: drag across the radar and the view follows the finger.
mini.addEventListener('pointermove', function (e) { if (G && radarUp() && (e.buttons & 1)) miniJump(e); });

mini.addEventListener('contextmenu', function (e) { e.preventDefault(); });

// --- camera ------------------------------------------------------------
// Three rules learned the hard way:
//  1. Speed is per SECOND, not per frame. Per-frame movement stutters the
//     moment anything drops a frame, which reads as the whole game being
//     janky even at a solid 60fps.
//  2. Velocity is eased toward a target instead of snapped, so starting and
//     stopping a pan has weight rather than teleporting.
//  3. The edge band needs a DWELL. The build panel is on the right, so the
//     pointer crosses the right-hand band every single time you go click a
//     build item — with an instant band, every click yanked the map sideways
//     first. A pointer merely passing through must scroll nothing.
var camVel = { x: 0, y: 0 };

var KEY_SPEED = 900;          // px/s

// RA2's Options card has a scroll-rate slider; this is the same idea with
// three stops, applied to BOTH the keys and the edge band so they always
// agree with each other.
var SCROLL_MUL = { slow: 0.6, normal: 1, fast: 1.6 };

export var scrollRate = SCROLL_MUL[lsGet('vibetop:rts:scroll')] ? lsGet('vibetop:rts:scroll') : 'normal';

function scrollMul() { return SCROLL_MUL[scrollRate] || 1; }

// Edge scrolling is a ZONE with a speed curve, not a trigger with a timer.
// A dwell delay was tried and is wrong: RA2 has none, and waiting for the
// map to start moving is worse than the problem it solves. What makes a
// zone work is that its inner lip is nearly stationary — sweeping across it
// on the way to the build panel costs a couple of pixels, while parking in
// it scrolls fast. Squared falloff, so the slow part is genuinely slow.
var EDGE_BAND = 44;           // px — narrow enough to stay out of the way

var EDGE_MIN = 80;            // px/s at the inner lip

var EDGE_MAX = 900;           // px/s at the outer edge and beyond

// WHERE the band is: the navigation GUTTER, the black strip round the whole
// frame (body padding, --gut). It sits OUTSIDE the build panel and the
// command bar, so the map's own border and the panels never scroll — the
// user's rule, 2026-09-11, after two wrong turns: a zone on the map edge
// beside the panel (overshot into the panel), then the panels as walls
// (hovering the build menu moved the view). RA2's zone is the screen edge,
// which stops the cursor; a floating desktop window stops nothing, so the
// zone is a visible strip you can park on. Its width IS the band.
function gutterPx() {
  var v = 26;
  try { v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gut')) || 26; } catch (e) {}
  return v;
}

// Inside the desktop the window's resize grips cover the outer 8 px of the
// frame on three sides (their ring is a tested model that tiles the seam
// between tiled windows), so the strip is wider there — 26 px stay live and
// the live part reads as the whole strip (session audit, 2026-09-11).
// Standalone keeps the 26 px strip.
if (window.top !== window && !IS_TOUCH) { try { document.documentElement.style.setProperty('--gut', '34px'); } catch (e) {} }

// Framed inside the desktop, the frame's own size says nothing about the
// device: a floating window on a tablet is small, the tablet is not a
// phone. The gate reads the TOP window (touch audit, 2026-09-11).
try { if (window.top !== window && Math.min(window.top.innerWidth, window.top.innerHeight) > 540) document.documentElement.classList.add('no-gate'); } catch (e) {}

export var GUT = gutterPx();

// FLAT: one speed across the whole strip. A depth-scaled band (80 px/s at
// the inner lip, 900 at the edge) made each side feel different by where
// the hand happened to stop — the user: "the navigation speed on the four
// sides isn't consistent". RA2's edge scroll is one constant rate.
export var EDGE_BANDS = { l: { band: GUT, dead: 0, flat: true }, t: { band: GUT, dead: 0, flat: true },
                   r: { band: GUT, dead: 0, flat: true }, b: { band: GUT, dead: 0, flat: true } };

// Pure: pointer (x, y) in a w x h window -> scroll target {tx, ty} in -1..1,
// 0 outside the bands, growing from the (dead) inner lip to 1 at the edge.
export function edgeTarget(x, y, w, h, bands) {
  function t(d, bd) {                       // d: distance in from the edge
    if (d >= bd.band) return 0;
    if (bd.flat) return 1;                  // the whole strip is the edge
    var live = bd.band - bd.dead;
    return live <= 0 ? 1 : Math.max(0, Math.min(1, (bd.band - d - bd.dead) / live));
  }
  var tx = 0, ty = 0;
  if (x < bands.l.band) tx = -t(x, bands.l);
  else if (x > w - bands.r.band) tx = t(w - x, bands.r);
  if (y < bands.t.band) ty = -t(y, bands.t);
  else if (y > h - bands.b.band) ty = t(h - y, bands.b);
  return { tx: tx, ty: ty };
}

var pageMouse = { x: -1, y: -1, in: false };

function trackPageMouse(e) {
  if (e.pointerType === 'touch') return;    // touch pans by dragging, never by the edge
  var nx = e.clientX, ny = e.clientY;
  var now = performance.now(), dtm = now - lastMoveT;
  if (dtm > 0 && dtm < 120) {
    var dpx = Math.sqrt((nx - lastMoveX) * (nx - lastMoveX) + (ny - lastMoveY) * (ny - lastMoveY));
    moveSpeed = moveSpeed * 0.45 + (dpx / dtm * 1000) * 0.55;
  } else {
    // No usable previous sample — the pointer has just (re-)entered the
    // window. Unknown means travelling until a real measurement says
    // otherwise, so an arrival at the edge never lurches.
    moveSpeed = MOVE_FAST + 1;
  }
  lastMoveT = now; lastMoveX = nx; lastMoveY = ny;
  pageMouse.x = nx; pageMouse.y = ny; pageMouse.in = true;
}

document.addEventListener('pointermove', trackPageMouse);

// A pointer FLYING across the band is on its way somewhere — usually the
// command bar — and must not drag the map with it. A pointer that arrives
// and stops is asking to scroll. This is the distinction a dwell timer was
// reaching for and got wrong: there is no waiting here, because shoving the
// cursor at the edge ends with it stationary, and stationary starts at once.
var MOVE_FAST = 700;          // px/s above which the band is ignored

var MOVE_IDLE = 45;           // ms of stillness that counts as "arrived"

var lastMoveT = -1e9, lastMoveX = 0, lastMoveY = 0, moveSpeed = 0;

function pointerFlying() {
  if (performance.now() - lastMoveT > MOVE_IDLE) return false;   // stopped
  return moveSpeed > MOVE_FAST;
}

function edgeSpeed(t) {                    // t: 0 at the lip, 1 at the edge
  return (EDGE_MIN + (EDGE_MAX - EDGE_MIN) * t * t) * scrollMul();
}

export function camScroll(dtms) {
  var dt = dtms / 1000;
  var wx = 0, wy = 0;

  if (state === 'play' || state === 'paused') {
    // ARROWS ONLY. W/A/S/D used to pan as well, which meant every letter
    // key that does something to the SELECTION also dragged the camera:
    // `keys[...]` is set at the top of the keydown handler, before the
    // deploy branch returns, so holding D deployed a GI *and* scrolled
    // right. S (stop) and W (defence tab) collided the same way. RA2
    // scrolls with the arrows, the mouse at a screen edge, or the minimap.
    var kx = 0, ky = 0;
    if (keys.arrowleft) kx -= 1;
    if (keys.arrowright) kx += 1;
    if (keys.arrowup) ky -= 1;
    if (keys.arrowdown) ky += 1;
    if (kx || ky) {
      var kl = Math.sqrt(kx * kx + ky * ky);
      wx += kx / kl * KEY_SPEED * scrollMul() / zoom; wy += ky / kl * KEY_SPEED * scrollMul() / zoom;   // a SCREEN rate
    }

    if (pan) {                              // middle/right-drag beats everything
      if (pan.right && !pan.moved &&
          (Math.abs(mouse.x - pan.x0) > RIGHT_SLOP || Math.abs(mouse.y - pan.y0) > RIGHT_SLOP)) pan.moved = true;
      cam.x -= (mouse.x - pan.x) / zoom; cam.y -= (mouse.y - pan.y) / zoom;
      pan.x = mouse.x; pan.y = mouse.y;
      camVel.x = camVel.y = 0;
      clampCam();
      return;
    }

    if (pageMouse.in && !drag && !pointerFlying()) {
      // The gutter: the pointer against the window's edges, outside every panel.
      var et = edgeTarget(pageMouse.x, pageMouse.y, window.innerWidth, window.innerHeight, EDGE_BANDS);
      var ex = et.tx ? Math.sign(et.tx) * edgeSpeed(Math.abs(et.tx)) : 0;
      var ey = et.ty ? Math.sign(et.ty) * edgeSpeed(Math.abs(et.ty)) : 0;
      // A corner scrolls diagonally at the SAME speed as a side, not 1.41x.
      if (ex && ey) { ex *= Math.SQRT1_2; ey *= Math.SQRT1_2; }
      wx += ex / zoom; wy += ey / zoom;     // a SCREEN rate, like the right-drag pan
    }
    // Leaving the WINDOW stops navigation. Off-window acceleration was tried
    // and is wrong here: a browser cursor is not locked to the viewport, so
    // wandering out of the game left the map running away on its own.
  }

  // Velocity easing, frame-rate INDEPENDENT. `Math.min(1, dt * 16)` saturates
  // to 1 on any frame longer than 62 ms, so on a loaded machine the pan
  // snapped straight to full speed — no ramp at all, exactly when smooth
  // scrolling matters most. The exponential form is the same 62 ms time
  // constant at 60 fps (0.234 against 0.267) and still eases on a long
  // frame (0.80 at dt = 100 ms, where the old form gave 1.00).
  var k = 1 - Math.exp(-dt * 16);
  camVel.x += (wx - camVel.x) * k;
  camVel.y += (wy - camVel.y) * k;
  if (Math.abs(camVel.x) < 1) camVel.x = 0;
  if (Math.abs(camVel.y) < 1) camVel.y = 0;
  if (camVel.x || camVel.y) {
    cam.x += camVel.x * dt;
    cam.y += camVel.y * dt;
    clampCam();
  }
}

// ScreenCapture: the whole field as it stands, saved as a PNG. The frame
// is drawn fresh first so a capture taken while paused is not the frame
// from before the pause.
function screenCapture() {
  try {
    render();
    var name = 'iron-frontier-' + (G ? mmss(Math.floor(G.tick / 60)).replace(':', 'm') + 's' : 'menu') + '.png';
    cv.toBlob(function (blob) {
      if (!blob) { say('Screen capture failed', true); return; }
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      say('Screenshot saved — ' + name); sfx('click');
    }, 'image/png');
  } catch (err) { say('Screen capture failed', true); }
}

// --- generated ---
// ESM import bindings are read-only, so a write from another module goes
// through the owner. Reads stay verbatim everywhere: the binding is live.
export function __setCmdMode(v) { cmdMode = v; }
export function setScrollRate(v) { scrollRate = v; }
export function setViews(v) { views = v; }
export function setWallDrag(v) { wallDrag = v; }

// Iron Frontier — ui/menus.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.

import { newAI } from '../ai.js';
import { COL, applyHouse } from '../bake/buildings.js';
import { iconFaceOf } from '../bake/kit.js';
import { SPR, mkCanvas } from '../bake/terrain.js';
import { BLDS } from '../blds.js';
import { FACTIONS, ownedBy } from '../factions.js';
import { MAPS, mapId, setMapId } from '../mapgen.js';
import { BcNet, MP_DELAY, NET, SP_DELAY, netBind, netLoad, netStash, setLOCKSTEP_DELAY } from '../net.js';
import { HOUSE, OPT_DEF, aiHouse, normOpts } from '../opts.js';
import { UNITS } from '../roster.js';
import { G, difficulty, faction, headless, idx, newState, setDifficulty, setFaction, setG, setState, state } from '../state.js';
import { openingForce, techCount } from '../watch.js';
import { FOE, MAP, ME, PAUSE_SVG, PLAY_SVG, P_AI, P_HUMAN, SND_OFF_SVG, SND_ON_SVG } from '../world.js';
import { MUS, applyVol, eva, musicOn, resumeAudio, setMusicOn, setSoundOn, sfx, soundOn, unitAck, vol } from './audio.js';
import { pickCursor } from './cursors.js';
import { cv } from './dom.js';
import { clearEva, refreshSW, say, setShownCred, setSwMode, sideEl, touchHint } from './hud.js';
import { __setCmdMode, refreshCmdbar, scrollRate, setScrollRate } from './input.js';
import { setLastRadar } from './minimap.js';
import { buildPanel, setLastPowerWarn, setLastReady, setToldRefinery } from './panel.js';
import { setTRK_AT, terrCol } from './render.js';
import { RESUME_KEY, loadGame, lsGet, lsSet, reloadKeepMatch, restoreSession, saveGame, saveSlots } from './save.js';
import { cam, centerOn, setGroups, setPanel, setPlacing, setSel } from './screen.js';

// --------------------------------------------------------------------- //
//  Cards / flow
// --------------------------------------------------------------------- //
export var ov = document.getElementById('ov'), ovIc = document.getElementById('ovIc');

export var ovT = document.getElementById('ovT'), ovP = document.getElementById('ovP');

export var ovA = document.getElementById('ovA'), ovB = document.getElementById('ovB');

var ovCard = document.getElementById('ovCard');

var diffRow = document.getElementById('diffRow'), facRow = document.getElementById('facRow'), mapRow = document.getElementById('mapRow');

var diffWrap = document.getElementById('diffWrap'), mapWrap = document.getElementById('mapWrap');

var debugMode = lsGet('vibetop:rts:debug') === '1';

var dbgChk = document.getElementById('dbgChk');

if (dbgChk) { dbgChk.checked = debugMode; dbgChk.addEventListener('change', function () { debugMode = dbgChk.checked; lsSet('vibetop:rts:debug', debugMode ? '1' : '0'); }); }

// --------------------------------------------------------------------- //
//  Front-menu art. RA2's setup screen shows you pictures, not prose: a
//  faction emblem, the side's hardware, and a preview of the ground you
//  are about to fight over. All three are drawn ONCE into cached canvases
//  at first open — nothing below runs per frame.
// --------------------------------------------------------------------- //
// These canvases are laid out by the PAGE, not blitted by the renderer, so
// their display size belongs to CSS: an inline width would outrank the
// class rules and the emblem would ignore --emb (and the line-up would push
// the card wider than a phone).
// Points computed from cos/sin rather than ctx.rotate: the same maths draws
// the Directorate's star and the Collective's, and it keeps every path in
// one coordinate frame.
function starPath(g, cx, cy, R, r, n, rot) {
  g.beginPath();
  for (var i = 0; i < n * 2; i++) {
    var a = rot + i * Math.PI / n, rad = (i & 1) ? r : R;
    var x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}

// A quad laid along an axis: used for the eagle's feathers and the
// Collective hammer, both of which want a rotated bar without a transform.
function barPath(g, x0, y0, x1, y1, t0, t1) {
  var dx = x1 - x0, dy = y1 - y0, L = Math.sqrt(dx * dx + dy * dy) || 1;
  var px = -dy / L, py = dx / L;
  g.beginPath();
  g.moveTo(x0 + px * t0, y0 + py * t0);
  g.lineTo(x1 + px * t1, y1 + py * t1);
  g.lineTo(x1 - px * t1, y1 - py * t1);
  g.lineTo(x0 - px * t0, y0 - py * t0);
  g.closePath();
}

var EMB = 96;                       // emblems are authored on a 96x96 field

var emblemCache = {};

function facEmblem(k) {
  if (emblemCache[k]) return emblemCache[k];
  var o = mkCanvas(EMB, EMB), g = o.g;
  o.c.className = 'emb';
  try { (k === 'col' ? drawColEmblem : drawDirEmblem)(g); } catch (e) {}
  emblemCache[k] = o.c;
  return o.c;
}

// Directorate — a spread eagle on a star, inside a steel ring. RA2's Allied
// eagle in spirit, not in line: three swept feathers a side, a hard-edged
// body, and the ring the Allies always wear.
function drawDirEmblem(g) {
  var C = 48, i;
  var disc = g.createRadialGradient(C, 32, 4, C, C, 46);
  disc.addColorStop(0, '#1d2c3c'); disc.addColorStop(1, '#0b1017');
  g.fillStyle = disc;
  g.beginPath(); g.arc(C, C, 42, 0, 6.2832); g.fill();

  g.lineWidth = 3; g.strokeStyle = '#4aa3db';
  g.beginPath(); g.arc(C, C, 44, 0, 6.2832); g.stroke();
  g.lineWidth = 1; g.strokeStyle = 'rgba(160,214,247,.55)';
  g.beginPath(); g.arc(C, C, 39.5, 0, 6.2832); g.stroke();

  starPath(g, C, 19, 7.6, 3.2, 5, -Math.PI / 2);
  g.fillStyle = '#bfe0f7'; g.fill();

  var wing = g.createLinearGradient(0, 20, 0, 74);
  wing.addColorStop(0, '#f4f9fd'); wing.addColorStop(0.5, '#c2d6e9'); wing.addColorStop(1, '#7692b0');

  // Wings raised in a V, each one solid with four scalloped primaries along
  // the trailing edge: a heraldic displayed eagle still reads as a bird at
  // 58px, where separate feather bars turn into insect legs.
  for (var side = 0; side < 2; side++) {
    g.save();
    if (side) { g.translate(2 * C, 0); g.scale(-1, 1); }
    g.beginPath();
    g.moveTo(50, 40);
    g.quadraticCurveTo(64, 20, 79, 24);                 // leading edge
    g.lineTo(81, 30);                                   // blunt tip
    g.lineTo(75.7, 28.1); g.lineTo(73.5, 34.5);         // trailing edge, four primaries
    g.lineTo(68.2, 32.6); g.lineTo(66.0, 39.0);
    g.lineTo(60.7, 37.1); g.lineTo(58.5, 43.5);
    g.lineTo(53.2, 41.6); g.lineTo(51.0, 48.0);
    g.closePath();
    g.fillStyle = wing; g.fill();
    g.lineWidth = 0.9; g.strokeStyle = 'rgba(20,40,60,.45)'; g.stroke();
    g.restore();
  }

  // Body and fanned tail: one hard wedge, so the silhouette survives small.
  g.beginPath();
  g.moveTo(42.4, 36.5); g.lineTo(53.6, 36.5); g.lineTo(55.2, 53);
  g.lineTo(52.2, 66); g.lineTo(48, 60.5); g.lineTo(43.8, 66); g.lineTo(40.8, 53);
  g.closePath();
  g.fillStyle = wing; g.fill();
  g.lineWidth = 0.9; g.strokeStyle = 'rgba(20,40,60,.45)'; g.stroke();

  // Keel line and a shaded flank: volume, where a flat strip read as cloth.
  g.beginPath();
  g.moveTo(48, 37.5); g.lineTo(53.6, 36.5); g.lineTo(55.2, 53);
  g.lineTo(52.2, 66); g.lineTo(48, 60.5); g.closePath();
  g.fillStyle = 'rgba(24,52,78,.22)'; g.fill();
  g.lineWidth = 0.9; g.strokeStyle = 'rgba(20,40,60,.34)';
  g.beginPath(); g.moveTo(48, 38.5); g.lineTo(48, 59); g.stroke();

  g.beginPath(); g.ellipse(47.7, 32.2, 4.4, 4.9, 0, 0, 6.2832);
  g.fillStyle = '#f4f9fd'; g.fill();
  g.beginPath();                                        // hooked beak, in profile
  g.moveTo(43.5, 29.9); g.lineTo(34, 34.4); g.lineTo(39.4, 36.2); g.lineTo(43.1, 37.6);
  g.closePath();
  g.fillStyle = '#e0b040'; g.fill();
  g.beginPath(); g.arc(45.2, 31.3, 0.8, 0, 6.2832); g.fillStyle = '#1a3145'; g.fill();
}

// Collective — a gear ring behind a red star with a hammer laid across it.
// The Soviet grammar (star, industry, the tool as a weapon) without lifting
// the hammer-and-sickle itself.
function drawColEmblem(g) {
  var C = 48, i, a;
  g.fillStyle = '#7d858f';
  for (i = 0; i < 12; i++) {
    a = i * Math.PI / 6;
    barPath(g, C + Math.cos(a) * 33, C + Math.sin(a) * 33,
               C + Math.cos(a) * 45, C + Math.sin(a) * 45, 5.2, 3.6);
    g.fill();
  }
  g.beginPath(); g.arc(C, C, 38, 0, 6.2832);
  g.fillStyle = '#5b626c'; g.fill();
  g.beginPath(); g.arc(C, C, 33.5, 0, 6.2832);
  var disc = g.createRadialGradient(C, 32, 4, C, C, 36);
  disc.addColorStop(0, '#221118'); disc.addColorStop(1, '#0d0a0e');
  g.fillStyle = disc; g.fill();
  g.lineWidth = 1.4; g.strokeStyle = 'rgba(255,255,255,.16)';
  g.beginPath(); g.arc(C, C, 33.5, 0, 6.2832); g.stroke();

  starPath(g, C, C - 1, 31, 12.6, 5, -Math.PI / 2);
  var st = g.createLinearGradient(0, 16, 0, 78);
  st.addColorStop(0, '#f0616b'); st.addColorStop(0.5, '#d8434d'); st.addColorStop(1, '#98232c');
  g.fillStyle = st; g.fill();
  g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,190,195,.42)'; g.stroke();

  // Hammer: haft up-right, head square across it.
  var ax = 30.5, ay = 68, bx = 58.5, by = 40;
  var dx = bx - ax, dy = by - ay, L = Math.sqrt(dx * dx + dy * dy);
  var ux = dx / L, uy = dy / L;
  var hg = g.createLinearGradient(0, 28, 0, 72);
  hg.addColorStop(0, '#f6e3ab'); hg.addColorStop(1, '#b98f33');
  barPath(g, ax, ay, bx, by, 3.1, 3.1);
  g.fillStyle = hg; g.fill();
  g.lineWidth = 1; g.strokeStyle = 'rgba(52,32,8,.55)'; g.stroke();
  var hx = bx + ux * 4.2, hy = by + uy * 4.2;                 // head, square across the haft
  barPath(g, hx - ux * 6, hy - uy * 6, hx + ux * 6, hy + uy * 6, 11.5, 11.5);
  g.fillStyle = hg; g.fill();
  g.lineWidth = 1.1; g.strokeStyle = 'rgba(52,32,8,.6)'; g.stroke();
  barPath(g, hx + ux * 2.6, hy + uy * 2.6, hx + ux * 6, hy + uy * 6, 11.5, 11.5);
  g.fillStyle = 'rgba(70,44,10,.30)'; g.fill();               // the striking face, in shade
}

// The side's hardware, drawn from the game's OWN baked sprites, on a common
// ground line — what you are choosing, in the colour you will actually
// play it in (player 0; colour follows the PLAYER, never the faction).
var LINEUP = {
  dir: [['b', 'base'], ['u', 'lancer'], ['u', 'rifle'], ['u', 'harrier']],
  col: [['b', 'base'], ['u', 'rhino'], ['u', 'conscript'], ['u', 'kirov']]
};

// Slot heights, the SAME for both sides. Fitting every sprite to its own
// box made the two rows read at different sizes — the Soviet yard is a tall
// spire and the Kirov an airship, so both came out over-scaled against the
// Allied pair beside them. Fixing the height per slot (yard, tank, rifleman,
// aircraft) makes the line-ups directly comparable, which is the whole point
// of showing them side by side.
var LINE_SLOT_H = [56, 50, 44, 50];

var LINE_SLOT_LIFT = [0, 0, 0, 9];              // aircraft hang off the ground

var LINE_W = 380, LINE_H = 70;

var lineupCache = {};

function facLineup(k) {
  if (lineupCache[k]) return lineupCache[k];
  var o = mkCanvas(LINE_W, LINE_H), g = o.g;
  o.c.className = 'lineup';
  try {
    var list = LINEUP[k], cw = LINE_W / list.length, ground = LINE_H - 7;
    g.fillStyle = 'rgba(190,214,240,.10)';          // the ground they stand on
    g.fillRect(6, ground + 1.5, LINE_W - 12, 1);
    g.imageSmoothingEnabled = true;
    for (var i = 0; i < list.length; i++) {
      var kind = list[i][0], key = list[i][1], src = null, sw = 0, sh = 0, ox = 0, oy = 0, kb = 1;
      if (kind === 'b') {
        var A = SPR.bld[0][k][key];
        if (!A) continue;
        src = A.s.c; kb = src.width / A.s.w;
        var bb = A.s.bb || { x0: 0, y0: 0, x1: A.s.w, y1: A.s.h };
        sw = bb.x1 - bb.x0; sh = bb.y1 - bb.y0; ox = bb.x0; oy = bb.y0;
      } else {
        var U = SPR.unit[0][k][key];
        if (!U) continue;
        var fr = Array.isArray(U) ? U[iconFaceOf(UNITS[key])] : U;
        src = fr.c; kb = src.width / fr.w;
        var ub = fr.bb || { x0: 0, y0: 0, x1: fr.w, y1: fr.h };
        sw = ub.x1 - ub.x0; sh = ub.y1 - ub.y0; ox = ub.x0; oy = ub.y0;
      }
      if (!src || !(sw > 0) || !(sh > 0)) continue;
      var sc = Math.min(LINE_SLOT_H[i] / sh, (cw - 12) / sw);   // height first, width only as a cap
      var dw = sw * sc, dh = sh * sc, lift = LINE_SLOT_LIFT[i];
      g.drawImage(src, ox * kb, oy * kb, sw * kb, sh * kb, cw * i + (cw - dw) / 2, ground - dh - lift, dw, dh);
    }
  } catch (e) {}
  lineupCache[k] = o.c;
  return o.c;
}

// Map previews. RA2 shows the ground before you commit to it, so each map
// is generated once from a FIXED seed (no Math.random anywhere in this
// file) and painted at 2px a tile in the theatre's own palette, with the
// two mirrored starts marked. Six 64x64 generations, once, at first open.
var THUMB_SEED = 0x1f0e5a3b, THUMB_PX = 2, THUMB_W = MAP * THUMB_PX;

// Two caches, because they age differently: the ground plate costs a whole
// map generation and never changes, while the two spawn dots are painted in
// the house colours and have to follow the colour picker.
var thumbPlate = {}, thumbDots = {}, thumbStart = {};

export function mapPlate(k) {
  if (thumbPlate[k]) return thumbPlate[k];
  var o = mkCanvas(THUMB_W, THUMB_W), g = o.g;
  g.fillStyle = '#0b0e14'; g.fillRect(0, 0, THUMB_W, THUMB_W);
  // newState is a MATCH constructor: it attaches a fresh lockstep client
  // (NET.active), resets the spatial hash and path queue, and reseeds the
  // RNG. A thumbnail must leave the running match's client and caches
  // exactly as they were — enterLoaded builds this row AFTER a restore,
  // and the thumb's client silently replaced the match's, so every order
  // after a resume was scheduled on a client nobody stepped (2026-09-11:
  // "can select a unit but can't make it move or build").
  netStash();
  var prevNet = NET.active, prevG = G;
  try {
    var st = newState(THUMB_SEED, 'normal', k), x, y;
    for (y = 0; y < MAP; y++) for (x = 0; x < MAP; x++) {
      g.fillStyle = terrCol(st.terrain[idx(x, y)], st.theatre);
      g.fillRect(x * THUMB_PX, y * THUMB_PX, THUMB_PX, THUMB_PX);
    }
    thumbStart[k] = st.start.map(function (sp) { return { x: sp.x, y: sp.y }; });
  } catch (e) { thumbStart[k] = []; }
  finally { if (prevNet) netLoad(prevNet); else { NET.active = null; setG(prevG); } }
  thumbPlate[k] = o.c;
  return o.c;
}

function mapThumb(k) {
  if (thumbDots[k]) return thumbDots[k];
  var plate = mapPlate(k), o = mkCanvas(THUMB_W, THUMB_W), g = o.g;
  try {
    g.drawImage(plate, 0, 0, THUMB_W, THUMB_W);
    var st = thumbStart[k] || [];
    for (var i = 0; i < st.length; i++) {
      var px = st[i].x * THUMB_PX, py = st[i].y * THUMB_PX;
      g.fillStyle = 'rgba(0,0,0,.6)';
      g.beginPath(); g.arc(px, py, 4.6, 0, 6.2832); g.fill();
      g.fillStyle = COL[i];
      g.beginPath(); g.arc(px, py, 3.1, 0, 6.2832); g.fill();
    }
  } catch (e) {}
  thumbDots[k] = o.c;
  return o.c;
}

var mapBtns = null;

function buildMapRow() {
  if (!mapBtns) {
    mapBtns = {};
    mapRow.innerHTML = '';
    Object.keys(MAPS).forEach(function (k) {
      var b = document.createElement('button');
      b.title = MAPS[k].name + ' — ' + MAPS[k].blurb;
      var th = mapThumb(k);
      if (th) b.appendChild(th);
      var nm = document.createElement('span');
      nm.className = 'mn'; nm.textContent = MAPS[k].name;
      b.appendChild(nm);
      b.addEventListener('click', function () { setMapId(k); lsSet('vibetop:rts:map', k); buildMapRow(); });
      mapRow.appendChild(b);
      mapBtns[k] = b;
    });
  }
  Object.keys(mapBtns).forEach(function (k) { mapBtns[k].className = mapId === k ? 'on' : ''; });
}

var mpWrap = document.getElementById('mpWrap'), mpRow = document.getElementById('mpRow'), mpNote = document.getElementById('mpNote');

var scoresEl = document.getElementById('scores');

var scoreCard = document.getElementById('scoreCard');

export var hv = document.getElementById('hv'), lv = document.getElementById('lv');

var sess = null;

export var onA = null, onB = null;

function showCard(ic, title, msg, aLabel, bLabel, showDiff, showScores) {
  ovIc.textContent = ic; ovT.textContent = title; ovP.textContent = msg;
  ovA.textContent = aLabel;
  ovB.style.display = bLabel ? 'block' : 'none';
  if (bLabel) ovB.textContent = bLabel;
  // The same card is the front menu, the abandon-match confirm and the
  // victory/defeat screen. Only the front menu wears the setup layout.
  ovCard.classList.toggle('menu', !!showDiff);
  facRow.style.display = showDiff ? 'grid' : 'none';
  diffWrap.style.display = showDiff ? 'flex' : 'none';
  mapWrap.style.display = showDiff ? 'block' : 'none';
  setWrap.style.display = showDiff ? 'block' : 'none';
  if (mpWrap) mpWrap.style.display = showDiff ? 'flex' : 'none';
  if (showDiff) { buildFacRow(); buildDiffRow(); buildMapRow(); buildSetRows(); buildMpRow(); }
  ovA.style.display = aLabel ? '' : 'none';
  scoresEl.style.display = showScores ? 'block' : 'none';
  if (!showScores) scoreCard.hidden = true;
  if (optCard) optCard.style.display = 'none';
  ov.classList.add('show');
  menuChrome();
}

function hideCard() { ov.classList.remove('show'); menuChrome(); }

// Hide the live sidebar behind the FRONT menu only. Keyed off `state`
// rather than off showCard's own arguments so the Load-a-saved-game card,
// which is reached from the menu and passes showDiff=false, does not blink
// the HUD back on underneath it.
function menuChrome() {
  // The headless test harness has no document.body.
  var bd = document.body;
  if (!bd || !bd.classList) return;
  bd.classList.toggle('atmenu', state === 'menu' && ov.classList.contains('show'));
}

// --------------------------------------------------------------------- //
//  In-game options (keyboard.ini Options=27, Esc). RA2 pauses the match
//  behind this card and offers exactly this: carry on, restart, quit to
//  the shell, sound, scroll rate.
// --------------------------------------------------------------------- //
var optCard = document.getElementById('optCard');

var sndRow = document.getElementById('sndRow'), scrRow = document.getElementById('scrRow');

var gameRow = document.getElementById('gameRow');

var slotList = document.getElementById('slotList');

var gspdSl = document.getElementById('gspdSl'), gspdVal = document.getElementById('gspdVal');

var musRow = document.getElementById('musRow');

var VSL = [['sfx', 'vsfxSl', 'vsfxVal'], ['voice', 'vvoxSl', 'vvoxVal'], ['music', 'vmusSl', 'vmusVal']];

export var optOpen = false;

function optButtons(row, list, isOn, onPick) {
  row.innerHTML = '';
  list.forEach(function (it) {
    var b = document.createElement('button');
    b.textContent = it[1];
    if (isOn && isOn(it[0])) b.className = 'on';
    b.addEventListener('click', function () { resumeAudio(); onPick(it[0]); });
    row.appendChild(b);
  });
}

function buildOptRows() {
  optButtons(sndRow, [['on', 'On'], ['off', 'Off']],
    function (k) { return (k === 'on') === !!soundOn; },
    function (k) {
      setSoundOn(k === 'on');
      lsSet('vibetop:rts:sound', soundOn ? '1' : '0');
      if (typeof paintSnd === 'function') paintSnd();
      if (soundOn) { resumeAudio(); if (musicOn) MUS.start(); } else MUS.stop();
      buildOptRows();
    });
  // Music is its own switch, on the front menu as well as in a match, so
  // you can silence the score without silencing the game.
  optButtons(musRow, [['on', 'On'], ['off', 'Off']],
    function (k) { return (k === 'on') === !!musicOn; },
    function (k) {
      setMusicOn(k === 'on');
      lsSet('vibetop:rts:music', musicOn ? '1' : '0');
      applyVol();
      if (musicOn) { resumeAudio(); MUS.start(); } else MUS.stop();   // resumeAudio builds the graph for music alone
      buildOptRows();
    });
  VSL.forEach(function (v) {
    var sl = document.getElementById(v[1]), lb = document.getElementById(v[2]);
    if (!sl) return;
    sl.value = Math.round(vol[v[0]] * 100);
    if (lb) lb.textContent = sl.value + '%';
  });
  optButtons(scrRow, [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']],
    function (k) { return k === scrollRate; },
    function (k) { setScrollRate(k); lsSet('vibetop:rts:scroll', k); buildOptRows(); });
  // Debug mode adds "Save & reload": the art is baked at page load, so a
  // deploy only shows in a reloaded page — this autosaves the running
  // match, reloads, and the page resumes it (see the resume flag at boot).
  optButtons(gameRow, debugMode ? [['restart', 'Restart match'], ['reload', 'Save & reload']]
                                : [['restart', 'Restart match']], null, function (k) {
    if (k === 'reload') { reloadKeepMatch(); return; }
    optOpen = false; optCard.style.display = 'none'; hideCard();
    startMatch();
  });
  // RA2 puts the speed slider in the Options card, and it takes effect on
  // the running match — G.opt is what the loop reads.
  var sp = G && G.opt ? G.opt.speed : opts.speed;
  gspdSl.value = sp; gspdVal.textContent = SPD_NAME[sp];
  // The card doubles as the front menu's Load screen, where "Restart" and
  // a live speed slider mean nothing.
  var inMatch = state === 'play' || state === 'paused', mp = !!(G && G.mp && inMatch);
  gspdSl.parentNode.parentNode.style.display = inMatch ? 'flex' : 'none';
  // Two-player: the slowest tab sets the pace of both, so one player's
  // slider would throttle the other's game unexplained. The host's record
  // fixes the speed for the match.
  gspdSl.disabled = mp;
  if (mp) gspdVal.textContent = SPD_NAME[sp] + ' \u00b7 set by the host';
  // "Restart" would drop this tab into a skirmish against the computer and
  // freeze the other player's game for good. A network match has no restart.
  gameRow.parentNode.style.display = inMatch && !mp ? 'flex' : 'none';
  buildSlotRows();
}

function ago(ms) {
  var d = Math.max(0, Date.now() - ms) / 1000;
  if (d < 90) return 'just now';
  if (d < 5400) return Math.round(d / 60) + ' min ago';
  if (d < 108000) return Math.round(d / 3600) + ' h ago';
  return Math.round(d / 86400) + ' d ago';
}

function buildSlotRows() {
  var metas = saveSlots();
  slotList.innerHTML = '';
  // Half of a lockstep pair cannot be saved or resumed alone (the autosave
  // already refuses); a Load here forked the match into a solo game that
  // still claimed to be two-player, and froze the peer.
  if (G && G.mp && (state === 'play' || state === 'paused')) {
    var note = document.createElement('i');
    note.className = 'mpnote';
    note.textContent = 'Saving and loading are not available in a two-player match.';
    slotList.appendChild(note);
    return;
  }
  metas.forEach(function (m, i) {
    var n = i + 1, row = document.createElement('div');
    row.className = 'gslot';
    var nm = document.createElement('span');
    nm.className = 'sname';
    nm.innerHTML = m
      ? '<b>' + n + '</b> · ' + m.map + ' · ' + mmss(Math.floor(m.tick / 60)) + ' · ' + ago(m.at)
      : '<b>' + n + '</b> · <i>empty</i>';
    row.appendChild(nm);
    var sv = document.createElement('button');
    sv.textContent = 'Save';
    sv.disabled = !G || (state !== 'play' && state !== 'paused');   // nothing to save from the shell
    sv.addEventListener('click', function () {
      if (saveGame(n)) { say('Saved to slot ' + n); sfx('click'); } else say('Could not save — storage is full', true);
      buildSlotRows();
    });
    row.appendChild(sv);
    var ld = document.createElement('button');
    ld.textContent = 'Load'; ld.disabled = !m;
    ld.addEventListener('click', function () {
      if (!loadGame(n)) { say('That save could not be read', true); buildSlotRows(); return; }
      enterLoaded(n);
    });
    row.appendChild(ld);
    slotList.appendChild(row);
  });
}

// Everything startMatch does that is NOT the match: a loaded G brings its
// own units and its own tick, but the selection, the camera, the sidebar
// and the announcement rail all belong to the session and have to be reset.
export function enterLoaded(n) {
  optOpen = false; optCard.style.display = 'none'; hideCard();
  G.debug = !!G.debug;
  setState('play');
  setLastRadar(null); evaHush(false);
  pauseBtn.innerHTML = PAUSE_SVG;
  pausedEl.classList.remove('show');
  setSel([]); setGroups({}); setPlacing(null); setSwMode(null);
  restoreSession();                       // the teams and the camera bookmarks come back with the match
  __setCmdMode(null); refreshCmdbar(); pickCursor();
  cv.classList.remove('placing');
  setShownCred(0); setLastReady(null); setToldRefinery(false); setLastPowerWarn(-1e9);
  sess = window.vibeScores ? window.vibeScores.session() : null;
  centerOn(G.start[ME].x, G.start[ME].y);
  setPanel('b');
  document.querySelectorAll('.ptab div').forEach(function (o, i) { o.classList.toggle('on', i === 0); });
  if (sideEl) sideEl.style.setProperty('--acc', COL[ME]);
  clearEva();
  MUS.set(G.theatre); MUS.start();
  buildFacRow(); buildMapRow(); buildDiffRow();
  buildPanel(); refreshSW();
  say((n === 'auto' ? 'Match resumed' : 'Slot ' + n + ' restored') + ' — ' + (MAPS[G.mapId] || MAPS.frontier).name + ' at ' + mmss(Math.floor(G.tick / 60)), false, 320);
  eva('Battlefield control online', 30000);
}

VSL.forEach(function (v) {
  var sl = document.getElementById(v[1]), lb = document.getElementById(v[2]);
  if (!sl) return;
  sl.addEventListener('input', function () {
    vol[v[0]] = Math.max(0, Math.min(100, sl.value | 0)) / 100;
    if (lb) lb.textContent = Math.round(vol[v[0]] * 100) + '%';
    lsSet('vibetop:rts:vol:' + v[0], vol[v[0]].toFixed(2));
    resumeAudio(); applyVol();
  });
  // A slider you cannot hear is a slider you cannot set: each one previews
  // its own bus as you let go.
  sl.addEventListener('change', function () {
    if (v[0] === 'sfx') sfx('cannon');
    else if (v[0] === 'voice') unitAck([{ p: ME, type: 'rifle', dead: false, x: cam.x, y: cam.y }], 'select');
  });
});

gspdSl.addEventListener('input', function () {
  var v = Math.max(1, Math.min(6, gspdSl.value | 0));
  gspdVal.textContent = SPD_NAME[v];
  opts.speed = v; saveOpts();
  if (G && G.opt) G.opt.speed = v;
});

// The card was reachable by Esc only, which nobody finds. The gear in the
// top bar is the discoverable way in, during a match or at the menu.
function wireOptBtn() {
  var ob = document.getElementById('optBtn');
  if (ob) ob.addEventListener('click', function () { resumeAudio(); if (optOpen) closeOptions(); else showOptions(); });
}

export function showOptions() {
  var mp = !!(G && G.mp);
  if (state === 'play' && !mp) togglePause(true);   // a two-player match keeps running: this card is one player's business
  optOpen = true; cardPush('opt');
  onA = function () { closeOptions(); };
  onB = function () { optOpen = false; hideCard(); menu(); eva('Battle control terminated', 3000); };   // spoken AFTER menu()'s hush, or it is cancelled unheard
  showCard('\u2699\ufe0f', 'Options', mp ? 'The match keeps running while this card is open.' : 'The match is paused.', mp ? 'Back to the match' : 'Resume', 'Abort to menu', false, false);
  optCard.style.display = 'block';
  buildOptRows();
}

export function closeOptions() {
  optOpen = false; cardPop('opt');
  optCard.style.display = 'none';
  hideCard();
  if (state === 'paused' && !(G && G.mp)) togglePause();   // a two-player pause is shared; the card did not cause it
}

// Two picture panels, built once and then only re-lit: the emblem and the
// line-up are baked canvases, so rebuilding the markup on every click would
// throw them away for nothing.
var facBtns = null;

function buildFacRow() {
  if (!facBtns) {
    facBtns = {};
    facRow.innerHTML = '';
    ['dir', 'col'].forEach(function (k) {
      var b = document.createElement('button');
      b.title = FACTIONS[k].name + ' — ' + FACTIONS[k].blurb;
      var em = facEmblem(k);
      if (em) b.appendChild(em);
      var nm = document.createElement('span');
      nm.className = 'fn'; nm.textContent = FACTIONS[k].name;
      b.appendChild(nm);
      var ln = facLineup(k);
      if (ln) b.appendChild(ln);
      b.addEventListener('click', function () {
        setFaction(k);
        lsSet('vibetop:rts:fac', faction);
        buildFacRow();
      });
      facRow.appendChild(b);
      facBtns[k] = b;
    });
  }
  ['dir', 'col'].forEach(function (k) {
    facBtns[k].className = k + (faction === k ? ' on' : '');
  });
  // As in RA2, the setup screen takes the colour of the side you picked.
  ov.classList.toggle('col', faction === 'col');
}

// ------------------------------------------------------------------- //
//  The skirmish settings strip (RA2's setup options), shut by default.
//  `opts` is the live UI copy; startMatch freezes it into `G.opt`, which is
//  what the sim actually reads, so a running match cannot be re-tuned from
//  under itself.
// ------------------------------------------------------------------- //
export var opts = normOpts(null);

export function loadOpts() {
  var raw = lsGet('vibetop:rts:opts');
  if (raw) { try { opts = normOpts(JSON.parse(raw)); } catch (e) { opts = normOpts(null); } }
  applyHouse(opts.colour, opts.aiColour);
}

function saveOpts() { lsSet('vibetop:rts:opts', JSON.stringify(opts)); }

var setTog = document.getElementById('setTog'), setGrid = document.getElementById('setGrid');

var setSum = document.getElementById('setSum'), setWrap = document.getElementById('setWrap');

var hueRow = document.getElementById('hueRow'), credRow = document.getElementById('credRow');

var unitSl = document.getElementById('unitSl'), unitVal = document.getElementById('unitVal');

var spdSl = document.getElementById('spdSl'), spdVal = document.getElementById('spdVal');

var baseRow = document.getElementById('baseRow'), shortRow = document.getElementById('shortRow');

var crateRow = document.getElementById('crateRow'), swRow = document.getElementById('swRow');

var SPD_NAME = ['', 'Slowest', 'Slow', 'Moderate', 'Fast', 'Faster', 'Fastest'];

// One line that says what is NOT default, so a shut drawer never hides a
// changed rule. All-default reads "Standard rules".
function optSummary() {
  var d = [];
  if (opts.credits !== OPT_DEF.credits) d.push('$' + opts.credits.toLocaleString('en-US'));
  if (opts.units !== OPT_DEF.units) d.push(opts.units + ' unit' + (opts.units === 1 ? '' : 's'));
  if (!opts.bases) d.push('no bases');
  if (!opts.short) d.push('long game');
  if (!opts.crates) d.push('no crates');
  if (!opts.supers) d.push('no superweapons');
  if (opts.speed !== OPT_DEF.speed) d.push(SPD_NAME[opts.speed].toLowerCase());
  return d.length ? d.join(' · ') : 'Standard rules';
}

function onOff(row, get, set) {
  optButtons(row, [[1, 'On'], [0, 'Off']], function (k) { return !!k === !!get(); },
    function (k) { set(!!k); saveOpts(); buildSetRows(); });
}

var hueBtns = null;

function buildHueRow() {
  if (!hueBtns) {
    hueBtns = [];
    hueRow.innerHTML = '';
    HOUSE.forEach(function (h, i) {
      var b = document.createElement('button');
      b.setAttribute('style', '--h:' + h.c);
      b.setAttribute('aria-label', h.name);
      b.addEventListener('click', function () {
        if (i === opts.aiColour) return;                  // the opponent already wears it
        opts.colour = i; opts.aiColour = aiHouse(i);
        saveOpts();
        buildSetRows();                                   // the swatch lights up FIRST...
        if (COL[P_HUMAN] === HOUSE[i].c) return;
        // ...because re-painting every owner-coloured sprite is ~1.6s of
        // synchronous canvas work, and a click that freezes with no
        // acknowledgement reads as a dead button. Two frames of grace let
        // the selection and the notice paint before the bake blocks.
        setSum.textContent = 'Repainting the army\u2026';
        hueRow.className = 'huerow wide busy';
        requestAnimationFrame(function () { requestAnimationFrame(function () {
          applyHouse(opts.colour, opts.aiColour);
          facBtns = null; mapBtns = null;
          hueRow.className = 'huerow wide';
          buildSetRows(); buildFacRow(); buildMapRow();
        }); });
      });
      hueRow.appendChild(b); hueBtns.push(b);
    });
  }
  hueBtns.forEach(function (b, i) {
    b.className = i === opts.colour ? 'on' : (i === opts.aiColour ? 'ai' : '');
    b.title = HOUSE[i].name + (i === opts.aiColour ? ' — the opponent\u2019s colour' : '');
  });
}

function buildSetRows() {
  buildHueRow();
  optButtons(credRow, [[5000, '$5,000'], [10000, '$10,000'], [20000, '$20,000']],
    function (k) { return k === opts.credits; },
    function (k) { opts.credits = k; saveOpts(); buildSetRows(); });
  unitSl.value = opts.units; unitVal.textContent = opts.units;
  spdSl.value = opts.speed; spdVal.textContent = SPD_NAME[opts.speed];
  onOff(baseRow, function () { return opts.bases; }, function (v) { opts.bases = v; });
  onOff(shortRow, function () { return opts.short; }, function (v) { opts.short = v; });
  onOff(crateRow, function () { return opts.crates; }, function (v) { opts.crates = v; });
  onOff(swRow, function () { return opts.supers; }, function (v) { opts.supers = v; });
  setSum.textContent = optSummary();
}

unitSl.addEventListener('input', function () {
  opts.units = Math.max(0, Math.min(10, unitSl.value | 0));
  unitVal.textContent = opts.units; setSum.textContent = optSummary(); saveOpts();
});

spdSl.addEventListener('input', function () {
  opts.speed = Math.max(1, Math.min(6, spdSl.value | 0));
  spdVal.textContent = SPD_NAME[opts.speed]; setSum.textContent = optSummary(); saveOpts();
});

setTog.addEventListener('click', function () {
  var open = setGrid.hidden;
  setGrid.hidden = !open;
  setTog.classList.toggle('open', open);
  setTog.setAttribute('aria-expanded', open ? 'true' : 'false');
});

var diffBtns = null;

function buildDiffRow() {
  if (!diffBtns) {
    diffBtns = {};
    diffRow.innerHTML = '';
    [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']].forEach(function (d) {
      var b = document.createElement('button');
      b.textContent = d[1];
      b.addEventListener('click', function () {
        setDifficulty(d[0]);
        lsSet('vibetop:rts:diff', difficulty);
        buildDiffRow();
      });
      diffRow.appendChild(b);
      diffBtns[d[0]] = b;
    });
  }
  Object.keys(diffBtns).forEach(function (k) { diffBtns[k].className = difficulty === k ? 'on' : ''; });
}

ovA.addEventListener('click', function () { resumeAudio(); if (onA) onA(); });

ovB.addEventListener('click', function () { if (onB) onB(); });

var helpPaused = false;

function openHelp() { hv.classList.add('show'); cardPush('help'); helpPaused = state === 'play' && !(G && G.mp); if (helpPaused) togglePause(true); }

export function closeHelp() { hv.classList.remove('show'); cardPop('help'); if (helpPaused && state === 'paused') togglePause(); helpPaused = false; }

document.getElementById('helpBtn').addEventListener('click', openHelp);

wireOptBtn();

document.getElementById('hvClose').addEventListener('click', closeHelp);

// A click on the dimmed backdrop closes the card too (and never reaches the map).
hv.addEventListener('pointerdown', function (e) { if (e.target === hv) closeHelp(); });

lv.addEventListener('pointerdown', function (e) { if (e.target === lv) lv.classList.remove('show'); });

document.getElementById('lbBtn').addEventListener('click', function () { openBoard(); });

document.getElementById('lvClose').addEventListener('click', function () { lv.classList.remove('show'); });

document.getElementById('lbReset').addEventListener('click', function () {
  var ask = window.vibeConfirm
    ? window.vibeConfirm('Reset all Iron Frontier results?', { danger: true, ok: 'Reset' })
    : Promise.resolve(true);
  ask.then(function (yes) {
    if (!yes) return;
    if (window.vibeScores) window.vibeScores.reset('rts', []);
    openBoard();
  });
});

function openBoard() {
  if (window.vibeScores) window.vibeScores.panel(document.getElementById('lbBody'), 'rts', difficulty);
  lv.classList.add('show'); cardPush('lb');
}

export function closeBoard() { lv.classList.remove('show'); cardPop('lb'); }

// Which cards are up, in the order they were opened — Esc closes the top.
export var cardStack = [];

function cardPush(k) { cardPop(k); cardStack.push(k); }

function cardPop(k) { var i = cardStack.indexOf(k); if (i >= 0) cardStack.splice(i, 1); }

var sndBtn = document.getElementById('sndBtn');

function paintSnd() { sndBtn.innerHTML = soundOn ? SND_ON_SVG : SND_OFF_SVG; }

sndBtn.addEventListener('click', function () {
  setSoundOn(!soundOn);
  lsSet('vibetop:rts:sound', soundOn ? '1' : '0');
  paintSnd();
  if (soundOn) { resumeAudio(); if (musicOn) MUS.start(); }
  else { evaHush(); if (!musicOn) MUS.stop(); }     // Sound off stops the voice mid-line; music has its own switch
});

paintSnd();

var pauseBtn = document.getElementById('pauseBtn');

var pausedEl = document.getElementById('paused');

// EVA is speech synthesis, and speech synthesis outlives whatever queued it:
// nothing ever cancelled it, so a base collapsing kept reading out over the
// score card and on into the front menu, and pausing the match did not pause
// the voice. `evaHush` is the one place that stops it.
function evaHush(pause) {
  try {
    if (typeof speechSynthesis === 'undefined') return;
    if (pause === true) speechSynthesis.pause();
    else if (pause === false) speechSynthesis.resume();
    else speechSynthesis.cancel();
  } catch (e) { /* no TTS, or the browser refuses mid-utterance: not fatal */ }
}

// A two-player pause is for BOTH tabs (RA2 announces who paused a network
// game; it never lets one player stop the other's game behind a lag
// message). The pauser's tab posts it on the lobby channel and the peer
// pauses too, with the overlay naming the other player; either side may
// resume. `remote` marks a pause that arrived over the wire, so it is not
// echoed back.
export function togglePause(force, remote) {
  var mp = !!(G && G.mp && MP.started);
  if (state === 'play' && (force === undefined || force === true)) {
    setState('paused'); pauseBtn.innerHTML = PLAY_SVG;
    pausedEl.classList.add('show');
    pausedText(mp ? (remote ? 'peer' : 'me') : '');
    stallHide();
    evaHush(true);                                   // the voice pauses with the match
    if (mp && !remote) mpPost({ k: 'pause', gid: MP.gid, on: 1 });
    if (mp && remote) say('The other player paused the game', true, 300);
  } else if (state === 'paused' && force !== true) {
    setState('play'); pauseBtn.innerHTML = PAUSE_SVG;
    pausedEl.classList.remove('show');
    evaHush(false);
    if (musicPausedBg) { musicPausedBg = false; if (musicOn) MUS.start(); }
    say(mp && remote ? 'The other player resumed the game' : 'Resumed');
    if (mp && !remote) mpPost({ k: 'pause', gid: MP.gid, on: 0 });
  }
}

function pausedText(by) {
  var b = pausedEl.querySelector('b'), sp = pausedEl.querySelector('span');
  if (by === 'peer') { b.textContent = 'Paused by the other player'; sp.textContent = 'Click anywhere to resume the match for both'; }
  else if (by === 'me') { b.textContent = 'Paused'; sp.textContent = 'The other player is waiting \u2014 click anywhere to resume'; }
  else { b.textContent = 'Paused'; sp.textContent = 'Click anywhere to resume'; }
}

// The lockstep barrier's banner: on while the sim has been unable to step
// for half a second, off the moment it steps. A fading toast three seconds
// late read as "the game is broken" (two-player audit, 2026-09-11).
export var stallEl = document.getElementById('stall'), stallOn = false;

export function stallShow() { if (!stallOn) { stallOn = true; stallEl.classList.add('show'); } }

export function stallHide() { if (stallOn) { stallOn = false; stallEl.classList.remove('show'); } }

pauseBtn.addEventListener('click', function () { resumeAudio(); togglePause(); });

// RA2 pauses a single-player match when it loses the screen. The desktop
// shell says which app is up (vibetop:active); the tab says when it is
// hidden. A click brings it back, as it always did. Two-player never pauses.
var musicPausedBg = false;

function pauseInBackground() {
  if (state === 'play' && G && !G.mp && !headless) {
    togglePause(true); say('Paused — the game went to the background');
    MUS.stop(); musicPausedBg = true;               // a match nobody is looking at does not play its score
  }
}

window.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'vibetop:active' && e.data.active && e.data.active !== 'rts') pauseInBackground();
});

document.addEventListener('visibilitychange', function () { if (document.hidden) pauseInBackground(); });

// Paused is a state you should be able to leave without aiming at anything:
// a click anywhere in the window resumes. The pause button is excluded so
// its own toggle isn't run twice, and the cards keep their own buttons.
export var eatResumeClick = false;           // the press that resumed must not also order

document.addEventListener('pointerdown', function (e) {
  if (state !== 'paused') return;
  var t = e.target;
  if (t && t.closest && (t.closest('#pauseBtn') || t.closest('.overlay'))) return;
  resumeAudio();
  togglePause();
  eatResumeClick = true;
}, true);

document.getElementById('newBtn').addEventListener('click', function () {
  resumeAudio();
  if (state === 'play' || state === 'paused') {
    if (state === 'play') togglePause(true);
    // New goes back to the front menu (side / difficulty / map), never
    // straight into another match; one confirm so a stray click cannot
    // throw away a game.
    optOpen = false; cardPop('opt'); optCard.style.display = 'none';   // this card replaces the Options card
    onA = function () { hideCard(); menu(); eva('Battle control terminated', 3000); };
    onB = function () { hideCard(); if (state === 'paused') togglePause(); };
    showCard('🔄', 'Back to the menu?', 'This abandons the current match.', 'Back to menu', 'Keep playing', false, false);
    return;
  }
  menu();
});

// The front menu offers Load only when there IS something to load — an
// always-present dead button is exactly the clutter the card avoids.
function showLoadCard() {
  optOpen = true;
  onA = function () { optOpen = false; optCard.style.display = 'none'; hideCard(); menu(); };
  onB = null;
  showCard('\ud83d\udcbe', 'Load a saved game', 'Pick a slot.', 'Back', null, false, false);
  optCard.style.display = 'block';
  buildOptRows();
}

export function menu() {
  setState('menu');
  lsSet(RESUME_KEY, '0');                            // nothing to resume from the menu
  // Un-pause the voice BEFORE clearing it: a match left through the paused
  // Options card left speechSynthesis paused for good, and every EVA line
  // of every later match queued silently until some later un-pause let the
  // whole backlog out (audio audit, 2026-09-11).
  evaHush(false);
  evaHush();                                         // nothing from the last match talks over the menu
  MUS.set('menu');
  mpClose();
  onA = function () { if (mpMode === 'one') { hideCard(); startMatch(); } else mpStart(); };
  var hasSave = saveSlots().some(function (m) { return !!m; });
  onB = hasSave ? function () { hideCard(); showLoadCard(); } : null;
  // Nothing explanatory: the sides are pictures and the maps are previews.
  // ovIc/ovT/ovP are hidden by `.card.menu` but still set, so the card has
  // a title for assistive tech and the shared showCard signature is intact.
  showCard('', 'Iron Frontier', '', 'Start Game', hasSave ? 'Load saved game' : null, true, false);
}

// Everything a fresh match resets in the SHELL. No simulation state is
// touched here, which is why the skirmish and the two-player path can share
// it verbatim — and why every "which side is this" in it is ME, the seat,
// not P_HUMAN.
function matchUIReset() {
  setState('play');
  setLastRadar(null); evaHush(false);     // a fresh match: no stale radar-off sting, and the voice un-paused
  MUS.set(G.theatre); MUS.start();      // theme.ini rotates a track per match; here the theatre picks the loop
  pauseBtn.innerHTML = PAUSE_SVG;
  pausedEl.classList.remove('show'); pausedText('');
  stallHide(); setTRK_AT({});
  setSel([]); setGroups({}); setPlacing(null); setSwMode(null);   // pathQ belongs to the net client now (netAttach)
  __setCmdMode(null); refreshCmdbar(); pickCursor();          // a sell mode must not survive New -> menu -> match
  cv.classList.remove('placing');
  setShownCred(0);
  setLastReady(null); setToldRefinery(false); setLastPowerWarn(-1e9);
  sess = window.vibeScores ? window.vibeScores.session() : null;
  centerOn(G.start[ME].x, G.start[ME].y);
  setPanel('b');
  document.querySelectorAll('.ptab div').forEach(function (o, i) { o.classList.toggle('on', i === 0); });
  // The sidebar takes the player's house colour, as RA2's does.
  if (sideEl) sideEl.style.setProperty('--acc', COL[ME]);
  clearEva();
  eva('Battlefield control online', 30000);                     // eva.ini #120
  buildPanel();
}

function startMatch() {
  setLOCKSTEP_DELAY(SP_DELAY);            // a two-player match raises it; never let that leak back
  var seed = (Date.now() ^ (performance.now() * 1000)) >>> 0;
  applyHouse(opts.colour, opts.aiColour);
  setG(newState(seed, difficulty, mapId, opts));
  G.debug = debugMode;
  if (debugMode) setTimeout(function () { say('Debug mode — instant build, unlimited credits, full map; combat is normal and this game is not scored'); }, 400);
  G.side[P_HUMAN].fac = faction;
  G.side[P_AI].fac = faction === 'dir' ? 'col' : 'dir';   // always the other side
  G.ai = newAI(difficulty);
  G.focusFor[P_AI] = G.ai.cfg.focus;

  // Opening position: a yard, two harvesters, a small guard — enough to do
  // something in the first ten seconds instead of watching a build bar.
  [P_HUMAN, P_AI].forEach(function (p) { openingForce(G, p); });

  matchUIReset();
  setTimeout(touchHint, 4000);                 // after the opening tip has had its say
  say('Left-drag to select · Left-click to move or attack · Right-drag to look around · Esc clears the selection', false, 420);
  say(FACTIONS[faction].name + ' vs ' + FACTIONS[G.side[P_AI].fac].name +
      ' — build a Power Plant, then a Refinery. Harvesters mine on their own.', false, 340);
}

// ------------------------------------------------------------------- //
//  Two players, one machine: the lobby.
//
//  The transport is a `BroadcastChannel`, so the "network" is two TABS of
//  the same browser. That is not a toy: a BroadcastChannel message is
//  delivered as its own task in the other context's event loop, so a bundle
//  posted in frame N cannot be read before frame N+1. Every rule the
//  `Transport` seam names is therefore load-bearing here, and a bug in any
//  of them separates the two worlds in seconds.
//
//  The lobby does the FIRST of the server's three jobs and nothing more:
//  agree the match record — seed, map, difficulty, options, factions,
//  colours, player ids and LOCKSTEP_DELAY — before either side steps tick
//  0. Both tabs then build the identical `newState`, run the identical
//  `openingForce`, and `netBind` at their own seat.
//
//  Handshake, deliberately order-insensitive because either tab may open
//  first: the guest coins a `gid` and repeats `hello` until it is answered;
//  the host replies `match` carrying that gid and the record; the guest
//  `ack`s it; the host `go`s exactly one gid and seats itself. The gid is
//  not ceremony — a channel is a BROADCAST, so without it a third tab reads
//  a `match` meant for someone else and sits down at a table for two.
//  Bundles that reach a tab before its transport exists are BUFFERED and
//  replayed: dropping one would hang the barrier forever, and "never drop a
//  bundle" is rule (b).
// ------------------------------------------------------------------- //
var MP_CHAN = 'vibetop-rts-lockstep';

var mpMode = 'one';                       // 'one' | 'host' | 'join'

export var MP = { ch: null, role: null, rec: null, net: null, pre: [], hello: 0, started: false, gid: 0 };

function mpAvail() { return typeof BroadcastChannel === 'function'; }

function mpPost(m) { if (MP.ch) try { MP.ch.postMessage(m); } catch (e) {} }

export function mpClose() {
  if (MP.hello) { clearInterval(MP.hello); MP.hello = 0; }
  // A BroadcastChannel has no disconnect event, so leaving quietly would
  // leave the other tab at a barrier it cannot tell from a slow peer.
  // Every message names the match it belongs to: a gid-less `bye` from a
  // bystander that merely cancelled the lobby told a running match that a
  // player had left (two-player audit, 2026-09-11).
  if (MP.ch && MP.role) mpPost(MP.started ? { k: 'bye', gid: MP.gid } : { k: MP.role === 'host' ? 'hostgone' : 'guestgone', gid: MP.gid });
  if (MP.ch) { try { MP.ch.close(); } catch (e) {} }
  MP.ch = null; MP.role = null; MP.net = null; MP.pre = []; MP.started = false; MP.gid = 0;
}

// A closed or refreshed tab says goodbye on the way out — a BroadcastChannel
// has no disconnect event, so without this the survivor waits at the barrier
// for ever, unable to tell a gone peer from a slow one.
window.addEventListener('pagehide', function () {
  if (!MP.ch || !MP.role) return;
  if (MP.started) mpPost({ k: 'bye', gid: MP.gid });
  else if (MP.role === 'host') mpPost({ k: 'hostgone', gid: MP.gid });
});

// The peer left a running match: the match resolves, as in RA2, instead of
// freezing behind a lag message. The player who stayed wins by default.
function mpOpponentLeft() {
  if (state !== 'play' && state !== 'paused') return;
  if (state === 'paused') { setState('play'); pausedEl.classList.remove('show'); pauseBtn.innerHTML = PAUSE_SVG; evaHush(false); }
  var at = mmss(Math.floor(G.tick / 60));
  say('The other player has left the match.', true, 600);
  finish(true, 'The other player left the match at ' + at + '. The win is yours by default.');
}

// What a player is told about the match record, from their seat.
function mpRecText(rec, seat) {
  var mine = FACTIONS[rec.fac[seat]].name, theirs = FACTIONS[rec.fac[1 - seat]].name;
  return (MAPS[rec.map] ? MAPS[rec.map].name : rec.map) + ' \u00b7 you play ' + mine + ' against ' + theirs + '.';
}

function mpHostCopy() {
  var how = (window.top || window) !== window
    ? 'Open the desktop in a second browser tab (or /rts.html directly), start Iron Frontier there and choose Join.'
    : 'Open this page in another tab and choose Join.';
  return 'Waiting for the second player. ' + (MP.rec ? mpRecText(MP.rec, 0) + ' ' : '') + how;
}

function mpOpen(role) {
  mpClose();
  MP.role = role;
  MP.ch = new BroadcastChannel(MP_CHAN);
  MP.ch.onmessage = function (ev) { mpWire(ev.data); };
}

export function mpWire(m) {
  if (!m) return;
  if (m.k === 'b') {
    // Rule (b): relay without dropping. A bundle can legitimately arrive
    // before this tab has finished building its world — hold it.
    if (MP.net) MP.net.onWire(m); else MP.pre.push(m);
    return;
  }
  // A channel is a BROADCAST, so every message has to say who it is for or a
  // third tab joins a match for two. The guest coins a `gid`; the host echoes
  // it back and seats exactly one of them.
  var BUSY = 'A match is already under way on this browser. This one seats two.';
  if (m.k === 'hello' && MP.role === 'host') {
    // A third tab gets told so, instead of hunting for a host that is busy.
    mpPost(MP.started ? { k: 'busy', gid: m.gid } : { k: 'match', gid: m.gid, rec: MP.rec });
    return;
  }
  if (m.k === 'busy' && MP.role === 'guest' && !MP.started && m.gid === MP.gid) {
    ovP.textContent = BUSY;
    return;
  }
  // A third tab that pressed Host during a match: its gid-less announcement
  // is answered with a gid-less `busy`, which only a waiting host reads.
  if (m.k === 'busy' && MP.role === 'host' && !MP.started && !m.gid) { ovP.textContent = BUSY; return; }
  if (m.k === 'match' && MP.role === 'guest' && !MP.started && m.gid === MP.gid) {
    // The lobby, such as it is: the guest sees the record — battlefield and
    // the two sides — and joins on purpose. The hello beacon stops here;
    // a host that goes away meanwhile says `hostgone` and it restarts.
    if (MP.rec) return;                             // the host repeats `match` for every hello
    MP.rec = m.rec;
    if (MP.hello) { clearInterval(MP.hello); MP.hello = 0; }
    onA = function () {
      mpPost({ k: 'ack', gid: MP.gid });
      ovP.textContent = 'Joining\u2026';
    };
    onB = function () { mpCancel(); };
    showCard('\u{1f5a7}', 'Host found', mpRecText(m.rec, 1) + ' Press Join when you are ready.', 'Join', 'Cancel', false, false);
    return;
  }
  if (m.k === 'ack' && MP.role === 'host' && !MP.started) {
    MP.gid = m.gid;
    mpPost({ k: 'go', gid: m.gid });
    mpGo(0);
    return;
  }
  if (m.k === 'go' && MP.role === 'guest' && !MP.started && m.gid === MP.gid) { mpGo(1); return; }
  if (m.k === 'match' && MP.role === 'host') {
    // Another tab is hosting too. The tab that just clashed is the one that
    // needs telling, so the warning is echoed back to it as `twohosts`;
    // the match under way answers `busy` instead.
    if (MP.started) { mpPost({ k: 'busy' }); return; }
    ovP.textContent = 'Another tab is hosting too. One of you has to choose Join.';
    mpPost({ k: 'twohosts' });
    return;
  }
  if (m.k === 'twohosts' && MP.role === 'host' && !MP.started) {
    ovP.textContent = 'Another tab is hosting too. One of you has to choose Join.';
    return;
  }
  if (m.k === 'hostgone') {
    // The other host gave up: the warning stops being true.
    if (MP.role === 'host' && !MP.started) { ovP.textContent = mpHostCopy(); return; }
    // The host this guest was about to join went away: look again.
    if (MP.role === 'guest' && !MP.started && MP.rec) {
      MP.rec = null;
      mpWaitCard('The host left. Looking for a host\u2026 The other tab has to choose Host and press Start Game.');
      if (!MP.hello) MP.hello = setInterval(function () { mpPost({ k: 'hello', gid: MP.gid }); }, 600);
    }
    return;
  }
  if (m.k === 'pause' && MP.started && m.gid === MP.gid) { togglePause(!!m.on, true); return; }
  if (m.k === 'bye' && MP.started && m.gid === MP.gid) mpOpponentLeft();
}

function mpCancel() {
  mpClose();                              // which says `bye` on the way out
  hideCard();
  menu();
}

function mpWaitCard(msg) {
  onA = null; onB = function () { mpCancel(); };
  showCard('\u{1f5a7}', 'Two-player match', msg, '', 'Cancel', false, false);
}

export function mpStart() {
  if (!mpAvail()) { mpMode = 'one'; startMatch(); return; }
  if (mpMode === 'host') {
    mpOpen('host');
    MP.rec = {
      v: 1,
      seed: (Date.now() ^ (performance.now() * 1000)) >>> 0,
      map: mapId, diff: difficulty, opt: JSON.parse(JSON.stringify(opts)),
      fac: [faction, faction === 'dir' ? 'col' : 'dir'],
      col: [opts.colour, opts.aiColour],
      delay: MP_DELAY, n: 2
    };
    // A gid-less announcement. No guest will act on it (they only read a
    // `match` stamped with their own gid); its one job is to let a SECOND
    // host discover that it is not the only one.
    // The card goes up BEFORE the announcement: a reply (`twohosts`, `busy`)
    // rewrites the card's copy, and must not be overwritten by it.
    mpWaitCard(mpHostCopy());
    mpPost({ k: 'match', rec: MP.rec });
  } else {
    mpOpen('guest');
    MP.gid = (Math.random() * 1e9) >>> 0;
    mpWaitCard('Looking for a host. The other tab has to choose Host and press Start Game.');
    mpPost({ k: 'hello', gid: MP.gid });            // after the card, for the same reason as the host's
    MP.hello = setInterval(function () { mpPost({ k: 'hello', gid: MP.gid }); }, 600);
  }
}

function mpGo(pid) {
  if (MP.started || !MP.rec) return;
  MP.started = true;
  if (MP.hello) { clearInterval(MP.hello); MP.hello = 0; }
  ovA.style.display = '';
  hideCard();
  startNetMatch(MP.rec, pid);
}

// Both tabs run THIS, with the same record and a different seat. Everything
// above `netBind` must be byte-for-byte the same work in the same order on
// both sides; everything below it is the shell, which is per-seat.
function startNetMatch(rec, pid) {
  setLOCKSTEP_DELAY(rec.delay | 0 || SP_DELAY);
  var ropt = normOpts(rec.opt);
  applyHouse(rec.col[0], rec.col[1]);
  setG(newState(rec.seed >>> 0, rec.diff, rec.map, ropt));
  G.debug = false;                              // a cheat is a desync
  G.mp = true;
  G.side[P_HUMAN].fac = rec.fac[0];
  G.side[P_AI].fac = rec.fac[1];
  G.ai = null; G.ai2 = null;                    // two people; nobody is driven
  [P_HUMAN, P_AI].forEach(function (p) { openingForce(G, p); });

  MP.net = new BcNet({ post: mpPost }, rec.n | 0 || 2);
  netBind(MP.net, pid, rec.n | 0 || 2);
  // Rule (b) again: anything that arrived while the world was being built.
  for (var i = 0; i < MP.pre.length; i++) MP.net.onWire(MP.pre[i]);
  MP.pre = [];

  matchUIReset();
  say('Two-player match on ' + (MAPS[rec.map] ? MAPS[rec.map].name : rec.map) + ' \u2014 you are ' + FACTIONS[G.side[ME].fac].name +
      ' against ' + FACTIONS[G.side[FOE].fac].name + '. Both worlds run the same simulation; only orders cross.', false, 420);
}

var mpBtns = null;

function buildMpRow() {
  if (!mpAvail()) { mpWrap.style.display = 'none'; return; }
  if (!mpBtns) {
    mpBtns = {};
    mpRow.innerHTML = '';
    [['one', 'One player', 'You against the computer.'],
     ['host', 'Host', 'Host a two-player match. Open this page in a second tab and choose Join.'],
     ['join', 'Join', 'Join the match hosted by another tab of this browser.']].forEach(function (d) {
      var b = document.createElement('button');
      b.textContent = d[1];
      b.title = d[2];
      b.addEventListener('click', function () { mpMode = d[0]; buildMpRow(); });
      mpRow.appendChild(b);
      mpBtns[d[0]] = b;
    });
  }
  Object.keys(mpBtns).forEach(function (k) { mpBtns[k].className = mpMode === k ? 'on' : ''; });
  diffWrap.style.display = mpMode === 'one' ? 'flex' : 'none';   // no computer opponent to set
  // Join: the host's record decides the sides, the battlefield and every
  // setting, so showing those pickers here was a lie — the guest's choices
  // were saved (over the host's, same localStorage) and then discarded.
  var join = mpMode === 'join';
  facRow.style.display = join ? 'none' : 'grid';
  mapWrap.style.display = join ? 'none' : 'block';
  setWrap.style.display = join ? 'none' : 'block';
  mpNote.style.display = join ? 'flex' : 'none';
  if (ovCard.classList.contains('menu')) ovA.textContent = join ? 'Join match' : 'Start Game';
  mpWrap.style.display = 'flex';
}

export function mmss(v) { return Math.floor(v / 60) + ':' + ('0' + (v % 60)).slice(-2); }

// ------------------------------------------------------------------- //
//  RA2's score screen.
//
//  The three percentages are APPROXIMATIONS of RA2's, not the shipped
//  formula — Westwood's exact weights are not in any .ini we can read, so
//  these are reconstructed from what the columns plainly measure:
//    Leadership  what you killed against what you lost (units + structures)
//    Economy     ore actually banked against a healthy two-refinery rate
//                (~1400 credits a minute), capped at 100
//    Technology  how far up your own faction's tree you climbed, as the
//                fraction of it that was unlocked when the match ended
//  Everything to the left of them is a raw count and is exact.
// ------------------------------------------------------------------- //
function techTotal(g, p) {
  var s = g.side[p], n = 0, k, d;
  for (k in BLDS) { d = BLDS[k]; if (!d.neut && !d.wall && !d.gate && ownedBy(d, s.fac)) n++; }
  for (k in UNITS) { d = UNITS[k]; if (ownedBy(d, s.fac)) n++; }
  return n || 1;
}

export function scoreOf(g, p) {
  var s = g.side[p], mins = Math.max(1, g.tick / 3600);
  var kills = s.killed + s.bkilled, losses = s.lost + s.blost;
  return {
    bmade: s.bmade, blost: s.blost, made: s.made, lost: s.lost, killed: s.killed,
    bkilled: s.bkilled, harv: Math.round(s.harv),
    lead: Math.round(100 * kills / Math.max(1, kills + losses)),
    // Relative to the better harvester of the two: a flat per-minute rate read
    // 100% for both sides after a 14k-vs-33k match (playtest pass 3).
    econ: Math.round(100 * s.harv / Math.max(1, g.side[0].harv, g.side[1].harv)),
    tech: Math.round(100 * techCount(g, p) / techTotal(g, p))
  };
}

var SCORE_ROWS = [
  ['Structures built', 'bmade'], ['Structures lost', 'blost'], ['Structures destroyed', 'bkilled'],
  ['Units built', 'made'], ['Units lost', 'lost'], ['Units destroyed', 'killed'],
  ['Ore harvested', 'harv', true]
];

function buildScoreCard(won) {
  var a = scoreOf(G, ME), b = scoreOf(G, FOE), h = '';
  var nm = [FACTIONS[G.side[ME].fac].name, FACTIONS[G.side[FOE].fac].name];
  if (G.mp) nm = ['You \u2014 ' + nm[0], 'Opponent \u2014 ' + nm[1]];   // RA2 heads the columns by player
  h += '<thead><tr><th class="rl">' + mmss(Math.floor(G.tick / 60)) + '</th>';
  h += '<th style="--h:' + COL[ME] + '"><span><i></i>' + nm[0] + '</span></th>';
  h += '<th style="--h:' + COL[FOE] + '"><span><i></i>' + nm[1] + '</span></th></tr></thead><tbody>';
  SCORE_ROWS.forEach(function (r) {
    var va = a[r[1]], vb = b[r[1]];
    var f = function (v) { return r[2] ? '$' + v.toLocaleString('en-US') : String(v); };
    h += '<tr><th class="rl">' + r[0] + '</th>' +
         '<td class="' + (va > vb ? 'win' : '') + '">' + f(va) + '</td>' +
         '<td class="' + (vb > va ? 'win' : '') + '">' + f(vb) + '</td></tr>';
  });
  [['Leadership', 'lead'], ['Economy', 'econ'], ['Technology', 'tech']].forEach(function (r, i) {
    h += '<tr class="pct' + (i === 0 ? ' rule' : '') + '"><th class="rl">' + r[0] + '</th>' +
         '<td class="' + (a[r[1]] > b[r[1]] ? 'win' : '') + '">' + a[r[1]] + '%</td>' +
         '<td class="' + (b[r[1]] > a[r[1]] ? 'win' : '') + '">' + b[r[1]] + '%</td></tr>';
  });
  h += '</tbody>';
  scoreCard.innerHTML = h;
  scoreCard.hidden = false;
}

export function finish(won, why) {
  setState('over');
  stallHide();
  lsSet(RESUME_KEY, '0');                            // a finished match is not resumed
  evaHush();                                         // the score card is not read over
  MUS.stop();                                        // nor is it scored
  var secs = Math.floor(G.tick / 60);
  if (window.vibeScores && !G.debug && !G.mp) {       // a cheated game is not a record, nor is a two-player one
    window.vibeScores.finish('rts', difficulty, won, {});
    if (won) {
      window.vibeScores.record({
        game: 'rts', board: difficulty, value: secs, lower: true, session: sess
      });
    }
    window.vibeScores.render(scoresEl, {
      game: 'rts', board: difficulty, lower: true,
      // render() formats with the fmt IT is handed (only panel() reads the
      // shared SPEC table), so a raw second count would show as "384".
      fmt: mmss,
      title: 'Fastest wins — ' + difficulty,
      empty: 'No win on ' + difficulty + ' yet.',
      highlight: { s: sess }
    });
  }
  var mm = mmss(secs);
  onA = function () { hideCard(); menu(); };
  onB = null;
  showCard(won ? '🏆' : '💥',
    won ? 'Victory' : 'Defeated',
    why || (won ? 'Enemy base levelled in ' + mm + '.' : 'Your base is gone at ' + mm + '.'),
    'Menu', null, false, true);
  buildScoreCard(won);
  eva(won ? 'You are victorious' : 'You have lost', 30000);       // eva.ini #22 / #23
  sfx(won ? 'ready' : 'boom');
}

// --- generated ---
// ESM import bindings are read-only, so a write from another module goes
// through the owner. Reads stay verbatim everywhere: the binding is live.
export function setEatResumeClick(v) { eatResumeClick = v; }
export function setLineupCache(v) { lineupCache = v; }
export function setMpMode(v) { mpMode = v; }
export function setOpts(v) { opts = v; }
export function setThumbDots(v) { thumbDots = v; }

// Iron Frontier — ui/hud.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.

import { COL } from '../bake/buildings.js';
import { mkCanvas } from '../bake/terrain.js';
import { BLDS } from '../blds.js';
import { isDisguised } from '../combat.js';
import { powered } from '../entities.js';
import { FACTIONS, facOf } from '../factions.js';
import { cmd } from '../net.js';
import { countUnit, hasBld } from '../production.js';
import { UNITS, ifvSpec } from '../roster.js';
import { G, inMap, state } from '../state.js';
import { SW, SW_KEYS } from '../supers.js';
import { paxCount } from '../transport.js';
import { ME } from '../world.js';
import { eva, setEvaAt, setEvaLog, sfx } from './audio.js';
import { pickCursor } from './cursors.js';
import { IS_TOUCH, cv, cvH, cvW } from './dom.js';
import { setWallDrag } from './input.js';
import { cameoFor } from './panel.js';
import { placing, screenToGrid, setPlacing } from './screen.js';

// --------------------------------------------------------------------- //
//  HUD
// --------------------------------------------------------------------- //
var vCred = document.getElementById('vCred');

var vArmy = document.getElementById('vArmy'), vTime = document.getElementById('vTime');

var stCred = document.getElementById('sbcred');

var tipEl = document.getElementById('tip');

export var sideEl = document.getElementById('side');

var pwrCv = document.getElementById('pwr'), pctx = pwrCv ? pwrCv.getContext('2d') : null;

var shownCred = 0;

export function creditPop(n) {
  var el = document.createElement('span');
  el.className = 'plus'; el.textContent = '+' + n;
  stCred.appendChild(el);
  setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 640);
}

// ---- the vertical power meter -----------------------------------------
// RA2 runs a meter down the left of the sidebar: the trough is total
// output, a bar fills it, and a needle marks the drain. Green while there
// is headroom, yellow as the drain closes on the output, red once it is
// over — the same three states the structures themselves show.
function drawPower() {
  if (!pctx || !G) return;
  var h = pwrCv.clientHeight | 0, w = 12;
  if (h < 8) return;
  if (pwrCv.width !== w * 2 || pwrCv.height !== h * 2) { pwrCv.width = w * 2; pwrCv.height = h * 2; }
  var g = pctx;
  g.setTransform(2, 0, 0, 2, 0, 0);
  g.clearRect(0, 0, w, h);
  var s = G.side[ME], made = s.powerMade, use = s.powerUse;
  var top = 3, bot = h - 3, span = bot - top;

  // The housing: a machined channel, so an empty gauge still reads as a
  // gauge rather than a gap in the panel.
  var hz = g.createLinearGradient(0, 0, w, 0);
  hz.addColorStop(0, '#3b4552'); hz.addColorStop(0.35, '#6f7d8f'); hz.addColorStop(0.7, '#39424f'); hz.addColorStop(1, '#242b35');
  g.fillStyle = hz; g.fillRect(0, 0, w, h);
  g.fillStyle = '#05070b'; g.fillRect(2, top, w - 4, span);
  g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 1; g.strokeRect(2.5, top + 0.5, w - 5, span - 1);

  // Scale: whichever of output and drain is larger, rounded up to a whole
  // 100 so the graduations stay meaningful as the base grows.
  var full = Math.max(100, Math.ceil(Math.max(made, use) / 100) * 100);
  var ratio = made > 0 ? use / made : (use > 0 ? 2 : 0);
  var over = use > made, warn = !over && ratio > 0.75;
  var col = over ? '#e5646c' : warn ? '#e8b428' : '#5ad07a';
  var hi  = over ? '#ffb0b5' : warn ? '#ffe09a' : '#b6f0c6';

  // The BAR is the drain — it climbs toward the needle, and RA2's colour
  // change is exactly "how close is the climb to the mark".
  var bh = Math.round(span * Math.min(1, use / full));
  if (bh > 0) {
    var bg = g.createLinearGradient(2, 0, w - 2, 0);
    bg.addColorStop(0, col); bg.addColorStop(0.4, hi); bg.addColorStop(1, col);
    g.fillStyle = bg; g.fillRect(3, bot - bh, w - 6, bh);
  }
  // Graduations every 100 power, over the whole channel.
  g.fillStyle = 'rgba(255,255,255,.13)';
  for (var v = 100; v < full; v += 100) {
    g.fillRect(3, Math.round(bot - span * (v / full)), w - 6, 1);
  }
  // The NEEDLE is the output you have to stay under.
  var ny = Math.round(bot - span * Math.min(1, made / full));
  g.fillStyle = 'rgba(0,0,0,.85)'; g.fillRect(2, ny - 1, w - 4, 3);
  g.fillStyle = over ? '#ff5a63' : '#eef3fa'; g.fillRect(2, ny, w - 4, 1);
  g.beginPath();
  g.moveTo(w - 2, ny + 0.5); g.lineTo(w - 6, ny - 2.5); g.lineTo(w - 6, ny + 3.5);
  g.closePath(); g.fill();
  if (over && (G.tick >> 4) % 2 === 0) {          // low power blinks, as RA2's does
    g.fillStyle = 'rgba(229,100,108,.3)'; g.fillRect(2, top, w - 4, span);
  }
}

// Hover card for whatever is under the pointer. RA2 answers "what is that?"
// with a name on hover; without it the enemy base is a guessing game.
var hovEl = document.getElementById('hov');

var hovName = document.getElementById('hovName'), hovSub = document.getElementById('hovSub');

export function updateHover(e, nx, ny) {
  if (!e || state !== 'play' || placing || swMode) { hovEl.hidden = true; return; }
  var d = e.kind === 'b' ? BLDS[e.type] : UNITS[e.type];
  var mine = e.p === ME;
  var who = mine ? 'Yours' : (e.p < 0 || !G.side[e.p]) ? 'Neutral' : 'Enemy (' + FACTIONS[facOf(G, e.p)].name + ')';
  hovName.textContent = d.em + ' ' + d.name +
    (mine && isDisguised(G, e) ? ' (disguised)' : '');
  var vet = e.kind === 'u' ? (e.rank === 2 ? ' · Elite' : (e.rank === 1 ? ' · Veteran' : '')) + (e.kills ? ' · ' + e.kills + ' kill' + (e.kills === 1 ? '' : 's') : '') : '';
  var ammoTxt = e.kind === 'u' && d.ammo ? ' · ' + e.ammo + '/' + d.ammo + ' missiles' + (e.landed ? ' (on pad)' : '') : '';
  // [FV]/[HTK]/[SHAD]/[SAPC] PipScale=Passengers, and [FV] HasTurretTooltips:
  // a transport says how full it is, and an IFV says what its load turns its
  // gun into — the pip strip alone does not tell you WHO is in there.
  var paxTxt = '';
  if (e.kind === 'u' && d.pax) {
    paxTxt = ' · ' + paxCount(e) + '/' + d.pax + ' aboard';
    if (paxCount(e)) paxTxt += ' (' + UNITS[e.pax[0].type].name +
                               (paxCount(e) > 1 ? ' +' + (paxCount(e) - 1) : '') + ')';
    if (d.ifv) paxTxt += ' · ' + ifvSpec(e).n;
    if (d.air && e.landed) paxTxt += ' · landed';
  }
  hovSub.textContent = who + ' · ' + d.desc + ' · ' + Math.ceil(e.hp) + '/' + d.hp + ' hp' + ammoTxt + paxTxt + vet;
  hovEl.className = mine ? '' : 'enemy';
  hovEl.hidden = false;
  // Sit to the lower-right of the cursor, flipping to stay on the canvas.
  var w = hovEl.offsetWidth, h = hovEl.offsetHeight;
  var x = nx + 14, y = ny + 16;
  if (x + w > cvW - 4) x = nx - w - 10;
  if (y + h > cvH - 4) y = ny - h - 8;
  hovEl.style.left = x + 'px'; hovEl.style.top = y + 'px';
}

export function touchHint() {
  if (IS_TOUCH) say('Touch: tap to select, two-finger tap = right-click, drag to pan, pinch to zoom', false, 600);
}

// ---- EVA / game text ---------------------------------------------------
// RA2 prints its messages top-left inside the tactical view and lets them
// fade; a bottom-centre toast that replaces itself loses the line you were
// half-way through reading. Newest sits at the bottom of the stack.
var evLines = [], EV_MAX = 3;

export function say(msg, warn, hold) {
  if (!tipEl) return;
  if (IS_TOUCH && typeof msg === 'string') msg = msg.replace(/Esc cancels/g, 'Two-finger tap cancels');
  var life = hold || 150;
  var last = evLines[evLines.length - 1];
  if (last && last.msg === msg) { last.t = life; last.el.style.opacity = '1'; return; }
  var el = document.createElement('div');
  el.className = warn ? 'ev warn' : 'ev';
  el.textContent = msg;
  tipEl.appendChild(el);
  evLines.push({ el: el, t: life, msg: msg });
  while (evLines.length > EV_MAX) {
    var d = evLines.shift();
    if (d.el.parentNode) d.el.parentNode.removeChild(d.el);
  }
}

// One tick of the message stack, driven by the same frame counter the rest
// of the HUD uses so a paused game does not silently drain the log.
export function stepEva() {
  for (var i = evLines.length - 1; i >= 0; i--) {
    var e = evLines[i];
    if (--e.t <= 0) {
      if (e.el.parentNode) e.el.parentNode.removeChild(e.el);
      evLines.splice(i, 1);
    } else if (e.t < 34) e.el.style.opacity = (e.t / 34).toFixed(2);
  }
}

export function clearEva() {
  setEvaAt({}); setEvaLog([]);
  for (var i = 0; i < evLines.length; i++) if (evLines[i].el.parentNode) evLines[i].el.parentNode.removeChild(evLines[i].el);
  evLines = [];
}

// ---- Superweapon clocks + targeting -----------------------------------
// RA2 shows one charging clock per superweapon you own in the corner of the
// map; clicking a charged one puts the cursor into targeting mode. The AI's
// clocks are never drawn — you learn about its nuke from EVA, as in RA2.
export var swBar = document.getElementById('swbar'), swEls = {}, swMode = null;

// A paratrooper under a canopy, drawn at the cameo's own size: full canopy
// arc with gores and a lit crown, eight shroud lines converging on a
// harness, and a small man in the owner's colour with his legs together.
var paraIcon = null;

function bakeParaIcon() {
  if (!paraIcon) {
    var W = 60, H = 48, c = mkCanvas(W, H), g = c.g;
    g.fillStyle = '#0d1016'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#1a2130'; g.fillRect(1, 1, W - 2, H - 2);
    var cxp = W / 2, cyp = 17, rr = 15;
    g.beginPath(); g.moveTo(cxp - rr, cyp); g.arc(cxp, cyp, rr, Math.PI, 0); g.closePath();
    g.fillStyle = '#c9d6e4'; g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)';                       // lit crown
    g.beginPath(); g.moveTo(cxp - rr * 0.55, cyp); g.arc(cxp, cyp, rr * 0.55, Math.PI, 0); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(40,52,70,.55)'; g.lineWidth = 1;       // gores
    for (var gi = 1; gi < 4; gi++) {
      var ga = Math.PI + gi * (Math.PI / 4);
      g.beginPath(); g.moveTo(cxp, cyp); g.lineTo(cxp + Math.cos(ga) * rr, cyp + Math.sin(ga) * rr); g.stroke();
    }
    g.beginPath(); g.moveTo(cxp - rr, cyp); g.arc(cxp, cyp, rr, Math.PI, 0); g.closePath();
    g.strokeStyle = 'rgba(30,40,56,.8)'; g.lineWidth = 1.2; g.stroke();
    g.strokeStyle = 'rgba(210,222,236,.9)'; g.lineWidth = 0.8;   // shrouds
    for (var si = 0; si <= 6; si++) {
      var sx0 = cxp - rr + si * (rr * 2 / 6);
      g.beginPath(); g.moveTo(sx0, cyp + 1); g.lineTo(cxp, cyp + 17); g.stroke();
    }
    var mc = COL[ME] || '#4aa3db';
    g.fillStyle = mc;                                            // trooper
    g.beginPath(); g.ellipse(cxp, cyp + 22, 3.2, 4.4, 0, 0, 6.29); g.fill();
    g.fillStyle = '#e2c6a0';
    g.beginPath(); g.arc(cxp, cyp + 17.5, 2.4, 0, 6.29); g.fill();
    g.fillStyle = '#2e3a4c';
    g.beginPath(); g.arc(cxp, cyp + 17, 2.6, Math.PI, 0); g.closePath(); g.fill();
    g.strokeStyle = '#2e3a4c'; g.lineWidth = 1.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cxp - 1.4, cyp + 26); g.lineTo(cxp - 2.2, cyp + 30);
    g.moveTo(cxp + 1.4, cyp + 26); g.lineTo(cxp + 2.2, cyp + 30); g.stroke();
    g.strokeStyle = '#3a4456'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, W - 1, H - 1);
    paraIcon = c.c;
  }
  var out = document.createElement('canvas');
  out.width = paraIcon.width; out.height = paraIcon.height;
  out.style.width = '60px'; out.style.height = '48px';
  out.getContext('2d').drawImage(paraIcon, 0, 0);
  return out;
}

function mkSwIcon(k) {
  var el = document.createElement('div');
  el.className = 'swic'; el.title = SW[k].name;
  var arc = document.createElement('div'); arc.className = 'arc';
  var em = document.createElement('span'); em.className = 'em';
  // RA2 stacks the superweapon's own cameo, not a glyph. The paradrop has
  // no structure of its own to crop (it comes off a captured Airport), and
  // its emoji (U+1FA82) is missing from most font sets — it rendered as a
  // tofu box. Draw the canopy instead.
  var cam = k === 'para' ? bakeParaIcon() : (G ? cameoFor(SW[k].bld, true, G.side[ME].fac, null, true) : null);
  if (cam) em.appendChild(cam); else em.textContent = SW[k].em;
  var cd = document.createElement('span'); cd.className = 'cd';
  el.appendChild(arc); el.appendChild(em); el.appendChild(cd);
  el._arc = arc; el._cd = cd;
  el.addEventListener('click', function () { swArm(k); });
  if (swBar) swBar.appendChild(el);
  return el;
}

export function refreshSW() {
  if (!swBar) return;
  for (var i = 0; i < SW_KEYS.length; i++) {
    var k = SW_KEYS[i];
    var have = !!(G && state !== 'menu' && hasBld(G, ME, SW[k].bld));
    var el = swEls[k];
    if (!have) { if (el) el.style.display = 'none'; continue; }
    if (!el) el = swEls[k] = mkSwIcon(k);
    el.style.display = 'block';
    var st = G.side[ME].sw[k], frac = st.ready ? 1 : st.t / SW[k].charge;
    var left = Math.max(0, Math.ceil((SW[k].charge - st.t) / 60));
    var hold = !st.ready && !powered(G, ME);
    el._cd.textContent = st.ready ? 'READY' : hold ? 'LOW POWER' : (Math.floor(left / 60) + ':' + ('0' + (left % 60)).slice(-2));
    el.title = SW[k].name + (hold ? ' — charging halted: low power (' + Math.floor(left / 60) + ':' + ('0' + (left % 60)).slice(-2) + ' left)' : '');
    el._arc.style.background = 'conic-gradient(from 0deg, rgba(110,231,168,.32) ' +
                               (frac * 360).toFixed(0) + 'deg, rgba(0,0,0,0) 0)';
    el.className = 'swic' + (st.ready ? ' rdy' : '') + (hold ? ' hold' : '') + (swMode && swMode.key === k ? ' arm' : '');
  }
}

function swArm(key) {
  if (!G || state !== 'play') return;
  var st = G.side[ME].sw[key];
  if (!st || !st.ready) { say(SW[key].name + ' is still charging', true); sfx('no'); return; }
  if (placing) { setPlacing(null); setWallDrag(null); cv.classList.remove('placing'); }
  swMode = { key: key, stage: 0, x: 0, y: 0 };
  eva('Select target', 4000);                                   // eva.ini #65
  pickCursor();
  say(SW[key].hint, false, 500);
  sfx('click'); refreshSW();
}

export function swCancel(quiet) {
  if (!swMode) return false;
  swMode = null; pickCursor();
  if (!quiet) say('Targeting cancelled');
  refreshSW();
  return true;
}

export function swClickMap(px, py) {
  var t = screenToGrid(px, py), gx = Math.round(t.x), gy = Math.round(t.y);
  var W = SW[swMode.key];
  if (!inMap(gx, gy)) { say('Off the map', true); return; }
  if (W.two && swMode.stage === 0) {
    swMode.stage = 1; swMode.x = gx; swMode.y = gy;
    say(W.hint2, false, 500); sfx('click');
    return;
  }
  if (W.two) cmd('sw', { k: swMode.key, x: swMode.x, y: swMode.y, x2: gx, y2: gy });
  else cmd('sw', { k: swMode.key, x: gx, y: gy });
  swMode = null; pickCursor(); refreshSW();
}

// RA2's credit counter is a mechanical ticker: it walks toward the real
// total one step per frame, clicking as it goes, so income reads as a flow.
// The step scales with the gap so a $2000 sale is not a minute of counting,
// but it is never a jump.
var lastCash = 0;

export function tickCredits() {
  if (!G) return;
  var real = G.side[ME].credits;
  if (shownCred !== real) {
    var gap = real - shownCred;
    var step = Math.max(1, Math.ceil(Math.abs(gap) / 22));
    shownCred += gap > 0 ? Math.min(step, gap) : Math.max(-step, gap);
    var cnow = performance.now();
    if (cnow - lastCash > 150) { sfx('cash'); lastCash = cnow; }   // one chirp per 150 ms, not one per frame (19 in 2 s at a match start)
    vCred.textContent = Math.round(shownCred);
  }
}

export function updateHUD() {
  if (!G) return;
  refreshSW();
  var s = G.side[ME];
  stCred.className = s.credits < 150 ? 'low' : '';   // tickCredits runs per frame, in the loop
  drawPower();
  var n = countUnit(G, ME, null);
  vArmy.textContent = n + (n === 1 ? ' UNIT' : ' UNITS');
  var secs = Math.floor(G.tick / 60);
  vTime.textContent = Math.floor(secs / 60) + ':' + ('0' + (secs % 60)).slice(-2);
}

// --- generated ---
// ESM import bindings are read-only, so a write from another module goes
// through the owner. Reads stay verbatim everywhere: the binding is live.
export function setShownCred(v) { shownCred = v; }
export function setSwMode(v) { swMode = v; }

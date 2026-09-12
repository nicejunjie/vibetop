// Iron Frontier — ui/save.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.















// ------------------------------------------------------------------- //
//  Save / load.
//
//  `G` is plain data — no DOM, no closures — but it is not JSON: it holds
//  eight typed arrays and a graph of entities that reference each other
//  (u.target, b.occ[], ai.army[], pathQ[].u, g.byId). So the format is
//  JSON with two escapes, and nothing else:
//
//    {$t:"<ctor>", b:"<base64>"}   a typed array, byte for byte
//    {$r:<id>}                     "the entity with this id"
//
//  Entities are emitted once each, inside g.units / g.blds; every other
//  sighting of one is an $r marker resolved against a rebuilt byId on the
//  way in. The seeded RNG's whole state is one integer (_seed) and the
//  pathfinder's backlog is pathQ, so both ride along and a loaded match
//  replays tick for tick with the one it was saved from — which is what
//  rts.test.js asserts by stepping both 1000 ticks and comparing hashes.
// ------------------------------------------------------------------- //
var SAVE_SLOTS = 3, SAVE_VER = 1;

var TA = { Uint8Array: Uint8Array, Int8Array: Int8Array, Int16Array: Int16Array,
           Int32Array: Int32Array, Float32Array: Float32Array };

function b64enc(ta) {
  var u = new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength), out = '', i, CH = 0x8000;
  for (i = 0; i < u.length; i += CH) out += String.fromCharCode.apply(null, u.subarray(i, i + CH));
  return btoa(out);
}

function b64dec(name, str) {
  var bin = atob(str), u = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new TA[name](u.buffer, 0, u.byteLength / TA[name].BYTES_PER_ELEMENT);
}

function isEnt(v) { return !!(v && (v.kind === 'u' || v.kind === 'b') && typeof v.id === 'number'); }

// `skip` names own keys of THIS object to leave out — used once, at the
// top, to stop g.units/g.blds serialising as arrays of $r markers pointing
// at themselves. serialiseGame writes them back as full entities.
function ser(v, skip) {
  if (v === null || v === undefined) return null;
  var t = typeof v;
  if (t === 'number') return isFinite(v) ? v : 0;
  if (t !== 'object') return t === 'function' ? null : v;
  if (ArrayBuffer.isView(v)) return { $t: v.constructor.name, b: b64enc(v) };
  if (Array.isArray(v)) { var a = [], i; for (i = 0; i < v.length; i++) a.push(ser(v[i])); return a; }
  if (isEnt(v)) return { $r: v.id };
  var o = {}, k;
  for (k in v) if (Object.prototype.hasOwnProperty.call(v, k)) {
    if (k === 'byId' || (skip && skip[k])) continue;
    var sv = ser(v[k]);
    if (sv !== null || v[k] === null) o[k] = sv;
  }
  return o;
}

function deser(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) { var a = [], i; for (i = 0; i < v.length; i++) a.push(deser(v[i])); return a; }
  if (v.$t && TA[v.$t]) return b64dec(v.$t, v.b);
  var o = {}, k;
  for (k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = deser(v[k]);
  return o;
}

// Second pass: swap every {$r:id} for the live entity. Walks in place so a
// deep field (ai.army[3], pathQ[0].u, b.occ[1]) is resolved wherever it is.
function resolveRefs(v, byId, seen) {
  if (!v || typeof v !== 'object' || ArrayBuffer.isView(v)) return;
  if (seen.indexOf(v) >= 0) return;
  seen.push(v);
  var k, c;
  if (Array.isArray(v)) {
    for (k = 0; k < v.length; k++) {
      c = v[k];
      if (c && typeof c === 'object' && c.$r !== undefined) v[k] = byId[c.$r] || null;
      else resolveRefs(c, byId, seen);
    }
    return;
  }
  for (k in v) if (Object.prototype.hasOwnProperty.call(v, k)) {
    c = v[k];
    if (c && typeof c === 'object' && c.$r !== undefined) v[k] = byId[c.$r] || null;
    else resolveRefs(c, byId, seen);
  }
}

function serialiseGame(g) {
  return {
    v: SAVE_VER, at: Date.now(), tick: g.tick, seed: _seed,
    map: g.mapId, mapName: (MAPS[g.mapId] || MAPS.frontier).name,
    fac: g.side[ME].fac, diff: g.diff, opt: g.opt,
    g: serWorld(g), pq: pathQ.map(function (r) { return { u: { $r: r.u.id }, tx: r.tx, ty: r.ty }; }),
    // Session state RA2 keeps in its saves too: the control groups (as ids)
    // and the four camera bookmarks. Both were lost on every load/resume.
    groups: serGroups(), views: JSON.parse(JSON.stringify(views || {}))
  };
}

function serGroups() {
  var o = {}, k;
  for (k in groups) if (groups[k] && groups[k].length) o[k] = groups[k].filter(function (u) { return !u.dead; }).map(function (u) { return u.id; });
  return o;
}

var loadedSession = null;                // {groups, views} from the blob, applied by enterLoaded

function restoreSession() {
  if (!loadedSession || !G) return;
  var k, out = {};
  for (k in loadedSession.groups) {
    var us = loadedSession.groups[k].map(function (id) { return G.byId[id]; }).filter(function (u) { return u && !u.dead; });
    if (us.length) out[k] = us;
  }
  setGroups(out); setViews(loadedSession.views || {});
  loadedSession = null;
}

// The one place entities are written out in full; everywhere else in the
// blob they are {$r:id}.
// `sel` is the SESSION's selection flag, not world state: saved, it came
// back true on a restored entity while the session's `sel` list was empty,
// so clicking anything that was selected at save time did nothing (the
// `if (!e.sel)` guard) and clearSel never reached it. A resumed match read
// as "every control is dead" (2026-09-11).
var ENT_SKIP = { sel: 1 };

function serEnt(e) {
  var o = {}, k;
  for (k in e) if (Object.prototype.hasOwnProperty.call(e, k)) {
    if (ENT_SKIP[k]) continue;
    var sv = ser(e[k]);
    if (sv !== null || e[k] === null) o[k] = sv;
  }
  return o;
}

function serWorld(g) {
  var o = ser(g, { units: 1, blds: 1 });
  o.units = g.units.map(serEnt);
  o.blds = g.blds.map(serEnt);
  return o;
}

function restoreGame(blob) {
  var g = deser(blob.g), i;
  g.byId = {};
  // Older saves carry the session flag (see ENT_SKIP): a restored entity is
  // never selected, whatever the blob says.
  for (i = 0; i < g.units.length; i++) { g.units[i].sel = false; g.byId[g.units[i].id] = g.units[i]; }
  for (i = 0; i < g.blds.length; i++) { g.blds[i].sel = false; g.byId[g.blds[i].id] = g.blds[i]; }
  var pq = deser(blob.pq || []);
  resolveRefs(g, g.byId, []);
  resolveRefs(pq, g.byId, []);
  srand(blob.seed >>> 0);
  // A restored game is a NEW game as far as the lockstep layer is
  // concerned: fresh client, empty schedule, fresh derived caches. (The
  // couple of ticks of commands still in flight when the save was taken are
  // dropped — 33 ms of orders, and a save is not a network checkpoint.)
  netAttach(g);
  for (i = 0; i < pq.length; i++) if (pq[i].u && !pq[i].u.dead) pathQ.push(pq[i]);
  setHashAt(HASH_UNSET);                    // the spatial index is derived; rebuilt on the next tick
  return g;
}

function saveKey(n) { return 'vibetop:rts:save:' + n; }

function saveSlots() {
  var out = [];
  for (var n = 1; n <= SAVE_SLOTS; n++) {
    var raw = lsGet(saveKey(n)), meta = null;
    if (raw) { try { var b = JSON.parse(raw); meta = { at: b.at, map: b.mapName, tick: b.tick, fac: b.fac, diff: b.diff }; } catch (e) { meta = null; } }
    out.push(meta);
  }
  return out;
}

function saveGame(n) {
  if (!G) return false;
  try { lsSet(saveKey(n), JSON.stringify(serialiseGame(G))); } catch (e) { return false; }
  return !!lsGet(saveKey(n));
}

function loadGame(n) {
  var raw = lsGet(saveKey(n));
  if (!raw) return false;
  var blob;
  try { blob = JSON.parse(raw); } catch (e) { return false; }
  if (blob.v !== SAVE_VER) return false;
  var g;
  try { g = restoreGame(blob); } catch (e) { return false; }
  setG(g);
  loadedSession = { groups: blob.groups || {}, views: blob.views || {} };
  setDifficulty(g.diff); setFaction(g.side[ME].fac); setMapId(g.mapId);
  setOpts(normOpts(g.opt));
  applyHouse(opts.colour, opts.aiColour);
  return true;
}

// Autosave to the 'auto' key (outside the numbered slots), flag a resume,
// and reload. Boot reads the flag, loads the autosave and enters the match
// without touching the menu.
var RESUME_KEY = 'vibetop:rts:resume';

function reloadKeepMatch() {
  if (!G || (state !== 'play' && state !== 'paused')) { location.reload(); return; }
  if (!saveGame('auto')) { say('Could not save — storage is full', true); return; }
  lsSet(RESUME_KEY, 'keep');                         // asked for: resumes whatever the navigation says
  location.reload();
}

// ANY reload keeps the match, not only the Options card's own Reload: the
// desktop's deploy push reloads the whole page, and so does a plain browser
// refresh, and both used to land on the front menu with the match gone.
// The flag records whether the LAST unload happened mid-match. Boot clears
// it as it reads it, and leaving the match (menu, game over) clears it too,
// because the hidden-tab save below can set it long before the unload: a
// tab that was backgrounded mid-match and later finished the game must not
// resume that finished match on its next refresh. A two-player match is
// never autosaved — half of a lockstep pair cannot resume alone.
// A page or app the user CLOSED starts fresh next time; only an involuntary
// reload (a deploy push, a browser refresh) resumes. The unload handler
// cannot tell the two apart, so the decision is made at BOOT (resumeWanted)
// from the navigation type — and the desktop shell, whose iframes always
// report "navigate", calls __vibetopClosing synchronously as it closes the
// app (a posted message would die with the document), which drops the
// autosave before the frame's own pagehide can re-arm it.
var closedByUser = false;

window.__vibetopClosing = function () { closedByUser = true; lsSet(RESUME_KEY, '0'); };

function autosaveForReload() {
  var inMatch = !closedByUser && !!G && (state === 'play' || state === 'paused') && !G.mp;
  if (inMatch && saveGame('auto')) lsSet(RESUME_KEY, '1'); else lsSet(RESUME_KEY, '0');
}

function resumeWanted() {
  var flag = lsGet(RESUME_KEY);
  lsSet(RESUME_KEY, '0');                            // read once, whatever it said
  if (flag === 'keep') return true;                  // the Options card's own Reload
  if (flag !== '1') return false;
  // The TOP document's navigation: a reload of the page (standalone) or of
  // the desktop around this frame resumes; a fresh open — a closed tab or
  // app opened again — does not. No entry at all (an old browser) resumes.
  var top = window; try { top = window.top || window; } catch (e) {}
  var nav = null;
  try { nav = (top.performance.getEntriesByType('navigation')[0] || {}).type || null; } catch (e) {}
  return nav === null || nav === 'reload';
}

window.addEventListener('pagehide', autosaveForReload);

document.addEventListener('visibilitychange', function () { if (document.hidden) autosaveForReload(); });



// --- generated ---
// ESM import bindings are read-only, so a write from another module goes
// through the owner. Reads stay verbatim everywhere: the binding is live.
function setClosedByUser(v) { closedByUser = v; }

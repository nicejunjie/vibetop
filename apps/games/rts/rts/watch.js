// Iron Frontier — watch.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.














// ------------------------------------------------------------------- //
//  eva.ini's standing watches.
//
//  RA2's advisor does not only answer clicks: it reports the state of the
//  battlefield on a timer. These are the lines with no single call site —
//  a tech unlock, the defence grid browning out, an enemy massing armour,
//  a silo going up on the far side of the map. Every line is rate limited
//  by eva() itself; the edge tests here are what stop it chattering when a
//  count merely wobbles across its threshold.
//
//  Presentation only: it makes no random draw and mutates nothing the sim
//  reads, and it is skipped entirely when headless.
// ------------------------------------------------------------------- //
function techCount(g, p) {
  var s = g.side[p], n = 0, k, d;
  if (!hasBld(g, p, 'base')) return 0;
  for (k in BLDS) {
    d = BLDS[k];
    if (d.neut || d.wall || d.gate || !ownedBy(d, s.fac)) continue;
    if (reqMet(g, p, d)) n++;
  }
  for (k in UNITS) {
    d = UNITS[k];
    if (!ownedBy(d, s.fac) || !reqMet(g, p, d)) continue;
    if (d.cls === 'i' ? hasBld(g, p, 'barracks')
      : d.cls === 'a' ? hasBld(g, p, 'airforce') : hasBld(g, p, 'factory')) n++;
  }
  return n;
}

function countCls(g, p, cls, harv) {
  var n = 0;
  for (var i = 0; i < g.units.length; i++) {
    var u = g.units[i];
    if (u.dead || u.p !== p) continue;
    if (UNITS[u.type].cls !== cls) continue;
    if (!harv && isHarv(u)) continue;
    n++;
  }
  return n;
}

// eva.ini #1 / #4 / #7: the three warnings that fire when the ENEMY raises
// the structure, not when it fires the weapon.
var SW_DETECT = { nuke: 'Nuclear silo detected', curtain: 'Iron Curtain detected',
                  chrono: 'Chronosphere detected' };

function stepEvaWatch(g) {
  if (headless) return;
  if (!g.ev) g.ev = { tech: -1, defOff: false, air: false, armour: false, inf: false, sw: {}, lab: false, minerOff: false };
  var ev = g.ev, i, b;
  if ((g.tick % 30) !== 7) return;

  // #49 NewConstructionOptions — one of RA2's most recognisable lines.
  var tc = techCount(g, ME);
  if (ev.tech >= 0 && tc > ev.tech) eva('New construction options', 4000);
  ev.tech = tc;

  // #59 BaseDefensesOffLine — a brown-out takes the turrets with it.
  var hasDef = false;
  for (i = 0; i < g.blds.length; i++) {
    b = g.blds[i];
    if (!b.dead && b.p === ME && BLDS[b.type].cat === 'def' && BLDS[b.type].power < 0) { hasDef = true; break; }
  }
  var defOff = hasDef && !powered(g, ME);
  if (defOff && !ev.defOff) eva('Base defenses offline', 20000);
  ev.defOff = defOff;

  // #1 / #4 / #7 — the enemy's superweapon went up.
  for (i = 0; i < g.blds.length; i++) {
    b = g.blds[i];
    if (b.dead || b.p !== FOE || b.make > 0) continue;
    if (SW_DETECT[b.type] && !ev.sw[b.type]) { ev.sw[b.type] = 1; eva(SW_DETECT[b.type], 30000); mmPing(g, b.cx, b.cy); }
  }

  // #96 / #98 / #99 — the enemy has massed something worth naming. Edge
  // tested on the threshold so a battalion that loses one tank and builds
  // it again does not re-announce itself.
  var ea = countCls(g, FOE, 'a', true), evh = countCls(g, FOE, 'v', false), ei = countCls(g, FOE, 'i', true);
  if (ea >= 5 && !ev.air) eva('Enemy air armada detected', 60000);
  ev.air = ea >= 4;
  if (evh >= 8 && !ev.armour) eva('Armor battallian detected', 60000);
  ev.armour = evh >= 6;
  if (ei >= 12 && !ev.inf) eva('Enemy infantry battalion detected', 60000);
  ev.inf = ei >= 9;

  // #86 / #109 — a miner with nowhere to unload is a stopped economy.
  var minerOff = g.tick > 60 * 45 && countUnit(g, ME, 'harvester') > 0 && !hasBld(g, ME, 'refinery');   // not at 0:02 of every match
  if (minerOff && !ev.minerOff) {
    eva(facOf(g, ME) === 'dir' ? 'Chrono miner offline' : 'Ore miner offline', 30000);
    say('Miners have nowhere to unload — build a Refinery', true, 300);
  }
  ev.minerOff = minerOff;

  // #74 NewTechnologyAcquired — the Battle Lab opens the top of the tree.
  if (!ev.lab && hasBld(g, ME, 'lab')) { ev.lab = true; eva('New technology acquired', 10000); }
}

// The opening position, honouring the skirmish strip. RA2's "Bases" off
// gives you the MCV instead of the yard it would unfold into; "Units" is
// the guard that starts beside it (0-10, three by default, which is what
// the game always gave).
function openingForce(g, p) {
  var st = g.start[p], sp, i;
  // The yard is centred on the start tile the same way the placement ghost
  // and the MCV deploy centre it, so a 4x4 Foundation= sits where a 3x3 did.
  var yd = BLDS.base;
  if (g.opt.bases) placeBld(g, 'base', p, st.x - Math.floor((yd.gw - 1) / 2), st.y - Math.floor((yd.gh - 1) / 2));
  else { sp = freeTileNear(g, st.x, st.y); if (sp) spawnUnit(g, 'mcv', p, sp.x, sp.y); }
  // Clear of the yard's own footprint: it now reaches two cells past the
  // start tile, so the opener forms up one cell further out than it did.
  for (i = 0; i < 2; i++) {
    sp = freeTileNear(g, st.x + (p ? -4 : 4), st.y + (p ? -4 : 4) + i);
    if (sp) spawnUnit(g, 'harvester', p, sp.x, sp.y);
  }
  var opener = FACTIONS[g.side[p].fac].inf;
  for (i = 0; i < g.opt.units; i++) {
    sp = freeTileNear(g, st.x + (p ? -5 : 5) + (i % 5), st.y + (p ? -1 : 1) + ((i / 5) | 0));
    if (sp) spawnUnit(g, opener, p, sp.x, sp.y);
  }
}

function economyDead(g, p) {
  if (countUnit(g, p, 'harvester') > 0) return false;
  var c = g.side[p].credits, hcost = UNITS[harvKey(facOf(g, p))].cost;
  if (c >= hcost && hasBld(g, p, 'factory')) return false;
  // An MCV IS a Construction Yard — it just has not unfolded yet.
  var base = hasBld(g, p, 'base') || countUnit(g, p, 'mcv') > 0;
  if (c >= BLDS.factory.cost + hcost && base) return false;
  return true;
}

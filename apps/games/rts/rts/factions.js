// Iron Frontier — factions.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.

import { BLDS } from './blds.js';
import { harvKey } from './combat-tables.js';
import { isBldLane, laneOfBld } from './production.js';
import { UNITS } from './roster.js';
import { swBld } from './supers.js';
import { P_NEUT, neutral } from './world.js';

// Faction identity. Colour still follows the PLAYER, not the faction, so a
// red Directorate reads the same as a blue one.
export var FACTIONS = {
  dir: { key: 'dir', name: 'Directorate', em: '🜁',
         blurb: 'Speed and tech. Grizzlies, GIs dug in behind sandbags, Harriers, Mirage and Prism.',
         defence: 'sentry', tank: 'lancer', inf: 'rifle' },
  col: { key: 'col', name: 'Collective', em: '🜂',
         blurb: 'Mass and armour. Rhinos, Tesla, Kirovs; Conscripts are nearly free.',
         defence: 'tesla', tank: 'rhino', inf: 'conscript' }
};

export function facOf(g, p) { return neutral(p) ? 'dir' : g.side[p].fac; }

export function ownedBy(spec, fac) { return !spec.fac || spec.fac === fac; }

// ---- RA2's captured-production rule ---------------------------------- //
//
// A structure's faction is NOT its owner's. It is stamped by placeBld from
// the faction that built it and is never rewritten, so an Engineer changes
// who holds a War Factory, not what a War Factory is.
//
// This is how rules.ini does it. Every faction production building carries
// an all-nine-country `Owner=` ([NAWEAP] Owner=British,French,Germans,
// Americans,Alliance,Russians,Confederation,Africans,Arabs — 42 of the 47
// BuildingTypes are all-nine; only GACNST/NACNST are faction-locked). The
// faction gate is ENTIRELY the `Prerequisite=` chain, and every chain is
// rooted at the producing structure: [HTNK] Prerequisite=NAWEAP, [E2]
// NAHAND, [SAPC] NAYARD, [ORCA] RADAR, and every Soviet STRUCTURE ends
// ...,NACNST. RA2 asks what you HOLD, never what side you are — which is
// exactly why an Engineer on their War Factory buys you their tanks.
//
// Neutral-house structures are deliberately left UNSTAMPED. A derrick, a
// hospital, an airport, a city block and a bridge hut belong to no side,
// produce nothing, and draw through drawNeutral, which never reads a
// faction. Unstamped they fall through to facOf and behave exactly as they
// always have (including after capture, when they are plainly the new
// owner's) — and nothing can mistake one for a producer, because their
// types are not producer types.
export function bfacOf(g, b) { return (b && b.fac) || facOf(g, b ? b.p : P_NEUT); }

// The faction a NEW item of this key belongs to: its own if the key is one
// faction's alone (a Tesla Coil is Soviet whoever puts it down), else the
// builder's (a Barracks is your Barracks).
export function keyFac(g, p, key, isBld) {
  var sp = (isBld ? BLDS : UNITS)[key];
  return (sp && sp.fac) || facOf(g, p);
}

// Which structure makes this? rules.ini's `Factory=` line, by class.
export function producerOf(spec, isBld) {
  if (isBld) return 'base';                                   // Factory=BuildingType
  return spec.cls === 'i' ? 'barracks'                        // Factory=InfantryType
       : spec.cls === 'a' ? 'airforce'                        // Factory=AircraftType
       : spec.cls === 'n' ? 'shipyard' : 'factory';           // Factory=UnitType (Naval=yes -> the slip)
}

// Do we hold a standing `type` of faction `fac`? `fac` null = either
// faction's will do, which is RA2's generic BARRACKS/TECH/RADAR alias
// ([General] PrerequisiteBarracks=NAHAND,GAPILE) and is what every
// both-sides item ([ENGINEER] Prerequisite=BARRACKS) is written against.
export function hasFacBld(g, p, type, fac) {
  for (var i = 0; i < g.blds.length; i++) {
    var b = g.blds[i];
    if (b.dead || b.p !== p || b.type !== type) continue;
    if (!fac || bfacOf(g, b) === fac) return true;
  }
  return false;
}

// THE faction gate. canBuild, the sidebar listing, the cameo, the hover
// card and the AI all ask this one predicate — three that could disagree
// is how "capture their yard and you still cannot build their units"
// survived in the first place.
export function facAllows(g, p, spec, isBld) {
  return hasFacBld(g, p, producerOf(spec, isBld), spec.fac);
}

// Structures and defences share ONE construction queue (as in RA2 — the
// yard builds one thing at a time); they are only listed separately, so the
// list you are scanning is the list you meant to scan.
// Sidebar listing, as RA2 lays it out: four tabs (Structures / Defence /
// Infantry / Units), every BuildCat=Combat structure — walls, turrets AND
// the superweapons — on the Defence tab, and each tab sorted by TechLevel
// with rules.ini list position breaking ties (values read off rules.ini
// v1.006; Guardian GI's TechLevel 2 from rulesmd.ini).
function buildOrderFor(fac) {
  // [NAYARD] is TechLevel 2 (right behind the War Factory); [GAYARD] is
  // TechLevel 4, one rung past the Airforce Command.
  return fac === 'col' ? ['power', 'refinery', 'barracks', 'factory', 'shipyard', 'radar', 'depot', 'lab', 'reactor', 'cloningvats']
                       : ['power', 'refinery', 'barracks', 'factory', 'airforce', 'shipyard', 'depot', 'lab', 'purifier', 'spysat'];
}

function defenceOrderFor(fac) {
  // TechLevel order, as RA2's Defence tab is: wall and gate (TL1) first,
  // then the guns (TL2/4/5-6), then the TL7 pair the Directorate alone gets
  // (Gap Generator, Grand Cannon), then the superweapons.
  return fac === 'col' ? ['wall', 'gate', 'sentrygun', 'flakcannon', 'tesla', 'psisensor', 'curtain', 'nuke']
                       : ['wall', 'gate', 'sentry', 'patriot', 'prism', 'gapgen', 'grandcannon', 'chrono', 'weather'];
}

export function unitOrderFor(fac, tab, side) {
  // Attack Dog is TechLevel 2, one rung above the rifleman and the Engineer.
  // Order is rules.ini TechLevel: TL1 rifleman/Engineer, TL2 dog/GGI, TL5
  // Flak Trooper/Shock Trooper/Ivan/Spy, TL8 Desolator, TL10 Yuri, Tanya
  // and the Chrono Legionnaire.
  var a;
  if (tab === 'i') a = fac === 'col' ? ['conscript', 'engineer', 'dog', 'flak', 'teslatrooper', 'ivan', 'desolator', 'yuri']
                                     : ['rifle', 'engineer', 'dog', 'rocket', 'rocketeer', 'spy', 'tanya', 'cleg'];
  // Vehicles, same rule: TechLevel then rules.ini [VehicleTypes] position.
  // TL1 miner; TL2 Rhino (#4) then Amphibious Transport (#5), TL2 Grizzly;
  // TL3 IFV / Intruder / V3 / Flak Track; TL4 Terror Drone; TL7 Apocalypse
  // and BlackHawk; TL8 Prism Tank; TL9 Mirage; TL10 Kirov (#16) / MCV (#27)
  // / Tesla Tank (#32).
  else a = fac === 'col' ? [harvKey(fac), 'rhino', 'apc', 'v3', 'flaktrack', 'drone', 'mammoth', 'kirov', 'mcv', 'teslatank']
                         : [harvKey(fac), 'lancer', 'ifv', 'harrier', 'nighthawk', 'prismtank', 'mirage', 'mcv'];
  // The navy sits at the BOTTOM of the Units tab, after every vehicle, in
  // TechLevel order — RA2's own sidebar does the same, because a ship's
  // TechLevel is read against the same ladder but its lane is the Shipyard's.
  if (tab === 'v') a = a.concat(fac === 'col' ? ['sub', 'seascorp', 'dread', 'squid']
                                              : ['destroyer', 'lcraft', 'dolphin', 'aegis', 'carrier']);
  // A Spy who got into their Battle Lab brings home a blueprint: RA2's
  // "Technology stolen" adds the OTHER side's lab unit to your own lane.
  if (side && side.stolen) {
    for (var i = 0; i < side.stolen.length; i++) {
      var k = side.stolen[i];
      if (UNITS[k] && UNITS[k].cls === (tab === 'i' ? 'i' : 'v') && a.indexOf(k) < 0) a.push(k);
    }
  }
  return a;
}

// The sidebar's four tabs as DATA: the keys this house may put on `tab`
// right now — its own faction's list first, in RA2's order, then anything
// a CAPTURED producer has unlocked appended behind it. buildPanel renders
// exactly this, so the list you see, the cameos drawn on it, the hover
// cards and what canBuild will actually take are one rule and not four.
// Your own list is always listed (greyed when it is not yet affordable or
// unlocked, as it always has been); the other side's appears only when you
// hold the shed that makes it.
export function panelListFor(fac, tab, side) {
  var isBld = (tab === 'b' || tab === 'd');
  var ks = isBld ? (tab === 'b' ? buildOrderFor(fac) : defenceOrderFor(fac))
                 : unitOrderFor(fac, tab, side);
  var out = [];
  for (var i = 0; i < ks.length; i++) {
    var k = ks[i], spec = isBld ? BLDS[k] : UNITS[k];
    if (!spec) continue;
    out.push({ k: k, lane: isBld ? laneOfBld(k) : spec.cls, fac: spec.fac || fac });
  }
  return out;
}

export function panelKeys(g, p, tab) {
  var fac = g.side[p].fac, oth = fac === 'col' ? 'dir' : 'col', i;
  var out = panelListFor(fac, tab, g.side[p]), seen = {};
  for (i = 0; i < out.length; i++) seen[out[i].k] = 1;
  var more = panelListFor(oth, tab, null);
  for (i = 0; i < more.length; i++) {
    var it = more[i], isBld = isBldLane(it.lane), spec = isBld ? BLDS[it.k] : UNITS[it.k];
    if (seen[it.k]) continue;
    if (isBld && !g.opt.supers && swBld(it.k)) continue;   // DisableableFromShell=yes
    if (!isBld && spec.spawned) continue;                  // TechLevel=-1: off a deck
    if (!facAllows(g, p, spec, isBld)) continue;
    seen[it.k] = 1; out.push(it);
  }
  return out;
}

// Which producers of which faction we hold, as a string. Capture one and
// the sidebar has to grow rows; lose it and they have to go. refreshPanel
// runs every frame, so this is the cheapest thing that can notice.
export function facSig(g, p) {
  var have = {}, i;                                  // ONE walk: this runs ten times a second
  for (i = 0; i < g.blds.length; i++) {
    var b = g.blds[i];
    if (b.dead || b.p !== p) continue;
    have[b.type + ':' + bfacOf(g, b)] = 1;
  }
  var ts = ['base', 'barracks', 'factory', 'airforce', 'shipyard'], out = '';
  for (i = 0; i < ts.length; i++)
    out += (have[ts[i] + ':dir'] ? 'D' : '-') + (have[ts[i] + ':col'] ? 'C' : '-');
  return out + '|' + ((g.side[p].stolen || []).join(','));
}

// Iron Frontier — geom.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.









// Air layer: a unit with `air` flies over every kind of terrain and can only
// be shot by a weapon flagged `aa`; a weapon flagged `ag:false` (the AA
// sites) cannot fire at the ground. Buildings are never airborne.
function isAir(e) { return e.kind === 'u' && !!UNITS[e.type].air; }

function canHit(spec, tgt, u) {
  // An IFV asks on behalf of the man inside it: a Flak Trooper aboard can
  // shoot down a Rocketeer, an Engineer aboard cannot shoot anything.
  if (spec && spec.ifv && u && u.pax && u.pax.length) spec = ifvSpec(u);
  if (!spec || !spec.dmg) return false;
  if (isAir(tgt)) return !!spec.aa;
  if (spec.ag === false) return false;
  // rules.ini `LandTargeting=1` — [AEGIS], [SUB], [DLPH], [SQD]. A torpedo,
  // a sonic zap and a squid's arms reach hulls, not the shore: anything
  // that is not afloat is simply not a legal target for this weapon.
  if (spec.landTgt === false && !isNaval(tgt)) return false;
  // `Underwater=yes` is not cover, it is a targeting class: only a hull
  // with `Sensors=yes` (Typhoon, Dolphin, Squid) or a depth-charge carrier
  // (the Destroyer's Osprey) can engage a submerged unit at all. Every gun
  // ashore, every tank and every aircraft simply cannot.
  if (isSub(tgt) && !spec.sensors && !spec.asw) return false;
  return true;
}

// rules.ini `Underwater=yes` + `Cloakable=yes` / `CloakingSpeed=1`: a
// submerged hull is off the board for anything that cannot detect it. It
// BREAKS the surface to fire and stays up for SUB_SURFACE ticks after, which
// is the window an escort has to answer. `Sensors=yes` / `SensorsSight=4`
// is the only thing that sees one otherwise — and its owner always can.
var SUB_SURFACE = 90, SENSOR_SIGHT = 4;

function surfaced(g, u) { return !!(u.surfAt != null && g.tick - u.surfAt < SUB_SURFACE); }

function subSeen(g, u, p) {
  if (!isSub(u) || u.p === p || u.dead) return true;
  if (surfaced(g, u)) return true;
  var seen = false;
  near(u.x, u.y, SENSOR_SIGHT + 3, function (o) {
    if (seen || o.dead || o.kind !== 'u' || o.p !== p || !isSensor(o)) return;
    if (dist(o, u) <= senseRng(o)) seen = true;
  });
  return seen;
}

// Range against a given target: AA weapons reach further into the sky (RA2
// gives most AA guns a longer air range than their ground range).
function rngVs(spec, tgt) { return isAir(tgt) && spec.aaRng ? spec.aaRng : spec.rng; }

// MinimumRange= (V3 5, IFV 1): inside it the weapon simply cannot fire.
function tooClose(spec, d) { return !!(spec.minRng && d < spec.minRng); }

// RA2 measures weapon range to the target's NEAREST CELL. `dist()` is
// centre-to-centre, so a structure's own footprint lies between the shooter
// and the wall it is aiming at: 1.5 cells on a 3x2 Barracks, 2 on the 4x4
// Construction Yard. Any weapon with a shorter range than that could never
// reach ANY building -- measured 2026-09-04, Tanya's C4 (rng 1.2) and Crazy
// Ivan's bomb (rng 1.5) each did ZERO damage to a Barracks over 3000 ticks
// while closing to 1.90 and 1.62 of its centre. Those are both units' whole
// reason to exist. `atRefinery` has always carried this allowance so a
// harvester could dock; nothing on the weapon path did.
//
// Only the TARGET's footprint is allowed for, not the shooter's: that is the
// half that fixes the defect, and giving every 1x1 defence extra reach as
// well would be a balance change nobody asked for.
function footAllow(t) { return t && t.kind === 'b' ? Math.max(t.gw, t.gh) / 2 : 0; }

// Distance from `a` to the WALL of `b`. Range AND MinimumRange must both be
// tested against this one number, or the two ends disagree about what range
// means and a V3's dead zone lands in a different place from its reach.
function edgeDist(a, b) { return Math.max(0, dist(a, b) - footAllow(b)); }

// Screen-pixel altitude of a unit right now: 0 on the ground or on a pad,
// else the type's cruise height plus a slow bob (a Kirov wallows, a
// Rocketeer bounces on his jets).
var CLIMB = 30;                       // ticks from the ground to cruise height

function altOf(u) {
  if (!u.air) return 0;
  var d = UNITS[u.type], now = (G ? G.tick : 0), t = now + u.id * 7;
  var k;
  if (u.landed) {
    // Touching down is a ramp, not a snap: the airframe sinks onto the pad
    // over LAND_T ticks (it was a one-tick pop from cruise height to zero).
    var lp = now - (u.landAt == null ? -9999 : u.landAt);
    if (lp < 0 || lp >= LAND_T) return 0;
    k = 1 - lp / LAND_T; k = k * k;
    return k * d.alt;
  }
  // An aircraft built on the ground (a Rocketeer out of the Barracks door,
  // a Kirov off the War Factory ramp) climbs to altitude instead of
  // popping into existence at cruise height. Anything placed before the
  // match starts (an opening force, a test fixture) is already up there.
  // A sortie off the pad climbs on the same ramp.
  k = (u.born || 0) <= 0 ? 1 : Math.min(1, (now - u.born) / CLIMB);
  if (u.flyAt != null) k = Math.min(k, Math.max(0, (now - u.flyAt) / LAND_T));
  return k * (d.alt + (d.bomb ? Math.sin(t * 0.035) * 4.5 : Math.sin(t * 0.09) * 1.6));
}

function airborneYet(u) { return !u.air || u.landed || !(u.born > 0) || (G ? G.tick : 0) - u.born >= CLIMB; }

// Where Harriers park: four pads on each Airforce Command, in grid offsets
// from the structure's centre (the helipad is the near-right half of the art).
// Where the helipad sits on the Airforce Command's plot and how big it is,
// in fractions of the plot's half-width/half-height, plus the quadrant
// offset of one Harrier slot. The ART draws the pad from these numbers and
// PAD_SLOTS is DERIVED from them, so the four aircraft always park on the
// four painted quadrants. Hand-written slot offsets silently stopped
// matching the moment the AFC moved to RA2's 3x2 `Foundation=`.
var AFC_PAD = { ox: 0.34, oy: 0.20, w: 0.62, h: 0.62, q: 0.363 };

var PAD_SLOTS = (function () {
  var d = BLDS.airforce, pw = (d.gw + d.gh) * TW / 4, ph = (d.gw + d.gh) * TH / 4, out = [];
  for (var i = 0; i < 4; i++) {
    var hu = ((i & 1) ? 1 : -1) * AFC_PAD.q, hv = ((i & 2) ? 1 : -1) * AFC_PAD.q;
    var dx = pw * AFC_PAD.ox + (hu - hv) * pw * AFC_PAD.w;
    var dy = ph * AFC_PAD.oy + (hu + hv) * ph * AFC_PAD.h;
    out.push([(dy / (TH / 2) + dx / (TW / 2)) / 2, (dy / (TH / 2) - dx / (TW / 2)) / 2]);
  }
  return out;                                  // the four quadrants of the pad's cross
})();

function padSlot(b, i) { return { x: b.cx + PAD_SLOTS[i][0], y: b.cy + PAD_SLOTS[i][1] }; }

// Which of the theatre's two grounds a cell wears (RA2's LAT pair: grass /
// sand, snow / scoured earth, PAVEMENT / grit). `G.gm` is the decorative
// noise that picks it -- and an ore cell always overrides it to the dirt.
//
// RA2 grows ore on ground and dirt and never on `Pavement`, and `patch()`
// was duly fixed to refuse anything but `T_GROUND`. That did not reach the
// case it was written for: the urban theatre PAINTS its `T_GROUND` as
// concrete slabs (`bakeGroundSheet('pave', 61)`), so an urban ore field
// still lay on paving with the slab joints running under it. Deciding it
// here rather than in the generator means the LAT feather mask below sees
// the same answer -- the dirt blends into the surrounding pavement instead
// of ending on a tile edge -- and that ore which SPREADS into a new cell
// mid-match brings its dirt with it, with no second rule to keep in step.
function dirtAt(i) { return G.gm[i] || (oreT(G.terrain[i]) ? 1 : 0); }

function moverOf(e) {
  if (!e || e.kind !== 'u') return MV_LAND;
  var d = UNITS[e.type];
  return d.amph ? MV_AMPH : (d.nav ? MV_NAVAL : MV_LAND);
}

function isNaval(e) { return !!(e && e.kind === 'u' && UNITS[e.type].nav); }

// Can this unit's mover ever reach (x,y)? Only a pure naval hull is fenced
// in: it needs open water of ITS OWN body within `r` cells of the spot
// (`r` because a shore order legitimately lands on the beach and `astar`
// walks out to the nearest floatable cell). Land and amphibious movers are
// unconstrained here — this is the water question, not the pathing one.
function navReach(g, u, x, y, r) {
  var d = u && u.kind === 'u' ? UNITS[u.type] : null;
  if (!d || !d.nav || d.amph) return true;
  var z = hullZone(g, u);
  if (!z) return true;                          // not afloat yet (in a yard): do not veto
  return !!nearestWater(g, x, y, r == null ? 2 : r, z);
}

// `Underwater=yes` — a Typhoon, a Dolphin and a Giant Squid run submerged.
function isSub(e) { return !!(e && e.kind === 'u' && UNITS[e.type].sub); }

// `Sensors=yes` / `SensorsSight=4`: what can SEE a submerged hull.
function isSensor(e) {
  if (!e || e.kind !== 'u') return false;
  var d = UNITS[e.type];
  return !!(d.sensors || d.asw);              // [DEST]'s Osprey hunts what the hull cannot see
}

function senseRng(e) {
  var d = UNITS[e.type];
  return d.asw ? d.asw.rng : 4;               // SensorsSight=4
}

function labelWater(g) {
  var z = g.wzone, n = MAP * MAP, i, lab = 0, stack = [];
  for (i = 0; i < n; i++) z[i] = 0;
  for (i = 0; i < n; i++) {
    if (z[i] || g.terrain[i] !== T_WATER) continue;
    lab++; z[i] = lab; stack.push(i);
    while (stack.length) {
      var c = stack.pop(), cx = c % MAP, cy = (c / MAP) | 0;
      for (var d = 0; d < 8; d++) {
        var ax = WZ_DX[d], ay = WZ_DY[d], nx = cx + ax, ny = cy + ay;
        if (!inMap(nx, ny)) continue;
        var ni = ny * MAP + nx;
        if (z[ni] || g.terrain[ni] !== T_WATER) continue;
        if (ax && ay && g.terrain[cy * MAP + cx + ax] !== T_WATER &&
                        g.terrain[(cy + ay) * MAP + cx] !== T_WATER) continue;
        z[ni] = lab; stack.push(ni);
      }
    }
  }
  g.wzoneN = lab;
}

function waterZoneAt(g, x, y) {
  x = Math.round(x); y = Math.round(y);
  return inMap(x, y) ? g.wzone[y * MAP + x] : 0;
}

// The body a hull is floating in. An amphibious hull may be standing on a
// beach, so it falls back to the nearest water — and `navReach` lets it go
// anywhere anyway, because it can drive round.
function hullZone(g, u) {
  var z = waterZoneAt(g, u.x, u.y);
  if (z) return z;
  var w = nearestWater(g, Math.round(u.x), Math.round(u.y), 3);
  return w ? waterZoneAt(g, w.x, w.y) : 0;
}

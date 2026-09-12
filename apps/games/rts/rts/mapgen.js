// Iron Frontier — mapgen.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.








// --------------------------------------------------------------------- //
//  Map generation — mirrored, so neither side gets a better start.
//  The unit test asserts both starts reach ore and each other, and that
//  the two halves carry the same ore total.
// --------------------------------------------------------------------- //
// Maps. Each generator lays terrain on a mirrored (180°) 64x64 board so the
// two starts are fair by construction; `theatre` picks the ground palette.
// Every map carries at least one garrisonable civilian structure. Frozen
// Front, Chokepoint Pass and Gem Valley had NONE, which made garrisoning
// unreachable on three of the seven maps and, because the headless sim
// generates one of them by default, produced a gap-audit finding that "the
// AI never garrisons" — measured over twelve matches on a map with zero
// blocks to garrison. Given blocks, the AI garrisons on its own.
var MAPS = {
  frontier: { name: 'Iron Frontier', theatre: 'temperate', light: { mul: '#fff0d0', a: 0.12 }, blurb: 'Open plains, rock outcrops, a road between the bases',
              gen: function (g) { g.tech2 = 'airport'; genCore(g, 26, null); mapRoad(g); mapFarms(g); mapTrees(g, 14); } },
  lake:     { name: 'Lake Divide',   theatre: 'temperate', light: { mul: '#cbd6e6', a: 0.20 }, blurb: 'A lake splits the middle; cliff ridges guard the flanks',
              gen: function (g) { g.tech2 = 'hospital'; genCore(g, 14, function () { mapLake(g, 31.5, 31.5, 11, 7); mapLake(g, 19, 19, 4, 3); mapRidge(g, 12, 40, 26, 40, 3); mapRidge(g, 44, 18, 44, 30, 3); }); mapFarms(g); mapTrees(g, 10); } },
  tundra:   { name: 'Frozen Front',  theatre: 'snow',      light: { mul: '#bfcfe8', a: 0.24 }, blurb: 'Snowfield with frozen lakes and cliff ridges',
              gen: function (g) { g.tech2 = 'hospital'; genCore(g, 18, function () { mapLake(g, 20, 44, 5, 3.2); mapRidge(g, 21, 4, 21, 16, 3); mapRidge(g, 34, 44, 46, 44, 3); }); mapFarms(g); mapTrees(g, 12); } },
  choke:    { name: 'Chokepoint Pass', theatre: 'temperate', light: { mul: '#ffb07a', a: 0.24, add: '#2a1424', aa: 0.09 }, blurb: 'One cliff wall across the middle; two ramps decide the game',
              gen: function (g) { g.tech2 = 'airport'; genCore(g, 16, function () { mapWall(g); },
                function (mp) { mp(14, 45, 3.2, 900); mp(22, 45, 3.0, 860); }); mapFarms(g); mapTrees(g, 9); } },
  river:    { name: 'River Crossing', theatre: 'urban',     light: { mul: '#ffcbbe', a: 0.20, add: '#26142c', aa: 0.07 }, blurb: 'A city river, two bridges, civilian blocks along the streets',
              gen: function (g) { g.tech2 = 'hospital'; genCore(g, 7, function () { mapRiver(g); },
                function (mp) { mp(24, 24, 3.0, 840); mp(40, 25, 3.0, 820); }); mapCity(g); mapTrees(g, 6); } },
  coastal:  { name: 'Coastal',        theatre: 'temperate', light: { mul: '#e6efff', a: 0.14 }, blurb: 'A wide bay between the two bases, a harbour each and an ore island in the middle',
              gen: function (g) { g.tech2 = 'airport'; genCore(g, 10, function () { mapCoast(g); },
                function (mp, gp) { gp(31.5, 31.5, 3.0, 900); mp(31.5, 31.5, 4.6, 700); }); mapFarms(g); mapTrees(g, 8); } },
  gems:     { name: 'Gem Valley',     theatre: 'temperate', light: { mul: '#fff7e4', a: 0.08 }, blurb: 'A gem plateau ringed by cliffs — two ramps in, and everyone wants them',
              gen: function (g) { g.tech2 = 'airport'; genCore(g, 13, function () { mapPlateau(g); },
                function (mp, gp) { gp(31.5, 27, 3.4, 560); gp(27, 31.5, 3.0, 480); mp(19, 17, 3.0, 820); }); mapFarms(g); mapTrees(g, 10); } }
};

function genMap(g) { (MAPS[g.mapId] || MAPS.frontier).gen(g); }

function setT(g, x, y, t) { if (inMap(x, y) && g.terrain[idx(x, y)] === T_GROUND) g.terrain[idx(x, y)] = t; }

function setTM(g, x, y, t) { setT(g, x, y, t); setT(g, MAP - 1 - x, MAP - 1 - y, t); }   // mirrored pair

// Forcing variant: a bridge deck is laid ON water, so it may not defer to
// "only if the tile is still clear ground" the way every other feature does.
function setF(g, x, y, t) { if (inMap(x, y)) g.terrain[idx(x, y)] = t; }

function setFM(g, x, y, t) { setF(g, x, y, t); setF(g, MAP - 1 - x, MAP - 1 - y, t); }

function mapLake(g, cx, cy, rx, ry) {
  for (var y = Math.floor(cy - ry) - 1; y <= Math.ceil(cy + ry) + 1; y++) for (var x = Math.floor(cx - rx) - 1; x <= Math.ceil(cx + rx) + 1; x++) {
    var dx = (x - cx) / rx, dy = (y - cy) / ry;
    if (dx * dx + dy * dy <= 1) setTM(g, x, y, T_WATER);
  }
}

function mapRidge(g, x0, y0, x1, y1, w) {
  // A cliff line with a two-tile gap at its middle, mirrored.
  var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (var i = 0; i <= n; i++) {
    if (Math.abs(i - n / 2) < 1.5) continue;                       // the pass
    var x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n);
    for (var k = 0; k < w; k++) setTM(g, x + (x1 === x0 ? k : 0), y + (y1 === y0 ? k : 0), T_CLIFF);
  }
}

function mapRoad(g) {
  // A dirt road from one base toward the other, bending at the middle.
  // Drawn from one base to the centre and mirrored, so the map stays fair.
  var a = g.start[0], mx = (MAP >> 1) - 1, my = (MAP >> 1) - 1, x, y;
  for (x = a.x; x <= mx; x++) setTM(g, x, a.y + 2, T_ROAD);
  for (y = a.y + 2; y <= my; y++) setTM(g, mx, y, T_ROAD);
}

// temperat.ini ships Farm Crops and a House set; a temperate map with no
// farm on it reads as a wilderness rather than as somewhere people live.
// One mirrored pair each, well off the lane between the two starts.
function mapFarms(g) {
  var lots = [['civfarm', 7, 33], ['civbarn', 33, 7], ['civfarm', 45, 6], ['civbarn', 6, 45]];
  for (var i = 0, made = 0; i < lots.length && made < 2; i++) {
    var k = lots[i][0], x = lots[i][1], y = lots[i][2];
    if (g.terrain[idx(x, y)] !== T_GROUND || g.terrain[idx(MAP - 1 - x, MAP - 1 - y)] !== T_GROUND) continue;
    if (nearNeut(g, x, y, 3)) continue;
    g.neut.push({ key: k, x: x, y: y }, { key: k, x: MAP - 1 - x, y: MAP - 1 - y });
    made++;
  }
}

function nearT(g, x, y, t) {
  for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) if (inMap(x + dx, y + dy) && g.terrain[idx(x + dx, y + dy)] === t) return true;
  return false;
}

function mapTrees(g, clusters) {
  for (var c = 0; c < clusters; c++) {
    var cx = 3 + rint(MAP - 6), cy = 3 + rint((MAP >> 1) - 4), n = 2 + rint(4);
    for (var i = 0; i < n; i++) {
      var x = cx + rint(5) - 2, y = cy + rint(4) - 2;
      if (Math.abs(x - g.start[0].x) < 7 && Math.abs(y - g.start[0].y) < 7) continue;   // clear of the 4x4 yard and its opening force
      if (nearT(g, x, y, T_WATER) || nearT(g, x, y, T_CLIFF)) continue;   // no trees on the shoreline or against a cliff face
      setTM(g, x, y, T_TREE);
    }
  }
}

// Chokepoint Pass: one unbroken cliff wall on the anti-diagonal (x+y=63),
// which the 180 deg mirror maps onto itself, so the wall is fair by
// construction. Two ramp bands cut it — and 16<->47, 20<->43 are mirror
// partners, so the two passes are each other's reflection.
function mapWall(g) {
  for (var x = 0; x < MAP; x++) {
    var ramp = (x >= 16 && x <= 20) || (x >= 43 && x <= 47);
    for (var k = -1; k <= 1; k++) setTM(g, x, MAP - 1 - x + k, ramp ? T_RAMP : T_CLIFF);
  }
}

// River Crossing: a four-tile river across the waist (y 30..33 is
// self-mirroring) with two bridge crossings and their approach roads, plus
// a street along each bank.
function mapRiver(g) {
  var x, y, c, cols = [14, 15, 16];
  for (y = 30; y <= 33; y++) for (x = 0; x < MAP; x++) setTM(g, x, y, T_WATER);
  for (x = 0; x < MAP; x++) setTM(g, x, 28, T_ROAD);            // mirrors to the y=35 bank street
  for (c = 0; c < cols.length; c++) {
    for (y = 30; y <= 33; y++) setFM(g, cols[c], y, T_BRIDGE);
    for (y = 22; y <= 29; y++) setTM(g, cols[c], y, T_ROAD);    // mirrors to the far approach
  }
  // [CABHUT] sits at BOTH ends of the crossing, off the deck and off the
  // approach road, so an engineer can reach a hut from either bank even
  // when the span between them is in the river.
  g.neut.push({ key: 'bhut', x: cols[0] - 2, y: 29 }, { key: 'bhut', x: cols[2] + 2, y: 34 },
               { key: 'bhut', x: MAP - 1 - (cols[0] - 2), y: MAP - 1 - 29 },
               { key: 'bhut', x: MAP - 1 - (cols[2] + 2), y: MAP - 1 - 34 });
}

// Coastal. ONE body of water shared by both players, laid on the map's own
// symmetry axes so it is fair by construction: an ellipse whose long axis
// lies along the ANTI-diagonal (which the 180 deg mirror maps onto itself),
// plus a harbour channel running from the bay up toward each start along
// the MAIN diagonal — and those two channels are each other's reflection.
// The land route between the bases goes round either end of the bay, so the
// map is playable without a fleet and much shorter with one. In the middle
// of the bay is an island carrying a gem seam nobody can reach on foot.
function mapCoast(g) {
  var x, y, u, v;
  for (y = 0; y < MAP; y++) for (x = 0; x < MAP; x++) {
    u = ((x - 31.5) + (y - 31.5)) / 1.41421;      // across the bay
    v = ((x - 31.5) - (y - 31.5)) / 1.41421;      // along it
    var inBay = (u / 11) * (u / 11) + (v / 25) * (v / 25) <= 1;
    // The channel has to stay navigable AROUND a yard: a 4x4 WaterBound
    // footprint spans six cells of |x-y| on the diagonal, so a channel any
    // narrower than this is one a single Shipyard plugs — and a plugged
    // channel strands the fleet behind it for the rest of the match
    // (measured: one Destroyer re-flagged B1-stuck 557 times).
    var inChan = Math.abs(v) <= 4.6 && Math.abs(u) >= 9 && Math.abs(u) <= 25;
    if (inBay || inChan) setF(g, x, y, T_WATER);
  }
  // The island: a rounded shoal at the exact mirror centre, so it is its
  // own reflection. genCore lays the gem seam on it afterwards.
  for (y = 26; y <= 37; y++) for (x = 26; x <= 37; x++) {
    var dx = x - 31.5, dy = y - 31.5;
    if (dx * dx + dy * dy <= 26) setF(g, x, y, T_GROUND);
  }
}

// Ten neutral civilian blocks in mirrored pairs, set back from the streets.
// setT only writes on clear ground and the board is already 180 deg
// symmetric here, so a pair either lands or is refused together.
function mapCity(g) {
  // Candidates, not commitments: a lot that ore or a rock outcrop has
  // already claimed is skipped and the next one tried, so the count does
  // not sag on an unlucky seed. Each accepted lot is one mirrored PAIR.
  var lots = [[11, 22], [20, 25], [26, 18], [37, 25], [45, 20], [8, 26], [31, 14], [44, 12], [17, 12]];
  for (var i = 0, made = 0; i < lots.length && made < 5; i++) {
    var x = lots[i][0], y = lots[i][1];
    if (g.terrain[idx(x, y)] !== T_GROUND || g.terrain[idx(MAP - 1 - x, MAP - 1 - y)] !== T_GROUND) continue;
    if (nearNeut(g, x, y, 3)) continue;                  // no two blocks in each other's laps
    // Stride the set rather than walking it, so the five lots a city gets
    // are five DIFFERENT looks out of the eight instead of the first five.
    var ck = CIV_KEYS[(made * 3) % CIV_KEYS.length];
    g.neut.push({ key: ck, x: x, y: y }, { key: ck, x: MAP - 1 - x, y: MAP - 1 - y });
    made++;
  }
}

// The four civilian looks, in the order mapCity hands them out so a city
// never comes up as five copies of one block.
var CIV_KEYS = ['civflat', 'civware', 'civshop', 'civfuel', 'civoffice', 'civrow', 'civruin', 'civsilo'];

function nearNeut(g, x, y, r) {
  for (var i = 0; i < g.neut.length; i++) {
    if (Math.abs(g.neut[i].x - x) <= r && Math.abs(g.neut[i].y - y) <= r) return true;
  }
  return false;
}

// RA2 scatters two to four capturable tech buildings across a skirmish map,
// always in mirrored pairs so neither side is nearer one. Every map gets an
// Oil Derrick pair ([CAOILD]); the second pair is the map's own — the
// Airport ([CAAIRP], paradrops) or the Hospital ([CATHOSP], field healing).
function mapTech(g, second) {
  // Candidates in the CONTESTED middle band, never on a start's doorstep.
  // A tech building 13 cells from a base is not a prize to fight over, it is
  // a lump in somebody's build area — and it measurably cost the hard AI two
  // of twelve soak matches (see docs/design-decisions.md).
  var spots = [[28, 20], [20, 28], [34, 18], [18, 34], [26, 26], [38, 24]];
  var want = ['oilderrick', second || 'hospital'], wi = 0;
  for (var i = 0; i < spots.length && wi < want.length; i++) {
    var k = want[wi], d = BLDS[k], x = spots[i][0], y = spots[i][1];
    if (!techFits(g, x, y, d.gw, d.gh) || !techFits(g, MAP - 1 - x - d.gw + 1, MAP - 1 - y - d.gh + 1, d.gw, d.gh)) continue;
    if (nearNeut(g, x, y, 4)) continue;
    g.neut.push({ key: k, x: x, y: y }, { key: k, x: MAP - 1 - x - d.gw + 1, y: MAP - 1 - y - d.gh + 1 });
    wi++;
  }
}

function techFits(g, x, y, w, h) {
  for (var yy = y; yy < y + h; yy++) for (var xx = x; xx < x + w; xx++) {
    if (!inMap(xx, yy) || !buildableT(g.terrain[idx(xx, yy)])) return false;
    // Well clear of BOTH start pads, in x and in y: a derrick inside
    // somebody's build area is not a contested prize.
    for (var p = 0; p < 2; p++) {
      var st = g.start[p];
      if (st && Math.abs(xx - st.x) < 16 && Math.abs(yy - st.y) < 16) return false;
    }
  }
  return true;
}

// Lay everything the generator queued. Done here rather than in the
// generators so the whole set goes down AFTER the start pads are cleared
// and after ore, and so a lot that something else claimed is simply skipped.
function placeNeutrals(g) {
  for (var i = 0; i < g.neut.length; i++) {
    var n = g.neut[i], d = BLDS[n.key], ok = true, xx, yy;
    // The lot was reserved while the generator was still laying terrain, so
    // a tree cluster or a rock outcrop can have landed on it afterwards.
    // RA2's map authors place these buildings on cleared ground, and so do
    // we: soft cover is bulldozed, water and cliff still veto the lot (and
    // the pair's mirror is checked the same way, so it stays symmetric).
    for (yy = n.y; yy < n.y + d.gh && ok; yy++) for (xx = n.x; xx < n.x + d.gw && ok; xx++) {
      if (!inMap(xx, yy) || g.occ[idx(xx, yy)]) { ok = false; break; }
      var tt = g.terrain[idx(xx, yy)];
      if (tt === T_WATER || tt === T_CLIFF || tt === T_RAMP || tt === T_BRIDGE) ok = false;
    }
    if (!ok) continue;
    for (yy = n.y; yy < n.y + d.gh; yy++) for (xx = n.x; xx < n.x + d.gw; xx++) {
      if (!buildableT(g.terrain[idx(xx, yy)])) { g.terrain[idx(xx, yy)] = T_GROUND; g.ore[idx(xx, yy)] = 0; }
    }
    var b = placeBld(g, n.key, P_NEUT, n.x, n.y);
    b.make = 0;                                  // it has always been there
  }
}

// Bridge spans. Deck cells are grouped by VERTICAL connectivity, so the
// three-lane crossing on River Crossing is three independent spans: knock
// one out and the crossing narrows rather than vanishing. [General]
// BridgeStrength=1500 is the whole span's hit points.
var BRIDGE_HP = 1500;

function indexBridges(g) {
  var seen = {}, i, x, y;
  for (x = 0; x < MAP; x++) for (y = 0; y < MAP; y++) {
    i = idx(x, y);
    if (g.terrain[i] !== T_BRIDGE || seen[i]) continue;
    var cells = [], yy = y;
    while (yy < MAP && g.terrain[idx(x, yy)] === T_BRIDGE) { cells.push(idx(x, yy)); seen[idx(x, yy)] = 1; yy++; }
    var si = g.bridges.length;
    g.bridges.push({ cells: cells, hp: BRIDGE_HP, maxhp: BRIDGE_HP, down: false, x: x, y: y });
    for (var c = 0; c < cells.length; c++) g.bspan[cells[c]] = si + 1;
  }
}

// Gem Valley: a cliff-ringed plateau, 22..41 square (self-mirroring), open
// only through a four-wide ramp on the north face and its mirror on the
// south. The gems go inside.
function mapPlateau(g) {
  for (var y = 22; y <= 41; y++) for (var x = 22; x <= 41; x++) {
    if (x > 23 && x < 40 && y > 23 && y < 40) continue;                // the plateau top stays clear
    setTM(g, x, y, (x >= 30 && x <= 33) ? T_RAMP : T_CLIFF);
  }
}

function genCore(g, rocks, features, extraOre) {
  var i, x, y;
  for (i = 0; i < MAP * MAP; i++) { g.terrain[i] = T_GROUND; g.ore[i] = 0; }
  if (features) features();                       // water and cliffs first: ore never lands on an island

  // Rock clusters in one half, mirrored into the other (180° rotation).
  for (i = 0; i < rocks; i++) {
    var cx = 4 + rint(MAP - 8), cy = 4 + rint((MAP >> 1) - 6);
    var r = 1 + rint(3);
    for (y = cy - r; y <= cy + r; y++) for (x = cx - r; x <= cx + r; x++) {
      if (!inMap(x, y)) continue;
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > r * r) continue;
      setTM(g, x, y, T_ROCK);                     // never over water or a cliff
    }
  }

  // Ore patches: two close to each start (the economy opener) plus
  // contested ones near the middle.
  // r is fractional, so the loop bounds MUST be snapped to integers: a
  // half-tile start makes idx() return a fractional index, which a typed
  // array truncates to an entirely different tile — ore ends up scattered
  // across a band nowhere near the patch, and the two halves stop matching.
  function patch(cx, cy, r, amount, gem) {
    var y0 = Math.ceil(cy - r), y1 = Math.floor(cy + r);
    var x0 = Math.ceil(cx - r), x1 = Math.floor(cx + r);
    for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) {
      if (!inMap(xx, yy)) continue;
      var d = Math.sqrt((xx - cx) * (xx - cx) + (yy - cy) * (yy - cy));
      if (d > r) continue;
      var j = idx(xx, yy);
      if (g.terrain[j] !== T_GROUND && !oreT(g.terrain[j])) continue;      // overlapping patches merge (max)
      g.terrain[j] = (gem || g.terrain[j] === T_GEM) ? T_GEM : T_ORE;      // a gem seam is never downgraded to ore
      g.ore[j] = Math.max(g.ore[j], amount * (1 - d / (r + 1)));
    }
  }
  function mirrorPatch(cx, cy, r, amount) {
    patch(cx, cy, r, amount);
    patch(MAP - 1 - cx, MAP - 1 - cy, r, amount);
  }
  function mirrorGem(cx, cy, r, amount) {
    patch(cx, cy, r, amount, true);
    patch(MAP - 1 - cx, MAP - 1 - cy, r, amount, true);
  }

  g.start = [ { x: 9, y: 9 }, { x: MAP - 10, y: MAP - 10 } ];

  mirrorPatch(15, 8, 3.4, 900);
  mirrorPatch(7, 17, 3.0, 780);
  mirrorPatch(27, 20, 3.6, 1000);
  // The contested middle. A single patch at MAP>>1 cannot be self-mirroring
  // (the mirror centre of a 64-tile map is 31.5, not 32), so it is a mirrored
  // PAIR that overlaps into one central field — symmetric by construction.
  mirrorPatch(30, 30, 3.8, 1150);
  if (extraOre) extraOre(mirrorPatch, mirrorGem);   // per-map pockets and gem fields

  mapTech(g, g.tech2);
  // Clear a build pad around each start so the yard always fits. Five cells
  // out, not four: the Construction Yard is 4x4 (RA2 Foundation=) and the
  // opening force spawns off its corners, so a 9x9 clearing left the first
  // harvester wedged against an outcrop it had been given no room to leave.
  for (i = 0; i < 2; i++) {
    var s = g.start[i];
    for (y = s.y - 5; y <= s.y + 5; y++) for (x = s.x - 5; x <= s.x + 5; x++) {
      if (!inMap(x, y)) continue;
      g.terrain[idx(x, y)] = T_GROUND; g.ore[idx(x, y)] = 0;
    }
  }
}

// Which of the theatre's TWO ground materials each cell wears. RA2's LAT
// sets exist because a theatre has more than one ground -- grass and sand,
// snow and scoured earth, pavement and dirt -- laid down in patches that
// blend at their boundary. This is pure decoration (nothing reads it but
// the renderer), so it runs off a cell hash and never touches rnd(): the
// simulation's stream must stay exactly where the generator left it.
function computeGroundMat(g) {
  var sd = (g.seed || 1) >>> 0;
  function hs(a, b, k) {
    var v = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(sd + k, 362437)) >>> 0;
    v = Math.imul(v ^ (v >>> 13), 1274126177) >>> 0;
    return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
  }
  function vn(gx, gy, sc, k) {
    var x0 = Math.floor(gx / sc), y0 = Math.floor(gy / sc);
    var fx = gx / sc - x0, fy = gy / sc - y0;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = hs(x0, y0, k), b = hs(x0 + 1, y0, k), c = hs(x0, y0 + 1, k), d = hs(x0 + 1, y0 + 1, k);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }
  for (var y = 0; y < MAP; y++) for (var x = 0; x < MAP; x++) {
    // Evaluate on the canonical half of the 180 deg mirror so the two
    // halves of a "fair" map carry the same ground, not just the same ore.
    var mx = MAP - 1 - x, my = MAP - 1 - y;
    var ax = x, ay = y;
    if (y * MAP + x > my * MAP + mx) { ax = mx; ay = my; }
    var v = vn(ax, ay, 10.5, 0) * 0.82 + vn(ax, ay, 4.3, 7) * 0.18;
    g.gm[y * MAP + x] = v > 0.62 ? 1 : 0;
  }
}

// Height levels. RA2 maps carry a per-cell height and the cliff tilesets
// are the WALL between two levels; a plateau's interior is a level up from
// the field around it. We derive the same thing from the terrain we already
// generate, so no generator has to be rewritten and passability is
// untouched: a cliff top is level 1, any ground the map border cannot reach
// without crossing a cliff is ENCLOSED and therefore also level 1, and a
// ramp interpolates between the two ends of its run.
function computeHeight(g) {
  var i, x, y, n = MAP * MAP;
  var hi = new Uint8Array(n);                    // 1 = level 1
  for (i = 0; i < n; i++) if (g.terrain[i] === T_CLIFF) hi[i] = 1;
  // Flood the LOW level in from the border. Anything a flood cannot reach
  // is behind a cliff ring, i.e. on top of a plateau.
  var open = new Uint8Array(n), q = [], qi = 0;
  function push(xx, yy) {
    if (xx < 0 || yy < 0 || xx >= MAP || yy >= MAP) return;
    var j = yy * MAP + xx;
    if (open[j] || hi[j] || g.terrain[j] === T_RAMP) return;
    open[j] = 1; q.push(j);
  }
  for (x = 0; x < MAP; x++) { push(x, 0); push(x, MAP - 1); }
  for (y = 0; y < MAP; y++) { push(0, y); push(MAP - 1, y); }
  while (qi < q.length) {
    i = q[qi++]; x = i % MAP; y = (i / MAP) | 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  for (i = 0; i < n; i++) if (!open[i] && g.terrain[i] !== T_RAMP) hi[i] = 1;
  // Ramp runs: BFS the distance through ramp cells to the low ground and to
  // the high ground, so a two-cell ramp climbs in even steps instead of
  // jumping a level per cell.
  var dLo = new Int16Array(n), dHi = new Int16Array(n);
  function bfs(dist, wantHi) {
    var qq = [], k = 0, j;
    for (j = 0; j < n; j++) {
      dist[j] = 32000;
      if (g.terrain[j] === T_RAMP) continue;
      // A CLIFF is high ground by definition (hi[] is seeded from it), so
      // it seeds the uphill BFS. It used to be skipped, and the cost was
      // Chokepoint Pass: its ridge runs corner to corner with open field on
      // both sides, so no cell anywhere is enclosed, nothing but the wall
      // itself is ever level 1, and both passes -- whose only high
      // neighbour IS the wall -- found no uphill end, fell into the "a ramp
      // that climbs nothing" case and stayed dead flat. The ridge on the
      // map named for it was scenery you walked straight through. With the
      // wall seeding, each pass now climbs out of the field, crests inside
      // the band and drops down the far side, which is what a pass IS.
      // Passability is untouched: hf is read only by hPx/sy, i.e. by where
      // a thing is DRAWN, never by the movement grid.
      if ((hi[j] ? 1 : 0) === wantHi) { dist[j] = 0; qq.push(j); }
    }
    while (k < qq.length) {
      var c = qq[k++], cx = c % MAP, cy = (c / MAP) | 0, d = dist[c] + 1, e;
      for (e = 0; e < 4; e++) {
        var nx = cx + (e === 0 ? 1 : e === 1 ? -1 : 0), ny = cy + (e === 2 ? 1 : e === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= MAP || ny >= MAP) continue;
        var nj = ny * MAP + nx;
        if (g.terrain[nj] !== T_RAMP || dist[nj] <= d) continue;
        dist[nj] = d; qq.push(nj);
      }
    }
  }
  bfs(dLo, 0); bfs(dHi, 1);
  for (i = 0; i < n; i++) {
    if (g.terrain[i] === T_RAMP) {
      // A ramp with nothing high at either end (the Chokepoint wall's own
      // passes) is simply flat rock, not a slope to nowhere.
      g.hf[i] = (dHi[i] > 16000) ? 0 : dLo[i] / (dLo[i] + dHi[i]);
    } else g.hf[i] = hi[i];
    if (g.hf[i] > 0) g.hiAny = 1;
  }
  // Gradient inside each ramp cell, from the two cells the slope runs
  // between: h is continuous across the boundary, so a tank does not jerk.
  for (y = 0; y < MAP; y++) for (x = 0; x < MAP; x++) {
    i = y * MAP + x;
    if (g.terrain[i] !== T_RAMP || g.hf[i] <= 0) continue;
    var hL = x > 0 ? g.hf[i - 1] : g.hf[i], hR = x + 1 < MAP ? g.hf[i + 1] : g.hf[i];
    var hU = y > 0 ? g.hf[i - MAP] : g.hf[i], hD = y + 1 < MAP ? g.hf[i + MAP] : g.hf[i];
    g.hgx[i] = (hR - hL) / 2; g.hgy[i] = (hD - hU) / 2;
  }
}

var mapId = MAPS[lsGet('vibetop:rts:map')] ? lsGet('vibetop:rts:map') : 'frontier';

// --- generated ---
// ESM import bindings are read-only, so a write from another module goes
// through the owner. Reads stay verbatim everywhere: the binding is live.
function setMapId(v) { mapId = v; }

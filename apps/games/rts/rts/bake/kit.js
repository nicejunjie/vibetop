// Iron Frontier — bake/kit.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.





// --- isometric solids -------------------------------------------------
// Everything with volume is drawn as a box in the same projection as the
// ground: a top face, two lit side faces and a dark outline. An earlier
// pass drew a flat quad plus a bright ellipse, which at unit scale read as
// a glowing bead rather than a tank.
// dir is an angle in GRID space. It has to be rotated there and only then
// projected, or a box at dir=0 comes out as a screen-aligned rectangle
// instead of a diamond — which is why the first pass looked like furniture
// and tank barrels pointed straight down the screen.
var ISO_X = TW / 2 / Math.hypot(TW / 2, TH / 2);   // unit grid +X in screen px

var ISO_Y = TH / 2 / Math.hypot(TW / 2, TH / 2);

function isoBox(g, cx, cy, len, wid, hgt, dir, col, outline) {
  var cd = Math.cos(dir), sd = Math.sin(dir);
  var fx = ISO_X * (cd - sd), fy = ISO_Y * (cd + sd);          // forward
  var sxv = ISO_X * (-sd - cd), syv = ISO_Y * (-sd + cd);      // sideways
  var hl = len / 2, hw = wid / 2;
  // four ground corners, clockwise
  var g0 = [cx + fx * hl + sxv * hw, cy + fy * hl + syv * hw];
  var g1 = [cx + fx * hl - sxv * hw, cy + fy * hl - syv * hw];
  var g2 = [cx - fx * hl - sxv * hw, cy - fy * hl - syv * hw];
  var g3 = [cx - fx * hl + sxv * hw, cy - fy * hl + syv * hw];
  var pts = [g0, g1, g2, g3];

  // Each face is graded top-to-bottom with a lit top rim, the same
  // treatment the structure walls get. Flat single-tone faces are what kept
  // vehicles reading as plastic next to buildings that had surface depth.
  function face(p, q, col2, f) {
    g.beginPath();
    g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]);
    g.lineTo(q[0], q[1] - hgt); g.lineTo(p[0], p[1] - hgt);
    g.closePath();
    var top = Math.min(p[1], q[1]) - hgt, bot = Math.max(p[1], q[1]);
    var grd = g.createLinearGradient(0, top, 0, bot + 0.5);
    grd.addColorStop(0, shade(col2, f * 1.18));
    grd.addColorStop(0.55, shade(col2, f));
    grd.addColorStop(1, shade(col2, f * 0.80));
    g.fillStyle = grd; g.fill();
    if (NO_RIM) {
      // Smooth vehicle bakes suppress the heavy construction outlines, but
      // a completely unmarked face reads as flat plastic. A hairline on the
      // upper break restores the thin specular edge visible on RA2 voxel
      // panels without turning every primitive into a LEGO outline.
      if (hgt > 1.0) {
        g.strokeStyle = 'rgba(224,231,235,.30)'; g.lineWidth = 0.55;
        g.beginPath(); g.moveTo(p[0], p[1] - hgt); g.lineTo(q[0], q[1] - hgt); g.stroke();
      }
      if (hgt > 2.4 && Math.hypot(q[0] - p[0], q[1] - p[1]) > 3.5) {
        g.strokeStyle = 'rgba(24,29,35,.16)'; g.lineWidth = 0.42;
        g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0], p[1] - hgt); g.stroke();
      }
      return;
    }
    if (outline) { g.strokeStyle = outline; g.lineWidth = 0.7; g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,.20)'; g.lineWidth = 0.8;   // lit top rim
    g.beginPath();
    g.moveTo(p[0], p[1] - hgt); g.lineTo(q[0], q[1] - hgt); g.stroke();
  }
  // Draw the far walls first, then the near ones, so the near faces win.
  var order = [0, 1, 2, 3].sort(function (i, j) {
    return ((pts[i][1] + pts[(i + 1) % 4][1]) - (pts[j][1] + pts[(j + 1) % 4][1]));
  });
  for (var k = 0; k < 4; k++) {
    var i = order[k], q = (i + 1) % 4;
    var mid = (pts[i][1] + pts[q][1]) / 2 - cy;
    face(pts[i], pts[q], col, mid > 0 ? 0.80 : 0.58);
  }
  g.beginPath();
  g.moveTo(g0[0], g0[1] - hgt); g.lineTo(g1[0], g1[1] - hgt);
  g.lineTo(g2[0], g2[1] - hgt); g.lineTo(g3[0], g3[1] - hgt);
  g.closePath();
  var ty0 = Math.min(g0[1], g1[1], g2[1], g3[1]) - hgt;
  var ty1 = Math.max(g0[1], g1[1], g2[1], g3[1]) - hgt;
  var tg = g.createLinearGradient(0, ty0, 0, ty1 + 0.5);     // deck falls off to the rear
  tg.addColorStop(0, shade(col, 1.24));
  tg.addColorStop(1, shade(col, 1.02));
  g.fillStyle = tg; g.fill();
  if (outline && !NO_RIM) { g.strokeStyle = outline; g.lineWidth = 0.7; g.stroke(); }
  return { f: [fx, fy], top: hgt };
}

function shadowBlob(g, cx, cy, rx, ry) {
  g.fillStyle = 'rgba(0,0,0,.38)';
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 6.29); g.fill();
}

// Sprites share one canvas size and one anchor rule: the unit's ground
// point sits at (w/2, h - UPAD), so drawing is always the same expression.
//
// Readability rule for the whole sprite set: the FACTION colour says whose
// it is, a fixed ACCENT colour says what it is. Without that second axis
// every unit was a blue box and players could not tell a harvester from a
// tank — which is the difference between reading a battle and guessing.
//
// PLAYER COLOUR IS THE ONLY SATURATED BLUE OR RED ON A UNIT. That rule is
// load-bearing for friend-or-foe: while the Grizzly carried navy deck
// insets and the Prism a navy hull, a RED-owned Allied tank still showed
// blue plates and players read the wrong side at a glance. Every structural
// colour is now a neutral (silver, grey, olive, tan, chrome); `col` is the
// one chromatic note, and it is placed where it survives at 1:1 — the flank
// skirt band and one horizontal surface per unit, so it reads both from
// above and side-on. Budget is roughly a fifth of the sprite: enough to
// name the side, not so much that every vehicle is a coloured brick.
//
// The sheet is 104x90, not 84x68, and UPAD grew with it. Two separate
// clips lived on the old sheet:
//   * WIDTH — at the two BROADSIDE facings (3 and 7) the forward axis is
//     purely horizontal and worth 1.26 screen px per unit, so a gun long
//     enough to read as a gun ran off an 84px sheet and came back with its
//     muzzle sliced flat (the Apocalypse lost eight solid pixels off each
//     barrel). Shortening the guns instead would have cost the silhouette
//     that names the tank, so the sheet grew.
//   * HEIGHT — a track box reaches about 17px BELOW the ground anchor at
//     the three-quarter facings, and UPAD only reserved 13, so every
//     vehicle's near track corner was shaved off. UPAD and the canvas
//     height moved together (h - UPAD is unchanged at 63), so the sprites
//     sit exactly where they always did and drawUnit needs no edit.
//   * HEIGHT, again, for the FLEET. The room ABOVE the anchor scales with a
//     kind (`63 * VSC`) but the room below it was a flat 27 for everything,
//     so the biggest hulls ran off the bottom of their own sheet: MEASURED,
//     the Aircraft Carrier lost about 6 px of her near deck corner on 16 of
//     32 bearings and the Dreadnought about 1. It predates the naval pass —
//     14 Carrier bearings clipped before it — and was left alone then only
//     because it collided with concurrent work. 27 -> 40, with every sheet
//     height written as (room above) + UPAD so one constant governs both
//     and `h - UPAD` is unchanged: the sprites sit exactly where they did
//     and drawUnit still needs no edit, which is the same trick the width
//     fix above used.
var UPAD = 40;

var USC_I = 1.22, USC_V = 1.46;

function unitCanvas() { return mkCanvas(104, 63 + UPAD); }

var ACCENT = {
  // PALE STEEL POT, and it went UP from #9ba2ab for a measured reason. §2.1
  // asks this helmet for "a value distinct from both torso and legs"; banded
  // off the bake it measured 0.465 against a torso at 0.539 — a gap of 0.073
  // where the clause check reads "distinct" as 0.10. Darkening is the
  // intuitive move and it is the wrong one: at #767d87 the gap is a healthy
  // 0.172 and `rifle | conscript` falls to 11.8 against a 12.2 friend-vs-foe
  // floor, because the Conscript's own cap is #2f3540 and a darker G.I.
  // helmet walks straight into it. Brightening moves AWAY from the twin, and
  // it is what the pair wanted: `rifle | conscript` left the worst-eight list
  // entirely and the Directorate sidebar's worst pair, `GI | Spy`, went
  // 53.6 -> 55.4. Paired with helmet()'s `hef` shell edge floor, since a
  // brighter FILL alone tops out at a 0.115 gap even at near-white.
  rifle:     '#999999',   // GREY POT HELMET over the GI's house-colour torso block
  conscript: '#999999',   // his DARK flat-crowned cap; the Conscript's remap is his TUNIC
  rocket:    '#ffbe45',   // amber warhead (Guardian) / amber shell drum (Flak)
  tank:      '#39415a',   // gunmetal barrel
  lancer:    '#3a3f4c',   // neutral grey deck insets on a pale hull
  mammoth:   '#17181c',   // gun-black twin barrels
  spectre:   '#dfe9f5',   // small mirror face on a grey head (Prism Tank art)
  mcv:       '#e0a33c',   // amber folded-crane boom on a grey crawler
  harv:      '#b0955a',   // tan slatted ore bin
  engineer:  '#e8c33c',   // amber hard hat — the engineer's one loud surface
  // BLONDE, which is what §2.3's row for her actually says: "bare pale
  // limbs + a bright blonde 2x2 head — the HIGHEST-VALUE head on the field
  // over the lowest house-colour fraction in RA2 (14.3%)". We drew it
  // near-black, and near-black hair over tan skin is the attack dog's own
  // palette — which is why `dog | tanya` has been pinned at the
  // friend-vs-foe floor in the fit window. A bright head is a note the dog
  // cannot carry, and it is the reference's.
  tanya:     '#e8d489',   // bright blonde — the highest-value head on the field
  ifv:       '#e6eaf0',   // white lower body under the blue flank stripe
  mirage:    '#e9edf2',   // the ribbed white emitter stack on the deck
  rhino:     '#2b2f36',   // NEUTRAL gunmetal barrel. The Lancer's navy put an
                          // OPPOSING hue on a Soviet tank (4.4% of the sprite).
  flaktrack: '#d9dee5',   // pale flak shield over the tracked bed
  v3:        '#e6e7e9',   // the white rocket that IS the silhouette
  drone:     '#a9b0bb',   // bare metal carapace
  teslatank: '#dfe6ee',   // pale coil windings
  teslatrooper: '#c3cbd6',// steel helmet bowl and gauntlet
  ivan:      '#6f4c2c',   // his beard — the only bare face under a fur hat
  flak:      '#ffbe45',   // amber shell drum, as the Flak Trooper art under `rocket`
  rocketeer: '#9aa3ae',   // steel flight suit; the jets are the loud part
  desolator: '#4de04a',   // the rad cannon's green muzzle glow — his one loud surface
  cleg:      '#cfe4f5',   // the bone-white helmet dome and the rifle's cold coil
  spy:       '#d8d2c4',   // the pale shirt strip down the house-colour overcoat
  yuri:      '#a86ff0'    // psychic violet at the temples
};

function outline(g, col) { g.strokeStyle = col; g.lineWidth = 1; g.stroke(); }

// A soldier, drawn front-on and small. Silhouette separates the types: the
// GI keeps his elbows in and the rifle angled across his chest, the
// Conscript is a flared tunic over tan trousers with a bedroll on his back,
// the Rocketeer carries a shoulder weapon whose SHAPE is the faction tell —
// a stubby missile tube for the Directorate's Guardian GI, a long silver
// flak cannon at the hip for the Collective's Flak Trooper.
//
// RA2 puts infantry in a DRAB uniform and remaps only the helmet and a
// narrow chest plate to the house colour, and it inverts the layout between
// armies: the GI is colour on the HELMET + CHEST over olive limbs, the
// Conscript is colour on the HELMET + a shoulder yoke over a tan tunic.
// An earlier pass ran the GI to about 45% house colour — vest, both
// pauldrons and both sleeves — which is mass, not trim, and it is what made
// him read as a plastic figure rather than a soldier in a uniform.
// THE LEG ZONE'S VALUE IS AN IDENTITY CHANNEL, and it was being wasted.
// Reference §1.5 rule 9 names three levers on a 12x27 man: the leg zone's
// value, the presence of a leg split, and one prop. At the size infantry are
// actually DRAWN — 14-28 px wide at zoom 1, 8-15 at ZMIN — the prop is one or
// two pixels and the split is barely there, so the leg value is doing most of
// the work on its own.
//
// Measured on a real frame with tools/legibility.js (every unit against every
// other at EVERY combination of their eight facings, on grass, at the size
// they are drawn): SIX infantry pairs came out less distinguishable than the
// same unit in the other owner's colours — ivan|yuri, ivan|spy, tanya|spy,
// conscript|tanya, tanya|ivan, conscript|spy. Every one of them is a pair
// sharing a leg-value band, and three of them shared a HUE as well: the
// Tesla Trooper, Ivan and Yuri were all navy at L 36/40/43.
//
// So the four movable ones are spread across the range, each keeping a
// plausible colour for who it is: Ivan to warm brown (L 50), Yuri to a purple
// greatcoat (70), the Spy to a lighter blue-grey suit (95), Tanya to light
// khaki (133). The Conscript stays tan at 114 because §2.2 pins it (it is the
// GI's twin and the leg hue is the whole separation), and the GI stays olive.
// Nobody moved more than one band, and no two of the five now sit within 18 L
// of each other.
var TROOP = {
  rifle:     { coat: '#333300', boot: '#22242a', skin: '#d8a878' },  // olive fatigues
  conscript: { coat: '#663333', boot: '#1e2026', skin: '#d8a878' },  // TAN trousers (>=20 hue-deg off the GI's olive: ref §2.2)
  rocket:    { coat: '#49512f', boot: '#22242a', skin: '#d8a878' },  // Guardian GI: heavy olive
  rocketS:   { coat: '#575049', boot: '#22242a', skin: '#d8a878' },  // Flak Trooper: grey-brown
  engineer:  { coat: '#e9e5d6', boot: '#6d6653', skin: '#d8a878' },  // NEAR-WHITE hazmat coverall — the only light-value body on the field (ref §2.1). The boot stays DARK on purpose: it is worth 0.005 of the value gate, and a near-white figure needs one dark note at the ground or he floats
  // DARK combat trousers, not light khaki. At L=133 khaki she was the same
  // value and nearly the same hue as the attack dog's tan coat, and
  // `dog | tanya` has sat at 12.5 in the fit window — exactly ON the
  // friend-vs-foe anchor — for as long as that anchor has been below it.
  // The anchor is a MEDIAN over the roster, so the 2026-09-10 size pass
  // raised it (most vehicles grew, so the median unit's own blue-vs-red
  // distance went up) and the pair fell under. Fixing the pair beats
  // holding the anchor down, and §2.3's row for her is "BARE PALE LIMBS +
  // a bright head" over "the LOWEST house-colour fraction in RA2 (14.3%)"
  // — a contrast read that a light khaki body cancels out.
  tanya:     { coat: '#2f3138', boot: '#15171c', skin: '#e6b98f' },  // dark combat trousers, L=49
  teslatrooper: { coat: '#1e2338', boot: '#868d97', skin: '#d8a878' },// navy armour, steel greaves
  ivan:      { coat: '#3b2f26', boot: '#4a4e57', skin: '#dfae82' },   // WARM BROWN trousers, L=50, grey boots
  rocketeer: { coat: '#6f7782', boot: '#2a2e35', skin: '#d8a878' },   // grey pressure suit
  // Read off ra2-deso-RA2_Desolator_{Render,Manual_Render}: a charcoal
  // hazard suit with the house colour on the plates, heavy black boots.
  desolator: { coat: '#3a3d45', boot: '#191b20', skin: '#d8a878' },
  // Read off ra2-cleg-CC_Legion_Chrono_Legionnaire + the sprite animation:
  // a PALE suit — bone-white plate over pale blue-grey underlayer.
  // ...and the suit is a NEUTRAL steel, not a blue-grey. #8f97a6 is 12
  // hue-degrees off the Directorate's own #4aa3db with the same sign on
  // both chroma axes, so at 60x48 the anti-aliasing between a silver plate
  // and an owner-blue one has nowhere to land and the two fuse. #a8aab0
  // carries the same value read (he is still the pale figure) with the blue
  // cast taken out, which is what makes the shell separate from the ring.
  cleg:      { coat: '#a8aab0', boot: '#40454f', skin: '#dcae84' },
  // Read off ra2-spy-RA2_Spy_Manual_Render. `coat` is his DRAB zone — the
  // hat, the lapel facings, the hem below the coat and his shoes; the coat
  // body itself is the house block (§1.5 heads his middle column "mid zone
  // (HOUSE)"), which is what took him off `hue.infantryBelowBudget`.
  // ...and that drab zone is CAMEL CLOTH, warm and LIGHT. `coat` is every
  // non-house surface on him — the lapel facings, the hem's vent, the
  // fedora's crown and brim — so it is ONE token over the largest area he
  // has, and at #58606f all of it was a cool blue-grey sitting 12
  // hue-degrees from the house coat it was supposed to divide. On the 60x48
  // plate the hat therefore read as a HELMET and the man as one blue mass,
  // which is why `GI | Spy` was the worst pair in the Directorate sidebar.
  //
  // LIGHT, and the direction was measured rather than assumed. Split into a
  // 4x4 grid, `GI | Spy` is 63% LUMINANCE, and the Spy's chest band was
  // already the brighter of the two (L 135 against 103) while his head was
  // the darker (116 against 180). A dark overcoat therefore moves him
  // TOWARD the G.I., and it did: the whole-figure darkening sweep measured
  // 56.2 -> 55.3 and was reverted. The separation he already has is
  // "dark head, light body", which is a camel overcoat under a felt hat —
  // and the hat keeps its own dark constant so the pair does not collapse
  // back into one value.
  // THE SATURATION IS A CEILING, and it was swept rather than chosen.
  // Camel is low-chroma, so this token costs `colour.infantry.meanDist`
  // (a hue-histogram metric that only bins pixels at s > 0.12): 1.3825 ->
  // 1.3513, against a plan target of 0.45. Pushing it back toward gold does
  // buy some of that back AND a point of `GI | Spy` — but it walks into
  // Tanya, who is the roster's other warm figure:
  //     #d6c6a6  GI|Spy 61.1  meanDist 1.3513  ZMIN min 9.1, 0 confusable
  //     #e0bd7d  GI|Spy 62.1  meanDist 1.3565  ZMIN min 8.9, 0 confusable
  //     #d8b877  GI|Spy 61.9  meanDist 1.3563  ZMIN min 8.9, ONE CONFUSABLE
  //     #dcb469  GI|Spy 62.5  meanDist 1.3575  ZMIN min 8.8, ONE CONFUSABLE
  // One point of a cameo pair is not worth spending the map's own hard
  // gate, so the LOW-chroma rung is the one that ships. Recorded so nobody
  // re-runs the sweep hoping the trade is free.
  spy:       { coat: '#d6c6a6', boot: '#191b21', skin: '#e2b78e' },   // CAMEL overcoat cloth, L=196
  // No RA2 sprite rip could be found for Yuri on the wiki (searched
  // ns:File "Yuri RA2"/"Yuri Render"/"Yuri Cameo" — nothing); built from
  // the unit's description instead: bald, pale, long high-collared coat.
  yuri:      { coat: '#5e5180', boot: '#191622', skin: '#e6cdbd' }   // 2026-09-10: lighter violet; ivan|yuri fell under the friend-vs-foe floor when the vehicles' owner colour raised the median
};

// WHERE EACH KIND SITS ON THE VALUE LADDER — the gamma `valuePass` applies
// to the finished sprite (>1 darker, <1 lighter; 1 or absent = untouched).
// See the note on `valuePass` for why this is a whole-figure transform and
// not fourteen palette edits.
//
// The ladder is READ OFF the measurement, then checked against who the man
// is. Before it, fourteen kinds sat between mean L 69 and L 120 with nine of
// them inside twenty points, and `legibility.js` reported eleven pairs less
// distinguishable than a colour swap of one unit. Each number below is the
// one that separates that kind from the kinds it was measured against, and
// each is a value the unit can plausibly wear:
//
//   Ivan       darkest man on the field  — a civilian in a heavy dark
//              greatcoat and a fur hat, and the one kind in FIVE of the
//              eleven failing pairs
//   Desolator  a charcoal hazard suit, per its own reference render
//   Conscript  dark khaki: the Directorate GI's twin, told apart by value
//              first and the tan/olive leg hue second
//   Rifle      mid olive-drab — the roster's reference value, unmoved
//   Spy        LIGHT: a pale trench coat and hat is what a spy wears, and
//              it takes him off Ivan, the Conscript and Tanya at once
//   Rocketeer  a pale pressure suit (already his palette, now his whole
//              figure), which is also what lifts him off the GI
//   Chrono Leg bone-white plate, as `ra2-cleg-CC_Legion` shows it
//   Tanya      the lightest soldier: light khaki, bare arms, blonde
//   Engineer   brightest thing in either army, which is the point of him
//
// Untouched, because the measurement does not ask: the Guardian GI, the
// Flak Trooper, the Tesla Trooper, Yuri and the dog (whose 0.57 saturation
// already separates him from every man in the game).
var INF_VALUE = {
  ivan:      [1.73, 1.60, 1.43],   // darkest man on the field; the uneven
                                   //  channels DESATURATE as they darken -- a
                                   //  flat gamma turns his brown coat into a dark
                                   //  RED one, which is the enemy's hue
  desolator: 1.14,                 //  a charcoal hazard suit
  conscript: [0.92, 0.94, 0.98],   //  dark, and TAN against the GI's olive
  rifle:     [0.90, 0.86, 0.92],   //  unmoved in value, pushed onto olive
  yuri:      0.95,                 //  a step up from Ivan in value alone: his coat
                                   //  is already violet, and tilting it further
                                   //  lands on one owner's hue or the other's
  spy:       [0.72, 0.69, 0.62],   //  light, and COOL: a pale trench coat
  // NOT MOVED, and the reason is worth writing down, because the obvious
  // read of this rung is that it is wrong. It IS wrong as fidelity: measured
  // off the baked sprite, [0.50,0.70,1.05] is a 0.55 channel spread, and a
  // 0.55 spread does not lighten a grey suit, it repaints it — #8d959f comes
  // out (190,175,155) in the lights and (154,131,100) in the mids, so the
  // finished Rocketeer is BROWN, against an RA2 plate that is the whitest
  // thing in the Allied roster (white armour on white cloud).
  //
  // But the brown is doing legibility work nobody had written down: it is
  // the only thing holding him off the SPY, the roster's other pale figure.
  // Three whiter rungs, each measured with tools/legibility.js against the
  // CELL 96 windows' own floors, and all three FAIL:
  //     [0.80,0.76,0.68] cool silver  -> rocketeer|spy 8.9 vs floor 8.9  X
  //     [0.68,0.72,0.78] neutral grey -> rocketeer|spy 12.1 vs floor 12.2 X
  //     [0.58,0.70,0.90] warm bone    -> rocketeer|spy 8.9 vs floor 8.9  X
  // (baseline, this rung: 9.5 and 12.4, both clear). Whitening him means
  // re-planning the SPY's rung too — he is only "light and cool" because an
  // earlier pass moved him off Ivan, the Conscript and Tanya, and RA2's own
  // Spy plate is a man in a DARK suit — and that is a two-unit change with
  // its own sweep, not something one unit's pass should land blind.
  //
  // THAT SWEEP HAS NOW BEEN RUN, and it is NOT a two-unit change. Darkening
  // the Spy does free the Rocketeer exactly as predicted — `rocketeer|spy`
  // goes 12.4 -> 13.2/13.3 against the 12.2 floor, comfortably clear, and
  // BOTH units move TOWARD their RA2 plates rather than away. But all three
  // candidates break a pair nobody had listed, `engineer|spy`, which the
  // pale Spy was holding open:
  //     spy[0.40,0.42,0.50] rocketeer[0.86,0.88,0.92] -> engineer|spy  8.3 (floor 8.9) X
  //     spy[0.34,0.36,0.44] rocketeer[0.82,0.86,0.94] -> engineer|spy  8.3 (floor 8.9) X
  //     spy[0.46,0.44,0.40] rocketeer[0.90,0.90,0.90] -> engineer|spy  8.7 (floor 8.9) X
  // (all at CELL 96 ZMIN, each against that window's own floor.) The
  // Engineer is "brightest in either army, and neutral", so he sits at the
  // pale end with nothing but the Spy's own paleness between them — move the
  // Spy anywhere dark and the Engineer inherits the collision.
  //
  // The three-way sweep was then RUN, and it settles the question in a way
  // no rung candidate could:
  //
  //   * Colour alone never clears it. Three engineer rungs (bright, warm,
  //     gold) all leave engineer|spy at 8.0-8.3 against the 8.9 floor. The
  //     Engineer and the Spy are the same size class — both "i-S 13x25",
  //     both plain standing men with a small prop — so the pale Spy was
  //     compensating for a SHAPE collision with colour.
  //   * STATURE does clear it. engineer[1.22,0.76] + spy[0.76,1.00] +
  //     tanya[1.04,0.88] reaches ZERO confusable infantry at both zooms
  //     (CELL 96 min 12.2 / 9.0 against floors 12.2 / 8.9).
  //   * AND IT BUYS NOTHING, because the roster was ALREADY at zero
  //     confusable. It cost CELL 96 z1 min 12.4 -> 12.2 and
  //     hue.infantryOwnerMean 0.296 -> 0.292 for no gain. Reverted.
  //
  // THE REAL BLOCKER, and it is not the Spy at all: THE LADDER CANNOT
  // WHITEN HIM. Looked at beside RA2's plate after the whitest rung, our
  // Rocketeer is still blue-grey and our Spy still blue — because what a
  // player sees of either figure is mostly OWNER COLOUR, not coat, so a
  // multiplier on the coat moves almost nothing. This is the same finding
  // the value-ladder pass measured from the other end (moving ivan.coat by
  // 29 L moves the composited man by 1.8).
  //
  // So whitening the Rocketeer is not a rung problem and not a three-unit
  // problem. It needs his OWNER-COLOUR BUDGET redistributed — less blue
  // area, more white plate — which is R1-R6 silhouette-and-zone work on one
  // unit, with the owner-signal floor (hue.infantryOwnerMean >= 0.29) as the
  // binding constraint. Do not reach for the ladder again.
  rocketeer: [0.74, 0.74, 0.76],   //  a light CREAM pressure suit
  cleg:      [0.74, 0.71, 0.64],   //  bone-white plate over blue-grey
  tanya:     [0.45, 0.58, 0.70],   //  warm khaki, bare arms, blonde
  engineer:  [0.62, 0.64, 0.60],   //  brightest in either army, and neutral
};

// THE EDGE FLOOR — the second half of the value ladder, and the half that
// was missing. INF_VALUE moves a trooper's FILLS; it cannot move his EDGES,
// because every edge on an infantryman is `shade(surface, 0.38..0.62)` and a
// gamma that lifts the fill lifts the edge with it, keeping the ratio.
//
// At 21x34 that ratio is the whole picture. Measured on the Engineer, the
// one shade — his shirt outline at 0.52 — covered 3.9% of the sprite where
// the shirt FILL covered 2.9%: the edges are the larger surface, and a
// figure whose every edge is drawn at half its own value cannot be light
// whatever the fills say. His §2.1 read is INVERTED VALUE ("a near-white
// hazmat body ... the only light-value soldier on the field"), which is a
// statement about the whole silhouette, so the edges have to come with it.
//
// A FLOOR, not a multiplier: `Math.max(f, EDGE)` leaves every lit face
// (1.02-1.42) exactly where it was and only lifts the dark side, so the
// direction of the light never changes — the man is still lit from the same
// corner, on a shorter value range. Absent from this table means 0, i.e.
// `edge()` IS `shade()` and no other trooper moves by a pixel.
var INF_EDGE = {
  engineer: 0.70,                //  a white hazmat suit shaded to 0.70, not to 0.38
  // ...and the Chrono Legionnaire, for the same arithmetic on a different
  // clause. §1.5 calls his suit SILVER and his own drawing block calls him
  // "the PALEST figure on the field", and neither was true of the pixels:
  // measured whole-sprite he sat at 0.193 light, fourth in the roster,
  // because a powered suit is nearly all panel EDGE at 26 px and every one
  // of those edges was drawn at 0.42-0.46 of its own fill.
  cleg:     0.64,
};

// STATURE — the size class, which our roster did not have. RA2's twelve
// infantry span 24 px (Rocketeer) to 37 px (Flak Trooper) tall and 12 px
// (GI, Ivan, Yuri) to 18 px (Tesla Trooper) wide; ours all came out
// 34-39 x 16-22, a x1.15 height band where RA2 has x1.54. That is why
// seven of them had a PEER matching their outline better than they matched
// themselves from another bearing: with the same build at the same size,
// the only thing left to tell two troopers apart is the props, and the
// props are 8% of the mask.
//
// So every kind gets an [x, y] scale about its own ground anchor, chosen so
// the roster reproduces RA2's RELATIVE proportions (unit-identity-reference
// §2.1/§2.2's `size class` and the counterpart's measured w x h, normalised
// to our own scale: about 1.43x on width and 1.30x on height). It is one
// transform on the whole figure, applied outside everything else, so the
// man, his weapon and his shadow scale together and the boots stay planted
// — nobody is re-posed and nobody is contorted. A shorter man is a shorter
// man, which is exactly how RA2 makes a Rocketeer not a Guardian GI.
//
// The three units NOT scaled to their RA2 number:
//   * `flak` stays a normal-sized man. RA2's Flak Trooper is 37 px because
//     of the CANNON above his helmet, not because he is a giant; his extra
//     height is bought in the barrel below, and scaling him 1.30 would have
//     made a nine-foot soldier instead.
//   * `dog` keeps his width — the quadruped spine, the one infantry
//     silhouette that already reads.
// Tallest first, which is the order a player reads them in. The x:y ratio
// of each pair also tracks the RA2 counterpart's own aspect against the
// Conscript's (13x27): Yuri 0.84 against RA2's 0.86, the Tesla Trooper 1.35
// against 1.34, the Rocketeer 1.30 against 1.38 — so nobody is stretched
// into a shape RA2 does not give him, they are only sized apart.
//
// ...AND THE TABLE IS NOW MEASURED AGAINST RA2, not only against itself.
// `art-metrics.js` gates every unit at +-20% of its RA2 counterpart's own
// w:h (`RA2_ASPECT`, from unit-identity-reference §1.1), and four infantry
// failed it — all in the SAME direction, too WIDE, which no camera can
// explain the way the isometric projection explains the vehicles being
// short. Three are fixed here (2026-09-05); each was a different fault:
//   * `engineer` 24x28 -> 21x34 (w:h 1.65 -> 1.19 of RA2). His entry read
//     [1.22,0.76] to break two same-faction IoU pairs, which is what made
//     him a squat 28 px — the SHORTEST man in the roster where RA2 puts him
//     level with Crazy Ivan. Straightened to [0.98,0.94]; the IoU pairs are
//     held instead by his own §1.5 levers, the leg split and the toolbox,
//     which are now authored in SCREEN units so a stature change cannot
//     quietly shrink his one tell to a single column (see that branch).
//   * `tanya` 22x31 -> 18x33 (1.42 -> 1.09). Her width was NOT the pistols
//     after all — measured, the body core was 14 of the 22 and the guns
//     three columns a side. She is bracketed by Ivan (17x32) and the Spy
//     (16x35), so the height had to move with the width: [0.88,0.94] is the
//     one point that clears the Spy on IoU AND the Attack Dog on legibility
//     (at 18x31 she fell under the friend-vs-foe floor against the dog).
//   * `flak` 20x45 -> 18x47 (1.37 -> 1.18), and NOT from this table at all
//     — his barrel was swinging out sideways at the profile facings. See
//     `wpn`'s `upright` flag. The last two rows came out of the barrel,
//     which is exactly what the note above says his height is bought with.
// `cleg` is the one left outside the band, and deliberately: his rifle's
// declared 9-column spike budget and his RA2 aspect cannot both be met.
// The full measurement is recorded on the neutron rifle in his branch.
var STATURE = {
  flak:         [0.77, 0.94],   // i-XL by BARREL: a narrow man under a tall gun
  rocket:       [0.78, 0.71],   // i-M 15x30 — the Guardian is the heavy one, and
                                // deliberately NOT a tall one: §2.1/§2.2 put him at
                                // 30 px against the Flak Trooper's 37 (a ratio of
                                // 0.81), and once his missile tube was raised clear
                                // of his helmet he stood 45 rows — level with the
                                // Flak Trooper, whose entire identity is being the
                                // tallest man in the game. Two tall figures with a
                                // long weapon over the right shoulder are ONE
                                // silhouette: they became each other's nearest match
                                // at 0.605 and both failed peer-vs-self. He is 41
                                // rows now against the Flak Trooper's 45.
  yuri:         [0.87, 1.02],   // i-L 12x29 — the tallest man carrying no weapon
  desolator:    [1.14, 1.18],   // i-M — the bulk of a sealed hazard suit
  teslatrooper: [1.11, 0.87],   // i-M 18x28 — THE widest, and NOT the tallest
  rifle:        [0.81, 1.00],   // i-M 12x28 — narrow; the baseline soldier
  conscript:    [1.06, 1.01],   // i-M 13x27 — the reference figure
  cleg:         [0.83, 0.89],   // i-M 15x26 — RA2 0.577; the old [1.22,0.84] was tuned against a spike budget that misread its own citation   // i-M 15x26 — the widest Directorate shoulders
  tanya:        [0.78, 1.04],   // i-M 13x26 — and the pistols do NOT keep her wide,
                                // which is what this entry used to say. Measured, her
                                // 22 px of width was 14 px of body and three columns
                                // of gun a side; RA2 gives her a Conscript's width.
                                // 18x33 is the one point clearing BOTH neighbours she
                                // is wedged between — the Spy (16x35) on same-faction
                                // IoU and the Attack Dog on legibility, which she fell
                                // under at 18x31.
  ivan:         [0.71, 0.81],   // i-S 12x25 — the narrowest of the Collective
  engineer:     [0.75, 0.84],   // i-S 13x25 — a workman, not a soldier: broader in
                                // the shoulder than a rifleman, and NOT the squat one
                                // he was. This read [1.22,0.76] to break two
                                // same-faction IoU pairs (his own, since he is shared
                                // and pairs with every trooper in both rosters), and
                                // the price was a 24x28 man — the SHORTEST in the
                                // game where RA2 puts him level with Crazy Ivan, and
                                // 65% wider than his own plate. Those pairs are held
                                // by his §1.5 levers now, not by his proportions.
  spy:          [0.84, 0.78],   // i-S 13x25 — the slightest figure on the field
  rocketeer:    [0.97, 0.76],   // i-S 16x24 — the shortest, broadened by the pack
  dog:          [0.75, 0.96],  // i-XS quadruped. RA2 draws [ADOG] 21 wide against
                                // [E1]'s 12 — 1.75x the man. Ours was 39 against 17,
                                // 2.29x, the widest thing in the infantry group by
                                // 31%. This row existed all along and NOTHING read
                                // it: STATURE is applied on the humanoid path and a
                                // quadruped does not take it, so [1.00,1.00] read as
                                // a deliberate "leave him be" instead of dead config.
                                // bakeDog reads it now — but the value is back
                                // at 1.00, because shrinking him BREAKS
                                // `dog | tanya`. His length is the very thing
                                // that separates a quadruped from an upright
                                // figure, so the size gate and the friend-vs-foe
                                // floor pull on the same lever in opposite
                                // directions. Measured, cell96 zoom1 / zoom0.75
                                // against floors of 12 / 8.6:
                                //   [1.00,1.00]  12.5 / 9.5   size dev +31%
                                //   [0.94,0.94]  12.0 / 8.5   dev +24%
                                //   [0.90,0.90]  12.1 / 8.5   dev +18%
                                //   [0.84,0.84]  11.7 / 8.5   dev +11%
                                //   [0.94,0.86]  11.8 / 8.3   dev +24%, flatter
                                //   [1.00,0.86]  12.0 / 8.7   dev +31%, no gain
                                // Nothing below full width clears ZMIN. Flattening
                                // does not rescue it either. A legibility floor is
                                // player-facing and outranks a fidelity gap, so the
                                // debt stays until the pair is separated on COLOUR
                                // instead — both are tan masses of a size.
  _:            [1.00, 1.00],
};

// THE WALK. RA2's `[E1Sequence] Walk=8,6,6` (art.ini:9659) is SIX frames per
// facing, so the cycle is baked at six phases and drawUnit steps one every
// five ticks. The cycle is one continuous sine: `swf` is the stride (which
// leg leads and how far), `cf` the same cycle a quarter turn on, which is
// what keeps all six frames distinct — on stride alone phases 1 and 2 (and
// 4 and 5) come out identical and the walk reads as a three-frame twitch
// again. `phase < 0` is the NEUTRAL pose: legs together, no bob, no lean —
// the standing / firing / idle frames stand on it.
//
// The anchor rule is what makes it a walk instead of a twitch: EVERY frame
// puts the leading boot flat on `by`, so the figure's ground point never
// moves and the sprite cannot jitter between frames. What changes is which
// leg leads, which arm counter-swings, and a sub-pixel bob and lateral lean
// of everything above the hips — drawn with ONE translate so the torso,
// head and weapon move together like a body, not like separate parts.
var INF_WALK = 6;

function gait(phase) {
  if ((phase | 0) < 0) return { ph: 0, swf: 0, cf: 1, sw: 0, amp: 0, bob: 0, lean: 0 };
  var ph = ((phase | 0) % INF_WALK + INF_WALK) % INF_WALK;
  var t = (ph + 0.5) / INF_WALK * 6.283185307;
  var swf = Math.sin(t), cf = Math.cos(t);
  return { ph: ph, swf: swf, cf: cf,
           sw: swf > 0.05 ? 1 : (swf < -0.05 ? -1 : 0),
           amp: Math.abs(swf),
           bob: (1 - Math.abs(swf)) * 0.95 + cf * 0.28,
           lean: swf * 0.55 };
}

// RA2 `[E1Sequence]` (art.ini:9655) trimmed to what reads at 1:1. Every one
// of these is the SAME figure under a pose transform plus a small overlay —
// never a second hand-drawn body (the structure-state rule, applied to men).
// `fire` and `fireprone` are SIX because art.ini says six: `FireUp=164,6,6`
// and `FireProne=212,6,6` (art.ini:9660, 9664) are six frames per facing,
// exactly as `Walk=8,6,6` is. The walk was corrected to six in an earlier
// pass and the fire cycle was not, so a burst played raise / recoil /
// settle in three steps against the walk's six and read as a twitch.
var INF_SEQ = { stand: 1, walk: 6, fire: 6, down: 1, up: 1, prone: 1,
                crawl: 6, fireprone: 6, idle1: 3, idle2: 3, cheer: 2 };

// grid facing -> SCREEN octant. The iso projection sends d0 to SE, d1 to S,
// d2 to SW, d3 to W, d4 to NW, d5 to N, d6 to NE, d7 to E (see "The RA2
// vehicle sheets are FACING RINGS" in docs/design-decisions.md), and the
// octant here is measured from "straight at the camera" toward screen-right.
var INF_OCT = [1, 0, 7, 6, 5, 4, 3, 2];

// --- the facing model -------------------------------------------------
// RA2's vehicles and aircraft are VOXELS, and a voxel is rendered at 32
// bearings, not the 8 an infantry SHP carries. `u.face` (hull) and
// `u.tface` (turret) are therefore 0..31, one step = 11.25 degrees, and the
// vehicle sheets are baked LAZILY per bearing so a match pays only for the
// bearings its units actually stop on. Infantry stay at 8, because their
// art really is eight hand-drawn SHP facings — `octOf` is the one bridge
// between the two, and it ROUNDS (not truncates) so a man facing bearing 2
// or 3 stands on the same octant a 45-degree step would have given him.
var NFACE = 32, FANG = Math.PI * 2 / NFACE;

// The bearing the cameos, the menu line-up and the placement ghost crop
// from: due south, front-on to the camera (grid facing 1 of the old eight).
var ICON_FACE = 4;

// ...but a VEHICLE is not shot front-on. RA2's Grizzly plate is a 3/4 side
// hero shot: the hull runs across the frame, the treads show their length and
// the barrel points out of it. Front-on, a tank is a symmetrical blob with no
// barrel and no hull — which is exactly what ours were, while our OWN side
// bearings read as tanks instantly. Infantry stay front-on, because RA2
// shoots them as portraits and a face is a face.
var ICON_FACE_SIDE = 0;

function iconFaceOf(d) { return (d && d.cls === 'i') ? ICON_FACE : ICON_FACE_SIDE; }

function faceOf(dy, dx) { return ((Math.round(Math.atan2(dy, dx) / FANG) % NFACE) + NFACE) % NFACE; }

function octOf(f) { return (((f | 0) + 2) >> 2) & 7; }

// Shortest signed step from a to b around the 32-facing ring, in facings.
function faceDelta(a, b) {
  var d = (((b - a) % NFACE) + NFACE) % NFACE;
  return d > NFACE / 2 ? d - NFACE : d;
}

// rules.ini `ROT=` is a turn rate in RA2's own units; ROT=5 is what almost
// every tank hull and turret carries ([HTNK]/[MTNK]/[APOC]/[FV]/[HARV]...),
// a Terror Drone is 40 (it whips round on the spot), a Kirov 10 and an
// Orca/Harrier 3. One ROT point is 0.1 facings per tick here, so a ROT=5
// turret sweeps the full 32 in ~64 ticks — a hair over a second, which is
// what a Grizzly's turret looks like in RA2.
var ROT = { drone: 40, harrier: 3, kirov: 10 };

function rotOf(t) { return ROT[t] || 5; }

// A facing has to stay an INTEGER (it indexes a baked sheet), so the
// fraction a sub-facing-per-tick rate leaves over is carried in a companion
// field and folded back in next tick. `fk`/`sk` are the two field names,
// so the same routine turns a hull ('face'/'fsub') and a turret
// ('tface'/'tsub'). Returns true once it has ARRIVED.
function slew(u, fk, sk, want, rot) {
  var cur = u[fk] + (u[sk] || 0);
  var d = faceDelta(cur, want), step = (rot || 5) * 0.1;
  if (Math.abs(d) <= step) { u[fk] = want; u[sk] = 0; return true; }
  var nf = cur + (d > 0 ? step : -step), rr = Math.round(nf);
  u[sk] = nf - rr;
  u[fk] = ((rr % NFACE) + NFACE) % NFACE;
  return false;
}

// RA2 will not let a tank fire across its own deck: the turret traverses
// first and the gun speaks when it BEARS. One facing of slop (11.25 deg) is
// close enough that the shell still leaves the barrel it is drawn down.
var AIM_TOL = 1.0;

// ...but only a MACHINE traverses. Infantry are eight hand-drawn SHP
// facings with no ROT in rules.ini: a rifleman turns where he stands and
// shoots, and gating him behind a slew would be inventing a rule RA2 does
// not have.
function slews(u) { var sp = UNITS[u.type]; return !!sp && sp.cls !== 'i'; }

function aimTurret(u, want, rot) {
  if (!slews(u)) { u.tface = want; u.tsub = 0; return true; }
  if (u.tface == null) { u.tface = u.face | 0; u.tsub = 0; }
  if (slew(u, 'tface', 'tsub', want, rot)) return true;
  return Math.abs(faceDelta(u.tface + (u.tsub || 0), want)) <= AIM_TOL;
}

// Same rule for a turretless hull (V3, Terror Drone, an aircraft's nose):
// the whole vehicle is the mount, so the HULL has to come round.
function aimHull(u, want, rot) {
  if (!slews(u)) { u.face = want; u.fsub = 0; return true; }
  if (slew(u, 'face', 'fsub', want, rot)) return true;
  return Math.abs(faceDelta(u.face + (u.fsub || 0), want)) <= AIM_TOL;
}

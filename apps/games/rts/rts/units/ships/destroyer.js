// Iron Frontier — ships/destroyer: the art for one unit.
// Called by bakeShip() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.



function drawDestroyer(C) {
  var DECK = C.DECK, FR = C.FR, GLASS = C.GLASS, HD = C.HD, HL = C.HL, HOUSE = C.HOUSE, L = C.L, P = C.P,
      STEEL = C.STEEL, W = C.W, box = C.box, disc = C.disc, g = C.g, mast = C.mast,
      nearS = C.nearS;

// [DEST]: a raked stem, one turret forward, a stepped bridge tower
// amidships and the Osprey's hangar and pad right aft — RA2's
// Destroyer is THREE SEPARATED MASSES on a long narrow hull, which is
// what has to read against the Aegis's one slab on a beamy one.
//
// The crown is deliberately WIDE and short of mast. `spikeOf` scores
// the MEDIAN width of every row standing above the hull, so the old
// 13-px air-search mast was dragging a 10-px bridge down to a measured
// 4 against a 5-px budget — the Desolator-backpack trap, at sea.
//
// `box`'s `wid` is a FULL width against a hull whose beam is 2 * W, so
// every deckhouse in this file drawn at `W * 1.0` was HALF the beam —
// a superstructure narrower than the ship it stands on, and the reason
// the crown could never out-measure the stem. These are 60-80% of beam,
// which is what the RA2 sprites carry.
// THE GUN, AT THE SIZE A GUN HAS TO BE. §2.3 gives the Destroyer
// "one turret forward of amidships" as its whole read against the
// Aegis's "explicitly no barrel", and the two ships are the one pair
// `peerVsSelf.naval` still scores — the baseline's own note says it
// closes with "superstructure that differs, not a different hull
// length". A 4-unit gunhouse under a 3.0-wide barrel was 1 px of gun
// at zoom 1: the distinguishing feature existed in the code and not
// on the screen. Gunhouse up 4.0 -> 6.4 with a sloped face, barrel
// 3.0 -> 4.6 wide, and a muzzle cap so the tube ENDS somewhere.
// THE TURRET IS A ROUNDED DOME IN THE OWNER'S COLOUR. In the rip the single
// most obvious thing forward of the bridge is a smooth blue HEMISPHERE with a
// thin grey tube coming out of it over the bow — no flat faces, no boxes. Ours
// built it out of two dark grey boxes and a mantlet, so the barrel appeared to
// emerge from a crate and nothing read as a gun. A box cannot be a turret: it
// is the curve that says the thing traverses.
box(L * 0.52, 0, L * 0.26, W * 1.46, 3.2, shade(DECK, 1.08));     // barbette
(function () {
  var dq = P(L * 0.55, 0, FR + 3.2);
  for (var dr = 0; dr < 3; dr++) {                                // stacked ellipses = a dome
    var f = dr / 3;
    g.fillStyle = shade(HOUSE, 0.86 + dr * 0.26);
    g.beginPath();
    g.ellipse(dq[0], dq[1] - 0.6 - f * 2.8, 4.8 - f * 2.2, 2.6 - f * 1.2, 0, 0, 6.29);
    g.fill();
  }
  g.strokeStyle = shade(HOUSE, 0.52); g.lineWidth = 0.8;          // its shaded skirt
  g.beginPath(); g.ellipse(dq[0], dq[1] - 0.4, 4.8, 2.6, 0, 0, 6.29); g.stroke();
})();
// Four projected corners keep the steel tube rigid and one gauge end to end.
// u1 WAS 1.20: the muzzle reached so far past the stem that the sprite grew to
// 95 px in a 104 px sheet cell and TOUCHED THE EDGE at two of the eight
// octants — `clip.unitsTouchingSheetEdge` went 1 -> 2, which means the art was
// being cut off by the canvas and every measurement taken on it was of a
// truncated ship. The reference's barrel is shorter than the overhang we had
// anyway.
(function () {
  // IT WAS FLOATING, AND THAT IS WHY IT LOOKED LIKE IT POINTED THE WRONG WAY.
  // The barbette top is FR + 3.2 and the dome above it rises about 4 px; the
  // tube ran z = FR+6.7 to FR+9.1, so its underside started two and a half
  // pixels ABOVE the dome's crown with clear sky between them. A gun that does
  // not touch its own turret reads as a separate object hanging over the deck,
  // and because it sat that high it also read as elevated — aimed up and away
  // rather than out along the bow, which is what it is actually doing (u runs
  // 0.62L to 1.06L at v = 0, dead on the centreline). Dropped onto the dome and
  // started inside it, so the tube emerges from the turret instead of hovering.
  var u0 = L * 0.55, u1 = L * 1.02, z0 = FR + 5.6, z1 = FR + 7.8;
  var a = P(u0, 0, z0), b = P(u1, 0, z0), c = P(u1, 0, z1), d = P(u0, 0, z1);
  g.fillStyle = '#333333'; g.beginPath();
  g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]);
  g.closePath(); g.fill();
  var e = P(u0, 0, z1), f = P(u1, 0, z1), h = P(u1, 0, z1 - 0.8), i = P(u0, 0, z1 - 0.8);
  g.fillStyle = '#999999'; g.beginPath();
  g.moveTo(e[0], e[1]); g.lineTo(f[0], f[1]); g.lineTo(h[0], h[1]); g.lineTo(i[0], i[1]);
  g.closePath(); g.fill();
  // ...AND THE PALE BLOB AT THE END WAS HALF OF WHY IT LOOKED DETACHED. The
  // muzzle was a #999999 ellipse 1.25 x 1.65 — WIDER than the tube it caps and
  // in the deck's own value — so at map size it read as a small pale block
  // hanging in front of a thin grey line rather than as the end of a gun. The
  // vehicle bake banned exactly this on land guns ("NO PALE TIP ... reads as a
  // chrome cap"); the same rule applies afloat. A muzzle is the tube's own
  // value, no wider than the tube, with a small dark bore.
  var mq = P(u1, 0, (z0 + z1) * 0.5);
  g.fillStyle = '#6b6b6b'; g.beginPath(); g.ellipse(mq[0], mq[1], 0.95, 1.20, 0, 0, 6.29); g.fill();
  g.fillStyle = '#2e2e2e'; g.beginPath(); g.ellipse(mq[0], mq[1], 0.40, 0.58, 0, 0, 6.29); g.fill();
})();
// THE BRIDGE IS WHITE, and it is a MASS. Measured off `library/destroyer.png`
// (103x48) the superstructure is a single 18x14 px white block at x 37-53% of
// her length — 17% of the hull long and 29% of the frame TALL, and the only
// white on the ship. Ours was DECK grey at 6.2 and 11.6 units, the same value
// as the deck it stood on, so she read as a flat plate with bumps.
// WHITE, AND THE WINDOW IS A STRIP. The deckhouse baked mid-grey with a GLASS
// box 1.2 units tall across its whole width, which rendered as a big glowing
// cyan screen — the loudest thing amidships and nothing like the reference,
// where the deckhouse is the BRIGHTEST mass on the ship, clean white, with one
// hairline of dark glazing and a single house-coloured panel on its face.
box(L * 0.12, 0, L * 0.40, W * 1.62, 5.8, '#ffffff');             // bridge block
box(L * 0.10, 0, L * 0.26, W * 1.34, 9.4, '#ffffff');             // wheelhouse
box(L * 0.11, 0, L * 0.12, W * 0.86, 11.5, '#cccccc');            // low director
(function () {
  var a = P(L * 0.23, W * 0.68, FR + 8.4), b = P(L * -0.03, W * 0.68, FR + 8.4);
  g.strokeStyle = '#333333'; g.lineWidth = 1.2;                   // the glazing, a strip
  g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  // the house-coloured panel the rip puts on the deckhouse face
  var p0 = P(L * 0.10, W * 0.70, FR + 2.0), p1 = P(L * -0.02, W * 0.70, FR + 2.0),
      p2 = P(L * -0.02, W * 0.70, FR + 7.6), p3 = P(L * 0.10, W * 0.70, FR + 7.6);
  g.fillStyle = HOUSE;
  g.beginPath();
  g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]);
  g.lineTo(p2[0], p2[1]); g.lineTo(p3[0], p3[1]); g.closePath(); g.fill();
})();
// A MACK — mast and stack in one solid trunk — rather than the 13-unit
// wire mast this hull carried. Same height on the skyline, but it is
// 11 screen px wide instead of 2, so it lifts the crown's measured
// thickness instead of halving it.
// HOUSE COLOUR IN TWO TALL BLOCKS, which is how the rip spends it: 16.1% of
// the frame is house blue and it sits in a 10x15 px block at x 53-62% and a
// 10x14 at x 75-83%, both standing a third of the frame's height. The funnel
// IS one of them, not a dark grey stub with a stripe painted round it.
// THE FUNNEL IS DARK GREY, not a house-coloured tower. The rip's blue is not
// spent here at all: it is on the turret dome forward and on the aircraft's
// nacelles aft. Painting the two TALLEST masses in the owner's colour made
// her read as a blue ship with grey bits, which inverts the reference — RA2's
// Destroyer is a pale ship with blue on two small round things.
box(-L * 0.26, 0, 5.0, W * 0.70, 7.4, '#666666');                 // funnel / mack
box(-L * 0.26, 0, 3.2, W * 0.50, 9.0, '#333333');                 // its cap
g.strokeStyle = HOUSE; g.lineWidth = 1.6;                         // one house band on it
var fq = P(-L * 0.26, 0, FR + 7.0); g.beginPath();
g.moveTo(fq[0] - 4.4, fq[1]); g.lineTo(fq[0] + 4.4, fq[1]); g.stroke();
g.strokeStyle = STEEL; g.lineWidth = 1.6;                          // air-search bar on top
var rq = P(-L * 0.26, 0, FR + 9.8);
g.beginPath(); g.moveTo(rq[0] - 3.6, rq[1]); g.lineTo(rq[0] + 3.6, rq[1] - 0.6); g.stroke();
box(-L * 0.50, 0, L * 0.16, W * 1.00, 4.2, '#999999');            // a low hangar, not a tower
// TWO MASTS. The reference's top edge spikes to 44 px at 20% of her length and
// 46 px at 60%, against 25-36 px everywhere else, on a 48-px frame: nearly the
// whole of her height is mast. Ours had none at all and stood 39 to her 48.
mast(L * 0.11, 0, 16.0, '#333333');
mast(-L * 0.30, 0, 13.0, '#333333');
// AIRCRAFT REVERTED to the simple read, after two rounds of making it more
// detailed made it less legible. codex drew a full tilt-rotor — filled
// fuselage, tapered tail, canopy, rotor blades — and at the ~20 px this
// aircraft occupies, the wing and the fuselage are both gold and sit within
// 0.4 of the same z, so they merge into one mass: it baked first as a yellow
// U-bracket and then as a gold wedge with a blue cap. A viewer could name
// neither.
//
// The reference does not carry that much either. At map size RA2's aircraft
// IS a gold streak across the deck crossed by a blue upright, and that is all
// the information the sprite can hold. More parts is not more legible.
//
// THE TILT-ROTOR, AT THE SIZE IT HAS IN THE RIP. It is the one feature that
// names this ship — the Dreadnought is named by her missiles the same way —
// and ours was a 10 px lozenge lying in a dish, the same value as the deck.
//
// It is also a SHAPE our version never had. In the reference the aircraft sits
// across the after deck: a gold fuselage along the hull, a gold WING spanning
// most of the beam, and at each wingtip a NACELLE that stands TALL — those
// two blue uprights are most of the blue on the whole ship, and they are why
// her stern reads busy and vertical while the Aegis's is a flat slab.
//
// Everything here is projected through P(), not offset in pixels from one
// point, so the aircraft lies in the deck plane and skews with the hull.
(function () {
  var AU = -L * 0.62, AZ = FR + 1.2;                    // stern flight pad
  // LEMON, NOT DARK GOLD. At 22x the rip's aircraft is a bright yellow — the
  // single lightest saturated thing in the whole fleet — and ours was #cc9900
  // amber, which at map size sinks into the grey deck it sits on.
  var GOLD = '#ffcc33', GOLD_L = '#ffff66', GOLD_D = '#cc9933';
  function pt(du, dv, dz) { return P(AU + du, dv, AZ + (dz || 0)); }
  // the pad it stands on
  disc(AU, 0, 0.4, 7.0, 3.6, '#333333');
  g.strokeStyle = HOUSE; g.lineWidth = 0.9;
  var hq = pt(0, 0, -0.6);
  g.beginPath(); g.ellipse(hq[0], hq[1], 5.2, 2.7, 0, 0, 6.29); g.stroke();
  // Short landing struts tie the raised fuselage to the flight pad.
  for (var gs = -1; gs <= 1; gs += 2) {
    var ga = pt(-L * 0.035, gs * W * 0.15, 0.5), gb = pt(-L * 0.035, gs * W * 0.15, 4.2);
    g.strokeStyle = '#555555'; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(ga[0], ga[1]); g.lineTo(gb[0], gb[1]); g.stroke();
  }
  // THE FAR NACELLE GOES BEHIND THE WING. Both were drawn after it, so the
  // far upright painted over the gold that should pass in front of it and the
  // aircraft lost most of its span. There is no z-buffer here: the only thing
  // that puts a part behind another is the order it is drawn in.
  function nacelle(ne) {
    var n0 = pt(0, ne * W * 1.06, 2.2), n1 = pt(0, ne * W * 1.06, 8.4);
    // Each wingtip carries a thick motor/rotor nacelle, not a thin flagpole.
    g.strokeStyle = '#333333'; g.lineWidth = 5.8;
    g.beginPath(); g.moveTo(n0[0], n0[1]); g.lineTo(n1[0], n1[1]); g.stroke();
    g.strokeStyle = HOUSE; g.lineWidth = 4.0;
    g.beginPath(); g.moveTo(n0[0] - 0.8, n0[1]); g.lineTo(n1[0] - 0.8, n1[1]); g.stroke();
    g.fillStyle = shade(HOUSE, 1.08); g.beginPath();
    g.ellipse(n1[0], n1[1], 3.4, 1.7, 0, 0, 6.29); g.fill();
    g.strokeStyle = '#333333'; g.lineWidth = 1.3;                  // folded propeller blades
    g.beginPath();
    g.moveTo(n1[0] - 4.6, n1[1] - 0.8); g.lineTo(n1[0] + 4.6, n1[1] + 0.4); g.stroke();
  }
  nacelle(-nearS);
  // A parked aircraft needs an actual wing and tapered body. Thin crossing
  // strokes vanished into the deck at game scale and looked like a deck glyph.
  function fillPart(points, color) {
    g.fillStyle = color; g.beginPath();
    g.moveTo(points[0][0], points[0][1]);
    for (var j = 1; j < points.length; j++) g.lineTo(points[j][0], points[j][1]);
    g.closePath(); g.fill();
  }
  fillPart([pt(L * 0.035, -W * 1.08, 3.7), pt(-L * 0.045, -W * 1.08, 3.7),
            pt(-L * 0.075, W * 1.08, 3.7), pt(L * 0.055, W * 1.08, 3.7)], GOLD_D);
  fillPart([pt(L * 0.055, -W * 0.93, 3.9), pt(-L * 0.025, -W * 0.93, 3.9),
            pt(-L * 0.05, W * 0.93, 3.9), pt(L * 0.075, W * 0.93, 3.9)], GOLD);
  var leadingA = pt(L * 0.075, -W * 0.93, 4.0), leadingB = pt(L * 0.075, W * 0.93, 4.0);
  g.strokeStyle = GOLD_L; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(leadingA[0], leadingA[1]); g.lineTo(leadingB[0], leadingB[1]); g.stroke();
  fillPart([pt(-L * 0.23, 0, 5.2), pt(-L * 0.10, -W * 0.28, 5.2),
            pt(L * 0.12, -W * 0.26, 5.2), pt(L * 0.22, 0, 5.2),
            pt(L * 0.12, W * 0.26, 5.2), pt(-L * 0.10, W * 0.28, 5.2)], GOLD_D);
  fillPart([pt(-L * 0.20, 0, 5.8), pt(-L * 0.09, -W * 0.22, 5.8),
            pt(L * 0.10, -W * 0.20, 5.8), pt(L * 0.19, 0, 5.8),
            pt(L * 0.10, W * 0.20, 5.8), pt(-L * 0.09, W * 0.22, 5.8)], GOLD);
  // Keep the wing spar visibly continuous across the centre fuselage at
  // gameplay scale; otherwise the dark parked pad makes two yellow brackets.
  var sparA = pt(0, -W * 0.94, 4.8), sparB = pt(0, W * 0.94, 4.8);
  g.strokeStyle = GOLD_L; g.lineWidth = 2.2; g.lineCap = 'butt';
  g.beginPath(); g.moveTo(sparA[0], sparA[1]); g.lineTo(sparB[0], sparB[1]); g.stroke();
  var ck = pt(L * 0.10, 0, 5.8);                                   // cockpit glass
  g.fillStyle = '#333333';
  g.beginPath(); g.ellipse(ck[0], ck[1], 1.5, 1.0, 0, 0, 6.29); g.fill();
  // A low canopy sits on the aircraft's own fuselage; a tall centre mast
  // made it read as three poles on the destroyer instead of an airframe.
  var canopy = pt(L * 0.055, 0, 6.4);
  g.fillStyle = '#333333'; g.beginPath();
  g.ellipse(canopy[0], canopy[1], 1.8, 1.0, 0, 0, 6.29); g.fill();
  nacelle(nearS);                                   // and the near one, in front
  // the tail fin, aft on the fuselage
  var tf = pt(-L * 0.14, 0, 4.0);
  g.fillStyle = HOUSE;
  g.beginPath();
  g.moveTo(tf[0], tf[1]); g.lineTo(tf[0] - 1.0, tf[1] - 4.0);
  g.lineTo(tf[0] + 1.6, tf[1] - 3.7); g.lineTo(tf[0] + 2.0, tf[1] - 0.5);
  g.closePath(); g.fill();
})();
}

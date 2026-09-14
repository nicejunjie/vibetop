// Iron Frontier — ships/destroyer: the art for one unit.
// Called by bakeShip() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.



function drawDestroyer(C) {
  var DECK = C.DECK, FR = C.FR, GLASS = C.GLASS, HL = C.HL, HOUSE = C.HOUSE, L = C.L, P = C.P,
      STEEL = C.STEEL, W = C.W, barrel = C.barrel, box = C.box, disc = C.disc, g = C.g, mast = C.mast,
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
    g.ellipse(dq[0], dq[1] - 1.0 - f * 4.2, 6.4 - f * 3.0, 3.4 - f * 1.7, 0, 0, 6.29);
    g.fill();
  }
  g.strokeStyle = shade(HOUSE, 0.52); g.lineWidth = 0.8;          // its shaded skirt
  g.beginPath(); g.ellipse(dq[0], dq[1] - 0.6, 6.4, 3.4, 0, 0, 6.29); g.stroke();
})();
barrel(L * 0.68, 0, 8.0, 9.5, 4.6);
var mzq = P(L * 0.68 + 9.5, 0, FR + 8.0);
g.fillStyle = '#c3c9d2';                                          // muzzle cap
g.beginPath(); g.ellipse(mzq[0], mzq[1], 1.9, 1.5, 0, 0, 6.29); g.fill();
g.fillStyle = '#15181c';
g.beginPath(); g.ellipse(mzq[0], mzq[1] - 0.2, 0.9, 0.7, 0, 0, 6.29); g.fill();
// THE BRIDGE IS WHITE, and it is a MASS. Measured off `library/destroyer.png`
// (103x48) the superstructure is a single 18x14 px white block at x 37-53% of
// her length — 17% of the hull long and 29% of the frame TALL, and the only
// white on the ship. Ours was DECK grey at 6.2 and 11.6 units, the same value
// as the deck it stood on, so she read as a flat plate with bumps.
box(L * 0.12, 0, L * 0.40, W * 1.62, 7.4, '#cccccc');             // bridge block
box(L * 0.10, 0, L * 0.26, W * 1.34, 13.5, '#e6e6e6');            // wheelhouse
box(L * 0.11, 0, L * 0.12, W * 0.86, 18.0, '#e6e9ec');            // the director on top
var wq0 = P(L * 0.11, 0, FR + 10.6);
g.fillStyle = GLASS; g.fillRect(wq0[0] - 4.2, wq0[1] - 1.9, 8.4, 2.1);
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
box(-L * 0.26, 0, 5.0, W * 0.70, 10.0, '#4d4d4d');                // funnel / mack
box(-L * 0.26, 0, 3.2, W * 0.50, 12.2, '#333333');                // its cap
g.strokeStyle = HOUSE; g.lineWidth = 1.6;                         // one house band on it
var fq = P(-L * 0.26, 0, FR + 9.4); g.beginPath();
g.moveTo(fq[0] - 4.4, fq[1]); g.lineTo(fq[0] + 4.4, fq[1]); g.stroke();
g.strokeStyle = STEEL; g.lineWidth = 1.6;                          // air-search bar on top
var rq = P(-L * 0.26, 0, FR + 13.0);
g.beginPath(); g.moveTo(rq[0] - 3.6, rq[1]); g.lineTo(rq[0] + 3.6, rq[1] - 0.6); g.stroke();
box(-L * 0.50, 0, L * 0.16, W * 1.00, 5.0, '#8a8a8a');            // a low hangar, not a tower
// TWO MASTS. The reference's top edge spikes to 44 px at 20% of her length and
// 46 px at 60%, against 25-36 px everywhere else, on a 48-px frame: nearly the
// whole of her height is mast. Ours had none at all and stood 39 to her 48.
mast(L * 0.11, 0, 15.0, '#2b2b2b');
mast(-L * 0.30, 0, 17.0, '#2b2b2b');
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
  var AU = -L * 0.62, AZ = FR + 1.2;                    // where it sits, and its deck
  var GOLD = '#cc9900', GOLD_L = '#ffcc33', GOLD_D = '#996600';
  function pt(du, dv, dz) { return P(AU + du, dv, AZ + (dz || 0)); }
  // the pad it stands on
  disc(AU, 0, 0.4, 7.0, 3.6, '#333333');
  g.strokeStyle = HOUSE; g.lineWidth = 0.9;
  var hq = pt(0, 0, -0.6);
  g.beginPath(); g.ellipse(hq[0], hq[1], 5.2, 2.7, 0, 0, 6.29); g.stroke();
  // THE FAR NACELLE GOES BEHIND THE WING. Both were drawn after it, so the
  // far upright painted over the gold that should pass in front of it and the
  // aircraft lost most of its span. There is no z-buffer here: the only thing
  // that puts a part behind another is the order it is drawn in.
  function nacelle(ne) {
    var n0 = pt(0, ne * W * 1.30, 2.2), n1 = pt(0, ne * W * 1.30, 10.6);
    g.strokeStyle = HOUSE; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(n0[0], n0[1]); g.lineTo(n1[0], n1[1]); g.stroke();
    g.strokeStyle = HL; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(n0[0] - 0.9, n0[1]); g.lineTo(n1[0] - 0.9, n1[1]); g.stroke();
    g.strokeStyle = '#333333'; g.lineWidth = 1.0;                  // the folded blades on top
    g.beginPath();
    g.moveTo(n1[0] - 3.4, n1[1] - 0.8); g.lineTo(n1[0] + 3.4, n1[1] + 0.4); g.stroke();
  }
  nacelle(-nearS);
  // the WING, across the hull — the widest thing on the after deck
  var wA = pt(0, W * 1.30, 2.2), wB = pt(0, -W * 1.30, 2.2);
  g.strokeStyle = GOLD; g.lineWidth = 3.2; g.lineCap = 'butt';
  g.beginPath(); g.moveTo(wA[0], wA[1]); g.lineTo(wB[0], wB[1]); g.stroke();
  g.strokeStyle = GOLD_L; g.lineWidth = 1.2;                       // its lit leading edge
  g.beginPath(); g.moveTo(wA[0], wA[1] - 1.1); g.lineTo(wB[0], wB[1] - 1.1); g.stroke();
  // the fuselage, ALONG the hull
  var fA = pt(-L * 0.15, 0, 2.6), fB = pt(L * 0.17, 0, 2.6);
  g.strokeStyle = GOLD; g.lineWidth = 3.6;
  g.beginPath(); g.moveTo(fA[0], fA[1]); g.lineTo(fB[0], fB[1]); g.stroke();
  g.strokeStyle = GOLD_L; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(fA[0], fA[1] - 1.2); g.lineTo(fB[0], fB[1] - 1.2); g.stroke();
  g.strokeStyle = GOLD_D; g.lineWidth = 0.9;
  g.beginPath(); g.moveTo(fA[0], fA[1] + 1.4); g.lineTo(fB[0], fB[1] + 1.4); g.stroke();
  var ck = pt(L * 0.16, 0, 3.2);                                   // cockpit glass
  g.fillStyle = '#333333';
  g.beginPath(); g.ellipse(ck[0], ck[1], 1.5, 1.0, 0, 0, 6.29); g.fill();
  nacelle(nearS);                                   // and the near one, in front
  // the tail fin, aft on the fuselage
  var tf = pt(-L * 0.14, 0, 2.6);
  g.fillStyle = HOUSE;
  g.beginPath();
  g.moveTo(tf[0], tf[1]); g.lineTo(tf[0] - 1.0, tf[1] - 4.0);
  g.lineTo(tf[0] + 1.6, tf[1] - 3.7); g.lineTo(tf[0] + 2.0, tf[1] - 0.5);
  g.closePath(); g.fill();
})();
}

// Iron Frontier — ships/destroyer: the art for one unit.
// Called by bakeShip() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.



function drawDestroyer(C) {
  var DECK = C.DECK, FR = C.FR, GLASS = C.GLASS, HOUSE = C.HOUSE, L = C.L, P = C.P, STEEL = C.STEEL,
      W = C.W, barrel = C.barrel, box = C.box, disc = C.disc, g = C.g, mast = C.mast;

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
box(L * 0.52, 0, L * 0.26, W * 1.46, 3.2, shade(DECK, 1.08));     // barbette
disc(L * 0.55, 0, 3.8, 5.8, 3.2, STEEL);                          // A-turret mount
box(L * 0.55, 0, 8.4, W * 1.34, 6.4, '#454a53');                  // the gunhouse (darker 2026-09-10: destroyer|aegis under the floor)
box(L * 0.62, 0, 3.0, W * 1.04, 4.6, '#6a707a');                  // sloped mantlet face
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
box(L * 0.14, 0, L * 0.32, W * 1.62, 7.0, '#b9bec6');             // bridge block
box(L * 0.11, 0, L * 0.20, W * 1.30, 13.5, '#d4d8de');            // wheelhouse
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
box(-L * 0.26, 0, 7.0, W * 1.06, 14.5, HOUSE);                    // funnel / mack
box(-L * 0.26, 0, 4.4, W * 0.72, 18.5, shade(HOUSE, 0.74));       // its cap
g.strokeStyle = HOUSE; g.lineWidth = 1.8;
var fq = P(-L * 0.26, 0, FR + 10.2); g.beginPath();
g.moveTo(fq[0] - 4.4, fq[1]); g.lineTo(fq[0] + 4.4, fq[1]); g.stroke();
g.strokeStyle = STEEL; g.lineWidth = 1.6;                          // air-search bar on top
var rq = P(-L * 0.26, 0, FR + 13.0);
g.beginPath(); g.moveTo(rq[0] - 3.6, rq[1]); g.lineTo(rq[0] + 3.6, rq[1] - 0.6); g.stroke();
box(-L * 0.52, 0, L * 0.22, W * 1.42, 9.5, HOUSE);                // Osprey hangar, the second house block
box(-L * 0.52, 0, L * 0.16, W * 1.10, 12.5, shade(HOUSE, 0.78));
// TWO MASTS. The reference's top edge spikes to 44 px at 20% of her length and
// 46 px at 60%, against 25-36 px everywhere else, on a 48-px frame: nearly the
// whole of her height is mast. Ours had none at all and stood 39 to her 48.
mast(L * 0.11, 0, 15.0, '#2b2b2b');
mast(-L * 0.30, 0, 17.0, '#2b2b2b');
// The helicopter pad, and the Osprey folded on it.
disc(-L * 0.80, 0, 0.4, 6.0, 3.2, '#22262b');
g.strokeStyle = HOUSE; g.lineWidth = 0.9;
var hq = P(-L * 0.80, 0, FR + 0.6);
g.beginPath(); g.ellipse(hq[0], hq[1], 4.4, 2.3, 0, 0, 6.29); g.stroke();
// THE OSPREY IS YELLOW, and it was not drawn at all. The hangar and the pad
// were both here; what sat on the pad was a drab olive lozenge the same value
// as the deck under it. In `library/destroyer.png` the aircraft is the
// brightest thing on the ship by a wide margin — an amber airframe on a grey
// hull — and it is the one feature that names this ship at a glance, the way
// the Dreadnought is named by its white missile tubes. Ours had no bright
// surface anywhere and no ACCENT row either.
var osp = P(-L * 0.80, 0, FR + 1.4);
g.fillStyle = '#cc9900';                                          // fuselage
g.beginPath();
g.moveTo(osp[0] - 5.0, osp[1] - 0.2);
g.lineTo(osp[0] + 1.2, osp[1] - 1.9);
g.lineTo(osp[0] + 5.0, osp[1] - 1.2);
g.lineTo(osp[0] + 4.4, osp[1] + 0.6);
g.lineTo(osp[0] - 4.4, osp[1] + 1.5);
g.closePath(); g.fill();
g.fillStyle = '#ffcc33';                                          // lit spine
g.beginPath();
g.moveTo(osp[0] - 4.2, osp[1] - 0.6);
g.lineTo(osp[0] + 1.0, osp[1] - 2.0);
g.lineTo(osp[0] + 4.2, osp[1] - 1.3);
g.lineTo(osp[0] + 0.6, osp[1] - 0.5);
g.closePath(); g.fill();
g.fillStyle = '#33383e';                                          // the two nacelles
for (var oe = -1; oe <= 1; oe += 2) {
  g.beginPath();
  g.ellipse(osp[0] + oe * 3.4, osp[1] - 1.4 + oe * 0.5, 1.5, 1.0, 0, 0, 6.29);
  g.fill();
}
g.strokeStyle = '#22262b'; g.lineWidth = 0.9;                     // folded blades
g.beginPath();
g.moveTo(osp[0] - 4.6, osp[1] - 2.6); g.lineTo(osp[0] + 4.6, osp[1] - 2.0); g.stroke();
g.fillStyle = '#1b1e23';                                          // cockpit glass
g.beginPath(); g.ellipse(osp[0] + 3.6, osp[1] - 0.9, 1.1, 0.8, 0, 0, 6.29); g.fill();
}

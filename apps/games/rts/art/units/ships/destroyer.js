// ─── ships/destroyer ─── Iron Frontier unit art. Included into rts.html by tools/rts-build.py;
// every free identifier is a local of bakeShip() in rts.src.html — see art/units/README.md.

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
box(L * 0.14, 0, L * 0.32, W * 1.62, 6.2, DECK);                  // bridge block
box(L * 0.11, 0, L * 0.20, W * 1.30, 11.6, shade(DECK, 1.18));    // wheelhouse
var wq0 = P(L * 0.11, 0, FR + 10.6);
g.fillStyle = GLASS; g.fillRect(wq0[0] - 4.2, wq0[1] - 1.9, 8.4, 2.1);
// A MACK — mast and stack in one solid trunk — rather than the 13-unit
// wire mast this hull carried. Same height on the skyline, but it is
// 11 screen px wide instead of 2, so it lifts the crown's measured
// thickness instead of halving it.
box(-L * 0.26, 0, 7.0, W * 1.06, 12.6, '#33373d');                // funnel / mack
g.strokeStyle = HOUSE; g.lineWidth = 1.8;
var fq = P(-L * 0.26, 0, FR + 10.2); g.beginPath();
g.moveTo(fq[0] - 4.4, fq[1]); g.lineTo(fq[0] + 4.4, fq[1]); g.stroke();
g.strokeStyle = STEEL; g.lineWidth = 1.6;                          // air-search bar on top
var rq = P(-L * 0.26, 0, FR + 13.0);
g.beginPath(); g.moveTo(rq[0] - 3.6, rq[1]); g.lineTo(rq[0] + 3.6, rq[1] - 0.6); g.stroke();
box(-L * 0.52, 0, L * 0.22, W * 1.42, 4.6, shade(DECK, 1.04));    // Osprey hangar
// The helicopter pad, and the Osprey folded on it.
disc(-L * 0.80, 0, 0.4, 6.0, 3.2, '#22262b');
g.strokeStyle = HOUSE; g.lineWidth = 0.9;
var hq = P(-L * 0.80, 0, FR + 0.6);
g.beginPath(); g.ellipse(hq[0], hq[1], 4.4, 2.3, 0, 0, 6.29); g.stroke();
disc(-L * 0.80, 0, 1.6, 3.0, 1.5, '#5d6a58');
g.strokeStyle = '#2a2f33'; g.lineWidth = 0.9;
g.beginPath(); g.moveTo(hq[0] - 4, hq[1] - 2.4); g.lineTo(hq[0] + 4, hq[1] - 2.0); g.stroke();

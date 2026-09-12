// ─── ships/seascorp ─── Iron Frontier unit art. Included into rts.html by tools/rts-build.py;
// every free identifier is a local of bakeShip() in rts.src.html — see art/units/README.md.

import { shade } from '../../bake/terrain.js';

export function drawSeascorp(C) {
  var DECK = C.DECK, FR = C.FR, GLASS = C.GLASS, GUN = C.GUN, GUN_L = C.GUN_L, HD = C.HD,
      HOUSE = C.HOUSE, L = C.L, P = C.P, W = C.W, box = C.box, g = C.g, mast = C.mast;

// [HYD]: small, fast, and all gun — the shortest armed hull afloat.
// A low planing hull, a stubby pilot house forward, and the FLAK MOUNT
// standing on a tub over the stern with a house-coloured ammo cheek
// each side. §2.4 asks for the Flak Track's own read, and the Flak
// Track's read is a gun raised well clear of the bed.
//
// A first pass put the mount on a FIFTEEN-unit pedestal because that
// was what pulled her silhouette off the Typhoon's; it also turned a
// 24-px gunboat into a chimney on a dinghy. The separation is bought
// back below with proportion instead — she is the beamiest hull for
// her length in the fleet against the Typhoon's long thin one.
//
// "Beamiest for her length" then became 22 x 17 — a plan 1.29:1, all
// but square — under a 9.2 pilot house and a 7.4 tub, and she rendered
// 44x34, aspect 1.29 against [HYD]'s 59x32 = 1.84. A gunboat that is
// as wide as she is long is a tub. 27 x 13 keeps her the beamiest hull
// AFLOAT FOR HER LENGTH without making her round, and the deckhouses
// come down to match: 44x34 aspect 1.29 -> 52x29 aspect 1.79.
box(L * 0.14, 0, L * 0.56, W * 1.46, 3.4, DECK);
box(L * 0.22, 0, L * 0.34, W * 1.10, 5.4, shade(DECK, 1.16));     // pilot house
var wq = P(L * 0.22, 0, FR + 4.8);
g.fillStyle = GLASS; g.fillRect(wq[0] - 3.0, wq[1] - 1.5, 6.0, 1.7);
box(-L * 0.34, 0, 6.5, W * 1.50, 4.2, shade(DECK, 0.92));         // the gun tub
var gq = P(-L * 0.34, 0, FR + 4.6);
g.fillStyle = shade(DECK, 1.2);
g.beginPath(); g.ellipse(gq[0], gq[1], 5.0, 2.8, 0, 0, 6.29); g.fill();
// Two sloped house-coloured ammo cheeks either side of the mount —
// wedges, as [HYD]'s sprite has, not discs.
g.fillStyle = HOUSE;
for (var ch = -1; ch <= 1; ch += 2) {
  g.beginPath();
  g.moveTo(gq[0] + ch * 2.2, gq[1] + 1.0);
  g.lineTo(gq[0] + ch * 5.2, gq[1] - 0.4);
  g.lineTo(gq[0] + ch * 4.8, gq[1] - 3.2);
  g.lineTo(gq[0] + ch * 2.0, gq[1] - 2.2);
  g.closePath(); g.fill();
  g.strokeStyle = HD; g.lineWidth = 0.6; g.stroke();
}
// THE BARRELS POINT UP. §2.4 asks for the Flak Track's own read and
// the Flak Track's read is a twin mount ELEVATED — [HYD]'s sprite has
// the two tubes standing at roughly 45 degrees off the tub. Drawn flat
// along the deck by `barrel()` they lay across the deckhouse roof as
// two dark lines and read as handrails; angled they are the one thing
// on her that breaks the outline upward, on the fleet's shortest hull.
// ...and there are FOUR of them, because the Flak Track's read is now
// a quad sheaf and §2.4 asks for the same gun on both units by name.
// Two 2.4-wide tubes on a 52-px hull were the same 1-px-at-zoom-1
// problem the halftrack had.
for (var fb = -3; fb <= 3; fb += 2) {
  var b0 = P(-L * 0.30, fb * 0.92, FR + 4.8), b1 = P(L * 0.12, fb * 0.92, FR + 10.0);
  g.strokeStyle = GUN; g.lineWidth = 2.6;
  g.beginPath(); g.moveTo(b0[0], b0[1]); g.lineTo(b1[0], b1[1]); g.stroke();
  g.strokeStyle = GUN_L; g.lineWidth = 1.0;
  g.beginPath(); g.moveTo(b0[0] - 0.5, b0[1]); g.lineTo(b1[0] - 0.5, b1[1]); g.stroke();
}
mast(L * 0.06, 0, 4.2);
}

// Iron Frontier — ships/aegis: the art for one unit.
// Called by bakeShip() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.

import { shade } from '../../bake/terrain.js';

export function drawAegis(C) {
  var DECK = C.DECK, FR = C.FR, HD = C.HD, HL = C.HL, HOUSE = C.HOUSE, L = C.L, P = C.P, W = C.W,
      box = C.box, g = C.g, mast = C.mast, nearS = C.nearS;

// [AEGIS]: the whole ship is a missile battery, and §2.3's read is
// "explicitly no barrel". ONE slab deckhouse running two thirds of her
// length, carrying the four phased-array PANELS (the house colour lives
// on those, nowhere else), with a box launcher fore and aft.
//
// SHE IS LONG AND LOW. The old block read 91x35-against-101x41 as
// "shorter and BEAMIER than the Destroyer" and built her at beam 17 on
// a 41 hull under a 20-unit tower. But 35 and 41 are SCREEN HEIGHTS of
// an isometric render: beam and superstructure are the only things in
// them, so the Aegis being 6 px SHORTER than the Destroyer says she is
// narrower and lower, not fatter. Built the wrong way round she
// measured 78x52, aspect 1.50 against RA2's 2.60 — a tugboat, and the
// reason `aegis | squid` sat under the friend-vs-foe floor for weeks:
// two tall blobs. Beam 17 -> 13, freeboard 5.6 -> 4.4, and the
// superstructure comes down from 20 units to 8.6 so the slab is a
// deckhouse on a cruiser instead of a wheelhouse on a tug.
// THE PANEL IS THE SHIP. §2.3's budget is "radar panel >= 8x8 px,
// vertical; explicitly no barrel", and one 10x6 quad on the near
// flank of a dark deckhouse was neither big enough nor lit enough to
// survive the bake: at zoom 1 the Aegis and the Destroyer were two
// grey slabs on two blue-rimmed hulls, which is exactly what
// `peerVsSelf.naval` has been reporting. So the deckhouse becomes a
// stepped PYRAMID — wide at the deck, narrow at the top, the opposite
// massing to the Destroyer's tall thin mack — and it carries a big
// house-coloured array on BOTH visible faces, gridded, standing over
// its full height. Missile cells fore and aft become a countable 4x2
// grid of black throats instead of three dots.
box(-L * 0.02, 0, L * 0.70, W * 1.66, 4.2, DECK);
box(-L * 0.06, 0, L * 0.50, W * 1.44, 6.0, shade(DECK, 1.46));   // 2026-09-10: a PALE deckhouse against the Destroyer's dark gunhouse
// The arrays sit ON the deckhouse faces, not over them: the box is
// 10.4 tall off FR and the panel runs FR+3.0 to FR+10.6, so the top
// of the array IS the top of the ship. Far face first.
// IN THE SHIP'S OWN PLANE, not in screen space. The array this
// replaces was four fixed screen offsets off one P() point, which is
// invisible while the quad is 10 px wide and becomes a billboard the
// moment it is big enough to matter: enlarged, it stayed axis-aligned
// through all 32 bearings and hung off the beam at the axial ones.
// Every corner goes through P(u, v, z) so the panel turns with her.
var paU0 = L * 0.10 - 7.2, paU1 = L * 0.10 + 7.2;
var paZ0 = FR + 3.2, paZ1 = FR + 10.6;
// The FAR array is painted before the deckhouse and the near one after
// it, so the tower actually stands between them. Both after (the first
// draft) left the far panel hanging in the air over the far rail.
var aeArray = function (pf) {
  var pv = W * 0.55 * pf;
  var c0 = P(paU0, pv, paZ0), c1 = P(paU1, pv, paZ0),
      c2 = P(paU1, pv, paZ1), c3 = P(paU0, pv, paZ1);
  g.fillStyle = pf === nearS ? HOUSE : HD;
  g.beginPath();
  g.moveTo(c0[0], c0[1]); g.lineTo(c1[0], c1[1]);
  g.lineTo(c2[0], c2[1]); g.lineTo(c3[0], c3[1]);
  g.closePath(); g.fill();
  g.strokeStyle = pf === nearS ? HL : HD; g.lineWidth = 0.9; g.stroke();
  g.strokeStyle = HD; g.lineWidth = 0.6;                            // the array's cells
  for (var pi = 1; pi < 5; pi++) {
    var pu = paU0 + (paU1 - paU0) * (pi / 5);
    var e0 = P(pu, pv, paZ0 + 0.6), e1 = P(pu, pv, paZ1 - 0.6);
    g.beginPath(); g.moveTo(e0[0], e0[1]); g.lineTo(e1[0], e1[1]); g.stroke();
  }
  var m0 = P(paU0 + 0.6, pv, (paZ0 + paZ1) / 2), m1 = P(paU1 - 0.6, pv, (paZ0 + paZ1) / 2);
  g.beginPath(); g.moveTo(m0[0], m0[1]); g.lineTo(m1[0], m1[1]); g.stroke();
};
aeArray(-nearS);
box(-L * 0.06, 0, L * 0.34, W * 1.06, 10.4, shade(DECK, 1.62));
aeArray(nearS);
box(L * 0.62, 0, 8, W * 1.24, 2.8, '#3a4048');                    // forward VLS
box(-L * 0.74, 0, 8, W * 1.24, 2.8, '#3a4048');                   // aft VLS
g.fillStyle = '#12161b';
for (var vu = -1; vu <= 1; vu += 2)
  for (var vi = 0; vi < 4; vi++) {
    var vq = P(L * (vu > 0 ? 0.62 : -0.74) + (vi - 1.5) * 2.0, vu * 1.9, FR + 2.8);
    g.beginPath(); g.ellipse(vq[0], vq[1], 1.1, 0.7, 0, 0, 6.29); g.fill();
  }
mast(-L * 0.36, 0, 4.4, '#2f343c');
}

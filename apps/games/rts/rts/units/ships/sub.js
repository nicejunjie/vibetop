// Iron Frontier — ships/sub: the art for one unit.
// Called by bakeShip() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.

function drawSub(C) {
  var FR = C.FR, HOUSE = C.HOUSE, L = C.L, P = C.P, W = C.W, box = C.box, g = C.g, poly = C.poly;

// [SUB]: almost nothing above water. A long whaleback casing awash,
// ONE SAIL with a house band, two short periscopes. What reads as a
// submarine is that the deck is barely above the waterline and the
// sail is the only vertical mass on her (§2.4).
//
// She is RA2's 5.36-aspect hull, and a 5:1 bar has the worst self-IoU
// afloat by construction: rotated through eight bearings it swings
// from a long horizontal line to a short vertical one and nothing
// overlaps. The two things that fix that without giving her a
// superstructure she must not have are (a) the RA2 LENGTH, 75/101 of
// the Destroyer's = 34 rather than the 42 she was drawn at, and (b) a
// sail that is a real fraction of her, not a bump — it is the one part
// of the mask that does not rotate.
//
// (b) then ate (a). An 11-unit fairing on an L-30 hull stood 16 units
// over the water — 0.54 of her length against §2.4's OWN ceiling of
// "height <= 0.20 x length" — and she rendered 56x26, aspect 2.15
// against [SUB]'s 5.36, the largest proportion error in the fleet.
// The sail is the identity, but a sail is a fin, not a deckhouse: it
// comes down to 4.0 units over a 35 hull and grows ALONG her instead,
// which keeps the one non-rotating part of the mask without turning
// the flattest hull afloat into the tallest thing on it. The two
// PERISCOPES mattered as much as the sail did: 1-px hairs reaching 6
// units over it, contributing nothing to the read and a third of the
// bbox height. 66x14, aspect 4.71 — still short of 5.36, because the
// last of the gap is the sail itself and §2.4 calls it her identity.
g.save(); poly(FR, null, null); g.clip();
g.strokeStyle = '#4a5058'; g.lineWidth = 0.8;
var d0 = P(L * 0.8, 0, FR), d1 = P(-L * 0.9, 0, FR);
g.beginPath(); g.moveTo(d0[0], d0[1]); g.lineTo(d1[0], d1[1]); g.stroke();
g.restore();
// THE SAIL HAS TO READ AS A MASS, and it did not. §2.4 makes it her identity —
// "the only vertical mass on her" — but it was #454b54 standing on a #3b4048
// casing over a hull of much the same value, so on the palette grid all three
// landed on #333333 and the boat baked as one flat grey lozenge. A sail is the
// one part of this silhouette that does not rotate with the bearing, so if it
// does not separate in VALUE there is nothing to see at any facing. Casing
// dark, sail two steps lighter, which is the contrast the rip carries.
box(L * 0.04, 0, L * 0.70, W * 1.55, 1.6, '#2b3036');             // the casing step
box(L * 0.04, 0, L * 0.46, W * 1.10, 4.0, '#6b727c');             // the sail
var sq2 = P(L * 0.04, 0, FR + 2.8);
// A DECK LINE, not a bar. The house band was a 2.0-wide stroke across 7.2
// units — 12% of a 65 x 17 sprite in saturated paint, a red brick sitting on a
// grey boat. The rip has a thin, dark red line along the casing and nothing
// else: a submarine is the one hull in the fleet that is meant to be hard to
// see, and 12% of her in the player's colour is the opposite of that.
g.strokeStyle = shade(HOUSE, 0.72); g.lineWidth = 1.0;
g.beginPath(); g.moveTo(sq2[0] - 3.2, sq2[1] + 0.2); g.lineTo(sq2[0] + 3.2, sq2[1] + 0.5); g.stroke();
g.strokeStyle = '#20242a'; g.lineWidth = 1.3;
g.beginPath(); g.moveTo(sq2[0] - 0.9, sq2[1] - 1.4); g.lineTo(sq2[0] - 1.5, sq2[1] - 4.2); g.stroke();
g.beginPath(); g.moveTo(sq2[0] + 0.9, sq2[1] - 1.4); g.lineTo(sq2[0] + 1.3, sq2[1] - 3.4); g.stroke();
// Torpedo tube caps in the bow, and the stern planes.
g.fillStyle = '#171a1f';
var tq = P(L * 0.80, 0, FR - 0.6);
g.beginPath(); g.ellipse(tq[0], tq[1], 1.6, 1.0, 0, 0, 6.29); g.fill();
g.strokeStyle = '#2b3038'; g.lineWidth = 1.6;
var e0 = P(-L * 0.86, W * 1.15, 1.0), e1 = P(-L * 0.86, -W * 1.15, 1.0);
g.beginPath(); g.moveTo(e0[0], e0[1]); g.lineTo(e1[0], e1[1]); g.stroke();
}

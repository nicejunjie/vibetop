// ─── ships/sub ─── Iron Frontier unit art. Included into rts.html by tools/rts-build.py;
// every free identifier is a local of bakeShip() in rts.src.html — see art/units/README.md.

export function drawSub(C) {
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
box(L * 0.04, 0, L * 0.70, W * 1.55, 1.6, '#3b4048');             // the casing step
box(L * 0.04, 0, L * 0.46, W * 1.10, 4.0, '#454b54');             // the sail
var sq2 = P(L * 0.04, 0, FR + 2.8);
g.strokeStyle = HOUSE; g.lineWidth = 2.0;
g.beginPath(); g.moveTo(sq2[0] - 3.6, sq2[1]); g.lineTo(sq2[0] + 3.6, sq2[1] + 0.4); g.stroke();
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

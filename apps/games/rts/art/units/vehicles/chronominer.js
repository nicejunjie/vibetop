// Iron Frontier unit art — vehicles/chronominer
// Spliced VERBATIM into apps/games/rts/rts.html between `// @@ART vehicles/chronominer` and
// `// @@END vehicles/chronominer` (one pair per @@PART below). Edit HERE, then
//     node apps/games/rts/tools/art-split.js inject
// — or edit rts.html and `extract`; rts-split.test.js fails while they differ.
// Every free identifier (the canvas `g`, the anchor, the helpers, `col`, `sov`…)
// is a local of the enclosing bake function: see apps/games/rts/art/units/README.md.

// @@PART main — inside bakeVehicle() in rts.html
// CHRONO MINER — a LOW, DARK truck. In `allied-chrono-miner.png` the
// body is near-black charcoal, the house colour is ONE bright band
// across its middle, and the nose is a bulbous VIOLET ribbed cluster
// with a comb of white scoop teeth under its chin. The previous pass
// built it out of chrome and pale blue and it came back a bright toy
// truck: the reference is dark, and the violet nose — not the bin — is
// what names the unit.
// Q spreads the superstructure along the LONGER hull this pass gives
// it (len 30 -> 36) instead of leaving cab, drum and bin bunched in
// the middle of a stretched chassis. Heights are NOT scaled by it:
// "height <= 0.55 x length" (unit-identity-reference.md 2.3) is the
// whole point, so every vertical number below came DOWN while every
// along-axis one went out.
var Q = len / 30;
tracks(len * 0.96, 3.4, wid * 0.30, '#8b929d');
chassis(cx, by - 1.1, len * 0.94, wid * 0.78, 3.0, hull, dark, 0);
// The skirt run sits FORWARD of centre, not on it. The bin below now
// rests on the bed instead of floating over it, and where it used to
// clear the rear two plates it now covers them: the remap census had
// this unit at 0.119 of its pixels and the drop cost it 0.017, the
// largest single loss on the field. Slid forward under the cab and
// nose they are visible again from every bearing.
for (sg = -1; sg <= 1; sg += 2)                        // house-colour chassis skirt
  for (i2 = -1; i2 <= 1; i2++)
    isoBox(g, cx + px * wid * 0.37 * sg + fx * Q * (i2 * 5.8 + 3.6),
           by - 1.8 + py * wid * 0.37 * sg + fy * Q * (i2 * 5.8 + 3.6),
           len * 0.20, 1.5, 2.2, a, panel, PEDGE);
var drawBin = function () {
  // The bin SITS ON THE BED, and it used to float 3.0 units above it
  // hung 8.2 back off the tail. Measured, that one offset was the
  // whole of the Chrono Miner's aspect fault: the bin's rear-top
  // corner — not the drum, not the cab, not the rails, each of which
  // was swept and moved the bbox by ZERO — was the topmost pixel on
  // the sprite, and dropping it to the deck takes the bbox from 55x37
  // to 55x33. RA2's [CMIN] is 55x28, aspect 1.96, the LOWEST body in
  // the vehicle class, and 2.3's budget for this unit is written as
  // "height <= 0.55 x length"; at 0.67 we were not close.
  var bcx = cx - fx * Q * 6.6, bcy = by - 1.0 - fy * Q * 6.6;
  // 2026-09-06, the §2.3 clause pass: the bin and its furniture ARE the
  // topmost pixels at the broadside bearing (rows 0-8 of the bake are
  // bin tan and rail grey), so "height <= 0.55 x length" is decided
  // here and nowhere else. It measured 33/55 = 0.600. Every number
  // below came down 1.4-2.0 units and NOTHING moved along the axis, so
  // the bbox loses height without losing a pixel of width — which also
  // walks the broadside aspect from 0.849 of RA2's [CMIN] toward it,
  // the same direction the aspect gate wants. The bin is still the
  // deepest thing on the truck; it is no longer the tallest.
  crate(bcx, bcy, 11.6 * Q, 11.6, 7.0, BIN, BIN_E);   // 2026-09-10: the sheet's crate is as tall as the cab
  for (var br = -1; br <= 1; br += 2)                                 // steel bin rails
    isoBox(g, bcx + px * 5.5 * br, bcy - 6.4 + py * 5.5 * br, 11.8 * Q, 1.4, 0.9, a, '#6f757e', '#31363d');
  isoBox(g, bcx + fx * Q * 5.4, bcy - 6.4 + fy * Q * 5.4, 1.6, 2.8, 1.4, a, '#272b32', '#101216'); // chute
  isoBox(g, bcx + fx * Q * 5.4, bcy - 7.8 + fy * Q * 5.4, 2.0, 3.2, 0.7, a, '#6f757e', '#101216');
};
var drawFront = function () {
  // The cab is a DARK charcoal block; the house colour is the single
  // bright band wrapping its middle, exactly as the sprite reads.
  isoBox(g, cx + fx * Q * 3.2, by - 2.6 + fy * Q * 3.2, 6.4 * Q, 8.2, 3.2, a, '#2b3038', '#101317');
  isoBox(g, cx + fx * Q * 3.2, by - 3.8 + fy * Q * 3.2, 6.6 * Q, 8.8, 2.6, a, panel, PEDGE);  // the ONE band
  isoBox(g, cx + fx * Q * 3.2, by - 6.4 + fy * Q * 3.2, 5.2 * Q, 7.2, 1.0, a, plit, PEDGE);
  var wcx = cx + fx * Q * 5.6, wcy = by - 4.6 + fy * Q * 5.6;
  isoBox(g, wcx, wcy, 1.3, 6.6, 2.2, a, '#20262e', '#0e1114');       // windscreen frame
  g.fillStyle = 'rgba(214,222,230,.42)';                             // neutral glass: no blue on a red owner
  g.beginPath();
  g.ellipse(wcx + fx * 0.4, wcy - 1.7 + fy * 0.4, 2.5, 1.1, 0, 0, 6.29); g.fill();
  // dark standpipe between cab and nose
  puck(cx + fx * Q * 5.6, by - 2.6 + fy * Q * 5.6, 1.2, 4.2, '#4b5159', '#8d949f', '#1d2126');
  // the nose: a rounded chrome DRUM lying across the truck, ribbed.
  // Digging drops the whole cluster onto the ground — the dip plus the
  // dropped fingers is what sells the two-frame loop.
  var nz = dig ? 1.4 : 0;
  var nx = cx + fx * Q * 9.6, ny = by - 1.4 + nz + fy * Q * 9.6;
  // VIOLET, not chrome. The chrono gear in the reference is not a
  // badge on the flank — the whole nose drum glows indigo, and that
  // one violet mass is the unit's name at 1:1. It is also the Chrono
  // Miner's entry in VACC: the one violet mass in the ground fleet.
  // THE DRUM IS THE UNIT AND IT HAS TO BE BIG. This is the one part
  // the unit is NAMED after and at radius 4.3 it baked as a violet
  // smudge on a dark truck — the Chrono Miner was the weakest read on
  // the board at zoom 1. It grows in the GROUND PLANE only: `puck`'s
  // radius spreads the footprint in x and y at the same height, and
  // the height is what §2.3's "height <= 0.55 x length" is measured
  // on (0.522 today, and it must stay under). Radius 4.3 -> 5.3 is
  // +52% of violet area for zero rows of bbox.
  puck(nx, ny, 5.3, 5.2, shade(VACC.chronominer, 0.48), VACC.chronominer, '#1c1430');
  for (i2 = -3; i2 <= 3; i2++) {                            // ribs across the drum face
    var rvx = nx + fx * 2.6 + px * i2 * 1.7, rvy = ny - 4.8 + fy * 2.6 + py * i2 * 1.7;
    g.strokeStyle = shade(VACC.chronominer, 1.52); g.lineWidth = 1.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(rvx, rvy); g.lineTo(rvx, rvy + 3.8); g.stroke();
    g.strokeStyle = '#2a1f47'; g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(rvx + 0.9, rvy + 0.3); g.lineTo(rvx + 0.9, rvy + 3.8); g.stroke();
  }
  for (i2 = -1; i2 <= 1; i2++)                              // three feed pipes over the drum
    puck(nx - fx * 1.0 + px * 2.6 * i2, ny - 5.0 - fy * 1.0 + py * 2.6 * i2,
         0.85, 2.0, '#6b7280', '#d5dae2', '#3a3f47');
  // the SCOOP FINGERS under the chin. Parked they are tucked up under
  // the drum; digging they drop to the dirt — that plus the turned
  // gear is the whole mining animation.
  var fl = dig ? 6.0 : 1.8, ftop = dig ? 0.8 : -2.6;
  for (i2 = -2; i2 <= 2; i2++) {
    var fvx = cx + fx * Q * 12.8 + px * i2 * 1.6, fvy = by + ftop + fy * Q * 12.8 + py * i2 * 1.6;
    g.strokeStyle = '#e9edf3'; g.lineWidth = 1.9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(fvx, fvy - fl); g.lineTo(fvx, fvy); g.stroke();
    g.strokeStyle = '#6b727c'; g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(fvx + 0.9, fvy - fl + 0.4); g.lineTo(fvx + 0.9, fvy - 0.4); g.stroke();
  }
  if (dig) {                                               // spoil at the fingers
    for (i2 = -1; i2 <= 1; i2++) {
      g.fillStyle = i2 ? 'rgba(150,120,58,.55)' : 'rgba(190,158,80,.62)';
      g.beginPath();
      g.ellipse(cx + fx * Q * 13.8 + px * i2 * 3.0, by + 1.2 + fy * Q * 13.8 + py * i2 * 3.0,
                2.0, 1.0, 0, 0, 6.29);
      g.fill();
    }
  }
  // the violet chrono gear, riding on the near flank of the drum, a
  // half-tooth further round while digging
  var gxx = cx + fx * Q * 8.9 + px * 3.5 * nearS;
  var gyy = by - 4.8 + nz + fy * Q * 8.9 + py * 3.5 * nearS;
  var ga0 = dig ? Math.PI / 8 : 0;
  // The gear grows with the drum, and for the same reason: it is the
  // machinery that makes the nose read as a chrono rig rather than as
  // a paint job. It rides the drum's FLANK, so its growth is across
  // the beam and costs the height clause nothing.
  g.fillStyle = shade(VACC.chronominer, dig ? 0.62 : 0.54);
  for (i2 = 0; i2 < 8; i2++) {                             // gear teeth
    var ga = ga0 + i2 * Math.PI / 4;
    g.beginPath();
    g.ellipse(gxx + Math.cos(ga) * 3.5, gyy + Math.sin(ga) * 2.1, 1.25, 0.86, 0, 0, 6.29);
    g.fill();
  }
  g.fillStyle = shade(VACC.chronominer, dig ? 1.06 : 0.94);   // disc
  g.beginPath(); g.ellipse(gxx, gyy, 3.3, 2.0, 0, 0, 6.29); g.fill();
  outline(g, '#2a1f47');
  g.fillStyle = shade(VACC.chronominer, dig ? 1.44 : 1.30);   // lit rim, swung with the gear
  g.beginPath();
  g.ellipse(gxx + (dig ? 0.7 : -0.7), gyy - 0.6, 2.3, 1.3, 0, 0, 6.29); g.fill();
  g.fillStyle = '#e6dcfa';                                 // hub
  g.beginPath(); g.ellipse(gxx, gyy, 0.9, 0.6, 0, 0, 6.29); g.fill();
  for (var lI = -1; lI <= 1; lI += 2)                      // headlamps
    lamp(cx + fx * Q * 11.6 + px * 3.6 * lI, by - 4.2 + nz + fy * Q * 11.6 + py * 3.6 * lI);
};
if (fy > 0) { drawBin(); drawFront(); } else { drawFront(); drawBin(); }

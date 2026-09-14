// Iron Frontier — vehicles/chronominer: the art for one unit.
// Called by bakeVehicle() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.





function drawChronominer(C) {
  var BIN = C.BIN, BIN_E = C.BIN_E, PEDGE = C.PEDGE, a = C.a, by = C.by, chassis = C.chassis,
      crate = C.crate, cx = C.cx, dark = C.dark, dig = C.dig, fx = C.fx, fy = C.fy, g = C.g,
      hull = C.hull, i2 = C.i2, lamp = C.lamp, len = C.len, nearS = C.nearS, panel = C.panel,
      plit = C.plit, puck = C.puck, px = C.px, py = C.py, sg = C.sg, tracks = C.tracks, wid = C.wid;

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
tracks(len * 0.96, 3.4, wid * 0.30, '#919191');
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
    isoBox(g, bcx + px * 5.5 * br, bcy - 6.4 + py * 5.5 * br, 11.8 * Q, 1.4, 0.9, a, '#747474', '#31363d');
  isoBox(g, bcx + fx * Q * 5.4, bcy - 6.4 + fy * Q * 5.4, 1.6, 2.8, 1.4, a, '#272b32', '#101216'); // chute
  isoBox(g, bcx + fx * Q * 5.4, bcy - 7.8 + fy * Q * 5.4, 2.0, 3.2, 0.7, a, '#747474', '#101216');
};
var drawFront = function () {
  // The cab is a DARK charcoal block; the house colour is the single
  // bright band wrapping its middle, exactly as the sprite reads.
  isoBox(g, cx + fx * Q * 3.2, by - 2.6 + fy * Q * 3.2, 6.4 * Q, 8.2, 3.2, a, '#2b3038', '#101317');
  isoBox(g, cx + fx * Q * 3.2, by - 3.8 + fy * Q * 3.2, 6.6 * Q, 8.8, 2.6, a, panel, PEDGE);  // the ONE band
  isoBox(g, cx + fx * Q * 3.2, by - 6.4 + fy * Q * 3.2, 5.2 * Q, 7.2, 1.0, a, plit, PEDGE);
  var wcx = cx + fx * Q * 5.6, wcy = by - 4.6 + fy * Q * 5.6;
  isoBox(g, wcx, wcy, 1.3, 6.6, 2.2, a, '#20262e', '#0e1114');       // windscreen frame
  g.fillStyle = 'rgba(221,221,221,.42)';                             // neutral glass: no blue on a red owner
  g.beginPath();
  g.ellipse(wcx + fx * 0.4, wcy - 1.7 + fy * 0.4, 2.5, 1.1, 0, 0, 6.29); g.fill();
  // dark standpipe between cab and nose
  puck(cx + fx * Q * 5.6, by - 2.6 + fy * Q * 5.6, 1.2, 4.2, '#4b5159', '#939393', '#1d2126');
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
  // THE HOUSING IS SILVER; THE VIOLET IS WHAT SITS INSIDE IT. This drum was
  // painted violet end to end because the identity row says "a ribbed chrono
  // drum for a nose (violet, fixed hue)" — and that row is one of the ones
  // written from a cameo. The rip disagrees at every one of its eight bearings:
  // the nose is a PALE SILVER-GREY rounded housing with dark slots, two bright
  // white lit shoulders, and a LAVENDER CLUSTER set into its face above the
  // white scoop teeth. Ours had the two exactly inverted — a violet mass with
  // silver ribs — so 5% of the sprite was a saturated colour the reference does
  // not put there, and the machinery it is named for was invisible inside it.
  // The violet is not gone: it moves to the core and the gear, where the rip
  // has it, which is also the only place it means anything (a painted housing
  // is a paint job; a glowing core is a chrono rig).
  puck(nx, ny, 5.3, 5.2, '#6b6b6b', '#a8a8a8', '#1b1b1b');
  for (i2 = -3; i2 <= 3; i2++) {                            // slots across the drum face
    var rvx = nx + fx * 2.6 + px * i2 * 1.7, rvy = ny - 4.8 + fy * 2.6 + py * i2 * 1.7;
    g.strokeStyle = '#343434'; g.lineWidth = 1.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(rvx, rvy); g.lineTo(rvx, rvy + 3.8); g.stroke();
    g.strokeStyle = '#c6c6c6'; g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(rvx + 0.9, rvy + 0.3); g.lineTo(rvx + 0.9, rvy + 3.8); g.stroke();
  }
  // the chrono core: three lavender blocks recessed into the housing's face,
  // the cluster the rip shows sitting just above the scoop teeth
  for (i2 = -1; i2 <= 1; i2++)
    isoBox(g, nx + fx * 3.4 + px * i2 * 3.0, ny - 1.9 + fy * 3.4 + py * i2 * 3.0,
           1.5, 2.4, 2.9, a, i2 ? shade(VACC.chronominer, 1.16) : VACC.chronominer, '#2b2b2b');
  // THE FEED PIPES WERE READING AS EYES. Three small pucks with a #d9d9d9 cap
  // on a violet drum: at the bearings where two of them face the camera they
  // are a pair of pale circles on a coloured mass, and the miner acquired a
  // FACE. A pipe mouth is darker than the pipe, not brighter — and #6b7280 is
  // 107/114/128, blue over red, sitting just above the palette test's bar and
  // splitting on the grid like every other near-grey of that shape.
  for (i2 = -1; i2 <= 1; i2++)
    puck(nx - fx * 1.0 + px * 2.6 * i2, ny - 5.0 - fy * 1.0 + py * 2.6 * i2,
         0.85, 2.0, '#727272', '#8a8a8a', '#3d3d3d');
  // the SCOOP FINGERS under the chin. Parked they are tucked up under
  // the drum; digging they drop to the dirt — that plus the turned
  // gear is the whole mining animation.
  // SPACING 1.6 WITH A 1.9 px STROKE IS NOT A COMB, IT IS A SLAB. The five
  // teeth overlapped each other by 0.3 px, so the scoop baked as one white
  // blob — and a scoop is only legible as a scoop when you can see BETWEEN the
  // fingers. The rip's teeth are pale bars separated by hard black gaps. Butt
  // caps too: round ones fattened each tooth by half a width at both ends.
  var fl = dig ? 6.0 : 1.8, ftop = dig ? 0.8 : -2.6;
  for (i2 = -2; i2 <= 2; i2++) {
    var fvx = cx + fx * Q * 12.8 + px * i2 * 2.7, fvy = by + ftop + fy * Q * 12.8 + py * i2 * 2.7;
    g.strokeStyle = '#ececec'; g.lineWidth = 1.4; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(fvx, fvy - fl); g.lineTo(fvx, fvy); g.stroke();
    g.strokeStyle = '#5e5e5e'; g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(fvx + 0.8, fvy - fl + 0.4); g.lineTo(fvx + 0.8, fvy - 0.4); g.stroke();
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
  g.fillStyle = shade(VACC.chronominer, dig ? 0.48 : 0.42);
  for (i2 = 0; i2 < 8; i2++) {                             // gear teeth
    var ga = ga0 + i2 * Math.PI / 4;
    g.beginPath();
    g.ellipse(gxx + Math.cos(ga) * 2.7, gyy + Math.sin(ga) * 1.7, 0.95, 0.66, 0, 0, 6.29);
    g.fill();
  }
  g.fillStyle = shade(VACC.chronominer, dig ? 0.82 : 0.70);   // disc
  g.beginPath(); g.ellipse(gxx, gyy, 2.4, 1.5, 0, 0, 6.29); g.fill();
  // AN OUTLINE SHOULD RECEDE, NOT ADD A HUE. #2a1f47 is 42/31/71 and its ladder
  // includes #330033 — a saturated magenta — so the gear wore a dark magenta
  // ring and the core blocks were edged in it, which at map size is the busiest
  // thing on the nose. Neutral dark: it reads as a shadowed edge and lets the
  // lavender inside it be the only violet up there.
  outline(g, '#2b2b2b');
  // A FILLED BRIGHT ELLIPSE ON A ROUND FACE IS AN EYE. The "lit rim" was
  // 2.3 x 1.3 of #9966cc laid over a 3.3 x 2.0 disc — i.e. the rim covered
  // most of the disc, so the gear baked as one solid magenta circle, the
  // brightest thing on the unit, sitting on the nose. That is the same defect
  // as the headlamps, drawn a different way. A turned steel gear catches light
  // as a GLINT on one shoulder, not as a full face, so it is now a small
  // offset highlight and the teeth carry the shape instead.
  g.fillStyle = shade(VACC.chronominer, dig ? 1.06 : 0.96);   // glint, swung with the gear
  g.beginPath();
  g.ellipse(gxx + (dig ? 0.9 : -0.9), gyy - 0.7, 1.1, 0.6, 0, 0, 6.29); g.fill();
  g.fillStyle = '#9a9a9a';                                 // hub
  g.beginPath(); g.ellipse(gxx, gyy, 0.7, 0.5, 0, 0, 6.29); g.fill();
  // WORK LIGHT, NOT HEADLAMPS. Two round pale lamps sat at Q*11.6 — inside the
  // drum's own footprint, symmetric about the centreline, on a violet round
  // mass. A coloured disc with a matched pair of pale circles on it is a FACE,
  // and the miner had one at every bearing. It is also wrong as machinery: you
  // do not bolt a lamp to a rotating cutting head. A mining rig carries a LIGHT
  // BAR on the frame above the head, aimed down at the cut — one continuous
  // strip on a dark cowl, which is a fitting rather than a pair of eyes.
  var lbx = nx + fx * 2.4, lby = ny - 5.4 + nz * 0 + fy * 2.4;
  isoBox(g, lbx, lby, 1.8, 8.4, 1.5, a, '#464646', '#1b1b1b');
  g.strokeStyle = '#f4e6b4'; g.lineWidth = 1.3; g.lineCap = 'butt';
  g.beginPath();
  g.moveTo(lbx + fx * 0.9 - px * 3.3, lby - 0.9 + fy * 0.9 - py * 3.3);
  g.lineTo(lbx + fx * 0.9 + px * 3.3, lby - 0.9 + fy * 0.9 + py * 3.3);
  g.stroke();
};
if (fy > 0) { drawBin(); drawFront(); } else { drawFront(); drawBin(); }
}

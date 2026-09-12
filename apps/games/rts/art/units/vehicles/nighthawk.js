// Iron Frontier unit art — vehicles/nighthawk
// Spliced VERBATIM into apps/games/rts/rts.html between `// @@ART vehicles/nighthawk` and
// `// @@END vehicles/nighthawk` (one pair per @@PART below). Edit HERE, then
//     node apps/games/rts/tools/art-split.js inject
// — or edit rts.html and `extract`; rts-split.test.js fails while they differ.
// Every free identifier (the canvas `g`, the anchor, the helpers, `col`, `sov`…)
// is a local of the enclosing bake function: see apps/games/rts/art/units/README.md.

// @@PART main — inside bakeVehicle() in rts.html
if (wantH) {
  var hy = by - 5.4;                                  // the belly line
  // THE BOOM IS THE LENGTH, and `len` is not. Sweeping `len` 34/42/50
  // leaves the broadside aspect at 1.622 to three decimals, which was
  // read as "this airframe cannot be lengthened"; it only means `len`
  // sizes the CABIN (`len * 0.30`) and nothing else here. `bmB` is the
  // tail: at 16.5 the boom ended under the rotor disc, so the sprite
  // was a crate with a propeller and the "long slim TAIL BOOM running
  // most of the sprite's length" this comment block promises was never
  // drawn. 26.0 puts the fin clear of the disc, which is the whole
  // read of [SHAD] at 64x21.
  var bmA = 2.0, bmB = 26.0;                          // boom start/end, aft of centre
  // GEAR TUCKED, not splayed. The rails used to sit at `by - 0.6`,
  // five pixels under a belly at `by - 5.4`, on struts as deep as the
  // cabin — a helicopter standing on spider legs, and eight of the
  // sprite's forty-five rows went on them. [SHAD] is a Black Hawk, its
  // gear is short and sits close under the fuselage, and it is only
  // ever seen flying. At `by-4.4`, over a rail shortened to the length
  // of the cabin, the gear still reads as gear and costs two rows.
  var drawSkids = function () {
    for (sg = -1; sg <= 1; sg += 2) {
      g.strokeStyle = '#191c21'; g.lineWidth = 1.6; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx + fx * 5.5 + px * wid * 0.34 * sg, by - 4.4 + fy * 5.5 + py * wid * 0.34 * sg);
      g.lineTo(cx - fx * 2.5 + px * wid * 0.34 * sg, by - 4.4 - fy * 2.5 + py * wid * 0.34 * sg);
      g.stroke();
      for (i2 = -1; i2 <= 1; i2 += 2) {
        g.strokeStyle = '#3d434b'; g.lineWidth = 1.1;
        g.beginPath();
        g.moveTo(cx + fx * i2 * 3.0 + px * wid * 0.34 * sg, by - 4.6 + fy * i2 * 3.0 + py * wid * 0.34 * sg);
        g.lineTo(cx + fx * i2 * 2.2 + px * wid * 0.20 * sg, hy + 0.4 + fy * i2 * 2.2 + py * wid * 0.20 * sg);
        g.stroke();
      }
    }
  };
  var drawBoom = function () {
    var b0x = cx - fx * bmA, b0y = hy - 3.4 - fy * bmA;
    var b1x = cx - fx * bmB, b1y = hy - 4.6 - fy * bmB;
    // A TAPERED boom, not a stroke of constant width. At 16.5 units a
    // 3 px line was fine because it was mostly hidden under the disc;
    // at 26 it is the longest thing on the sprite, and a line of one
    // width with a box on the end reads as an aerial, not a tail. Deep
    // where it leaves the cabin, thin at the fin — drawn as a quad
    // across the screen normal so it tapers at EVERY bearing rather
    // than only the ones where the boom happens to run horizontally.
    var bvx = b1x - b0x, bvy = b1y - b0y, bvl = Math.hypot(bvx, bvy) || 1;
    var bnx = -bvy / bvl, bny = bvx / bvl;
    var quad = function (w0, w1, t0, t1, col) {
      var ax = b0x + bvx * t0, ay = b0y + bvy * t0;
      var bx2 = b0x + bvx * t1, by2 = b0y + bvy * t1;
      g.beginPath();
      g.moveTo(ax + bnx * w0, ay + bny * w0); g.lineTo(bx2 + bnx * w1, by2 + bny * w1);
      g.lineTo(bx2 - bnx * w1, by2 - bny * w1); g.lineTo(ax - bnx * w0, ay - bny * w0);
      g.closePath(); g.fillStyle = col; g.fill();
    };
    quad(2.5, 1.0, 0, 1, shade(hull, 0.66));
    // and the lit crown along whichever edge is the UPPER one on
    // screen. It is a NARROW band on a dark tube, not the other way
    // round: at 0.78/1.10 over two thirds of the depth the boom came
    // out paler than the cabin it hangs off, a bright bar running the
    // length of the sprite beside an equally bright rotor blade.
    var blit = bny < 0 ? 1 : -1;
    (function () {
      var w0 = 2.5 * blit, w1 = 1.0 * blit;
      g.beginPath();
      g.moveTo(b0x + bnx * w0, b0y + bny * w0); g.lineTo(b1x + bnx * w1, b1y + bny * w1);
      g.lineTo(b1x + bnx * w1 * 0.48, b1y + bny * w1 * 0.48);
      g.lineTo(b0x + bnx * w0 * 0.48, b0y + bny * w0 * 0.48);
      // 1.02, not the 1.18 this edge used to carry and not the 1.55
      // before that: both were tuned against a charcoal hull, and on
      // the gunship grey they clip toward white.
      g.closePath(); g.fillStyle = shade(hull, 1.02); g.fill();
    })();
    // horizontal stabiliser, out at the fin where a Black Hawk carries it
    g.strokeStyle = shade(hull, 1.02); g.lineWidth = 2.0; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(b1x + fx * 2.4 + px * 4.2, b1y + 0.6 + fy * 2.4 + py * 4.2);
    g.lineTo(b1x + fx * 2.4 - px * 4.2, b1y + 0.6 + fy * 2.4 - py * 4.2);
    g.stroke();
    // the fin, wearing the house flash, and the tail rotor on it. Lower
    // and longer than the 3.2x0.9x5.0 post it was: at the end of a boom
    // this long a tall thin box reads as a lamp standard.
    isoBox(g, b1x, b1y + 0.4, 4.2, 0.9, 4.2, a, shade(hull, 0.94), PEDGE);
    isoBox(g, b1x - fx * 0.4, b1y - 3.4 - fy * 0.4, 2.8, 1.0, 1.4, a, panel, PEDGE);
    var trR = 3.6, trPh = anim === 'prop' ? 0.5236 : 0;
    g.strokeStyle = 'rgba(206,214,224,.40)'; g.lineWidth = 1.0; g.lineCap = 'round';
    for (i2 = 0; i2 < 3; i2++) {
      var tra = trPh + i2 * 2.094;
      g.beginPath(); g.moveTo(b1x + px * 1.2, b1y - 2.6 + py * 1.2);
      g.lineTo(b1x + px * 1.2 + Math.cos(tra) * trR * 0.5, b1y - 2.6 + py * 1.2 + Math.sin(tra) * trR);
      g.stroke();
    }
  };
  var drawCabin = function () {
    var kx = cx + fx * 3.6, ky = hy + fy * 3.6;
    // A LOW cabin. At 6.4 deep with the roof 8.0 up it was as tall as
    // it was long and the mast had to sit above THAT, which is where
    // the sprite's height came from once the gear was tucked.
    chassis(kx, ky, len * 0.30, wid * 0.62, 5.0, hull, PEDGE, 2.4);
    isoBox(g, kx - fx * 0.6, ky - 6.4 - fy * 0.6, len * 0.24, wid * 0.52, 1.2, a,
           shade(hull, 1.16), PEDGE);                             // roof
    // the glass nose
    isoBox(g, kx + fx * 4.2, ky - 2.6 + fy * 4.2, 1.5, wid * 0.50, 5.4, a, '#222a33', '#0b0e12');
    g.fillStyle = 'rgba(168,196,222,.52)';
    g.beginPath(); g.ellipse(kx + fx * 4.7, ky - 6.2 + fy * 4.7, 3.0, 1.5, 0, 0, 6.29); g.fill();
    g.fillStyle = 'rgba(214,232,248,.34)';
    g.beginPath(); g.ellipse(kx + fx * 4.9, ky - 7.0 + fy * 4.9, 1.7, 0.7, 0, 0, 6.29); g.fill();
    for (sg = -1; sg <= 1; sg += 2) {
      // the sliding door a side, with the owner's band over it
      isoBox(g, kx + px * wid * 0.34 * sg, ky - 3.0 + py * wid * 0.34 * sg,
             len * 0.18, 0.9, 3.6, a, shade(hull, 0.52), PEDGE);   // was flat '#151920': on the
      // charcoal hull it vanished, on the grey one it made the cabin a
      // black wedge hanging off a pale boom. Tied to the hull it stays
      // a shadowed door however the airframe is valued.
      isoBox(g, kx + px * wid * 0.34 * sg, ky - 5.6 + py * wid * 0.34 * sg,
             len * 0.20, 1.0, 1.2, a, panel, PEDGE);
      puck(kx - fx * 1.8 + px * wid * 0.42 * sg, ky - 3.4 - fy * 1.8 + py * wid * 0.42 * sg,
           0.9, 1.2, shade(hull, 0.70), STEEL, PEDGE);            // sensor pod on a stub pylon
    }
    // the chin gun ([BlackHawkCannon], a 20mm quad)
    barrel(kx + fx * 4.6, ky - 1.4 + fy * 4.6, 5.6, 0.75, 0.50, '#131519');
  };
  drawSkids();
  if (fy > 0) { drawBoom(); drawCabin(); } else { drawCabin(); drawBoom(); }
  // mast and main rotor, over everything
  var mrx = cx + fx * 2.0, mry = hy - 8.0 + fy * 2.0;
  puck(mrx, mry + 1.4, 1.2, 2.0, shade(hull, 0.72), STEEL, PEDGE);
  // Span 16.0, and it is DERIVED, not tuned. A UH-60's rotor is 16.36 m
  // across a 19.76 m overall length — 0.83 — and the airframe now runs
  // 38 units nose to tail rotor, so 0.83 * 38 / 2 = 15.8. At 19.0 the
  // disc was WIDER than the fuselage it hung off, which is why the
  // whole sprite measured as a disc: it set both the width and the
  // height, and shrinking it alone lost width as fast as height
  // (mrR 15/19/23 -> aspect 1.585/1.622/1.755, all pinned near 2
  // because an iso-squashed circle IS 2:1). It only pays once the boom
  // is long enough to own the width instead.
  //
  // Do not go the other way: 21 made the disc round enough that an air
  // PEER matched the Nighthawk's mask better than its own other
  // bearings (`peerVsSelf.air` 0 -> 1). The rim is held above the alpha
  // floor instead, below.
  var mrPh = anim === 'prop' ? 0.7854 : 0, mrR = 16.0;
  g.lineCap = 'round';
  // THE DISC IS THE UNIT. A helicopter's one unmistakable read from
  // above is the bright blur it sweeps, and ours was drawn at alpha
  // .09 -- 1400-odd pixels sitting 3 luminance points off the grass
  // under them, i.e. an invisible smear that still counted as body.
  // That is exactly why `harrier | nighthawk` was the union-footprint
  // window's only failure: most of the chopper's footprint was a patch
  // of ground. `docs/ra2-ref/cameos/nighthawk.png` shows the blade as a
  // bright streak clear of the airframe. Drawn the way a real blur
  // looks: the RIM is brightest, because that is where tip speed puts
  // the most blade per unit area, and the hub end is nearly clear.
  var rx = mrR * ISO_X * 1.4142, ry = mrR * ISO_Y * 1.4142;
  g.save();
  g.translate(mrx, mry); g.scale(1, ry / rx);       // circle space, then squash to the iso ellipse
  var mrg = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  mrg.addColorStop(0.00, 'rgba(206,214,226,.05)');  // nearly clear at the hub
  mrg.addColorStop(0.55, 'rgba(206,214,226,.22)');
  mrg.addColorStop(0.90, 'rgba(224,231,242,.42)');  // densest just inside the tip
  mrg.addColorStop(1.00, 'rgba(224,231,242,.09)');  // and feathered off it -- but not
  // to nothing: a rim that reaches zero alpha loses the outer 2 px of
  // span off the bounding box, and this airframe's whole RA2 spec is
  // rotor span. 5% is under the eye and over the measurement's floor.
  g.fillStyle = mrg;
  g.beginPath(); g.arc(0, 0, rx, 0, 6.29); g.fill();
  g.restore();
  // Two blades, not a four-armed cross: a cross centred on the mast
  // reads as a gunsight, and the phase below never lets the pair sit
  // on the sprite's own axes.
  for (i2 = 0; i2 < 4; i2++) {
    var mra = mrPh + 0.42 + i2 * 1.5708;
    g.strokeStyle = i2 % 2 ? 'rgba(226,233,242,.22)' : 'rgba(232,239,248,.40)';
    g.lineWidth = i2 % 2 ? 1.0 : 1.3;
    g.beginPath();
    g.moveTo(mrx + Math.cos(mra) * rx * 0.22, mry + Math.sin(mra) * ry * 0.22);
    g.lineTo(mrx + Math.cos(mra) * rx * 0.94, mry + Math.sin(mra) * ry * 0.94);
    g.stroke();
  }
  // A saturated red bead sat here. On the light hull it now reads at
  // map size, and a saturated red mark on the BLUE player's aircraft
  // is the one thing the palette rule forbids: only the owner's colour
  // is saturated. A warm off-white still reads as a lamp.
  g.fillStyle = '#e3d3b6';                                        // anti-collision lamp
  g.beginPath(); g.ellipse(mrx - fx * 2.4, mry + 1.6 - fy * 2.4, 0.8, 0.7, 0, 0, 6.29); g.fill();
}

// Iron Frontier — ships/dolphin: the art for one unit.
// Called by bakeShip() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.



function drawDolphin(C) {
  var FR = C.FR, HOUSE = C.HOUSE, HULL = C.HULL, L = C.L, P = C.P, W = C.W, g = C.g, nearS = C.nearS;

// [DLPH]: an animal, not a boat. A fusiform body, a beak, a dorsal fin
// and a fluke.
//
// Like the Squid, she was three `g.ellipse` calls at FIXED SCREEN
// RADII — identical at all 32 bearings, so the body never turned — and
// over it a HOUSE-coloured "harness" drawn as an 8-unit triangle
// standing straight up off her back. At 4x that triangle was the
// biggest thing on the animal and read as a shark fin in the wrong
// colour, with the beak's 2.4-wide round-capped stroke crossing it
// like a wing: a paper dart, not a dolphin. Body and fin are now
// PLAN-SPACE, so both foreshorten with her, and the owner colour is a
// STRAP across the shoulders where a harness actually sits.
var DOL = [[-0.86, 0.10], [-0.55, 0.62], [-0.16, 0.92], [0.22, 0.88],
           [0.56, 0.60], [0.80, 0.30], [1.00, 0.12]];
var dpoly = function (lift, squash, fill) {
  g.beginPath();
  var i6, q6;
  for (i6 = 0; i6 < DOL.length; i6++) {
    q6 = P(L * DOL[i6][0], W * squash * DOL[i6][1], FR + lift);
    if (i6) g.lineTo(q6[0], q6[1]); else g.moveTo(q6[0], q6[1]);
  }
  for (i6 = DOL.length - 1; i6 >= 0; i6--) {
    q6 = P(L * DOL[i6][0], -W * squash * DOL[i6][1], FR + lift);
    g.lineTo(q6[0], q6[1]);
  }
  g.closePath(); g.fillStyle = fill; g.fill();
};
dpoly(0.0, 1.30, '#cfd8de');                                      // pale belly, awash
dpoly(1.6, 1.10, HULL);                                           // the flank
dpoly(2.9, 0.70, shade(HULL, 1.26));                              // the lit back
var bq = P(0, 0, FR);
var kq = P(-L * 0.92, 0, FR + 1.2);                               // fluke, two lobes
g.fillStyle = shade(HULL, 0.86);
g.beginPath();
g.moveTo(kq[0] + 2.4, kq[1] - 0.6); g.lineTo(kq[0] - 3.6, kq[1] - 2.6);
g.lineTo(kq[0] - 2.2, kq[1] - 0.2); g.lineTo(kq[0] - 3.8, kq[1] + 1.8);
g.closePath(); g.fill();
// The dorsal fin: a raked triangle standing on the back, in her own
// grey. It is the only thing above her line and §2.4 asks for >= 3 px
// of it, so it gets width as well as height — a 1-px blade dies first
// at ZMIN and takes the whole read with it.
var f0 = P(-L * 0.06, 0, FR + 3.2), f1 = P(-L * 0.40, 0, FR + 3.2);
g.fillStyle = shade(HULL, 0.74);
g.beginPath();
g.moveTo(f0[0], f0[1]); g.lineTo(f0[0] - 1.2, f0[1] - 5.2);
g.lineTo(f1[0] - 0.6, f1[1] - 1.0); g.lineTo(f1[0], f1[1]);
g.closePath(); g.fill();
// The harness — a strap over the shoulders, her only paint.
var h0 = P(L * 0.30, W * 1.10, FR + 1.4), h1 = P(L * 0.30, -W * 1.10, FR + 1.4);
g.strokeStyle = HOUSE; g.lineWidth = 2.2;
g.beginPath(); g.moveTo(h0[0], h0[1] - 1.0); g.lineTo(h1[0], h1[1] - 1.0); g.stroke();
// THE EYE WAS THE ONE PART LEFT IN SCREEN SPACE, and it is the same
// bug the paragraph above this block was written about: the body and
// fin were moved to PLAN space so they foreshorten with her, and this
// was missed. `P(L * 0.98, 0, ...)` is her BEAK, and the eye was then
// shoved four SCREEN pixels to the left of it whichever way she was
// pointing — so at every bearing where the snout runs leftward the
// offset walks straight off the animal. Measured on the baked sheet:
// at octants 3, 4 and 5 the eye bakes as a DETACHED 2x3 black blob
// sitting 4-12 px clear of her in open water, and at the broadside
// octant the gate reads it as part of her, stretching the bbox from
// 38 px to 44 (16%). §2.3 asks the Dolphin for "no orthogonal edges
// anywhere"; a floating black rectangle is the only one she had.
//
// Placed in plan space it turns with her. `L * 0.70` is just abaft
// the melon, and `W * 0.30` on the NEAR flank keeps it inside the
// 0.475 half-beam the DOL profile has there, so it never touches an
// edge; `nearS` picks the flank the camera can see, which is what a
// side-on animal actually shows.
var eyq = P(L * 0.70, nearS * W * 0.30, FR + 2.4);
g.fillStyle = '#101418';                                          // the eye
g.beginPath(); g.ellipse(eyq[0], eyq[1], 0.7, 0.6, 0, 0, 6.29); g.fill();
}

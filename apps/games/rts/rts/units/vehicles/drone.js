// Iron Frontier — vehicles/drone: the art for one unit.
// Called by bakeVehicle() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.




function drawDrone(C) {
  var PEDGE = C.PEDGE, by = C.by, col = C.col, cx = C.cx, fx = C.fx, fy = C.fy, g = C.g,
      gEllipse = C.gEllipse, hull = C.hull, i2 = C.i2, panel = C.panel, pdark = C.pdark,
      plit = C.plit, puck = C.puck, px = C.px, py = C.py, sg = C.sg;

// TERROR DRONE — vermin, and it has to LOOK like vermin: a body barely
// wider than a tank's turret, slung low between four thin splayed
// legs, with a pale carapace over a house-colour belly and a dark
// mandible cluster at the nose. No tracks, no deck, no gun. The legs
// are drawn in the ground plane so they swing round with the facing
// instead of staying pinned to the screen axes.
// Scale first: `soviet-terror-drone.png` measures 18x11 at the
// down-right facing where a Chrono Miner measures 53x46. At 45x30 the
// previous pass was two and a half times over and read as a barrel on
// stilts standing beside the tanks; vermin has to be SMALL.
var bodyY = by - 2.4;
// A leg is a BROAD flat blade in the reference, not a wire: a tapered
// quad from the hip out to the foot, widest at the knee.
//
// The knee is CARRIED HIGH and pushed out past the shoulder, so the
// leg is an arch rather than a strut. That is what gets the drone
// over the scale gate: `spikeOf` measures a horizontal spike as the
// MEDIAN COLUMN HEIGHT of the run outside the body, and a straight
// strut running down to a claw leaves 2-3 px columns out there that
// vanish at ZMIN 0.55 (measured 3.0 px, floor 3.64). An arched blade
// puts knee AND shin in the same column and doubles it. It is also
// what the sprite has — `soviet-terror-drone.png` is an insect
// crouched with its knees above its back, not a table.
function droneLeg(lu, lv, near) {
  var hipx = cx + fx * lu * 0.26 + px * lv * 0.26;
  var hipy = bodyY + fy * lu * 0.26 + py * lv * 0.26;
  var kneex = cx + fx * lu * 0.86 + px * lv * 0.92;
  var kneey = bodyY - 1.6 + fy * lu * 0.86 + py * lv * 0.92;
  var footx = cx + fx * lu + px * lv, footy = by + 0.2 + fy * lu + py * lv;
  // the blade's width runs perpendicular to the leg on screen
  var dxk = kneex - hipx, dyk = kneey - hipy, dl = Math.hypot(dxk, dyk) || 1;
  var wnx = -dyk / dl, wny = dxk / dl, bw = near ? 1.7 : 1.4;   // 2026-09-10: the sheet's legs are wire-thin
  g.beginPath();
  g.moveTo(hipx + wnx * bw * 0.8, hipy + wny * bw * 0.8);
  g.lineTo(kneex + wnx * bw, kneey + wny * bw);
  g.lineTo(footx, footy);
  g.lineTo(kneex - wnx * bw, kneey - wny * bw);
  g.lineTo(hipx - wnx * bw * 0.8, hipy - wny * bw * 0.8);
  g.closePath();
  g.fillStyle = near ? '#8b929d' : '#4c535c'; g.fill();
  g.strokeStyle = '#1c2026'; g.lineWidth = 0.6; g.stroke();
  g.strokeStyle = near ? shade(VACC.drone, 1.34) : shade(VACC.drone, 0.72); g.lineWidth = 0.9;
  g.beginPath();
  g.moveTo(hipx, hipy - 0.5); g.lineTo(kneex, kneey - 0.5); g.stroke();
  g.fillStyle = '#20242a';                                  // foot claw
  g.beginPath(); g.ellipse(footx, footy, 0.8, 0.5, 0, 0, 6.29); g.fill();
}
// Splayed along the forward axis rather than across it: the
// reference bbox is markedly WIDE and FLAT, and a square stance
// stood the drone up on stilts a third taller than the real one.
// Reach EXTENDED about a quarter (4.7/3.9 -> 5.9/4.9). Beside RA2's own
// plate ours read as a squat body with stubby legs; theirs is a spider
// whose splayed legs ARE the silhouette. The arch above is unchanged,
// because that is what carries the scale gate.
var legsD = [[5.9, -4.9], [5.9, 4.9], [-6.0, -5.0], [-6.0, 5.0]];
var legOrder = [];
for (i2 = 0; i2 < 4; i2++)
  legOrder.push([fy * legsD[i2][0] + py * legsD[i2][1], legsD[i2]]);
legOrder.sort(function (m, n) { return m[0] - n[0]; });
for (i2 = 0; i2 < 2; i2++) droneLeg(legOrder[i2][1][0], legOrder[i2][1][1], false);
// the body: a dark underbelly ring, a house-colour band round the
// middle, a pale carapace lid, mandibles at the nose
// The house colour is the WIDEST ring, so it survives from every
// angle: built as a thin band under a broad pale lid (the first
// attempt) the drone came back a grey mushroom with two red pixels.
puck(cx, bodyY + 1.1, 2.5, 1.0, shade(col, 0.72), pdark, PEDGE);   // colour underbelly
puck(cx, bodyY + 0.3, 3.3, 3.4, pdark, panel, PEDGE);              // colour hull ring
g.fillStyle = plit;
gEllipse(cx - fx * 0.5 + px * 0.6, bodyY - 2.1 - fy * 0.5 + py * 0.6, 1.45); g.fill();
// The carapace plate is deliberately SMALL. Built out to the hull
// line it capped the colour ring from above and the drone came back
// a grey mushroom with a red hairline round its middle.
puck(cx, bodyY - 2.1, 1.15, 0.75, shade(hull, 0.74), shade(hull, 1.02), '#2f353d');
g.fillStyle = shade(hull, 1.22);                            // carapace glint
gEllipse(cx - fx * 0.35, bodyY - 2.95 - fy * 0.35, 0.6); g.fill();
puck(cx + fx * 2.0, bodyY - 1.5 + fy * 2.0, 1.0, 1.1,       // the head
     '#31373f', '#79818c', '#15181d');
for (sg = -1; sg <= 1; sg += 2) {                           // mandibles
  g.strokeStyle = shade(VACC.drone, 0.46); g.lineWidth = 1.4; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx + fx * 1.9 + px * 0.9 * sg, bodyY - 0.8 + fy * 1.9 + py * 0.9 * sg);
  g.lineTo(cx + fx * 3.4 + px * 0.5 * sg, bodyY + 0.1 + fy * 3.4 + py * 0.5 * sg);
  g.stroke();
  g.strokeStyle = VACC.drone; g.lineWidth = 0.7;
  g.beginPath();
  g.moveTo(cx + fx * 1.9 + px * 0.9 * sg, bodyY - 1.2 + fy * 1.9 + py * 0.9 * sg);
  g.lineTo(cx + fx * 3.3 + px * 0.5 * sg, bodyY - 0.4 + fy * 3.3 + py * 0.5 * sg);
  g.stroke();
}
g.fillStyle = plit;                                         // single eye, house hue (2.4)
gEllipse(cx + fx * 1.9, bodyY - 2.3 + fy * 1.9, 0.5); g.fill();
g.strokeStyle = PEDGE; g.lineWidth = 0.5; g.stroke();
for (sg = -1; sg <= 1; sg += 2) {                           // indigo photoreceptors
  g.fillStyle = VACC.drone;
  gEllipse(cx + fx * 1.6 + px * 1.15 * sg, bodyY - 1.9 + fy * 1.6 + py * 1.15 * sg, 0.55);
  g.fill();
}
for (i2 = 2; i2 < 4; i2++) droneLeg(legOrder[i2][1][0], legOrder[i2][1][1], true);
}

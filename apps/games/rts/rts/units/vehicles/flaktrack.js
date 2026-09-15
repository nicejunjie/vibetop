// Iron Frontier — vehicles/flaktrack: the art for one unit.
// Called by bakeVehicle() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.

function drawFlaktrack(C) {
  var PEDGE = C.PEDGE, RING = C.RING, a = C.a, bumper = C.bumper, by = C.by, chassis = C.chassis,
      cx = C.cx, dark = C.dark, deck = C.deck, exhaust = C.exhaust, fx = C.fx, fy = C.fy, g = C.g,
      hull = C.hull, i2 = C.i2, lamp = C.lamp, len = C.len, panel = C.panel, pdark = C.pdark,
      prism = C.prism, puck = C.puck, px = C.px, py = C.py, sg = C.sg, trackRun = C.trackRun,
      wantH = C.wantH, wantT = C.wantT, wheelDisc = C.wheelDisc, wid = C.wid;

// FLAK TRACK — a compact RA2-style half-track. The running gear is the
// identity: a khaki cab and bonnet over a clear front wheel pair at the
// nose, a dark rear tracked bogie under an open bed at the tail. The gun
// is a single silver AA barrel raked ~50 degrees on a small red
// owner-colour cradle — no turret, no slab, no blue.
var tOff = wid * 0.40;
if (wantH) {
  // Chassis — warmer/darker khaki, not a bright white slab.
  chassis(cx, by - 1.0, len * 0.88, wid * 0.66, 4.0, shade(hull, 0.86), dark, 2.6);
  // Rear tracked bogies are part of the silhouette, not under-paint. Draw
  // them after the chassis so its full-length side wall cannot erase their
  // road wheels, sprockets and link marks. The upper body still caps them.
  for (sg = -1; sg <= 1; sg += 2)
    trackRun(cx - fx * 6.4 + px * tOff * sg, by - 0.2 - fy * 6.4 + py * tOff * sg,
             len * 0.44, wid * 0.32, 3.8, shade(hull, 0.68),
             { top: '#242424', side: '#1a1a1a', dark: '#101010' });
  // Front wheel pair, drawn AFTER the chassis so the tyres break the hull
  // line the way a road wheel under a bonnet does in the rip.
  var fw = [];
  for (sg = -1; sg <= 1; sg += 2)
    fw.push([cx + fx * 9.8 + px * tOff * sg, by - 1.4 + fy * 9.8 + py * tOff * sg]);
  fw.sort(function (m, n) { return m[1] - n[1]; });
  for (i2 = 0; i2 < fw.length; i2++)
    wheelDisc(fw[i2][0], fw[i2][1], 3.4, 1.15, '#2b2b2b', shade(hull, 0.68));
  // Open bed at the tail — darker khaki, recessed.
  isoBox(g, cx - fx * 5.2, by - 5.0 - fy * 5.2, len * 0.44, wid * 0.64, 4.8,
         a, shade(deck, 0.88), dark);
  // Thin red coaming on the open weapon bed; this is trim, not a solid block.
  isoBox(g, cx - fx * 5.2, by - 9.8 - fy * 5.2, len * 0.26, wid * 0.42, 1.1,
         a, panel, PEDGE);
  // Khaki cab at the nose — warmer/darker, clearly separated from the bed.
  isoBox(g, cx + fx * 5.6, by - 5.0 + fy * 5.6, len * 0.26, wid * 0.58, 4.2,
         a, shade(hull, 0.84), dark);
  // Cab roof — slightly lighter to catch the light.
  isoBox(g, cx + fx * 5.6, by - 9.2 + fy * 5.6, len * 0.22, wid * 0.50, 1.1,
         a, shade(hull, 0.92), dark);
  // One useful owner-colour marking, matching the large red cab-side panel
  // in the RA2 sprite. Keep it vertical and localised so it reads as a door,
  // not as the old stack of red stripes across the whole vehicle.
  for (sg = -1; sg <= 1; sg += 2)
    isoBox(g, cx + fx * 4.6 + px * wid * 0.34 * sg,
           by - 2.4 + fy * 4.6 + py * wid * 0.34 * sg,
           len * 0.20, 1.5, 5.6, a, panel, PEDGE);
  // RA2 also carries a narrow red flash over the front wheel arch.
  for (sg = -1; sg <= 1; sg += 2)
    isoBox(g, cx + fx * 10.0 + px * wid * 0.33 * sg,
           by - 2.3 + fy * 10.0 + py * wid * 0.33 * sg,
           len * 0.20, 2.0, 2.4, a, panel, PEDGE);
  // Windscreen — dark glass at the front of the cab.
  var fwx = cx + fx * 8.0, fwy = by - 5.6 + fy * 8.0;
  isoBox(g, fwx, fwy, 1.3, wid * 0.52, 3.4, a, '#242a32', '#0f1216');
  g.fillStyle = 'rgba(219,219,219,.32)';
  g.beginPath();
  g.ellipse(fwx + fx * 0.4, fwy - 2.3 + fy * 0.4, 2.6, 1.1, 0, 0, 6.29); g.fill();
  bumper(len * 0.42, wid * 0.22, by - 1.4);
  for (i2 = -1; i2 <= 1; i2 += 2)
    lamp(cx + fx * len * 0.40 + px * wid * 0.24 * i2,
         by - 3.8 + fy * len * 0.40 + py * wid * 0.24 * i2);
  exhaust(cx - fx * len * 0.40, by - 5.2 - fy * len * 0.40);
}
if (wantT) {
  // Single silver AA barrel raked ~50 degrees on a small red
  // owner-colour cradle. No turret, no slab — just the raised gun.
  var kx = cx - fx * 4.4, ky = by - RING - fy * 4.4;
  // Red owner-colour cradle — a thin restrained collar, not a big puck.
  puck(kx, ky, 1.7, 1.4, pdark, panel, PEDGE);
  // Dark mount — small, tapered.
  prism(kx - fx * 0.4, ky - 1.4, [[1.3, -1.4], [1.3, 1.4], [-1.4, 1.1], [-1.4, -1.1]],
        2.0, '#4a4a4a', '#1a1a1a');
  // Breech housing — compact, not a slab.
  isoBox(g, kx - fx * 0.8, ky - 3.4 - fy * 0.8, 2.0, 3.0, 1.7,
         a, '#454545', '#161616');
  // One continuous tube, one muzzle. The former duplicated tubes made
  // a tuning-fork shape; a surface highlight must not become another gun.
  var gAlong = kx + fx * 0.6, gAlongY = ky - 4.8 + fy * 0.6;
  var gTipX = kx + fx * 5.6, gTipY = ky - 16.6 + fy * 5.6;  // tall ~50 deg RA2 profile
  g.strokeStyle = '#343a40'; g.lineWidth = 2.6; g.lineCap = 'butt';
  g.beginPath(); g.moveTo(gAlong, gAlongY); g.lineTo(gTipX, gTipY); g.stroke();
  g.strokeStyle = '#d9d9d2'; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(gAlong - .35, gAlongY); g.lineTo(gTipX - .35, gTipY); g.stroke();
  g.fillStyle = '#242a30';
  g.beginPath(); g.ellipse(gTipX, gTipY, 1.25, .8, 0, 0, 6.29); g.fill();
  // Ammo drum at the breech — small.
  puck(kx - fx * 1.8, ky - 2.0 - fy * 1.8, 0.9, 1.3,
       '#3d434c', '#7f8792', '#14171c');
}
}

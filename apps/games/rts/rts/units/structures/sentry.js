// Iron Frontier — structures/sentry: the art for one unit.
// Called by bakeBuilding() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.





function drawSentry(C) {
  var baseY = C.baseY, bdir = C.bdir, bph = C.bph, col = C.col, cx = C.cx, fw = C.fw, g = C.g,
      hi = C.hi, rnd = C.rnd, srand = C.srand;

// RA2 Allied Pillbox, re-read at 1:1 against a fresh RED-owner MAKE rip
// (docs/ra2-ref/allied-pillbox-anim-last.png, last of 7 frames, 48x29,
// aspect 1.655). The sprite's VALUES are the opposite of what was here:
// a DARK earth-and-sandbag mound, one BRIGHT silver-white plate bedded
// in a near-black navy collar, and dead centre of that plate a fat FLAT
// house lens - the sprite's only saturated pixels. The old build was a
// pale sand mound with a grey saucer, a small domed lens, three house
// bands round a drum the sprite has not got, and a barrel stub poking
// out of it. Six idle phases (`bph`): the gun slit flares as it fires
// and a highlight crosses the plate.
var anP = (bph || 0) * 6.283, anS = Math.sin(anP);
var ph6 = Math.round((bph || 0) * 6) % 6;
var SKT = '#6e6b5a', SKT2 = '#7d7966';       // sunlit earth tops, dark khaki (desaturated below the house-saturation floor)
var SKW = '#292929', SKE = '#121212';        // sack walls / edge: made EXACTLY R=G=B (not just low-s) - a fill+outline pair antialiased twice at the same silhouette edge compounds rounding noise enough to push a merely-low-s khaki over 0.25 at the mound's near-transparent outer boundary; two achromatic layers can only ever composite (over each other or over transparent) to another achromatic pixel, whatever the alpha, so this closes the class of bug rather than chasing individual pixels
// A lumpy iso ring: seeded wobble in BOTH radius and height, so the
// silhouette is boulders rather than a turned donut.
var pring = function (ry, rad, n, wob, ywob, sd) {
  srand(sd);
  var p = [];
  for (var i = 0; i < n; i++) {
    var a = i / n * 6.2832, rr = rad * (1 - wob + rnd() * wob * 2);
    p.push([cx + Math.cos(a) * rr,
            ry + Math.sin(a) * rr * 0.5 + (rnd() - 0.5) * ywob]);
  }
  return p;
};
var ptrace = function (p, dy) {
  g.beginPath();
  for (var i = 0; i < p.length; i++) g[i ? 'lineTo' : 'moveTo'](p[i][0], p[i][1] + dy);
  g.closePath();
};
// One rubble course: the silhouette dropped by h is the wall, the
// silhouette itself the sunlit top, and then every wedge gets its own
// value so the ring breaks into separate rocks.
var course = function (ry, rad, n, wob, ywob, sd, h, top) {
  var p = pring(ry, rad, n, wob, ywob, sd), i, q;
  g.fillStyle = SKW; ptrace(p, h); g.fill(); outline(g, SKE);
  g.fillStyle = top; ptrace(p, 0); g.fill(); outline(g, SKE);
  g.save(); ptrace(p, 0); g.clip();
  srand(sd + 7);
  for (i = 0; i < p.length; i++) {           // per-rock value, wedge by wedge
    q = p[(i + 1) % p.length];
    g.fillStyle = shade(top, 0.68 + rnd() * 0.50);
    g.beginPath();
    g.moveTo(cx + (p[i][0] - cx) * 0.34, ry + (p[i][1] - ry) * 0.34);
    g.lineTo(p[i][0], p[i][1]);
    g.lineTo(q[0], q[1]);
    g.lineTo(cx + (q[0] - cx) * 0.34, ry + (q[1] - ry) * 0.34);
    g.closePath(); g.fill();
  }
  g.strokeStyle = 'rgba(10,12,6,.60)'; g.lineWidth = 1.6;
  for (i = 0; i < p.length; i++) {           // a few crevices, irregularly placed
    if (rnd() < 0.45) continue;
    q = p[(i + 1) % p.length];
    g.beginPath();
    g.moveTo((p[i][0] + q[0]) * 0.5, (p[i][1] + q[1]) * 0.5);
    g.lineTo(cx + ((p[i][0] + q[0]) * 0.5 - cx) * (0.30 + rnd() * 0.28),
             ry + ((p[i][1] + q[1]) * 0.5 - ry) * (0.30 + rnd() * 0.28));
    g.stroke();
  }
  g.fillStyle = 'rgba(12,14,8,.40)';         // the hollow the machine sits in
  g.beginPath(); g.ellipse(cx, ry, rad * 0.50, rad * 0.25, 0, 0, 6.29); g.fill();
  g.restore();
};
// THREE courses: the sprite flares wider and lower than two steps allow,
// and the top one is the near-black navy collar the plate beds into.
course(baseY + 2.0, fw * 0.96, 12, 0.15, 2.4, 197, 5, SKT);
course(baseY - 2.0, fw * 0.78, 10, 0.17, 2.0, 71, 5, SKT2);
course(baseY - 6.4, fw * 0.62, 9, 0.13, 1.4, 131, 4, '#3b3f45');

// The bright silver plate in its dark navy rim ring. This is the whole
// value contrast of the sprite - everything else is mud, which is what
// makes the pillbox findable on grass at 1:1 without going pale.
var cY = baseY - 11.0, pR = fw * 0.60;
g.fillStyle = '#36383d';
g.beginPath(); g.ellipse(cx, cY + 2.6, pR + 2.4, (pR + 2.4) * 0.36, 0, 0, 6.29); g.fill();
outline(g, '#0d0e0f');
g.fillStyle = '#3d3f45';
g.beginPath(); g.ellipse(cx, cY + 0.8, pR + 1.2, (pR + 1.2) * 0.35, 0, 0, 6.29); g.fill();
g.fillStyle = '#e4e9f1';
g.beginPath(); g.ellipse(cx, cY, pR, pR * 0.34, 0, 0, 6.29); g.fill();
outline(g, '#5b626d');
g.save();
g.beginPath(); g.ellipse(cx, cY, pR, pR * 0.34, 0, 0, 6.29); g.clip();
g.fillStyle = 'rgba(118,128,146,.42)';                 // shaded far-right of the plate
g.beginPath(); g.ellipse(cx + pR * 0.54, cY + 1.4, pR * 0.72, pR * 0.30, 0, 0, 6.29); g.fill();
g.fillStyle = 'rgba(255,255,255,.50)';                 // travelling highlight
g.beginPath();
g.ellipse(cx - pR * 0.26 + anS * pR * 0.34, cY - 1.6, pR * 0.32, pR * 0.10, 0, 0, 6.29); g.fill();
g.restore();
for (var rI = 0; rI < 8; rI++) {                        // rivets round the plate
  var ra = rI / 8 * 6.2832 + 0.4;
  g.fillStyle = 'rgba(40,46,58,.55)';
  g.beginPath();
  g.ellipse(cx + Math.cos(ra) * pR * 0.85, cY + Math.sin(ra) * pR * 0.85 * 0.34,
            1.1, 0.7, 0, 0, 6.29);
  g.fill();
}

// The lens: flat, fat and dead centre - a disc lying IN the plate, not a
// glossy dome sitting on it. Only saturated cluster on the sprite, which
// is what tells a blue pillbox from a red one at a glance.
var lR = pR * 0.82;
g.fillStyle = shade(col, 0.42);                          // a house-tinted recess shadow, not
g.beginPath(); g.ellipse(cx, cY + 0.6, lR + 1.5, (lR + 1.5) * 0.36, 0, 0, 6.29); g.fill();  // navy-grey, so its AA seam with the lens can only ever blend within the house hue
g.fillStyle = col;
g.beginPath(); g.ellipse(cx, cY - 0.3, lR, lR * 0.36, 0, 0, 6.29); g.fill();
outline(g, shade(col, 0.44));
g.fillStyle = mixc(col, hi, 0.55);
g.beginPath(); g.ellipse(cx - lR * 0.14, cY - 1.2, lR * 0.66, lR * 0.24, 0, 0, 6.29); g.fill();
g.fillStyle = shade(col, 0.62);
g.beginPath(); g.ellipse(cx + lR * 0.20, cY + 1.1, lR * 0.62, lR * 0.20, 0, 0, 6.29); g.fill();
g.fillStyle = 'rgba(255,255,255,' + (0.20 + (ph6 === 1 || ph6 === 4 ? 0.34 : 0)) + ')';
g.beginPath(); g.ellipse(cx - lR * 0.44, cY - 1.7, lR * 0.22, lR * 0.09, 0, 0, 6.29); g.fill();

// The gun slit: a dark notch cut low in the navy collar on the near
// right, flaring amber on two of the six phases. The Pillbox's shots
// leave the footprint centre, so the slit stays on the near face.
var slDX = 0.707, slDY = 0.354;                         // head-on, the pose it is drawn in
if (bdir != null) { var slAim = gunAim(bdir, 0); slDX = slAim.sx; slDY = slAim.sy; }
var slX = cx + slDX * fw * 0.56, slY = baseY - 5.0 + slDY * 5.0;  // clear of the lens's own AA edge below it
g.fillStyle = '#0e0e10';
g.beginPath(); g.ellipse(slX, slY, 5.0, 2.0, 0.22, 0, 6.29); g.fill();
g.fillStyle = 'rgba(206,214,228,.30)';
g.beginPath(); g.ellipse(slX, slY - 1.5, 5.0, 0.8, 0.22, 0, 6.29); g.fill();
if (ph6 === 2 || ph6 === 5) {                            // never phase 0: the
  g.fillStyle = 'rgba(255,196,96,.55)';                  // static bake used by
  g.beginPath(); g.ellipse(slX + 1.2, slY, 4.4, 2.4, 0.22, 0, 6.29); g.fill();
  g.fillStyle = 'rgba(255,242,206,.85)';                 // both the game's SPR.bld[0]
  g.beginPath(); g.ellipse(slX + 1.6, slY, 2.0, 1.1, 0.22, 0, 6.29); g.fill();
}                                                         // atlas and art-metrics.js is always ph6===0, so a flare there would be a permanent (not intermittent) saturated pixel and break "the lens is the sprite's only saturated pixels"
}

// ─── vehicles/ifv ─── Iron Frontier unit art. Included into rts.html by tools/rts-build.py;
// every free identifier is a local of bakeVehicle() in rts.src.html — see art/units/README.md.

// Modelled against the user's IFV_Voxel_Render.jpg (the four-model
// reference in docs/ra2-ref/sprites/allied-ifv-voxel.png). Coordinates
// are shared by hull and turret: +u forward, +v left, +z up. Surfaces
// are culled and sorted in 3D so wheels, fenders, launch cells and the
// repair arm occlude correctly at all 32 bearings.
VLIFT = 1;
var faces = [], KF = ISO_X * Math.SQRT2;
var Lu = px, Lv = -fx, Lz = fy * px - py * fx;
if (Lz < 0) { Lu = -Lu; Lv = -Lv; Lz = -Lz; }
var light = [-0.55 * cd - 0.8 * sd, 0.55 * sd - 0.8 * cd, 1.6];
var P3 = function (p) { return [cx + fx * p[0] + px * p[1], by + fy * p[0] + py * p[1] - p[2]]; };
// The source uses a saturated navy remap ramp. Preserve the owner's
// hue while taking its pale UI colour down to that ramp.
var rgb = parseInt(col.slice(1), 16), cr = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255];
var cmin = Math.min.apply(null, cr), cspan = Math.max.apply(null, cr) - cmin || 1;
var NAVY = 'rgb(' + cr.map(function (v) { return Math.round(8 + 94 * Math.pow((v - cmin) / cspan, 4)); }).join(',') + ')';
var BODY = '#b6b5cd', STEEL_IV = '#9191ac', RUBBER = '#303132';
function surface(pts, color, center, unlit) {
  var p = pts[0], e = pts[1].map(function (v, i) { return v - p[i]; });
  var f = pts[2].map(function (v, i) { return v - p[i]; });
  var n = [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]];
  if (center && n[0] * (center[0] - p[0]) + n[1] * (center[1] - p[1]) + n[2] * (center[2] - p[2]) > 0)
    n = n.map(function (v) { return -v; });
  if (n[0] * Lu + n[1] * Lv + n[2] * Lz <= 0) return;
  var length = Math.hypot(n[0], n[1], n[2]) || 1;
  var illumination = 0.62 + 0.38 * Math.max(0, (n[0] * light[0] + n[1] * light[1] + n[2] * light[2]) / (length * 1.87));
  var depth = 0;
  for (var q = 0; q < pts.length; q++) depth += pts[q][0] * Lu + pts[q][1] * Lv + pts[q][2] * Lz;
  faces.push({ p: pts, col: unlit ? color : shade(color, illumination), depth: depth / pts.length });
}
function solid(points, indices, color) {
  var center = [0, 0, 0];
  points.forEach(function (p) { for (var q = 0; q < 3; q++) center[q] += p[q] / points.length; });
  indices.forEach(function (ids) { surface(ids.map(function (i) { return points[i]; }), color, center); });
}
var boxFaces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
function box(u0, u1, v0, v1, z0, z1, color) {
  solid([[u0, v0, z0], [u1, v0, z0], [u1, v1, z0], [u0, v1, z0],
         [u0, v0, z1], [u1, v0, z1], [u1, v1, z1], [u0, v1, z1]], boxFaces, color);
}
// Extrude a side profile; the hull's bonnet and wheel-arch skirts are
// continuous surfaces rather than the old box plus protruding wedge.
function profile(outline, v0, v1, color) {
  var pts = [], ids = [], count = outline.length;
  [v0, v1].forEach(function (v) { outline.forEach(function (p) { pts.push([p[0], v, p[1]]); }); });
  ids.push(outline.map(function (_, i) { return i; }));
  ids.push(outline.map(function (_, i) { return i + count; }));
  for (var q = 0; q < count; q++) ids.push([q, (q + 1) % count, (q + 1) % count + count, q + count]);
  solid(pts, ids, color);
}
// Faceted rings and domes, including real side walls and cream hubs.
function lathe(u, v, z, rings, color, segments, panel) {
  var loops = [], n = segments || 16;
  rings.forEach(function (r) {
    var loop = [];
    for (var q = 0; q < n; q++) { var t = q * Math.PI * 2 / n; loop.push([u + r[0] * Math.cos(t), v + r[0] * Math.sin(t), z + r[1]]); }
    loops.push(loop);
  });
  for (var row = 0; row < loops.length - 1; row++) for (var q = 0; q < n; q++) {
    var q1 = (q + 1) % n, c = panel ? panel(row, q, n) : color;
    surface([loops[row][q], loops[row][q1], loops[row + 1][q1], loops[row + 1][q]], c, [u, v, z]);
  }
  surface(loops[loops.length - 1], color, [u, v, z]);
}
function tyre(u, v) {
  var loops = [], radius = 3.55, z = 3.05, n = 16;
  [[-0.85, 0.91], [-0.58, 1], [0.58, 1], [0.85, 0.91]].forEach(function (r) {
    var loop = [];
    for (var q = 0; q < n; q++) { var t = q * Math.PI * 2 / n; loop.push([u + radius / KF * r[1] * Math.cos(t), v + r[0], z + radius * r[1] * Math.sin(t)]); }
    loops.push(loop);
  });
  for (var row = 0; row < 3; row++) for (var q = 0; q < n; q++)
    surface([loops[row][q], loops[row][(q + 1) % n], loops[row + 1][(q + 1) % n], loops[row + 1][q]], RUBBER, [u, v, z]);
  for (var side = -1; side <= 1; side += 2) {
    surface(loops[side < 0 ? 0 : 3], RUBBER, [u, v, z]);
    var hub = [];
    for (var q = 0; q < n; q++) { var t = q * Math.PI * 2 / n; hub.push([u + radius / KF * 0.58 * Math.cos(t), v + side * 0.88, z + radius * 0.58 * Math.sin(t)]); }
    surface(hub, '#cecec5', [u, v, z]);
    hub = hub.map(function (p) { return [u + (p[0] - u) * 0.70, p[1] + side * 0.03, z + (p[2] - z) * 0.70]; });
    surface(hub, '#e4e2d5', [u, v, z]);
  }
}
// Oriented prism: its local x is along the boom / launch tube, y is
// across the vehicle, z is perpendicular to the inclined tube.
function inclined(u, v, z, angle, length, width, height, color, decor) {
  var ca = Math.cos(angle), sa = Math.sin(angle);
  function pt(x, y, h) { return [u + (x * ca - h * sa) / KF, v + y, z + x * sa + h * ca]; }
  solid([pt(0, -width / 2, -height / 2), pt(length, -width / 2, -height / 2), pt(length, width / 2, -height / 2), pt(0, width / 2, -height / 2),
         pt(0, -width / 2, height / 2), pt(length, -width / 2, height / 2), pt(length, width / 2, height / 2), pt(0, width / 2, height / 2)], boxFaces, color);
  if (decor) decor(pt);
  return pt;
}
if (wantH) {
  [-9.0, -2.0, 6.7].forEach(function (u) { tyre(u, -5.7); tyre(u, 5.7); });
  box(-11.8, 11.5, -4.2, 4.2, 3.0, 4.7, '#707080');
  profile([[-12, 4.4], [12, 4.4], [12, 5.7], [9.5, 7.0], [2.5, 7.0], [1.3, 8.2], [-11.2, 8.2], [-12, 7.3]], -4.75, 4.75, BODY);
  // Fender strips dip between the three arches, exposing the tyres.
  var skirt = [[-12.1, 4.3], [-11.8, 6.5], [-10.9, 7.1], [1.8, 7.1], [3.1, 6.4], [10.2, 6.4], [12.1, 5.6], [12.1, 3.8], [9.1, 3.8]];
  [6.7, -2.0, -9.0].forEach(function (u) {
    skirt.push([u + 2.45, 3.8], [u + 1.8, 5.25], [u + 0.9, 5.85], [u - 0.9, 5.85], [u - 1.8, 5.25], [u - 2.45, 3.8]);
  });
  profile(skirt, -6.05, -5.15, STEEL_IV); profile(skirt, 5.15, 6.05, STEEL_IV);
  for (sg = -1; sg <= 1; sg += 2) {
    box(-10.4, 0.8, sg < 0 ? -5.25 : 5.18, sg < 0 ? -5.18 : 5.25, 6.55, 7.75, NAVY);
    // Front corner blocks, square lamps, and the small black tow eyes.
    box(10.0, 12.45, sg * 4.55 - 1.15, sg * 4.55 + 1.15, 3.8, 5.5, STEEL_IV);
    box(12.46, 12.62, sg * 3.8 - 0.55, sg * 3.8 + 0.55, 4.4, 5.45, '#414149');
    box(12.63, 12.7, sg * 3.8 - 0.36, sg * 3.8 + 0.36, 4.65, 5.22, '#dfdcca');
    box(12.1, 12.55, sg * 2.7 - 0.42, sg * 2.7 + 0.42, 3.15, 3.95, '#303037');
    box(12.56, 12.6, sg * 2.7 - 0.23, sg * 2.7 + 0.23, 3.34, 3.76, '#b5b5c1');
  }
  // The long transverse black slot is at the back of the low bonnet.
  box(5.0, 6.15, -4.1, 4.1, 7.04, 7.9, '#333536');
  box(4.55, 4.98, -4.1, 4.1, 7.03, 7.5, '#cdcad4');
  box(-10.4, -7.6, 3.6, 4.65, 8.22, 8.42, '#4a4b50');
}
if (wantT) {
  var ivT = tv || 0, Z = 8.2;
  lathe(0, 0, Z, [[4.15, 0], [4.15, 0.8], [3.6, 1.45]], STEEL_IV, 16);
  if (ivT === IFV_TUR_ROCKET) {
    box(-2.4, 0.4, -1.8, 1.8, Z + 1.2, Z + 3.0, '#59596a');
    var angle = 0.63, L = 9.8, PW = 10.7, PH = 6.6;
    inclined(-3.65, 0, Z + 3.1, angle, L, PW, PH, STEEL_IV, function (pt) {
      // Broad waist band on both cheeks and the crown, following the
      // launch axis. Its dark blue also appears around the rear edge.
      for (var side = -1; side <= 1; side += 2) {
        var v = side * (PW / 2 + 0.025);
        surface([pt(4.2, v, -PH / 2), pt(5.8, v, -PH / 2), pt(5.8, v, PH / 2), pt(4.2, v, PH / 2)], NAVY, pt(L / 2, 0, 0));
      }
      surface([pt(4.2, -PW / 2, PH / 2 + 0.025), pt(5.8, -PW / 2, PH / 2 + 0.025), pt(5.8, PW / 2, PH / 2 + 0.025), pt(4.2, PW / 2, PH / 2 + 0.025)], NAVY, pt(L / 2, 0, 0));
      // Six individual raised launch-cell collars, two columns by
      // three rows. Real extrusions keep the stepped edge in profile.
      for (var row = 0; row < 3; row++) for (var column = 0; column < 2; column++) {
        var vv = (column - 0.5) * 5.15, zz = (row - 1) * 2.15, cell = [];
        [[L, 2.3, 0.94], [L + 1.0, 2.05, 0.76]].forEach(function (r) {
          cell.push(pt(r[0], vv - r[1], zz - r[2]), pt(r[0], vv + r[1], zz - r[2]), pt(r[0], vv + r[1], zz + r[2]), pt(r[0], vv - r[1], zz + r[2]));
        });
        solid(cell, boxFaces, '#9e9db7');
        surface([pt(L + 1.02, vv - 1.32, zz - 0.48), pt(L + 1.02, vv + 1.32, zz - 0.48), pt(L + 1.02, vv + 1.32, zz + 0.48), pt(L + 1.02, vv - 1.32, zz + 0.48)], '#686980', pt(L / 2, 0, 0));
      }
    });
  } else if (ivT === IFV_TUR_GUN || ivT === IFV_TUR_TECH) {
    var tech = ivT === IFV_TUR_TECH;
    lathe(0, 0, Z + 1.4, [[5.55, 0], [5.55, 0.9], [5.3, 1.25]], NAVY, 16);
    lathe(0, 0, Z + 2.5, tech ? [[5.3, 0], [5.1, 1.25], [3.95, 2.8], [2.65, 3.8]]
        : [[5.3, 0], [5.0, 1.65], [3.8, 3.2], [2.2, 4.0]], STEEL_IV, 16,
      function (row, q, n) {
        if (tech) return q <= 1 || q >= n - 2 || (q >= 6 && q <= 9) ? '#d4d0c0' : (q % 4 === 1 ? '#a7a6bd' : STEEL_IV);
        return row === 1 && (q === 0 || q === 5 || q === 7) ? '#c7c5d5' : STEEL_IV;
      });
    if (tech) {
      box(-1.0, 1.0, -1.4, 1.4, Z + 6.22, Z + 6.38, '#ccc8b9');
    } else {
      // Short black gun mounted off the left cheek at collar height.
      box(3.6, 6.7, 1.3, 3.8, Z + 1.9, Z + 3.8, '#35353d');
      box(6.6, 8.15, 1.45, 3.65, Z + 1.8, Z + 3.65, '#202124');
      box(8.16, 8.24, 1.7, 3.4, Z + 2.03, Z + 3.38, '#101214');
    }
  } else if (ivT === IFV_TUR_ARM) {
    box(-1.35, 1.35, -1.5, 1.5, Z + 1.25, Z + 2.4, '#34343c');
    var shoulder = inclined(0.8, 0, Z + 2.6, 2.45, 10.8, 2.65, 2.4, NAVY, function (pt) {
      for (var side = -1; side <= 1; side += 2) surface([pt(0.8, side * 1.34, -0.6), pt(10.0, side * 1.34, -0.6), pt(10.0, side * 1.34, 0.35), pt(0.8, side * 1.34, 0.35)], '#9190ab', pt(5.4, 0, 0));
    });
    var elbow = shoulder(10.8, 0, 0);
    box(elbow[0] - 1.15, elbow[0] + 1.15, -1.7, 1.7, elbow[2] - 1.2, elbow[2] + 1.2, NAVY);
    var forearm = inclined(elbow[0], 0, elbow[2] + 0.45, 0.18, 12.8, 2.75, 2.25, NAVY);
    var wrist = forearm(12.8, 0, 0);
    box(wrist[0] - 0.3, wrist[0] + 0.75, -1.15, 1.15, wrist[2] - 1.0, wrist[2] + 1.0, '#77778e');
    // Two angular jaws, with thickness and small inward-facing tips.
    for (var jaw = -1; jaw <= 1; jaw += 2) {
      var joints = [[wrist[0] + 0.2, wrist[2]], [wrist[0] + 0.7, wrist[2] + jaw * 2.9],
        [wrist[0] + 2.65, wrist[2] + jaw * 4.5], [wrist[0] + 4.5, wrist[2] + jaw * 4.0], [wrist[0] + 5.2, wrist[2] + jaw * 2.5]];
      for (var q = 0; q < joints.length - 1; q++) {
        var p0 = joints[q], p1 = joints[q + 1], du = (p1[0] - p0[0]) * KF, dz = p1[1] - p0[1];
        inclined(p0[0], 0, p0[1], Math.atan2(dz, du), Math.hypot(du, dz), 1.9, 1.25, '#bdbbd0');
      }
    }
  }
}
// Rasterize with depth per pixel. Sorting whole faces by their centre
// buries small details (lamps, remap strips, cell mouths) underneath a
// large bonnet or pod face, even though they are physically in front.
// Two samples per axis keep shared polygon edges watertight at zoom 1.
var samples = 2, raster = mkCanvas(s.w * samples, s.h * samples);
var rw = raster.c.width, rh = raster.c.height;
var pixels = raster.g.getImageData(0, 0, rw, rh), data = pixels.data;
var depths = new Float32Array(rw * rh);
depths.fill(-Infinity);
var rasterScale = DPR * samples, vehicleScale = USC_V * VSC;
function triangle(v0, v1, v2, color) {
  var area = (v1[0] - v0[0]) * (v2[1] - v0[1]) - (v1[1] - v0[1]) * (v2[0] - v0[0]);
  if (Math.abs(area) < 0.0001) return;
  var x0 = Math.max(0, Math.floor(Math.min(v0[0], v1[0], v2[0]))), x1 = Math.min(rw - 1, Math.ceil(Math.max(v0[0], v1[0], v2[0])));
  var y0 = Math.max(0, Math.floor(Math.min(v0[1], v1[1], v2[1]))), y1 = Math.min(rh - 1, Math.ceil(Math.max(v0[1], v1[1], v2[1])));
  for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
    var xx = x + 0.5, yy = y + 0.5;
    var b1 = ((xx - v0[0]) * (v2[1] - v0[1]) - (yy - v0[1]) * (v2[0] - v0[0])) / area;
    var b2 = ((v1[0] - v0[0]) * (yy - v0[1]) - (v1[1] - v0[1]) * (xx - v0[0])) / area;
    var b0 = 1 - b1 - b2;
    if (b0 < -0.00001 || b1 < -0.00001 || b2 < -0.00001) continue;
    var depth = b0 * v0[2] + b1 * v1[2] + b2 * v2[2], index = y * rw + x;
    if (depth < depths[index] - 0.00001) continue;
    depths[index] = depth;
    var at = index * 4; data[at] = color[0]; data[at + 1] = color[1]; data[at + 2] = color[2]; data[at + 3] = 255;
  }
}
if (data.length === rw * rh * 4) faces.forEach(function (face) {
  var pts = face.p.map(function (p) {
    var v = P3(p);
    return [(cx + (v[0] - cx) * vehicleScale) * rasterScale,
            (by + (v[1] - by) * vehicleScale) * rasterScale,
            p[0] * Lu + p[1] * Lv + p[2] * Lz];
  });
  var color;
  if (face.col.charAt(0) === '#') { var c = parseInt(face.col.slice(1), 16); color = [(c >> 16) & 255, (c >> 8) & 255, c & 255]; }
  else color = face.col.match(/[\d.]+/g).map(Number);
  // Ear clipping also handles the concave wheel-arch profile.
  var sign = 0;
  for (var q = 0; q < pts.length; q++) { var q1 = (q + 1) % pts.length; sign += pts[q][0] * pts[q1][1] - pts[q1][0] * pts[q][1]; }
  sign = sign < 0 ? -1 : 1;
  function cross(a, b, c) { return ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) * sign; }
  while (pts.length > 3) {
    var clipped = false;
    for (var q = 0; q < pts.length; q++) {
      var prev = (q + pts.length - 1) % pts.length, next = (q + 1) % pts.length;
      var a0 = pts[prev], b0 = pts[q], c0 = pts[next];
      if (cross(a0, b0, c0) < 0.00001) continue;
      var inside = false;
      for (var k = 0; k < pts.length; k++) {
        if (k === prev || k === q || k === next) continue;
        if (cross(a0, b0, pts[k]) > 0.00001 && cross(b0, c0, pts[k]) > 0.00001 && cross(c0, a0, pts[k]) > 0.00001) { inside = true; break; }
      }
      if (inside) continue;
      triangle(a0, b0, c0, color); pts.splice(q, 1); clipped = true; break;
    }
    if (!clipped) break;
  }
  if (pts.length === 3) triangle(pts[0], pts[1], pts[2], color);
});
raster.g.putImageData(pixels, 0, 0);
g.save(); g.setTransform(DPR, 0, 0, DPR, 0, 0);
g.drawImage(raster.c, 0, 0, s.w, s.h); g.restore();

// Iron Frontier — vehicles/mcv: the art for one unit.
// Called by bakeVehicle() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.





function drawMcv(C) {
  var VSC = C.VSC, by = C.by, cd = C.cd, col = C.col, cx = C.cx, d = C.d, fx = C.fx, fy = C.fy,
      g = C.g, px = C.px, py = C.py, s = C.s, sd = C.sd;

setVLIFT(1);
var faces = [], casters = [], KF = ISO_X * Math.SQRT2;
var Lu = px, Lv = -fx, Lz = fy * px - py * fx;
if (Lz < 0) { Lu = -Lu; Lv = -Lv; Lz = -Lz; }
function normalized(v) { var l = Math.hypot(v[0], v[1], v[2]); return v.map(function (x) { return x / l; }); }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
var light = normalized([-0.65 * cd + 0.9 * sd, 0.65 * sd + 0.9 * cd, 1.45]);
var eye = normalized([Lu, Lv, Lz]);
var halfLight = normalized(light.map(function (x, i) { return x + eye[i]; }));
var P3 = function (p) { return [cx + fx * p[0] + px * p[1], by + fy * p[0] + py * p[1] - p[2]]; };
var rgb = parseInt(col.slice(1), 16), cr = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255];
var cmin = Math.min.apply(null, cr), cspan = Math.max.apply(null, cr) - cmin || 1;
var NAVY = 'rgb(' + cr.map(function (v) { return Math.round(16 + 116 * Math.pow((v - cmin) / cspan, 3)); }).join(',') + ')';
// The hull is a desaturated tint of the owner colour — RA2's Allied MCV
// wears a periwinkle/slate body, not a fixed grey. The reference hull is
// a NEUTRAL periwinkle (R≈G<B, hue 240°), not a desaturated copy of the
// owner's exact hue: Blue's blue-cyan (203°) would read green-cast, so the
// hull takes the owner's hue at low saturation (13%) and mid lightness
// (53%), with Blue's hue nudged to pure blue (240°) to match the reference.
// Red reads dusty rose, green reads sage, and so on — the house hue stays,
// the saturation drops, so the saturated owner panel (NAVY) still leads the eye.
var hullHue = (function (r, g, b) {
  var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx === mn) return 0;
  var d = mx - mn, h;
  if (mx === r) h = ((g - b) / d + 6) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h >= 200 && h <= 215) h = 240;   // Blue's blue-cyan → neutral periwinkle
  return h;
})(cr[0], cr[1], cr[2]);
var BODY = (function (h, s, l) {
  s /= 100; l /= 100;
  var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  var r, g, b;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return 'rgb(' + Math.round((r + m) * 255) + ',' + Math.round((g + m) * 255) + ',' + Math.round((b + m) * 255) + ')';
})(hullHue, 13, 53);
var PAINT = '#86849c', RAIL = '#71788b', STEEL = '#aab3b9', LIGHT = '#dfe5df';
var DARK = '#333d49', RUBBER = '#232629', GLASS = '#111b22';
function surface(pts, color, center, unlit) {
  var p = pts[0], e = pts[1].map(function (v, i) { return v - p[i]; });
  var f = pts[2].map(function (v, i) { return v - p[i]; });
  var n = [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]];
  if (center && n[0] * (center[0] - p[0]) + n[1] * (center[1] - p[1]) + n[2] * (center[2] - p[2]) > 0)
    n = n.map(function (v) { return -v; });
  var length = Math.hypot(n[0], n[1], n[2]) || 1;
  n = n.map(function (x) { return x / length; });
  casters.push(pts);
  if (dot(n, eye) <= 0) return;
  var incidence = Math.max(0, dot(n, light));
  var finish = color === STEEL || color === LIGHT ? 2 : color === PAINT || color === RAIL || color === NAVY || color === BODY ? 1 : 0;
  // Specular reflection uses both the light AND the viewing direction.
  // The former diffuse-only multiplier made even bare steel matte.
  var reflection = Math.pow(Math.max(0, dot(n, halfLight)), finish === 2 ? 26 : 42);
  var gloss = unlit ? 0 : reflection * (finish === 2 ? 165 : finish === 1 ? 60 : 0);
  var illumination = unlit ? 1 : finish === 2 ? 0.62 + 0.68 * incidence : 0.43 + 0.65 * incidence;
  var axis = Math.abs(n[2]) >= Math.max(Math.abs(n[0]), Math.abs(n[1])) ? 2 : Math.abs(n[0]) > Math.abs(n[1]) ? 0 : 1;
  faces.push({ p: pts, col: unlit ? color : shade(color, illumination), finish: finish, axis: axis, gloss: gloss, lit: incidence });
}
function solid(points, indices, color) {
  var center = [0, 0, 0];
  points.forEach(function (p) { for (var q = 0; q < 3; q++) center[q] += p[q] / points.length; });
  indices.forEach(function (ids) { surface(ids.map(function (i) { return points[i]; }), color, center); });
}
var boxFaces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
function box(u0, u1, v0, v1, z0, z1, color) {
  if (v1 < v0) { var swap = v0; v0 = v1; v1 = swap; }
  solid([[u0, v0, z0], [u1, v0, z0], [u1, v1, z0], [u0, v1, z0],
         [u0, v0, z1], [u1, v0, z1], [u1, v1, z1], [u0, v1, z1]], boxFaces, color);
}
function bevel(u0, u1, v0, v1, z0, z1, b, color) {
  var plan = [[u0+b,v0],[u1-b,v0],[u1,v0+b],[u1,v1-b],
    [u1-b,v1],[u0+b,v1],[u0,v1-b],[u0,v0+b]];
  var pts = [], ids = [], cu = (u0+u1)/2, cv = (v0+v1)/2;
  [z0,z1-b,z1].forEach(function (z, row) {
    plan.forEach(function (p) {
      pts.push([row === 2 ? cu+(p[0]-cu)*(1-b/(u1-u0)) : p[0],
        row === 2 ? cv+(p[1]-cv)*(1-b/(v1-v0)) : p[1],z]);
    });
  });
  ids.push([0,1,2,3,4,5,6,7], [16,17,18,19,20,21,22,23]);
  for (var row=0;row<2;row++) for(var q=0;q<8;q++) ids.push([row*8+q,row*8+(q+1)%8,(row+1)*8+(q+1)%8,(row+1)*8+q]);
  solid(pts,ids,color);
}
function beam(a, b, width, height, color) {
  var along = normalized(b.map(function (x,i) {return x-a[i];}));
  var right = Math.abs(along[2]) > 0.98 ? [1,0,0] : normalized([-along[1],along[0],0]);
  var up = [along[1]*right[2]-along[2]*right[1],along[2]*right[0]-along[0]*right[2],along[0]*right[1]-along[1]*right[0]];
  var pts=[];
  [a,b].forEach(function (p) { [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(function (q) {
    pts.push(p.map(function (x,i) {return x+right[i]*q[0]*width/2+up[i]*q[1]*height/2;}));
  }); });
  solid(pts,boxFaces,color);
}
function profile(outline, v0, v1, color) {
  var pts = [], ids = [], count = outline.length;
  [v0, v1].forEach(function (v) { outline.forEach(function (p) { pts.push([p[0], v, p[1]]); }); });
  ids.push(outline.map(function (_, i) { return i; }));
  ids.push(outline.map(function (_, i) { return i + count; }));
  for (var q = 0; q < count; q++) ids.push([q, (q + 1) % count, (q + 1) % count + count, q + count]);
  solid(pts, ids, color);
}
// Longitudinal extrusion of a cross-section, used for folded panels
// and bevelled steel stock. These are actual slopes, not stacked boxes.
function section(outline, u0, u1, color) {
  var pts = [], ids = [], count = outline.length;
  [u0, u1].forEach(function (u) { outline.forEach(function (p) { pts.push([u, p[0], p[1]]); }); });
  ids.push(outline.map(function (_, i) { return i; }));
  ids.push(outline.map(function (_, i) { return i + count; }));
  for (var q = 0; q < count; q++) ids.push([q, (q + 1) % count, (q + 1) % count + count, q + count]);
  solid(pts, ids, color);
}
function tyre(u, v) {
  var loops = [], radius = 4.25, z = 3.8, n = 20;
  [[-1.42, 0.87], [-1.08, 1], [1.08, 1], [1.42, 0.87]].forEach(function (r) {
    var loop = [];
    for (var q = 0; q < n; q++) { var t = q * Math.PI * 2 / n; loop.push([u + radius / KF * r[1] * Math.cos(t), v + r[0], z + radius * r[1] * Math.sin(t)]); }
    loops.push(loop);
  });
  for (var row = 0; row < 3; row++) for (var q = 0; q < n; q++)
    surface([loops[row][q], loops[row][(q + 1) % n], loops[row + 1][(q + 1) % n], loops[row + 1][q]], row === 1 && q % 2 ? '#353637' : RUBBER, [u, v, z]);
  for (var side = -1; side <= 1; side += 2) {
    surface(loops[side < 0 ? 0 : 3], RUBBER, [u, v, z]);
    var hub = [];
    for (var q = 0; q < n; q++) { var t = q * Math.PI * 2 / n; hub.push([u + radius / KF * 0.64 * Math.cos(t), v + side * 1.44, z + radius * 0.64 * Math.sin(t)]); }
    surface(hub, LIGHT, [u, v, z]);
    var inset = hub.map(function (p) { return [u + (p[0] - u) * 0.79, p[1] + side * 0.03, z + (p[2] - z) * 0.79]; });
    surface(inset, '#576073', [u, v, z]);
    var boss = inset.map(function (p) { return [u + (p[0] - u) * 0.53, p[1] + side * 0.04, z + (p[2] - z) * 0.53]; });
    surface(boss, STEEL, [u, v, z]);
    for (var q = 0; q < 6; q++) {
      var t = q * Math.PI / 3, bu = u + Math.cos(t) * 1.37 / KF, bz = z + Math.sin(t) * 1.37;
      box(bu-0.16,bu+0.16,v+side*1.53-0.025,v+side*1.53+0.025,bz-0.18,bz+0.18,LIGHT);
    }
  }
}
function drum(u0, u1, v, z, radius, color) {
  var loops = [], n = 12;
  [u0, u1].forEach(function (u) {
    var loop = [];
    for (var q = 0; q < n; q++) {
      var t = q * Math.PI * 2 / n;
      loop.push([u, v + radius * Math.cos(t), z + radius * Math.sin(t)]);
    }
    loops.push(loop);
  });
  for (var q = 0; q < n; q++)
    surface([loops[0][q], loops[0][(q + 1) % n], loops[1][(q + 1) % n], loops[1][q]], color, [(u0+u1)/2, v, z]);
  surface(loops[0], '#596066', [(u0+u1)/2, v, z]);
  surface(loops[1], STEEL, [(u0+u1)/2, v, z]);
  box(u0 + 0.28, u0 + 0.42, v - radius * 0.82, v + radius * 0.82, z - 0.12, z + 0.12, '#343a3e');
}
// A vertical drum (axis along z) with vertical ribs — the folded
// actuator housing at the very rear of the MCV.
function vdrum(u, v, z0, z1, radius, color) {
  var n = 12, bot = [], top = [];
  for (var q = 0; q < n; q++) {
    var t = q * Math.PI * 2 / n;
    bot.push([u + radius * Math.cos(t), v + radius * Math.sin(t), z0]);
    top.push([u + radius * Math.cos(t), v + radius * Math.sin(t), z1]);
  }
  for (var q = 0; q < n; q++)
    surface([bot[q], bot[(q + 1) % n], top[(q + 1) % n], top[q]], color, [u, v, (z0 + z1) / 2]);
  surface(top, shade(color, 1.25), [u, v, z1]);
  surface(bot, shade(color, 0.6), [u, v, z0]);
  // Vertical ribs: thin raised bands around the drum's circumference.
  for (var r = 0; r < 6; r++) {
    var a = r * Math.PI / 3;
    var cu = u + radius * 1.06 * Math.cos(a), cv = v + radius * 1.06 * Math.sin(a);
    box(cu - 0.16, cu + 0.16, cv - 0.16, cv + 0.16, z0 + 0.15, z1 - 0.15, shade(color, 1.12));
  }
}
function hinge(u,v,z,radius) {
  var center=[u,v,z],loops=[];
  [-0.36,0.36].forEach(function(offset){
    var loop=[];for(var q=0;q<12;q++){var t=q*Math.PI/6;loop.push([u+Math.cos(t)*radius/KF,v+offset,z+Math.sin(t)*radius]);}
    loops.push(loop);
  });
  for(var q=0;q<12;q++)surface([loops[0][q],loops[0][(q+1)%12],loops[1][(q+1)%12],loops[1][q]],STEEL,center);
  for(var side=-1;side<=1;side+=2){
    var end=loops[side<0?0:1];surface(end,LIGHT,center);
    surface(end.map(function(p){return [u+(p[0]-u)*0.64,p[1]+side*0.035,z+(p[2]-z)*0.64];}),DARK,center);
    box(u-0.3,u+0.3,v+side*0.43-0.03,v+side*0.43+0.03,z-0.32,z+0.32,STEEL);
  }
}
// A low, wide works chassis: large exposed tyres support a deep
// boxed frame. All folding equipment attaches to these load paths.
[11.2,-5.1,-13.1].forEach(function (u) { tyre(u,-6.95); tyre(u,6.95); });
bevel(-18.3,18.3,-5.85,5.85,3.0,7.2,0.75,DARK);
box(-18.1,10.2,-6.65,6.65,6.8,11.4,BODY);
[11.2,-5.1,-13.1].forEach(function (u) {
  bevel(u-1.3,u+1.3,-7.1,7.1,3.2,5.2,0.3,STEEL);
});
for (var side=-1;side<=1;side+=2) {
  var v=side*7.0;
  var rail=[[-18.5,9.9],[9.2,9.9],[9.2,7.8],[7.7,5.5],[-1.3,5.5],
    [-2.3,7.25],[-3.6,8.0],[-6.7,8.0],[-8.0,7.25],[-8.7,5.5],[-9.4,5.5],
    [-10.4,7.3],[-11.7,8.0],[-14.6,8.0],[-15.9,7.2],[-16.7,5.5],[-18.4,6.1]];
  profile(rail,v-0.60,v+0.60,RAIL);
  box(-18.0,9.0,v-0.64,v+0.64,9.6,10.05,STEEL);
  box(-17.7,8.75,v+side*0.65-0.025,v+side*0.65+0.025,8.7,9.25,DARK);
  [-16.8,-8.8,-1.6,7.9].forEach(function (u) {
    box(u,u+0.55,v-0.70,v+0.70,8.3,10.13,STEEL);
    box(u+0.14,u+0.37,v+side*0.72-0.03,v+side*0.72+0.03,9.45,9.72,LIGHT);
  });
  // Plate stacks are the folded foundation wings. Each has actual
  // thickness, a dark separation and a narrow machined outer lip.
  for (var layer=0;layer<3;layer++) {
    var z=10.1+layer*0.77;
    bevel(-16.9,8.8,v-0.95,v+0.35,z,z+0.57,0.2,layer===2?BODY:RAIL);
    box(-15.7,7.9,v+side*0.39-0.05,v+side*0.39+0.05,z+0.4,z+0.56,STEEL);
  }
  // Suspended steel reservoir between the first and second axles.
  bevel(-0.9,5.6,v-0.73,v+0.73,1.55,5.45,0.5,STEEL);
  box(-0.5,5.2,v+side*0.77-0.04,v+side*0.77+0.04,2.35,2.65,LIGHT);
  [0.0,4.35].forEach(function (u) {box(u,u+0.48,v-0.78,v+0.78,1.8,5.5,DARK);});
  // Retracted outrigger jacks and feet. Their hinge pins connect the
  // foundation wings to the chassis, clearly showing how it unfolds.
  [-17.0,6.25].forEach(function (u) {
    bevel(u-1.1,u+1.1,v-0.70,v+0.70,4.3,8.4,0.38,RAIL);
    box(u-0.3,u+0.3,v+side*0.8-0.12,v+side*0.8+0.12,4.6,7.65,STEEL);
    bevel(u-1.5,u+1.5,v-1.1,v+1.1,3.65,4.55,0.25,STEEL);
    box(u-0.58,u+0.58,v+side*0.76-0.06,v+side*0.76+0.06,7.8,8.55,DARK);
    box(u-0.3,u+0.3,v+side*0.86-0.09,v+side*0.86+0.09,7.95,8.4,LIGHT);
  });
}

// Compact armoured cab, with bevelled roof shoulders. The rounded
// nose bulges forward and slopes down — a truck cab, not a box.
profile([[10.8,6.0],[14.2,6.0],[15.1,3.9],[18.9,3.9],[19.5,5.9],[18.9,8.5],
  [17.35,9.25],[17.35,11.0],[15.6,12.9],[14.0,13.1],[10.8,13.1]],-6.45,6.45,BODY);
bevel(10.65,14.5,-6.55,6.55,12.1,13.7,0.5,BODY);
surface([[17.39,-5.6,9.35],[17.39,5.6,9.35],[17.39,5.6,10.83],[17.39,-5.6,10.83]],GLASS,[14,0,7],true);
box(17.41,17.5,-0.13,0.13,9.3,10.85,STEEL);
box(17.43,17.5,-5.5,5.5,9.3,9.52,'#5e7884');
bevel(17.9,19.45,-6.8,6.8,2.5,4.5,0.45,STEEL);
bevel(18.91,19.18,-4.8,4.8,4.75,7.5,0.1,STEEL);
box(19.19,19.24,-3.65,3.65,5.0,7.1,GLASS);
for (var z=5.15;z<7.1;z+=0.5) box(19.25,19.29,-3.6,3.6,z,z+0.14,STEEL);
for (var side=-1;side<=1;side+=2) {
  var v=side*6.49;
  surface([[11.55,v,9.2],[16.6,v,9.05],[16.6,v,10.8],[13.8,v,12.6],[11.55,v,12.6]],GLASS,[14,0,7],true);
  box(11.05,11.6,v-0.08,v+0.08,7.15,12.9,STEEL);
  box(11.8,12.05,v-0.08,v+0.08,6.7,9.15,DARK);
  box(12.5,13.45,v-0.14,v+0.14,8.1,8.42,LIGHT);
  box(14.45,16.95,v-0.09,v+0.09,5.3,5.85,STEEL);
  box(19.2,19.32,side*5.05-0.60,side*5.05+0.60,6.25,7.25,GLASS);
  box(19.33,19.37,side*5.05-0.38,side*5.05+0.38,6.5,7.0,LIGHT);
  box(18.75,19.55,side*3.9-0.26,side*3.9+0.26,2.2,3.05,DARK);
}

// The folded construction yard, front to rear: a broad navy folded
// channel (the dominant mass), a slate tarp band, a light container
// box, and a ribbed drum at the very rear — the full deployable plant.
bevel(-10.6,8.6,-6.1,6.1,10.2,11.6,0.5,STEEL);
// The navy folded channel: two broad channels with a dark seam, the
// saturated owner mass that leads the eye.
for (var side=-1;side<=1;side+=2) {
  box(1.2,8.0,side*2.9-2.3,side*2.9+2.3,11.4,16.6,NAVY);
  box(1.4,7.8,side*2.9-2.1,side*2.9+2.1,16.6,16.85,shade(NAVY,1.45));
}
box(1.6,7.6,-0.6,0.6,11.6,16.4,'#152439');
// A slate tarp band folds across the middle of the load — a desaturated
// blue-grey that sits between the saturated navy channel and the light box.
// Neutral periwinkle (R=G) to match the reference hull; a green-cast
// (G>R) here read as a separate paint and broke the periwinkle read.
box(-4.2,1.2,-5.4,5.4,11.4,15.2,'#69697d');
box(-4.0,1.0,-5.2,5.2,15.2,15.45,shade('#69697d',1.35));
// A light container box sits toward the rear of the channel.
box(-8.6,-4.4,-4.6,4.6,11.4,16.2,LIGHT);
box(-8.4,-4.6,-4.4,4.4,16.2,16.45,shade(LIGHT,1.1));
// A ribbed drum at the very rear — the folded crane/actuator housing,
// standing upright like a barrel.
vdrum(-9.6, 0, 11.4, 16.4, 2.3, STEEL);

// Rear crosshead: two broad steel cheeks and a transverse beam at the
// very rear. Kept simple — the folded yard, not the machinery, is the read.
bevel(-15.0,-10.0,-4.9,4.9,10.4,15.1,0.55,DARK);
for (var side=-1;side<=1;side+=2) {
  var v=side*4.55;
  profile([[-15.4,10.2],[-10.4,10.2],[-10.4,14.55],[-12.0,16.8],[-14.65,16.8],[-15.4,15.9]],v-1.25,v+1.25,STEEL);
  box(-15.0,-12.8,v-1.28,v+1.28,10.85,11.25,LIGHT);
}
bevel(-14.75,-12.05,-5.8,5.8,15.6,16.9,0.38,STEEL);
box(-14.35,-12.8,-4.85,4.85,16.91,17.03,'#414a52');
// A retracted actuator collar at the very rear — one clean band, not
// a cluster of exposed drums.
bevel(-18.8,-17.45,-7.1,7.1,6.4,9.9,0.5,RAIL);
box(-18.9,-18.82,-6.7,6.7,9.25,9.55,STEEL);
bevel(-19.0,-18.35,-2.8,2.8,4.35,5.95,0.3,DARK);

var samples=2,raster=mkCanvas(s.w*samples,s.h*samples);
var rw=raster.c.width,rh=raster.c.height,pixels=raster.g.getImageData(0,0,rw,rh),data=pixels.data;
var hasPixels=data.length===rw*rh*4;
// Shadow and colour share the same geometry. This matters where
// folded panels overhang the lower wing, or a ram enters its collar.
var shadowW=192, shadowScale=3.8, shadowDepth=new Float32Array(shadowW*shadowW);
shadowDepth.fill(-Infinity);
var lightRight=normalized([light[1],-light[0],0]);
var lightUp=[light[1]*lightRight[2]-light[2]*lightRight[1],light[2]*lightRight[0]-light[0]*lightRight[2],light[0]*lightRight[1]-light[1]*lightRight[0]];
function lightPoint(p) {return [96+dot(p,lightRight)*shadowScale,96+dot(p,lightUp)*shadowScale,dot(p,light)];}
function triangulate(pts,draw) {
  pts=pts.slice(); var sign=0;
  for(var i=0;i<pts.length;i++) {var j=(i+1)%pts.length;sign+=pts[i][0]*pts[j][1]-pts[j][0]*pts[i][1];}
  sign=sign<0?-1:1;
  function cross(a,b,c) {return ((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))*sign;}
  while(pts.length>3) {
    var clipped=false;
    for(var i=0;i<pts.length;i++) {
      var prev=(i+pts.length-1)%pts.length,next=(i+1)%pts.length;
      var a=pts[prev],b=pts[i],c=pts[next];
      if(cross(a,b,c)<0.00001)continue;
      var inside=false;
      for(var q=0;q<pts.length;q++) {
        if(q===prev||q===i||q===next)continue;
        if(cross(a,b,pts[q])>0.00001&&cross(b,c,pts[q])>0.00001&&cross(c,a,pts[q])>0.00001){inside=true;break;}
      }
      if(inside)continue;
      draw(a,b,c);pts.splice(i,1);clipped=true;break;
    }
    if(!clipped)break;
  }
  if(pts.length===3)draw(pts[0],pts[1],pts[2]);
}
function rasterTriangle(a,b,c,w,h,pixel) {
  var area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  if(Math.abs(area)<0.00001)return;
  var x0=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),x1=Math.min(w-1,Math.ceil(Math.max(a[0],b[0],c[0])));
  var y0=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),y1=Math.min(h-1,Math.ceil(Math.max(a[1],b[1],c[1])));
  for(var y=y0;y<=y1;y++)for(var x=x0;x<=x1;x++) {
    var xx=x+0.5-a[0],yy=y+0.5-a[1];
    var bb=(xx*(c[1]-a[1])-yy*(c[0]-a[0]))/area;
    var cc=((b[0]-a[0])*yy-(b[1]-a[1])*xx)/area,aa=1-bb-cc;
    if(aa>=-0.00001&&bb>=-0.00001&&cc>=-0.00001)pixel(y*w+x,aa,bb,cc);
  }
}
if(hasPixels) casters.forEach(function(face) {
  triangulate(face.map(lightPoint),function(a,b,c) {
    rasterTriangle(a,b,c,shadowW,shadowW,function(at,aa,bb,cc) {
      var z=aa*a[2]+bb*b[2]+cc*c[2];if(z>shadowDepth[at])shadowDepth[at]=z;
    });
  });
});

// Ground contact follows the rotating chassis and upper machinery,
// rather than the previous horizontal oval sticking out of end views.
var footprint=[];
casters.forEach(function(face){face.forEach(function(p){
  var u=p[0]-p[2]*light[0]/light[2]*0.28,v=p[1]-p[2]*light[1]/light[2]*0.28;
  footprint.push([cx+fx*u+px*v,by+fy*u+py*v+0.55]);
});});
footprint.sort(function(a,b){return a[0]-b[0]||a[1]-b[1];});
function turn(a,b,c){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
var lower=[],upper=[];
footprint.forEach(function(p){while(lower.length>1&&turn(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();lower.push(p);});
for(var q=footprint.length-1;q>=0;q--){var p=footprint[q];while(upper.length>1&&turn(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();upper.push(p);}
var outline=lower.slice(0,-1).concat(upper.slice(0,-1));
s.g.beginPath();outline.forEach(function(p,i){if(i)s.g.lineTo(p[0],p[1]);else s.g.moveTo(p[0],p[1]);});
s.g.closePath();s.g.fillStyle='rgba(13,19,21,0.30)';s.g.fill();

var depths=new Float32Array(rw*rh);depths.fill(-Infinity);
var rasterScale=DPR*samples,vehicleScale=USC_V*VSC;
// The non-browser test canvas has no real pixel backing store.
if(hasPixels) faces.forEach(function(face) {
  var pts=face.p.map(function(p) {
    var v=P3(p),lp=lightPoint(p);
    return [(cx+(v[0]-cx)*vehicleScale)*rasterScale,(by+(v[1]-by)*vehicleScale)*rasterScale,
      p[0]*Lu+p[1]*Lv+p[2]*Lz,(face.axis===0?p[1]:p[0])*KF,face.axis===2?p[1]*KF:p[2],lp[0],lp[1],lp[2]];
  });
  var color;
  if(face.col.charAt(0)==='#'){var c=parseInt(face.col.slice(1),16);color=[(c>>16)&255,(c>>8)&255,c&255];}
  else color=face.col.match(/[\d.]+/g).map(Number);
  triangulate(pts,function(a,b,c) {
    rasterTriangle(a,b,c,rw,rh,function(at,aa,bb,cc) {
      var depth=aa*a[2]+bb*b[2]+cc*c[2];if(depth<depths[at]-0.00001)return;
      depths[at]=depth;
      var tu=aa*a[3]+bb*b[3]+cc*c[3],tv=aa*a[4]+bb*b[4]+cc*c[4];
      var sx=aa*a[5]+bb*b[5]+cc*c[5],sy=aa*a[6]+bb*b[6]+cc*c[6],sz=aa*a[7]+bb*b[7]+cc*c[7];
      var occluded=0;
      for(var dy=-1;dy<=1;dy+=2)for(var dx=-1;dx<=1;dx+=2) {
        var ix=Math.floor(sx+dx*0.45),iy=Math.floor(sy+dy*0.45);
        if(ix>=0&&iy>=0&&ix<shadowW&&iy<shadowW&&shadowDepth[iy*shadowW+ix]>sz+0.42)occluded+=0.25;
      }
      var shadow=1-occluded*(0.34+face.lit*0.25);
      var grain=0,sheen=0;
      if(face.finish) {
        var gu=Math.floor(tu/1.55),gv=Math.floor(tv/0.7);
        var hash=Math.imul(gu+400,73856093)^Math.imul(gv+400,19349663);
        grain=((hash>>>3)%13-6)*(face.finish===1?0.75:0.45);
        // A narrow reflected band travels over the steel as the
        // vehicle turns. Diffuse paint keeps only a muted response.
        var band=Math.pow(0.5+0.5*Math.sin(tu*0.31+tv*0.72+d*FANG*0.28),14);
        sheen=band*(face.finish===2?29:5)+face.gloss*(0.62+band*0.38);
      }
      var offset=at*4;
      for(var channel=0;channel<3;channel++)data[offset+channel]=color[channel]*shadow+sheen*(1-occluded*0.88)+grain;
      data[offset+3]=255;
    });
  });
});
raster.g.putImageData(pixels,0,0);
g.save();g.setTransform(DPR,0,0,DPR,0,0);
g.drawImage(raster.c,0,0,s.w,s.h);g.restore();
}

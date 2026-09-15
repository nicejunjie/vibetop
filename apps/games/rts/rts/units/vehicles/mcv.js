// Iron Frontier — vehicles/mcv: the art for one unit.
// Called by bakeVehicle() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.





function drawMcv(C) {
  var VSC = C.VSC, by = C.by, cd = C.cd, col = C.col, cx = C.cx, d = C.d, fac = C.fac, fx = C.fx, fy = C.fy,
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
// RA2 separates the MCV into a muted faction-painted chassis and a darker,
// saturated folded construction bed. Leave enough value between the materials
// for the bed to remain recessed instead of reading as a cargo block.
var NAVY = 'rgb(' + cr.map(function (v) { return Math.round(18 + 112 * Math.pow((v - cmin) / cspan, 2.1)); }).join(',') + ')';
// Chassis material is faction paint, not player remap. The Allied violet
// slate is read directly from the MCV reference; Collective uses the same
// value ladder in Soviet olive. Only NAVY changes with the owning player.
var BODY = fac === 'col' ? '#777750' : '#75759a';
// Structural steel stays neutral. Highlights stop below white so the bumper,
// hubs and rear machinery retain internal planes after six-level quantisation.
var PAINT = '#898989', RAIL = BODY, MACHINE = '#747474', STEEL = '#989898', LIGHT = '#c7c7c7';
var DARK = '#3e3e3e', RUBBER = '#292929', GLASS = '#15152d';
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
  var sovietPale = color === '#e1e1e1' || color === '#d3d3d3' || color === '#d9d9d9';
  var illumination = unlit ? 1 : finish === 2 ? 0.62 + 0.68 * incidence
    : sovietPale ? 0.76 + 0.36 * incidence : 0.43 + 0.65 * incidence;
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
function tyre(u, v) {
  var loops = [], radius = 4.25, z = 3.8, n = 20;
  [[-1.42, 0.87], [-1.08, 1], [1.08, 1], [1.42, 0.87]].forEach(function (r) {
    var loop = [];
    for (var q = 0; q < n; q++) { var t = q * Math.PI * 2 / n; loop.push([u + radius / KF * r[1] * Math.cos(t), v + r[0], z + radius * r[1] * Math.sin(t)]); }
    loops.push(loop);
  });
  for (var row = 0; row < 3; row++) for (var q = 0; q < n; q++)
    surface([loops[row][q], loops[row][(q + 1) % n], loops[row + 1][(q + 1) % n], loops[row + 1][q]], row === 1 && q % 2 ? '#3c3c3c' : RUBBER, [u, v, z]);
  for (var side = -1; side <= 1; side += 2) {
    surface(loops[side < 0 ? 0 : 3], RUBBER, [u, v, z]);
    var hub = [];
    for (var q = 0; q < n; q++) { var t = q * Math.PI * 2 / n; hub.push([u + radius / KF * 0.64 * Math.cos(t), v + side * 1.44, z + radius * 0.64 * Math.sin(t)]); }
    surface(hub, '#e1e1e1', [u, v, z]);
    var inset = hub.map(function (p) { return [u + (p[0] - u) * 0.79, p[1] + side * 0.03, z + (p[2] - z) * 0.79]; });
    surface(inset, '#676767', [u, v, z]);
    var boss = inset.map(function (p) { return [u + (p[0] - u) * 0.53, p[1] + side * 0.04, z + (p[2] - z) * 0.53]; });
    surface(boss, STEEL, [u, v, z]);
    for (var q = 0; q < 6; q++) {
      var t = q * Math.PI / 3, bu = u + Math.cos(t) * 1.37 / KF, bz = z + Math.sin(t) * 1.37;
      box(bu-0.16,bu+0.16,v+side*1.53-0.025,v+side*1.53+0.025,bz-0.18,bz+0.18,LIGHT);
    }
  }
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
function trackedWheel(u, v, z, radius, side) {
  var outer=[],hub=[];
  for(var q=0;q<18;q++){
    var t=q*Math.PI*2/18,du=Math.cos(t)*radius/KF,dz=Math.sin(t)*radius;
    outer.push([u+du,v,z+dz]);
    hub.push([u+du*.61,v+side*.035,z+dz*.61]);
  }
  if(side<0){outer.reverse();hub.reverse();}
  surface(outer,'#252525',[u,v,z]);
  surface(hub,LIGHT,[u,v,z]);
  surface(hub.map(function(p){return [u+(p[0]-u)*.45,p[1]+side*.035,z+(p[2]-z)*.45];}),MACHINE,[u,v,z]);
}
function rearActuatorCap(v,z){
  function ring(radius,depth,color){
    var pts=[];
    for(var q=0;q<20;q++){
      var t=q*Math.PI*2/20;
      pts.push([-18.65-depth,v+Math.cos(t)*radius/KF,z+Math.sin(t)*radius]);
    }
    pts.reverse();
    surface(pts,color,[-18.6,v,z]);
  }
  ring(1.77,0,DARK);ring(1.35,.08,LIGHT);ring(.64,.13,MACHINE);
}
function trackPod(u0,u1,side) {
  var v=side*7.3;
  // Extruded oval track belt. The former bevelled boxes still ended in
  // straight vertical corners and read as two black bricks under the body.
  var radius=2.6,centreZ=3.4,outline=[[u0+radius,centreZ+radius],[u1-radius,centreZ+radius]];
  for(var q=1;q<=8;q++){
    var t=Math.PI/2-q*Math.PI/8;
    outline.push([u1-radius+radius*Math.cos(t),centreZ+radius*Math.sin(t)]);
  }
  outline.push([u0+radius,centreZ-radius]);
  for(var q=1;q<=8;q++){
    var t=-Math.PI/2-q*Math.PI/8;
    outline.push([u0+radius+radius*Math.cos(t),centreZ+radius*Math.sin(t)]);
  }
  var pts=[],ids=[],n=outline.length;
  [v-1.18,v+1.18].forEach(function(across){
    outline.forEach(function(p){pts.push([p[0],across,p[1]]);});
  });
  ids.push(outline.map(function(_,i){return i;}));
  ids.push(outline.map(function(_,i){return n+i;}));
  for(var q=0;q<n;q++)ids.push([q,(q+1)%n,n+(q+1)%n,n+q]);
  solid(pts,ids,RUBBER);
  box(u0+radius,u1-radius,v+side*1.18-.09,v+side*1.18+.09,1.55,5.1,DARK);
  for(var wheel=0;wheel<4;wheel++)
    trackedWheel(u0+1.3+(u1-u0-2.6)*wheel/3,v+side*1.38,3.05,1.82,side);
  box(u0+radius,u1-radius,v-1.20,v+1.20,5.7,6.15,'#454545');
}
if(fac==='col'){
  // The Soviet RA2 MCV is a tracked construction carrier, not a recoloured
  // version of the Allied three-axle truck. Front/rear track bogies leave a
  // visible chassis gap and carry a broad silver foundation frame.
  for(var side=-1;side<=1;side+=2){trackPod(-17.6,-2.5,side);trackPod(2.5,17.2,side);}
  bevel(-18.1,18.2,-6.4,6.4,4.45,7.25,.6,DARK);
  box(-17.5,17.0,-6.65,6.65,6.7,9.4,STEEL);
  // Long side wing panels with external hinge straps. Their mass sits over
  // the track pods instead of leaving a thin open car-like truck bed.
  for(var side=-1;side<=1;side+=2){
    var v=side*6.65;
    // Three packed foundation leaves pivot around the standing red hinge
    // straps. Keep the dark breaks structural, not painted fake windows.
    profile([[-17.2,7.2],[-4.0,7.2],[-4.0,11.5],[-8.7,12.2],
      [-17.2,10.25]],v-.70,v+.70,'#e1e1e1');
    profile([[-3.45,7.2],[9.75,7.2],[9.75,12.0],[-3.45,12.0]],
      v-.70,v+.70,'#d9d9d9');
    profile([[10.3,7.2],[16.1,7.2],[16.1,11.15],[10.3,12.0]],
      v-.70,v+.70,'#e1e1e1');
    [-3.72,10.02].forEach(function(u){
      box(u-.18,u+.18,v-.75,v+.75,7.3,10.8,DARK);
      box(u-.43,u+.43,v+side*.76-.08,v+side*.76+.08,9.7,11.0,col);
    });
    bevel(-10.7,10.2,v-.95,v+.95,10.7,12.2,.26,'#d3d3d3');
    // Sloped shoulder transfers the upper folded load to the front track
    // cradle rather than ending the side wing at an unconnected red roof.
    profile([[5.1,8.2],[14.8,8.2],[17.0,9.0],[13.2,11.2],
      [8.1,12.7],[5.1,12.3]],side*5.95-.6,side*5.95+.6,'#d9d9d9');
    box(-15.3,13.9,v+side*.73-.05,v+side*.73+.05,8.6,8.95,LIGHT);
    [-14.4,-2.4,10.7].forEach(function(u){
      box(u-.65,u+.65,v+side*.74-.07,v+side*.74+.07,7.45,10.65,col);
      box(u-.22,u+.22,v+side*.81-.04,v+side*.81+.04,8.1,10.15,LIGHT);
    });
  }
  // Low front housing and wide intake-like bumper: no fake Allied windscreen.
  profile([[10.8,6.2],[18.2,6.2],[19.1,7.3],[18.4,9.45],
    [16.0,10.85],[13.1,12.15],[10.8,11.35]],-6.15,6.15,STEEL);
  // Forward folding head is a raised red machine housing seated into the
  // sloping steel cradle, rather than a small painted patch on a blank nose.
  profile([[12.8,10.2],[17.9,9.2],[18.5,10.0],[16.7,12.0],
    [14.3,12.7],[12.8,12.1]],-3.45,3.45,col);
  bevel(16.3,18.5,-3.15,3.15,9.3,11.65,.35,col);
  bevel(18.55,19.25,-6.95,6.95,5.0,6.7,.25,LIGHT);
  box(19.27,19.36,-4.6,4.6,6.0,6.42,DARK);
  // A second folded jack/engine case closes the opposite end.
  bevel(-18.1,-12.0,-5.8,5.8,8.9,13.3,.55,DARK);
  bevel(-18.0,-15.2,-5.35,5.35,12.7,14.2,.35,col);
  bevel(-18.9,-17.3,-5.9,5.9,6.65,9.6,.3,STEEL);
  for(var side=-1;side<=1;side+=2){
    box(-19.0,-17.7,side*3.3-1.8,side*3.3+1.8,7.5,10.2,MACHINE);
    rearActuatorCap(side*3.3,8.7);
  }
  // Packed construction gear: recessed dark trough, paired red folded slabs,
  // steel crossmember and connected pale hinge cheeks. It is a full module,
  // not a floating red box lying on the deck.
  bevel(-10.5,9.9,-5.75,5.75,9.25,11.25,.55,DARK);
  bevel(-8.8,8.4,-5.0,5.0,10.85,13.05,.45,'#4d4d4d');
  for(var side=-1;side<=1;side+=2){
    var v=side*4.15;
    profile([[-8.0,11.1],[7.1,11.1],[8.15,12.55],[6.8,15.65],
      [-6.5,15.65],[-8.5,13.6]],v-.78,v+.78,col);
    bevel(-7.8,7.65,side*2.95-1.35,side*2.95+1.35,
      12.45,15.65,.35,col);
    bevel(-8.5,8.3,side*5.0-.55,side*5.0+.55,10.0,13.4,.28,STEEL);
    [-7.1,6.55].forEach(function(u){
      box(u-.5,u+.5,side*5.5-.75,side*5.5+.75,8.9,13.0,LIGHT);
    });
  }
  box(-6.6,6.5,-3.0,3.0,13.0,14.2,DARK);
  bevel(-2.0,.2,-5.5,5.5,14.75,15.7,.3,LIGHT);
  box(-1.45,-.35,-5.55,5.55,15.25,15.9,col);
  // Two stowed hydraulic shoulders stand above the folded plates. Their
  // silver cylinder heads are a major silhouette feature in the RA2 views;
  // they are connected to the rear jack case and wing hinges below.
  for(var side=-1;side<=1;side+=2){
    var sv=side*3.35;
    profile([[-15.8,10.7],[-11.8,10.7],[-9.6,14.1],[-9.6,16.5],
      [-13.4,16.5],[-15.8,13.8]],sv-.92,sv+.92,STEEL);
    box(-14.4,-11.2,sv+side*.96-.12,sv+side*.96+.12,12.6,15.8,LIGHT);
    // A low capped hinge and diagonal brace keep this a stowed load-bearing
    // arm, not a bright chimney on the roof.
    bevel(-11.8,-10.0,sv-.85,sv+.85,14.3,15.8,.25,LIGHT);
    beam([-15.0,sv,10.8],[-10.9,sv,15.0],1.05,.85,STEEL);
  }
}else{
// A low, wide works chassis: large exposed tyres support a deep
// boxed frame. All folding equipment attaches to these load paths.
[11.2,-5.1,-13.1].forEach(function (u) { tyre(u,-6.95); tyre(u,6.95); });
bevel(-18.3,18.3,-5.85,5.85,3.0,7.2,0.75,DARK);
// Deep load-bearing frame. Its upper edge sits well above the wheel centres,
// so the tyres look tucked under a heavy armoured carrier rather than hung
// from a thin rail.
box(-18.1,10.2,-6.65,6.65,5.9,12.35,BODY);
[11.2,-5.1,-13.1].forEach(function (u) {
  bevel(u-1.3,u+1.3,-7.1,7.1,3.2,5.2,0.3,STEEL);
});
for (var side=-1;side<=1;side+=2) {
  var v=side*7.0;
  var rail=[[-18.5,9.9],[9.2,9.9],[9.2,7.8],[7.7,5.5],[-1.3,5.5],
    [-2.3,7.25],[-3.6,8.0],[-6.7,8.0],[-8.0,7.25],[-8.7,5.5],[-9.4,5.5],
    [-10.4,7.3],[-11.7,8.0],[-14.6,8.0],[-15.9,7.2],[-16.7,5.5],[-18.4,6.1]];
  profile(rail,v-0.60,v+0.60,RAIL);
  // The long coated rubbing strip is the single coloured line carried by the
  // real MCV's otherwise structural side rail.
  box(-18.0,9.0,v-0.64,v+0.64,8.15,10.05,BODY);
  box(-17.7,8.75,v+side*0.65-0.025,v+side*0.65+0.025,8.7,9.25,DARK);
  [-16.8,-8.8,-1.6,7.9].forEach(function (u) {
    box(u,u+0.55,v-0.70,v+0.70,8.3,10.13,STEEL);
    box(u+0.14,u+0.37,v+side*0.72-0.03,v+side*0.72+0.03,9.45,9.72,LIGHT);
  });
  // Plate stacks are the folded foundation wings. Raise them into broad side
  // shoulders: the packed construction bed must look full from broadside,
  // not like a tray with its centre punched down.
  for (var layer=0;layer<3;layer++) {
    var z=11.15+layer*0.82;
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
box(17.43,17.5,-5.5,5.5,9.3,9.52,'#777777');
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

// The folded construction yard is a packed, raised module. RA2 gives the MCV
// a full blue-backed mass above the chassis; treating this area as a recessed
// well made the vehicle look hollow and light.
bevel(-12.0,9.0,-6.15,6.15,11.75,13.2,0.55,STEEL);
// A crowned longitudinal profile replaces the old flat-topped box. Sloped
// end shoulders and a high central spine make the packed yard read as a full
// mechanical volume from both broadside and three-quarter bearings.
profile([[-8.45,13.0],[8.35,13.0],[8.65,14.35],[7.55,17.25],
  [5.65,18.2],[-5.75,18.2],[-7.75,17.0],[-8.7,14.35]],-5.45,5.45,NAVY);
box(-5.55,5.5,-4.9,4.9,17.92,18.32,shade(NAVY,1.25));
box(-5.2,5.15,-0.28,0.28,18.24,18.5,DARK); // fold groove
bevel(-5.4,6.0,-2.6,2.6,18.34,18.60,.2,shade(NAVY,.72));
for(var side=-1;side<=1;side+=2)
  beam([-7.4,side*4.85,16.35],[6.5,side*4.85,18.45],1.0,1.12,STEEL);
// The pale mechanical saddle is broad and visible below the blue packed
// works module in RA2. A purple cheek over this entire height hid its load
// path and made the machinery read as a single blue cargo box.
for (var side=-1;side<=1;side+=2) {
  var sv=side*5.75;
  profile([[-10.0,11.45],[8.6,11.45],[8.6,13.35],[5.8,15.55],
    [-6.7,15.55],[-10.0,13.65]],sv-.85,sv+.85,STEEL);
  bevel(-8.6,7.5,sv+side*.87-.08,sv+side*.87+.08,11.7,12.35,.12,LIGHT);
  [-7.4,5.8].forEach(function(u){
    box(u-.48,u+.48,sv+side*.9-.1,sv+side*.9+.1,12.25,15.0,LIGHT);
  });
}

// A narrow steel clamp genuinely crosses the folded bed. The old purple tarp
// was an unexplained colour block and made the load look like stacked parcels.
bevel(-3.35,-1.15,-5.78,5.78,17.92,18.92,0.24,STEEL);

// Rear machinery: three separate upright actuator housings sit on a low
// bridge. Their gaps and ribbed sides remain visible in broadside; a set of
// longitudinal drums merged into another rectangular grey slab there.
bevel(-15.8,-7.0,-5.55,5.55,11.45,13.35,0.5,DARK);
[-13.7,-11.0,-8.3].forEach(function (u) {
  vdrum(u,0,13.05,17.65,1.16,LIGHT);
});
for (var side=-1;side<=1;side+=2) {
  beam([-15.2,side*4.85,12.8],[-7.0,side*4.85,16.1],0.66,0.66,STEEL);
}

// The rear terminates in a chassis crossmember and two folded jack housings,
// not a full-width vertical drum.
bevel(-18.75,-17.15,-6.8,6.8,6.4,8.4,0.38,DARK);
for (var side=-1;side<=1;side+=2) {
  bevel(-18.9,-17.0,side*4.55-1.15,side*4.55+1.15,8.0,10.5,0.32,STEEL);
  box(-18.95,-18.82,side*4.55-0.72,side*4.55+0.72,8.45,9.85,LIGHT);
}
}

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
s.g.closePath();s.g.fillStyle='rgba(17,17,17,0.30)';s.g.fill();

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

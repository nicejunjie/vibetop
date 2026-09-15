// Mirage: low olive gun assembly enclosed by tall pale side housings.
// Read against library/mirage-voxel.jpg, not a conventional tank turret.
function drawMirage(C) {
  var g=C.g, cx=C.cx, by=C.by, fx=C.fx, fy=C.fy, px=C.px, py=C.py;
  var len=C.len, wid=C.wid, a=C.a, panel=C.panel;
  // Preserve the dark chassis/pale shell contrast; fleet-wide lifting bleached
  // the olive machinery and turned the housings into glowing white blocks.
  setVLIFT(1);
  C.tracks(len,3.6,wid*.30,'#858585');
  C.chassis(cx,by-1.3,len*.84,wid*.74,3.8,'#636578','#31333e',3.4);
  C.deckPlate(-.8,len*.56,wid*.46,5.9,'#656878');
  for(var side=-1;side<=1;side+=2)
    isoBox(g,cx+px*wid*.365*side,by-2.9+py*wid*.365*side,
      len*.70,1.6,1.6,a,shade(panel,.78),C.PEDGE);
  var tx=cx+fx*.6, ty=by-6.2+fy*.6;
  function housing(side) {
    // A faceted arch rolls from the high inner shoulder down to the outer
    // chassis. Its broad sloping face, not a flat white cap, is the identity.
    var section=[[3.0,7.8],[4.3,8.2],[5.9,6.8],[7.1,4.6],[7.5,1.0]];
    function point(u,v,z) {return [tx+fx*u*.9+px*v*side,ty+fy*u*.9+py*v*side-z*.84];}
    function face(points,colour) {
      g.beginPath();g.moveTo(points[0][0],points[0][1]);
      for(var j=1;j<points.length;j++)g.lineTo(points[j][0],points[j][1]);
      g.closePath();g.fillStyle=colour;g.fill();
    }
    // Dark inner wall makes the recessed centre readable from above.
    face([point(-5.8,3,0),point(4.7,3,0),point(4.7,3,7.8),point(-5.8,3,7.8)],'#626b80');
    var shades=['#d3d6df','#b9bfd0','#969fb9','#717e98'];
    for(var band=0;band<section.length-1;band++) {
      var p=section[band],q=section[band+1];
      face([point(-5.8,p[0],p[1]),point(4.7,p[0],p[1]),
        point(4.7,q[0],q[1]),point(-5.8,q[0],q[1])],shades[band]);
    }
    // End thickness follows the same curved profile; no detached side pod.
    var end=fy>0?4.7:-5.8;
    face(section.map(function(p){return point(end,p[0],p[1]);})
      .concat([point(end,7.5,0),point(end,3,0)]),'#909bb3');
    // Two restrained transverse joins reveal the segmented shell in side view.
    for(var seam=-2;seam<=1.5;seam+=3.5) {
      g.beginPath();
      section.forEach(function(p,i){var v=point(seam,p[0],p[1]);if(i)g.lineTo(v[0],v[1]);else g.moveTo(v[0],v[1]);});
      g.strokeStyle='#778399';g.lineWidth=.48;g.stroke();
    }
  }
  function radiator() {
    var x=cx-fx*8.2,y=by-5.8-fy*8.2;
    isoBox(g,x,y,3.5,8.0,3.8,a,'#30343b','#1d2228');
    for(var i=-1;i<=1;i++)isoBox(g,x+px*i*2.2,y+py*i*2.2,
      3.7,.65,3.7,a,'#737780','#42464d');
  }
  if(fy>0)radiator();
  var far=py>=0?-1:1;
  housing(far);
  // Low angular olive centre: no cupola, round cap or white mantlet.
  C.prism(tx+fx,ty+fy,
    [[4.8,-2.6],[4.8,2.6],[-1.6,3.0],[-4.4,2.1],[-4.4,-2.1],[-1.6,-3.0]],
    3.1,'#8c8e68','#4c503b');
  isoBox(g,tx-fx,ty-3.1-fy,3.0,3.1,.35,a,'#656b4b','#434932');
  // Broad olive shroud terminating in a dark muzzle, not a long round cannon.
  isoBox(g,tx+fx*8.8,ty-1.4+fy*8.8,9.0,2.5,1.9,a,'#7d825c','#484e37');
  isoBox(g,tx+fx*13.7,ty-1.4+fy*13.7,1.4,2.65,1.95,a,'#30383c','#1b2228');
  housing(-far);
  if(fy<=0)radiator();
}

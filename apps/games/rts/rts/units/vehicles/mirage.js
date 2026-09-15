// Mirage: low olive gun assembly enclosed by tall pale side housings.
// Read against library/mirage-voxel.jpg, not a conventional tank turret.
function drawMirage(C) {
  var g=C.g, cx=C.cx, by=C.by, fx=C.fx, fy=C.fy, px=C.px, py=C.py;
  var len=C.len, wid=C.wid, a=C.a, panel=C.panel;
  C.tracks(len,3.6,wid*.30,'#858585');
  C.chassis(cx,by-1.3,len*.84,wid*.74,3.8,'#636578','#31333e',3.4);
  C.deckPlate(-.8,len*.56,wid*.46,5.9,'#77798b');
  for(var side=-1;side<=1;side+=2)
    isoBox(g,cx+px*wid*.365*side,by-2.9+py*wid*.365*side,
      len*.70,1.6,2.3,a,panel,C.PEDGE);
  C.bumper(len*.41,wid*.24,by-1.6);
  var tx=cx+fx*.6, ty=by-6.2+fy*.6;
  function housing(side) {
    // Pale shoulders wrap the low gun assembly; no white turret roof.
    var x=tx-fx*1.2+px*5.2*side, y=ty-fy*1.2+py*5.2*side;
    C.prism(x,y,[[4.2,-1.4],[4.2,1.4],[-2.8,1.8],[-4.6,.9],[-4.6,-.9],[-2.8,-1.8]],
      5.8,'#a5a8bd','#545969');
    C.prism(x-fx*.7,y-5.8-fy*.7,
      [[3.3,-1.1],[3.3,1.1],[-2.5,1.35],[-3.8,.7],[-3.8,-.7],[-2.5,-1.35]],
      .8,'#d5d7df','#868da1');
    isoBox(g,x,y+.4,7.5,2.8,1.3,a,panel,'#353844');
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
  C.barrel(tx+fx*4.8,ty-1.9+fy*4.8,8.8,1.65,1.2,'#696e4e','#a2a67f');
  housing(-far);
  if(fy<=0)radiator();
  for(var lampSide=-1;lampSide<=1;lampSide+=2)
    C.lamp(cx+fx*len*.38+px*wid*.26*lampSide,
      by-4.2+fy*len*.38+py*wid*.26*lampSide);
}

// Iron Frontier — GI. Small steel helmet, shaped cloth vest, exposed
// forearms, olive fatigues and a rifle supported by two articulated hands.
function drawGi(C) {
  var g = C.g, cx = C.cx, by = C.by, sd = C.sd, TURN = C.TURN;
  var gt = C.gt, col = C.col, back = C.FA.back;
  var fire = C.state === 'fire' || C.state === 'fireprone';
  function poly(points, colour) {
    g.fillStyle = colour; g.beginPath(); g.moveTo(points[0][0], points[0][1]);
    for (var p = 1; p < points.length; p++) g.lineTo(points[p][0], points[p][1]);
    g.closePath(); g.fill();
  }
  function stroke(points, colour, width) {
    // Rasterize connected strokes onto the final pixel grid. Thin rifle,
    // wrist and boot highlights must be pixels, not fractional grey coverage.
    var m=g.getTransform(), w=Math.max(1,Math.round(width*Math.sqrt(Math.abs(m.a*m.d-m.b*m.c))));
    var pts=points.map(function(p){return [Math.round(m.a*p[0]+m.c*p[1]+m.e),Math.round(m.b*p[0]+m.d*p[1]+m.f)];});
    g.save();g.setTransform(1,0,0,1,0,0);g.fillStyle=colour;
    for(var p=1;p<pts.length;p++){
      var x=pts[p-1][0],y=pts[p-1][1],tx=pts[p][0],ty=pts[p][1];
      if (!Number.isFinite(x+y+tx+ty)) throw new Error('Non-finite GI stroke coordinates');
      var dx=Math.abs(tx-x),sx=x<tx?1:-1,dy=-Math.abs(ty-y),sy=y<ty?1:-1,err=dx+dy;
      while(true){
        g.fillRect(x-Math.floor(w/2),y-Math.floor(w/2),w,w);
        if(x===tx&&y===ty)break;
        var e=2*err;if(e>=dy){err+=dy;x+=sx;}if(e<=dx){err+=dx;y+=sy;}
      }
    }
    g.restore();
  }
  function ramp(x, y, w, h, a, b, c) {
    var grad = g.createLinearGradient(x, y, x + w, y + h);
    // Three authored planes, without a gradient of intermediary shades.
    grad.addColorStop(0, a); grad.addColorStop(.22, a);
    grad.addColorStop(.22, b); grad.addColorStop(.70, b);
    grad.addColorStop(.70, c); grad.addColorStop(1, c);
    return grad;
  }
  // The pelvis ends above the thighs; it must not fill the space between knees.
  poly([[cx-3.5,by-12.8],[cx+3.5,by-12.8],[cx+2.8,by-9.8],
        [cx,by-10.5],[cx-2.8,by-9.8]], '#3f462b');
  var order = gt.sw ? [-gt.sw, gt.sw] : [-1, 1];
  for (var n = 0; n < 2; n++) {
    var i = order[n], lead = gt.sw ? (i === gt.sw ? 1 : -1) : 0;
    var lat = 1 - 0.48 * sd;
    var hx = cx + i * 2.1 * lat;
    var kx = cx + i * (lead > 0 ? 3.8 : lead < 0 ? 1.2 : 2.6) * lat
      + (lead > 0 ? 2.2 : lead < 0 ? -1.7 : 0) * sd / TURN;
    var fx = kx + (lead > 0 ? 1.0 : lead < 0 ? -0.8 : i * 0.45) / TURN;
    var lift = lead < 0 ? 2.0 : (!gt.sw && i < 0 ? 0.45 : 0);
    var ky = by - 6.8 - lift, ay = by - 3.0 - lift;
    var w = lead < 0 ? 1.65 : 1.9;
    poly([[hx-w,by-12.2],[hx+w,by-12.2],[kx+w*.86,ky],
          [kx+w*.58,ky+1.1],[kx-w*.86,ky+.3]],
      ramp(hx-w,by-12.2,w*2,5.5,'#74784b','#555d36','#303924'));
    // Broad irregular camouflage/fold planes follow the thigh, not screen stripes.
    poly([[hx-w*.8,by-10.7],[hx+.4,by-11.2],[kx+.5,ky-1.4],
          [kx-.7,ky-.8],[hx-.9,by-9.2]], '#394329');
    poly([[kx-w*.8,ky],[kx+w*.8,ky],[fx+1.3,ay],[fx-1.35,ay]],
      ramp(kx-w,ky,w*2,3.8,'#697445','#4b5830','#2a3326'));
    stroke([[kx-w*.65,ky+.1],[kx+.3,ky-.2]], '#85905a', .65);
    // Black leather boot: narrow ankle, weight over a broader forward toe.
    poly([[fx-1.35,ay-.4],[fx+1.35,ay-.4],[fx+1.7,by-1.6-lift],
          [fx+2.2,by-.45-lift],[fx+1.6,by+.05-lift],[fx-1.9,by-.1-lift],
          [fx-2.0,by-1.0-lift]], '#202625');
    stroke([[fx-1.1,by-1.65-lift],[fx+.9,by-1.7-lift],[fx+1.55,by-.9-lift]],
      '#59615a', .6);
  }

  g.save(); g.translate(gt.lean, gt.bob);
  g.translate(cx, by - 11.8); g.rotate(sd * (gt.sw ? .09 : .025));
  g.translate(-cx, -(by - 11.8));
  // Weapon and hands share the same endpoints through every bearing/pose.
  var sign = back ? -1 : 1;
  var angle = fire ? -.17 : -.40 + .14 * sd;
  var length = 12.0 + 1.8 * sd;
  var gunX = cx + sign * (.5 + 1.7 * sd) / TURN;
  var gunY = by - (fire ? 19.0 : 15.7);
  function onGun(t) {
    return [gunX + sign * Math.cos(angle) * length * (t-.40) / TURN,
            gunY + Math.sin(angle) * length * (t-.40)];
  }
  function rifle() {
    var p0=onGun(0), p1=onGun(.28), p2=onGun(.65), p3=onGun(1);
    stroke([p0,p1], '#303733', 2.25);
    stroke([p1,p2], '#222a2b', 2.0);
    stroke([p2,p3], '#222829', 1.15);
    stroke([onGun(.43),onGun(.92)], '#929b94', .55);
    var mag=onGun(.40);
    poly([[mag[0]-.6,mag[1]],[mag[0]+1.0,mag[1]],
          [mag[0]+.65,mag[1]+2.5],[mag[0]-.7,mag[1]+2.2]], '#252d2c');
  }
  function arm(i) {
    var hand=onGun(i < 0 ? .28 : .62);
    var shoulder=[cx+i*4.25,by-18.7+i*sd*.3];
    var elbow=[cx+i*5.35,by-(fire?17.0:15.3)+i*sd*.35];
    stroke([shoulder,elbow],shade(col,i < 0 ? .62 : .48),3.25);
    stroke([[shoulder[0]-.35,shoulder[1]-.3],
            [elbow[0]-.3,elbow[1]-.5]],shade(col,i < 0 ? 1.15 : .83),2.05);
    stroke([elbow,hand], '#917462', 2.25);
    stroke([[elbow[0]-.15,elbow[1]-.35],[hand[0]-.15,hand[1]-.35]], '#d6b99b', 1.5);
    g.fillStyle='#3e4640'; g.beginPath();
    g.ellipse(hand[0],hand[1],1.05,.9,0,0,6.29); g.fill();
  }
  if (back) { rifle(); arm(-1); arm(1); }
  else arm(-sign);
  // Vest wraps around the rib cage and tapers into the belt. Lit shoulder,
  // breast and lower abdomen form distinct connected planes.
  var vest=ramp(cx-4.6,by-20.1,9.2,8.3,
    shade(col,1.18),shade(col,.9),shade(col,.48));
  g.fillStyle=vest; g.beginPath();
  g.moveTo(cx-3.5,by-20.2);
  g.quadraticCurveTo(cx-5.0,by-19.3,cx-4.55,by-16.7);
  g.quadraticCurveTo(cx-3.95,by-13.8,cx-3.2,by-12.0);
  g.quadraticCurveTo(cx,by-11.4,cx+3.25,by-12.0);
  g.quadraticCurveTo(cx+4.4,by-14.8,cx+4.45,by-17.4);
  g.quadraticCurveTo(cx+4.75,by-19.5,cx+3.25,by-20.1);
  g.quadraticCurveTo(cx,by-20.8,cx-3.5,by-20.2); g.closePath(); g.fill();
  poly([[cx-3.7,by-19.5],[cx-.6,by-19.9],[cx-.8,by-17.4],
        [cx-3.7,by-17.0]],shade(col,1.07));
  poly([[cx+.1,by-17.0],[cx+3.8,by-17.7],[cx+3.3,by-15.0],
        [cx+.4,by-14.6]],shade(col,.75));
  stroke([[cx-3.1,by-13.8],[cx-.7,by-13.35],[cx+2.6,by-13.8]],
    shade(col,.51),.6);
  // Quiet shoulder straps and waist pouches have volume rather than black outlines.
  for (var st=-1;st<=1;st+=2) {
    stroke([[cx+st*2.8,by-19.9],[cx+st*2.45,by-17.2]],
      shade(col,st<0?.58:.48),.8);
    g.fillStyle=ramp(cx+st*2.5-1.0,by-12.9,2.0,2.0,'#7b7b4b','#585e36','#303a28');
    g.beginPath(); g.roundRect(cx+st*2.5-1.0,by-12.9,2.0,2.0,.4); g.fill();
  }
  stroke([[cx-3.3,by-11.75],[cx+3.2,by-11.75]], '#303827', .9);
  if (!back) arm(sign);
  if (!back) rifle();

  // Small steel helmet. Its curved crown carries one light plane; the brim
  // casts a narrow dark shadow over the face instead of a broad white cap.
  var headX=cx+sd*1.15/TURN;
  poly([[headX-1.65,by-21.5],[headX+1.7,by-21.5],
        [headX+1.2,by-19.6],[headX-1.2,by-19.8]],'#353c3b');
  g.fillStyle=ramp(headX-2.8,by-24.8,5.6,3.7,'#c5c5c5','#898989','#434343');
  g.beginPath();
  g.moveTo(headX-2.8,by-21.6);
  g.bezierCurveTo(headX-2.9,by-24.6,headX-.8,by-25.0,headX+.8,by-24.2);
  g.quadraticCurveTo(headX+2.6,by-23.5,headX+2.7,by-21.5);
  g.closePath(); g.fill();
  stroke([[headX-2.9,by-21.55],[headX-.3,by-21.0],[headX+2.9,by-21.55]],
    '#494949',.9);
  stroke([[headX-1.85,by-23.7],[headX-.9,by-24.1],[headX+.05,by-23.9]],
    '#d0d0d0',.6);
  g.restore();
}

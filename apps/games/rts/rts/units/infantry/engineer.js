// Iron Frontier — Engineer: work shirt, open waistcoat, hard hat and a
// hand-carried tool case. Clothes wrap the body; the case hangs from its grip.
function drawEngineer(C) {
  var g=C.g, cx=C.cx, by=C.by, gt=C.gt, sd=C.sd, turn=C.TURN;
  var col=C.col, back=C.FA.back;
  function poly(p,fill) {
    g.fillStyle=fill; g.beginPath(); g.moveTo(p[0][0],p[0][1]);
    for(var j=1;j<p.length;j++) g.lineTo(p[j][0],p[j][1]);
    g.closePath(); g.fill();
  }
  function line(p,fill,w) {
    g.strokeStyle=fill; g.lineWidth=w; g.lineCap='round'; g.lineJoin='round';
    g.beginPath(); g.moveTo(p[0][0],p[0][1]);
    for(var j=1;j<p.length;j++) g.lineTo(p[j][0],p[j][1]);
    g.stroke();
  }
  function ramp(x,y,w,h,a,b,c) {
    var q=g.createLinearGradient(x,y,x+w,y+h);
    q.addColorStop(0,a); q.addColorStop(.48,b); q.addColorStop(1,c); return q;
  }
  poly([[cx-3.8,by-12.1],[cx+3.8,by-12.1],[cx+3.0,by-9.4],
    [cx,by-10.0],[cx-3.0,by-9.4]],'#6b6048');
  var order=gt.sw?[-gt.sw,gt.sw]:[-1,1];
  for(var n=0;n<2;n++) {
    var i=order[n], lead=gt.sw?(i===gt.sw?1:-1):0;
    var lat=1-.47*sd, hx=cx+i*2.6*lat;
    var kx=cx+i*(lead>0?4.2:lead<0?1.4:3.0)*lat+
      (lead>0?2.1:lead<0?-1.4:0)*sd/turn;
    var fx=kx+(lead>0?.8:lead<0?-.8:i*.2)/turn;
    var lift=lead<0?2.0:0, ky=by-6.6-lift, ay=by-2.4-lift;
    var w=lead<0?1.7:2.0;
    poly([[hx-w,by-11.7],[hx+w,by-11.7],[kx+w*.8,ky+.5],
      [kx-w*.9,ky+.2]],ramp(hx-w,by-11.7,2*w,5.5,
      '#b3a17d','#8f7c59','#514d3b'));
    poly([[kx-w*.9,ky],[kx+w*.8,ky],[fx+1.3,ay],[fx-1.5,ay]],
      ramp(kx-w,ky,2*w,4.2,'#bba77b','#907b53','#59503b'));
    line([[kx-1.4,ky],[kx+.5,ky-.3]],'#d0ba8b',.7);
    line([[hx-.7,by-10.4],[kx-.6,ky-1.5]],'#74664b',.65);
    poly([[fx-1.5,ay-.2],[fx+1.3,ay-.2],[fx+2.3,by-.65-lift],
      [fx+1.9,by-.05-lift],[fx-2.0,by-.05-lift],[fx-2.0,by-1.1-lift]],'#30302b');
    line([[fx-1.4,by-1.45-lift],[fx+.9,by-1.6-lift]],'#656051',.7);
  }
  g.save(); g.translate(gt.lean,gt.bob);
  function arm(i) {
    var swing=gt.sw?(i===gt.sw?-1:1):0;
    var sx=cx+i*4.7*(1-.22*sd);
    var ex=sx+i*.65+swing*.65*sd/turn, ey=by-15.3+swing*.5;
    var hand=[ex+swing*.65*sd/turn,by-12.0+swing*.75];
    line([[sx,by-18.9],[ex,ey]],'#838580',3.4);
    line([[sx-.35,by-19.0],[ex-.4,ey-.3]],'#e0ded0',2.35);
    line([[ex,ey],[hand[0],hand[1]]],'#947451',2.3);
    line([[ex-.3,ey-.1],[hand[0]-.3,hand[1]-.35]],'#c8aa7e',1.45);
    if(i>0) {
      var bx=hand[0]+.3, top=hand[1]+1.25;
      // The handle starts at the actual hand and clears the case lid.
      line([[bx-1.45,top],[bx-1.45,top-1.7],[bx+1.4,top-1.7],[bx+1.4,top]],'#32372f',.85);
      g.fillStyle=ramp(bx-2.7,top,5.6,5.9,shade(col,1.05),shade(col,.78),shade(col,.40));
      g.beginPath(); g.roundRect(bx-2.7,top,5.6,5.9,.55); g.fill();
      poly([[bx+1.6,top+.6],[bx+2.9,top],[bx+2.9,top+5.4],
        [bx+1.6,top+5.9]],shade(col,.44));
      line([[bx-2.4,top+.3],[bx+1.6,top+.3]],shade(col,1.24),.75);
      line([[bx-2.4,top+1.5],[bx+1.7,top+1.5]],shade(col,.43),.55);
      g.fillStyle='#bcb8a5'; g.fillRect(bx-.5,top+1.2,.9,1.3);
    }
    g.fillStyle='#c7a47a'; g.beginPath();
    g.ellipse(hand[0],hand[1],1.1,.95,0,0,6.29); g.fill();
  }
  var near=back?1:-1;
  arm(-near);
  // Pale shirt remains visible at the neck, sleeves and between the vest panels.
  g.fillStyle=ramp(cx-4.5,by-20.0,9,9,'#e9e6d6','#bcbcaf','#747971');
  g.beginPath(); g.moveTo(cx-3.7,by-20);
  g.quadraticCurveTo(cx-5.1,by-19,cx-4.2,by-16);
  g.lineTo(cx-3.6,by-11.6); g.quadraticCurveTo(cx,by-11.0,cx+3.6,by-11.6);
  g.lineTo(cx+4.4,by-17); g.quadraticCurveTo(cx+4.9,by-19.7,cx+3.4,by-20);
  g.closePath(); g.fill();
  for(var side=-1;side<=1;side+=2) {
    g.fillStyle=ramp(cx-4.6,by-20,9.2,8.8,shade(col,1.12),shade(col,.77),shade(col,.36));
    g.beginPath(); g.moveTo(cx+side*.7,by-19.1);
    g.lineTo(cx+side*3.2,by-20);
    g.quadraticCurveTo(cx+side*5.1,by-19.5,cx+side*4.3,by-16.3);
    g.lineTo(cx+side*3.7,by-11.5);
    g.quadraticCurveTo(cx+side*2,by-11,cx+side*.6,by-11.6);
    g.lineTo(cx+side*.8,by-17.5); g.closePath(); g.fill();
    line([[cx+side*3.4,by-16.2],[cx+side*1.7,by-15.8]],shade(col,.53),.6);
  }
  if(back) {
    poly([[cx-1.0,by-19.6],[cx+1.0,by-19.6],[cx+1.0,by-12],[cx-1.0,by-12]],shade(col,.70));
  } else {
    poly([[cx-1.5,by-20],[cx,by-18.3],[cx-.9,by-17.7],[cx-2.5,by-19.2]],'#eee9d8');
    poly([[cx+1.4,by-20],[cx,by-18.3],[cx+1.1,by-17.6],[cx+2.5,by-19.2]],'#b5b9ab');
  }
  line([[cx-3.6,by-11.65],[cx,by-11.4],[cx+3.6,by-11.65]],'#544b34',1.1);
  if(!back) { g.fillStyle='#a8a18a'; g.fillRect(cx-.6,by-12.1,1.2,1.0); }
  arm(near);
  var head=cx+sd*.85/turn;
  poly([[head-1.7,by-22.0],[head+1.8,by-22.0],[head+1.4,by-19.6],
    [head-.6,by-19.3],[head-1.7,by-20.1]],back?'#706044':'#c5a37a');
  g.fillStyle=ramp(head-3,by-25.7,6,4,
    C.sov?'#e4e4dc':'#ffe28b',C.sov?'#b5b7b1':'#dcae37',C.sov?'#727b78':'#8d6725');
  g.beginPath(); g.moveTo(head-2.9,by-22.2);
  g.bezierCurveTo(head-3,by-25.9,head+2.7,by-26.2,head+2.9,by-22.2);
  g.quadraticCurveTo(head,by-21.5,head-2.9,by-22.2); g.fill();
  line([[head-.55,by-25.1],[head-.35,by-22.7]],C.sov?'#f2f0e7':'#ffdf7b',.8);
  line([[head-3.15,by-22],[head,by-21.65],[head+3.25,by-22]],C.sov?'#969d93':'#c09938',1.0);
  g.restore();
}

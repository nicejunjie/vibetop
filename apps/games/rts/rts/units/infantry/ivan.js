// Crazy Ivan: exposed face, sleeveless vest, bent stance and raised dynamite.
function drawIvan(C) {
  var g=C.g,cx=C.cx,by=C.by,sd=C.sd,turn=C.TURN,gt=C.gt,col=C.col;
  var planting=C.state==='fire'||C.state==='fireprone';
  var reach=planting?[.1,.5,1,.85,.45,.1][C.phase]:0;
  // Alternate planted and passing legs. The generic helper pulled both knees
  // to one side in front view, making the run read as a sideways squat.
  var walking=C.state==='walk'||C.state==='crawl';
  var order=gt.sw?[-gt.sw,gt.sw]:[-1,1];
  for(var leg=0;leg<2;leg++){
    var li=order[leg],swing=walking?li*gt.swf:0;
    var hx0=cx+li*2.5*(1-.25*sd);
    var fx0=cx+li*3.4*(1-.7*sd)+(walking?swing*4.5:li*.7)*sd/turn;
    var lift=Math.max(0,-swing)*2.8;
    var ky=by-6.2-lift*.5,kx=(hx0+fx0)/2+Math.max(0,-swing)*1.1/turn;
    g.strokeStyle='#252f44';g.lineWidth=4.5;g.lineCap='round';g.lineJoin='round';
    g.beginPath();g.moveTo(hx0,by-11.8);g.lineTo(kx,ky);g.lineTo(fx0,by-2.5-lift);g.stroke();
    g.strokeStyle=swing<0?'#3d495c':'#465674';g.lineWidth=2.8;
    g.beginPath();g.moveTo(hx0-.3,by-11.4);g.lineTo(kx-.3,ky);g.lineTo(fx0-.3,by-2.7-lift);g.stroke();
    g.fillStyle='#343434';g.fillRect(fx0-2.1,by-2.5-lift,4.5,2.6);
    g.fillStyle='#626262';g.fillRect(fx0-1.5,by-2.4-lift,3,.8);
  }
  g.save();g.translate(gt.lean+reach*sd*.8,gt.bob+reach*.8);
  g.fillStyle='#252f44';g.fillRect(cx-4.8,by-13,9.6,2.5);
  g.fillStyle='#d7ae87';g.fillRect(cx-5.0,by-20,10,7);
  g.fillStyle=col;
  g.fillRect(cx-4.8,by-20,3.7,7.2);g.fillRect(cx+1.1,by-20,3.7,7.2);
  g.fillStyle='#f0d0a5';g.fillRect(cx-1,by-19.3,2,5.5);
  g.fillStyle='#46332b';g.fillRect(cx-5,by-13.4,10,1.5);
  g.fillStyle='#c0aa77';g.fillRect(cx-.8,by-13.3,1.6,1.1);
  // Both elbows bend; the explosive hand is held away from the torso.
  for(var i=-1;i<=1;i+=2){
    var sx=cx+i*5.2, ex=cx+i*(6.4+sd)/turn;
    var hx=cx+i*(i>0?7.8:5.8)/turn;
    var hy=by-(i>0?17.8:14.4), ey=by-14.8;
    if(i>0){
      hx+=reach*(2.8+sd*2)/turn;
      hy+=reach*5.3;ex+=reach*1.5/turn;ey+=reach*.8;
    }else if(C.state==='walk'||C.state==='crawl'){
      hx+=gt.swf*1.4/turn;hy-=gt.swf*.9;
    }
    g.lineCap='round';g.lineJoin='round';
    g.strokeStyle='#795342';g.lineWidth=3.8;
    g.beginPath();g.moveTo(sx,by-19);g.lineTo(ex,ey);g.lineTo(hx,hy);g.stroke();
    g.strokeStyle='#f0d0a5';g.lineWidth=2.6;
    g.beginPath();g.moveTo(sx-.3,by-19);g.lineTo(ex-.3,ey);g.lineTo(hx,hy);g.stroke();
    if(i>0){
      g.fillStyle='#795342';g.fillRect(hx-2.1,hy-6.1,4.5,6.0);
      g.fillStyle='#ae8064';g.fillRect(hx-1.8,hy-6,1.5,5.6);
      g.fillStyle='#c0aa77';g.fillRect(hx+.2,hy-6.6,1.5,6.2);
      g.fillStyle='#46332b';g.fillRect(hx-2,hy-3.3,4.1,1);
      g.strokeStyle='#e3cd91';g.lineWidth=1;
      g.beginPath();g.moveTo(hx+.8,hy-6.6);g.lineTo(hx+1.8,hy-8);g.lineTo(hx+3,hy-7.8);g.stroke();
      g.fillStyle='#f0d0a5';g.fillRect(hx-1.6,hy-1.1,3.2,1.8);
    }
  }
  var h=cx+sd*1.3/turn+C.HEADX;
  g.fillStyle=C.FA.back?'#795342':'#d7ae87';
  g.beginPath();g.ellipse(h,by-22,2.8,3,0,0,Math.PI*2);g.fill();
  if(!C.FA.back){
    g.fillStyle='#f0d0a5';g.fillRect(h-.8,by-23,2.6,2.3);
    g.fillStyle='#46332b';g.fillRect(h-1.7,by-20.3,3.5,1.2);
    g.fillStyle='#343434';g.fillRect(h+.5,by-22.6,1, .8);
  }
  // Shallow fur crown and short ear flaps, leaving cheeks unobstructed.
  g.fillStyle=col;g.fillRect(h-3.3,by-26,6.4,2.8);
  g.fillRect(h-3.8,by-24,1.6,2.3);
  if(C.FA.back)g.fillRect(h+2.2,by-24,1.5,2.3);
  g.fillStyle=shade(col,1.3);g.fillRect(h-2.5,by-26.3,4.1,1.1);
  g.restore();
}

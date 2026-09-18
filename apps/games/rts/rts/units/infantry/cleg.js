// Chrono Legionnaire: sealed heavy suit, backpack and a two-handed emitter.
function drawCleg(C) {
  var g=C.g,cx=C.cx,by=C.by,sd=C.sd,turn=C.TURN,gt=C.gt,col=C.col;
  var aiming=C.state==='fire'||C.state==='fireprone';
  var aim=aiming?C.raise*2.2:0;
  var order=gt.sw?[-gt.sw,gt.sw]:[-1,1];
  for(var n=0;n<2;n++){
    var i=order[n],lead=gt.sw?(i===gt.sw?1:-1):0;
    var hx=cx+i*2.7, kx=cx+i*3.4+(lead?lead*2.1: i*.7)*sd/turn;
    var fx=kx+(lead?lead*1.1:i*.4),lift=lead<0?2:0;
    g.lineCap='round';g.lineJoin='round';g.strokeStyle='#3d495c';g.lineWidth=5.1;
    g.beginPath();g.moveTo(hx,by-12.5);g.lineTo(kx,by-7-lift);g.lineTo(fx,by-2.4-lift);g.stroke();
    g.strokeStyle=lead<0?'#999999':'#d0d0d0';g.lineWidth=3.5;
    g.beginPath();g.moveTo(hx-.4,by-11.5);g.lineTo(kx-.4,by-8-lift);g.stroke();
    g.beginPath();g.moveTo(kx-.4,by-5.8-lift);g.lineTo(fx-.4,by-2.7-lift);g.stroke();
    g.fillStyle='#626262';g.fillRect(kx-2,by-7.9-lift,4,2);
    g.fillStyle='#252f44';g.fillRect(fx-2.4,by-2.4-lift,5.2,2.5);
    g.fillStyle='#999999';g.fillRect(fx-1.7,by-2.4-lift,3.5,1);
  }
  g.save();g.translate(gt.lean,gt.bob);
  // Power pack stands behind the shoulders, rather than becoming chest paint.
  var px=cx-(2.4+sd*2.4)/turn;
  g.fillStyle='#465674';g.fillRect(px-4.3,by-22.1,8.6,10.2);
  g.fillStyle='#999999';g.fillRect(px-4.3,by-21.6,2.5,8.8);
  g.fillStyle=col;g.fillRect(px-3.8,by-20,1.6,6.8);
  g.fillStyle='#3d495c';g.fillRect(cx-5.2,by-14,10.4,2.7);
  g.fillStyle='#d0d0d0';
  g.beginPath();g.moveTo(cx-6.1,by-21.3);g.lineTo(cx+6.1,by-21.3);
  g.lineTo(cx+5.1,by-13.6);g.lineTo(cx-5.1,by-13.6);g.closePath();g.fill();
  g.fillStyle='#f2eee3';g.fillRect(cx-4.7,by-20.4,3.7,5.6);
  g.fillStyle='#999999';g.fillRect(cx+3.4,by-19.5,2,5.4);
  g.fillStyle=col;g.fillRect(cx-4.1,by-20.7,1.8,6.7);
  g.fillRect(cx-3.2,by-21.2,6.4,1.7);
  // Arms connect the shoulder shells to both grips of the rifle.
  for(var a=-1;a<=1;a+=2){
    var sx=cx+a*6,ex=cx+a*6.6,hand=cx+(a<0?-1.7:4.9)/turn;
    g.strokeStyle='#626262';g.lineWidth=4.3;g.lineCap='round';
    g.beginPath();g.moveTo(sx,by-19.6);g.lineTo(ex,by-16.1-aim*.5);g.lineTo(hand,by-15.2-aim);g.stroke();
    g.strokeStyle='#d0d0d0';g.lineWidth=2.8;
    g.beginPath();g.moveTo(sx-.4,by-19.5);g.lineTo(ex-.4,by-16.3-aim*.5);g.lineTo(hand,by-15.4-aim);g.stroke();
    g.fillStyle='#f2eee3';g.fillRect(sx-2.3,by-21,4.6,3);
  }
  var ry=by-16.7-aim,wl=(1-.2*sd)/turn;
  g.fillStyle='#252f44';g.fillRect(cx-3.1*wl,ry,11*wl,3.1);
  g.fillStyle='#798ba3';g.fillRect(cx-2.5*wl,ry,9.8*wl,1);
  g.fillStyle='#343434';g.fillRect(cx+6.7*wl,ry+.3,5*wl,2);
  g.fillStyle='#58949d';g.fillRect(cx+5.6*wl,ry-.8,2.1*wl,4.1);
  g.fillStyle='#99dce1';g.fillRect(cx+5.7*wl,ry-.6,.9*wl,3.7);
  g.fillStyle='#d0d0d0';g.fillRect(cx+10.7*wl,ry-.5,1.5*wl,3.5);
  g.fillStyle='#343434';g.fillRect(cx-1.9*wl,ry+2,2.1,2);g.fillRect(cx+3.8*wl,ry+2,2.1,2);
  var h=cx+sd*1.2/turn+C.HEADX;
  g.fillStyle='#626262';g.fillRect(h-3.5,by-22,7,2.2);
  g.fillStyle='#d0d0d0';g.beginPath();g.ellipse(h,by-23.2,3.4,3.5,0,0,Math.PI*2);g.fill();
  g.fillStyle='#f2eee3';g.fillRect(h-1.9,by-25.6,3,1.8);
  if(!C.FA.back){
    g.fillStyle='#252f44';g.fillRect(h-2+sd,by-23.5,4.5,2.1);
    g.fillStyle='#65748a';g.fillRect(h-1.6+sd,by-23.4,1.8,.8);
    g.strokeStyle='#626262';g.lineWidth=1.4;
    g.beginPath();g.moveTo(h+2.1,by-21.9);g.lineTo(h+3.9,by-20);g.lineTo(h+3.5,by-18.4);g.stroke();
  }
  if(C.FA.back){
    g.fillStyle='#999999';g.fillRect(cx-4.6,by-20.5,8.3,7.7);
    g.fillStyle='#d0d0d0';g.fillRect(cx-4.4,by-20.2,2.5,7);
    g.fillStyle=col;g.fillRect(cx-1.2,by-20.3,1.8,7.2);
  }
  g.restore();
}

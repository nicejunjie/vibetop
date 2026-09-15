// Iron Frontier — Yuri: bald head, narrow coloured shoulder yoke,
// long grey tunic and dark boots. No combat vest or glowing idle ornaments.
function drawYuri(C) {
  var g=C.g,cx=C.cx,by=C.by,gt=C.gt,sd=C.sd,turn=C.TURN,col=C.col;
  var back=C.FA.back,fire=C.state==='fire',head=cx+sd*.9/turn+C.HEADX;
  function poly(p,c) {
    g.fillStyle=c;g.beginPath();g.moveTo(p[0][0],p[0][1]);
    for(var n=1;n<p.length;n++)g.lineTo(p[n][0],p[n][1]);
    g.closePath();g.fill();
  }
  function line(p,c,w) {
    g.strokeStyle=c;g.lineWidth=w;g.lineCap='round';g.lineJoin='round';
    g.beginPath();g.moveTo(p[0][0],p[0][1]);
    for(var n=1;n<p.length;n++)g.lineTo(p[n][0],p[n][1]);
    g.stroke();
  }
  function ramp(x,y,w,h,a,b,c) {
    var q=g.createLinearGradient(x,y,x+w,y+h);
    q.addColorStop(0,a);q.addColorStop(.45,b);q.addColorStop(1,c);return q;
  }
  var order=gt.sw?[-gt.sw,gt.sw]:[-1,1];
  for(var n=0;n<2;n++){
    var i=order[n],lead=gt.sw?(i===gt.sw?1:-1):0,lat=1-.38*sd;
    var hx=cx+i*1.8*lat;
    var kx=cx+i*(lead>0?3.2:lead<0?1.1:2.1)*lat+
      (lead>0?1.8:lead<0?-1.3:0)*sd/turn;
    var fx=kx+(lead>0?.75:lead<0?-.5:i*.25)/turn;
    var lift=lead<0?1.8:0;
    line([[hx,by-11.0],[kx,by-5.8-lift],[fx,by-2.0-lift]],'#292c2d',3.2);
    line([[kx-.55,by-5.8-lift],[fx-.55,by-2.2-lift]],'#666963',.85);
    poly([[fx-1.45,by-3.2-lift],[fx+1.3,by-3.2-lift],
      [fx+1.65,by-1.4-lift],[fx+2.1,by-.6-lift],[fx+1.6,by-.1-lift],
      [fx-1.85,by-.1-lift],[fx-1.85,by-1.1-lift]],'#161b1c');
    line([[fx-1.2,by-1.65-lift],[fx+.8,by-1.55-lift]],'#606660',.7);
  }
  g.save();g.translate(gt.lean,gt.bob);
  function arm(i){
    var sx=cx+i*3.9,ex=cx+i*(fire?6.0:4.9),ey=by-(fire?22.0:15.7);
    var hand=fire?[head+i*2.65,by-23.3]:
      [cx+i*4.8+(gt.sw? -i*gt.sw*1.1*sd/turn:0),by-12.0];
    line([[sx,by-19.7],[ex,ey],hand],'#4a4b45',3.05);
    line([[sx-.3,by-19.7],[ex-.3,ey],[hand[0]-.3,hand[1]-.8]],
      i<0?'#aaa99a':'#777b71',1.9);
    g.fillStyle='#c09b7a';g.beginPath();
    g.ellipse(hand[0],hand[1],.95,1.1,0,0,6.29);g.fill();
  }
  var near=back?1:-1;arm(-near);
  // A continuous knee-length garment. Two lower panels open over the stride.
  var tail=gt.swf*.7;
  g.fillStyle=ramp(cx-4.1,by-20.5,8.2,13.8,'#b9b7a6','#898b7e','#484f48');
  g.beginPath();g.moveTo(cx-3.1,by-20.7);
  g.quadraticCurveTo(cx-4.4,by-20.0,cx-3.7,by-16.0);
  g.lineTo(cx-3.3,by-13.0);g.lineTo(cx-4.1+tail,by-6.6);
  g.lineTo(cx-1.0+tail,by-6.4);g.lineTo(cx,by-9.4);
  g.lineTo(cx+1.1+tail,by-6.5);g.lineTo(cx+4.0+tail,by-6.9);
  g.lineTo(cx+3.2,by-13.0);g.lineTo(cx+3.8,by-18.8);
  g.quadraticCurveTo(cx+4.1,by-20.0,cx+2.9,by-20.7);g.closePath();g.fill();
  line([[cx-2.3,by-14.0],[cx-2.7+tail,by-7.5]],'#b8b5a1',.7);
  line([[cx+2.2,by-14.0],[cx+2.7+tail,by-7.7]],'#565e54',.8);
  // Separate coloured hem corners leave the coat opening and boots visible.
  line([[cx-3.9+tail,by-7.0],[cx-1.8+tail,by-6.8]],shade(col,.78),.85);
  line([[cx+1.8+tail,by-6.9],[cx+3.8+tail,by-7.2]],shade(col,.62),.85);
  if(!back) {
    line([[cx+.2,by-19.8],[cx+.2,by-10.1]],'#4d554b',.8);
    for(var button=0;button<3;button++){
      g.fillStyle='#c3beaa';g.fillRect(cx-.4,by-18.0+button*2,.65,.65);
    }
  }
  line([[cx-3.2,by-12.6],[cx+3.1,by-12.6]],'#4d4e3e',1.0);
  // Shoulder colour frames the neck; it does not fill the chest like a vest.
  for(var s=-1;s<=1;s+=2){
    poly([[cx+s*.9,by-21.4],[cx+s*3.6,by-21.0],
      [cx+s*4.7,by-19.2],[cx+s*3.2,by-18.6],[cx+s*1.25,by-20.0]],
      shade(col,s<0?1.0:.66));
    line([[cx+s*1.25,by-20.2],[cx+s*2.15,by-17.6]],shade(col,.83),1.05);
  }
  arm(near);
  // Low dark standing collar leaves neck and skull exposed.
  poly([[cx-2.0,by-22.0],[cx+2.0,by-22.0],[cx+2.5,by-20.2],
    [cx,by-19.5],[cx-2.5,by-20.2]],'#343a36');
  g.fillStyle='#a48063';g.fillRect(head-1.05,by-22.4,2.1,1.65);
  g.fillStyle=ramp(head-2.3,by-26.3,4.6,5.0,'#e3c6a0','#c49d79','#89684f');
  g.beginPath();g.ellipse(head,by-24.0,2.25,2.8,0,0,6.29);g.fill();
  if(!back){
    var faceX=head+sd*.45/turn;
    line([[faceX-1.45,by-24.4],[faceX-.45,by-24.5]],'#594031',.6);
    if(sd<.8)line([[faceX+.5,by-24.5],[faceX+1.4,by-24.3]],'#594031',.6);
    poly([[faceX-.8,by-22.4],[faceX+.95,by-22.4],
      [faceX+.55,by-21.2],[faceX-.35,by-21.0]],'#46332b');
    line([[faceX+.1,by-24],[faceX+.5,by-23.1]],'#e2bc93',.55);
  }
  // Psychic gesture only during attack; the idle silhouette stays clean.
  if(fire){
    for(var h=-1;h<=1;h+=2){
      g.fillStyle='#ccb7e8';g.beginPath();
      g.ellipse(head+h*2.85,by-23.3,.6,.6,0,0,6.29);g.fill();
    }
  }
  g.restore();
}

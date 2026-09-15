// Iron Frontier — vehicles/chronominer: Allied Chrono Miner art.

function drawChronominer(C) {
  var BIN=C.BIN,BIN_E=C.BIN_E,PEDGE=C.PEDGE,a=C.a,by=C.by,chassis=C.chassis,
      cx=C.cx,dig=C.dig,fx=C.fx,fy=C.fy,g=C.g,i2=C.i2,len=C.len,
      panel=C.panel,plit=C.plit,prism=C.prism,puck=C.puck,px=C.px,py=C.py,sg=C.sg,
      trackRun=C.trackRun,wid=C.wid;

  // Rear tracked carrier: gold ore box at the rear, one blue
  // transition wedge, and a hemispherical glazed cab at the front.
  var off=wid*0.31,runCx=cx-fx*4.4,runCy=by+1.4-fy*4.4;
  for(sg=-1;sg<=1;sg+=2)
    trackRun(runCx+px*off*sg,runCy+py*off*sg,len*0.82,wid*0.22,4.8,'#999999',
      {top:'#3a3a3a',side:'#242424',dark:'#151515',wheelCount:4,endSprockets:false,projectedWheels:true});
  chassis(cx-fx*2.7,by-1.0-fy*2.7,len*0.92,wid*0.62,3.0,'#343434','#151515',1.4);
  for(sg=-1;sg<=1;sg+=2)
    isoBox(g,cx-fx*2.4+px*wid*0.30*sg,by-2.0-fy*2.4+py*wid*0.30*sg,
      len*0.62,1.25,2.0,a,panel,PEDGE);

  function oreBox(){
    var bx=cx-fx*8.5,yy=by-1.2-fy*8.5;
    var ln=11.5,wd=11.4,h=9.3,hl=ln*0.5,hw=wd*0.5,binCol='#95834f';
    // The cargo body narrows at its lower forward end, leaving space over
    // the chassis. The upper rim stays broad and carries the full volume.
    var upperPlan=[[hl,hw],[hl,-hw],[-hl,-hw],[-hl,hw]];
    var lowerPlan=[[hl-3.6,hw-1.8],[hl-3.6,-hw+1.8],[-hl,-hw+.5],[-hl,hw-.5]];
    var upper=upperPlan.map(function(p){return [bx+fx*p[0]+px*p[1],yy+fy*p[0]+py*p[1]-h];});
    var lower=lowerPlan.map(function(p){return [bx+fx*p[0]+px*p[1],yy+fy*p[0]+py*p[1]];});
    var order=[0,1,2,3].sort(function(i,j){return lower[i][1]+lower[(i+1)%4][1]-lower[j][1]-lower[(j+1)%4][1];});
    order.forEach(function(i){
      var j=(i+1)%4;
      var nx=(upperPlan[i][0]+upperPlan[j][0])/2;
      var nv=(upperPlan[i][1]+upperPlan[j][1])/2;
      var lighting=.82-.20*(fx*nx+px*nv)/Math.hypot(nx,nv);
      g.fillStyle=shade(binCol,lighting);
      g.beginPath();g.moveTo(lower[i][0],lower[i][1]);g.lineTo(lower[j][0],lower[j][1]);
      g.lineTo(upper[j][0],upper[j][1]);g.lineTo(upper[i][0],upper[i][1]);g.closePath();g.fill();
    });
    // Broad pressed metal walls, not Soviet-style reinforcing ribs.
    for(var face=0;face<4;face++){
      var p0=lower[face],p1=lower[(face+1)%4];
      if((p0[1]+p1[1])*0.5<=yy+0.1)continue;
      // One broad pressed side plate, rather than Soviet-style vertical ribs.
      var u0=upper[face],u1=upper[(face+1)%4];
      var pu=(upperPlan[face][0]+upperPlan[(face+1)%4][0])/2;
      var pv=(upperPlan[face][1]+upperPlan[(face+1)%4][1])/2;
      var plateLight=.82-.20*(fx*pu+px*pv)/Math.hypot(pu,pv);
      g.fillStyle=shade(binCol,plateLight*.92);g.beginPath();
      g.moveTo(p0[0]*.85+p1[0]*.15,p0[1]*.85+p1[1]*.15-1.0);
      g.lineTo(p0[0]*.15+p1[0]*.85,p0[1]*.15+p1[1]*.85-1.0);
      g.lineTo(u0[0]*.15+u1[0]*.85,u0[1]*.15+u1[1]*.85+1.5);
      g.lineTo(u0[0]*.85+u1[0]*.15,u0[1]*.85+u1[1]*.15+1.5);
      g.closePath();g.fill();
      g.strokeStyle='#b5a16b';g.lineWidth=1.0;
      g.beginPath();g.moveTo(upper[face][0],upper[face][1]+1.0);
      g.lineTo(upper[(face+1)%4][0],upper[(face+1)%4][1]+1.0);g.stroke();
    }
    g.fillStyle=binCol;g.beginPath();
    upper.forEach(function(p,i){if(i)g.lineTo(p[0],p[1]);else g.moveTo(p[0],p[1]);});
    g.closePath();g.fill();
    isoBox(g,bx,yy-h-0.1,9.6,9.1,0.7,a,'#655a35',BIN_E);
    // Low longitudinal raised channels terminate at the rear crossbar.
    // They share the lid plane and remain shallow, unlike the Soviet ribs.
    for(var channel=-1;channel<=1;channel++)
      isoBox(g,bx+fx*.4+px*channel*2.7,yy-h-.7+fy*.4+py*channel*2.7,
        8.4,.8,.45,a,'#a08d53','#55482d');
    for(var side=-1;side<=1;side+=2)
      isoBox(g,bx+px*5.2*side,yy-h+0.2+py*5.2*side,
        11.5,1.0,0.9,a,'#948050','#3b3424');
    isoBox(g,bx-fx*5.0,yy-h+0.3-fy*5.0,1.1,9.5,0.8,a,'#948050','#3b3424');
    // The reference has a single transverse raised bar, not two antennae.
    isoBox(g,bx-fx*4.4,yy-h-fy*4.4,1.6,8.8,1.8,a,'#444444','#242424');
  }

  function chronoHead(){
    var mx=cx+fx*2.0,my=by-3.2+fy*2.0;
    // A closed wedge with a genuinely sloping roof. All faces use the same
    // four top vertices; no flat box remains behind the sloping side panels.
    var plan=[[-4.8,-3.9],[-4.8,3.9],[4.0,4.8],[4.0,-4.8]];
    var bottom=plan.map(function(p){return [mx+fx*p[0]+px*p[1],my+fy*p[0]+py*p[1]];});
    var top=bottom.map(function(p,i){return [p[0],p[1]-(i<2?4.3:6.8)];});
    function wedgeFace(points,col){
      g.fillStyle=col;g.beginPath();g.moveTo(points[0][0],points[0][1]);
      for(var j=1;j<points.length;j++)g.lineTo(points[j][0],points[j][1]);
      g.closePath();g.fill();
    }
    var walls=[0,1,2,3].sort(function(i,j){
      return bottom[i][1]+bottom[(i+1)%4][1]-bottom[j][1]-bottom[(j+1)%4][1];
    });
    walls.forEach(function(i){
      var j=(i+1)%4;
      wedgeFace([bottom[i],bottom[j],top[j],top[i]],shade(panel,i===1?1.1:0.78));
    });
    wedgeFace(top,'#303030');
    [0.3,0.62].forEach(function(t){
      var left=[top[0][0]+(top[3][0]-top[0][0])*t,top[0][1]+(top[3][1]-top[0][1])*t];
      var right=[top[1][0]+(top[2][0]-top[1][0])*t,top[1][1]+(top[2][1]-top[1][1])*t];
      g.strokeStyle='#565656';g.lineWidth=0.65;
      g.beginPath();g.moveTo(left[0],left[1]);g.lineTo(right[0],right[1]);g.stroke();
    });
    // Painted shoulders border the dark inclined engine cover.
    [1,3].forEach(function(i){
      var j=(i+1)%4;
      g.strokeStyle=plit;g.lineWidth=1.25;g.lineCap='butt';
      g.beginPath();g.moveTo(top[i][0],top[i][1]);g.lineTo(top[j][0],top[j][1]);g.stroke();
    });
    if(fy<0)miningFingers();
    var nx=cx+fx*9.2,ny=by-2.0+fy*9.2;
    function cabSupport(side){
      var sx=cx+fx*5.3+px*5.9*side,sy=by-2.0+fy*5.3+py*5.9*side;
      isoBox(g,sx,sy,1.8,1.8,6.6,a,'#888888','#353535');
      puck(sx,sy-6.6,1.2,.7,'#aaaaaa','#dddddd','#555555');
    }
    cabSupport(py>=0?-1:1);
    // Cab saddle joins the lower chassis and supports the fixed glazing.
    isoBox(g,cx+fx*7.0,by-1.2+fy*7.0,7.0,7.4,1.5,a,'#555555','#242424');
    // Fixed hemispherical glazed cab. Sample one continuous curved surface
    // and sort its panels by ground depth, so every bearing has the same dome.
    puck(nx,ny+1.2,7.0,1.2,'#494949','#777777','#222222');
    function cabCheek(side){
      // Low side cradles climb behind the glass and taper toward the teeth.
      var profile=[[-3.3,0.2],[4.4,0.2],[4.0,1.8],[-2.5,4.2],[-3.3,3.8]];
      var points=profile.map(function(p){
        return [nx+fx*p[0]+px*5.8*side,ny+fy*p[0]+py*5.8*side-p[1]];
      });
      wedgeFace(points,'#999999');
      g.strokeStyle='#cccccc';g.lineWidth=0.8;g.lineCap='butt';
      g.beginPath();g.moveTo(points[2][0],points[2][1]);
      g.lineTo(points[3][0],points[3][1]);g.lineTo(points[4][0],points[4][1]);g.stroke();
    }
    cabCheek(py>=0?-1:1);
    function domePoint(theta,lat){
      var u=7.0*Math.cos(lat)*Math.cos(theta),v=7.0*Math.cos(lat)*Math.sin(theta);
      var z=7.0*Math.sin(lat);
      return {x:nx+fx*u+px*v,y:ny+fy*u+py*v-z,depth:2*(fy*u+py*v)+0.5*z};
    }
    var glass=[];
    for(var band=0;band<6;band++)for(var seg=0;seg<24;seg++){
      var theta=seg*Math.PI/12,lat=band*Math.PI/12;
      var pts=[domePoint(theta,lat),domePoint(theta+Math.PI/12,lat),
        domePoint(theta+Math.PI/12,lat+Math.PI/12),domePoint(theta,lat+Math.PI/12)];
      var mid=domePoint(theta+Math.PI/24,lat+Math.PI/24);
      // A dark pane with broad curved sky reflections, not diffuse metal
      // shading. Reflection coordinates follow the surface normal.
      var normalX=(mid.x-nx)/7.0,normalZ=Math.sin(lat+Math.PI/24);
      var sky=Math.exp(-Math.pow((normalZ-0.73)/0.17,2)) *
        Math.exp(-Math.pow((normalX+0.28)/0.52,2));
      var glimmer=Math.exp(-Math.pow((normalX+0.58)/0.16,2)-Math.pow((normalZ-0.44)/0.3,2));
      glass.push({pts:pts,depth:mid.depth,light:0.10+0.15*normalZ+0.67*sky+0.45*glimmer});
    }
    glass.sort(function(a,b){return a.depth-b.depth;});
    glass.forEach(function(f){
      var colors=['#161622','#292938','#444466','#777799','#aaaacc'];
      g.fillStyle=colors[Math.min(4,Math.floor(f.light*5))];
      g.beginPath();f.pts.forEach(function(p,i){if(i)g.lineTo(p.x,p.y);else g.moveTo(p.x,p.y);});
      g.closePath();g.fill();
    });
    // Rear transverse arch follows the glass surface; the large front pane
    // stays uninterrupted. Narrow reflected sky strips sit inside the pane.
    function cabArc(u,col,width){
      var radius=Math.sqrt(1-u*u/(7.0*7.0));
      g.strokeStyle=col;g.lineWidth=width;g.lineCap='round';g.beginPath();
      for(var step=0;step<=24;step++){
        var t=step*Math.PI/24,v=7.0*radius*Math.cos(t),z=7.0*radius*Math.sin(t);
        var x=nx+fx*u+px*v,y=ny+fy*u+py*v-z;
        if(step)g.lineTo(x,y);else g.moveTo(x,y);
      }
      g.stroke();
    }
    cabArc(-2.7,'#363636',2.3);
    cabArc(-2.7,'#bcbcbc',1.35);
    cabCheek(py>=0?1:-1);
    cabSupport(py>=0?1:-1);
    // The scoop fingers extend forward from the cab's lower cradle. The cab
    // stays fixed; only the fingers lower and reach out during harvesting.
    function miningFingers(){
    var tooth=dig?5.2:3.8,toothBase=dig?1.2:0.0;
    for(i2=-2;i2<=2;i2++){
      var tx=cx+fx*13.2+px*i2*2.5,ty=by-2.0+fy*13.2+py*i2*2.5;
      var ex=tx+fx*tooth,ey=by+toothBase+fy*(13.2+tooth)+py*i2*2.5;
      g.strokeStyle='#303030';g.lineWidth=2.3;g.lineCap='butt';
      g.beginPath();g.moveTo(tx,ty);g.lineTo(ex,ey);g.stroke();
      g.strokeStyle='#d7d7d7';g.lineWidth=1.35;
      g.beginPath();g.moveTo(tx,ty-0.6);g.lineTo(ex,ey-0.6);g.stroke();
    }
    }
    if(fy>=0)miningFingers();
  }
  if(fy>0){oreBox();chronoHead();}else{chronoHead();oreBox();}
}

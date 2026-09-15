// Iron Frontier — vehicles/warminer: Soviet War Miner art.

function drawWarminer(C) {
  var BIN=C.BIN,BIN_E=C.BIN_E,PEDGE=C.PEDGE,a=C.a,barrel=C.barrel,by=C.by,
      chassis=C.chassis,cx=C.cx,dig=C.dig,fx=C.fx,fy=C.fy,g=C.g,
      hull=C.hull,i2=C.i2,len=C.len,panel=C.panel,pdark=C.pdark,plit=C.plit,
      prism=C.prism,puck=C.puck,px=C.px,py=C.py,sg=C.sg,trackRun=C.trackRun,wid=C.wid;

  // Rear tracked hopper, small red gun mount and a sloping ore intake.
  var off=wid*0.32,runCx=cx-fx*4.8,runCy=by+1.6-fy*4.8;
  for(sg=-1;sg<=1;sg+=2)
    trackRun(runCx+px*off*sg,runCy+py*off*sg,len*0.80,wid*0.26,6.2,'#999999',
      {top:'#3a3a3a',side:'#242424',dark:'#151515',wheelCount:5,endSprockets:false,projectedWheels:true});
  chassis(cx-fx*3.2,by-1.1-fy*3.2,len*0.86,wid*0.64,5.0,shade(hull,0.78),'#181818',1.0);
  for(sg=-1;sg<=1;sg+=2)
    isoBox(g,cx-fx*3.0+px*wid*0.31*sg,by-2.2-fy*3.0+py*wid*0.31*sg,
      len*0.61,1.35,2.5,a,panel,PEDGE);

  function oreBox(){
    var bx=cx-fx*7.0,yy=by-4.2-fy*7.0,hopperH=10.6;
    // Chamfered metal shell: broad recessed panels sit between substantial
    // corner posts. The corners are geometry, not outlines on a square box.
    var hl=8.0,hw=7.1,cut=1.0;
    var plan=[[hl-cut,hw],[-hl+cut,hw],[-hl,hw-cut],[-hl,-hw+cut],
      [-hl+cut,-hw],[hl-cut,-hw],[hl,-hw+cut],[hl,hw-cut]];
    function wallPoint(p,q,t,z){
      var u=p[0]+(q[0]-p[0])*t,v=p[1]+(q[1]-p[1])*t;
      return [bx+fx*u+px*v,yy+fy*u+py*v-z];
    }
    function metalFace(points,col){
      g.fillStyle=col;g.beginPath();
      points.forEach(function(p,i){if(i)g.lineTo(p[0],p[1]);else g.moveTo(p[0],p[1]);});
      g.closePath();g.fill();
    }
    // Each wall receives light from the same upper-left source. The generic
    // prism shades both near walls alike, which erased the box's volume.
    plan.map(function(p,i){return i;}).sort(function(i,j){
      var p=plan[i],q=plan[(i+1)%8],r=plan[j],s=plan[(j+1)%8];
      return fy*(p[0]+q[0]-r[0]-s[0])+py*(p[1]+q[1]-r[1]-s[1]);
    }).forEach(function(i){
      var p=plan[i],q=plan[(i+1)%8],span=Math.hypot(q[0]-p[0],q[1]-p[1]);
      var light=.88-.30*(fx*(q[1]-p[1])-px*(q[0]-p[0]))/span;
      var points=[wallPoint(p,q,0,0),wallPoint(p,q,1,0),
        wallPoint(p,q,1,hopperH),wallPoint(p,q,0,hopperH)];
      var centreY=(points[0][1]+points[1][1])/2;
      var metal=g.createLinearGradient(0,centreY-hopperH,0,centreY);
      metal.addColorStop(0,shade('#a88e50',light*1.08));
      metal.addColorStop(.65,shade('#a88e50',light));
      metal.addColorStop(1,shade('#a88e50',light*.79));
      metalFace(points,metal);
    });
    for(var wall=0;wall<8;wall+=2){
      var p=plan[wall],q=plan[(wall+1)%8];
      if(fy*(p[0]+q[0])+py*(p[1]+q[1])<=0)continue;
      var edgeLength=Math.hypot(q[0]-p[0],q[1]-p[1]);
      var lighting=.88-.30*(fx*(q[1]-p[1])-px*(q[0]-p[0]))/edgeLength;
      // Actual standing ribs rather than bright rectangular panel outlines.
      // Side ribs line up with the transverse roof ribs at u=-5.2,0,5.2.
      var ribPositions=wall===0||wall===4?[1.8/14,.5,12.2/14]:[.10,.5,.90];
      var normalU=(p[0]+q[0])/2,normalV=(p[1]+q[1])/2;
      var normalLength=Math.hypot(normalU,normalV);
      var ox=(fx*normalU+px*normalV)/normalLength*.55;
      var oy=(fy*normalU+py*normalV)/normalLength*.55;
      ribPositions.forEach(function(t){
        var half=.48/edgeLength;
        var footL=wallPoint(p,q,t-half,.4),footR=wallPoint(p,q,t+half,.4);
        var topL=wallPoint(p,q,t-half,hopperH),topR=wallPoint(p,q,t+half,hopperH);
        var front=[footL,footR,topR,topL].map(function(v){return [v[0]+ox,v[1]+oy];});
        metalFace([footL,footR,topR,topL],shade('#5b4929',lighting));
        metalFace([footL,front[0],front[3],topL],shade('#d0b572',lighting));
        metalFace([footR,front[1],front[2],topR],shade('#6e542c',lighting));
        metalFace(front,shade('#bca365',lighting));
        metalFace([topL,topR,front[2],front[3]],'#c7ad6c');
      });
      // Continuous lower rail ties the posts into the carrier frame.
      metalFace([wallPoint(p,q,0,.4),wallPoint(p,q,1,.4),
        wallPoint(p,q,1,1.2),wallPoint(p,q,0,1.2)],shade('#ad9255',lighting));
    }
    // A broad plated roof closes the hopper. The RA2 vehicle carries a
    // massive ribbed box, not an open skip or a cage.
    var shoulder=plan.map(function(p){return [bx+fx*p[0]+px*p[1],yy+fy*p[0]+py*p[1]-hopperH];});
    var roof=plan.map(function(p){
      var u=p[0]*(hl-.8)/hl,v=p[1]*(hw-.8)/hw;
      return [bx+fx*u+px*v,yy+fy*u+py*v-hopperH-1.3];
    });
    for(var bevel=0;bevel<plan.length;bevel++){
      var next=(bevel+1)%plan.length;
      metalFace([shoulder[bevel],shoulder[next],roof[next],roof[bevel]],
        (shoulder[bevel][0]+shoulder[next][0])/2<bx?'#ac935b':'#766039');
    }
    metalFace(roof,'#756239');
    for(var roofRib=-1;roofRib<=1;roofRib++){
      var rx=bx+fx*roofRib*5.2,ry=yy-hopperH-1.3+fy*roofRib*5.2;
      isoBox(g,rx,ry,1.0,12.5,0.85,a,'#ad9356','#554326');
    }
    isoBox(g,bx-fx*7.5,yy-hopperH+1.0-fy*7.5,1.1,13.0,2.0,a,'#a68b51','#443820');
  }

  function armedHead(){
    var hx=cx+fx*2.8,hy=by-4.0+fy*2.8;
    // The silver mount spreads into the chassis below a separate raised
    // red gun housing. Its inclined walls must not read as another crate.
    var mountPlan=[[2.0,2.5],[2.0,-2.5],[-2.0,-2.5],[-2.0,2.5]];
    var mountBase=mountPlan.map(function(p){return [hx+fx*p[0]+px*p[1],hy+fy*p[0]+py*p[1]];});
    var mountTop=mountPlan.map(function(p){return [hx+fx*p[0]*0.80+px*p[1]*0.85,hy+fy*p[0]*0.80+py*p[1]*0.85-6.8];});
    [0,1,2,3].sort(function(i,j){return mountBase[i][1]+mountBase[(i+1)%4][1]-mountBase[j][1]-mountBase[(j+1)%4][1];}).forEach(function(i){
      var j=(i+1)%4;
      g.fillStyle=(mountBase[i][1]+mountBase[j][1])/2>hy?'#aaaaaa':'#666666';
      g.beginPath();g.moveTo(mountBase[i][0],mountBase[i][1]);
      g.lineTo(mountBase[j][0],mountBase[j][1]);g.lineTo(mountTop[j][0],mountTop[j][1]);
      g.lineTo(mountTop[i][0],mountTop[i][1]);g.closePath();g.fill();
    });
    // The reference shows a dark inset immediately below the gun on the
    // forward sloping face. Keep it distinct from the silver side supports.
    if(fy>0){
      var inset=[[1.83,-1.5,2.8],[1.83,1.5,2.8],[1.64,1.3,6.1],[1.64,-1.3,6.1]];
      g.fillStyle='#303030';g.beginPath();
      inset.forEach(function(p,i){
        var x=hx+fx*p[0]+px*p[1],y=hy+fy*p[0]+py*p[1]-p[2];
        if(i)g.lineTo(x,y);else g.moveTo(x,y);
      });
      g.closePath();g.fill();
      g.strokeStyle='#777777';g.lineWidth=.55;g.stroke();
    }
    var gx=hx+fx*0.2,gy=hy-6.8+fy*0.2;
    prism(gx,gy,[[2.8,-1.8],[2.8,1.8],[-1.9,2.8],[-2.8,1.9],[-2.8,-1.9],[-1.9,-2.8]],4.8,panel,PEDGE);
    isoBox(g,gx+fx*1.8,gy-2.5+fy*1.8,2.2,3.8,2.0,a,panel,PEDGE);
    var rootU=4.4,tipU=dig?19.0:18.0,rootY=by-8.0,tipY=dig?by+2.0:by+1.2;
    var r0x=cx+fx*rootU,r0y=rootY+fy*rootU,r1x=cx+fx*tipU,r1y=tipY+fy*tipU;
    function linkPoint(t,v,z){
      return [r0x+(r1x-r0x)*t+px*v,r0y+(r1y-r0y)*t+py*v-z];
    }
    function linkFace(points,col){
      g.fillStyle=col;g.beginPath();
      points.forEach(function(p,i){if(i)g.lineTo(p[0],p[1]);else g.moveTo(p[0],p[1]);});
      g.closePath();g.fill();
    }
    // An ore intake/conveyor interpretation: one continuous recessed path
    // rises from the ground scoop to the hopper throat. The source does not
    // resolve exact moving parts, so the belt and rollers remain schematic.
    var beltRoot=2.05,beltTip=1.65;
    function beltEdge(t,side,z){return linkPoint(t,side*(beltRoot+(beltTip-beltRoot)*t),z);}
    // Deep steel tray connects the scoop to the silver upper mount.
    linkFace([linkPoint(0,-3.2,-2.2),linkPoint(1,-2.7,-.8),
      linkPoint(1,2.7,-.8),linkPoint(0,3.2,-2.2)],'#555555');
    function conveyorGuard(side){
      var root=3.15*side,tip=2.65*side,innerRoot=2.08*side,innerTip=1.72*side;
      var outer=[linkPoint(0,root,0),linkPoint(1,tip,0),
        linkPoint(1,tip,-(1.0)),linkPoint(0,root,-(3.0))];
      var inner=[linkPoint(0,innerRoot,0),linkPoint(1,innerTip,0)];
      linkFace([outer[0],outer[1],outer[2],outer[3]],'#9a9a9a');
      linkFace([inner[0],inner[1],outer[1],outer[0]],'#d0d0d0');
      linkFace([outer[0],outer[1],linkPoint(1,tip,-.34),
        linkPoint(0,root,-.34)],'#bebebe');
      // Long upper fold identifies a load-bearing continuous guard.
      g.strokeStyle='#e3e3e3';g.lineWidth=.65;
      g.beginPath();g.moveTo(outer[0][0],outer[0][1]);
      g.lineTo(outer[1][0],outer[1][1]);g.stroke();
    }
    conveyorGuard(py>=0?-1:1);
    conveyorGuard(py>=0?1:-1);
    // Belt rides inside the tray. Draw it after the far guard, before the
    // near guard, otherwise the front became an uninterrupted white tongue.
    linkFace([beltEdge(.04,-1,-.55),beltEdge(.96,-1,-.55),
      beltEdge(.96,1,-.55),beltEdge(.04,1,-.55)],'#4f4f4f');
    linkFace([beltEdge(.08,-1,-.36),beltEdge(.92,-1,-.36),
      beltEdge(.92,1,-.36),beltEdge(.08,1,-.36)],'#555555');
    [.24,.44,.64,.84].forEach(function(t){
      linkFace([beltEdge(t,-1,-.24),beltEdge(t+.045,-1,-.24),
        beltEdge(t+.045,1,-.24),beltEdge(t,1,-.24)],'#888888');
    });
    // Transverse rollers show where the belt wraps at the two ends.
    [.08,.92].forEach(function(t){
      linkFace([linkPoint(t,-2.45,-.20),linkPoint(t+.07,-2.45,-.20),
        linkPoint(t+.07,2.45,-.20),linkPoint(t,2.45,-.20)],panel);
    });
    // A thin steel edge remains visible alongside the exposed tread.
    for(var beltSide=-1;beltSide<=1;beltSide+=2){
      g.strokeStyle='#bcbcbc';g.lineWidth=.6;
      var edge0=beltEdge(.06,beltSide,-.15),edge1=beltEdge(.94,beltSide,-.15);
      g.beginPath();g.moveTo(edge0[0],edge0[1]);g.lineTo(edge1[0],edge1[1]);g.stroke();
    }
    // Ground-level scoop is wider than the belt, with lips feeding the tray.
    prism(r1x,r1y,[[2.8,-3.6],[2.8,3.6],[-1.4,2.8],[-1.4,-2.8]],1.2,'#777777','#383838');
    isoBox(g,r1x+fx*2.4,r1y+fy*2.4,.75,7.2,.65,a,'#aaaaaa','#3b3b3b');
    for(var lip=-1;lip<=1;lip+=2)
      isoBox(g,r1x+px*3.25*lip,r1y+py*3.25*lip,3.4,.72,1.6,a,'#bbbbbb','#555555');
    linkFace([linkPoint(.94,-1.75,-.08),linkPoint(1,-1.65,-.08),
      linkPoint(1,1.65,-.08),linkPoint(.94,1.75,-.08)],panel);
    // The gun leaves the upper mantlet above the mining linkage. Render it
    // after the low forks so the barrel remains visible over their surface.
    barrel(gx+fx*2.1,gy-4.0+fy*2.1,5.5,1.4,1.05,'#292929');
  }
  if(fy>0){oreBox();armedHead();}else{armedHead();oreBox();}
}

// Iron Frontier — Giant Squid: a muscular mantle, head and tapered arms.
function drawSquid(C) {
  var g=C.g,L=C.L,W=C.W,FR=C.FR,P=C.P,near=C.nearS;
  function p(u,v,z){return P(u*L,v*W,FR+z);}
  function move(u,v,z){var q=p(u,v,z);g.moveTo(q[0],q[1]);}
  function curve(a,b,c){var x=p(a[0],a[1],a[2]),y=p(b[0],b[1],b[2]),z=p(c[0],c[1],c[2]);g.bezierCurveTo(x[0],x[1],y[0],y[1],z[0],z[1]);}
  function finish(fill,edge){g.closePath();g.fillStyle=fill;g.fill();if(edge){g.strokeStyle=edge;g.lineWidth=.65;g.stroke();}}
  // Six shorter arms and two long feeding tentacles leave one head crown.
  // Each is a filled taper, not several constant-width grey wire strokes.
  var arms=[[-1.05,1.20,.18],[-.72,1.88,.10],[-.43,1.35,.18],[-.14,1.15,.17],
            [.17,1.28,.18],[.46,1.40,.16],[.76,1.95,.10],[1.06,1.19,.17]];
  var order=arms.map(function(a,i){return i;});
  order.sort(function(a,b){return arms[a][0]*near-arms[b][0]*near;});
  for(var ai=0;ai<order.length;ai++){
    var id=order[ai],a=arms[id],v=a[0],reach=a[1],th=a[2];
    var rootV=v*.53,midV=v*1.20,tipV=v*.75+(id%2?.28:-.26);
    g.beginPath();move(.23,rootV-th,5.5);
    curve([.62,midV-th,6.9],[reach*.79,tipV-.22,4.1],[reach,tipV,3.0]);
    curve([reach-.12,tipV+.07,3.3],[reach*.73,tipV+.23,4.7],[.61,midV+th*.40,6.0]);
    curve([.45,rootV+th,5.9],[.33,rootV+th,5.9],[.23,rootV+th,5.5]);
    finish(id%2?'#7a929b':'#93a9ac','#344c58');
    g.strokeStyle='#a1b4b8';g.lineWidth=.45;g.beginPath();move(.31,rootV,6.1);
    curve([.48,midV,6.6],[.64,midV,5.9],[Math.min(reach-.25,.92),tipV,4.4]);g.stroke();
  }
  // Rear fins flare from the mantle rather than an oval pasted on its tip.
  for(var side=-1;side<=1;side+=2){
    g.beginPath();move(-.82,0,6.3);
    curve([-.75,side*.62,8.1],[-.56,side*1.75,7.2],[-.17,side*.69,6.4]);
    curve([-.34,side*.22,6.0],[-.60,side*.10,5.6],[-.82,0,6.3]);
    finish(side===near?'#8a9eaa':'#647c8b','#354e5c');
  }
  // Joined belly/back volume, tapering aft and narrowing into the arm crown.
  g.beginPath();move(-.83,0,6.2);
  curve([-.61,-.87,8.3],[-.02,-.93,9.1],[.34,-.47,6.1]);
  curve([.43,-.20,5.2],[.43,.20,5.0],[.33,.45,5.5]);
  curve([-.05,.86,3.8],[-.58,.71,4.0],[-.83,0,6.2]);
  finish('#859aa5','#2d4859');
  g.beginPath();move(-.74,-.03,7.0);
  curve([-.52,-.37,8.7],[-.06,-.45,9.1],[.20,-.30,7.2]);
  curve([.01,-.04,6.7],[-.44,.12,6.6],[-.74,-.03,7.0]);finish('#b0bdc2');
  g.beginPath();move(-.68,.18,5.8);
  curve([-.45,.57,4.9],[-.07,.65,4.4],[.27,.37,5.5]);
  curve([.01,.34,5.9],[-.39,.34,6.1],[-.68,.18,5.8]);finish('#526e80');
  // Narrow burgundy collar wrapping the head, not a giant painted eye.
  g.beginPath();move(.13,-.55,7.0);
  curve([.25,-.55,7.3],[.35,-.45,6.8],[.37,-.28,5.8]);
  curve([.35,.07,4.4],[.29,.47,4.4],[.19,.55,5.5]);
  curve([.15,.25,5.5],[.20,-.21,6.2],[.13,-.55,7.0]);finish('#613437','#34272e');
  g.beginPath();move(.30,-.35,6.2);
  curve([.44,-.50,6.4],[.56,-.26,6.1],[.58,0,5.6]);
  curve([.55,.37,4.2],[.39,.43,4.0],[.30,.31,4.7]);
  curve([.40,.03,5.2],[.38,-.18,5.7],[.30,-.35,6.2]);finish('#788e99','#344957');
  var eye=p(.43,near*.32,5.5);g.fillStyle='#172f3e';
  g.beginPath();g.ellipse(eye[0],eye[1],1.2,1,0,0,6.29);g.fill();
}

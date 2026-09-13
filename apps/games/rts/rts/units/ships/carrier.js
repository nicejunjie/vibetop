// Iron Frontier — ships/carrier: the art for one unit.
// Called by bakeShip() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.
//
// DRAWN BY CODEX (gpt-5.6-sol) FROM THE REFERENCE IMAGE, then corrected against
// a same-scale A/B of its bake beside RA2's own frame (tools/ra2-ab.js). The
// correction that mattered: the island moved FORWARD to x 15-28% of the hull where the reference puts it
// and where its silhouette peaks (43 px on a 58 px frame), the square deck
// marking aft came back, and the height came down from 67 to 59 against RA2's
// 58. Ours was a flat plate with a blue border stripe and white dots.
//
// Compact and comment-free on purpose; the measurements behind it are in the
// commit that installed it.

function drawCarrier(C){
  var FR=C.FR,HOUSE=C.HOUSE,HD=C.HD,L=C.L,P=C.P,W=C.W,box=C.box,g=C.g,nearS=C.nearS,plan=C.plan;
  function path(a,z,f,s,w){var i,q;g.beginPath();for(i=0;i<a.length;i++){q=P(a[i][0],a[i][1],z);i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]);}g.closePath();if(f){g.fillStyle=f;g.fill();}if(s){g.strokeStyle=s;g.lineWidth=w||1;g.stroke();}}
  var d=[],i,a,b;
  for(i=0;i<plan.length;i++)d.push([plan[i][0]*1.12,plan[i][1]*1.06]);
  path(d,FR+.5,'#333333');path(d,FR+2,'#666666','#999999',1);
  path([[-L*1.06,-W*.84],[-L*.58,-W*1.02],[L*.72,-W*1.02],[L,-W*.38],[L,W*.38],[L*.72,W*1.02],[-L*.58,W*1.02],[-L*1.06,W*.84]],FR+2.2,'#333333','#666666',1);
  box(-L*.22,0,L*.62,W*1.34,2.2,'#333333');
  path([[-L*.53,-W*.64],[L*.09,-W*.64],[L*.09,W*.64],[-L*.53,W*.64]],FR+4.5,HOUSE,HD,1.4);
  path([[L*.05,0],[-L*.08,W*.12],[-L*.18,W*.18],[-L*.43,W*.58],[-L*.53,W*.54],[-L*.31,W*.11],[-L*.50,W*.20],[-L*.54,0],[-L*.50,-W*.20],[-L*.31,-W*.11],[-L*.53,-W*.54],[-L*.43,-W*.58],[-L*.18,-W*.18],[-L*.08,-W*.12]],FR+4.9,'#999999','#666666',1.1);
  path([[L*.01,0],[-L*.11,W*.07],[-L*.47,W*.46],[-L*.34,W*.11],[-L*.49,0],[-L*.34,-W*.11],[-L*.47,-W*.46],[-L*.11,-W*.07]],FR+5.2,'#cccccc');
  path([[-L*.49,-W*.46],[-L*.36,-W*.13],[-L*.08,W*.13],[L*.01,W*.04]],FR+5.3,null,'#cccccc',1.2);
  path([[-L*.49,W*.46],[-L*.36,W*.13],[-L*.08,-W*.13],[L*.01,-W*.04]],FR+5.3,null,'#cccccc',1.2);
  path([[-L*.49,-W*.58],[L*.05,-W*.58],[L*.05,W*.58],[-L*.49,W*.58]],FR+4.7,null,'#333333',1.5);
  box(L*.43,nearS*W*.67,L*.30,W*.50,4.4,'#999999');
  box(L*.68,nearS*W*.71,L*.22,W*.40,3.5,'#666666');
  box(L*.52,nearS*W*.55,L*.42,W*.70,6.2,'#666666');
  box(L*.57,nearS*W*.57,L*.26,W*.60,9.2,HOUSE);
  box(L*.59,nearS*W*.56,L*.18,W*.44,11.4,HD);
  path([[L*.45,nearS*W*.79],[L*.68,nearS*W*.79],[L*.67,nearS*W*.36],[L*.49,nearS*W*.36]],FR+8.6,'#cccccc','#666666',1);
  a=P(L*.45,nearS*W*.83,FR+7);b=P(L*.68,nearS*W*.83,FR+7);g.strokeStyle='#333333';g.lineWidth=2;g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);g.stroke();
  a=P(L*.47,nearS*W*.84,FR+8);b=P(L*.66,nearS*W*.84,FR+8);g.strokeStyle='#cccccc';g.lineWidth=1;g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);g.stroke();
  var m=P(L*.57,nearS*W*.54,FR+10),t=P(L*.57,nearS*W*.54,FR+24);g.strokeStyle='#333333';g.lineWidth=2.2;g.beginPath();g.moveTo(m[0],m[1]);g.lineTo(t[0],t[1]);g.stroke();g.strokeStyle='#999999';g.lineWidth=1;g.beginPath();g.moveTo(t[0],t[1]);g.lineTo(m[0],m[1]-6);g.stroke();
  for(i=0;i<2;i++){g.strokeStyle=i?'#999999':'#cccccc';g.lineWidth=1.3;g.beginPath();g.moveTo(t[0]-3+i,t[1]+4+i*5);g.lineTo(t[0]+4-i,t[1]+4+i*5);g.stroke();}
  for(i=0;i<3;i++){var u=-L*(.72-i*.32),q=P(u,nearS*W*.78,FR+3);g.fillStyle='#cccccc';g.fillRect(q[0]-5,q[1]-1,10,2);g.fillRect(q[0]-1.5,q[1]-2,3,4);}
}

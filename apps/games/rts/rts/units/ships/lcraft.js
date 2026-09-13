// Iron Frontier — ships/lcraft: the art for one unit.
// Called by bakeShip() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.
//
// DRAWN BY CODEX (gpt-5.6-sol) FROM THE REFERENCE IMAGE, then corrected against
// a same-scale A/B of its bake beside RA2's own frame (tools/ra2-ab.js). The
// correction that mattered: it is a HOVERCRAFT, and the black rubber skirt wrapping its base is what says
// so. Ours drew a flat wide deck and no skirt at all, which is a barge. The
// reference frame is a near-overhead shot, so it was used for WHAT THE PARTS
// ARE — skirt, pale deck, ducted fans aft, bow ramp — and not for proportions.
//
// Compact and comment-free on purpose; the measurements behind it are in the
// commit that installed it.

function drawLcraft(C){
  var FR=C.FR,GLASS=C.GLASS,HD=C.HD,HOUSE=C.HOUSE,L=C.L,P=C.P,W=C.W,box=C.box,disc=C.disc,g=C.g,nearS=C.nearS,plan=C.plan,poly=C.poly;
  function path(a,f,s,w){g.beginPath();for(var i=0,q;i<a.length;i++){q=P(a[i][0],a[i][1],a[i][2]);i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]);}g.closePath();if(f){g.fillStyle=f;g.fill();}if(s){g.strokeStyle=s;g.lineWidth=w||.8;g.stroke();}}
  var i,e=[],sk=[],z=FR*.78,far=-nearS;
  for(i=0;i<plan.length;i++)sk.push([plan[i][0]*1.04,plan[i][1]*1.1]);
  for(i=0;i<sk.length;i++){var a=sk[i],b=sk[(i+1)%sk.length],q=P((a[0]+b[0])/2,(a[1]+b[1])/2,0);e.push([q[1],a,b]);}
  e.sort(function(a,b){return a[0]-b[0]});
  for(i=0;i<e.length;i++){a=e[i][1];b=e[i][2];path([[a[0],a[1],0],[b[0],b[1],0],[b[0],b[1],z],[a[0],a[1],z]],e[i][0]>P(0,0,0)[1]?'#000000':'#333333','#000000',1);}
  path(sk.map(function(p){return[p[0],p[1],z]}),'#333333','#000000',1.1);
  poly(FR+.15,'#cccccc','#666666');
  box(-L*.7,far*W*.43,L*.28,W*.36,5.8,'#666666');
  disc(-L*.7,far*W*.43,6,3.4,1.9,'#333333');disc(-L*.7,far*W*.43,6.1,2.1,1,'#999999');
  path([[L*.72,-W*.58,FR+.35],[L*.72,W*.58,FR+.35],[L*1.18,W*.46,.25],[L*1.18,-W*.46,.25]],'#cccccc','#333333',1);
  path([[L*.72,nearS*W*.58,FR+.35],[L*1.18,nearS*W*.46,.25],[L*1.18,nearS*W*.46,0],[L*.72,nearS*W*.58,z]],'#999999','#000000',1);
  box(-L*.39,far*W*.62,L*.3,W*.34,3.8,HD);
  box(-L*.1,far*W*.58,L*.34,W*.38,3.8,HOUSE);
  box(-L*.08,0,L*.38,W*.72,5.2,'#999999');
  box(-L*.04,0,L*.29,W*.58,7.1,'#cccccc');
  path([[L*.11,-W*.25,FR+6.7],[L*.11,W*.25,FR+6.7],[L*.11,W*.25,FR+4.6],[L*.11,-W*.25,FR+4.6]],GLASS,'#333333',.8);
  box(-L*.35,nearS*W*.61,L*.28,W*.36,4.1,HOUSE);
  box(-L*.02,nearS*W*.62,L*.3,W*.34,3.7,HD);
  box(-L*.7,nearS*W*.43,L*.28,W*.36,5.8,'#666666');
  disc(-L*.7,nearS*W*.43,6,3.4,1.9,'#333333');disc(-L*.7,nearS*W*.43,6.1,2.1,1,'#999999');
}

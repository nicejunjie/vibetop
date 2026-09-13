// Iron Frontier — ships/seascorp: the art for one unit.
// Called by bakeShip() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.
//
// DRAWN BY CODEX (gpt-5.6-sol) FROM THE REFERENCE IMAGE, then corrected against
// a same-scale A/B of its bake beside RA2's own frame (tools/ra2-ab.js). The
// correction that mattered: the flak gun IS this boat and ours did not have one — a white barrel angled
// up off a red mount, which is 6.9% red and 5.8% white in the reference and the
// only thing on her that reads at map size. The first pass overshot it badly,
// 53x56 against a 62x32 reference: the barrel alone was taller than the whole
// ship. It measures 62x34 now.
//
// Compact and comment-free on purpose; the measurements behind it are in the
// commit that installed it.

function drawSeascorp(C){
  var F=C.FR,G=C.GUN,GL=C.GUN_L,H=C.HD,R=C.HOUSE,L=C.L,P=C.P,S=C.STEEL,W=C.W,b=C.box,c=C.g,n=C.nearS;
  function q(a,f,s,w){var i,p;c.beginPath();for(i=0;i<a.length;i++){p=P(a[i][0],a[i][1],a[i][2]);i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]);}c.closePath();c.fillStyle=f;c.fill();if(s){c.strokeStyle=s;c.lineWidth=w||1;c.stroke();}}
  function x(a,z,f){q([[a[0],a[1],z],[a[2],a[3],z],[a[4],a[5],z],[a[6],a[7],z]],f,H,.7);}
  q([[-L*1.2,W*.68,F+.2],[-L*.76,W,F+.2],[L*.14,W,F+.2],[L*.72,W*.66,F+.2],[L*1.2,W*.22,F+.2],[L*1.2,-W*.22,F+.2],[L*.72,-W*.66,F+.2],[L*.14,-W,F+.2],[-L*.76,-W,F+.2],[-L*1.2,-W*.68,F+.2]],'#666666','#999999',.8);
  b(-L*.88,-n*W*.28,L*.22,W*.62,3.2,R);b(-L*.72,0,L*.18,W*.88,3.8,'#cccccc');
  b(L*.34,0,L*.46,W*.92,3.7,'#999999');b(L*.46,n*W*.16,L*.27,W*.66,5.5,'#cccccc');
  x([L*.31,n*W*.49,L*.57,n*W*.42,L*.55,-n*W*.18,L*.34,-n*W*.27],F+5.2,'#999999');
  b(L*.43,n*W*.55,L*.19,W*.42,2.5,R);b(-L*.25,0,L*.28,W*.92,2.1,'#999999');
  b(-L*.54,0,3.5,4.1,7.5,R);
  var a=P(-L*.47,0,F+7.2),d=P(L*.25,0,F+12.5),e=P(L*.19,0,F+11.8);
  c.lineCap='butt';c.strokeStyle=G;c.lineWidth=3.5;c.beginPath();c.moveTo(a[0],a[1]);c.lineTo(d[0],d[1]);c.stroke();c.strokeStyle='#cccccc';c.lineWidth=2.6;c.beginPath();c.moveTo(a[0],a[1]-.2);c.lineTo(d[0],d[1]-.2);c.stroke();c.strokeStyle=GL;c.lineWidth=1.5;c.beginPath();c.moveTo(e[0],e[1]);c.lineTo(d[0],d[1]);c.stroke();
  var m=P(-L*.51,n*W*.08,F+7.7);c.fillStyle=S;c.beginPath();c.arc(m[0],m[1],1.7,0,6.29);c.fill();
}

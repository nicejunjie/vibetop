// Iron Frontier — aircraft/kirov: the art for one unit.
// Called by bakeVehicle() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.
//
// DRAWN BY CODEX (gpt-5.6-sol) FROM THE REFERENCE IMAGE, chosen over two other
// bakes in a four-way comparison against RA2's own frame. It was the only one
// of the three that carried every feature the reference has: the shark-mouth
// nose art with amber teeth AND the dark eye patch above it, the longitudinal
// fabric ribbing, the structural bands drawn as ARCS that follow the hull
// instead of straight bars, a red engine car hung under each grey pylon, and a
// tail that is four flat cruciform fins and a propeller — no pods, no barrels.
//
// It is deliberately compact and comment-free; the reasoning behind each of
// those features, and the wrong turns that preceded them, is in the commits
// that led here rather than inline. The corrections it was given, in order:
// an airship is a blunt-nosed body of revolution and pointed at neither end; a
// band round a solid shows ONE arc and that arc has perspective; and nothing
// heavy hangs off the tail of a vehicle that flies by buoyancy.

function drawKirov(C){
var a=C.a,anim=C.anim,bodyPath=C.bodyPath,col=C.col,finQuad=C.finQuad,fy=C.fy,g=C.g,nx2=C.nx2,ny2=C.ny2,part=C.part,pt=C.pt,px=C.px,py=C.py,rad=C.rad,secK=C.secK,R=rad(0),far=py<0?1:-1,air=part!=='g'&&part!=='go',gon=part!=='h',P=function(t,s){var p=pt(t),e=rad(t)*secK*s;return[p[0]-nx2*e,p[1]-ny2*e]},path=function(v){g.beginPath();for(var i=0;i<v.length;i++)i?g.lineTo(v[i][0],v[i][1]):g.moveTo(v[i][0],v[i][1]);g.closePath()},ring=function(t,w,c){var p=pt(t),u=pt(t-.01),v=pt(t+.01),l=Math.hypot(v[0]-u[0],v[1]-u[1]),ax=(v[0]-u[0])/l,ay=(v[1]-u[1])/l,r=rad(t),z0=far>0?Math.PI/2:-Math.PI/2,A=[],B=[];for(var i=0;i<=32;i++){var z=z0+i*Math.PI/32,x=Math.cos(z),q=w*Math.abs(x)/2,X=p[0]+r*x*px,Y=p[1]+r*(x*py-Math.sin(z));A.push([X-ax*q,Y-ay*q]);B.unshift([X+ax*q,Y+ay*q])}path(A.concat(B));g.fillStyle=c;g.fill()},prop=function(){var p=pt(-1),z=anim==='prop'?Math.PI/4:0;g.fillStyle='#494949';g.beginPath();g.ellipse(p[0],p[1],2.6,2.1,0,0,7);g.fill();outline(g,'#181b20');g.strokeStyle='#d4d4d4';g.lineWidth=1.1;g.lineCap='round';for(var i=0;i<2;i++){var q=z+i*Math.PI/2,c=Math.cos(q)*4.8,s=Math.sin(q)*4.8;g.beginPath();g.moveTo(p[0]+c*px,p[1]+c*py-s);g.lineTo(p[0]-c*px,p[1]-c*py+s);g.stroke()}},car=function(t,k){var p=pt(t),r=rad(t),y=p[1]+r+5.1;g.strokeStyle='#6a6a6a';g.lineWidth=2.2;g.beginPath();g.moveTo(p[0],p[1]+r-.5);g.lineTo(p[0],y-1.5);g.stroke();isoBox(g,p[0],y,7,4.2,4.6,a,shade(col,k),shade(col,.34));g.fillStyle='#272b2d';g.fillRect(p[0]-2.2,y+2,4.4,1.2)},fin=function(d,x,k){finQuad(-.55,-.79,d[0],d[1],R*.84,R+x,shade(col,k),shade(col,.34))};
g.globalAlpha=air?1:0;
if(fy>0)prop();
fin([px*far,py*far],5.7,.66);
bodyPath();var c=pt(0),gr=g.createLinearGradient(c[0]+nx2*R*secK,c[1]+ny2*R*secK,c[0]-nx2*R*secK,c[1]-ny2*R*secK);gr.addColorStop(0,'#f4e7aa');gr.addColorStop(.2,'#e7d17c');gr.addColorStop(.55,'#c2a255');gr.addColorStop(.8,'#89703a');gr.addColorStop(1,'#49320f');g.fillStyle=gr;g.fill();g.strokeStyle='#38290f';g.lineWidth=1;g.stroke();
g.save();bodyPath();g.clip();
for(var j=-4;j<=4;j++)if(j){g.beginPath();for(var i=0;i<=34;i++){var t=-.98+i*1.96/34,p=P(t,j/5.1);i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1])}g.strokeStyle=j%2?'rgba(255,244,181,.38)':'rgba(91,68,26,.27)';g.lineWidth=.8;g.stroke()}
var hi=P(0,.66),hg=g.createLinearGradient(hi[0]-px*R,hi[1]-py*R,hi[0]+px*R,hi[1]+py*R);hg.addColorStop(0,'rgba(255,255,210,0)');hg.addColorStop(.46,'rgba(255,255,205,.48)');hg.addColorStop(.7,'rgba(255,220,100,.12)');hg.addColorStop(1,'rgba(255,255,210,0)');g.fillStyle=hg;bodyPath();g.fill();
ring(-.31,2.3,'#4f4f4f');ring(.11,2.5,'#585858');ring(.52,2.2,'#686868');ring(-.3,.75,'#b1ae89');ring(.12,.75,'#aaa886');ring(.53,.7,'#bbb998');
var rail=[];for(i=0;i<2;i++){g.beginPath();for(j=0;j<=16;j++){t=-.42+j*1.05/16;p=P(t,.87-i*.13);j?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1])}g.strokeStyle=i?'#555555':'#9b9a83';g.lineWidth=.8;g.stroke()}for(t=-.35;t<.63;t+=.18){var u=P(t,.86),v=P(t,.73);g.strokeStyle='#4c4c4c';g.beginPath();g.moveTo(u[0],u[1]);g.lineTo(v[0],v[1]);g.stroke()}
var mouth=[];for(i=0;i<=10;i++)mouth.push(P(.58+i*.42/10,.38));for(i=10;i>=0;i--)mouth.push(P(.58+i*.42/10,.94));path(mouth);g.fillStyle='#110e08';g.fill();g.fillStyle='#d88b1d';for(i=0;i<7;i++){var t0=.59+i*.057,t1=t0+.04;path([P(t0,.39),P(t1,.39),P((t0+t1)/2,.67)]);g.fill()}var e=P(.79,-.18);g.fillStyle='#17120a';g.beginPath();g.ellipse(e[0],e[1],2.7,1.7,0,0,7);g.fill();g.fillStyle='#d36a0a';g.beginPath();g.ellipse(e[0]-.35*nx2,e[1]-.35*ny2,.8,.55,0,0,7);g.fill();
g.strokeStyle='rgba(255,250,204,.72)';g.lineWidth=1;g.beginPath();for(i=0;i<=25;i++){t=-.94+i*1.86/25;p=P(t,.93);i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1])}g.stroke();g.restore();car(-.31,.82);car(.11,.95);car(.52,1.08);
g.globalAlpha=gon?1:0;var b=pt(.02),by=b[1]+rad(.02)*.88+3.6;if(gon&&!air){g.strokeStyle='#393528';g.lineWidth=.9;for(i=-1;i<=1;i+=2){g.beginPath();g.moveTo(b[0]+i*4.5,by-8);g.lineTo(b[0]+i*5.5,by);g.stroke()}}isoBox(g,b[0],by+3.2,12,5.8,5.4,a,'#565d64','#20242a');g.fillStyle='#25292e';g.fillRect(b[0]-5.1,by-.3,10.2,1.9);g.fillStyle='#dadada';for(i=-2;i<=2;i++)g.fillRect(b[0]+i*2-.55,by,1.1,.8);g.strokeStyle='#7b7b7b';g.lineWidth=.8;g.beginPath();g.moveTo(b[0]-6,by+1.5);g.lineTo(b[0]+6,by+1.5);g.moveTo(b[0]-5.2,by+3.4);g.lineTo(b[0]+5.2,by+3.4);for(i=-2;i<=2;i++){g.moveTo(b[0]+i*2.4,by+1.5);g.lineTo(b[0]+i*2.4,by+3.4)}g.stroke();
if(part==='go'){g.fillStyle='#17120a';g.beginPath();g.ellipse(b[0],by+4.2,4.4,1.7,0,0,7);g.fill();g.fillStyle='#e7a53d';g.beginPath();g.ellipse(b[0],by+4,2.9,1,0,0,7);g.fill();for(i=-1;i<=1;i+=2){g.fillStyle=i<0?'#7c7c7c':'#4c535b';path([[b[0]+i*1.2,by+3.5],[b[0]+i*4.6,by+3.1],[b[0]+i*6.1,by+7.3],[b[0]+i*2.2,by+7]]);g.fill();g.strokeStyle='#171a1e';g.stroke()}g.fillStyle='#999999';g.beginPath();g.ellipse(b[0],by+8.5,1.8,3,0,0,7);g.fill();outline(g,'#20242a')}else{g.fillStyle='#24282d';g.beginPath();g.ellipse(b[0],by+4.2,4.1,1.4,0,0,7);g.fill();g.strokeStyle='#111418';g.beginPath();g.moveTo(b[0]-3.7,by+4.2);g.lineTo(b[0]+3.7,by+4.2);g.stroke()}
g.globalAlpha=air?1:0;fin([-px*far,-py*far],5.7,1);fin([0,-1],8.3,1.08);fin([0,1],5.1,.7);if(fy<=0)prop();g.globalAlpha=1;
}

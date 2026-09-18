// Iron Frontier — infantry/tanya: the art for one unit.
// Called by bakeInfantry() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.




function drawTanya(C) {
  var by = C.by, col = C.col, cx = C.cx, g = C.g, gt = C.gt,
      legs = C.legs, sd = C.sd, TURN = C.TURN;
var planting = C.state === 'plant';
var crouch = planting ? [3.2,3.8,3.5,2.6,1.4,.4][C.phase] : 0;

// TANYA, read off Tanya_animation.gif: shoulder-length BLACK hair on a
// bare head — the only unhelmeted figure on the field — bare arms, a
// dark sleeveless top, olive combat trousers with pale
// thigh pouches, and a pistol in each outstretched hand. Twin pistols plus
// the bare dark head is the whole read at 1:1: hers is the only
// infantry silhouette with no helmet dome and nothing slung over a
// shoulder to break the outline.
// Tapered trousers over articulated knees, not broad rectangular trouser legs.
var legOrder = gt.sw ? [-gt.sw, gt.sw] : [-1, 1];
for (var ln = 0; ln < 2; ln++) {
  var li = legOrder[ln], lead = gt.sw ? (li === gt.sw ? 1 : -1) : 0;
  var lat = 1 - .35 * sd;
  var hip = cx + li * 2.1 * lat;
  var knee = cx + li * 2.7 * lat + (lead ? lead * 2.1 : li * .4) * sd / TURN + (planting ? li*crouch*.55 : 0);
  var foot = cx + li * (lead > 0 ? 5.1 : lead < 0 ? 1.5 : 3.5) * lat
    + (lead ? lead * 2.1 : li * .5) * sd / TURN;
  var lift = lead < 0 ? 2 : 0;
  g.strokeStyle = '#323d24'; g.lineWidth = 3.6; g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath(); g.moveTo(hip, by - 12 + crouch); g.lineTo(knee, by - 6.8 - lift + crouch*.3);
  g.lineTo(foot, by - 2.1 - lift); g.stroke();
  g.strokeStyle = lead < 0 ? '#586332' : '#8a9250'; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(hip - .25, by - 11.6 + crouch); g.lineTo(knee - .25, by - 7 - lift + crouch*.3);
  g.lineTo(foot - .25, by - 2.7 - lift); g.stroke();
  g.fillStyle = '#8d7953';
  g.fillRect(hip + (knee - hip) * .22 - .65, by - 11.1 - lift * .2 + crouch*.8, 1.3, 1.8);
  g.fillStyle = '#141922'; g.fillRect(foot - 1.7, by - 2 - lift, 3.6, 2.1);
}
var TANYA_SKIN = '#d8afa7';
var shooting = C.state === 'fire' || C.state === 'fireprone';
var forward = C.FA.back ? -1 : 1;

g.save(); g.translate(gt.lean, gt.bob + crouch);
if (sd > 0.4) tanyaArm(-forward);
g.fillStyle = TANYA_SKIN;                                    // bare shoulders + midriff
g.beginPath();
g.moveTo(cx - 3.7, by - 19.4); g.lineTo(cx + 3.7, by - 19.4);
g.lineTo(cx + 3.2, by - 18.0); g.lineTo(cx - 3.2, by - 18.0);
g.closePath(); g.fill(); outline(g, '#9a6f47');
g.fillStyle = '#606143';                                      // same cloth as the trousers
g.fillRect(cx - 3.3, by - 12.8, 6.6, 1.6);
g.fillStyle = '#2c2c2c';                                      // belt
g.fillRect(cx - 3.3, by - 13.4, 6.6, 1.0);
g.fillStyle = '#c9a94a';
g.fillRect(cx - 0.8, by - 13.3, 1.7, 1.1);

// A short fitted sleeveless shirt, with the waist visible above the belt.
g.fillStyle = TANYA_SKIN;
g.beginPath();
g.moveTo(cx - 2.6, by - 16.2); g.lineTo(cx + 2.6, by - 16.2);
g.lineTo(cx + 2.9, by - 13.4); g.lineTo(cx - 2.9, by - 13.4);
g.closePath(); g.fill();
var shirtLight = g.createLinearGradient(cx - 4.0, by - 20.4, cx + 3.3, by - 15.5);
shirtLight.addColorStop(0, '#49494b');
shirtLight.addColorStop(0.45, '#2d2e30');
shirtLight.addColorStop(1, '#15191b');
g.fillStyle = shirtLight;
g.beginPath();
g.moveTo(cx - 3.7, by - 20.4); g.lineTo(cx + 3.7, by - 20.4);
g.quadraticCurveTo(cx + 3.5, by - 17.7, cx + 2.6, by - 15.5);
g.quadraticCurveTo(cx, by - 15.0, cx - 2.6, by - 15.5);
g.closePath(); g.fill(); outline(g, '#171717');
g.fillStyle = 'rgba(124,124,124,.12)';                        // soft cloth light plane
g.beginPath();
g.moveTo(cx - 3.8, by - 20.0); g.lineTo(cx - 1.1, by - 20.0);
g.lineTo(cx - 1.2, by - 16.0); g.lineTo(cx - 2.8, by - 16.0);
g.closePath(); g.fill();
g.fillStyle = '#202020';                                      // shaded right fold
g.fillRect(cx + 1.8, by - 19.8, 1.3, 4.0);
g.fillStyle = '#222222';                                      // collar shadow
g.fillRect(cx - 3.4, by - 20.4, 6.8, 0.8);
g.fillStyle = shade(col, 0.70);
g.fillRect(cx - 2.4, by - 19.4, 4.8, 0.9);                   // narrow owner mark on upper shirt
g.strokeStyle = '#313131'; g.lineWidth = 1.0; g.lineCap = 'butt';
g.beginPath();                                                // thin holster sling
g.moveTo(cx - 2.4, by - 20.6); g.lineTo(cx + 1.4, by - 15.4); g.stroke();

// Open shoulders, bent elbows, two independently held pistols. Author the
// joints explicitly: the generic hanging-arm helper erases this pose.
for (var ai = 0; ai < 2; ai++) {
  var i = ai ? 1 : -1;
  if (sd <= 0.4 || i !== -forward) tanyaArm(i);
}
function tanyaArm(i) {
  var side = (1 - 0.68 * sd) / TURN;
  var shoulderX = cx + i * 3.8;
  var elbowX = cx + i * 6.6 * side + forward * sd * 3.8 / TURN;
  // Alternating wrist recovery; each pistol remains attached to its hand.
  var kick = shooting ? [0.25, 1.45, .55, .2, .95, .25][(C.phase + (i < 0 ? 3 : 0)) % 6] : 0;
  var handX = cx + i * (10.0 - kick) * side + forward * sd * ((shooting ? 8.0 : 7.0) - kick) / TURN;
  // Both hands project ahead of the chest when aiming in profile. Keep the
  // far wrist outside the torso edge, then let the torso occlude its upper arm.
  if (sd > 0.5) {
    var handReach = forward * (handX - cx);
    handX = cx + forward * Math.max(handReach, 6.5 * sd / TURN);
  }
  var shoulderY = by - 19.5;
  var handY = by - (shooting ? 19.4 : 17.0) + i * sd * 1.2 - kick * .65;
  var elbowY = by - (shooting ? 18.5 : 17.3) + i * sd * 0.7;
  if (planting) {
    var reach=[1,.95,.8,.55,.25,0][C.phase];
    handX=cx+i*(3+reach*3)*(1-.65*sd)/TURN+sd*(4+reach*5)/TURN;
    handY=by-12+reach*3+i*sd;
    elbowX=(shoulderX+handX)*.5;elbowY=by-14;
  }
  g.strokeStyle = '#ae8064'; g.lineWidth = 2.6;
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(shoulderX, shoulderY);
  g.lineTo(elbowX, elbowY); g.lineTo(handX, handY); g.stroke();
  g.strokeStyle = TANYA_SKIN; g.lineWidth = 1.9;
  g.beginPath(); g.moveTo(shoulderX, shoulderY - 0.3);
  g.lineTo(elbowX, elbowY - 0.3); g.lineTo(handX, handY - 0.3); g.stroke();
  g.strokeStyle = '#f1d2c7'; g.lineWidth = 0.8;
  g.beginPath(); g.moveTo(elbowX, elbowY - 0.6);
  g.lineTo(handX, handY - 0.6); g.stroke();
  g.fillStyle = '#303030';
  g.beginPath(); g.ellipse(handX, handY, 1.1, 1.25, 0, 0, 6.29); g.fill();
  if (planting) {
    // Pistols are holstered for the close-range charge, not fired at the wall.
    if (i === 1 && C.phase < 3) {
      g.fillStyle='#795342';g.fillRect(handX-1.7,handY-1,3.5,2.8);
      g.fillStyle='#c0aa77';g.fillRect(handX-.4,handY-1,.8,2.8);
      g.fillStyle='#bd9127';g.fillRect(handX+.7,handY-1,1,1);
    }
    return;
  }
  var gunDx = (i * 3.4 * (1 - sd) + forward * 4.0 * sd) / TURN;
  // Each slide sits above its own hand, with a short grip in the palm.
  g.strokeStyle = '#252525'; g.lineWidth = 2.0; g.lineCap = 'butt';
  g.beginPath(); g.moveTo(handX - gunDx * 0.15, handY - 1.1);
  g.lineTo(handX + gunDx, handY - 1.7); g.stroke();
  g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(handX, handY - 1.2);
  g.lineTo(handX - gunDx * 0.12, handY + 1.1); g.stroke();
  g.strokeStyle = '#9c9c9c'; g.lineWidth = 0.65;
  g.beginPath(); g.moveTo(handX, handY - 1.9);
  g.lineTo(handX + gunDx * 0.85, handY - 2.3); g.stroke();
}

if (!C.FA.back) {
  g.fillStyle = TANYA_SKIN;
  g.beginPath(); g.ellipse(cx + sd * 1.6 / TURN, by - 22.0,
    2.1 * (1 - 0.2 * sd), 2.4, 0, 0, 6.29); g.fill();
}
// Dark shoulder-length locks frame the small exposed face.
g.fillStyle = '#181820';                             // black hair, shoulder length
g.beginPath(); g.arc(cx, by - 22.4, 3.0, Math.PI, 0); g.fill();
g.fillRect(cx - 3.0, by - 23.5, 6.0, 1.1);
for (var hl = -1; hl <= 1; hl += 2) {                         // side locks to the collar
  g.beginPath();
  g.moveTo(cx + hl * 2.9, by - 22.7); g.lineTo(cx + hl * 3.2, by - 19.4);
  g.lineTo(cx + hl * 2.0, by - 19.7); g.lineTo(cx + hl * 2.15, by - 22.4);
  g.closePath(); g.fill();
}
// Preserve a face opening after drawing the framing locks.
if (!C.FA.back) {
  var faceX = cx + sd * 1.6 / TURN;
  g.fillStyle = '#d7ae87';
  g.fillRect(faceX - 1.7, by - 22.3, 3.4, 2.8);
  g.fillStyle = '#f0d0a5';
  g.fillRect(faceX, by - 22.1, 1.6, 1.9);
}
g.fillStyle = '#595959';                             // crown highlight
g.beginPath();
g.ellipse(cx - 1.05, by - 23.3, 1.45, 0.75, -0.35, 0, 6.29); g.fill();
g.restore();
}

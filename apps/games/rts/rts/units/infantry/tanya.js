// Iron Frontier — infantry/tanya: the art for one unit.
// Called by bakeInfantry() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.




function drawTanya(C) {
  var by = C.by, col = C.col, cx = C.cx, g = C.g, gt = C.gt,
      legs = C.legs, sd = C.sd, TURN = C.TURN;

// TANYA, read off Tanya_animation.gif: shoulder-length BLACK hair on a
// bare head — the only unhelmeted figure on the field — bare arms, a
// dark sleeveless top, olive combat trousers with pale
// thigh pouches, and a pistol in each outstretched hand. Twin pistols plus
// the bare dark head is the whole read at 1:1: hers is the only
// infantry silhouette with no helmet dome and nothing slung over a
// shoulder to break the outline.
legs(3.3, by - 11.8, 3.7, '#656747', 4.2);
var TANYA_SKIN = '#d8afa7';
var shooting = C.state === 'fire' || C.state === 'fireprone';
var forward = C.FA.back ? -1 : 1;

g.save(); g.translate(gt.lean, gt.bob);
if (sd > 0.4) tanyaArm(-forward);
g.fillStyle = TANYA_SKIN;                                    // bare shoulders + midriff
g.beginPath();
g.moveTo(cx - 4.4, by - 19.4); g.lineTo(cx + 4.4, by - 19.4);
g.lineTo(cx + 3.9, by - 18.0); g.lineTo(cx - 3.9, by - 18.0);
g.closePath(); g.fill(); outline(g, '#9a6f47');
g.fillStyle = '#606143';                                      // same cloth as the trousers
g.fillRect(cx - 4.1, by - 12.8, 8.2, 2.2);
g.fillStyle = '#2c2c2c';                                      // belt
g.fillRect(cx - 4.2, by - 13.4, 8.4, 1.2);
g.fillStyle = '#c9a94a';
g.fillRect(cx - 0.8, by - 13.3, 1.7, 1.1);
for (var tp = -1; tp <= 1; tp += 2) {                         // pale thigh pouches
  var pouchLight = g.createLinearGradient(cx + tp * 3.1 - 1.2, by - 12.4,
    cx + tp * 3.1 + 1.1, by - 9.0);
  pouchLight.addColorStop(0, '#99936d');
  pouchLight.addColorStop(0.45, '#767451');
  pouchLight.addColorStop(1, '#464d35');
  g.fillStyle = pouchLight;
  g.beginPath(); g.roundRect(cx + tp * 3.1 - 1.15, by - 12.4, 2.3, 3.2, 0.65); g.fill();
  g.fillStyle = '#a39a71';
  g.fillRect(cx + tp * 3.1 - 0.9, by - 12.2, 1.8, 0.55);
}

// A short fitted sleeveless shirt, with the waist visible above the belt.
g.fillStyle = TANYA_SKIN;
g.beginPath();
g.moveTo(cx - 3.4, by - 16.2); g.lineTo(cx + 3.4, by - 16.2);
g.lineTo(cx + 3.7, by - 13.4); g.lineTo(cx - 3.7, by - 13.4);
g.closePath(); g.fill();
var shirtLight = g.createLinearGradient(cx - 4.0, by - 20.4, cx + 3.3, by - 15.5);
shirtLight.addColorStop(0, '#49494b');
shirtLight.addColorStop(0.45, '#2d2e30');
shirtLight.addColorStop(1, '#15191b');
g.fillStyle = shirtLight;
g.beginPath();
g.moveTo(cx - 4.4, by - 20.4); g.lineTo(cx + 4.4, by - 20.4);
g.quadraticCurveTo(cx + 4.1, by - 17.7, cx + 3.3, by - 15.5);
g.quadraticCurveTo(cx, by - 15.0, cx - 3.3, by - 15.5);
g.closePath(); g.fill(); outline(g, '#171717');
g.fillStyle = 'rgba(124,124,124,.12)';                        // soft cloth light plane
g.beginPath();
g.moveTo(cx - 3.8, by - 20.0); g.lineTo(cx - 1.1, by - 20.0);
g.lineTo(cx - 1.2, by - 16.0); g.lineTo(cx - 2.8, by - 16.0);
g.closePath(); g.fill();
g.fillStyle = '#202020';                                      // shaded right fold
g.fillRect(cx + 1.8, by - 19.8, 1.3, 4.0);
g.fillStyle = '#222222';                                      // collar shadow
g.fillRect(cx - 3.9, by - 20.4, 7.8, 0.8);
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
  var side = (1 - 0.85 * sd) / TURN;
  var shoulderX = cx + i * 4.5;
  var elbowX = cx + i * 7.8 * side + forward * sd * 3.8 / TURN;
  var handX = cx + i * 11.1 * side + forward * sd * (shooting ? 8.0 : 7.0) / TURN;
  // Both hands project ahead of the chest when aiming in profile. Keep the
  // far wrist outside the torso edge, then let the torso occlude its upper arm.
  if (sd > 0.5) {
    var handReach = forward * (handX - cx);
    handX = cx + forward * Math.max(handReach, 6.5 * sd / TURN);
  }
  var shoulderY = by - 19.5;
  var handY = by - (shooting ? 19.7 : 17.8) + i * sd * 1.2;
  var elbowY = by - (shooting ? 18.2 : 16.7) + i * sd * 0.7;
  g.strokeStyle = '#a37e73'; g.lineWidth = 2.8;
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
g.fillRect(cx - 3.0, by - 22.6, 6.0, 1.2);
for (var hl = -1; hl <= 1; hl += 2) {                         // side locks to the collar
  g.beginPath();
  g.moveTo(cx + hl * 2.9, by - 22.7); g.lineTo(cx + hl * 3.2, by - 19.4);
  g.lineTo(cx + hl * 2.0, by - 19.7); g.lineTo(cx + hl * 2.15, by - 22.4);
  g.closePath(); g.fill();
}
outline(g, '#140d09');
g.fillStyle = '#595959';                             // crown highlight
g.beginPath();
g.ellipse(cx - 1.05, by - 23.3, 1.45, 0.75, -0.35, 0, 6.29); g.fill();
g.restore();
}

// Iron Frontier — infantry/spy.
// Civilian tailoring, a small dark hat, two trouser legs, and bent unarmed
// hands. Read against the local multi-bearing walk/action animation.
function drawSpy(C) {
  var g = C.g, cx = C.cx, by = C.by, gt = C.gt, sd = C.sd, TURN = C.TURN;
  var moving = C.state === 'walk' || C.state === 'crawl';
  var back = C.FA.back, coat = '#252b36', clothLight = '#566171';
  function box(x, y, w, h, r, colour) {
    g.fillStyle = colour;
    g.beginPath(); g.roundRect(x, y, w, h, r); g.fill();
  }

  // Tailored trousers articulate below the coat. One heel lifts on a stride.
  var order = gt.sw ? [-gt.sw, gt.sw] : [-1, 1];
  for (var n = 0; n < 2; n++) {
    var i = order[n], lead = gt.sw ? (i === gt.sw ? 1 : -1) : 0;
    var lat = 1 - 0.38 * sd;
    var hx = cx + i * 2.0 * lat;
    var kx = cx + i * (lead > 0 ? 4.0 : lead < 0 ? 1.1 : 2.4) * lat
      + (lead > 0 ? 2.6 : lead < 0 ? -1.8 : 0) * sd / TURN;
    var fx = kx + (lead > 0 ? 1.0 : lead < 0 ? -1.1 : i * 0.5) / TURN;
    var lift = lead < 0 ? 2.1 : 0;
    g.strokeStyle = lead < 0 ? '#1b202a' : '#2b3342';
    g.lineWidth = 3.6; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(hx, by - 11.0);
    g.lineTo(kx, by - 5.8 - lift); g.lineTo(fx, by - 1.7 - lift); g.stroke();
    // Narrow crease on solid dark cloth, not a whole grey shin fading into grass.
    g.strokeStyle = lead < 0 ? '#394353' : '#59667b'; g.lineWidth = 1.0;
    g.beginPath(); g.moveTo(hx-.65,by-10.7);
    g.lineTo(kx-.65,by-5.8-lift); g.lineTo(fx-.65,by-2.5-lift); g.stroke();
    box(fx - 1.8, by - 2.5 - lift, 4.2, 2.5, 0.6, '#141920');
    box(fx - 1.2, by - 2.2 - lift, 2.7, .8, .2, '#56616b');
  }

  g.save(); g.translate(gt.lean, gt.bob + (moving ? 0.4 : 0));
  g.translate(cx, by - 10.2);
  g.rotate((moving ? 0.19 : 0.07) * sd);
  g.translate(-cx, -(by - 10.2));

  // Coat panels continue from shoulder to separate moving tails.
  var tail = gt.swf * 0.9;
  g.fillStyle = coat;
  g.beginPath();
  g.moveTo(cx - 4.4, by - 20.1); g.lineTo(cx + 4.4, by - 20.1);
  g.lineTo(cx + 3.7, by - 13.0);
  g.lineTo(cx + 4.3 + tail, by - 9.7);
  g.lineTo(cx + 1.2 + tail, by - 10.0);
  g.lineTo(cx, by - 12.0);
  g.lineTo(cx - 1.2 + tail, by - 10.0);
  g.lineTo(cx - 4.3 + tail, by - 9.7);
  g.lineTo(cx - 3.8, by - 13.0); g.closePath(); g.fill();
  g.fillStyle = '#414d60';
  g.beginPath();
  g.moveTo(cx - 3.7, by - 19.8); g.lineTo(cx - 1.1, by - 19.3);
  g.lineTo(cx - 1.1, by - 12.1); g.lineTo(cx - 2.0 + tail, by - 10.5);
  g.lineTo(cx - 3.7 + tail, by - 10.3); g.closePath(); g.fill();

  if (!back) {
    // Small shirt triangle and peaked grey lapels, not bright vertical rails.
    g.fillStyle = '#c1c1c1';
    g.beginPath(); g.moveTo(cx - 1.8, by - 20.0);
    g.lineTo(cx + 1.8, by - 20.0); g.lineTo(cx, by - 15.5); g.closePath(); g.fill();
    g.fillStyle = '#2d2d2d';
    g.beginPath(); g.moveTo(cx - 0.6, by - 19.1);
    g.lineTo(cx + 0.6, by - 19.1); g.lineTo(cx + 0.8, by - 15.4);
    g.lineTo(cx, by - 14.8); g.lineTo(cx - 0.7, by - 15.5); g.closePath(); g.fill();
    for (var l = -1; l <= 1; l += 2) {
      g.fillStyle = l < 0 ? clothLight : '#384353';
      g.beginPath(); g.moveTo(cx + l * 3.8, by - 20.1);
      g.lineTo(cx + l * 1.6, by - 20.2);
      g.lineTo(cx + l * 0.7, by - 17.0);
      g.lineTo(cx + l * 2.5, by - 15.2);
      g.lineTo(cx + l * 3.2, by - 17.6); g.closePath(); g.fill();
    }
  } else {
    box(cx - 3.5, by - 19.4, 7.0, 1.0, 0.3, '#4b586a');
    box(cx - 0.4, by - 18.0, 0.8, 6.7, 0.2, '#1b222e');
  }
  box(cx - 3.8, by - 12.8, 7.6, 1.1, 0.3, '#303030');

  // Sleeves bend forward from the shoulder into bare, empty hands.
  for (var a = -1; a <= 1; a += 2) {
    var stride = moving ? (a === gt.sw ? -1 : 1) : a;
    var shoulder = cx + a * 4.4;
    var elbow = cx + a * 6.0 * (1 - 0.3 * sd) + stride * sd * 1.5 / TURN;
    var hand = cx + a * 7.6 * (1 - 0.45 * sd) + stride * sd * 4.0 / TURN;
    var handY = by - 14.7 - (stride > 0 ? 1.0 : -0.7);
    g.strokeStyle = a < 0 ? '#465369' : coat;
    g.lineWidth = 2.9; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(shoulder, by - 18.8);
    g.lineTo(elbow, by - 15.1); g.lineTo(hand, handY); g.stroke();
    box(hand - 0.9, handY - 0.8, 1.8, 1.5, 0.3, '#bebebe');
    g.fillStyle = '#d9b48d';
    g.beginPath(); g.ellipse(hand + a * 0.6, handY + 0.2, 1.3, 1.1, 0, 0, 6.29); g.fill();
    // A restrained sleeve identifier leaves the charcoal coat continuous.
    box(shoulder - 1.1, by - 18.2, 2.2, 1.0, 0.2, shade(C.col, 0.72));
  }

  var headX = cx + sd * 1.3 / TURN + C.HEADX;
  if (!back) {
    g.fillStyle = '#c9a480';
    g.beginPath(); g.ellipse(headX, by - 22.0, 2.1, 2.5, 0, 0, 6.29); g.fill();
  } else {
    box(headX - 1.7, by - 23.2, 3.4, 2.8, 0.8, '#303030');
  }
  // The brim extends just past the head. It must not become the shoulders.
  var brim = 3.35 / TURN, crown = 2.45 / TURN;
  box(headX - crown, by - 25.6, crown * 2, 3.0, 0.7, '#292929');
  box(headX - crown * 0.6, by - 25.3, crown, 0.7, 0.2, '#515151');
  g.fillStyle = '#242424';
  g.beginPath(); g.ellipse(headX, by - 22.9, brim, 0.75, 0, 0, 6.29); g.fill();
  g.restore();
}

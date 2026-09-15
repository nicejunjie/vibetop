// Iron Frontier — infantry/desolator.
// Read against the local RA2 animation: dark pressure suit, coloured shoulder
// shell and knee guards, green equipment, and a heavy shoulder-borne cannon.
function drawDesolator(C) {
  var g = C.g, cx = C.cx, by = C.by, col = C.col, gt = C.gt;
  var sd = C.sd, TURN = C.TURN, back = C.FA.back;
  var firing = C.state === 'fire' || C.state === 'fireprone';
  var moving = C.state === 'walk' || C.state === 'crawl';
  function box(x, y, w, h, r, colour) {
    g.fillStyle = colour;
    g.beginPath(); g.roundRect(x, y, w, h, r); g.fill();
  }

  // Flexible dark thighs bend into coloured knee guards and heavy boots.
  var order = gt.sw ? [-gt.sw, gt.sw] : [-1, 1];
  for (var n = 0; n < 2; n++) {
    var i = order[n], lead = gt.sw ? (i === gt.sw ? 1 : -1) : 0;
    var lat = 1 - 0.48 * sd;
    var hip = cx + i * 2.5 * lat;
    var knee = cx + i * (3.0 + (lead > 0 ? 1.7 : lead < 0 ? -1.3 : 0)) * lat
      + (lead > 0 ? 2.4 : lead < 0 ? -1.8 : 0) * sd / TURN;
    var foot = knee + (lead > 0 ? 1.2 : lead < 0 ? -1.0 : i * 0.4) / TURN;
    var lift = lead < 0 ? 2.0 : 0;
    g.strokeStyle = lead < 0 ? '#393939' : '#575757';
    g.lineWidth = lead < 0 ? 3.9 : 4.5; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(hip, by - 12.0);
    g.lineTo(knee, by - 6.1 - lift); g.lineTo(foot, by - 2.2 - lift); g.stroke();
    box(knee - 2.05, by - 7.4 - lift, 4.1, 3.2, 0.8, shade(col, lead < 0 ? 0.58 : 0.93));
    box(knee - 1.7, by - 7.3 - lift, 3.4, 0.85, 0.2, shade(col, 1.13));
    box(foot - 2.3, by - 3.2 - lift, 5.0, 3.2, 0.8, '#252525');
    box(foot - 1.7, by - 2.7 - lift, 3.8, 0.7, 0.2, '#545454');
  }

  g.save(); g.translate(gt.lean, gt.bob);
  g.translate(cx, by - 11.0);
  g.rotate((moving ? 0.16 : 0.07) * sd);
  g.translate(-cx, -(by - 11.0));

  // Pack seated behind the shoulder blades, with a green inset exposed
  // around the side and rear. The dark waist remains below this equipment.
  var packX = cx - sd * 4.0 / TURN;
  box(packX - 4.0, by - 22.4, 8.0, 10.1, 1.6, '#393939');
  box(packX - 3.8, by - 21.8, 7.6, 3.4, 1.0, shade(col, 0.87));
  if (sd > 0.4 || back) {
    box(packX - 3.3, by - 18.7, 6.6, 5.7, 0.8, '#316b2d');
    box(packX - 2.8, by - 18.2, 2.0, 4.5, 0.3, '#69c339');
  }
  g.fillStyle = '#393939';
  g.beginPath();
  g.moveTo(cx - 4.5, by - 20.3); g.lineTo(cx + 4.5, by - 20.3);
  g.lineTo(cx + 4.7, by - 11.0); g.lineTo(cx + 3.0, by - 9.7);
  g.lineTo(cx - 3.5, by - 9.7); g.lineTo(cx - 4.9, by - 11.4);
  g.closePath(); g.fill();
  box(cx - 4.2, by - 16.0, 3.4, 5.0, 0.8, '#575757');
  box(cx - 5.4, by - 21.0, 10.8, 5.3, 2.1, shade(col, 0.94));
  g.fillStyle = shade(col, 1.22);
  g.beginPath(); g.ellipse(cx - 2.4, by - 20.1, 2.5, 1.0, -0.2, 0, 6.29); g.fill();
  box(cx - 4.7, by - 11.8, 9.4, 2.0, 0.7, '#292929');

  // Small sealed head nested between the shoulders and the weapon.
  var headX = cx + sd * 1.3 / TURN;
  g.fillStyle = '#404040';
  g.beginPath(); g.ellipse(headX, by - 23.2, 2.8, 3.2, 0, 0, 6.29); g.fill();
  g.fillStyle = '#727272';
  g.beginPath(); g.ellipse(headX - 0.6, by - 24.6, 1.8, 1.1, -0.15, 0, 6.29); g.fill();
  if (!back) {
    box(headX - 2.1, by - 23.4, 4.5, 2.3, 0.8, '#242b24');
    box(headX - 1.6, by - 23.1, 3.3, 0.7, 0.2, '#788c71');
  }

  // Connected sleeves and gauntlets brace the receiver from below.
  for (var arm = -1; arm <= 1; arm += 2) {
    var ax = cx + arm * 5.0;
    g.strokeStyle = shade(col, arm < 0 ? 0.76 : 0.96);
    g.lineWidth = 3.7; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(ax, by - 19.2);
    g.lineTo(ax + arm * 0.5, by - 16.1);
    g.lineTo(cx + (back ? -1 : 1) * 3.6, by - 20.0); g.stroke();
    g.fillStyle = '#707070';
    g.beginPath(); g.ellipse(cx + (back ? -1 : 1) * 3.6, by - 20.0, 1.8, 1.3, 0, 0, 6.29); g.fill();
  }

  if (!back) {
    // The source shows a green equipment chamber below the shoulder barrel.
    box(cx + 1.0, by - 20.4, 3.8, 4.8, 0.8, '#2d5427');
    box(cx + 1.6, by - 19.9, 2.6, 3.7, 0.5, '#54bf36');
    box(cx + 1.8, by - 19.6, 0.8, 3.0, 0.2, '#94db4f');
  }
  C.wpn(function () {
    // A substantial cylinder carried above the shoulder, lowered to fire.
    g.save(); g.translate(cx + 2.5, by - 21.1);
    if (firing) g.scale(0.45 + 0.55 * sd, 1);
    g.rotate(firing ? -0.10 - 0.25 * (1 - sd) : -1.0 + 0.55 * sd);
    box(-2.5, -1.9, 11.8, 3.8, 1.0, '#343434');
    box(-1.9, -1.7, 10.8, 1.0, 0.5, '#747474');
    box(2.8, -1.9, 1.1, 3.8, 0.2, '#4e4e4e');
    box(7.8, -2.0, 1.1, 4.0, 0.2, '#4e4e4e');
    g.fillStyle = '#263c25';
    g.beginPath(); g.ellipse(9.2, 0, 1.0, 2.0, 0, 0, 6.29); g.fill();
    g.fillStyle = C.ACC;
    g.beginPath(); g.ellipse(9.4, 0, 0.7, 1.4, 0, 0, 6.29); g.fill();
    g.fillStyle = '#dcff7a';
    g.beginPath(); g.ellipse(9.55, -0.35, 0.3, 0.7, 0, 0, 6.29); g.fill();
    g.restore();
  });

  // Rear pack covers the harness, not the projecting barrel.
  if (back) {
    box(packX - 3.4, by - 20.1, 6.8, 7.4, 1.2, '#353535');
    box(packX - 2.6, by - 19.0, 5.2, 5.0, 0.8, '#419833');
    box(packX - 2.1, by - 18.5, 1.5, 3.8, 0.2, '#82d242');
  }
  g.restore();
}

// Iron Frontier — infantry/conscript: the art for one unit.
// Called by bakeInfantry() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.




function drawConscript(C) {
  var ACC = C.ACC, FA = C.FA, HEADX = C.HEADX, JACKET = C.JACKET, POUCH = C.POUCH, SLEEVE = C.SLEEVE, T = C.T,
      TURN = C.TURN, arms = C.arms, by = C.by, carbine = C.carbine, col = C.col, cx = C.cx,
      face = C.face, g = C.g, gt = C.gt, legs = C.legs, sd = C.sd;
  JACKET = '#272a2d';

// Read straight off the RA2 sprite (soviet-conscript-anim-f0): a plain
// STEEL helmet, a fat house-colour scarf filling the whole chest under
// the chin, a near-black jacket with the sleeves the same value as the
// jacket, and BROWN-MAROON trousers carrying a tan ammo pouch on the
// hip. Two earlier passes made him a house-colour helmet over a tan
// greatcoat, which is a different soldier: in the real sprite the
// helmet is grey and the SCARF is the only remapped mass.
// Bent trousers and separate boots, not two 12px straight charcoal bars.
// Each shin changes angle at the knee and the boots plant apart even at
// rest; the stride offsets the forward leg without merging the pair.
g.fillStyle = '#805555';
g.beginPath();
g.moveTo(cx - 4.0, by - 13.0); g.lineTo(cx + 4.0, by - 13.0);
g.lineTo(cx + 2.55, by - 10.0); g.lineTo(cx - 2.55, by - 10.0);
g.closePath(); g.fill();                              // continuous trouser seat
var legOrder = gt.sw ? [-gt.sw, gt.sw] : [-1, 1];
for (var ln = 0; ln < 2; ln++) {
  var li = legOrder[ln], lead = gt.sw ? (li === gt.sw ? 1 : -1) : 0;
  var lat = 1 - 0.5 * C.sd;
  var hx = cx + li * 2.1 * lat;
  var kx = cx + li * (lead > 0 ? 4.1 : lead < 0 ? 1.2 : 2.8) * lat
    + (lead > 0 ? 2.5 : lead < 0 ? -1.8 : 0) * C.sd / TURN;
  var fx = kx + (lead > 0 ? 1.0 : lead < 0 ? -0.8 : li * 0.3) / TURN;
  var lift = lead < 0 ? 2.0 : 0;
  var thigh = 4.5 * (lead < 0 ? 0.9 : 1);
  var thighLight = g.createLinearGradient(hx - thigh / 2, by - 12.8,
    kx + thigh / 2, by - 6.6 - lift);
  thighLight.addColorStop(0, '#ab8171');
  thighLight.addColorStop(0.40, '#896052');
  thighLight.addColorStop(1, '#50372f');
  g.fillStyle = thighLight;
  g.beginPath();
  g.moveTo(hx - thigh / 2, by - 12.8); g.lineTo(hx + thigh / 2, by - 12.8);
  g.lineTo(kx + thigh * 0.44, by - 6.6 - lift);
  g.lineTo(kx - thigh * 0.44, by - 6.6 - lift); g.closePath(); g.fill();
  var shinLight = g.createLinearGradient(kx - thigh * 0.4, by - 6.9 - lift,
    fx + thigh * 0.4, by - 2.0 - lift);
  shinLight.addColorStop(0, '#8d6352');
  shinLight.addColorStop(0.4, '#704d40');
  shinLight.addColorStop(1, '#40312b');
  g.fillStyle = shinLight;
  g.beginPath();
  g.moveTo(kx - thigh * 0.43, by - 6.9 - lift);
  g.lineTo(kx + thigh * 0.43, by - 6.9 - lift);
  g.lineTo(fx + thigh * 0.36, by - 2.0 - lift);
  g.lineTo(fx - thigh * 0.36, by - 2.0 - lift); g.closePath(); g.fill();
  g.fillStyle = '#333333';
  g.beginPath(); g.roundRect(fx - 2.0, by - 2.8 - lift, 4.2, 2.8, 0.7); g.fill();
}

g.save(); g.translate(gt.lean, gt.bob);
if (FA.back) carbine(cx - 5.0, by - 15.2 + gt.sw * 0.5,
                    cx + 8.1, by - 17.5 + gt.sw * 0.5, 1.8);
g.fillStyle = POUCH;                                          // tan hip pouch
g.beginPath(); g.roundRect(cx - 4.6, by - 13.0, 4.4, 3.2, 0.9); g.fill();
outline(g, shade(POUCH, 0.44));
g.fillStyle = shade(POUCH, 1.22);
g.fillRect(cx - 4.3, by - 12.8, 3.8, 0.9);

var jacketLight = g.createLinearGradient(cx - 5.2, by - 18.4, cx + 4.7, by - 11.6);
jacketLight.addColorStop(0, '#45494a');
jacketLight.addColorStop(0.4, '#2b3031');
jacketLight.addColorStop(1, '#151b1e');
g.fillStyle = jacketLight;
g.beginPath();
g.moveTo(cx - 5.2, by - 18.4); g.lineTo(cx + 5.2, by - 18.4);
g.lineTo(cx + 4.7, by - 11.6); g.lineTo(cx - 4.7, by - 11.6);
g.closePath(); g.fill(); outline(g, shade(JACKET, 0.52));
g.fillStyle = shade(JACKET, 1.34);                            // lit left edge
g.fillRect(cx - 5.0, by - 18.2, 1.3, 6.4);
g.fillStyle = shade(JACKET, 0.66);                            // belt
g.fillRect(cx - 4.9, by - 13.2, 9.8, 1.5);

// The sleeves are a step LIGHTER than the jacket on purpose: at the
// jacket's own value they merged with the torso and the scarf read as
// a slab floating between two black bricks with no arms swinging.
// The tunic's sleeves are the tunic: RA2 remaps the Conscript down to
// the cuff (44.6% of the body), and drawing them in the jacket's grey
// left the house block looking like a bib pinned to a dark coat.
if (FA.back) {
  arms(5.5, by - 18.4, 2.9, 6.6, shade(JACKET, 1.18), function (i, x, y) {
    g.fillStyle = shade(JACKET, 0.70);
    g.beginPath(); g.roundRect(x - 1.5, y + 5.0, 3.0, 2.0, 0.8); g.fill();
  });
} else {
  // Replace the generic dangling sleeves with two bent arms that support
  // the gun across the chest. Elbows project out; hands meet its stock and
  // foregrip, so the weapon belongs to the person rather than floating.
  for (var ca = -1; ca <= 1; ca += 2) {
    var gunLift = C.state === 'fire' || C.state === 'fireprone' ? 3.0 : 0;
    g.strokeStyle = shade(JACKET, ca < 0 ? 1.16 : 0.94);
    g.lineWidth = 2.8; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(cx + ca * 4.5, by - 18.2);
    g.lineTo(cx + ca * 6.1, by - 15.0 - gunLift * 0.45);
    g.lineTo(cx + ca * 3.7, by - 16.2 - gunLift); g.stroke();
    g.fillStyle = shade(JACKET, 0.72);
    g.beginPath(); g.ellipse(cx + ca * 3.7, by - 16.2 - gunLift, 1.2, 1.05, 0, 0, 6.29); g.fill();
  }
}

// The bright remap is a compact scarf/vest over the dark tunic, with
// narrow shoulder edges; the arms themselves stay dark.
var chestLight = g.createLinearGradient(cx - 3.9, by - 19.0, cx + 3.3, by - 14.9);
chestLight.addColorStop(0, shade(col, 1.13));
chestLight.addColorStop(0.4, shade(col, 0.85));
chestLight.addColorStop(1, shade(col, 0.48));
g.fillStyle = chestLight;
g.beginPath();
g.moveTo(cx - 3.9, by - 19.0); g.lineTo(cx + 3.9, by - 19.0);
g.lineTo(cx + 3.3, by - 14.9); g.lineTo(cx - 3.3, by - 14.9);
g.closePath(); g.fill(); outline(g, shade(col, 0.39));
g.fillStyle = shade(col, 1.25);
g.fillRect(cx - 2.4, by - 18.6, 3.1, 1.1);
for (var csp = -1; csp <= 1; csp += 2) {
  g.fillStyle = shade(col, 0.68);
  g.beginPath();
  g.moveTo(cx + csp * 2.2, by - 19.7);
  g.lineTo(cx + csp * 5.5, by - 18.9);
  g.lineTo(cx + csp * 5.0, by - 17.1);
  g.lineTo(cx + csp * 2.5, by - 17.1);
  g.closePath(); g.fill(); outline(g, shade(col, 0.40));
  g.fillStyle = shade(col, 1.28);
  g.fillRect(cx + csp * 4.2 - 0.8, by - 19.1, 1.5, 1.0);
}
g.fillStyle = '#333333';
g.fillRect(cx - 3.8, by - 18.1, 0.9, 3.9);
g.fillRect(cx + 2.9, by - 18.1, 0.9, 3.9);                 // side harness, chest remains red
if (!FA.back) carbine(cx - 5.0, by - 15.2 + gt.sw * 0.5,
        cx + 8.1, by - 17.5 + gt.sw * 0.5, 1.8);
g.fillStyle = '#777777';                                   // narrow steel mask
g.beginPath(); g.roundRect(cx - 2.45, by - 22.1, 4.9, 3.8, 0.8); g.fill();
g.fillStyle = '#343434';
g.fillRect(cx - 2.0, by - 20.5, 4.0, 0.75);
// THE CAP, not a helmet. §2.2: "cap silhouette flat, not domed" — a
// Conscript and a GI are the same 13x27 blob and RA2 separates them on
// exactly two things, the leg hue and the headgear. So the GI keeps the
// pot dome and the Conscript gets a low FLAT crown with a forward peak,
// in near-black: different shape AND different value, at the one place
// on a 20px figure a player actually looks.
var CCAP = ACC, chy2 = by - 22.4;
var ccx = cx + sd * 1.1 / TURN + HEADX, ccw = 2.25 * (1 - 0.16 * sd);
g.fillStyle = CCAP;
g.beginPath(); g.roundRect(ccx - ccw * 1.2, chy2 - 3.2, ccw * 2.4, 4.5, 2.2); g.fill();
outline(g, shade(CCAP, 0.44));
g.fillStyle = shade(CCAP, 0.52);                              // forward peak
g.beginPath();
g.moveTo(ccx - ccw, chy2 + 1.0); g.lineTo(ccx + ccw, chy2 + 1.0);
g.lineTo(ccx + ccw * 0.8, chy2 + 1.5); g.lineTo(ccx - ccw * 0.8, chy2 + 1.5);
g.closePath(); g.fill(); outline(g, shade(CCAP, 0.32));
g.fillStyle = shade(CCAP, 1.55);                              // lit flat crown
g.fillRect(ccx - ccw + 0.4, chy2 - 2.2, ccw * 0.9, 1.1);
g.restore();
}

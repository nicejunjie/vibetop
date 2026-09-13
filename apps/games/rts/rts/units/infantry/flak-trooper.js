// Iron Frontier — infantry/flak-trooper: the art for one unit.
// Called by bakeInfantry() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.




function drawFlakTrooper(C) {
  var ACC = C.ACC, T = C.T, arms = C.arms, by = C.by, col = C.col, cx = C.cx, face = C.face, g = C.g, gt = C.gt,
      helmet = C.helmet, legs = C.legs, wpn = C.wpn;

// FLAK TROOPER (Collective), read off soviet-flak-trooper-frames: a
// dark tunic over BROWN trousers, a house-colour vest filling the
// chest, a plain steel helmet, and the silhouette that names him — a
// long PALE flak cannon carried muzzle-UP over the right shoulder, the
// barrel rising past the helmet and out of the body outline.
// Laying that barrel horizontally across the hip (the first attempt)
// turned him into a man carrying a broom and lost the tell entirely.
legs(3.0, by - 12.5, 3.9, '#7a5138', 4.4);   // a wider stance: he is squeezed
                                             // to RA2's 12 px of width and at
                                             // the rifleman's 2.6 his two legs
                                             // closed into one brown post

g.save(); g.translate(gt.lean, gt.bob);
g.fillStyle = T.coat;                                         // dark tunic, flared
g.beginPath();
g.moveTo(cx - 5.0, by - 19.0); g.lineTo(cx + 5.0, by - 19.0);
g.lineTo(cx + 5.5, by - 11.0); g.lineTo(cx - 5.5, by - 11.0);
g.closePath(); g.fill(); outline(g, shade(T.coat, 0.45));
g.fillStyle = shade(T.coat, 1.24);                            // lit left panel
g.fillRect(cx - 5.3, by - 18.8, 1.4, 7.8);
g.fillStyle = shade(T.coat, 0.46);                            // belt
g.fillRect(cx - 5.3, by - 12.8, 10.6, 1.6);
g.fillStyle = '#b58a52';                                      // tan hip pouch
g.beginPath(); g.roundRect(cx + 1.4, by - 12.4, 4.0, 3.0, 0.9); g.fill();
outline(g, '#6d5027');

arms(5.7, by - 18.0, 3.0, 6.6, T.coat, function (i, x, y) {
  g.fillStyle = col;                                          // house-colour shoulder pad
  g.beginPath(); g.roundRect(x - 1.9, y - 1.4, 3.8, 3.2, 1.0); g.fill();
  outline(g, shade(col, 0.42));
  g.fillStyle = shade(col, 1.22);
  g.fillRect(x - 1.7, y - 1.2, 3.4, 1.0);
  g.fillStyle = '#2b2d33';                                    // dark glove
  g.beginPath(); g.roundRect(x - 1.5, y + 5.4, 3.0, 2.0, 0.9); g.fill();
  g.fillStyle = shade(col, 0.88);                             // house cuff above it
  g.fillRect(x - 1.7, y + 4.2, 3.4, 1.6);
});

g.fillStyle = col;                                            // house-colour chest vest
g.beginPath();                                                // collar to BELOW the belt, as
g.moveTo(cx - 5.9, by - 20.5); g.lineTo(cx + 5.5, by - 20.5);  // the Conscript's tunic is
g.lineTo(cx + 4.8, by - 10.2); g.lineTo(cx - 5.5, by - 10.2);
g.closePath(); g.fill(); outline(g, shade(col, 0.40));
g.fillStyle = shade(col, 1.22);                               // lit left panel
g.fillRect(cx - 5.4, by - 19.9, 3.5, 8.8);
g.fillStyle = shade(col, 0.74);                               // shoulder-strap shadow
g.fillRect(cx + 1.6, by - 19.7, 2.8, 8.4);

wpn(function () {
var fy = gt.bob ? 0.5 : 0;                                    // cannon rides the bob
// THE SPIKE, and the reason he is the tallest thing on the field.
// §2.2 asks for "9-10 px of pure spike above the helmet" and a total
// height >= 1.25x a Conscript's; the muzzle used to stop level with the
// helmet CROWN, so the tell was a barrel you could not see over the man
// and the gate scored his helmet as his spike. It now clears the crown
// by about 8 screen px at zoom 1, which is what makes a 12x37 Flak
// Trooper stand a head-and-a-half over a 13x27 Conscript in RA2.
//
// The bore is FAT on purpose. The barrel is what protrudes, so it is
// the run `spikeOf` measures, and a 3.4-wide stroke came back at 3.3
// screen px — under the 3.64 floor that keeps a feature alive at ZMIN
// (this is the Desolator's backpack trap in reverse: raise a thin thing
// clear of the body and the THIN thing becomes the measured spike). A
// flak cannon is a big-bore AA gun and can carry the width honestly.
// Carried OUTBOARD of the head, not across it: braced at the right hip
// and rising past the shoulder, so the man's helmet and face stay clear
// of the bore. Run up the centre line and the barrel drew a bar over
// his face and the figure stopped reading as a soldier at all.
// ...and the last of his RA2 proportion is bought HERE, in the barrel,
// which is the rule the STATURE table already states for him: RA2's
// `FLAKT` is 12x37 because of the cannon, not because he is a giant, so
// the height comes out of the gun and never out of the man. He measured
// 18x45 (w:h 0.400) once the barrel stopped swinging out at the profile
// facings, against RA2's 0.324 — still 23% wide. The muzzle now stands
// 2.2 units higher and 0.8 in, which lengthens the spike (the tell) and
// pulls the brake back level with the shoulder pad so the BODY sets the
// outline again instead of the gun.
var bx0 = cx + 3.4, by0 = by - 12.8 + fy;                     // grip, at the right hip
var bx1 = cx + 7.4, by1 = by - 35.4 - fy;                     // muzzle, a head above the helmet
g.strokeStyle = '#23262c'; g.lineWidth = 4.6; g.lineCap = 'butt';
g.beginPath(); g.moveTo(bx0, by0); g.lineTo(bx1, by1); g.stroke();
g.strokeStyle = '#a9b2bd'; g.lineWidth = 2.6;                 // pale steel barrel
g.beginPath(); g.moveTo(bx0, by0); g.lineTo(bx1, by1); g.stroke();
g.strokeStyle = '#d3dae2'; g.lineWidth = 1.0;                 // one edge highlight, no more:
g.beginPath();                                                // rungs of cooling rings up a
g.moveTo(bx0 - 0.7, by0 - 0.4);                               // pale bore turned the cannon
g.lineTo(bx1 - 0.7, by1 + 0.6); g.stroke();                   // into a LADDER
g.fillStyle = '#dde3ea';                                      // muzzle brake
g.beginPath(); g.roundRect(bx1 - 2.4, by1 - 1.0, 4.8, 2.6, 0.8); g.fill();
outline(g, '#4a5058');
g.fillStyle = '#3b414a';                                      // a single collar at the breech
g.beginPath(); g.roundRect(bx0 + 0.4, by0 - 6.4, 4.6, 2.0, 0.6); g.fill();
g.fillStyle = '#2c2f35';                                      // receiver box
g.beginPath(); g.roundRect(cx + 0.5, by - 15.2 + fy, 3.7, 3.6, 1.0); g.fill();
outline(g, '#15171a');
// A house band round the breech. The raised cannon is ~70 px of neutral
// steel the figure did not carry before, and it took his remap from
// 22.1% of the sprite to 16.7% — under §1.4's floor for a uniformed
// trooper. Putting the budget back on the GUN (as the Guardian GI's
// tube already carries a trim band) rather than on the sleeves keeps
// his grey-brown tunic in the picture, which is the drab hue that
// separates him from the Rocketeer's orange-lit flight suit.
g.fillStyle = col;
g.beginPath();
g.moveTo(cx + 1.1, by - 17.6 + fy); g.lineTo(cx + 4.7, by - 18.3 + fy);
g.lineTo(cx + 5.5, by - 15.0 + fy); g.lineTo(cx + 1.9, by - 14.3 + fy);
g.closePath(); g.fill(); outline(g, shade(col, 0.40));
g.fillStyle = shade(col, 1.22);
g.fillRect(cx + 1.5, by - 17.4 + fy, 3.2, 1.0);
g.fillStyle = ACC;                                  // amber shell drum
g.beginPath(); g.ellipse(cx + 0.2, by - 14.0 + fy, 1.2, 1.45, 0.2, 0, 6.29); g.fill();
outline(g, '#6a4a10');
g.fillStyle = shade(ACC, 1.26);
g.fillRect(cx - 0.4, by - 14.6 + fy, 1.1, 0.75);
}, true);                                                     // UPRIGHT — see wpn()

face(by - 21.2);
helmet(by - 23.1, 3.15, '#8b929b', 1.0);                      // plain steel helmet
g.fillStyle = '#2a2d33';                                      // chin strap
g.fillRect(cx - 2.7, by - 19.4, 5.4, 0.8);
g.restore();
}

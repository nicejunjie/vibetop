// Iron Frontier — infantry/guardian-gi: the art for one unit.
// Called by bakeInfantry() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.




function drawGuardianGi(C) {
  var ACC = C.ACC, FA = C.FA, HEADX = C.HEADX, T = C.T, TURN = C.TURN, arms = C.arms, by = C.by, col = C.col,
      cx = C.cx, face = C.face, g = C.g, gt = C.gt, helmet = C.helmet, legs = C.legs, sd = C.sd,
      wpn = C.wpn;

// GUARDIAN GI (Directorate). Heavier than the rifleman in every axis:
// a slab vest that squares the shoulders, a deep helmet with a dark
// visor band, and a stubby missile tube braced on the right shoulder
// with an AMBER warhead in the muzzle. The tube is what names him at
// 1:1, so it is drawn long enough to break the body outline.
var GGI_STEEL = '#7f8894';                                    // deep steel helmet
legs(2.7, by - 12.2, 3.6, T.coat, 4.2);

g.save(); g.translate(gt.lean, gt.bob);
g.fillStyle = shade(T.coat, 1.04);                            // olive undersuit torso
g.beginPath();
g.moveTo(cx - 5.4, by - 19.0); g.lineTo(cx + 5.4, by - 19.0);
g.lineTo(cx + 4.9, by - 10.4); g.lineTo(cx - 4.9, by - 10.4);
g.closePath(); g.fill(); outline(g, shade(T.coat, 0.46));
g.fillStyle = shade(T.coat, 0.58);                            // utility belt
g.fillRect(cx - 5.0, by - 12.6, 10.0, 1.7);
// Thigh plates in HOUSE colour, not steel. Adding a missile tube that
// clears the helmet put ~40 px of neutral metal on him and took his
// remap from 24.0% to 21.8% — under §1.4's floor for a uniformed
// trooper, the Flak Trooper's cannon problem exactly. Armour plates are
// where RA2 puts the budget back (rule 6: on the named part, in discrete
// blocks), and they leave the olive leg zone reading as legs.
g.fillStyle = shade(col, 0.15);                                // thigh armour plates
g.beginPath(); g.roundRect(cx - 4.3, by - 10.8, 3.0, 3.0, 0.9); g.fill();
outline(g, shade(col, 0.08));
g.beginPath(); g.roundRect(cx + 1.3, by - 10.8, 3.0, 3.0, 0.9); g.fill();
outline(g, shade(col, 0.08));

// The vest runs collar-to-belt, not collar-to-sternum: the Guardian's
// zone layout is steel helmet / house torso / olive legs, the same
// three zones as the GI beside him, and the TUBE is what separates the
// two (unit-identity-reference.md §2.1).
g.fillStyle = col;
g.beginPath();
g.moveTo(cx - 6.1, by - 20.1); g.lineTo(cx + 6.1, by - 20.1);
g.lineTo(cx + 5.5, by - 11.4); g.lineTo(cx - 5.5, by - 11.4);
g.closePath(); g.fill(); outline(g, shade(col, 0.38));
g.fillStyle = shade(col, 1.22);                               // lit shoulder line
g.fillRect(cx - 5.6, by - 19.6, 11.2, 1.6);
g.fillStyle = shade(col, 0.72);                               // vest seam
g.fillRect(cx - 0.7, by - 18.0, 1.4, 5.2);
g.fillStyle = '#c7ac3e';                                      // brass clasp
g.beginPath(); g.roundRect(cx - 1.6, by - 15.4, 3.2, 2.0, 0.6); g.fill();
outline(g, '#7f6a1c');

arms(6.0, by - 18.0, 3.2, 6.4, col, function (i, x, y) {      // house upper sleeves
  g.fillStyle = col;                                          // slab pauldron
  g.beginPath(); g.roundRect(x - 1.8, y - 1.3, 3.6, 2.9, 0.9); g.fill();
  outline(g, shade(col, 0.4));
  g.fillStyle = shade(col, 1.22);
  g.fillRect(x - 1.5, y - 1.1, 3.0, 1.0);
  g.fillStyle = shade(col, 0.86);                             // armoured gauntlet — pauldron,
  g.beginPath(); g.roundRect(x - 1.6, y + 5.0, 3.2, 2.6, 0.9); g.fill();   // vest, thigh, cuff:
  outline(g, shade(col, 0.42));                               // four discrete blocks (rule 6)
});

// ...and it stays inside `wpn`, which is the RE-TESTED half of C4's
// "the Guardian cannot win peer-vs-self" verdict. `wpn` gives a weapon
// its full length back as the man turns to profile, and that ×2.1 swing
// is why his own cross-bearing self-IoU is the lowest of any trooper
// (0.482) and why a peer always beats it. Drawing the tube in BODY space
// the way the Chrono Legionnaire's rifle now is takes his self-IoU to
// 0.627 and `peerVsSelf.infantry` to **0** — the first time any pass has
// reached it. It was rejected for two reasons, both measured: the tube
// stops being the thing that makes him unlike everyone else, so
// `iou.infantry.mean` goes 0.5334 -> 0.5486, a REGRESSION that lands
// 0.0014 under the 0.55 ceiling and would leave no room for the next
// pass; and the physics is wrong — a launcher braced on the shoulder and
// aimed along the facing really does foreshorten head-on and open out at
// profile, which is the case `wpn` exists for. (A rifle held across the
// chest is the opposite case, and that is why the CLeg moved.)
wpn(function () {
var ry = gt.bob ? 0.4 : 0;                                    // launcher rides the bob
// BRACED AND ANGLED UP, not carried level. §2.1 gives the Guardian "the
// shoulder missile tube, angled ~30 deg up, overhanging the head by 5-6
// px" and it was lying flat across his chest at 20 deg, which put its
// amber warhead at the same height and reach as the Desolator's
// shoulder cannon — the two of them were each other's nearest
// silhouette on the field. The tube now climbs past the helmet line and
// the Desolator's stays level, which is the difference between a
// launcher aimed at aircraft and a beam gun aimed at the ground.
//
// 42 deg, and CLEARING THE HELMET. §2.1's budget is "tube ... clearing
// the helmet by >= 4 px", and at 39 deg the amber warhead topped out at
// by-25.4 while the helmet crown stood at by-26.9 — the tube did not
// clear the helmet at all, it stopped a pixel and a half short of it, so
// the gate measured 3 rows of protrusion. The muzzle now finishes well
// ABOVE the crown (and the crown came down a little to meet it, so he
// does not out-top the Flak Trooper, whose whole identity in §2.2 is
// being the tallest thing on the field).
//
// TWO SHAPES OF THE SAME TRAP, both paid for here. (1) Angle: `spikeOf`
// measures the row EXTENT of what protrudes, and a 3.4-wide tube laid at
// 42 deg is 5.1 px across a row where a vertical one would be 3.4. (2)
// The warhead was a POINTED TRIANGLE, so the first rows of the newly
// cleared spike were its 1-2 px tip and the measured thickness fell from
// 10 to 2.5 — below the 3.64 floor — the instant the tube got clear of
// the helmet. A missile nose is blunt: it is a fat round-capped stroke
// now, 5.0 wide, so the topmost row it owns is already 4 px across.
// THE TUBE HAS TO BE VISIBLE, or the warhead is a floating coin. At
// #33383f it was darker than the vignette on its own cameo plate and
// darker than the helmet it passes, so what the sidebar showed was an
// amber disc hanging in the air beside his head with nothing under it —
// which is not "a soldier with a launcher", it is a bug. Steel, with a
// dark rim to keep it off a light plate: the launcher is the one thing
// that names him at 1:1, so it is the last thing that should disappear.
// AT THE SAME WIDTH. The rim and the body are drawn one inside the other
// on the SAME 3.4 px stroke the tube always had: widening it to 4.4 to
// make room for a rim put ~30 px of neutral steel on him and cost 4.2
// points of house colour (0.301 -> 0.259, measured), which is the exact
// trap the thigh plates above were added to pay off — and it grew his
// mask enough to put `peerVsSelf.infantry` back to 2.
g.strokeStyle = '#22262c'; g.lineWidth = 3.4; g.lineCap = 'round';
g.beginPath();                                                // rim under the tube
g.moveTo(cx - 4.9, by - 13.8 + ry); g.lineTo(cx + 8.4, by - 26.0 - ry); g.stroke();
g.strokeStyle = '#4e5661'; g.lineWidth = 2.4;
g.beginPath();                                                // missile tube
g.moveTo(cx - 4.9, by - 13.8 + ry); g.lineTo(cx + 8.4, by - 26.0 - ry); g.stroke();
g.strokeStyle = '#828c99'; g.lineWidth = 1.1;                 // tube glint
g.beginPath();
g.moveTo(cx - 3.9, by - 14.9 + ry); g.lineTo(cx + 7.5, by - 25.5 - ry); g.stroke();
g.strokeStyle = col; g.lineWidth = 3.6; g.lineCap = 'butt';   // house-colour trim band
g.beginPath();
g.moveTo(cx + 1.9, by - 19.7); g.lineTo(cx + 3.3, by - 21.0); g.stroke();
g.lineCap = 'round';
g.fillStyle = '#2a2e34';                                      // pistol grip + rear vent
g.beginPath(); g.roundRect(cx - 1.6, by - 14.3 + ry, 2.1, 2.8, 0.7); g.fill();
// The shading line used to run ALONG THE AXIS, straight down the middle
// of the 5 px amber stroke, and it cut the nose in two: magnified, the
// warhead read as a gold RING hanging in the air — a coin, not a
// missile, and the single worst thing in the Directorate's sidebar.
// A dark line inside a 5 px shape cannot be shading at this size. It
// becomes a RIM under the amber instead, which is how every other prop
// on the roster is edged.
g.lineCap = 'round';
g.strokeStyle = '#4a3308'; g.lineWidth = 5.0;                 // rim, at the warhead's OWN
g.beginPath();                                                // width — see the tube note
g.moveTo(cx + 7.5, by - 25.2 - ry); g.lineTo(cx + 9.2, by - 27.2 - ry); g.stroke();
g.strokeStyle = ACC; g.lineWidth = 3.9;             // amber warhead: BLUNT, and
g.beginPath();                                                // standing above the crown
g.moveTo(cx + 7.5, by - 25.2 - ry); g.lineTo(cx + 9.2, by - 27.2 - ry); g.stroke();
g.strokeStyle = shade(ACC, 1.28); g.lineWidth = 1.6;
g.beginPath();
g.moveTo(cx + 7.9, by - 26.3 - ry); g.lineTo(cx + 9.1, by - 27.7 - ry); g.stroke();
});

face(by - 21.3);
// The crown sits at by-26.2, a whole pixel lower than it did: the tube
// has to clear it by 4 rows and the Flak Trooper has to stay the tallest
// man in the game, and there is not room in a 45-row sprite for both
// unless the helmet gives some back. A Guardian's helmet is a deep pot
// pulled down over the eyes anyway.
helmet(by - 23.1, 3.1, GGI_STEEL, 1.0);                       // steel, so the VEST is the remap
if (!FA.back) {                                               // dark visor band
g.fillStyle = '#1f2429';
g.beginPath(); g.roundRect(cx + sd * 1.1 / TURN + HEADX - 2.9, by - 22.1, 5.8, 1.6, 0.7); g.fill();
g.fillStyle = 'rgba(200,225,255,.30)';
g.fillRect(cx + sd * 1.1 / TURN + HEADX - 2.4, by - 21.9, 2.3, 0.65);
}
g.restore();
}

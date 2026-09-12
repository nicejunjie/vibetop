// Iron Frontier — infantry/ivan: the art for one unit.
// Called by bakeInfantry() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.

import { ACCENT, outline } from '../../bake/kit.js';
import { shade } from '../../bake/terrain.js';

export function drawIvan(C) {
  var FA = C.FA, HEADX = C.HEADX, JACKET = C.JACKET, T = C.T, TURN = C.TURN, arms = C.arms,
      by = C.by, col = C.col, cx = C.cx, face = C.face, g = C.g, gt = C.gt, legs = C.legs, sd = C.sd;

// CRAZY IVAN, read off soviet-crazy-ivan-frames: a fur USHANKA in
// house colour with the ear flaps hanging, a brown beard filling the
// lower face, and a long dark coat worn OPEN — two house-colour lapel
// panels either side of a pale shirt strip that runs from the collar
// to the belt. The coat skirt hangs past the hips, which is why he
// reads as a civilian in a greatcoat rather than another soldier.
// In his right hand, at hip height, a bound bundle of dynamite.
var SHIRTI = '#cbb79a';
legs(2.5, by - 12.2, 3.4, T.coat, 4.0);

g.save(); g.translate(gt.lean, gt.bob);
// the coat SKIRT first, hanging below the belt over the thighs and
// splitting at the front so the stride still reads through it
// The skirt FLARES past the hips and is a step lighter than the coat
// body, so it separates from the trousers below it. At the coat's own
// value it vanished and he read as another soldier in a tunic.
g.fillStyle = shade(JACKET, 1.16);
g.beginPath();
g.moveTo(cx - 5.0, by - 14.4); g.lineTo(cx + 5.0, by - 14.4);
g.lineTo(cx + 7.8, by - 5.2); g.lineTo(cx + 1.2, by - 6.8);
g.lineTo(cx - 1.2, by - 6.8); g.lineTo(cx - 7.8, by - 5.2);
g.closePath(); g.fill(); outline(g, shade(JACKET, 0.44));
g.fillStyle = shade(JACKET, 1.46);                            // lit left skirt panel
g.beginPath();
g.moveTo(cx - 5.0, by - 14.2); g.lineTo(cx - 3.0, by - 14.2);
g.lineTo(cx - 4.2, by - 6.0); g.lineTo(cx - 7.4, by - 5.4);
g.closePath(); g.fill();
g.fillStyle = 'rgba(0,0,0,.30)';                              // the split at the hem
g.fillRect(cx - 0.7, by - 12.0, 1.4, 4.8);

g.fillStyle = JACKET;                                         // coat body
g.beginPath();
g.moveTo(cx - 5.2, by - 20.0); g.lineTo(cx + 5.2, by - 20.0);
g.lineTo(cx + 5.0, by - 13.6); g.lineTo(cx - 5.0, by - 13.6);
g.closePath(); g.fill(); outline(g, shade(JACKET, 0.52));
g.fillStyle = SHIRTI;                                         // the shirt, between the lapels
g.fillRect(cx - 0.9, by - 20.0, 1.8, 6.6);
g.fillStyle = shade(SHIRTI, 0.78);
g.fillRect(cx - 0.9, by - 20.0, 0.7, 6.6);
g.fillStyle = '#2a2c33';                                      // belt over the shirt
g.fillRect(cx - 5.1, by - 14.4, 10.2, 1.5);
g.fillStyle = '#a98c3c';
g.fillRect(cx - 0.9, by - 14.2, 1.8, 1.1);

// THE MOST SATURATED MAN ON THE FIELD — 47.9% in RA2, the top of the
// whole roster (§2.2 asks for >=35%). The lapels used to leave a 3px
// shirt canyon down the middle and stop at the belt; they close to a
// 1.8px seam now and run to the skirt, so the coat reads as a red vest
// worn open rather than as two red stripes.
// ...and they run a pixel further ONTO the skirt than they did. Two
// reasons, and the second is the honest one. RA2 measures him at 47.9%
// owner colour and §2.2 asks a Soviet greatcoat for >= 35%; ours was at
// 34.1% before this pass and 32.7% after it, because making the dynamite
// legible added neutral tan and diluted the block. The lapel is the
// named part, and lengthening it downward costs NO silhouette at all —
// the coat skirt already owns those rows, so the mask is unchanged and
// his distance from Tanya is not touched a second time.
for (var iv = -1; iv <= 1; iv += 2) {
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(cx + iv * 0.75, by - 20.6); g.lineTo(cx + iv * 5.6, by - 20.6);
  g.lineTo(cx + iv * 5.2, by - 10.2); g.lineTo(cx + iv * 1.15, by - 10.2);
  g.closePath(); g.fill(); outline(g, shade(col, 0.40));
  g.fillStyle = shade(col, iv < 0 ? 1.22 : 0.88);
  g.fillRect(cx + (iv < 0 ? -5.3 : 2.6), by - 20.4, 2.7, 9.9);
}
g.fillStyle = shade(col, 0.66);                               // collar shadow
g.fillRect(cx - 5.3, by - 20.5, 10.6, 0.9);

arms(5.5, by - 19.0, 2.7, 6.4, JACKET, function (i, x, y) {
  g.fillStyle = T.skin;                                       // bare hand
  g.beginPath(); g.roundRect(x - 1.3, y + 5.2, 2.6, 2.2, 0.9); g.fill();
  outline(g, '#8a6440');
  if (i > 0) {
    // THE BUNDLE — and it is the whole point of him. RA2's Crazy Ivan
    // cameo is not a portrait at all: it is a hand holding a fistful of
    // dynamite, and the sticks fill two thirds of the plate. Ours was a
    // 4x4 lump at the hip with TWO lashing bands across four pixels of
    // stick, so at the size it is drawn each visible segment was one
    // pixel and the whole thing read as "something brown in his hand".
    //
    // Taller sticks, ONE band, and lit end caps, so the bundle reads as
    // a fistful of cylinders rather than a block; lifted a pixel so it
    // sits against the dark coat body instead of the lit skirt flare.
    // It stays neutral TAN: RA2's sticks are red-brown, but red is a
    // house colour here, and a saturated red mass on a unit is the
    // impostor case the census exists to catch. Value and shape carry
    // it instead.
    // HELD UP, not at the hip. The first sizing put the bundle at hand
    // height on one side, which is exactly where TANYA's pistols hang:
    // the art gate caught it immediately — her best silhouette match
    // stopped being herself at another bearing and became Ivan (0.7897
    // against her own 0.7827), the first peer-vs-self loss any infantry
    // pass has caused. Raised to belt height it clears her outline, and
    // it also sits further inside the cameo's portrait crop, which is
    // where it needs to be anyway.
    // ONE BODY, ONE OUTLINE, and the sticks are TONE COLUMNS in it. Three
    // separately-outlined 1.42-unit sticks is the shape this used to be,
    // and at STATURE.ivan [0.80,0.88] each one drew 1.25 px wide under a
    // 1 px stroke centred on its own border: the outline ate the stick.
    // MEASURED — not one pixel of #d7b87d, #c6a76e, #a98a58 or the lit
    // caps survived at ANY of the eight bearings, and §2.2's "bundle
    // >= 4x3 at waist height" measured 0x0 against the reference's own
    // ">= 25% value contrast against what is behind it" floor: what was
    // left was hue-37 mush at v 0.12-0.35 on a v 0.15 coat. It read as
    // "something brown in his hand", which is the exact complaint the
    // previous pass wrote down and then fixed by adding DETAIL rather
    // than by removing the strokes that were eating it.
    // Same lesson as the Engineer's coverall and the Tesla Trooper's
    // carapace: at this size the outline is not trim, it is most of the
    // surface, and a 1 px stroke round a 1.25 px fill leaves no fill.
    var dbx = x + 1.2, dby = y + 4.3;
    g.fillStyle = '#c6a76e';                                  // the bound body
    g.beginPath(); g.roundRect(dbx - 2.7, dby, 5.4, 5.2, 0.7); g.fill();
    outline(g, '#4c3a1a');
    // Three sticks read as three TONES, never as seams: a 0.5-unit dark
    // seam is 0.44 px and does to the fill beside it exactly what the
    // per-stick outline did to the stick. Measured, two seams took the
    // block from v 0.81 to v 0.16-0.35 over half its own rows.
    g.fillStyle = '#e0c288';                                  // lit stick, left
    g.fillRect(dbx - 2.45, dby + 0.25, 1.85, 4.7);
    g.fillStyle = '#a98a58';                                  // shaded stick, right
    g.fillRect(dbx + 0.75, dby + 0.25, 1.7, 4.7);
    g.fillStyle = '#f4e2ba';                                  // lit end caps, one band
    g.fillRect(dbx - 2.45, dby + 0.2, 4.9, 1.15);
    g.fillStyle = '#8a7452';                                  // one lashing band, and it is a
    g.fillRect(dbx - 2.8, dby + 2.5, 5.6, 0.75);              // TONE of the sticks rather than
    g.fillStyle = '#b8a077';                                  // the near-black bar that used
    g.fillRect(dbx - 2.8, dby + 2.55, 5.6, 0.3);              // to cut the bundle in half
    g.strokeStyle = '#4a4038'; g.lineWidth = 1.5; g.lineCap = 'round';
    g.beginPath();                                            // fuse, rimmed so it survives
    g.moveTo(dbx + 0.2, dby + 0.2); g.lineTo(dbx + 1.3, dby - 1.5);
    g.lineTo(dbx + 2.5, dby - 2.0); g.stroke();
    g.strokeStyle = '#b6bdc7'; g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(dbx + 0.2, dby + 0.2); g.lineTo(dbx + 1.3, dby - 1.5);
    g.lineTo(dbx + 2.5, dby - 2.0); g.stroke();
  }
});

// The whole head is pushed DOWN a pixel and a half and the beard cut
// back to the chin, because at the first sizing the ushanka's brim met
// the beard and he read as a man in a red balaclava with no face.
face(by - 21.0);
if (!FA.back) {
var ihx = cx + sd * 1.9 / TURN + HEADX;
g.fillStyle = ACCENT.ivan;                                    // beard, chin only
g.beginPath();
g.moveTo(ihx - 2.0, by - 20.4); g.lineTo(ihx + 2.0, by - 20.4);
g.lineTo(ihx + 1.7, by - 19.3); g.lineTo(ihx, by - 18.5);
g.lineTo(ihx - 1.7, by - 19.3); g.closePath(); g.fill();
outline(g, '#3d2a16');
g.fillStyle = shade(ACCENT.ivan, 1.24);
g.fillRect(ihx - 1.7, by - 20.25, 1.5, 0.7);
g.fillStyle = '#3a2b1c';                                      // two eyes under the brim
g.fillRect(ihx - 1.55, by - 21.5, 0.95 * (1 - 0.5 * sd), 0.8);
g.fillRect(ihx + 0.6, by - 21.5, 0.95, 0.8);
}

// the USHANKA: a fur crown with the two ear flaps hanging beside the
// face. Drawn as a plain dome it was indistinguishable from a helmet,
// and the flaps are the whole difference.
// A hat, not a helmet: the crown is SHALLOWER than a dome and the two
// flaps hang clear of it with a dark gap between, which is the whole
// difference from the Conscript's steel pot beside him.
// Two SHORT straps at ear level. Drawn long they closed round the
// cheeks and the hat read as a red balaclava with a beard in it.
for (var uf = -1; uf <= 1; uf += 2) {
  g.fillStyle = shade(col, uf < 0 ? 1.08 : 0.78);
  g.beginPath();                                              // flap: >=2 px clear of the crown (§2.2)
  g.roundRect(cx + uf * 3.80 - 1.25, by - 23.7, 2.5, 3.4, 0.7); g.fill();
  outline(g, shade(col, 0.36));
}
// The HAT carries the owner budget the dynamite dilutes, and it is the
// one place on him that can. Making the bundle legible cost 0.3601 ->
// 0.3491 of remap against §2.2's >= 35%, and the obvious repair —
// running the lapels a pixel further down the skirt — was MEASURED and
// REJECTED: it put blue on his lower body, which is exactly where Yuri's
// robe carries its own, and took `ivan | yuri` from 12.5 to 12.3 against
// a 12.2 friend-vs-foe floor (CELL 96, zoom 1) — the tightest pair in the
// Collective infantry. Yuri's head is BALD. Blue on the ushanka buys the
// same budget in the one band where the two figures do not compete.
g.fillStyle = col;                                            // shallow fur crown
g.beginPath(); g.ellipse(cx, by - 24.1, 2.95, 2.15, 0, Math.PI, 0); g.fill();
g.fillRect(cx - 2.95, by - 24.1, 5.9, 1.7);
outline(g, shade(col, 0.38));
g.fillStyle = shade(col, 1.22);                               // lit fur crown
g.beginPath();
g.ellipse(cx - 1.05, by - 24.9, 1.7, 0.85, -0.35, 0, 6.29); g.fill();
g.fillStyle = shade(col, 0.72);                               // shadowed brow band
g.fillRect(cx - 2.8, by - 22.9, 5.6, 0.75);
g.restore();
}

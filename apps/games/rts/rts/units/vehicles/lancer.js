// Iron Frontier — vehicles/lancer: the art for one unit.
// Called by bakeVehicle() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.

import { isoBox } from '../../bake/kit.js';
import { VACC } from '../../bake/ships.js';
import { shade } from '../../bake/terrain.js';

export function drawLancer(C) {
  var PEDGE = C.PEDGE, RING = C.RING, a = C.a, barrel = C.barrel, bumper = C.bumper, by = C.by,
      chassis = C.chassis, cx = C.cx, dark = C.dark, deck = C.deck, deckPlate = C.deckPlate,
      exhaust = C.exhaust, fenders = C.fenders, fx = C.fx, fy = C.fy, g = C.g,
      gEllipse = C.gEllipse, hull = C.hull, lamp = C.lamp, len = C.len, panel = C.panel,
      prism = C.prism, puck = C.puck, px = C.px, py = C.py, sg = C.sg, tracks = C.tracks,
      wantH = C.wantH, wantT = C.wantT, wid = C.wid;

// GRIZZLY BATTLE TANK — the real eight-bearing rip is a LOW, pale
// grey-blue wedge with a compact hard-edged turret and one long thin gun.
// Its blue remap is restrained: two countable patches on the flank
// and small cheek plates, never a continuous cyan stripe. The pale
// horns ahead of the glacis and the gun overhang carry the silhouette.
if (wantH) {
  // THE FAR FLANK'S PANEL GOES ON BEFORE THE HULL. That is a
  // rendering-ORDER fix, not a tuning knob, and it is the defect the
  // 2026-09-06 clause pass was actually measuring: the loop below used
  // to paint BOTH flanks after the chassis, so the far-side panel --
  // which a real tank hides behind its own hull -- came out painted ON
  // THE DECK, 1 px under the turret cheek, and anti-aliasing between
  // two owner-hued edges fused the two into ONE 21x6 house component.
  // That is why "raising the turret moved the gap by exactly zero":
  // the bottom edge being measured was the FAR PLATE's, which no
  // turret lever can move, and the component the check called "the
  // cheek" was never the cheek. Occlude it and the cheek measures
  // alone (7x5 at the broadside octant), which is also what §1.4's
  // Rule 7 asks for -- two countable slabs, not one band that reads
  // as paint. The mask is untouched by this: both panels are painted
  // over pixels the hull already owns, so the silhouette, and every
  // metric that reads it, is byte-identical.
  function flankPlate(s2) {
    isoBox(g, cx + px * wid * 0.365 * s2 - fx * 1.2,
           by - 0.4 + py * wid * 0.365 * s2 - fy * 1.2,
           len * 0.24, 1.55, 2.35, a, shade(panel, 0.82), PEDGE);   // the rip's blue is a short patch, not a skirt
    isoBox(g, cx + px * wid * 0.345 * s2 - fx * 1.2,
           by - 2.6 + py * wid * 0.345 * s2 - fy * 1.2,
           len * 0.19, 1.25, 0.75, a, shade(hull, 0.92), PEDGE);          // neutral lit cap; owner colour remains one countable flank slab
  }
  tracks(len * 1.04, 3.05, wid * 0.23, '#b0b7c2');
  for (sg = -1; sg <= 1; sg += 2) if (py * sg < 0) flankPlate(sg);
  chassis(cx, by - 1.2, len * 0.84, wid * 0.60, 3.85, hull, dark, 3.6);
  deckPlate(-0.5, len * 0.60, wid * 0.36, 6.5, shade(hull, 1.08));
  isoBox(g, cx + fx * 5.6, by - 6.5 + fy * 5.6, len * 0.20, wid * 0.31, 1.1, a, deck, dark);
  isoBox(g, cx - fx * 9.6, by - 6.5 - fy * 9.6, len * 0.18, wid * 0.29, 1.1, a, deck, dark);
  // TWO discrete house blocks, and only two: ONE applique plate a
  // flank and ONE turret cheek, with a clear gap between them
  // (unit-identity-reference.md 1.4 -- the blue Grizzly wears two
  // panels, never a stripe). The band that ran the whole flank, the
  // glacis wrap and the tail plate are gone with it: an unbroken
  // stripe reads as PAINT and carries no shape, where two countable
  // slabs read as bolted armour (Rule 7). Both blocks stay inside
  // the outline the band already had: the Grizzly is the flattest
  // thing on the ground and its own gun is a 2px sliver, so raising
  // anything here buries the one feature that names it.
  // 2026-09-07. The paragraph above promised "a clear gap between
  // them"; two passes measured one blob and then two blocks 2 px
  // apart, and BOTH were measuring the wrong thing. See `flankPlate`:
  // the far flank's panel was painted after the chassis, so it lay on
  // the deck and fused with the turret cheek, and the "gap" the check
  // reported was the space between the NEAR plate and that fused
  // far-plate-plus-cheek — a beam distance the camera fixes, not a
  // turret height. With the order fixed the cheek stands alone.
  // The plate now grows UPWARD (base by-0.4, height 3.2 -> 4.0, lit
  // cap by-2.6 -> by-3.4) rather than downward: 6 px of minor
  // dimension against §1.4 Rule 6's 4-8 px band, and NOT ONE PIXEL OF
  // SILHOUETTE, because it is painted over hull the mask already owns.
  // That constraint is load-bearing — the two configurations that DO
  // buy the row's literal ">= 4 px" both cost mask (a raised turret
  // cap, +15 opaque px a bearing; or the plate dropped onto the
  // contact-shadow row, +13) and both take `iou.groundCombat.mean`
  // 0.4652 -> 0.4667, giving back more than the whole of that gate's
  // last gain. The arithmetic behind the row: 6 + 4 + 6 is 16 of a
  // 22-row sprite, and rows 0-7 are the turret roof and the barrel
  // and row 21 is the contact shadow, so 14 rows exist for a 16-row
  // budget. §2.3's numbers were corrected to §1.4's own (4-8 px,
  // countable) — full working in docs/per-unit-art-log.md.
  for (sg = -1; sg <= 1; sg += 2) if (py * sg >= 0) flankPlate(sg);   // near flank, on top
  fenders(len * 0.44, 3.2);
  bumper(len * 0.42, wid * 0.20, by - 1.4);
  lamp(cx + fx * len * 0.40 + px * wid * 0.22, by - 4.0 + fy * len * 0.40 + py * wid * 0.22);
  exhaust(cx - fx * len * 0.40, by - 4.4 - fy * len * 0.40);
}
if (wantT) {
  // Low faceted turret: the shoulders taper into the mantlet and the
  // roof stays planar, matching the source's severe voxel silhouette.
  var tx = cx, ty = by - RING;
  // The rip has a slim, hard-edged turret, not a rounded cupola. Keep
  // the plan narrow and let the long barrel carry the forward read.
  prism(tx, ty, [[4.6, -1.45], [4.6, 1.45], [1.2, 3.15], [-3.2, 2.65],
                 [-4.4, 0], [-3.2, -2.65], [1.2, -3.15]],
        2.35, shade(hull, 1.02), dark);   // low angular Grizzly turret
  // The SECOND of the Grizzly's two blocks: one remap cheek a side,
  // set back from the mantlet. It carries the colour the flank band
  // gave up, so the budget holds while the count drops to two.
  for (sg = -1; sg <= 1; sg += 2) if (py * sg >= 0)
    prism(tx - fx * 1.8, ty - 0.4 - fy * 1.8,
          [[0.8, 1.9 * sg], [-2.5, 1.8 * sg], [-2.6, 3.0 * sg], [0.8, 3.35 * sg]],
          1.35, shade(panel, 0.78), PEDGE);
  prism(tx - fx * 0.7, ty - 4.4 - fy * 0.7,                  // chamfered cap
        [[3.9, -1.35], [3.9, 1.35], [0.8, 2.85], [-3.8, 2.25], [-3.8, -2.25], [0.8, -2.85]],
        0.78, shade(hull, 1.06), dark);
  g.strokeStyle = 'rgba(232,240,250,.55)'; g.lineWidth = 1.6;  // light-catch streak
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(tx + fx * 3.6 + px * 1.2, ty - 5.7 + fy * 3.6 + py * 1.2);
  g.lineTo(tx - fx * 3.4 + px * 1.9, ty - 5.7 - fy * 3.4 + py * 1.9);
  g.stroke();
  puck(tx - fx * 2.2, ty - 4.1 - fy * 2.2, 1.05, 1.55,         // low commander hatch
       shade(hull, 0.84), shade(hull, 1.20), dark);
  g.fillStyle = VACC.lancer;                                 // jade vision block
  gEllipse(tx + fx * 2.4 + px * 2.4, ty - 4.9 + fy * 2.4 + py * 2.4, 0.95); g.fill();
  g.fillStyle = shade(VACC.lancer, 1.42);
  gEllipse(tx + fx * 2.4 + px * 2.4, ty - 5.2 + fy * 2.4 + py * 2.4, 0.50); g.fill();
  var lz = [tx + fx * 6.2, ty - 3.1 + fy * 6.2];
  puck(tx + fx * 5.0, ty - 0.2 + fy * 5.0, 1.30, 2.45,         // compact mantlet
       shade(hull, 0.80), shade(hull, 1.08), dark);
  // 3.4 px of tube at zoom 1, not the reference's 2.2. The scale
  // gate (unit-redesign-plan.md 2, option 1) outranks the sprite
  // here: an RA2-faithful 2 px barrel is 1.1 device px at our
  // ZMIN 0.55 and smears away, and the Grizzly's gun is the one
  // feature that names it. Long and thin still, just not invisible.
  barrel(lz[0], lz[1], 18.0, 2.35, 1.5);
}
}

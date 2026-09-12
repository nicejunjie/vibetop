// ─── vehicles/rhino ─── Iron Frontier unit art. Included into rts.html by tools/rts-build.py;
// every free identifier is a local of bakeVehicle() in rts.src.html — see art/units/README.md.

// RHINO — the Collective's line tank, and the most-seen sprite in the
// faction. Where the Lancer is a long low wedge, this is a dense but
// low olive hull with a squat angular turret and a visibly thicker gun.
// The reference carries remap in two rows down
// each flank — a segmented band on the lower skirt AND a second along
// the deck edge — plus a plate across the turret face, which is why
// the Rhino reads as the owner's tank from further away than any
// other unit on the field.
if (wantH) {
  tracks(len * 1.02, 3.45, wid * 0.24, '#b0b7c2');
  // "hull height >= 1.25x the Grizzly's" (unit-identity-reference.md
  // 2.4) was the one line of the Rhino's spec never drawn: at 5.0
  // against the Grizzly's 3.8 it was 1.32x on paper but the Grizzly is
  // now a size class smaller, so the RATIO on screen had collapsed.
  // The hull, the deck it carries and the ring the turret stands on
  // all come up together, which is also what the gate needed: a low
  // lozenge's silhouette swings with its facing, a tall one does not.
  chassis(cx, by - 1.4, len * 0.86, wid * 0.68, 5.15, hull, dark, 3.2);
  deckPlate(-0.6, len * 0.62, wid * 0.42, 6.9, shade(hull, 1.08));
  isoBox(g, cx - fx * 9.2, by - 7.0 - fy * 9.2, len * 0.24, wid * 0.46, 1.35,
         a, deck, dark);                                    // rear engine deck
  for (i2 = -1; i2 <= 1; i2++)                              // louvres on it
    isoBox(g, cx - fx * (9.2 + i2 * 2.4), by - 8.45 - fy * (9.2 + i2 * 2.4),
           0.9, wid * 0.36, 0.72, a, shade(VACC.rhino, 0.62), '#14171c');
  isoBox(g, cx + fx * 6.6, by - 7.0 + fy * 6.6, len * 0.16, wid * 0.32, 1.0,
         a, shade(VACC.rhino, 0.74), dark);                 // driver's plate
  // THREE discrete flank panels a side, with a real gap between them
  // — the red-owner Rhino carries three separate plates down each
  // flank plus two on the turret cheeks, FIVE blocks, and never a
  // stripe (unit-identity-reference.md 1.4). The single band that
  // ran the whole flank and wrapped the glacis is gone: it held the
  // right BUDGET and the wrong PLACEMENT, and a continuous bar
  // carries no shape information at all. Countable plates do, which
  // is also what separates the Rhino from the Tesla Tank's identical
  // olive lozenge without spending a pixel more paint.
  // Spacing and plate length both move with `len` now. They were
  // absolute (7.4 units apart, `len * 0.155` long) and the group's
  // size pass grew this hull 65 -> 70 px, which split the middle
  // plate against the fender and left the check reading SIX blocks
  // with a 2 px sliver and a 1 px gap where it wants five with 3.
  for (sg = -1; sg <= 1; sg += 2)
    for (i2 = -1; i2 <= 1; i2++)
      isoBox(g, cx + px * wid * 0.425 * sg + fx * (i2 * len * 0.268 - 0.6),
             by - 3.55 + py * wid * 0.36 * sg + fy * (i2 * len * 0.268 - 0.6),
             len * 0.128, 1.15, 3.25, a, i2 > 0 ? plit : panel, PEDGE);
  fenders(len * 0.44, 3.25, 0.35, 0.18);
  bumper(len * 0.42, wid * 0.18, by - 1.35);
  lamp(cx + fx * len * 0.40 + px * wid * 0.20, by - 4.65 + fy * len * 0.40 + py * wid * 0.20);
  exhaust(cx - fx * len * 0.41 + px * wid * 0.16, by - 6.0 - fy * len * 0.41 + py * wid * 0.16);
}
if (wantT) {
  // The Rhino is heavier than the Lancer, but its RA2 turret is still
  // a low angular slab. The hull supplies the mass; the turret must
  // never become a round dome sitting on top of it.
  var rtx = cx, rty = by - RING;
  prism(rtx, rty, [[5.6, -2.35], [5.6, 2.35], [1.8, 4.2], [-4.0, 3.7],
                   [-5.5, 0], [-4.0, -3.7], [1.8, -4.2]],
        2.75, shade(hull, 0.96), dark);
  // Blocks four and five: the two turret CHEEKS. Hull-value cheeks
  // with a bar painted across the turret face (the last pass) put
  // the remap where nothing is shaped; the sheet puts it on the two
  // bulges, where it counts as two more plates from every bearing.
  for (sg = -1; sg <= 1; sg += 2) {
    prism(rtx - fx * 0.4, rty - 0.8 - fy * 0.4,
          [[4.0, 3.6 * sg], [-3.7, 3.35 * sg], [-3.8, 4.45 * sg], [4.0, 4.9 * sg]],
          0.9, shade(hull, 0.88), dark);
    prism(rtx - fx * 0.4, rty - 1.55 - fy * 0.4,
          [[4.0, 3.6 * sg], [-3.7, 3.35 * sg], [-3.8, 4.45 * sg], [4.0, 4.9 * sg]],
          2.0, shade(panel, 0.80), PEDGE);
  }
  prism(rtx - fx * 0.8, rty - 4.8 - fy * 0.8,               // chamfered cap
        [[4.2, -1.65], [4.2, 1.65], [0.8, 3.25], [-4.0, 2.55], [-4.0, -2.55], [0.8, -3.25]],
        0.68, shade(hull, 1.08), dark);
  g.strokeStyle = 'rgba(236,242,250,.50)'; g.lineWidth = 1.6;  // light-catch streak
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(rtx + fx * 3.8 + px * 1.4, rty - 6.2 + fy * 3.8 + py * 1.4);
  g.lineTo(rtx - fx * 3.6 + px * 2.1, rty - 6.2 - fy * 3.6 + py * 2.1);
  g.stroke();
  // The reference hatch is a small dark fitting on the low roof. Keep
  // it proud enough to catch light, but never let it turn the Rhino
  // into a dome or tower.
  puck(rtx - fx * 2.5, rty - 4.0 - fy * 2.5, 1.20, 1.75,     // low commander hatch
       shade(hull, 0.84), shade(hull, 1.20), dark);
  g.fillStyle = VACC.rhino;                                 // moss-green vision block
  gEllipse(rtx - fx * 2.5 + px * 0.7, rty - 5.5 - fy * 2.5 + py * 0.7, 0.60); g.fill();
  var rz = [rtx + fx * 5.6, rty - 2.0 + fy * 5.6];
  puck(rtx + fx * 5.35, rty - 0.15 + fy * 5.35, 1.55, 2.45,      // compact mantlet
       shade(hull, 0.80), shade(hull, 1.08), dark);
  // 13.2 -> 16.0. The spec is "a thicker, SHORTER gun than the
  // Grizzly's" (2.4) and 16.0 against the Grizzly's 19.5 is still
  // 0.82x — but 13.2 was 0.68x, which broke rule 4 ("the spike must
  // clear the body, not sit on it"): beside RA2's own plate the Rhino
  // read as a brick with a stub, not as a gun tank. The barrel is the
  // ONE part of a tank that is pure length with no height, so it is
  // also the honest way to buy back aspect.
  // 2026-09-10: 16.0 -> 21.5 and fatter. `rhino.png` (the real
  // eight-bearing rip) shows the gun reaching ~45% of the hull length
  // past the glacis -- the longest tube on any RA2 tank bar the
  // Grizzly's -- and dark. "Thicker, SHORTER than the Grizzly's" was
  // what the cameo suggested, never what the sprite shows.
  barrel(rz[0], rz[1], 16.0, 2.4, 1.5, VACC.rhinoGun);
}

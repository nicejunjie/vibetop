// Iron Frontier unit art — vehicles/apc
// Spliced VERBATIM into apps/games/rts/rts.html between `// @@ART vehicles/apc` and
// `// @@END vehicles/apc` (one pair per @@PART below). Edit HERE, then
//     node apps/games/rts/tools/art-split.js inject
// — or edit rts.html and `extract`; rts-split.test.js fails while they differ.
// Every free identifier (the canvas `g`, the anchor, the helpers, `col`, `sov`…)
// is a local of the enclosing bake function: see apps/games/rts/art/units/README.md.

// @@PART main — inside bakeVehicle() in rts.html
if (wantH) {
  var skHW = wid * 0.48, skST = Math.max(0.5, len * 0.46 - skHW);
  var SK = stadium(cx, by - 0.8, skST, skHW), i4, q0, q1;
  polyPath(SK, 0); g.fillStyle = '#191b16'; g.fill();          // the ground it settles into
  for (i4 = 0; i4 < SK.length; i4++) {                         // the tube's wall
    q0 = SK[i4]; q1 = SK[(i4 + 1) % SK.length];
    var near0 = (q0[1] + q1[1]) / 2 > by - 0.8;
    g.beginPath();
    g.moveTo(q0[0], q0[1]); g.lineTo(q1[0], q1[1]);
    g.lineTo(q1[0], q1[1] - 2.4); g.lineTo(q0[0], q0[1] - 2.4);
    g.closePath();
    g.fillStyle = near0 ? '#4e5241' : '#31342a'; g.fill();
    g.strokeStyle = 'rgba(0,0,0,.42)'; g.lineWidth = 0.8; g.stroke();
  }
  polyPath(SK, -2.4); g.fillStyle = '#666a52'; g.fill();       // the crown of the tube
  g.strokeStyle = '#23261e'; g.lineWidth = 0.8; g.stroke();
  // THE HOVERCRAFT IS A PANCAKE. She measured 53x49 — aspect 1.08,
  // the roundest thing afloat — because a 7.4 hull on a 2.8 skirt
  // carried an 11.6 deck, a 5.6 bridge and then a 4-unit MAST with a
  // lamp on it, and that 1-px mast alone was 7 px of the bounding box.
  // Same defect as the Typhoon's periscopes: the thin decorative thing
  // sets the height. Everything comes down about a third, and the hull
  // grows to 34 x 19, which is the plan a landing hovercraft has.
  isoBox(g, cx, by - 2.6, len * 0.74, wid * 0.62, 5.6, a, hull, PEDGE);
  deckPlate(0, len * 0.66, wid * 0.54, 8.8, shade(hull, 1.12));
  // one rubbing strake a flank, in the owner's colour
  for (sg = -1; sg <= 1; sg += 2)
    isoBox(g, cx + px * wid * 0.32 * sg, by - 6.4 + py * wid * 0.32 * sg,
           len * 0.70, 0.9, 1.5, a, panel, PEDGE);
  // THE OPEN CARGO WELL, to starboard of the bridge — and §2.4 does
  // not merely mention it, it IS the unit: "a fat inflatable skirt
  // round a RED (HOUSE) INNER DECK with visible seat blocks", budget
  // "deck cavity visible as a house-hued INTERIOR". This was one flat
  // #1d201a plate — value 0.11, the darkest thing on the craft — so
  // the named identity feature was painted near-black, and every blue
  // pixel a player could see was on the two rubbing strakes and the
  // bridge roof. At 13.0% owner colour she read as an olive hull with
  // trim stripes, which is the Landing Craft's read, not a troop
  // hovercraft's. (Same shape of miss as the Tesla Trooper's carapace:
  // a clause with no measurement behind it, and the comment beside it
  // already naming the part correctly.)
  //
  // The dark box stays as the COAMING — a cavity needs a rim or the
  // colour is just another stripe — and the floor inside it goes to
  // the owner, with two thwarts across it so it reads as a well with
  // seats and not as a painted panel. All of it sits inside the hull
  // outline at z ~ +1, so not one silhouette pixel moves.
  var wlx = cx + fx * 1.0 - px * wid * 0.16, wly = by - 9.0 + fy * 1.0 - py * wid * 0.16;
  isoBox(g, wlx, wly, len * 0.50, wid * 0.24, 1.0, a, '#1d201a', PEDGE);
  isoBox(g, wlx, wly - 0.9, len * 0.44, wid * 0.15, 0.5, a, panel, PEDGE);
  for (i2 = -1; i2 <= 1; i2 += 2)                              // two seat thwarts
    isoBox(g, wlx + fx * len * 0.13 * i2, wly - 1.2 + fy * len * 0.13 * i2,
           1.1, wid * 0.15, 1.1, a, shade(deck, 0.72), PEDGE);
  // the bridge block, running fore-and-aft along the port side
  var brx = cx - fx * 2.4 + px * wid * 0.20, bry = by - 8.6 - fy * 2.4 + py * wid * 0.20;
  isoBox(g, brx, bry, len * 0.46, wid * 0.26, 4.2, a, shade(hull, 0.88), PEDGE);
  isoBox(g, brx, bry - 4.4, len * 0.42, wid * 0.22, 1.2, a, panel, PEDGE);
  isoBox(g, brx + fx * 6.0, bry - 2.2 + fy * 6.0, 1.0, wid * 0.20, 2.4, a, '#232a33', '#0e1115');
  g.fillStyle = 'rgba(190,210,228,.36)';
  g.beginPath(); g.ellipse(brx + fx * 6.4, bry - 3.6 + fy * 6.4, 1.8, 0.8, 0, 0, 6.29); g.fill();
  g.strokeStyle = '#8d94a0'; g.lineWidth = 0.9;                 // a short mast with a lamp
  g.beginPath();
  g.moveTo(brx - fx * 5.0, bry - 5.4 - fy * 5.0);
  g.lineTo(brx - fx * 5.0, bry - 8.0 - fy * 5.0); g.stroke();
  g.fillStyle = '#f2d98a';
  g.beginPath(); g.ellipse(brx - fx * 5.0, bry - 8.2 - fy * 5.0, 0.9, 0.8, 0, 0, 6.29); g.fill();
  // the bow ramp, hinged down over the skirt
  isoBox(g, cx + fx * len * 0.40, by - 3.8 + fy * len * 0.40,
         len * 0.13, wid * 0.50, 1.4, a, shade(hull, 0.78), PEDGE);
  g.strokeStyle = shade(hull, 1.55); g.lineWidth = 1.1;
  g.beginPath();
  g.moveTo(cx + fx * len * 0.46 + px * wid * 0.25, by - 4.8 + fy * len * 0.46 + py * wid * 0.25);
  g.lineTo(cx + fx * len * 0.46 - px * wid * 0.25, by - 4.8 + fy * len * 0.46 - py * wid * 0.25);
  g.stroke();
  // two big ducted lift fans across the stern, standing on the hull
  for (sg = -1; sg <= 1; sg += 2) {
    var fnx = cx - fx * len * 0.30 + px * wid * 0.22 * sg;
    var fny = by - 8.2 - fy * len * 0.30 + py * wid * 0.22 * sg;
    puck(fnx, fny, 3.1, 2.6, shade(deck, 0.82), shade(deck, 1.08), PEDGE);
    g.fillStyle = '#15171b';
    gEllipse(fnx, fny - 2.6, 2.3); g.fill();
    g.strokeStyle = 'rgba(186,194,204,.66)'; g.lineWidth = 1.0;
    for (i2 = 0; i2 < 4; i2++) {
      var fna = i2 * 1.5708;
      g.beginPath(); g.moveTo(fnx, fny - 2.6);
      g.lineTo(fnx + Math.cos(fna) * 2.2 * ER, fny - 2.6 + Math.sin(fna) * 2.2 * ERY);
      g.stroke();
    }
    g.strokeStyle = STEEL; g.lineWidth = 0.9;
    gEllipse(fnx, fny - 2.6, 2.35); g.stroke();
  }
}

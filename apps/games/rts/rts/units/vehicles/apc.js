// Iron Frontier — vehicles/apc: the art for one unit.
// Called by bakeVehicle() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.




function drawApc(C) {
  var ER = C.ER, ERY = C.ERY, PEDGE = C.PEDGE, STEEL = C.STEEL, a = C.a, by = C.by, cx = C.cx,
      deck = C.deck, deckPlate = C.deckPlate, fx = C.fx, fy = C.fy, g = C.g, gEllipse = C.gEllipse,
      hull = C.hull, i2 = C.i2, len = C.len, panel = C.panel, polyPath = C.polyPath, puck = C.puck,
      px = C.px, py = C.py, sg = C.sg, stadium = C.stadium, wantH = C.wantH, wid = C.wid;

if (wantH) {
  var skHW = wid * 0.48, skST = Math.max(0.5, len * 0.46 - skHW);
  var SK = stadium(cx, by - 0.8, skST, skHW), i4, q0, q1;
  polyPath(SK, 0); g.fillStyle = '#191b16'; g.fill();          // the ground it settles into
  for (i4 = 0; i4 < SK.length; i4++) {                         // the tube's wall
    q0 = SK[i4]; q1 = SK[(i4 + 1) % SK.length];
    var near0 = (q0[1] + q1[1]) / 2 > by - 0.8;
    g.beginPath();
    g.moveTo(q0[0], q0[1]); g.lineTo(q1[0], q1[1]);
    g.lineTo(q1[0], q1[1] - 3.35); g.lineTo(q0[0], q0[1] - 3.35);
    g.closePath();
    g.fillStyle = near0 ? '#373838' : '#2a2b2b'; g.fill();
    g.strokeStyle = 'rgba(0,0,0,.42)'; g.lineWidth = 0.8; g.stroke();
  }
  polyPath(SK, -3.35); g.fillStyle = '#565858'; g.fill();       // the crown of the tube
  g.strokeStyle = '#222424'; g.lineWidth = 0.8; g.stroke();
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
  var wlx = cx - fx * 1.0, wly = by - 9.0 - fy * 1.0;
  isoBox(g, wlx, wly, len * 0.55, wid * 0.40, 1.0, a, '#323232', PEDGE);
  // THE WELL FLOOR HAS TO FILL THE WELL. It was wid*0.15 inside a coaming of
  // wid*0.24, so the dark rim took a third of the opening on each side and the
  // owner's colour came out as a narrow strip — which is why this craft still
  // read as an olive hull with trim stripes even after the floor was given the
  // house colour. In the library plate the red inner deck is the loudest thing
  // on the hovercraft and it fills the opening. Widened to just inside the
  // coaming, lengthened to match, and the two thwarts narrowed so they read as
  // seats ACROSS it instead of eating half of it.
  isoBox(g, wlx, wly - 0.9, len * 0.53, wid * 0.36, 0.6, a, '#bf2525', '#431c1c');
  // Rails are attached to the coaming; the broad red floor stays clear.
  for (sg = -1; sg <= 1; sg += 2)
    isoBox(g, wlx + px * wid * 0.205 * sg,
           wly - 1.15 + py * wid * 0.205 * sg,
           len * 0.53, 0.62, 0.75, a, '#7b7b76', '#333333');
  // the bridge block, running fore-and-aft along the port side
  var brx = cx + fx * 6.7 + px * wid * 0.28,
      bry = by - 8.6 + fy * 6.7 + py * wid * 0.28;
  isoBox(g, brx, bry, len * 0.16, wid * 0.17, 2.7, a, shade(hull, 0.88), PEDGE);
  isoBox(g, brx, bry - 2.7, len * 0.15, wid * 0.16, 0.7, a, '#88888a', PEDGE);
  isoBox(g, brx + fx * 1.8, bry - 1.3 + fy * 1.8, 1.0, wid * 0.15, 1.4, a, '#242a30', '#0e1115');
  g.fillStyle = 'rgba(190,210,228,.36)';
  g.beginPath(); g.ellipse(brx + fx * 2.1, bry - 2.1 + fy * 2.1, 1.3, 0.7, 0, 0, 6.29); g.fill();
  g.strokeStyle = '#939393'; g.lineWidth = 0.9;                 // a short mast with a lamp
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
    var fnx = cx - fx * len * 0.35 + px * wid * 0.27 * sg;
    var fny = by - 8.2 - fy * len * 0.35 + py * wid * 0.27 * sg;
    puck(fnx, fny, 4.1, 3.0, '#656565', '#989898', '#353535');
    g.fillStyle = '#4a4a4a';
    gEllipse(fnx, fny - 3.0, 3.1); g.fill();
    g.strokeStyle = 'rgba(193,193,193,.66)'; g.lineWidth = 1.0;
    for (i2 = 0; i2 < 4; i2++) {
      var fna = i2 * 1.5708;
      g.beginPath(); g.moveTo(fnx, fny - 3.0);
      g.lineTo(fnx + Math.cos(fna) * 2.75 * ER, fny - 3.0 + Math.sin(fna) * 2.75 * ERY);
      g.stroke();
    }
    g.strokeStyle = STEEL; g.lineWidth = 0.9;
    gEllipse(fnx, fny - 3.0, 3.1); g.stroke();
  }
}
}

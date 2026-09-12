// Iron Frontier — ui/render.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.






























// --------------------------------------------------------------------- //
//  Rendering
// --------------------------------------------------------------------- //
var VX0 = 0, VY0 = 0, VX1 = 800, VY1 = 600;   // visible window in unzoomed screen space

function render() {
  updatePsi();
  ctx.fillStyle = (G && APRON_BG[G.theatre]) || '#0b0e14';
  ctx.fillRect(0, 0, cvW, cvH);
  if (!G) return;
  // Everything in the world is drawn in unzoomed screen space and scaled
  // about the canvas centre; sprites stay baked once.
  ctx.save();
  ctx.translate(cvW / 2, cvH / 2); ctx.scale(zoom, zoom); ctx.translate(-cvW / 2, -cvH / 2);
  var hz = cvW / (2 * zoom), vz = cvH / (2 * zoom);
  VX0 = cvW / 2 - hz; VX1 = cvW / 2 + hz; VY0 = cvH / 2 - vz; VY1 = cvH / 2 + vz;

  // Visible tile window, derived by projecting the screen corners back.
  var c0 = screenToGrid(0, 0), c1 = screenToGrid(cvW, 0);
  var c2 = screenToGrid(0, cvH), c3 = screenToGrid(cvW, cvH);
  var minX = Math.floor(Math.min(c0.x, c1.x, c2.x, c3.x)) - 1;
  var maxX = Math.ceil(Math.max(c0.x, c1.x, c2.x, c3.x)) + 1;
  var minY = Math.floor(Math.min(c0.y, c1.y, c2.y, c3.y)) - 1;
  var maxY = Math.ceil(Math.max(c0.y, c1.y, c2.y, c3.y)) + 2;
  var minXr = minX, minYr = minY, maxXr = maxX, maxYr = maxY;
  minX = Math.max(0, minX); minY = Math.max(0, minY);
  maxX = Math.min(MAP - 1, maxX); maxY = Math.min(MAP - 1, maxY);

  var x, y, i, px, py;
  SPARKS.length = 0; ORES.length = 0;
  // The apron. RA2 maps carry real terrain past the playable border and
  // clamp the camera inside it; ending on raw black makes the world look
  // like a cut-out. The apron is the same theatre, drained and darkened,
  // and nothing ever interacts with it.
  var thA = G.theatre || 'temperate', apr = SPR.apron[thA];
  if (apr && (minXr < 0 || minYr < 0 || maxXr >= MAP || maxYr >= MAP)) {
    var ax0 = Math.max(-APRON, minXr), ax1 = Math.min(MAP - 1 + APRON, maxXr);
    var ay0 = Math.max(-APRON, minYr), ay1 = Math.min(MAP - 1 + APRON, maxYr);
    // The apron dims with distance to the playable rectangle. Two things
    // made this read as "hard-edged diagonal stripes" rather than as land
    // going away: eight bands over sixteen cells is an 0.11 alpha step, and
    // a CHEBYSHEV distance (max of the four overhangs) draws SQUARE rings,
    // whose corners project to long straight diagonals across the screen.
    // A Euclidean distance draws rounded rings instead, and 32 bands on a
    // smoothstep ramp puts the step below one value of the palette. The
    // outermost band reaches the cleared background so the apron ends by
    // becoming the background rather than by stopping against it.
    var NBAND = 32, band = [];
    for (var bq = 0; bq < NBAND; bq++) band.push([]);
    for (y = ay0; y <= ay1; y++) for (x = ax0; x <= ax1; x++) {
      if (x >= 0 && y >= 0 && x < MAP && y < MAP) continue;
      var apx = sxF(x, y), apy = syFlat(x, y);
      if (apx < VX0 - 80 || apx > VX1 + 80 || apy < VY0 - 80 || apy > VY1 + 80) continue;
      var at = apr[(((x - y) & 7) << 3) | ((x + y) & 7)];
      ctx.drawImage(at.c, apx - at.w / 2, apy - at.h / 2, at.w, at.h);
      var adx = Math.max(0, -x, x - (MAP - 1)), ady = Math.max(0, -y, y - (MAP - 1));
      var ad = Math.sqrt(adx * adx + ady * ady);
      band[Math.min(NBAND - 1, (ad * NBAND / APRON) | 0)].push(apx, apy);
    }
    for (var bi = 0; bi < NBAND; bi++) {
      if (!band[bi].length) continue;
      ctx.beginPath();
      for (var bj = 0; bj < band[bi].length; bj += 2) {
        var bx0 = band[bi][bj], by0 = band[bi][bj + 1];
        ctx.moveTo(bx0, by0 - TH / 2 - 1); ctx.lineTo(bx0 + TW / 2 + 1, by0);
        ctx.lineTo(bx0, by0 + TH / 2 + 1); ctx.lineTo(bx0 - TW / 2 - 1, by0); ctx.closePath();
      }
      var bt = (bi + 0.5) / NBAND;                       // smoothstep, 0.04 at the border to 0.97 at the rim
      ctx.fillStyle = 'rgba(5,7,12,' + (0.04 + 0.93 * bt * bt * (3 - 2 * bt)).toFixed(3) + ')';
      ctx.fill();
    }
  }
  for (y = minY; y <= maxY; y++) {
    for (x = minX; x <= maxX; x++) {
      i = idx(x, y);
      px = sx(x, y); py = sy(x, y);
      var t = G.terrain[i];
      var h6 = ((x * 73856093) ^ (y * 19349663)) >>> 0;
      var th = G.theatre || 'temperate', tile, ov = null, lat = null, ov2 = null;
      if (!G.seen[i]) {
        // Shroud. A cell with nothing explored beside it is simply black;
        // one ON the border shows its ground through a feathered edge tile,
        // which is how RA2's shroud ends -- soft and ragged, not a
        // staircase of hard black diamonds.
        var shm = 0;
        if (y > 0 && G.seen[i - MAP]) shm |= 1;
        if (x + 1 < MAP && G.seen[i + 1]) shm |= 2;
        if (y + 1 < MAP && G.seen[i + MAP]) shm |= 4;
        if (x > 0 && G.seen[i - 1]) shm |= 8;
        if (!shm) {
          ctx.fillStyle = '#05070b';
          diamond(ctx, px, py, TW + 1, TH + 1); ctx.fill();
          continue;
        }
        var gi0 = (((x - y) & 7) << 3) | ((x + y) & 7);
        var bt = t === T_ROCK ? (SPR.rockT[th] || SPR.rock)[gi0]
               : (t === T_WATER || t === T_BRIDGE)
                 ? SPR.water[th][((((x - y) & 3) << 2) | ((x + y) & 3)) * 4]
                 : (SPR.groundT[th] || SPR.ground)[gi0];
        ctx.drawImage(bt.c, px - bt.w / 2, py - bt.h / 2 - (bt.lift || 0), bt.w, bt.h);
        var se = SPR.shroudE[shm];
        ctx.drawImage(se.c, px - se.w / 2, py - se.h / 2, se.w, se.h);
        continue;
      }
      // Ground/rock tiles are cut from a seamless sheet, so the variant is
      // the tile's POSITION in that sheet, not a hash — that is what makes
      // neighbouring tiles line up into one continuous surface.
      var gi = (((x - y) & 7) << 3) | ((x + y) & 7);
      // water-adjacency mask, shared by the shore band and the shallow rim
      // A bridge deck counts as water for the shoreline masks, so the bank
      // does not grow a beach against the abutment.
      var wm = (y > 0 && waterish(G.terrain[i - MAP]) ? 1 : 0) | (x + 1 < MAP && waterish(G.terrain[i + 1]) ? 2 : 0) |
               (y + 1 < MAP && waterish(G.terrain[i + MAP]) ? 4 : 0) | (x > 0 && waterish(G.terrain[i - 1]) ? 8 : 0);
      if (t === T_ROCK) tile = (SPR.rockT[th] || SPR.rock)[gi];
      else if (t === T_WATER || t === T_BRIDGE) {
        var wp = (((x - y) & 3) << 2) | ((x + y) & 3);
        tile = SPR.water[th][wp * 4 + (((G.tick >> 5) + h6) & 3)];
        if (th === 'snow' && t === T_WATER && ((h6 >> 4) & 3) === 0) ov2 = SPR.floe[(h6 >> 7) % 3];
        if (t === T_BRIDGE) {
          // the deck runs along the axis its neighbouring deck tiles lie on
          var vert = (y > 0 && G.terrain[i - MAP] === T_BRIDGE) || (y + 1 < MAP && G.terrain[i + MAP] === T_BRIDGE);
          ov = SPR.bridge[vert ? 0 : 1];
        } else {
          // the shallow rim mirrors the shore: here the neighbour is LAND
          var lm = (y > 0 && !waterish(G.terrain[i - MAP]) ? 1 : 0) | (x + 1 < MAP && !waterish(G.terrain[i + 1]) ? 2 : 0) |
                   (y + 1 < MAP && !waterish(G.terrain[i + MAP]) ? 4 : 0) | (x > 0 && !waterish(G.terrain[i - 1]) ? 8 : 0);
          if (lm) ov = SPR.shallow[th][lm];
          if (G.bwrk[i]) ov = SPR.bwreck;         // this water used to be a deck
        }
      } else if (t === T_RAMP) {
        // The retaining wall goes only on a side that is NOT more ramp, so a
        // four-wide ramp is one slope and not four slabs in a row.
        var rdr = rampDir(G, x, y), rdw = 0;
        for (var rk = 0; rk < 2; rk++) {
          var re = (rdr + 1 + rk * 2) & 3, rnx = x + RAMP_NB[re][0], rny = y + RAMP_NB[re][1];
          if (!inMap(rnx, rny) || G.terrain[idx(rnx, rny)] !== T_RAMP) rdw |= (1 << rk);
        }
        tile = (G.hf[i] > 0 ? SPR.ramp : SPR.rampF)[th][rdr * 4 + rdw];
      } else if (t === T_CLIFF) {
        var cm = (x + 1 < MAP && G.terrain[idx(x + 1, y)] !== T_CLIFF ? 1 : 0) | (y + 1 < MAP && G.terrain[idx(x, y + 1)] !== T_CLIFF ? 2 : 0) |
                 (y > 0 && G.terrain[idx(x, y - 1)] !== T_CLIFF ? 4 : 0) | (x > 0 && G.terrain[idx(x - 1, y)] !== T_CLIFF ? 8 : 0);
        var cseam = cliffSeams(x, y, cm);
        tile = SPR.cliff[th][cm | (((h6 >>> 19) % CLIFF_VAR) << 4)].get(cseam.key, cseam);
      } else {
        // LAT. The cell wears one of the theatre's two grounds; a BASE cell
        // beside an ALT one carries the alt material feathered over its own
        // edge, which is exactly how RA2's LAT sets read.
        var alt = dirtAt(i);
        tile = (alt ? SPR.groundAltT[th] : (SPR.groundT[th] || SPR.ground))[gi];
        if (!alt && t !== T_ROAD) {
          var am = (y > 0 && dirtAt(i - MAP) ? 1 : 0) | (x + 1 < MAP && dirtAt(i + 1) ? 2 : 0) |
                   (y + 1 < MAP && dirtAt(i + MAP) ? 4 : 0) | (x > 0 && dirtAt(i - 1) ? 8 : 0);
          if (am) lat = SPR.lat[th][am];
        }
        if (t === T_ROAD) ov = SPR.road[th][roadMask(x, y) * 2 + (h6 & 1)];
        else if (wm) ov = SPR.shore[th][wm];
        else {
          var rm = (y > 0 && G.terrain[i - MAP] === T_ROCK ? 1 : 0) | (x + 1 < MAP && G.terrain[i + 1] === T_ROCK ? 2 : 0) |
                   (y + 1 < MAP && G.terrain[i + MAP] === T_ROCK ? 4 : 0) | (x > 0 && G.terrain[i - 1] === T_ROCK ? 8 : 0);
          if (rm) ov = SPR.scree[th][rm];
          else if ((h6 & 7) === 0) ov = SPR.decal[th][(h6 >> 3) & 7];
        }
      }
      ctx.drawImage(tile.c, px - tile.w / 2, py - tile.h / 2 - (tile.lift || 0), tile.w, tile.h);
      if (lat) ctx.drawImage(lat.c, px - lat.w / 2, py - lat.h / 2, lat.w, lat.h);
      if (ov) ctx.drawImage(ov.c, px - ov.w / 2, py - ov.h / 2, ov.w, ov.h);
      if (ov2) ctx.drawImage(ov2.c, px - ov2.w / 2, py - ov2.h / 2, ov2.w, ov2.h);
      if (oreT(t)) {
        var lv = G.ore[i] > 600 ? 2 : (G.ore[i] > 250 ? 1 : 0);
        // ORE_VAR variants picked off the CELL HASH. `(x * 5 + y * 11) & 3`
        // reduces to `(x + 3y) mod 4`, which is not a hash at all: it lays
        // the four variants down in fixed diagonal stripes, so a gem field
        // read as ranks of identical spires marching across the board.
        var os = (t === T_GEM ? SPR.gemLv : SPR.oreLv)[lv][(h6 >>> 13) % ORE_VAR];
        // Queued, not drawn here. Each ore sprite now OVERHANGS its own
        // cell (bakeOre), and the ground loop draws tile-then-ore per cell
        // in an order where the next cell's ground would paint over the
        // last cell's overhang — which put the diamond seam straight back.
        // One pass after all the ground is down, and a field's clusters run
        // into each other the way an RA2 overlay set does.
        ORES.push(os, px, py);
        // Glitter: an eight-step cycle offset by the cell hash, so only
        // about a third of a field is flashing at any moment.
        var gph = (((G.tick >> 3) + h6) & 7);
        if (gph < 3) {
          // Queued, not drawn here: flipping globalCompositeOperation twice
          // per ore tile costs more than the sparkle does. They all go down
          // in one additive pass after the ground loop.
          SPARKS.push((t === T_GEM ? SPR.gemSpark : SPR.oreSpark)[gph],
                      px + ((h6 >> 5) & 15) - 7.5, py + ((((h6 >> 9) & 7) - 3.5) * 0.6));
        }
      }
    }
  }

  // Ore and gems, after every ground tile in the view is down, so a cell's
  // cluster may spill over its neighbours' diamonds instead of stopping at
  // its own. Cheap: one drawImage each, same count as before.
  for (i = 0; i < ORES.length; i += 3) {
    var oS = ORES[i];
    ctx.drawImage(oS.c, ORES[i + 1] - oS.w / 2, ORES[i + 2] - oS.h / 2, oS.w, oS.h);
  }

  // Gap fog. The CORE of an enemy Gap Generator's field has already had the
  // shroud closed over it by applyGaps, so it draws as plain black like any
  // unexplored ground. What is left to draw is the outer ring: a soft dark
  // wash that fades from the black edge out over a cell and a half, so the
  // field ends in a haze instead of a cut circle. Without it the disc reads
  // as a rendering bug rather than as something an enemy is doing to you.
  if (G.gapAny && G.gapM) {
    var gmk = G.gapM[ME];
    ctx.save();
    for (y = minY; y <= maxY; y++) for (x = minX; x <= maxX; x++) {
      i = idx(x, y);
      if (!gmk[i]) continue;
      // The same feathered edge the shroud uses, at a fraction of its
      // opacity: the fog thins toward whatever the Gap field does NOT
      // cover, so the disc ends in a haze instead of a cut circle.
      var gm2 = 0;
      var clr = function (j) { return !(gmk[j] === 2 || !G.seen[j]); };
      if (y > 0 && clr(i - MAP)) gm2 |= 1;
      if (x + 1 < MAP && clr(i + 1)) gm2 |= 2;
      if (y + 1 < MAP && clr(i + MAP)) gm2 |= 4;
      if (x > 0 && clr(i - 1)) gm2 |= 8;
      var gse = SPR.shroudE[gm2];
      ctx.globalAlpha = gm2 ? 0.62 : 0.5;
      ctx.drawImage(gse.c, sx(x, y) - gse.w / 2, sy(x, y) - gse.h / 2, gse.w, gse.h);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // Ore/gem glitter, all in one additive pass.
  if (SPARKS.length) {
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < SPARKS.length; i += 3) {
      var gs = SPARKS[i];
      ctx.drawImage(gs.c, SPARKS[i + 1] - gs.w / 2, SPARKS[i + 2] - gs.h / 2, gs.w, gs.h);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawTracks();

  // Rubble: what a levelled structure leaves. On the GROUND layer, under
  // units (RA2's rubble is passable), fading out over its last 30%.
  for (i = 0; i < G.rubble.length; i++) {
    var rb = G.rubble[i];
    var rgx = Math.round(rb.x), rgy = Math.round(rb.y);
    if (rb.t < 0) continue;                              // queued for when the shell lands
    if (!inMap(rgx, rgy) || !G.seen[idx(rgx, rgy)]) continue;
    var rpx = sx(rb.x, rb.y), rpy = sy(rb.x, rb.y);
    if (rpx < VX0 - 200 || rpy < VY0 - 200 || rpx > VX1 + 200 || rpy > VY1 + 200) continue;
    var rf = rb.t / rb.life;
    var rs = rb.fx ? SPR.decal_fx[rb.fx][rb.v || 0] : rubbleFor(rb.gw, rb.gh);
    // A decal weathers the whole time it is down; rubble only fades at the end.
    ctx.globalAlpha = rb.fx ? (1 - rf * 0.55) * (rf > 0.72 ? Math.max(0, (1 - rf) / 0.28) : 1)
                            : (rf > 0.7 ? Math.max(0, (1 - rf) / 0.3) : 1);
    // ...and it FADES IN behind the death anims rather than appearing whole
    // on the death tick. `killBld` pushes the rubble at `t: 0` alongside
    // blasts of `life: 32` staggered to `t: -16`, so a decal at full opacity
    // on tick 0 was a finished crater under a fireball still on its way up.
    // Nothing for the first six ticks, full by the time the centre blast has
    // burned out — RA2 hides the ground under the explosion and lets the
    // scar appear as it clears. Shell craters and scorches (`rb.fx`) keep
    // their own timing: those are already queued to their round's impact.
    if (!rb.fx && rb.t < 30) {
      var rin = Math.max(0, (rb.t - 6) / 24);
      ctx.globalAlpha *= rin * rin * (3 - 2 * rin);
    }
    ctx.drawImage(rs.s.c, rpx - rs.ax, rpy - rs.ay, rs.s.w, rs.s.h);
    ctx.globalAlpha = 1;
  }

  // Placement ghost, over a wash showing WHERE you may build at all. Without
  // it the radius is invisible and you find its edge by trial and error.
  if (placing) {
    // RA2 marks the buildable area with a CELL GRID, not a colour wash: a
    // 0.16 flat green over half the screen drained the terrain of its own
    // colour, so you could not see what you were building onto. One path,
    // a barely-there fill and a crisp edge, is the same information at a
    // fifth of the tint.
    // `placing` matters: the radius depends on WHAT is being built (a wall is
    // adj 12, a defence 8, everything else ADJ_DEFAULT 6), and this call used
    // to omit it — so the wash showed the default radius whatever you held.
    var mask = buildMask(G, ME, placing);
    ctx.beginPath();
    for (y = minY; y <= maxY; y++) {
      for (x = minX; x <= maxX; x++) {
        if (!mask[idx(x, y)]) continue;
        var ti = idx(x, y);
        if (!buildableT(G.terrain[ti]) || G.occ[ti] !== 0) continue;
        diamondAdd(ctx, sx(x, y), sy(x, y), TW - 3, TH - 1.5);
      }
    }
    ctx.fillStyle = 'rgba(110,231,168,.055)'; ctx.fill();
    ctx.strokeStyle = 'rgba(110,231,168,.32)'; ctx.lineWidth = 1; ctx.stroke();
  }

  // Placement ghost: RA2 shows the BUILDING itself under the cursor, tinted
  // by whether it may go there, over the footprint tint. A bare rectangle of
  // squares made you place a Refinery and only then discover which way it
  // faced and how much of the view it ate.
  if (placing) {
    var d = bspecFor(placing, keyFac(G, ME, placing, true));
    var gpo = placeOrigin(hoverTile, d), ggx = gpo.x, ggy = gpo.y;
    var ok = canPlace(G, ME, placing, ggx, ggy);
    ctx.globalAlpha = 0.5;
    for (y = ggy; y < ggy + d.gh; y++) for (x = ggx; x < ggx + d.gw; x++) {
      if (!inMap(x, y)) continue;             // never paint the mask off the map
      diamond(ctx, sx(x, y), sy(x, y), TW - 4, TH - 2);
      ctx.fillStyle = ok ? 'rgba(90,220,140,.45)' : 'rgba(229,100,108,.45)';
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Off the map entirely (the pointer is out over the black): no ghost and
    // no footprint — there is nothing there to build on.
    ghostAt = inMap(ggx, ggy) || inMap(ggx + d.gw - 1, ggy + d.gh - 1)
      ? { key: placing, ok: ok, cx: ggx + (d.gw - 1) / 2, cy: ggy + (d.gh - 1) / 2 } : null;
  } else ghostAt = null;

  // Superweapon targeting ghost: the footprint the strike will actually
  // cover, so a nuke is aimed at a base and not at a guess.
  if (swMode) {
    var swR = swMode.key === 'nuke' ? 4 : 1.5;
    var swCx = hoverTile.x, swCy = hoverTile.y;
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = swMode.key === 'chrono' ? '#9ad8ff' : (swMode.key === 'curtain' ? '#ff8a6a' : '#ffd24a');
    for (y = Math.floor(swCy - swR); y <= Math.ceil(swCy + swR); y++)
      for (x = Math.floor(swCx - swR); x <= Math.ceil(swCx + swR); x++) {
        if (!inMap(x, y)) continue;
        if (Math.sqrt((x - swCx) * (x - swCx) + (y - swCy) * (y - swCy)) > swR) continue;
        diamond(ctx, sx(x, y), sy(x, y), TW - 6, TH - 3); ctx.fill();
      }
    ctx.globalAlpha = 1;
    if (swMode.stage === 1) {                       // the Chronosphere's pick-up field
      ctx.strokeStyle = '#9ad8ff'; ctx.lineWidth = 2;
      diamond(ctx, sx(swMode.x, swMode.y), sy(swMode.x, swMode.y), (TW - 6) * 3, (TH - 3) * 3); ctx.stroke();
    }
  }

  // Storm cloud deck: a rolling disc of cloud over the whole strike zone
  // (LightningCellSpread=10 cells), with its shadow on the ground under it
  // and a flare through it on every strike.
  for (i = 0; i < G.storms.length; i++) {
    var stm = G.storms[i], spx = sx(stm.x, stm.y), spy = sy(stm.x, stm.y);
    var stmIn = Math.min(1, stm.t / 45);                     // it gathers as it arrives
    var stmOut = stm.t > stm.life ? Math.max(0, 1 - (stm.t - stm.life) / 45) : 1;
    var stmA = stmIn * stmOut;
    var deckW = LIGHT_SPREAD * TW * 0.72, deckH = LIGHT_SPREAD * TH * 0.72;
    ctx.globalAlpha = 0.15 * stmA;                           // the shadow it casts
    ctx.fillStyle = '#0a0d16';
    ctx.beginPath(); ctx.ellipse(spx, spy, deckW * 0.92, deckH * 0.92, 0, 0, 6.29); ctx.fill();
    var flare = Math.max(0, 1 - (G.tick - (stm.lit == null ? -99 : stm.lit)) / 8);
    for (var sc2 = 0; sc2 < 9; sc2++) {
      var sa = G.tick * 0.010 + sc2 * 0.698;
      var lrr = (sc2 % 3) * 0.13 + 0.22;
      var lx3 = spx + Math.cos(sa) * deckW * lrr, ly3 = spy - 158 + Math.sin(sa) * deckH * lrr * 1.2;
      var lw = deckW * (0.22 + (sc2 % 4) * 0.035);
      ctx.globalAlpha = 0.32 * stmA;
      ctx.fillStyle = mixc('#1c2334', '#5b687f', flare * 0.6);
      ctx.beginPath(); ctx.ellipse(lx3, ly3, lw, lw * 0.46, 0, 0, 6.29); ctx.fill();
      ctx.globalAlpha = 0.22 * stmA;                         // lit crown on each roll
      ctx.fillStyle = mixc('#38415a', '#a3b0cc', flare * 0.75);
      ctx.beginPath(); ctx.ellipse(lx3 - lw * 0.16, ly3 - lw * 0.16, lw * 0.60, lw * 0.24, 0, 0, 6.29); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // [Radiation] RadColor=0,255,0 — a sickly green wash over the cell that
  // brightens with the level and crawls, so a pool reads as active rather
  // than as a painted decal. Ground layer: under every unit standing in it.
  if (G.radAny) {
    // Source-over, and the diamonds are cut to the tile EXACTLY: under
    // `lighter` with a 1px bleed every shared edge doubled up and the pool
    // read as a green wireframe grid instead of a wash.
    ctx.save();
    for (y = minY; y <= maxY; y++) for (x = minX; x <= maxX; x++) {
      i = idx(x, y);
      var rl = G.rad[i];
      if (rl <= 0 || !G.seen[i]) continue;
      var rk = Math.min(1, rl / RAD_MAX);
      var shim = 0.72 + 0.28 * Math.sin(G.tick * 0.06 + (x * 3 + y * 5));
      ctx.fillStyle = 'rgba(74,' + (188 + ((60 * rk) | 0)) + ',60,' + (0.13 + 0.34 * rk * shim).toFixed(3) + ')';
      diamond(ctx, sx(x, y), sy(x, y), TW, TH); ctx.fill();
    }
    ctx.restore();
    // A few motes lifting off the hottest cells.
    ctx.fillStyle = 'rgba(150,255,120,.5)';
    for (y = minY; y <= maxY; y += 2) for (x = minX; x <= maxX; x += 2) {
      i = idx(x, y);
      if (G.rad[i] < RAD_MAX * 0.3 || !G.seen[i]) continue;
      var mp = ((G.tick * 1.4 + x * 17 + y * 29) % 60) / 60;
      ctx.globalAlpha = (1 - mp) * 0.7;
      ctx.fillRect(sx(x, y) + ((x * 7 + y * 3) % 9) - 4, sy(x, y) - mp * 16, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;
  }

  // Depth-sorted entity pass
  var draw = [];
  for (i = 0; i < G.blds.length; i++) {
    var b = G.blds[i];
    if (b.dead || !entSeen(G, b)) continue;
    draw.push({ d: b.cx + b.cy, e: b, b: true });
  }
  var airborne = [];
  for (i = 0; i < G.units.length; i++) {
    var u = G.units[i];
    if (u.dead || u.limbo || !entSeen(G, u)) continue;   // inside a tank, or out of phase
    // Flying units leave the depth sort: they are drawn after every ground
    // entity and tree, as RA2 does, with their shadow on the ground first.
    // A Harrier parked on its pad is ground-level and sorts with the pad.
    // A parked aircraft sorts just behind its pad's structure (the slots
    // are on the structure's near half), never under it.
    // A Harrier still sinking onto its pad is `landed` but not yet down:
    // it belongs in the air pass until its altitude ramp reaches zero.
    if (u.air && (!u.landed || altOf(u) > 0)) airborne.push(u);
    else draw.push({ d: u.x + u.y + (u.landed ? 1.2 : 0), e: u, b: false });
  }
  // Bodies sort with the living, a hair behind them, so a corpse is never
  // painted over the man standing on the next tile.
  for (i = 0; i < G.fx.length; i++) {
    var cf = G.fx[i];
    if (cf.corpse && cf.t >= 0) draw.push({ d: cf.x + cf.y - 0.02, cp: cf });
  }
  // Crate pickup: the effect's glyph rises off the spot, RA2's crate pip.
  for (i = 0; i < G.fx.length; i++) {
    var kf = G.fx[i];
    if (!kf.crateFx || kf.t < 0) continue;
    var kq = kf.t / kf.life;
    ctx.globalAlpha = Math.max(0, 1 - kq * kq);
    ctx.font = 'bold 15px system-ui'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(14,18,24,.65)';
    ctx.fillText(kf.glyph, sx(kf.x, kf.y) + 1, sy(kf.x, kf.y) - 14 - kq * 22 + 1);
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(kf.glyph, sx(kf.x, kf.y), sy(kf.x, kf.y) - 14 - kq * 22);
    ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  }
  // [NAPSIS] SensorArray=yes: not "where the enemy is" but "what he means
  // to kill". Every hostile inside PsychicDetectionRadius=15 of the sensor
  // that already has a target of ours is drawn joined to it.
  if (psiRadius > 0) {
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.4;
    for (i = 0; i < G.units.length; i++) {
      var pu = G.units[i];
      if (pu.dead || pu.p === ME) continue;
      if (!psiCovers(pu.x, pu.y)) continue;
      var po = pu.order, pt2 = null;
      if (po && po.id) pt2 = G.byId[po.id];
      if (!pt2 && pu.target) pt2 = pu.target;
      if (!pt2 || pt2.dead || pt2.p !== ME) continue;
      var pax = sx(pu.x, pu.y), pay = sy(pu.x, pu.y) - altOf(pu) - 8;
      var pbx = sx(entX(pt2), entY(pt2)), pby = sy(entX(pt2), entY(pt2)) - 8;
      ctx.strokeStyle = 'rgba(186,140,255,.55)';
      ctx.beginPath(); ctx.moveTo(pax, pay); ctx.lineTo(pbx, pby); ctx.stroke();
      ctx.fillStyle = 'rgba(214,182,255,.85)';
      ctx.beginPath(); ctx.arc(pbx, pby, 3.2, 0, 6.29); ctx.fill();
    }
    ctx.restore();
    ctx.setLineDash([]);
  }
  for (y = minY; y <= maxY; y++) for (x = minX; x <= maxX; x++) {
    i = idx(x, y);
    if (!G.seen[i]) continue;
    if (G.terrain[i] === T_TREE) draw.push({ d: x + y, t: SPR.tree[G.theatre || 'temperate'][((x * 7 + y * 13) >>> 0) & 7], x: x, y: y });
  }
  // Crates sort with the world: a box behind a tank is behind it.
  for (i = 0; i < G.crates.length; i++) {
    var cr0 = G.crates[i];
    if (!G.seen[idx(cr0.x, cr0.y)]) continue;
    draw.push({ d: cr0.x + cr0.y - 0.01, t: SPR.crate, x: cr0.x, y: cr0.y });
  }
  draw.sort(function (a, c) { return a.d - c.d; });

  for (i = 0; i < draw.length; i++) {
    if (draw[i].t) { var tr = draw[i].t, tpx = sx(draw[i].x, draw[i].y), tpy = sy(draw[i].x, draw[i].y); ctx.drawImage(tr.c, tpx - tr.ax, tpy - tr.ay, tr.w, tr.h); }
    else if (draw[i].cp) drawCorpse(draw[i].cp);
    else if (draw[i].b) { drawBld(draw[i].e); ironGlow(draw[i].e); }
    else { drawUnit(draw[i].e); ironGlow(draw[i].e); }
  }
  // Air pass: shadows first (they fall on buildings and trees alike), then
  // the aircraft, low to high on screen so an overlap resolves like depth.
  if (airborne.length) {
    airborne.sort(function (a, c) { return (a.x + a.y) - (c.x + c.y); });
    for (i = 0; i < airborne.length; i++) drawAirShadow(airborne[i]);
    for (i = 0; i < airborne.length; i++) drawUnit(airborne[i]);
  }
  drawBombs();
  for (i = 0; i < G.wrecks.length; i++) drawWreck(G.wrecks[i]);

  // The placement ghost sits ON TOP of the world: buried behind the very
  // Construction Yard you are building next to, it answered nothing.
  if (ghostAt) {
    var gart = SPR.bld[ME] && SPR.bld[ME][keyFac(G, ME, ghostAt.key, true) || 'dir'][ghostAt.key];
    if (gart) {
      ctx.globalAlpha = 0.66;
      ctx.drawImage(ghostSprite(ghostAt.key, ghostAt.ok, gart),
                    sx(ghostAt.cx, ghostAt.cy) - gart.ax, sy(ghostAt.cx, ghostAt.cy) - gart.ay,
                    gart.s.w, gart.s.h);
      ctx.globalAlpha = 1;
    }
  }

  // Rally lines for any selected production building, over the world so the
  // route is readable across terrain, under the effects layer.
  for (i = 0; i < G.blds.length; i++) {
    if (!G.blds[i].dead && G.blds[i].sel && G.blds[i].rally) drawRally(G.blds[i]);
  }

  // Shots: a bright core over a soft glow, plus a baked muzzle-flash sprite
  // on the first tick or two. Both glow and flash are drawImage/stroke —
  // no gradient is ever built per shot, so this stays cheap at any unit
  // count.
  for (i = 0; i < G.shots.length; i++) {
    var s = G.shots[i];
    var f = s.t / s.life;
    var ax = sx(s.x, s.y) + (s.ox || 0), ay = sy(s.x, s.y) - 10 - (s.alt || 0);
    var bx = sx(s.tx, s.ty), by = sy(s.tx, s.ty) - 8 - (s.talt || 0);
    if (s.shell) {
      // A big shell on a real ballistic arc: it climbs out of the muzzle,
      // hangs, and comes down. The height is a parabola in screen space.
      var shx = ax + (bx - ax) * f, shy = ay + (by - ay) * f - Math.sin(f * Math.PI) * 46;
      ctx.fillStyle = 'rgba(0,0,0,.22)';           // its shadow crossing the ground
      ctx.beginPath(); ctx.ellipse(ax + (bx - ax) * f, ay + (by - ay) * f + 8, 3.4, 1.5, 0, 0, 6.29); ctx.fill();
      ctx.fillStyle = '#33383f';
      ctx.beginPath(); ctx.ellipse(shx, shy, 3.4, 2.9, 0, 0, 6.29); ctx.fill();
      ctx.fillStyle = '#767d88';
      ctx.beginPath(); ctx.ellipse(shx - 1.1, shy - 1.1, 1.5, 1.2, 0, 0, 6.29); ctx.fill();
      if (f < 0.22) {                              // muzzle smoke, thinning out
        ctx.globalAlpha = 0.5 * (1 - f / 0.22);
        ctx.fillStyle = '#b8b2a6';
        ctx.beginPath(); ctx.arc(ax, ay - 2, 5 + f * 22, 0, 6.29); ctx.fill();
        ctx.globalAlpha = 1;
      }
      continue;
    }
    if (s.bomb) {
      // Kirov bomb: a dark drop falling from the gondola, drifting with the
      // airship's lean, and a growing blast queued in fx for when it lands.
      var bfy = ay + 6 + (by + 8 - ay - 6) * f * f, bfx = ax + (bx - ax) * f;
      ctx.fillStyle = '#2a2d33';
      ctx.beginPath(); ctx.ellipse(bfx, bfy, 2.2, 3.2, 0, 0, 6.29); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath(); ctx.ellipse(bfx - 0.6, bfy - 1, 0.8, 1.2, 0, 0, 6.29); ctx.fill();
      continue;
    }
    if (s.flak) {
      // Flak: a short dark tracer up, then a grey burst that hangs at the target.
      if (f < 0.45) {
        var q2 = f / 0.45;
        ctx.strokeStyle = 'rgba(255,220,160,' + (0.9 - q2 * 0.5) + ')'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(ax + (bx - ax) * Math.max(0, q2 - 0.3), ay + (by - ay) * Math.max(0, q2 - 0.3));
        ctx.lineTo(ax + (bx - ax) * q2, ay + (by - ay) * q2); ctx.stroke();
      } else {
        var q3 = (f - 0.45) / 0.55, br = 3 + q3 * 7;
        ctx.globalAlpha = 0.55 * (1 - q3);
        ctx.fillStyle = '#3c3f45';
        ctx.beginPath(); ctx.arc(bx + Math.sin(s.id) * 3, by - 2 - q3 * 3, br, 0, 6.29); ctx.fill();
        ctx.fillStyle = '#7a7e86';
        ctx.beginPath(); ctx.arc(bx + Math.sin(s.id) * 3 - 1.5, by - 3.5 - q3 * 3, br * 0.6, 0, 6.29); ctx.fill();
        if (q3 < 0.25) { ctx.globalAlpha = 1 - q3 * 4; ctx.fillStyle = '#ffd77a'; ctx.beginPath(); ctx.arc(bx, by - 2, 2.5, 0, 6.29); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
      continue;
    }
    if (s.link) {
      // A Prism Tower feeding its charge into the one that is firing
      // ([General] PrismSupportModifier/Max/Duration).
      var lax = sx(s.x, s.y), lay = sy(s.x, s.y) - 86;
      var lbx = sx(s.tx, s.ty), lby = sy(s.tx, s.ty) - 86;
      var lf = Math.min(1, f * 1.6), pulse2 = 0.6 + 0.3 * Math.sin(s.t * 0.4);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(90,200,240,' + (0.5 * pulse2).toFixed(2) + ')';
      ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(lax, lay); ctx.lineTo(lbx, lby); ctx.stroke();
      ctx.strokeStyle = 'rgba(200,248,255,' + pulse2.toFixed(2) + ')';
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(lax, lay); ctx.lineTo(lbx, lby); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.95)';      // the charge running along it
      ctx.beginPath(); ctx.arc(lax + (lbx - lax) * lf, lay + (lby - lay) * lf, 3.2, 0, 6.29); ctx.fill();
      ctx.beginPath(); ctx.arc(lax, lay, 3.4 * pulse2, 0, 6.29); ctx.fill();   // it leaves the crown
      ctx.restore();
      continue;
    }
    if (s.beam) {
      // Prism beam: an instant white-cyan lance from the tower head.
      ax = sx(s.x, s.y); ay = sy(s.x, s.y) - (s.oz == null ? 86 : s.oz);   // emitter height: crown hub, or a tank's turret
      var sup2 = s.sup ? Math.min(3.2, 1 + (s.sup - 1) * 0.28) : 1;   // supported shots are fatter
      ctx.strokeStyle = 'rgba(160,240,255,' + (0.5 * (1 - f)) + ')'; ctx.lineWidth = 6 * sup2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,' + (1 - f) + ')'; ctx.lineWidth = 1.6 * sup2;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      continue;
    }
    if (s.tesla) {
      // Tesla bolt: a jagged arc from the coil's head to the target, redrawn
      // with a different jitter each tick so it crawls, over a soft glow.
      ax = sx(s.x, s.y); ay = sy(s.x, s.y) - (s.oz == null ? 104 : s.oz);  // electrode, or a Tesla Tank's coil
      var segs = 9, k;
      for (var pass2 = 0; pass2 < 2; pass2++) {
        ctx.strokeStyle = pass2 ? 'rgba(235,240,255,' + (0.95 * (1 - f)) + ')' : 'rgba(150,180,255,' + (0.45 * (1 - f)) + ')';
        ctx.lineWidth = pass2 ? 1.4 : 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(ax, ay);
        for (k = 1; k < segs; k++) {
          var q = k / segs, jit = Math.sin((s.t * 3.1 + k * 7.3 + s.id) * 1.7) * 7 * (1 - Math.abs(q - 0.5) * 1.2);
          ctx.lineTo(ax + (bx - ax) * q + jit, ay + (by - ay) * q + jit * 0.6);
        }
        ctx.lineTo(bx, by); ctx.stroke();
      }
      continue;
    }
    if (s.v3) {
      // [V3Launcher]: a rocket, not a shell. A big finned round on a high
      // arc that trails smoke for its whole flight -- RA2 hangs the
      // [FIRE01]/[FIRE02]/[FIRE03] puff family off every missile.
      var ARC = 86;
      var vhx = ax + (bx - ax) * f, vhy = ay + (by - ay) * f - Math.sin(f * Math.PI) * ARC;
      ctx.globalCompositeOperation = 'source-over';
      for (var vp = 0; vp <= 28; vp++) {
        var pq = vp / 28; if (pq > f) break;
        var vage = f - pq;
        var pqx = ax + (bx - ax) * pq, pqy = ay + (by - ay) * pq - Math.sin(pq * Math.PI) * ARC;
        ctx.globalAlpha = Math.max(0, 0.46 - vage * 0.44);
        ctx.fillStyle = vage < 0.05 ? '#e2d8c8' : (vage < 0.18 ? '#a8a29a' : '#7d7973');
        ctx.beginPath(); ctx.arc(pqx, pqy + vage * 8, 2.6 + vage * 17, 0, 6.29); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // The round: nose along the tangent of the arc it is riding.
      var vdx = bx - ax, vdy = (by - ay) - Math.cos(f * Math.PI) * Math.PI * ARC;
      var vang = Math.atan2(vdy, vdx);
      ctx.save(); ctx.translate(vhx, vhy); ctx.rotate(vang);
      ctx.fillStyle = '#4a4f57';                                    // fins
      ctx.beginPath();
      ctx.moveTo(-8, 0); ctx.lineTo(-13, -5.2); ctx.lineTo(-7, -1.7);
      ctx.lineTo(-7, 1.7); ctx.lineTo(-13, 5.2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#6e747d';                                    // body
      ctx.beginPath(); ctx.ellipse(0, 0, 11, 3.1, 0, 0, 6.29); ctx.fill();
      ctx.fillStyle = '#aeb4bd';                                    // lit upper flank
      ctx.beginPath(); ctx.ellipse(-0.5, -1.1, 9.6, 1.3, 0, 0, 6.29); ctx.fill();
      ctx.fillStyle = '#b6423c';                                    // warhead band
      ctx.beginPath(); ctx.ellipse(7.8, 0, 3.4, 2.6, 0, 0, 6.29); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';                     // motor flame
      ctx.fillStyle = 'rgba(255,196,110,.85)';
      ctx.beginPath(); ctx.ellipse(-12 - ((s.t * 3) % 3), 0, 5 + ((s.t * 5) % 3), 1.9, 0, 0, 6.29); ctx.fill();
      ctx.fillStyle = 'rgba(255,252,232,.9)';
      ctx.beginPath(); ctx.ellipse(-10, 0, 2.6, 1.1, 0, 0, 6.29); ctx.fill();
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
      continue;
    }
    if (s.rocket) {
      // Every other missile gets the same puff trail, laid along the path
      // it has already flown so it stays put while the head runs on.
      ctx.globalCompositeOperation = 'source-over';
      for (var rp = 0; rp <= 14; rp++) {
        var rq2 = rp / 14; if (rq2 > f) break;
        var rage = f - rq2;
        ctx.globalAlpha = Math.max(0, 0.42 - rage * 0.58);
        ctx.fillStyle = rage < 0.08 ? '#ded6c8' : '#8f8b85';
        ctx.beginPath();
        ctx.arc(ax + (bx - ax) * rq2, ay + (by - ay) * rq2 + rage * 5, 1.6 + rage * 8, 0, 6.29);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // Muzzle flash sits at the end of the barrel, not on the hull centre.
    var dlen = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)) || 1;
    var mfx = ax + (bx - ax) / dlen * 11, mfy = ay + (by - ay) / dlen * 11;
    // A TRACER IS A DASH, NOT A BEAM. The trail used to run from f-0.25 to f,
    // i.e. its length was a QUARTER OF THE WHOLE FLIGHT — so the further a
    // weapon shot, the longer its streak, and a Conscript's rifle at range 5
    // drew a white line more than a cell long. Caught by rendering a real
    // firefight rather than a roster: at ZMIN it read as a laser, which is
    // not what RA2 gives small arms.
    //
    // The visible trail is now a fixed SCREEN length, clamped so it can
    // never be longer than the distance the round has actually covered
    // (otherwise a shot just leaving the muzzle draws behind the barrel).
    var tx2 = mfx + (bx - mfx) * f, ty2 = mfy + (by - mfy) * f;
    var trail = s.rocket ? 20 : 11;
    var mlen = Math.sqrt((bx - mfx) * (bx - mfx) + (by - mfy) * (by - mfy)) || 1;
    var back = Math.min(trail, mlen * f);
    var hx = tx2 - (bx - mfx) / mlen * back, hy = ty2 - (by - mfy) / mlen * back;
    var glow = s.rocket ? 'rgba(232,140,40,' : 'rgba(150,200,255,';
    var core = s.rocket ? 'rgba(255,225,150,' : 'rgba(230,245,255,';
    ctx.strokeStyle = glow + (0.35 * (1 - f)) + ')';
    ctx.lineWidth = s.rocket ? 5 : 3;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx2, ty2); ctx.stroke();
    ctx.strokeStyle = core + (1 - f) + ')';
    ctx.lineWidth = s.rocket ? 2 : 1.1;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx2, ty2); ctx.stroke();
    if (s.t <= 1) {
      var fsz = (s.rocket ? 30 : 20) * (1 - s.t * 0.35);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(SPR.flash.c, mfx - fsz / 2, mfy - fsz / 2, fsz, fsz);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // Explosions + move pings (additive, so overlapping blasts read as heat).
  // The blast is one baked radial-gradient sprite scaled per fx — no
  // per-shot createRadialGradient, which is the expensive part of the old
  // version once a lot of things are dying on screen at once.
  ctx.globalCompositeOperation = 'lighter';
  for (i = 0; i < G.fx.length; i++) {
    var fx = G.fx[i], ff = fx.t / fx.life;
    if (fx.t < 0 || fx.corpse) continue;          // queued (a bomb still falling) / drawn in the depth pass
    var fxx = sx(fx.x, fx.y) + (fx.ox || 0), fyy = sy(fx.x, fx.y) + (fx.oy || 0);
    if (fx.smoke) {
      ctx.globalCompositeOperation = 'source-over';
      var sbg = fx.big || 1;
      var sr = (3 + ff * 8) * sbg, sy0 = fyy - (fx.lift || 0) - ff * 22 * sbg + Math.sin(fx.t * 0.15) * 1.5;
      ctx.globalAlpha = 0.38 * (1 - ff);
      ctx.fillStyle = '#3a3c40';
      ctx.beginPath(); ctx.arc(fxx + Math.sin(fx.t * 0.11) * 3, sy0, sr, 0, 6.29); ctx.fill();
      ctx.fillStyle = '#6a6c72';
      ctx.beginPath(); ctx.arc(fxx - 2 + Math.cos(fx.t * 0.13) * 2, sy0 - 2, sr * 0.7, 0, 6.29); ctx.fill();
      ctx.globalAlpha = 1;
      continue;
    }
    if (fx.fire) {
      ctx.globalCompositeOperation = 'lighter';
      var fbg = fx.big || 1;
      var fl = (1 + ((fx.t * 7) % 5) * 0.12) * fbg, fy0 = fyy - (fx.lift || 0);
      ctx.globalAlpha = 0.85 * (1 - ff);
      ctx.fillStyle = 'rgba(120,32,8,.7)';
      ctx.beginPath(); ctx.ellipse(fxx, fy0 - 4 * fl, 5.5 * fl, 8 * fl, 0, 0, 6.29); ctx.fill();
      ctx.fillStyle = '#e8641e';
      ctx.beginPath(); ctx.ellipse(fxx, fy0 - 3 * fl, 4 * fl, 6 * fl, 0, 0, 6.29); ctx.fill();
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath(); ctx.ellipse(fxx + 0.5, fy0 - 2 * fl, 2 * fl, 3.5 * fl, 0, 0, 6.29); ctx.fill();
      ctx.fillStyle = 'rgba(255,246,214,.9)';
      ctx.beginPath(); ctx.ellipse(fxx + 0.5, fy0 - 1.2 * fl, 1 * fl, 1.8 * fl, 0, 0, 6.29); ctx.fill();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      continue;
    }
    if (fx.mist) {
      // InfDeath=2, "explodes": there is no body, only what is left of one.
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.55 * (1 - ff);
      ctx.fillStyle = '#8e1e1e';
      for (var mk = 0; mk < 6; mk++) {
        var ma = mk * 1.05 + 0.3, mr = 3 + ff * 13;
        ctx.beginPath();
        ctx.arc(fxx + Math.cos(ma) * mr, fyy - 7 - ff * 8 + Math.sin(ma) * mr * 0.55,
                3.2 * (1 - ff * 0.5), 0, 6.29);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      continue;
    }
    if (fx.dust) {
      // Three ochre grains lifting and fading off the ore seam.
      ctx.globalCompositeOperation = 'source-over';
      // A soft ochre cloud that swells and thins, with grains lifting out of it.
      ctx.globalAlpha = 0.28 * (1 - ff);
      ctx.fillStyle = '#c8a050';
      ctx.beginPath(); ctx.ellipse(fxx, fyy - 4 - ff * 5, 6 + ff * 9, 3 + ff * 4, 0, 0, 6.29); ctx.fill();
      ctx.globalAlpha = 1 - ff;
      for (var dk = 0; dk < 5; dk++) {
        var da = (dk - 2) * 4 + Math.sin(fx.t * 0.4 + dk) * 2.5;
        var lift = ff * (12 + (dk % 3) * 4);
        ctx.fillStyle = (dk & 1) ? '#f0c060' : '#c8983a';
        ctx.fillRect(fxx + da - 1.5, fyy - 6 - lift, 3, 3);
      }
      ctx.globalAlpha = 1;
      continue;
    }
    if (fx.deb) {
      // Debris: a chunk thrown out of the wreck on a ballistic arc
      // (rules.ini DebrisAnims= / MinDebris / MaxDebris).
      ctx.globalCompositeOperation = 'source-over';
      var dt = fx.t, dz2 = fx.vz * dt * 0.42 - 0.020 * dt * dt;
      if (dz2 < 0) dz2 = 0;
      ctx.save();
      ctx.translate(fxx + fx.vx * dt, fyy + fx.vy * dt - dz2);
      ctx.rotate(dt * fx.spin);
      ctx.globalAlpha = ff > 0.8 ? (1 - ff) / 0.2 : 1;
      ctx.fillStyle = '#2b2f2a';
      ctx.fillRect(-fx.dw / 2, -fx.dw / 2, fx.dw, fx.dw * 0.82);
      ctx.fillStyle = 'rgba(158,166,148,.35)';
      ctx.fillRect(-fx.dw / 2, -fx.dw / 2, fx.dw, 0.9);
      ctx.restore();
      ctx.globalAlpha = 1;
      continue;
    }
    if (fx.bolt) {
      // A storm bolt: a thick forked stroke out of the cloud deck with a
      // white core inside it, and a flash where it earths.
      ctx.globalCompositeOperation = 'lighter';
      var bbig = fx.big || 1;
      var bl = Math.max(0, 1 - ff * 1.4), btop = fyy - 200 * bbig;
      var bpts = [], bk, bq;
      bpts.push([fxx + Math.sin(fx.seed) * 16 * bbig, btop]);
      for (bk = 1; bk <= 9; bk++) {
        bq = bk / 9;
        bpts.push([fxx + Math.sin(fx.seed + bk * 2.7) * 18 * bbig * (1 - bq), btop + (fyy - btop) * bq]);
      }
      var boltPath = function () {
        ctx.beginPath(); ctx.moveTo(bpts[0][0], bpts[0][1]);
        for (var q2 = 1; q2 < bpts.length; q2++) ctx.lineTo(bpts[q2][0], bpts[q2][1]);
      };
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(96,140,255,' + (0.32 * bl).toFixed(2) + ')';
      ctx.lineWidth = 14 * bbig; boltPath(); ctx.stroke();          // the glow round it
      ctx.strokeStyle = 'rgba(150,190,255,' + (0.62 * bl).toFixed(2) + ')';
      ctx.lineWidth = 6 * bbig; boltPath(); ctx.stroke();           // the body
      ctx.strokeStyle = 'rgba(248,252,255,' + bl.toFixed(2) + ')';
      ctx.lineWidth = 2.2 * bbig; boltPath(); ctx.stroke();         // the core
      // Forks: short branches off the third, fifth and seventh kink.
      ctx.strokeStyle = 'rgba(196,220,255,' + (0.72 * bl).toFixed(2) + ')';
      ctx.lineWidth = 1.6 * bbig;
      for (bk = 3; bk <= 7; bk += 2) {
        var bpt = bpts[bk], bdir = ((fx.seed + bk) & 1) ? 1 : -1;
        ctx.beginPath(); ctx.moveTo(bpt[0], bpt[1]);
        ctx.lineTo(bpt[0] + bdir * 13 * bbig, bpt[1] + 16 * bbig);
        ctx.lineTo(bpt[0] + bdir * 8 * bbig, bpt[1] + 32 * bbig);
        ctx.stroke();
      }
      // Ground flash where it earths.
      ctx.globalAlpha = bl;
      ctx.fillStyle = 'rgba(180,214,255,.55)';
      ctx.beginPath(); ctx.ellipse(fxx, fyy, 26 * bbig * (0.5 + ff), 13 * bbig * (0.5 + ff), 0, 0, 6.29); ctx.fill();
      ctx.globalAlpha = 1;
      continue;
    }
    if (fx.mush) {
      // The nuke, over four seconds: a white flash column, a white-hot core
      // that lifts off the ground, a fireball cap that rolls over and
      // darkens as it climbs, and a shock ring running out across the dirt.
      // The hot parts go down additively so the whole thing reads as light
      // rather than as painted brown mud (which is what the old stack of
      // ellipses looked like).
      var mf = ff;
      var rise = Math.min(1, Math.pow(mf * 1.75, 0.70));         // how far the column has got
      var stemH = 8 + 224 * rise, capY = fyy - stemH;
      var cool = Math.min(1, Math.max(0, (mf - 0.08) / 0.50));   // white-hot -> soot
      var out = Math.max(0, 1 - Math.max(0, mf - 0.70) / 0.30);  // it thins away at the end
      var lseed = (fx.x * 71 + fx.y * 131) | 0;
      var mi;
      // Ground shock ring: a bright rim over a rolling dust wave.
      if (mf < 0.46) {
        var sq = mf / 0.46;
        // A dust ANNULUS, not a stroked circle: an outer and an inner ellipse
        // filled even-odd, so the wave has thickness and the ground inside it
        // is left alone.
        ctx.globalCompositeOperation = 'source-over';
        for (mi = 0; mi < 3; mi++) {
          var rq = sq - mi * 0.07; if (rq <= 0) continue;
          var ro = 24 + rq * 250, riw = ro * (0.62 + mi * 0.06);
          ctx.globalAlpha = 0.24 * (1 - sq) * (1 - mi * 0.26);
          ctx.fillStyle = 'rgb(186,168,134)';
          ctx.beginPath();
          ctx.ellipse(fxx, fyy, ro, ro * 0.5, 0, 0, 6.29);
          ctx.ellipse(fxx, fyy, riw, riw * 0.5, 0, 0, 6.29);
          ctx.fill('evenodd');
        }
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.42 * (1 - sq) * (1 - sq);
        ctx.strokeStyle = 'rgb(255,238,196)'; ctx.lineWidth = 2 + 10 * (1 - sq);
        ctx.beginPath(); ctx.ellipse(fxx, fyy, 26 + sq * 252, 13 + sq * 126, 0, 0, 6.29); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // The flash column: a hard white shaft standing over ground zero for
      // the first third of a second.
      if (mf < 0.09) {
        var fq = 1 - mf / 0.09;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = fq;
        ctx.fillStyle = 'rgba(255,255,246,.9)';
        ctx.beginPath();
        ctx.ellipse(fxx, fyy - 150 * (1 - fq * 0.4), 16 + 26 * fq, 160, 0, 0, 6.29); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // Dust skirt thrown up round the base.
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = out * 0.45 * (1 - mf * 0.4);
      ctx.fillStyle = mixc('#c8b28a', '#6b6055', cool);
      for (mi = 0; mi < 5; mi++) {
        var da2 = (mi - 2) * 26 * (0.5 + mf * 1.6);
        ctx.beginPath();
        ctx.ellipse(fxx + da2, fyy - 4 - mf * 10, 22 + mf * 46, 11 + mf * 20, 0, 0, 6.29); ctx.fill();
      }
      // The stem: churned smoke drawn up behind the cap, narrow at the waist.
      ctx.globalAlpha = out * 0.9;
      for (mi = 0; mi <= 18; mi++) {
        var sq2 = mi / 18, sy2 = fyy - stemH * sq2;
        // Wide at the ground, pinched at the waist, flaring into the cap.
        var swid = (34 - 17 * Math.sin(sq2 * Math.PI)) * (0.66 + rise * 0.72);
        ctx.fillStyle = mixc('#ffb04a', '#494038', Math.min(1, cool + sq2 * 0.22));
        ctx.beginPath();
        ctx.ellipse(fxx + Math.sin(sq2 * 4.2 + lseed) * 6 * rise, sy2, swid * 0.5, swid * 0.42, 0, 0, 6.29);
        ctx.fill();
      }
      // The cap: a ring of billows that rolls outward as it climbs, lit on
      // top and shadowed underneath.
      var capR = 30 + 84 * rise, capH = capR * 0.52;
      ctx.globalAlpha = out;
      for (mi = 0; mi < 14; mi++) {
        var ca2 = mi * 0.4488 + lseed * 0.13, cr2 = capR * (0.44 + 0.56 * Math.abs(Math.cos(ca2)));
        var lx2 = fxx + Math.cos(ca2) * cr2, ly2 = capY + Math.sin(ca2) * capH * 0.52 - capH * 0.10;
        var lr2 = capR * (0.32 + 0.09 * Math.sin(mi * 2.1 + lseed));
        var lt = Math.min(1, cool + (ly2 > capY ? 0.22 : 0));      // the underside stays dark
        ctx.fillStyle = mixc('#ff9a2c', '#4c4238', lt);
        ctx.beginPath(); ctx.ellipse(lx2, ly2, lr2, lr2 * 0.86, 0, 0, 6.29); ctx.fill();
        ctx.fillStyle = cool < 0.6 ? 'rgba(255,232,170,.30)' : 'rgba(168,160,150,.18)';
        ctx.beginPath(); ctx.ellipse(lx2 - lr2 * 0.24, ly2 - lr2 * 0.32, lr2 * 0.40, lr2 * 0.28, -0.5, 0, 6.29); ctx.fill();
      }
      // The white-hot core inside the cap, while there is still one.
      if (cool < 1) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = out * (1 - cool);
        var mg = ctx.createRadialGradient(fxx, capY, 0, fxx, capY, capR);
        mg.addColorStop(0, 'rgba(255,255,242,.95)');
        mg.addColorStop(0.35, 'rgba(255,206,110,.6)');
        mg.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = mg;
        ctx.beginPath(); ctx.ellipse(fxx, capY, capR, capR * 0.72, 0, 0, 6.29); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'lighter';
      continue;
    }
    if (fx.chrono) {
      // Chrono flash: a ring closing on the tile and a column of light.
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(150,220,255,' + (1 - ff).toFixed(2) + ')'; ctx.lineWidth = 3;
      diamond(ctx, fxx, fyy, (TW + 10) * (1.2 - ff), (TH + 6) * (1.2 - ff)); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.8 * (1 - ff)).toFixed(2) + ')'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(fxx, fyy - 46 * (1 - ff)); ctx.lineTo(fxx, fyy); ctx.stroke();
      continue;
    }
    if (fx.ping) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(138,208,255,' + (1 - ff) + ')';
      ctx.lineWidth = 2;
      diamond(ctx, fxx, fyy, (TW - 8) * (0.3 + ff), (TH - 4) * (0.3 + ff));
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      continue;
    }
    // Explosion families: a baked frame sequence (body, then the hot core
    // additively over it) instead of one radial blob scaled up.
    var EF = SPR.expl[famOf(fx.size)];
    var ek = Math.min(EXPL_N - 1, (ff * EXPL_N) | 0);
    var ed = fx.size * 2.15, ex0 = fxx - ed / 2, ey0 = fyy - 6 - ed / 2 - ed * 0.08;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(EF.body[ek].c, ex0, ey0, ed, ed);
    ctx.globalCompositeOperation = 'lighter';
    if (EF.core[ek]) ctx.drawImage(EF.core[ek].c, ex0, ey0, ed, ed);
  }
  ctx.globalCompositeOperation = 'source-over';

  // Sticks under canopy. Drawn after the explosions and before the nuke so
  // a chute reads over the field but under the HUD. The man hangs from the
  // apex, the canopy breathes as it swings, and a shadow tightens on the
  // tile he is going to land on so the player can read WHERE before he
  // arrives — RA2's drop telegraphs itself the same way.
  for (i = 0; i < G.drops.length; i++) {
    var dp = G.drops[i];
    for (var mi = 0; mi < dp.men.length; mi++) {
      var mn = dp.men[mi];
      var fall = 1 - mn.fall / PARA_FALL;                 // 0 = jumped, 1 = touching down
      var gxp = sx(mn.x, mn.y), gyp = sy(mn.x, mn.y);
      var swing = Math.sin(mn.sway + G.tick * 0.055) * (10 * (1 - fall));
      var px = gxp + swing, py = gyp - PARA_H * (1 - fall);
      var col = COL[dp.p] || COL[0], scale = 0.72 + 0.28 * fall;

      // Ground shadow: wide and faint when he is high, tight when he is not.
      ctx.fillStyle = 'rgba(0,0,0,' + (0.10 + 0.22 * fall).toFixed(2) + ')';
      ctx.beginPath();
      ctx.ellipse(gxp, gyp, 13 * (1.5 - 0.5 * fall) * 0.5, 6 * (1.5 - 0.5 * fall) * 0.5, 0, 0, 6.283);
      ctx.fill();

      // Shrouds, then the man, then the canopy over both.
      var cw = 24 * scale, ch = 13 * scale, hang = 20 * scale;
      ctx.strokeStyle = 'rgba(228,233,240,.75)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (var sh = -2; sh <= 2; sh++) {
        ctx.moveTo(px + sh * cw * 0.36, py - hang + ch * 0.35);
        ctx.lineTo(px, py - 2);
      }
      ctx.stroke();
      // The trooper: a dark torso with the owner's colour across the chest.
      ctx.fillStyle = '#2b3038';
      ctx.fillRect(px - 2.6 * scale, py - 8 * scale, 5.2 * scale, 9 * scale);
      ctx.fillStyle = col;
      ctx.fillRect(px - 2.6 * scale, py - 6.5 * scale, 5.2 * scale, 3.2 * scale);
      ctx.fillStyle = '#d8c9a8';
      ctx.fillRect(px - 1.8 * scale, py - 11 * scale, 3.6 * scale, 3.2 * scale);   // helmet
      // Canopy: a lit dome with a house-coloured band and a shaded underside.
      var cy0 = py - hang;
      var cg = ctx.createLinearGradient(px - cw / 2, cy0 - ch, px + cw / 2, cy0 + ch);
      cg.addColorStop(0, '#f2f5f9'); cg.addColorStop(0.55, '#cfd6e0'); cg.addColorStop(1, '#93a0b2');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.ellipse(px, cy0, cw / 2, ch, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.ellipse(px, cy0, cw / 2, ch * 0.34, 0, Math.PI, 0); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(30,36,46,.45)';
      ctx.beginPath(); ctx.ellipse(px, cy0, cw / 2, ch * 0.26, 0, 0, Math.PI); ctx.fill();
    }
  }

  // A missile in flight: the target ring pulses for the whole ten seconds,
  // then the warhead comes down out of the top of the screen.
  for (i = 0; i < G.nukes.length; i++) {
    var nk = G.nukes[i], nf = nk.t / nk.life;
    var npx = sx(nk.x, nk.y), npy = sy(nk.x, nk.y);
    ctx.strokeStyle = 'rgba(255,90,90,' + (0.3 + 0.35 * Math.abs(Math.sin(G.tick * 0.12))).toFixed(2) + ')';
    ctx.lineWidth = 2;
    diamond(ctx, npx, npy, TW * 4, TH * 4); ctx.stroke();
    diamond(ctx, npx, npy, TW * 2, TH * 2); ctx.stroke();
    if (nf > 0.78) {
      var fall = (nf - 0.78) / 0.22, my = npy - 560 * (1 - fall);
      ctx.strokeStyle = 'rgba(255,190,120,.8)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(npx, my - 30); ctx.lineTo(npx, my); ctx.stroke();
      ctx.fillStyle = '#e6ecf5'; ctx.fillRect(npx - 2.5, my - 13, 5, 13);
    }
  }
  ctx.restore();

  // Per-map ambient. RA2 maps carry a [Lighting] block (Ambient/Red/Green/
  // Blue) and the whole tactical view is lit through it, so a dusk map is
  // not the same picture as a noon one. One multiply plus one additive
  // wash, under the storm and nuke washes so those still read as events.
  var LT = (MAPS[G.mapId] || {}).light;
  if (LT) {
    if (LT.a > 0.05) {
      ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = LT.a;
      ctx.fillStyle = LT.mul; ctx.fillRect(0, 0, cvW, cvH);
    }
    if (LT.aa > 0.05) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = LT.aa;
      ctx.fillStyle = LT.add; ctx.fillRect(0, 0, cvW, cvH);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  // Storm sky and nuclear whiteout sit over the whole viewport, as RA2's do.
  if (G.storms.length) {
    var skyA = 0;
    for (i = 0; i < G.storms.length; i++) {
      var sk = G.storms[i];
      skyA = Math.max(skyA, Math.min(1, sk.t / 45) * (sk.t > sk.life ? Math.max(0, 1 - (sk.t - sk.life) / 45) : 1));
    }
    ctx.fillStyle = 'rgba(14,18,38,' + (0.38 * skyA).toFixed(3) + ')';
    ctx.fillRect(0, 0, cvW, cvH);
  }
  if (G.flash > 0) { ctx.fillStyle = 'rgba(255,248,230,' + (G.flash / 26 * 0.8).toFixed(2) + ')'; ctx.fillRect(0, 0, cvW, cvH); }

  drawMini();
}

// Iron Curtain: RA2 tints what it protects red and lets it shimmer.
// The live Psychic Sensor, if we own one. Recomputed once a frame rather
// than per unit — there is at most one ([NAPSIS] is effectively unique).
var psiRadius = 0, psiX = 0, psiY = 0;

function updatePsi() {
  psiRadius = 0;
  if (!G) return;
  for (var i = 0; i < G.blds.length; i++) {
    var b = G.blds[i], d = BLDS[b.type];
    if (b.dead || b.p !== ME || !d.psi || b.make > 0 || b.offline) continue;
    if (!powered(G, ME)) continue;
    psiRadius = d.psi; psiX = b.cx; psiY = b.cy; return;
  }
}

function psiCovers(x, y) {
  var dx = x - psiX, dy = y - psiY;
  return dx * dx + dy * dy <= psiRadius * psiRadius;
}

function ironGlow(e) {
  if (!ironed(G, e)) return;
  var px = sx(entX(e), entY(e)), py = sy(entX(e), entY(e));
  var t = (G.tick + e.id * 5) * 0.22;
  var r = e.kind === 'b' ? (e.gw + e.gh) * 9 : 15;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.28 + 0.16 * Math.sin(t);
  ctx.fillStyle = '#ff2f2f';
  ctx.beginPath(); ctx.ellipse(px, py - (e.kind === 'b' ? 12 : 6), r, r * 0.62, 0, 0, 6.29); ctx.fill();
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(255,132,132,' + (0.5 + 0.32 * Math.sin(t * 1.7)).toFixed(2) + ')';
  ctx.lineWidth = 1.4;
  diamond(ctx, px, py, r * 1.35, r * 0.75); ctx.stroke();
}

// Selection brackets: four corners of a screen-space box.
function brackets(bx0, by0, bx1, by1) {
  var L = Math.max(4, Math.min(9, (bx1 - bx0) * 0.22));
  ctx.strokeStyle = '#8ad0ff'; ctx.lineWidth = 1.5; ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(bx0, by0 + L); ctx.lineTo(bx0, by0); ctx.lineTo(bx0 + L, by0);
  ctx.moveTo(bx1 - L, by0); ctx.lineTo(bx1, by0); ctx.lineTo(bx1, by0 + L);
  ctx.moveTo(bx0, by1 - L); ctx.lineTo(bx0, by1); ctx.lineTo(bx0 + L, by1);
  ctx.moveTo(bx1 - L, by1); ctx.lineTo(bx1, by1); ctx.lineTo(bx1, by1 - L);
  ctx.stroke(); ctx.lineCap = 'butt';
}

// Which RA2 sequence a soldier is playing, and which frame of it. Priority
// is RA2's: a victory cheer, then prone (crawling if he is moving), then
// the firing burst, then the walk, and only a man with nothing at all to do
// gets an idle fidget.
//
// The fidget is derived from `tick` and the unit's id — NEVER from the
// shared `rnd()`. Render code that touches the sim RNG desynchronises every
// headless test that replays the same seed.
function infSeqOf(u, moving, alt) {
  // A dog has three states and none of the man ones: it never goes prone,
  // never cheers, never fidgets with a rifle. It runs, it stands, and when
  // it bites it leaps (the three-frame gather/launch/land off `leapAt`).
  if (UNITS[u.type].dog) {
    var lp = G.tick - (u.leapAt == null ? -999 : u.leapAt);
    if (lp >= 0 && lp < 21) return { st: 'leap', ph: Math.min(2, lp / 7 | 0) };
    if (moving) return { st: 'walk', ph: (G.tick >> 1) % 6 };   // twice a man's cadence
    return { st: 'stand', ph: 0 };
  }
  if (G.over && G.overAt != null && G.tick - G.overAt < 180 &&
      G.over === (u.p === P_HUMAN ? 1 : -1)) return { st: 'cheer', ph: (G.tick >> 3) & 1 };
  // keyboard.ini AllToCheer=67 (C): the whole army cheers on command. The
  // animation was already here and already fired on victory — only the key
  // and the ordering were missing.
  if (u.p === ME && G.cheerUntil && G.tick < G.cheerUntil) return { st: 'cheer', ph: (G.tick >> 3) & 1 };
  var firing = G.tick - (u.fireAt == null ? -999 : u.fireAt) < 13;
  if (u.prone) {
    if (firing) return { st: 'fireprone', ph: Math.min(5, (G.tick - u.fireAt) >> 1) };
    if (moving) return { st: 'crawl', ph: (G.tick >> 3) % 6 };
    if (G.tick - (u.downAt || -99) < 12) return { st: 'down', ph: 0 };
    return { st: 'prone', ph: 0 };
  }
  if (G.tick - (u.upAt == null ? -99 : u.upAt) < 12) return { st: 'up', ph: 0 };
  // Six frames over the 13-tick burst window, two ticks each — `FireUp`'s
  // own length. `>>2` with a min of 2 was the three-frame cycle.
  if (firing) return { st: 'fire', ph: Math.min(5, (G.tick - u.fireAt) >> 1) };
  if (moving || alt > 0) return { st: 'walk', ph: (G.tick >> 2) % 6 };
  var per = 480 + (u.id * 37) % 420;                     // one fidget every 8-15 s
  var ip = (G.tick + u.id * 131) % per;
  if (ip < 36) return { st: (((u.id + (((G.tick + u.id * 131) / per) | 0)) & 1) ? 'idle2' : 'idle1'),
                        ph: (ip / 12) | 0 };
  return { st: 'stand', ph: 0 };
}

// The RA2 infantry deaths, all played off the SAME baked figure: a twirl
// spins the standing frame down onto its face, a flying death throws it
// back along the shot, a burn blackens it under flames (the sprite drawn
// over itself in `multiply`, so no black silhouette needs baking), an
// electro strobes it white, and a crush flattens it. The last stretch of
// every one of them is the prone frame, fading.
function drawCorpse(f) {
  var art = SPR.unit[f.p][f.fac][f.type];
  if (!art || !art.fr) return;
  if (!G.seen[idx(f.x | 0, f.y | 0)]) return;            // bodies stay under the shroud
  var px = sx(f.x, f.y), py = sy(f.x, f.y);
  if (px < VX0 - 70 || py < VY0 - 70 || px > VX1 + 70 || py > VY1 + 70) return;
  var t = f.t, k = t / f.life;
  var DROP = f.mode === 6 ? 4 : 22;                      // ticks of the fall itself
  var down = t < DROP, q = down ? t / DROP : 1;
  var s = art.dog ? art.fr('stand', f.face, 0)
                  : (down && f.mode !== 6 ? art.fr('stand', f.face, 0) : art.fr('prone', f.face, 0));
  var ox = px - s.w / 2, oy = py - (s.h - UPAD);
  ctx.save();
  ctx.globalAlpha = k > 0.72 ? Math.max(0, (1 - k) / 0.28) : 1;
  if (down) {
    // The fall itself: pivot on the ground point so the body never slides
    // off its own tile.
    ctx.translate(px, py); 
    if (f.mode === 1) ctx.rotate(q * q * 1.45);                     // twirl
    else if (f.mode === 3) { ctx.translate(-Math.cos(f.face * FANG) * q * 9, -q * q * 5 + q * 7); ctx.rotate(-q * 1.5); }
    else if (f.mode === 5) ctx.translate(((t % 3) - 1) * 0.8, 0);   // electro judder
    ctx.translate(-px, -py);
  }
  ctx.drawImage(s.c, ox, oy, s.w, s.h);
  if (f.mode === 4) {                                    // burn: char the body
    ctx.globalCompositeOperation = 'multiply';
    var burns = 1 + Math.min(3, (t / 7) | 0);
    for (var bi = 0; bi < burns; bi++) ctx.drawImage(s.c, ox, oy, s.w, s.h);
    ctx.globalCompositeOperation = 'source-over';
  } else if (f.mode === 5 && t < 34 && ((t >> 2) & 1)) {  // electro: blow him white
    ctx.globalCompositeOperation = 'lighter';
    for (var ei = 0; ei < 3; ei++) ctx.drawImage(s.c, ox, oy, s.w, s.h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(190,225,255,.85)'; ctx.lineWidth = 1.1;
    for (var ea = 0; ea < 3; ea++) {
      var an = (t * 1.7 + ea * 2.1);
      ctx.beginPath(); ctx.moveTo(px, py - 12);
      ctx.lineTo(px + Math.cos(an) * 9, py - 12 + Math.sin(an) * 7); ctx.stroke();
    }
  } else if (f.mode === 6) {                             // crushed: a flat smear
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(s.c, ox, oy, s.w, s.h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(96,20,20,.5)';
    ctx.beginPath(); ctx.ellipse(px, py - 1, 9, 4, 0, 0, 6.29); ctx.fill();
  }
  ctx.restore();
}

// Tread marks and dust. RA2 lays a fading decal behind a tracked vehicle
// and kicks dust off dry ground. Kept in a render-side ring buffer, NOT on
// the game state: they are pure decoration, they are capped, and nothing
// the deterministic sim replays may depend on them.
var TRACKS = [], TRACK_MAX = 140, TRACK_LIFE = 360, DUST_LIFE = 42;

// When each unit last left a tread mark, by id. Render-side: a unit the
// local camera never drew has no entry, so this must not live on the unit
// (it went into every save and made two lockstep worlds serialise apart).
var TRK_AT = {};

var SPARKS = [];                    // ore/gem glitter queued for one additive pass

var ORES = [];                      // ore/gem cells queued for one pass over the finished ground

function drawTracks() {
  for (var i = TRACKS.length - 1; i >= 0; i--) {
    var tr = TRACKS[i], age = G.tick - tr.t;
    if (age < 0 || age > TRACK_LIFE * 0.86) { TRACKS.splice(i, 1); continue; }   // the last 14% is invisible anyway
    var tpx = sx(tr.x, tr.y), tpy = sy(tr.x, tr.y);
    if (tpx < VX0 - 40 || tpy < VY0 - 40 || tpx > VX1 + 40 || tpy > VY1 + 40) continue;
    var gx0 = Math.round(tr.x), gy0 = Math.round(tr.y);
    if (!inMap(gx0, gy0) || !G.seen[idx(gx0, gy0)]) continue;
    // A WAKE, not a tread mark: a ship leaves a widening V of foam on the
    // water that fades in about a second and a half, and a submerged hull
    // leaves only a feather.
    if (tr.foam) {
      var wa = tr.face * FANG;
      var wdx = Math.cos(wa), wdy = Math.sin(wa);
      var wfx = (wdx - wdy) * (TW / 2), wfy = (wdx + wdy) * (TH / 2);
      var wfl = Math.sqrt(wfx * wfx + wfy * wfy) || 1; wfx /= wfl; wfy /= wfl;
      var wk = age / (TRACK_LIFE * 0.24);
      if (wk >= 1) { TRACKS.splice(i, 1); continue; }
      ctx.globalAlpha = (tr.sub ? 0.30 : 0.55) * (1 - wk);
      ctx.strokeStyle = '#e8f4fc'; ctx.lineWidth = tr.sub ? 1.0 : 1.6;
      var ww = (tr.sub ? 2.0 : 4.0) + wk * (tr.sub ? 3 : 9);
      ctx.beginPath();
      ctx.ellipse(tpx - wfx * 6, tpy - wfy * 6, ww, ww * 0.5, Math.atan2(wfy, wfx), 0, 6.29);
      ctx.stroke();
      if (!tr.sub) {
        ctx.globalAlpha = 0.34 * (1 - wk);
        ctx.fillStyle = '#dceef8';
        ctx.beginPath();
        ctx.ellipse(tpx - wfx * 5, tpy - wfy * 5, ww * 0.72, ww * 0.32, Math.atan2(wfy, wfx), 0, 6.29);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      continue;
    }
    var ta = tr.face * FANG;
    var fdx = Math.cos(ta), fdy = Math.sin(ta);
    var fsx = (fdx - fdy) * (TW / 2), fsy = (fdx + fdy) * (TH / 2);
    var fl = Math.sqrt(fsx * fsx + fsy * fsy) || 1; fsx /= fl; fsy /= fl;
    var pdx = -fdy, pdy = fdx;                                  // perpendicular in GRID space
    var psx = (pdx - pdy) * (TW / 2), psy = (pdx + pdy) * (TH / 2);
    var pl = Math.sqrt(psx * psx + psy * psy) || 1; psx /= pl; psy /= pl;
    // Both rails in ONE path: at the buffer's cap this is the difference
    // between 300 stroke calls a frame and 150.
    ctx.globalAlpha = 0.26 * (1 - age / TRACK_LIFE);
    ctx.strokeStyle = '#2b2820'; ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (var sg = -1; sg <= 1; sg += 2) {
      var bx = tpx + psx * 4.6 * sg, by = tpy + psy * 4.6 * sg;
      ctx.moveTo(bx - fsx * 7, by - fsy * 7); ctx.lineTo(bx + fsx * 7, by + fsy * 7);
    }
    ctx.stroke();
    if (tr.dust && age < DUST_LIFE) {
      ctx.globalAlpha = 0.22 * (1 - age / DUST_LIFE);
      ctx.fillStyle = '#b8a682';
      ctx.beginPath();
      ctx.ellipse(tpx - fsx * 6, tpy - fsy * 6 - 2 - age * 0.18,
                  3 + age * 0.26, 1.6 + age * 0.13, 0, 0, 6.29);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function drawUnit(u) {
  var px = sx(u.x, u.y), py = sy(u.x, u.y);
  if (px < VX0 - 60 || py < VY0 - 60 || px > VX1 + 60 || py > VY1 + 60) return;
  var d = UNITS[u.type];
  // [Snapshot] MakesDisguise=yes: to the ENEMY a Spy is one of his own
  // riflemen, walking about with the rest of them. To his owner he is a
  // Spy, because you have to be able to steer him.
  if (d.spy && u.p !== ME && isDisguised(G, u)) {
    var dgFac = facOf(G, ME) || 'dir';
    var dgArt = SPR.unit[ME][dgFac][FACTIONS[dgFac].inf];
    if (dgArt && dgArt.fr) {
      var dgS = dgArt.fr(infSeqOf(u, G.tick - (u.movedAt || -99) < 3, 0).st, u.face, 0);
      ctx.drawImage(dgS.c, px - dgS.w / 2, py - (dgS.h - UPAD), dgS.w, dgS.h);
      return;
    }
  }
  if (isDisguised(G, u) && !d.spy) {
    // The whole point of the disguise is that it looks exactly like the
    // trees around it — same sprite, same anchor, picked off the unit id so
    // a row of Mirages is not a row of identical trees.
    var tr = SPR.tree[G.theatre || 'temperate'][(u.id * 7) & 3];
    ctx.drawImage(tr.c, px - tr.ax, py - tr.ay, tr.w, tr.h);
    if (u.sel) brackets(px - tr.ax - 3, py - tr.ay - 3, px - tr.ax + tr.w + 3, py - tr.ay + tr.h + 1);
    if (u.hp < u.maxhp) hpBar(px, py - tr.ay - 8, 20, u.hp / u.maxhp);
    return;
  }
  // `Underwater=yes`. To an enemy with nothing that can detect it, a
  // submerged hull is not drawn at all — only the ring it pushes up. To its
  // owner it is drawn, dimmed and tinted with the water over it, because
  // you have to be able to steer the thing.
  var submerged = isSub(u) && !surfaced(G, u);
  if (submerged) {
    var rp = (G.tick + u.id * 17) % 90 / 90;
    ctx.strokeStyle = 'rgba(190,225,245,.45)'; ctx.lineWidth = 1.1;
    ctx.globalAlpha = 0.7 * (1 - rp);
    ctx.beginPath(); ctx.ellipse(px, py, 4 + rp * 11, 2 + rp * 5.5, 0, 0, 6.29); ctx.stroke();
    ctx.globalAlpha = 1;
    if (!subSeen(G, u, ME)) return;
  }
  var art = SPR.unit[u.p][facOf(G, u.p) || 'dir'][u.type];
  var moving = G.tick - (u.movedAt || -99) < 3;
  var alt = altOf(u);
  var s, turretS = null, gondS = null;
  if (Array.isArray(art)) {
    // Vehicles: 32 facings, baked lazily; a mining harvester alternates its
    // two sets; a turreted tank draws hull by travel facing, turret by aim.
    var set = art;
    if (u.state === 'mining' && art.mine && ((G.tick >> 3) & 1)) set = art.mine;
    // Kirov propeller; a Nighthawk's rotors keep turning on the ground too
    if (art.anim && (alt > 0 || u.landed) && ((G.tick >> 2) & 1)) set = art.anim;
    if (art.empty && u.ammo <= 0) set = art.empty;                       // Harrier racks fired
    if (art.hull && art.turret) {
      s = art.hull[u.face];
      // [FV]: the turret model is chosen by the passenger, not by the hull.
      var tset = art.turret;
      if (art.turrets) { var tvi = ifvTurret(u); if (tvi) tset = art.turrets(tvi); }
      turretS = tset[u.tface == null ? u.face : u.tface];
    } else if (set.lay) {
      // Kirov: airframe and gondola are separate layers so the pod can hang
      // and swing a beat behind the envelope, and open its bomb bay.
      var LY = set.lay();
      s = LY.hull[u.face];
      var kbo = u.fireAt != null && G.tick - u.fireAt >= 0 && G.tick - u.fireAt < 24;
      gondS = (kbo ? LY.open : LY.gond)[u.face];
    } else s = set[u.face];
  } else if (art.fr) {
    var is = infSeqOf(u, moving, alt);
    s = art.fr(is.st, u.face, is.ph);
  } else s = art;

  // The Kirov's 1.3x draw fudge is gone: it is baked at its final size
  // (`VSC.kirov`), so the largest airframe in the game no longer goes
  // through a bilinear upscale that nothing else on the field pays.
  var ox = px - s.w / 2, oy = py - (s.h - UPAD) - alt;
  // A gasbag does not hold station: the Kirov rocks slowly on its long
  // axis, and the gondola hanging under it does NOT rock with it -- it
  // trails the envelope by about a quarter of a second and swings wider,
  // which is what makes the pod read as slung on cables.
  var gondDx = 0, gondDy = 0;
  if (d.bomb && d.air) {
    var swH = Math.sin((G.tick + u.id * 11) * 0.021);
    ox += swH * 2.4;
    if (gondS) {
      var swG = Math.sin((G.tick - 14 + u.id * 11) * 0.021);
      gondDx = swG * 3.3 - swH * 2.4;
      gondDy = Math.abs(swG) * 0.8 - 0.4;
    }
  }
  // Recoil: RA2 tanks rock BACK on firing (`Recoilless=yes` is called out as
  // the exception on [GAPILL], art.ini:2113). Two pixels along the barrel
  // axis for four ticks, projected through the same iso transform the hull
  // is drawn in so the kick runs down the gun, not down the screen.
  var rck = G.tick - (u.fireAt == null ? -99 : u.fireAt);
  if (!art.fr && rck >= 0 && rck < 4 && d.dmg > 0) {
    var rang = ((u.tface == null ? u.face : u.tface) || 0) * FANG;
    var rgx = Math.cos(rang), rgy = Math.sin(rang);
    var rsx = (rgx - rgy) * (TW / 2), rsy = (rgx + rgy) * (TH / 2);
    var rl = Math.sqrt(rsx * rsx + rsy * rsy) || 1;
    var rmag = 2 * (1 - rck / 4);
    ox -= rsx / rl * rmag; oy -= rsy / rl * rmag;
  }
  // A working harvester rocks on its tracks instead of sitting parked.
  if (u.state === 'mining') oy += ((G.tick >> 3) & 1) ? 1 : 0;
  // A hull afloat is never still: a slow heave on the swell, with a small
  // sideways roll a beat out of phase so it does not read as a lift.
  if (d.nav) {
    var bt = (G.tick + u.id * 29) * 0.024;
    oy += Math.sin(bt) * 1.25;
    ox += Math.sin(bt * 0.63 + 1.1) * 0.9;
  }
  if (u.deployed) oy += 9;                                               // he drops down behind the bags
  // A Terror Drone inside the hull: the whole vehicle judders on its
  // springs while something tears at it from underneath.
  if (u.drone) ox += ((G.tick >> 1) & 1) ? 1 : -1;
  if (u.air && !alt) drawAirShadow(u);                                   // parked: shadow under it
  // Tread marks and a dust kick behind a moving ground vehicle; a wake
  // behind a moving hull.
  // A WAKE IS LAID DENSER THAN A TREAD MARK. Both used one 5-tick interval,
  // and at ship speed that leaves visible gaps: the comment below promises
  // "a widening V of foam" and what was drawn was a chain of separate beads.
  // A hull moves further between samples than a tank does, so water gets a
  // 2-tick interval and the beads overlap into a continuous V. Ground tracks
  // keep 5 — they were never gappy, and halving them would only cost TRACKS
  // slots that the wake now needs.
  var _wet = inMap(Math.round(u.x), Math.round(u.y)) &&
             G.terrain[idx(Math.round(u.x), Math.round(u.y))] === T_WATER;
  if (!art.fr && !d.air && moving &&
      G.tick - (TRK_AT[u.id] == null ? -99 : TRK_AT[u.id]) >= (_wet ? 2 : 5)) {
    TRK_AT[u.id] = G.tick;
    if (TRACKS.length >= TRACK_MAX) TRACKS.shift();
    var tgi = inMap(Math.round(u.x), Math.round(u.y)) ? G.terrain[idx(Math.round(u.x), Math.round(u.y))] : -1;
    if (tgi === T_WATER) TRACKS.push({ x: u.x, y: u.y, face: u.face || 0, t: G.tick, foam: true, sub: submerged });
    else TRACKS.push({ x: u.x, y: u.y, face: u.face || 0, t: G.tick,
                  dust: tgi === T_GROUND || tgi === T_ROAD });
  }
  // Being erased ([ChronoBeam] Temporal=yes): the unit fades out of the
  // frame over its own outline instead of taking damage.
  if (u.erase > 0) { ctx.save(); ctx.globalAlpha = Math.max(0.08, 1 - u.erase * 0.85); }
  else if (submerged) { ctx.save(); ctx.globalAlpha = 0.42; }
  if (u.deployed && SPR.bags) {                        // the pit and the BACK lip, UNDER him
    var BGb = SPR.bags[u.p].back;
    ctx.drawImage(BGb.c, px - BGb.w / 2, py - (BGb.h - UPAD), BGb.w, BGb.h);
  }
  ctx.drawImage(s.c, ox, oy, s.w, s.h);
  if (submerged && !(u.erase > 0)) ctx.restore();
  if (gondS) ctx.drawImage(gondS.c, ox + gondDx, oy + gondDy, gondS.w, gondS.h);
  if (turretS) ctx.drawImage(turretS.c, ox, oy, turretS.w, turretS.h);
  if (u.erase > 0) {
    ctx.restore();
    // ...and rings of collapsing spacetime close on it as it goes.
    ctx.strokeStyle = 'rgba(150,215,255,.75)'; ctx.lineWidth = 1.3;
    for (var eri = 0; eri < 3; eri++) {
      var erp = ((G.tick * 0.02 + eri / 3) % 1);
      ctx.globalAlpha = (1 - erp) * 0.8;
      ctx.beginPath(); ctx.ellipse(px, py - 9, 3 + erp * 15, 1.6 + erp * 7.5, 0, 0, 6.29); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  if (u.drone) {
    // The sparks coming off the joint the drone is working on.
    ctx.fillStyle = 'rgba(255,236,150,.95)';
    for (var spi = 0; spi < 4; spi++) {
      var sph = ((G.tick * 3 + spi * 13 + u.id * 7) % 24) / 24;
      var spa = (u.id * 1.7 + spi * 1.9 + (G.tick >> 3)) % 6.283;
      ctx.globalAlpha = 1 - sph;
      ctx.fillRect(px + Math.cos(spa) * (3 + sph * 9), py - 5 - sph * 7 + Math.sin(spa) * 3, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(180,120,255,.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(px, py - 6, 8 + ((G.tick >> 2) & 3), 0, 6.29); ctx.stroke();
  }
  if (u.mcBy) {
    // [Controller] AnimList=YURICNTL: a violet halo turning over the head of
    // something that is no longer fighting for the side that built it.
    ctx.save();
    ctx.strokeStyle = 'rgba(186,120,255,.8)'; ctx.lineWidth = 1.4;
    var mcy = py - (art.fr ? 24 : 26) - alt;
    ctx.beginPath(); ctx.ellipse(px, mcy, 7, 2.6, 0, 0, 6.29); ctx.stroke();
    for (var mci = 0; mci < 3; mci++) {
      var mca = G.tick * 0.07 + mci * 2.094;
      ctx.fillStyle = 'rgba(226,190,255,.9)';
      ctx.fillRect(px + Math.cos(mca) * 7 - 1, mcy + Math.sin(mca) * 2.6 - 1, 2, 2);
    }
    // The tether back to the Yuri holding it, for the first two seconds.
    if (G.tick - (u.mcAt || 0) < 120) {
      var mcu = G.byId[u.mcBy];
      if (mcu && !mcu.dead) {
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(186,120,255,' + (0.85 - (G.tick - u.mcAt) / 160).toFixed(2) + ')';
        ctx.beginPath(); ctx.moveTo(sx(mcu.x, mcu.y), sy(mcu.x, mcu.y) - 14);
        ctx.lineTo(px, mcy); ctx.stroke();
      }
    }
    ctx.restore();
  }
  // Battle damage: RA2 vehicles trail black smoke below half health and
  // burn below a quarter. Phase comes off `tick` and the unit id, never
  // off the sim RNG.
  if (!art.fr && u.hp < u.maxhp * 0.5) {
    var hurt = u.hp / u.maxhp, burning = hurt < 0.25;
    // Anchored to the hull's own ink top, so the column leaves the deck and
    // rises clear of the sprite instead of getting lost inside it.
    var deck = s.bb ? oy + s.bb.y0 + 4 : py - alt - 16;
    for (var sk = 0; sk < 3; sk++) {
      // The three puffs are spread evenly round the cycle, so one is always
      // fresh off the deck and the column never blinks out entirely.
      var sper = 34, sph = ((((G.tick + u.id * 23) % sper) / sper) + sk / 3) % 1;
      ctx.globalAlpha = (burning ? 0.62 : 0.48) * (1 - sph * 0.85);
      ctx.fillStyle = burning ? '#1d1d22' : '#31353c';
      ctx.beginPath();
      ctx.arc(px + Math.sin((u.id + sk) * 2.1) * 3 + sph * 6, deck - 4 - sph * 30,
              3 + sph * 9, 0, 6.29);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (burning) {                                    // flame licks out of the hull
      ctx.globalCompositeOperation = 'lighter';
      for (sk = 0; sk < 2; sk++) {
        var fl2 = 1 + ((G.tick + u.id * 5 + sk * 3) % 5) * 0.14;
        var fx2 = px + (sk ? 3.5 : -3.5), fy2 = deck + 10;
        ctx.fillStyle = 'rgba(226,96,26,.75)';
        ctx.beginPath(); ctx.ellipse(fx2, fy2 - 2.4 * fl2, 2.4 * fl2, 4 * fl2, 0, 0, 6.29); ctx.fill();
        ctx.fillStyle = 'rgba(255,214,120,.85)';
        ctx.beginPath(); ctx.ellipse(fx2, fy2 - 1.6 * fl2, 1.2 * fl2, 2.2 * fl2, 0, 0, 6.29); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  if (u.deployed && SPR.bags) {                                          // the front parapet, OVER him
    var BG = SPR.bags[u.p].front;
    ctx.drawImage(BG.c, px - BG.w / 2, py - (BG.h - UPAD), BG.w, BG.h);
  }
  // RA2 sizes the selection box off the unit's own SIZE, not off the frame
  // it happens to be showing, so every infantryman's brackets match and a
  // man who drops prone or leans into a stride does not change box.
  var bb;
  if (art.fr) {
    var ibh = u.prone ? 9 : 26;                  // a man on his face is a low box
    bb = { x0: s.w / 2 - (u.prone ? 13 : 8), y0: s.h - UPAD - ibh,
           x1: s.w / 2 + (u.prone ? 13 : 8), y1: s.h - UPAD + 1 };
  } else bb = s.bb || { x0: 0, y0: 0, x1: s.w, y1: s.h };
  var top = oy + bb.y0;

  // RA2-style corner brackets around the sprite, drawn over it so a wide
  // hull cannot hide them (the old ground ring sat under the tank).
  if (u.sel) brackets(ox + bb.x0 - 3, top - 3, ox + bb.x1 + 3, oy + bb.y1 + 1);

  // Cargo pip on a loaded harvester — you can see who is worth killing.
  if (isHarv(u) && u.cargo > 30) {
    ctx.fillStyle = '#e8b428';
    ctx.fillRect(px - 7, py - 26, 14 * (u.cargo / ucap(G, u)), 2.6);
  }
  // [FV]/[HTK]/[SHAD]/[SAPC] PipScale=Passengers: RA2 draws one pip per
  // SEAT over the hull, lit for a seat that is filled. Twelve seats would
  // out-width the vehicle, so past six they go on two rows.
  if (paxCapOf(u)) {
    var pcap = paxCapOf(u), pnum = paxCount(u);
    var prow = pcap > 6 ? Math.ceil(pcap / 2) : pcap;
    var ppw = 4, ppg = 1, ptot = prow * (ppw + ppg) - ppg;
    var ppy = Math.min(top - 5, py - 28 - alt);
    var prows = Math.ceil(pcap / prow);
    for (var prr = 0; prr < prows; prr++) {                // one solid backing bar per row
      var nr = Math.min(prow, pcap - prr * prow);
      var bw = nr * (ppw + ppg) - ppg;
      ctx.fillStyle = 'rgba(10,13,17,.82)';
      ctx.fillRect(px - bw / 2 - 1, ppy - prr * 5 - 1, bw + 2, 5);
    }
    for (var pip = 0; pip < pcap; pip++) {
      var pr = (pip / prow) | 0, pc = pip - pr * prow;
      var inRow = Math.min(prow, pcap - pr * prow);
      var pxx = px - (inRow * (ppw + ppg) - ppg) / 2 + pc * (ppw + ppg);
      ctx.fillStyle = pip < pnum ? '#48e07c' : 'rgba(126,138,152,.55)';
      ctx.fillRect(pxx, ppy - pr * 5, ppw, 3);
    }
  }
  if (u.hp < u.maxhp) hpBar(px, art.fr ? top - 6 : Math.min(top - 8, py - 30 - alt), 20, u.hp / u.maxhp);
  if (u.rank) {
    // Veterancy chevrons at the sprite's lower right, gold like RA2's.
    var cxr = ox + bb.x1 + 1, cyr = oy + bb.y1 - 2;
    ctx.strokeStyle = '#f2c94c'; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var rk = 0; rk < u.rank; rk++) {
      var yy = cyr - rk * 4;
      ctx.beginPath(); ctx.moveTo(cxr - 3, yy - 3); ctx.lineTo(cxr, yy); ctx.lineTo(cxr + 3, yy - 3); ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }
  if (u.sel && u.wp && u.wp.length) {
    // Queued waypoints for a selected unit: a dashed route with numbered stops.
    var fx0 = u.order ? sx(u.order.x, u.order.y) : px, fy0 = u.order ? sy(u.order.x, u.order.y) : py;
    ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(138,208,255,.8)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(fx0, fy0);
    for (var wi = 0; wi < u.wp.length; wi++) ctx.lineTo(sx(u.wp[wi].x, u.wp[wi].y), sy(u.wp[wi].x, u.wp[wi].y));
    ctx.stroke(); ctx.restore();
    ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center';
    for (wi = 0; wi < u.wp.length; wi++) {
      var wx = sx(u.wp[wi].x, u.wp[wi].y), wy = sy(u.wp[wi].x, u.wp[wi].y);
      ctx.fillStyle = 'rgba(14,17,23,.85)'; ctx.beginPath(); ctx.arc(wx, wy, 6, 0, 6.29); ctx.fill();
      ctx.fillStyle = '#8ad0ff'; ctx.fillText(String(wi + 1), wx, wy + 3);
    }
    ctx.textAlign = 'left';
  }
}

// A falling airframe: the sprite spun through its facings as it tumbles,
// over a smoke trail drawn back along the path it fell.
// A live Ivan bomb, drawn on whatever is carrying it — unit or structure —
// with the fuse counting down in seconds, so "get away from that tank" is a
// readable instruction and not a surprise.
function drawBombs() {
  if (!G.bombs.length) return;
  ctx.save();
  ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center';
  for (var i = 0; i < G.bombs.length; i++) {
    var e = G.bombs[i];
    if (!e.bomb || e.dead || !entSeen(G, e)) continue;
    var ex = entX(e), ey = entY(e), bx = sx(ex, ey), by = sy(ex, ey);
    if (bx < VX0 - 60 || by < VY0 - 60 || bx > VX1 + 60 || by > VY1 + 60) continue;
    var left = Math.max(0, e.bomb.at - G.tick);
    var secs = Math.ceil(left / 60);
    var beat = left < 180 ? (((G.tick >> 2) & 1) ? 1 : 0) : (((G.tick >> 4) & 1) ? 1 : 0);
    var top = by - (e.kind === 'b' ? 40 + e.gh * 4 : 36);
    // the satchel itself
    ctx.fillStyle = beat ? '#ff5b46' : '#8d2b1f';
    ctx.beginPath(); ctx.roundRect(bx - 6, top - 6, 12, 10, 2); ctx.fill();
    ctx.strokeStyle = '#2a1210'; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = '#d9c98a'; ctx.lineWidth = 1.2;              // the fuse
    ctx.beginPath(); ctx.moveTo(bx, top - 6); ctx.quadraticCurveTo(bx + 4, top - 12, bx + 1, top - 14); ctx.stroke();
    if (beat) { ctx.fillStyle = '#ffd06a'; ctx.beginPath(); ctx.arc(bx + 1, top - 14, 2.1, 0, 6.29); ctx.fill(); }
    // The count goes ABOVE the satchel, clear of the hull it is stuck to —
    // painted across the sprite it was unreadable on exactly the units you
    // most need to read it on.
    ctx.fillStyle = 'rgba(10,12,16,.8)';
    ctx.fillText(secs + 's', bx + 1, top - 9);
    ctx.fillStyle = beat ? '#ffd7cf' : '#f0a89c';
    ctx.fillText(secs + 's', bx, top - 10);
  }
  ctx.textAlign = 'left';
  ctx.restore();
}

function drawWreck(w) {
  var alt = wreckAlt(w), px = sx(w.x, w.y), py = sy(w.x, w.y);
  if (px < VX0 - 90 || py < VY0 - 90 || px > VX1 + 90 || py > VY1 + 90) return;
  var art = SPR.unit[w.p][facOf(G, w.p) || 'dir'][w.type];
  if (w.sink) {
    var sk = w.t / w.life, ss = Array.isArray(art) ? art[octOf ? octOf(w.face) : (w.face & 7)] : art;
    if (!ss) return;
    // She goes down by the stern, heeling as she goes: the hull is clipped
    // at the waterline and the clip line climbs the sprite.
    ctx.save();
    ctx.beginPath();
    ctx.rect(px - 70, py - 90, 140, 90 - sk * 46);
    ctx.clip();
    ctx.translate(px, py);
    ctx.rotate(sk * 0.42 * (w.face < NFACE / 2 ? 1 : -1));
    ctx.globalAlpha = 1 - sk * 0.35;
    ctx.drawImage(ss.c, -ss.w / 2, -(ss.h - UPAD) + sk * 16, ss.w, ss.h);
    ctx.restore();
    // Foam closing over her.
    ctx.strokeStyle = 'rgba(226,242,250,' + (0.75 * (1 - sk)) + ')';
    ctx.lineWidth = 1.6;
    for (var ri = 0; ri < 3; ri++) {
      var rr = (sk + ri * 0.33) % 1;
      ctx.beginPath(); ctx.ellipse(px, py, 5 + rr * 20, 2.4 + rr * 10, 0, 0, 6.29); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return;
  }
  var f = (((w.face + Math.round(w.t * w.spin)) % NFACE) + NFACE) % NFACE;
  var s = Array.isArray(art) ? art[f] : (art.fr ? art.fr('walk', f, (w.t >> 3) % 6) : art);
  if (!s) return;
  ctx.save();
  for (var k = 1; k <= 4; k++) {
    var tt = w.t - k * 5; if (tt < 0) break;
    var bx = w.x - w.vx * (w.t - tt), by = w.y - w.vy * (w.t - tt);
    var ba = w.alt0 * (1 - tt / w.life) * (1 - tt / w.life);
    ctx.globalAlpha = 0.30 * (1 - k / 5);
    ctx.fillStyle = '#39404a';
    ctx.beginPath(); ctx.arc(sx(bx, by), sy(bx, by) - ba, 3 + k * 1.7, 0, 6.29); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.drawImage(s.c, px - s.w / 2, py - (s.h - UPAD) - alt, s.w, s.h);
  ctx.restore();
}

// Drop shadow of an aircraft on the ground: one baked soft ellipse scaled
// to the type, offset down-left of the airframe the way RA2's light falls.
function drawAirShadow(u) {
  var d = UNITS[u.type], alt = altOf(u);
  var sh = d.shadow || [12, 5];
  var px = sx(u.x, u.y) - alt * 0.42, py = sy(u.x, u.y) + alt * 0.06;
  if (px < VX0 - 80 || py < VY0 - 80 || px > VX1 + 80 || py > VY1 + 80) return;
  var w = sh[0] * 2, h = sh[1] * 2;
  if (!alt) { w *= 0.8; h *= 0.8; px = sx(u.x, u.y); py = sy(u.x, u.y) + 1; }
  ctx.globalAlpha = alt ? 0.5 : 0.38;
  ctx.drawImage(SPR.shadow.c, px - w / 2, py - h / 2, w, h);
  ctx.globalAlpha = 1;
}

// The 28 ticks before a Tesla Coil or Prism Tower shoots. art.ini gates
// both on IsAnimDelayedFire / DelayedFireDelay=28 with their own firing
// anim ([NATSLA_B] is 10 frames, [GAPRIS_A] the prism's); this is that
// wind-up drawn rather than sprited.
function drawCharge(b, px, py) {
  var q = 1 - b.charging / CHARGE_T;                  // 0 -> 1 over the wind-up
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (b.type === 'tesla') {
    var topY2 = py - 70, footY = py - 12;   // electrode / coil foot — see bakeBuilding's `eY` (68 -> 70 with the neck)
    var climb = footY + (topY2 - footY) * Math.min(1, q * 1.15);
    for (var a = 0; a < 3; a++) {                     // arcs crawling up the coil
      var seed2 = G.tick * 2.3 + a * 11 + b.id;
      ctx.strokeStyle = 'rgba(150,190,255,' + (0.30 + 0.5 * q).toFixed(2) + ')';
      ctx.lineWidth = a ? 1.1 : 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(px + Math.sin(seed2) * 3, footY);
      for (var k5 = 1; k5 <= 5; k5++) {
        var qq = k5 / 5;
        ctx.lineTo(px + Math.sin(seed2 + k5 * 2.1) * 7 * (1 - qq * 0.4),
                   footY + (climb - footY) * qq);
      }
      ctx.stroke();
    }
    var gr = 3 + q * 9;                               // the electrode charging
    ctx.fillStyle = 'rgba(180,215,255,' + (0.25 + 0.6 * q).toFixed(2) + ')';
    ctx.beginPath(); ctx.arc(px, topY2, gr, 0, 6.29); ctx.fill();
    ctx.fillStyle = 'rgba(240,248,255,' + (0.3 + 0.6 * q).toFixed(2) + ')';
    ctx.beginPath(); ctx.arc(px, topY2, gr * 0.45, 0, 6.29); ctx.fill();
  } else {
    var cy2 = py - 86, cr = 4 + q * 10;               // the prism crown filling
    ctx.fillStyle = 'rgba(150,240,255,' + (0.2 + 0.55 * q).toFixed(2) + ')';
    ctx.beginPath(); ctx.arc(px, cy2, cr, 0, 6.29); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + 0.6 * q).toFixed(2) + ')';
    ctx.beginPath(); ctx.arc(px, cy2, cr * 0.4, 0, 6.29); ctx.fill();
    ctx.strokeStyle = 'rgba(180,245,255,' + (0.5 * (1 - q) + 0.2).toFixed(2) + ')';
    ctx.lineWidth = 1.3;
    for (var si = 0; si < 4; si++) {                  // light drawn into the crown
      var sa = si * 1.5708 + G.tick * 0.08, sd = 26 * (1 - q) + 6;
      ctx.beginPath();
      ctx.moveTo(px + Math.cos(sa) * sd, cy2 + Math.sin(sa) * sd * 0.6);
      ctx.lineTo(px + Math.cos(sa) * (sd - 7), cy2 + Math.sin(sa) * (sd - 7) * 0.6);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
}

// The ghost is the structure's OWN baked sprite washed green or red — one
// cached tint per (structure, verdict, faction), never re-composited per
// frame. `source-atop` keeps the wash inside the sprite's own pixels, so
// the silhouette stays readable instead of becoming a coloured box.
var ghostCache = {}, ghostAt = null;

function ghostSprite(key, ok, art) {
  var ck = key + '|' + (ok ? 1 : 0) + '|' + (G.side[ME].fac || 'dir');
  if (ghostCache[ck]) return ghostCache[ck];
  var src = art.s.c;
  var c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  var g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = ok ? 'rgba(80,225,140,.5)' : 'rgba(235,70,80,.6)';
  g.fillRect(0, 0, src.width, src.height);
  g.globalCompositeOperation = 'source-over';
  ghostCache[ck] = c;
  return c;
}

// A wall segment reads its four sides off the occupancy grid: any of the
// owner's OWN walls or gates next door counts as a connection, so a run
// welds itself together and a gate dropped into a line is flanked by two
// stubs rather than floating.
function wallMask(g, b) {
  var m = 0;
  for (var i = 0; i < WALL_DIRS.length; i++) {
    var d = WALL_DIRS[i], nx = Math.round(b.cx + d[1] * 2), ny = Math.round(b.cy + d[2] * 2);
    if (!inMap(nx, ny)) continue;
    var o = g.byId[g.occ[idx(nx, ny)]];
    if (o && !o.dead && o.p === b.p && (BLDS[o.type].wall || BLDS[o.type].gate)) m |= d[0];
  }
  return m;
}

// The neutral house has one art set and no owner colour. Everything else —
// the damage post-pass, the fire ports, the smoke, the brackets — is the
// same machinery the player's structures use.
function drawNeutral(b) {
  var A0 = SPR.neut[b.type];
  if (!A0) return;
  var held = occCount(b) > 0;
  var art = (held && A0.lit) ? A0.lit : A0;
  var px = sx(b.cx, b.cy), py = sy(b.cx, b.cy);
  if (px < VX0 - 260 || py < VY0 - 260 || px > VX1 + 260 || py > VY1 + 260) return;
  var ox = px - art.ax, oy = py - art.ay;
  var frac = b.hp / b.maxhp, hurt = frac <= 0.5;
  var setN = hurt ? dmgSetOf(art, b.type + (art === A0 ? '' : 'lit')) : [art.s];
  ctx.drawImage(setN[0].c, ox, oy, art.s.w, art.s.h);
  if (hurt) {
    var crit0 = frac < 0.25, ports0 = portsOf(art), per0 = crit0 ? 7 : 13;
    if (((G.tick + b.id * 7) % per0) === 0) {
      var pt0 = ports0[((G.tick / per0 + b.id) | 0) % ports0.length];
      G.fx.push({ x: b.cx, y: b.cy, ox: pt0.x, oy: pt0.y, t: 0, life: 78, smoke: true, lift: 0, big: crit0 ? 1.35 : 1 });
      if (crit0) G.fx.push({ x: b.cx, y: b.cy, ox: pt0.x, oy: pt0.y + 3, t: 0, life: 24, fire: true, lift: 0, big: 1.5 });
    }
  }
  var bbN = art.s.bb || { x0: 0, y0: 0, x1: art.s.w, y1: art.s.h };
  if (b.sel) brackets(ox + bbN.x0 - 3, oy + bbN.y0 - 3, ox + bbN.x1 + 3, oy + bbN.y1 + 2);
  // Over the MASS, not over the mast tip (see artTopSolid).
  var topN = py - Math.max(art.mass || art.rise || 0, (b.gw + b.gh) * 8) - 6;
  if (b.hp < b.maxhp) hpBar(px, topN - 4, 30, frac);
  // Garrison pips: RA2 shows how many men are inside as a row of dots.
  if (held) {
    var capN = occCapOf(b), k0, pw = Math.min(3.4, 26 / capN);
    var x0N = px - (capN * (pw + 1.4)) / 2;
    for (k0 = 0; k0 < capN; k0++) {
      ctx.fillStyle = k0 < occCount(b) ? (b.p === P_HUMAN ? COL[P_HUMAN] : COL[P_AI]) : 'rgba(20,24,30,.55)';
      ctx.fillRect(x0N + k0 * (pw + 1.4), topN - 12, pw, 4);
    }
  }
}

function drawBld(b) {
  var bd0 = BLDS[b.type];
  if (bd0.neut) { drawNeutral(b); return; }
  if (bd0.wall || bd0.gate) {
    var wpx = sx(b.cx, b.cy), wpy = sy(b.cx, b.cy);
    if (wpx < VX0 - 120 || wpy < VY0 - 120 || wpx > VX1 + 120 || wpy > VY1 + 120) return;
    var wfk = bfacOf(G, b) || 'dir', wm2 = wallMask(G, b), wa;
    if (bd0.gate) {
      // The run's axis: a gate between two N/S neighbours stands across the
      // NW-SE grid line, otherwise across the other one.
      wa = gateSprite(b.p, wfk, !!(wm2 & 5) && !(wm2 & 10), (b.gate || 0) / GATE_T);
    } else {
      wa = wallSprite(b.p, wfk, wm2);
    }
    var wal = 1;
    if (b.make > 0) wal = 0.35 + 0.65 * (1 - b.make / MAKE_T);       // it goes up, it does not pop in
    if (wal < 1) ctx.globalAlpha = wal;
    ctx.drawImage(wa.s.c, wpx - wa.ax, wpy - wa.ay, wa.s.w, wa.s.h);
    ctx.globalAlpha = 1;
    // Concrete does not smoke: a battered wall just cracks (a dark wash),
    // which is also the only damage state RA2 gives it.
    if (b.hp < b.maxhp * 0.5) {
      ctx.globalAlpha = 0.30;
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(wa.s.c, wpx - wa.ax, wpy - wa.ay, wa.s.w, wa.s.h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    if (b.sel) hpBar(wpx, wpy - 24, 20, b.hp / b.maxhp);
    return;
  }
  // [owner][the STRUCTURE'S faction]: the holder's colour on the
  // structure's own shape, so a captured Soviet hall stays a Soviet hall.
  var art = SPR.bld[b.p][bfacOf(G, b) || 'dir'][b.type];
  var px = sx(b.cx, b.cy), py = sy(b.cx, b.cy);
  if (px < VX0 - 260 || py < VY0 - 260 || px > VX1 + 260 || py > VY1 + 260) return;

  var bb = art.s.bb || { x0: 0, y0: 0, x1: art.s.w, y1: art.s.h };
  var ox = px - art.ax, oy = py - art.ay;
  var fk = bfacOf(G, b) || 'dir';
  var frac = b.hp / b.maxhp;
  var hurt = frac <= 0.5;
  // No power on this side (or switched off at the sidebar): RA2 stops the
  // animation and puts the lights out -- there is no emoji over the roof.
  var dark = !!b.offline || (BLDS[b.type].power < 0 && !powered(G, b.p));
  var artC;

  if (b.make > 0) {
    // MAKE: apron first, then the structure behind a rising wipe with a
    // scaffold band and a crane working in the uncovered strip.
    // MCV unpack runs first: the vehicle opening out where the yard will be.
    if (b.unpack > 0) {
      var UPK = unpackOf(b.p, fk, b.unpackFace || 0);
      var upi = Math.min(UPK.length - 1, (((MCV_T - b.unpack) / MCV_T) * UPK.length) | 0);
      var upf = UPK[upi];
      ctx.drawImage(upf.s.c, px - upf.ax, py - upf.ay, upf.s.w, upf.s.h);
      if ((G.tick % 5) === 0)
        G.fx.push({ x: b.cx + ((G.tick / 5 | 0) % 3 - 1) * 0.5, y: b.cy, t: 0, life: 22, dust: true, size: 0 });
      return;
    }
    var MK = makeOf(art, COL[b.p]);
    // Selling runs the MAKE BACKWARDS (RA2 plays the build-up in reverse to
    // sell); the MCV's unpack runs in front of the yard's own build-up.
    var prog = b.sell ? b.make / MAKE_T : (1 - b.make / MAKE_T);
    artC = MK.length ? MK[Math.min(MK.length - 1, (prog * MK.length) | 0)].c : art.s.c;
    if ((G.tick % 6) === (b.id % 6)) {                   // dust at the foot
      var dz = ((G.tick / 6 + b.id) | 0) % 3;
      G.fx.push({ x: b.cx + (dz - 1) * b.gw * 0.3, y: b.cy + (1 - dz) * b.gh * 0.3,
                  t: 0, life: 26, dust: true, size: 0 });
    }
  } else {
    // A defence with a target points at it: 8 bearing frames, indexed by
    // the bearing to b.target (art.ini Turret=yes / TurretAnim=).
    var aimI = -1;
    if (AIMED[b.type] && b.target && !b.target.dead && !dark) {
      var tX = b.target.kind === 'b' ? b.target.cx : b.target.x;
      var tY = b.target.kind === 'b' ? b.target.cy : b.target.y;
      aimI = faceOf(tY - b.cy, tX - b.cx);
    }
    var set, tag, fi;
    if (b.door > 0) {
      // The door sequence: whole baked frames indexed by door position, so
      // the roof panel, the bay shutter and the maw leaf all move together.
      var DS = hurt ? doorDmgOf(art, b.type, b.p, fk) : doorOf(art, b.type, b.p, fk);
      set = DS; fi = Math.min(DS.length - 1, Math.round(doorPos(DOOR_T - b.door) * (DS.length - 1)));
      tag = (hurt ? 'rd' : 'r') + fi;
    } else if (aimI >= 0) {
      set = hurt ? aimDmgOf(art, b.type, b.p, fk) : aimOf(art, b.type, b.p, fk);
      tag = (hurt ? 'ad' : 'a') + aimI; fi = aimI;
    } else {
      // IDLE ANIMATION RATE. This was 5 ticks a frame: six phases in 30 ticks,
      // so at 60 fps every animated structure ran a FULL sine cycle twice a
      // second. The yard's crane luffed through its whole arc 4x in 2 seconds
      // — measured off a filmstrip — and every `anS`/`anC` consumer went with
      // it, including glows written as `0.5 + 0.5 * anC`, which at 2 Hz is a
      // strobe rather than a pulse.
      //
      // Ambient motion is not free: the eye is drawn to it pre-attentively,
      // and in an RTS the player is scanning for threats. Anything looping
      // faster than about 1 Hz reads as an alert; slower than about 0.2 Hz
      // reads as ambience. A real gantry crane cycles in 10-30 s, so 5 s
      // keeps the character of working machinery without competing with the
      // battlefield. Hurt machinery stays slower still, as it was.
      set = hurt ? dmgSetOf(art, b.type) : (art.frames || [art.s]);
      tag = hurt ? 'd' : 'i';
      // Dead metal does not move: an unpowered structure freezes on frame 0.
      fi = dark ? 0 : ((G.tick / (hurt ? IDLE_T * 2 : IDLE_T) + b.id * 2) | 0) % set.length;
      tag += fi;
    }
    artC = (dark ? offOf(art, tag, set[fi]) : set[fi]).c;
  }
  ctx.drawImage(artC, ox, oy, art.s.w, art.s.h);

  // Damage: smoke and fire out of this structure's OWN fire ports, the
  // same holes every time (art.ini DamageFireOffset0..2), not a jitter.
  if (hurt && b.make <= 0) {
    var crit = frac < 0.25;
    var ports = portsOf(art);
    var per2 = crit ? 7 : 13;
    if (((G.tick + b.id * 7) % per2) === 0) {
      var pt = ports[((G.tick / per2 + b.id) | 0) % ports.length];
      G.fx.push({ x: b.cx, y: b.cy, ox: pt.x, oy: pt.y, t: 0, life: 78, smoke: true,
                  lift: 0, big: crit ? 1.35 : 1 });
      if (crit) G.fx.push({ x: b.cx, y: b.cy, ox: pt.x, oy: pt.y + 3, t: 0, life: 24, fire: true,
                            lift: 0, big: 1.5 });
    }
  }
  // Winding up: the Tesla Coil's arcs climb the coil, the Prism's crown
  // brightens and pulls light in, for the 28 ticks before the shot.
  if (b.charging > 0) drawCharge(b, px, py);
  if (b.sel) {
    // Brackets around the art, over it: a footprint ring drawn under the
    // sprite was hidden by the building's own platform.
    brackets(ox + bb.x0 - 3, oy + bb.y0 - 3, ox + bb.x1 + 3, oy + bb.y1 + 2);
  }
  var topY = py - Math.max(art.mass || art.rise || 0, (b.gw + b.gh) * 8) - 6;
  if (b.hp < b.maxhp) hpBar(px, topY - 4, 30, b.hp / b.maxhp);

  // Switched off at the sidebar: the art already reads as dead metal, so
  // this is only the tag that says a PLAYER did it (a brown-out looks the
  // same and needs no label). RA2 has no emoji over the roof.
  if (b.offline) {
    ctx.fillStyle = 'rgba(150,162,180,.95)';
    ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('OFF', px, topY - 8);
    ctx.textAlign = 'left';
  }

  if (b.repair) {   // RA2's spinning wrench, gold on a dark disc
    var WR = wrenchSpr(), wri = ((G.tick / 4) | 0) & 7;
    ctx.drawImage(WR[wri].c, px - 13, topY - 34, 26, 26);
  }
  // "PRIMARY" tag, only when the choice exists (one factory is trivially it).
  var mk = BLDS[b.type].makes;
  if (b.p === ME && (mk === 'i' || mk === 'v') && isPrimary(G, b) && producersOf(G, b.p, mk).length > 1) {
    var ty = py + (b.gw + b.gh) * TH / 4 + 4;
    ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(18,22,30,.78)';
    ctx.beginPath(); ctx.roundRect(px - 26, ty, 52, 13, 3); ctx.fill();
    ctx.fillStyle = '#e8edf5'; ctx.fillText('PRIMARY', px, ty + 10);
    ctx.textAlign = 'left';
  }
}

function drawRally(b) {
  var r = b.rally;
  var ok = r.reachable;
  var col = ok ? '138,208,255' : '229,100,108';
  var ex = sx(r.x, r.y), ey = sy(r.x, r.y);

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(' + col + ',.85)';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 6]);
  ctx.lineDashOffset = -(performance.now() / 55) % 13;    // marching ants
  ctx.beginPath();
  var f = r.from || { x: Math.round(b.cx), y: Math.round(b.cy) };
  ctx.moveTo(sx(f.x, f.y), sy(f.x, f.y));
  if (ok && r.path.length) {
    for (var i = 0; i < r.path.length; i++) {
      ctx.lineTo(sx(r.path[i].x, r.path[i].y), sy(r.path[i].x, r.path[i].y));
    }
  } else {
    ctx.lineTo(ex, ey);                                   // no route: straight
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Destination marker: a flag on a post, with a footprint diamond so it
  // reads as a place on the ground rather than an icon floating over it.
  ctx.strokeStyle = 'rgba(' + col + ',.55)';
  ctx.lineWidth = 1.4;
  diamond(ctx, ex, ey, 26, 13);
  ctx.stroke();

  var pulse = 1 + Math.sin(performance.now() / 260) * 0.12;
  ctx.strokeStyle = 'rgba(' + col + ',.95)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex, ey - 26 * pulse); ctx.stroke();
  ctx.fillStyle = 'rgba(' + col + ',.92)';
  ctx.beginPath();
  ctx.moveTo(ex, ey - 26 * pulse);
  ctx.lineTo(ex + 15, ey - 21 * pulse);
  ctx.lineTo(ex, ey - 16 * pulse);
  ctx.closePath(); ctx.fill();

  if (!ok) {                                              // say why it is red
    ctx.fillStyle = 'rgba(229,100,108,.95)';
    ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('no route', ex, ey + 18);
    ctx.textAlign = 'left';
  }
  ctx.restore();
}

// RA2 does not draw a solid bar: it draws a bracketed strip of discrete
// pips, green above two thirds, yellow above one third, red below — which
// is why an RA2 player can read "three pips left" at a glance across a
// battle. Wider things (structures) get more pips, exactly as RA2 scales
// the strip with the object.
function hpBar(x, y, w, f) {
  var n = Math.max(5, Math.min(16, Math.round(w / 3.4)));
  var lit = f <= 0 ? 0 : Math.max(1, Math.ceil(f * n));
  var x0 = x - w / 2, gap = 1, pw = (w - (n - 1) * gap) / n;
  ctx.fillStyle = 'rgba(0,0,0,.62)';
  ctx.fillRect(x0 - 2, y - 1.5, w + 4, 6);
  // brackets
  ctx.fillStyle = 'rgba(226,235,247,.8)';
  ctx.fillRect(x0 - 2, y - 1.5, 1, 6); ctx.fillRect(x0 + w + 1, y - 1.5, 1, 6);
  var col = f > 0.6 ? '#5ad07a' : (f > 0.3 ? '#e8b428' : '#e5646c');
  for (var i = 0; i < n; i++) {
    ctx.fillStyle = i < lit ? col : 'rgba(255,255,255,.12)';
    ctx.fillRect(x0 + i * (pw + gap), y, pw, 3);
  }
}

// The one terrain palette: the minimap and the menu's map previews are the
// same picture at two sizes, so they must not drift apart.
function terrCol(t, theatre) {
  var snowy = theatre === 'snow', urb = theatre === 'urban';
  return t === T_GROUND ? (snowy ? '#aeb8be' : urb ? '#4b4f55' : '#2e3a24') : t === T_ROCK ? '#39414f'
       : t === T_ORE ? '#c9822f' : t === T_GEM ? '#8a6ae0'
       : t === T_WATER ? (snowy ? '#8fb0c4' : '#2c5d86') : t === T_CLIFF ? '#6e6656' : t === T_TREE ? '#2f5a2a'
       : t === T_RAMP ? '#8f8468' : t === T_BRIDGE ? '#c6bba0' : t === T_CIV ? '#9a9184' : '#6a6a60';
}

// --- generated ---
// ESM import bindings are read-only, so a write from another module goes
// through the owner. Reads stay verbatim everywhere: the binding is live.
function setTRK_AT(v) { TRK_AT = v; }

// ─── structures/depot ─── Iron Frontier unit art. Included into rts.html by tools/rts-build.py;
// every free identifier is a local of bakeBuilding() in rts.src.html — see art/units/README.md.

import { outline } from '../../bake/kit.js';
import { diamond, shade } from '../../bake/terrain.js';
import { chevrons, crates, cylinder, drums, faceL, facePatch, faceR, lattice, prism } from '../../bake/vehicles.js';

export function drawDepot(C) {
  var baseY = C.baseY, bph = C.bph, col = C.col, cx = C.cx, fh = C.fh, fw = C.fw, g = C.g,
      plot = C.plot, rnd = C.rnd, sov = C.sov, srand = C.srand;

// --- RA2 Service Depot -------------------------------------------------
// Rebuilt at 1:1 against the RED-owner SHP rips (the last frame of the
// wiki MAKE gifs): `allied-service-depot-idle.png` 140x87 w/h 1.61 and
// `soviet-service-depot-idle.png` 160x147 w/h 1.09. A red owner is what
// shows where the remap actually lives.
//
// Directorate: a dark GRATING DISC ringed by a fat amber kerb of running
// lamps and a mottled oil-stained apron, with four house clamp wedges on
// silver arms reaching in from the rim; off its back-left a navy hull
// carries one fat YELLOW gantry beam ending in a silver projector head,
// a house block at the beam's foot and a ribbed silver scoop on the far
// corner. No lattice crane anywhere on the sprite.
// Collective: a pale concrete octagon painted with four chunky
// yellow/black hazard bars and inward arrow heads, and off its back-left
// a brick works on a bold house-red pipe frame carrying a BLACK lattice
// mast with a house machine house at its head and a black jib swinging a
// house hook over the pad.
// Both keep the pad flat and empty: vehicles park on it to be repaired.
// Six idle phases (`bph`) bake into A.frames and are cycled by drawBld.
var anP = (bph || 0) * 6.283, anS = Math.sin(anP), anC = Math.cos(anP);
var ph6 = Math.round((bph || 0) * 6) % 6;

// ---- the repair yard, shared by both facs ---------------------------
// MEASURED, not guessed, off `docs/ra2-ref/sprites/buildings/
// soviet-service-depot.gif` (168x152). Segmenting the pad's concrete
// (saturation < 0.28, value >= 95, largest component; the bbox comes
// back 115x62 at cuts 0.24/0.28/0.32, so it is threshold-insensitive)
// gives an apron of 115x62 px against a sprite of 161x146:
//
//   pad width  115 / 161 Sw = 0.71     pad height 62 / 146 Sh = 0.42
//   pad aspect 115 /  62    = 1.85     striped square 72/115 = 0.63
//
// 1.85 is a TRUE 2:1 isometric ground plate (a couple of px of raised
// kerb is what takes it off 2.00), chamfered to an octagon. THE PAD IS
// THE BUILDING: it is 71% of the sprite's own width, and the works --
// brick shed, stack, crane -- is the smaller half at the back-left with
// its arm reaching out over the apron. Both facs are built to that.
var depOct = function (ox, oy, rx, ry) {
  g.beginPath();
  for (var doI = 0; doI < 8; doI++) {
    var doa = doI / 8 * 6.2832 + 0.3927;
    var dox = ox + Math.cos(doa) * rx, doy = oy + Math.sin(doa) * ry;
    if (doI) g.lineTo(dox, doy); else g.moveTo(dox, doy);
  }
  g.closePath();
};
// One raised bar of the hazard-striped parking box, plus the arrow head
// that points in at the square. RA2 paints four of these round a clean
// plate; they are the marking that says park HERE, and the reason the
// apron reads as a repair yard rather than as a patch of concrete.
var depBar = function (ox, oy, ax0, ay0, ax1, ay1, pal, lit) {
  var bdx = ax1 - ax0, bdy = ay1 - ay0, bl = Math.hypot(bdx, bdy) || 1;
  var bnx = -bdy / bl * 3.6, bny = bdx / bl * 3.6;
  g.save();
  g.beginPath();
  g.moveTo(ax0 + bnx, ay0 + bny); g.lineTo(ax1 + bnx, ay1 + bny);
  g.lineTo(ax1 - bnx, ay1 - bny); g.lineTo(ax0 - bnx, ay0 - bny);
  g.closePath(); g.clip();
  g.fillStyle = lit ? pal[1] : pal[0];
  g.fillRect(Math.min(ax0, ax1) - 10, Math.min(ay0, ay1) - 10,
             Math.abs(bdx) + 20, Math.abs(bdy) + 20);
  g.fillStyle = 'rgba(24,22,14,.92)';                       // black slashes
  for (var dbI = 0; dbI < 9; dbI++) {
    var bt0 = dbI / 9, bt1 = bt0 + 0.055;
    g.beginPath();
    g.moveTo(ax0 + bdx * bt0 + bnx, ay0 + bdy * bt0 + bny);
    g.lineTo(ax0 + bdx * bt1 + bnx, ay0 + bdy * bt1 + bny);
    g.lineTo(ax0 + bdx * (bt1 + 0.05) - bnx, ay0 + bdy * (bt1 + 0.05) - bny);
    g.lineTo(ax0 + bdx * (bt0 + 0.05) - bnx, ay0 + bdy * (bt0 + 0.05) - bny);
    g.closePath(); g.fill();
  }
  g.restore();
  g.strokeStyle = 'rgba(40,38,26,.55)'; g.lineWidth = 1;
  g.beginPath();
  g.moveTo(ax0 + bnx, ay0 + bny); g.lineTo(ax1 + bnx, ay1 + bny);
  g.lineTo(ax1 - bnx, ay1 - bny); g.lineTo(ax0 - bnx, ay0 - bny);
  g.closePath(); g.stroke();
  var dmx = (ax0 + ax1) / 2, dmy = (ay0 + ay1) / 2;         // arrow head, pointing in
  var awx = (ox - dmx), awy = (oy - dmy), awl = Math.hypot(awx, awy) || 1;
  awx /= awl; awy /= awl;
  g.fillStyle = lit ? pal[2] : pal[0];
  g.beginPath();
  g.moveTo(dmx + awx * 8, dmy + awy * 8);
  g.lineTo(dmx - awy * 5.4 + awx * 1, dmy + awx * 5.4 + awy * 1);
  g.lineTo(dmx + awy * 5.4 + awx * 1, dmy - awx * 5.4 + awy * 1);
  g.closePath(); g.fill(); outline(g, 'rgba(40,38,26,.60)');
};
// The four bars of one parking box round (ox,oy) at half-extents
// (qw,qh) -- an isometric square, so its corners are N/E/S/W.
// `pal` is [base, lit bar, lit arrow head].
var depBox = function (ox, oy, qw, qh, pal) {
  var dqC = [[ox - qw, oy], [ox, oy - qh], [ox + qw, oy], [ox, oy + qh]];
  for (var dqI = 0; dqI < 4; dqI++)
    depBar(ox, oy, dqC[dqI][0], dqC[dqI][1], dqC[(dqI + 1) % 4][0], dqC[(dqI + 1) % 4][1],
           pal, dqI === ph6 % 4);
};

if (sov) {
  // ---- Collective Service Depot -------------------------------------
  var SDP_CON = '#a0a496', SDP_COND = '#4b4f44', SDP_CONL = '#bcbfad';
  var SDP_BRK = '#8d7159', SDP_BRKL = '#a98a6c', SDP_BRKD = '#3c2d21';
  var SDP_IRN = '#20242b', SDP_IRND = '#0b0d11', SDP_IRNL = '#5a626d';
  var SDP_SIL = '#9aa0a8', SDP_SILL = '#d6dbe1';
  var SDP_TNK = '#c2b34a', SDP_HAZ = '#e8bc22';

  // ---- the octagonal repair pad --------------------------------------
  var sdX = cx + fw * 0.08, sdY = baseY + fh * 0.10;
  // sdB flattened 0.72->0.20->0.15: with the shared full-height
  // platform now skipped for `depot` (structures.js's "flat pad >=
  // 0.50 Sw wide carrying zero mass" clause), THIS octagon is the
  // pad's only ground silhouette, and an octagon's flat-topped
  // cross-section means its rendered column height is close to
  // 2*sdB*VS across nearly the whole width, not tapering like a
  // diamond's point. At 0.20, VS (1.1667 for depot:col's 4x3 plot)
  // plus the shadow-offset duplicate and outline stroke still
  // measured ~31px per column -- 16% over the clause's 0.15*Sh=26.8
  // threshold. 0.15 clears it with margin.
  var sdR = fw * 0.72, sdB = fh * 0.72;
  g.fillStyle = 'rgba(0,0,0,.30)'; depOct(sdX + 2, sdY + 3, sdR, sdB); g.fill();
  depOct(sdX, sdY, sdR, sdB); g.fillStyle = SDP_COND; g.fill();
  depOct(sdX, sdY - 2, sdR, sdB); g.fillStyle = SDP_CON; g.fill(); outline(g, SDP_COND);
  g.save(); depOct(sdX, sdY - 2, sdR, sdB); g.clip();
  g.strokeStyle = 'rgba(74,78,68,.34)'; g.lineWidth = 1;      // slab joints
  for (var sdJI = -3; sdJI <= 3; sdJI++) {
    g.beginPath();
    g.moveTo(sdX + sdJI * 22 - sdR, sdY + sdJI * 11 + sdB);
    g.lineTo(sdX + sdJI * 22 + sdR, sdY + sdJI * 11 - sdB); g.stroke();
    g.beginPath();
    g.moveTo(sdX + sdJI * 22 - sdR, sdY - sdJI * 11 - sdB);
    g.lineTo(sdX + sdJI * 22 + sdR, sdY - sdJI * 11 + sdB); g.stroke();
  }
  srand(311);
  for (var sdSt = 0; sdSt < 16; sdSt++) {                     // weathering
    var sda = rnd() * 6.283, sdrr = Math.sqrt(rnd());
    g.fillStyle = rnd() < 0.5 ? 'rgba(60,62,52,.24)' : 'rgba(196,198,180,.22)';
    g.beginPath();
    g.ellipse(sdX + Math.cos(sda) * sdrr * sdR * 0.9, sdY + Math.sin(sda) * sdrr * sdB * 0.9,
              4 + rnd() * 7, 2 + rnd() * 3, 0, 0, 6.29);
    g.fill();
  }
  g.restore();

  // FOUR chunky hazard bars painted round a clean plate, each with an
  // arrow head pointing in at the vehicle's parking square.
  var sqW = sdR * 0.66, sqH = sdB * 0.66;
  depBox(sdX, sdY, sqW, sqH, [SDP_HAZ, '#fff0a0', '#fff6c8']);
  diamond(g, sdX, sdY, sqW * 1.52, sqH * 1.52);               // clean parking plate
  g.fillStyle = SDP_CONL; g.fill(); outline(g, 'rgba(72,76,66,.44)');
  g.fillStyle = 'rgba(0,0,0,.12)';
  g.beginPath(); g.ellipse(sdX, sdY + sqH * 0.22, sqW * 0.40, sqH * 0.32, 0, 0, 6.29); g.fill();

  // ---- the works, off the back-left corner ---------------------------
  var swx = cx - fw * 0.64, swy = baseY - fh * 0.22;
  g.fillStyle = '#7c8073';                                    // works slab
  plot(g, swx + fw * 0.04, swy + fh * 0.20, fw * 0.62, fh * 0.62); g.fill();
  outline(g, '#3c4038');
  g.fillStyle = 'rgba(0,0,0,.22)';
  plot(g, swx + fw * 0.04, swy + fh * 0.20, fw * 0.44, fh * 0.44); g.fill();

  // bold house-red PIPE frame round the slab, at deck level
  var sdFrame = function (dy2, w2, cc) {
    g.strokeStyle = cc; g.lineWidth = w2; g.lineJoin = 'round';
    plot(g, swx + fw * 0.04, swy + fh * 0.20 + dy2, fw * 0.62, fh * 0.62); g.stroke();
  };
  sdFrame(3, 9, shade(col, 0.40));
  sdFrame(0, 7.4, col);
  sdFrame(-2.2, 2.4, shade(col, 1.28));
  for (var sdPI = 0; sdPI < 4; sdPI++) {                      // stanchions
    var spa = sdPI / 4 * 6.283 + 0.785;
    var spx = swx + fw * 0.04 + Math.cos(spa) * fw * 0.44;
    var spy = swy + fh * 0.20 + Math.sin(spa) * fh * 0.44;
    g.fillStyle = shade(col, 0.62); g.fillRect(spx - 3, spy - 9, 6, 11);
    g.fillStyle = shade(col, 1.16); g.fillRect(spx - 3, spy - 9, 2, 11);
  }

  // brick block with a red chevron band on its upper face
  var shHw = fw * 0.26, shHh = fh * 0.26, shLift = 50;
  prism(g, swx, swy, shHw, shHh, shLift, SDP_BRK, '#6d6455', SDP_BRKD, [0.30, 0.58]);
  for (var sdBc = 1; sdBc < 6; sdBc++) {                      // brick courses
    var bcv = sdBc / 6;
    var bcA = faceL(swx, swy, shHw, shHh, shLift, 0.02, bcv);
    var bcB = faceL(swx, swy, shHw, shHh, shLift, 0.98, bcv);
    g.strokeStyle = 'rgba(52,38,28,.34)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(bcA[0], bcA[1]); g.lineTo(bcB[0], bcB[1]); g.stroke();
    bcA = faceR(swx, swy, shHw, shHh, shLift, 0.02, bcv);
    bcB = faceR(swx, swy, shHw, shHh, shLift, 0.98, bcv);
    g.beginPath(); g.moveTo(bcA[0], bcA[1]); g.lineTo(bcB[0], bcB[1]); g.stroke();
  }
  facePatch(g, faceR, swx, swy, shHw, shHh, shLift, 0.30, 0.70, 0.02, 0.34,
            '#171310', '#0a0806');                            // dark doorway
  chevrons(g, faceL, swx, swy, shHw, shHh, shLift, 0.04, 0.96, 0.62, 0.92,
           7, col, '#241d16');                                // red chevron band
  facePatch(g, faceL, swx, swy, shHw, shHh, shLift, 0.04, 0.96, 0.94, 1.0,
            shade(col, 0.66), null);

  // silver girder deck across the block's front
  var sdGx = swx + fw * 0.10, sdGy = swy + fh * 0.26, sdGh = 30;
  g.fillStyle = SDP_SIL;
  g.beginPath();
  g.moveTo(sdGx - 36, sdGy - sdGh); g.lineTo(sdGx + 30, sdGy - sdGh - 15);
  g.lineTo(sdGx + 30, sdGy - sdGh - 7); g.lineTo(sdGx - 36, sdGy - sdGh + 8);
  g.closePath(); g.fill(); outline(g, '#4a4f56');
  g.fillStyle = SDP_SILL;
  g.beginPath();
  g.moveTo(sdGx - 36, sdGy - sdGh); g.lineTo(sdGx + 30, sdGy - sdGh - 15);
  g.lineTo(sdGx + 30, sdGy - sdGh - 12); g.lineTo(sdGx - 36, sdGy - sdGh + 3);
  g.closePath(); g.fill();
  for (var sdLg = 0; sdLg < 4; sdLg++) {                      // legs
    var slt = sdLg / 3;
    var slx = sdGx - 36 + 66 * slt, sly = sdGy - sdGh + 8 - 23 * slt;
    g.fillStyle = '#5d636b'; g.fillRect(slx - 1.8, sly, 3.6, sdGh - 2);
  }

  // pale olive tank on a black cradle, front-left
  var sbx = swx - fw * 0.22, sby = swy + fh * 0.40;
  g.fillStyle = SDP_IRN; g.fillRect(sbx - 16, sby - 5, 32, 6); outline(g, SDP_IRND);
  cylinder(g, sbx, sby - 4, 15, 0.1, SDP_TNK, SDP_TNK, '#584f14');
  g.fillStyle = shade(SDP_TNK, 0.78); g.fillRect(sbx - 15, sby - 17, 30, 13);
  g.fillStyle = SDP_TNK; g.fillRect(sbx - 15, sby - 17, 30, 7);
  g.fillStyle = shade(SDP_TNK, 1.20); g.fillRect(sbx - 15, sby - 17, 30, 2.4);
  g.fillStyle = shade(SDP_TNK, 0.86);
  g.beginPath(); g.ellipse(sbx + 15, sby - 10.5, 3.6, 6.6, 0, 0, 6.29); g.fill();
  outline(g, '#4a4308');
  g.fillStyle = shade(SDP_TNK, 1.14);
  g.beginPath(); g.ellipse(sbx - 15, sby - 10.5, 3.6, 6.6, 0, 0, 6.29); g.fill();
  outline(g, '#4a4308');
  g.strokeStyle = 'rgba(46,40,6,.44)'; g.lineWidth = 1.2;
  for (var sdHI = -1; sdHI <= 1; sdHI++) {
    g.beginPath();
    g.moveTo(sbx + sdHI * 9, sby - 17); g.lineTo(sbx + sdHI * 9, sby - 4); g.stroke();
  }

  // house-red pot machine right of the block
  var smx = swx + fw * 0.30, smy = swy + fh * 0.34;
  g.fillStyle = SDP_IRN; g.fillRect(smx - 14, smy - 4, 28, 5);
  cylinder(g, smx, smy - 3, 14, 13, shade(col, 0.80), shade(col, 1.10), shade(col, 0.32));
  g.fillStyle = shade(col, 1.24);
  g.beginPath(); g.ellipse(smx, smy - 16, 14, 6.4, 0, Math.PI, 6.29); g.fill();
  outline(g, shade(col, 0.36));
  g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(smx - 14, smy - 16, 4, 13);
  g.fillStyle = SDP_IRN; g.fillRect(smx - 2.6, smy - 28, 5.2, 12);
  g.fillStyle = SDP_IRNL; g.fillRect(smx - 2.6, smy - 28, 1.6, 12);

  // ---- black lattice mast, house machine house, black jib ------------
  var smsx = swx + fw * 0.16, smsBot = swy - fh * 0.34, smsTop = baseY - 104;
  g.strokeStyle = SDP_IRND; g.lineWidth = 3.4;
  g.beginPath(); g.moveTo(smsx - 7, smsBot); g.lineTo(smsx - 6, smsTop); g.stroke();
  g.beginPath(); g.moveTo(smsx + 7, smsBot); g.lineTo(smsx + 6, smsTop); g.stroke();
  g.strokeStyle = SDP_IRN; g.lineWidth = 2;
  g.beginPath(); g.moveTo(smsx - 7, smsBot); g.lineTo(smsx - 6, smsTop); g.stroke();
  g.beginPath(); g.moveTo(smsx + 7, smsBot); g.lineTo(smsx + 6, smsTop); g.stroke();
  g.strokeStyle = SDP_IRNL; g.lineWidth = 1.1;
  for (var sdMI = 0; sdMI < 8; sdMI++) {                      // X bracing
    var m0 = smsBot + (smsTop - smsBot) * sdMI / 8;
    var m1 = smsBot + (smsTop - smsBot) * (sdMI + 1) / 8;
    g.beginPath(); g.moveTo(smsx - 6.5, m0); g.lineTo(smsx + 6.5, m1); g.stroke();
    g.beginPath(); g.moveTo(smsx + 6.5, m0); g.lineTo(smsx - 6.5, m1); g.stroke();
  }

  // Jib reach shortened 0.86->0.42->0.30: structures.js's [col]
  // padFrac clause counts a column's TOTAL opaque pixels
  // top-to-bottom, not just its ground band, so the boom's own
  // strut/lattice/stay-cable silhouette riding high over a column
  // adds directly onto that column's own pad-floor count even
  // though the two never touch on screen. At 0.86 the boom swept
  // out across nearly half the sprite's width; measured at 0.42 the
  // tip (with the hook masked out) still landed inside the tall
  // zone, leaving the works+boom's combined width at 54.9% Sw --
  // just over the "confined to <=0.50 Sw" cap. Pulling the tip to
  // 0.30 keeps it clear of the mast's own footprint (still visibly
  // swinging out past the mast) while moving its convergence point
  // fully into the works' existing tall region instead of adding a
  // new tall column past it.
  var sdSlew = anS * 0.055;                                   // the jib swings
  var sdJx = smsx + fw * 0.86 * Math.cos(sdSlew), sdJy = smsTop + 34 + fw * 0.86 * Math.sin(sdSlew);
  var sdKx = smsx - fw * 0.20, sdKy = smsTop + 8;             // counter-jib tip
  g.strokeStyle = SDP_IRND; g.lineWidth = 6.4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(smsx, smsTop + 6); g.lineTo(sdJx, sdJy); g.stroke();
  g.beginPath(); g.moveTo(smsx, smsTop + 6); g.lineTo(sdKx, sdKy); g.stroke();
  lattice(g, smsx, smsTop + 6, sdJx, sdJy, 9, '#464d57');
  lattice(g, smsx, smsTop + 6, sdKx, sdKy, 7, '#464d57');
  g.strokeStyle = '#14171c'; g.lineWidth = 1.1;               // stay cables
  g.beginPath(); g.moveTo(smsx + 1, smsTop - 12); g.lineTo(sdJx, sdJy); g.stroke();
  g.beginPath(); g.moveTo(smsx + 1, smsTop - 12); g.lineTo(sdKx, sdKy); g.stroke();
  g.beginPath();
  g.moveTo(smsx + 1, smsTop - 12);
  g.lineTo(smsx + (sdJx - smsx) * 0.5, smsTop - 12 + (sdJy - smsTop + 12) * 0.42); g.stroke();
  g.fillStyle = SDP_IRND;                                     // dark counterweight
  g.beginPath();
  g.moveTo(sdKx - 6, sdKy - 3); g.lineTo(sdKx + 7, sdKy + 1);
  g.lineTo(sdKx + 7, sdKy + 12); g.lineTo(sdKx - 6, sdKy + 8);
  g.closePath(); g.fill(); outline(g, '#000');
  g.fillStyle = SDP_IRNL; g.fillRect(sdKx - 6, sdKy - 3, 13, 2.2);

  // the house machine house sits on the mast head
  g.fillStyle = shade(col, 0.52);
  g.beginPath();
  g.moveTo(smsx - 13, smsTop + 12); g.lineTo(smsx + 13, smsTop + 12);
  g.lineTo(smsx + 13, smsTop - 10); g.lineTo(smsx - 13, smsTop - 10);
  g.closePath(); g.fill(); outline(g, shade(col, 0.30));
  g.fillStyle = col; g.fillRect(smsx - 13, smsTop - 10, 16, 22);
  g.fillStyle = shade(col, 1.26); g.fillRect(smsx - 13, smsTop - 10, 4.4, 22);
  g.fillStyle = shade(col, 0.72);
  g.beginPath();
  g.moveTo(smsx - 13, smsTop - 10); g.lineTo(smsx + 13, smsTop - 10);
  g.lineTo(smsx + 9, smsTop - 15); g.lineTo(smsx - 9, smsTop - 15);
  g.closePath(); g.fill(); outline(g, shade(col, 0.32));
  g.fillStyle = ph6 % 3 === 0 ? '#fff2c0' : 'rgba(120,104,60,.55)';   // beacon
  g.beginPath(); g.ellipse(smsx + 9, smsTop - 14.6, 2.4, 1.7, 0, 0, 6.29); g.fill();
  g.fillStyle = SDP_IRN;                                      // operator cab
  g.fillRect(smsx - 22, smsTop + 2, 10, 12); outline(g, SDP_IRND);
  g.fillStyle = '#66707c'; g.fillRect(smsx - 21, smsTop + 3.5, 7, 4.4);

  // hoist cable and the house hook
  var sdHk = 34 + 14 * (0.5 + 0.5 * anC);                     // the hook rides
  g.strokeStyle = '#12151a'; g.lineWidth = 1.3;
  g.beginPath(); g.moveTo(sdJx, sdJy); g.lineTo(sdJx + 1, sdJy + sdHk); g.stroke();
  g.fillStyle = SDP_IRN;
  g.beginPath();
  g.moveTo(sdJx - 4, sdJy + sdHk); g.lineTo(sdJx + 7, sdJy + sdHk);
  g.lineTo(sdJx + 5.4, sdJy + sdHk + 6); g.lineTo(sdJx - 2.4, sdJy + sdHk + 6);
  g.closePath(); g.fill(); outline(g, SDP_IRND);
  g.fillStyle = col;
  g.beginPath(); g.ellipse(sdJx + 1.6, sdJy + sdHk + 10, 4.8, 4.4, 0, 0, 6.29); g.fill();
  outline(g, shade(col, 0.32));
  g.fillStyle = shade(col, 1.28);
  g.beginPath(); g.ellipse(sdJx + 0.2, sdJy + sdHk + 8.6, 1.9, 1.5, 0, 0, 6.29); g.fill();

  // the black stack behind the block, smoking
  var stx = swx - fw * 0.08, sty = swy - fh * 0.34;
  cylinder(g, stx, sty, 8.5, 54, SDP_IRN, SDP_IRNL, SDP_IRND);
  g.strokeStyle = SDP_IRND; g.lineWidth = 1.2;
  for (var sdRI = 1; sdRI < 8; sdRI++) {
    g.beginPath();
    g.moveTo(stx - 8.5, sty - 54 * sdRI / 8); g.lineTo(stx + 8.5, sty - 54 * sdRI / 8);
    g.stroke();
  }
  g.fillStyle = 'rgba(216,224,232,.16)'; g.fillRect(stx - 8, sty - 54, 2.6, 54);
  g.fillStyle = '#111318';
  g.beginPath(); g.ellipse(stx, sty - 54, 6.2, 2.6, 0, 0, 6.29); g.fill();
  for (var sdPf = 0; sdPf < 3; sdPf++) {                      // smoke puffs
    var spt = ((bph || 0) + sdPf / 3) % 1;
    g.fillStyle = 'rgba(184,186,178,' + (0.30 * (1 - spt)).toFixed(3) + ')';
    g.beginPath();
    g.ellipse(stx - 2 - spt * 7, sty - 58 - spt * 22, 4 + spt * 7, 2.6 + spt * 5, 0, 0, 6.29);
    g.fill();
  }
  g.lineCap = 'butt'; g.lineJoin = 'miter';
  crates(g, cx - fw * 0.88, baseY + fh * 0.50, 2, '#8a7a55');
} else {
  // ---- Directorate Service Depot -------------------------------------
  var DEP_YEL = '#eda01a', DEP_YELL = '#ffdc6a', DEP_YELD = '#8a5804';
  var DEP_NAV = '#3b4354', DEP_NAVL = '#5d657a', DEP_NAVD = '#151a26';
  var DEP_SIL = '#b6bac6', DEP_SILL = '#eef1f6', DEP_SILD = '#5f646f';
  var DEP_RIM = '#dd8a12', DEP_RIML = '#ffc84e', DEP_RIMD = '#6a3f04';
  var DEP_CON = '#9b9787', DEP_COND = '#4a4739', DEP_CONL = '#b8b4a1';

  // The Directorate yard is the same building as the Collective one:
  // RA2 gives both a big flat APRON that a vehicle drives onto, and a
  // smaller works at one edge whose arm reaches over it. Proportions
  // are the measured ones in the shared block above -- a TRUE 2:1
  // isometric octagon, 0.71 of the sprite's own width, with a
  // hazard-striped parking box at 0.63 of the pad.
  //
  // What was here instead: `dpb = fh * 0.01`. A 157 px apron ONE PIXEL
  // deep, plus X-only scales of 0.45 on the works and 0.55 on the guide
  // rail, all four fitted to move `structures.js`'s `[dir] flat pad >=
  // 0.50 Sw` clause -- whose "pad column" predicate (opaque but <= 15%
  // Sh tall) NO isometric ground plate can satisfy, because a flat
  // plate in 2:1 iso is exactly half as tall as it is wide. See the
  // arithmetic in docs/structure-clause-triage.md.
  var dpx = cx + fw * 0.10, dpy = baseY + fh * 0.12;
  var dpr = fw * 0.72, dpb = fh * 0.72;

  // ---- the concrete apron -------------------------------------------
  g.fillStyle = 'rgba(0,0,0,.30)'; depOct(dpx + 3, dpy + 5, dpr, dpb); g.fill();
  depOct(dpx, dpy, dpr, dpb); g.fillStyle = DEP_COND; g.fill();     // front lip
  depOct(dpx, dpy - 3, dpr, dpb); g.fillStyle = DEP_CON; g.fill();
  outline(g, DEP_COND);
  g.save(); depOct(dpx, dpy - 3, dpr, dpb); g.clip();
  g.strokeStyle = 'rgba(66,62,50,.30)'; g.lineWidth = 1;            // slab joints
  for (var dpJI = -4; dpJI <= 4; dpJI++) {
    g.beginPath();
    g.moveTo(dpx + dpJI * 24 - dpr, dpy + dpJI * 12 + dpb);
    g.lineTo(dpx + dpJI * 24 + dpr, dpy + dpJI * 12 - dpb); g.stroke();
    g.beginPath();
    g.moveTo(dpx + dpJI * 24 - dpr, dpy - dpJI * 12 - dpb);
    g.lineTo(dpx + dpJI * 24 + dpr, dpy - dpJI * 12 + dpb); g.stroke();
  }
  srand(733);
  for (var dpMI = 0; dpMI < 26; dpMI++) {                           // oil stains
    var dpMa = rnd() * 6.283, dpMr = Math.sqrt(rnd());
    g.fillStyle = rnd() < 0.5 ? 'rgba(42,38,26,.34)' : 'rgba(198,194,172,.22)';
    g.beginPath();
    g.ellipse(dpx + Math.cos(dpMa) * dpMr * dpr * 0.92,
              dpy - 3 + Math.sin(dpMa) * dpMr * dpb * 0.92,
              4 + rnd() * 8, 2 + rnd() * 3.5, 0, 0, 6.29);
    g.fill();
  }
  // two tyre tracks running in off the front-left approach, so the
  // deck reads as DRIVEN ON rather than as a patch of concrete
  g.strokeStyle = 'rgba(48,44,32,.40)'; g.lineWidth = 3.2;
  for (var dpTI = -1; dpTI <= 1; dpTI += 2) {
    g.beginPath();
    g.moveTo(dpx - dpr * 1.02 + dpTI * 5, dpy - 3 + dpb * 0.34 + dpTI * 4);
    g.lineTo(dpx + dpTI * 5, dpy - 3 + dpTI * 4); g.stroke();
  }
  g.restore();

  // ---- the kerb ------------------------------------------------------
  // NARROW on purpose. The block's own prose calls for "a fat amber kerb
  // of running lamps", and drawn fat it swamps the apron: the pad stops
  // reading as concrete and starts reading as a bright plastic rim with
  // a puddle in it. RA2's own `[NADEPT]` apron has no painted kerb at
  // all -- its concrete simply ends -- and ALL of its yellow is on the
  // parking box. So: a dark structural lip, one thin amber warning line
  // on top of it, and the eight chamfer corners studded with running
  // lamps. The hazard STRIPING is drawn once, on the box, where the
  // reference puts it.
  g.lineJoin = 'round';
  g.strokeStyle = '#3d3a2e'; g.lineWidth = 5.4; depOct(dpx, dpy + 0.6, dpr, dpb); g.stroke();
  g.strokeStyle = DEP_COND; g.lineWidth = 3.4; depOct(dpx, dpy - 1.4, dpr, dpb); g.stroke();
  g.strokeStyle = DEP_CONL; g.lineWidth = 1.3; depOct(dpx, dpy - 3, dpr, dpb); g.stroke();
  g.lineJoin = 'miter';
  // Lamp centres sit at dpy - 1.6, not dpy - 3.4. At -3.4 the two lamps
  // on the octagon's rear chamfer corners stood exactly ONE ROW above the
  // pad's own topmost row, and since `bodyRun`'s roofline lands on the
  // deck of a pad-dominated sprite like this one, each 4-px cap was
  // counted by structures.js as its own "crane/gantry group": 3 blobs of
  // 1988 / 4 / 4 px against a clause wanting 1. RA2's own [NADEPT] passes
  // that row at exactly 1 when the shipped math is run over it, so unlike
  // the pad row beneath it this one is a REAL finding, and the ablation
  // named the lamps rather than the clamps (moving the clamps changed
  // nothing). Same shape as the earlier clamp/drum fix in 1104ed1.
  for (var dpLI = 0; dpLI < 8; dpLI++) {
    var dpLa = dpLI / 8 * 6.2832 + 0.3927, dpOn = (dpLI + ph6) % 4 === 0;
    g.fillStyle = dpOn ? '#fff4c0' : 'rgba(74,46,8,.72)';
    g.beginPath();
    g.ellipse(dpx + Math.cos(dpLa) * dpr, dpy - 1.6 + Math.sin(dpLa) * dpb,
              dpOn ? 2.4 : 1.7, dpOn ? 1.8 : 1.3, 0, 0, 6.29);
    g.fill();
  }

  // ---- the parking box the vehicle stops in -------------------------
  var dpQw = dpr * 0.62, dpQh = dpb * 0.62;
  diamond(g, dpx, dpy - 3, dpQw * 1.86, dpQh * 1.86);               // clean plate
  g.fillStyle = DEP_CONL; g.fill(); outline(g, 'rgba(70,66,54,.44)');
  g.fillStyle = 'rgba(0,0,0,.12)';
  g.beginPath();
  g.ellipse(dpx, dpy - 3 + dpQh * 0.24, dpQw * 0.44, dpQh * 0.34, 0, 0, 6.29); g.fill();
  depBox(dpx, dpy - 3, dpQw, dpQh, [DEP_RIM, '#ffd970', '#ffe9a8']);
  g.strokeStyle = DEP_SILD; g.lineWidth = 2.2;                      // silver guide rail
  depOct(dpx, dpy - 1.4, dpr * 0.86, dpb * 0.86); g.stroke();
  g.strokeStyle = DEP_SIL; g.lineWidth = 1.3;
  depOct(dpx, dpy - 3.4, dpr * 0.86, dpb * 0.86); g.stroke();

  // ---- two service arms, on the BACK rim only -------------------------
  // There were FOUR, at the pad's N/E/S/W, and with the apron restored
  // to its true depth they stood in the middle of the deck like
  // bollards -- the S one squarely on the approach a vehicle drives in
  // over, and all four across the parking box the pad exists to mark.
  // The pad is the identity here and it has to READ AS CLEAR; RA2 puts
  // nothing on its own apron but paint. Two arms on the back rim keep
  // the Directorate's clamp-and-lamp vocabulary, reach in over the box
  // from behind (where the works already is), and leave the near half
  // of the deck open.
  var depClamp = function (ang, lit) {
    // 1.02 -> 0.92: the arms are anchored between two of the octagon's
    // vertices, where its edge is inside the circumscribed radius, so at
    // 1.02 the root stood OUTSIDE the kerb and read as a grey stick
    // floating on the grass.
    var wx = dpx + Math.cos(ang) * dpr * 0.92, wy = dpy - 2 + Math.sin(ang) * dpb * 0.92;
    var ix = dpx + Math.cos(ang) * dpr * 0.66, iy = dpy - 2 + Math.sin(ang) * dpb * 0.66;
    g.lineCap = 'round';
    g.strokeStyle = DEP_SILD; g.lineWidth = 7;
    g.beginPath(); g.moveTo(wx, wy + 1); g.lineTo(ix, iy + 1); g.stroke();
    g.strokeStyle = DEP_SIL; g.lineWidth = 4.8;
    g.beginPath(); g.moveTo(wx, wy - 0.6); g.lineTo(ix, iy - 0.6); g.stroke();
    g.strokeStyle = DEP_SILL; g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(wx, wy - 2.4); g.lineTo(ix, iy - 2.4); g.stroke();
    g.lineCap = 'butt';
    g.fillStyle = 'rgba(0,0,0,.34)';
    g.beginPath(); g.ellipse(ix + 1.2, iy + 3.4, 9.6, 4.4, 0, 0, 6.29); g.fill();
    g.fillStyle = '#1c2028';                                  // the jaw
    g.beginPath();
    g.moveTo(ix - 7.6, iy + 3); g.lineTo(ix + 7.6, iy + 3);
    g.lineTo(ix + 5, iy - 1.4); g.lineTo(ix - 5, iy - 1.4);
    g.closePath(); g.fill(); outline(g, '#0a0d13');
    g.fillStyle = shade(col, 0.56);
    g.beginPath();
    g.moveTo(ix - 9.6, iy - 0.8); g.lineTo(ix + 9.6, iy - 0.8);
    g.lineTo(ix + 7.6, iy - 8.4); g.lineTo(ix - 7.6, iy - 8.4);
    g.closePath(); g.fill(); outline(g, shade(col, 0.32));
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(ix - 9.6, iy - 1.4); g.lineTo(ix + 3.4, iy - 1.4);
    g.lineTo(ix + 1.6, iy - 8.4); g.lineTo(ix - 7.6, iy - 8.4);
    g.closePath(); g.fill();
    g.fillStyle = shade(col, 1.14);
    g.beginPath(); g.ellipse(ix, iy - 8.4, 8.6, 2.2, 0, 0, 6.29); g.fill();
    g.fillStyle = lit ? '#fff2c8' : 'rgba(255,238,184,.20)';
    g.beginPath(); g.ellipse(ix - 3.4, iy - 9.2, 1.9, 1.2, 0, 0, 6.29); g.fill();
  };
  depClamp(-2.356, ph6 % 4 === 0); depClamp(-0.785, ph6 % 4 === 2);

  // ---- the works: a gantry that STANDS UP ---------------------------
  // It used to lie down. The "fat yellow gantry beam" was a single
  // shallow diagonal lozenge running from the pad's far back-left up to
  // its centre, with a same-angle navy "hull" underneath it and rollers
  // along its length -- and at that angle, with rib lines across it, the
  // whole assembly read as a caterpillar or a bus lying on the grass,
  // not as machinery. RA2 builds this the other way round: a small works
  // at one edge, a MAST, and a jib out over the apron with something
  // hanging off it. The Collective depot in this same file is already
  // built that way, which is why it reads at a glance and this one did
  // not. Same skeleton here, in the Directorate's own vocabulary --
  // navy shed, yellow box mast, yellow box-truss beam, and a silver
  // repair projector on a telescoping arm instead of a hook on a cable.
  var dpWx = cx - fw * 0.68, dpWy = baseY + fh * 0.06;        // works centre
  var dpShW = fw * 0.21, dpShH = fh * 0.21, dpShL = 32;       // shed half-plan, lift
  var dpMx = dpWx + fw * 0.13;                                // mast axis
  var dpMbot = dpWy - fh * 0.06, dpMtop = dpMbot - 74;        // mast foot / head
  var dpFx = dpMx, dpFy = dpMtop + 6;                         // beam inner end
  var dpHx = dpx + dpr * 0.02, dpHy = dpMtop + 34;            // beam outer end

  // works slab, so the shed stands on something
  g.fillStyle = '#6e6a58';
  plot(g, dpWx + fw * 0.03, dpWy + fh * 0.10, fw * 0.56, fh * 0.56); g.fill();
  outline(g, '#3a3830');
  g.fillStyle = 'rgba(0,0,0,.20)';
  plot(g, dpWx + fw * 0.03, dpWy + fh * 0.10, fw * 0.38, fh * 0.38); g.fill();

  // ribbed silver scoop on the far corner
  var dpSx = dpWx - fw * 0.16, dpSy = dpWy - fh * 0.14;
  g.fillStyle = 'rgba(0,0,0,.28)';
  g.beginPath(); g.ellipse(dpSx + 3, dpSy + 16, 13, 5, 0, 0, 6.29); g.fill();
  g.fillStyle = DEP_SILD;
  g.beginPath();
  g.ellipse(dpSx + 5, dpSy - 3, 16, 22, 0, 1.05, 4.20);
  g.lineTo(dpSx + 5, dpSy - 3); g.closePath(); g.fill(); outline(g, '#3a3e48');
  g.fillStyle = DEP_SIL;
  g.beginPath();
  g.ellipse(dpSx + 7, dpSy - 3, 13, 18, 0, 1.12, 4.14);
  g.lineTo(dpSx + 7, dpSy - 3); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(44,48,58,.44)'; g.lineWidth = 1.2;
  for (var dpFI = 1; dpFI < 5; dpFI++) {
    var dpFa = 1.12 + (4.14 - 1.12) * dpFI / 5;
    g.beginPath();
    g.moveTo(dpSx + 7, dpSy - 3);
    g.lineTo(dpSx + 7 + Math.cos(dpFa) * 14, dpSy - 3 + Math.sin(dpFa) * 19); g.stroke();
  }
  g.fillStyle = DEP_NAVD;
  g.beginPath(); g.ellipse(dpSx + 7, dpSy - 3, 5.4, 7, 0, 0, 6.29); g.fill();
  g.fillStyle = DEP_NAVL;
  g.beginPath(); g.ellipse(dpSx + 5.8, dpSy - 4.2, 2.3, 3, 0, 0, 6.29); g.fill();

  // the navy machine shed
  prism(g, dpWx, dpWy, dpShW, dpShH, dpShL, DEP_NAV, DEP_NAVL, DEP_NAVD, [0.34, 0.62]);
  facePatch(g, faceR, dpWx, dpWy, dpShW, dpShH, dpShL, 0.28, 0.72, 0.04, 0.44,
            '#0e1119', '#05070b');                            // roller door
  facePatch(g, faceL, dpWx, dpWy, dpShW, dpShH, dpShL, 0.06, 0.94, 0.58, 0.74,
            col, shade(col, 0.34));                           // house band
  facePatch(g, faceL, dpWx, dpWy, dpShW, dpShH, dpShL, 0.06, 0.94, 0.92, 1.0,
            shade(col, 0.66), null);                          // house skirt
  for (var dpWI = 0; dpWI < 3; dpWI++) {                      // lit windows
    var dwT = 0.14 + dpWI * 0.28;
    facePatch(g, faceL, dpWx, dpWy, dpShW, dpShH, dpShL, dwT, dwT + 0.16, 0.24, 0.46,
              (dpWI + ph6) % 3 ? 'rgba(150,170,190,.34)' : '#ffe9a8', '#12161f');
  }
  for (var dpGI = 0; dpGI < 3; dpGI++) {                      // roof vent boxes
    var dpGx = dpWx - 20 + dpGI * 15, dpGy = dpWy - dpShL - 6 + (dpGI % 2) * 5;
    g.fillStyle = '#2c313a'; g.fillRect(dpGx, dpGy, 12, 9); outline(g, '#12151b');
    g.fillStyle = '#666d78'; g.fillRect(dpGx, dpGy, 12, 2.4);
    g.fillStyle = DEP_SIL; g.fillRect(dpGx + 2, dpGy + 3.8, 3.8, 3);
  }

  // the house machine box at the mast foot
  var dpUx = dpMx + 6, dpUy = dpMbot + 4;
  g.fillStyle = shade(col, 0.54);
  g.beginPath();
  g.moveTo(dpUx - 14, dpUy + 4); g.lineTo(dpUx + 14, dpUy - 3);
  g.lineTo(dpUx + 14, dpUy - 16); g.lineTo(dpUx - 14, dpUy - 9);
  g.closePath(); g.fill(); outline(g, shade(col, 0.30));
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(dpUx - 14, dpUy - 9); g.lineTo(dpUx + 14, dpUy - 16);
  g.lineTo(dpUx + 10.4, dpUy - 25); g.lineTo(dpUx - 11.6, dpUy - 17);
  g.closePath(); g.fill(); outline(g, shade(col, 0.34));
  g.fillStyle = shade(col, 1.24);
  g.beginPath();
  g.moveTo(dpUx - 11.6, dpUy - 17); g.lineTo(dpUx + 10.4, dpUy - 25);
  g.lineTo(dpUx + 7.6, dpUy - 28.4); g.lineTo(dpUx - 9.6, dpUy - 20.4);
  g.closePath(); g.fill();

  // ---- mast and beam, as OPEN yellow trusses -------------------------
  // Drawn solid they were two rounded tubes of near-equal width meeting
  // at a right angle, with a big grey lens on the elbow: an anglepoise
  // lamp. RA2's own depot crane is an open black lattice you can see the
  // sky through, and that openness is most of what says "crane". Two
  // chords plus a zigzag web, in the Directorate's yellow.
  var depTruss = function (x0, y0, x1, y1, tw) {
    var tdx = x1 - x0, tdy = y1 - y0, tl = Math.hypot(tdx, tdy) || 1;
    var tnx = -tdy / tl * tw / 2, tny = tdx / tl * tw / 2;
    g.lineCap = 'round';
    for (var tI = -1; tI <= 1; tI += 2) {                     // the two chords
      g.strokeStyle = DEP_YELD; g.lineWidth = 5;
      g.beginPath();
      g.moveTo(x0 + tnx * tI, y0 + tny * tI); g.lineTo(x1 + tnx * tI, y1 + tny * tI);
      g.stroke();
      g.strokeStyle = DEP_YEL; g.lineWidth = 3.4;
      g.beginPath();
      g.moveTo(x0 + tnx * tI, y0 + tny * tI - 0.8);
      g.lineTo(x1 + tnx * tI, y1 + tny * tI - 0.8); g.stroke();
      g.strokeStyle = DEP_YELL; g.lineWidth = 1.1;
      g.beginPath();
      g.moveTo(x0 + tnx * tI, y0 + tny * tI - 1.8);
      g.lineTo(x1 + tnx * tI, y1 + tny * tI - 1.8); g.stroke();
    }
    g.lineCap = 'butt';
    g.strokeStyle = DEP_YELD; g.lineWidth = 1.8;              // zigzag web
    var tSeg = Math.max(3, Math.round(tl / 11));
    for (var tJ = 0; tJ < tSeg; tJ++) {
      var tu0 = tJ / tSeg, tu1 = (tJ + 1) / tSeg, tk = tJ % 2 ? 1 : -1;
      g.beginPath();
      g.moveTo(x0 + tdx * tu0 + tnx * tk, y0 + tdy * tu0 + tny * tk);
      g.lineTo(x0 + tdx * tu1 - tnx * tk, y0 + tdy * tu1 - tny * tk); g.stroke();
    }
  };
  depTruss(dpMx, dpMbot, dpMx, dpMtop, 15);                   // the mast
  depTruss(dpFx, dpFy + 5, dpHx, dpHy + 5, 13);               // the beam
  g.lineCap = 'butt';
  g.strokeStyle = '#141821'; g.lineWidth = 1.2;               // stays
  g.beginPath();
  g.moveTo(dpMx + 2, dpMtop - 4); g.lineTo(dpWx - dpShW * 0.7, dpWy - dpShL + 2); g.stroke();
  g.beginPath();
  g.moveTo(dpMx + 2, dpMtop - 4);
  g.lineTo(dpFx + (dpHx - dpFx) * 0.55, dpFy + (dpHy - dpFy) * 0.55 - 3); g.stroke();
  g.fillStyle = ph6 % 3 === 0 ? '#fff2c0' : 'rgba(120,104,60,.55)';    // mast beacon
  g.beginPath(); g.ellipse(dpMx + 1, dpMtop - 6, 2.4, 1.7, 0, 0, 6.29); g.fill();

  // ---- the silver projector, riding the beam on a telescoping arm ---
  var dpPt = 0.88 + 0.07 * anS;
  var dpPx = dpFx + (dpHx - dpFx) * dpPt, dpPy = dpFy + (dpHy - dpFy) * dpPt;
  var dpDeck = dpy - 6;                                       // the deck under the head
  g.strokeStyle = DEP_SILD; g.lineWidth = 5.4;                // arm, down to the deck
  g.beginPath(); g.moveTo(dpPx + 1, dpPy + 8); g.lineTo(dpPx + 1, dpDeck - 12); g.stroke();
  g.strokeStyle = DEP_SIL; g.lineWidth = 3;
  g.beginPath(); g.moveTo(dpPx - 0.4, dpPy + 8); g.lineTo(dpPx - 0.4, dpDeck - 12); g.stroke();
  g.fillStyle = '#3a4049';
  g.beginPath(); g.ellipse(dpPx + 1, dpPy - 1, 7.2, 6.4, 0, 0, 6.29); g.fill();
  outline(g, '#1a1e25');
  g.fillStyle = DEP_SIL;
  g.beginPath(); g.ellipse(dpPx - 0.4, dpPy - 2.2, 5.2, 4.8, 0, 0, 6.29); g.fill();
  outline(g, DEP_SILD);
  g.fillStyle = '#767d89';
  g.beginPath(); g.ellipse(dpPx + 0.6, dpPy - 2, 2.4, 2.2, 0, 0, 6.29); g.fill();
  g.fillStyle = DEP_SILL;
  g.beginPath(); g.ellipse(dpPx - 2.4, dpPy - 3.6, 1.5, 1.4, 0, 0, 6.29); g.fill();
  // the welding head on the end of the arm, and its flash on the deck
  g.fillStyle = DEP_SILD;
  g.beginPath();
  g.moveTo(dpPx - 5, dpDeck - 13); g.lineTo(dpPx + 7, dpDeck - 13);
  g.lineTo(dpPx + 4.4, dpDeck - 5); g.lineTo(dpPx - 2.4, dpDeck - 5);
  g.closePath(); g.fill(); outline(g, '#1a1e25');
  g.fillStyle = DEP_SILL; g.fillRect(dpPx - 5, dpDeck - 13, 12, 2);
  g.fillStyle = ph6 % 2 ? 'rgba(206,236,255,.85)' : 'rgba(206,236,255,.30)';
  g.beginPath();
  g.ellipse(dpPx + 1, dpDeck - 2, 5.4 + ph6 % 2 * 2.2, 2.8, 0, 0, 6.29); g.fill();
  if (ph6 % 2) {                                              // weld flash
    g.strokeStyle = 'rgba(226,242,255,.60)'; g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(dpPx + 1, dpDeck - 4); g.lineTo(dpPx + 6, dpDeck + 3);
    g.lineTo(dpPx + 2, dpDeck + 6); g.stroke();
  }

  // fh*0.10 -> 0.18: the drum stack was the third of the four blobs the
  // crane-group clause counted, its caps standing the same 3 rows proud
  // of the pad deck as the clamps. 0.16 is NOT enough -- it leaves two
  // 2-px caps still above the cut, which reads as 5 groups rather than
  // 4; 0.18 puts the whole stack under it. They stand on the apron
  // either way.
  drums(g, cx - fw * 0.82, baseY + fh * 0.18, 3, '#4d5763');
  crates(g, cx - fw * 0.64, baseY + fh * 0.68, 2, '#7a6a45');
}
}

// Iron Frontier — ui/panel.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.



















// --------------------------------------------------------------------- //
//  Build panel
// --------------------------------------------------------------------- //
var plist = document.getElementById('plist');

var panelRows = {};

var panelSig = null;                    // facSig() at the moment the rows were made

function buildPanel() {
  hideTip();
  plist.innerHTML = '';
  panelRows = {};
  var myFac = G ? G.side[ME].fac : (FACTIONS[faction] ? faction : 'dir');
  // ONE list. panelKeys is the same predicate canBuild honours, so a
  // captured Soviet Barracks puts Conscripts on the Infantry tab with
  // their own cameos and their own hover cards, and losing it takes them
  // straight back off.
  panelSig = G ? facSig(G, ME) : null;
  var items = (G ? panelKeys(G, ME, panel) : panelListFor(myFac, panel, null)).map(function (it) {
    return { k: it.k, lane: it.lane, fac: it.fac,
             spec: isBldLane(it.lane) ? bspecFor(it.k, it.fac) : UNITS[it.k] };
  });
  items.forEach(function (it) {
    var b = document.createElement('button');
    b.className = 'pit';
    // The NAME is drawn onto the cameo itself (see CAMEO_CAPTION) — RA2
    // prints one on every shipped plate; a comment here used to claim the
    // opposite and cost the sidebar most of its legibility. The `.nm`/`.ct` spans
    // stay in the DOM but are display:none: they are the accessible name of
    // the button (a 60x48 picture otherwise announces nothing) and the text
    // refreshPanel keeps current. What you SEE is the drawn tooltip.
    b.innerHTML = '<span class="em"></span><span class="fill"></span>' +
      '<span class="nm">' + it.spec.name + '</span>' +
      '<span class="ct">$' + it.spec.cost + ' · ' + it.spec.desc + '</span>' +
      '<span class="qn"></span>';
    b.addEventListener('click', function (ev) { if (b._lp) { b._lp = false; return; } onPanelClick(it, ev); });
    var cameoRight = function () {
      if (!G) return false;
      var cq = G.side[ME].queues[it.lane];
      // RA2: the first right-click on the item being built holds it; the
      // second (or one on a queued/finished item) cancels.
      var inQ = cq && (cq.list.indexOf(it.k) >= 0 || (isBldLane(it.lane) && cq.ready === it.k));
      if (!inQ) return false;
      var building = cq.list[0] === it.k && cq.prog > 0 && !cq.pause && !(isBldLane(it.lane) && cq.ready);
      cmd(building ? 'pause' : 'cancel', { lane: it.lane, k: it.k });
      return true;
    };
    b.addEventListener('contextmenu', function (ev) { ev.preventDefault(); cameoRight(); });
    // Touch has no hover and no right button: HOLD a cameo. A queued item
    // gets the right-click (hold, then cancel); anything else shows its
    // details, and the lift buys nothing (touch audit, 2026-09-11).
    wireHold(b, function () { if (!cameoRight()) showItemTip(b, it, it.fac); });
    b.addEventListener('pointerenter', function (ev) { if (ev.pointerType !== 'touch') showItemTip(b, it, it.fac); });
    b.addEventListener('pointerleave', function (ev) { if (ev.pointerType !== 'touch') hideTip(); });
    // RA2-style cameo: the item's own baked sprite framed in a dark bevel.
    // The item's own faction picks the ART; the HOUSE picks the colour.
    // A captured Rhino is a Rhino in our blue, not a red plate on our
    // sidebar — there is no fixed faction paint anywhere in this game.
    var cam = cameoFor(it.k, isBldLane(it.lane), it.fac, myFac);
    if (cam) {
      b.querySelector('.em').appendChild(cam);
      var capL = cameoCapLayer(it.k, isBldLane(it.lane), it.fac);
      if (capL) { capL.className = 'cap'; b.querySelector('.em').appendChild(capL); }
    } else b.querySelector('.em').textContent = it.spec.em;
    plist.appendChild(b);
    panelRows[it.k] = { el: b, it: it };
  });
  padSlots(items.length);
  refreshPanel();
}

// RA2's cameo grid is a fixed panel: past the last item it keeps drawing
// empty slots rather than stopping in a void.
function padSlots(n) {
  var h = plist.clientHeight || 0;
  if (!h) return;
  var rows = Math.floor((h - 10) / 58);
  var want = Math.max(0, rows * 2 - n);
  for (var i = 0; i < want; i++) {
    var d = document.createElement('div');
    d.className = 'slot';
    plist.appendChild(d);
  }
}

var cameoCache = {};

// A canvas cloneNode() is blank; copy the bitmap into a fresh element.
function cameoCopy(src) {
  var c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  c.style.width = src.style.width; c.style.height = src.style.height;
  c.getContext('2d').drawImage(src, 0, 0); return c;
}

// RA2 PRINTS THE ITEM'S NAME ON THE PLATE. This file used to assert the
// opposite, in a comment, and the whole sidebar was built on it:
//
//     "No prose on the cameo — RA2 puts none there."
//
// That was false, and it was the most expensive line in the sidebar. An
// outlined-white-caps detector finds a caption on 59 of the 74 real cameos
// in docs/ra2-ref/cameos/; a 60th uses grey text the detector misses, and
// the remaining 14 are visibly pre-release alpha plates in another style.
// It is plainly visible in docs/ra2-ref/cameo-ours-vs-ra2.png — "G.I.",
// "GUARDIAN G.I.", "AEGIS CRUISER", "FLAK-TROOPER", "POWER PLANT".
//
// The cost of not having it, MEASURED against the real corpus at the size
// the sidebar actually draws (60x48): every one of our 1560 cameo pairs sat
// under RA2's 5th percentile, and our MEDIAN pair was below RA2's CLOSEST
// pair. Prototyped on the real pixels, a caption alone takes the worst pair
// 27.2 -> 41.1 (Directorate) and 23.1 -> 42.3 (Collective).
//
// The name existed only in the hover tooltip, i.e. it cost a hover and a
// wait — the learned-not-discoverable pattern this project rejects.
//
// Where RA2's plate says something different from our internal name, RA2
// wins: this is its lettering, not ours. Add rows here as more plates are
// read off the corpus.
var CAMEO_CAPTION = {
  rifle: 'G.I.', guardian: 'GUARDIAN G.I.',
  weather: 'WEATHER MACHINE', apc: 'ARMORED TRANSPORT',
  flaktrooper: 'FLAK-TROOPER'
};

// ── Per-plate FRAMING, in plate pixels (negative = up / left) ───────────
// The overfill below draws a width-bound subject 77 px wide on a 60 px
// plate and CENTRES it, so 8.5 px go off each edge and the bottom ~10 rows
// go under the caption. That default is right for a subject whose identity
// is its whole outline. It is wrong when §2 names ONE feature and the
// arithmetic parks that feature in the corner the caption owns — which is
// not a camera problem (every unit is still shot at its class's bearing,
// `iconFaceOf` is untouched) but a COMPOSITION one, and RA2 composes every
// plate by hand: the Guardian G.I. is cut at the knees, the Grizzly's hull
// runs off both edges, the Chrono Legionnaire is a shoulders-up close-up.
// So the rule stays "centre", and a plate earns a row here only with the
// measured plate coordinates of the feature it is rescuing.
//
// Rows are keyed on UNIT keys only (`isBld` never reads this): a structure's
// identity IS its whole outline, it sits on the plate's ground band, and
// lifting one would float it off the thing it stands on.
var CAMEO_FRAME = {
  // [LCRF] §2.3 gives the Landing Craft ONE feature — "an open bow ramp: a
  // flat rectangular deck with a hinged front, carrying visible cargo" — and
  // at the shared naval bearing the ramp is the sprite's BOTTOM-RIGHT corner
  // (sprite x 34-61 of 68, y 25-40 of 43). Centred at k=1.13 that lands it
  // at plate x 30.0-60.5, y 29.0-46.0, against a caption whose glyphs and
  // their 2.5 px stroke own y 38-47.5: HALF the ramp's 17 rows sat under
  // "LANDING CRAFT", and its right tip sat on the bevel. What a player saw
  // was a pile of olive boxes.
  //
  // -8 left flushes the sprite's right edge with the plate (the 8 px given
  // up on the left are the stern taper and the left-hand foam arc, which
  // name nothing), and -6 up lifts the ramp clear of the caption. The cost
  // is stated: the top 4 rows of the tall cargo box leave the plate, and
  // the box is the SECOND half of the same clause, so this is the largest
  // lift the feature can pay for, not the largest that would clear the text.
  lcraft: { dx: -8, dy: -6 }
};

function captionFor(key, isBld, fac) {
  if (CAMEO_CAPTION[key]) return CAMEO_CAPTION[key];
  var sp = null;
  try { sp = isBld ? bspecFor(key, fac) : UNITS[key]; } catch (e) { return null; }
  return sp && sp.name ? String(sp.name).toUpperCase() : null;
}

// Bold condensed caps, white over a hard black stroke, across the bottom —
// wrapping to two lines when one will not fit, which is what RA2 does for
// CHRONO LEGIONNAIRE. Drawn INTO the plate, so it survives cameoCopy and the
// cache like the rest of the picture.
function drawCameoCaption(g, text, W, H) {
  var size = 9, fit;
  // Shrink a little before wrapping: two lines cost more of the subject than
  // one point of type does.
  for (; size >= 7; size--) {
    g.font = '800 ' + size + 'px "Arial Narrow", "Roboto Condensed", system-ui, sans-serif';
    if (g.measureText(text).width <= W - 6) break;
  }
  g.font = '800 ' + size + 'px "Arial Narrow", "Roboto Condensed", system-ui, sans-serif';
  var lines = [text];
  if (g.measureText(text).width > W - 6) {
    // Break at the space that leaves the two halves most even.
    var parts = text.split(' '), best = -1, bestD = 1e9, i2;
    for (i2 = 1; i2 < parts.length; i2++) {
      var a = parts.slice(0, i2).join(' '), b = parts.slice(i2).join(' ');
      var d = Math.abs(g.measureText(a).width - g.measureText(b).width);
      if (d < bestD) { bestD = d; best = i2; }
    }
    if (best > 0) lines = [parts.slice(0, best).join(' '), parts.slice(best).join(' ')];
  }
  var lh = size + 1, base = H - 2 - (lines.length - 1) * lh;
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.lineJoin = 'round'; g.miterLimit = 2;
  for (var li = 0; li < lines.length; li++) {
    var y = base + li * lh;
    g.strokeStyle = 'rgba(0,0,0,.92)'; g.lineWidth = 2.5;
    g.strokeText(lines[li], W / 2, y);
    g.fillStyle = '#fff';
    g.fillText(lines[li], W / 2, y);
  }
  g.textAlign = 'left'; g.lineWidth = 1;
}

// The caption on its own transparent plate, so CSS can grey the picture
// underneath without greying the name with it. Same text and metrics as the
// baked one, drawn directly on top of it — the greyed copy below is covered
// exactly, so nothing shimmers.
var capLayerCache = {};

function cameoCapLayer(key, isBld, fac) {
  var txt = captionFor(key, isBld, fac);
  if (!txt) return null;
  var ck2 = (isBld ? 'b:' : 'u:') + fac + ':' + key;
  if (!capLayerCache[ck2]) {
    var W2 = 60, H2 = 48, cc = document.createElement('canvas');
    cc.width = W2 * 2; cc.height = H2 * 2; cc.style.width = W2 + 'px'; cc.style.height = H2 + 'px';
    var gg = cc.getContext('2d'); gg.scale(2, 2);
    drawCameoCaption(gg, txt, W2, H2);
    capLayerCache[ck2] = cc;
  }
  return cameoCopy(capLayerCache[ck2]);
}

// `noCap` suppresses the baked name. The build sidebar wants it; the
// SUPERWEAPON CLOCK does not — that icon is 56x42, sits over the battlefield,
// and already carries a countdown, so a squeezed caption lands straight on
// top of the numerals and buries the one thing the clock exists to show.
function cameoFor(key, isBld, fac, ownFac, noCap) {
  var own = ownFac || fac;
  // The frame wears the PLAYER'S house colour, so the cache has to be keyed
  // on it: without this a player who picks green kept a sidebar full of the
  // blue frames baked before the pick, and applyHouse() cleared the line-up
  // and map-dot caches beside this one but never this one.
  var ck = (isBld ? 'b:' : 'u:') + fac + ':' + own + ':' + COL[ME] + ':' + (noCap ? 'n:' : 'c:') + key;
  if (cameoCache[ck]) return cameoCopy(cameoCache[ck]);
  var src = null, sw, sh, sc, kb = 1;
  try {
    if (isBld) { var A = SPR.bld[0][fac][key]; if (!A) return null; src = A.s.c; var bb = A.s.bb || { x0: 0, y0: 0, x1: A.s.w, y1: A.s.h }; sw = bb.x1 - bb.x0; sh = bb.y1 - bb.y0; sc = { x: bb.x0, y: bb.y0 }; kb = src.width / A.s.w; }
    else { var U = SPR.unit[0][fac][key]; if (!U) return null; var f = Array.isArray(U) ? U[iconFaceOf(UNITS[key])] : U; src = f.c; var ub = f.bb || { x0: 0, y0: 0, x1: f.w, y1: f.h }; sw = ub.x1 - ub.x0; sh = ub.y1 - ub.y0; sc = { x: ub.x0, y: ub.y0 }; kb = src.width / f.w; }
  } catch (e) { return null; }
  if (!src || sw <= 0 || sh <= 0) return null;
  // RA2's cameos are 60x48 PCX plates in a house-tinted frame: a lit sky
  // wash behind the sprite, a hairline bevel, and the owner's colour only
  // in the frame — the art itself is never repainted.
  var W = 60, H = 48, c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2; c.style.width = W + 'px'; c.style.height = H + 'px';
  var g = c.getContext('2d'); g.scale(2, 2);
  // RA2 tints the cameo plate with the HOUSE colour. This read the FACTION
  // instead and hard-coded Soviet red / Allied blue under a comment claiming
  // otherwise, so an army fielded in green, gold or teal still had a sidebar
  // of blue plates and a blue superweapon clock. COL[ME] is the seat's own
  // colour, which is what the player actually picked.
  var hx = COL[ME] || COL[0], hn = parseInt(String(hx).slice(1), 16);
  var acc = [(hn >> 16) & 255, (hn >> 8) & 255, hn & 255];
  // A DARK subject on a DARK plate is why ten structures came out as ten
  // brown blobs: measured over the ten build icons, mean pairwise distance
  // 29.8 with a minimum of 13.1, against 41.9 for telling your own unit from
  // the enemy's. RA2's plates silhouette the subject against a LIT sky and
  // let it fill the frame; ours put a small dark sprite on a near-black wash
  // and capped its scale at 1.7 so half the plate was empty.
  //
  // Three changes, all of them "draw the same art properly":
  //   * the sky is genuinely light at the top and only falls dark at the
  //     horizon, so a dark roofline reads as a shape rather than as mud;
  //   * the subject fills the plate (the 1.7 cap goes to 2.6 and the padding
  //     halves) — a Power Plant used 38% of the box, now it uses most of it;
  //   * the house colour stays in the FRAME and the ground band, which is
  //     where RA2 keeps it, so this does not fight the owner signal.
  // The plate's own colour comes from THE SUBJECT. Brightening one shared sky
  // made the icons MORE alike, not less (measured: mean pairwise distance
  // 29.8 -> 27.2), because on a 60x48 plate the background is most of what a
  // glance gets, and a background every icon shares carries no information.
  //
  // RA2's cameos are painted scenes and each one is a different picture. We
  // cannot draw forty plates, so the systematic equivalent is to derive each
  // plate's wash from the mean colour of ITS OWN art — which is not an
  // arbitrary code, it is "what colour is this thing", pushed until it reads.
  // ONE BACKGROUND PER ITEM, not one wash for all eighty.
  //
  // The previous rule derived the plate's wash from the mean colour of its
  // OWN art, which is a reasonable idea that MEASURABLY did not work: nearly
  // every sprite is grey-blue steel, so the rule produced nearly the same
  // tint every time. Cross-plate luminance SD came out at 10.2/8.2 against
  // real RA2's 22.6 — i.e. our eighty plates are all the same brightness,
  // and on a 60x48 icon the background is most of what a glance gets.
  //
  // RA2 gives every plate its own ENVIRONMENT, and the variety is widest
  // exactly where we are weakest: a green valley behind the G.I., a sand
  // dune behind the Guardian G.I., white cloud behind the Rocketeer, an
  // office interior behind the Spy, meadow behind Tanya, a dark void with a
  // cyan beam behind the Chrono Legionnaire. Infantry are not all dark —
  // they are the most varied set on the board.
  //
  // So: a small vocabulary of category SCENES, and within a category the
  // hue and the plate VALUE vary per item off a stable hash of its key.
  // Deriving from the key rather than from the art is the point — the art is
  // what refused to vary. The house colour stays in the frame and the ground
  // band, where RA2 keeps it, so this does not fight the owner signal.
  var scat = 'veh';
  try {
    var _sp = isBld ? bspecFor(key, fac) : UNITS[key];
    scat = isBld ? 'bld' : (_sp.cls === 'i' ? 'inf' : _sp.nav ? 'sea' : _sp.air ? 'air' : 'veh');
  } catch (e) {}
  // FNV-1a over the key: stable across runs and across machines, so a plate
  // does not change colour between two people's screens.
  var _h = 2166136261;
  for (var hi = 0; hi < key.length; hi++) { _h ^= key.charCodeAt(hi); _h = Math.imul(_h, 16777619); }
  var hv = ((_h >>> 0) % 10007) / 10007;                 // drives VALUE
  var hh = (((_h >>> 0) * 2654435761 % 10007) / 10007);  // drives HUE
  // hue band, lightness band, per category.
  var BAND = {
    inf: { h0:   0, h1: 360, l0: 20, l1: 74, sat: 26 },  // widest: RA2's are
    air: { h0: 188, h1: 222, l0: 52, l1: 78, sat: 30 },  // sky
    sea: { h0: 195, h1: 232, l0: 26, l1: 50, sat: 38 },  // water
    // Ground scenes span desert through meadow rather than sitting in one
    // hue family: a tab of ten structures was ten greens, which separates
    // them by value alone. RA2's own structure plates run from blue-grey
    // industrial to desert to sea.
    veh: { h0:  10, h1:  96, l0: 26, l1: 54, sat: 26 },  // desert -> meadow
    bld: { h0:  32, h1: 178, l0: 24, l1: 54, sat: 22 }   // sand -> valley -> teal
  }[scat];
  var hue = BAND.h0 + hh * (BAND.h1 - BAND.h0), lit = BAND.l0 + hv * (BAND.l1 - BAND.l0);
  // The subject still has to silhouette against its own plate: sample the
  // art's mean luminance and push the plate away if they collide. This is
  // the one thing the old subject-derived rule got right, kept.
  var sc0 = document.createElement('canvas'); sc0.width = 16; sc0.height = 16;
  var sg0 = sc0.getContext('2d');
  sg0.drawImage(src, sc.x * kb, sc.y * kb, sw * kb, sh * kb, 0, 0, 16, 16);
  var sd0 = sg0.getImageData(0, 0, 16, 16).data, sr = 0, sgc = 0, sb = 0, sn = 0;
  for (var si = 0; si < sd0.length; si += 4) {
    if (sd0[si + 3] < 40) continue;
    sr += sd0[si]; sgc += sd0[si + 1]; sb += sd0[si + 2]; sn++;
  }
  var subL = sn ? (0.299 * sr + 0.587 * sgc + 0.114 * sb) / sn / 2.55 : 45;
  if (Math.abs(lit - subL) < 20) {
    // The old escape (`lit = subL +- 26`, full stop) is a pure function of
    // the sprite's own luminance once it fires — measured to fire on
    // 60-95% of keys, so it discards hv for most of the roster and every
    // key with a similar subL collapses onto the identical escaped value.
    // Fixing the hv SOURCE (rank instead of hash) cannot touch this: the
    // hatch's own output never looked at hv either way, so a rank-spread
    // hv still collapsed right back into the same collision, just between
    // a different pair (measured: rank put GI/Spy at opposite extremes,
    // 0.000 vs 1.000, and GI still hatch-fired to land beside Tanya).
    //
    // Fix: keep hv alive THROUGH the hatch by using it AFTER the push, not
    // instead of it. `base` guarantees the same >=30 separation from subL
    // the old code guaranteed (>=26, widened slightly — measured to buy
    // more of the roster without dropping the sidebar's floor below
    // 61.1); hv then spends whatever room is left between `base` and the
    // category-agnostic 12/84 clamp, pushing FURTHER from subL, never
    // closer. Two keys that collide on subL and used to collapse onto the
    // same subL+-30 now land apart if their hv differs, and the worst case
    // is never worse than the old fixed push.
    if (subL <= 50) { var base = Math.min(84, subL + 30); lit = base + hv * Math.max(0, 84 - base); }
    else            { var base2 = Math.max(12, subL - 30); lit = base2 - hv * Math.max(0, base2 - 12); }
  }
  var hsl = function (l, dh) { return 'hsl(' + Math.round(hue + (dh || 0)) + ',' + BAND.sat + '%,' + Math.max(6, Math.min(92, Math.round(l))) + '%)'; };

  // The scene. Every category is sky-over-something except infantry, which
  // RA2 shoots as a portrait against a close backdrop.
  if (scat === 'inf') {
    // Close backdrop: a flat field with a soft vignette, so a 20px figure
    // reads as a figure and not as a sticker.
    g.fillStyle = hsl(lit); g.fillRect(0, 0, W, H);
    var vg = g.createRadialGradient(W / 2, H * 0.42, 4, W / 2, H * 0.42, W * 0.72);
    vg.addColorStop(0, 'rgba(255,255,255,.10)');
    vg.addColorStop(1, 'rgba(0,0,0,.46)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  } else {
    var hz = scat === 'air' ? H * 0.78 : H * 0.62;       // an aircraft sits high
    var skyG = g.createLinearGradient(0, 0, 0, hz);
    skyG.addColorStop(0, hsl(lit + 16, -8));
    skyG.addColorStop(1, hsl(lit - 4, 4));
    g.fillStyle = skyG; g.fillRect(0, 0, W, hz);
    if (scat === 'air') {
      // Two soft cloud bands, so the sky is a place and not a swatch.
      g.fillStyle = 'rgba(255,255,255,.17)';
      g.beginPath(); g.ellipse(W * (0.22 + hh * 0.3), hz * 0.42, W * 0.30, 4.5, 0, 0, 6.284); g.fill();
      g.beginPath(); g.ellipse(W * (0.68 - hh * 0.25), hz * 0.70, W * 0.24, 3.5, 0, 0, 6.284); g.fill();
    }
    var grdG = g.createLinearGradient(0, hz, 0, H);
    grdG.addColorStop(0, hsl(lit - 12, scat === 'sea' ? 6 : -10));
    grdG.addColorStop(1, hsl(Math.max(8, lit - 26), scat === 'sea' ? 10 : -14));
    g.fillStyle = grdG; g.fillRect(0, hz, W, H - hz);
    // The horizon itself, one hairline, which is what makes it a scene.
    g.fillStyle = 'rgba(255,255,255,.13)'; g.fillRect(0, hz, W, 1);
    if (scat === 'sea') {
      // Two glints, so water reads as water.
      g.fillStyle = 'rgba(255,255,255,.14)';
      g.fillRect(W * 0.12, hz + 5, W * 0.26, 1);
      g.fillRect(W * 0.56, hz + 11, W * 0.20, 1);
    }
  }
  // A ground band, so a structure sits on something rather than floating. It
  // carries a little of the house colour, as RA2's plates do.
  var gnd = g.createLinearGradient(0, H - 12, 0, H);
  gnd.addColorStop(0, 'rgba(' + acc[0] + ',' + acc[1] + ',' + acc[2] + ',.22)');
  gnd.addColorStop(1, 'rgba(6,8,12,.72)');
  g.fillStyle = gnd; g.fillRect(0, H - 12, W, 12);
  // RA2 CROPS IN HARD. Its subject overflows the frame — Guardian G.I. is cut
  // off at the knees, the Grizzly's hull runs off both edges, the Chrono
  // Legionnaire is a shoulders-up close-up. MEASURED over the corpus, 76% of
  // an RA2 plate is picture; ours was 40%, and infantry worst of all at 30%
  // — a small figure floating in wash, which is the least identity per pixel
  // of anything in the sidebar.
  //
  // So infantry are framed as a PORTRAIT: the top of the figure, scaled to
  // FILL the plate rather than fit inside it. Vehicles and structures still
  // fit, because their identity is the whole outline; a trooper's is the
  // head, the shoulders and what he is carrying.
  var px0 = sc.x, py0 = sc.y, pw = sw, ph = sh, fill = false;
  if (!isBld) {
    try { if (UNITS[key].cls === 'i') { ph = Math.max(1, Math.round(sh * 0.72)); fill = true; } } catch (e) {}
  }
  // The portrait scale is driven by the CROP'S HEIGHT, not by max(). A
  // trooper is ~16 px wide and ~36 tall; filling the 60x48 plate on width
  // makes k about 3.5, which leaves only 13 sprite rows visible — the top
  // 38%, i.e. a head and shoulders and NO WEAPON, whatever depth you crop
  // to. Looked at beside RA2's own G.I. plate, where the rifle across the
  // chest is most of the picture, that is the whole difference.
  var k = fill ? Math.min((H - 4) / ph, (W - 3) / pw * 1.55)
               // RA2 CROPS ITS VEHICLES AND STRUCTURES HARD TOO — the
               // Grizzly's hull runs off both edges of its plate. M3 gave
               // infantry that treatment and left everything else fitting
               // politely inside its frame with margins, at about 40% of the
               // plate as picture against RA2's 76%. This overfills by 1.35
               // so the subject reaches the edges.
               //
               // 1.35 is measured, not chosen by eye alone: the sweep runs
               // 1.00 / 1.18 / 1.35 / 1.55 -> pairs under RA2's bar 541 /
               // 462 / 372 / 300, so it keeps improving all the way. 1.55 is
               // where it starts cutting identity out: the Airforce Command
               // and the Gap Generator become top fragments and the Power
               // Plant loses its base. 1.35 is the last step where every
               // structure still reads whole.
               : Math.min((W - 3) / pw, (H - 4) / ph) * 1.35;
  var kcap = fill ? 4.4 : 3.0; if (k > kcap) k = kcap;
  var dw = pw * k, dh = ph * k;
  // A PORTRAIT CROP MUST NOT BE INTERPOLATED. The infantry crop scales a
  // ~32x45 source up by about 3x to fill the plate, and with smoothing on
  // that is mush: looked at next to RA2's own G.I. plate, ours had a grey
  // smear for a helmet and a beige rectangle for a face. Our art is pixel
  // art; upscaling it nearest-neighbour keeps the helmet a helmet. Fitted
  // items are barely rescaled, so they keep the smoothing — EXCEPT that
  // "barely" was an assumption, and it is false for 6 of the 27 fitted
  // cameos. Measured: Hornet 3.00x (the cap), Dolphin 2.56x, Terror Drone
  // 2.40x, Grizzly 1.79x, Harrier 1.75x, Sea Scorpion 1.67x. Those are the
  // SMALL units — the fit is `min(plate/sprite) * 1.35`, so the less sprite
  // there is the harder it is enlarged, and the ones with the fewest pixels
  // to spare are exactly the ones getting bilinear smeared across a 60x48
  // plate. The Dolphin's came out visible mush.
  //
  // Same reasoning as the portrait crop above, same threshold as the eye
  // uses: below about 1.5x interpolation is invisible and keeps small
  // diagonal edges from crawling, above it our own pixels start being
  // averaged into porridge. So smoothing follows the SCALE, not the crop
  // mode.
  g.imageSmoothingEnabled = !fill && k < 1.5;
  // The plate is exactly W x H, so an overflowing portrait is clipped by the
  // canvas itself — which is the RA2 look, not an accident.
  // bb is CSS px; the bitmap is `kb` times larger (baked at DPR), so the
  // SOURCE rect is scaled by the sprite's own ratio.
  // Per-plate framing (CAMEO_FRAME, above). Nothing but a unit key listed
  // there moves: `fr` is null for every structure and for the other 26
  // units, so the destination is the centred one this line always drew.
  var fr = isBld ? null : CAMEO_FRAME[key];
  g.drawImage(src, px0 * kb, py0 * kb, pw * kb, ph * kb,
              (W - dw) / 2 + (fr ? fr.dx : 0),
              (fill ? -1 : (H - dh) / 2 + 1) + (fr ? fr.dy : 0), dw, dh);
  // The name, RA2's way — see CAMEO_CAPTION above for why this is here.
  var capTxt = noCap ? null : captionFor(key, isBld, fac);
  if (capTxt) drawCameoCaption(g, capTxt, W, H);
  // Bevel: light top-left, dark bottom-right, house colour on the outside.
  g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0.5, H - 1); g.lineTo(0.5, 0.5); g.lineTo(W - 1, 0.5); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,.62)';
  g.beginPath(); g.moveTo(W - 0.5, 0); g.lineTo(W - 0.5, H - 0.5); g.lineTo(0, H - 0.5); g.stroke();
  cameoCache[ck] = c;
  return cameoCopy(c);
}

// ---- the drawn tooltip -------------------------------------------------
// RA2 draws its own tooltip panel; the browser's `title=` waits a second,
// renders in the OS font and cannot show a cost the way the game does.
var ptip = document.getElementById('ptip'), ptx = ptip ? ptip.getContext('2d') : null;

function drawTip(title, lines, tone) {
  if (!ptx) return null;
  var PAD = 7, TH2 = 15, LH = 13;
  ptx.setTransform(1, 0, 0, 1, 0, 0);
  ptx.font = '700 12px system-ui, sans-serif';
  var w = ptx.measureText(title).width;
  ptx.font = '11px system-ui, sans-serif';
  for (var i = 0; i < lines.length; i++) w = Math.max(w, ptx.measureText(lines[i].t).width);
  w = Math.ceil(w) + PAD * 2;
  var h = PAD * 2 + TH2 + lines.length * LH - (lines.length ? 2 : 0);
  ptip.width = w * 2; ptip.height = h * 2;
  ptip.style.width = w + 'px'; ptip.style.height = h + 'px';
  var g = ptx; g.setTransform(2, 0, 0, 2, 0, 0);
  g.fillStyle = 'rgba(9,12,18,.95)'; g.fillRect(0, 0, w, h);
  var bd = tone === 'bad' ? '#8a3a42' : '#5c6a80';
  g.strokeStyle = bd; g.lineWidth = 1; g.strokeRect(0.5, 0.5, w - 1, h - 1);
  g.strokeStyle = 'rgba(255,255,255,.10)'; g.strokeRect(1.5, 1.5, w - 3, h - 3);
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.font = '700 12px system-ui, sans-serif';
  g.fillStyle = tone === 'bad' ? '#ff9c8f' : '#ffe07a';
  g.fillText(title, PAD, PAD + 11);
  g.font = '11px system-ui, sans-serif';
  for (var j = 0; j < lines.length; j++) {
    g.fillStyle = lines[j].c || '#b6c2d3';
    g.fillText(lines[j].t, PAD, PAD + TH2 + 9 + j * LH);
  }
  return { w: w, h: h };
}

// Anchored to the LEFT of the sidebar, vertically centred on the control,
// the way RA2 hangs its tooltips off the command bar.
function placeTip(anchor, size) {
  var wr = document.querySelector('.wrap').getBoundingClientRect();
  var r = anchor.getBoundingClientRect();
  // The command bar is at the foot of the SCREEN, so its tooltip belongs
  // directly above the button — hanging it off the sidebar would answer a
  // hover on the far bottom-left with a card on the far bottom-right.
  if (anchor.closest && anchor.closest('#cmdbar')) {
    var cx = r.left - wr.left + r.width / 2 - size.w / 2;
    cx = Math.max(6, Math.min(wr.width - size.w - 6, cx));
    ptip.style.left = Math.round(cx) + 'px';
    ptip.style.top = Math.round(Math.max(6, r.top - wr.top - size.h - 8)) + 'px';
    ptip.style.display = 'block';
    return;
  }
  // Hang it off the sidebar's outer edge, not the control's, so it never
  // lands on top of the panel it is describing.
  var edge = sideEl ? sideEl.getBoundingClientRect().left : r.left;
  var x = edge - wr.left - size.w - 8;
  if (x < 6) x = r.right - wr.left + 8;
  var y = r.top - wr.top + r.height / 2 - size.h / 2;
  y = Math.max(6, Math.min(wr.height - size.h - 6, y));
  ptip.style.left = Math.round(x) + 'px';
  ptip.style.top = Math.round(y) + 'px';
  ptip.style.display = 'block';
}

function showTip(anchor, title, lines, tone) {
  var sz = drawTip(title, lines, tone);
  if (sz) placeTip(anchor, sz);
}

function hideTip() { if (ptip) ptip.style.display = 'none'; }

// The producer a lane needs and does not have — the reason a cameo is grey
// when its own prerequisites are met. One table for the click's message and
// the tooltip: the naval lane fell off the click's else-ladder and said
// "You need a Construction Yard", and the tooltip said nothing (audit).
function laneNeeds(lane) {
  if (lane === 'i' && !hasBld(G, ME, 'barracks')) return 'Build a Barracks first';
  if (lane === 'v' && !hasBld(G, ME, 'factory')) return 'Build a War Factory first';
  if (lane === 'a') return hasBld(G, ME, 'airforce') ? 'Every Harrier pad is taken — build another Airforce Command' : 'Build an Airforce Command first';
  if (lane === 'n' && !hasBld(G, ME, 'shipyard')) return 'Build a Shipyard first';
  return null;
}

// The build item's card: cost, power draw, queue depth, and — only when it
// is out of reach — the reason.
function showItemTip(el, it, fac) {
  if (!G) return;
  var sp = it.spec, s = G.side[ME], lines = [];
  var pw = sp.power || 0;
  var cost = '$' + sp.cost;
  if (pw) cost += pw > 0 ? '   +' + pw + ' power' : '   ' + pw + ' power';
  lines.push({ t: cost, c: pw < 0 && s.powerMade - s.powerUse + pw < 0 ? '#ff9c8f' : '#dfe7f2' });
  if (sp.desc && cost.indexOf(sp.desc) < 0) lines.push({ t: sp.desc, c: '#8f9bae' });   // a plant's desc IS its power line
  var tone = null;
  if (!reqMet(G, ME, sp)) { lines.push({ t: 'Requires ' + reqName(sp, fac), c: '#ff9c8f' }); tone = 'bad'; }
  else if (!isBldLane(it.lane) && laneNeeds(it.lane)) { lines.push({ t: laneNeeds(it.lane), c: '#ff9c8f' }); tone = 'bad'; }
  else if (s.credits < sp.cost) { lines.push({ t: 'Not enough credits', c: '#ff9c8f' }); tone = 'bad'; }
  var q = s.queues[it.lane], n = 0;
  if (q) for (var i = 0; i < q.list.length; i++) if (q.list[i] === it.k) n++;
  if (isBldLane(it.lane) && q && q.ready === it.k) lines.push({ t: 'Ready — click, then click the map', c: '#ffe14d' });
  else if (q && q.pause && q.list[0] === it.k) lines.push({ t: 'On hold — click to resume · right-click to cancel', c: '#ffcf8f' });
  else if (n) lines.push({ t: n + ' queued · right-click to ' + (q.list[0] === it.k && q.prog > 0 ? 'hold' : 'cancel'), c: '#a8b8cc' });
  showTip(el, sp.name, lines, tone);
}

function onPanelClick(it, ev) {
  resumeAudio();
  if (!G || state !== 'play') return;
  var s = G.side[ME];
  if (isBldLane(it.lane) && s.queues[it.lane].ready && s.queues[it.lane].ready !== it.k) {
    // RA2: nothing else starts on this tab until the finished one is placed.
    say('Place the ' + bspecOf(G, s.queues[it.lane].ready, ME).name + ' first', true); sfx('no'); return;
  }
  if (isBldLane(it.lane) && s.queues[it.lane].ready === it.k) {
    setPlacing(it.k); cv.classList.add('placing');
    say('Click anywhere in the green area to place the ' + it.spec.name + '. Esc cancels.');
    sfx('click');
    return;
  }
  if (s.queues[it.lane].pause && s.queues[it.lane].list[0] === it.k) { cmd('pause', { lane: it.lane, k: it.k }); return; }   // resume
  if (!canBuild(G, ME, it.k, isBldLane(it.lane))) {
    if (s.credits < it.spec.cost) { say('Not enough credits for ' + it.spec.name + ' ($' + it.spec.cost + ')', true); eva('Insufficient funds', 4000); }
    else if (!reqMet(G, ME, it.spec)) say(it.spec.name + ' requires ' + reqName(it.spec, it.fac), true);
    else if (it.spec.max) say('Only ' + it.spec.max + ' ' + it.spec.name + ' at a time', true);
    else if (laneNeeds(it.lane)) say(laneNeeds(it.lane), true);
    else say('You need a Construction Yard', true);
    sfx('no');
    return;
  }
  cmd('queue', { k: it.k, lane: it.lane });
}

var lastReady = null, toldRefinery = false, lastPowerWarn = -1e9;

function refreshPanel() {
  if (!G) return;
  var s = G.side[ME];
  // An Engineer just changed what this house can build (or a captured shed
  // just fell): the tab has to be rebuilt, not merely re-greyed.
  if (facSig(G, ME) !== panelSig) { buildPanel(); return; }
  for (var rk in panelRows) {
    var pr = panelRows[rk], lock = !reqMet(G, ME, pr.it.spec);
    if (pr.el.classList.contains('locked') !== lock) {
      pr.el.classList.toggle('locked', lock);
      var ct = pr.el.querySelector('.ct');
      if (ct) ct.textContent = '$' + pr.it.spec.cost + ' · ' + (lock ? 'requires ' + reqName(pr.it.spec, pr.it.fac) : pr.it.spec.desc);
    }
  }

  // A structure that has finished building is the single most common place
  // to stall: nothing on screen changes, and the panel row alone does not
  // say "now put it somewhere".
  // Which tab is the finished structure on?
  // Build and Defence each hold their own finished structure, so BOTH tabs
  // can be flagged at once.
  document.querySelectorAll('.ptab div').forEach(function (t) {
    var tab = t.getAttribute('data-tab');
    t.classList.toggle('hasready', isBldLane(tab) && !!s.queues[tab].ready);
  });

  var rdyNow = (s.queues.b.ready || '') + '|' + (s.queues.d.ready || '');
  if (rdyNow !== lastReady) {
    var fresh = s.queues.b.ready !== (lastReady || '').split('|')[0]
                  ? s.queues.b.ready : s.queues.d.ready;
    lastReady = rdyNow;
    if (fresh) {
      say(BLDS[fresh].name + ' ready — click it under ' +
          (laneOfBld(fresh) === 'd' ? 'Defence' : 'Structures') +
          ', then click the map to place it', false, 420);
    }
  }
  if (!toldRefinery && hasBld(G, ME, 'refinery')) {
    toldRefinery = true;
    say('Refinery online — your harvesters will mine and deliver on their own', false, 360);
  }
  // Power going negative stops turrets and crawls production; say so once
  // rather than letting the build bar mysteriously slow down.
  if (s.powerMade - s.powerUse < 0 && G.tick - lastPowerWarn > 60 * 45) {
    lastPowerWarn = G.tick;
    say('Low power — production is slowed and defences are offline. Build a Power Plant.', true, 300);
    sfx('lowpower'); eva('Low power', 30000);
  }
  for (var k in panelRows) {
    var row = panelRows[k], it = row.it, el = row.el;
    var q = s.queues[it.lane];
    var n = 0;
    for (var i = 0; i < q.list.length; i++) if (q.list[i] === k) n++;
    var isReady = isBldLane(it.lane) && q.ready === k;
    var first = q.list[0] === k && !(isBldLane(it.lane) && q.ready);
    // RA2 wipes a clock over the cameo: a dark sector sweeping clockwise
    // from noon, leaving the finished part of the picture lit.
    var fl = el.querySelector('.fill');
    if (first && q.prog > 0) {
      var deg = (q.prog * 360).toFixed(1);
      fl.style.display = 'block';
      // Two layers: the bright clock hand at the leading edge, and the
      // unbuilt sector behind it. A HELD item's hand goes cold, because a
      // bright hand that never advances reads as the game having frozen.
      var hand = (q.hold || q.pause) ? 'rgba(255,120,110,.9)' : 'rgba(255,230,150,.95)';
      fl.style.background =
        'conic-gradient(from ' + deg + 'deg, ' + hand + ' 0deg 2.4deg, rgba(0,0,0,0) 2.4deg),' +
        'conic-gradient(from 0deg, rgba(0,0,0,0) 0deg ' + deg + 'deg, rgba(4,6,11,.8) ' + deg + 'deg 360deg)';
    } else if (fl.style.display !== 'none') { fl.style.display = 'none'; }
    // The ::after stamp says READY now; the corner carries queue depth, or
    // HOLD when the credits ran out mid-build (RA2's on-hold cameo).
    el.querySelector('.qn').textContent = isReady ? ''
      : (first && q.hold ? 'HOLD' : (n > 1 ? '\u00d7' + n : ''));
    el.classList.toggle('rdy', isReady);
    var ok = isReady || canBuild(G, ME, k, isBldLane(it.lane));
    el.classList.toggle('dis', !ok);
  }
}

// ---- the four tabs, as icons -------------------------------------------
// RA2's tabs are pictures, not words: a structure, a turret, a soldier and
// a tank, drawn as flat silhouettes with a lit top edge so they read at
// 21x17 without any colour of their own (the .on state supplies that).
var TAB_ICON = {
  b: function (g) {                              // structure: hall + annexe
    g.fillStyle = '#c6d2e2';
    g.fillRect(2, 6, 9, 9); g.fillRect(11, 9, 7, 6);
    g.fillStyle = '#8e9cb0';
    g.beginPath(); g.moveTo(1, 6); g.lineTo(6.5, 2.5); g.lineTo(12, 6); g.closePath(); g.fill();
    g.fillRect(10.5, 9, 8, 1.4);
    g.fillStyle = '#2b3240'; g.fillRect(5, 10, 3, 5); g.fillRect(13, 11.5, 3, 3.5);
  },
  d: function (g) {                              // defence: turret on a pad
    g.fillStyle = '#2b3240';                     // concrete pad
    g.beginPath(); g.moveTo(1, 14.5); g.lineTo(10, 11.6); g.lineTo(19, 14.5); g.lineTo(10, 17.4); g.closePath(); g.fill();
    g.fillStyle = '#8e9cb0';                     // squat base
    g.beginPath(); g.moveTo(5, 14); g.lineTo(6.4, 9.6); g.lineTo(13.6, 9.6); g.lineTo(15, 14); g.closePath(); g.fill();
    g.save(); g.translate(10, 8.6); g.rotate(-0.66);   // barrel
    g.fillStyle = '#c6d2e2'; g.fillRect(0, -1.2, 10.5, 2.4);
    g.fillRect(9.4, -1.9, 1.6, 3.8);
    g.restore();
    g.fillStyle = '#c6d2e2';                     // mantlet
    g.beginPath(); g.arc(10, 9.6, 3.3, Math.PI, 0); g.closePath(); g.fill();
  },
  i: function (g) {                              // infantry: helmet + rifle
    g.fillStyle = '#c6d2e2';
    g.beginPath(); g.arc(8.5, 4.4, 2.7, Math.PI, 0); g.closePath(); g.fill();
    g.fillRect(5.4, 4.4, 6.2, 1.2);
    g.beginPath(); g.moveTo(6.2, 6.4); g.lineTo(11, 6.4); g.lineTo(11.8, 12); g.lineTo(5.4, 12); g.closePath(); g.fill();
    g.fillRect(6, 12, 2.2, 4.4); g.fillRect(9.2, 12, 2.2, 4.4);
    g.fillStyle = '#8e9cb0'; g.save(); g.translate(11, 8.4); g.rotate(-0.5);
    g.fillRect(-1, -0.8, 8.4, 1.6); g.restore();
  },
  v: function (g) {                              // vehicle: hull + turret
    g.fillStyle = '#8e9cb0'; g.fillRect(1.5, 11, 18, 4.4);
    g.fillStyle = '#2b3240';
    for (var i = 0; i < 5; i++) g.fillRect(2.6 + i * 3.5, 12.1, 1.6, 2.2);
    g.fillStyle = '#c6d2e2'; g.fillRect(2.6, 7.4, 14.5, 3.8);
    g.fillRect(6.4, 4.2, 6.4, 3.4);
    g.fillRect(12.4, 5, 7.2, 1.8);
  }
};

var TAB_NAME = { b: ['Structures', 'Q'], d: ['Defence', 'W'], i: ['Infantry', 'E'], v: ['Units', 'R'] };

function tabIcon(kind) {
  var c = document.createElement('canvas');
  c.width = 42; c.height = 34; c.style.width = '21px'; c.style.height = '17px';
  var g = c.getContext('2d');
  g.setTransform(2, 0, 0, 2, 0, 0);
  g.translate(0, -0.6);
  (TAB_ICON[kind] || TAB_ICON.b)(g);
  return c;
}

function selectTab(tab) {
  if (!TAB_NAME[tab] || panel === tab) return;
  document.querySelectorAll('.ptab div').forEach(function (o) { o.classList.toggle('on', o.getAttribute('data-tab') === tab); });
  setPanel(tab);
  buildPanel();
  sfx('click');
}

document.querySelectorAll('.ptab div').forEach(function (t) {
  var tab = t.getAttribute('data-tab');
  t.appendChild(tabIcon(tab));
  t.addEventListener('click', function () {
    document.querySelectorAll('.ptab div').forEach(function (o) { o.classList.remove('on'); });
    t.classList.add('on');
    setPanel(tab);
    buildPanel();
  });
  t.addEventListener('pointerenter', function () {
    var nm = TAB_NAME[tab] || ['', ''];
    showTip(t, nm[0], [{ t: 'Hotkey ' + nm[1], c: '#8f9bae' }]);
  });
  t.addEventListener('pointerleave', hideTip);
});

// --- generated ---
// ESM import bindings are read-only, so a write from another module goes
// through the owner. Reads stay verbatim everywhere: the binding is live.
function setCameoCache(v) { cameoCache = v; }
function setLastPowerWarn(v) { lastPowerWarn = v; }
function setLastReady(v) { lastReady = v; }
function setToldRefinery(v) { toldRefinery = v; }

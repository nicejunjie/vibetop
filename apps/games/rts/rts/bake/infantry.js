// Iron Frontier — bake/infantry.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.

















// A fixed logical pixel grid, independent of the display's devicePixelRatio.
// Other unit families continue using their existing high-DPI canvases.
function infantryCanvas() {
  var c = document.createElement('canvas');
  c.width = 104; c.height = 63 + UPAD;
  return { c: c, g: c.getContext('2d'), w: c.width, h: c.height, crispInfantry: true };
}

function finishInfantryPixels(s, owner) {
  // Deliberate material ramps, not independent RGB rounding or frequency
  // merging. Small hands and helmet glints have the same priority as cloth.
  var colours = [
    '#141922', '#343434', '#626262', '#999999', '#d0d0d0', '#f2eee3',
    '#252f44', '#3d495c', '#465674', '#65748a', '#798ba3',
    '#323d24', '#586332', '#8a9250', '#b4b584',
    '#46332b', '#795342', '#ae8064', '#d7ae87', '#f0d0a5',
    '#584937', '#8d7953', '#c0aa77', '#e3cd91',
    '#75601d', '#bd9127', '#ffdc65',
    '#193d2c', '#327d3c', '#69c34a', '#b0e98a',
    '#28565e', '#58949d', '#99dce1',
    '#c7a7dd'
  ];
  for (var k = 0; k < 4; k++) colours.push(shade(owner, [.35, .65, 1, 1.3][k]));
  var pal = colours.map(rgbOf);
  var id = s.g.getImageData(0, 0, s.w, s.h), p = id.data;
  for (var i = 0; i < p.length; i += 4) {
    if (p[i+3] < 128) { p[i]=p[i+1]=p[i+2]=p[i+3]=0; continue; }
    var best=0, distance=Infinity;
    for (var j=0;j<pal.length;j++) {
      var dr=p[i]-pal[j][0], dg=p[i+1]-pal[j][1], db=p[i+2]-pal[j][2];
      var d=dr*dr+dg*dg+db*db;
      if (d<distance) { distance=d; best=j; }
    }
    p[i]=pal[best][0];p[i+1]=pal[best][1];p[i+2]=pal[best][2];p[i+3]=255;
  }
  s.g.putImageData(id,0,0);
}

function bakeInfantry(col, kind, fac, phase, dir, state) {
  var owner = col;
  var s = infantryCanvas(), g = s.g, cx = s.w / 2, by = s.h - UPAD;
  g.translate(cx, by); g.scale(USC_I, USC_I); g.translate(-cx, -by);
  // PROPORTION. An RA2 infantry walk frame is about 15x28 (w:h 0.50-0.55)
  // with the head a SIXTH of the height and clearly narrower than the
  // shoulders. Everything below this line was authored square: shoulders as
  // wide as the figure is tall-over-two and a head a quarter of the height,
  // which is why the squad read as toy soldiers rather than as men. The
  // whole figure is squeezed on x about the ground anchor (one transform, so
  // torso, arms, weapon and shadow narrow together and nothing drifts off
  // the anchor); the head, the hip line and the hand props are then re-cut
  // per branch, because a uniform squeeze cannot fix a head that is too big
  // in BOTH axes.
  // ...and then the kind's own STATURE (see the table): the size class RA2
  // gives this man against the rest of the roster, as one scale about the
  // same ground anchor, so the whole figure — weapon, props and shadow —
  // grows or shrinks together and the boots stay on the floor.
  var STA = STATURE[kind] || STATURE._;
  g.translate(cx, by); g.scale(0.90 * STA[0], STA[1]); g.translate(-cx, -by);

  // ---- FACING + POSE -------------------------------------------------
  // A turned figure is the SAME art under two transforms, not nine more
  // hand-drawn branches. `sd` is how side-on he is (0 front/back, 1 pure
  // profile), `fz` whether we are looking at his front (+) or his back (-).
  //   * the whole body squeezes on x by TURN, because a shoulder line seen
  //     edge-on projects to the body's DEPTH, about 0.58 of its width;
  //   * facings left of the camera are the mirror of the ones to its right,
  //     so only hx's SIGN needs a flip — the silhouette is identical;
  //   * what a flat squeeze cannot do is turn a head, swing a stride from
  //     lateral to fore-and-aft, or move a rifle off the chest, so legs(),
  //     arms(), face(), helmet(), carbine() and wpn() each re-cut their own
  //     part off `sd` / `fz`. That is the whole facing system.
  var oct = INF_OCT[(((dir | 0) % 8) + 8) % 8];
  var oa = oct * Math.PI / 4;
  var hx = Math.sin(oa), fz = Math.cos(oa);
  var MIR = hx < -0.01;
  var sd = Math.abs(hx);                       // 0 = front/back on, 1 = profile
  var TURN = 1 - 0.34 * sd;                    // shoulder line -> body depth
  var GSIDE = fz >= -0.25 ? 1 : -1;            // his weapon hand swaps on a back view
  var FA = { sd: sd, fz: fz, back: fz < -0.25, prof: sd > 0.85 };

  var ST = state || 'stand';
  var nf = INF_SEQ[ST] || 1, sph = (((phase | 0) % nf) + nf) % nf;
  var PRONE = (ST === 'prone' || ST === 'crawl' || ST === 'fireprone') ? 1 :
              (ST === 'down' || ST === 'death' ? [.08,.28,.5,.75,.94,1][sph] : ST === 'up' ? [1,.9,.65,.35,.1,0][sph] : 0);
  var FIRING = ST === 'fire' || ST === 'fireprone';
  // RA2's FireUp is a raise, a shot, a recoil and a long settle over SIX
  // frames; the muzzle flash itself is the renderer's, so these frames only
  // carry the body. Phase 0 is the shot (the sim sets `fireAt` on the tick
  // the round leaves), 1-2 the kick, 3-5 the ride forward back onto the
  // aim. Both curves are monotonic after the peak, so no two of the six
  // phases land on the same pose.
  var FIRE_RECOIL = [0.45, -1.50, -1.80, -1.15, -0.55, -0.10];
  var FIRE_RAISE = [0.80, 1.00, 0.98, 0.92, 0.85, 0.78];
  var RECOIL = FIRING ? FIRE_RECOIL[sph] : 0;
  var RAISE = FIRING ? FIRE_RAISE[sph] : 0;
  var CHEER = ST === 'cheer' ? (sph ? 0.65 : 1) : 0;
  var IDLE = ST === 'idle1' ? 1 : (ST === 'idle2' ? 2 : 0);
  // Idle1 is "look around" (the head turns on a locked body), Idle2 is
  // "check the weapon" (it comes up and goes back down). Direction-locked,
  // as art.ini's `Idle1=56,15,0,W` / `Idle2=71,14,0,E` are.
  var HEADX = IDLE === 1 ? [0, 1.6, -1.3][sph] : 0;
  if (IDLE === 2) RAISE = [0, 0.85, 0.35][sph];
  var HOP = CHEER ? (sph ? 0 : -1.4) : 0;

  var gph = (ST === 'walk' || ST === 'crawl') ? phase : -1;
  var gt = gait(gph);
  // Contact shadow first: it belongs to the GROUND, so it is drawn before
  // the turn and the pose so a prone man's shadow does not stand on end.
  var shadow = infantryCanvas();
  shadow.g.setTransform(g.getTransform());
  if (kind !== 'rocketeer') {
    if (PRONE) {
      shadow.g.save();shadow.g.translate(cx-hx*2*PRONE,by-fz*.85*PRONE);
      shadow.g.rotate(Math.atan2(fz*.43,hx));
      var groundLength=Math.sqrt(hx*hx+fz*fz*.43*.43);
      shadowBlob(shadow.g,0,0,6*(1-PRONE)+13*PRONE*groundLength,2.5);shadow.g.restore();
    } else shadowBlob(shadow.g,cx,by,6.0+gt.amp*.9,2.5);
  }

  if (MIR) { g.translate(cx, by); g.scale(-1, 1); g.translate(-cx, -by); }
  g.translate(cx, by); g.scale(TURN, 1); g.translate(-cx, -by);
  // These specialists articulate their equipment; recoil must not drag boots
  // and the entire silhouette sideways over a stationary ground shadow.
  var jointAction = kind === 'tanya' || kind === 'ivan' || kind === 'cleg';
  if (RECOIL || HOP) g.translate(jointAction || PRONE ? 0 : RECOIL * (0.75 + 0.5 * sd), HOP);
  var sov = fac === 'col';
  // The Flak Trooper's art was built under `rocket` for the Collective; the
  // unit now has its own key, the art path is the same.
  var isFlak = kind === 'flak';
  if (isFlak) { kind = 'rocket'; sov = true; }
  var tkey = (kind === 'rocket' && sov) ? 'rocketS' : kind;
  var T = TROOP[tkey] || TROOP.rifle;
  // The kind's rung on the value ladder. `col` is pre-divided by the same
  // curve the finished sprite is put through, so the house block comes out
  // of the pass at exactly the colour it went in as and friend-vs-foe is
  // untouched however far the man himself moves.
  var VG = INF_VALUE[tkey] || 1;
  if (VG !== 1) col = valuePre(col, VG);
  // The kind's ACCENT gets the same pre-compensation, and for the same reason:
  // it is the one surface that must survive the darkening pass at the value it
  // was chosen at. A hard hat that comes out of the bake brown is not a hard hat.
  var ACC = ACCENT[tkey] || '#ffffff';
  if (VG !== 1) ACC = valuePre(ACC, VG);
  // ...and the kind's EDGE FLOOR (see INF_EDGE). `edge()` is `shade()` with a
  // minimum, so the shared legs/arms/helmet keep one call site each.
  var EDGE = INF_EDGE[tkey] || 0;
  function edge(c, f) { return shade(c, f < EDGE ? EDGE : f); }
  var GUN = '#242424';
  var JACKET = '#000033';        // Conscript's near-black tunic
  var SLEEVE = '#333333';        // ...his sleeves, one step lighter so they read
  var POUCH = '#996633';         // his tan ammo pouch
  var ar;

  // Two legs that SCISSOR — the one thing that separates a walk from a
  // wider stance. `i` is the screen side (-1 left, +1 right). In a stride
  // frame the leg on the swing side LEADS: it swings out past the hip and
  // plants flat and lit. The other leg is mid-swing, so its foot is pulled
  // in UNDER the body, tilted off the vertical and lifted clear of the
  // ground, and it is drawn narrower and darker because it is behind.
  // Splaying BOTH feet outward (the first attempt) just made a straddle
  // that read as standing with the feet apart in every frame.
  function legs(sp, hipY, w, trousers, bootW, thigh) {
    bootW = bootW || w + 0.5;
    var order = gt.sw === 0 ? [-1, 1] : [-gt.sw, gt.sw];   // trailing leg first
    // Turning swaps the stride's AXIS. Head-on the legs scissor sideways
    // and barely separate; side-on the same stride is fore-and-aft and is
    // the biggest thing on the sprite, so the lateral splay collapses by
    // `latK` and reappears as `fwdK` along the facing (divided by TURN so
    // it survives the body squeeze at its true screen length).
    var latK = 1 - 0.50 * sd, fwdK = 2.2 * sd / TURN;
    for (var n = 0; n < 2; n++) {
      var i = order[n];
      var lead = gt.sw === 0 ? 0 : (i === gt.sw ? 1 : -1);
      var fx = cx + (lead > 0 ? i * (sp + 3.0) : lead < 0 ? -i * sp * 0.30 : i * sp) * latK
                  + (lead > 0 ? fwdK : lead < 0 ? -fwdK * 0.68 : 0);
      var lift = lead < 0 ? 2.3 : 0;                 // trailing foot swings clear
      var lw = w * (lead < 0 ? 0.84 : 1);
      var hx = cx + i * sp * 0.74 * latK;
      g.fillStyle = shade(trousers, lead > 0 ? 1.14 : lead < 0 ? 0.70 : 1);
      g.beginPath();                                 // hip -> ankle
      g.moveTo(hx - w / 2, hipY); g.lineTo(hx + w / 2, hipY);
      g.lineTo(fx + lw / 2 - 0.3, by - 2.4 - lift);
      g.lineTo(fx - lw / 2 + 0.3, by - 2.4 - lift);
      g.closePath(); g.fill(); outline(g, edge(trousers, 0.46));
      // An optional armoured THIGH PLATE in house colour, cut from the same
      // quad so it tapers and swings with the leg instead of floating on the
      // hip. Only the Tesla Trooper asks for one: his carapace is silver by
      // §2.2, and the owner colour the chest gave up has to land somewhere
      // the figure currently has NONE — the legs are 34% of his mass and
      // were 0% remap.
      if (thigh) {
        var uu = 0.68, ay2 = by - 2.4 - lift;
        var ty2 = hipY + (ay2 - hipY) * uu;
        var tx2 = hx + (fx - hx) * uu, tw2 = (w + (lw - w) * uu) * 0.94;
        g.fillStyle = shade(thigh, lead > 0 ? 1.06 : lead < 0 ? 0.66 : 0.92);
        g.beginPath();
        g.moveTo(hx - w / 2 + 0.2, hipY); g.lineTo(hx + w / 2 - 0.2, hipY);
        g.lineTo(tx2 + tw2 / 2, ty2); g.lineTo(tx2 - tw2 / 2, ty2);
        g.closePath(); g.fill(); outline(g, edge(thigh, 0.42));
      }
      var bw = bootW * (lead < 0 ? 0.84 : 1);
      g.fillStyle = lead < 0 ? shade(T.boot, 0.74) : T.boot;
      g.beginPath();
      g.roundRect(fx - bw / 2, by - 2.8 - lift, bw, 2.8, 0.9); g.fill();
      // A small leather upper stays visible above the contact shadow even
      // when standing. Do not leave stationary feet as one black shadow bar.
      g.fillStyle = lead < 0 ? '#555d61' : '#737b7b';
      g.fillRect(fx - bw / 2 + 0.55, by - 2.5 - lift, bw - 1.1, 0.85);
    }
  }
  // Sleeves counter-swing the legs: the arm OPPOSITE the leading leg comes
  // forward (drawn lower, wider and lit), the other pulls back and up.
  // `cb` gets (side, x, y, forward) so each unit can hang its own cuff,
  // pauldron or glove off the same swing.
  function arms(sp, topY, w, h, sleeve, cb) {
    // Which arm is NEARER the camera flips with the body: facing away, the
    // shoulder that was in front is now behind. The far arm is drawn first,
    // narrower, darker and pulled in toward the spine, which is the only
    // thing that stops a profile figure reading as a man with four arms.
    var nearI = fz >= 0 ? -1 : 1;
    var order = [-nearI, nearI];
    var latK = 1 - 0.26 * sd, swK = 1.7 * sd / TURN;
    for (var n2 = 0; n2 < 2; n2++) {
      var i = order[n2], far = i !== nearI;
      var fwd = gt.sw === 0 ? 0 : (i === gt.sw ? -1 : 1);
      var aw = w * (far ? 1 - 0.30 * sd : 1);
      var ax = cx + i * (sp + (fwd > 0 ? 0.45 : fwd < 0 ? -0.3 : 0) + CHEER * 1.5) * latK - aw / 2
                  - (far ? i * sd * 1.1 : 0) + fwd * swK * (1 - CHEER);
      var ay = topY + (fwd > 0 ? 0.7 : fwd < 0 ? -0.7 : 0) - CHEER * (h * 1.30);
      var ah = h + (fwd > 0 ? 0.8 : 0) - CHEER * h * 0.18;
      // Cheer: both arms go straight up over the head (art.ini Cheer=56,15).
      g.fillStyle = shade(sleeve, far ? 0.66 : (fwd > 0 ? 1.06 : 0.76));
      g.beginPath(); g.roundRect(ax, ay, aw, ah, aw * 0.46); g.fill();
      outline(g, edge(sleeve, 0.48));
      if (cb) cb(i, ax + aw / 2, ay, fwd);
    }
  }
  // A held weapon keeps its TRUE length while the body squeezes (undo TURN
  // on x), swaps shoulders when we are behind him, and rides up when he
  // fires. Used by the branches whose weapon is a long shoulder piece.
  function wpn(fn, upright) {
    // A shoulder piece is authored ALREADY foreshortened at the front
    // facing (it points at the camera there); swinging round to a profile
    // gives back its true length. `wl` is that screen length, divided by
    // TURN so the body's squeeze does not eat it a second time.
    //
    // `upright` is the THIRD case, and it is the Flak Trooper's. The two the
    // renderer already knew were a piece that points ALONG the facing (this
    // function's default: a Guardian's missile tube) and one held ACROSS the
    // body (the Chrono Legionnaire's rifle, which is why his is drawn in
    // body space instead — see that branch). A cannon carried muzzle-UP is
    // neither: it is very nearly VERTICAL, so almost none of its length is
    // in the horizontal plane and turning the man cannot lengthen it. Run
    // through the default, its small lateral lean was multiplied by
    // `(0.82+0.33)/0.66 = 1.74` at the profile facings — 2.1x its front-on
    // reach — and swung the whole barrel clear of the man: at oct3 the gun
    // owned 8 columns of the bbox with the body in the other 10, which is
    // the entire reason a 12x37 Flak Trooper measured 20x45 (w:h 0.444
    // against RA2's 0.324). `upright` freezes the horizontal scale at its
    // authored front-on value, so the barrel's offset from the man narrows
    // WITH the body as he turns, which is what a vertical thing does.
    var wl = upright ? 0.82 : (0.82 + 0.33 * sd) / TURN;
    g.save();
    g.translate(cx + GSIDE * sd * 1.7, -RAISE * 1.3);
    g.scale(GSIDE * wl, 1);
    g.translate(-cx, 0);
    fn();
    g.restore();
  }
  // A face only exists on the facings that HAVE one. On the three rear
  // facings the branch's eyes/visor/beard are skipped too (`FA.back`), and
  // helmet() puts a nape and a strap there instead — the single clearest
  // signal that a man is walking away from you.
  function face(hy) {
    if (FA.back) return;
    var fx2 = cx + sd * 1.9 / TURN + HEADX;
    g.fillStyle = T.skin;
    g.beginPath(); g.ellipse(fx2, hy, 2.35 * (1 - 0.24 * sd), 2.55, 0, 0, 6.29); g.fill();
    outline(g, '#8a6440');
    if (sd > 0.5) {                                 // profile: a nose off the cheek line
      g.fillStyle = T.skin;
      g.beginPath();
      g.moveTo(fx2 + 1.5, hy - 0.6); g.lineTo(fx2 + 2.5 * sd, hy + 0.25);
      g.lineTo(fx2 + 1.5, hy + 1.0); g.closePath(); g.fill();
      outline(g, '#8a6440');
    }
  }
  // A helmet dome with a lit crown and a shaded brim. The helmet is the
  // single most reliable friend-or-foe tell on a 20px figure, so it is
  // drawn as a solid house-colour cap rather than a tinted grey one.
  function helmet(hy, r, hcol, brim, hef) {
    // `hef` is a SHELL-ONLY edge floor, and it is not the INF_EDGE floor: it
    // lifts the brim and the outline of THIS helmet without touching the
    // torso block underneath. That distinction is the whole reason it
    // exists. §2.1 asks the G.I.'s helmet for "a value distinct from both
    // torso and legs" and it measured 0.073 against the 0.10 this repo reads
    // that as; the two obvious levers both failed, MEASURED:
    //   * a DARKER pot (#9ba2ab -> #767d87) got the gap to 0.172 and pushed
    //     `rifle | conscript` to 11.8 against a 12.2 friend-vs-foe floor —
    //     two confusable pairs, because the Conscript's own cap is #2f3540
    //     and darkening the G.I.'s walks him straight into it;
    //   * `INF_EDGE.rifle = 0.70` lifted the helmet 0.465 -> 0.554 and the
    //     TORSO 0.539 -> 0.567 with it, leaving a gap of 0.013. A kind-wide
    //     floor moves both bands together, exactly as INF_VALUE does.
    // Only a shell-scoped lift moves one band against the other.
    var hcx = cx + sd * 1.1 / TURN + HEADX;
    var rw = r * (1 - 0.16 * sd);                    // a helmet is longer than it is wide
    var hE = function (f) { return edge(hcol, hef && f < hef ? hef : f); };
    g.fillStyle = hcol;
    g.beginPath(); g.ellipse(hcx, hy, rw, r, 0, Math.PI, 0); g.fill();
    g.fillRect(hcx - rw, hy, rw * 2, 1.1);
    g.fillStyle = hE(0.62);
    g.fillRect(hcx - rw - 0.5, hy + 0.8, rw * 2 + 1.0, brim);
    outline(g, hE(0.38));
    if (FA.back) {
      // the nape: a shaded crescent under the shell and the chin strap's
      // buckle at the back of the neck
      g.fillStyle = hE(0.52);
      g.beginPath(); g.ellipse(hcx, hy + 1.2, rw * 0.82, r * 0.5, 0, 0, Math.PI); g.fill();
      g.fillStyle = 'rgba(20,22,26,.55)';
      g.fillRect(hcx - rw * 0.5, hy + 1.5, rw, 1.0);
    }
    g.fillStyle = shade(hcol, 1.42);                              // lit crown band
    g.beginPath();
    g.ellipse(hcx - rw * 0.32, hy - r * 0.46, rw * 0.42, r * 0.24, -0.35, 0, 6.29); g.fill();
  }
  // A rifle as a short angled stroke: butt at (x0,y0), muzzle at (x1,y1),
  // with a barrel glint and a magazine hanging off the middle. Drawing it
  // level and symmetric turned the GI into a man holding a pipe.
  // The authored endpoints are the FRONT-ON pose (angled across the chest).
  // Turning re-aims the same weapon about the hands: side-on it swings out
  // to point along the facing, and firing brings it up to the shoulder. The
  // x terms are divided by TURN so the barrel keeps its true screen length
  // while the body behind it narrows.
  function carbine(x0, y0, x1, y1, w) {
    var vx = x1 - x0, vy = y1 - y0, L = Math.sqrt(vx * vx + vy * vy);
    var hxp = x0 + vx * 0.40, hyp = y0 + vy * 0.40;
    var a2 = Math.atan2(vy, vx) * (1 - sd) * (1 - RAISE * 0.55) + (-0.16 - RAISE * 0.10) * sd - RAISE * 0.16 * (1 - sd);
    var L2 = L * (0.80 + 0.26 * sd);
    var mx = cx + (hxp - cx) * GSIDE / TURN + GSIDE * sd * 2.2 / TURN;
    var my = hyp - RAISE * 3.2;
    var ux = Math.cos(a2) * GSIDE / TURN, uy = Math.sin(a2);
    x0 = mx - ux * L2 * 0.40; y0 = my - uy * L2 * 0.40;
    x1 = mx + ux * L2 * 0.60; y1 = my + uy * L2 * 0.60;
    g.strokeStyle = GUN; g.lineWidth = w; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = '#626262'; g.lineWidth = w * 0.42;               // barrel glint
    g.beginPath();
    g.moveTo(x0 + (x1 - x0) * 0.52, y0 + (y1 - y0) * 0.52);
    g.lineTo(x1 - (x1 - x0) * 0.06, y1 - (y1 - y0) * 0.06); g.stroke();
    g.fillStyle = GUN;                                               // magazine
    var mxp = x0 + (x1 - x0) * 0.40, myp = y0 + (y1 - y0) * 0.40;
    g.beginPath(); g.roundRect(mxp - 0.9, myp + 0.3, 2.0, 2.9, 0.6); g.fill();
  }

  var C = { ACC: ACC, FA: FA, HEADX: HEADX, JACKET: JACKET, POUCH: POUCH, SLEEVE: SLEEVE, T: T, TURN: TURN,
            ar: ar, arms: arms, by: by, carbine: carbine, col: col, cx: cx, edge: edge,
            face: face, g: g, gt: gt, helmet: helmet, legs: legs, sd: sd, sov: sov,
            state: ST, phase: sph, raise: RAISE, recoil: RECOIL, wpn: wpn };
  function standingFigure() {
  if (kind === 'conscript') {
    drawConscript(C);

  } else if (kind === 'rocketeer') {
    drawRocketeer(C);

  } else if (kind === 'rocket' && !sov) {
    drawGuardianGi(C);

  } else if (kind === 'rocket') {
    drawFlakTrooper(C);

  } else if (kind === 'engineer') {
    drawEngineer(C);

  } else if (kind === 'tanya') {
    drawTanya(C);

  } else if (kind === 'teslatrooper') {
    drawTeslatrooper(C);

  } else if (kind === 'ivan') {
    drawIvan(C);

  } else if (kind === 'desolator') {
    drawDesolator(C);

  } else if (kind === 'yuri') {
    drawYuri(C);

  } else if (kind === 'cleg') {
    drawCleg(C);

  } else if (kind === 'spy') {
    drawSpy(C);

  } else {
    drawGi(C);
  }
  }
  if (PRONE) drawGroundInfantry(C, kind, PRONE, standingFigure);
  else standingFigure();
  if (VG !== 1) valuePass(s, VG);       // the kind's rung on the value ladder
  finishInfantryPixels(s, owner);
  // Composite the translucent ground shadow AFTER making the body opaque.
  // Otherwise antialiased ankles borrow shadow colour and fade into terrain.
  g.save(); g.setTransform(1,0,0,1,0,0);
  g.globalCompositeOperation = 'destination-over';
  g.drawImage(shadow.c,0,0); g.restore();
  return s;
}

// A grounded skeleton, not a flattened standing bitmap. Forward/side coordinates
// project onto the ground; the separate height keeps elbows, knees and equipment
// attached while the chest lowers. Standing art is reused ONLY for the head.
function drawGroundInfantry(C, kind, amount, headFigure) {
  var g=C.g, cx=C.cx, by=C.by, sd=C.sd, fz=C.FA.fz, turn=C.TURN;
  var dead=C.state==='death', crawl=C.state==='crawl';
  var wave=crawl?Math.sin(C.phase*Math.PI/3):0;
  var cloth={rifle:'#586332',conscript:'#795342',tanya:'#586332',ivan:'#465674',
    engineer:'#8d7953',spy:'#252f44',cleg:'#999999',rocket:C.sov?'#795342':'#586332',
    teslatrooper:'#999999',yuri:'#343434'}[kind]||C.T.coat;
  var shirt={rifle:'#586332',conscript:'#343434',tanya:'#252525',ivan:C.col,
    engineer:'#d0d0d0',spy:'#252f44',cleg:'#d0d0d0',rocket:C.sov?C.T.coat:'#999999',
    teslatrooper:'#d0d0d0',yuri:'#626262'}[kind]||C.T.coat;
  var bare=kind==='tanya'||kind==='ivan'||kind==='rifle';
  function ground(f,s,z){return [cx+sd*f/turn+fz*s,by+fz*f*.43-sd*s*.3-z];}
  function joint(x,z,f,s,h){var p=ground(f,s,h);return [cx+x+(p[0]-cx-x)*amount,by-z+(p[1]-by+z)*amount];}
  function line(points,c,w){g.strokeStyle=c;g.lineWidth=w;g.lineCap='round';g.lineJoin='round';g.beginPath();g.moveTo(points[0][0],points[0][1]);for(var j=1;j<points.length;j++)g.lineTo(points[j][0],points[j][1]);g.stroke();}
  function limb(points,c,w){line(points,'#141922',w+.8);line(points,c,w);line(points.map(function(p){return[p[0]-.35,p[1]-.5];}),shade(c,1.18),Math.max(.8,w*.36));}
  var hip=joint(0,12,-3,0,2.8),chest=joint(0,18.5,4.3,0,dead?2.3:4.4);
  // Each bent knee travels with its own ankle. The opposing elbow reaches
  // while that knee pulls forward; no sideways standing-walk scissor.
  for(var n=0;n<2;n++){
    var side=n?1:-1, pull=wave*side;
    var h=joint(side*2,12,-3,side*1.9,2.8);
    var knee=joint(side*2.8,6.5,-8+pull*2.4,side*(3.3+Math.max(0,pull)),1.2);
    // Kneel before extending: the knee touches down while the ankle still
    // bears weight. Linear standing-to-lying interpolation makes stiff planks.
    var kneel=Math.sin(amount*Math.PI);
    knee[0]+=sd*3.5*kneel/turn+side*.8*kneel;knee[1]+=2.5*kneel;
    var foot=joint(side*3.4,1,-14+pull*2.8,side*2.8,.8);
    limb([h,knee,foot],cloth,kind==='tanya'?2.5:3.1);
    line([foot,[foot[0]-sd*2/turn,foot[1]-fz*.7]],C.T.boot,2.4);
  }
  limb([hip,chest],shirt,kind==='tanya'?5:6.5);
  var badge=joint(-1,16,0,-1,5.3);
  line([badge,[badge[0]+fz*2.6,badge[1]-sd*.8]],C.col,1.8);
  if(kind==='teslatrooper'||kind==='cleg'||kind==='desolator'||kind==='rocketeer'){
    var pack=ground(0,-1.5,6);
    limb([[hip[0]-1,hip[1]-2],pack],kind==='desolator'?'#327d3c':'#999999',4);
  }
  var hands=[];
  for(var a=0;a<2;a++){
    var s=a?1:-1, reach=crawl?-wave*s*1.4:0;
    var shoulder=joint(s*3,18.5,4,s*2.5,4.5);
    var elbow=joint(s*4,14,5+reach,s*4,dead?.5:1.1);
    var hand=joint(s*4,16,10+reach,s*(kind==='tanya'?3.2:1.2),dead?.5:3.1);
    if(dead)hand=joint(s*4,16,7,s*5,.5);
    if(kind==='yuri'&&C.state==='fireprone')hand=ground(7.5,s*2.3,7);
    limb([shoulder,elbow],shirt,2.6);
    limb([elbow,hand],bare?C.T.skin:shirt,2.1);hands.push(hand);
    line([hand,[hand[0]+.3,hand[1]]],C.T.skin,1.8);
  }
  // The existing head remains upright above the supported shoulders: helmets,
  // hair, face opening and specialist masks keep their accepted identity.
  var neck=joint(0,20,7.3,0,dead?1.7:5.0);
  g.save();g.translate(neck[0]-cx,neck[1]-(by-20));
  if(dead){g.translate(cx,by-20);g.rotate(amount*.35);g.translate(-cx,-(by-20));}
  if(kind==='rocket'&&C.sov){
    C.face(by-21.2);C.helmet(by-23.1,3.15,'#919191',1);
  }else if(kind==='desolator'){
    var headX=cx+sd*1.3/turn;
    g.fillStyle='#343d30';g.beginPath();g.ellipse(headX,by-23.2,2.8,3.2,0,0,6.29);g.fill();
    g.fillStyle='#657451';g.beginPath();g.ellipse(headX-.6,by-24.6,1.8,1.1,-.15,0,6.29);g.fill();
    if(!C.FA.back){g.fillStyle='#242b24';g.fillRect(headX-2.1,by-23.4,4.5,2.3);g.fillStyle='#788c71';g.fillRect(headX-1.6,by-23.1,3.3,.7);}
  }else{
    // Tight head bounds exclude an upright shoulder weapon/backpack. Cropping
    // the whole top third smuggles those standing-only parts into prone poses.
    g.beginPath();g.rect(cx-4,by-28,8,8.2);g.clip();
    g.translate(-C.gt.lean,-C.gt.bob);headFigure();
  }
  g.restore();
  if(kind==='ivan'){
    var explosive=hands[1];
    line([[explosive[0],explosive[1]-3],explosive],'#ae8064',3);
    line([[explosive[0]-1,explosive[1]-1],[explosive[0]+1,explosive[1]-1]],'#c0aa77',1);
  }else if(kind==='engineer'){
    var tool=hands[1];g.fillStyle='#46332b';g.fillRect(tool[0]-2,tool[1]+.8,4,3);
    line([[tool[0]-1,tool[1]+1],[tool[0]-1,tool[1]],[tool[0]+1,tool[1]],[tool[0]+1,tool[1]+1]],'#999999',.8);
  }else if(kind==='teslatrooper'){
    hands.forEach(function(h){line([h,[h[0]+sd*2/turn,h[1]+fz]],'#d0d0d0',3);});
  }else if(kind==='tanya'){
    hands.forEach(function(h){line([h,[h[0]+sd*3.6/turn,h[1]+fz*1.5]],'#343434',1.7);});
  }else if(!({engineer:1,spy:1,yuri:1,ivan:1}[kind])){
    var hand=hands[1],dx=sd/turn,dy=fz*.43;
    var recoil=C.state==='fireprone'?C.recoil*.35:0;
    var gun=[[hand[0]-dx*(3+recoil),hand[1]-dy*3-.6],[hand[0]+dx*(6-recoil),hand[1]+dy*6-.6]];
    line(gun,'#141922',kind==='rocket'||kind==='cleg'?3:2);
    line([[gun[0][0],gun[0][1]-.6],[gun[1][0],gun[1][1]-.6]],'#626262',.8);
    if(kind==='cleg'||kind==='desolator'){
      var ring=[gun[1][0]-dx*1.6,gun[1][1]-dy*1.6];
      line([[ring[0]-.5,ring[1]-1.7],[ring[0]+.5,ring[1]+1.7]],kind==='cleg'?'#99dce1':'#69c34a',1.4);
    }
  }
}

// Infantry art is a LAZY facing/state atlas, not a baked array. Nine kinds
// x two factions x two owners x eight facings x ~30 state frames is 8,600
// canvases — many seconds of load for frames a given match mostly never
// shows. So `bakeAll` bakes ONE frame per kind (the front-on standing
// frame, which is also what the build cameos and the menu line-up crop
// from) and `fr()` bakes the rest on first use and memoises them, exactly
// as the structure damaged / unpowered / make states do.
function infArt(col, kind, fac) {
  var base = bakeInfantry(col, kind, fac, -1, 1, 'stand');     // d1 = due S = front-on
  var cache = { 'stand1_0': base };
  base.inf = true;
  base.fr = function (st, dir, phase) {
    if (!INF_SEQ[st]) st = 'stand';
    var nf = INF_SEQ[st], d = octOf(dir);              // 32-facing in, 8 SHP facings out
    var ph = (((phase | 0) % nf) + nf) % nf;
    var k = st + d + '_' + ph;
    return cache[k] || (cache[k] = bakeInfantry(col, kind, fac, st === 'stand' ? -1 : ph, d, st));
  };
  return base;
}

// --------------------------------------------------------------------- //
//  Attack Dog ([ADOG]/[DOG])
//
//  Built against docs/ra2-ref/allied-attack-dog.png (seven dogs on grass at
//  1:1). What that sprite actually is: a low, LONG German shepherd — the
//  body reads about 26x16 with the ground line, so it is well over half as
//  wide again as it is tall, the opposite proportion to every man in the
//  game. Coat is warm tan/gold over a BLACK saddle -- the shepherd's own
//  marking, and the thing a playtester missed when the saddle was painted
//  in the house colour instead: a tan animal with a coloured back and a
//  bushy level tail read as an orange FOX. The owner's colour is therefore
//  worn, not grown: a broad collar and a harness strap over the withers
//  (docs/design-decisions.md: only the owner's colour is saturated, faction
//  never paints a unit). Black blocky muzzle, black stockings, pricked
//  ears, a sabre tail hanging below the hocks.
//
//  Same canvas, anchor and scale contract as bakeInfantry, so drawUnit
//  places a dog with the identical expression. Eight facings are the same
//  art under a mirror plus a foreshortening squeeze (the shepherd is not
//  redrawn nine times); `state` is stand / walk (6) / leap (3).
// --------------------------------------------------------------------- //
var DOG_SEQ = { stand: 1, walk: 6, leap: 3 };

// ===================================================================== //
//  THE NAVY — eight baked facings per hull, same anchor and the same iso
//  basis as bakeVehicle, so drawUnit places a Destroyer exactly as it
//  places a Grizzly.
//
//  A ship is not a tank with a pointed nose, and the five moves that make
//  one read at 1:1 are different ones:
//
//    1. A PLAN, not a box. The hull is a nine-point outline in the ground
//       plane — raked stem, a long parallel midbody, a squared transom —
//       extruded to a deck. Every RA2 hull is drawn from its waterline
//       silhouette and this is what carries the direction at the three-
//       quarter facings where a box collapses.
//    2. A WATERLINE. The plan is filled once as a dark boot-topping BELOW
//       the deck line, so the hull sits IN the water instead of on it, and
//       the shadowed side of the freeboard is what tells you which way it
//       is heeled.
//    3. SUPERSTRUCTURE IN TIERS. Bridge block, then a smaller wheelhouse on
//       it, then a mast: three descending masses is what stops a warship
//       reading as a barge with a lump on it.
//    4. ONE house band, high on the hull side under the deck edge, plus a
//       funnel or launcher cheek. Ships carry very little paint in RA2 and
//       the eye still finds it because the rest of the hull is grey.
//    5. FITMENTS with a job: gun, radar, funnel, boat davit, deck lights.
// ===================================================================== //
var SHIP_KINDS = { destroyer: 1, aegis: 1, carrier: 1, dolphin: 1, lcraft: 1,
                   sub: 1, seascorp: 1, dread: 1, squid: 1 };

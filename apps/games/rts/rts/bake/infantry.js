// Iron Frontier — bake/infantry.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.

















function bakeInfantry(col, kind, fac, phase, dir, state) {
  var s = unitCanvas(), g = s.g, cx = s.w / 2, by = s.h - UPAD;
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
              ((ST === 'down' || ST === 'up') ? 0.55 : 0);
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
  if (kind !== 'rocketeer')
    shadowBlob(g, cx + (PRONE ? sd * 5.5 : 0), by,
               (6.0 + gt.amp * 0.9) * (1 + PRONE * 1.05 * sd), 2.5 * (1 - PRONE * 0.25));

  if (MIR) { g.translate(cx, by); g.scale(-1, 1); g.translate(-cx, -by); }
  if (PRONE) {
    // Lie the standing figure down about its own ground point: rotate it
    // toward the way it faces, then flatten in SCREEN space (the scale is
    // written OUTSIDE the rotate so it squashes the lying body, not the
    // standing one). Head-on there is nothing to rotate, so almost all of
    // it is foreshortening; side-on it is almost all rotation.
    g.translate(cx, by + PRONE * 1.0);
    g.scale(1 + PRONE * 0.25 * (1 - sd), 1 - PRONE * (0.62 - 0.24 * sd));
    g.rotate(PRONE * (0.30 + 0.85 * sd));
    g.translate(-cx, -by);
  }
  g.translate(cx, by); g.scale(TURN, 1); g.translate(-cx, -by);
  if (RECOIL || HOP) g.translate(RECOIL * (0.75 + 0.5 * sd), HOP);
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
  // ...and the kind's EDGE FLOOR (see INF_EDGE). `edge()` is `shade()` with a
  // minimum, so the shared legs/arms/helmet keep one call site each.
  var EDGE = INF_EDGE[tkey] || 0;
  function edge(c, f) { return shade(c, f < EDGE ? EDGE : f); }
  var GUN = '#22242a';
  var JACKET = '#252a38';        // Conscript's near-black tunic
  var SLEEVE = '#3b4256';        // ...his sleeves, one step lighter so they read
  var POUCH = '#b58a52';         // his tan ammo pouch
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
      if (lead > 0) {                                // toe-cap glint on the lead boot
        g.fillStyle = 'rgba(255,255,255,.16)';
        g.fillRect(fx - bw / 2 + 0.4, by - 2.7, bw - 0.8, 0.8);
      }
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
    g.strokeStyle = '#5c636e'; g.lineWidth = w * 0.42;               // barrel glint
    g.beginPath();
    g.moveTo(x0 + (x1 - x0) * 0.52, y0 + (y1 - y0) * 0.52);
    g.lineTo(x1 - (x1 - x0) * 0.06, y1 - (y1 - y0) * 0.06); g.stroke();
    g.fillStyle = GUN;                                               // magazine
    var mxp = x0 + (x1 - x0) * 0.40, myp = y0 + (y1 - y0) * 0.40;
    g.beginPath(); g.roundRect(mxp - 0.9, myp + 0.3, 2.0, 2.9, 0.6); g.fill();
  }

  var C = { FA: FA, HEADX: HEADX, JACKET: JACKET, POUCH: POUCH, SLEEVE: SLEEVE, T: T, TURN: TURN,
            ar: ar, arms: arms, by: by, carbine: carbine, col: col, cx: cx, edge: edge,
            face: face, g: g, gt: gt, helmet: helmet, legs: legs, sd: sd, sov: sov, wpn: wpn };
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
  if (VG !== 1) valuePass(s, VG);       // the kind's rung on the value ladder
  pixelate(s, 8, 96);                   // hard edges and flat bands, as RA2 draws them
  return s;
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

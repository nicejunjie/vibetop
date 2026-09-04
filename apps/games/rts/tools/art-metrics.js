#!/usr/bin/env node
// Unit-art readability metrics — the measuring half of the art regression gate.
//
//   node apps/games/rts/tools/art-metrics.js                 # print a report
//   node apps/games/rts/tools/art-metrics.js --json out.json  # + write the numbers
//   node apps/games/rts/tools/art-metrics.js --record         # rewrite docs/art-baseline.json
//
// It serves rts.html from a throwaway loopback server, opens it in headless
// Chromium at devicePixelRatio 1 / zoom 1 (where a baked logical pixel IS a
// screen pixel — see unit-confusability-audit.md §Method), reads every unit's
// sprite back out of the page's own atlas via `window.__rtsTest.spr()`, and
// composes each one EXACTLY the way `drawUnit` composes it. That composition is
// the load-bearing part: hull+turret for the six turreted vehicles, envelope +
// gondola for the Kirov, `art.fr('stand', dir, 0)` for infantry, a single sheet
// for everything else. Compose it any other way and every number below is
// fiction.
//
// It also drives a REAL rendered frame and screenshots it, and it fails if any
// bake throws or the page logs an error — because this repo has already learned
// that headless numbers pass while the renderer throws
// (unit-redesign-plan.md §5, docs/design-decisions.md).
//
// The metrics are deliberately ENSEMBLE properties (pairwise separation,
// peer-vs-self, counts over a floor). Per-unit numbers that a single art commit
// could set by construction are recorded as `detail` for a human to read, and
// are NOT asserted by the gate.

'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');   // repo root
const RTS = path.join(ROOT, 'apps', 'games', 'rts');
const BASELINE = path.join(RTS, 'docs', 'art-baseline.json');
const FRAME_PNG = path.join(RTS, 'art', 'out', 'art-gate-frame.png');

// ── The renderer's own constants, mirrored here so a change to either shows up
//    as a diff rather than as a silently-shifted metric.
const ZMIN = 0.55;              // rts.html:24995
const SPIKE_FLOOR_ZMIN = 2.0;   // RA2's own floor: 2 px of thickness
const SPIKE_FLOOR = SPIKE_FLOOR_ZMIN / ZMIN;   // => 3.64 px at zoom 1 (plan §2 option 1)
// A unit whose fixed (non-owner) pixels average less than this much saturation
// is painted in greys: it reads as "a machine" and never as "THAT machine".
// 0.14 is just above the census's own s > 0.12 noise floor, so a unit only
// clears it by carrying real chroma over a real area, not by one bright pixel.
const ACHROMATIC = 0.14;

// ── SPIKES ────────────────────────────────────────────────────────────────
// One entry per key in the UNITS map. `feature` and `budget` come straight out
// of unit-identity-reference.md §2's per-unit spec (the "identity feature" and
// "pixel budget" columns); `budget` is the THIN dimension of that feature at
// zoom 1, which is the dimension that dies first when the renderer scales to
// ZMIN. `axis` says which way the spike protrudes, and so which profile
// measures it:
//   'h' — it breaks the outline sideways (a barrel, a missile, a rotor span,
//         a dog's spine): measured off the column profile, as the run of thin
//         columns beyond the body (unit-identity-reference.md §1.3's method).
//   'v' — it stands above the body (a crystal, coils, a raised gun, a tube):
//         measured off the row profile, the "crown" rule the audit validated
//         against the six real turret layers (audit §3b).
// A missing entry is a hard failure, not a skip: a silent gap is exactly the
// failure mode this gate exists to remove.
const SPIKES = {
  // ── Directorate infantry (reference §2.1)
  rifle:        { axis: 'v', budget: 3,   feature: 'grey pot helmet over a house torso block (no usable silhouette)' },
  rocket:       { axis: 'v', budget: 2.5, feature: 'shoulder missile tube, ~30° up, clearing the helmet by >=4 px' },
  rocketeer:    { axis: 'v', budget: 4,   feature: 'airborne: altitude offset + pack tanks behind the shoulders' },
  engineer:     { axis: 'v', budget: 3,   feature: 'inverted value — the only light-value soldier; toolbox at hand height' },
  dog:          { axis: 'h', budget: 4,   feature: 'quadruped: horizontal spine, aspect 1.4 against everyone else 0.45' },
  tanya:        { axis: 'h', budget: 2,   feature: 'two pistols out to the sides, breaking the outline >=2 px each' },
  cleg:         { axis: 'h', budget: 9,   feature: 'powered-suit shoulder line >=15 px + a long level rifle' },
  spy:          { axis: 'v', budget: 7,   feature: 'fedora brim >=7 px wide over an unbroken coat hem' },
  // ── Collective infantry (reference §2.2)
  conscript:    { axis: 'v', budget: 3,   feature: 'flat peaked cap over tan trousers (the GI twin; legs carry the read)' },
  flak:         { axis: 'v', budget: 2.5, feature: 'flak barrel raised 45-60°, 9-10 px of spike above the helmet' },
  teslatrooper: { axis: 'h', budget: 3,   feature: 'pauldrons — the widest infantry, shoulder line >=18 px' },
  ivan:         { axis: 'h', budget: 2,   feature: 'ushanka flaps breaking the head outline >=2 px each side' },
  desolator:    { axis: 'v', budget: 5,   feature: 'backpack tank above the shoulder line + a fat beam muzzle' },
  yuri:         { axis: 'v', budget: 4,   feature: 'bald dome over one unbroken coat hem — no leg split' },
  // ── Directorate vehicles / aircraft (reference §2.3)
  lancer:       { axis: 'h', budget: 2.2, feature: 'a 13 x 2.2 px gun barrel overhanging 24% of the flattest hull' },
  ifv:          { axis: 'v', budget: 8,   feature: 'a boxy turret >=45% of total height on a near-square body' },
  mirage:       { axis: 'v', budget: 6,   feature: 'a wide flat emitter housing proud of the deck, and NO long gun' },
  prismtank:    { axis: 'v', budget: 5,   feature: 'the upright prism crystal, >=10 px tall x >=5 px wide' },
  chronominer:  { axis: 'h', budget: 4,   feature: 'ribbed violet chrono drum for a nose; zero turret mass' },
  nighthawk:    { axis: 'h', budget: 2,   feature: 'tandem rotor discs — 1-2 px blade lines past the fuselage' },
  harrier:      { axis: 'h', budget: 5,   feature: 'a broad swept delta wing, >=5 px chord at the root' },
  hornet:       { axis: 'h', budget: 3,   feature: 'the smallest thing that flies — identity is size, not detail' },
  mcv:          { axis: 'v', budget: 4,   feature: 'amber folded crane boom on a slab works body; zero barrel' },
  destroyer:    { axis: 'v', budget: 5,   feature: 'a forward gun turret and an aft helipad on a 101 px hull' },
  aegis:        { axis: 'v', budget: 8,   feature: 'a vertical flat-panel radar face >=8x8 px, explicitly no barrel' },
  carrier:      { axis: 'h', budget: 4,   feature: 'a flat flight deck >=80% of length with 3 parked airframes' },
  dolphin:      { axis: 'v', budget: 3,   feature: 'a dorsal fin >=3 px above an organic back, no orthogonal edges' },
  lcraft:       { axis: 'h', budget: 4,   feature: 'an open bow ramp, a plane distinct from the deck' },
  // ── Collective vehicles / aircraft (reference §2.4)
  rhino:        { axis: 'h', budget: 3.5, feature: 'a gun 1.6x the Grizzly barrel thickness on a taller hull' },
  mammoth:      { axis: 'h', budget: 4,   feature: 'twin barrels >=19 px, visibly TWO — the only two-barrelled thing' },
  teslatank:    { axis: 'v', budget: 3,   feature: 'two coil columns >=9 px tall, gap >=5 px so the pair reads as two' },
  v3:           { axis: 'h', budget: 3,   feature: 'a white missile overhanging the truck >=5 px at the nose' },
  flaktrack:    { axis: 'v', budget: 3,   feature: 'a gun raised >=10 px off the bed of the only square vehicle' },
  warminer:     { axis: 'v', budget: 6,   feature: 'a >=6x6 turret on the bin shoulder — a harvester that shoots' },
  drone:        { axis: 'h', budget: 3,   feature: 'four splayed blade legs reaching >=4 px beyond a tiny core' },
  apc:          { axis: 'h', budget: 4,   feature: 'a continuous inflatable skirt round a house-hued open deck' },
  kirov:        { axis: 'v', budget: 4,   feature: 'mass — and a gondola separated below the envelope by >=4 px' },
  sub:          { axis: 'v', budget: 4,   feature: 'a conning tower — the only vertical mass on a 5.36-aspect hull' },
  seascorp:     { axis: 'v', budget: 3,   feature: 'the Flak Track gun on the fleet smallest armed hull' },
  dread:        { axis: 'v', budget: 10,  feature: 'two countable missile boxes >=10x10 px standing on the deck' },
  squid:        { axis: 'h', budget: 3,   feature: '>=4 tentacles resolvable at 3 px each; zero straight edges' },
};

// ── TARGETS ───────────────────────────────────────────────────────────────
// What unit-redesign-plan.md §0/§5 and unit-identity-reference.md §1 say the
// numbers should BE. The game does not meet these today; the gate ratchets the
// baseline toward them and prints the remaining gap every run so the debt stays
// visible instead of quietly becoming the new normal.
const TARGETS = {
  'peerVsSelf.total':            { want: 0,    dir: 'down', note: 'reference §1.2/§0 bar: no unit beaten by a peer' },
  'peerVsSelf.vehicle':          { want: 0,    dir: 'down', note: 'audit §2: 11 of 13 today' },
  'peerVsSelf.infantry':         { want: 0,    dir: 'down', note: 'audit §2: 11 of 14 today' },
  'peerVsSelf.naval':            { want: 0,    dir: 'down', note: 'audit §2: 8 of 10 today' },
  'peerVsSelf.air':              { want: 0,    dir: 'down', note: 'audit §2: 0 of 4 — the control that says this is real' },
  'iou.groundCombat.mean':       { want: 0.45, dir: 'down', note: 'plan §0 headline 0.679; 0.45 is the air groups 0.30 with slack for a shared ground plane' },
  'iou.vehicle.mean':            { want: 0.45, dir: 'down', note: 'as above, over all 13 ground vehicles' },
  'iou.infantry.mean':           { want: 0.55, dir: 'down', note: 'RA2 infantry share a silhouette by design (ref §1.2); colour carries them, so the ceiling is looser' },
  'iou.naval.mean':              { want: 0.45, dir: 'down', note: '' },
  'iou.air.mean':                { want: 0.45, dir: 'down', note: 'already met — the control group' },
  'iou.sameFactionOver75':       { want: 0,    dir: 'down', note: 'plan §5: no same-roster pair over the 0.75 ceiling' },
  'spike.belowFloor':            { want: 0,    dir: 'down', note: 'plan §2 option 1: every spike >=3.64 px at zoom 1 so it clears 2 px at ZMIN' },
  'spike.minThickAtZmin':        { want: SPIKE_FLOOR_ZMIN, dir: 'up', note: 'RA2 bottoms out at 2 px of thickness' },
  'spike.belowDeclaredBudget':   { want: 0,    dir: 'down', note: 'every unit meets its own §2 pixel budget' },
  'mass.groundCombatSpan':       { want: 2.04, dir: 'up',   note: "RA2's span over the NINE ground-combat vehicles this metric covers: Grizzly 54x23 -> Prism 59x43 = x2.04. The x6.8 originally written here was RA2's whole vehicle-AND-SHIP class (Terror Drone 21px -> Carrier 143px) applied to a metric that measures neither — a target-definition error, corrected 2026-09-04. We sit ABOVE RA2 deliberately: our renderer goes to 0.55x where RA2's never left 1.0x" },
  'mass.tightestBand6':          { want: 2.0,  dir: 'up',   note: 'six of nine ground combat vehicles sit inside a x1.38 band today (audit §5)' },
  // --- colour. Every metric above is computed off the ALPHA MASK, so none of
  // them can see a colour change at all: C2 raised the infantry remap by a
  // third and moved them by zero. For infantry that is the whole mechanism
  // (ref §1.2/§1.5 — seven of twelve RA2 troopers share a silhouette), so a
  // gate blind to colour cannot grade the work it exists to grade.
  'hue.infantryOwnerMean':       { want: 0.29, dir: 'up',   note: 'reference §1.4: RA2 puts 29-45% owner colour on infantry, as the torso block' },
  'hue.infantryBelowBudget':     { want: 0,    dir: 'down', note: "uniformed troopers under 20% owner colour. EXEMPT: dog (an animal — collar and harness only, ref §2.2) and tanya (RA2's own exception at 14.3%). The Spy is NOT exempt: a disguise argument is plausible but undocumented, so he stays visible as debt rather than quietly excused" },
  'hue.vehicleOwnerMean':        { want: 0.115, dir: 'up',  note: 'reference §1.4: RA2 vehicles 11.5-27%. Ours already sit inside it — this pins the budget so C3 stays a PLACEMENT change' },
  'hue.vehicleOwnerMax':         { want: 0.27, dir: 'down', note: 'the top of RA2 vehicle range; going over means C3 overshot into re-adding paint (plan §4)' },
  'hue.maxImpostor':             { want: 0.02, dir: 'down', note: "a FIXED colour sitting on the other owner's hue reads as their unit — the Conscript's #7d5148 trousers were 39% red" },
  'colour.infantry.meanDist':    { want: 0.45, dir: 'up',   note: 'mean pairwise hue-histogram distance between infantry kinds: what actually separates them' },
  // C5 ("ACCENT earns its name") had NO measurement at all until 2026-09-04,
  // which is why nine of thirteen ground vehicles could quietly settle on the
  // same near-neutral grey: the hue histogram only bins pixels at s > 0.12, so
  // a grey accent contributes nothing and two grey vehicles sit at distance ~0.
  // Every other metric in this file is computed off the alpha mask, so none of
  // them could see it either.
  //
  // The 0.45 target is BORROWED from the infantry metric above, not measured
  // off RA2 — no rip-derived vehicle figure exists, and inventing one would
  // repeat the `mass.groundCombatSpan` x6.8 mistake corrected earlier in this
  // file. Its job is to make C5's work stick under the ratchet, not to encode
  // an RA2 fact; if a vehicle number is ever measured from the sprites, replace
  // this and say so here.
  'colour.vehicle.meanDist':     { want: 0.45, dir: 'up',   note: 'mean pairwise hue-histogram distance between ground-vehicle kinds. C5: a fixed ACCENT that is near-neutral grey on nine of thirteen vehicles carries no identity, because it never enters the histogram at all' },
  // The mean above is carried by the three vehicles that DO have a chromatic
  // accent (both miners and the MCV), which is precisely why C5 could go
  // unnoticed: the average looks healthy while nine of thirteen vehicles sit at
  // a pairwise distance of 0.03-0.24 from each other. C5's claim is a COUNT,
  // so this counts it directly, off the un-normalised saturation of a unit's
  // own fixed colours.
  'colour.vehicleAchromatic':    { want: 0,    dir: 'down', note: "plan C5, made falsifiable: ground vehicles whose FIXED colours carry no hue — mean saturation of their non-remap pixels below " + ACHROMATIC + ". Seven of thirteen on 2026-09-04 (Grizzly .084, Flak Track .106, Mirage .115, IFV .121, V3 .127, Terror Drone .134, Apocalypse .135) against the three the plan named as chromatic (War Miner .280, Chrono Miner .252, MCV .183). EXEMPT: units the reference explicitly paints a neutral — see ACHROMATIC_EXEMPT. NOTE the target is 0 only for the unexempted set; do not force paint onto a unit RA2 keeps grey, cite the reference and exempt it instead" },
};

// ── the page under test, served from a throwaway loopback server ──────────
const SERVE = {
  '/rts.html':      [path.join(RTS, 'rts.html'), 'text/html'],
  '/gamescore.js':  [path.join(ROOT, 'shared', 'gamescore.js'), 'text/javascript'],
  '/vibe-modal.js': [path.join(ROOT, 'shared', 'vibe-modal.js'), 'text/javascript'],
};
function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rep) => {
      const hit = SERVE[req.url.split('?')[0]];
      if (!hit || !fs.existsSync(hit[0])) { rep.writeHead(404); return rep.end('no'); }
      rep.writeHead(200, { 'content-type': hit[1], 'cache-control': 'no-store' });
      rep.end(fs.readFileSync(hit[0]));
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}
function playwright() {
  try { return require('playwright'); }
  catch (e) { return require(path.join(ROOT, 'tests', 'e2e', 'node_modules', 'playwright')); }
}

// ── in-page extraction: composed exactly as drawUnit composes ─────────────
/* c8 ignore start */
function pageExtract() {
  const S = window.__rtsTest.spr(), U = window.__rtsTables.UNITS;
  const UPAD = 27;
  const recs = [], errors = [];

  // Mirror of drawUnit's layer stack for a healthy, idle, undisguised unit.
  function compose(d, art, face) {
    const uk = (d.bomb && d.air) ? 1.3 : 1;         // the Kirov's draw fudge
    const layers = [];
    if (Array.isArray(art)) {
      if (art.hull && art.turret) { layers.push(art.hull[face]); layers.push(art.turret[face]); }
      else if (art.lay) { const L = art.lay(); layers.push(L.hull[face]); layers.push(L.gond[face]); }
      else layers.push(art[face]);
    } else if (art.fr) {
      layers.push(art.fr('stand', face, 0));
    } else layers.push(art);
    const base = layers[0];
    const W = Math.round(base.w * uk), H = Math.round(base.h * uk);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    for (const s of layers) if (s) g.drawImage(s.c, 0, 0, s.w * uk, s.h * uk);
    return { g, W, H, uk };
  }

  // Owner colour, defined EMPIRICALLY. The palette is not exposed to the test
  // hook, and it does not need to be: bake the same unit as owner 0 and owner 1
  // and the pixels that CHANGE are, by construction, exactly the remap. That
  // also hands us each owner's real hue (the mean hue of its own changed
  // pixels), which is what catches a fixed drab colour impersonating an owner.
  function rgb2hs(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dv = mx - mn;
    let h = 0;
    if (dv) {
      if (mx === r) h = ((g - b) / dv + 6) % 6;
      else if (mx === g) h = (b - r) / dv + 2;
      else h = (r - g) / dv + 4;
      h *= 60;
    }
    return { h, s: mx ? dv / mx : 0, v: mx / 255 };
  }
  function hueGap(a, b) { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }

  for (const key of Object.keys(U)) {
    const d = U[key];
    const fk = d.fac || 'dir';
    const art = S.unit[0][fk][key];
    const artB = S.unit[1][fk][key];
    if (!art) { errors.push('no art for ' + key); continue; }
    for (let oct = 0; oct < 8; oct++) {
      const face = oct * 4;
      let cm;
      try { cm = compose(d, art, face); }
      catch (e) { errors.push(key + '@' + face + ' threw: ' + e); continue; }
      const id = cm.g.getImageData(0, 0, cm.W, cm.H).data;
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < cm.H; y++) for (let x = 0; x < cm.W; x++) {
        if (id[(y * cm.W + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      if (x1 < 0) { errors.push('EMPTY sprite ' + key + '@' + face); continue; }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      // one byte per pixel of the bbox: 0 or 1. Masks are all the metrics need.
      const m = new Uint8Array(bw * bh);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++)
        m[y * bw + x] = id[((y + y0) * cm.W + (x + x0)) * 4 + 3] > 8 ? 1 : 0;
      let bin = '';
      for (let i = 0; i < m.length; i += 0x8000) bin += String.fromCharCode.apply(null, m.subarray(i, i + 0x8000));
      // --- colour census, from the owner-0 vs owner-1 difference -----------
      let col = null;
      try {
        const cb = compose(d, artB, face);
        const ib = cb.g.getImageData(0, 0, cb.W, cb.H).data;
        let opaque = 0, remap = 0, ha = 0, hb = 0, hn = 0;
        const hist = new Float64Array(12);
        const px = [];
        for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
          const i = ((y + y0) * cm.W + (x + x0)) * 4;
          if (id[i + 3] <= 8) continue;
          opaque++;
          const dr = Math.abs(id[i] - ib[i]), dg = Math.abs(id[i + 1] - ib[i + 1]),
                db = Math.abs(id[i + 2] - ib[i + 2]);
          const changed = (dr + dg + db) > 24;
          const A = rgb2hs(id[i], id[i + 1], id[i + 2]);
          if (changed) {
            remap++;
            const B = rgb2hs(ib[i], ib[i + 1], ib[i + 2]);
            if (A.s > 0.15) { ha += A.h; hn++; }
            if (B.s > 0.15) { hb += B.h; }
          } else {
            px.push(A);
            if (A.s > 0.12) hist[Math.min(11, Math.floor(A.h / 30))] += A.s;
          }
        }
        const ownerHueA = hn ? ha / hn : 0, ownerHueB = hn ? hb / hn : 0;
        // A NON-remap pixel that sits on the OTHER owner's hue reads as that
        // player's unit. This is the Conscript's #7d5148 trousers: drab, fixed,
        // and 11 degrees off red — 39% "red" to anyone scanning by colour.
        let impostor = 0;
        for (const q of px) if (q.s > 0.25 && q.v > 0.15 && hueGap(q.h, ownerHueB) < 18) impostor++;
        let hs = 0; for (let k = 0; k < 12; k++) hs += hist[k];
        // CHROMA — the saturation the unit's own FIXED colours carry, per
        // opaque pixel. `hist` is normalised below, which throws this away, so
        // a vehicle painted entirely in greys and one painted in a real hue
        // look identical to every histogram metric. C5's claim ("nine of
        // thirteen ground vehicles picked a near-neutral grey") is a statement
        // about exactly this number, so it has to survive normalisation.
        col = { ownerPct: opaque ? remap / opaque : 0,
                impostorPct: opaque ? impostor / opaque : 0,
                chroma: opaque ? hs / opaque : 0,
                hist: Array.from(hist, (v) => (hs ? v / hs : 0)) };
      } catch (e) { errors.push(key + '@' + face + ' colour census threw: ' + e); }

      recs.push({
        key, name: d.name, cls: d.cls, fac: d.fac || null, air: !!d.air, nav: !!d.nav,
        oct, bw, bh, mask: btoa(bin), col,
      });
    }
  }
  return { recs, errors, dpr: window.devicePixelRatio, zoom: window.__rtsTest.zoom(),
           units: Object.keys(U).length };
}

// A real rendered frame, out of the live renderer — not the bake canvas.
function pageScene() {
  const T = window.__rtsTest;
  document.querySelectorAll('.show').forEach((e) => e.classList.remove('show'));
  document.body.classList.remove('atmenu');
  T.begin(7, 'normal', null, false, true);           // 5th arg: renderer ON
  const rows = [
    ['lancer', 'rhino', 'mirage', 'prismtank', 'teslatank', 'flaktrack'],
    ['mammoth', 'ifv', 'v3', 'chronominer', 'warminer', 'drone'],
    ['rifle', 'conscript', 'rocket', 'flak', 'engineer', 'tanya'],
    ['desolator', 'ivan', 'teslatrooper', 'cleg', 'spy', 'yuri'],
  ];
  const ox = 40, oy = 40; let n = 0;
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
    const u = T.spawn(rows[r][c], 0, ox + c * 3, oy + r * 3);
    if (u) { u.face = 12; u.tface = 12; n++; }       // one common bearing
  }
  T.centerOn(ox + 7, oy + 5);
  T.zoom(1);
  for (let i = 0; i < 3; i++) T.render();
  return { spawned: n, zoom: T.zoom() };
}
/* c8 ignore stop */

// ── mask maths (pure JS; no numpy, on purpose) ────────────────────────────
function decode(rec) {
  const raw = Buffer.from(rec.mask, 'base64');
  return { w: rec.bw, h: rec.bh, d: raw };
}
/** silhouette IoU with both masks centred on their bbox centre. */
function iou(A, B) {
  const H = Math.max(A.h, B.h) + 4, W = Math.max(A.w, B.w) + 4;
  const ay = (H - A.h) >> 1, ax = (W - A.w) >> 1;
  const by = (H - B.h) >> 1, bx = (W - B.w) >> 1;
  const canvas = new Uint8Array(W * H);
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++)
    if (A.d[y * A.w + x]) canvas[(y + ay) * W + (x + ax)] |= 1;
  for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++)
    if (B.d[y * B.w + x]) canvas[(y + by) * W + (x + bx)] |= 2;
  let inter = 0, union = 0;
  for (let i = 0; i < canvas.length; i++) { const v = canvas[i]; if (v) { union++; if (v === 3) inter++; } }
  return union ? inter / union : 0;
}
function mass(M) { let n = 0; for (let i = 0; i < M.d.length; i++) if (M.d[i]) n++; return n; }
function colProfile(M) {
  const p = new Int32Array(M.w);
  for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) if (M.d[y * M.w + x]) p[x]++;
  return p;
}
function rowProfile(M) {
  const p = new Int32Array(M.h);
  for (let y = 0; y < M.h; y++) { let n = 0; for (let x = 0; x < M.w; x++) if (M.d[y * M.w + x]) n++; p[y] = n; }
  return p;
}
function median(a) {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}
/**
 * The spike, by unit-identity-reference.md §1.3's own method: the BODY is the
 * run of profile entries at >= 55% of the profile's max (the rule audit §3b
 * validated against the six real turret layers); the SPIKE is the thin run that
 * protrudes past it. Returns the run's length along the spike, and the median
 * cross-extent — the "2 px of thickness" the floor is about.
 */
function spikeOf(M, axis) {
  const p = axis === 'h' ? colProfile(M) : rowProfile(M);
  let mx = 0; for (let i = 0; i < p.length; i++) if (p[i] > mx) mx = p[i];
  if (!mx) return { len: 0, thick: 0 };
  const cut = 0.55 * mx;
  let lo = -1, hi = -1;
  for (let i = 0; i < p.length; i++) if (p[i] >= cut) { if (lo < 0) lo = i; hi = i; }
  // 'v' (a crown) only counts what stands ABOVE the body — the row profile runs
  // top-down, so that is the leading run. 'h' takes whichever end protrudes further.
  const runs = axis === 'v'
    ? [[0, lo]]
    : [[0, lo], [hi + 1, p.length]];
  let best = { len: 0, thick: 0 };
  for (const [a, b] of runs) {
    const vals = [];
    for (let i = a; i < b; i++) if (p[i] > 0) vals.push(p[i]);
    if (vals.length > best.len) best = { len: vals.length, thick: median(vals) };
  }
  return best;
}

function groupOf(r) {
  if (r.nav) return 'naval';
  if (r.cls === 'i') return 'infantry';
  if (r.air) return 'air';
  return 'vehicle';
}
// audit §2's "ground combat vehicles" set: the ground vehicles a player reads
// in a fight — no MCV, no miners, no drone.
// Infantry that are SUPPOSED to carry little owner colour, with the reason.
// Anything not named here is measured, so an unjustified drab trooper shows up
// as debt instead of hiding behind an average.
const HUE_EXEMPT = new Set(['dog', 'tanya']);
// Vehicles whose FIXED colour the reference explicitly names as a neutral, so
// a grey reading is the spec being honoured rather than C5 debt. Keep this set
// as small as the evidence allows: an entry needs a sentence in
// unit-identity-reference.md naming the colour, not an argument that grey suits
// the unit. Today that is one sentence, §1.4's Grizzly:
//   "**Grizzly Tank** (blue owner): two discrete panels ... on a PALE SILVER body"
// Everything else on the field is debt until its own citation turns up.
const ACHROMATIC_EXEMPT = new Set(['lancer']);
const GROUND_COMBAT = ['lancer', 'rhino', 'mammoth', 'mirage', 'prismtank',
                       'teslatank', 'flaktrack', 'ifv', 'v3'];
const round = (v, n) => Math.round(v * 10 ** n) / 10 ** n;

function compute(recs) {
  const by = new Map(), meta = new Map();
  for (const r of recs) {
    by.set(r.key + '@' + r.oct, decode(r));
    if (!meta.has(r.key)) meta.set(r.key, r);
  }
  const keys = [...meta.keys()];
  const OCT = [0, 1, 2, 3, 4, 5, 6, 7];
  const M = (k, o) => by.get(k + '@' + o);
  const grp = {}; for (const k of keys) grp[k] = groupOf(meta.get(k));

  // per-unit basics
  const unit = {};
  for (const k of keys) {
    const ms = OCT.map((o) => mass(M(k, o)));
    const ws = OCT.map((o) => M(k, o).w), hs = OCT.map((o) => M(k, o).h);
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    unit[k] = {
      name: meta.get(k).name, group: grp[k], fac: meta.get(k).fac,
      mass: round(mean(ms), 0), bboxW: Math.max(...ws), bboxH: Math.max(...hs),
      aspect: round(mean(ws.map((w, i) => w / hs[i])), 3),
    };
  }
  // self-IoU across a unit's own 8 bearings
  for (const k of keys) {
    const v = [];
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) v.push(iou(M(k, i), M(k, j)));
    unit[k].selfIoU = round(v.reduce((a, b) => a + b, 0) / v.length, 4);
  }
  // pairwise IoU, within group only (cross-group pairs are not confusable in play)
  const pair = new Map();
  const pkey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const a = keys[i], b = keys[j];
    if (grp[a] !== grp[b]) continue;
    let s = 0; for (const o of OCT) s += iou(M(a, o), M(b, o));
    pair.set(pkey(a, b), s / 8);
  }
  const P = (a, b) => pair.get(pkey(a, b));

  // ── peer-vs-self: is a unit's best silhouette match a PEER, or itself at
  //    another bearing? No threshold to tune — audit §2's most diagnostic line.
  const peerVsSelf = { total: 0, vehicle: 0, infantry: 0, naval: 0, air: 0 };
  for (const k of keys) {
    const peers = keys.filter((j) => j !== k && grp[j] === grp[k]);
    if (!peers.length) continue;
    const beaten = peers.filter((j) => P(k, j) > unit[k].selfIoU);
    const best = peers.reduce((x, j) => (P(k, j) > P(k, x) ? j : x), peers[0]);
    unit[k].bestPeer = unit[best].name;
    unit[k].bestPeerIoU = round(P(k, best), 4);
    unit[k].peersBeatingSelf = beaten.length;
    unit[k].peers = peers.length;
    if (beaten.length) { peerVsSelf.total++; peerVsSelf[grp[k]]++; }
  }

  // ── pairwise IoU summaries
  const groups = ['vehicle', 'infantry', 'naval', 'air'];
  const ioum = {};
  const meanOf = (ks) => {
    const v = [];
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) v.push(P(ks[i], ks[j]));
    return { mean: round(v.reduce((a, b) => a + b, 0) / v.length, 4), pairs: v.length,
             max: round(Math.max(...v), 4), over75: v.filter((x) => x > 0.75).length };
  };
  for (const g of groups) ioum[g] = meanOf(keys.filter((k) => grp[k] === g));
  ioum.groundCombat = meanOf(GROUND_COMBAT);

  // same-faction pairs over the 0.75 ceiling. A unit with no `fac` is shared,
  // so it stands in BOTH rosters and pairs with everything in its group.
  const sameFac = (a, b) => !unit[a].fac || !unit[b].fac || unit[a].fac === unit[b].fac;
  let over = 0; const overList = [];
  for (const [k, v] of pair) {
    const [a, b] = k.split('|');
    if (v > 0.75 && sameFac(a, b)) { over++; overList.push({ a: unit[a].name, b: unit[b].name, iou: round(v, 4) }); }
  }
  overList.sort((x, y) => y.iou - x.iou);
  ioum.sameFactionOver75 = over;

  // ── the spike floor (plan §2)
  let below = 0, belowBudget = 0, worst = Infinity;
  const missing = keys.filter((k) => !SPIKES[k]);
  const orphan = Object.keys(SPIKES).filter((k) => !unit[k]);
  for (const k of keys) {
    const sp = SPIKES[k];
    if (!sp) continue;
    // The broadside is the bearing where the spike protrudes furthest; that is
    // where a unit is read (reference §1.6.3 licenses the head-on collapse).
    let best = { len: -1, thick: 0 };
    for (const o of OCT) { const s = spikeOf(M(k, o), sp.axis); if (s.len > best.len) best = s; }
    unit[k].spike = { axis: sp.axis, len: best.len, thick: round(best.thick, 2),
                      atZmin: round(best.thick * ZMIN, 2), budget: sp.budget, feature: sp.feature };
    if (best.thick < SPIKE_FLOOR) below++;
    if (best.thick < sp.budget) belowBudget++;
    if (best.thick * ZMIN < worst) worst = round(best.thick * ZMIN, 2);
  }
  if (!Number.isFinite(worst)) worst = 0;

  // ── the mass hierarchy (audit §5)
  const gc = GROUND_COMBAT.slice().sort((a, b) => unit[a].mass - unit[b].mass);
  const span = unit[gc[gc.length - 1]].mass / unit[gc[0]].mass;
  let tight = Infinity, tightAt = null;
  for (let i = 0; i + 6 <= gc.length; i++) {           // the tightest 6-unit band
    const r = unit[gc[i + 5]].mass / unit[gc[i]].mass;
    if (r < tight) { tight = r; tightAt = gc.slice(i, i + 6).map((k) => unit[k].name); }
  }

  // ── colour aggregates ────────────────────────────────────────────────────
  // Per UNIT, not per sprite: average each unit's census over its 8 bearings,
  // then aggregate across units, so a unit with an unusual facing cannot skew a
  // group. Sprites whose census failed are skipped rather than counted as zero.
  const colByUnit = {};
  for (const k of keys) {
    const cs = recs.filter((r) => r.key === k && r.col).map((r) => r.col);
    if (!cs.length) continue;
    const avg = (f) => cs.reduce((a, c) => a + f(c), 0) / cs.length;
    const hist = new Array(12).fill(0);
    for (const c of cs) for (let i = 0; i < 12; i++) hist[i] += c.hist[i] / cs.length;
    colByUnit[k] = { ownerPct: avg((c) => c.ownerPct), impostorPct: avg((c) => c.impostorPct),
                     chroma: avg((c) => c.chroma), hist };
  }
  const inf = keys.filter((k) => grp[k] === 'infantry' && colByUnit[k]);
  const veh = keys.filter((k) => grp[k] === 'vehicle' && colByUnit[k]);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const infOwner = inf.map((k) => colByUnit[k].ownerPct);
  const vehOwner = veh.map((k) => colByUnit[k].ownerPct);
  // Manhattan distance between normalised hue histograms, 0..2 -> report as is.
  // Two units whose fixed colours are the same family score ~0 here even when
  // their masks are wholly different, which is the ONLY way C3/C5's placement
  // work is visible to this gate.
  const histDist = (ks) => {
    const d = [], pairs = [];
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
      const a = colByUnit[ks[i]].hist, b = colByUnit[ks[j]].hist;
      let s = 0; for (let n = 0; n < 12; n++) s += Math.abs(a[n] - b[n]);
      d.push(s);
      pairs.push({ a: ks[i], b: ks[j], dist: round(s, 3) });
    }
    pairs.sort((x, y) => x.dist - y.dist);
    return { d, pairs };
  };
  const infD = histDist(inf), vehD = histDist(veh);
  const cd = infD.d, worstColourPairs = infD.pairs;
  const impostorAll = keys.filter((k) => colByUnit[k])
    .map((k) => ({ key: k, pct: colByUnit[k].impostorPct }))
    .sort((a, b) => b.pct - a.pct);

  return {
    metrics: {
      'peerVsSelf.total': peerVsSelf.total,
      'peerVsSelf.vehicle': peerVsSelf.vehicle,
      'peerVsSelf.infantry': peerVsSelf.infantry,
      'peerVsSelf.naval': peerVsSelf.naval,
      'peerVsSelf.air': peerVsSelf.air,
      'iou.groundCombat.mean': ioum.groundCombat.mean,
      'iou.vehicle.mean': ioum.vehicle.mean,
      'iou.infantry.mean': ioum.infantry.mean,
      'iou.naval.mean': ioum.naval.mean,
      'iou.air.mean': ioum.air.mean,
      'iou.sameFactionOver75': ioum.sameFactionOver75,
      'spike.belowFloor': below,
      'spike.minThickAtZmin': worst,
      'spike.belowDeclaredBudget': belowBudget,
      'mass.groundCombatSpan': round(span, 3),
      'mass.tightestBand6': round(tight, 3),
      'hue.infantryOwnerMean': round(mean(infOwner), 4),
      'hue.infantryBelowBudget': inf.filter((k) => !HUE_EXEMPT.has(k) && colByUnit[k].ownerPct < 0.20).length,
      'hue.vehicleOwnerMean': round(mean(vehOwner), 4),
      'hue.vehicleOwnerMax': round(Math.max(...vehOwner), 4),
      'hue.maxImpostor': round(impostorAll.length ? impostorAll[0].pct : 0, 4),
      'colour.infantry.meanDist': round(mean(cd), 4),
      'colour.vehicle.meanDist': round(mean(vehD.d), 4),
      'colour.vehicleAchromatic': veh.filter((k) => !ACHROMATIC_EXEMPT.has(k) && colByUnit[k].chroma < ACHROMATIC).length,
    },
    detail: {
      counts: { units: keys.length, sprites: recs.length,
                perGroup: Object.fromEntries(groups.map((g) => [g, keys.filter((k) => grp[k] === g).length])) },
      iouGroups: ioum,
      worstSameFactionPairs: overList.slice(0, 12),
      closestColourPairs: worstColourPairs.slice(0, 10),
      closestVehicleColourPairs: vehD.pairs.slice(0, 10),
      topImpostors: impostorAll.slice(0, 8).map((r) => ({ key: r.key, pct: round(r.pct, 4) })),
      ownerPctByUnit: Object.fromEntries(keys.filter((k) => colByUnit[k])
        .map((k) => [k, round(colByUnit[k].ownerPct, 4)])),
      chromaByUnit: Object.fromEntries(keys.filter((k) => colByUnit[k])
        .map((k) => [k, round(colByUnit[k].chroma, 4)])),
      tightestMassBand: tightAt,
      units: Object.fromEntries([...keys].sort().map((k) => [k, unit[k]])),
    },
    missing, orphan,
  };
}

// ── the ratchet's vocabulary ──────────────────────────────────────────────
// `dir` says which way is BETTER for a metric, so the gate can tell a
// regression ("worse than the baseline — fix it") from an improvement
// ("better — re-record the baseline so the gain sticks").
function dirOf(name) { return (TARGETS[name] && TARGETS[name].dir) || 'down'; }
function better(name, v, ref) { return dirOf(name) === 'down' ? v < ref : v > ref; }
function debtOf(name, v) {
  const t = TARGETS[name];
  if (!t) return null;
  const gap = t.dir === 'down' ? v - t.want : t.want - v;
  return gap > 1e-9 ? round(gap, 4) : 0;
}

async function measure(opts) {
  opts = opts || {};
  const pw = playwright();
  const srv = await serve();
  const port = srv.address().port;
  const b = await pw.chromium.launch();
  try {
    const p = await b.newPage({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 1 });
    const pageErrs = [];
    p.on('pageerror', (e) => pageErrs.push('pageerror: ' + e));
    p.on('console', (m) => { if (m.type() === 'error') pageErrs.push('console.error: ' + m.text()); });
    await p.goto(`http://127.0.0.1:${port}/rts.html`);
    await p.waitForFunction(() => !!window.__rts && !!window.__rtsTables && !!window.__rtsTest,
      null, { timeout: 30000 });

    const raw = await p.evaluate(pageExtract);
    // A live frame, and a look at it — headless numbers pass while the
    // renderer throws (plan §5).
    const scene = await p.evaluate(pageScene);
    await p.waitForTimeout(300);
    await p.evaluate(() => { for (let i = 0; i < 3; i++) window.__rtsTest.render(); });
    fs.mkdirSync(path.dirname(FRAME_PNG), { recursive: true });
    const el = await p.$('canvas');
    if (el) await el.screenshot({ path: FRAME_PNG });

    const out = compute(raw.recs);
    out.env = { dpr: raw.dpr, zoom: raw.zoom, ZMIN, spikeFloorAtZoom1: round(SPIKE_FLOOR, 2),
                units: raw.units, sprites: raw.recs.length,
                scene, framePng: path.relative(ROOT, FRAME_PNG) };
    out.bakeErrors = raw.errors;
    out.pageErrors = pageErrs;
    return out;
  } finally {
    await b.close();
    srv.close();
  }
}

function report(m) {
  const L = [];
  L.push('unit-art metrics — zoom 1, DPR 1, 8 bearings, composed as drawUnit composes');
  L.push(`  ${m.env.units} units / ${m.env.sprites} sprites; live frame -> ${m.env.framePng}`);
  L.push('');
  L.push('  metric                          measured    plan target     remaining debt');
  for (const [k, v] of Object.entries(m.metrics)) {
    const t = TARGETS[k];
    const gap = t ? (t.dir === 'down' ? v - t.want : t.want - v) : 0;
    L.push(`  ${k.padEnd(30)} ${String(v).padStart(8)}  ${t ? (t.dir === 'down' ? '<= ' : '>= ') + t.want : ''.padStart(8)}`.padEnd(64)
      + (t && gap > 1e-9 ? `debt ${round(gap, 4)}` : t ? 'MET' : ''));
  }
  return L.join('\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const jsonAt = argv.indexOf('--json');
  const m = await measure();
  if (m.bakeErrors.length) { console.error('BAKE ERRORS:', m.bakeErrors); process.exitCode = 1; }
  if (m.pageErrors.length) { console.error('PAGE ERRORS:', m.pageErrors); process.exitCode = 1; }
  if (m.missing.length) { console.error('UNITS with no SPIKES entry:', m.missing); process.exitCode = 1; }
  if (m.orphan.length) { console.error('SPIKES entries with no unit:', m.orphan); process.exitCode = 1; }
  console.log(report(m));
  const payload = {
    _: 'Recorded by apps/games/rts/tools/art-metrics.js — do not hand-edit except to '
     + 'RE-RECORD after a deliberate art improvement (node apps/games/rts/tools/art-metrics.js --record). '
     + '`metrics` is ratcheted by apps/games/rts/rts-art.test.js: a regression fails, and so does an '
     + 'improvement, which is what makes progress stick. `detail` is informational only.',
    recorded: new Date().toISOString().slice(0, 10),
    env: m.env, targets: TARGETS, metrics: m.metrics, detail: m.detail,
  };
  if (jsonAt >= 0 && argv[jsonAt + 1]) {
    fs.writeFileSync(argv[jsonAt + 1], JSON.stringify(payload, null, 2) + '\n');
    console.log('\nwrote ' + argv[jsonAt + 1]);
  }
  if (argv.includes('--record')) {
    fs.writeFileSync(BASELINE, JSON.stringify(payload, null, 2) + '\n');
    console.log('\nre-recorded ' + path.relative(ROOT, BASELINE));
  }
}

module.exports = { SPIKES, TARGETS, ZMIN, SPIKE_FLOOR, BASELINE, FRAME_PNG,
                    measure, report, compute, dirOf, better, debtOf };

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });

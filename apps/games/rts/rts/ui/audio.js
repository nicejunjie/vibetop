// Iron Frontier — ui/audio.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.









// ------------------------------------------------------------------- //
//  Audio — a synth kit, RA2's mixer rules, and an original score.
//
//  Nothing here is a sample. Every report, voice line and bar of music is
//  built at run time out of oscillators and one baked noise buffer, so the
//  page stays a single file with no assets and no licence problem.
//
//  The shape follows RA2's own sound engine (sound.ini):
//
//    Limit=     max concurrent instances of ONE sound. sound.ini caps most
//               explosions at 3 and PowerOn/PowerOff at 1 — that is what
//               stops a 40-tank battle from turning into white noise.
//    Priority=  lowest/low/normal/high/critical. When the mixer is full the
//               LOWEST-priority live voice is dropped for a higher one, and
//               a new low-priority sound is simply refused.
//    Range=     radius in cells at which the sound is inaudible; inside it
//               the gain falls off from the camera centre (sound.ini
//               Defaults Range=10). Sounds marked global (the nuke siren,
//               EVA, superweapon stings) ignore range and instead sit at
//               MinVolume or above, exactly like RA2's Type=GLOBAL.
//    Volume=    per-entry trim, 0..100 in RA2, 0..1 here.
//
//  Everything is scheduled against an explicit (ctx, out, t) triple rather
//  than the live context, which is what lets the audio harness re-render
//  any one sound into an OfflineAudioContext and measure its waveform.
// ------------------------------------------------------------------- //
var AC = null, master = null, BUS = null;

var soundOn = lsGet('vibetop:rts:sound') !== '0';

var musicOn = lsGet('vibetop:rts:music') !== '0';

function lsNum(k, d) { var v = parseFloat(lsGet(k)); return isNaN(v) ? d : Math.max(0, Math.min(1, v)); }

var vol = {
  sfx:   lsNum('vibetop:rts:vol:sfx', 0.9),
  voice: lsNum('vibetop:rts:vol:voice', 0.85),
  music: lsNum('vibetop:rts:vol:music', 0.45)
};

// The first gesture ANYWHERE starts audio. resumeAudio used to hang off
// eleven specific buttons, so a resumed or loaded match (and the front
// menu's own theme) stayed mute until the player happened to click the map.
try {
  document.addEventListener('pointerdown', function () { resumeAudio(); }, true);
  document.addEventListener('keydown', function () { resumeAudio(); }, true);
} catch (e) {}

function resumeAudio() {
  if (headless || (!soundOn && !musicOn)) return;   // music alone is enough of a reason
  try {
    if (!AC) {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      master = AC.createGain(); master.gain.value = 0.32; master.connect(AC.destination);
      BUS = {};
      ['sfx', 'voice', 'eva', 'music'].forEach(function (k) {
        var g = AC.createGain(); g.connect(master); BUS[k] = g;
      });
      applyVol();
    }
    if (AC.state === 'suspended') AC.resume();
    if (musicOn) MUS.start();
  } catch (e) { AC = null; }
}

function applyVol() {
  if (!BUS) return;
  BUS.sfx.gain.value = vol.sfx;
  BUS.voice.gain.value = vol.voice;
  BUS.eva.gain.value = Math.min(1, vol.voice * 1.15);   // EVA rides the voice slider a shade louder
  BUS.music.gain.value = musicOn ? vol.music : 0;
}

// ---- primitives ------------------------------------------------------ //
// One noise buffer per context, baked once and re-used by every burst: a
// fresh createBuffer per shot was the single biggest allocation in a
// 40-unit fight. Two seconds is longer than any effect, and each voice
// starts at a random offset so repeats do not phase-lock.
function nbuf(c) {
  if (c.__nb) return c.__nb;
  var n = Math.floor(c.sampleRate * 2), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  // Audio-only randomness: it never reaches the sim, so the seeded-RNG rule
  // that governs everything in G does not apply here.
  for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  c.__nb = b; return b;
}

function env(g, t, atk, dur, peak, hold) {
  peak = Math.max(0.0004, peak);
  g.gain.setValueAtTime(0.0002, t);
  g.gain.exponentialRampToValueAtTime(peak, t + Math.max(0.0006, atk));
  if (hold) g.gain.setValueAtTime(peak, t + Math.max(0.0006, atk) + hold);
  g.gain.exponentialRampToValueAtTime(0.0002, t + Math.max(dur, atk + 0.01));
}

// A filtered noise voice: the workhorse behind every report, explosion and
// mechanical clatter. f0->f1 sweeps the filter, which is what separates a
// rifle crack (high, fast) from a building collapse (low, long).
function nz(c, o, t, dur, v, f0, f1, q, ftype) {
  var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = nbuf(c); s.loop = true;
  try { s.playbackRate.value = 0.7 + Math.random() * 0.6; } catch (e) {}
  f.type = ftype || 'bandpass'; f.Q.value = q == null ? 1 : q;
  f.frequency.setValueAtTime(Math.max(30, f0), t);
  if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  env(g, t, dur * 0.06, dur, v);
  s.connect(f); f.connect(g); g.connect(o);
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.03);
  return g;
}

// An oscillator voice with an optional pitch sweep — tank cannons, sirens,
// Tesla whine, every musical note.
function op(c, o, t, f0, f1, dur, v, type, atk) {
  var s = c.createOscillator(), g = c.createGain();
  s.type = type || 'square';
  s.frequency.setValueAtTime(Math.max(20, f0), t);
  if (f1) s.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, atk == null ? dur * 0.05 : atk, dur, v);
  s.connect(g); g.connect(o);
  s.start(t); s.stop(t + dur + 0.03);
  return g;
}

// A short, hard transient. Real reports start with one; without it every
// synthesised gun sounds like a puff rather than a bang.
function clk(c, o, t, v, f) {
  return nz(c, o, t, 0.012, v, f || 2600, (f || 2600) * 0.35, 0.7, 'bandpass');
}

// One shared feedback delay per context, used as a send. It is what gives a
// Tesla bolt and a Grand Cannon their room; a per-shot reverb would cost
// more than every other node in the graph put together.
function verb(c, o) {
  if (c.__verb) return c.__verb;
  var d = c.createDelay(0.6), fb = c.createGain(), lp = c.createBiquadFilter(), snd = c.createGain();
  d.delayTime.value = 0.115; fb.gain.value = 0.34;
  lp.type = 'lowpass'; lp.frequency.value = 1700;
  snd.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(o);
  c.__verb = snd; return snd;
}

// ---- the sound table -------------------------------------------------- //
// One row per sound, in sound.ini's own terms. l = Limit (concurrent
// instances), p = Priority (0 lowest .. 4 critical), r = Range in cells
// (0 = global, heard anywhere at MinVolume or above), v = Volume trim.
var PRI = { lowest: 0, low: 1, normal: 2, high: 3, critical: 4 };

var MINVOL = 0.5;                 // sound.ini [Defaults] MinVolume=50

var MAXVOICE = 26;                // mixer size: past this the lowest priority is dropped

var SPEC = {
  // -- small arms and cannon (rules.ini Report=) --
  shot:     { l: 4, p: 1, r: 12, v: 0.55 },   // GIAttack
  mg:       { l: 3, p: 1, r: 12, v: 0.5 },    // PillboxAttack / SentryGunAttack / IFVAttack
  cannon:   { l: 3, p: 2, r: 16, v: 0.8 },    // GrizzlyTankAttack
  cannonh:  { l: 3, p: 2, r: 18, v: 0.95 },   // RhinoTankAttack
  cannonx:  { l: 2, p: 3, r: 20, v: 1.0 },    // ApocalypseAttackGround
  rocket:   { l: 3, p: 2, r: 16, v: 0.75 },   // GIRocketAttack / PatriotAttack
  harrier:  { l: 2, p: 2, r: 18, v: 0.8 },    // BlackEagleAttack / HarrierAttack
  v3:       { l: 2, p: 3, r: 22, v: 0.95 },   // V3RocketAttack
  flak:     { l: 3, p: 2, r: 16, v: 0.7 },    // FlakCannonAttack / FlakTrackAttackAir
  tesla:    { l: 2, p: 3, r: 18, v: 0.85 },   // TeslaCoilAttack
  // -- the navy (sound.ini DestroyerAttack / SubAttack / DolphinAttack /
  //    AegisAttack / DreadnoughtAttack / HornetAttack) --
  navgun:   { l: 2, p: 3, r: 22, v: 0.95 },   // DestroyerAttack — a 155 mm over water
  torp:     { l: 2, p: 2, r: 16, v: 0.7 },    // SubAttack — the tube blowing
  sonar:    { l: 2, p: 2, r: 14, v: 0.6 },    // DolphinAttack — a sonic zap
  depth:    { l: 2, p: 2, r: 16, v: 0.75 },   // ASWBomb going off under the surface
  sink:     { l: 2, p: 3, r: 24, v: 0.9 },    // SinkingSound=GenLargeWaterDie
  charge:   { l: 2, p: 2, r: 14, v: 0.55 },   // TeslaCoilPowerUp (art.ini:3014)
  teslainf: { l: 3, p: 2, r: 13, v: 0.6 },    // TeslaTroopAttack
  prism:    { l: 2, p: 3, r: 18, v: 0.8 },    // PrismTowerAttack / PrismTankAttack
  prismup:  { l: 2, p: 2, r: 14, v: 0.5 },
  gcannon:  { l: 1, p: 4, r: 30, v: 1.0 },    // ParisTowerAttack (Grand Cannon)
  kbomb:    { l: 2, p: 3, r: 22, v: 0.8 },    // KirovAttack
  deso:     { l: 2, p: 2, r: 14, v: 0.7 },    // DesolatorAttack
  psy:      { l: 2, p: 3, r: 16, v: 0.7 },    // YuriAttack / psychic blast
  cleg:     { l: 2, p: 3, r: 16, v: 0.7 },    // ChronoLegionAttack
  ivantick: { l: 3, p: 2, r: 10, v: 0.6 },    // IvanBombTick
  drone:    { l: 3, p: 1, r: 11, v: 0.55 },   // TerrorDroneAttack
  bark:     { l: 3, p: 1, r: 11, v: 0.6 },    // DogAttack
  bite:     { l: 2, p: 2, r: 10, v: 0.65 },
  squish:   { l: 2, p: 2, r: 11, v: 0.7 },    // InfantrySquish (CrushSound, 40x in rules.ini)
  // -- explosion families (sound.ini Explosion01..15, Limit=3) --
  boom1:    { l: 3, p: 2, r: 18, v: 0.7 },
  boom:     { l: 3, p: 3, r: 22, v: 0.9 },    // the medium family — the long-standing name
  boom3:    { l: 2, p: 3, r: 26, v: 1.0 },
  bldboom:  { l: 2, p: 4, r: 30, v: 1.0 },    // GenBuildingExplode
  die:      { l: 3, p: 1, r: 12, v: 0.6 },    // infantry die
  vdie:     { l: 3, p: 2, r: 16, v: 0.75 },   // GenVehicleDie
  // -- superweapons and weather (Type=GLOBAL in RA2) --
  nuke:     { l: 1, p: 4, r: 0, v: 1.0 },
  siren:    { l: 1, p: 4, r: 0, v: 0.8 },
  thunder:  { l: 3, p: 3, r: 0, v: 0.85 },
  wind:     { l: 1, p: 1, r: 0, v: 0.45 },
  chronofx: { l: 1, p: 4, r: 0, v: 0.75 },
  curtain:  { l: 1, p: 4, r: 0, v: 0.75 },
  swready:  { l: 1, p: 4, r: 0, v: 0.7 },
  // -- structures and economy --
  place:    { l: 2, p: 3, r: 0, v: 0.8 },
  make:     { l: 2, p: 1, r: 14, v: 0.45 },   // build-up hammer during MAKE
  built:    { l: 1, p: 4, r: 0, v: 0.7 },
  ready:    { l: 1, p: 4, r: 0, v: 0.6 },
  sell:     { l: 1, p: 3, r: 0, v: 0.8 },
  wrench:   { l: 2, p: 1, r: 12, v: 0.45 },
  powon:    { l: 1, p: 4, r: 0, v: 0.5 },     // rules.ini WorkingSound=PowerOn
  powoff:   { l: 1, p: 4, r: 0, v: 0.6 },     // NotWorkingSound=PowerOff
  lowpower: { l: 1, p: 4, r: 0, v: 0.55 },
  cash:     { l: 3, p: 1, r: 0, v: 0.6 },     // CreditTicks
  dump:     { l: 2, p: 1, r: 14, v: 0.6 },
  radaron:  { l: 1, p: 3, r: 0, v: 0.6 },
  radaroff: { l: 1, p: 3, r: 0, v: 0.6 },
  garrin:   { l: 2, p: 2, r: 12, v: 0.6 },
  repairifv: { l: 2, p: 1, r: 11, v: 0.45 },  // IFVRepair (the welding arm)
  garrout:  { l: 2, p: 2, r: 12, v: 0.6 },
  bridge:   { l: 1, p: 3, r: 26, v: 0.9 },
  crate:    { l: 1, p: 3, r: 0, v: 0.7 },
  promote:  { l: 1, p: 3, r: 0, v: 0.6 },
  // -- interface --
  click:    { l: 3, p: 1, r: 0, v: 0.5 },
  no:       { l: 1, p: 2, r: 0, v: 0.6 },
  evachime: { l: 1, p: 4, r: 0, v: 0.6 }
};

// rules.ini gives every weapon a Report=. The table is keyed by the
// SHOOTER because that is how rules.ini reads it: [RHINO] Primary=120mm ->
// [120mm] Report=RhinoTankAttack. Anything not listed falls back on its
// projectile kind, so a new unit is never silent.
var REPORT = {
  rifle: 'shot', conscript: 'shot', tanya: 'shot', spy: 'shot', engineer: 'shot',
  rocket: 'rocket', rocketeer: 'rocket', patriot: 'rocket',
  flak: 'flak', flaktrack: 'flak', flakcannon: 'flak',
  sentry: 'mg', sentrygun: 'mg', ifv: 'mg', warminer: 'mg',
  nighthawk: 'mg',                                  // [BlackHawkCannon] Report=BlackOpsAttack, a 20mm quad
  lancer: 'cannon', mirage: 'cannon', rhino: 'cannonh', mammoth: 'cannonx',
  harrier: 'harrier', kirov: 'kbomb', v3: 'v3', grandcannon: 'gcannon',
  tesla: 'tesla', teslatank: 'tesla', teslatrooper: 'teslainf',
  prism: 'prism', prismtank: 'prism',
  desolator: 'deso', yuri: 'psy', cleg: 'cleg', ivan: 'ivantick',
  drone: 'drone', dog: 'bite',
  // The navy. [DEST] Report=DestroyerAttack, [SUB] SubAttack, [DLPH]
  // DolphinAttack, [AEGIS] AegisAttack, [HYD] FlakTrackAttackGround,
  // [DRED] DreadnoughtAttack, [CARRIER]/[HORNET] HornetAttack.
  destroyer: 'navgun', sub: 'torp', dolphin: 'sonar', aegis: 'rocket',
  seascorp: 'flak', dread: 'v3', carrier: 'harrier', hornet: 'harrier',
  squid: 'bite'
};

// ---- the synths ------------------------------------------------------- //
// kind -> function(ctx, out, t). Each one is scheduled, never played, so
// the same code drives the live context and the offline renderer.
var PLAY = {
  // Small arms: a crack plus a short body. RA2's igiat1a/b/c differ only in
  // pitch, which is what the random playbackRate inside nz() reproduces.
  shot: function (c, o, t) { clk(c, o, t, 0.5, 3200); nz(c, o, t, 0.055, 0.3, 2000, 500, 1.4); },
  mg: function (c, o, t) {
    for (var i = 0; i < 3; i++) { clk(c, o, t + i * 0.045, 0.34, 2800); nz(c, o, t + i * 0.045, 0.04, 0.22, 1700, 600, 1.6); }
  },
  cannon: function (c, o, t) {
    clk(c, o, t, 0.7, 1400); op(c, o, t, 170, 55, 0.16, 0.35, 'square', 0.002);
    nz(c, o, t, 0.22, 0.4, 900, 140, 0.8, 'lowpass'); nz(c, verb(c, o), t, 0.2, 0.14, 700, 200, 0.9);
  },
  cannonh: function (c, o, t) {
    clk(c, o, t, 0.8, 1100); op(c, o, t, 130, 42, 0.24, 0.42, 'square', 0.002);
    nz(c, o, t, 0.34, 0.45, 700, 100, 0.7, 'lowpass'); nz(c, verb(c, o), t, 0.3, 0.2, 520, 150, 0.9);
  },
  cannonx: function (c, o, t) {
    // [APOC] two barrels: RA2 fires them a beat apart, and you hear it.
    PLAY.cannonh(c, o, t); PLAY.cannonh(c, o, t + 0.09);
    op(c, o, t, 62, 30, 0.5, 0.3, 'sine', 0.004);
  },
  rocket: function (c, o, t) {
    clk(c, o, t, 0.4, 900);
    nz(c, o, t, 0.5, 0.34, 420, 2600, 0.9);                    // the whoosh climbing away
    op(c, o, t, 260, 90, 0.18, 0.2, 'sawtooth', 0.004);
  },
  harrier: function (c, o, t) {
    nz(c, o, t, 0.55, 0.3, 700, 3000, 1.1); op(c, o, t, 340, 120, 0.22, 0.2, 'sawtooth', 0.004);
    nz(c, o, t + 0.02, 0.3, 0.18, 1800, 400, 1.0);
  },
  v3: function (c, o, t) {
    // A big solid motor lighting up, not a bang: 1.1 s of rising roar.
    nz(c, o, t, 1.1, 0.5, 220, 1500, 0.7, 'lowpass');
    op(c, o, t, 80, 190, 0.9, 0.28, 'sawtooth', 0.05);
    nz(c, verb(c, o), t, 0.8, 0.2, 500, 900, 0.8);
  },
  flak: function (c, o, t) {
    for (var i = 0; i < 4; i++) {
      var d = t + i * 0.062;
      clk(c, o, d, 0.5, 1800); nz(c, o, d, 0.09, 0.3, 1100, 260, 1.1, 'lowpass');
    }
  },
  // Tesla: a rising whine that snaps into a crackle, then rings in the delay.
  tesla: function (c, o, t) {
    op(c, o, t, 900, 240, 0.1, 0.22, 'sawtooth', 0.003);
    for (var i = 0; i < 7; i++) nz(c, o, t + i * 0.016 + Math.random() * 0.01, 0.05, 0.28 - i * 0.03, 4200 - i * 380, 900, 3.2);
    nz(c, verb(c, o), t, 0.28, 0.16, 2600, 700, 2.0);
  },
  charge: function (c, o, t) { op(c, o, t, 110, 900, 0.55, 0.2, 'sawtooth', 0.12); nz(c, o, t + 0.3, 0.25, 0.1, 3000, 6000, 4); },
  // ---- the navy -------------------------------------------------------
  // A naval rifle is a cannon with a long tail over open water: the same
  // crack, a deeper body, and the report coming back off the far shore.
  navgun: function (c, o, t) {
    clk(c, o, t, 0.85, 900); op(c, o, t, 120, 40, 0.34, 0.45, 'square', 0.003);
    nz(c, o, t, 0.5, 0.5, 700, 90, 0.75, 'lowpass');
    nz(c, verb(c, o), t + 0.05, 0.9, 0.24, 420, 110, 0.9);
  },
  // A torpedo tube: compressed air, then the screw winding up under water.
  torp: function (c, o, t) {
    nz(c, o, t, 0.22, 0.45, 2600, 500, 1.6);
    op(c, o, t + 0.06, 190, 460, 0.5, 0.13, 'sawtooth', 0.03);
    nz(c, o, t + 0.1, 0.6, 0.16, 900, 260, 0.9, 'lowpass');
  },
  // Sonic: one pure descending ping and its echo. Nothing percussive.
  sonar: function (c, o, t) {
    op(c, o, t, 1800, 620, 0.34, 0.2, 'sine', 0.02);
    op(c, verb(c, o), t + 0.16, 1200, 480, 0.4, 0.1, 'sine', 0.03);
  },
  // A depth charge: no crack at all, just a muffled thump and a swell.
  depth: function (c, o, t) {
    nz(c, o, t, 0.7, 0.6, 260, 55, 0.6, 'lowpass');
    op(c, o, t, 62, 34, 0.5, 0.35, 'sine', 0.01);
    nz(c, verb(c, o), t + 0.08, 0.8, 0.2, 300, 80, 0.8);
  },
  // Something big going under: tearing plate, then water closing over it.
  sink: function (c, o, t) {
    nz(c, o, t, 1.4, 0.4, 420, 120, 0.7, 'lowpass');
    op(c, o, t, 90, 34, 1.2, 0.22, 'sawtooth', 0.02);
    nz(c, verb(c, o), t + 0.5, 1.2, 0.26, 900, 200, 1.1);
  },
  teslainf: function (c, o, t) { op(c, o, t, 600, 200, 0.08, 0.18, 'sawtooth', 0.003); for (var i = 0; i < 4; i++) nz(c, o, t + i * 0.02, 0.04, 0.2, 3600 - i * 500, 1000, 3); },
  // Prism: a pure tone winding up, then the zap it collapses into.
  prism: function (c, o, t) {
    op(c, o, t, 520, 1900, 0.2, 0.2, 'sine', 0.06);
    nz(c, o, t + 0.18, 0.14, 0.3, 5200, 1200, 2.4);
    op(c, verb(c, o), t + 0.18, 2400, 700, 0.2, 0.14, 'sine', 0.002);
  },
  prismup: function (c, o, t) { op(c, o, t, 420, 1500, 0.5, 0.16, 'sine', 0.14); },
  gcannon: function (c, o, t) {
    clk(c, o, t, 0.9, 800); op(c, o, t, 95, 28, 0.6, 0.5, 'square', 0.003);
    nz(c, o, t, 0.9, 0.55, 500, 60, 0.6, 'lowpass'); nz(c, verb(c, o), t, 0.8, 0.3, 380, 90, 0.8);
  },
  kbomb: function (c, o, t) {
    nz(c, o, t, 0.45, 0.25, 1600, 300, 1.2);                   // the falling whistle
    PLAY.boom(c, o, t + 0.45);
  },
  deso: function (c, o, t) {
    // A rad beam: a low buzz under a Geiger stutter.
    op(c, o, t, 70, 58, 0.6, 0.22, 'square', 0.02);
    for (var i = 0; i < 12; i++) nz(c, o, t + i * 0.05 + Math.random() * 0.02, 0.02, 0.13, 5000, 3000, 6);
  },
  psy: function (c, o, t) {
    op(c, o, t, 300, 1500, 0.35, 0.16, 'sine', 0.09);
    op(c, o, t, 303, 1520, 0.35, 0.14, 'sine', 0.09);          // beating pair — the "wobble"
    nz(c, verb(c, o), t + 0.1, 0.4, 0.12, 900, 2600, 2.2);
  },
  cleg: function (c, o, t) {
    op(c, o, t, 1400, 260, 0.3, 0.18, 'sine', 0.004);
    op(c, o, t + 0.04, 900, 2200, 0.26, 0.12, 'triangle', 0.02);
    nz(c, verb(c, o), t, 0.35, 0.14, 3000, 600, 2.6);
  },
  ivantick: function (c, o, t) { clk(c, o, t, 0.5, 3400); op(c, o, t, 1800, 1200, 0.03, 0.14, 'square', 0.001); },
  drone: function (c, o, t) {
    for (var i = 0; i < 5; i++) { clk(c, o, t + i * 0.038, 0.4, 3600 - i * 300); nz(c, o, t + i * 0.038, 0.03, 0.18, 2400, 900, 3); }
  },
  bark: function (c, o, t) { op(c, o, t, 300, 170, 0.06, 0.3, 'sawtooth', 0.004); nz(c, o, t, 0.07, 0.3, 900, 300, 1.4); },
  bite: function (c, o, t) { PLAY.bark(c, o, t); nz(c, o, t + 0.05, 0.09, 0.3, 500, 160, 0.9, 'lowpass'); },
  squish: function (c, o, t) { nz(c, o, t, 0.13, 0.4, 700, 130, 0.6, 'lowpass'); op(c, o, t, 150, 60, 0.1, 0.14, 'triangle', 0.006); },
  // ---- explosion families. RA2 fires a named anim per size band; the
  // audio follows the same four bands, each a body plus a debris tail.
  boom1: function (c, o, t) {
    clk(c, o, t, 0.7, 1200); nz(c, o, t, 0.3, 0.5, 900, 90, 0.7, 'lowpass'); op(c, o, t, 120, 40, 0.24, 0.24, 'sawtooth', 0.003);
  },
  boom: function (c, o, t) {
    clk(c, o, t, 0.9, 900);
    nz(c, o, t, 0.55, 0.6, 800, 60, 0.6, 'lowpass'); op(c, o, t, 95, 30, 0.42, 0.32, 'sawtooth', 0.003);
    nz(c, verb(c, o), t, 0.5, 0.24, 400, 120, 0.8);
    for (var i = 0; i < 5; i++) nz(c, o, t + 0.16 + Math.random() * 0.5, 0.05, 0.1, 1800, 500, 2.4);   // debris
  },
  boom3: function (c, o, t) {
    PLAY.boom(c, o, t); op(c, o, t, 52, 22, 0.9, 0.36, 'sine', 0.005);
    nz(c, o, t + 0.05, 1.0, 0.3, 400, 45, 0.5, 'lowpass');
    for (var i = 0; i < 8; i++) nz(c, o, t + 0.2 + Math.random() * 0.9, 0.06, 0.12, 1500, 400, 2.2);
  },
  bldboom: function (c, o, t) {
    PLAY.boom3(c, o, t);
    nz(c, o, t + 0.3, 1.4, 0.32, 900, 120, 0.5, 'lowpass');    // the structure coming down
    for (var i = 0; i < 10; i++) nz(c, o, t + 0.35 + Math.random() * 1.1, 0.08, 0.14, 1100, 260, 1.8);
  },
  die: function (c, o, t) { nz(c, o, t, 0.16, 0.35, 1300, 260, 1.0); op(c, o, t, 240, 90, 0.13, 0.12, 'sawtooth', 0.006); },
  vdie: function (c, o, t) { PLAY.boom1(c, o, t); for (var i = 0; i < 4; i++) nz(c, o, t + 0.2 + Math.random() * 0.5, 0.06, 0.12, 1600, 400, 2.2); },
  // ---- superweapons ----
  nuke: function (c, o, t) {
    clk(c, o, t, 1.0, 600);
    op(c, o, t, 60, 18, 2.2, 0.5, 'sine', 0.006);
    nz(c, o, t, 2.6, 0.6, 700, 40, 0.5, 'lowpass');
    nz(c, verb(c, o), t, 2.4, 0.35, 300, 70, 0.7);
    op(c, o, t + 0.4, 34, 20, 2.6, 0.3, 'triangle', 0.3);      // the rumble that follows the flash
  },
  siren: function (c, o, t) {
    for (var i = 0; i < 3; i++) { op(c, o, t + i * 1.1, 420, 800, 0.5, 0.2, 'sawtooth', 0.2); op(c, o, t + i * 1.1 + 0.5, 800, 420, 0.5, 0.2, 'sawtooth', 0.05); }
  },
  thunder: function (c, o, t) {
    clk(c, o, t, 0.8, 5000);
    nz(c, o, t, 0.12, 0.55, 6000, 1200, 1.2);                  // the strike
    nz(c, o, t + 0.06, 1.6, 0.4, 700, 60, 0.55, 'lowpass');    // the roll
    nz(c, verb(c, o), t + 0.06, 1.4, 0.25, 350, 90, 0.7);
  },
  // The bed under a Lightning Storm: gusts, not a drone.
  wind: function (c, o, t) {
    nz(c, o, t, 1.4, 0.5, 260, 620, 0.8, 'lowpass');
    nz(c, o, t + 0.4, 1.0, 0.3, 700, 240, 0.7, 'lowpass');
  },
  chronofx: function (c, o, t) {
    op(c, o, t, 180, 2400, 0.7, 0.2, 'sine', 0.3); op(c, o, t, 182, 2380, 0.7, 0.16, 'triangle', 0.3);
    nz(c, verb(c, o), t + 0.4, 0.6, 0.16, 2000, 600, 2.4);
  },
  curtain: function (c, o, t) {
    op(c, o, t, 900, 90, 0.8, 0.24, 'sawtooth', 0.01);
    nz(c, o, t, 0.9, 0.3, 2400, 200, 1.0); nz(c, verb(c, o), t, 0.8, 0.2, 900, 180, 1.2);
  },
  swready: function (c, o, t) {
    [523, 784, 1046].forEach(function (f, i) { op(c, o, t + i * 0.11, f, 0, 0.3, 0.16, 'triangle', 0.006); });
    op(c, verb(c, o), t + 0.22, 1046, 0, 0.5, 0.1, 'sine', 0.01);
  },
  // ---- structures and economy ----
  place: function (c, o, t) { nz(c, o, t, 0.22, 0.5, 500, 70, 0.6, 'lowpass'); op(c, o, t, 150, 55, 0.2, 0.22, 'square', 0.003); },
  make: function (c, o, t) {
    // The build-up: two hammer strikes over a crane's servo whine.
    op(c, o, t, 260, 190, 0.5, 0.09, 'sawtooth', 0.09);
    clk(c, o, t + 0.05, 0.5, 2400); nz(c, o, t + 0.05, 0.09, 0.24, 1400, 300, 1.4);
    clk(c, o, t + 0.34, 0.4, 2200); nz(c, o, t + 0.34, 0.08, 0.2, 1200, 280, 1.4);
  },
  built: function (c, o, t) { [392, 523, 659].forEach(function (f, i) { op(c, o, t + i * 0.09, f, 0, 0.26, 0.16, 'triangle', 0.005); }); },
  ready: function (c, o, t) { op(c, o, t, 660, 0, 0.1, 0.16, 'square', 0.004); op(c, o, t + 0.08, 990, 0, 0.14, 0.16, 'square', 0.004); },
  sell: function (c, o, t) {
    op(c, o, t, 1400, 0, 0.05, 0.18, 'square', 0.002); op(c, o, t + 0.05, 1900, 0, 0.06, 0.15, 'square', 0.002);   // the till
    nz(c, o, t + 0.12, 0.7, 0.35, 800, 90, 0.55, 'lowpass');                                                        // and the walls coming down
    for (var i = 0; i < 6; i++) nz(c, o, t + 0.15 + Math.random() * 0.55, 0.06, 0.12, 1200, 300, 2.0);
  },
  wrench: function (c, o, t) { for (var i = 0; i < 3; i++) { clk(c, o, t + i * 0.09, 0.4, 3000 - i * 200); op(c, o, t + i * 0.09, 1500, 900, 0.05, 0.1, 'square', 0.002); } },
  powon: function (c, o, t) { op(c, o, t, 60, 120, 0.6, 0.18, 'sawtooth', 0.2); op(c, o, t, 90, 180, 0.6, 0.1, 'triangle', 0.2); },
  powoff: function (c, o, t) { op(c, o, t, 130, 38, 0.9, 0.2, 'sawtooth', 0.02); op(c, o, t, 195, 55, 0.9, 0.1, 'triangle', 0.02); },
  lowpower: function (c, o, t) { for (var i = 0; i < 2; i++) op(c, o, t + i * 0.34, 300, 240, 0.24, 0.16, 'square', 0.01); },
  cash: function (c, o, t) { op(c, o, t, 880, 1320, 0.08, 0.16, 'sine', 0.002); },
  dump: function (c, o, t) {
    op(c, o, t, 90, 60, 0.5, 0.12, 'square', 0.05);                                    // the hopper motor
    nz(c, o, t + 0.1, 0.6, 0.32, 2200, 500, 1.1);                                      // ore pouring
  },
  radaron: function (c, o, t) { op(c, o, t, 220, 660, 0.3, 0.14, 'sine', 0.06); op(c, o, t + 0.16, 880, 0, 0.2, 0.1, 'sine', 0.004); },
  radaroff: function (c, o, t) { op(c, o, t, 660, 180, 0.4, 0.14, 'sine', 0.01); },
  garrin: function (c, o, t) { nz(c, o, t, 0.16, 0.3, 1600, 400, 1.2); op(c, o, t + 0.1, 300, 460, 0.12, 0.1, 'square', 0.004); },
  // IFVRepair: an arc welder — a buzzing crackle, not a shot.
  repairifv: function (c, o, t) {
    for (var i = 0; i < 5; i++) nz(c, o, t + i * 0.045, 0.05, 0.16, 3400, 900, 2.2);
    op(c, o, t, 120, 96, 0.24, 0.05, 'sawtooth', 0.005);
  },
  garrout: function (c, o, t) { op(c, o, t, 460, 300, 0.12, 0.1, 'square', 0.004); nz(c, o, t + 0.06, 0.16, 0.28, 1400, 380, 1.2); },
  bridge: function (c, o, t) {
    op(c, o, t, 70, 26, 1.2, 0.3, 'sawtooth', 0.01);
    nz(c, o, t, 1.6, 0.45, 900, 70, 0.5, 'lowpass');
    for (var i = 0; i < 9; i++) nz(c, o, t + 0.1 + Math.random() * 1.2, 0.09, 0.16, 1000, 240, 1.8);
  },
  crate: function (c, o, t) { [659, 880, 1174].forEach(function (f, i) { op(c, o, t + i * 0.07, f, 0, 0.2, 0.14, 'sine', 0.004); }); },
  promote: function (c, o, t) { [523, 659, 784].forEach(function (f, i) { op(c, o, t + i * 0.09, f, 0, 0.22, 0.15, 'square', 0.004); }); op(c, verb(c, o), t + 0.18, 784, 0, 0.4, 0.08, 'triangle', 0.01); },
  click: function (c, o, t) { op(c, o, t, 420, 0, 0.035, 0.12, 'square', 0.002); },
  no: function (c, o, t) { op(c, o, t, 180, 120, 0.1, 0.16, 'sawtooth', 0.003); },
  evachime: function (c, o, t) { op(c, o, t, 784, 0, 0.16, 0.14, 'sine', 0.006); op(c, o, t + 0.13, 1046, 0, 0.24, 0.12, 'sine', 0.006); }
};

// ---- the mixer -------------------------------------------------------- //
// Long sounds need a length so the voice slot frees itself; everything else
// is short enough that the default covers it.
var DUR = { v3: 1.6, nuke: 3.2, siren: 3.6, thunder: 2.0, bldboom: 2.4, boom3: 1.5,
            bridge: 2.0, sell: 1.0, kbomb: 1.2, wind: 1.5, gcannon: 1.2, charge: 0.7, make: 0.7,
            dump: 0.8, curtain: 1.0, chronofx: 1.2, swready: 0.8, powon: 0.7, powoff: 1.0 };

var live = [];               // the voices in flight, for Limit and Priority

var sfxAt = {};              // the 70 ms same-sound throttle, unchanged

var aStat = { calls: 0, played: 0, dropped: 0, ms: 0 };

var aLog = [];               // ring of what actually played — the harness reads this

function prune(now) { for (var i = live.length - 1; i >= 0; i--) if (live[i].end <= now) live.splice(i, 1); }

// RA2's rule, in order: a sound already at its Limit is simply refused (it
// never steals from itself, which is why three explosions never become
// thirty); a full mixer drops the lowest-priority voice, and only for a
// strictly higher one.
function alloc(kind, sp, now, dur, node) {
  prune(now);
  var i, same = 0, lo = -1;
  for (i = 0; i < live.length; i++) {
    if (live[i].kind === kind) same++;
    if (lo < 0 || live[i].pri < live[lo].pri) lo = i;
  }
  if (same >= sp.l) return false;
  if (live.length >= MAXVOICE) {
    if (lo < 0 || live[lo].pri >= sp.p) return false;
    try { live[lo].g.gain.cancelScheduledValues(AC.currentTime); live[lo].g.gain.setTargetAtTime(0, AC.currentTime, 0.01); } catch (e) {}
    live.splice(lo, 1);
  }
  live.push({ kind: kind, pri: sp.p, end: now + dur * 1000, g: node });
  return true;
}

// Range in cells from the camera centre, on the isometric metric (a cell is
// TW px across and TH px down, so vertical distance counts double).
function distGain(sp, gx, gy) {
  if (gx == null || gy == null) return 1;
  // Positions arrive in GRID cells, the way everything in G carries them;
  // project them the way the renderer does, then measure in cells so
  // sound.ini's Range numbers mean what they mean in RA2.
  var dx = worldX(gx, gy) - cam.x, dy = (worldY(gx, gy) - cam.y) * (TW / TH);
  var cells = Math.sqrt(dx * dx + dy * dy) / (TW * 0.7071);
  var r = sp.r || 40;
  if (cells >= r) return sp.r ? 0 : MINVOL;      // Type=GLOBAL keeps MinVolume; a local sound goes silent
  var k = cells <= r * 0.3 ? 1 : 1 - (cells - r * 0.3) / (r * 0.7);
  return sp.r ? k : Math.max(MINVOL, k);
}

// The one entry point. `x`/`y` are GRID CELLS (distGain measures them
// against the camera in cells); omit them for an interface or global sound.
function sfx(kind, x, y) {
  if (headless || !soundOn || !AC || !BUS) return false;
  var sp = SPEC[kind], fn = PLAY[kind];
  if (!sp || !fn) return false;
  var t0 = performance.now();
  aStat.calls++;
  var now = t0;
  if (sfxAt[kind] && now - sfxAt[kind] < 70) { aStat.dropped++; return false; }
  var dg = distGain(sp, x, y);
  if (dg <= 0.004) { aStat.dropped++; return false; }
  var dur = DUR[kind] || 0.4;
  try {
    var g = AC.createGain();
    g.gain.value = sp.v * dg;
    g.connect(BUS.sfx);
    if (!alloc(kind, sp, now, dur, g)) { try { g.disconnect(); } catch (e) {} aStat.dropped++; return false; }
    sfxAt[kind] = now;
    fn(AC, g, AC.currentTime + 0.002);
    // A weapon report near the camera is exactly what "combat is close"
    // means, so the music's intensity layer rides on it for free.
    if (sp.p >= 2 && sp.r && dg > 0.35) MUS.heat(dg);
    aStat.played++;
    aLog.push(kind); if (aLog.length > 96) aLog.shift();
  } catch (e) { return false; }
  aStat.ms += performance.now() - t0;
  return true;
}

// Kept for the two call sites outside sfx() and for anything that wants a
// bare tone; the old signatures still work.
function tone(freq, dur, type, v, to) { if (soundOn && AC && !headless) try { op(AC, BUS.sfx, AC.currentTime, freq, to || 0, dur, v == null ? 0.2 : v, type || 'square'); } catch (e) {} }

// ------------------------------------------------------------------- //
//  Unit voices — a radio, not a speech synthesiser.
//
//  RA2's acknowledgements are recorded lines; the browser's TTS was a poor
//  stand-in (a different voice on every OS, silent until getVoices() warms
//  up, and no way to route it through a mixer). What replaces it is the
//  radio itself: a formant-filtered burst per syllable, band-limited to a
//  field radio's 400-2900 Hz, clipped by a waveshaper and topped and
//  tailed with a squelch click. You do not hear words; you hear the
//  cadence and the timbre, and after a minute you know a Conscript's
//  double-grunt from Tanya's clipped two-syllable reply.
// ------------------------------------------------------------------- //
// Syllable patterns: [semitone offset, milliseconds]. Cadence carries the
// meaning — a select is short and level, a move falls away, an attack
// rises and clips off.
var VOXPAT = [
  [[0, 130], [3, 150]],                       // 0  two beats, lifting     (select)
  [[0, 110], [0, 130]],                       // 1  flat double            (select)
  [[2, 100], [0, 90], [-3, 200]],             // 2  three, falling         (move)
  [[0, 90], [-2, 170]],                       // 3  short, falling         (move)
  [[0, 80], [2, 80], [0, 90], [-2, 180]],     // 4  four beats, rolling    (move)
  [[0, 120], [5, 210]],                       // 5  lifting and holding    (move/select)
  [[3, 90], [5, 110], [7, 130]],              // 6  climbing               (attack)
  [[7, 80], [5, 70], [7, 190]],               // 7  snapped, high          (attack)
  [[0, 70], [7, 100], [7, 70]],               // 8  bark-and-hold          (attack)
  [[0, 180], [0, 100], [-4, 240]],            // 9  long, resigned         (deploy)
  [[-2, 150], [0, 160], [3, 150]],            // 10 measured               (deploy/harvest)
  [[0, 100], [-3, 120], [0, 220]],            // 11 grumbling              (harvest)
  [[5, 70], [0, 130]],                        // 12 clipped                (attack/select)
  [[0, 200], [4, 120], [0, 130], [4, 260]]    // 13 sing-song              (rare/elite)
];

// Per unit kind: f = carrier pitch, b = formant brightness (a bigger man is
// darker), r = rasp. Then the pattern indices each order may draw from.
var VOX = {
  rifle:       { f: 132, b: 1.05, r: 0.22, s: [0, 1], m: [2, 3, 4], a: [6, 7] },
  conscript:   { f: 104, b: 0.82, r: 0.42, s: [1, 12], m: [3, 2], a: [8, 6] },
  rocket:      { f: 140, b: 1.10, r: 0.20, s: [0, 5], m: [2, 4], a: [6, 12] },
  flak:        { f: 100, b: 0.80, r: 0.46, s: [1, 12], m: [3, 4], a: [8, 7] },
  rocketeer:   { f: 176, b: 1.25, r: 0.30, s: [5, 0], m: [4, 2], a: [7, 6] },
  harrier:     { f: 158, b: 1.20, r: 0.34, s: [0, 5], m: [2, 4], a: [7, 12] },
  kirov:       { f: 78,  b: 0.70, r: 0.52, s: [9, 1], m: [9, 10], a: [8, 6] },
  lancer:      { f: 124, b: 1.00, r: 0.26, s: [0, 12], m: [2, 3], a: [6, 8] },
  rhino:       { f: 96,  b: 0.80, r: 0.44, s: [1, 0], m: [3, 4], a: [8, 7] },
  mammoth:     { f: 84,  b: 0.72, r: 0.50, s: [9, 1], m: [4, 3], a: [8, 6] },
  mirage:      { f: 128, b: 1.02, r: 0.22, s: [12, 0], m: [3, 2], a: [7, 6] },
  prismtank:   { f: 136, b: 1.15, r: 0.18, s: [0, 5], m: [2, 4], a: [6, 13] },
  teslatank:   { f: 98,  b: 0.84, r: 0.46, s: [1, 12], m: [3, 4], a: [8, 7] },
  flaktrack:   { f: 102, b: 0.82, r: 0.44, s: [1, 0], m: [4, 3], a: [8, 6] },
  ifv:         { f: 138, b: 1.08, r: 0.24, s: [0, 1], m: [2, 4], a: [6, 12] },
  v3:          { f: 92,  b: 0.76, r: 0.48, s: [9, 1], m: [10, 3], a: [8, 6] },
  engineer:    { f: 150, b: 1.18, r: 0.16, s: [1, 0], m: [3, 2], a: [12], d: [10, 9] },
  tanya:       { f: 196, b: 1.34, r: 0.14, s: [12, 0], m: [3, 5], a: [7, 13] },
  teslatrooper:{ f: 90,  b: 0.78, r: 0.54, s: [1, 9], m: [3, 4], a: [8, 7] },
  ivan:        { f: 106, b: 0.86, r: 0.44, s: [1, 13], m: [3, 2], a: [8, 13] },
  desolator:   { f: 94,  b: 0.74, r: 0.52, s: [9, 1], m: [3, 10], a: [8, 6] },
  yuri:        { f: 112, b: 0.90, r: 0.36, s: [13, 5], m: [10, 2], a: [13, 6] },
  cleg:        { f: 144, b: 1.22, r: 0.20, s: [5, 0], m: [2, 4], a: [6, 13] },
  spy:         { f: 152, b: 1.16, r: 0.14, s: [12, 1], m: [3, 2], a: [12] },
  drone:       { f: 0,   b: 1.0,  r: 0,    s: [], m: [], a: [] },   // a Terror Drone clatters, it does not talk
  dog:         { f: 0,   b: 1.0,  r: 0,    s: [], m: [], a: [] },   // [DOG] VoiceMove=DogMove: a bark
  mcv:         { f: 110, b: 0.92, r: 0.30, s: [1, 0], m: [4, 2], a: [], d: [9, 10] },
  chronominer: { f: 134, b: 1.02, r: 0.26, s: [1, 0], m: [3, 2], a: [], h: [10, 11] },
  warminer:    { f: 106, b: 0.78, r: 0.44, s: [1, 12], m: [3, 4], a: [8], h: [11, 10] },
  // [SHAD] VoiceSelect=BlackOpsSelect — clipped, low, and unhurried.
  nighthawk:   { f: 118, b: 1.06, r: 0.30, s: [0, 12], m: [2, 4], a: [7, 6] },
  // [SAPC] VoiceSelect=GenSovWaterSelect — the landing-craft crew.
  apc:         { f: 88,  b: 0.86, r: 0.40, s: [1, 0], m: [4, 3], a: [] },
  // The navy. [DEST]/[AEGIS]/[CARRIER]/[LCRF] all use GenAllWaterSelect,
  // [SUB]/[HYD]/[DRED] GenSovWaterSelect — one bridge crew per side, but
  // each hull is a different watch, so each gets its own pitch.
  destroyer:   { f: 122, b: 0.98, r: 0.28, s: [0, 1], m: [2, 4], a: [6, 7] },
  aegis:       { f: 130, b: 1.12, r: 0.24, s: [0, 5], m: [4, 2], a: [7, 12] },
  carrier:     { f: 116, b: 0.96, r: 0.32, s: [1, 0], m: [2, 3], a: [6, 12] },
  lcraft:      { f: 126, b: 1.04, r: 0.30, s: [0, 12], m: [3, 4], a: [] },
  hornet:      { f: 162, b: 1.24, r: 0.34, s: [5, 0], m: [2, 4], a: [7, 6] },
  sub:         { f: 86,  b: 0.74, r: 0.50, s: [1, 9], m: [3, 10], a: [8, 6] },
  seascorp:    { f: 100, b: 0.86, r: 0.44, s: [1, 12], m: [4, 3], a: [8, 7] },
  dread:       { f: 80,  b: 0.68, r: 0.54, s: [9, 1], m: [10, 3], a: [8, 6] },
  // [DLPH] VoiceSelect=DolphinSelect, [SQD] SquidSelect — neither talks.
  dolphin:     { f: 0,   b: 1.0,  r: 0,    s: [], m: [], a: [] },
  squid:       { f: 0,   b: 1.0,  r: 0,    s: [], m: [], a: [] }
};

// The radio band, built once per context: high-pass, clip, low-pass. Every
// voice line in the game shares this one chain.
function radio(c, o) {
  if (c.__radio) return c.__radio;
  var hp = c.createBiquadFilter(), ws = c.createWaveShaper(), lp = c.createBiquadFilter(), g = c.createGain();
  hp.type = 'highpass'; hp.frequency.value = 420;
  lp.type = 'lowpass'; lp.frequency.value = 2900;
  var n = 512, cv = new Float32Array(n);
  for (var i = 0; i < n; i++) { var x = i / (n - 1) * 2 - 1; cv[i] = Math.tanh(x * 2.6); }
  ws.curve = cv; ws.oversample = '2x';
  g.gain.value = 0.9;
  hp.connect(ws); ws.connect(lp); lp.connect(g); g.connect(o);
  c.__radio = hp; return hp;
}

// One acknowledgement: squelch open, the syllables, squelch closed.
function voxLine(c, o, t, f0, bright, rasp, pat, stretch) {
  var band = radio(c, o), at = t + 0.01;
  nz(c, band, t, 0.02, 0.5 + rasp * 0.4, 2200, 900, 1.2);           // the mic keying up
  for (var i = 0; i < pat.length; i++) {
    var d = pat[i][1] / 1000 * (stretch || 1);
    var f = f0 * Math.pow(2, pat[i][0] / 12);
    var s = c.createOscillator(), g = c.createGain();
    var f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter();
    s.type = 'sawtooth';
    s.frequency.setValueAtTime(f, at);
    s.frequency.linearRampToValueAtTime(f * 0.94, at + d);           // every syllable sags a little
    f1.type = 'bandpass'; f1.Q.value = 4.5; f1.frequency.value = 560 * bright;
    f2.type = 'bandpass'; f2.Q.value = 5.5; f2.frequency.value = 1480 * bright;
    env(g, at, 0.016, d, 0.34 - rasp * 0.06, d * 0.4);
    s.connect(f1); f1.connect(f2); f2.connect(g); g.connect(band);
    s.start(at); s.stop(at + d + 0.02);
    nz(c, band, at, 0.014, 0.16 + rasp * 0.2, 1900 * bright, 800, 1.6);   // the consonant
    at += d + 0.028;
  }
  nz(c, band, at + 0.01, 0.05, 0.3 + rasp * 0.3, 1500, 3200, 1.0);  // squelch tail
  return at - t + 0.08;
}

var ackAt = 0;

// `kind` is RA2's VoiceSelect / VoiceMove / VoiceAttack / deploy / harvest.
function unitAck(units, kind) {
  if (headless || !soundOn || !AC || !BUS || !G) return false;
  var now = performance.now();
  var gap = kind === 'select' ? 900 : 2500;      // selecting is constant; RA2 lets it talk more often
  if (now - ackAt < gap) return false;
  var u = null;
  for (var i = 0; i < units.length; i++) if (units[i].p === ME && !units[i].dead) { u = units[i]; break; }
  if (!u) return false;
  ackAt = now;
  var d = UNITS[u.type];
  if (d.dog) { sfx('bark', u.x, u.y); return true; }
  if (u.drone || u.type === 'drone') { sfx('drone', u.x, u.y); return true; }
  var vx = VOX[u.type] || VOX.rifle;
  var key = kind === 'select' ? 's' : kind === 'attack' ? 'a' : kind === 'deploy' ? 'd' : kind === 'harvest' ? 'h' : 'm';
  var pats = vx[key];
  if (!pats || !pats.length) pats = vx.m;        // no line for this order: fall back to the move set, as RA2 does
  if (!pats || !pats.length) return false;
  // The variant rotates with the match clock, so repeated orders to the
  // same unit do not repeat the same line.
  var pat = VOXPAT[pats[(G.tick >> 5) % pats.length]];
  var sov = facOf(G, u.p) === 'col';
  // RA2's veterans and elites answer in their own voice set; ours is one
  // synth, so rank lowers and firms the line — a veteran 4% down, an elite 8%.
  var rk = u.rank || 0, rkf = rk >= 2 ? 0.92 : rk === 1 ? 0.96 : 1;
  try {
    var g = AC.createGain(); g.gain.value = 0.95; g.connect(BUS.voice);
    voxLine(AC, g, AC.currentTime + 0.002,
            vx.f * (sov ? 0.86 : 1) * rkf, vx.b * (sov ? 0.94 : 1), Math.min(0.75, vx.r + (sov ? 0.12 : 0)),
            pat, sov ? 1.12 : 1);
    aLog.push('vox:' + u.type + ':' + kind); if (aLog.length > 96) aLog.shift();
  } catch (e) { return false; }
  return true;
}

// ------------------------------------------------------------------- //
//  Music — an original generative score.
//
//  theme.ini ships 18 tracks and rotates the ones marked `Normal=yes`
//  during a match. None of them can appear here, so this is a sequencer
//  over the same synth kit: a 16th-note grid, four eight-bar sections that
//  swap patterns as the loop turns over, and roughly ninety seconds before
//  it comes round. One loop per theatre, a quieter one for the shell, and
//  an intensity layer that opens up when weapons are firing near the
//  camera — RA2's energy, none of its notes.
// ------------------------------------------------------------------- //
var MUS = (function () {
  function P(s) { var a = [], i; for (i = 0; i < s.length; i++) a.push(s.charAt(i)); return a; }
  var THEMES = {
    // Industrial march: four-on-the-floor under a minor-key ostinato.
    temperate: { bpm: 124, bars: 48, root: 65.41 /* C2 */, sc: [0, 2, 3, 5, 7, 8, 10],
      kick: P('x...x...x...x...'), snare: P('....x.......x...'), hat: P('..x...x...x...x.'),
      bass: [0, 0, 7, 0, 3, 0, 7, 5], lead: [7, 10, 12, 10, 7, 5, 3, 5], pad: [0, 5, 3, 7], wave: 'sawtooth' },
    // Cold: slow pads, a dry snare, almost no bottom end.
    snow: { bpm: 100, bars: 38, root: 61.74 /* B1 */, sc: [0, 2, 3, 5, 7, 8, 10],
      kick: P('x.......x.......'), snare: P('....x.......x..x'), hat: P('....x.......x...'),
      bass: [0, 0, 3, 3, 5, 5, 3, 2], lead: [12, 10, 7, 10, 12, 15, 12, 10], pad: [0, 3, 5, 3], wave: 'triangle' },
    // Urban: a driving eighth-note bass and a busy hat.
    urban: { bpm: 132, bars: 50, root: 73.42 /* D2 */, sc: [0, 2, 3, 5, 7, 8, 10],
      kick: P('x..x..x...x.....'), snare: P('....x.......x...'), hat: P('x.x.x.x.x.x.x.x.'),
      bass: [0, 7, 0, 7, 3, 10, 3, 5], lead: [3, 5, 7, 5, 10, 7, 5, 3], pad: [0, 7, 5, 3], wave: 'square' },
    // The shell: no drums at all until a match starts.
    menu: { bpm: 92, bars: 24, root: 65.41, sc: [0, 2, 3, 5, 7, 8, 10],
      kick: P('................'), snare: P('................'), hat: P('................'),
      bass: [0, 0, 5, 5, 3, 3, 7, 5], lead: [7, 12, 10, 7, 5, 7, 10, 12], pad: [0, 5, 3, 7], wave: 'triangle' }
  };
  var on = false, timer = null, theme = 'menu', step = 0, nextT = 0, heatV = 0;
  function hz(root, deg, oct) {
    var T = THEMES[theme], sc = T.sc;
    var o = Math.floor(deg / sc.length), i = ((deg % sc.length) + sc.length) % sc.length;
    return root * Math.pow(2, (sc[i] + 12 * o + 12 * (oct || 0)) / 12);
  }
  function one(T, t, AC, out) {
    var s16 = step % 16, bar = Math.floor(step / 16), sec = Math.floor(bar / 8) % 4;
    var loud = 0.5 + heatV * 0.5;
    if (T.kick[s16] === 'x') { op(AC, out, t, 120, 42, 0.14, 0.5, 'sine', 0.002); clk(AC, out, t, 0.18, 900); }
    if (T.snare[s16] === 'x') nz(AC, out, t, 0.13, 0.24, 2100, 400, 1.1);
    if (T.hat[s16] === 'x' || (heatV > 0.3 && s16 % 2 === 1)) nz(AC, out, t, 0.035, 0.10 * loud, 8200, 6000, 1.4);
    // Bass on every eighth; section 2 drops it to the downbeats for air.
    if (s16 % 2 === 0 && !(sec === 2 && s16 % 8 !== 0)) {
      var bi = ((bar * 8 + s16 / 2) % T.bass.length + T.bass.length) % T.bass.length;
      var bg = AC.createGain(), lp = AC.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 380 + heatV * 700; lp.Q.value = 3;
      bg.gain.value = 1; lp.connect(bg); bg.connect(out);
      op(AC, lp, t, hz(T.root, T.bass[bi], 0), 0, 0.21, 0.30, T.wave, 0.004);
    }
    // The lead only in sections 1 and 3, so the loop breathes.
    if ((sec === 1 || sec === 3) && s16 % 4 === 0) {
      var li = ((bar * 4 + s16 / 4) % T.lead.length + T.lead.length) % T.lead.length;
      op(AC, out, t, hz(T.root, T.lead[li], 2), 0, 0.30, 0.11 * loud, sec === 3 ? 'square' : 'triangle', 0.01);
    }
    // Pad: one long chord at the top of each bar, cheap because it is rare.
    if (s16 === 0) {
      var pd = T.pad[bar % T.pad.length], dur = 240 / T.bpm * 4;
      [0, 2, 4].forEach(function (iv, k) {
        op(AC, out, t, hz(T.root, pd + iv, 1) * (k === 1 ? 1.004 : 1), 0, dur, 0.055, 'sawtooth', dur * 0.3);
      });
      if (heatV > 0.45) op(AC, out, t, hz(T.root, pd, 0), 0, dur * 0.5, 0.10 * heatV, 'sawtooth', 0.01);   // the intensity stab
      heatV *= 0.86;
    }
  }
  function pump() {
    if (!on || !AC || !BUS) return;
    var _t0 = performance.now(), out = BUS.music;
    var T = THEMES[theme] || THEMES.menu, sp = 15 / T.bpm;      // one 16th note
    if (nextT < AC.currentTime) nextT = AC.currentTime + 0.06;
    var guard = 0;
    while (nextT < AC.currentTime + 0.35 && guard++ < 32) {
      try { one(T, nextT, AC, out); } catch (e) {}
      nextT += sp; step = (step + 1) % (T.bars * 16);
    }
    aStat.ms += performance.now() - _t0;
  }
  return {
    start: function () {
      if (on || headless || !AC || !BUS || !musicOn || !soundOn) return;
      on = true; step = 0; nextT = AC.currentTime + 0.1;
      if (typeof setInterval === 'function') timer = setInterval(pump, 110);
      pump();
    },
    stop: function () { on = false; if (timer && typeof clearInterval === 'function') clearInterval(timer); timer = null; },
    set: function (k) { if (THEMES[k] && k !== theme) { theme = k; step = 0; } },
    heat: function (v) { heatV = Math.min(1, heatV + v * 0.13); },
    state: function () { return { on: on, theme: theme, step: step, heat: heatV }; },
    // Offline render of one theme, for the audio harness.
    render: function (k, secs, heat) {
      var OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!OC || !THEMES[k]) return null;
      var was = theme, wasHeat = heatV, wasStep = step;
      theme = k; heatV = heat || 0;
      var T = THEMES[k], sp = 15 / T.bpm, c = new OC(1, Math.floor(44100 * secs), 44100);
      var g = c.createGain(); g.gain.value = 0.5; g.connect(c.destination);
      step = 0;
      for (var t = 0.02; t < secs; t += sp) { try { one(T, t, c, g); } catch (e) {} step = (step + 1) % (T.bars * 16); }
      theme = was; heatV = wasHeat; step = wasStep;
      return c.startRendering();
    }
  };
})();

// ------------------------------------------------------------------- //
//  EVA — still the browser's voice, because words are the point, but now
//  on the mixer's EVA gain and with a real fallback. `getVoices()` comes
//  back empty on a cold Chromium and on every headless run, and until now
//  that meant EVA silently said nothing at all; a chime plus the line on
//  the message rail is what plays instead.
// ------------------------------------------------------------------- //
var evaAt = {}, evaVoice = null, evaLog = [];

// RA2 throttles the advisor in game FRAMES, not wall clock — at a faster
// game speed the same event still gets the same number of ticks of quiet.
function evaNow() { return G ? G.tick * (1000 / 60) : performance.now(); }

// Chrome's voice list is empty until the engine has loaded; the first line
// of a session came out as the chime. Ask early, and re-pick when they land.
try {
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.getVoices();
    speechSynthesis.addEventListener('voiceschanged', function () { evaVoice = null; });
  }
} catch (e) {}

function eva(line, gap) {
  var now = evaNow();
  if (evaAt[line] !== undefined && now - evaAt[line] < (gap || 6000) && now >= evaAt[line]) return false;
  // No audio yet (nothing has been clicked since the load): log it, but do
  // not spend the repeat gap on a line nobody could hear.
  if (!headless && soundOn && !AC) { evaLog.push(line); if (evaLog.length > 64) evaLog.shift(); return false; }
  evaAt[line] = now;
  evaLog.push(line); if (evaLog.length > 64) evaLog.shift();
  if (headless || !soundOn) return true;
  var spoke = false;
  try {
    if (typeof speechSynthesis !== 'undefined') {
      if (!evaVoice) {
        var vs = speechSynthesis.getVoices();
        evaVoice = vs.filter(function (v) { return /^en/i.test(v.lang) && /female|samantha|zira|google us english|karen|moira/i.test(v.name); })[0]
                || vs.filter(function (v) { return /^en/i.test(v.lang); })[0] || null;
      }
      if (evaVoice) {
        var u = new SpeechSynthesisUtterance(line);
        u.rate = 1.0; u.pitch = 0.85;
        u.volume = 0.9 * (BUS ? Math.min(1, vol.voice * 1.15) : 1);   // the EVA bus, applied where TTS can take it
        u.voice = evaVoice;
        speechSynthesis.speak(u);
        spoke = true;
      }
    }
  } catch (e) {}
  if (!spoke) { sfx('evachime'); if (typeof say === 'function') say(line, /warning|lost|low|insufficient/i.test(line), 260); }
  return true;
}

// --- generated ---
// ESM import bindings are read-only, so a write from another module goes
// through the owner. Reads stay verbatim everywhere: the binding is live.
function setAckAt(v) { ackAt = v; }
function setEvaAt(v) { evaAt = v; }
function setEvaLog(v) { evaLog = v; }
function setMusicOn(v) { musicOn = v; }
function setSfxAt(v) { sfxAt = v; }
function setSoundOn(v) { soundOn = v; }

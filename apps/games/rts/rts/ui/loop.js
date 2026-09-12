// Iron Frontier — ui/loop.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.











// --------------------------------------------------------------------- //
//  Main loop
// --------------------------------------------------------------------- //
var last = 0, acc = 0, hudT = 0, stallT = 0;

function tick(ts) {
  requestAnimationFrame(tick);
  if (!last) last = ts;
  var dt = Math.min(120, ts - last);
  last = ts;

  camScroll(dt);

  if (state === 'play' && G) {
    acc += dt;
    // RA2's speed slider. The tick itself is untouchable (the sim is
    // seed-deterministic and nothing in it may read a clock), so the
    // slider buys ticks per second instead: 15 x speed, i.e. speed 4 is
    // the old fixed 60/s. No interpolation — the render just sees whatever
    // tick the accumulator last stepped to.
    var _rate = (G.opt ? G.opt.speed : OPT_DEF.speed) / 4;
    var _step = STEP / _rate, _cap = Math.max(5, Math.ceil(_rate * 5));
    var n = 0;
    // `netMayStep` is the lockstep barrier. Single player runs on a
    // LocalNet, whose barrier is always open, so this loop is exactly the
    // one that shipped; a networked build stalls here instead of running
    // ahead of its peers (and would call `netStep` to post its bundle on
    // the same beat).
    while (acc >= _step && n < _cap && netMayStep(G)) { acc -= _step; simStep(G); n++; }
    if (acc > _step * _cap) acc = 0;
    // The barrier is silent by design — the slowest player sets the pace and
    // nobody should notice. A barrier that stops moving for a whole second
    // is a peer that has gone away, and a frozen game with no explanation is
    // the worst thing this layer can do to a player.
    // Three seconds, not one: a peer that is still repainting its army for
    // the host's house colours is not a peer that has gone away. Repeats
    // every five seconds after that, because silence is the failure mode.
    if (n) { stallT = 0; stallHide(); }
    else if (G.tick && !G.over && !netMayStep(G) && ++stallT >= 30) stallShow();
    // RA2 lets the field play for a beat after the last structure falls —
    // the winning side's infantry cheer (art.ini `Cheer=56,15,0,W`) before
    // the score card comes up. Three seconds, then finish().
    if (G.over && G.tick - (G.overAt == null ? G.tick : G.overAt) >= 180) finish(G.over === (ME === P_HUMAN ? 1 : -1));
  } else {
    acc = 0;
  }

  if (--hudT <= 0) { hudT = 6; updateHUD(); refreshPanel(); }
  tickCredits();
  stepEva();
  render();
}

/* The desktop heartbeat's pure decisions.
 *
 * Every ~5s each open client POSTs its own state and gets back the union: which
 * apps are open ANYWHERE, how many terminals are live, whether another device
 * asked us to close something, whether someone logged out everywhere. Deciding
 * what that reply means is pure — a function of (server reply, my instance id,
 * my open set) — but it lived inline in desktop.html, tangled with the DOM work
 * that follows it, so none of it could be tested. This is where the real
 * multi-user bugs have been (see design-decisions: CWD, time-only caches,
 * un-gated heartbeat folds), and "two devices disagree" is the hardest class of
 * bug to reproduce by hand and the easiest to write a fixture for.
 *
 * DOM-free on purpose. Extracted verbatim in v1.19.274 — the glue that applies
 * these decisions (closeApp, clearAllLocal, markMenuRunning) stays in the shell.
 */
(function (root) {
  'use strict';

  // An app gets the green dot when its window is open on THIS or another live
  // instance (or, for Terminal, when a backend session is running).
  //
  // ORDER IS LOAD-BEARING and asserted in the tests:
  //   x11launcher first — its dot tracks GUI apps running on :98, NOT the
  //   launcher window being open, so it must return BEFORE the open/union checks
  //   that would light it just for being open (that is how closing every app
  //   clears the dot while the launcher stays open, and how an orphaned app
  //   still lights it).
  //
  // Browser is deliberately NOT special-cased to always show green, even though
  // its Chromium/xpra session is persistent: a permanently-green dot made "close
  // on all devices" look broken — the window closed everywhere and the dot never
  // went dark. The dot honestly tracks whether the window is open somewhere.
  function isRunning(id, s) {
    s = s || {};
    var open = s.open || [], running = s.running || [];
    if (id === 'x11launcher') return (s.xWinCount || 0) > 0;
    if (open.indexOf(id) !== -1) return true;
    if (running.indexOf(id) !== -1) return true;
    if (id === 'terminal') return (s.terminalCount || 0) > 0;
    return false;
  }

  // A logout/reset on ANY device advances the server's reset epoch. The first
  // reply we ever see only establishes a baseline — tearing down on it would
  // wipe the desktop of a client that merely joined late.
  function resetDecision(lastEpoch, epoch) {
    if (typeof epoch !== 'number') return 'none';
    if (lastEpoch === null || lastEpoch === undefined) return 'baseline';
    return epoch > lastEpoch ? 'clear' : 'none';
  }

  // Cross-device close: the server lists which instances should close which app.
  // We act only where we are named AND actually have it open — no baseline
  // needed, because once we close it and report an open-set without it, the
  // server drops us as a target.
  function closeTargetsFor(closeTargets, instanceId, open) {
    var out = [];
    if (!closeTargets || typeof closeTargets !== 'object') return out;
    open = open || [];
    for (var app in closeTargets) {
      if (!Object.prototype.hasOwnProperty.call(closeTargets, app)) continue;
      var ids = closeTargets[app];
      if (Array.isArray(ids) && ids.indexOf(instanceId) !== -1 && open.indexOf(app) !== -1) {
        out.push(app);
      }
    }
    return out;
  }

  // This tab's identity in the union. Clock and randomness are injected so the
  // shape can be tested without mocking globals.
  function mintInstanceId(now, rand) {
    return 'i-' + now.toString(36) + '-' + rand.toString(36).slice(2, 8);
  }

  var api = { isRunning: isRunning, resetDecision: resetDecision,
              closeTargetsFor: closeTargetsFor, mintInstanceId: mintInstanceId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VibeDeskState = api;
})(typeof self !== 'undefined' ? self : this);

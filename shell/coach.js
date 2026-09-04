// coach.js — shared coach-tip banner used across vibetop surfaces (desktop shell,
// X11 Launcher, terminal). ONE implementation of the pattern that was copy-pasted
// into terminal-kbd.js / x11launcher.html: a small blue banner that shows EVERY time a
// surface opens until the user taps it (anywhere on the banner persists 'done'), with a
// max-showings safety cap (3) so it retires itself even if never tapped. Keys are
// versioned (…:vN) so a reworded tip can re-show to people who dismissed the old one.
//
// Usage:
//   vibeCoach({ key: 'vibetop:tip:files-addr:v1', text: '…' })          // single tip
//   vibeCoach([tipA, tipB], { surface: 'terminal', rotate: true })       // rotate, one per open
// opts: { top, bottom } placement (px); { surface, rotate } to cycle several tips.
(function () {
  var MAX = 3;
  function get(key) {
    try {
      var v = localStorage.getItem(key);
      if (v === 'done') return { done: true, count: 0 };
      var c = parseInt(v, 10) || 0;
      return { done: c >= MAX, count: c };
    } catch (_) { return { done: false, count: 0 }; }
  }
  window.VIBE_COACH_MAX = MAX;
  window.vibeCoach = function (tips, opts) {
    opts = opts || {};
    // Global kill-switch (Config ▸ Vibetop ▸ Feature hints). The host-wide flag
    // rides the desktop heartbeat and desktop.html mirrors it here; '0' = hints
    // off. This is the single choke-point every surface's tips flow through
    // (terminal, Files, Browser, cross-device ⏻, X11), so one check disables all.
    try { if (localStorage.getItem('vibetop:hints') === '0') return null; } catch (_) {}
    if (!Array.isArray(tips)) tips = [tips];
    if (document.hidden) return null;
    if (document.querySelector('.vibe-coach')) return null;   // one banner at a time, per surface
    var live = tips.filter(function (t) { return t && t.key && t.text && !get(t.key).done; });
    if (!live.length) return null;
    var tip = live[0];
    if (opts.rotate && opts.surface && live.length > 1) {   // give each live tip airtime across opens
      try {
        var rk = 'vibetop:coachrot:' + opts.surface;
        var i = parseInt(localStorage.getItem(rk), 10) || 0;
        tip = live[i % live.length];
        localStorage.setItem(rk, String(i + 1));
      } catch (_) {}
    }
    try { localStorage.setItem(tip.key, String(get(tip.key).count + 1)); } catch (_) {}   // this showing counts

    var el = document.createElement('div');
    el.className = 'vibe-coach';
    var place = opts.bottom != null ? ('bottom:' + opts.bottom + 'px;') : ('top:' + (opts.top != null ? opts.top : 8) + 'px;');
    el.style.cssText = 'position:fixed;left:8px;right:8px;' + place + 'z-index:2147483000;box-sizing:border-box;' +
      'padding:9px 13px;background:#0a84ff;color:#fff;border-radius:11px;' +
      'font:500 13px system-ui,sans-serif;text-align:center;box-shadow:0 4px 18px rgba(0,0,0,.45);cursor:pointer';
    var main = document.createElement('div');
    main.textContent = tip.text;
    el.appendChild(main);
    var note = document.createElement('div');
    note.textContent = 'This tip shows up to ' + MAX + ' times — tap this tip to dismiss';
    note.style.cssText = 'margin-top:3px;font-size:11px;opacity:.85;font-weight:400';
    el.appendChild(note);
    // Tapping anywhere on the banner dismisses it for good (no separate × needed).
    el.addEventListener('click', function () {
      try { el.remove(); } catch (_) {}
      try { localStorage.setItem(tip.key, 'done'); } catch (_) {}
    });
    (document.body || document.documentElement).appendChild(el);
    return el;
  };
})();

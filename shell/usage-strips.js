/* The two plan-usage strips (Claude, Codex) — opt-in, shared across clients.
 *
 * Lifted VERBATIM out of shell/desktop.html (v1.19.273), two IIFEs kept separate
 * rather than merged: they are independent features that happen to look alike.
 *
 * They were ALREADY outside desktop.html's main IIFE, which is what made moving
 * them safe — and also what made them buggy. Each toggle ended with a bare
 * `pushDesktop()` call, but pushDesktop is a main-IIFE local and nothing published
 * it, so every toggle threw a ReferenceError straight into the .catch on the same
 * line. That catch set the same state the success path did, so nothing looked
 * wrong; the immediate cross-client push simply never happened and the 5s
 * heartbeat quietly covered for it. Hence the `if (window.pushDesktop)` guard
 * here and the matching `window.pushDesktop = pushDesktop` in desktop.html.
 *
 * Loaded at the END of <body>, NOT in <head>: both IIFEs read their strip element
 * at load and return early if it is missing.
 *
 * Public surface (the main script dispatches on these by name):
 *   window.applyServerClaudeUsage(on, data)   window.toggleClaudeUsage()
 *   window.applyServerCodexUsage(on, data)    window.toggleCodexUsage()
 */
// --- Claude plan-usage strip (opt-in) --------------------------------------
// There is no API to query Max-plan usage; the numbers exist only as response
// headers on live API calls. Start ▸ System ▸ "Claude Usage" toggles a local
// pass-through proxy (POST /api/claude/usage) that Claude Code is routed through
// to capture them; GET /api/claude/usage serves the latest. The strip is a
// glanceable session/weekly % bar. The on/off state is server-side (shared), so
// the strip shows on EVERY client whenever it's enabled; the strip ✕ and the
// Start-menu toggle both turn the feature off everywhere (no per-tab hide).
(function claudeUsage() {
  var strip = document.getElementById('cu-strip');
  if (!strip) return;
  var enabled = false;
  var lastData = null;
  var localOverrideUntil = 0;   // ignore heartbeat reconcile briefly after a local toggle
  function fmtReset(ts) {
    if (!ts) return '';
    var s = Math.max(0, ts - Math.floor(Date.now() / 1000));
    var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600),
        m = Math.floor((s % 3600) / 60);
    if (d > 0) return d + 'd ' + h + 'h';           // days out (e.g. weekly): "6d 23h"
    if (h > 0) return h + 'h ' + (m < 10 ? '0' : '') + m + 'm';
    return m + 'm';
  }
  // The exact wall-clock of the reset, next to the countdown ("4h 20m (2:30
  // PM)") — user request: the countdown alone made scheduling a command for
  // the reset a mental-arithmetic exercise. Adds the weekday once it's a day+
  // out ("6d 23h (Thu 9:00 AM)") since the bare clock would be ambiguous.
  function fmtResetAt(ts) {
    if (!ts) return '';
    var dt = new Date(ts * 1000);
    var days = (ts - Math.floor(Date.now() / 1000)) / 86400;
    // A reset a day or more out only needs the day and the hour — "Thu 10 AM".
    // Minutes matter when it is minutes away, not when it is two days away, and
    // dropping them buys ~30px in a strip that is fighting for every one.
    if (days >= 1) {
      return dt.toLocaleDateString([], { weekday: 'short' }) + ' ' +
             dt.toLocaleTimeString([], { hour: 'numeric' });
    }
    return dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  function seg(label, pct, reset) {
    var p = Math.round((pct || 0) * 100);
    var cls = p >= 90 ? 'crit' : p >= 70 ? 'warn' : '';
    var rtxt = reset ? fmtReset(reset) : '';
    var rat = reset ? fmtResetAt(reset) : '';
    // Three forms, longest first, so fitSegs() can step down instead of deleting.
    // The countdown is the primary glanceable status and must survive in the
    // fixed-width desktop chip. Mobile usually has room for the full form.
    var full = '· resets ' + rtxt + (rat ? ' (' + rat + ')' : '');
    var mid  = '· resets ' + rtxt;
    var min  = '· ' + rtxt;                         // countdown always wins at the tightest fit
    var r = rtxt ? '<span class="cu-dim" data-full="' + full + '" data-mid="' + mid +
                   '" data-min="' + min + '">' + full + '</span>' : '';
    var title = rtxt ? ' title="resets in ' + rtxt + (rat ? ' — at ' + rat : '') + '"' : '';
    return '<span class="cu-seg"' + title + '><span class="cu-lbl">' + label + '</span>' +
      '<span class="cu-bar"><span class="cu-fill ' + cls + '" style="width:' + p + '%"></span></span>' +
      '<span class="cu-pct">' + p + '%</span>' + r + '</span>';
  }
  function updateToggleRow() {
    // Look the row up via document (NOT the outer `menuEl` closure var — this
    // IIFE lives in a nested scope; referencing menuEl here once threw a
    // ReferenceError that a render-path .catch swallowed, silently killing every
    // render — the "toggle does nothing / strip never shows" bug).
    var it = document.querySelector('.sm-item[data-id="claudeusage"]');
    if (it) {
      it.classList.toggle('cu-on', enabled);
      var ds = it.querySelector('.sm-desc');
      if (ds) ds.textContent = enabled ? 'On — plan usage strip' : 'Off';
    }
    // Mirror the active state onto the collapsed "Utilities" parent so you can
    // see something inside is on without expanding it.
    var parent = document.getElementById('sm-util-parent');
    if (parent) parent.classList.toggle('has-active',
      !!document.querySelector('.sm-item[data-id="claudeusage"].cu-on, .sm-item[data-id="codexusage"].cu-on'));
  }
  function render(d) {
    if (d) lastData = d;
    enabled = !!(d && d.enabled);
    updateToggleRow();
    // Show the strip whenever the (server-side, shared) feature is enabled — no
    // per-tab hide, so every client is consistent: on = shown everywhere.
    if (!enabled) { strip.hidden = true; return; }
    strip.hidden = false;
    // "as of Nm ago" sits UNDER "Claude", in the identity column — inside the
    // metrics column it was a third stacked row, which is what made the strip
    // three lines tall on a phone. It is never shed: how old the number is is
    // part of reading the number.
    // Shown once the numbers are a minute old, not only once the server calls
    // them stale — the space under "Claude" is where the reading's age lives, and
    // it was empty most of the time. Fresh data still says nothing.
    var ageMin = Math.round((d.ageSec || 0) / 60);
    // Just "3m ago". Sitting under "Claude" in the identity column, "as of" was
    // three words of scaffolding holding up one number — and every px it took
    // came straight out of the reset time on the row beside it.
    var asof = (d.stale || ageMin >= 1)
      ? '<span class="cu-asof" title="usage data was read ' + ageMin + ' minutes ago">' +
        ageMin + 'm ago</span>' : '<span class="cu-asof is-empty" aria-hidden="true">0m ago</span>';
    var html = '<span class="cu-who"><span class="cu-brand">Claude</span>' + asof + '</span>' +
               '<span class="cu-metrics">';
    if (d.session && d.session.pct != null) {
      html += seg('session', d.session.pct, d.session.reset);
      if (d.weekly && d.weekly.pct != null)
        html += seg('week', d.weekly.pct, d.weekly.reset);
    } else {
      html += '<span class="cu-dim">waiting for first API call…</span>';
    }
    html += '</span><span class="cu-x" id="cu-x" title="Turn off Claude Limit (all devices)">✕</span>';
    strip.innerHTML = html;
    var x = document.getElementById('cu-x');
    if (x) x.onclick = function() { window.toggleClaudeUsage(); };   // ✕ = turn the feature off everywhere
    fitSegs();
  }

  // Each chip is one line, always. When the line does not fit, shed the least
  // useful part of it and measure again: first the absolute time in brackets,
  // while retaining the relative countdown; only then use the terse exact time
  // or finally leave label/bar/percentage. The title always retains both.
  function fitSegs() {
    var segs = strip.querySelectorAll('.cu-seg');
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i], dim = seg.querySelector('.cu-dim');
      if (!dim) continue;
      // Desktop has fixed 360px chips specifically sized for the complete
      // countdown + clock. Never rewrite that text based on measurements.
      if (!window.matchMedia('(max-width: 680px)').matches) {
        dim.hidden = false;
        dim.textContent = dim.dataset.full;
        continue;
      }
      var over = function() { return seg.scrollWidth > seg.clientWidth + 1; };
      dim.hidden = false;
      dim.textContent = dim.dataset.full;             // "· resets 2d 20h (Thu 10:00 AM)"
      if (over()) dim.textContent = dim.dataset.mid;  // "· resets 2d 20h"
      if (over()) dim.textContent = dim.dataset.min;  // "· Thu 10:00 AM"
      if (over()) dim.hidden = true;                  // label · bar · % only
    }
  }
  // The available width changes without the numbers changing: rotation, window
  // mode, the shell's own chrome appearing.
  var cuFitT = null;
  window.addEventListener('resize', function() {
    clearTimeout(cuFitT);
    cuFitT = setTimeout(fitSegs, 120);
  });
  // Both the enabled flag AND the numbers now ride the 5s desktop heartbeat
  // (onDesktopResp → here): the manager folds `claude` (the /api/claude/usage
  // payload) onto every heartbeat when the feature is on, so this feature has NO
  // standalone poll anymore — the strip updates within ~5s of a real API call
  // instead of up to 30s. `on` is the boolean flag; `data` is the numbers
  // payload (present only when enabled). Skip briefly after a LOCAL toggle so a
  // heartbeat firing mid-`systemctl` (settings.json not yet written) can't
  // clobber the optimistic state.
  window.applyServerClaudeUsage = function(on, data) {
    if (Date.now() < localOverrideUntil) return;
    if (data) { render(data); return; }        // enabled: full payload rode in
    if (on === enabled) return;
    var opt = {}; for (var k in (lastData || {})) opt[k] = lastData[k];
    opt.enabled = on;
    render(opt);                                // disabled (or flag-only): hide
  };
  window.toggleClaudeUsage = function() {
    var want = !enabled;
    // Optimistic: reflect the new state instantly (the POST runs systemctl, so
    // it's not immediate). Guard against a mid-`systemctl` heartbeat until the
    // POST confirms; then clear the guard and kick a heartbeat to pull the real
    // (server-confirmed) state + numbers.
    localOverrideUntil = Date.now() + 8000;     // fallback if the POST never resolves
    var opt = {}; for (var k in (lastData || {})) opt[k] = lastData[k];
    opt.enabled = want;
    render(opt);
    fetch('/api/claude/usage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: want })
    }).then(function() { localOverrideUntil = 0; if (window.pushDesktop) window.pushDesktop(); })
      .catch(function() { localOverrideUntil = 0; });
  };
  // No initial poll / interval / visibilitychange handler: the restore GET and
  // the 5s heartbeat (which also re-fires on visibilitychange) drive the strip.
})();

// --- Codex plan-usage strip (opt-in) ---------------------------------------
// Codex writes account-wide rate-limit snapshots into its local session logs,
// so this toggle only changes Vibetop's display preference; it does not reroute
// Codex traffic or alter ~/.codex configuration.
(function codexUsage() {
  var strip = document.getElementById('cx-strip');
  if (!strip) return;
  var enabled = false, lastData = null, localOverrideUntil = 0;
  function resetText(ts) {
    if (!ts) return '';
    var sec = Math.max(0, ts - Math.floor(Date.now() / 1000));
    var d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600),
        m = Math.floor((sec % 3600) / 60);
    return d ? d + 'd ' + h + 'h' : h ? h + 'h ' + (m < 10 ? '0' : '') + m + 'm' : m + 'm';
  }
  function resetAt(ts) {
    if (!ts) return '';
    var dt = new Date(ts * 1000);
    var days = (ts - Math.floor(Date.now() / 1000)) / 86400;
    if (days >= 1) {
      return dt.toLocaleDateString([], {weekday: 'short'}) + ' ' +
             dt.toLocaleTimeString([], {hour: 'numeric'});
    }
    return dt.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
  }
  function segment(label, value) {
    var p = Math.round(Math.max(0, Math.min(1, Number(value.pct) || 0)) * 100);
    var cls = p >= 90 ? 'crit' : p >= 70 ? 'warn' : '';
    var reset = resetText(value.reset);
    var at = resetAt(value.reset);
    var full = '· resets ' + reset + (at ? ' (' + at + ')' : '');
    var mid = '· resets ' + reset;
    var min = '· ' + reset;                         // countdown always wins at the tightest fit
    return '<span class="cu-seg"' + (reset ? ' title="resets in ' + reset + (at ? ' — at ' + at : '') + '"' : '') + '>' +
      '<span class="cu-lbl">' + label + '</span><span class="cu-bar"><span class="cu-fill ' + cls +
      '" style="width:' + p + '%"></span></span><span class="cu-pct">' + p + '%</span>' +
      (reset ? '<span class="cu-dim" data-full="' + full + '" data-mid="' + mid +
       '" data-min="' + min + '">' + full + '</span>' : '') + '</span>';
  }
  function fitSegments() {
    var segments = strip.querySelectorAll('.cu-seg');
    for (var i = 0; i < segments.length; i++) {
      var item = segments[i], dim = item.querySelector('.cu-dim');
      if (!dim) continue;
      if (!window.matchMedia('(max-width: 680px)').matches) {
        dim.hidden = false;
        dim.textContent = dim.dataset.full;
        continue;
      }
      var over = function() { return item.scrollWidth > item.clientWidth + 1; };
      dim.hidden = false;
      dim.textContent = dim.dataset.full;
      if (over()) dim.textContent = dim.dataset.mid;
      if (over()) dim.textContent = dim.dataset.min;
      if (over()) dim.hidden = true;
    }
  }
  function updateRow() {
    var row = document.querySelector('.sm-item[data-id="codexusage"]');
    if (row) {
      row.classList.toggle('cu-on', enabled);
      var desc = row.querySelector('.sm-desc');
      if (desc) desc.textContent = enabled ? 'On — plan usage strip' : 'Off';
    }
    var parent = document.getElementById('sm-util-parent');
    if (parent) parent.classList.toggle('has-active',
      !!document.querySelector('.sm-item[data-id="claudeusage"].cu-on, .sm-item[data-id="codexusage"].cu-on'));
  }
  function render(data) {
    if (data) lastData = data;
    enabled = !!(data && data.enabled);
    updateRow();
    if (!enabled) { strip.hidden = true; return; }
    strip.hidden = false;
    var age = Math.round(((data && data.ageSec) || 0) / 60);
    var asof = age >= 1 ? '<span class="cu-asof">' + age + 'm ago</span>' :
      '<span class="cu-asof is-empty" aria-hidden="true">0m ago</span>';
    var html = '<span class="cu-who"><span class="cu-brand">Codex</span>' + asof + '</span><span class="cu-metrics">';
    if (data && data.session && data.session.pct != null) {
      html += segment('session', data.session);
      if (data.weekly && data.weekly.pct != null) html += segment('week', data.weekly);
    } else {
      html += '<span class="cu-dim">waiting for first Codex response…</span>';
    }
    strip.innerHTML = html + '</span><span class="cu-x" id="cx-x" title="Turn off Codex Limit (all devices)">✕</span>';
    var close = document.getElementById('cx-x');
    if (close) close.onclick = window.toggleCodexUsage;
    fitSegments();
  }
  window.applyServerCodexUsage = function(on, data) {
    if (Date.now() < localOverrideUntil) return;
    if (data) { render(data); return; }
    if (on === enabled) return;
    var next = Object.assign({}, lastData || {}, {enabled: on});
    render(next);
  };
  window.toggleCodexUsage = function() {
    var want = !enabled;
    localOverrideUntil = Date.now() + 8000;
    render(Object.assign({}, lastData || {}, {enabled: want}));
    fetch('/api/desktop/ui', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({codexUsage: want})})
      .then(function() { localOverrideUntil = 0; if (window.pushDesktop) window.pushDesktop(); })
      .catch(function() { localOverrideUntil = 0; });
  };
  var fitTimer = null;
  window.addEventListener('resize', function() {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(fitSegments, 120);
  });
})();

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
 *   window.applyServerAgyUsage(on, data)      window.toggleAgyUsage()
 */
// --- Claude plan-usage strip (opt-in) --------------------------------------
// There is no API to query Max-plan usage; the numbers exist only as response
// headers on live API calls. Start ▸ System ▸ "Claude Usage" toggles a local
// pass-through proxy (POST /api/claude/usage) that Claude Code is routed through
// to capture them; GET /api/claude/usage serves the latest. The strip is a
// glanceable session/weekly % bar. The on/off state is server-side (shared), so
// the strip shows on EVERY client whenever it's enabled; the strip ✕ and the
// Start-menu toggle both turn the feature off everywhere (no per-tab hide).
// "8121m ago" is what a five-day-old reading rendered as. Minutes are the unit
// only while they are the readable one.
function ageText(sec) {
  var m = Math.round((sec || 0) / 60);
  if (m < 60) return m + 'm';
  var h = Math.floor(m / 60);
  if (h < 48) return h + 'h';
  return Math.floor(h / 24) + 'd';
}

// One row per provider (v1.38.183). Before that each strip was a brand column
// beside two stacked chips — two lines each, four lines of a phone screen for
// four percentages. Now a strip is ONE line: brand, the 5-hour window, the
// weekly window, the reading's age. Stacked on a phone (two lines for both),
// side by side on a desktop (one line for both).
//
// The row is built from the same ten cells in the same order for both strips,
// placeholders included, because on a phone the two strips share one grid
// (`.cu-strips`, subgrid) — a missing cell would shift every column after it.
function vtResetIn(ts) {
  if (!ts) return '';
  var s = Math.max(0, ts - Math.floor(Date.now() / 1000));
  var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600),
      m = Math.floor((s % 3600) / 60);
  if (d > 0) return d + 'd ' + h + 'h';           // days out (e.g. weekly): "6d 23h"
  if (h > 0) return h + 'h ' + (m < 10 ? '0' : '') + m + 'm';
  return m + 'm';
}
// The exact wall-clock of the reset. A reset a day or more out only needs the
// day and the hour — "Thu 10 AM"; minutes matter when it is minutes away.
function vtResetAt(ts) {
  if (!ts) return '';
  var dt = new Date(ts * 1000);
  var days = (ts - Math.floor(Date.now() / 1000)) / 86400;
  if (days >= 1) {
    return dt.toLocaleDateString([], { weekday: 'short' }) + ' ' +
           dt.toLocaleTimeString([], { hour: 'numeric' });
  }
  return dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
// One window: label · bar · % · reset. `value` null/absent renders the slot
// with a dash rather than dropping it, so "wk" never slides into "5h"'s place.
// The reset text carries every form it can be shown in, longest first; which
// one is on screen is vtFitUsage()'s decision, never this function's.
function vtUsageSeg(label, name, value) {
  if (!value || value.pct == null) {
    return '<span class="cu-seg" title="' + name + ': no current reading">' +
      '<span class="cu-lbl">' + label + '</span><span class="cu-bar"></span>' +
      '<span class="cu-pct">—</span><span class="cu-dim"></span></span>';
  }
  var p = Math.round(Math.max(0, Math.min(1, Number(value.pct) || 0)) * 100);
  var cls = p >= 90 ? 'crit' : p >= 70 ? 'warn' : '';
  var rin = vtResetIn(value.reset), rat = vtResetAt(value.reset);
  var full = rin + (rat ? ' (' + rat + ')' : '');   // "2h 10m (2:30 PM)"
  var min = rin.replace(/ /g, '');                  // "2h10m" — the countdown always wins
  var dim = rin ? '<span class="cu-dim" data-full="' + full + '" data-mid="' + rin +
                  '" data-min="' + min + '" data-at="' + (rat || rin) + '">' + full + '</span>'
                : '<span class="cu-dim"></span>';
  var title = name + ' ' + p + '%' + (rin ? ' — resets in ' + rin + (rat ? ', at ' + rat : '') : '');
  return '<span class="cu-seg" title="' + title + '"><span class="cu-lbl">' + label + '</span>' +
    '<span class="cu-bar"><span class="cu-fill ' + cls + '" style="width:' + p + '%"></span></span>' +
    '<span class="cu-pct">' + p + '%</span>' + dim + '</span>';
}
// An empty half, for a provider with one pool: the four cells must still exist.
function vtUsageBlank() {
  return '<span class="cu-seg"><span class="cu-lbl"></span><span class="cu-bar cu-none"></span>' +
         '<span class="cu-pct"></span><span class="cu-dim"></span></span>';
}
function vtUsageAge(d) {
  var ageMin = Math.round(((d && d.ageSec) || 0) / 60);
  // Shown once the numbers are a minute old. Fresh data says nothing — but the
  // cell is still there, so the row always has the same ten cells.
  return ((d && d.stale) || ageMin >= 1)
    ? '<span class="cu-asof" title="usage data was read ' + ageText(d.ageSec) + ' ago" data-long="' +
      ageText(d.ageSec) + ' ago" data-short="' + ageText(d.ageSec) + '">' + ageText(d.ageSec) + ' ago</span>'
    : '<span class="cu-asof is-empty" aria-hidden="true"></span>';
}
// Pick the longest reset text that keeps every enabled strip on its one line.
// It works on BOTH strips at once: they share columns, so they must also share
// a form — "2h 10m (2:30 PM)" over "4h02m" reads as two different displays.
//   desktop: full ("2h 10m (2:30 PM)"); if the strips wrap onto more than one
//            line, the countdown alone — but only if that saves a line.
//   phone:   countdown ("2h 10m"), then "2h10m", then the same with the age cut
//            to "3m" and the gaps closed up, and only then no reset text at all.
//            A tap swaps the countdown for the clock time for a few seconds.
// A reset text that does not fit is EMPTIED, never removed: on a phone it is a
// grid cell, and taking a cell out slides every later column one place left.
var vtUsageAt = false, vtUsageAtTimer = null;
function vtFitUsage() {
  var wrap = document.getElementById('cu-strips');
  if (!wrap) return;
  var dims = wrap.querySelectorAll('.cu-dim[data-full]');
  var ages = wrap.querySelectorAll('.cu-asof[data-long]');
  var narrow = window.matchMedia('(max-width: 680px)').matches;
  function show(form, tight) {
    var i;
    for (i = 0; i < dims.length; i++) dims[i].textContent = form ? dims[i].dataset[form] : '';
    for (i = 0; i < ages.length; i++) ages[i].textContent = ages[i].dataset[tight ? 'short' : 'long'];
    wrap.classList.toggle('tight', !!tight);
  }
  // How many lines the enabled strips take on a desktop (they wrap whole).
  function lines() {
    var rows = wrap.querySelectorAll('.cu-strip:not([hidden])'), tops = [];
    for (var i = 0; i < rows.length; i++) {
      if (tops.indexOf(rows[i].offsetTop) < 0) tops.push(rows[i].offsetTop);
    }
    return tops.length;
  }
  if (!narrow) {
    show('full', false);
    var full = lines();
    if (full < 2) return;
    show('mid', false);
    if (lines() >= full) show('full', false);     // no line saved: keep the clock time
    return;
  }
  var steps = [[vtUsageAt ? 'at' : 'mid', false], ['min', false], ['min', true], ['', true]];
  for (var f = 0; f < steps.length; f++) {
    show(steps[f][0], steps[f][1]);
    if (wrap.scrollWidth <= wrap.clientWidth + 1) return;
  }
}
// The wrapper carries the background and the bottom rule, so it has to go when
// both strips are off; and one strip changing can change what fits in the other.
function vtUsageSync() {
  var wrap = document.getElementById('cu-strips');
  if (wrap) wrap.hidden = !wrap.querySelector('.cu-strip:not([hidden])');
  vtFitUsage();
}
(function usageChrome() {
  var wrap = document.getElementById('cu-strips');
  if (!wrap) return;
  var t = null;
  // The available width changes without the numbers changing: rotation, window
  // mode, the shell's own chrome appearing.
  window.addEventListener('resize', function() {
    clearTimeout(t);
    t = setTimeout(vtFitUsage, 120);
  });
  // A phone has no hover, so the title's clock time is out of reach there.
  wrap.addEventListener('click', function(e) {
    if (e.target && e.target.classList && e.target.classList.contains('cu-x')) return;
    vtUsageAt = !vtUsageAt;
    clearTimeout(vtUsageAtTimer);
    if (vtUsageAt) vtUsageAtTimer = setTimeout(function() { vtUsageAt = false; vtFitUsage(); }, 6000);
    vtFitUsage();
  });
})();

(function claudeUsage() {
  var strip = document.getElementById('cu-strip');
  if (!strip) return;
  var enabled = false;
  var lastData = null;
  var localOverrideUntil = 0;   // ignore heartbeat reconcile briefly after a local toggle
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
      !!document.querySelector('.sm-item[data-id="claudeusage"].cu-on, .sm-item[data-id="codexusage"].cu-on, ' +
                               '.sm-item[data-id="agyusage"].cu-on'));
  }
  function render(d) {
    if (d) lastData = d;
    enabled = !!(d && d.enabled);
    updateToggleRow();
    // Show the strip whenever the (server-side, shared) feature is enabled — no
    // per-tab hide, so every client is consistent: on = shown everywhere.
    if (!enabled) { strip.hidden = true; vtUsageSync(); return; }
    strip.hidden = false;
    var html = '<span class="cu-brand">Claude</span>';   // short enough for a phone as it is
    // The proxy retains its last reading even after a subscription ends. A
    // percentage only describes the window it was captured in; after reset it
    // is unknown, not zero. The heartbeat rechecks this against the clock.
    var now = Math.floor(Date.now() / 1000);
    function current(w) {
      return w && w.pct != null && (w.reset ? w.reset > now : !d.stale);
    }
    var hasSession = current(d.session), hasWeekly = current(d.weekly);
    if (hasSession || hasWeekly) {
      html += vtUsageSeg('5h', 'session (5h)', hasSession ? d.session : null) +
              vtUsageSeg('wk', 'week (7d)', hasWeekly ? d.weekly : null);
    } else {
      var hadReading = d.updated || d.session || d.weekly;
      html += '<span class="cu-msg">' + (hadReading
        ? 'usage unavailable — waiting for a new reading'
        : 'waiting for first API call…') + '</span>';
    }
    html += vtUsageAge(d) +
      '<span class="cu-x" id="cu-x" title="Turn off Claude Limit (all devices)">✕</span>';
    strip.innerHTML = html;
    var x = document.getElementById('cu-x');
    if (x) x.onclick = function() { window.toggleClaudeUsage(); };   // ✕ = turn the feature off everywhere
    vtUsageSync();
  }
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
    // A REFUSED toggle must not look like a flaky one. `fetch` resolves on a 403
    // — Claude-usage is operator-only (`_is_admin()`), so a 403 here is the
    // ORDINARY outcome for every non-admin user — and the old `.then()` had no
    // `r.ok`: it took the refusal as agreement, cleared the guard window early,
    // and left the optimistic ON state up until the next heartbeat (≤5s) put it
    // back OFF. A switch that flips itself back reads as a bug in the switch.
    // The answer was in the status code all along; revert now and say it.
    function refused(status) {
      localOverrideUntil = 0;
      var back = {}; for (var k2 in (lastData || {})) back[k2] = lastData[k2];
      back.enabled = !want;                 // the server's state, not the one we hoped for
      render(back);                         // ...which re-renders the row, so the note comes after
      var it = document.querySelector('.sm-item[data-id="claudeusage"]');
      var ds = it && it.querySelector('.sm-desc');
      if (ds) ds.textContent = status === 403 ? 'Operator only — not changed'
                            : status ? 'Could not change (' + status + ')'
                                     : 'Could not reach the server — not changed';
    }
    fetch('/api/claude/usage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: want })
    }).then(function(r) {
      if (!r.ok) { refused(r.status); return; }
      localOverrideUntil = 0; if (window.pushDesktop) window.pushDesktop();
    }).catch(function() { refused(0); });
  };
  // No initial poll / interval / visibilitychange handler: the restore GET and
  // the 5s heartbeat (which also re-fires on visibilitychange) drive the strip.
})();

// --- Codex and Antigravity plan-usage strips (opt-in) -----------------------
// Both are display preferences only: the manager already knows how to read each
// tool's limits (Codex: its account endpoint or session logs; Antigravity: the
// CLI's own `agy -p /usage`), and the toggle just says whether to show them. So
// they share one implementation, and differ only in the names below.
//   brand/short  the row's name on a desktop / on a phone, where every row's
//                name column is as wide as the longest one
//   key          the field POSTed to /api/desktop/ui
function vtDisplayStrip(cfg) {
  var strip = document.getElementById(cfg.strip);
  if (!strip) return;
  var enabled = false, lastData = null, localOverrideUntil = 0;
  var ROWS = '.sm-item[data-id="claudeusage"].cu-on, .sm-item[data-id="codexusage"].cu-on, ' +
             '.sm-item[data-id="agyusage"].cu-on';
  function updateRow() {
    var row = document.querySelector('.sm-item[data-id="' + cfg.row + '"]');
    if (row) {
      row.classList.toggle('cu-on', enabled);
      var desc = row.querySelector('.sm-desc');
      if (desc) desc.textContent = enabled ? 'On — plan usage strip' : 'Off';
    }
    var parent = document.getElementById('sm-util-parent');
    if (parent) parent.classList.toggle('has-active', !!document.querySelector(ROWS));
  }
  // "5h: Claude and GPT models" — Antigravity has several quota groups and each
  // slot shows the one closest to its limit, so the tooltip has to say which.
  function named(name, w) { return w && w.group ? name + ', ' + w.group : name; }
  function render(data) {
    if (data) lastData = data;
    enabled = !!(data && data.enabled);
    updateRow();
    if (!enabled) { strip.hidden = true; vtUsageSync(); return; }
    strip.hidden = false;
    var html = '<span class="cu-brand" title="' + cfg.brand + '"><span class="cu-long">' + cfg.brand +
               '</span><span class="cu-short">' + (cfg.short || cfg.brand) + '</span></span>';
    var now = Math.floor(Date.now() / 1000);
    function current(w) {
      return w && w.pct != null && (w.reset ? w.reset > now : !data.stale);
    }
    var hasSession = current(data.session), hasWeekly = current(data.weekly);
    // A provider with several quota POOLS (Antigravity: Gemini models, Claude
    // and GPT models) sends `segs`, one per pool, each already reduced to that
    // pool's tightest limit. Its two halves are then labelled by pool ("Gem",
    // "C/G"), not by window — "5h" beside "wk" would claim they are the same
    // pool, and they are not.
    var segs = (data.segs || []).slice(0, 2);
    if (segs.length && (hasSession || hasWeekly)) {
      for (var i = 0; i < 2; i++) {
        var g = segs[i];
        html += g ? vtUsageSeg(g.label, g.name + ', ' + g.window + ' limit', current(g) ? g : null)
                  : vtUsageBlank();
      }
    } else if (hasSession || hasWeekly) {
      html += vtUsageSeg('5h', named('session (5h)', data.session), hasSession ? data.session : null) +
              vtUsageSeg('wk', named('week (7d)', data.weekly), hasWeekly ? data.weekly : null);
    } else {
      var hadReading = data.updated || data.session || data.weekly;
      html += '<span class="cu-msg">' + (data.note || (hadReading
        ? 'usage unavailable — waiting for a new reading'
        : cfg.waiting)) + '</span>';
    }
    html += vtUsageAge(data);
    // The server's reason for showing an older reading. It gets its own line:
    // it is the exceptional state, and it is a sentence, not a number.
    if (data && data.note && (hasSession || hasWeekly)) {
      html += '<span class="cu-note" title="showing the last reading">' + data.note + '</span>';
    }
    strip.innerHTML = html + '<span class="cu-x" id="' + cfg.x + '" title="Turn off ' + cfg.brand +
                      ' Limit (all devices)">✕</span>';
    var close = document.getElementById(cfg.x);
    if (close) close.onclick = toggle;
    vtUsageSync();
  }
  function apply(on, data) {
    if (Date.now() < localOverrideUntil) return;
    if (data) { render(data); return; }
    if (on === enabled) return;
    render(Object.assign({}, lastData || {}, {enabled: on}));
  }
  function toggle() {
    var want = !enabled;
    localOverrideUntil = Date.now() + 8000;
    render(Object.assign({}, lastData || {}, {enabled: want}));
    // Same refusal rule as the Claude strip above — see the comment there. This
    // endpoint is not admin-gated today, so the 403 branch is the unlikely one
    // here; the 500 / unreachable branch is not, and both used to land in the
    // success path and then be silently undone by the heartbeat.
    function refused(status) {
      localOverrideUntil = 0;
      render(Object.assign({}, lastData || {}, {enabled: !want}));
      var row = document.querySelector('.sm-item[data-id="' + cfg.row + '"]');
      var desc = row && row.querySelector('.sm-desc');
      if (desc) desc.textContent = status === 403 ? 'Operator only — not changed'
                                : status ? 'Could not change (' + status + ')'
                                         : 'Could not reach the server — not changed';
    }
    var body = {};
    body[cfg.key] = want;
    fetch('/api/desktop/ui', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)})
      .then(function(r) {
        if (!r.ok) { refused(r.status); return; }
        localOverrideUntil = 0; if (window.pushDesktop) window.pushDesktop();
      })
      .catch(function() { refused(0); });
  }
  return { apply: apply, toggle: toggle };
}
(function displayStrips() {
  var cx = vtDisplayStrip({ strip: 'cx-strip', x: 'cx-x', row: 'codexusage', key: 'codexUsage',
    brand: 'Codex', waiting: 'waiting for first Codex response…' });
  if (cx) { window.applyServerCodexUsage = cx.apply; window.toggleCodexUsage = cx.toggle; }
  var ag = vtDisplayStrip({ strip: 'ag-strip', x: 'ag-x', row: 'agyusage', key: 'agyUsage',
    brand: 'Antigravity', short: 'Agy', waiting: 'asking the Antigravity CLI…' });
  if (ag) { window.applyServerAgyUsage = ag.apply; window.toggleAgyUsage = ag.toggle; }
})();

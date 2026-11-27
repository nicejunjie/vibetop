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

// A mini mark in front of each row's name (v1.38.187): three rows of identical
// grey bars are told apart by reading, and a 13px mark in the product's own
// colour is recognised before the word is. Inline SVG, inside the name cell, so
// the row still has the same nine cells. The Claude and OpenAI paths are the
// simple-icons ones (24x24); Antigravity's is the arch from its own favicon,
// in its base blue without the gradient overlay.
var VT_USAGE_LOGOS = {
  claude: { box: '0 0 24 24', fill: '#d97757',
    d: 'm4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z' },
  codex: { box: '0 0 24 24', fill: '#e6edf5',
    d: 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z' },
  agy: { box: '11 16 90 82', fill: '#3186ff',
    d: 'M89.6992 93.695C94.3659 97.195 101.366 94.8617 94.9492 88.445C75.6992 69.7783 79.7825 18.445 55.8659 18.445C31.9492 18.445 36.0325 69.7783 16.7825 88.445C9.78251 95.445 17.3658 97.195 22.0325 93.695C40.1159 81.445 38.9492 59.8617 55.8659 59.8617C72.7825 59.8617 71.6159 81.445 89.6992 93.695Z' }
};
function vtUsageLogo(kind) {
  var l = VT_USAGE_LOGOS[kind];
  return l ? '<svg class="cu-logo" viewBox="' + l.box + '" aria-hidden="true"><path fill="' + l.fill +
             '" d="' + l.d + '"/></svg>' : '';
}
// One row per provider (v1.38.183). Before that each strip was a brand column
// beside two stacked chips — two lines each, four lines of a phone screen for
// four percentages. Now a strip is ONE line: brand, the 5-hour window, the
// weekly window. Stacked on a phone (two lines for both),
// side by side on a desktop (one line for both).
//
// The row is built from the same nine cells in the same order for every strip,
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
// How old the reading is, for the row's tooltip — and whether it is too old to
// trust. The age used to be printed at the end of every row ("1m ago"), which
// cost a whole column on a phone to say, nearly always, "this is current".
// Now a current reading says nothing, and an old one GREYS THE ROW (v1.38.188):
// the numbers stay, but they stop looking like live ones.
var VT_USAGE_OLD_SEC = 15 * 60;
function vtUsageOld(d) {
  return !!(d && (d.stale || (d.ageSec || 0) > VT_USAGE_OLD_SEC));
}
function vtUsageAgeTitle(d) {
  return (d && (d.ageSec || 0) >= 60) ? 'read ' + ageText(d.ageSec) + ' ago' : 'just read';
}
// Pick the longest reset text that keeps every enabled strip on its one line.
// It works on BOTH strips at once: they share columns, so they must also share
// a form — "2h 10m (2:30 PM)" over "4h02m" reads as two different displays.
//   desktop: full ("2h 10m (2:30 PM)"); if the strips wrap onto more than one
//            line, the countdown alone — but only if that saves a line.
//   phone:   countdown ("2h 10m"), then "2h10m", then the same with the gaps
//            closed up, and only then no reset text at all.
//            A tap swaps the countdown for the clock time for a few seconds.
// A reset text that does not fit is EMPTIED, never removed: on a phone it is a
// grid cell, and taking a cell out slides every later column one place left.
var vtUsageAt = false, vtUsageAtTimer = null;
function vtFitUsage() {
  var wrap = document.getElementById('cu-strips');
  if (!wrap) return;
  var dims = wrap.querySelectorAll('.cu-dim[data-full]');
  var narrow = window.matchMedia('(max-width: 680px)').matches;
  function show(form, tight) {
    var i;
    for (i = 0; i < dims.length; i++) dims[i].textContent = form ? dims[i].dataset[form] : '';
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
    strip.classList.toggle('cu-old', vtUsageOld(d));
    var html = '<span class="cu-brand" title="Claude — ' + vtUsageAgeTitle(d) + '">' +
               vtUsageLogo('claude') + 'Claude</span>';   // short enough for a phone as it is
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
    html +=
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
    strip.classList.toggle('cu-old', vtUsageOld(data));
    var html = '<span class="cu-brand" title="' + cfg.brand + ' — ' + vtUsageAgeTitle(data) + '">' +
               vtUsageLogo(cfg.logo) +
               '<span class="cu-long">' + cfg.brand +
               '</span><span class="cu-short">' + (cfg.short || cfg.brand) + '</span></span>';
    var now = Math.floor(Date.now() / 1000);
    function current(w) {
      return w && w.pct != null && (w.reset ? w.reset > now : !data.stale);
    }
    var hasSession = current(data.session), hasWeekly = current(data.weekly);
    if (hasSession || hasWeekly) {
      html += vtUsageSeg('5h', named('session (5h)', data.session), hasSession ? data.session : null) +
              vtUsageSeg('wk', named('week (7d)', data.weekly), hasWeekly ? data.weekly : null);
    } else {
      var hadReading = data.updated || data.session || data.weekly;
      html += '<span class="cu-msg">' + (data.note || (hadReading
        ? 'usage unavailable — waiting for a new reading'
        : cfg.waiting)) + '</span>';
    }
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
    brand: 'Codex', logo: 'codex', waiting: 'waiting for first Codex response…' });
  if (cx) { window.applyServerCodexUsage = cx.apply; window.toggleCodexUsage = cx.toggle; }
  var ag = vtDisplayStrip({ strip: 'ag-strip', x: 'ag-x', row: 'agyusage', key: 'agyUsage',
    brand: 'Antigravity', short: 'Agy', logo: 'agy', waiting: 'asking the Antigravity CLI…' });
  if (ag) { window.applyServerAgyUsage = ag.apply; window.toggleAgyUsage = ag.toggle; }
})();

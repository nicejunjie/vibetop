/*! apph.js — set the shell height from the REAL usable viewport in an iOS standalone PWA.
 *
 * The bug: after a Cloudflare Access login, an installed PWA freezes the CSS unit
 * `svh` too SHORT (e.g. 753 on a 956px screen), so `body{height:100svh}` leaves a
 * black band below the taskbar. Confirmed on-device (diagnostic) that ONLY `svh` is
 * wrong — `visualViewport.height`, `clientHeight`, `innerHeight`, and `dvh` all
 * correctly report the true usable height (894 = screen − status bar). A reload does
 * NOT unfreeze `svh`. Successive (already-authed) sessions never leave scope so never
 * freeze; this only bites right after the cross-origin login.
 *
 * The fix: in standalone, drive `--app-h` from the CORRECT metrics instead of `svh`.
 * We use max(visualViewport.height, documentElement.clientHeight) — both measure the
 * content area BELOW the opaque status bar, so they can never overshoot into the
 * status-bar strip the way `100vh`/`lvh` (956) do. We keep the running MAX (reset on
 * a width change = rotation) so the soft keyboard — which only shrinks the visual
 * viewport — can never shrink the shell. In regular Safari the module is inert and
 * `body` keeps its `100svh` default (correct there).
 *
 * Diagnostic overlay (metrics + a colored line at each candidate height): enable with
 * #vhdbg or localStorage.vhdbg='1'.
 */
(function () {
  'use strict';

  var force = /(^|[#&])vhdbg/.test(location.hash);
  try { if (localStorage.getItem('vhdbg') === '1') force = true; } catch (e) {}

  var standalone = false;
  try {
    standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) ||
                 window.navigator.standalone === true;
  } catch (e) {}
  if (!standalone && !force) return;

  var root = document.documentElement;

  // Content-area height: the visual viewport and the layout viewport (clientHeight)
  // both exclude the opaque status bar and are NOT frozen (only `svh` is), so their
  // max is the true usable height and can never exceed it (no status-bar overshoot).
  function contentH() {
    var vv = window.visualViewport;
    var vvh = vv ? vv.height : 0;
    var ch = root.clientHeight || 0;
    var h = Math.max(vvh, ch);
    var sc = screen.height || 0;
    if (sc > 0) h = Math.min(h, sc);   // never taller than the physical screen
    return Math.round(h);
  }

  var maxH = 0, lastW = 0;
  function apply() {
    if (!standalone) { if (force) diag(); return; }
    var w = window.innerWidth;
    if (w !== lastW) { lastW = w; maxH = 0; }   // rotation / Split View: re-baseline
    var h = contentH();
    if (h > maxH) maxH = h;                       // keyboard only shrinks vv -> ignored by max
    if (maxH > 0) root.style.setProperty('--app-h', maxH + 'px');
    if (force) diag();
  }

  function tick() { apply(); [80, 300, 800, 1800].forEach(function (ms) { setTimeout(apply, ms); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick);
  else tick();
  addEventListener('load', tick);
  addEventListener('pageshow', tick);
  addEventListener('focus', tick);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
  addEventListener('orientationchange', tick);
  addEventListener('resize', apply);
  if (window.visualViewport) {
    visualViewport.addEventListener('resize', apply);
    visualViewport.addEventListener('scroll', apply);
  }

  // ---- diagnostic overlay (gated) --------------------------------------------------
  var probes = {};
  function probeH(unit) {
    if (!document.body) return 0;
    var el = probes[unit];
    if (!el) {
      el = document.createElement('div');
      el.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:' + unit +
        ';visibility:hidden;pointer-events:none;z-index:-1;';
      document.body.appendChild(el);
      probes[unit] = el;
    }
    return Math.round(el.getBoundingClientRect().height);
  }
  var METRICS = [
    ['svh', '#ff4444', function () { return probeH('100svh'); }],
    ['dvh', '#ff9900', function () { return probeH('100dvh'); }],
    ['lvh', '#ff44ff', function () { return probeH('100lvh'); }],
    ['vh',  '#ffffff', function () { return probeH('100vh'); }],
    ['clientH', '#ffee00', function () { return root.clientHeight; }],
    ['innerH',  '#44ff44', function () { return window.innerHeight; }],
    ['vv.h',    '#00eaff', function () { var v = window.visualViewport; return v ? Math.round(v.height) : 0; }],
    ['appH',    '#4488ff', function () { return maxH; }]
  ];
  var panel = null, lines = null;
  function diag() {
    if (!document.body) return;
    if (!panel) {
      panel = document.createElement('pre');
      panel.style.cssText = 'position:fixed;top:56px;left:6px;z-index:2147483647;margin:0;' +
        'padding:8px 10px;background:rgba(0,0,0,.82);color:#fff;border-radius:8px;' +
        'font:13px/1.7 ui-monospace,monospace;white-space:pre;pointer-events:none;box-shadow:0 0 0 1px #fff3;';
      document.body.appendChild(panel);
      lines = {};
      METRICS.forEach(function (m, i) {
        var ln = document.createElement('div');
        ln.style.cssText = 'position:fixed;left:0;height:2px;z-index:2147483646;pointer-events:none;' +
          'background:' + m[1] + ';width:' + (100 - i * 8) + '%;';
        document.body.appendChild(ln);
        lines[m[0]] = ln;
      });
    }
    var rows = [];
    METRICS.forEach(function (m) {
      var v = Math.round(m[2]() || 0);
      rows.push((m[0] + '        ').slice(0, 8) + v);
      lines[m[0]].style.top = (v > 0 ? v - 1 : -9) + 'px';
    });
    panel.textContent = rows.join('\n') +
      '\nbodyH   ' + Math.round(document.body.getBoundingClientRect().height) +
      '\nscreen  ' + screen.width + 'x' + screen.height + '  dpr ' + window.devicePixelRatio;
  }
})();

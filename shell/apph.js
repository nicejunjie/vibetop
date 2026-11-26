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
 * content area BELOW the opaque status bar. iOS can briefly report a full-screen
 * height while resuming, though, so only keep the running MAX while the keyboard
 * is up; otherwise follow the current measurement back down. In regular Safari
 * the module is inert and
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
  var root = document.documentElement;
  // iOS 27 paints a scroll-edge blur over the first controls in Home Screen
  // web apps. Mark the shell for a fixed color-extension candidate at the top.
  // Safari 26+ freezes the OS part of its UA at 18_*, so use Version/27 instead.
  var ios27 = /(?:iPhone|iPad|iPod)/.test(navigator.userAgent) &&
              /\bVersion\/27(?:\.|\b)/.test(navigator.userAgent);
  function syncTopEdge() {
    // Re-probe after login/resume; iOS can initially report browser mode.
    try {
      if ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
          window.navigator.standalone === true) standalone = true;
    } catch (_) {}
    root.classList.toggle('ios27-standalone', ios27 && standalone);
  }
  syncTopEdge();

  // Do NOT bail on the standalone probe alone. `svh` is the one metric iOS has been
  // caught freezing (see the header), and on the first load back from the Cloudflare
  // Access login the probe reports FALSE — so this module used to return here and
  // leave body on the frozen `100svh`, which is the short shell with the prompt line
  // cut off. Every later load detects standalone, this runs, and the shell is fine:
  // that is exactly the "only the first session after login is wrong" report.
  //
  // So measure instead of trusting the probe: if `svh` disagrees with the metrics
  // that stay correct by more than a URL bar's worth, this page IS in the frozen
  // state and must drive --app-h whatever the probe says. In ordinary Safari at load
  // the two agree (both include the URL bar), so this never fires there.
  function svhFrozen() {
    var host = document.body || root;
    if (!host) return false;
    try {
      var p = document.createElement('div');
      p.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:100svh;' +
                        'visibility:hidden;pointer-events:none;z-index:-1';
      host.appendChild(p);
      var svh = Math.round(p.getBoundingClientRect().height);
      p.remove();
      var truth = Math.max(window.visualViewport ? window.visualViewport.height : 0,
                           root.clientHeight || 0);
      return svh > 0 && truth > 0 && (truth - svh) > 100;
    } catch (e) { return false; }
  }
  // Needs <body>, so it cannot run at parse time (this script is in <head>).
  // Idempotent and cheap; the frozen state persists for the page's life, so a couple
  // of checks are enough and re-running after activation costs nothing.
  function activateIfFrozen() {
    if (standalone) return;
    if (svhFrozen()) { standalone = true; syncTopEdge(); apply(); }
  }
  if (!standalone && !force) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', activateIfFrozen);
    } else { activateIfFrozen(); }
    setTimeout(activateIfFrozen, 800);        // backstop for a slow first paint
  }

  // Content-area height: the visual viewport and the layout viewport (clientHeight)
  // normally exclude the opaque status bar. A resume animation can briefly make
  // either one too tall, so apply() must not latch an old maximum indefinitely.
  function contentH() {
    var vv = window.visualViewport;
    var vvh = vv ? vv.height : 0;
    var ch = root.clientHeight || 0;
    var h = Math.max(vvh, ch);
    var sc = screen.height || 0;
    if (sc > 0) h = Math.min(h, sc);   // never taller than the physical screen
    return Math.round(h);
  }

  // ---- iOS can show the web view from the very top of the screen ------------------
  // Normally an installed app's web view starts below the status bar and its
  // metrics give that area (894 of a 956pt screen). After a launch that booted
  // hidden, iOS 27 shows it full-screen instead, for the page's life and across
  // reloads: clientHeight/innerHeight/visualViewport all say 956 and
  // env(safe-area-inset-top) says 62 (logged 2026-11-21 14:12 with the body at
  // 0..894 and a screenshot showing exactly that). The numbers are honest, so the
  // shell has to keep clear of the bar itself: --app-top moves it down by the
  // inset and --app-h loses the same amount.
  var isIOS = /(?:iPhone|iPad|iPod)/.test(navigator.userAgent);
  var BAR_KEY = 'vt:statusbar-h';
  var satProbe = null;
  function safeTop() {
    if (!document.body || !document.createElement) return 0;
    try {
      if (!satProbe || !satProbe.parentNode) {
        satProbe = document.createElement('div');
        satProbe.style.cssText = 'position:fixed;top:0;left:0;width:1px;' +
          'height:env(safe-area-inset-top);visibility:hidden;pointer-events:none;z-index:-1';
        document.body.appendChild(satProbe);
      }
      return Math.round(satProbe.getBoundingClientRect().height) || 0;
    } catch (e) { return 0; }
  }
  function learnedBar() {
    try { var v = parseInt(localStorage.getItem(BAR_KEY), 10); return v >= 16 && v <= 80 ? v : 0; }
    catch (e) { return 0; }
  }
  var barH = 0;
  // How much of a reported `h` is really the status bar's strip (0 = none).
  function barExcess(h) {
    if (!isIOS) return 0;
    var sc = screen.height || 0;
    var portrait = !(window.innerWidth > window.innerHeight);
    if (!portrait || sc <= 0) return 0;      // landscape iPhone has no status bar
    var gap = sc - h;
    if (gap >= 16 && gap <= 80) {            // the normal state: remember the bar
      if (gap !== barH) { barH = gap; try { localStorage.setItem(BAR_KEY, String(gap)); } catch (e) {} }
      return 0;
    }
    if (gap > 1) return 0;                   // keyboard / Split View / anything else
    // Reported full-screen. iOS gives the strip as the top safe area there; fall
    // back to the gap this device showed while its numbers were right.
    return safeTop() || barH || learnedBar();
  }

  // Everything JS can see about where the page sits, for the manager log.
  function snapshot(why, h, top) {
    var vv = window.visualViewport, body = document.body, se = document.scrollingElement;
    var br = null;
    try { br = body && body.getBoundingClientRect(); } catch (e) {}
    return { k: 'shell-height', why: why, appH: h, cut: top, sat: safeTop(), bar: barH || learnedBar(),
      ch: root.clientHeight || 0, ih: window.innerHeight || 0, oh: window.outerHeight || 0,
      vvh: vv ? Math.round(vv.height) : 0, vvt: vv ? Math.round(vv.offsetTop) : 0,
      vpt: vv ? Math.round(vv.pageTop) : 0,
      sy: Math.round(window.scrollY || 0), st: se ? Math.round(se.scrollTop) : 0,
      bt: br ? Math.round(br.top) : 0, bb: br ? Math.round(br.bottom) : 0,
      sc: screen.height || 0, sah: screen.availHeight || 0,
      hid: !!document.hidden, bootHid: bootHidden };
  }
  function send(entry) {
    try {
      fetch('/api/clientlog', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ua: navigator.userAgent, at: Date.now(), sw: [], guard: [entry] })
      }).catch(function () {});
    } catch (e) {}
  }
  var lastReport = '', lastReportAt = 0;
  function report(h, top) {
    var key = h + '/' + top;
    if (key === lastReport) return;
    var now = Date.now();
    if (now - lastReportAt < 5000) return;
    lastReport = key; lastReportAt = now;
    send(snapshot('height', h, top));
  }

  var bootHidden = false;
  try { bootHidden = !!document.hidden; } catch (e) {}

  var BLUR_CLEAR = 24;
  var maxH = 0, lastW = 0, lastCut = 0, lastApplied = 0, lastTop = -1;
  function apply() {
    if (!standalone) { if (force) diag(); return; }
    var w = window.innerWidth;
    if (w !== lastW) { lastW = w; maxH = 0; }   // rotation / Split View: re-baseline
    var top = barExcess(contentH());
    // iOS 27 blurs what is drawn in roughly the first 24pt below the status bar in
    // this state, and none of three top-edge candidates (v1.38.175/176/179) made
    // it stop. Measured on a device screenshot: a row at 67..85pt is blurred, the
    // next at 91pt is sharp. So start the shell that much lower; a short band of
    // empty background is the price of a readable first row.
    if (top > 0 && ios27) top += BLUR_CLEAR;
    var h = contentH() - top;
    lastCut = top;
    // The keyboard shrinks the visual viewport. Usually clientHeight stays at
    // the no-keyboard height, but iOS's shell-scrolled mode can shrink it too.
    // Compare with our prior shell height in that mode. A resume oversize is
    // only about a status-bar strip, far below the keyboard threshold.
    var vv = window.visualViewport;
    var keyboardUp = vv && (Math.max(root.clientHeight || 0, maxH) - vv.height > 150);
    if (keyboardUp) { if (h > maxH) maxH = h; }
    else maxH = h;
    if (maxH > 0 && maxH !== lastApplied) { lastApplied = maxH; root.style.setProperty('--app-h', maxH + 'px'); }
    if (!keyboardUp && top !== lastTop) {
      lastTop = top;
      root.style.setProperty('--app-top', top + 'px');
      root.classList.toggle('under-statusbar', top > 0);
    }
    if (top > 0 || lastReport) report(maxH, top);
    if (force) diag();
  }

  var edgeState = null, edgeTimer, settleTimers = [];
  function restoreTopEdge() {
    var state = edgeState;
    if (!state) return;
    edgeState = null;
    clearTimeout(state.timeout);
    state.edge.style.display = '';
  }
  function refreshTopEdge() {
    syncTopEdge();
    if (!ios27 || !standalone || document.hidden || edgeState) return;
    var edge = document.getElementById && document.getElementById('ios27-top-edge');
    if (!edge || typeof requestAnimationFrame !== 'function') return;
    var state = edgeState = { edge: edge, timeout: null };
    // Restore even if the browser stops delivering animation frames. Stale
    // callbacks must never restore or clear a subsequent refresh cycle.
    function restore() { if (edgeState === state) restoreTopEdge(); }
    state.timeout = setTimeout(restore, 250);
    edge.style.display = 'none';
    requestAnimationFrame(function() {
      if (edgeState !== state) return;
      requestAnimationFrame(restore);
    });
  }
  function scheduleTopEdge() {
    clearTimeout(edgeTimer);
    if (ios27 && standalone && !document.hidden) edgeTimer = setTimeout(refreshTopEdge, 120);
  }
  function settle() { syncTopEdge(); apply(); }
  function tick() {
    settle(); scheduleTopEdge(); vfArm();
    settleTimers.forEach(clearTimeout);
    settleTimers = [80, 300, 800, 1800].map(function(ms) { return setTimeout(settle, ms); });
  }
  function viewportChanged() { settle(); scheduleTopEdge(); }
  function suspendTopEdge() {
    clearTimeout(edgeTimer);
    settleTimers.forEach(clearTimeout); settleTimers = [];
    restoreTopEdge();
  }
  addEventListener('pagehide', suspendTopEdge);
  addEventListener('vibetop:wake', tick);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick);
  else tick();
  addEventListener('load', tick);
  addEventListener('pageshow', tick);
  addEventListener('focus', tick);
  document.addEventListener('visibilitychange', function () { if (document.hidden) suspendTopEdge(); else { vfRearm(); tick(); } });
  addEventListener('orientationchange', tick);
  addEventListener('resize', viewportChanged);
  if (window.visualViewport) {
    visualViewport.addEventListener('resize', viewportChanged);
    visualViewport.addEventListener('scroll', viewportChanged);
  }
  // The full-screen report above starts with no event at all, and so can its end.
  // Re-measure on a slow clock.
  if (typeof setInterval === 'function') {
    setInterval(function () { if (!document.hidden) apply(); }, 2000);
  }

  // ---- EXPERIMENT vfexp (temporary; remove with the build that settles it) --------
  // Question: what do WebKit and the Home Screen host do with the top of the screen
  // when the page stops asking for `viewport-fit=cover`? WebKit then contains the
  // safe area itself (UIScrollView contentInsetAdjustmentBehavior = Always,
  // WKWebViewIOS.mm _updateScrollViewInsetAdjustmentBehavior) and tells the host
  // through -_webView:didChangeSafeAreaShouldAffectObscuredInsets:. Unknown: the
  // resulting layout height, whether the first row is blurred, and whether going
  // back to `cover` afterwards leaves the full-screen state healed.
  //
  // Phases, each labelled on a ruler drawn just under the status bar so a
  // screenshot shows which phase it is and how far down the blur reaches:
  //   cover (as launched) -> auto -> cover2 (restored).
  // One POST at the end carries a snapshot per phase (the endpoint is rate-limited).
  // Runs on every load in the full-screen state ("A"), and once per build in the
  // normal state ("N").
  var VFEXP_BUILD = 'vfexp-1';
  var VFEXP_PHASE_MS = 9000;
  var vfexpRan = false, vfexpDone = false;
  function vfSnap(why) {
    var e = snapshot(why, maxH, lastCut);
    var se = document.scrollingElement, meta = document.querySelector('meta[name="viewport"]');
    e.sab = (function () {
      try {
        var d = document.createElement('div');
        d.style.cssText = 'position:fixed;bottom:0;left:0;width:1px;height:env(safe-area-inset-bottom);visibility:hidden';
        document.body.appendChild(d);
        var v = Math.round(d.getBoundingClientRect().height); d.remove(); return v;
      } catch (_) { return -1; }
    })();
    e.sh = se ? se.scrollHeight : 0;
    e.svh = probeH('100svh'); e.lvh = probeH('100lvh'); e.dvh = probeH('100dvh');
    // Can the document be moved? (316008 reports a scrollable page in this family.)
    try { window.scrollTo(0, 40); e.scrolled = Math.round(window.scrollY || 0); window.scrollTo(0, 0); }
    catch (_) { e.scrolled = -1; }
    e.vp = meta ? (/viewport-fit=\w+/.exec(meta.content) || ['none'])[0] : 'nometa';
    return e;
  }
  function vfRuler(label) {
    var r = document.getElementById('vfexp-ruler');
    if (!label) { if (r) r.remove(); return; }
    if (!r) {
      r = document.createElement('div');
      r.id = 'vfexp-ruler';
      // Narrow and right-aligned: under 90% of the width and away from the top
      // centre, so WebKit's fixed-edge sampler never picks it as the top candidate.
      r.style.cssText = 'position:fixed;top:env(safe-area-inset-top);right:0;width:96px;height:72px;' +
        'z-index:2147483646;pointer-events:none;background:#000;color:#fff;' +
        'font:9px/6px ui-monospace,monospace;overflow:hidden';
      var rows = '';
      for (var y = 0; y < 72; y += 6) {
        rows += '<div style="height:6px;box-shadow:inset 0 1px 0 #fff;padding-left:2px">' + y + ' <span></span></div>';
      }
      r.innerHTML = rows;
      document.body.appendChild(r);
    }
    var spans = r.getElementsByTagName('span');
    for (var i = 0; i < spans.length; i++) spans[i].textContent = label;
  }
  function vfExperiment() {
    if (vfexpRan || !standalone || !ios27 || document.hidden || !document.body) return;
    if (typeof document.querySelector !== 'function') return;
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta || !/viewport-fit=cover/.test(meta.content)) return;
    var portrait = !(window.innerWidth > window.innerHeight);
    if (!portrait) return;
    var state = (root.clientHeight || 0) >= (screen.height || 0) - 1 ? 'A' : 'N';
    if (state === 'N') {
      try {
        if (localStorage.getItem('vt:vfexp') === VFEXP_BUILD) return;
        localStorage.setItem('vt:vfexp', VFEXP_BUILD);
      } catch (_) { return; }
    }
    vfexpRan = true;
    var cover = meta.content, out = [];
    vfRuler(state + ' cover');
    setTimeout(function () {
      out.push(vfSnap('vfexp ' + state + ' cover'));
      meta.content = cover.replace('viewport-fit=cover', 'viewport-fit=auto');
      vfRuler(state + ' AUTO');
      setTimeout(function () {
        out.push(vfSnap('vfexp ' + state + ' auto'));
        meta.content = cover;
        vfRuler(state + ' cover2');
        setTimeout(function () {
          out.push(vfSnap('vfexp ' + state + ' cover2'));
          vfRuler(null);
          vfexpDone = true;
          try {
            fetch('/api/clientlog', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
              keepalive: true, headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ua: navigator.userAgent, at: Date.now(), sw: [], guard: out })
            }).catch(function () {});
          } catch (_) {}
        }, VFEXP_PHASE_MS);
      }, VFEXP_PHASE_MS);
    }, VFEXP_PHASE_MS);
  }
  // Start once the page has been visible and settled for a moment.
  // Called from tick() (load / pageshow / focus / becoming visible).
  function vfArm() { if (!vfexpRan && !document.hidden) setTimeout(vfExperiment, 2500); }
  // A finished run may repeat when the app is brought back to the front (state A
  // only; the normal state is still limited to once per build by localStorage).
  function vfRearm() { if (vfexpDone) { vfexpDone = false; vfexpRan = false; } }

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
      '\nbarCut  ' + lastCut + '  safeTop ' + safeTop() + '  bar ' + (barH || learnedBar()) +
      '\nscreen  ' + screen.width + 'x' + screen.height + '  dpr ' + window.devicePixelRatio +
      '\ninstalled ' + standalone + '  ios27 ' + ios27 +
      '\nedgeClass ' + root.classList.contains('ios27-standalone') +
      '\nedgeDisplay ' + (document.getElementById('ios27-top-edge') ? getComputedStyle(document.getElementById('ios27-top-edge')).display : 'missing') +
      '\nnavStandalone ' + navigator.standalone +
      '\nmediaStandalone ' + !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) +
      '\nUA ' + navigator.userAgent;
  }
})();

/**
 * Patches for xpra HTML5 client.
 * Injected via nginx sub_filter. Designed to degrade gracefully if
 * xpra's API changes — each patch is wrapped in try/catch.
 */
(function() {
  'use strict';

  // Shared client-side view zoom — Safari-style magnification of the rendered
  // canvas (same remote layout, just bigger pixels + pan), applied as a CSS
  // transform on #screen (see patch 4). getMouse (patch 1) divides click
  // coordinates by .z so taps still land correctly while magnified.
  var VIEWZOOM = { z: 1, px: 0, py: 0, min: 1, max: 6 };

  // 0. Suppress "leave site?" confirmation on refresh/close.
  try {
    window.onbeforeunload = null;
    Object.defineProperty(window, 'onbeforeunload', { get: function() { return null; }, set: function() {}, configurable: true });
    var origAEL = window.addEventListener.bind(window);
    window.addEventListener = function(type) {
      if (type === 'beforeunload') return;
      return origAEL.apply(null, arguments);
    };
  } catch(e) {
    console.warn('[xpra-patches] beforeunload patch failed:', e.message);
  }

  // 1. Mouse offset fix: getMouse uses clientX/clientY (viewport coords)
  //    but the canvas may not start at (0,0). Patch to use canvas-relative coords.
  try {
    var P = XpraClient.prototype;
    var origGM = P.getMouse;
    P.getMouse = function(e) {
      var r = origGM.call(this, e);
      if (e.target && e.target.getBoundingClientRect) {
        var b = e.target.getBoundingClientRect();
        // b reflects the CSS view-zoom transform, so divide the offset by the
        // zoom factor to recover real canvas coordinates (z=1 → unchanged).
        var z = VIEWZOOM.z || 1;
        r.x = this.last_mouse_x = Math.round((e.clientX - b.left) / z * (this.scale || 1));
        r.y = this.last_mouse_y = Math.round((e.clientY - b.top) / z * (this.scale || 1));
      }
      return r;
    };
  } catch(e) {
    console.warn('[xpra-patches] getMouse patch failed:', e.message);
  }

  // 2. Scroll fix: xpra's default scroll handler accumulates wheel deltas
  //    to 120 units before sending, which makes slow trackpad scrolling
  //    unresponsive. Replace with immediate per-event dispatch.
  try {
    var P = XpraClient.prototype;
    P.on_mousescroll = function(e, win) {
      if (this.server_readonly || this.mouse_grabbed || !this.connected || (!win && this.server_is_shadow))
        return false;
      var mouse = this.getMouse(e);
      var mx = Math.round(mouse.x), my = Math.round(mouse.y);
      var modifiers = this._keyb_get_modifiers(e);
      var wid = 0, coords = [mx, my];
      if (win) {
        wid = win.wid;
        var pos = win.get_internal_geometry();
        coords.push(Math.round(mouse.x - pos.x));
        coords.push(Math.round(mouse.y - pos.y));
      }
      var norm = Utilities.normalizeWheel(e);
      var dy = norm.pixelY, dx = norm.pixelX;
      // Cap clicks per event: a fast trackpad fling reports deltas in the
      // thousands, which would burst hundreds of packets down the (possibly
      // tunneled) websocket and lag everything behind them.
      var MAX_CLICKS = 10;
      if (dy !== 0) {
        var btn = dy > 0 ? 5 : 4;
        var n = Math.min(MAX_CLICKS, Math.max(1, Math.round(Math.abs(dy) / 30)));
        for (var i = 0; i < n; i++) {
          this.send([PACKET_TYPES.button_action, wid, btn, true, coords, modifiers, []]);
          this.send([PACKET_TYPES.button_action, wid, btn, false, coords, modifiers, []]);
        }
      }
      if (dx !== 0) {
        var btn = dx > 0 ? 7 : 6;
        var n = Math.min(MAX_CLICKS, Math.max(1, Math.round(Math.abs(dx) / 30)));
        for (var i = 0; i < n; i++) {
          this.send([PACKET_TYPES.button_action, wid, btn, true, coords, modifiers, []]);
          this.send([PACKET_TYPES.button_action, wid, btn, false, coords, modifiers, []]);
        }
      }
      e.preventDefault();
      return false;
    };
  } catch(e) {
    console.warn('[xpra-patches] scroll patch failed:', e.message);
  }

  // 3. Mobile on-screen keyboard. We hide xpra's permanent simple-keyboard and
  //    show/hide it via a floating button. We can't auto-detect taps on remote
  //    text inputs (the screen is a canvas — there's no DOM to introspect), so
  //    auto-showing on any tap was too aggressive. The button sits at the
  //    bottom-right (thumb-reachable) when closed and morphs into a red
  //    "✕ Hide" pill above the keyboard when open. Two-finger gestures are
  //    NOT intercepted so xpra's native pinch handling keeps working.
  try {
    var css = document.createElement('style');
    css.textContent =
      '.simple-keyboard{display:none!important}' +
      'body.xpra-vkb .simple-keyboard{display:block!important}' +
      // Closed: ⌨ chip at the bottom-right where the thumb rests on mobile.
      '#vkb-toggle{position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));' +
        'z-index:2147483647;min-width:48px;height:48px;padding:0 14px;border-radius:24px;' +
        'background:#2d6cc0;color:#fff;border:1px solid #2d6cc0;box-shadow:0 4px 14px rgba(0,0,0,.5);' +
        'font:600 18px/48px system-ui,sans-serif;text-align:center;cursor:pointer;' +
        '-webkit-user-select:none;user-select:none;display:none;' +
        'touch-action:manipulation;white-space:nowrap}' +
      // Open: red dismiss pill. `bottom` is set dynamically in JS to sit right
      // above the actual keyboard, since the keyboard's height varies by
      // device/orientation. The CSS fallback (40vh) is a rough guess used only
      // until the first measurement lands.
      'body.xpra-vkb #vkb-toggle{bottom:calc(40vh + 4px);' +
        'background:#d23a2a;color:#fff;border-color:#d23a2a;padding:0 18px;font-size:15px}' +
      '@media (max-width:900px),(pointer:coarse){#vkb-toggle{display:inline-block}}';
    document.head.appendChild(css);

    var addBtn = function() {
      if (document.getElementById('vkb-toggle')) return;
      var b = document.createElement('div');
      b.id = 'vkb-toggle';
      b.title = 'Toggle keyboard';
      var positionAboveKbd = function() {
        var kbd = document.querySelector('.simple-keyboard');
        if (!kbd) { b.style.bottom = ''; return; }
        var r = kbd.getBoundingClientRect();
        if (r.height > 0) b.style.bottom = (window.innerHeight - r.top + 4) + 'px';
      };
      var setState = function() {
        var open = document.body.classList.contains('xpra-vkb');
        b.textContent = open ? '✕  Hide keyboard' : '⌨';
        if (open) {
          // Defer one frame so the keyboard has laid out, then re-measure.
          requestAnimationFrame(positionAboveKbd);
        } else {
          b.style.bottom = '';
        }
      };
      setState();
      var toggle = function(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        document.body.classList.toggle('xpra-vkb');
        setState();
      };
      // Reposition on viewport changes (rotation, address-bar collapse, etc.).
      window.addEventListener('resize', function() {
        if (document.body.classList.contains('xpra-vkb')) positionAboveKbd();
      });
      b.addEventListener('touchend', toggle, { passive: false });
      b.addEventListener('click', toggle);
      document.body.appendChild(b);
    };
    if (document.body) addBtn();
    else document.addEventListener('DOMContentLoaded', addBtn);
  } catch(e) {
    console.warn('[xpra-patches] keyboard patch failed:', e.message);
  }

  // 4. Mobile zoom — Safari-style pinch magnification + visible +/− buttons.
  //    The parent desktop disables iOS's own pinch-zoom, so we implement it
  //    here as a CSS transform on #screen: the remote layout is UNCHANGED
  //    (no font/zoom keystrokes to Chromium), we just magnify the rendered
  //    canvas and let the user pan around it — exactly how Safari zooms a page.
  //    Purely client-side; the remote never sees it. +/−/⟲ buttons expose it
  //    for phones that don't pinch naturally.
  try {
    var screenElGet = function() { return document.getElementById('screen'); };

    // Apply the current zoom/pan as a CSS transform on #screen, clamping the
    // pan so the magnified canvas can't be dragged off the viewport.
    var applyZoom = function() {
      var s = screenElGet(); if (!s) return;
      var vw = window.innerWidth, vh = window.innerHeight;
      var minPx = vw * (1 - VIEWZOOM.z), minPy = vh * (1 - VIEWZOOM.z);
      VIEWZOOM.px = Math.min(0, Math.max(minPx, VIEWZOOM.px));
      VIEWZOOM.py = Math.min(0, Math.max(minPy, VIEWZOOM.py));
      s.style.transformOrigin = '0 0';
      s.style.transform = VIEWZOOM.z === 1 ? '' :
        'translate(' + VIEWZOOM.px + 'px,' + VIEWZOOM.py + 'px) scale(' + VIEWZOOM.z + ')';
    };
    // Zoom to newZ while keeping the content point under (cx,cy) stationary.
    var zoomAt = function(cx, cy, newZ) {
      newZ = Math.max(VIEWZOOM.min, Math.min(VIEWZOOM.max, newZ));
      var contentX = (cx - VIEWZOOM.px) / VIEWZOOM.z;
      var contentY = (cy - VIEWZOOM.py) / VIEWZOOM.z;
      VIEWZOOM.px = cx - contentX * newZ;
      VIEWZOOM.py = cy - contentY * newZ;
      VIEWZOOM.z = newZ;
      applyZoom();
    };
    var zoomBy = function(factor, cx, cy) {
      if (cx == null) { cx = window.innerWidth / 2; cy = window.innerHeight / 2; }
      zoomAt(cx, cy, VIEWZOOM.z * factor);
    };
    var zoomReset = function() { VIEWZOOM.z = 1; VIEWZOOM.px = 0; VIEWZOOM.py = 0; applyZoom(); };
    var midpoint = function(t) {
      return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 };
    };
    // Orientation flips invalidate the pan math — reset to 1x.
    window.addEventListener('orientationchange', zoomReset);

    // --- Unified touch handling: pinch-zoom, drag-pan/scroll, tap-click ---
    // Registered on window in CAPTURE phase so we run BEFORE xpra's own touch
    // handlers on #screen (which would otherwise translate every touch into a
    // mousedown+drag, breaking scroll and treating swipes as text-selection).
    //
    // We take over all touch events on the screen entirely:
    //   - 2 fingers → pinch magnifies the view (CSS transform, no remote zoom)
    //   - 1 finger drag, zoomed in → pan the magnified view
    //   - 1 finger drag, at 1x → wheel events sent to remote (scroll the page)
    //   - 1 finger, no movement → synthetic mousedown/mouseup at touch point
    //     forwarded to xpra as a click
    //
    // xpra's wheel and mouse handlers on #screen forward synthetic events to
    // the remote just fine (its forwarders don't check event.isTrusted).
    // xpra attaches its wheel/mouse listeners to the <canvas> inside #screen,
    // not to the wrapper. Wheel/mouse events don't propagate down to children,
    // so we must dispatch directly on the canvas for xpra to forward them.
    var canvasGet = function() {
      var s = screenElGet();
      return s ? s.querySelector('canvas') : null;
    };
    var dist2 = function(t) {
      var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };
    var TAP_PX = 10;
    // SCROLL_TICK: pixels of finger travel per emitted wheel event. The remote
    // Chromium amplifies each wheel deltaY by ~3 lines (Chrome's default), so
    // dividing the raw finger delta keeps page scroll close to finger speed.
    // Higher value = slower scroll relative to finger.
    var SCROLL_TICK = 33;
    var touch = { mode: null, sx: 0, sy: 0, lx: 0, ly: 0, pinch: 0, accum: 0, accumX: 0 };

    var fireWheel = function(x, y, dx, dy) {
      var c = canvasGet(); if (!c) return;
      c.dispatchEvent(new WheelEvent('wheel', {
        clientX: x, clientY: y, deltaX: dx, deltaY: dy, deltaMode: 0,
        bubbles: true, cancelable: true
      }));
    };
    var fireTap = function(x, y) {
      var c = canvasGet(); if (!c) return;
      var opts = { clientX: x, clientY: y, button: 0, buttons: 1,
                   bubbles: true, cancelable: true };
      c.dispatchEvent(new MouseEvent('mousedown', opts));
      opts.buttons = 0;
      c.dispatchEvent(new MouseEvent('mouseup', opts));
      c.dispatchEvent(new MouseEvent('click', opts));
    };

    window.addEventListener('touchstart', function(e) {
      if (e.touches.length === 2) {
        touch.mode = 'pinch';
        touch.pinch = dist2(e.touches);
        e.preventDefault(); e.stopPropagation();
      } else if (e.touches.length === 1) {
        var t = e.touches[0];
        touch.mode = null;            // undecided: tap vs scroll
        touch.sx = touch.lx = t.clientX;
        touch.sy = touch.ly = t.clientY;
        touch.accum = 0; touch.accumX = 0;
        e.preventDefault(); e.stopPropagation();
      }
    }, { passive: false, capture: true });

    window.addEventListener('touchmove', function(e) {
      if (touch.mode === 'pinch' && e.touches.length === 2) {
        e.preventDefault(); e.stopPropagation();
        // Continuous magnification anchored at the pinch midpoint, like Safari.
        var d = dist2(e.touches);
        if (touch.pinch > 0) {
          var mid = midpoint(e.touches);
          zoomAt(mid.x, mid.y, VIEWZOOM.z * (d / touch.pinch));
        }
        touch.pinch = d;
      } else if (e.touches.length === 1) {
        var t = e.touches[0];
        e.preventDefault(); e.stopPropagation();
        if (touch.mode === null) {
          if (Math.abs(t.clientY - touch.sy) > TAP_PX ||
              Math.abs(t.clientX - touch.sx) > TAP_PX) {
            touch.mode = 'scroll';
          }
        }
        if (touch.mode === 'scroll') {
          var ddx = t.clientX - touch.lx, ddy = t.clientY - touch.ly;
          touch.lx = t.clientX; touch.ly = t.clientY;
          if (VIEWZOOM.z > 1.001) {
            // Magnified: pan the view, canvas following the finger (grab-pan).
            VIEWZOOM.px += ddx; VIEWZOOM.py += ddy;
            applyZoom();
          } else {
            // At 1x: scroll the remote page on both axes (finger UP → page
            // scrolls DOWN; finger LEFT → scrolls RIGHT). Accumulate raw pixels
            // and emit one SCROLL_TICK-sized wheel event per tick so speed
            // tracks the finger (xpra/Chromium amplify each wheel event).
            touch.accum  += -ddy;
            touch.accumX += -ddx;
            while (touch.accum >= SCROLL_TICK)  { fireWheel(t.clientX, t.clientY, 0,  SCROLL_TICK); touch.accum  -= SCROLL_TICK; }
            while (touch.accum <= -SCROLL_TICK) { fireWheel(t.clientX, t.clientY, 0, -SCROLL_TICK); touch.accum  += SCROLL_TICK; }
            while (touch.accumX >= SCROLL_TICK) { fireWheel(t.clientX, t.clientY,  SCROLL_TICK, 0); touch.accumX -= SCROLL_TICK; }
            while (touch.accumX <= -SCROLL_TICK){ fireWheel(t.clientX, t.clientY, -SCROLL_TICK, 0); touch.accumX += SCROLL_TICK; }
          }
        }
      }
    }, { passive: false, capture: true });

    window.addEventListener('touchend', function(e) {
      e.preventDefault(); e.stopPropagation();
      if (e.touches.length === 0) {
        if (touch.mode === null) fireTap(touch.sx, touch.sy);
        touch.mode = null;
      } else if (e.touches.length === 1 && touch.mode === 'pinch') {
        // One finger lifted during pinch — switch to scroll mode using the
        // remaining finger, no tap on its eventual release.
        var t = e.touches[0];
        touch.mode = 'scroll';
        touch.sx = touch.lx = t.clientX;
        touch.sy = touch.ly = t.clientY;
        touch.accum = 0; touch.accumX = 0;
      }
    }, { passive: false, capture: true });

    window.addEventListener('touchcancel', function() {
      touch.mode = null;
    }, { passive: true, capture: true });

    // --- Visible zoom buttons (mobile only) ---
    var zoomCss = document.createElement('style');
    zoomCss.textContent =
      '#vkb-zoom{position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom));' +
        'z-index:2147483647;display:none;gap:6px;' +
        'touch-action:manipulation;-webkit-user-select:none;user-select:none}' +
      '#vkb-zoom button{width:44px;height:44px;border-radius:22px;border:1px solid #2d6cc0;' +
        'background:rgba(45,108,192,.85);color:#fff;font:600 20px/44px system-ui,sans-serif;' +
        'box-shadow:0 4px 14px rgba(0,0,0,.5);padding:0;cursor:pointer}' +
      '@media (max-width:900px),(pointer:coarse){#vkb-zoom{display:flex}}';
    document.head.appendChild(zoomCss);

    var addZoomBtns = function() {
      if (document.getElementById('vkb-zoom')) return;
      var wrap = document.createElement('div');
      wrap.id = 'vkb-zoom';
      var mk = function(label, title, fn) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = label;
        btn.title = title;
        var handler = function(ev) { ev.preventDefault(); ev.stopPropagation(); fn(); };
        btn.addEventListener('touchend', handler, { passive: false });
        btn.addEventListener('click', handler);
        return btn;
      };
      wrap.appendChild(mk('−', 'Zoom out', function() { zoomBy(1 / 1.5); }));
      wrap.appendChild(mk('⟲', 'Reset zoom', zoomReset));
      wrap.appendChild(mk('+', 'Zoom in',  function() { zoomBy(1.5); }));
      document.body.appendChild(wrap);
    };
    if (document.body) addZoomBtns();
    else document.addEventListener('DOMContentLoaded', addZoomBtns);
  } catch(e) {
    console.warn('[xpra-patches] zoom patch failed:', e.message);
  }
})();

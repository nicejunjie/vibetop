/**
 * Patches for xpra HTML5 client.
 * Injected via nginx sub_filter. Designed to degrade gracefully if
 * xpra's API changes — each patch is wrapped in try/catch.
 */
(function() {
  'use strict';

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
        r.x = this.last_mouse_x = Math.round((e.clientX - b.left) * (this.scale || 1));
        r.y = this.last_mouse_y = Math.round((e.clientY - b.top) * (this.scale || 1));
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
      if (dy !== 0) {
        var btn = dy > 0 ? 5 : 4;
        var n = Math.max(1, Math.round(Math.abs(dy) / 30));
        for (var i = 0; i < n; i++) {
          this.send([PACKET_TYPES.button_action, wid, btn, true, coords, modifiers, []]);
          this.send([PACKET_TYPES.button_action, wid, btn, false, coords, modifiers, []]);
        }
      }
      if (dx !== 0) {
        var btn = dx > 0 ? 7 : 6;
        var n = Math.max(1, Math.round(Math.abs(dx) / 30));
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
})();
